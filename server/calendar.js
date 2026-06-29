const ical = require('node-ical');
const db = require('./db');
const ws = require('./ws');
const { autoAssign } = require('./locker-assign');

const pollTimers = new Map();

// Shared title parsing logic used by both sync and reparse
function parseTitle(rawTitle, cal) {
  const isNcwhl = cal && cal.name && cal.name.toUpperCase().includes('NCWHL');
  const isPickup = /league\s+pickup|scrimmage|practice/i.test(rawTitle);

  let title = rawTitle;
  let matchup = rawTitle;

  if (isNcwhl) {
    const gameMatch = rawTitle.match(/^(.*?\bGame\b)\s*(.*)/i);
    if (gameMatch) {
      title = gameMatch[1].trim();
      matchup = gameMatch[2].replace(/\s*\(Home\)/gi, '').replace(/\s*\(Away\)/gi, '').trim();
    }
  } else if (rawTitle.includes(':')) {
    const colonIdx = rawTitle.indexOf(':');
    title = rawTitle.slice(0, colonIdx).trim();
    matchup = rawTitle.slice(colonIdx + 1).trim();
  }

  let away_team = isPickup ? 'Open' : '';
  let home_team = isPickup ? 'Open' : '';

  if (!isPickup) {
    const vsMatch = matchup.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (vsMatch) {
      const first = vsMatch[1].trim();
      const second = vsMatch[2].trim();
      if (cal && cal.team_order === 'home_away') {
        home_team = first;
        away_team = second;
      } else {
        away_team = first;
        home_team = second;
      }
      // No colon means the full title was just the matchup — clear it since teams say it all
      if (title === rawTitle) title = '';
    } else {
      away_team = '';
      home_team = '';
    }
  }

  return { title, away_team, home_team };
}


async function syncCalendar(cal) {
  const settings = db.getSettings();
  const keyword = settings.skate_keyword || 'Public Skate';

  let events;
  try {
    events = await ical.async.fromURL(cal.url);
  } catch (err) {
    console.error(`[calendar] fetch failed for "${cal.name}":`, err.message);
    return;
  }

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let count = 0;
  const importedUids = new Set();

  for (const [, event] of Object.entries(events)) {
    if (event.type !== 'VEVENT') continue;
    const start = event.start ? new Date(event.start) : null;
    if (!start || start < cutoff || start > horizon) continue;

    const location = (event.location || '').trim();
    if (location && !location.toLowerCase().includes('san mateo')) continue;

    const existing = db.findByField('games', 'calendar_uid', event.uid);
    const rawTitle = event.summary || '';
    const { title, away_team, home_team } = parseTitle(rawTitle, cal);

    const isAdminTeam = (t) => !!t;

    db.upsertByField('games', 'calendar_uid', event.uid, {
      calendar_uid: event.uid,
      calendar_id: cal.id,
      start_time: start.toISOString(),
      end_time: event.end ? new Date(event.end).toISOString() : start.toISOString(),
      raw_title: rawTitle,
      title: title || '(No title)',
      home_team: (existing && isAdminTeam(existing.home_team)) ? existing.home_team : home_team,
      away_team: (existing && isAdminTeam(existing.away_team)) ? existing.away_team : away_team,
      home_locker: existing ? existing.home_locker : '',
      away_locker: existing ? existing.away_locker : '',
      is_skate: event.summary && event.summary.includes(keyword) ? 1 : 0,
    });
    importedUids.add(event.uid);
    count++;
  }

  // Remove games from this calendar that are in the import window but were filtered out
  if (cal.id) {
    const existing = db.findAll('games').filter((g) => {
      if (g.calendar_id !== cal.id) return false;
      if (importedUids.has(g.calendar_uid)) return false;
      const t = new Date(g.start_time);
      return t >= cutoff && t <= horizon;
    });
    existing.forEach((g) => db.remove('games', g.id));
    if (existing.length) console.log(`[calendar] "${cal.name}" removed ${existing.length} filtered-out games`);
  }

  console.log(`[calendar] "${cal.name}" synced ${count} events`);

  // Auto-assign locker rooms for newly-imported unassigned games
  if (cal.type === 'hockey_games') {
    autoAssign();
  }

  // Auto-extract league + teams from hockey_games calendars
  if (cal.type === 'hockey_games' && cal.id) {
    const SKIP = new Set(['open', 'tbd', 'away tbd', 'home tbd', '']);
    const calGames = db.findAll('games').filter((g) => g.calendar_id === cal.id);
    const teamNames = new Set();
    for (const g of calGames) {
      if (g.home_team && !SKIP.has(g.home_team.toLowerCase())) teamNames.add(g.home_team);
      if (g.away_team && !SKIP.has(g.away_team.toLowerCase())) teamNames.add(g.away_team);
    }

    if (teamNames.size > 0) {
      // Find or create league named after this calendar
      let league = db.findAll('leagues').find((l) => l.name.toLowerCase() === cal.name.toLowerCase());
      if (!league) {
        league = db.insert('leagues', { name: cal.name, locker_sequence_id: null });
        console.log(`[calendar] created league "${cal.name}"`);
      }

      const existingTeams = db.findAll('teams').filter((t) => t.league_id === league.id);
      const existingNames = new Set(existingTeams.map((t) => t.name.toLowerCase()));

      for (const name of teamNames) {
        if (!existingNames.has(name.toLowerCase())) {
          db.insert('teams', { name, league_id: league.id, color: '' });
          console.log(`[calendar] added team "${name}" to league "${cal.name}"`);
        }
      }
    }
  }
}

function scheduleCalendar(cal) {
  if (pollTimers.has(cal.id)) clearTimeout(pollTimers.get(cal.id));
  const ms = (cal.poll_interval_minutes || 5) * 60_000;
  const timer = setTimeout(async () => {
    await syncCalendar(cal);
    const fresh = db.findById('calendars', cal.id);
    if (fresh) scheduleCalendar(fresh);
  }, ms);
  pollTimers.set(cal.id, timer);
}

async function fetchAndSync() {
  const allCals = db.findAll('calendars');
  const calendars = allCals.filter((c) => c.type === 'hockey_games' || c.type === 'rink_events');

  // Fall back to legacy single ical_url setting if no calendars configured yet
  if (calendars.length === 0) {
    const settings = db.getSettings();
    if (settings.ical_url) {
      await syncCalendar({ id: null, name: 'Default', url: settings.ical_url, poll_interval_minutes: settings.poll_interval_minutes || 5 });
    }
  } else {
    await Promise.all(calendars.map(syncCalendar));
  }

  ws.broadcast({ type: 'refresh_data' });
}

function startPolling() {
  fetchAndSync();
  const calendars = db.findAll('calendars').filter((c) => c.type === 'hockey_games' || c.type === 'rink_events');
  if (calendars.length > 0) {
    calendars.forEach(scheduleCalendar);
  } else {
    // Legacy single-timer fallback
    const settings = db.getSettings();
    const ms = parseInt(settings.poll_interval_minutes || '5', 10) * 60_000;
    const timer = setTimeout(() => { fetchAndSync(); startPolling(); }, ms);
    pollTimers.set('legacy', timer);
  }
}

function triggerRefresh() {
  pollTimers.forEach((t) => clearTimeout(t));
  pollTimers.clear();
  fetchAndSync().then(startPolling);
}

module.exports = { startPolling, triggerRefresh, parseTitle };
