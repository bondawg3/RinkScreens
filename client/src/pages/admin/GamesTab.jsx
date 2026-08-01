import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tabStyles from './GamesTab.module.css';
import ScreensSection from './ScreensSection';
import WeekNav from './WeekNav';
import { fmtTime, fmtShortDate, dayLabel, getWeekBounds, localDateStr } from '../../utils/date';

export default function GamesTab() {
  const { data: games, reload } = useApi('/games');
  const { data: calendars } = useApi('/calendars');
  const { data: lockerRooms } = useApi('/locker-rooms');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignMsg, setAutoAssignMsg] = useState(null);
  const [sortBy, setSortBy] = useState('datetime');
  const [weekOffset, setWeekOffset] = useState(0);
  const [hiddenCalIds, setHiddenCalIds] = useState([]);

  function toggleCalendar(id) {
    setHiddenCalIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }

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

  async function runAutoAssign({ date, reset } = {}) {
    setAutoAssigning(true);
    setAutoAssignMsg(null);
    try {
      const result = await apiFetch('/games/auto-assign', {
        method: 'POST',
        body: JSON.stringify({ date, reset }),
      });
      reload();
      let msg = `Auto-assigned ${result.assigned} game${result.assigned !== 1 ? 's' : ''}.`;
      const hasConflicts = result.conflicts && result.conflicts.length > 0;
      if (hasConflicts) {
        const dates = [...new Set(result.conflicts.map((c) => fmtShortDate(c.start_time)))];
        msg += ` ⚠ ${result.conflicts.length} locker room conflict${result.conflicts.length !== 1 ? 's' : ''} detected on: ${dates.join(', ')}.`;
      }
      setAutoAssignMsg({ text: msg, isWarning: hasConflicts });
    } catch (err) {
      setAutoAssignMsg({ text: `Error: ${err.message}`, isWarning: true });
    }
    setAutoAssigning(false);
  }

  async function saveGame(id) {
    await apiFetch(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
    setEditing(null);
    reload();
  }

  async function deleteGame(game) {
    if (!confirm(`Delete "${game.title || game.raw_title || 'this game'}" at ${fmtTime(game.start_time)}?`)) return;
    await apiFetch(`/games/${game.id}`, { method: 'DELETE' });
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
        const firstGame = day.byCal[day.calOrder[0]][0];
        const dateStr = localDateStr(new Date(firstGame.start_time));
        return {
          label: day.label,
          dateStr,
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
      if (hiddenCalIds.includes(key)) continue;
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
  const hockeyCalendars = (calendars || []).filter((c) => c.type === 'hockey_games');

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
        <td className={styles.nowrap}>{fmtTime(g.start_time)}</td>
        {editing === g.id ? (
          <>
            <td>{g.title}</td>
            <td><input className={styles.input} value={editData.home_team} onChange={(e) => setEditData({ ...editData, home_team: e.target.value })} placeholder="Home" /></td>
            <td>{lockerSelect(g, 'home_locker')}</td>
            <td><input className={styles.input} value={editData.away_team} onChange={(e) => setEditData({ ...editData, away_team: e.target.value })} placeholder="Away" /></td>
            <td>{lockerSelect(g, 'away_locker')}</td>
            <td className={styles.actions}>
              <button className={styles.btnPrimary} onClick={() => saveGame(g.id)}>Save</button>
              <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            </td>
          </>
        ) : (
          <>
            <td>{g.title}</td>
            <td>{g.home_team || <span className={styles.muted}>—</span>}</td>
            <td>{lockerSelect(g, 'home_locker')}</td>
            <td>{g.away_team || <span className={styles.muted}>—</span>}</td>
            <td>{lockerSelect(g, 'away_locker')}</td>
            <td className={styles.actions}>
              <button className={styles.btnGhost} onClick={() => startEdit(g)}>Edit</button>
              <button className={styles.btnDanger} onClick={() => deleteGame(g)} title="Delete game" style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}>🗑</button>
            </td>
          </>
        )}
      </tr>
    );
  }

  const weekNav = <WeekNav offset={weekOffset} onChange={setWeekOffset} />;

  return (
    <div>
      <ScreensSection displayType="games" calendarType="hockey_games" />
      <div className={styles.rowBetween}>
        <h2 className={styles.heading}>Hockey</h2>
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
          <button className={styles.btnGhost} onClick={() => runAutoAssign({ reset: true })} disabled={autoAssigning}>
            {autoAssigning ? 'Assigning…' : 'Reset Auto-Assign LRs'}
          </button>
        </div>
      </div>
      {autoAssignMsg && (
        <div style={{
          marginBottom: '0.75rem',
          padding: '0.5rem 0.75rem',
          borderRadius: 6,
          background: autoAssignMsg.isWarning ? '#fff3cd' : '#d4edda',
          color: autoAssignMsg.isWarning ? '#856404' : '#155724',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span style={{ flex: 1 }}>{autoAssignMsg.text}</span>
          <button onClick={() => setAutoAssignMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit', padding: 0 }}>✕</button>
        </div>
      )}
      <p className={styles.hint}>
        Game times are pulled from Google Calendar. Assign team names and locker rooms here.
      </p>

      {sortBy === 'datetime' && weekNav}

      {sortBy === 'calendar' && hockeyCalendars.length > 1 && (
        <div className={tabStyles.calFilterRow}>
          {hockeyCalendars.map((c) => (
            <label key={c.id} className={tabStyles.calFilterItem}>
              <input
                type="checkbox"
                checked={!hiddenCalIds.includes(String(c.id))}
                onChange={() => toggleCalendar(String(c.id))}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}

      {groups.map((group, gi) => (
        <div key={gi} className={tabStyles.group}>
          {group.label && (
            <div className={tabStyles.groupHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{group.label}</span>
              {group.dateStr && (
                <button
                  className={styles.btnGhost}
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', marginLeft: '0.75rem', flexShrink: 0 }}
                  onClick={() => runAutoAssign({ date: group.dateStr, reset: true })}
                  disabled={autoAssigning}
                >
                  Reset Auto-Assign LRs
                </button>
              )}
            </div>
          )}
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Title</th>
                <th>Home Team</th><th>Home Locker</th>
                <th>Away Team</th><th>Away Locker</th>
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
