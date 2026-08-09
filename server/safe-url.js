// SSRF guard for fetching URLs that come from untrusted *content* — RSS feed
// item links, og:image targets, feed-supplied image URLs. A hostile or
// compromised feed could otherwise point the server at internal addresses
// (cloud metadata at 169.254.169.254, other services on the LAN, localhost)
// and use it as a proxy. We validate the scheme and resolve the host, then
// reject any URL that resolves to a loopback / private / link-local address.
//
// Note: this is not airtight against a determined DNS-rebinding attacker (the
// address is re-resolved by fetch after we check it). That's an accepted limit
// for this tool — validating the resolved IP stops the ordinary "point a feed
// at an internal URL" case, which is the actual exposure here.
const dns = require('dns').promises;
const net = require('net');

function ipv4Blocked(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8 private
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                          // multicast / reserved
  return false;
}

function ipv6Blocked(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;      // loopback / unspecified
  if (lower.startsWith('fe80')) return true;               // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address
  const m = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return ipv4Blocked(m[1]);
  return false;
}

function ipBlocked(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return ipv4Blocked(ip);
  if (fam === 6) return ipv6Blocked(ip);
  return true; // not a recognizable IP — refuse
}

// Parses `rawUrl` (optionally relative to `base`), requires http(s), resolves
// the host and rejects internal addresses. Returns the validated absolute URL
// string. Throws on anything unsafe.
async function assertPublicUrl(rawUrl, base) {
  let u;
  try { u = new URL(rawUrl, base); } catch { throw new Error('invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported URL scheme: ${u.protocol}`);
  }
  // A bare IP host is validated directly; a name is resolved to all addresses.
  const hostIsIp = net.isIP(u.hostname) !== 0;
  const addrs = hostIsIp
    ? [{ address: u.hostname }]
    : await dns.lookup(u.hostname, { all: true });
  if (!addrs.length) throw new Error('could not resolve host');
  for (const a of addrs) {
    if (ipBlocked(a.address)) throw new Error('refusing to fetch an internal address');
  }
  return u.href;
}

// fetch() that validates every hop: the initial URL and each redirect target
// are checked with assertPublicUrl before the request is made, so a public URL
// can't 30x-redirect into an internal one.
async function safeFetch(rawUrl, options = {}, maxRedirects = 5) {
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    url = await assertPublicUrl(url);
    const resp = await fetch(url, { ...options, redirect: 'manual' });
    const loc = (resp.status >= 300 && resp.status < 400) ? resp.headers.get('location') : null;
    if (!loc) return resp;
    url = new URL(loc, url).href;
  }
  throw new Error('too many redirects');
}

module.exports = { assertPublicUrl, safeFetch, ipBlocked };
