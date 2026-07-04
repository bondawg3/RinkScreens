import React, { useEffect, useState } from 'react';
import styles from './PublicSkate.module.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function PublicSkate() {
  const [sessions, setSessions] = useState([]);
  const [prices, setPrices] = useState([]);

  async function load() {
    try {
      const [sessionsRes, pricesRes] = await Promise.all([
        fetch('/api/skate-sessions'),
        fetch('/api/skate-prices'),
      ]);
      setSessions(await sessionsRes.json());
      setPrices(await pricesRes.json());
    } catch (_) {}
  }

  useEffect(() => { load(); }, []);
  PublicSkate.reload = load;

  return (
    <div className={styles.layout}>
      <div className={styles.sessions}>
        <h2 className={styles.sectionTitle}>Upcoming Sessions</h2>
        {sessions.length === 0 ? (
          <p className={styles.none}>No upcoming sessions scheduled</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className={styles.sessionCard}>
              <div className={styles.sessionDate}>{formatDate(s.start_time)}</div>
              <div className={styles.sessionTime}>
                {formatTime(s.start_time)} – {formatTime(s.end_time)}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Admission</h2>
        {prices.length === 0 ? (
          <p className={styles.none}>Pricing not configured</p>
        ) : (
          <table className={styles.priceTable}>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id}>
                  <td className={styles.priceLabel}>{p.label}</td>
                  <td className={styles.priceAmount}>{p.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
