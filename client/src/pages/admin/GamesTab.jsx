import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tabStyles from './GamesTab.module.css';

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function GamesTab() {
  const { data: games, reload } = useApi('/games');
  const { data: calendars } = useApi('/calendars');
  const { data: lockerRooms } = useApi('/locker-rooms');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [sortBy, setSortBy] = useState('datetime');
  const [weekOffset, setWeekOffset] = useState(0);

  async function forceRefresh() {
    setRefreshing(true);
    await apiFetch('/games/refresh', { method: 'POST' });
    setTimeout(() => { reload(); setRefreshing(false); }, 2000);
  }

  async function reparse() {
    setReparsing(true);
    await apiFetch('/games/reparse', { method: 'POST' });
    reload();
    setReparsing(false);
  }

  async function saveGame(id) {
    await apiFetch(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
    setEditing(null);
    reload();
  }

  async function saveLocker(game, field, value) {
    await apiFetch(`/games/${game.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        home_team: game.home_team,
        away_team: game.away_team,
        home_locker: game.home_locker,
        away_locker: game.away_locker,
        [field]: value,
      }),
    });
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

  const calMap = Object.fromEntries((calendars || []).map((c) => [c.id, c.name]));
  const gamesList = (games || []).filter((g) => !g.is_skate);

  function getWeekBounds(offset) {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  }

  function weekLabel(offset) {
    const { monday, sunday } = getWeekBounds(offset);
    const opts = { month: 'short', day: 'numeric' };
    const monStr = monday.toLocaleDateString([], opts);
    const sunStr = sunday.toLocaleDateString([], opts);
    if (offset === 0) return `This Week  (${monStr} – ${sunStr})`;
    if (offset === 1) return `Next Week  (${monStr} – ${sunStr})`;
    if (offset === -1) return `Last Week  (${monStr} – ${sunStr})`;
    return `${monStr} – ${sunStr}`;
  }

  function dayLabel(iso) {
    return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function getGroups() {
    if (sortBy === 'datetime') {
      const { monday, sunday } = getWeekBounds(weekOffset);
      const filtered = gamesList.filter((g) => {
        const t = new Date(g.start_time);
        return t >= monday && t <= sunday;
      });
      const sorted = [...filtered].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      const byDay = {};
      const dayOrder = [];
      for (const g of sorted) {
        const dayKey = new Date(g.start_time).toDateString();
        if (!byDay[dayKey]) { byDay[dayKey] = { label: dayLabel(g.start_time), byCal: {}, calOrder: [] }; dayOrder.push(dayKey); }
        const calKey = g.calendar_id ? String(g.calendar_id) : '__none__';
        if (!byDay[dayKey].byCal[calKey]) { byDay[dayKey].byCal[calKey] = []; byDay[dayKey].calOrder.push(calKey); }
        byDay[dayKey].byCal[calKey].push(g);
      }
      return dayOrder.map((dayKey) => {
        const day = byDay[dayKey];
        return {
          label: day.label,
          subgroups: day.calOrder.map((calKey) => ({
            label: calKey === '__none__' ? 'Unassigned' : (calMap[calKey] || `Calendar ${calKey}`),
            games: day.byCal[calKey],
          })),
        };
      });
    }
    const grouped = {};
    for (const g of gamesList) {
      const key = g.calendar_id ? String(g.calendar_id) : '__none__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(g);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return (calMap[a] || '').localeCompare(calMap[b] || '');
      })
      .map(([key, grpGames]) => ({
        label: key === '__none__' ? 'Unassigned' : (calMap[key] || `Calendar ${key}`),
        subgroups: [{ label: null, games: grpGames.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)) }],
      }));
  }

  const groups = getGroups();

  function lockerSelect(game, field) {
    const value = editing === game.id ? editData[field] : (game[field] || '');
    const onChange = editing === game.id
      ? (e) => setEditData({ ...editData, [field]: e.target.value })
      : (e) => saveLocker(game, field, e.target.value);
    return (
      <select className={tabStyles.lockerSelect} value={value} onChange={onChange}>
        <option value="">— None —</option>
        {(lockerRooms || []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
      </select>
    );
  }

  function renderRow(g) {
    return (
      <tr key={g.id}>
        <td className={styles.nowrap}>{fmt(g.start_time)}</td>
        {editing === g.id ? (
          <>
            <td><input className={styles.input} value={editData.away_team} onChange={(e) => setEditData({ ...editData, away_team: e.target.value })} placeholder="Away" /></td>
            <td><input className={styles.input} value={editData.home_team} onChange={(e) => setEditData({ ...editData, home_team: e.target.value })} placeholder="Home" /></td>
            <td>{lockerSelect(g, 'away_locker')}</td>
            <td>{lockerSelect(g, 'home_locker')}</td>
            <td>{g.title}</td>
            <td className={styles.actions}>
              <button className={styles.btnPrimary} onClick={() => saveGame(g.id)}>Save</button>
              <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            </td>
          </>
        ) : (
          <>
            <td>{g.away_team || <span className={styles.muted}>—</span>}</td>
            <td>{g.home_team || <span className={styles.muted}>—</span>}</td>
            <td>{lockerSelect(g, 'away_locker')}</td>
            <td>{lockerSelect(g, 'home_locker')}</td>
            <td>{g.title}</td>
            <td><button className={styles.btnGhost} onClick={() => startEdit(g)}>Edit</button></td>
          </>
        )}
      </tr>
    );
  }

  const weekNav = (
    <div className={tabStyles.weekNav}>
      <button className={tabStyles.weekBtn} onClick={() => setWeekOffset(weekOffset - 1)}>&#8592; Prev</button>
      <span className={tabStyles.weekLabel}>{weekLabel(weekOffset)}</span>
      <button className={tabStyles.weekBtn} onClick={() => setWeekOffset(weekOffset + 1)}>Next &#8594;</button>
    </div>
  );

  return (
    <div>
      <div className={styles.rowBetween}>
        <h2 className={styles.heading}>Games</h2>
        <div className={tabStyles.controls}>
          <div className={tabStyles.sortToggle}>
            <button
              className={sortBy === 'datetime' ? tabStyles.sortActive : tabStyles.sortBtn}
              onClick={() => setSortBy('datetime')}
            >
              By Date &amp; Time
            </button>
            <button
              className={sortBy === 'calendar' ? tabStyles.sortActive : tabStyles.sortBtn}
              onClick={() => setSortBy('calendar')}
            >
              By Calendar
            </button>
          </div>
          <button className={styles.btnPrimary} onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh Calendar'}
          </button>
          <button className={styles.btnGhost} onClick={reparse} disabled={reparsing}>
            {reparsing ? 'Reparsing…' : 'Reparse Titles'}
          </button>
        </div>
      </div>
      <p className={styles.hint}>
        Game times are pulled from Google Calendar. Assign team names and locker rooms here.
      </p>

      {sortBy === 'datetime' && weekNav}

      {groups.map((group, gi) => (
        <div key={gi} className={tabStyles.group}>
          {group.label && <div className={tabStyles.groupHeader}>{group.label}</div>}
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Away Team</th><th>Home Team</th>
                <th>Away Locker</th><th>Home Locker</th>
                <th>Title</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {group.subgroups.map((sub, si) => (
                <React.Fragment key={si}>
                  {sub.label && (
                    <tr>
                      <td colSpan={7} className={tabStyles.calSubHeaderRow}>{sub.label}</td>
                    </tr>
                  )}
                  {sub.games.map(renderRow)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {sortBy === 'datetime' && groups.length === 0 && (
        <p className={styles.muted}>No games this week.</p>
      )}
      {sortBy === 'datetime' && weekNav}
      {sortBy === 'calendar' && gamesList.length === 0 && (
        <p className={styles.muted}>No games found. Add a calendar in the Calendars tab, then click Refresh Calendar.</p>
      )}
    </div>
  );
}
