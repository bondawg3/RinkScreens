import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';
import Thumbnail from './Thumbnail';
import { SCREEN_TYPES } from './ScreenPalette';

export default function DisplaysTab() {
  const { data: displays, reload } = useApi('/displays');
  const { data: screens } = useApi('/screens');
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function saveDisplay(id) {
    try {
      await apiFetch(`/displays/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
      setEditing(null);
      reload();
    } catch (ex) { setErr(ex.message); }
  }

  async function assignScreen(displayId, screenId) {
    await apiFetch(`/displays/${displayId}`, {
      method: 'PATCH',
      body: JSON.stringify({ screen_id: screenId || null }),
    });
    reload();
  }

  async function deleteDisplay(id) {
    if (!confirm('Remove this display?')) return;
    await apiFetch(`/displays/${id}`, { method: 'DELETE' });
    reload();
  }

  function startEdit(display) {
    setEditing(display.id);
    setEditData({ name: display.name, ip: display.ip });
    setErr('');
  }

  function screenLabel(screen) {
    const typeLabel = SCREEN_TYPES.find((d) => d.value === screen.display_type)?.label || screen.display_type;
    return `${screen.name} (${typeLabel})`;
  }

  return (
    <div>
      <h2 className={styles.heading}>Displays</h2>

      <div className={tStyles.grid}>
        {(displays || []).map((d) => {
          const assignedScreen = (screens || []).find((sc) => sc.id === d.screen_id) || null;
          return (
            <div key={d.id} className={tStyles.card}>
              <Thumbnail screenId={assignedScreen?.id} />
              <div className={tStyles.cardBody}>
                <div className={tStyles.cardName}>{d.name}</div>
                <div className={tStyles.cardMeta}>
                  <span>{d.ip}</span>
                  <span className={d.online ? styles.online : styles.offline}>
                    {d.online ? '● Online' : '● Offline'}
                  </span>
                </div>

                <div style={{ marginTop: '0.4rem' }}>
                  <label className={styles.label} style={{ marginBottom: '0.2rem', display: 'block' }}>Screen</label>
                  <select
                    className={styles.select}
                    style={{ width: '100%', maxWidth: '100%' }}
                    value={d.screen_id ?? ''}
                    onChange={(e) => assignScreen(d.id, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— None —</option>
                    {(screens || [])
                      .filter((sc) => sc.visible !== false || sc.id === d.screen_id)
                      .map((sc) => (
                        <option key={sc.id} value={sc.id}>{screenLabel(sc)}</option>
                      ))}
                  </select>
                </div>

                <div className={tStyles.cardActions}>
                  {assignedScreen && (
                    <a href={`/tv/${d.id}?preview`} target="_blank" rel="noreferrer" className={styles.btnGhost} title="Preview">📺</a>
                  )}
                  <button className={styles.btnGhost} onClick={() => navigate(`/admin/displays/${d.id}/schedule`)} title="Schedule">📅</button>
                  <button className={styles.btnGhost} onClick={() => startEdit(d)}>Edit</button>
                  <button className={styles.btnDanger} onClick={() => deleteDisplay(d.id)}>Remove</button>
                </div>
              </div>
            </div>
          );
        })}
        {displays && displays.length === 0 && (
          <p className={styles.muted}>No displays added yet. Add displays in Settings.</p>
        )}
      </div>

      <h2 className={styles.heading} style={{ marginTop: '2.5rem' }}>Available Screens</h2>
      <div className={tStyles.grid}>
        {(screens || []).filter((sc) => sc.visible !== false).map((sc) => {
          const typeLabel = SCREEN_TYPES.find((d) => d.value === sc.display_type)?.label || sc.display_type;
          const assignedTo = (displays || []).filter((d) => d.screen_id === sc.id).map((d) => d.name);
          return (
            <div key={sc.id} className={tStyles.card}>
              <Thumbnail screenId={sc.id} />
              <div className={tStyles.cardBody}>
                <div className={tStyles.cardName}>{sc.name}</div>
                <div className={tStyles.cardMeta}>
                  <span>{typeLabel}</span>
                  {assignedTo.length > 0
                    ? <span className={styles.online}>● {assignedTo.join(', ')}</span>
                    : <span className={styles.offline}>● Unassigned</span>}
                </div>
                <div className={tStyles.cardActions}>
                  <a href={`/tv/screen/${sc.id}`} target="_blank" rel="noreferrer" className={styles.btnGhost} title="Preview">📺</a>
                </div>
              </div>
            </div>
          );
        })}
        {screens && screens.length === 0 && (
          <p className={styles.muted}>No screens configured yet.</p>
        )}
      </div>

      {editing && (
        <div className={tStyles.modalBackdrop} onClick={() => setEditing(null)}>
          <div className={tStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={tStyles.modalTitle}>Edit Display</div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
            <label className={styles.label}>IP Address</label>
            <input className={styles.input} value={editData.ip} onChange={(e) => setEditData({ ...editData, ip: e.target.value })} />
            {err && <span className={styles.error}>{err}</span>}
            <div className={tStyles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={() => saveDisplay(editing)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
