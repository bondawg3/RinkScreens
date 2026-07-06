const express = require('express');
const router = express.Router();
const db = require('../db');
const ws = require('../ws');
const { triggerRefresh, triggerCalendarRefresh, parseTitle, syncCalendar, scheduleCalendar, cancelCalendar } = require('../calendar');
const { autoAssign } = require('../locker-assign');
const { requireAuth, rotateJwtSecret, signToken, verifyToken } = require('../auth');
const bcrypt = require('bcryptjs');

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
  const calIds = new Set(
    db.findAll('calendars')
      .filter((c) => c.type === type)
      .map((c) => c.id)
  );
  return db.findAll('activities', 'start_time')
    .filter((g) => calIds.has(g.calendar_id) || (includeLegacy && !g.calendar_id));
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
const SECRET_SETTINGS = ['jwt_secret', 'admin_password_hash'];

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

router.get('/screens', (req, res) => {
  const screens = db.findAll('screens');
  const backgrounds = db.findAll('backgrounds');
  const bgMap = Object.fromEntries(backgrounds.map((b) => [b.id, b]));
  const connected = ws.connectedScreenIds();
  res.json(screens.map((s) => ({
    ...s,
    calendar_ids: parseCalendarIds(s.calendar_ids),
    bg_opacity: s.bg_opacity ?? 100,
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
    online: connected.includes(String(s.id)),
    announcement_data: s.announcement_data ? (() => { try { return JSON.parse(s.announcement_data); } catch { return null; } })() : null,
  })));
});

router.post('/screens', requireAuth, (req, res) => {
  const { name, ip = '', display_type = 'games', webpage_url = '', webpage_width = 100, webpage_zoom = 100, webpage_refresh = 0, calendar_ids, bg_opacity = 100, background_id, announcement_data, bg_color = '', show_pricing = false, show_locker_rooms = true, pricing_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const calIds = parseCalendarIds(calendar_ids);
  const priceIds = parseCalendarIds(pricing_ids);
  const row = db.insert('screens', { name, ip, display_type, background_id: background_id || null, webpage_url, webpage_width: Number(webpage_width), webpage_zoom: Number(webpage_zoom), webpage_refresh: Number(webpage_refresh), calendar_ids: calIds ? JSON.stringify(calIds) : null, bg_opacity: Number(bg_opacity), announcement_data: announcement_data ? JSON.stringify(announcement_data) : null, bg_color: bg_color || '', show_pricing: !!show_pricing, show_locker_rooms: !!show_locker_rooms, pricing_ids: priceIds ? JSON.stringify(priceIds) : null });
  res.json({ id: row.id });
});

router.patch('/screens/:id', requireAuth, (req, res) => {
  const screen = db.findById('screens', req.params.id);
  if (!screen) return res.status(404).json({ error: 'not found' });
  const { name, ip, display_type, background_id, webpage_url, webpage_width, webpage_zoom, webpage_refresh, calendar_ids, bg_opacity, announcement_data, bg_color, visible, show_pricing, show_locker_rooms, pricing_ids } = req.body;
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
    announcement_data: announcement_data !== undefined ? JSON.stringify(announcement_data) : (screen.announcement_data || null),
    bg_color: bg_color !== undefined ? (bg_color || '') : (screen.bg_color || ''),
    visible: visible !== undefined ? visible !== false : (screen.visible !== false),
    two_column: 'two_column' in req.body ? !!req.body.two_column : !!screen.two_column,
    overflow_mode: req.body.overflow_mode ?? screen.overflow_mode ?? 'none',
    rotate_interval: req.body.rotate_interval !== undefined ? Number(req.body.rotate_interval) : (screen.rotate_interval ?? 30),
    days_ahead: req.body.days_ahead !== undefined ? Number(req.body.days_ahead) : (screen.days_ahead ?? 14),
    show_pricing: show_pricing !== undefined ? !!show_pricing : !!screen.show_pricing,
    show_locker_rooms: show_locker_rooms !== undefined ? !!show_locker_rooms : (screen.show_locker_rooms !== false),
    pricing_ids: priceIds ? JSON.stringify(priceIds) : null,
  });
  ws.push(String(req.params.id), { type: 'reload' });
  res.json({ ok: true });
});

router.delete('/screens/:id', requireAuth, (req, res) => {
  db.remove('screens', req.params.id);
  res.json({ ok: true });
});

router.post('/screens/:id/reload', requireAuth, (req, res) => {
  ws.push(String(req.params.id), { type: 'reload' });
  res.json({ ok: true });
});

// ── Displays ──────────────────────────────────────────────────────────────────

router.get('/displays', (req, res) => {
  res.json(db.findAll('displays', 'created_at'));
});

router.post('/displays', requireAuth, (req, res) => {
  const { name, ip } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'name and ip required' });
  const dupName = findByNameCi('displays', name);
  if (dupName) return res.status(400).json({ error: `A display named "${dupName.name}" already exists.` });
  const dupIp = db.findAll('displays').find((d) => d.ip === ip);
  if (dupIp) return res.status(400).json({ error: `IP ${ip} is already used by "${dupIp.name}".` });
  const row = db.insert('displays', { name, ip });
  res.json({ id: row.id });
});

router.patch('/displays/:id', requireAuth, (req, res) => {
  const display = db.findById('displays', req.params.id);
  if (!display) return res.status(404).json({ error: 'not found' });
  const { name, ip, screen_id } = req.body;
  const newName = name ?? display.name;
  const newIp = ip ?? display.ip;
  const dupName = findByNameCi('displays', newName, display.id);
  if (dupName) return res.status(400).json({ error: `A display named "${dupName.name}" already exists.` });
  const dupIp = db.findAll('displays').find((d) => d.id !== display.id && d.ip === newIp);
  if (dupIp) return res.status(400).json({ error: `IP ${newIp} is already used by "${dupIp.name}".` });
  const changes = { name: newName, ip: newIp };
  if ('screen_id' in req.body) changes.screen_id = screen_id ? Number(screen_id) : null;
  db.update('displays', req.params.id, changes);
  res.json({ ok: true });
});

router.delete('/displays/:id', requireAuth, (req, res) => {
  db.remove('displays', req.params.id);
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
  db.update('activities', req.params.id, {
    home_team: home_team ?? game.home_team,
    away_team: away_team ?? game.away_team,
    home_locker: home_locker ?? game.home_locker,
    away_locker: away_locker ?? game.away_locker,
    lr_auto_assigned: lockerChanged ? 0 : (game.lr_auto_assigned || 0),
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
      tx.update('activities', game.id, { title, away_team, home_team });
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
  const { name, url, type, poll_interval_minutes = 5, team_order = 'away_home' } = req.body;
  if (!name || !url || !type) return res.status(400).json({ error: 'name, url, and type are required' });

  if (findByNameCi('calendars', name)) {
    return res.status(400).json({ error: `A calendar named "${name}" already exists. Please use a different name.` });
  }
  if (db.findAll('calendars').find((c) => c.url === url)) {
    return res.status(400).json({ error: 'This iCal URL is already in use by another calendar.' });
  }

  const { locker_sequence_id } = req.body;
  const row = db.insert('calendars', { name, url, type, poll_interval_minutes: Number(poll_interval_minutes), team_order, locker_sequence_id: locker_sequence_id || null });
  // Sync immediately in the background and start the poll cycle (previously
  // new calendars were never polled until a server restart)
  syncCalendar(row).then(() => ws.broadcast({ type: 'refresh_data' })).catch(() => {});
  scheduleCalendar(row);
  res.json({ id: row.id });
});

router.patch('/calendars/:id', requireAuth, async (req, res) => {
  const cal = db.findById('calendars', req.params.id);
  if (!cal) return res.status(404).json({ error: 'not found' });

  const { name, url, poll_interval_minutes, team_order, locker_sequence_id } = req.body;

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
    team_order: team_order ?? cal.team_order ?? 'away_home',
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

module.exports = router;
