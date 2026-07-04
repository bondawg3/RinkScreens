const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

const wsManager = require('./ws');
const { startPolling } = require('./calendar');
const apiRouter = require('./routes/api');
const uploadRouter = require('./routes/upload');
const db = require('./db');

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

// Serve uploaded backgrounds
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API routes
app.use('/api', apiRouter);
app.use('/api', uploadRouter);

// TV-compatible plain HTML display (no React, works on Samsung/LG browsers)
const tvHtml = require('fs').readFileSync(path.join(__dirname, 'tv.html'), 'utf8');
app.get('/tv/:screenId', (req, res) => {
  res.send(tvHtml.replace('{{SCREEN_ID}}', req.params.screenId));
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`RinkScreens server running on http://0.0.0.0:${PORT}`);
});
