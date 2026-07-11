import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi, apiFetch } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import s from './scheduler.module.css';
import ScheduleTimeline from './ScheduleTimeline';
import ScreenPalette from './ScreenPalette';
import { toMin, toHHMM, addDays, weekRange } from './scheduleLayout';

const MAX_DAYS_AHEAD = 31;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDay = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const DEFAULT_PREFS = { swap_sides: false, grid_density: 3, week_start: 0, hidden_types: [] };

export default function DisplaySchedulePage() {
  const { displayId } = useParams();
  const { data: displays } = useApi('/displays');
  const { data: screens } = useApi('/screens');
  const { data: settings } = useApi('/settings');

  const [date, setDate] = useState(todayStr());
  const [blocks, setBlocks] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [err, setErr] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  const display = (displays || []).find((d) => String(d.id) === String(displayId));
  const screensById = useMemo(
    () => Object.fromEntries((screens || []).map((sc) => [sc.id, sc])),
    [screens],
  );

  // Hydrate prefs from server once settings arrive
  useEffect(() => {
    if (settings && settings.schedule_prefs) setPrefs({ ...DEFAULT_PREFS, ...settings.schedule_prefs });
  }, [settings]);

  const loadDay = useCallback(async () => {
    const rows = await apiFetch(`/displays/${displayId}/schedule?from=${date}&to=${date}`);
    setBlocks((rows || []).map((r) => ({
      id: r.id, screen_id: r.content_screen_id,
      start: toMin(r.start_time), end: toMin(r.end_time),
    })));
  }, [displayId, date]);

  useEffect(() => { loadDay().catch((ex) => setErr(ex.message)); }, [loadDay]);

  // Persist a full new day layout (atomic replace), then refetch
  async function saveDay(engineBlocks) {
    setErr(''); setCopyMsg('');
    try {
      await apiFetch(`/displays/${displayId}/schedule/day`, {
        method: 'PUT',
        body: JSON.stringify({
          date,
          blocks: engineBlocks.map((b) => ({
            start_time: toHHMM(b.start), end_time: toHHMM(b.end), content_screen_id: b.screen_id,
          })),
        }),
      });
      await loadDay();
    } catch (ex) { setErr(ex.message); }
  }

  async function savePrefs(next) {
    setPrefs(next);
    try {
      await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ schedule_prefs: next }) });
    } catch (ex) { setErr(ex.message); }
  }

  async function copyRange(from_start, from_end, to_start, label) {
    setErr(''); setCopyMsg('');
    try {
      const r = await apiFetch(`/displays/${displayId}/schedule/copy`, {
        method: 'POST',
        body: JSON.stringify({ from_start, from_end, to_start }),
      });
      setCopyMsg(`Copied ${label}: ${r.created} block(s)${r.skipped ? `, skipped ${r.skipped} overlapping` : ''}.`);
    } catch (ex) { setErr(ex.message); }
  }

  function toggleType(type) {
    const hidden = new Set(prefs.hidden_types);
    hidden.has(type) ? hidden.delete(type) : hidden.add(type);
    savePrefs({ ...prefs, hidden_types: [...hidden] });
  }

  const maxDate = addDays(todayStr(), MAX_DAYS_AHEAD);
  const week = weekRange(date, prefs.week_start);
  const nextDay = addDays(date, 1);

  const timeline = (
    <div className={s.timelinePane}>
      <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{fmtDay(date)}</div>
      <ScheduleTimeline blocks={blocks} screensById={screensById} onChange={saveDay} />
    </div>
  );
  const palette = (
    <div className={s.palettePane}>
      <ScreenPalette
        screens={screens}
        hiddenTypes={prefs.hidden_types}
        density={prefs.grid_density}
        onToggleType={toggleType}
        onDensity={(n) => savePrefs({ ...prefs, grid_density: n })}
      />
    </div>
  );

  return (
    <div className={s.page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link to="/admin/displays" className={styles.btnGhost}>← Displays</Link>
        <h2 className={styles.heading} style={{ margin: 0 }}>
          Schedule — {display ? display.name : `Display ${displayId}`}
        </h2>
      </div>

      <div className={s.toolbar}>
        <button className={styles.btnGhost} onClick={() => setDate(addDays(date, -1))} disabled={date <= todayStr()}>‹ Prev</button>
        <input
          type="date" className={styles.input} style={{ width: 'auto' }}
          value={date} min={todayStr()} max={maxDate}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <button className={styles.btnGhost} onClick={() => setDate(addDays(date, 1))} disabled={date >= maxDate}>Next ›</button>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
          Week starts
          <select value={prefs.week_start} onChange={(e) => savePrefs({ ...prefs, week_start: Number(e.target.value) })}>
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
          </select>
        </span>

        <button className={styles.btnGhost} onClick={() => savePrefs({ ...prefs, swap_sides: !prefs.swap_sides })}>
          ⇄ Swap sides
        </button>

        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem' }}>
          <button
            className={styles.btnGhost}
            title={`Copy ${date} to ${nextDay}`}
            disabled={nextDay > maxDate}
            onClick={() => copyRange(date, date, nextDay, 'day → next day')}
          >Duplicate day →</button>
          <button
            className={styles.btnGhost}
            title={`Copy week of ${week.start} to the following week`}
            disabled={addDays(week.start, 7) > maxDate}
            onClick={() => copyRange(week.start, week.end, addDays(week.start, 7), 'week → next week')}
          >Duplicate week →</button>
        </span>
      </div>

      {copyMsg && <span className={styles.muted}>{copyMsg}</span>}
      {err && <span className={styles.error}>{err}</span>}

      <div className={s.split + (prefs.swap_sides ? ' ' + s.swapped : '')}>
        {timeline}
        {palette}
      </div>
    </div>
  );
}
