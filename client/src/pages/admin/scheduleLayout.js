/**
 * Pure geometry for the visual day scheduler — no React, no DOM, so it can be
 * unit-tested and shared by the drag/resize interactions and the save path.
 *
 * Blocks are `{ id?, start, end, screen_id }` where start/end are minutes from
 * midnight on a 15-minute grid (0..1440; 1440 = end-of-day "24:00"). The server
 * stays the final validator — this just decides where things land on screen.
 */
export const MIN_BLOCK = 15;
export const DAY_END = 1440;
export const DEFAULT_LEN = 60; // one hour

export function toMin(hhmm) {
  if (hhmm === '24:00') return DAY_END;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(min) {
  if (min >= DAY_END) return '24:00';
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Round down to the containing 15-minute slot (drop snapping)
export function snap15(min) {
  return Math.floor(min / MIN_BLOCK) * MIN_BLOCK;
}

export const durationMin = (b) => b.end - b.start;

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Pack `movers` (each preserving its duration) into the region ending at
// `ceiling`, stacking downward from it, closest-to-candidate first. Blocks that
// already fit below the ceiling don't move. Returns the repositioned blocks, or
// null if one would cross 0 (no room above).
function packUp(movers, ceiling) {
  const out = [];
  for (const b of [...movers].sort((a, c) => c.start - a.start)) {
    const dur = durationMin(b);
    const end = Math.min(b.end, ceiling);
    const start = end - dur;
    if (start < 0) return null;
    out.push({ ...b, start, end });
    ceiling = start;
  }
  return out;
}

// Mirror of packUp: stack upward from `floor`, closest-to-candidate first.
function packDown(movers, floor) {
  const out = [];
  for (const b of [...movers].sort((a, c) => a.start - c.start)) {
    const dur = durationMin(b);
    const start = Math.max(b.start, floor);
    const end = start + dur;
    if (end > DAY_END) return null;
    out.push({ ...b, start, end });
    floor = end;
  }
  return out;
}

/**
 * Places `candidate` at its [start,end], shifting existing `blocks` up/down
 * toward the nearest free space (fixed durations, never shrunk).
 *
 * `blocks` must NOT include the candidate (when moving an existing block, drop
 * it from the list first). Returns:
 *   { ok: true, blocks }                       — full non-overlapping layout
 *   { ok: false, reason: 'replace', targetId } — no room; drop target ≥ candidate
 *   { ok: false, reason: 'nofit' }             — no room; nothing to replace
 */
export function placeBlock(blocks, candidate) {
  const clash = blocks.filter((b) => overlaps(b, candidate));
  if (clash.length === 0) return { ok: true, blocks: [...blocks, candidate] };

  const candMid = (candidate.start + candidate.end) / 2;
  const upMovers = clash.filter((b) => (b.start + b.end) / 2 < candMid);
  const downMovers = clash.filter((b) => (b.start + b.end) / 2 >= candMid);
  // Untouched blocks (no clash) still bound the packing, so include them by side
  const rest = blocks.filter((b) => !overlaps(b, candidate));
  const upRest = rest.filter((b) => b.end <= candidate.start);
  const downRest = rest.filter((b) => b.start >= candidate.end);
  // A non-clashing block that sits fully on the far side but on the "wrong"
  // side of the candidate can't exist (it would clash), so this partition is total.

  const packedUp = packUp([...upMovers, ...upRest], candidate.start);
  const packedDown = packDown([...downMovers, ...downRest], candidate.end);

  if (packedUp && packedDown) {
    return { ok: true, blocks: [...packedUp, ...packedDown, candidate] };
  }

  // No room — decide replace vs snap-back from the block at the drop point
  const target = clash.find((b) => b.start <= candidate.start && candidate.start < b.end) || clash[0];
  if (durationMin(target) >= durationMin(candidate)) {
    return { ok: false, reason: 'replace', targetId: target.id };
  }
  return { ok: false, reason: 'nofit' };
}

/**
 * Resolves a placeBlock result into a final block list, or null to abort.
 * `confirmReplace()` is called (and must return truthy) before evicting the
 * block a full drop landed on; `onNoFit()` is called when nothing can be
 * evicted. Shared by drag-drop, click-to-add, and right-click-add so all three
 * handle "that time is full" identically.
 */
export function applyPlacement(blocks, candidate, confirmReplace, onNoFit) {
  const res = placeBlock(blocks, candidate);
  if (res.ok) return res.blocks;
  if (res.reason === 'replace' && confirmReplace()) {
    const without = blocks.filter((b) => b.id !== res.targetId);
    const retry = placeBlock(without, candidate);
    if (retry.ok) return retry.blocks;
  }
  if (onNoFit) onNoFit();
  return null;
}

// Start minute of the first gap at least `len` minutes long, scanning from
// midnight. Returns null when the day has no room. Used to place a screen added
// by right-click when the user hasn't picked a slot.
export function firstFreeSlot(blocks, len = DEFAULT_LEN) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const b of sorted) {
    if (b.start - cursor >= len) return cursor;
    cursor = Math.max(cursor, b.end);
  }
  return DAY_END - cursor >= len ? cursor : null;
}

// A one-hour default block dropped at `startMin`; if it would pass midnight,
// shift the start up so it still ends exactly at 24:00 (keeps the hour).
export function defaultBlockAt(startMin) {
  let start = snap15(startMin);
  let end = start + DEFAULT_LEN;
  if (end > DAY_END) { end = DAY_END; start = DAY_END - DEFAULT_LEN; }
  return { start, end };
}

/**
 * Resizes one edge of block `id` to `rawMin`, snapped to the grid and clamped
 * to the day bounds, the block's opposite edge (min 15), and the nearest
 * neighbour on that side (resize never pushes other blocks). Returns the new
 * { start, end } or null if nothing changes.
 */
export function resizeBlock(blocks, id, edge, rawMin) {
  const block = blocks.find((b) => b.id === id);
  if (!block) return null;
  const others = blocks.filter((b) => b.id !== id);
  const snapped = snap15(rawMin + MIN_BLOCK / 2); // nearest slot for edge drags
  if (edge === 'start') {
    const prevEnd = Math.max(0, ...others.filter((b) => b.end <= block.start).map((b) => b.end));
    const start = Math.min(Math.max(snapped, prevEnd), block.end - MIN_BLOCK);
    return start === block.start ? null : { start, end: block.end };
  }
  const nextStart = Math.min(DAY_END, ...others.filter((b) => b.start >= block.end).map((b) => b.start));
  const end = Math.max(Math.min(snapped, nextStart), block.start + MIN_BLOCK);
  return end === block.end ? null : { start: block.start, end };
}

// ── Date helpers (YYYY-MM-DD, local) ────────────────────────────────────────
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The 7-day week containing `dateStr`, given weekStart 0 (Sun) or 1 (Mon).
export function weekRange(dateStr, weekStart = 0) {
  const d = new Date(dateStr + 'T00:00:00');
  const back = (d.getDay() - weekStart + 7) % 7;
  const start = addDays(dateStr, -back);
  return { start, end: addDays(start, 6) };
}
