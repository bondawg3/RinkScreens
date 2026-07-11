import React, { useState } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import s from './ScreensSection.module.css';
import Thumbnail from './Thumbnail';
import { useScreenCards, InUseBadge, EyeButton, EyeHint, DuplicateButton } from './screenCard';
import { stepDate, todayStr, fmtDateLabel } from '../../utils/date';

const CAL_TYPE_LABELS = {
  hockey_games: 'Hockey',
  public_skates: 'Public Skate',
  rink_events: 'Rink Events',
  figure_skating: 'Figure Skating',
};

// rotate_interval is always stored in seconds; these just govern how the
// admin form displays/edits that number (as seconds or minutes), mirroring
// the Webpage screen's refresh-interval input + unit toggle.
function toDisplayRotate(seconds) {
  const s = seconds || 30;
  if (s >= 60 && s % 60 === 0) return { val: s / 60, unit: 'minutes' };
  return { val: s, unit: 'seconds' };
}
function toRotateSeconds(val, unit) {
  const n = Number(val) || 0;
  return Math.max(5, unit === 'minutes' ? n * 60 : n);
}

export default function ScreensSection({ displayType, calendarType }) {
  const { data: allScreens, reload } = useApi('/screens');
  const { data: allCalendars } = useApi('/calendars');
  const { data: backgrounds } = useApi('/backgrounds');
  const { data: displays } = useApi('/displays');
  const { data: skatePrices } = useApi('/skate-prices');

  const screens = (allScreens || []).filter((sc) => sc.display_type === displayType);
  const calendars = calendarType
    ? (allCalendars || []).filter((c) => c.type === calendarType)
    : (allCalendars || []);

  const [previewDates, setPreviewDates] = useState({});
  const [modal, setModal] = useState(null); // null | 'add' | screen object
  const [form, setForm] = useState({ name: '', all_calendars: false, calendar_ids: [], background_id: '', bg_opacity: 100, two_column: false, overflow_mode: 'none', rotate_interval: 30, days_ahead: 14, show_pricing: false, show_locker_rooms: true });
  const [rotateVal, setRotateVal] = useState(30);
  const [rotateUnit, setRotateUnit] = useState('seconds');
  const [err, setErr] = useState('');
  const [pricingModal, setPricingModal] = useState(null); // screen object being edited for pricing
  const [pricingSelection, setPricingSelection] = useState([]);

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
    setForm({ name: '', all_calendars: false, calendar_ids: [], background_id: '', bg_opacity: 100, two_column: false, overflow_mode: 'none', rotate_interval: 30, days_ahead: 14, show_pricing: false, show_locker_rooms: true });
    setRotateVal(30);
    setRotateUnit('seconds');
    setErr('');
    setModal('add');
  }

  function openEdit(screen) {
    const hasSpecific = screen.calendar_ids && screen.calendar_ids.length > 0;
    setForm({
      name: screen.name || '',
      all_calendars: !hasSpecific,
      calendar_ids: screen.calendar_ids || [],
      background_id: screen.background_id ?? '',
      bg_opacity: screen.bg_opacity ?? 100,
      two_column: screen.two_column || false,
      overflow_mode: screen.overflow_mode || 'none',
      rotate_interval: screen.rotate_interval ?? 30,
      days_ahead: screen.days_ahead ?? 14,
      show_pricing: screen.show_pricing || false,
      show_locker_rooms: screen.show_locker_rooms !== false,
    });
    const { val, unit } = toDisplayRotate(screen.rotate_interval ?? 30);
    setRotateVal(val);
    setRotateUnit(unit);
    setErr('');
    setModal(screen);
  }

  function switchRotateUnit(unit) {
    if (unit === rotateUnit) return;
    if (unit === 'minutes') {
      setRotateVal(Math.round(toRotateSeconds(rotateVal, 'seconds') / 60) || 1);
    } else {
      setRotateVal(toRotateSeconds(rotateVal, 'minutes'));
    }
    setRotateUnit(unit);
  }

  function openPricingModal(screen) {
    setPricingSelection(screen.pricing_ids || []);
    setPricingModal(screen);
  }

  function togglePricingId(id) {
    setPricingSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function savePricingSelection() {
    await apiFetch(`/screens/${pricingModal.id}`, { method: 'PATCH', body: JSON.stringify({ pricing_ids: pricingSelection }) });
    setPricingModal(null);
    reload();
  }

  function toggleCal(id) {
    setForm((prev) => {
      const ids = prev.calendar_ids.includes(id)
        ? prev.calendar_ids.filter((x) => x !== id)
        : [...prev.calendar_ids, id];
      return { ...prev, all_calendars: false, calendar_ids: ids };
    });
  }

  function toggleAllCalendars() {
    setForm((prev) => ({ ...prev, all_calendars: !prev.all_calendars, calendar_ids: [] }));
  }

  async function save() {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    if (!form.all_calendars && form.calendar_ids.length === 0) { setErr('Select "All Calendars" or at least one calendar.'); return; }
    const body = {
      name: form.name.trim(),
      display_type: displayType,
      calendar_ids: form.all_calendars ? [] : form.calendar_ids,
      background_id: form.background_id || null,
      bg_opacity: form.bg_opacity,
      show_pricing: form.show_pricing,
      ...((displayType === 'games' || displayType === 'custom') && {
        show_locker_rooms: form.show_locker_rooms,
      }),
      ...(displayType === 'games' && {
        rotate_interval: toRotateSeconds(rotateVal, rotateUnit),
      }),
      ...(displayType === 'figure_skating' && {
        two_column: form.two_column,
        overflow_mode: form.overflow_mode,
        rotate_interval: toRotateSeconds(rotateVal, rotateUnit),
      }),
      ...(displayType === 'skate' && {
        days_ahead: Number(form.days_ahead),
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

  const { eyeHint, assignedDisplayName, toggleVisible, deleteScreen, duplicateScreen } =
    useScreenCards({ displays, reload });

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
                <InUseBadge name={assignedDisplayName(sc.id)} />
                <div className={s.cardActions}>
                  <a href={`/tv/screen/${sc.id}?preview`} target="_blank" rel="noreferrer" className={adminStyles.btnGhost} title="Preview">📺</a>
                  <button className={adminStyles.btnGhost} onClick={() => openEdit(sc)} title="Edit">✎</button>
                  {sc.show_pricing && (
                    <button className={s.pricingBtn} title="Choose which prices to show" onClick={() => openPricingModal(sc)}>$</button>
                  )}
                  <EyeButton screen={sc} assignedName={assignedDisplayName(sc.id)} onToggle={toggleVisible} />
                  <button className={adminStyles.btnDanger} onClick={() => deleteScreen(sc.id)} title="Delete">🗑</button>
                  <DuplicateButton screen={sc} onDuplicate={duplicateScreen} />
                </div>
                <EyeHint show={eyeHint === sc.id} name={assignedDisplayName(sc.id)} />
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
            <div className={s.modalBody}>

            <label className={adminStyles.label}>Name</label>
            <input
              className={adminStyles.input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label className={adminStyles.label}>Calendars</label>
            <div className={s.calCheckList}>
              <label className={s.calCheckItem} style={{ fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.all_calendars}
                  onChange={toggleAllCalendars}
                />
                All Calendars
              </label>
              {calendars.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No calendars of this type</span>}
              {calendars.map((c) => (
                <label key={c.id} className={s.calCheckItem} style={form.all_calendars ? { opacity: 0.5 } : undefined}>
                  <input
                    type="checkbox"
                    checked={!form.all_calendars && form.calendar_ids.includes(c.id)}
                    disabled={form.all_calendars}
                    onChange={() => toggleCal(c.id)}
                  />
                  {c.name}
                  {!calendarType && (
                    <span style={{ marginLeft: '0.4em', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      ({CAL_TYPE_LABELS[c.type] || c.type})
                    </span>
                  )}
                </label>
              ))}
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

            {displayType === 'skate' && (<>
              <label className={adminStyles.label}>Days to show</label>
              <select className={adminStyles.select} value={form.days_ahead}
                onChange={(e) => setForm({ ...form, days_ahead: Number(e.target.value) })}>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map((d) => (
                  <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>
                ))}
              </select>
            </>)}

            {displayType === 'figure_skating' && (<>
              <label className={adminStyles.label}>Layout</label>
              <div className={s.toggleRow}>
                <button type="button"
                  className={!form.two_column ? s.toggleActive : s.toggleBtn}
                  onClick={() => setForm({ ...form, two_column: false })}>Single column</button>
                <button type="button"
                  className={form.two_column ? s.toggleActive : s.toggleBtn}
                  onClick={() => setForm({ ...form, two_column: true, show_pricing: false })}>Two columns <span style={{ opacity: 0.6, fontWeight: 400 }}>(max 12 rows each)</span></button>
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
              {form.overflow_mode === 'flow' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
                  Only shows events from the current time onward. Past events are removed automatically.
                </div>
              )}

              <label className={adminStyles.label}>Rotate Interval</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  className={adminStyles.input}
                  type="number"
                  min="1"
                  style={{ width: '80px', marginBottom: 0 }}
                  value={rotateVal}
                  onChange={(e) => setRotateVal(e.target.value)}
                />
                <div className={s.unitToggle}>
                  <button type="button"
                    className={rotateUnit === 'seconds' ? s.unitActive : s.unitBtn}
                    onClick={() => switchRotateUnit('seconds')}>Seconds</button>
                  <button type="button"
                    className={rotateUnit === 'minutes' ? s.unitActive : s.unitBtn}
                    onClick={() => switchRotateUnit('minutes')}>Minutes</button>
                </div>
              </div>
              {form.overflow_mode !== 'rotate' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
                  Only takes effect when Overflow is set to "Rotate pages."
                </div>
              )}
            </>)}

            {displayType === 'games' && (
              <>
                <label className={adminStyles.label}>Page Rotation Interval</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    className={adminStyles.input}
                    type="number"
                    min="1"
                    style={{ width: '80px', marginBottom: 0 }}
                    value={rotateVal}
                    onChange={(e) => setRotateVal(e.target.value)}
                  />
                  <div className={s.unitToggle}>
                    <button type="button"
                      className={rotateUnit === 'seconds' ? s.unitActive : s.unitBtn}
                      onClick={() => switchRotateUnit('seconds')}>Seconds</button>
                    <button type="button"
                      className={rotateUnit === 'minutes' ? s.unitActive : s.unitBtn}
                      onClick={() => switchRotateUnit('minutes')}>Minutes</button>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-0.25rem' }}>
                  Only applies on days with more than 6 events, when the board splits into rotating pages.
                </div>
              </>
            )}

            {(displayType === 'games' || displayType === 'custom') && (() => {
              const hasHockeyCalendar = displayType !== 'custom' ? true : (
                form.all_calendars
                  ? (allCalendars || []).some((c) => c.type === 'hockey_games')
                  : form.calendar_ids.some((id) => (allCalendars || []).find((c) => c.id === id)?.type === 'hockey_games')
              );
              return (
                <label className={s.calCheckItem} style={{ marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={form.show_locker_rooms && hasHockeyCalendar}
                    disabled={!hasHockeyCalendar}
                    onChange={(e) => setForm({ ...form, show_locker_rooms: e.target.checked })}
                  />
                  <span style={{ color: !hasHockeyCalendar ? 'var(--text-light)' : undefined }}>
                    Show Locker Room Numbers
                  </span>
                  {!hasHockeyCalendar && (
                    <span style={{ flexBasis: '100%', fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-light)' }}>
                      Requires a Hockey calendar to be selected
                    </span>
                  )}
                </label>
              );
            })()}

            {displayType !== 'games' && (
              <label className={s.calCheckItem} style={{ marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={form.show_pricing && !(displayType === 'figure_skating' && form.two_column)}
                  disabled={displayType === 'figure_skating' && form.two_column}
                  onChange={(e) => setForm({ ...form, show_pricing: e.target.checked })}
                />
                <span style={{ color: displayType === 'figure_skating' && form.two_column ? 'var(--text-light)' : undefined }}>
                  Show Pricing on this screen
                </span>
                {displayType === 'figure_skating' && form.two_column && (
                  <span style={{ flexBasis: '100%', fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-light)' }}>
                    Unavailable with two-column layout
                  </span>
                )}
              </label>
            )}

            {err && <span className={adminStyles.error}>{err}</span>}
            </div>
            <div className={s.modalActions}>
              <button className={adminStyles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
              <button
                className={adminStyles.btnPrimary}
                onClick={save}
                disabled={!form.all_calendars && form.calendar_ids.length === 0}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {pricingModal && (
        <div className={s.modalBackdrop} onClick={() => setPricingModal(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalTitle}>Pricing — {pricingModal.name}</div>
            <div className={s.modalBody}>
              <div className={s.calCheckList}>
                {(skatePrices || []).length === 0 && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No pricing options configured yet. Add some in Settings.</span>
                )}
                {(skatePrices || []).map((p) => (
                  <label key={p.id} className={s.calCheckItem}>
                    <input
                      type="checkbox"
                      checked={pricingSelection.includes(p.id)}
                      onChange={() => togglePricingId(p.id)}
                    />
                    {p.label}{p.subheading ? ` (${p.subheading})` : ''} — {p.price}
                  </label>
                ))}
              </div>
            </div>
            <div className={s.modalActions}>
              <button className={adminStyles.btnGhost} onClick={() => setPricingModal(null)}>Cancel</button>
              <button className={adminStyles.btnPrimary} onClick={savePricingSelection}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
