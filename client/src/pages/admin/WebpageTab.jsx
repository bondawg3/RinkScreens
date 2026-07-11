import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';
import sStyles from './ScreensSection.module.css';
import Thumbnail from './Thumbnail';
import { useScreenCards, InUseBadge, EyeButton, EyeHint, DuplicateButton } from './screenCard';

const EMPTY_FORM = { name: '', webpage_url: '', webpage_width: 100, webpage_zoom: 100 };

function toDisplayRefresh(minutes) {
  if (!minutes || minutes === 0) return { val: 0, unit: 'minutes' };
  if (minutes % 1440 === 0) return { val: minutes / 1440, unit: 'days' };
  return { val: minutes, unit: 'minutes' };
}

function toMinutes(val, unit) {
  const n = Number(val) || 0;
  return unit === 'days' ? n * 1440 : n;
}

export default function WebpageTab() {
  const { data: allScreens, reload } = useApi('/screens');
  const { data: displays } = useApi('/displays');
  const { eyeHint, assignedDisplayName, toggleVisible, deleteScreen, duplicateScreen } =
    useScreenCards({ displays, reload, confirmMessage: 'Delete this webpage screen?' });
  const [modal, setModal] = useState(null); // null | 'add' | screen object
  const [form, setForm] = useState(EMPTY_FORM);
  const [refreshVal, setRefreshVal] = useState(0);
  const [refreshUnit, setRefreshUnit] = useState('minutes');
  const [err, setErr] = useState('');

  const screens = (allScreens || []).filter((s) => s.display_type === 'webpage');

  function openAdd() {
    setForm(EMPTY_FORM);
    setRefreshVal(0);
    setRefreshUnit('minutes');
    setErr('');
    setModal('add');
  }

  function openEdit(screen) {
    setForm({
      name: screen.name || '',
      webpage_url: screen.webpage_url || '',
      webpage_width: screen.webpage_width ?? 100,
      webpage_zoom: screen.webpage_zoom ?? 100,
    });
    const { val, unit } = toDisplayRefresh(screen.webpage_refresh ?? 0);
    setRefreshVal(val);
    setRefreshUnit(unit);
    setErr('');
    setModal(screen);
  }

  function switchUnit(unit) {
    if (unit === refreshUnit) return;
    if (unit === 'days') {
      setRefreshVal(Math.round(toMinutes(refreshVal, 'minutes') / 1440) || 0);
    } else {
      setRefreshVal(toMinutes(refreshVal, 'days'));
    }
    setRefreshUnit(unit);
  }

  async function save() {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    const body = {
      name: form.name.trim(),
      display_type: 'webpage',
      webpage_url: form.webpage_url.trim(),
      webpage_width: form.webpage_width,
      webpage_zoom: form.webpage_zoom,
      webpage_refresh: toMinutes(refreshVal, refreshUnit),
    };
    try {
      if (modal === 'add') {
        await apiFetch('/screens', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/screens/${modal.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      setModal(null);
      reload();
    } catch (ex) { setErr(ex.message); }
  }

  return (
    <div>
      <div className={styles.rowBetween}>
        <h2 className={styles.heading}>Webpage</h2>
        <button className={styles.btnPrimary} onClick={openAdd}>+ Add Screen</button>
      </div>

      <div className={tStyles.grid} style={{ marginTop: '1.5rem' }}>
        {screens.map((sc) => (
          <div key={sc.id} className={tStyles.card}>
            <Thumbnail screenId={sc.id} />
            <div className={tStyles.cardBody}>
              <div className={tStyles.cardName}>{sc.name}</div>
              <div className={tStyles.cardMeta} style={{ wordBreak: 'break-all' }}>
                {sc.webpage_url || <span style={{ opacity: 0.5 }}>No URL set</span>}
              </div>
              <InUseBadge name={assignedDisplayName(sc.id)} />
              <div className={tStyles.cardMeta}>
                {sc.webpage_width}% width · {sc.webpage_zoom}% zoom
                {sc.webpage_refresh > 0 && (() => {
                  const { val, unit } = toDisplayRefresh(sc.webpage_refresh);
                  return ` · refreshes every ${val} ${unit}`;
                })()}
              </div>
              <div className={tStyles.cardActions}>
                <a href={`/tv/screen/${sc.id}?preview`} target="_blank" rel="noreferrer" className={styles.btnGhost} title="Preview">📺</a>
                <button className={styles.btnGhost} onClick={() => openEdit(sc)} title="Edit">✎</button>
                <button className={styles.btnGhost} title="Resync page" onClick={() => apiFetch(`/screens/${sc.id}/reload`, { method: 'POST' })}>&#8635;</button>
                <EyeButton screen={sc} assignedName={assignedDisplayName(sc.id)} onToggle={toggleVisible} />
                <button className={styles.btnDanger} onClick={() => deleteScreen(sc.id)} title="Delete">🗑</button>
                <DuplicateButton screen={sc} onDuplicate={duplicateScreen} />
              </div>
              <EyeHint show={eyeHint === sc.id} name={assignedDisplayName(sc.id)} />
            </div>
          </div>
        ))}
        {screens.length === 0 && (
          <p className={styles.muted}>No webpage screens configured yet.</p>
        )}
      </div>

      {modal && (
        <div className={tStyles.modalBackdrop} onClick={() => setModal(null)}>
          <div className={tStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={tStyles.modalTitle}>{modal === 'add' ? 'Add Webpage Screen' : `Edit — ${modal.name}`}</div>

            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label className={styles.label}>URL</label>
            <input
              className={styles.input}
              placeholder="https://example.com"
              value={form.webpage_url}
              onChange={(e) => setForm({ ...form, webpage_url: e.target.value })}
            />

            <label className={styles.label}>Width — {form.webpage_width}%</label>
            <input
              type="range" min="10" max="100" step="5"
              value={form.webpage_width}
              onChange={(e) => setForm({ ...form, webpage_width: Number(e.target.value) })}
              style={{ width: '100%' }}
            />

            <label className={styles.label}>Zoom — {form.webpage_zoom}%</label>
            <input
              type="range" min="25" max="300" step="5"
              value={form.webpage_zoom}
              onChange={(e) => setForm({ ...form, webpage_zoom: Number(e.target.value) })}
              style={{ width: '100%' }}
            />

            <label className={styles.label}>Refresh Interval</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                className={styles.input}
                type="number"
                min="0"
                style={{ width: '80px', marginBottom: 0 }}
                value={refreshVal}
                onChange={(e) => setRefreshVal(e.target.value)}
                placeholder="0 = off"
              />
              <div className={sStyles.unitToggle}>
                <button
                  type="button"
                  className={refreshUnit === 'minutes' ? sStyles.unitActive : sStyles.unitBtn}
                  onClick={() => switchUnit('minutes')}
                >Minutes</button>
                <button
                  type="button"
                  className={refreshUnit === 'days' ? sStyles.unitActive : sStyles.unitBtn}
                  onClick={() => switchUnit('days')}
                >Days</button>
              </div>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
              Set to 0 to disable auto-refresh.
            </div>

            {err && <span className={styles.error}>{err}</span>}
            <div className={tStyles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
              <button className={styles.btnPrimary} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
