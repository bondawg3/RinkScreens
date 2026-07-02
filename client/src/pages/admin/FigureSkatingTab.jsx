import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tabStyles from './GamesTab.module.css';

function fmt(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getWeekBounds(offset) {
  const now = new Date();
  const day = now.getDay();
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

export default function FigureSkatingTab() {
  const { data: events, reload } = useApi('/figure-skating');
  const { data: calendars } = useApi('/calendars');
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  async function forceRefresh() {
    setRefreshing(true);
    await apiFetch('/games/refresh', { method: 'POST' });
    setTimeout(() => { reload(); setRefreshing(false); }, 2000);
  }

  const calMap = Object.fromEntries((calendars || []).map((c) => [c.id, c.name]));

  const { monday, sunday } = getWeekBounds(weekOffset);
  const filtered = (events || []).filter((e) => {
    const t = new Date(e.start_time);
    return t >= monday && t <= sunday;
  });

  const byDay = {};
  const dayOrder = [];
  for (const ev of filtered) {
    const dayKey = new Date(ev.start_time).toDateString();
    if (!byDay[dayKey]) {
      byDay[dayKey] = { label: dayLabel(ev.start_time), byCal: {}, calOrder: [] };
      dayOrder.push(dayKey);
    }
    const calKey = ev.calendar_id ? String(ev.calendar_id) : '__none__';
    if (!byDay[dayKey].byCal[calKey]) {
      byDay[dayKey].byCal[calKey] = [];
      byDay[dayKey].calOrder.push(calKey);
    }
    byDay[dayKey].byCal[calKey].push(ev);
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
        <h2 className={styles.heading}>Figure Skating</h2>
        <button className={styles.btnPrimary} onClick={forceRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Calendar'}
        </button>
      </div>
      <p className={styles.hint}>
        Events pulled from Figure Skating calendars configured in the Calendars tab.
      </p>

      {weekNav}

      {dayOrder.length === 0 && (
        <p className={styles.muted}>No figure skating events this week.</p>
      )}

      {dayOrder.map((dayKey) => {
        const day = byDay[dayKey];
        return (
          <div key={dayKey} className={tabStyles.group}>
            <div className={tabStyles.groupHeader}>{day.label}</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {day.calOrder.map((calKey, si) => (
                  <React.Fragment key={si}>
                    <tr>
                      <td colSpan={2} className={tabStyles.calSubHeaderRow}>
                        {calKey === '__none__' ? 'Unassigned' : (calMap[calKey] || `Calendar ${calKey}`)}
                      </td>
                    </tr>
                    {day.byCal[calKey].map((ev) => (
                      <tr key={ev.id}>
                        <td className={styles.nowrap}>{fmt(ev.start_time)}</td>
                        <td>{ev.raw_title || ev.title}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {weekNav}
    </div>
  );
}
