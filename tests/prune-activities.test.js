import { describe, it, expect, beforeEach } from 'vitest';
import db from '../server/db.js';
import { pruneOldActivities } from '../server/calendar.js';
import { resetDb } from './helpers.js';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function addActivity(startTime, extra = {}) {
  return db.insert('activities', {
    calendar_id: 1,
    calendar_uid: `uid-${startTime}-${Math.random()}`,
    start_time: startTime,
    end_time: startTime,
    title: 'Game',
    ...extra,
  });
}

describe('pruneOldActivities', () => {
  beforeEach(() => resetDb());

  it('removes activities older than the keep window', () => {
    addActivity(daysAgo(45));
    addActivity(daysAgo(31));
    expect(pruneOldActivities(30)).toBe(2);
    expect(db.findAll('activities')).toHaveLength(0);
  });

  it('keeps activities inside the window and in the future', () => {
    const recent = addActivity(daysAgo(5));
    const future = addActivity(new Date(Date.now() + 86400000).toISOString());
    expect(pruneOldActivities(30)).toBe(0);
    const ids = db.findAll('activities').map((a) => a.id).sort();
    expect(ids).toEqual([recent.id, future.id].sort());
  });

  it('prunes only what is past the cutoff, leaving the rest intact', () => {
    const old = addActivity(daysAgo(60));
    const kept = addActivity(daysAgo(2));
    expect(pruneOldActivities(30)).toBe(1);
    const rows = db.findAll('activities');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(kept.id);
    expect(rows.some((r) => r.id === old.id)).toBe(false);
  });

  it('leaves rows with no start_time alone rather than deleting them', () => {
    addActivity(daysAgo(90));
    const noDate = db.insert('activities', { calendar_id: 1, title: 'No date' });
    expect(pruneOldActivities(30)).toBe(1);
    const rows = db.findAll('activities');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(noDate.id);
  });
});
