import React, { useRef, useState } from 'react';
import { useApi, apiFetch, getToken } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import bgStyles from './BackgroundsTab.module.css';

function ImageCard({ b, onTypeChange, onDelete, onLabelSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = React.useRef(null);

  function startEdit() {
    setDraft(b.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    if (draft.trim()) onLabelSave(b.id, draft.trim());
    setEditing(false);
  }

  function cancel() { setEditing(false); }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') cancel();
  }

  return (
    <div className={bgStyles.card}>
      <div className={bgStyles.thumb} style={{ backgroundImage: `url(/uploads/${b.filename})` }} />
      <div className={bgStyles.cardFooter}>
        {editing ? (
          <div className={bgStyles.labelEditRow}>
            <input
              ref={inputRef}
              className={bgStyles.labelInput}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className={bgStyles.iconBtn} onClick={commit} title="Save">✓</button>
            <button className={bgStyles.iconBtn} onClick={cancel} title="Cancel">✕</button>
          </div>
        ) : (
          <div className={bgStyles.labelRow}>
            <span className={bgStyles.label} title={b.label}>{b.label}</span>
            <button className={bgStyles.iconBtn} onClick={startEdit} title="Edit label">✏</button>
          </div>
        )}
        <div className={bgStyles.cardActions}>
          <div className={bgStyles.typeToggle}>
            <button
              className={(b.image_type || 'background') === 'background' ? bgStyles.typeActive : bgStyles.typeBtn}
              onClick={() => onTypeChange(b.id, 'background')}
            >BG</button>
            <button
              className={(b.image_type || 'background') === 'general' ? bgStyles.typeActive : bgStyles.typeBtn}
              onClick={() => onTypeChange(b.id, 'general')}
            >IMG</button>
          </div>
          <button className={styles.btnDanger} onClick={() => onDelete(b.id)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function ImageGrid({ images, onTypeChange, onDelete, onLabelSave }) {
  if (!images || images.length === 0) return null;
  return (
    <div className={bgStyles.grid}>
      {images.map((b) => (
        <ImageCard key={b.id} b={b} onTypeChange={onTypeChange} onDelete={onDelete} onLabelSave={onLabelSave} />
      ))}
    </div>
  );
}

export default function BackgroundsTab() {
  const { data: backgrounds, reload } = useApi('/backgrounds');
  const [label, setLabel] = useState('');
  const [uploadType, setUploadType] = useState('background');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const bgImages = (backgrounds || []).filter((b) => (b.image_type || 'background') === 'background');
  const generalImages = (backgrounds || []).filter((b) => b.image_type === 'general');

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', label || file.name);
    fd.append('image_type', uploadType);
    await fetch('/api/backgrounds', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${getToken()}` } });
    setLabel('');
    fileRef.current.value = '';
    setUploading(false);
    reload();
  }

  async function changeType(id, image_type) {
    await apiFetch(`/backgrounds/${id}`, { method: 'PATCH', body: JSON.stringify({ image_type }) });
    reload();
  }

  async function saveLabel(id, label) {
    await apiFetch(`/backgrounds/${id}`, { method: 'PATCH', body: JSON.stringify({ label }) });
    reload();
  }

  async function deleteBackground(id) {
    if (!confirm('Delete this image?')) return;
    await apiFetch(`/backgrounds/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div>
      <h2 className={styles.heading}>Images</h2>

      <form onSubmit={upload} className={styles.addForm}>
        <input ref={fileRef} type="file" accept="image/*" required />
        <input
          className={styles.input}
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className={bgStyles.typeToggle}>
          <button
            type="button"
            className={uploadType === 'background' ? bgStyles.typeActive : bgStyles.typeBtn}
            onClick={() => setUploadType('background')}
          >Background</button>
          <button
            type="button"
            className={uploadType === 'general' ? bgStyles.typeActive : bgStyles.typeBtn}
            onClick={() => setUploadType('general')}
          >General</button>
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      <div className={bgStyles.sectionHeading}>Backgrounds</div>
      {bgImages.length === 0
        ? <p className={styles.muted}>No background images uploaded yet.</p>
        : <ImageGrid images={bgImages} onTypeChange={changeType} onDelete={deleteBackground} onLabelSave={saveLabel} />}

      <div className={bgStyles.sectionHeading}>General Images</div>
      {generalImages.length === 0
        ? <p className={styles.muted}>No general images uploaded yet.</p>
        : <ImageGrid images={generalImages} onTypeChange={changeType} onDelete={deleteBackground} onLabelSave={saveLabel} />}
    </div>
  );
}
