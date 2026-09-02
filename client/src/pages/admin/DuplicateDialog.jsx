import React, { useState } from 'react';
import Modal from './Modal';
import styles from './AdminTab.module.css';
import { addDays, weekRange } from './scheduleLayout';
import { todayStr } from '../../utils/date';

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * Two-step duplicate flow for a day or a week:
 *   1. pick a destination (presets or a specific date)
 *   2. if any destination day already has overlapping blocks, choose skip or
 *      replace for each of those days, then apply.
 *
 * `onCopy(body)` posts to /displays/:id/schedule/copy and returns the response
 * (body carries { from_start, from_end, to_start, mode?, resolutions? }).
 */
export default function DuplicateDialog({ kind, date, weekStart, maxDate, onCopy, onResult, onClose }) {
  const week = weekRange(date, weekStart);
  const fromStart = kind === 'week' ? week.start : date;
  const fromEnd = kind === 'week' ? week.end : date;
  const span = kind === 'week' ? 6 : 0;

  const presets = kind === 'day'
    ? [
        { label: 'Tomorrow', to: addDays(date, 1) },
        { label: 'Same day next week', to: addDays(date, 7) },
      ]
    : [
        { label: 'Next week', to: addDays(week.start, 7) },
        { label: 'In two weeks', to: addDays(week.start, 14) },
      ];

  const [choice, setChoice] = useState('0');   // preset index as string, or 'custom'
  const [customDate, setCustomDate] = useState(addDays(fromStart, kind === 'week' ? 7 : 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [conflicts, setConflicts] = useState(null); // [{date, incoming, existing, conflicting}]
  const [resolutions, setResolutions] = useState({});

  const dest = choice === 'custom' ? customDate : presets[Number(choice)].to;
  const destEnd = addDays(dest, span);
  const tooFar = maxDate && destEnd > maxDate;
  const inPast = dest < todayStr();

  async function run(body) {
    setBusy(true); setErr('');
    try {
      return await onCopy(body);
    } catch (ex) {
      setErr(ex.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    const r = await run({ from_start: fromStart, from_end: fromEnd, to_start: dest, mode: 'preview' });
    if (!r) return;
    if (!r.conflictDates.length) return apply({});
    setConflicts(r.conflictDates);
    setResolutions(Object.fromEntries(r.conflictDates.map((c) => [c.date, 'skip'])));
  }

  async function apply(res) {
    const r = await run({ from_start: fromStart, from_end: fromEnd, to_start: dest, mode: 'apply', resolutions: res });
    if (!r) return;
    const parts = [`${r.created} block${r.created === 1 ? '' : 's'} copied`];
    if (r.replaced) parts.push(`${r.replaced} replaced`);
    if (r.skipped) parts.push(`${r.skipped} skipped`);
    onResult(parts.join(', ') + '.');
    onClose();
  }

  const title = `Duplicate ${kind === 'week' ? `week of ${fmtDate(fromStart)}` : fmtDate(date)}`;

  // ── Step 2: resolve conflicts ──
  if (conflicts) {
    return (
      <Modal
        onClose={onClose}
        title={title}
        width={440}
        footer={(
          <>
            <button type="button" className={styles.btnGhost} onClick={() => setConflicts(null)} disabled={busy}>Back</button>
            <button type="button" className={styles.btnPrimary} onClick={() => apply(resolutions)} disabled={busy}>Duplicate</button>
          </>
        )}
      >
        <p className={styles.muted} style={{ margin: 0 }}>
          {conflicts.length === 1 ? 'One destination day already has' : `${conflicts.length} destination days already have`} overlapping blocks. Choose what to do with each:
        </p>
        {conflicts.map((c) => (
          <div key={c.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600 }}>
              {fmtDate(c.date)}
              <span className={styles.muted} style={{ fontWeight: 400 }}> · {c.conflicting} conflict{c.conflicting === 1 ? '' : 's'}</span>
            </span>
            <span style={{ display: 'inline-flex', gap: '0.75rem', fontSize: '0.85rem' }}>
              <label><input type="radio" name={`r-${c.date}`} checked={resolutions[c.date] === 'skip'} onChange={() => setResolutions((p) => ({ ...p, [c.date]: 'skip' }))} /> Skip</label>
              <label><input type="radio" name={`r-${c.date}`} checked={resolutions[c.date] === 'replace'} onChange={() => setResolutions((p) => ({ ...p, [c.date]: 'replace' }))} /> Replace</label>
            </span>
          </div>
        ))}
        {err && <span className={styles.error}>{err}</span>}
      </Modal>
    );
  }

  // ── Step 1: pick destination ──
  return (
    <Modal
      onClose={onClose}
      title={title}
      width={420}
      footer={(
        <>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={styles.btnPrimary} onClick={next} disabled={busy || tooFar || inPast}>Continue</button>
        </>
      )}
    >
      {presets.map((p, i) => (
        <label key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="radio" name="dup-dest" checked={choice === String(i)} onChange={() => setChoice(String(i))} />
          {p.label} <span className={styles.muted}>({fmtDate(p.to)}{kind === 'week' ? ` – ${fmtDate(addDays(p.to, 6))}` : ''})</span>
        </label>
      ))}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input type="radio" name="dup-dest" checked={choice === 'custom'} onChange={() => setChoice('custom')} />
        {kind === 'week' ? 'Week starting' : 'On date'}
        <input
          type="date"
          className={styles.input}
          style={{ width: 'auto' }}
          value={customDate}
          min={todayStr()}
          max={maxDate}
          onFocus={() => setChoice('custom')}
          onChange={(e) => e.target.value && setCustomDate(e.target.value)}
        />
      </label>
      {tooFar && <span className={styles.error}>That date is beyond the scheduling window.</span>}
      {inPast && !tooFar && <span className={styles.error}>Pick a date in the future.</span>}
      {err && <span className={styles.error}>{err}</span>}
    </Modal>
  );
}
