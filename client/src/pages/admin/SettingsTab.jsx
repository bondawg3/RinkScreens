import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import calStyles from './CalendarModal.module.css';

const CALENDAR_TYPES = [
  { value: 'hockey_games', label: 'Hockey Games' },
  { value: 'public_skates', label: 'Public Skates' },
  { value: 'rink_events', label: 'Rink Events' },
];

const TYPE_LABELS = Object.fromEntries(CALENDAR_TYPES.map((t) => [t.value, t.label]));

function CalendarModal({ type, existing, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [interval, setInterval] = useState(String(existing?.poll_interval_minutes ?? '5'));
  const [teamOrder, setTeamOrder] = useState(existing?.team_order ?? 'away_home');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { name, url, poll_interval_minutes: Number(interval) };
      if (type === 'hockey_games') body.team_order = teamOrder;
      if (isEdit) {
        await apiFetch(`/calendars/${existing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/calendars', { method: 'POST', body: JSON.stringify({ ...body, type }) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={calStyles.backdrop} onClick={onClose}>
      <div className={calStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={calStyles.modalHeader}>
          <span>{isEdit ? 'Edit' : 'Add'} {TYPE_LABELS[type]} Calendar</span>
          <button className={calStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className={calStyles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label}>Calendar Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Hockey Schedule"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>iCal Link</label>
            <input
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Poll Interval (minutes)</label>
            <input
              className={styles.input}
              type="number"
              min="1"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              required
            />
          </div>
          {type === 'hockey_games' && (
            <div className={styles.field}>
              <label className={styles.label}>Team Order in Event Title</label>
              <div className={calStyles.teamOrderToggle}>
                <button
                  type="button"
                  className={teamOrder === 'away_home' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setTeamOrder('away_home')}
                >
                  Away vs. Home
                </button>
                <button
                  type="button"
                  className={teamOrder === 'home_away' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setTeamOrder('home_away')}
                >
                  Home vs. Away
                </button>
              </div>
              <span className={styles.hint} style={{ fontSize: '0.8rem' }}>
                {teamOrder === 'away_home'
                  ? 'First team listed = Away, second = Home'
                  : 'First team listed = Home, second = Away'}
              </span>
            </div>
          )}
          {error && <div className={styles.errorMsg}>{error}</div>}
          <div className={calStyles.modalFooter}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Validating…' : isEdit ? 'Save Changes' : 'Add Calendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CalendarsTab() {
  const { data: calendars, reload: reloadCalendars } = useApi('/calendars');
  const [modalType, setModalType] = useState(null);
  const [editingCal, setEditingCal] = useState(null);

  async function removeCalendar(id) {
    await apiFetch(`/calendars/${id}`, { method: 'DELETE' });
    reloadCalendars();
  }

  function openAdd(type) { setEditingCal(null); setModalType(type); }
  function openEdit(cal) { setEditingCal(cal); setModalType(cal.type); }

  const byType = (type) => (calendars || []).filter((c) => c.type === type);

  return (
    <div>
      <h2 className={styles.heading}>Calendars</h2>

      {CALENDAR_TYPES.map(({ value, label }) => (
        <div key={value} className={calStyles.calSection}>
          <div className={calStyles.calSectionHeader}>
            <span>{label}</span>
            <button className={styles.btnPrimary} onClick={() => openAdd(value)}>
              + Add {label} Calendar
            </button>
          </div>
          {byType(value).length === 0 ? (
            <p className={calStyles.empty}>No {label.toLowerCase()} calendars added yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>iCal URL</th>
                  <th>Poll (min)</th>
                  {value === 'hockey_games' && <th>Team Order</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byType(value).map((cal) => (
                  <tr key={cal.id}>
                    <td>{cal.name}</td>
                    <td className={`${styles.mono} ${calStyles.urlCell}`} title={cal.url}>
                      {cal.url.length > 60 ? cal.url.slice(0, 60) + '…' : cal.url}
                    </td>
                    <td>{cal.poll_interval_minutes}</td>
                    {value === 'hockey_games' && (
                      <td>{cal.team_order === 'home_away' ? 'Home vs. Away' : 'Away vs. Home'}</td>
                    )}
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.btnGhost} onClick={() => openEdit(cal)}>Edit</button>
                        <button className={styles.btnDanger} onClick={() => removeCalendar(cal.id)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {modalType && (
        <CalendarModal
          type={modalType}
          existing={editingCal}
          onClose={() => setModalType(null)}
          onSaved={reloadCalendars}
        />
      )}
    </div>
  );
}
