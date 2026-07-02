import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';

const DISPLAY_TYPES = [
  { value: 'games', label: 'Game Board' },
  { value: 'rink_events', label: 'Rink Events' },
  { value: 'figure_skating', label: 'Figure Skating' },
  { value: 'skate', label: 'Public Skate' },
  { value: 'webpage', label: 'Webpage' },
  { value: 'message', label: 'Custom Message' },
];

function Thumbnail({ screenId }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    if (!wrapRef.current) return;
    const w = wrapRef.current.offsetWidth;
    setScale(w / 1920);
  }, []);

  return (
    <div className={tStyles.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale }}>
      <iframe src={`/tv/${screenId}`} title={`Screen ${screenId}`} scrolling="no" />
    </div>
  );
}

export default function ScreensTab() {
  const { data: screens, reload } = useApi('/screens');
  const { data: backgrounds } = useApi('/backgrounds');
  const [form, setForm] = useState({ name: '', ip: '', display_type: 'games' });
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [err, setErr] = useState('');

  async function addScreen(e) {
    e.preventDefault();
    setErr('');
    try {
      await apiFetch('/screens', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', ip: '', display_type: 'games' });
      reload();
    } catch (ex) { setErr(ex.message); }
  }

  async function saveScreen(id) {
    try {
      await apiFetch(`/screens/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
      setEditing(null);
      reload();
    } catch (ex) { setErr(ex.message); }
  }

  async function deleteScreen(id) {
    if (!confirm('Remove this screen?')) return;
    await apiFetch(`/screens/${id}`, { method: 'DELETE' });
    reload();
  }

  function startEdit(screen) {
    setEditing(screen.id);
    setEditData({
      name: screen.name,
      ip: screen.ip,
      display_type: screen.display_type,
      background_id: screen.background_id ?? '',
      webpage_url: screen.webpage_url || '',
      webpage_width: screen.webpage_width ?? 100,
      webpage_zoom: screen.webpage_zoom ?? 100,
      webpage_refresh: screen.webpage_refresh ?? 0,
    });
  }

  const editingScreen = editing && (screens || []).find((s) => s.id === editing);

  return (
    <div>
      <h2 className={styles.heading}>Screens</h2>

      <form onSubmit={addScreen} className={styles.addForm}>
        <input
          className={styles.input}
          placeholder="Screen name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className={styles.input}
          placeholder="IP address (e.g. 192.168.1.50)"
          value={form.ip}
          onChange={(e) => setForm({ ...form, ip: e.target.value })}
          required
        />
        <select
          className={styles.select}
          value={form.display_type}
          onChange={(e) => setForm({ ...form, display_type: e.target.value })}
        >
          {DISPLAY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button className={styles.btnPrimary} type="submit">Add Screen</button>
        {err && <span className={styles.error}>{err}</span>}
      </form>

      <div className={tStyles.grid}>
        {(screens || []).map((s) => (
          <div key={s.id} className={tStyles.card}>
            <Thumbnail screenId={s.id} />
            <div className={tStyles.cardBody}>
              <div className={tStyles.cardName}>{s.name}</div>
              <div className={tStyles.cardMeta}>
                <span>{DISPLAY_TYPES.find((d) => d.value === s.display_type)?.label || s.display_type}</span>
                <span className={s.online ? styles.online : styles.offline}>
                  {s.online ? '● Online' : '● Offline'}
                </span>
              </div>
              <div className={tStyles.cardActions}>
                <a href={`/tv/${s.id}`} target="_blank" rel="noreferrer" className={styles.btnGhost}>Preview</a>
                <button className={styles.btnGhost} onClick={() => startEdit(s)}>Edit</button>
                <button className={styles.btnDanger} onClick={() => deleteScreen(s.id)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
        {screens && screens.length === 0 && (
          <p className={styles.muted}>No screens added yet.</p>
        )}
      </div>

      {editing && editingScreen && (
        <div className={tStyles.modalBackdrop} onClick={() => setEditing(null)}>
          <div className={tStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={tStyles.modalTitle}>Edit — {editingScreen.name}</div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
            <label className={styles.label}>IP Address</label>
            <input className={styles.input} value={editData.ip} onChange={(e) => setEditData({ ...editData, ip: e.target.value })} />
            <label className={styles.label}>Display Type</label>
            <select className={styles.select} value={editData.display_type} onChange={(e) => setEditData({ ...editData, display_type: e.target.value })}>
              {DISPLAY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {editData.display_type === 'webpage' && (
              <>
                <label className={styles.label}>Webpage URL</label>
                <input
                  className={styles.input}
                  placeholder="https://example.com"
                  value={editData.webpage_url || ''}
                  onChange={(e) => setEditData({ ...editData, webpage_url: e.target.value })}
                />
                <label className={styles.label}>Width — {editData.webpage_width ?? 100}%</label>
                <input
                  type="range" min="10" max="100" step="5"
                  value={editData.webpage_width ?? 100}
                  onChange={(e) => setEditData({ ...editData, webpage_width: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
                <label className={styles.label}>Zoom — {editData.webpage_zoom ?? 100}%</label>
                <input
                  type="range" min="25" max="300" step="5"
                  value={editData.webpage_zoom ?? 100}
                  onChange={(e) => setEditData({ ...editData, webpage_zoom: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
                <label className={styles.label}>
                  Refresh Interval — {(editData.webpage_refresh ?? 0) === 0 ? 'Off' : `Every ${editData.webpage_refresh} min`}
                </label>
                <input
                  type="range" min="0" max="60" step="1"
                  value={editData.webpage_refresh ?? 0}
                  onChange={(e) => setEditData({ ...editData, webpage_refresh: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </>
            )}
            <label className={styles.label}>Background</label>
            <select className={styles.select} value={editData.background_id ?? ''} onChange={(e) => setEditData({ ...editData, background_id: e.target.value || null })}>
              <option value="">None</option>
              {(backgrounds || []).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            {err && <span className={styles.error}>{err}</span>}
            <div className={tStyles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={() => saveScreen(editing)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
