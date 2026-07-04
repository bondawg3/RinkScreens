const ical = require('node-ical');
const IcalExpander = require('ical-expander');
const db = require('./db');
const ws = require('./ws');
const { autoAssign } = require('./locker-assign');

const pollTimers = new Map();

// Shared title parsing logic used by both sync and reparse
function parseTitle(rawTitle, cal) {
  const isNcwhl = cal && cal.name && cal.name.toUpperCase().includes('NCWHL');
  const isPickup = /league\s+pickup|scrimmage|practice|stick\s*&\s*shoot/i.test(rawTitle);

  let title = /stick\s*&\s*shoot/i.test(rawTitle)
    ? rawTitle.replace(/stick\s*&\s*shoot/i, 'Stick & Shoot')
    : rawTitle;
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
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let count = 0;
  const importedUids = new Set();

  // figure_skating, rink_events, and public_skates use ical-expander to expand
  // recurring events (RRULE). hockey_games uses node-ical for uid-based upsert.
  const useExpander = cal.type === 'figure_skating' || cal.type === 'rink_events' || cal.type === 'public_skates';
  // For public_skates calendars every event is a skate session regardless of title keyword
  const forceSkate = cal.type === 'public_skates';

  if (useExpander) {
    let text;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const resp = await fetch(cal.url, { signal: controller.signal });
        text = await resp.text();
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.error(`[calendar] fetch failed for "${cal.name}":`, err.message);
      return;
    }

    let expander;
    try {
      expander = new IcalExpander({ ics: text, maxIterations: 2000 });
    } catch (err) {
      console.error(`[calendar] parse failed for "${cal.name}":`, err.message);
      return;
    }

    const result = expander.between(cutoff, horizon);

    function processOccurrence(startDate, endDate, item) {
      const start = startDate.toJSDate();
      if (start < cutoff || start > horizon) return;
      const end = endDate ? endDate.toJSDate() : new Date(start.getTime() + 3600000);
      const baseUid = item.uid || String(start.getTime());
      const uid = `${baseUid}__${start.toISOString()}`;
      const rawTitle = item.summary || '';

      importedUids.add(uid);
      const existing = db.findByField('games', 'calendar_uid', uid);
      db.upsertByField('games', 'calendar_uid', uid, {
        calendar_uid: uid,
        calendar_id: cal.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        raw_title: rawTitle,
        title: rawTitle,
        home_team: existing?.home_team || '',
        away_team: existing?.away_team || '',
        home_locker: existing?.home_locker || '',
        away_locker: existing?.away_locker || '',
        lr_auto_assigned: existing?.lr_auto_assigned || 0,
        is_skate: forceSkate ? 1 : (rawTitle.includes(keyword) ? 1 : 0),
      });
      count++;
    }

    for (const event of result.events) {
      processOccurrence(event.startDate, event.endDate, event);
    }
    for (const occ of result.occurrences) {
      processOccurrence(occ.startDate, occ.endDate, occ.item);
    }
  } else {
    // hockey_games: use node-ical (preserves existing uid-based records)
    let events;
    try {
      events = await ical.async.fromURL(cal.url);
    } catch (err) {
      console.error(`[calendar] fetch failed for "${cal.name}":`, err.message);
      return;
    }

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
        title: title || '',
        home_team: (existing && isAdminTeam(existing.home_team)) ? existing.home_team : home_team,
        away_team: (existing && isAdminTeam(existing.away_team)) ? existing.away_team : away_team,
        home_locker: existing ? existing.home_locker : '',
        away_locker: existing ? existing.away_locker : '',
        lr_auto_assigned: existing ? (existing.lr_auto_assigned || 0) : 0,
        is_skate: event.summary && event.summary.includes(keyword) ? 1 : 0,
      });
      importedUids.add(event.uid);
      count++;
    }
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
  const calendars = allCals.filter((c) => c.type === 'hockey_games' || c.type === 'rink_events' || c.type === 'figure_skating' || c.type === 'public_skates');

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
  const calendars = db.findAll('calendars').filter((c) => c.type === 'hockey_games' || c.type === 'rink_events' || c.type === 'figure_skating' || c.type === 'public_skates');
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

async function triggerCalendarRefresh(calId) {
  const cal = db.findById('calendars', calId);
  if (!cal) throw new Error('Calendar not found');
  await syncCalendar(cal);
  ws.broadcast({ type: 'refresh_data' });
}

module.exports = { startPolling, triggerRefresh, triggerCalendarRefresh, parseTitle };
