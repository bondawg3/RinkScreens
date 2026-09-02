import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import s from './scheduler.module.css';
import {
  applyPlacement, resizeBlock, defaultBlockAt, snap15, DAY_END,
} from './scheduleLayout';

const PAD = 16;            // breathing room above 12 AM and below midnight
const MIN_PX_PER_MIN = 0.34;
const NOFIT = 'Does not fit the available time slot.';
const confirmReplace = () => window.confirm('That time is full. Replace the screen currently scheduled there?');

export const fmtClock = (min) => {
  const h24 = Math.floor(min / 60), m = min % 60;
  if (min >= DAY_END) return '12:00 AM';
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
};
const fmt = fmtClock;

// Vertical day timeline showing the whole 12 AM–12 AM day. `blocks` are engine
// blocks {id, screen_id, start, end} in minutes. Every mutation computes a full
// new day layout and hands it to `onChange`, which persists it (atomic
// day-replace) and refetches.
//
// Reused as a single column in the multi-day views: `scroll={false}` drops the
// own scroll frame, and `onCopyBlock(payload, startMin)` (payload =
// {screen_id, start, end}) enables a per-block copy handle that drags a block
// onto another day's column.
export default function ScheduleTimeline({
  blocks, screensById, onChange, pendingSlot, onSlotClick, zoom = 'fit',
  scroll = true, onCopyBlock,
}) {
  const ref = useRef(null);
  const [fitPxPerMin, setFitPxPerMin] = useState(0.5);
  const pxPerMin = typeof zoom === 'number' ? zoom : fitPxPerMin;
  const [drag, setDrag] = useState(null);   // { id, start, end } live move
  const [resz, setResz] = useState(null);   // { id, start, end } live resize
  const [dropY, setDropY] = useState(null); // px, palette drop hint

  // Fit the day to the viewport: measure the distance from the timeline's top
  // to the bottom of the window and spread 1440 minutes across it. Recompute on
  // resize. A floor keeps it usable on very short windows (the wrapper then
  // scrolls as a fallback).
  useLayoutEffect(() => {
    if (typeof zoom === 'number') return undefined; // fixed zoom, no measuring
    const el = ref.current;
    if (!el) return undefined;
    const recalc = () => {
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - 24;
      setFitPxPerMin(Math.max(MIN_PX_PER_MIN, (avail - PAD * 2) / DAY_END));
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [zoom]);

  // Drag/resize attach their pointer listeners to `window` and normally detach
  // on pointerup. If the component unmounts mid-drag that never fires, so keep
  // a handle to the teardown and run it on unmount.
  const dragCleanupRef = useRef(null);
  useEffect(() => () => { if (dragCleanupRef.current) dragCleanupRef.current(); }, []);

  const yToMin = (clientY) => {
    const rect = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(DAY_END, (clientY - rect.top - PAD) / pxPerMin));
  };

  // Applies a placeBlock-style result, handling the replace prompt / no-fit.
  function commit(candidate, others) {
    const next = applyPlacement(others, candidate, confirmReplace, () => window.alert(NOFIT));
    if (next) onChange(next);
  }

  // ── Move an existing block (pointer drag on its body) ──
  function startMove(e, block) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const dur = block.end - block.start;
    const clamp = (ev) => Math.max(0, Math.min(DAY_END - dur, snap15(block.start + (ev.clientY - startY) / pxPerMin)));
    const move = (ev) => {
      const start = clamp(ev);
      setDrag({ id: block.id, start, end: start + dur });
    };
    const up = (ev) => {
      detach();
      setDrag(null);
      const start = clamp(ev);
      if (start === block.start) return;
      const others = blocks.filter((b) => b.id !== block.id);
      commit({ id: block.id, screen_id: block.screen_id, start, end: start + dur }, others);
    };
    const detach = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragCleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    dragCleanupRef.current = detach;
  }

  // ── Resize a block edge ──
  function startResize(e, block, edge) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const anchorY = e.clientY;
    const origin = edge === 'top' ? block.start : block.end;
    const move = (ev) => {
      const raw = origin + (ev.clientY - anchorY) / pxPerMin;
      const next = resizeBlock(blocks, block.id, edge === 'top' ? 'start' : 'end', raw);
      if (next) setResz({ id: block.id, ...next });
    };
    const up = (ev) => {
      detach();
      setResz(null);
      const raw = origin + (ev.clientY - anchorY) / pxPerMin;
      const next = resizeBlock(blocks, block.id, edge === 'top' ? 'start' : 'end', raw);
      if (next) onChange(blocks.map((b) => (b.id === block.id ? { ...b, ...next } : b)));
    };
    const detach = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragCleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    dragCleanupRef.current = detach;
  }

  function deleteBlock(block) {
    onChange(blocks.filter((b) => b.id !== block.id));
  }

  function makeWholeDay(block) {
    const others = blocks.filter((b) => b.id !== block.id);
    if (others.length && !window.confirm("Replace the whole day's schedule with this screen?")) return;
    onChange([{ ...block, start: 0, end: DAY_END }]);
  }

  // ── Click an empty part of the day → ask the parent to start an "add here" ──
  function onBackgroundClick(e) {
    // ignore clicks that land on a block or its controls
    if (e.target.closest(`.${s.block}`)) return;
    onSlotClick && onSlotClick(snap15(yToMin(e.clientY)));
  }

  // ── Drop: a screen from the palette, or a block copied from another day ──
  function onDrop(e) {
    e.preventDefault();
    setDropY(null);
    const copied = e.dataTransfer.getData('text/copy-block');
    if (copied && onCopyBlock) {
      try {
        const p = JSON.parse(copied);
        onCopyBlock(p, snap15(yToMin(e.clientY)));
      } catch { /* ignore malformed payload */ }
      return;
    }
    const screenId = Number(e.dataTransfer.getData('text/screen-id'));
    if (!screenId) return;
    const { start, end } = defaultBlockAt(yToMin(e.clientY));
    commit({ screen_id: screenId, start, end }, blocks);
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { start, end } = defaultBlockAt(yToMin(e.clientY));
    setDropY({ top: PAD + start * pxPerMin, height: (end - start) * pxPerMin });
  }

  // Overlay live drag/resize positions onto the rendered blocks
  const view = blocks.map((b) => {
    if (drag && drag.id === b.id) return { ...b, start: drag.start, end: drag.end };
    if (resz && resz.id === b.id) return { ...b, start: resz.start, end: resz.end };
    return b;
  });

  const pending = pendingSlot != null ? defaultBlockAt(pendingSlot) : null;

  const grid = (
    <div
      ref={ref}
      className={s.timeline}
      style={{ height: DAY_END * pxPerMin + PAD * 2 }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDropY(null)}
      onClick={onBackgroundClick}
    >
      <div className={s.gutter} />
      {Array.from({ length: 25 }, (_, h) => (
        <div key={`l${h}`} className={s.hourLine} style={{ top: PAD + h * 60 * pxPerMin }} />
      ))}
      {Array.from({ length: 96 }, (_, q) => (q % 4 === 0 ? null : (
        <div key={`q${q}`} className={s.quarterLine} style={{ top: PAD + q * 15 * pxPerMin }} />
      )))}
      {Array.from({ length: 25 }, (_, h) => (
        <div key={`t${h}`} className={s.hourLabel} style={{ top: PAD + h * 60 * pxPerMin }}>
          {fmt(Math.min(h * 60, DAY_END - 1)).replace(':00', '')}
        </div>
      ))}

      {dropY && <div className={s.dropHint} style={{ top: dropY.top, height: dropY.height }} />}
      {pending && (
        <div
          className={s.pendingSlot}
          style={{ top: PAD + pending.start * pxPerMin, height: (pending.end - pending.start) * pxPerMin }}
        >
          Pick a screen →
        </div>
      )}

      {view.map((b) => {
        const screen = screensById[b.screen_id];
        const live = (drag && drag.id === b.id) || (resz && resz.id === b.id);
        return (
          <div
            key={b.id ?? 'new'}
            className={s.block + (live ? ' ' + s.dragging : '')}
            style={{ top: PAD + b.start * pxPerMin, height: (b.end - b.start) * pxPerMin }}
            onPointerDown={(e) => startMove(e, b)}
          >
            <div className={s.resizeHandle + ' ' + s.top} onPointerDown={(e) => startResize(e, b, 'top')} />
            <div className={s.blockLabel}>
              {screen ? screen.name : `Screen ${b.screen_id}`}
              <div className={s.blockTime}>{fmt(b.start)} – {fmt(b.end)}</div>
            </div>
            <div className={s.blockActions}>
              {onCopyBlock && (
                <span
                  className={s.blockBtn}
                  title="Drag to another day to copy"
                  draggable
                  onPointerDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/copy-block', JSON.stringify({
                      screen_id: b.screen_id, start: b.start, end: b.end,
                    }));
                  }}
                >⧉</span>
              )}
              <button className={s.blockBtn} title="Whole day" onPointerDown={(e) => e.stopPropagation()} onClick={() => makeWholeDay(b)}>⤢</button>
              <button className={s.blockBtn} title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => deleteBlock(b)}>🗑</button>
            </div>
            <div className={s.resizeHandle + ' ' + s.bottom} onPointerDown={(e) => startResize(e, b, 'bottom')} />
          </div>
        );
      })}
    </div>
  );

  if (!scroll) return grid;
  return <div style={{ maxHeight: '92vh', overflowY: 'auto' }}>{grid}</div>;
}
