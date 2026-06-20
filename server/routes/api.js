const express = require('express');
const router = express.Router();
const db = require('../db');
const ws = require('../ws');
const { triggerRefresh } = require('../calendar');

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  res.json(db.getSettings());
});

router.patch('/settings', (req, res) => {
  db.setSettings(req.body);
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

router.post('/screens', (req, res) => {
  const { name, ip, display_type = 'games' } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'name and ip required' });
  const row = db.insert('screens', { name, ip, display_type, background_id: null });
  res.json({ id: row.id });
});

router.patch('/screens/:id', (req, res) => {
  const screen = db.findById('screens', req.params.id);
  if (!screen) return res.status(404).json({ error: 'not found' });
  const { name, ip, display_type, background_id } = req.body;
  db.update('screens', req.params.id, {
    name: name ?? screen.name,
    ip: ip ?? screen.ip,
    display_type: display_type ?? screen.display_type,
    background_id: background_id !== undefined ? (background_id || null) : screen.background_id,
  });
  ws.push(String(req.params.id), { type: 'reload' });
  res.json({ ok: true });
});

router.delete('/screens/:id', (req, res) => {
  db.remove('screens', req.params.id);
  res.json({ ok: true });
});

// ── Games ─────────────────────────────────────────────────────────────────────

router.get('/games', (req, res) => {
  res.json(db.findAll('games', 'start_time'));
});

router.patch('/games/:id', (req, res) => {
  const game = db.findById('games', req.params.id);
  if (!game) return res.status(404).json({ error: 'not found' });
  const { home_team, away_team, home_locker, away_locker } = req.body;
  db.update('games', req.params.id, {
    home_team: home_team ?? game.home_team,
    away_team: away_team ?? game.away_team,
    home_locker: home_locker ?? game.home_locker,
    away_locker: away_locker ?? game.away_locker,
  });
  ws.broadcast({ type: 'refresh_data' });
  res.json({ ok: true });
});

router.post('/games/refresh', (req, res) => {
  triggerRefresh();
  res.json({ ok: true });
});

router.get('/games/debug-calendar', async (req, res) => {
  const ical = require('node-ical');
  const settings = db.getSettings();
  const url = settings.ical_url;
  if (!url) return res.json({ error: 'No iCal URL configured in Settings' });

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
    summary.push({
      uid: event.uid,
      title: event.summary,
      start: start ? start.toISOString() : null,
      included: start && start >= cutoff,
      reason: !start ? 'no start date' : start < cutoff ? `too old (cutoff: ${cutoff.toISOString()})` : 'ok',
    });
  }

  res.json({
    url,
    now: now.toISOString(),
    cutoff: cutoff.toISOString(),
    total_vevents: summary.length,
    included: summary.filter(e => e.included).length,
    events: summary,
  });
});

// ── Public Skate Prices ───────────────────────────────────────────────────────

router.get('/skate-prices', (req, res) => {
  const prices = db.findAll('skate_prices', 'sort_order');
  res.json(prices);
});

router.post('/skate-prices', (req, res) => {
  const { label, price, sort_order = 0 } = req.body;
  if (!label || !price) return res.status(400).json({ error: 'label and price required' });
  const row = db.insert('skate_prices', { label, price, sort_order: Number(sort_order) });
  res.json({ id: row.id });
});

router.patch('/skate-prices/:id', (req, res) => {
  const row = db.findById('skate_prices', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { label, price, sort_order } = req.body;
  db.update('skate_prices', req.params.id, {
    label: label ?? row.label,
    price: price ?? row.price,
    sort_order: sort_order !== undefined ? Number(sort_order) : row.sort_order,
  });
  res.json({ ok: true });
});

router.delete('/skate-prices/:id', (req, res) => {
  db.remove('skate_prices', req.params.id);
  res.json({ ok: true });
});

// ── Backgrounds ───────────────────────────────────────────────────────────────

router.get('/backgrounds', (req, res) => {
  const bgs = db.findAll('backgrounds');
  res.json(bgs.reverse()); // newest first
});

router.delete('/backgrounds/:id', (req, res) => {
  const row = db.findById('backgrounds', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', '..', 'uploads', row.filename);
  try { fs.unlinkSync(filePath); } catch (_) {}
  db.remove('backgrounds', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
