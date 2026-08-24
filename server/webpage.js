const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const db = require('./db');
const { safeFetch } = require('./safe-url');
const { computeFocalPoint } = require('./focalpoint');
const { mapLimit, fetchImageBuffer, stripHtml } = require('./rss');

const FETCH_TIMEOUT_MS = 10000;
const DEFAULT_ITEM_COUNT = 10;
const MAX_ITEM_COUNT = 30;
// Path segments that show up constantly in site nav/chrome rather than
// individual articles — links here are excluded before scoring so they never
// crowd out real article links even on sites with few candidates.
const JUNK_PATH_RE = /\/(tag|tags|category|categories|author|authors|login|signin|signup|subscribe|about|contact|search|privacy|terms|advertise)(\/|$)/i;
const DATE_PATH_RE = /\/20\d{2}\/|\/20\d{2}[-/]\d{1,2}([-/]\d{1,2})?(\/|$)/;

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await safeFetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Scores a candidate article link by how "article-like" it looks: longer
// link text, a date-shaped path segment, and reasonable path depth all push
// a link up; junk sections are excluded entirely before this ever runs.
function scoreLink(text, linkUrl, pageUrl) {
  if (text.length < 8) return -1;
  if (linkUrl.origin !== pageUrl.origin) return -1;
  if (JUNK_PATH_RE.test(linkUrl.pathname)) return -1;
  if (linkUrl.pathname === pageUrl.pathname || linkUrl.pathname === '/') return -1;

  let score = Math.min(text.length, 120);
  if (DATE_PATH_RE.test(linkUrl.pathname)) score += 60;
  const depth = linkUrl.pathname.split('/').filter(Boolean).length;
  if (depth >= 2 && depth <= 5) score += 20;
  return score;
}

function discoverArticleLinks(html, pageUrlStr, selector, limit) {
  const dom = new JSDOM(html, { url: pageUrlStr });
  const { document } = dom.window;
  const pageUrl = new URL(pageUrlStr);

  let anchors;
  if (selector && selector.trim()) {
    anchors = Array.from(document.querySelectorAll(selector.trim())).map((el) => (
      el.tagName === 'A' ? el : el.querySelector('a')
    )).filter(Boolean);
  } else {
    anchors = Array.from(document.querySelectorAll('a[href]'));
  }

  const seen = new Set();
  const scored = [];
  for (const a of anchors) {
    let href;
    try { href = new URL(a.getAttribute('href'), pageUrlStr).href; } catch { continue; }
    if (seen.has(href)) continue;
    let u;
    try { u = new URL(href); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;

    if (selector && selector.trim()) {
      seen.add(href);
      scored.push({ href, score: 1 });
      continue;
    }
    const text = (a.textContent || '').trim();
    const score = scoreLink(text, u, pageUrl);
    if (score < 0) continue;
    seen.add(href);
    scored.push({ href, score });
  }

  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((s) => s.href);
}

async function extractArticle(articleUrl) {
  const html = await fetchHtml(articleUrl);
  const dom = new JSDOM(html, { url: articleUrl });
  const { document } = dom.window;

  const ogImageMeta = document.querySelector('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="og:image"]');
  let image = ogImageMeta ? ogImageMeta.getAttribute('content') : '';

  const reader = new Readability(document);
  const article = reader.parse();
  if (!article) throw new Error('could not extract article content');

  if (!image) {
    const imgMatch = (article.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) image = imgMatch[1];
  }
  if (image) {
    try { image = new URL(image, articleUrl).href; } catch { image = ''; }
  }

  return {
    title: article.title || '',
    description: stripHtml(article.excerpt || ''),
    image,
  };
}

// Mirrors rss.js's resolveImageAndFocal, but starting from an image URL
// already resolved by extractArticle (og:image / Readability content) rather
// than re-deriving it from RSS-shaped fields. Reuses the previous sync's
// focal point when the image URL hasn't changed, same caching rationale.
async function resolveFocal(image, guid, prevByGuid) {
  if (!image) return { image: '', focal: null };
  const prev = prevByGuid.get(guid);
  if (prev && prev.image === image && prev.focal) {
    return { image, focal: prev.focal };
  }
  try {
    const buf = await fetchImageBuffer(image);
    const focal = await computeFocalPoint(buf);
    return { image, focal };
  } catch (err) {
    return { image, focal: null };
  }
}

// Same contract as fetchAndParseFeed in rss.js: fetch the listing page,
// discover article links, extract each one, and replace the feed's cached
// items wholesale so articles that drop off the listing page stop appearing
// on the next sync without any explicit cleanup step.
async function fetchAndParseWebpageFeed(feed) {
  try {
    const html = await fetchHtml(feed.url);
    if (feed.id && !db.findById('rss_feeds', feed.id)) return; // deleted mid-fetch

    const limit = Math.min(Number(feed.item_count) || DEFAULT_ITEM_COUNT, MAX_ITEM_COUNT);
    const links = discoverArticleLinks(html, feed.url, feed.link_selector, limit);

    const prevByGuid = new Map((feed.items || []).map((it) => [it.guid, it]));
    const items = (await mapLimit(links, 3, async (link) => {
      try {
        const article = await extractArticle(link);
        const guid = link;
        const { image, focal } = await resolveFocal(article.image, guid, prevByGuid);
        return {
          title: article.title,
          link,
          description: article.description,
          image,
          focal,
          pubDate: '',
          guid,
        };
      } catch (err) {
        console.error(`[webpage] failed to extract "${link}":`, err.message);
        return null;
      }
    })).filter(Boolean);

    if (feed.id) db.update('rss_feeds', feed.id, { items, last_sync_at: new Date().toISOString(), last_sync_error: null });
  } catch (err) {
    console.error(`[webpage] fetch failed for "${feed.name}":`, err.message);
    if (feed.id) db.update('rss_feeds', feed.id, { last_sync_at: new Date().toISOString(), last_sync_error: `Fetch failed: ${err.message}` });
  }
}

module.exports = { fetchAndParseWebpageFeed, discoverArticleLinks, extractArticle };
