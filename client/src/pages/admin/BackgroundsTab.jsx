import React, { useRef, useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import bgStyles from './BackgroundsTab.module.css';

export default function BackgroundsTab() {
  const { data: backgrounds, reload } = useApi('/backgrounds');
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || file.name);
    await fetch('/api/backgrounds', { method: 'POST', body: fd });
    setLabel('');
    fileRef.current.value = '';
    setUploading(false);
    reload();
  }

  async function deleteBackground(id) {
    if (!confirm('Delete this background?')) return;
    await apiFetch(`/backgrounds/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div>
      <h2 className={styles.heading}>Backgrounds</h2>

      <form onSubmit={upload} className={styles.addForm}>
        <input ref={fileRef} type="file" accept="image/*" required />
        <input className={styles.input} placeholder="Label (optional)" value={label}
          onChange={(e) => setLabel(e.target.value)} />
        <button className={styles.btnPrimary} type="submit" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      <div className={bgStyles.grid}>
        {(backgrounds || []).map((b) => (
          <div key={b.id} className={bgStyles.card}>
            <div className={bgStyles.thumb} style={{ backgroundImage: `url(/uploads/${b.filename})` }} />
            <div className={bgStyles.cardFooter}>
              <span className={bgStyles.label}>{b.label}</span>
              <button className={styles.btnDanger} onClick={() => deleteBackground(b.id)}>Delete</button>
            </div>
          </div>
        ))}
        {backgrounds && backgrounds.length === 0 && (
          <p className={styles.muted}>No backgrounds uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
