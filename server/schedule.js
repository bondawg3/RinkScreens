/**
 * Display scheduling: resolves which screen a physical display should render
 * right now, based on its calendar of time blocks in display_schedules.
 *
 * Times are local server time (the server runs at the rink). A block row is
 * { id, display_id, date: 'YYYY-MM-DD', start_time: 'HH:MM', end_time: 'HH:MM',
 *   content_screen_id }. end_time may be '24:00' (end of day). Zero-padded
 * HH:MM strings compare correctly as strings, so no time parsing is needed.
 */
const db = require('./db');

function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// 'YYYY-MM-DD' + n days -> 'YYYY-MM-DD'
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}

// Whole days from `a` to `b` (b - a), both 'YYYY-MM-DD'
function dayOffset(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const END_TIME_RE = /^(([01]\d|2[0-3]):(00|15|30|45)|24:00)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns an error string, or null when the block fields are valid
function validateBlock({ date, start_time, end_time }) {
  if (!DATE_RE.test(date || '')) return 'date must be YYYY-MM-DD';
  if (!TIME_RE.test(start_time || '')) return 'start_time must be HH:MM on a 15-minute boundary';
  if (!END_TIME_RE.test(end_time || '')) return 'end_time must be HH:MM on a 15-minute boundary (24:00 allowed)';
  if (end_time <= start_time) return 'end_time must be after start_time (blocks cannot cross midnight)';
  return null;
}

// Blocks for one display on one date, excluding excludeId (for PATCH)
function blocksFor(displayId, date, excludeId = null) {
  return db.findAll('display_schedules')
    .filter((b) => b.display_id === Number(displayId) && b.date === date && (excludeId === null || b.id !== Number(excludeId)));
}

// The existing block that overlaps [start_time, end_time), or null
function findOverlap(displayId, date, start_time, end_time, excludeId = null) {
  return blocksFor(displayId, date, excludeId)
    .find((b) => b.start_time < end_time && start_time < b.end_time) || null;
}

// Converts a local 'YYYY-MM-DD' + 'HH:MM' (or '24:00') to a Date
function toDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr === '24:00') return new Date(y, m - 1, d + 1, 0, 0, 0);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

/**
 * Resolves what a display should show at `now`.
 * Returns null when the display doesn't exist; otherwise
 * { display, screen_id, scheduled, valid_until } where screen_id is the
 * schedule block's screen when a block is active, else the display's base
 * screen_id (may be null = unconfigured), and valid_until is the Date of the
 * next possible change (block end, next block start, or next midnight).
 */
function resolveActive(displayId, now = new Date()) {
  const display = db.findById('displays', displayId);
  if (!display) return null;

  const today = localDateStr(now);
  const tnow = hhmm(now);
  const blocks = blocksFor(display.id, today).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));

  let active = null;
  for (const b of blocks) {
    if (b.start_time <= tnow && tnow < b.end_time) {
      // Overlaps are rejected on write; if legacy data overlaps anyway, the
      // most recently created block wins
      if (!active || (b.created_at || '') > (active.created_at || '')) active = b;
    }
  }

  let boundary = null; // 'HH:MM' of the next change today, if any
  if (active) {
    boundary = active.end_time;
  } else {
    const next = blocks.find((b) => b.start_time > tnow);
    if (next) boundary = next.start_time;
  }
  const validUntil = boundary ? toDate(today, boundary) : toDate(today, '24:00');

  return {
    display,
    screen_id: active ? active.content_screen_id : (display.screen_id || null),
    scheduled: !!active,
    valid_until: validUntil,
  };
}

// Drops blocks whose date is more than `keepDays` days in the past so the
// JSON store doesn't grow without bound. Keeps the last 30 days so recent
// history stays reviewable. Returns the number removed.
function pruneOldBlocks(keepDays = 30) {
  const cutoff = localDateStr(new Date(Date.now() - keepDays * 86400000));
  return db.transaction((tx) => {
    const old = tx.findAll('display_schedules').filter((b) => b.date < cutoff);
    old.forEach((b) => tx.remove('display_schedules', b.id));
    return old.length;
  });
}

module.exports = { resolveActive, validateBlock, findOverlap, pruneOldBlocks, localDateStr, addDays, dayOffset };
