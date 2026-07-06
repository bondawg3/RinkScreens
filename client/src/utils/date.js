// Shared date/time formatting for the admin tabs.

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// "Mon, Jul 6"
export function fmtShortDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// "Monday, July 6, 2026"
export function dayLabel(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Local YYYY-MM-DD (not UTC — a TV preview at 6pm PDT should show today, not tomorrow)
export function localDateStr(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function todayStr() {
  return localDateStr();
}

export function stepDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return localDateStr(d);
}

// "Mon, Jul 6" from a YYYY-MM-DD string
export function fmtDateLabel(dateStr) {
  return fmtShortDate(new Date(dateStr + 'T00:00:00'));
}

// Monday-to-Sunday bounds of the week `offset` weeks from now
export function getWeekBounds(offset) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export function weekLabel(offset) {
  const { monday, sunday } = getWeekBounds(offset);
  const opts = { month: 'short', day: 'numeric' };
  const monStr = monday.toLocaleDateString([], opts);
  const sunStr = sunday.toLocaleDateString([], opts);
  if (offset === 0) return `This Week  (${monStr} – ${sunStr})`;
  if (offset === 1) return `Next Week  (${monStr} – ${sunStr})`;
  if (offset === -1) return `Last Week  (${monStr} – ${sunStr})`;
  return `${monStr} – ${sunStr}`;
}
