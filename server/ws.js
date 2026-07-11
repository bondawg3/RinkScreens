const { WebSocketServer } = require('ws');
const { parse } = require('url');

let wss;
// Map of client key -> Set of WebSocket clients. Physical displays register
// as 'd:<displayId>' (?displayId= in the WS URL), admin screen previews as
// 's:<screenId>' (?screenId=).
const clients = new Map();

function init(server) {
  wss = new WebSocketServer({ server });

  wss.on('error', (err) => {
    console.error('[ws] server error:', err.message);
  });

  wss.on('connection', (ws, req) => {
    const { query } = parse(req.url, true);
    const key = query.displayId ? `d:${query.displayId}`
      : query.screenId ? `s:${query.screenId}`
      : 'unknown';

    // Without an error listener, a socket error (e.g. ECONNRESET from a TV
    // dropping off Wi-Fi) is an unhandled 'error' event and kills the process
    ws.on('error', (err) => {
      console.error(`[ws] client error (${key}):`, err.message);
    });

    if (!clients.has(key)) clients.set(key, new Set());
    clients.get(key).add(ws);

    ws.isAlive = true;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'pong') ws.isAlive = true;
      } catch (_) {}
    });

    ws.on('close', () => {
      const set = clients.get(key);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(key);
      }
    });
  });

  // Heartbeat: ping all clients every 30s to detect stale connections
  setInterval(() => {
    for (const [, set] of clients) {
      for (const ws of set) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
      }
    }
  }, 30_000);
}

// key is 'd:<displayId>' or 's:<screenId>'
function push(key, message) {
  const payload = JSON.stringify(message);
  const set = clients.get(key);
  if (set) set.forEach((ws) => ws.readyState === 1 && ws.send(payload));
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const [, set] of clients) {
    set.forEach((ws) => ws.readyState === 1 && ws.send(payload));
  }
}

// Connected client keys ('d:1', 's:3', ...)
function connectedKeys() {
  return [...clients.keys()];
}

module.exports = { init, push, broadcast, connectedKeys };
