import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function GamesTab() {
  const { data: games, reload } = useApi('/games');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  async function forceRefresh() {
    setRefreshing(true);
    await apiFetch('/games/refresh', { method: 'POST' });
    setTimeout(() => { reload(); setRefreshing(false); }, 2000);
  }

  async function saveGame(id) {
    await apiFetch(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
    setEditing(null);
    reload();
  }

  function startEdit(game) {
    setEditing(game.id);
    setEditData({
      home_team: game.home_team,
      away_team: game.away_team,
      home_locker: game.home_locker,
      away_locker: game.away_locker,
    });
  }

  const gamesList = (games || []).filter((g) => !g.is_skate);

  return (
    <div>
      <div className={styles.rowBetween}>
        <h2 className={styles.heading}>Games</h2>
        <button className={styles.btnPrimary} onClick={forceRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Calendar'}
        </button>
      </div>
      <p className={styles.hint}>
        Game times are pulled from Google Calendar. Assign team names and locker rooms here.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date / Time</th><th>Calendar Title</th>
            <th>Away Team</th><th>Home Team</th>
            <th>Away Locker</th><th>Home Locker</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {gamesList.map((g) => (
            <tr key={g.id}>
              <td className={styles.nowrap}>{fmt(g.start_time)}</td>
              <td>{g.title}</td>
              {editing === g.id ? (
                <>
                  <td><input className={styles.input} value={editData.away_team} onChange={(e) => setEditData({ ...editData, away_team: e.target.value })} placeholder="Away" /></td>
                  <td><input className={styles.input} value={editData.home_team} onChange={(e) => setEditData({ ...editData, home_team: e.target.value })} placeholder="Home" /></td>
                  <td><input className={styles.input} value={editData.away_locker} onChange={(e) => setEditData({ ...editData, away_locker: e.target.value })} placeholder="e.g. A1" style={{ width: 80 }} /></td>
                  <td><input className={styles.input} value={editData.home_locker} onChange={(e) => setEditData({ ...editData, home_locker: e.target.value })} placeholder="e.g. B2" style={{ width: 80 }} /></td>
                  <td className={styles.actions}>
                    <button className={styles.btnPrimary} onClick={() => saveGame(g.id)}>Save</button>
                    <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{g.away_team || <span className={styles.muted}>—</span>}</td>
                  <td>{g.home_team || <span className={styles.muted}>—</span>}</td>
                  <td>{g.away_locker || <span className={styles.muted}>—</span>}</td>
                  <td>{g.home_locker || <span className={styles.muted}>—</span>}</td>
                  <td><button className={styles.btnGhost} onClick={() => startEdit(g)}>Edit</button></td>
                </>
              )}
            </tr>
          ))}
          {gamesList.length === 0 && (
            <tr><td colSpan={7} className={styles.muted}>
              No games found. Add a Google Calendar URL in Settings, then click Refresh Calendar.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
