const express = require('express');
const router = express.Router();
const db = require('../db');
const ws = require('../ws');
const { triggerRefresh, triggerCalendarRefresh, parseTitle, syncCalendar, scheduleCalendar, cancelCalendar } = require('../calendar');
const { fetchAndParseFeed, scheduleFeed, cancelFeed, triggerFeedRefresh } = require('../rss');
const { autoAssign } = require('../locker-assign');
const { requireAuth, rotateJwtSecret, signToken, verifyToken } = require('../auth');
const schedule = require('../schedule');
const bcrypt = require('bcryptjs');
const backup = require('../backup');
const update = require('../update');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const backupUpload = multer({ dest: require('os').tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

// True when the request carries a valid admin token (for endpoints that serve
// both TVs and the admin panel with different visibility)
function isAdminRequest(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try { verifyToken(token); return true; } catch { return false; }
}

// Activities belonging to calendars of one type, sorted by start time.
// includeLegacy also returns rows with no calendar (pre-calendar imports).
function activitiesByCalType(type, { includeLegacy = false } = {}) {
  const cals = db.findAll('calendars').filter((c) => c.type === type);
  const calIds = new Set(cals.map((c) => c.id));
  const eventModeById = Object.fromEntries(cals.map((c) => [c.id, c.event_mode || 'teams']));
  return db.findAll('activities', 'start_time')
    .filter((g) => calIds.has(g.calendar_id) || (includeLegacy && !g.calendar_id))
    .map((g) => ({ ...g, event_mode: eventModeById[g.calendar_id] || 'teams' }));
}

// Case-insensitive duplicate-name lookup, optionally ignoring one row
function findByNameCi(table, name, excludeId = null) {
  const target = name.toLowerCase();
  return db.findAll(table).find(
    (r) => (excludeId === null || r.id !== excludeId) && r.name.toLowerCase() === target
  ) || null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

router.get('/auth/check', (req, res) => {
  const settings = db.getSettings();
  const configured = !!settings.admin_password_hash;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.json({ configured, valid: false });
  try {
    verifyToken(token);
    res.json({ configured, valid: true });
  } catch {
    res.json({ configured, valid: false });
  }
});

router.post('/auth/login', async (req, res) => {
  const { password } = req.body;
  const settings = db.getSettings();
  if (!settings.admin_password_hash) return res.status(401).json({ error: 'not_configured' });
  const match = await bcrypt.compare(password || '', settings.admin_password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid password.' });
  res.json({ token: signToken() });
});

router.post('/auth/setup', async (req, res) => {
  const settings = db.getSettings();
  if (settings.admin_password_hash) return res.status(409).json({ error: 'already_configured' });
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const hash = await bcrypt.hash(password, 12);
  db.setSetting('admin_password_hash', hash);
  rotateJwtSecret(); // invalidate any tokens issued before a password reset
  res.json({ token: signToken() });
});

router.post('/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const settings = db.getSettings();
  const match = await bcrypt.compare(currentPassword || '', settings.admin_password_hash || '');
  if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const hash = await bcrypt.hash(newPassword, 12);
  db.setSetting('admin_password_hash', hash);
  rotateJwtSecret(); // log out all existing sessions; the response token is signed with the new secret
  res.json({ token: signToken() });
});

// ── Settings ──────────────────────────────────────────────────────────────────

// Unauthenticated TV displays only need these; everything else requires a token
const PUBLIC_SETTINGS = ['rink_name', 'logo_filename'];
// Never returned or writable through the API
const SECRET_SETTINGS = ['jwt_secret', 'admin_password_hash', 'update_github_token'];

router.get('/settings', (req, res) => {
  const settings = db.getSettings();
  if (!isAdminRequest(req)) {
    const pub = {};
    for (const k of PUBLIC_SETTINGS) if (settings[k] !== undefined) pub[k] = settings[k];
    return res.json(pub);
  }
  const full = { ...settings };
  for (const k of SECRET_SETTINGS) delete full[k];
  res.json(full);
});

router.patch('/settings', requireAuth, async (req, res) => {
  const incoming = req.body;
  for (const k of SECRET_SETTINGS) delete incoming[k];

  if (incoming.ical_url) {
    const current = db.getSettings();
    if (incoming.ical_url !== current.ical_url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let text;
        try {
          const response = await fetch(incoming.ical_url, { signal: controller.signal });
          text = await response.text();
        } finally {
          clearTimeout(timeout);
        }
        if (!text.includes('BEGIN:VCALENDAR')) {
          return res.status(400).json({ error: 'The URL does not appear to be a valid iCal calendar. Make sure you copied the iCal (.ics) link, not the Google Calendar web page URL.' });
        }
      } catch (err) {
        return res.status(400).json({ error: `Could not load the calendar URL: ${err.message}. Make sure the URL is publicly accessible and in iCal format.` });
      }
    }
  }

  db.setSettings(incoming);
  res.json({ ok: true });
});

// ── Screens ───────────────────────────────────────────────────────────────────

function parseCalendarIds(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length ? raw.map(Number) : null;
  try { const p = JSON.parse(raw); return p && p.length ? p.map(Number) : null; } catch { return null; }
}

function backgroundsMap() {
  return Object.fromEntries(db.findAll('backgrounds').map((b) => [b.id, b]));
}

// A screen row shaped for the TV/admin clients (defaults filled, JSON fields parsed)
function serializeScreen(s, bgMap) {
  return {
    ...s,
    calendar_ids: parseCalendarIds(s.calendar_ids),
    bg_opacity: s.bg_opacity ?? 100,
    bg_color_alpha: s.bg_color_alpha ?? 100,
    header_line_width: s.header_line_width ?? 0,
    header_line_color: s.header_line_color || '#000000',
    visible: s.visible !== false,
    two_column: !!s.two_column,
    overflow_mode: s.overflow_mode || 'none',
    rotate_interval: s.rotate_interval ?? 30,
    days_ahead: s.days_ahead ?? 14,
    show_pricing: !!s.show_pricing,
    show_locker_rooms: s.show_locker_rooms !== false,
    pricing_ids: parseCalendarIds(s.pricing_ids) || [],
    bg_filename: s.background_id ? bgMap[s.background_id]?.filename : null,
    bg_label: s.background_id ? bgMap[s.background_id]?.label : null,
    announcement_data: s.announcement_data ? (() => { try { return JSON.parse(s.announcement_data); } catch { return null; } })() : null,
    rss_feed_id: s.rss_feed_id ?? null,
    rss_feed_ids: s.rss_feed_ids ? (() => { try { return JSON.parse(s.rss_feed_ids); } catch { return null; } })() : (s.rss_feed_id ? [s.rss_feed_id] : []),
    rss_multi_mode: s.rss_multi_mode || 'per_feed',
    rss_item_count: s.rss_item_count ?? 10,
    rss_rotate_seconds: s.rss_rotate_seconds ?? 8,
    rss_slide_layout: s.rss_slide_layout ? (() => { try { return JSON.parse(s.rss_slide_layout); } catch { return null; } })() : null,
    rss_templates: s.rss_templates ? (() => { try { return JSON.parse(s.rss_templates); } catch { return null; } })() : null,
  };
}

// Screen ids currently rendered somewhere: direct admin previews ('s:' clients)
// plus whatever each connected physical display ('d:' clients) resolves to
function onlineScreenIds() {
  const ids = new Set();
  for (const key of ws.connectedKeys()) {
    if (key.startsWith('s:')) ids.add(Number(key.slice(2)));
    else if (key.startsWith('d:')) {
      const r = schedule.resolveActive(Number(key.slice(2)));
      if (r && r.screen_id) ids.add(r.screen_id);
    }
  }
  return ids;
}

// A screen edit must refresh admin previews of that screen and every display
// currently resolving to it (via base assignment or an active schedule block)
function notifyScreen(screenId, type) {
  ws.push(`s:${screenId}`, { type });
  for (const d of db.findAll('displays')) {
    const r = schedule.resolveActive(d.id);
    if (r && r.screen_id === Number(screenId)) ws.push(`d:${d.id}`, { type });
  }
}

router.get('/screens', (req, res) => {
  const screens = db.findAll('screens');
  const bgMap = backgroundsMap();
  const online = onlineScreenIds();
  res.json(screens.map((s) => ({
    ...serializeScreen(s, bgMap),
    online: online.has(s.id),
  })));
});

router.post('/screens', requireAuth, (req, res) => {
  const { name, ip = '', display_type = 'games', webpage_url = '', webpage_width = 100, webpage_zoom = 100, webpage_refresh = 0, calendar_ids, bg_opacity = 100, bg_color_alpha = 100, background_id, announcement_data, bg_color = '', header_line_width = 0, header_line_color = '#000000', show_pricing = false, show_locker_rooms = true, pricing_ids, rss_feed_id, rss_feed_ids, rss_multi_mode, rss_slide_layout, rss_templates, rss_item_count, rss_rotate_seconds } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const calIds = parseCalendarIds(calendar_ids);
  const priceIds = parseCalendarIds(pricing_ids);
  const row = db.insert('screens', { name, ip, display_type, background_id: background_id || null, webpage_url, webpage_width: Number(webpage_width), webpage_zoom: Number(webpage_zoom), webpage_refresh: Number(webpage_refresh), calendar_ids: calIds ? JSON.stringify(calIds) : null, bg_opacity: Number(bg_opacity), bg_color_alpha: Number(bg_color_alpha), announcement_data: announcement_data ? JSON.stringify(announcement_data) : null, bg_color: bg_color || '', header_line_width: Number(header_line_width), header_line_color: header_line_color || '#000000', show_pricing: !!show_pricing, show_locker_rooms: !!show_locker_rooms, pricing_ids: priceIds ? JSON.stringify(priceIds) : null, rss_feed_id: rss_feed_id || (Array.isArray(rss_feed_ids) && rss_feed_ids[0]) || null, rss_feed_ids: rss_feed_ids ? JSON.stringify(rss_feed_ids) : null, rss_multi_mode: rss_multi_mode || 'per_feed', rss_slide_layout: rss_slide_layout ? JSON.stringify(rss_slide_layout) : null, rss_templates: rss_templates ? JSON.stringify(rss_templates) : null, rss_item_count: rss_item_count !== undefined ? Number(rss_item_count) : 10, rss_rotate_seconds: rss_rotate_seconds !== undefined ? Number(rss_rotate_seconds) : 8 });
  res.json({ id: row.id });
});

router.patch('/screens/:id', requireAuth, (req, res) => {
  const screen = db.findById('screens', req.params.id);
  if (!screen) return res.status(404).json({ error: 'not found' });
  const { name, ip, display_type, background_id, webpage_url, webpage_width, webpage_zoom, webpage_refresh, calendar_ids, bg_opacity, bg_color_alpha, announcement_data, bg_color, header_line_width, header_line_color, visible, show_pricing, show_locker_rooms, pricing_ids, rss_feed_id, rss_feed_ids, rss_multi_mode, rss_slide_layout, rss_templates, rss_item_count, rss_rotate_seconds } = req.body;
  const calIds = calendar_ids !== undefined ? parseCalendarIds(calendar_ids) : parseCalendarIds(screen.calendar_ids);
  const priceIds = pricing_ids !== undefined ? parseCalendarIds(pricing_ids) : parseCalendarIds(screen.pricing_ids);
  db.update('screens', req.params.id, {
    name: name ?? screen.name,
    ip: ip ?? screen.ip,
    display_type: display_type ?? screen.display_type,
    background_id: background_id !== undefined ? (background_id || null) : screen.background_id,
    webpage_url: webpage_url !== undefined ? webpage_url : (screen.webpage_url || ''),
    webpage_width: webpage_width !== undefined ? Number(webpage_width) : (screen.webpage_width || 100),
    webpage_zoom: webpage_zoom !== undefined ? Number(webpage_zoom) : (screen.webpage_zoom || 100),
    webpage_refresh: webpage_refresh !== undefined ? Number(webpage_refresh) : (screen.webpage_refresh || 0),
    calendar_ids: calIds ? JSON.stringify(calIds) : null,
    bg_opacity: bg_opacity !== undefined ? Number(bg_opacity) : (screen.bg_opacity ?? 100),
    bg_color_alpha: bg_color_alpha !== undefined ? Number(bg_color_alpha) : (screen.bg_color_alpha ?? 100),
    announcement_data: announcement_data !== undefined ? JSON.stringify(announcement_data) : (screen.announcement_data || null),
    bg_color: bg_color !== undefined ? (bg_color || '') : (screen.bg_color || ''),
    header_line_width: header_line_width !== undefined ? Number(header_line_width) : (screen.header_line_width ?? 0),
    header_line_color: header_line_color !== undefined ? (header_line_color || '#000000') : (screen.header_line_color || '#000000'),
    visible: visible !== undefined ? visible !== false : (screen.visible !== false),
    two_column: 'two_column' in req.body ? !!req.body.two_column : !!screen.two_column,
    overflow_mode: req.body.overflow_mode ?? screen.overflow_mode ?? 'none',
    rotate_interval: req.body.rotate_interval !== undefined ? Number(req.body.rotate_interval) : (screen.rotate_interval ?? 30),
    days_ahead: req.body.days_ahead !== undefined ? Number(req.body.days_ahead) : (screen.days_ahead ?? 14),
    show_pricing: show_pricing !== undefined ? !!show_pricing : !!screen.show_pricing,
    show_locker_rooms: show_locker_rooms !== undefined ? !!show_locker_rooms : (screen.show_locker_rooms !== false),
    pricing_ids: priceIds ? JSON.stringify(priceIds) : null,
    rss_feed_id: rss_feed_id !== undefined ? (rss_feed_id || null) : (rss_feed_ids !== undefined ? ((rss_feed_ids && rss_feed_ids[0]) || null) : (screen.rss_feed_id || null)),
    rss_feed_ids: rss_feed_ids !== undefined ? JSON.stringify(rss_feed_ids) : (screen.rss_feed_ids || null),
    rss_multi_mode: rss_multi_mode !== undefined ? rss_multi_mode : (screen.rss_multi_mode || 'per_feed'),
    rss_slide_layout: rss_slide_layout !== undefined ? JSON.stringify(rss_slide_layout) : (screen.rss_slide_layout || null),
    rss_templates: rss_templates !== undefined ? JSON.stringify(rss_templates) : (screen.rss_templates || null),
    rss_item_count: rss_item_count !== undefined ? Number(rss_item_count) : (screen.rss_item_count ?? 10),
    rss_rotate_seconds: rss_rotate_seconds !== undefined ? Number(rss_rotate_seconds) : (screen.rss_rotate_seconds ?? 8),
  });
  notifyScreen(req.params.id, 'reload');
  res.json({ ok: true });
});

router.delete('/screens/:id', requireAuth, (req, res) => {
  // Refuse while current/future schedule blocks still point at this screen —
  // silently removing it would leave displays rendering nothing mid-schedule
  const screenId = Number(req.params.id);
  const today = schedule.localDateStr(new Date());
  const refs = db.findAll('display_schedules').filter((b) => b.content_screen_id === screenId && b.date >= today);
  if (refs.length) {
    const names = [...new Set(refs.map((b) => db.findById('displays', b.display_id)?.name || `display ${b.display_id}`))];
    return res.status(400).json({ error: `This screen is scheduled on: ${names.join(', ')}. Remove those schedule blocks first.` });
  }
  db.remove('screens', req.params.id);
  res.json({ ok: true });
});

router.post('/screens/:id/duplicate', requireAuth, (req, res) => {
  const screen = db.findById('screens', req.params.id);
  if (!screen) return res.status(404).json({ error: 'not found' });
  const { id, created_at, ...copy } = screen;
  const row = db.insert('screens', { ...copy, name: `${screen.name} - Copy` });
  res.json({ id: row.id });
});

router.post('/screens/:id/reload', requireAuth, (req, res) => {
  notifyScreen(req.params.id, 'reload');
  res.json({ ok: true });
});

// Reorders a subset of screens (e.g. all screens in one tab/display_type) to
// match `ids`. Screens are spliced out and reinserted at the position of the
// first one, so screens belonging to other display_types keep their place in
// the shared array.
router.post('/screens/reorder', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
  const wanted = ids.map(Number);
  db.transaction((tx) => {
    const all = tx.findAll('screens');
    const firstIndex = all.findIndex((s) => wanted.includes(s.id));
    if (firstIndex === -1) return;
    const moving = wanted.map((id) => all.find((s) => s.id === id)).filter(Boolean);
    const rest = all.filter((s) => !wanted.includes(s.id));
    rest.splice(firstIndex, 0, ...moving);
    tx.reorder('screens', rest.map((s) => s.id));
  });
  res.json({ ok: true });
});

// ── Displays ──────────────────────────────────────────────────────────────────

router.get('/displays', (req, res) => {
  const connected = ws.connectedKeys();
  res.json(db.findAll('displays', 'created_at').map((d) => ({
    ...d,
    online: connected.includes(`d:${d.id}`),
  })));
});

function validTvNumber(n) {
  return /^\d{1,2}$/.test(String(n).trim());
}

router.post('/displays', requireAuth, (req, res) => {
  const { name, tv_number } = req.body;
  if (!name || !tv_number) return res.status(400).json({ error: 'name and TV number required' });
  if (!validTvNumber(tv_number)) return res.status(400).json({ error: 'TV number must be a whole number from 0 to 99.' });
  const dupName = findByNameCi('displays', name);
  if (dupName) return res.status(400).json({ error: `A display named "${dupName.name}" already exists.` });
  const dupNum = db.findAll('displays').find((d) => String(d.tv_number) === String(tv_number));
  if (dupNum) return res.status(400).json({ error: `TV number ${tv_number} is already used by "${dupNum.name}".` });
  const row = db.insert('displays', { name, tv_number });
  res.json({ id: row.id });
});

router.patch('/displays/:id', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { name, tv_number, screen_id } = req.body;
  const newName = name ?? display.name;
  const newNum = tv_number ?? display.tv_number;
  if (!validTvNumber(newNum)) return res.status(400).json({ error: 'TV number must be a whole number from 0 to 99.' });
  const dupName = findByNameCi('displays', newName, display.id);
  if (dupName) return res.status(400).json({ error: `A display named "${dupName.name}" already exists.` });
  const dupNum = db.findAll('displays').find((d) => d.id !== display.id && String(d.tv_number) === String(newNum));
  if (dupNum) return res.status(400).json({ error: `TV number ${newNum} is already used by "${dupNum.name}".` });
  const changes = { name: newName, tv_number: newNum };
  if ('screen_id' in req.body) changes.screen_id = screen_id ? Number(screen_id) : null;
  db.update('displays', req.params.id, changes);
  res.json({ ok: true });
});

router.delete('/displays/:id', requireAuth, (req, res) => {
  const displayId = Number(req.params.id);
  db.transaction((tx) => {
    tx.remove('displays', displayId);
    tx.findAll('display_schedules').filter((b) => b.display_id === displayId)
      .forEach((b) => tx.remove('display_schedules', b.id));
  });
  res.json({ ok: true });
});

// ── Display schedules ─────────────────────────────────────────────────────────

// What this display should render right now: the active schedule block's
// screen, or the display's base screen. valid_until tells the TV when to
// re-fetch (block end, next block start, or midnight).
router.get('/displays/:id/active', (req, res) => {
  const resolved = schedule.resolveActive(req.params.id);
  if (!resolved) return res.status(404).json({ error: 'display not found' });
  const screenRow = resolved.screen_id ? db.findById('screens', resolved.screen_id) : null;
  res.json({
    display_id: resolved.display.id,
    display_name: resolved.display.name,
    scheduled: resolved.scheduled,
    valid_until: resolved.valid_until.toISOString(),
    screen: screenRow ? serializeScreen(screenRow, backgroundsMap()) : null,
  });
});

router.get('/displays/:id/schedule', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { from, to } = req.query;
  let blocks = db.findAll('display_schedules').filter((b) => b.display_id === display.id);
  if (from) blocks = blocks.filter((b) => b.date >= from);
  if (to) blocks = blocks.filter((b) => b.date <= to);
  blocks.sort((a, b) => (a.date === b.date ? (a.start_time < b.start_time ? -1 : 1) : (a.date < b.date ? -1 : 1)));
  res.json(blocks);
});

router.post('/displays/:id/schedule', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { date, start_time, end_time, content_screen_id } = req.body;
  const invalid = schedule.validateBlock({ date, start_time, end_time });
  if (invalid) return res.status(400).json({ error: invalid });
  if (!db.findById('screens', content_screen_id)) return res.status(400).json({ error: 'content_screen_id does not exist' });
  const overlap = schedule.findOverlap(display.id, date, start_time, end_time);
  if (overlap) return res.status(400).json({ error: `Overlaps an existing block (${overlap.start_time}–${overlap.end_time}) on ${date}.` });
  const row = db.insert('display_schedules', {
    display_id: display.id, date, start_time, end_time,
    content_screen_id: Number(content_screen_id),
  });
  ws.push(`d:${display.id}`, { type: 'reload' });
  res.json(row);
});

// Copies a range of days onto another range, preserving each block's day-offset
// from the source start. Body: { from_start, from_end, to_start } (YYYY-MM-DD).
// Duplicating a single day is from_start === from_end; a week is a 7-day span.
// Blocks that would overlap existing blocks on their target day are skipped.
router.post('/displays/:id/schedule/copy', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { from_start, from_end, to_start } = req.body;
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  if (!isDate(from_start) || !isDate(from_end) || !isDate(to_start)) {
    return res.status(400).json({ error: 'from_start, from_end, and to_start must be YYYY-MM-DD' });
  }
  if (from_end < from_start) return res.status(400).json({ error: 'from_end must not precede from_start' });

  const source = db.findAll('display_schedules')
    .filter((b) => b.display_id === display.id && b.date >= from_start && b.date <= from_end);
  if (!source.length) return res.status(400).json({ error: 'No blocks in the source range to copy.' });

  // Reject copying onto a range that overlaps the source (ambiguous / self-clobbering)
  const span = schedule.dayOffset(from_start, from_end);
  const to_end = schedule.addDays(to_start, span);
  if (to_start <= from_end && from_start <= to_end) {
    return res.status(400).json({ error: 'Destination overlaps the source range.' });
  }

  let created = 0, skipped = 0;
  db.transaction((tx) => {
    for (const b of source) {
      const date = schedule.addDays(to_start, schedule.dayOffset(from_start, b.date));
      const existing = tx.findAll('display_schedules')
        .filter((e) => e.display_id === display.id && e.date === date);
      const overlaps = existing.some((e) => e.start_time < b.end_time && b.start_time < e.end_time);
      if (overlaps) { skipped++; continue; }
      tx.insert('display_schedules', {
        display_id: display.id, date,
        start_time: b.start_time, end_time: b.end_time,
        content_screen_id: b.content_screen_id,
      });
      created++;
    }
  });
  ws.push(`d:${display.id}`, { type: 'reload' });
  res.json({ created, skipped });
});

// Atomically replaces every block for one display+date with the supplied set.
// The visual scheduler computes a whole non-overlapping day layout client-side
// and saves it in one shot, so there's no transient-overlap window from
// reordering blocks with individual PATCH/POST/DELETE calls. Body:
// { date, blocks: [{ start_time, end_time, content_screen_id }] }.
router.put('/displays/:id/schedule/day', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { date, blocks } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks must be an array' });

  for (const b of blocks) {
    const invalid = schedule.validateBlock({ date, start_time: b.start_time, end_time: b.end_time });
    if (invalid) return res.status(400).json({ error: invalid });
    if (!db.findById('screens', b.content_screen_id)) return res.status(400).json({ error: 'content_screen_id does not exist' });
  }
  const sorted = [...blocks].sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_time < sorted[i - 1].end_time) return res.status(400).json({ error: 'blocks overlap' });
  }

  const rows = db.transaction((tx) => {
    tx.findAll('display_schedules')
      .filter((b) => b.display_id === display.id && b.date === date)
      .forEach((b) => tx.remove('display_schedules', b.id));
    return sorted.map((b) => tx.insert('display_schedules', {
      display_id: display.id, date,
      start_time: b.start_time, end_time: b.end_time,
      content_screen_id: Number(b.content_screen_id),
    }));
  });
  ws.push(`d:${display.id}`, { type: 'reload' });
  res.json(rows);
});

router.patch('/schedule-blocks/:id', requireAuth, (req, res) => {
  const block = db.findById('display_schedules', req.params.id);
  if (!block) return res.status(404).json({ error: 'not found' });
  const date = req.body.date ?? block.date;
  const start_time = req.body.start_time ?? block.start_time;
  const end_time = req.body.end_time ?? block.end_time;
  const content_screen_id = req.body.content_screen_id !== undefined ? Number(req.body.content_screen_id) : block.content_screen_id;
  const invalid = schedule.validateBlock({ date, start_time, end_time });
  if (invalid) return res.status(400).json({ error: invalid });
  if (!db.findById('screens', content_screen_id)) return res.status(400).json({ error: 'content_screen_id does not exist' });
  const overlap = schedule.findOverlap(block.display_id, date, start_time, end_time, block.id);
  if (overlap) return res.status(400).json({ error: `Overlaps an existing block (${overlap.start_time}–${overlap.end_time}) on ${date}.` });
  db.update('display_schedules', block.id, { date, start_time, end_time, content_screen_id });
  ws.push(`d:${block.display_id}`, { type: 'reload' });
  res.json({ ok: true });
});

router.delete('/schedule-blocks/:id', requireAuth, (req, res) => {
  const block = db.findById('display_schedules', req.params.id);
  if (!block) return res.status(404).json({ error: 'not found' });
  db.remove('display_schedules', block.id);
  ws.push(`d:${block.display_id}`, { type: 'reload' });
  res.json({ ok: true });
});

// ── Rink Events ───────────────────────────────────────────────────────────────

router.get('/rink-events', (req, res) => {
  res.json(activitiesByCalType('rink_events'));
});

// ── Figure Skating ────────────────────────────────────────────────────────────

router.get('/figure-skating', (req, res) => {
  res.json(activitiesByCalType('figure_skating'));
});

// ── Games ─────────────────────────────────────────────────────────────────────

router.get('/games', (req, res) => {
  // Only return games from hockey_games calendars (or legacy unassigned games with no calendar)
  res.json(activitiesByCalType('hockey_games', { includeLegacy: true }));
});

router.patch('/games/:id', requireAuth, (req, res) => {
  const game = db.findById('activities', req.params.id);
  if (!game) return res.status(404).json({ error: 'not found' });
  const { home_team, away_team, home_locker, away_locker } = req.body;
  const lockerChanged = home_locker !== undefined || away_locker !== undefined;
  const teamsChanged = home_team !== undefined || away_team !== undefined;
  db.update('activities', req.params.id, {
    home_team: home_team ?? game.home_team,
    away_team: away_team ?? game.away_team,
    home_locker: home_locker ?? game.home_locker,
    away_locker: away_locker ?? game.away_locker,
    lr_auto_assigned: lockerChanged ? 0 : (game.lr_auto_assigned || 0),
    teams_manually_set: teamsChanged ? 1 : (game.teams_manually_set || 0),
  });
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true });
});

router.delete('/games/:id', requireAuth, (req, res) => {
  const game = db.findById('activities', req.params.id);
  if (!game) return res.status(404).json({ error: 'not found' });
  db.remove('activities', req.params.id);
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true });
});

router.post('/games/refresh', requireAuth, (req, res) => {
  triggerRefresh();
  res.json({ ok: true });
});

router.post('/calendars/:id/sync', requireAuth, async (req, res) => {
  try {
    await triggerCalendarRefresh(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/games/auto-assign', requireAuth, (req, res) => {
  const { date, reset } = req.body || {};
  try {
    const result = autoAssign({ dateStr: date || null, resetExisting: !!reset });
    ws.broadcast({ type: 'refresh_data' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/games/reparse', requireAuth, (req, res) => {
  const updated = db.transaction((tx) => {
    const calendars = tx.findAll('calendars');
    const calMap = Object.fromEntries(calendars.map((c) => [c.id, c]));
    const games = tx.findAll('activities');
    let count = 0;

    for (const game of games) {
      const cal = calMap[game.calendar_id] || {};
      const { title, away_team, home_team } = parseTitle(game.raw_title || game.title || '', cal);
      tx.update('activities', game.id, { title, away_team, home_team, teams_manually_set: 0 });
      count++;
    }
    return count;
  });

  ws.broadcast({ type: 'refresh_data' });
  res.json({ updated });
});

router.delete('/games/unassigned', requireAuth, (req, res) => {
  const removed = db.transaction((tx) => {
    const toRemove = tx.findAll('activities').filter((g) => !g.calendar_id);
    toRemove.forEach((g) => tx.remove('activities', g.id));
    return toRemove.length;
  });
  res.json({ removed });
});

router.get('/games/debug-calendar', requireAuth, async (req, res) => {
  const ical = require('node-ical');

  let url, calName;
  if (req.query.calendar_id) {
    const cal = db.findById('calendars', req.query.calendar_id);
    if (!cal) return res.json({ error: `Calendar ${req.query.calendar_id} not found` });
    url = cal.url;
    calName = cal.name;
  } else {
    const settings = db.getSettings();
    url = settings.ical_url;
    calName = 'Legacy (ical_url setting)';
  }
  if (!url) return res.json({ error: 'No iCal URL configured' });

  let events;
  try {
    events = await ical.async.fromURL(url);
  } catch (err) {
    return res.json({ error: `Fetch failed: ${err.message}` });
  }

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const now = new Date();
  const summary = [];

  for (const [, event] of Object.entries(events)) {
    if (event.type !== 'VEVENT') continue;
    const start = event.start ? new Date(event.start) : null;
    const location = (event.location || '').trim();
    summary.push({
      uid: event.uid,
      title: event.summary,
      location: location || null,
      start: start ? start.toISOString() : null,
      included: start && start >= cutoff,
      reason: !start ? 'no start date' : start < cutoff ? `too old (cutoff: ${cutoff.toISOString()})` : 'ok',
    });
  }

  res.json({
    calendar: calName,
    url,
    now: now.toISOString(),
    cutoff: cutoff.toISOString(),
    total_vevents: summary.length,
    included: summary.filter(e => e.included).length,
    events: summary,
  });
});

// ── Calendars ─────────────────────────────────────────────────────────────────

router.get('/calendars', (req, res) => {
  // TVs only need id/name/type for grouping; the iCal URL is a secret
  // (Google "secret address" links grant read access to the whole calendar)
  if (!isAdminRequest(req)) {
    return res.json(db.findAll('calendars', 'created_at').map((cal) => ({
      id: cal.id,
      name: cal.name,
      type: cal.type,
    })));
  }
  const leagues = db.findAll('leagues');
  const calendars = db.findAll('calendars', 'created_at').map((cal) => {
    const league = leagues.find((l) => l.name.toLowerCase() === cal.name.toLowerCase());
    return {
      ...cal,
      locker_sequence_id: cal.locker_sequence_id ?? (league ? league.locker_sequence_id : null),
      last_sync_at: cal.last_sync_at || null,
      last_sync_error: cal.last_sync_error || null,
      last_sync_count: cal.last_sync_count ?? null,
    };
  });
  res.json(calendars);
});

router.post('/calendars', requireAuth, async (req, res) => {
  const { name, url, type, poll_interval_minutes = 5, team_order = 'home_away', event_mode = 'teams' } = req.body;
  if (!name || !url || !type) return res.status(400).json({ error: 'name, url, and type are required' });

  if (findByNameCi('calendars', name)) {
    return res.status(400).json({ error: `A calendar named "${name}" already exists. Please use a different name.` });
  }
  if (db.findAll('calendars').find((c) => c.url === url)) {
    return res.status(400).json({ error: 'This iCal URL is already in use by another calendar.' });
  }

  const { locker_sequence_id } = req.body;
  const row = db.insert('calendars', { name, url, type, poll_interval_minutes: Number(poll_interval_minutes), team_order, event_mode, locker_sequence_id: locker_sequence_id || null });
  // Sync immediately in the background and start the poll cycle (previously
  // new calendars were never polled until a server restart)
  syncCalendar(row).then(() => ws.broadcast({ type: 'refresh_data' })).catch(() => {});
  scheduleCalendar(row);
  res.json({ id: row.id });
});

router.patch('/calendars/:id', requireAuth, async (req, res) => {
  const cal = db.findById('calendars', req.params.id);
  if (!cal) return res.status(404).json({ error: 'not found' });

  const { name, url, poll_interval_minutes, team_order, event_mode, locker_sequence_id } = req.body;

  if (name && name.toLowerCase() !== cal.name.toLowerCase() && findByNameCi('calendars', name, cal.id)) {
    return res.status(400).json({ error: `A calendar named "${name}" already exists.` });
  }

  if (url && url !== cal.url) {
    if (db.findAll('calendars').find((c) => c.id !== cal.id && c.url === url)) {
      return res.status(400).json({ error: 'This iCal URL is already in use by another calendar.' });
    }
  }

  const newSeqId = locker_sequence_id !== undefined ? (locker_sequence_id || null) : (cal.locker_sequence_id || null);
  db.update('calendars', req.params.id, {
    name: name ?? cal.name,
    url: url ?? cal.url,
    poll_interval_minutes: poll_interval_minutes !== undefined ? Number(poll_interval_minutes) : cal.poll_interval_minutes,
    team_order: team_order ?? cal.team_order ?? 'home_away',
    event_mode: event_mode ?? cal.event_mode ?? 'teams',
    locker_sequence_id: newSeqId,
  });
  // Keep league in sync when sequence is explicitly set via calendar modal
  if (locker_sequence_id !== undefined && cal.type === 'hockey_games') {
    const calName = name ?? cal.name;
    const league = db.findAll('leagues').find((l) => l.name.toLowerCase() === calName.toLowerCase());
    if (league) db.update('leagues', league.id, { locker_sequence_id: newSeqId });
  }
  // Apply a new poll interval or URL immediately instead of after the next fire
  if (poll_interval_minutes !== undefined || (url && url !== cal.url)) {
    scheduleCalendar(db.findById('calendars', req.params.id));
  }
  res.json({ ok: true });
});

router.delete('/calendars/:id', requireAuth, (req, res) => {
  const calId = Number(req.params.id);
  cancelCalendar(calId);
  const removedGames = db.transaction((tx) => {
    tx.remove('calendars', calId);
    // Remove this calendar's games so they don't linger invisibly in the store
    // (or resurface on skate screens via the no-skate-calendars fallback)
    const orphans = tx.findAll('activities').filter((g) => g.calendar_id === calId);
    orphans.forEach((g) => tx.remove('activities', g.id));
    return orphans.length;
  });
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true, removed_games: removedGames });
});

// ── RSS Feeds ─────────────────────────────────────────────────────────────────

// An uploaded logo takes precedence over a linked one — the editor's toggle
// only ever sets one at a time, but this keeps a stale link from resurfacing
// if an upload's write raced ahead of the field being cleared.
function feedLogoSrc(f) {
  return f.logo_filename ? `/uploads/${f.logo_filename}` : (f.logo_url || '');
}

router.get('/rss-feeds', (req, res) => {
  // TVs only need id/name/items/logo to render slides; admin also gets sync status and the raw logo fields for editing
  const feeds = db.findAll('rss_feeds', 'created_at');
  if (!isAdminRequest(req)) {
    return res.json(feeds.map((f) => ({ id: f.id, name: f.name, items: f.items || [], logo_src: feedLogoSrc(f) })));
  }
  res.json(feeds.map((f) => ({
    ...f,
    items: f.items || [],
    last_sync_at: f.last_sync_at || null,
    last_sync_error: f.last_sync_error || null,
    logo_src: feedLogoSrc(f),
  })));
});

router.post('/rss-feeds', requireAuth, async (req, res) => {
  const { name, url, poll_interval_minutes = 15 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });

  if (findByNameCi('rss_feeds', name)) {
    return res.status(400).json({ error: `A feed named "${name}" already exists. Please use a different name.` });
  }
  if (db.findAll('rss_feeds').find((f) => f.url === url)) {
    return res.status(400).json({ error: 'This feed URL is already in use by another feed.' });
  }

  const row = db.insert('rss_feeds', { name, url, poll_interval_minutes: Number(poll_interval_minutes), items: [] });
  fetchAndParseFeed(row).then(() => ws.broadcast({ type: 'refresh_data' })).catch(() => {});
  scheduleFeed(row);
  res.json({ id: row.id });
});

router.patch('/rss-feeds/:id', requireAuth, async (req, res) => {
  const feed = db.findById('rss_feeds', req.params.id);
  if (!feed) return res.status(404).json({ error: 'not found' });

  const { name, url, poll_interval_minutes, logo_url } = req.body;

  if (name && name.toLowerCase() !== feed.name.toLowerCase() && findByNameCi('rss_feeds', name, feed.id)) {
    return res.status(400).json({ error: `A feed named "${name}" already exists.` });
  }
  if (url && url !== feed.url) {
    if (db.findAll('rss_feeds').find((f) => f.id !== feed.id && f.url === url)) {
      return res.status(400).json({ error: 'This feed URL is already in use by another feed.' });
    }
  }

  const changes = {
    name: name ?? feed.name,
    url: url ?? feed.url,
    poll_interval_minutes: poll_interval_minutes !== undefined ? Number(poll_interval_minutes) : feed.poll_interval_minutes,
  };
  // Linking a logo URL supersedes an uploaded one — clean up the old file
  // (the reverse, uploading over a linked logo, is handled by the upload
  // route itself so both paths agree on "only one logo source at a time").
  if (logo_url !== undefined) {
    changes.logo_url = logo_url || '';
    if (logo_url && feed.logo_filename) {
      try { fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', feed.logo_filename)); } catch (_) {}
      changes.logo_filename = '';
    }
  }

  db.update('rss_feeds', req.params.id, changes);
  // Apply a new poll interval or URL immediately instead of after the next fire
  if (poll_interval_minutes !== undefined || (url && url !== feed.url)) {
    scheduleFeed(db.findById('rss_feeds', req.params.id));
  }
  res.json({ ok: true });
});

router.delete('/rss-feeds/:id/logo', requireAuth, (req, res) => {
  const feed = db.findById('rss_feeds', req.params.id);
  if (!feed) return res.status(404).json({ error: 'not found' });
  if (feed.logo_filename) {
    try { fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', feed.logo_filename)); } catch (_) {}
  }
  db.update('rss_feeds', req.params.id, { logo_filename: '', logo_url: '' });
  res.json({ ok: true });
});

router.delete('/rss-feeds/:id', requireAuth, (req, res) => {
  const feedId = Number(req.params.id);
  cancelFeed(feedId);
  db.transaction((tx) => {
    tx.remove('rss_feeds', feedId);
    // Drop the deleted feed from any RSS screen that referenced it — left
    // uncleaned, a screen's rss_feed_ids would keep counting it as
    // "selected" (and rss_feed_id could keep pointing at a feed that no
    // longer exists) even though it can never appear in the feed list again.
    const rssScreens = tx.findAll('screens').filter((s) => s.display_type === 'rss');
    for (const scr of rssScreens) {
      let ids = [];
      try { ids = scr.rss_feed_ids ? JSON.parse(scr.rss_feed_ids) : []; } catch { ids = []; }
      if (!ids.includes(feedId) && scr.rss_feed_id !== feedId) continue;
      const nextIds = ids.filter((id) => id !== feedId);
      tx.update('screens', scr.id, {
        rss_feed_ids: JSON.stringify(nextIds),
        rss_feed_id: scr.rss_feed_id === feedId ? (nextIds[0] || null) : scr.rss_feed_id,
      });
    }
  });
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true });
});

router.post('/rss-feeds/:id/sync', requireAuth, async (req, res) => {
  try {
    await triggerFeedRefresh(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Public Skate Sessions ─────────────────────────────────────────────────────

router.get('/skate-sessions', (req, res) => {
  const skateCals = db.findAll('calendars').filter((c) => c.type === 'public_skates').map((c) => c.id);
  // Optional ?from= lets the TV preview bar show other dates; defaults to now
  let from = new Date();
  if (req.query.from) {
    const d = new Date(req.query.from);
    if (!isNaN(d.getTime())) from = d;
  }
  const fromIso = from.toISOString();
  // Keep in-progress sessions visible until they end
  const sessions = db.findAll('activities', 'start_time')
    .filter((g) => g.is_skate && (g.end_time || g.start_time) >= fromIso && (skateCals.length === 0 || skateCals.includes(g.calendar_id)));
  res.json(sessions);
});

// ── Public Skate Prices ───────────────────────────────────────────────────────

router.get('/skate-prices', (req, res) => {
  const prices = db.findAll('skate_prices', 'sort_order');
  res.json(prices);
});

router.post('/skate-prices', requireAuth, (req, res) => {
  const { label, subheading = '', price, sort_order = 0 } = req.body;
  if (!label || !price) return res.status(400).json({ error: 'label and price required' });
  const row = db.insert('skate_prices', { label, subheading, price, sort_order: Number(sort_order) });
  res.json({ id: row.id });
});

router.patch('/skate-prices/:id', requireAuth, (req, res) => {
  const row = db.findById('skate_prices', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { label, subheading, price, sort_order } = req.body;
  db.update('skate_prices', req.params.id, {
    label: label ?? row.label,
    subheading: subheading !== undefined ? subheading : (row.subheading || ''),
    price: price ?? row.price,
    sort_order: sort_order !== undefined ? Number(sort_order) : row.sort_order,
  });
  res.json({ ok: true });
});

router.delete('/skate-prices/:id', requireAuth, (req, res) => {
  db.remove('skate_prices', req.params.id);
  res.json({ ok: true });
});

// ── Locker Sequences ──────────────────────────────────────────────────────────

router.get('/locker-sequences', (req, res) => {
  res.json(db.findAll('locker_sequences', 'name'));
});

router.post('/locker-sequences', requireAuth, (req, res) => {
  const { name, pairs } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!pairs || !pairs.length) return res.status(400).json({ error: 'At least one pair is required' });
  if (findByNameCi('locker_sequences', name.trim())) {
    return res.status(400).json({ error: `A sequence named "${name}" already exists.` });
  }
  const row = db.insert('locker_sequences', { name: name.trim(), pairs });
  res.json(row);
});

router.patch('/locker-sequences/:id', requireAuth, (req, res) => {
  const seq = db.findById('locker_sequences', req.params.id);
  if (!seq) return res.status(404).json({ error: 'not found' });
  const { name, pairs } = req.body;
  if (name && name.trim() && findByNameCi('locker_sequences', name.trim(), seq.id)) {
    return res.status(400).json({ error: `A sequence named "${name}" already exists.` });
  }
  db.update('locker_sequences', req.params.id, {
    name: name ? name.trim() : seq.name,
    pairs: pairs ?? seq.pairs,
  });
  res.json({ ok: true });
});

router.delete('/locker-sequences/:id', requireAuth, (req, res) => {
  db.remove('locker_sequences', req.params.id);
  res.json({ ok: true });
});

// ── Locker Rooms ─────────────────────────────────────────────────────────────

router.get('/locker-rooms', (req, res) => {
  res.json(db.findAll('locker_rooms', 'name'));
});

router.post('/locker-rooms', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (findByNameCi('locker_rooms', name.trim())) {
    return res.status(400).json({ error: `A locker room named "${name}" already exists.` });
  }
  const row = db.insert('locker_rooms', { name: name.trim() });
  res.json(row);
});

router.patch('/locker-rooms/:id', requireAuth, (req, res) => {
  const room = db.findById('locker_rooms', req.params.id);
  if (!room) return res.status(404).json({ error: 'not found' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (findByNameCi('locker_rooms', name.trim(), room.id)) {
    return res.status(400).json({ error: `A locker room named "${name}" already exists.` });
  }
  db.update('locker_rooms', req.params.id, { name: name.trim() });
  res.json({ ok: true });
});

router.delete('/locker-rooms/:id', requireAuth, (req, res) => {
  db.remove('locker_rooms', req.params.id);
  res.json({ ok: true });
});

// ── Logo ──────────────────────────────────────────────────────────────────────

router.delete('/logo', requireAuth, (req, res) => {
  const filename = db.getSettings().logo_filename;
  if (filename) {
    const fs = require('fs');
    const path = require('path');
    try { fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', filename)); } catch (_) {}
  }
  db.setSetting('logo_filename', '');
  res.json({ ok: true });
});

// ── Backgrounds ───────────────────────────────────────────────────────────────

router.get('/backgrounds', requireAuth, (req, res) => {
  const bgs = db.findAll('backgrounds');
  res.json(bgs.reverse()); // newest first
});

router.patch('/backgrounds/:id', requireAuth, (req, res) => {
  const row = db.findById('backgrounds', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { image_type, label } = req.body;
  if (image_type && image_type !== 'background' && image_type !== 'general')
    return res.status(400).json({ error: 'invalid image_type' });
  db.update('backgrounds', req.params.id, {
    image_type: image_type ?? row.image_type ?? 'background',
    label: label !== undefined ? (label.trim() || row.label) : row.label,
  });
  res.json({ ok: true });
});

router.delete('/backgrounds/:id', requireAuth, (req, res) => {
  const row = db.findById('backgrounds', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', '..', 'uploads', row.filename);
  try { fs.unlinkSync(filePath); } catch (_) {}
  db.remove('backgrounds', req.params.id);
  res.json({ ok: true });
});

// ── Leagues & Teams ───────────────────────────────────────────────────────────

router.get('/leagues', (req, res) => {
  const leagues = db.findAll('leagues', 'name');
  const teams = db.findAll('teams', 'name');
  const result = leagues.map((l) => ({
    ...l,
    teams: teams.filter((t) => t.league_id === l.id),
  }));
  res.json(result);
});

router.post('/leagues', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (findByNameCi('leagues', name.trim())) {
    return res.status(400).json({ error: `A league named "${name}" already exists.` });
  }
  const row = db.insert('leagues', { name: name.trim(), locker_sequence_id: null });
  res.json(row);
});

router.patch('/leagues/:id', requireAuth, (req, res) => {
  const league = db.findById('leagues', req.params.id);
  if (!league) return res.status(404).json({ error: 'not found' });
  const { name, locker_sequence_id } = req.body;
  if (name && name.trim() && findByNameCi('leagues', name.trim(), league.id)) {
    return res.status(400).json({ error: `A league named "${name}" already exists.` });
  }
  const newName = name ? name.trim() : league.name;
  const newLeagueSeqId = locker_sequence_id !== undefined ? (locker_sequence_id || null) : league.locker_sequence_id;
  db.update('leagues', req.params.id, { name: newName, locker_sequence_id: newLeagueSeqId });
  // Keep matching calendar in sync when sequence is set via Leagues tab
  if (locker_sequence_id !== undefined) {
    const cal = db.findAll('calendars').find((c) => c.type === 'hockey_games' && c.name.toLowerCase() === newName.toLowerCase());
    if (cal) db.update('calendars', cal.id, { locker_sequence_id: newLeagueSeqId });
  }
  res.json({ ok: true });
});

router.delete('/leagues/:id', requireAuth, (req, res) => {
  db.transaction((tx) => {
    tx.remove('leagues', req.params.id);
    tx.findAll('teams').filter((t) => t.league_id === Number(req.params.id)).forEach((t) => tx.remove('teams', t.id));
  });
  res.json({ ok: true });
});

router.post('/leagues/:id/teams', requireAuth, (req, res) => {
  const league = db.findById('leagues', req.params.id);
  if (!league) return res.status(404).json({ error: 'not found' });
  const { name, color, text_color, display_name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Team name is required' });
  const row = db.insert('teams', { name: name.trim(), display_name: display_name || '', league_id: league.id, color: color || '', text_color: text_color || '' });
  res.json(row);
});

router.patch('/teams/:id', requireAuth, (req, res) => {
  const team = db.findById('teams', req.params.id);
  if (!team) return res.status(404).json({ error: 'not found' });
  const { name, color, text_color, display_name } = req.body;
  db.update('teams', req.params.id, {
    name: name ? name.trim() : team.name,
    display_name: display_name !== undefined ? display_name : (team.display_name || ''),
    color: color !== undefined ? color : team.color,
    text_color: text_color !== undefined ? text_color : (team.text_color || ''),
  });
  res.json({ ok: true });
});

router.delete('/teams/:id', requireAuth, (req, res) => {
  db.remove('teams', req.params.id);
  res.json({ ok: true });
});

// ── Backups ────────────────────────────────────────────────────────────────────

router.get('/backups', requireAuth, (req, res) => {
  const settings = db.getSettings();
  res.json({
    backups: backup.listBackups(),
    settings: {
      backup_auto_enabled: settings.backup_auto_enabled !== 'false',
      backup_interval_hours: settings.backup_interval_hours || '24',
      backup_retention_count: settings.backup_retention_count || '14',
      backup_dir: settings.backup_dir || '',
      backup_dir_default: backup.DEFAULT_BACKUP_DIR,
      backup_dir_effective: backup.getBackupDir(),
      last_backup_at: settings.last_backup_at || null,
    },
  });
});

router.get('/backups/browse', requireAuth, (req, res) => {
  const dirPath = req.query.path ? String(req.query.path) : '';
  try {
    if (!dirPath) return res.json({ path: '', parent: null, entries: backup.listRoots() });
    const parent = path.dirname(dirPath);
    res.json({ path: dirPath, parent: parent === dirPath ? null : parent, entries: backup.listDir(dirPath) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/backups/browse/mkdir', requireAuth, (req, res) => {
  const { path: dirPath, name } = req.body;
  try {
    res.json({ path: backup.makeSubdir(dirPath, name) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/backups/settings', requireAuth, (req, res) => {
  const { backup_auto_enabled, backup_interval_hours, backup_retention_count, backup_dir } = req.body;
  const kv = {};
  if (backup_auto_enabled !== undefined) kv.backup_auto_enabled = String(!!backup_auto_enabled);
  if (backup_interval_hours !== undefined) {
    const n = parseFloat(backup_interval_hours);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'backup_interval_hours must be a positive number' });
    kv.backup_interval_hours = String(n);
  }
  if (backup_retention_count !== undefined) {
    const n = parseInt(backup_retention_count, 10);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'backup_retention_count must be a positive integer' });
    kv.backup_retention_count = String(n);
  }
  if (backup_dir !== undefined) {
    const trimmed = (backup_dir || '').trim();
    if (trimmed) {
      try { backup.validateBackupDir(trimmed); }
      catch (err) { return res.status(400).json({ error: `Backup location is not usable: ${err.message}` }); }
    }
    kv.backup_dir = trimmed;
  }
  db.setSettings(kv);
  backup.startScheduler();
  res.json({ ok: true });
});

router.post('/backups', requireAuth, (req, res) => {
  try {
    const filename = backup.createBackup('manual');
    res.json({ ok: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/backups/:filename', requireAuth, (req, res) => {
  try {
    backup.setPinned(req.params.filename, !!req.body.pinned);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/backups/:filename/download', requireAuth, (req, res) => {
  let filePath;
  try { filePath = backup.getBackupPath(req.params.filename); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  if (!filePath) return res.status(404).json({ error: 'not found' });
  res.download(filePath, req.params.filename);
});

router.delete('/backups/:filename', requireAuth, (req, res) => {
  try {
    const removed = backup.deleteBackup(req.params.filename);
    if (!removed) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/backups/:filename/restore', requireAuth, (req, res) => {
  let filePath;
  try { filePath = backup.getBackupPath(req.params.filename); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  if (!filePath) return res.status(404).json({ error: 'not found' });
  try {
    backup.restoreFromZip(filePath);
    ws.broadcast({ type: 'refresh_data' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/backups/restore-upload', requireAuth, backupUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  try {
    backup.restoreFromZip(req.file.path);
    ws.broadcast({ type: 'refresh_data' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ── Updates ────────────────────────────────────────────────────────────────────

router.get('/updates', requireAuth, (req, res) => {
  res.json(update.getStatus());
});

router.post('/updates/check', requireAuth, async (req, res) => {
  try {
    res.json(await update.checkForUpdate());
  } catch (err) {
    db.setSetting('update_check_error', err.message);
    res.status(400).json({ error: err.message });
  }
});

function parseHhMm(value, fieldLabel) {
  if (!/^\d{1,2}:\d{2}$/.test(value)) throw new Error(`${fieldLabel} must be a time in HH:MM (24-hour) format`);
  const [h, m] = value.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`${fieldLabel} must be a valid 24-hour time`);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

router.put('/updates/settings', requireAuth, (req, res) => {
  const {
    update_check_enabled, update_check_mode, update_check_interval_hours, update_check_time,
    update_auto_install_enabled, update_install_time,
    update_github_token, update_github_repo,
  } = req.body;
  const kv = {};
  if (update_check_enabled !== undefined) kv.update_check_enabled = String(!!update_check_enabled);
  if (update_check_mode !== undefined) {
    if (!['interval', 'daily'].includes(update_check_mode)) return res.status(400).json({ error: 'update_check_mode must be "interval" or "daily"' });
    kv.update_check_mode = update_check_mode;
  }
  if (update_check_interval_hours !== undefined) {
    const n = parseFloat(update_check_interval_hours);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'update_check_interval_hours must be a positive number' });
    kv.update_check_interval_hours = String(n);
  }
  if (update_check_time !== undefined) {
    try { kv.update_check_time = parseHhMm(update_check_time, 'update_check_time'); }
    catch (err) { return res.status(400).json({ error: err.message }); }
  }
  if (update_auto_install_enabled !== undefined) kv.update_auto_install_enabled = String(!!update_auto_install_enabled);
  if (update_install_time !== undefined) {
    try { kv.update_install_time = parseHhMm(update_install_time, 'update_install_time'); }
    catch (err) { return res.status(400).json({ error: err.message }); }
  }
  if (update_github_token !== undefined) kv.update_github_token = update_github_token;
  if (update_github_repo !== undefined) kv.update_github_repo = update_github_repo.trim();
  db.setSettings(kv);
  update.startScheduler();
  update.startInstallScheduler();
  res.json({ ok: true });
});

router.post('/updates/install', requireAuth, async (req, res) => {
  try {
    const result = await update.installUpdate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
