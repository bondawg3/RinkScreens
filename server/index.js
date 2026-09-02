const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

const wsManager = require('./ws');
const { startPolling, pruneOldActivities } = require('./calendar');
const rss = require('./rss');
const apiRouter = require('./routes/api');
const uploadRouter = require('./routes/upload');
const db = require('./db');
const { pruneOldBlocks } = require('./schedule');
const backup = require('./backup');
const update = require('./update');

// Past schedule blocks are dead weight in db.json — keep the last 30 days,
// drop the rest. Re-run daily so a long-lived rink server keeps pruning.
function pruneSchedule() {
  const n = pruneOldBlocks(30);
  if (n) console.log(`[schedule] pruned ${n} past schedule block(s)`);
}
pruneSchedule();
setInterval(pruneSchedule, 24 * 60 * 60 * 1000).unref();

// Same for finished games/skates: calendar sync stops maintaining them once
// they fall out of its import window, so they'd otherwise accumulate forever
const prunedActivities = pruneOldActivities(30);
if (prunedActivities) console.log(`[calendar] pruned ${prunedActivities} past activity row(s)`);

// Seed a default screen for each display type if none exists yet
(function seedDefaultScreens() {
  const types = [
    { display_type: 'games',          name: 'Games' },
    { display_type: 'rink_events',    name: 'Rink Events' },
    { display_type: 'figure_skating', name: 'Figure Skating' },
    { display_type: 'skate',          name: 'Public Skate' },
  ];
  const existing = db.findAll('screens');
  for (const t of types) {
    const has = existing.some((s) => s.display_type === t.display_type);
    if (!has) {
      db.insert('screens', { name: t.name, display_type: t.display_type, bg_opacity: 100 });
    }
  }
}());

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve uploaded backgrounds. The CSP header neutralizes scripts in SVG files
// opened directly as a document (harmless when embedded via <img>).
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  },
}));

// API routes
app.use('/api', apiRouter);
app.use('/api', uploadRouter);

// TV-compatible plain HTML display (no React, works on Samsung/LG browsers).
// Physical TVs load /tv/:displayId — what they render is resolved through the
// display's schedule. /tv/screen/:screenId renders one screen config directly
// (admin previews/thumbnails), bypassing scheduling.
const tvHtml = require('fs').readFileSync(path.join(__dirname, 'tv.html'), 'utf8');
// Both ids land inside a JS string literal in tv.html (var SCREEN_ID = '...').
// They are always numeric, so validate and 404 otherwise — never splice a raw
// request value into the page (that was a reflected-XSS hole). Build the two
// values first, then swap with a function replacer so a '$' in the value can't
// be read as a String.replace special pattern.
function renderTv(res, displayId, screenId) {
  res.send(
    tvHtml
      .replace('{{DISPLAY_ID}}', () => String(displayId))
      .replace('{{SCREEN_ID}}', () => String(screenId))
  );
}
app.get('/tv/screen/:screenId', (req, res) => {
  if (!/^\d+$/.test(req.params.screenId)) return res.status(404).send('Not found.');
  renderTv(res, '', req.params.screenId);
});
app.get('/tv/:tvNumber', (req, res) => {
  const display = db.findAll('displays').find((d) => String(d.tv_number) === req.params.tvNumber);
  if (!display) return res.status(404).send('No display with that TV number.');
  renderTv(res, display.id, '');
});

// Serve built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Terminal error handler. Without an explicit one, an uncaught throw in any
// route falls through to Express's default handler, which writes the stack
// trace into the HTTP response unless NODE_ENV === 'production'. Return a
// generic message instead (and log the real error server-side) so internals
// never leak regardless of how the process was started.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// Init WebSocket manager
wsManager.init(server);

// Start calendar polling
startPolling();

// Start RSS feed polling
rss.startPolling();

// Start automatic backup scheduler
backup.startScheduler();

// Start automatic update-check and auto-install schedulers
update.startScheduler();
update.startInstallScheduler();

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`RinkScreens server running on http://0.0.0.0:${PORT}`);
});
