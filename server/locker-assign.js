const db = require('./db');

const GAP_MS = 150 * 60 * 1000; // 150 minutes

function localDateStr(isoStr) {
  const d = new Date(isoStr);
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function buildCalLeagueMap() {
  const calendars = db.findAll('calendars');
  const leagues = db.findAll('leagues');
  const map = {}; // calId → { league, calSeqId }
  for (const cal of calendars) {
    const league = leagues.find((l) => l.name.toLowerCase() === cal.name.toLowerCase());
    map[cal.id] = { league: league || null, calSeqId: cal.locker_sequence_id || null };
  }
  return map;
}

function processDay(dayGames, calLeagueMap, seqMap, standardSeq) {
  const updates = [];
  const conflicts = [];

  let blockPairIdx = 0;
  let prevEndMs = null;
  let prevAssignedHome = null;
  let prevAssignedAway = null;
  let blockSeq = null; // sequence carried forward within a block

  for (const game of dayGames) {
    const startMs = new Date(game.start_time).getTime();
    const endMs = game.end_time
      ? new Date(game.end_time).getTime()
      : startMs + 60 * 60 * 1000;

    const isNewBlock = prevEndMs !== null && startMs - prevEndMs > GAP_MS;
    if (isNewBlock) {
      // New block: clear conflict tracking but continue pair index so we don't
      // repeat the same pair at the start of the next block
      blockSeq = null;
      prevAssignedHome = null;
      prevAssignedAway = null;
    }

    // Sequence priority: calendar-level → league-level → carry-over within block → default
    const calEntry = game.calendar_id ? calLeagueMap[game.calendar_id] : null;
    const league = calEntry ? calEntry.league : null;
    const calSeqId = calEntry ? calEntry.calSeqId : null;
    const gameSeq =
      (calSeqId && seqMap[calSeqId]) ||
      (league && league.locker_sequence_id && seqMap[league.locker_sequence_id]) ||
      null;
    if (gameSeq) blockSeq = gameSeq;
    const seq = gameSeq || blockSeq || standardSeq;

    const isManual = !!(game.home_locker || game.away_locker) && !game.lr_auto_assigned;

    if (seq && seq.pairs && seq.pairs.length > 0) {
      const pair = seq.pairs[blockPairIdx % seq.pairs.length];

      if (!isManual) {
        // Conflict check: same locker used in consecutive games within a block
        if (
          prevAssignedHome !== null &&
          !isNewBlock &&
          (pair.home === prevAssignedHome ||
            pair.away === prevAssignedAway ||
            pair.home === prevAssignedAway ||
            pair.away === prevAssignedHome)
        ) {
          const conflicting =
            pair.home === prevAssignedHome || pair.home === prevAssignedAway
              ? pair.home
              : pair.away;
          conflicts.push({
            game_id: game.id,
            start_time: game.start_time,
            locker: conflicting,
          });
        }

        updates.push({
          id: game.id,
          home_locker: pair.home,
          away_locker: pair.away,
        });
        prevAssignedHome = pair.home;
        prevAssignedAway = pair.away;
      } else {
        prevAssignedHome = game.home_locker;
        prevAssignedAway = game.away_locker;
      }

      blockPairIdx++;
    }

    if (endMs > (prevEndMs || 0)) prevEndMs = endMs;
  }

  return { updates, conflicts };
}

function autoAssign({ dateStr, resetExisting } = {}) {
  // Step 1: Reset games if requested — clears ALL locker assignments for the scope
  // (not just lr_auto_assigned ones, since older records may predate that flag)
  if (resetExisting) {
    const toReset = db.findAll('activities').filter((g) => {
      if (!g.is_skate && (g.home_locker || g.away_locker)) {
        if (dateStr) return localDateStr(g.start_time) === dateStr;
        return true;
      }
      return false;
    });
    for (const g of toReset) {
      db.update('activities', g.id, { home_locker: '', away_locker: '', lr_auto_assigned: 0 });
    }
  }

  // Step 2: Reload games after reset — only hockey_games calendars use locker rooms
  const hockeyCalIds = new Set(
    db.findAll('calendars').filter((c) => c.type === 'hockey_games').map((c) => c.id)
  );
  const allGames = db.findAll('activities', 'start_time').filter(
    (g) => !g.is_skate && hockeyCalIds.has(g.calendar_id)
  );

  // Step 3: Determine candidate dates (days that have at least one unassigned game)
  const candidateDates = new Set(
    allGames
      .filter((g) => {
        if (dateStr && localDateStr(g.start_time) !== dateStr) return false;
        return !g.home_locker && !g.away_locker;
      })
      .map((g) => localDateStr(g.start_time))
  );

  if (candidateDates.size === 0) return { assigned: 0, conflicts: [] };

  // Step 4: Build lookup maps
  const calLeagueMap = buildCalLeagueMap();
  const seqList = db.findAll('locker_sequences');
  const seqMap = Object.fromEntries(seqList.map((s) => [s.id, s]));
  const settings = db.getSettings();
  const defaultSeqId = settings.default_locker_sequence_id;
  const standardSeq =
    (defaultSeqId && seqMap[defaultSeqId]) ||
    seqList.find((s) => s.name.toLowerCase() === 'standard') ||
    null;

  // Step 5: For each candidate date, load ALL games that day (for correct block tracking)
  const byDate = {};
  for (const g of allGames) {
    const d = localDateStr(g.start_time);
    if (!candidateDates.has(d)) continue;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(g);
  }

  // Step 6: Process each day
  let totalAssigned = 0;
  const allConflicts = [];

  for (const date of Object.keys(byDate).sort()) {
    const sorted = byDate[date].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time)
    );
    const { updates, conflicts } = processDay(sorted, calLeagueMap, seqMap, standardSeq);

    for (const u of updates) {
      db.update('activities', u.id, {
        home_locker: u.home_locker,
        away_locker: u.away_locker,
        lr_auto_assigned: 1,
      });
      totalAssigned++;
    }
    allConflicts.push(...conflicts);
  }

  console.log(`[locker-assign] assigned ${totalAssigned} games, ${allConflicts.length} conflicts`);
  return { assigned: totalAssigned, conflicts: allConflicts };
}

module.exports = { autoAssign };
