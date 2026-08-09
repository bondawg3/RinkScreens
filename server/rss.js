const Parser = require('rss-parser');
const db = require('./db');
const ws = require('./ws');
const { computeFocalPoint } = require('./focalpoint');
const { safeFetch } = require('./safe-url');

const parser = new Parser();
const pollTimers = new Map();

const IMAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const OG_IMAGE_RE = /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/i;

// og:image lookups and image downloads pull URLs straight from feed content,
// so they go through safeFetch, which rejects internal/loopback/link-local
// targets and re-validates on every redirect (SSRF guard).
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await safeFetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractImage(item) {
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) return item['media:content'].$.url;
  if (item.itunes && item.itunes.image) return item.itunes.image;
  const html = item['content:encoded'] || item.content || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

// Feed items with no enclosure/media image fall back to the article page's
// Open Graph image (the thumbnail most sites already publish for link
// previews), so blog-style feeds that only embed images in prose still get
// one for the slide layout.
async function fetchOgImage(articleUrl) {
  const resp = await fetchWithTimeout(articleUrl, IMAGE_FETCH_TIMEOUT_MS);
  if (!resp.ok) return '';
  const html = await resp.text();
  const match = html.match(OG_IMAGE_RE);
  const raw = match ? (match[1] || match[2]) : '';
  if (!raw) return '';
  try { return new URL(raw, articleUrl).href; } catch { return ''; }
}

async function fetchImageBuffer(url) {
  const resp = await fetchWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const len = Number(resp.headers.get('content-length') || 0);
  if (len && len > MAX_IMAGE_BYTES) throw new Error('image too large');
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
  return buf;
}

// Resolves the image URL for one item (native, falling back to og:image),
// then the focal point to auto-crop it around. The focal point is reused
// from the previous poll's cached item when the image URL hasn't changed, so
// a feed on a 15-minute poll doesn't re-download + re-analyze every image on
// every cycle.
async function resolveImageAndFocal(rawItem, guid, prevByGuid) {
  let image = extractImage(rawItem);
  if (!image && rawItem.link) {
    try { image = await fetchOgImage(rawItem.link); } catch (_) { image = ''; }
  }
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

// Runs fn over items with at most `limit` in flight at once — feed items can
// each trigger an og:image fetch + image download, and running 30+ of those
// at once against one site risks timeouts/rate limiting.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Fetch + parse the feed's raw XML with a 10s timeout; on failure records the
// sync error on the feed and leaves its previously-cached items untouched so
// a display doesn't go blank just because one poll failed.
async function fetchAndParseFeed(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let text;
    try {
      const resp = await fetch(feed.url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    } finally {
      clearTimeout(timeout);
    }

    const parsed = await parser.parseString(text);
    if (feed.id && !db.findById('rss_feeds', feed.id)) return; // deleted mid-fetch

    const prevByGuid = new Map((feed.items || []).map((it) => [it.guid, it]));
    const items = await mapLimit(parsed.items || [], 4, async (rawItem) => {
      const guid = rawItem.guid || rawItem.link || rawItem.title || '';
      const { image, focal } = await resolveImageAndFocal(rawItem, guid, prevByGuid);
      return {
        title: rawItem.title || '',
        link: rawItem.link || '',
        description: stripHtml(rawItem.contentSnippet || rawItem.content || rawItem.summary || ''),
        image,
        focal, // {x, y} percentages, or null if undetermined
        pubDate: rawItem.pubDate || rawItem.isoDate || '',
        guid,
      };
    });

    if (feed.id) db.update('rss_feeds', feed.id, { items, last_sync_at: new Date().toISOString(), last_sync_error: null });
  } catch (err) {
    console.error(`[rss] fetch failed for "${feed.name}":`, err.message);
    if (feed.id) db.update('rss_feeds', feed.id, { last_sync_at: new Date().toISOString(), last_sync_error: `Fetch failed: ${err.message}` });
  }
}

function scheduleFeed(feed) {
  if (pollTimers.has(feed.id)) clearTimeout(pollTimers.get(feed.id));
  const ms = (feed.poll_interval_minutes || 15) * 60_000;
  const timer = setTimeout(async () => {
    await fetchAndParseFeed(feed);
    ws.broadcast({ type: 'refresh_data' });
    const fresh = db.findById('rss_feeds', feed.id);
    if (fresh) scheduleFeed(fresh);
  }, ms);
  timer.unref();
  pollTimers.set(feed.id, timer);
}

function cancelFeed(feedId) {
  const id = Number(feedId);
  if (pollTimers.has(id)) {
    clearTimeout(pollTimers.get(id));
    pollTimers.delete(id);
  }
}

async function triggerFeedRefresh(feedId) {
  const feed = db.findById('rss_feeds', feedId);
  if (!feed) throw new Error('Feed not found');
  await fetchAndParseFeed(feed);
  ws.broadcast({ type: 'refresh_data' });
}

function startPolling() {
  const feeds = db.findAll('rss_feeds');
  Promise.all(feeds.map(fetchAndParseFeed)).then(() => ws.broadcast({ type: 'refresh_data' }));
  feeds.forEach(scheduleFeed);
}

module.exports = { startPolling, fetchAndParseFeed, scheduleFeed, cancelFeed, triggerFeedRefresh };
