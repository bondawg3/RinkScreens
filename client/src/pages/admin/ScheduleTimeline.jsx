import React, { useEffect, useRef, useState } from 'react';
import s from './scheduler.module.css';
import { placeBlock, resizeBlock, defaultBlockAt, snap15, toHHMM, DAY_END } from './scheduleLayout';

const PX_PER_MIN = 1;      // 1440px tall day
const PAD = 16;            // breathing room above 12 AM and below midnight
const NOFIT = 'Does not fit the available time slot.';

const fmt = (min) => {
  const h24 = Math.floor(min / 60), m = min % 60;
  if (min >= DAY_END) return '12:00 AM';
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
};

// Vertical day timeline. `blocks` are engine blocks {id, screen_id, start, end}
// in minutes. Every mutation computes a full new day layout and hands it to
// `onChange`, which persists it (atomic day-replace) and refetches.
export default function ScheduleTimeline({ blocks, screensById, onChange }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);   // { id, start, end } live move
  const [resz, setResz] = useState(null);   // { id, start, end } live resize
  const [dropY, setDropY] = useState(null); // px, palette drop hint

  // Drag/resize attach their pointer listeners to `window` and normally detach
  // on pointerup. If the component unmounts mid-drag that never fires, so keep
  // a handle to the teardown and run it on unmount.
  const dragCleanupRef = useRef(null);
  useEffect(() => () => { if (dragCleanupRef.current) dragCleanupRef.current(); }, []);

  const yToMin = (clientY) => {
    const rect = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(DAY_END, clientY - rect.top - PAD));
  };

  // Applies a placeBlock result, handling the replace prompt and no-fit message.
  function commitPlacement(result, candidate, others) {
    if (result.ok) return onChange(result.blocks);
    if (result.reason === 'replace') {
      if (!window.confirm('That time is full. Replace the screen currently scheduled there?')) return;
      const without = others.filter((b) => b.id !== result.targetId);
      const retry = placeBlock(without, candidate);
      if (retry.ok) return onChange(retry.blocks);
    }
    window.alert(NOFIT);
  }

  // ── Move an existing block (pointer drag on its body) ──
  function startMove(e, block) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const dur = block.end - block.start;
    const move = (ev) => {
      const raw = block.start + (ev.clientY - startY) / PX_PER_MIN;
      let start = Math.max(0, Math.min(DAY_END - dur, snap15(raw)));
      setDrag({ id: block.id, start, end: start + dur });
    };
    const up = (ev) => {
      detach();
      setDrag(null);
      const raw = block.start + (ev.clientY - startY) / PX_PER_MIN;
      let start = Math.max(0, Math.min(DAY_END - dur, snap15(raw)));
      if (start === block.start) return;
      const others = blocks.filter((b) => b.id !== block.id);
      const candidate = { id: block.id, screen_id: block.screen_id, start, end: start + dur };
      commitPlacement(placeBlock(others, candidate), candidate, others);
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
      const raw = origin + (ev.clientY - anchorY) / PX_PER_MIN;
      const next = resizeBlock(blocks, block.id, edge === 'top' ? 'start' : 'end', raw);
      if (next) setResz({ id: block.id, ...next });
    };
    const up = (ev) => {
      detach();
      setResz(null);
      const raw = origin + (ev.clientY - anchorY) / PX_PER_MIN;
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

  // ── Palette drop ──
  function onDrop(e) {
    e.preventDefault();
    setDropY(null);
    const screenId = Number(e.dataTransfer.getData('text/screen-id'));
    if (!screenId) return;
    const { start, end } = defaultBlockAt(yToMin(e.clientY));
    const candidate = { screen_id: screenId, start, end };
    commitPlacement(placeBlock(blocks, candidate), candidate, blocks);
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { start, end } = defaultBlockAt(yToMin(e.clientY));
    setDropY({ top: PAD + start * PX_PER_MIN, height: (end - start) * PX_PER_MIN });
  }

  // Overlay live drag/resize positions onto the rendered blocks
  const view = blocks.map((b) => {
    if (drag && drag.id === b.id) return { ...b, start: drag.start, end: drag.end };
    if (resz && resz.id === b.id) return { ...b, start: resz.start, end: resz.end };
    return b;
  });

  return (
    <div style={{ maxHeight: '86vh', overflowY: 'auto' }}>
      <div
        ref={ref}
        className={s.timeline}
        style={{ height: DAY_END * PX_PER_MIN + PAD * 2 }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDropY(null)}
      >
        <div className={s.gutter} />
        {Array.from({ length: 25 }, (_, h) => (
          <div key={`l${h}`} className={s.hourLine} style={{ top: PAD + h * 60 * PX_PER_MIN }} />
        ))}
        {Array.from({ length: 96 }, (_, q) => (q % 4 === 0 ? null : (
          <div key={`q${q}`} className={s.quarterLine} style={{ top: PAD + q * 15 * PX_PER_MIN }} />
        )))}
        {Array.from({ length: 25 }, (_, h) => (
          <div key={`t${h}`} className={s.hourLabel} style={{ top: PAD + h * 60 * PX_PER_MIN }}>
            {fmt(Math.min(h * 60, DAY_END - 1)).replace(':00', '')}
          </div>
        ))}

        {dropY && <div className={s.dropHint} style={{ top: dropY.top, height: dropY.height }} />}

        {view.map((b) => {
          const screen = screensById[b.screen_id];
          const live = (drag && drag.id === b.id) || (resz && resz.id === b.id);
          return (
            <div
              key={b.id ?? 'new'}
              className={s.block + (live ? ' ' + s.dragging : '')}
              style={{ top: PAD + b.start * PX_PER_MIN, height: (b.end - b.start) * PX_PER_MIN }}
              onPointerDown={(e) => startMove(e, b)}
            >
              <div className={s.resizeHandle + ' ' + s.top} onPointerDown={(e) => startResize(e, b, 'top')} />
              <div className={s.blockLabel}>
                {screen ? screen.name : `Screen ${b.screen_id}`}
                <div className={s.blockTime}>{fmt(b.start)} – {fmt(b.end)}</div>
              </div>
              <div className={s.blockActions}>
                <button className={s.blockBtn} title="Whole day" onPointerDown={(e) => e.stopPropagation()} onClick={() => makeWholeDay(b)}>⤢</button>
                <button className={s.blockBtn} title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => deleteBlock(b)}>🗑</button>
              </div>
              <div className={s.resizeHandle + ' ' + s.bottom} onPointerDown={(e) => startResize(e, b, 'bottom')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
