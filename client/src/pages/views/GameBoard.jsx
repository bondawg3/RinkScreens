import React, { useEffect, useState } from 'react';
import styles from './GameBoard.module.css';

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function teamLabel(name, locker) {
  if (!name) return null;
  return locker ? `${name} (${locker})` : name;
}

// Practice-mode games sharing an exact start time are grouped onto one row
function groupGames(games) {
  const rows = [];
  const rowIndexByKey = new Map();
  for (const g of games) {
    if (g.event_mode === 'practice') {
      const key = g.start_time;
      if (rowIndexByKey.has(key)) {
        rows[rowIndexByKey.get(key)].push(g);
        continue;
      }
      rowIndexByKey.set(key, rows.length);
    }
    rows.push([g]);
  }
  return rows;
}

export default function GameBoard({ rinkName }) {
  const [games, setGames] = useState([]);

  async function load() {
    try {
      const res = await fetch('/api/games');
      const all = await res.json();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      setGames(all.filter((g) => {
        if (g.is_skate) return false;
        const start = new Date(g.start_time);
        return start >= todayStart && start < todayEnd;
      }));
    } catch (_) {}
  }

  useEffect(() => { load(); }, []);
  GameBoard.reload = load;

  if (games.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🏒</div>
        <p>No games scheduled for today</p>
      </div>
    );
  }

  return (
    <div className={styles.board}>
      <div className={styles.tableHeader}>
        <span>Time</span>
        <span className={styles.awayHeader}>Away</span>
        <span className={styles.vsHeader}>VS</span>
        <span className={styles.homeHeader}>Home</span>
      </div>
      <div className={styles.rows}>
        {groupGames(games).map((group) => {
          const isGrouped = group.length > 1;
          return (
            <div key={group[0].id} className={styles.row + (isGrouped ? ' ' + styles.rowGrouped : '')}>
              <div className={styles.time + (isGrouped ? ' ' + styles.timeTop : '')}>
                <span className={styles.clock}>{formatTime(group[0].start_time)}</span>
              </div>
              <div className={styles.subRows}>
                {group.map((g) => {
                  const awayLabel = teamLabel(g.away_team, g.away_locker);
                  const homeLabel = teamLabel(g.home_team, g.home_locker);
                  return (
                    <div key={g.id} className={styles.subRow}>
                      <div className={styles.team + ' ' + styles.away}>
                        {awayLabel || <span className={styles.tbd}>Open</span>}
                      </div>
                      <div className={styles.vsCell}>VS</div>
                      <div className={styles.team + ' ' + styles.home}>
                        {homeLabel || <span className={styles.tbd}>Open</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
