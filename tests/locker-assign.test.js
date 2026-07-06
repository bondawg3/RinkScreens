import { describe, it, expect, beforeEach } from 'vitest';
import db from '../server/db.js';
import { autoAssign } from '../server/locker-assign.js';
import { resetDb } from './helpers.js';

// All times are UTC ISO strings; the assigner groups by *local* day, so keep
// each scenario inside a window that is the same day in any timezone.
const DAY = '2026-07-10';
const t = (hhmm) => `${DAY}T${hhmm}:00.000Z`;

let calId;

function seedBase({ pairs = [{ home: '1', away: '2' }, { home: '3', away: '4' }] } = {}) {
  const cal = db.insert('calendars', { name: 'Adult League', type: 'hockey_games', url: 'http://x' });
  db.insert('locker_sequences', { name: 'Standard', pairs });
  return cal.id;
}

function addGame(overrides = {}) {
  return db.insert('games', {
    calendar_id: calId,
    start_time: t('10:00'),
    end_time: t('11:00'),
    home_team: 'A', away_team: 'B',
    home_locker: '', away_locker: '',
    lr_auto_assigned: 0,
    is_skate: 0,
    ...overrides,
  });
}

beforeEach(() => {
  resetDb();
  calId = seedBase();
});

describe('autoAssign', () => {
  it('assigns sequence pairs in order and cycles', () => {
    const g1 = addGame({ start_time: t('10:00'), end_time: t('11:00') });
    const g2 = addGame({ start_time: t('11:00'), end_time: t('12:00') });
    const g3 = addGame({ start_time: t('12:00'), end_time: t('13:00') });

    const result = autoAssign();
    expect(result.assigned).toBe(3);

    expect(db.findById('games', g1.id)).toMatchObject({ home_locker: '1', away_locker: '2', lr_auto_assigned: 1 });
    expect(db.findById('games', g2.id)).toMatchObject({ home_locker: '3', away_locker: '4' });
    // Cycles back to the first pair
    expect(db.findById('games', g3.id)).toMatchObject({ home_locker: '1', away_locker: '2' });
  });

  it('reports a conflict when consecutive games in a block share a locker', () => {
    resetDb();
    calId = seedBase({ pairs: [{ home: '1', away: '2' }] });
    addGame({ start_time: t('10:00'), end_time: t('11:00') });
    const g2 = addGame({ start_time: t('11:00'), end_time: t('12:00') });

    const result = autoAssign();
    expect(result.assigned).toBe(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].game_id).toBe(g2.id);
  });

  it('does not flag a conflict across a 150+ minute gap (new block)', () => {
    resetDb();
    calId = seedBase({ pairs: [{ home: '1', away: '2' }] });
    addGame({ start_time: t('08:00'), end_time: t('09:00') });
    addGame({ start_time: t('12:00'), end_time: t('13:00') }); // 180 min after prev end

    const result = autoAssign();
    expect(result.assigned).toBe(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it('leaves manually assigned games alone but keeps the pair rotation moving', () => {
    const g1 = addGame({ start_time: t('10:00'), end_time: t('11:00'), home_locker: '7', away_locker: '8' });
    const g2 = addGame({ start_time: t('11:00'), end_time: t('12:00') });

    const result = autoAssign();
    expect(result.assigned).toBe(1);
    expect(db.findById('games', g1.id)).toMatchObject({ home_locker: '7', away_locker: '8', lr_auto_assigned: 0 });
    // Manual game consumed pair index 0, so the next game gets pair 2
    expect(db.findById('games', g2.id)).toMatchObject({ home_locker: '3', away_locker: '4' });
  });

  it('skips skate sessions and games from non-hockey calendars', () => {
    const fsCal = db.insert('calendars', { name: 'Figure Skating', type: 'figure_skating', url: 'http://y' });
    const skate = addGame({ is_skate: 1 });
    const figure = addGame({ calendar_id: fsCal.id });

    const result = autoAssign();
    expect(result.assigned).toBe(0);
    expect(db.findById('games', skate.id).home_locker).toBe('');
    expect(db.findById('games', figure.id).home_locker).toBe('');
  });

  it('scopes to a single date when dateStr is given', () => {
    const g1 = addGame({ start_time: t('10:00'), end_time: t('11:00') });
    const other = addGame({ start_time: '2026-07-15T10:00:00.000Z', end_time: '2026-07-15T11:00:00.000Z' });

    autoAssign({ dateStr: DAY });
    expect(db.findById('games', g1.id).home_locker).toBe('1');
    expect(db.findById('games', other.id).home_locker).toBe('');
  });

  it('resetExisting clears manual assignments and reassigns from the sequence', () => {
    const g1 = addGame({ home_locker: '9', away_locker: '10', lr_auto_assigned: 0 });

    const result = autoAssign({ resetExisting: true });
    expect(result.assigned).toBe(1);
    expect(db.findById('games', g1.id)).toMatchObject({ home_locker: '1', away_locker: '2', lr_auto_assigned: 1 });
  });

  it('prefers a calendar-level sequence over the default', () => {
    const special = db.insert('locker_sequences', { name: 'Special', pairs: [{ home: '5', away: '6' }] });
    db.update('calendars', calId, { locker_sequence_id: special.id });
    const g1 = addGame();

    autoAssign();
    expect(db.findById('games', g1.id)).toMatchObject({ home_locker: '5', away_locker: '6' });
  });

  it('does nothing when no sequence exists at all', () => {
    resetDb();
    const cal = db.insert('calendars', { name: 'League', type: 'hockey_games', url: 'http://x' });
    calId = cal.id;
    const g1 = addGame();

    const result = autoAssign();
    expect(result.assigned).toBe(0);
    expect(db.findById('games', g1.id).home_locker).toBe('');
  });
});
