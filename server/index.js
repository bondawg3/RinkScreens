const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

const wsManager = require('./ws');
const { startPolling } = require('./calendar');
const apiRouter = require('./routes/api');
const uploadRouter = require('./routes/upload');
const db = require('./db');
const { pruneOldBlocks } = require('./schedule');
const backup = require('./backup');
const update = require('./update');

// Past schedule blocks are dead weight in db.json — drop anything older than a week
const pruned = pruneOldBlocks(7);
if (pruned) console.log(`[schedule] pruned ${pruned} past schedule block(s)`);

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
app.get('/tv/screen/:screenId', (req, res) => {
  res.send(tvHtml.replace('{{DISPLAY_ID}}', '').replace('{{SCREEN_ID}}', req.params.screenId));
});
app.get('/tv/:tvNumber', (req, res) => {
  const display = db.findAll('displays').find((d) => String(d.tv_number) === req.params.tvNumber);
  if (!display) return res.status(404).send('No display with that TV number.');
  res.send(tvHtml.replace('{{DISPLAY_ID}}', display.id).replace('{{SCREEN_ID}}', ''));
});

// Serve built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Init WebSocket manager
wsManager.init(server);

// Start calendar polling
startPolling();

// Start automatic backup scheduler
backup.startScheduler();

// Start automatic update-check and auto-install schedulers
update.startScheduler();
update.startInstallScheduler();

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`RinkScreens server running on http://0.0.0.0:${PORT}`);
});
