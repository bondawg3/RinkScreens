import React, { useEffect, useRef, useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import settStyles from './RinkSettings.module.css';
import calStyles from './CalendarModal.module.css';

// ── Locker Room row ────────────────────────────────────────────────────────────

function LockerRoomRow({ room, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await apiFetch(`/locker-rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditing(false);
      onSaved();
    } catch (err) { setError(err.message); }
  }

  async function remove() {
    if (!confirm(`Delete locker room "${room.name}"?`)) return;
    await apiFetch(`/locker-rooms/${room.id}`, { method: 'DELETE' });
    onDeleted();
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
          {error && <div className={styles.error} style={{ marginTop: 4 }}>{error}</div>}
        </td>
        <td>
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={save}>Save</button>
            <button className={styles.btnGhost} onClick={() => { setEditing(false); setName(room.name); setError(''); }}>Cancel</button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{room.name}</td>
      <td>
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={() => setEditing(true)}>Edit</button>
          <button className={styles.btnDanger} onClick={remove}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

// ── Sequence modal ─────────────────────────────────────────────────────────────

function SequenceModal({ existing, lockerRooms, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [pairs, setPairs] = useState(existing?.pairs ? [...existing.pairs] : []);
  const [pairHome, setPairHome] = useState('');
  const [pairAway, setPairAway] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  function addPair() {
    if (!pairHome || !pairAway) return;
    setPairs([...pairs, { home: pairHome, away: pairAway }]);
    setPairHome('');
    setPairAway('');
  }

  function removePair(i) {
    setPairs(pairs.filter((_, idx) => idx !== i));
  }

  function movePair(i, dir) {
    const next = [...pairs];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    setPairs(next);
  }

  async function submit(e) {
    e.preventDefault();
    if (!pairs.length) { setError('Add at least one pair.'); return; }
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/locker-sequences/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ name, pairs }) });
      } else {
        await apiFetch('/locker-sequences', { method: 'POST', body: JSON.stringify({ name, pairs }) });
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
      <div className={calStyles.modal} style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className={calStyles.modalHeader}>
          <span>{isEdit ? 'Edit' : 'Add'} Locker Room Sequence</span>
          <button className={calStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className={calStyles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label}>Sequence Name</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard, NCWHL" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Add Pair</label>
            <div className={settStyles.pairRow}>
              <select className={styles.select} value={pairHome} onChange={(e) => setPairHome(e.target.value)}>
                <option value="">Home Locker</option>
                {lockerRooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
              <span className={settStyles.pairVs}>vs</span>
              <select className={styles.select} value={pairAway} onChange={(e) => setPairAway(e.target.value)}>
                <option value="">Away Locker</option>
                {lockerRooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
              <button type="button" className={styles.btnGhost} onClick={addPair} disabled={!pairHome || !pairAway}>
                + Add
              </button>
            </div>
          </div>

          {pairs.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Pair Order</label>
              <div className={settStyles.pairList}>
                {pairs.map((p, i) => (
                  <div key={i} className={settStyles.pairItem}>
                    <span className={settStyles.pairNum}>{i + 1}</span>
                    <span className={settStyles.pairLabel}>{p.home} <span className={settStyles.pairVsSmall}>vs</span> {p.away}</span>
                    <div className={settStyles.pairActions}>
                      <button type="button" className={settStyles.moveBtn} onClick={() => movePair(i, -1)} disabled={i === 0}>▲</button>
                      <button type="button" className={settStyles.moveBtn} onClick={() => movePair(i, 1)} disabled={i === pairs.length - 1}>▼</button>
                      <button type="button" className={styles.btnDanger} onClick={() => removePair(i)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className={styles.errorMsg}>{error}</div>}
          <div className={calStyles.modalFooter}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Sequence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export default function RinkSettingsTab() {
  const { data: settings, reload: reloadSettings } = useApi('/settings');
  const { data: lockerRooms, reload: reloadRooms } = useApi('/locker-rooms');
  const { data: sequences, reload: reloadSequences } = useApi('/locker-sequences');
  const [rinkName, setRinkName] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [addError, setAddError] = useState('');
  const [seqModal, setSeqModal] = useState(null); // null | 'add' | sequence object
  const fileRef = useRef();

  useEffect(() => {
    if (settings) setRinkName(settings.rink_name ?? '');
  }, [settings]);

  async function saveRinkName(e) {
    e.preventDefault();
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ rink_name: rinkName }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reloadSettings();
  }

  async function uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch('/api/logo', { method: 'POST', body: fd });
    setUploading(false);
    reloadSettings();
  }

  async function removeLogo() {
    await apiFetch('/logo', { method: 'DELETE' });
    reloadSettings();
  }

  async function addRoom(e) {
    e.preventDefault();
    setAddError('');
    try {
      await apiFetch('/locker-rooms', { method: 'POST', body: JSON.stringify({ name: newRoom }) });
      setNewRoom('');
      reloadRooms();
    } catch (err) { setAddError(err.message); }
  }

  async function deleteSequence(seq) {
    if (!confirm(`Delete sequence "${seq.name}"?`)) return;
    await apiFetch(`/locker-sequences/${seq.id}`, { method: 'DELETE' });
    reloadSequences();
  }

  const logoUrl = settings?.logo_filename ? `/uploads/${settings.logo_filename}` : null;

  return (
    <div>
      <h2 className={styles.heading}>Settings</h2>

      {/* Rink Name */}
      <form onSubmit={saveRinkName} className={styles.settingsForm}>
        <div className={styles.field}>
          <label className={styles.label}>Rink Name</label>
          <p className={styles.hint} style={{ marginBottom: 0 }}>Shown on TV screens when no logo is uploaded.</p>
          <input className={styles.input} value={rinkName} onChange={(e) => setRinkName(e.target.value)} placeholder="Ice Rink" />
        </div>
        <div className={styles.formFooter}>
          <button className={styles.btnPrimary} type="submit">Save</button>
          {saved && <span className={styles.savedMsg}>Saved!</span>}
        </div>
      </form>

      {/* Logo */}
      <div className={styles.settingsForm}>
        <div className={styles.field}>
          <label className={styles.label}>Rink Logo</label>
          <p className={styles.hint} style={{ marginBottom: 0 }}>When uploaded, the logo replaces the rink name text in the TV header. Max height on screen is 48px.</p>
        </div>
        {logoUrl ? (
          <div className={settStyles.logoPreview}>
            <img src={logoUrl} alt="Rink logo" className={settStyles.logoImg} />
            <button className={styles.btnDanger} onClick={removeLogo}>Remove Logo</button>
          </div>
        ) : (
          <div className={settStyles.uploadRow}>
            <button className={styles.btnGhost} onClick={() => fileRef.current.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            <span className={styles.hint}>JPG, PNG, SVG, WebP — max 5 MB</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.svg" style={{ display: 'none' }} onChange={uploadLogo} />
      </div>

      {/* Locker Rooms */}
      <h2 className={styles.heading}>Locker Rooms</h2>
      <form onSubmit={addRoom} className={styles.addForm}>
        <input className={styles.input} value={newRoom} onChange={(e) => setNewRoom(e.target.value)}
          placeholder="Locker Room Name (e.g. Room 1, A, Blue)" />
        <button className={styles.btnPrimary} type="submit" disabled={!newRoom.trim()}>Add Locker Room</button>
        {addError && <span className={styles.error}>{addError}</span>}
      </form>
      {lockerRooms && lockerRooms.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th></th></tr></thead>
          <tbody>
            {lockerRooms.map((room) => (
              <LockerRoomRow key={room.id} room={room} onSaved={reloadRooms} onDeleted={reloadRooms} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted}>No locker rooms added yet.</p>
      )}

      {/* Locker Room Sequences */}
      <div className={styles.rowBetween} style={{ marginTop: '2rem' }}>
        <h2 className={styles.heading} style={{ marginBottom: 0 }}>Locker Room Sequences</h2>
        <button className={styles.btnPrimary} onClick={() => setSeqModal('add')}
          disabled={!lockerRooms || lockerRooms.length < 2}>
          + Add Sequence
        </button>
      </div>
      <p className={styles.hint}>Define named pairing patterns used for auto-assigning locker rooms to games.</p>

      {sequences && sequences.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Pairs (in order)</th><th></th></tr></thead>
          <tbody>
            {sequences.map((seq) => (
              <tr key={seq.id}>
                <td style={{ fontWeight: 600 }}>{seq.name}</td>
                <td>
                  <div className={settStyles.pairChips}>
                    {(seq.pairs || []).map((p, i) => (
                      <span key={i} className={settStyles.pairChip}>
                        {i + 1}. {p.home} vs {p.away}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnGhost} onClick={() => setSeqModal(seq)}>Edit</button>
                    <button className={styles.btnDanger} onClick={() => deleteSequence(seq)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted}>No sequences added yet.</p>
      )}

      {seqModal && (
        <SequenceModal
          existing={seqModal === 'add' ? null : seqModal}
          lockerRooms={lockerRooms || []}
          onClose={() => setSeqModal(null)}
          onSaved={reloadSequences}
        />
      )}
    </div>
  );
}
