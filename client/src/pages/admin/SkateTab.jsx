import React from 'react';
import { useApi } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import ScreensSection from './ScreensSection';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SkateTab() {
  const { data: sessions } = useApi('/skate-sessions');

  return (
    <div>
      <ScreensSection displayType="skate" calendarType="public_skates" />
      <h2 className={styles.heading}>Public Skate</h2>
      <h3 className={styles.subheading}>Upcoming Sessions</h3>
      {(!sessions || sessions.length === 0) ? (
        <p className={styles.muted}>No upcoming sessions. Add a Public Skates calendar in the Calendars tab to pull sessions automatically.</p>
      ) : (
        <table className={styles.table}>
          <thead><tr><th>Date</th><th>Start</th><th>End</th><th>Title</th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.start_time)}</td>
                <td>{formatTime(s.start_time)}</td>
                <td>{s.end_time ? formatTime(s.end_time) : '—'}</td>
                <td>{s.title || <span className={styles.muted}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
