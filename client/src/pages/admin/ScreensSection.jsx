import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import s from './ScreensSection.module.css';

function stepDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function Thumbnail({ screenId, previewDate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    if (!wrapRef.current) return;
    const w = wrapRef.current.offsetWidth;
    setScale(w / 1920);
  }, []);

  const src = `/tv/${screenId}?preview_date=${previewDate}`;

  return (
    <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale }}>
      <iframe key={src} src={src} title={`Screen ${screenId}`} scrolling="no" />
    </div>
  );
}

export default function ScreensSection({ displayType, calendarType }) {
  const { data: allScreens, reload } = useApi('/screens');
  const { data: allCalendars } = useApi('/calendars');
  const { data: backgrounds } = useApi('/backgrounds');
  const { data: displays } = useApi('/displays');

  const screens = (allScreens || []).filter((sc) => sc.display_type === displayType);
  const calendars = calendarType
    ? (allCalendars || []).filter((c) => c.type === calendarType)
    : (allCalendars || []);

  const [previewDates, setPreviewDates] = useState({});
  const [eyeHint, setEyeHint] = useState(null); // screen id showing hint
  const [modal, setModal] = useState(null); // null | 'add' | screen object
  const [form, setForm] = useState({ name: '', calendar_ids: [], background_id: '', bg_opacity: 100, two_column: false, overflow_mode: 'none', rotate_interval: 30 });
  const [err, setErr] = useState('');

  function getPreviewDate(id) {
    return previewDates[id] || todayStr();
  }

  function shiftDate(id, delta) {
    setPreviewDates((prev) => ({
      ...prev,
      [id]: stepDate(getPreviewDate(id), delta),
    }));
  }

  function openAdd() {
    setForm({ name: '', calendar_ids: [], background_id: '', bg_opacity: 100, two_column: false, overflow_mode: 'none', rotate_interval: 30 });
    setErr('');
    setModal('add');
  }

  function openEdit(screen) {
    setForm({
      name: screen.name || '',
      calendar_ids: screen.calendar_ids || [],
      background_id: screen.background_id ?? '',
      bg_opacity: screen.bg_opacity ?? 100,
      two_column: screen.two_column || false,
      overflow_mode: screen.overflow_mode || 'none',
      rotate_interval: screen.rotate_interval ?? 30,
    });
    setErr('');
    setModal(screen);
  }

  function toggleCal(id) {
    setForm((prev) => {
      const ids = prev.calendar_ids.includes(id)
        ? prev.calendar_ids.filter((x) => x !== id)
        : [...prev.calendar_ids, id];
      return { ...prev, calendar_ids: ids };
    });
  }

  async function save() {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    const body = {
      name: form.name.trim(),
      display_type: displayType,
      calendar_ids: form.calendar_ids,
      background_id: form.background_id || null,
      bg_opacity: form.bg_opacity,
      ...(displayType === 'figure_skating' && {
        two_column: form.two_column,
        overflow_mode: form.overflow_mode,
        rotate_interval: Number(form.rotate_interval),
      }),
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

  function assignedDisplayName(screenId) {
    return (displays || []).find((d) => d.screen_id === screenId)?.name || null;
  }

  async function toggleVisible(sc) {
    const inUse = assignedDisplayName(sc.id);
    if (inUse) { setEyeHint(sc.id); setTimeout(() => setEyeHint(null), 3000); return; }
    await apiFetch(`/screens/${sc.id}`, { method: 'PATCH', body: JSON.stringify({ visible: !sc.visible }) });
    reload();
  }

  async function deleteScreen(id) {
    if (!confirm('Delete this screen?')) return;
    await apiFetch(`/screens/${id}`, { method: 'DELETE' });
    reload();
  }

  function calNamesForScreen(screen) {
    if (!screen.calendar_ids || !screen.calendar_ids.length) return null;
    return screen.calendar_ids.map((id) => {
      const cal = (allCalendars || []).find((c) => c.id === id);
      return cal ? cal.name : String(id);
    });
  }

  const bgForScreen = (screen) => {
    if (!screen.background_id) return null;
    return (backgrounds || []).find((b) => b.id === screen.background_id)?.label || null;
  };

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <span className={s.sectionTitle}>Screens</span>
        <button className={adminStyles.btnPrimary} onClick={openAdd}>+ Add Screen</button>
      </div>

      <div className={s.grid}>
        {screens.map((sc) => {
          const pd = getPreviewDate(sc.id);
          const calNames = calNamesForScreen(sc);
          const bg = bgForScreen(sc);
          return (
            <div key={sc.id} className={s.card}>
              <div className={s.dateNav}>
                <button onClick={() => shiftDate(sc.id, -1)}>&#8249;</button>
                <span className={s.dateLabel}>{fmtDateLabel(pd)}</span>
                <button onClick={() => shiftDate(sc.id, 1)}>&#8250;</button>
              </div>
              <Thumbnail screenId={sc.id} previewDate={pd} />
              <div className={s.cardBody}>
                <div className={s.cardName}>{sc.name}</div>
                <div className={s.calChips}>
                  {calNames
                    ? calNames.map((n) => <span key={n} className={s.chip}>{n}</span>)
                    : <span className={s.chipAll}>All calendars</span>}
                </div>
                {bg && <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{bg} — {sc.bg_opacity ?? 100}% opacity</div>}
                {(() => { const d = assignedDisplayName(sc.id); return d ? <div className={s.inUseBadge}>● {d}</div> : null; })()}
                <div className={s.cardActions}>
                  <a href={`/tv/${sc.id}?preview`} target="_blank" rel="noreferrer" className={adminStyles.btnGhost}>Preview</a>
                  <button className={adminStyles.btnGhost} onClick={() => openEdit(sc)}>Edit</button>
                  <button
                    className={assignedDisplayName(sc.id) ? s.eyeDisabled : sc.visible !== false ? s.eyeOn : s.eyeOff}
                    onClick={() => toggleVisible(sc)}
                    title={assignedDisplayName(sc.id) ? `In use by ${assignedDisplayName(sc.id)} — unassign first` : sc.visible !== false ? 'Visible in Displays tab — click to hide' : 'Hidden from Displays tab — click to show'}
                  >{sc.visible !== false ? '👁' : '🚫'}</button>
                  <button className={adminStyles.btnDanger} onClick={() => deleteScreen(sc.id)}>Delete</button>
                </div>
                {eyeHint === sc.id && <div className={s.eyeHintText}>In use by {assignedDisplayName(sc.id)} — unassign it first to hide.</div>}
              </div>
            </div>
          );
        })}
        {screens.length === 0 && (
          <p className={adminStyles.muted}>No screens configured yet.</p>
        )}
      </div>

      {modal && (
        <div className={s.modalBackdrop} onClick={() => setModal(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalTitle}>{modal === 'add' ? 'Add Screen' : `Edit — ${modal.name}`}</div>

            <label className={adminStyles.label}>Name</label>
            <input
              className={adminStyles.input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label className={adminStyles.label}>Calendars</label>
            <div className={s.calCheckList}>
              {calendars.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No calendars of this type</span>}
              {calendars.map((c) => (
                <label key={c.id} className={s.calCheckItem}>
                  <input
                    type="checkbox"
                    checked={form.calendar_ids.includes(c.id)}
                    onChange={() => toggleCal(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
              Leave all unchecked to show all calendars.
            </div>

            <label className={adminStyles.label}>Background</label>
            <select
              className={adminStyles.select}
              value={form.background_id ?? ''}
              onChange={(e) => setForm({ ...form, background_id: e.target.value || '' })}
            >
              <option value="">None</option>
              {(backgrounds || []).filter(b => (b.image_type || 'background') === 'background').map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>

            <label className={adminStyles.label}>Opacity — {form.bg_opacity}%</label>
            <input
              type="range" min="0" max="100" step="5"
              value={form.bg_opacity}
              onChange={(e) => setForm({ ...form, bg_opacity: Number(e.target.value) })}
              style={{ width: '100%' }}
            />

            {displayType === 'figure_skating' && (<>
              <label className={adminStyles.label}>Layout</label>
              <div className={s.toggleRow}>
                <button type="button"
                  className={!form.two_column ? s.toggleActive : s.toggleBtn}
                  onClick={() => setForm({ ...form, two_column: false })}>Single column</button>
                <button type="button"
                  className={form.two_column ? s.toggleActive : s.toggleBtn}
                  onClick={() => setForm({ ...form, two_column: true })}>Two columns <span style={{ opacity: 0.6, fontWeight: 400 }}>(max 12 rows each)</span></button>
              </div>

              <label className={adminStyles.label}>Overflow</label>
              <select className={adminStyles.select} value={form.overflow_mode}
                onChange={(e) => setForm({ ...form, overflow_mode: e.target.value })}>
                <option value="none">None — show first {form.two_column ? 24 : 24} events</option>
                <option value="rotate">Rotate pages — cycle through all events</option>
                <option value="flow">Flow with time — show upcoming events only</option>
              </select>
              {form.overflow_mode === 'none' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
                  Only the first {form.two_column ? '24 events (12 per column)' : '24 events'} will be shown.
                </div>
              )}
              {form.overflow_mode === 'rotate' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>Rotate every</span>
                  <input className={adminStyles.input} type="number" min="5" max="300" style={{ width: 70, marginBottom: 0 }}
                    value={form.rotate_interval}
                    onChange={(e) => setForm({ ...form, rotate_interval: e.target.value })} />
                  <span style={{ fontSize: '0.85rem' }}>seconds</span>
                </div>
              )}
              {form.overflow_mode === 'flow' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
                  Only shows events from the current time onward. Past events are removed automatically.
                </div>
              )}
            </>)}

            {err && <span className={adminStyles.error}>{err}</span>}
            <div className={s.modalActions}>
              <button className={adminStyles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
              <button className={adminStyles.btnPrimary} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
