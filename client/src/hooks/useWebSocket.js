import { useEffect, useRef } from 'react';

export function useWebSocket(screenId, onMessage) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${location.host}?screenId=${encodeURIComponent(screenId)}`;
      ws = new WebSocket(url);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
          else onMessageRef.current(msg);
        } catch (_) {}
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws && ws.close();
    };
  }, [screenId]);
}
