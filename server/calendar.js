const IcalExpander = require('ical-expander');
const db = require('./db');
const ws = require('./ws');
const { autoAssign } = require('./locker-assign');

const pollTimers = new Map();

// Extracts the calendar's own title (X-WR-CALNAME), a non-standard but widely
// supported property (Google/Outlook exports) set at the VCALENDAR level —
// distinct from the admin-chosen display name — so admins can tell which
// upstream calendar a URL actually points to.
function extractCalName(icsText) {
  if (!icsText) return null;
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(/^X-WR-CALNAME:(.*)$/im);
  return match ? match[1].trim() || null : null;
}

// Fetch the raw ICS text with a 10s timeout; on failure records the sync
// error on the calendar and returns null
async function fetchIcalText(cal) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(cal.url, { signal: controller.signal });
      return await resp.text();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(`[calendar] fetch failed for "${cal.name}":`, err.message);
    if (cal.id) db.update('calendars', cal.id, { last_sync_at: new Date().toISOString(), last_sync_error: `Fetch failed: ${err.message}` });
    return null;
  }
}

// Shared title parsing logic used by both sync and reparse
function parseTitle(rawTitle, cal) {
  const isNcwhl = cal && cal.name && cal.name.toUpperCase().includes('NCWHL');

  // "Open" calendars (e.g. stick & shoot, pickup, practice) skip team/matchup
  // parsing entirely — the admin sets this per calendar instead of us
  // guessing from the title, and locker rooms display "Open" for both sides.
  if (cal && cal.event_mode === 'open') {
    return { title: rawTitle, away_team: 'Open', home_team: 'Open' };
  }
  if (cal && cal.event_mode === 'stick_shoot') {
    return { title: rawTitle, away_team: 'Adults', home_team: 'Youth' };
  }
  if (cal && cal.event_mode === 'practice') {
    return { title: rawTitle, away_team: 'Open', home_team: 'Open' };
  }

  let title = rawTitle;
  let matchup = rawTitle;
  let firstIsHome = null; // NCWHL (Home)/(Away) tags override team_order when present

  if (isNcwhl) {
    const gameMatch = rawTitle.match(/^(.*?\bGame\b)\s*(.*)/i);
    if (gameMatch) {
      title = gameMatch[1].trim();
      const rawMatchup = gameMatch[2];
      const beforeVs = rawMatchup.split(/\s+vs\.?\s+/i)[0] || '';
      if (/\(home\)/i.test(beforeVs)) firstIsHome = true;
      else if (/\(away\)/i.test(beforeVs)) firstIsHome = false;
      matchup = rawMatchup.replace(/\s*\(Home\)/gi, '').replace(/\s*\(Away\)/gi, '').trim();
    }
  } else if (rawTitle.includes(':')) {
    const colonIdx = rawTitle.indexOf(':');
    title = rawTitle.slice(0, colonIdx).trim();
    matchup = rawTitle.slice(colonIdx + 1).trim();
  }

  let away_team = '';
  let home_team = '';

  const vsMatch = matchup.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    const first = vsMatch[1].trim();
    const second = vsMatch[2].trim();
    const firstHome = firstIsHome !== null ? firstIsHome : !(cal && cal.team_order === 'away_home');
    if (firstHome) {
      home_team = first;
      away_team = second;
    } else {
      away_team = first;
      home_team = second;
    }
    // No colon means the full title was just the matchup — clear it since teams say it all
    if (title === rawTitle) title = '';
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

  // All calendar types use ical-expander so recurring events (RRULE) — e.g.
  // a weekly practice series — get expanded into individual dated occurrences
  // instead of only their series' original start date.
  const isHockey = cal.type === 'hockey_games';
  // For public_skates calendars every event is a skate session regardless of title keyword
  const forceSkate = cal.type === 'public_skates';

  const text = await fetchIcalText(cal);
  if (text == null) return;

  // Calendar may have been deleted while the fetch was in flight
  if (cal.id && !db.findById('calendars', cal.id)) return;

  let expander;
  try {
    expander = new IcalExpander({ ics: text, maxIterations: 2000 });
  } catch (err) {
    console.error(`[calendar] parse failed for "${cal.name}":`, err.message);
    if (cal.id) db.update('calendars', cal.id, { last_sync_at: new Date().toISOString(), last_sync_error: `Parse failed: ${err.message}` });
    return;
  }

  const result = expander.between(cutoff, horizon);

  // One transaction for the whole import — a calendar of N events costs one
  // file write instead of N
  db.transaction((tx) => {
    if (cal.id) tx.update('calendars', cal.id, { cal_name: extractCalName(text) });

    // findByField scans the whole activities table, and this runs once per
    // imported event — index the uids up front instead. Rows upserted below
    // are folded back in so a uid seen twice in one import still sees the
    // values written by the first pass.
    const activityByUid = new Map();
    for (const row of tx.findAll('activities')) {
      if (row.calendar_uid) activityByUid.set(row.calendar_uid, row);
    }

    function processOccurrence(startDate, endDate, item) {
      const start = startDate.toJSDate();
      if (start < cutoff || start > horizon) return;
      const end = endDate ? endDate.toJSDate() : new Date(start.getTime() + 3600000);
      const baseUid = item.uid || String(start.getTime());
      const uid = `${baseUid}__${start.toISOString()}`;
      const rawTitle = item.summary || '';

      if (isHockey) {
        const location = (item.location || '').trim();
        if (location && !location.toLowerCase().includes('san mateo')) return;
      }

      importedUids.add(uid);
      const existing = activityByUid.get(uid) || null;

      let title = rawTitle;
      let away_team = '';
      let home_team = '';
      if (isHockey) {
        const parsed = parseTitle(rawTitle, cal);
        title = parsed.title;
        away_team = parsed.away_team;
        home_team = parsed.home_team;
      }

      const row = {
        calendar_uid: uid,
        calendar_id: cal.id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        raw_title: rawTitle,
        title: title || '',
        home_team: (existing && existing.teams_manually_set) ? existing.home_team : home_team,
        away_team: (existing && existing.teams_manually_set) ? existing.away_team : away_team,
        home_locker: existing?.home_locker || '',
        away_locker: existing?.away_locker || '',
        lr_auto_assigned: existing?.lr_auto_assigned || 0,
        is_skate: forceSkate ? 1 : (rawTitle.includes(keyword) ? 1 : 0),
      };
      tx.upsertByField('activities', 'calendar_uid', uid, row);
      activityByUid.set(uid, { ...(existing || {}), ...row });
      count++;
    }

    for (const event of result.events) {
      processOccurrence(event.startDate, event.endDate, event);
    }
    for (const occ of result.occurrences) {
      processOccurrence(occ.startDate, occ.endDate, occ.item);
    }
  });

  if (cal.id) {
    db.transaction((tx) => {
      // Remove games from this calendar that are in the import window but were filtered out
      const existing = tx.findAll('activities').filter((g) => {
        if (g.calendar_id !== cal.id) return false;
        if (importedUids.has(g.calendar_uid)) return false;
        const t = new Date(g.start_time);
        return t >= cutoff && t <= horizon;
      });
      existing.forEach((g) => tx.remove('activities', g.id));
      if (existing.length) console.log(`[calendar] "${cal.name}" removed ${existing.length} filtered-out games`);

      tx.update('calendars', cal.id, { last_sync_at: new Date().toISOString(), last_sync_error: null, last_sync_count: count });

      // Auto-extract league + teams from hockey_games calendars
      if (cal.type === 'hockey_games') {
        const SKIP = new Set(['open', 'tbd', 'away tbd', 'home tbd', '']);
        const calGames = tx.findAll('activities').filter((g) => g.calendar_id === cal.id);
        const teamNames = new Set();
        for (const g of calGames) {
          if (g.home_team && !SKIP.has(g.home_team.toLowerCase())) teamNames.add(g.home_team);
          if (g.away_team && !SKIP.has(g.away_team.toLowerCase())) teamNames.add(g.away_team);
        }

        if (teamNames.size > 0) {
          // Find or create league named after this calendar
          let league = tx.findAll('leagues').find((l) => l.name.toLowerCase() === cal.name.toLowerCase());
          if (!league) {
            league = tx.insert('leagues', { name: cal.name, locker_sequence_id: null });
            console.log(`[calendar] created league "${cal.name}"`);
          }

          const existingTeams = tx.findAll('teams').filter((t) => t.league_id === league.id);
          const existingNames = new Set(existingTeams.map((t) => t.name.toLowerCase()));

          for (const name of teamNames) {
            if (!existingNames.has(name.toLowerCase())) {
              tx.insert('teams', { name, league_id: league.id, color: '' });
              console.log(`[calendar] added team "${name}" to league "${cal.name}"`);
            }
          }
        }
      }
    });
  }

  console.log(`[calendar] "${cal.name}" synced ${count} events`);

  // Auto-assign locker rooms for newly-imported unassigned games (runs its own
  // transaction; a league created above starts with no sequence, so running
  // after extraction doesn't change assignments)
  if (cal.type === 'hockey_games') {
    autoAssign();
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
  timer.unref();
  pollTimers.set(cal.id, timer);
}

function cancelCalendar(calId) {
  const id = Number(calId);
  if (pollTimers.has(id)) {
    clearTimeout(pollTimers.get(id));
    pollTimers.delete(id);
  }
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

// Calendar sync only imports events within [now-12h, now+30d] and only cleans
// up rows inside that same window, so a game drops out of range 12 hours after
// it starts and is then never touched again. Without this, activities grow
// without bound — and every db write rewrites the whole JSON file, so the cost
// is paid on every save, not just on reads. Returns the number removed.
function pruneOldActivities(keepDays = 30) {
  const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString();
  return db.transaction((tx) => {
    const old = tx.findAll('activities').filter((g) => g.start_time && g.start_time < cutoff);
    old.forEach((g) => tx.remove('activities', g.id));
    return old.length;
  });
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
    timer.unref();
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

module.exports = { startPolling, triggerRefresh, triggerCalendarRefresh, parseTitle, syncCalendar, scheduleCalendar, cancelCalendar, pruneOldActivities };
