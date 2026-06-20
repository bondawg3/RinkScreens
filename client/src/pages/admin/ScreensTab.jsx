import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';

const DISPLAY_TYPES = [
  { value: 'games', label: 'Game Board' },
  { value: 'skate', label: 'Public Skate' },
  { value: 'message', label: 'Custom Message' },
];

export default function ScreensTab() {
  const { data: screens, reload } = useApi('/screens');
  const { data: backgrounds } = useApi('/backgrounds');
  const [form, setForm] = useState({ name: '', ip: '', display_type: 'games' });
  const [editing, setEditing] = useState(null); // screenId being edited
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
    });
  }

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

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th><th>IP</th><th>Display</th><th>Background</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(screens || []).map((s) => (
            <tr key={s.id}>
              {editing === s.id ? (
                <>
                  <td><input className={styles.input} value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} /></td>
                  <td><input className={styles.input} value={editData.ip} onChange={(e) => setEditData({ ...editData, ip: e.target.value })} /></td>
                  <td>
                    <select className={styles.select} value={editData.display_type} onChange={(e) => setEditData({ ...editData, display_type: e.target.value })}>
                      {DISPLAY_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className={styles.select} value={editData.background_id ?? ''} onChange={(e) => setEditData({ ...editData, background_id: e.target.value || null })}>
                      <option value="">None</option>
                      {(backgrounds || []).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </td>
                  <td></td>
                  <td className={styles.actions}>
                    <button className={styles.btnPrimary} onClick={() => saveScreen(s.id)}>Save</button>
                    <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{s.name}</td>
                  <td className={styles.mono}>{s.ip}</td>
                  <td>{DISPLAY_TYPES.find((d) => d.value === s.display_type)?.label || s.display_type}</td>
                  <td>{s.bg_label || <span className={styles.muted}>None</span>}</td>
                  <td>
                    <span className={s.online ? styles.online : styles.offline}>
                      {s.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <a href={`/tv/${s.id}`} target="_blank" rel="noreferrer" className={styles.btnGhost}>Preview</a>
                    <button className={styles.btnGhost} onClick={() => startEdit(s)}>Edit</button>
                    <button className={styles.btnDanger} onClick={() => deleteScreen(s.id)}>Remove</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {screens && screens.length === 0 && (
            <tr><td colSpan={6} className={styles.muted}>No screens added yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
