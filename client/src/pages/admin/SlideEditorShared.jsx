import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import s from './AnnouncementTab.module.css';

export const FONTS = [
  'Arial', 'Verdana', 'Trebuchet MS', 'Georgia',
  'Times New Roman', 'Impact', 'Courier New', 'Palatino Linotype',
  'Orbitron', 'Share Tech Mono', 'DS-Digital', 'DSEG14 Classic', 'DSEG7 Classic',
];

// Renders just the two step buttons + the range input (no wrapping div) so
// callers can drop it into an existing row — either bare (wrap it in a
// propRow-styled div) or alongside a paired number field that already
// occupies that row. Always steps by 1 unit regardless of the slider's own
// `step` (which is tuned for drag granularity, not click-to-nudge), per the
// explicit ask for one-pixel/one-percent nudges.
export function SteppedSlider({ value, min, max, step = 1, onChange }) {
  function nudge(dir) {
    const next = Math.min(max, Math.max(min, Math.round((value + dir) * 100) / 100));
    onChange(next);
  }
  return (
    <>
      <button type="button" className={s.stepBtn} onClick={() => nudge(-1)} disabled={value <= min} title="Decrease by 1">−</button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <button type="button" className={s.stepBtn} onClick={() => nudge(1)} disabled={value >= max} title="Increase by 1">+</button>
    </>
  );
}

// A number input with big, easy-to-click +/- buttons in place of the
// browser's tiny native spinner arrows (hidden via .numInputStepped in CSS).
// Typing a value directly still works same as before.
export function SteppedNumberInput({ value, min, max, step = 1, onChange, className, style }) {
  function nudge(dir) {
    let next = (Number(value) || 0) + dir * step;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    onChange(next);
  }
  return (
    <div className={s.numStepRow} style={style}>
      <button type="button" className={s.stepBtn} onClick={() => nudge(-1)} title="Decrease">−</button>
      <input
        className={(className || s.numInput) + ' ' + s.numInputStepped}
        type="number" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <button type="button" className={s.stepBtn} onClick={() => nudge(1)} title="Increase">+</button>
    </div>
  );
}

export function makeId() {
  return 'el-' + Math.random().toString(36).slice(2, 9);
}

// Returns a React style object applying an image element's border to one
// side (or all sides) — borderSide is 'all' (default), 'top', 'bottom',
// 'left', or 'right'. `scale` converts the stored px value to the editor
// canvas's current on-screen scale (server/tv.html applies it unscaled).
export function borderStyle(el, scale) {
  if (!el.borderWidth) return {};
  const val = `${Math.round(el.borderWidth * scale)}px solid ${el.borderColor || '#fff'}`;
  const side = el.borderSide && el.borderSide !== 'all' ? el.borderSide : null;
  if (!side) return { border: val };
  const prop = 'border' + side[0].toUpperCase() + side.slice(1);
  return { [prop]: val };
}

export const BORDER_SIDES = [
  { value: 'all', label: 'All' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

export function hexToRgba(hex, alphaPct) {
  if (!hex) return 'transparent';
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const a = (alphaPct == null ? 100 : alphaPct) / 100;
  return `rgba(${r},${g},${b},${a})`;
}

// Mirrors the shrink-to-fit loop in server/tv.html's fitTextBoxes() so the
// canvas editor previews the same result the TV will render: text starts at
// its configured size and steps down until it fits the bounding box (which
// lets it wrap onto more lines first, same as a browser normally would,
// before shrinking further once wrapping alone isn't enough).
const JUSTIFY_MAP = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

export function AutoFitText({ el, scale }) {
  const boxRef = useRef(null);
  const spanRef = useRef(null);
  const paddingPx = Math.round((el.boxPadding || 0) * scale);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = spanRef.current;
    if (!box || !span) return;
    const baseSize = Math.max(1, Math.round((el.size || 48) * scale));
    let size = baseSize;
    span.style.fontSize = size + 'px';
    const minSize = 6;
    // box.clientWidth/Height include the padding (box-sizing: border-box),
    // so the space actually available to the text is that minus padding on
    // both sides.
    const availW = box.clientWidth - paddingPx * 2;
    const availH = box.clientHeight - paddingPx * 2;
    // Each probe forces a synchronous reflow, so binary-search the largest
    // fitting size (~6 probes) rather than stepping down 1px at a time (~40).
    // Overflow is monotonic in font size, so this lands on the same answer.
    const fits = (px) => {
      span.style.fontSize = px + 'px';
      return span.scrollHeight <= availH && span.scrollWidth <= availW;
    };
    let lo = minSize, hi = baseSize;
    size = minSize;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) { size = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    span.style.fontSize = size + 'px';
  }, [el.text, el.size, el.font, el.bold, el.align, el.boxWidth, el.boxHeight, el.boxPadding, scale]);

  return (
    <div ref={boxRef} style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: JUSTIFY_MAP[el.boxJustify] || 'center',
      overflow: 'hidden', boxSizing: 'border-box', padding: paddingPx + 'px',
      background: el.boxColor ? hexToRgba(el.boxColor, el.boxAlpha) : 'transparent',
      borderRadius: Math.round((el.boxRadius || 0) * scale) + 'px',
    }}>
      <span ref={spanRef} style={{
        color: el.color,
        fontFamily: el.font + ', sans-serif',
        fontWeight: el.bold ? 'bold' : 'normal',
        textAlign: el.align,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        lineHeight: 1.2,
        width: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}>{el.text || ' '}</span>
    </div>
  );
}

// A bounding-box text element can hold multiple independently-styled stacked
// lines (a "mail merge" composite — e.g. a bold title line, then a smaller
// grey date line below it, each with its own font/size/color/align) instead
// of one uniformly-styled block. The whole stack shrinks together via a
// single scale factor (preserving each line's size relative to the others)
// rather than each line fitting itself independently, so a title stays
// visually bigger than a subtitle even as both shrink to fit.
export function StackedBoxText({ el, scale }) {
  const boxRef = useRef(null);
  const stackRef = useRef(null);
  const paddingPx = Math.round((el.boxPadding || 0) * scale);
  const lines = el.lines || [];

  useLayoutEffect(() => {
    const box = boxRef.current;
    const stack = stackRef.current;
    if (!box || !stack) return;
    const lineEls = Array.from(stack.children);
    const baseSizes = lineEls.map((_, i) => {
      const ln = lines[i];
      const base = ln && ln.type === 'rule' ? (ln.thickness || 4) : (ln?.size || 48);
      return Math.max(1, Math.round(base * scale));
    });
    function apply(sc) {
      lineEls.forEach((el2, i) => {
        const val = Math.max(1, Math.round(baseSizes[i] * sc));
        if (lines[i] && lines[i].type === 'rule') el2.style.height = val + 'px';
        else el2.style.fontSize = val + 'px';
      });
    }
    apply(1);
    const availW = box.clientWidth - paddingPx * 2;
    const availH = box.clientHeight - paddingPx * 2;
    // Same 0.02 step grid as before (scale = 1 - 0.02*k, down to the 0.15
    // floor), but binary-searched: each probe forces a reflow, so this is ~6
    // instead of ~43. Overflow is monotonic in scale, so the result matches.
    const STEPS = 43; // 1 - 0.02*43 = 0.14, the first value past the floor
    const fits = (k) => {
      apply(1 - 0.02 * k);
      return stack.scrollHeight <= availH && stack.scrollWidth <= availW;
    };
    let lo = 0, hi = STEPS, best = STEPS;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) { best = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    apply(1 - 0.02 * best);
  }, [lines, el.boxWidth, el.boxHeight, el.boxPadding, el.lineSpacing, scale]);

  return (
    <div ref={boxRef} style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: JUSTIFY_MAP[el.boxJustify] || 'center',
      overflow: 'hidden', boxSizing: 'border-box', padding: paddingPx + 'px',
      background: el.boxColor ? hexToRgba(el.boxColor, el.boxAlpha) : 'transparent',
      borderRadius: Math.round((el.boxRadius || 0) * scale) + 'px',
    }}>
      <div ref={stackRef} style={{ display: 'flex', flexDirection: 'column', gap: Math.round((el.lineSpacing || 0) * scale) + 'px' }}>
        {lines.map((ln, i) => ln.type === 'rule' ? (
          <div key={ln.id || i} style={{
            width: (ln.widthPct || 100) + '%',
            alignSelf: ln.align === 'left' ? 'flex-start' : ln.align === 'right' ? 'flex-end' : 'center',
            background: ln.color || '#ffffff',
            flexShrink: 0,
            pointerEvents: 'none',
          }} />
        ) : (
          <span key={ln.id || i} style={{
            color: ln.color,
            fontFamily: (ln.font || 'Arial') + ', sans-serif',
            fontWeight: ln.bold ? 'bold' : 'normal',
            textAlign: ln.align || 'left',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            lineHeight: 1.2,
            width: '100%',
            display: 'block',
            pointerEvents: 'none',
          }}>{ln.text || ' '}</span>
        ))}
      </div>
    </div>
  );
}

// Editor UI for the `lines` array behind StackedBoxText. `tokens`, when
// given (RSS only), adds per-line "insert token" buttons — Announcements has
// no feed data to bind to, so it's omitted there.
export function LinesEditor({ lines, onChange, tokens }) {
  function updateLine(idx, changes) {
    onChange(lines.map((ln, i) => i === idx ? { ...ln, ...changes } : ln));
  }
  function addLine() {
    onChange([...lines, { id: makeId(), type: 'text', text: '', font: 'Arial', size: 36, color: '#ffffff', bold: false, align: 'center' }]);
  }
  function addDivider() {
    onChange([...lines, { id: makeId(), type: 'rule', color: '#ffffff', thickness: 4, widthPct: 100, align: 'center' }]);
  }
  function removeLine(idx) {
    onChange(lines.filter((_, i) => i !== idx));
  }
  function moveLine(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= lines.length) return;
    const next = lines.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {lines.map((ln, idx) => (
        <div key={ln.id || idx} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase' }}>
              {ln.type === 'rule' ? `Divider ${idx + 1}` : `Line ${idx + 1}`}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button type="button" className={s.deleteBtnDark} onClick={() => moveLine(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
              <button type="button" className={s.deleteBtnDark} onClick={() => moveLine(idx, 1)} disabled={idx === lines.length - 1} title="Move down">↓</button>
              <button type="button" className={s.deleteBtnDark} onClick={() => removeLine(idx)} title="Remove">✕</button>
            </div>
          </div>

          {ln.type === 'rule' ? (
            <>
              <div className={s.propRow}>
                <input
                  type="color"
                  className={s.colorInput}
                  value={ln.color || '#ffffff'}
                  onChange={e => updateLine(idx, { color: e.target.value })}
                />
                <SteppedNumberInput min={1} max={40} value={ln.thickness || 4} onChange={v => updateLine(idx, { thickness: v })} />
              </div>
              <div className={s.propLabel}>Width — {ln.widthPct ?? 100}%</div>
              <div className={s.propRow}>
                <SteppedSlider min={5} max={100} value={ln.widthPct ?? 100} onChange={v => updateLine(idx, { widthPct: v })} />
              </div>
              <div className={s.alignToggle}>
                {['left', 'center', 'right'].map(a => (
                  <button
                    key={a}
                    type="button"
                    className={(ln.align || 'center') === a ? s.alignActive : s.alignBtn}
                    onClick={() => updateLine(idx, { align: a })}
                  >
                    {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <textarea
                className={s.propTextarea}
                style={{ minHeight: '40px' }}
                value={ln.text}
                onChange={e => updateLine(idx, { text: e.target.value })}
              />
              {tokens && (
                <div className={s.addBtns}>
                  {tokens.map(t => (
                    <button key={t.key} type="button" className={s.addBtn} onClick={() => updateLine(idx, { text: (ln.text || '') + `{{${t.key}}}` })}>
                      + {t.label}
                    </button>
                  ))}
                </div>
              )}

              <select className={s.propSelect} value={ln.font} onChange={e => updateLine(idx, { font: e.target.value })}>
                {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>

              <div className={s.propRow}>
                <SteppedNumberInput min={4} max={400} value={ln.size} onChange={v => updateLine(idx, { size: v })} />
                <input
                  type="color"
                  className={s.colorInput}
                  value={ln.color}
                  onChange={e => updateLine(idx, { color: e.target.value })}
                />
                <label className={s.checkRow}>
                  <input type="checkbox" checked={!!ln.bold} onChange={e => updateLine(idx, { bold: e.target.checked })} />
                  Bold
                </label>
              </div>

              <div className={s.alignToggle}>
                {['left', 'center', 'right'].map(a => (
                  <button
                    key={a}
                    type="button"
                    className={ln.align === a ? s.alignActive : s.alignBtn}
                    onClick={() => updateLine(idx, { align: a })}
                  >
                    {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
      <div className={s.addBtns}>
        <button type="button" className={s.addBtn} onClick={addLine}>+ Add Line</button>
        <button type="button" className={s.addBtn} onClick={addDivider}>+ Add Divider</button>
      </div>
    </div>
  );
}

// Elements render (both in the editor canvas and tv.html) in array order,
// last = on top — so "layering" is just reordering this array. Exported so
// each tab's move-to-front/back/up/down buttons share one implementation.
export function reorderElement(elements, id, dir) {
  const idx = elements.findIndex(el => el.id === id);
  if (idx === -1) return elements;
  const next = elements.slice();
  const [el] = next.splice(idx, 1);
  let target;
  if (dir === 'front') target = next.length;
  else if (dir === 'back') target = 0;
  else if (dir === 'up') target = Math.min(next.length, idx + 1);
  else target = Math.max(0, idx - 1);
  next.splice(target, 0, el);
  return next;
}

// Lists elements top-layer-first (i.e. reverse of the render array, since
// last-in-array renders on top) with per-row up/down buttons to shift
// layering — lets the user see and fix stacking order without guessing which
// overlapping element on the canvas is "in front."`labelFor` returns each
// row's display text (differs per tab: RSS has feed images/logos,
// Announcements has date/time).
export function LayersPanel({ elements, selectedId, onSelect, onReorder, labelFor }) {
  const topFirst = elements.slice().reverse();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {topFirst.map((el, i) => {
        const isTop = i === 0;
        const isBottom = i === topFirst.length - 1;
        return (
          <div
            key={el.id}
            className={s.layerRow + (selectedId === el.id ? ' ' + s.layerRowSelected : '')}
            onClick={() => onSelect(el.id)}
          >
            <span className={s.layerLabel}>{labelFor(el)}</span>
            <div className={s.layerBtns}>
              <button
                type="button" className={s.layerBtn} disabled={isTop}
                onClick={e => { e.stopPropagation(); onReorder(el.id, 'up'); }}
                title="Move up (toward front)"
              >↑</button>
              <button
                type="button" className={s.layerBtn} disabled={isBottom}
                onClick={e => { e.stopPropagation(); onReorder(el.id, 'down'); }}
                title="Move down (toward back)"
              >↓</button>
            </div>
          </div>
        );
      })}
      {elements.length === 0 && (
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No elements yet.</span>
      )}
    </div>
  );
}

// Collapsible properties-panel section — the panel gets long once an element
// has many controls (position, size, color, border...), so each section can
// be folded away. Defaults to open; pass `defaultOpen={false}` to start
// collapsed. `extra` renders to the right of the chevron/title (e.g. a
// Remove button) and stays clickable independent of the collapse toggle.
export function Section({ title, extra, defaultOpen = true, highlighted = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={s.propSection + (highlighted ? ' ' + s.propSectionHighlighted : '')}>
      <div className={s.propSectionTitle}>
        <span
          onClick={() => setOpen(o => !o)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}
        >
          <span style={{
            display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            fontSize: '0.7rem',
          }}>▾</span>
          {title}
        </span>
        {extra}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>}
    </div>
  );
}

// One output pixel, expressed as a % of the fixed 1920x1080 canvas that x/y
// are stored relative to — so a nudge is the same real-world distance no
// matter how zoomed-in/out the editor's on-screen canvas currently is.
const NUDGE_X_PCT = 100 / 1920;
const NUDGE_Y_PCT = 100 / 1080;

// Arrow keys shift the selected element by one pixel while it's selected —
// ignored while focus is in a text field so normal cursor movement there
// still works. `elements`/`updateEl` should be the active template/screen's
// own (so a nudge always lands on whichever element is actually selected).
export function useArrowKeyNudge({ selectedId, elements, updateEl }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (!selectedId) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      const el = elements.find(e2 => e2.id === selectedId);
      if (!el) return;
      e.preventDefault();
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -NUDGE_Y_PCT;
      else if (e.key === 'ArrowDown') dy = NUDGE_Y_PCT;
      else if (e.key === 'ArrowLeft') dx = -NUDGE_X_PCT;
      else dx = NUDGE_X_PCT;
      updateEl(selectedId, {
        x: Math.round(Math.max(0, Math.min(100, el.x + dx)) * 1000) / 1000,
        y: Math.round(Math.max(0, Math.min(100, el.y + dy)) * 1000) / 1000,
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, elements, updateEl]);
}

// Ctrl+Z / Cmd+Z undo (Shift for redo) over a caller-supplied snapshot of
// editor state (typically the elements array). Ignores keystrokes while
// focus is in a text field so native text-undo still works there — this
// only intercepts the canvas-level gestures (add/move/resize/delete,
// slider/checkbox edits).
export function useUndo(getSnapshot, applySnapshot) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const currentRef = useRef(null);
  currentRef.current = getSnapshot();

  useEffect(() => {
    function onKeyDown(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && t.type === 'text')) return;
      e.preventDefault();
      if (e.shiftKey) {
        if (!redoStack.current.length) return;
        undoStack.current.push(currentRef.current);
        applySnapshot(redoStack.current.pop());
      } else {
        if (!undoStack.current.length) return;
        redoStack.current.push(currentRef.current);
        applySnapshot(undoStack.current.pop());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applySnapshot]);

  // Call before any change that should become its own undo step.
  return function pushHistory() {
    undoStack.current.push(currentRef.current);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  };
}

// ── Resize handles ───────────────────────────────────────────────────────
// For elements with an explicit width/height "box" (bounding-box text,
// feed-cropped images) — drag a corner to resize both dimensions, an edge to
// resize one, anchored on the opposite corner/edge (the usual design-tool
// convention), rather than resizing symmetrically from center even though
// elements are positioned by their center point.
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_CURSOR = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

const HANDLE_POS = {
  nw: [0, 0], n: [50, 0], ne: [100, 0],
  w: [0, 50], e: [100, 50],
  sw: [0, 100], s: [50, 100], se: [100, 100],
};

// startEl: {x, y, w, h} in the same % units as el.x/el.y/[widthKey]/[heightKey].
// Returns the new {x, y, w, h} for a given handle + pixel drag delta.
export function computeResize(handle, startEl, dxPx, dyPx, canvasWidthPx) {
  const canvasHeightPx = canvasWidthPx * 0.5625;
  const dxPct = dxPx / canvasWidthPx * 100;
  const dyPct = dyPx / canvasHeightPx * 100;
  const { x, y, w, h } = startEl;
  let left = x - w / 2, right = x + w / 2;
  let top = y - h / 2, bottom = y + h / 2;
  if (handle.includes('w')) left += dxPct;
  if (handle.includes('e')) right += dxPct;
  if (handle.includes('n')) top += dyPct;
  if (handle.includes('s')) bottom += dyPct;
  const minW = 3, minH = 3;
  if (right - left < minW) { if (handle.includes('w')) left = right - minW; else right = left + minW; }
  if (bottom - top < minH) { if (handle.includes('n')) top = bottom - minH; else bottom = top + minH; }
  return {
    x: Math.round(((left + right) / 2) * 10) / 10,
    y: Math.round(((top + bottom) / 2) * 10) / 10,
    w: Math.round((right - left) * 10) / 10,
    h: Math.round((bottom - top) * 10) / 10,
  };
}

// Renders the 8 drag handles over a selected box element. `widthKey`/
// `heightKey` name the element's width/height fields (e.g. 'boxWidth'/
// 'boxHeight' for text, 'width'/'height' for a feed image), so this works
// for either without the caller duplicating the drag math.
export function ResizeHandles({ el, widthKey, heightKey, canvasRef, updateEl, pushHistory }) {
  function startResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    pushHistory();
    const startMX = e.clientX, startMY = e.clientY;
    const startEl = { x: el.x, y: el.y, w: el[widthKey], h: el[heightKey] };
    function onMove(ev) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const next = computeResize(handle, startEl, ev.clientX - startMX, ev.clientY - startMY, rect.width);
      updateEl(el.id, { x: next.x, y: next.y, [widthKey]: next.w, [heightKey]: next.h });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <>
      {HANDLES.map(h => {
        const [left, top] = HANDLE_POS[h];
        return (
          <div
            key={h}
            onMouseDown={e => startResize(e, h)}
            style={{
              position: 'absolute',
              left: left + '%', top: top + '%',
              width: '10px', height: '10px',
              marginLeft: '-5px', marginTop: '-5px',
              background: '#ffe600', border: '1px solid #000',
              borderRadius: '2px',
              cursor: HANDLE_CURSOR[h],
              zIndex: 2,
            }}
          />
        );
      })}
    </>
  );
}

// For elements with only a width (no independent height — a plain image or
// logo that scales proportionally, no cropping involved): drag a side handle
// to change width, anchored on the opposite side, rather than the 8-point
// width+height box resize ResizeHandles does for crop-style elements.
function computeWidthResize(handle, startEl, dxPx, canvasWidthPx) {
  const dxPct = dxPx / canvasWidthPx * 100;
  let left = startEl.x - startEl.w / 2, right = startEl.x + startEl.w / 2;
  if (handle === 'w') left += dxPct;
  else right += dxPct;
  const minW = 2;
  if (right - left < minW) { if (handle === 'w') left = right - minW; else right = left + minW; }
  return {
    x: Math.round(((left + right) / 2) * 10) / 10,
    w: Math.round((right - left) * 10) / 10,
  };
}

export function WidthResizeHandles({ el, widthKey = 'width', canvasRef, updateEl, pushHistory }) {
  function startResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    pushHistory();
    const startMX = e.clientX;
    const startEl = { x: el.x, w: el[widthKey] };
    function onMove(ev) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const next = computeWidthResize(handle, startEl, ev.clientX - startMX, rect.width);
      updateEl(el.id, { x: next.x, [widthKey]: next.w });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <>
      {['w', 'e'].map(h => (
        <div
          key={h}
          onMouseDown={e => startResize(e, h)}
          style={{
            position: 'absolute',
            left: (h === 'w' ? 0 : 100) + '%', top: '50%',
            width: '10px', height: '10px',
            marginLeft: '-5px', marginTop: '-5px',
            background: '#ffe600', border: '1px solid #000',
            borderRadius: '2px',
            cursor: 'ew-resize',
            zIndex: 2,
          }}
        />
      ))}
    </>
  );
}
