const express = require('express');
const router = express.Router();
const db = require('../db');
const ws = require('../ws');
const { triggerRefresh, parseTitle } = require('../calendar');
const { autoAssign } = require('../locker-assign');
const { requireAuth, signToken, verifyToken } = require('../auth');
const bcrypt = require('bcryptjs');

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
  res.json({ token: signToken() });
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  res.json(db.getSettings());
});

router.patch('/settings', requireAuth, async (req, res) => {
  const incoming = req.body;

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

router.get('/screens', (req, res) => {
  const screens = db.findAll('screens');
  const backgrounds = db.findAll('backgrounds');
  const bgMap = Object.fromEntries(backgrounds.map((b) => [b.id, b]));
  const connected = ws.connectedScreenIds();
  res.json(screens.map((s) => ({
    ...s,
    bg_filename: s.background_id ? bgMap[s.background_id]?.filename : null,
    bg_label: s.background_id ? bgMap[s.background_id]?.label : null,
    online: connected.includes(String(s.id)),
  })));
});

router.post('/screens', requireAuth, (req, res) => {
  const { name, ip, display_type = 'games', webpage_url = '', webpage_width = 100, webpage_zoom = 100, webpage_refresh = 0 } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'name and ip required' });
  const row = db.insert('screens', { name, ip, display_type, background_id: null, webpage_url, webpage_width: Number(webpage_width), webpage_zoom: Number(webpage_zoom), webpage_refresh: Number(webpage_refresh) });
  res.json({ id: row.id });
});

router.patch('/screens/:id', requireAuth, (req, res) => {
  const screen = db.findById('screens', req.params.id);
  if (!screen) return res.status(404).json({ error: 'not found' });
  const { name, ip, display_type, background_id, webpage_url, webpage_width, webpage_zoom, webpage_refresh } = req.body;
  db.update('screens', req.params.id, {
    name: name ?? screen.name,
    ip: ip ?? screen.ip,
    display_type: display_type ?? screen.display_type,
    background_id: background_id !== undefined ? (background_id || null) : screen.background_id,
    webpage_url: webpage_url !== undefined ? webpage_url : (screen.webpage_url || ''),
    webpage_width: webpage_width !== undefined ? Number(webpage_width) : (screen.webpage_width || 100),
    webpage_zoom: webpage_zoom !== undefined ? Number(webpage_zoom) : (screen.webpage_zoom || 100),
    webpage_refresh: webpage_refresh !== undefined ? Number(webpage_refresh) : (screen.webpage_refresh || 0),
  });
  ws.push(String(req.params.id), { type: 'reload' });
  res.json({ ok: true });
});

router.delete('/screens/:id', requireAuth, (req, res) => {
  db.remove('screens', req.params.id);
  res.json({ ok: true });
});

// ── Rink Events ───────────────────────────────────────────────────────────────

router.get('/rink-events', (req, res) => {
  const rinkEventCalIds = new Set(
    db.findAll('calendars')
      .filter((c) => c.type === 'rink_events')
      .map((c) => c.id)
  );
  const events = db.findAll('games', 'start_time')
    .filter((g) => rinkEventCalIds.has(g.calendar_id));
  res.json(events);
});

// ── Figure Skating ────────────────────────────────────────────────────────────

router.get('/figure-skating', (req, res) => {
  const calIds = new Set(
    db.findAll('calendars')
      .filter((c) => c.type === 'figure_skating')
      .map((c) => c.id)
  );
  res.json(db.findAll('games', 'start_time').filter((g) => calIds.has(g.calendar_id)));
});

// ── Games ─────────────────────────────────────────────────────────────────────

router.get('/games', (req, res) => {
  const hockeyCalIds = new Set(
    db.findAll('calendars')
      .filter((c) => c.type === 'hockey_games')
      .map((c) => c.id)
  );
  const all = db.findAll('games', 'start_time');
  // Only return games from hockey_games calendars (or legacy unassigned games with no calendar)
  res.json(all.filter((g) => !g.calendar_id || hockeyCalIds.has(g.calendar_id)));
});

router.patch('/games/:id', requireAuth, (req, res) => {
  const game = db.findById('games', req.params.id);
  if (!game) return res.status(404).json({ error: 'not found' });
  const { home_team, away_team, home_locker, away_locker } = req.body;
  const lockerChanged = home_locker !== undefined || away_locker !== undefined;
  db.update('games', req.params.id, {
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
  const game = db.findById('games', req.params.id);
  if (!game) return res.status(404).json({ error: 'not found' });
  db.remove('games', req.params.id);
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true });
});

router.post('/games/refresh', requireAuth, (req, res) => {
  triggerRefresh();
  res.json({ ok: true });
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
  const calendars = db.findAll('calendars');
  const calMap = Object.fromEntries(calendars.map((c) => [c.id, c]));
  const games = db.findAll('games');
  let updated = 0;

  for (const game of games) {
    const cal = calMap[game.calendar_id] || {};
    const { title, away_team, home_team } = parseTitle(game.raw_title || game.title || '', cal);
    db.update('games', game.id, { title, away_team, home_team });
    updated++;
  }

  ws.broadcast({ type: 'refresh_data' });
  res.json({ updated });
});

router.delete('/games/unassigned', requireAuth, (req, res) => {
  const data = require('../db');
  const all = data.findAll('games');
  const toRemove = all.filter((g) => !g.calendar_id);
  toRemove.forEach((g) => data.remove('games', g.id));
  res.json({ removed: toRemove.length });
});

router.get('/games/debug-calendar', async (req, res) => {
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
  const leagues = db.findAll('leagues');
  const calendars = db.findAll('calendars', 'created_at').map((cal) => {
    const league = leagues.find((l) => l.name.toLowerCase() === cal.name.toLowerCase());
    return {
      ...cal,
      locker_sequence_id: cal.locker_sequence_id ?? (league ? league.locker_sequence_id : null),
    };
  });
  res.json(calendars);
});

router.post('/calendars', requireAuth, async (req, res) => {
  const { name, url, type, poll_interval_minutes = 5, team_order = 'away_home' } = req.body;
  if (!name || !url || !type) return res.status(400).json({ error: 'name, url, and type are required' });

  const all = db.findAll('calendars');
  if (all.find((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: `A calendar named "${name}" already exists. Please use a different name.` });
  }
  if (all.find((c) => c.url === url)) {
    return res.status(400).json({ error: 'This iCal URL is already in use by another calendar.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let text;
    try {
      const response = await fetch(url, { signal: controller.signal });
      text = await response.text();
    } finally {
      clearTimeout(timeout);
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      return res.status(400).json({ error: 'The URL does not appear to be a valid iCal calendar. Make sure you copied the iCal (.ics) link.' });
    }
  } catch (err) {
    return res.status(400).json({ error: `Could not load the calendar URL: ${err.message}` });
  }

  const { locker_sequence_id } = req.body;
  const row = db.insert('calendars', { name, url, type, poll_interval_minutes: Number(poll_interval_minutes), team_order, locker_sequence_id: locker_sequence_id || null });
  res.json({ id: row.id });
});

router.patch('/calendars/:id', requireAuth, async (req, res) => {
  const cal = db.findById('calendars', req.params.id);
  if (!cal) return res.status(404).json({ error: 'not found' });

  const { name, url, poll_interval_minutes, team_order, locker_sequence_id } = req.body;
  const all = db.findAll('calendars');

  if (name && name.toLowerCase() !== cal.name.toLowerCase()) {
    if (all.find((c) => c.id !== cal.id && c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: `A calendar named "${name}" already exists.` });
    }
  }

  if (url && url !== cal.url) {
    if (all.find((c) => c.id !== cal.id && c.url === url)) {
      return res.status(400).json({ error: 'This iCal URL is already in use by another calendar.' });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let text;
      try {
        const response = await fetch(url, { signal: controller.signal });
        text = await response.text();
      } finally {
        clearTimeout(timeout);
      }
      if (!text.includes('BEGIN:VCALENDAR')) {
        return res.status(400).json({ error: 'The URL does not appear to be a valid iCal calendar.' });
      }
    } catch (err) {
      return res.status(400).json({ error: `Could not load the calendar URL: ${err.message}` });
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
  res.json({ ok: true });
});

router.delete('/calendars/:id', requireAuth, (req, res) => {
  db.remove('calendars', req.params.id);
  res.json({ ok: true });
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
  const all = db.findAll('locker_sequences');
  if (all.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: `A sequence named "${name}" already exists.` });
  }
  const row = db.insert('locker_sequences', { name: name.trim(), pairs });
  res.json(row);
});

router.patch('/locker-sequences/:id', requireAuth, (req, res) => {
  const seq = db.findById('locker_sequences', req.params.id);
  if (!seq) return res.status(404).json({ error: 'not found' });
  const { name, pairs } = req.body;
  if (name && name.trim()) {
    const all = db.findAll('locker_sequences');
    if (all.find((s) => s.id !== seq.id && s.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: `A sequence named "${name}" already exists.` });
    }
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
  const all = db.findAll('locker_rooms');
  if (all.find((r) => r.name.toLowerCase() === name.trim().toLowerCase())) {
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
  const all = db.findAll('locker_rooms');
  if (all.find((r) => r.id !== room.id && r.name.toLowerCase() === name.trim().toLowerCase())) {
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
  const all = db.findAll('leagues');
  if (all.find((l) => l.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: `A league named "${name}" already exists.` });
  }
  const row = db.insert('leagues', { name: name.trim(), locker_sequence_id: null });
  res.json(row);
});

router.patch('/leagues/:id', requireAuth, (req, res) => {
  const league = db.findById('leagues', req.params.id);
  if (!league) return res.status(404).json({ error: 'not found' });
  const { name, locker_sequence_id } = req.body;
  if (name && name.trim()) {
    const all = db.findAll('leagues');
    if (all.find((l) => l.id !== league.id && l.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: `A league named "${name}" already exists.` });
    }
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
  db.remove('leagues', req.params.id);
  db.findAll('teams').filter((t) => t.league_id === Number(req.params.id)).forEach((t) => db.remove('teams', t.id));
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
