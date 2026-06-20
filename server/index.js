const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

const wsManager = require('./ws');
const { startPolling } = require('./calendar');
const apiRouter = require('./routes/api');
const uploadRouter = require('./routes/upload');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve uploaded backgrounds
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API routes
app.use('/api', apiRouter);
app.use('/api', uploadRouter);

// Serve built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
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
