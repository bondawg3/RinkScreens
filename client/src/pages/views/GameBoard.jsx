import React, { useEffect, useState } from 'react';
import styles from './GameBoard.module.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function GameBoard({ rinkName }) {
  const [games, setGames] = useState([]);

  async function load() {
    try {
      const res = await fetch('/api/games');
      const all = await res.json();
      // Only show non-skate upcoming games
      const now = new Date();
      setGames(all.filter((g) => !g.is_skate && new Date(g.start_time) >= now));
    } catch (_) {}
  }

  useEffect(() => { load(); }, []);

  // expose reload for parent
  GameBoard.reload = load;

  if (games.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🏒</div>
        <p>No upcoming games scheduled</p>
      </div>
    );
  }

  return (
    <div className={styles.board}>
      <div className={styles.tableHeader}>
        <span>Time</span>
        <span>Away</span>
        <span className={styles.vs}>VS</span>
        <span>Home</span>
        <span>Locker Rooms</span>
      </div>
      <div className={styles.rows}>
        {games.map((g) => (
          <div key={g.id} className={styles.row}>
            <div className={styles.time}>
              <span className={styles.date}>{formatDate(g.start_time)}</span>
              <span className={styles.clock}>{formatTime(g.start_time)}</span>
            </div>
            <div className={styles.team + ' ' + styles.away}>
              {g.away_team || <span className={styles.tbd}>TBD</span>}
            </div>
            <div className={styles.vsCell}>VS</div>
            <div className={styles.team + ' ' + styles.home}>
              {g.home_team || <span className={styles.tbd}>TBD</span>}
            </div>
            <div className={styles.lockers}>
              {g.home_locker || g.away_locker ? (
                <>
                  <span className={styles.lockerChip}>Home: {g.home_locker || '—'}</span>
                  <span className={styles.lockerChip}>Away: {g.away_locker || '—'}</span>
                </>
              ) : (
                <span className={styles.tbd}>Not assigned</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
