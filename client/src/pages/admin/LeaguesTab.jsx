import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';

const SWATCHES = [
  '#c0392b','#e74c3c','#e67e22','#f1c40f','#2ecc71','#27ae60',
  '#1abc9c','#3498db','#2980b9','#1a7abf','#9b59b6','#8e44ad',
  '#2c3e50','#34495e','#7f8c8d','#000000','#ffffff','#bdc3c7',
  '#d4a017','#8B0000',
];

function ColorPicker({ value, onChange }) {
  const [hex, setHex] = useState(value || '');

  function pick(c) {
    setHex(c);
    onChange(c);
  }

  function handleHex(e) {
    let val = e.target.value.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    setHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) onChange(val);
  }

  const isInvalid = hex && !/^#[0-9a-fA-F]{6}$/.test(hex);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => pick(c)} title={c}
            style={{ width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer', flexShrink: 0, padding: 0,
              border: value === c ? '3px solid #064878' : '1px solid #ccc',
              outline: value === c ? '1px solid #fff' : 'none',
              outlineOffset: '-4px' }} />
        ))}
        <button type="button" onClick={() => pick('')} title="Clear"
          style={{ width: 18, height: 18, borderRadius: 3, background: '#fff', cursor: 'pointer', border: '1px solid #ccc', fontSize: 10, padding: 0, color: '#999', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <input
          className={styles.input}
          value={hex}
          onChange={handleHex}
          placeholder="#rrggbb"
          style={{ width: 90, flex: 'none', minWidth: 0, padding: '0.25rem 0.5rem', fontSize: '0.85rem', borderColor: isInvalid ? '#c0392b' : undefined }}
        />
        {isInvalid && <span style={{ fontSize: '0.75rem', color: '#c0392b' }}>Invalid hex</span>}
      </div>
    </div>
  );
}

function TeamRow({ team, onSaved, onDeleted }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(team.name);
  const [displayName, setDisplayName] = useState(team.display_name || '');
  const [color, setColor] = useState(team.color || '');
  const [textColor, setTextColor] = useState(team.text_color || '');
  const [error, setError] = useState('');

  async function saveBgColor(val) {
    setColor(val);
    await apiFetch(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ color: val }) });
    onSaved();
  }

  async function saveTextColor(val) {
    setTextColor(val);
    await apiFetch(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ text_color: val }) });
    onSaved();
  }

  async function saveName() {
    setError('');
    try {
      await apiFetch(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ name, display_name: displayName }) });
      setEditingName(false);
      onSaved();
    } catch (err) { setError(err.message); }
  }

  async function remove() {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    await apiFetch(`/teams/${team.id}`, { method: 'DELETE' });
    onDeleted();
  }

  return (
    <tr>
      <td>
        {editingName ? (
          <form onSubmit={(e) => { e.preventDefault(); saveName(); }} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" style={{ width: '100%' }} />
            <input className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" style={{ width: '100%' }} />
            <button type="submit" style={{ display: 'none' }} />
          </form>
        ) : (
          <div>
            <div>{team.name}</div>
            {team.display_name && <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 2 }}>Displays as: {team.display_name}</div>}
          </div>
        )}
        {error && <div className={styles.errorMsg}>{error}</div>}
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#666', width: 32, flexShrink: 0 }}>BG</span>
            <ColorPicker value={color} onChange={saveBgColor} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: '#666', width: 32, flexShrink: 0 }}>Text</span>
            <ColorPicker value={textColor} onChange={saveTextColor} />
          </div>
        </div>
      </td>
      <td>
        <div className={styles.actions}>
          {editingName ? (
            <>
              <button className={styles.btnPrimary} onClick={saveName}>Save</button>
              <button className={styles.btnGhost} onClick={() => { setName(team.name); setEditingName(false); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className={styles.btnGhost} onClick={() => setEditingName(true)}>Edit</button>
              <button className={styles.btnDanger} onClick={remove}>Delete</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function LeagueCard({ league, sequences, onChanged, onDeleted }) {
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('');
  const [newTeamTextColor, setNewTeamTextColor] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [leagueName, setLeagueName] = useState(league.name);
  const [error, setError] = useState('');

  async function saveSequence(e) {
    const val = e.target.value;
    await apiFetch(`/leagues/${league.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ locker_sequence_id: val ? Number(val) : null }),
    });
    onChanged();
  }

  async function saveName() {
    setError('');
    try {
      await apiFetch(`/leagues/${league.id}`, { method: 'PATCH', body: JSON.stringify({ name: leagueName }) });
      setEditingName(false);
      onChanged();
    } catch (err) { setError(err.message); }
  }

  async function deleteLeague() {
    if (!confirm(`Delete league "${league.name}" and all its teams?`)) return;
    await apiFetch(`/leagues/${league.id}`, { method: 'DELETE' });
    (onDeleted || onChanged)();
  }

  async function addTeam(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch(`/leagues/${league.id}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name: newTeamName, color: newTeamColor, text_color: newTeamTextColor }),
      });
      setNewTeamName('');
      setNewTeamColor('');
      setNewTeamTextColor('');
      setAddingTeam(false);
      onChanged();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        {editingName ? (
          <>
            <input className={styles.input} value={leagueName} onChange={(e) => setLeagueName(e.target.value)} style={{ flex: 1 }} />
            <button className={styles.btnPrimary} onClick={saveName}>Save</button>
            <button className={styles.btnGhost} onClick={() => { setLeagueName(league.name); setEditingName(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className={styles.btnGhost} onClick={() => setEditingName(true)}>Rename</button>
            <button className={styles.btnDanger} onClick={deleteLeague}>Delete League</button>
          </>
        )}
      </div>

      {error && <div className={styles.errorMsg} style={{ marginBottom: '0.5rem' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <label className={styles.label} style={{ margin: 0, whiteSpace: 'nowrap' }}>Locker Room Sequence:</label>
        <select
          style={{ width: 'fit-content', border: '1.5px solid var(--border)', borderRadius: 5, padding: '0.4rem 0.7rem', fontSize: '0.95rem', background: '#fff', color: 'var(--text)' }}
          value={league.locker_sequence_id || ''}
          onChange={saveSequence}
        >
          <option value="">— None —</option>
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {(league.teams || []).length > 0 ? (
        <table className={styles.table} style={{ marginBottom: '0.75rem' }}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Colors</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(league.teams || []).map((t) => (
              <TeamRow key={t.id} team={t} onSaved={onChanged} onDeleted={onChanged} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>No teams yet.</p>
      )}

      {addingTeam ? (
        <form onSubmit={addTeam}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <input className={styles.input} placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} required style={{ flex: 1, minWidth: 140 }} />
            <button className={styles.btnPrimary} type="submit">Add</button>
            <button className={styles.btnGhost} type="button" onClick={() => { setAddingTeam(false); setNewTeamName(''); setNewTeamColor(''); setNewTeamTextColor(''); }}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: '#666', width: 32 }}>BG</span>
              <ColorPicker value={newTeamColor} onChange={setNewTeamColor} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: '#666', width: 32 }}>Text</span>
              <ColorPicker value={newTeamTextColor} onChange={setNewTeamTextColor} />
            </div>
          </div>
        </form>
      ) : (
        <button className={styles.btnGhost} onClick={() => setAddingTeam(true)}>+ Add Team</button>
      )}
    </div>
  );
}


export default function LeaguesTab() {
  const { data: leagues, reload } = useApi('/leagues');
  const { data: sequences } = useApi('/locker-sequences');
  const [activeId, setActiveId] = useState(null);
  const [addingLeague, setAddingLeague] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  const list = leagues || [];
  const active = list.find((l) => l.id === activeId) || list[0] || null;

  async function addLeague(e) {
    e.preventDefault();
    setAddError('');
    try {
      const row = await apiFetch('/leagues', { method: 'POST', body: JSON.stringify({ name: newName }) });
      setNewName('');
      setAddingLeague(false);
      await reload();
      setActiveId(row.id);
    } catch (err) { setAddError(err.message); }
  }

  async function handleDeleted() {
    setActiveId(null);
    reload();
  }

  return (
    <div>
      <h2 className={styles.heading}>Leagues & Teams</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {list.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => { setActiveId(l.id); setAddingLeague(false); }}
            style={{
              padding: '0.5rem 1.1rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: 'none',
              borderBottom: (active && active.id === l.id && !addingLeague) ? '3px solid var(--ice-blue)' : '3px solid transparent',
              background: 'none',
              color: (active && active.id === l.id && !addingLeague) ? 'var(--ice-blue)' : 'var(--text)',
              cursor: 'pointer',
              marginBottom: -2,
            }}
          >{l.name}</button>
        ))}
        <button
          type="button"
          onClick={() => setAddingLeague(true)}
          style={{
            padding: '0.5rem 1rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            border: 'none',
            borderBottom: addingLeague ? '3px solid var(--ice-blue)' : '3px solid transparent',
            background: 'none',
            color: addingLeague ? 'var(--ice-blue)' : '#888',
            cursor: 'pointer',
            marginBottom: -2,
          }}
        >+ Add League</button>
      </div>

      {addingLeague ? (
        <form onSubmit={addLeague} className={styles.addForm}>
          <input
            className={styles.input}
            placeholder="New league name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            required
          />
          <button className={styles.btnPrimary} type="submit">Add League</button>
          <button className={styles.btnGhost} type="button" onClick={() => { setAddingLeague(false); setNewName(''); setAddError(''); }}>Cancel</button>
          {addError && <span className={styles.errorMsg}>{addError}</span>}
        </form>
      ) : active ? (
        <LeagueCard
          key={active.id}
          league={active}
          sequences={sequences || []}
          onChanged={reload}
          onDeleted={handleDeleted}
        />
      ) : (
        <p className={styles.muted}>No leagues yet. Click "+ Add League" to create one.</p>
      )}
    </div>
  );
}
