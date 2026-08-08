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

function buildCalMap(tx) {
  const calendars = tx.findAll('calendars');
  const map = {}; // calId → { calSeqId, eventMode }
  for (const cal of calendars) {
    map[cal.id] = { calSeqId: cal.locker_sequence_id || null, eventMode: cal.event_mode || 'teams' };
  }
  return map;
}

// Practice-mode games that share an exact start time are treated as one time
// slot: they get a single locker pair between them instead of one each.
function buildSlots(dayGames, calMap) {
  const slots = [];
  const practiceSlotByStart = new Map();
  for (const game of dayGames) {
    const calEntry = game.calendar_id ? calMap[game.calendar_id] : null;
    const isPractice = calEntry && calEntry.eventMode === 'practice';
    if (isPractice) {
      const key = new Date(game.start_time).getTime();
      if (practiceSlotByStart.has(key)) {
        slots[practiceSlotByStart.get(key)].games.push(game);
        continue;
      }
      practiceSlotByStart.set(key, slots.length);
    }
    slots.push({ games: [game] });
  }
  return slots;
}

function processDay(dayGames, calMap, seqMap, standardSeq) {
  const updates = [];
  const conflicts = [];

  let blockPairIdx = 0;
  let prevEndMs = null;
  let prevAssignedHome = null;
  let prevAssignedAway = null;
  let blockSeq = null; // sequence carried forward within a block

  const slots = buildSlots(dayGames, calMap);

  for (const slot of slots) {
    const leadGame = slot.games[0];
    const startMs = Math.min(...slot.games.map((g) => new Date(g.start_time).getTime()));
    const endMs = Math.max(...slot.games.map((g) => {
      const s = new Date(g.start_time).getTime();
      return g.end_time ? new Date(g.end_time).getTime() : s + 60 * 60 * 1000;
    }));

    const isNewBlock = prevEndMs !== null && startMs - prevEndMs > GAP_MS;
    if (isNewBlock) {
      // New block: clear conflict tracking but continue pair index so we don't
      // repeat the same pair at the start of the next block
      blockSeq = null;
      prevAssignedHome = null;
      prevAssignedAway = null;
    }

    // Sequence priority: carry-over within block → calendar-level → default
    // Once a block establishes a sequence, it continues for the rest of that
    // block even if a later slot's own calendar specifies a different one.
    const calEntry = leadGame.calendar_id ? calMap[leadGame.calendar_id] : null;
    const calSeqId = calEntry ? calEntry.calSeqId : null;
    const gameSeq = (calSeqId && seqMap[calSeqId]) || null;
    if (blockSeq === null && gameSeq) blockSeq = gameSeq;
    const seq = blockSeq || gameSeq || standardSeq;

    const isManual = slot.games.every((g) => !!(g.home_locker || g.away_locker) && !g.lr_auto_assigned);

    if (seq && seq.pairs && seq.pairs.length > 0) {
      const pair = seq.pairs[blockPairIdx % seq.pairs.length];

      if (!isManual) {
        // Conflict check: same locker used in consecutive slots within a block
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
            game_id: leadGame.id,
            start_time: leadGame.start_time,
            locker: conflicting,
          });
        }

        for (const game of slot.games) {
          updates.push({
            id: game.id,
            home_locker: pair.home,
            away_locker: pair.away,
          });
        }
        prevAssignedHome = pair.home;
        prevAssignedAway = pair.away;
      } else {
        prevAssignedHome = leadGame.home_locker;
        prevAssignedAway = leadGame.away_locker;
      }

      blockPairIdx++;
    }

    if (endMs > (prevEndMs || 0)) prevEndMs = endMs;
  }

  return { updates, conflicts };
}

// All reads and per-game updates run in one transaction: one file write per
// run instead of one per reset + one per assigned game
function autoAssign({ dateStr, resetExisting } = {}) {
  return db.transaction((tx) => {
    // Step 1: Reset games if requested — clears ALL locker assignments for the scope
    // (not just lr_auto_assigned ones, since older records may predate that flag)
    if (resetExisting) {
      const toReset = tx.findAll('activities').filter((g) => {
        if (!g.is_skate && (g.home_locker || g.away_locker)) {
          if (dateStr) return localDateStr(g.start_time) === dateStr;
          return true;
        }
        return false;
      });
      for (const g of toReset) {
        tx.update('activities', g.id, { home_locker: '', away_locker: '', lr_auto_assigned: 0 });
      }
    }

    // Step 2: Reload games after reset — only hockey_games calendars use locker rooms
    const hockeyCalIds = new Set(
      tx.findAll('calendars').filter((c) => c.type === 'hockey_games').map((c) => c.id)
    );
    const allGames = tx.findAll('activities', 'start_time').filter(
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
    const calMap = buildCalMap(tx);
    const seqList = tx.findAll('locker_sequences');
    const seqMap = Object.fromEntries(seqList.map((s) => [s.id, s]));
    const settings = tx.getSettings();
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
      const { updates, conflicts } = processDay(sorted, calMap, seqMap, standardSeq);

      for (const u of updates) {
        tx.update('activities', u.id, {
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
  });
}

module.exports = { autoAssign };
