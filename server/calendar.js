const ical = require('node-ical');
const db = require('./db');
const ws = require('./ws');

let pollTimer = null;

async function fetchAndSync() {
  const settings = db.getSettings();
  const url = settings.ical_url;
  if (!url) return;
  const keyword = settings.skate_keyword || 'Public Skate';

  let events;
  try {
    events = await ical.async.fromURL(url);
  } catch (err) {
    console.error('[calendar] fetch failed:', err.message);
    return;
  }

  // Include events from up to 12 hours ago so in-progress games still show
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  let count = 0;

  for (const [, event] of Object.entries(events)) {
    if (event.type !== 'VEVENT') continue;
    const start = event.start ? new Date(event.start) : null;
    if (!start || start < cutoff) continue;

    // Only overwrite calendar-derived fields; preserve admin-assigned team/locker values
    const existing = db.findByField('games', 'calendar_uid', event.uid);
    db.upsertByField('games', 'calendar_uid', event.uid, {
      calendar_uid: event.uid,
      start_time: start.toISOString(),
      end_time: event.end ? new Date(event.end).toISOString() : start.toISOString(),
      title: event.summary || '(No title)',
      home_team: existing ? existing.home_team : '',
      away_team: existing ? existing.away_team : '',
      home_locker: existing ? existing.home_locker : '',
      away_locker: existing ? existing.away_locker : '',
      is_skate: event.summary && event.summary.includes(keyword) ? 1 : 0,
    });
    count++;
  }

  console.log(`[calendar] synced ${count} upcoming events`);
  ws.broadcast({ type: 'refresh_data' });
}

function startPolling() {
  fetchAndSync();
  schedulePoll();
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  const settings = db.getSettings();
  const minutes = parseInt(settings.poll_interval_minutes || '5', 10);
  pollTimer = setTimeout(() => {
    fetchAndSync();
    schedulePoll();
  }, minutes * 60_000);
}

function triggerRefresh() {
  if (pollTimer) clearTimeout(pollTimer);
  fetchAndSync().then(schedulePoll);
}

module.exports = { startPolling, triggerRefresh };
