import React, { useEffect, useRef, useState } from 'react';
import { useApi, apiFetch, getToken, setToken } from '../../hooks/useApi';
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

// ── Display row ────────────────────────────────────────────────────────────────

function DisplayRow({ display, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(display.name);
  const [ip, setIp] = useState(display.ip);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await apiFetch(`/displays/${display.id}`, { method: 'PATCH', body: JSON.stringify({ name, ip }) });
      setEditing(false);
      onSaved();
    } catch (err) { setError(err.message); }
  }

  async function remove() {
    if (!confirm(`Delete display "${display.name}"?`)) return;
    await apiFetch(`/displays/${display.id}`, { method: 'DELETE' });
    onDeleted();
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </td>
        <td>
          <input className={styles.input} value={ip} onChange={(e) => setIp(e.target.value)} />
          {error && <div className={styles.error} style={{ marginTop: 4 }}>{error}</div>}
        </td>
        <td>
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={save}>Save</button>
            <button className={styles.btnGhost} onClick={() => { setEditing(false); setName(display.name); setIp(display.ip); setError(''); }}>Cancel</button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{display.name}</td>
      <td>{display.ip}</td>
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
  const { data: displays, reload: reloadDisplays } = useApi('/displays');
  const [rinkName, setRinkName] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [addError, setAddError] = useState('');
  const [seqModal, setSeqModal] = useState(null); // null | 'add' | sequence object
  const [newDispName, setNewDispName] = useState('');
  const [newDispIp, setNewDispIp] = useState('');
  const [dispAddErr, setDispAddErr] = useState('');
  const fileRef = useRef();
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  useEffect(() => {
    if (settings) setRinkName(settings.rink_name ?? '');
  }, [settings]);

  async function changePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return; }
    if (pwNew.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setPwSubmitting(true);
    try {
      const data = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      if (data && data.token) setToken(data.token);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) { setPwError(err.message); }
    finally { setPwSubmitting(false); }
  }

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
    await fetch('/api/logo', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${getToken()}` } });
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

  async function addDisplay(e) {
    e.preventDefault();
    setDispAddErr('');
    try {
      await apiFetch('/displays', { method: 'POST', body: JSON.stringify({ name: newDispName, ip: newDispIp }) });
      setNewDispName('');
      setNewDispIp('');
      reloadDisplays();
    } catch (err) { setDispAddErr(err.message); }
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
            {sequences.map((seq) => {
              const isDefault = String(settings?.default_locker_sequence_id) === String(seq.id);
              return (
                <tr key={seq.id}>
                  <td style={{ fontWeight: 600 }}>
                    {seq.name}
                    {isDefault && <span style={{ marginLeft: 8, fontSize: '0.75rem', background: 'var(--ice-blue)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Default</span>}
                  </td>
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
                      {!isDefault && (
                        <button className={styles.btnGhost} onClick={async () => {
                          await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ default_locker_sequence_id: seq.id }) });
                          reloadSettings();
                        }}>Set Default</button>
                      )}
                      <button className={styles.btnGhost} onClick={() => setSeqModal(seq)}>Edit</button>
                      <button className={styles.btnDanger} onClick={() => deleteSequence(seq)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

      {/* Displays */}
      <h2 className={styles.heading} style={{ marginTop: '2rem' }}>Displays</h2>
      <p className={styles.hint}>Register the TV devices on your network.</p>
      <form onSubmit={addDisplay} className={styles.addForm}>
        <input className={styles.input} value={newDispName} onChange={(e) => setNewDispName(e.target.value)}
          placeholder="Display name (e.g. Lobby TV)" required />
        <input className={styles.input} value={newDispIp} onChange={(e) => setNewDispIp(e.target.value)}
          placeholder="IP address (e.g. 192.168.1.50)" required />
        <button className={styles.btnPrimary} type="submit" disabled={!newDispName.trim() || !newDispIp.trim()}>Add Display</button>
        {dispAddErr && <span className={styles.error}>{dispAddErr}</span>}
      </form>
      {displays && displays.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>IP Address</th><th></th></tr></thead>
          <tbody>
            {displays.map((d) => (
              <DisplayRow key={d.id} display={d} onSaved={reloadDisplays} onDeleted={reloadDisplays} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted}>No displays added yet.</p>
      )}

      {/* Admin Password */}
      <h2 className={styles.heading} style={{ marginTop: '2rem' }}>Admin Password</h2>
      <form onSubmit={changePassword} className={styles.settingsForm}>
        <div className={styles.field}>
          <label className={styles.label}>Current Password</label>
          <input className={styles.input} type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>New Password</label>
          <input className={styles.input} type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Confirm New Password</label>
          <input className={styles.input} type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
        </div>
        {pwError && <p className={styles.error}>{pwError}</p>}
        <div className={styles.formFooter}>
          <button className={styles.btnPrimary} type="submit" disabled={pwSubmitting}>
            {pwSubmitting ? 'Saving…' : 'Change Password'}
          </button>
          {pwSaved && <span className={styles.savedMsg}>Password updated!</span>}
        </div>
      </form>
    </div>
  );
}
