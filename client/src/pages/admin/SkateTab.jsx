import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
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
  const { data: prices, reload } = useApi('/skate-prices');
  const [form, setForm] = useState({ label: '', subheading: '', price: '', sort_order: '' });
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});

  async function addPrice(e) {
    e.preventDefault();
    await apiFetch('/skate-prices', { method: 'POST', body: JSON.stringify(form) });
    setForm({ label: '', subheading: '', price: '', sort_order: '' });
    reload();
  }

  async function savePrice(id) {
    await apiFetch(`/skate-prices/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
    setEditing(null);
    reload();
  }

  async function deletePrice(id) {
    await apiFetch(`/skate-prices/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div>
      <ScreensSection displayType="skate" calendarType="public_skates" />
      <h2 className={styles.heading}>Public Skate</h2>
      <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start' }}>

        {/* Sessions panel */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
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

        {/* Pricing panel */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <h3 className={styles.subheading}>Pricing</h3>
          <p className={styles.hint}>
            Shown on the Public Skate TV display alongside upcoming sessions.
          </p>

      <form onSubmit={addPrice} className={styles.addForm}>
        <input className={styles.input} placeholder="Label (e.g. Adult)" value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} required />
        <input className={styles.input} placeholder="Subheading (e.g. 18+)" value={form.subheading}
          onChange={(e) => setForm({ ...form, subheading: e.target.value })} />
        <input className={styles.input} placeholder="Price (e.g. $8.00)" value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        <input className={styles.input} placeholder="Sort order" type="number" value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: e.target.value })} style={{ width: 120 }} />
        <button className={styles.btnPrimary} type="submit">Add</button>
      </form>

      <table className={styles.table}>
        <thead>
          <tr><th>Label</th><th>Subheading</th><th>Price</th><th>Sort</th><th></th></tr>
        </thead>
        <tbody>
          {(prices || []).map((p) => (
            <tr key={p.id}>
              {editing === p.id ? (
                <>
                  <td><input className={styles.input} value={editData.label} onChange={(e) => setEditData({ ...editData, label: e.target.value })} /></td>
                  <td><input className={styles.input} value={editData.subheading || ''} onChange={(e) => setEditData({ ...editData, subheading: e.target.value })} /></td>
                  <td><input className={styles.input} value={editData.price} onChange={(e) => setEditData({ ...editData, price: e.target.value })} /></td>
                  <td><input className={styles.input} type="number" value={editData.sort_order} onChange={(e) => setEditData({ ...editData, sort_order: e.target.value })} style={{ width: 80 }} /></td>
                  <td className={styles.actions}>
                    <button className={styles.btnPrimary} onClick={() => savePrice(p.id)}>Save</button>
                    <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{p.label}</td>
                  <td>{p.subheading || <span className={styles.muted}>—</span>}</td>
                  <td>{p.price}</td>
                  <td>{p.sort_order}</td>
                  <td className={styles.actions}>
                    <button className={styles.btnGhost} onClick={() => { setEditing(p.id); setEditData({ label: p.label, subheading: p.subheading || '', price: p.price, sort_order: p.sort_order }); }}>Edit</button>
                    <button className={styles.btnDanger} onClick={() => deletePrice(p.id)}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {prices && prices.length === 0 && <tr><td colSpan={5} className={styles.muted}>No prices yet.</td></tr>}
        </tbody>
      </table>
        </div>{/* end pricing panel */}
      </div>{/* end flex row */}
    </div>
  );
}
