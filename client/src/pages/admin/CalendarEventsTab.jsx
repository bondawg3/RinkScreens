import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tabStyles from './GamesTab.module.css';
import ScreensSection from './ScreensSection';
import WeekNav from './WeekNav';
import { fmtTime, dayLabel, getWeekBounds } from '../../utils/date';

// Week-by-week read-only event listing shared by the Rink Events and Figure
// Skating tabs — same layout, different calendar type and screens section.
export default function CalendarEventsTab({ endpoint, heading, hint, emptyLabel, displayType, calendarType }) {
  const { data: events, reload } = useApi(endpoint);
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

  // Group by day, then by calendar
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

  return (
    <div>
      <ScreensSection displayType={displayType} calendarType={calendarType} />
      <div className={styles.rowBetween}>
        <h2 className={styles.heading}>{heading}</h2>
        <button className={styles.btnPrimary} onClick={forceRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Calendar'}
        </button>
      </div>
      <p className={styles.hint}>{hint}</p>

      <WeekNav offset={weekOffset} onChange={setWeekOffset} />

      {dayOrder.length === 0 && (
        <p className={styles.muted}>No {emptyLabel} this week.</p>
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
                        <td className={styles.nowrap}>{fmtTime(ev.start_time)}</td>
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

      <WeekNav offset={weekOffset} onChange={setWeekOffset} />
    </div>
  );
}
