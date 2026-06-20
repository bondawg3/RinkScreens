import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import GameBoard from './views/GameBoard';
import PublicSkate from './views/PublicSkate';
import styles from './Display.module.css';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function Display() {
  const { screenId } = useParams();
  const [config, setConfig] = useState(null);
  const [rinkName, setRinkName] = useState('Ice Rink');
  const viewRef = useRef(null);

  async function loadConfig() {
    try {
      const [screensRes, settingsRes] = await Promise.all([
        fetch('/api/screens'),
        fetch('/api/settings'),
      ]);
      const screens = await screensRes.json();
      const settings = await settingsRes.json();
      const screen = screens.find((s) => String(s.id) === String(screenId));
      setConfig(screen || null);
      setRinkName(settings.rink_name || 'Ice Rink');
    } catch (_) {}
  }

  useEffect(() => { loadConfig(); }, [screenId]);

  useWebSocket(screenId, (msg) => {
    if (msg.type === 'reload') loadConfig();
    if (msg.type === 'refresh_data') {
      // Trigger data reload in the active view
      if (viewRef.current && viewRef.current.reload) viewRef.current.reload();
      // Easier: just re-render
      setConfig((c) => c ? { ...c } : c);
    }
  });

  const bgStyle = {};
  if (config?.bg_filename) {
    bgStyle.backgroundImage = `url(/uploads/${config.bg_filename})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else {
    bgStyle.background = 'linear-gradient(135deg, #064878 0%, #0a84c8 60%, #1ab3e6 100%)';
  }

  const displayType = config?.display_type || 'games';

  return (
    <div className={styles.screen} style={bgStyle}>
      <div className={styles.overlay} />
      <header className={styles.header}>
        <span className={styles.rinkName}>{rinkName}</span>
        <span className={styles.clock}><Clock /></span>
      </header>
      <main className={styles.content}>
        {displayType === 'games' && <GameBoard rinkName={rinkName} />}
        {displayType === 'skate' && <PublicSkate />}
        {displayType === 'message' && (
          <div className={styles.customMessage}>
            {config?.custom_message || 'Welcome!'}
          </div>
        )}
        {!config && (
          <div className={styles.unconfigured}>
            Screen ID: <strong>{screenId}</strong> — not yet configured in admin.
          </div>
        )}
      </main>
    </div>
  );
}
