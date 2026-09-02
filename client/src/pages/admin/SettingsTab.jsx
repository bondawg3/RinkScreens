import React, { useState } from 'react';
import { ICONS } from '../../icons';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import calStyles from './CalendarModal.module.css';
import Modal from './Modal';

const CALENDAR_TYPES = [
  { value: 'hockey_games', label: 'Hockey' },
  { value: 'public_skates', label: 'Public Skates' },
  { value: 'rink_events', label: 'Rink Events' },
  { value: 'figure_skating', label: 'Figure Skating' },
];

const TYPE_LABELS = Object.fromEntries(CALENDAR_TYPES.map((t) => [t.value, t.label]));

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SyncStatus({ cal }) {
  if (!cal.last_sync_at) return <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Never synced</span>;
  if (cal.last_sync_error) {
    return (
      <span style={{ color: '#c0392b', fontSize: '0.78rem' }} title={cal.last_sync_error}>
        ✗ Failed {timeAgo(cal.last_sync_at)} — {cal.last_sync_error.length > 60 ? cal.last_sync_error.slice(0, 60) + '…' : cal.last_sync_error}
      </span>
    );
  }
  return (
    <span style={{ color: '#27ae60', fontSize: '0.78rem' }}>
      ✓ {timeAgo(cal.last_sync_at)}{cal.last_sync_count != null ? ` · ${cal.last_sync_count} events` : ''}
    </span>
  );
}

function inferUnit(minutes) {
  if (minutes && minutes % (24 * 60) === 0) return 'days';
  return 'minutes';
}

function CalendarModal({ type, existing, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const existingMins = existing?.poll_interval_minutes ?? 5;
  const initUnit = inferUnit(existingMins);
  const [intervalUnit, setIntervalUnit] = useState(initUnit);
  const [intervalVal, setIntervalVal] = useState(
    String(initUnit === 'days' ? existingMins / (24 * 60) : existingMins)
  );
  const [teamOrder, setTeamOrder] = useState(existing?.team_order ?? 'home_away');
  const [eventMode, setEventMode] = useState(existing?.event_mode ?? 'teams');
  const [seqId, setSeqId] = useState(existing?.locker_sequence_id ? String(existing.locker_sequence_id) : '');
  const { data: sequences } = useApi('/locker-sequences');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  function switchUnit(unit) {
    const cur = Number(intervalVal) || 1;
    if (unit === 'days' && intervalUnit === 'minutes') {
      setIntervalVal(String(Math.max(1, Math.round(cur / (24 * 60))) || 1));
    } else if (unit === 'minutes' && intervalUnit === 'days') {
      setIntervalVal(String(cur * 24 * 60));
    }
    setIntervalUnit(unit);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const mins = intervalUnit === 'days' ? Number(intervalVal) * 24 * 60 : Number(intervalVal);
    try {
      const body = { name, url, poll_interval_minutes: mins };
      if (type === 'hockey_games') {
        body.team_order = teamOrder;
        body.event_mode = eventMode;
        body.locker_sequence_id = seqId ? Number(seqId) : null;
      }
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
    <Modal
      onClose={onClose}
      title={`${isEdit ? 'Edit' : 'Add'} ${TYPE_LABELS[type]} Calendar`}
      closeButton
      onSubmit={submit}
      footer={<>
        <button type="button" className={styles.btnGhost} onClick={onClose}>Cancel</button>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Validating…' : isEdit ? 'Save Changes' : 'Add Calendar'}
        </button>
      </>}
    >
          <div className={styles.field}>
            <label className={styles.label}>Display Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Hockey Schedule"
              required
            />
          </div>
          {isEdit && (
            <div className={styles.field}>
              <label className={styles.label}>Calendar Name</label>
              <input className={`${styles.input} ${calStyles.disabledInput}`} value={existing?.cal_name || '—'} disabled />
              <span className={styles.hint} style={{ fontSize: '0.8rem' }}>
                Read from the iCal file's own title (X-WR-CALNAME), if present — helps identify which upstream calendar this link points to.
              </span>
            </div>
          )}
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
            <label className={styles.label}>Poll Interval</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                className={styles.input}
                type="number"
                min="1"
                style={{ width: '80px', marginBottom: 0 }}
                value={intervalVal}
                onChange={(e) => setIntervalVal(e.target.value)}
                required
              />
              <div className={calStyles.teamOrderToggle} style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={intervalUnit === 'minutes' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => switchUnit('minutes')}
                >
                  Minutes
                </button>
                <button
                  type="button"
                  className={intervalUnit === 'days' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => switchUnit('days')}
                >
                  Days
                </button>
              </div>
            </div>
          </div>
          {type === 'hockey_games' && sequences && sequences.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Locker Room Sequence</label>
              <select
                style={{ border: '1.5px solid var(--border)', borderRadius: 5, padding: '0.4rem 0.7rem', fontSize: '0.95rem', background: '#fff', width: 'fit-content' }}
                value={seqId}
                onChange={(e) => setSeqId(e.target.value)}
              >
                <option value="">— Use default —</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {type === 'hockey_games' && (
            <div className={styles.field}>
              <label className={styles.label}>Locker Room Assignments</label>
              <div className={calStyles.teamOrderToggle}>
                <button
                  type="button"
                  className={eventMode === 'teams' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setEventMode('teams')}
                >
                  Teams
                </button>
                <button
                  type="button"
                  className={eventMode === 'stick_shoot' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setEventMode('stick_shoot')}
                >
                  Stick & Shoot
                </button>
                <button
                  type="button"
                  className={eventMode === 'open' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setEventMode('open')}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={eventMode === 'practice' ? calStyles.teamOrderActive : calStyles.teamOrderBtn}
                  onClick={() => setEventMode('practice')}
                >
                  Practice
                </button>
              </div>
              <span className={styles.hint} style={{ fontSize: '0.8rem' }}>
                {eventMode === 'open'
                  ? 'Locker rooms will show "Open" instead of team names for this calendar\'s events'
                  : eventMode === 'stick_shoot'
                  ? 'Locker rooms will show "Youth" (Home) and "Adults" (Away) instead of team names for this calendar\'s events'
                  : eventMode === 'practice'
                  ? 'Locker rooms will show "Open" for this calendar\'s events; events sharing the same start time will be grouped onto one row with a single locker room assignment'
                  : 'Teams are parsed from the event title'}
              </span>
            </div>
          )}
          {type === 'hockey_games' && eventMode === 'teams' && (
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
    </Modal>
  );
}

export default function CalendarsTab() {
  const { data: calendars, reload: reloadCalendars } = useApi('/calendars');
  const [modalType, setModalType] = useState(null);
  const [editingCal, setEditingCal] = useState(null);
  const [syncing, setSyncing] = useState(null); // calId | 'all' | null

  async function removeCalendar(id) {
    await apiFetch(`/calendars/${id}`, { method: 'DELETE' });
    reloadCalendars();
  }

  async function syncAll() {
    setSyncing('all');
    try { await apiFetch('/games/refresh', { method: 'POST' }); } finally { setSyncing(null); }
  }

  async function syncCalendar(id) {
    setSyncing(id);
    try { await apiFetch(`/calendars/${id}/sync`, { method: 'POST' }); } finally { setSyncing(null); }
  }

  function openAdd(type) { setEditingCal(null); setModalType(type); }
  function openEdit(cal) { setEditingCal(cal); setModalType(cal.type); }

  const byType = (type) => (calendars || []).filter((c) => c.type === type);
  const syncableTypes = new Set(['hockey_games', 'rink_events', 'figure_skating', 'public_skates']);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h2 className={styles.heading} style={{ margin: 0 }}>Calendars</h2>
        <button className={styles.btnGhost} onClick={syncAll} disabled={syncing === 'all'}>
          {syncing === 'all' ? 'Syncing…' : '↻ Sync All'}
        </button>
      </div>

      {CALENDAR_TYPES.map(({ value, label }) => (
        <div key={value} className={calStyles.calSection}>
          <div className={calStyles.calSectionHeader}>
            <span>{label}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {syncableTypes.has(value) && byType(value).length > 0 && (
                <button
                  className={styles.btnGhost}
                  onClick={() => Promise.all(byType(value).map((c) => syncCalendar(c.id)))}
                  disabled={!!syncing}
                >
                  {syncing && byType(value).some((c) => c.id === syncing) ? 'Syncing…' : `↻ Sync ${label}`}
                </button>
              )}
              <button className={styles.btnPrimary} onClick={() => openAdd(value)}>
                + Add {label} Calendar
              </button>
            </div>
          </div>
          {byType(value).length === 0 ? (
            <p className={calStyles.empty}>No {label.toLowerCase()} calendars added yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Display Name</th>
                  <th>Poll Interval</th>
                  {value === 'hockey_games' && <th>Event Type</th>}
                  <th>Last Sync</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byType(value).map((cal) => (
                  <tr key={cal.id}>
                    <td>{cal.name}</td>
                    <td>{cal.poll_interval_minutes % (24 * 60) === 0 ? `${cal.poll_interval_minutes / (24 * 60)}d` : `${cal.poll_interval_minutes}m`}</td>
                    {value === 'hockey_games' && (
                      <td>{cal.event_mode === 'open' ? 'Open' : cal.event_mode === 'stick_shoot' ? 'Stick & Shoot' : cal.event_mode === 'practice' ? 'Practice' : (cal.team_order === 'home_away' ? 'Home vs. Away' : 'Away vs. Home')}</td>
                    )}
                    <td><SyncStatus cal={cal} /></td>
                    <td>
                      <div className={styles.actions}>
                        {syncableTypes.has(value) && (
                          <button className={calStyles.iconBtn} title="Sync" onClick={() => syncCalendar(cal.id)} disabled={!!syncing}>
                            {syncing === cal.id ? '…' : '↻'}
                          </button>
                        )}
                        <button className={calStyles.iconBtn} title="Edit" onClick={() => openEdit(cal)}>{ICONS.edit}</button>
                        <button className={calStyles.iconBtnDanger} title="Remove" onClick={() => removeCalendar(cal.id)}>{ICONS.remove}</button>
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
