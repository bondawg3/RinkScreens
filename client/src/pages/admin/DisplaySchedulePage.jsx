import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import s from './scheduler.module.css';
import ScheduleTimeline from './ScheduleTimeline';
import ScheduleMultiDay from './ScheduleMultiDay';
import ScreenPalette, { SCREEN_TYPES } from './ScreenPalette';
import {
  toMin, toHHMM, addDays, weekRange, applyPlacement, defaultBlockAt, firstFreeSlot, snap15, DAY_END,
} from './scheduleLayout';
import DuplicateDialog from './DuplicateDialog';
import { todayStr } from '../../utils/date';

const MAX_DAYS_AHEAD = 31;
const fmtDay = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const DEFAULT_PREFS = {
  swap_sides: false, grid_density: 3, week_start: 0, hidden_types: [],
  timeline_zoom: 'comfortable', view: 'day',
};

// px-per-minute for each zoom choice; 'fit' is computed from the viewport.
export const ZOOM_LEVELS = { fit: 'fit', comfortable: 0.9, large: 1.4 };
const VIEW_SPANS = { day: 1, '3day': 3, week: 7 };

const confirmReplace = () => window.confirm('That time is full. Replace the screen currently scheduled there?');
const alertNoFit = () => window.alert('Does not fit the available time slot.');

export default function DisplaySchedulePage() {
  const { displayId } = useParams();
  const navigate = useNavigate();
  const { data: displays } = useApi('/displays');
  const { data: screens } = useApi('/screens');
  const { data: settings } = useApi('/settings');

  const [date, setDate] = useState(todayStr());
  const [byDate, setByDate] = useState({});
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [err, setErr] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  // { date, min } of an empty slot the user clicked, waiting for a screen pick.
  const [pendingSlot, setPendingSlot] = useState(null);
  const [dupKind, setDupKind] = useState(null); // 'day' | 'week' | null

  const view = VIEW_SPANS[prefs.view] ? prefs.view : 'day';
  const screensById = useMemo(
    () => Object.fromEntries((screens || []).map((sc) => [sc.id, sc])),
    [screens],
  );

  // The days on screen for the current view, anchored on `date`.
  const visibleDates = useMemo(() => {
    if (view === 'week') {
      const { start } = weekRange(date, prefs.week_start);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return Array.from({ length: VIEW_SPANS[view] }, (_, i) => addDays(date, i));
  }, [view, date, prefs.week_start]);
  const rangeFrom = visibleDates[0];
  const rangeTo = visibleDates[visibleDates.length - 1];

  // Hydrate prefs from server once settings arrive
  useEffect(() => {
    if (settings && settings.schedule_prefs) setPrefs({ ...DEFAULT_PREFS, ...settings.schedule_prefs });
  }, [settings]);

  const loadRange = useCallback(async () => {
    const rows = await apiFetch(`/displays/${displayId}/schedule?from=${rangeFrom}&to=${rangeTo}`);
    const map = {};
    (rows || []).forEach((r) => {
      (map[r.date] ||= []).push({
        id: r.id, screen_id: r.content_screen_id,
        start: toMin(r.start_time), end: toMin(r.end_time),
      });
    });
    setByDate(map);
  }, [displayId, rangeFrom, rangeTo]);

  useEffect(() => { loadRange().catch((ex) => setErr(ex.message)); }, [loadRange]);

  // Abandon an in-progress "add here" / dialog when the range or display changes
  useEffect(() => { setPendingSlot(null); setDupKind(null); }, [rangeFrom, rangeTo, displayId]);
  useEffect(() => {
    if (pendingSlot == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPendingSlot(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingSlot]);

  // Persist a full new layout for one day (atomic replace), then refetch the range
  async function saveDay(dayDate, engineBlocks) {
    setErr(''); setCopyMsg('');
    try {
      await apiFetch(`/displays/${displayId}/schedule/day`, {
        method: 'PUT',
        body: JSON.stringify({
          date: dayDate,
          blocks: engineBlocks.map((b) => ({
            start_time: toHHMM(b.start), end_time: toHHMM(b.end), content_screen_id: b.screen_id,
          })),
        }),
      });
      await loadRange();
    } catch (ex) { setErr(ex.message); }
  }

  // Add `screenId` at the pending slot if one is set, otherwise at the first
  // free hour of the anchor day. Shared by click-empty-slot and right-click.
  function addScreen(screenId) {
    setErr(''); setCopyMsg('');
    const targetDate = pendingSlot ? pendingSlot.date : date;
    const dayBlocks = byDate[targetDate] || [];
    let startMin = pendingSlot ? pendingSlot.min : firstFreeSlot(dayBlocks);
    if (startMin == null) { setErr('No free hour left in the day.'); return; }
    const { start, end } = defaultBlockAt(startMin);
    const next = applyPlacement(
      dayBlocks, { screen_id: Number(screenId), start, end }, confirmReplace, alertNoFit,
    );
    setPendingSlot(null);
    if (next) saveDay(targetDate, next);
  }

  // A block dragged by its copy handle onto `toDate`'s column, dropped at startMin.
  function copyToDay(payload, startMin, toDate) {
    setErr(''); setCopyMsg('');
    const dur = payload.end - payload.start;
    let start = snap15(startMin);
    if (start + dur > DAY_END) start = DAY_END - dur;
    const next = applyPlacement(
      byDate[toDate] || [], { screen_id: payload.screen_id, start, end: start + dur },
      confirmReplace, alertNoFit,
    );
    if (next) saveDay(toDate, next);
  }

  async function savePrefs(next) {
    setPrefs(next);
    try {
      await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ schedule_prefs: next }) });
    } catch (ex) { setErr(ex.message); }
  }

  // Passed to DuplicateDialog; it drives the preview/apply steps itself. After
  // an apply that actually writes, refetch so any now-visible destination day
  // (3-day / week views) shows the copied blocks.
  function copyApi(body) {
    setErr(''); setCopyMsg('');
    const p = apiFetch(`/displays/${displayId}/schedule/copy`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (body.mode !== 'preview') p.then(() => loadRange()).catch(() => {});
    return p;
  }

  function toggleType(type) {
    const hidden = new Set(prefs.hidden_types);
    hidden.has(type) ? hidden.delete(type) : hidden.add(type);
    savePrefs({ ...prefs, hidden_types: [...hidden] });
  }

  function setAllTypes(show) {
    savePrefs({ ...prefs, hidden_types: show ? [] : SCREEN_TYPES.map((t) => t.value) });
  }

  const maxDate = addDays(todayStr(), MAX_DAYS_AHEAD);
  const displayList = displays || [];
  const dispIdx = displayList.findIndex((d) => String(d.id) === String(displayId));
  const goToDisplay = (id) => navigate(`/admin/displays/${id}/schedule`);

  const zoomVal = ZOOM_LEVELS[prefs.timeline_zoom] ?? ZOOM_LEVELS.comfortable;
  // Multi-day columns are too narrow to measure a sensible "fit"; use a fixed scale.
  const multiZoom = typeof zoomVal === 'number' ? zoomVal : ZOOM_LEVELS.comfortable;
  const step = VIEW_SPANS[view];

  const board = view === 'day' ? (
    <div className={s.timelinePane}>
      <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{fmtDay(date)}</div>
      <ScheduleTimeline
        blocks={byDate[date] || []}
        screensById={screensById}
        onChange={(blocks) => saveDay(date, blocks)}
        pendingSlot={pendingSlot && pendingSlot.date === date ? pendingSlot.min : null}
        onSlotClick={(min) => setPendingSlot({ date, min })}
        zoom={zoomVal}
      />
    </div>
  ) : (
    <div className={s.timelinePaneWide}>
      <ScheduleMultiDay
        dates={visibleDates}
        byDate={byDate}
        screensById={screensById}
        onChangeDay={saveDay}
        onCopyToDay={copyToDay}
        pendingSlot={pendingSlot}
        onSlotClick={setPendingSlot}
        zoom={multiZoom}
      />
    </div>
  );

  const palette = (
    <div className={s.palettePane}>
      {pendingSlot != null && (
        <div className={s.pendingHint}>
          Click a screen below to schedule it{view === 'day' ? ' here' : ` on ${fmtDay(pendingSlot.date)}`}, or press Esc to cancel.
          <button className={styles.btnGhost} onClick={() => setPendingSlot(null)}>Cancel</button>
        </div>
      )}
      <ScreenPalette
        screens={screens}
        hiddenTypes={prefs.hidden_types}
        density={prefs.grid_density}
        onToggleType={toggleType}
        onSetAllTypes={setAllTypes}
        onDensity={(n) => savePrefs({ ...prefs, grid_density: n })}
        pickMode={pendingSlot != null}
        onPickScreen={addScreen}
      />
    </div>
  );

  return (
    <div className={s.page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 className={styles.heading} style={{ margin: 0 }}>Schedule</h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            className={styles.btnGhost}
            title="Previous display"
            disabled={dispIdx <= 0}
            onClick={() => goToDisplay(displayList[dispIdx - 1].id)}
          >‹</button>
          <select
            className={styles.input}
            style={{ width: 'auto' }}
            value={displayId}
            onChange={(e) => goToDisplay(e.target.value)}
          >
            {dispIdx < 0 && <option value={displayId}>Display {displayId}</option>}
            {displayList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button
            className={styles.btnGhost}
            title="Next display"
            disabled={dispIdx < 0 || dispIdx >= displayList.length - 1}
            onClick={() => goToDisplay(displayList[dispIdx + 1].id)}
          >›</button>
        </span>
      </div>

      <div className={s.toolbar}>
        <button
          className={styles.btnGhost}
          onClick={() => setDate(addDays(date, -step))}
          disabled={rangeFrom <= todayStr()}
        >‹ Prev</button>
        <input
          type="date" className={styles.input} style={{ width: 'auto' }}
          value={date} min={todayStr()} max={maxDate}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <button
          className={styles.btnGhost}
          onClick={() => setDate(addDays(date, step))}
          disabled={rangeTo >= maxDate}
        >Next ›</button>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
          View
          <select value={view} onChange={(e) => savePrefs({ ...prefs, view: e.target.value })}>
            <option value="day">Day</option>
            <option value="3day">3 days</option>
            <option value="week">Week</option>
          </select>
        </span>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          Week starts
          <select value={prefs.week_start} onChange={(e) => savePrefs({ ...prefs, week_start: Number(e.target.value) })}>
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
          </select>
        </span>

        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem' }}>
          <button className={styles.btnGhost} onClick={() => setDupKind('day')}>Duplicate day…</button>
          <button className={styles.btnGhost} onClick={() => setDupKind('week')}>Duplicate week…</button>
        </span>
      </div>

      <div className={s.toolbar} style={prefs.swap_sides ? { justifyContent: 'flex-end' } : undefined}>
        <button className={styles.btnGhost} onClick={() => savePrefs({ ...prefs, swap_sides: !prefs.swap_sides })}>
          ⇄ Swap sides
        </button>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          Zoom
          <select
            value={prefs.timeline_zoom || 'comfortable'}
            onChange={(e) => savePrefs({ ...prefs, timeline_zoom: e.target.value })}
          >
            <option value="fit">Fit to screen</option>
            <option value="comfortable">Comfortable</option>
            <option value="large">Large</option>
          </select>
        </span>
      </div>

      {dupKind && (
        <DuplicateDialog
          kind={dupKind}
          date={date}
          weekStart={prefs.week_start}
          maxDate={maxDate}
          onCopy={copyApi}
          onResult={setCopyMsg}
          onClose={() => setDupKind(null)}
        />
      )}

      {copyMsg && <span className={styles.muted}>{copyMsg}</span>}
      {err && <span className={styles.error}>{err}</span>}

      <div className={s.split + (prefs.swap_sides ? ' ' + s.swapped : '')}>
        {board}
        {palette}
      </div>
    </div>
  );
}
