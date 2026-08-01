import React, { useEffect, useRef, useState } from 'react';
import { useApi, apiFetch, getToken, setToken } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import settStyles from './RinkSettings.module.css';
import calStyles from './CalendarModal.module.css';
import s from './SettingsPage.module.css';
import Modal from './Modal';
import CalendarsTab from './SettingsTab';

const SUB_TABS = ['General', 'Calendars', 'Pricing', 'Locker Rooms', 'Displays', 'Backups', 'Updates', 'Admin'];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [tvNumber, setTvNumber] = useState(display.tv_number);
  const [error, setError] = useState('');

  const webAddress = `${window.location.origin}/tv/${display.tv_number}`;

  async function save() {
    setError('');
    if (!/^\d{1,2}$/.test(String(tvNumber).trim())) {
      setError('TV number must be a whole number from 0 to 99.');
      return;
    }
    try {
      await apiFetch(`/displays/${display.id}`, { method: 'PATCH', body: JSON.stringify({ name, tv_number: tvNumber }) });
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
        <td><input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} autoFocus /></td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ice-blue)' }}>TV#</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              max="99"
              step="1"
              style={{ width: '4.5rem', minWidth: '4.5rem', flex: 'none' }}
              value={tvNumber}
              onChange={(e) => {
                const v = e.target.value;
                if (v.length > 2) return;
                setTvNumber(v);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
          </div>
          {error && <div className={styles.error} style={{ marginTop: 4 }}>{error}</div>}
        </td>
        <td>
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={save}>Save</button>
            <button className={styles.btnGhost} onClick={() => { setEditing(false); setName(display.name); setTvNumber(display.tv_number); setError(''); }}>Cancel</button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ice-blue)' }}>Display {display.tv_number}</div>
        {display.name}
      </td>
      <td><a href={webAddress} target="_blank" rel="noopener noreferrer">{webAddress}</a></td>
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
    setPairHome(''); setPairAway('');
  }

  function removePair(i) { setPairs(pairs.filter((_, idx) => idx !== i)); }

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
    setError(''); setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/locker-sequences/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ name, pairs }) });
      } else {
        await apiFetch('/locker-sequences', { method: 'POST', body: JSON.stringify({ name, pairs }) });
      }
      onSaved(); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      onClose={onClose}
      title={`${isEdit ? 'Edit' : 'Add'} Locker Room Sequence`}
      width={520}
      closeButton
      onSubmit={submit}
      footer={<>
        <button type="button" className={styles.btnGhost} onClick={onClose}>Cancel</button>
        <button type="submit" className={styles.btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Sequence'}
        </button>
      </>}
    >
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
              <button type="button" className={styles.btnGhost} onClick={addPair} disabled={!pairHome || !pairAway}>+ Add</button>
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
    </Modal>
  );
}

// ── General section ────────────────────────────────────────────────────────────
function GeneralSection() {
  const { data: settings, reload: reloadSettings } = useApi('/settings');
  const [rinkName, setRinkName] = useState('');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => { if (settings) setRinkName(settings.rink_name ?? ''); }, [settings]);

  async function saveRinkName(e) {
    e.preventDefault();
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ rink_name: rinkName }) });
    setSaved(true); setTimeout(() => setSaved(false), 2000); reloadSettings();
  }

  async function uploadLogo(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    await fetch('/api/logo', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${getToken()}` } });
    setUploading(false); reloadSettings();
  }

  async function removeLogo() {
    await apiFetch('/logo', { method: 'DELETE' }); reloadSettings();
  }

  const logoUrl = settings?.logo_filename ? `/uploads/${settings.logo_filename}` : null;

  return (
    <>
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
    </>
  );
}

// ── Locker Rooms section ───────────────────────────────────────────────────────
function LockerRoomsSection() {
  const { data: settings, reload: reloadSettings } = useApi('/settings');
  const { data: lockerRooms, reload: reloadRooms } = useApi('/locker-rooms');
  const { data: sequences, reload: reloadSequences } = useApi('/locker-sequences');
  const [newRoom, setNewRoom] = useState('');
  const [addError, setAddError] = useState('');
  const [seqModal, setSeqModal] = useState(null);

  async function addRoom(e) {
    e.preventDefault(); setAddError('');
    try {
      await apiFetch('/locker-rooms', { method: 'POST', body: JSON.stringify({ name: newRoom }) });
      setNewRoom(''); reloadRooms();
    } catch (err) { setAddError(err.message); }
  }

  async function deleteSequence(seq) {
    if (!confirm(`Delete sequence "${seq.name}"?`)) return;
    await apiFetch(`/locker-sequences/${seq.id}`, { method: 'DELETE' }); reloadSequences();
  }

  return (
    <>
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
          <tbody>{lockerRooms.map((room) => (
            <LockerRoomRow key={room.id} room={room} onSaved={reloadRooms} onDeleted={reloadRooms} />
          ))}</tbody>
        </table>
      ) : <p className={styles.muted}>No locker rooms added yet.</p>}

      <div className={styles.rowBetween} style={{ marginTop: '2rem' }}>
        <h2 className={styles.heading} style={{ marginBottom: 0 }}>Locker Room Sequences</h2>
        <button className={styles.btnPrimary} onClick={() => setSeqModal('add')}
          disabled={!lockerRooms || lockerRooms.length < 2}>+ Add Sequence</button>
      </div>
      <p className={styles.hint}>Define named pairing patterns used for auto-assigning locker rooms to games.</p>
      {sequences && sequences.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Pairs (in order)</th><th></th></tr></thead>
          <tbody>{sequences.map((seq) => {
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
                      <span key={i} className={settStyles.pairChip}>{i + 1}. {p.home} vs {p.away}</span>
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
          })}</tbody>
        </table>
      ) : <p className={styles.muted}>No sequences added yet.</p>}

      {seqModal && (
        <SequenceModal
          existing={seqModal === 'add' ? null : seqModal}
          lockerRooms={lockerRooms || []}
          onClose={() => setSeqModal(null)}
          onSaved={reloadSequences}
        />
      )}
    </>
  );
}

// ── Displays section ───────────────────────────────────────────────────────────
function DisplaysSection() {
  const { data: displays, reload: reloadDisplays } = useApi('/displays');
  const [newDispName, setNewDispName] = useState('');
  const [newDispNum, setNewDispNum] = useState('');
  const [dispAddErr, setDispAddErr] = useState('');

  async function addDisplay(e) {
    e.preventDefault(); setDispAddErr('');
    if (!/^\d{1,2}$/.test(String(newDispNum).trim())) {
      setDispAddErr('TV number must be a whole number from 0 to 99.');
      return;
    }
    try {
      await apiFetch('/displays', { method: 'POST', body: JSON.stringify({ name: newDispName, tv_number: newDispNum }) });
      setNewDispName(''); setNewDispNum(''); reloadDisplays();
    } catch (err) { setDispAddErr(err.message); }
  }

  return (
    <>
      <h2 className={styles.heading}>Displays</h2>
      <p className={styles.hint}>Register the TVs showing RinkScreens content. The TV number sets the web address used to load that display.</p>
      <form onSubmit={addDisplay} className={styles.addForm}>
        <input className={styles.input} value={newDispName} onChange={(e) => setNewDispName(e.target.value)}
          placeholder="Display name (e.g. Lobby TV)" required />
        <input className={styles.input} type="number" min="0" max="99" step="1" value={newDispNum}
          onChange={(e) => { const v = e.target.value; if (v.length > 2) return; setNewDispNum(v); }}
          placeholder="TV#" style={{ width: '4.5rem', flex: 'none' }} required />
        <button className={styles.btnPrimary} type="submit" disabled={!newDispName.trim() || !String(newDispNum).trim()}>Add Display</button>
        {dispAddErr && <span className={styles.error}>{dispAddErr}</span>}
      </form>
      {displays && displays.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Web Address</th><th></th></tr></thead>
          <tbody>{displays.map((d) => (
            <DisplayRow key={d.id} display={d} onSaved={reloadDisplays} onDeleted={reloadDisplays} />
          ))}</tbody>
        </table>
      ) : <p className={styles.muted}>No displays added yet.</p>}
    </>
  );
}

// ── Public Skate Pricing section ───────────────────────────────────────────────
function PricingSection() {
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
    <>
      <h2 className={styles.heading}>Pricing</h2>
      <p className={styles.hint}>Admission pricing shown on TV displays. Used for public skate sessions and other rink events.</p>
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
    </>
  );
}

// Breadcrumb segments for a path, each with the cumulative path to jump to.
// e.g. "C:\Backups\Rink" -> [{name:'C:', path:'C:\\'}, {name:'Backups', path:'C:\\Backups'}, {name:'Rink', path:'C:\\Backups\\Rink'}]
function pathCrumbs(p) {
  if (!p) return [];
  const parts = p.split(/[\\/]/).filter(Boolean);
  let acc = '';
  return parts.map((name, i) => {
    acc = i === 0 && /^[A-Za-z]:$/.test(name) ? `${name}\\` : `${acc}${acc.endsWith('\\') || acc.endsWith('/') ? '' : '\\'}${name}`;
    return { name, path: acc };
  });
}

// ── Folder picker modal ────────────────────────────────────────────────────────
function FolderPickerModal({ initialPath, onClose, onSelect }) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  async function load(p) {
    setLoading(true); setError('');
    try {
      const q = p ? `?path=${encodeURIComponent(p)}` : '';
      const res = await apiFetch(`/backups/browse${q}`);
      setCurrentPath(res.path); setEntries(res.entries);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(initialPath || ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await apiFetch('/backups/browse/mkdir', {
        method: 'POST', body: JSON.stringify({ path: currentPath, name: newFolderName.trim() }),
      });
      setNewFolder(false); setNewFolderName('');
      load(currentPath);
    } catch (err) { setError(err.message); }
  }

  const crumbs = pathCrumbs(currentPath);

  return (
    <Modal
      onClose={onClose}
      title="Choose Backup Folder"
      width={520}
      closeButton
      footer={<>
        <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
        <button className={styles.btnPrimary} disabled={!currentPath} onClick={() => onSelect(currentPath)}>
          Select This Folder
        </button>
      </>}
    >
          <div className={s.crumbBar}>
            <button type="button" className={s.crumb} onClick={() => load('')} disabled={loading}>💻 This PC</button>
            {crumbs.map((c, i) => (
              <React.Fragment key={c.path}>
                <span className={s.crumbSep}>›</span>
                <button type="button" className={s.crumb} onClick={() => load(c.path)}
                  disabled={loading || i === crumbs.length - 1}>{c.name}</button>
              </React.Fragment>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={s.folderList}>
            {loading ? (
              <p className={s.folderEmpty}>Loading…</p>
            ) : entries.length > 0 ? (
              entries.map((entry) => (
                <div key={entry.path} className={s.folderRow} onDoubleClick={() => load(entry.path)}
                  onClick={() => load(entry.path)}>
                  <span className={s.folderIcon}>{currentPath ? '📁' : '💾'}</span>
                  <span>{entry.name}</span>
                </div>
              ))
            ) : (
              <p className={s.folderEmpty}>{currentPath ? 'No subfolders.' : 'No drives found.'}</p>
            )}
          </div>

          {currentPath && (
            newFolder ? (
              <form onSubmit={createFolder} className={s.newFolderRow}>
                <input className={styles.input} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name" autoFocus />
                <button type="submit" className={styles.btnGhost} disabled={!newFolderName.trim()}>Create</button>
                <button type="button" className={styles.btnGhost} onClick={() => { setNewFolder(false); setNewFolderName(''); }}>Cancel</button>
              </form>
            ) : (
              <button type="button" className={styles.btnGhost} style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => setNewFolder(true)}>+ New Folder</button>
            )
          )}
    </Modal>
  );
}

// ── Backups section ─────────────────────────────────────────────────────────────
function BackupsSection() {
  const { data, reload } = useApi('/backups');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState('24');
  const [retentionCount, setRetentionCount] = useState('14');
  const [backupDir, setBackupDir] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (!data) return;
    setAutoEnabled(data.settings.backup_auto_enabled);
    setIntervalHours(String(data.settings.backup_interval_hours));
    setRetentionCount(String(data.settings.backup_retention_count));
    setBackupDir(data.settings.backup_dir || '');
  }, [data]);

  async function saveScheduleSettings(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      await apiFetch('/backups/settings', {
        method: 'PUT',
        body: JSON.stringify({
          backup_auto_enabled: autoEnabled,
          backup_interval_hours: intervalHours,
          backup_retention_count: retentionCount,
          backup_dir: backupDir,
        }),
      });
      setNotice('Settings saved.'); setTimeout(() => setNotice(''), 2000);
      reload();
    } catch (err) { setError(err.message); }
  }

  function resetBackupDir() { setBackupDir(''); }

  async function createNow() {
    setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch('/backups', { method: 'POST' });
      setNotice('Backup created.'); setTimeout(() => setNotice(''), 2000);
      reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function restore(filename) {
    if (!confirm(`Restore "${filename}"? This replaces all current data and uploaded files. A safety backup of the current state will be made first.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch(`/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
      setNotice('Restore complete.'); setTimeout(() => setNotice(''), 3000);
      reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function togglePin(filename, pinned) {
    setError('');
    try {
      await apiFetch(`/backups/${encodeURIComponent(filename)}`, { method: 'PATCH', body: JSON.stringify({ pinned }) });
      reload();
    } catch (err) { setError(err.message); }
  }

  async function removeBackup(filename) {
    if (!confirm(`Delete backup "${filename}"?`)) return;
    try {
      await apiFetch(`/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      reload();
    } catch (err) { setError(err.message); }
  }

  function download(filename) {
    const token = getToken();
    fetch(`/api/backups/${encodeURIComponent(filename)}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });
  }

  async function uploadAndRestore(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm(`Restore from "${file.name}"? This replaces all current data and uploaded files. A safety backup of the current state will be made first.`)) {
      e.target.value = ''; return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/backups/restore-upload', {
        method: 'POST', body: fd, headers: { Authorization: `Bearer ${getToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setNotice('Restore complete.'); setTimeout(() => setNotice(''), 3000);
      reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  }

  const backups = data?.backups || [];

  return (
    <>
      <h2 className={styles.heading}>Backups</h2>
      <p className={styles.hint}>Backs up settings, screens, calendars, and uploaded files (logo/backgrounds) into a single downloadable .zip.</p>

      <form onSubmit={saveScheduleSettings} className={styles.settingsForm}>
        <div className={styles.field}>
          <label className={styles.label}>
            <input type="checkbox" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} style={{ marginRight: 8 }} />
            Automatic backups
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Interval (hours)</label>
          <input className={styles.input} type="number" min="0.25" step="0.25" value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)} style={{ width: 120 }} disabled={!autoEnabled} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Keep last N backups</label>
          <input className={styles.input} type="number" min="1" step="1" value={retentionCount}
            onChange={(e) => setRetentionCount(e.target.value)} style={{ width: 120 }} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Backup location</label>
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            Folder on the server machine — e.g. an external drive or network share. Leave unset to use the default.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 200 }}>{backupDir || `${data?.settings?.backup_dir_default || 'data/backups'} (default)`}</code>
            <button type="button" className={styles.btnGhost} onClick={() => setPickerOpen(true)}>Choose Folder…</button>
            {backupDir && <button type="button" className={styles.btnGhost} onClick={resetBackupDir}>Use Default</button>}
          </div>
          {data?.settings?.backup_dir_effective && (
            <p className={styles.hint}>Currently saving to: <code>{data.settings.backup_dir_effective}</code></p>
          )}
        </div>

        {pickerOpen && (
          <FolderPickerModal
            initialPath={backupDir || data?.settings?.backup_dir_default}
            onClose={() => setPickerOpen(false)}
            onSelect={(p) => { setBackupDir(p); setPickerOpen(false); }}
          />
        )}
        {data?.settings?.last_backup_at && (
          <p className={styles.hint}>Last backup: {new Date(data.settings.last_backup_at).toLocaleString()}</p>
        )}
        <div className={styles.formFooter}>
          <button className={styles.btnPrimary} type="submit">Save Settings</button>
          {notice && <span className={styles.savedMsg}>{notice}</span>}
        </div>
      </form>

      <div className={styles.rowBetween} style={{ marginTop: '2rem' }}>
        <h2 className={styles.heading} style={{ marginBottom: 0 }}>Backup History</h2>
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={() => fileRef.current.click()} disabled={busy}>Restore from File…</button>
          <button className={styles.btnPrimary} onClick={createNow} disabled={busy}>Back Up Now</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={uploadAndRestore} />
      {error && <p className={styles.error}>{error}</p>}

      {backups.length > 0 ? (
        <table className={styles.table}>
          <thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename}>
                <td style={{ wordBreak: 'break-all' }}>
                  {b.filename}
                  {b.pinned && <span style={{ marginLeft: 8, fontSize: '0.75rem', background: 'var(--ice-blue)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>📌 Kept</span>}
                </td>
                <td>{formatBytes(b.size)}</td>
                <td>{new Date(b.created_at).toLocaleString()}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnGhost} onClick={() => download(b.filename)} disabled={busy}>Download</button>
                    <button className={styles.btnGhost} onClick={() => restore(b.filename)} disabled={busy}>Restore</button>
                    <button className={styles.btnGhost} onClick={() => togglePin(b.filename, !b.pinned)} disabled={busy}>
                      {b.pinned ? 'Unpin' : 'Keep Permanently'}
                    </button>
                    <button className={styles.btnDanger} onClick={() => removeBackup(b.filename)} disabled={busy || b.pinned}
                      title={b.pinned ? 'Unpin this backup before deleting' : undefined}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className={styles.muted}>No backups yet.</p>}
    </>
  );
}

// ── Updates section ─────────────────────────────────────────────────────────────
function UpdatesSection() {
  const { data, reload } = useApi('/updates');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [checkMode, setCheckMode] = useState('interval');
  const [intervalHours, setIntervalHours] = useState('24');
  const [checkTime, setCheckTime] = useState('03:00');
  const [autoInstallEnabled, setAutoInstallEnabled] = useState(false);
  const [installTime, setInstallTime] = useState('03:30');

  useEffect(() => {
    if (!data) return;
    setAutoEnabled(data.auto_check_enabled);
    setCheckMode(data.check_mode || 'interval');
    setIntervalHours(String(data.check_interval_hours));
    setCheckTime(data.check_time || '03:00');
    setAutoInstallEnabled(data.auto_install_enabled);
    setInstallTime(data.install_time || '03:30');
  }, [data]);

  async function saveSettings(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      const body = {
        update_check_enabled: autoEnabled,
        update_check_mode: checkMode,
        update_check_interval_hours: intervalHours,
        update_check_time: checkTime,
        update_auto_install_enabled: autoInstallEnabled,
        update_install_time: installTime,
      };
      await apiFetch('/updates/settings', { method: 'PUT', body: JSON.stringify(body) });
      setNotice('Settings saved.'); setTimeout(() => setNotice(''), 2000);
      reload();
    } catch (err) { setError(err.message); }
  }

  async function checkNow() {
    setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch('/updates/check', { method: 'POST' });
      setNotice('Checked for updates.'); setTimeout(() => setNotice(''), 2000);
      reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function installNow() {
    if (!confirm(`Install version ${data.latest_version}? RinkScreens will restart automatically once the update is applied (usually under a minute). Your data (screens, displays, calendars, uploads) is not affected.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch('/updates/install', { method: 'POST' });
      setNotice('Installing update — the server will restart shortly. This page will stop responding for a minute or two.');
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <>
      <h2 className={styles.heading}>Updates</h2>
      <p className={styles.hint}>Checks GitHub for a newer version of RinkScreens and installs it in place. Installing an update never touches your data, screens, displays, calendars, or uploaded files.</p>

      {data && (
        <div className={styles.settingsForm} style={{ marginBottom: '1.5rem' }}>
          <p className={styles.hint} style={{ marginBottom: 4 }}>Current version: <strong>{data.current_version}</strong></p>
          {data.latest_version && (
            <p className={styles.hint} style={{ marginBottom: 4 }}>
              Latest available: <strong>{data.latest_version}</strong>{' '}
              {data.update_available ? <span style={{ color: 'var(--ice-blue)', fontWeight: 600 }}>— update available</span> : '— you are up to date'}
            </p>
          )}
          {data.checked_at && <p className={styles.hint} style={{ marginBottom: 4 }}>Last checked: {new Date(data.checked_at).toLocaleString()}</p>}
          {data.auto_check_enabled && data.next_check_at && (
            <p className={styles.hint} style={{ marginBottom: 4 }}>Next check: {new Date(data.next_check_at).toLocaleString()}</p>
          )}
          {data.auto_install_enabled && data.next_install_at && (
            <p className={styles.hint} style={{ marginBottom: 4 }}>Next auto-install check: {new Date(data.next_install_at).toLocaleString()}</p>
          )}
          {data.last_install_at && <p className={styles.hint} style={{ marginBottom: 4 }}>Last installed: {new Date(data.last_install_at).toLocaleString()}</p>}
          {data.check_error && <p className={styles.error}>{data.check_error}</p>}
          {data.update_available && data.release_notes && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: 'var(--ice-light)', padding: '0.75rem', borderRadius: 6, marginTop: 8 }}>{data.release_notes}</pre>
          )}
          <div className={styles.actions} style={{ marginTop: 8 }}>
            <button className={styles.btnGhost} onClick={checkNow} disabled={busy}>Check Now</button>
            {data.update_available && (
              <button className={styles.btnPrimary} onClick={installNow} disabled={busy}>Install Update</button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={saveSettings} className={styles.settingsForm}>
        <div className={styles.field}>
          <label className={styles.label}>
            <input type="checkbox" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} style={{ marginRight: 8 }} />
            Automatically check for updates
          </label>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Check schedule</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className={styles.select} value={checkMode} onChange={(e) => setCheckMode(e.target.value)}>
              <option value="interval">Every few hours</option>
              <option value="daily">Daily at a specific time</option>
            </select>
            {checkMode === 'interval' ? (
              <select className={s.hoursSelect} value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)}>
                <option value="1">1h</option>
                <option value="3">3h</option>
                <option value="6">6h</option>
                <option value="12">12h</option>
                <option value="24">24h</option>
                <option value="48">48h</option>
              </select>
            ) : (
              <input className={styles.input} type="time" value={checkTime}
                onChange={(e) => setCheckTime(e.target.value)} style={{ width: 140 }} />
            )}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>
            <input type="checkbox" checked={autoInstallEnabled} onChange={(e) => setAutoInstallEnabled(e.target.checked)} style={{ marginRight: 8 }} />
            Automatically install updates
          </label>
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            At the time below, checks for a newer version and installs it right away if one is available — no confirmation prompt. The server restarts during install (usually under a minute), so pick a time when the TVs being briefly offline won't matter.
          </p>
          <input className={styles.input} type="time" value={installTime}
            onChange={(e) => setInstallTime(e.target.value)} style={{ width: 140 }} />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.formFooter}>
          <button className={styles.btnPrimary} type="submit">Save Settings</button>
          {notice && <span className={styles.savedMsg}>{notice}</span>}
        </div>
      </form>
    </>
  );
}

// ── Admin section ──────────────────────────────────────────────────────────────
function AdminSection() {
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  async function changePassword(e) {
    e.preventDefault(); setPwError('');
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return; }
    if (pwNew.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setPwSubmitting(true);
    try {
      const data = await apiFetch('/auth/change-password', {
        method: 'POST', body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      if (data && data.token) setToken(data.token);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setPwSaved(true); setTimeout(() => setPwSaved(false), 3000);
    } catch (err) { setPwError(err.message); }
    finally { setPwSubmitting(false); }
  }

  return (
    <>
      <h2 className={styles.heading}>Admin Password</h2>
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
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [active, setActive] = useState('General');

  return (
    <div>
      <h2 className={styles.heading}>Settings</h2>
      <div className={s.subNav}>
        {SUB_TABS.map((t) => (
          <button
            key={t}
            className={active === t ? s.subTabActive : s.subTab}
            onClick={() => setActive(t)}
          >{t}</button>
        ))}
      </div>

      {active === 'General'      && <GeneralSection />}
      {active === 'Calendars'    && <CalendarsTab />}
      {active === 'Pricing'      && <PricingSection />}
      {active === 'Locker Rooms' && <LockerRoomsSection />}
      {active === 'Displays'     && <DisplaysSection />}
      {active === 'Backups'      && <BackupsSection />}
      {active === 'Updates'      && <UpdatesSection />}
      {active === 'Admin'        && <AdminSection />}
    </div>
  );
}
