const { WebSocketServer } = require('ws');
const { parse } = require('url');

let wss;
// Map of screenId -> Set of WebSocket clients
const clients = new Map();

function init(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const { query } = parse(req.url, true);
    const screenId = query.screenId || 'unknown';

    if (!clients.has(screenId)) clients.set(screenId, new Set());
    clients.get(screenId).add(ws);

    ws.isAlive = true;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'pong') ws.isAlive = true;
      } catch (_) {}
    });

    ws.on('close', () => {
      const set = clients.get(screenId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(screenId);
      }
    });
  });

  // Heartbeat: ping all clients every 30s to detect stale connections
  setInterval(() => {
    for (const [, set] of clients) {
      for (const ws of set) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }
  }, 30_000);
}

function push(screenId, message) {
  const payload = JSON.stringify(message);
  const set = clients.get(screenId);
  if (set) set.forEach((ws) => ws.readyState === 1 && ws.send(payload));
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const [, set] of clients) {
    set.forEach((ws) => ws.readyState === 1 && ws.send(payload));
  }
}

function connectedScreenIds() {
  return [...clients.keys()];
}

module.exports = { init, push, broadcast, connectedScreenIds };
