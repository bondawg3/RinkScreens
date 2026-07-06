import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import db from '../server/db.js';
import { resetDb, dbFilePath } from './helpers.js';

beforeEach(resetDb);

describe('JSON store', () => {
  it('inserts rows with sequential ids and created_at', () => {
    const a = db.insert('screens', { name: 'A' });
    const b = db.insert('screens', { name: 'B' });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.created_at).toBeTruthy();
  });

  it('does not reuse ids after a delete', () => {
    const a = db.insert('screens', { name: 'A' });
    db.remove('screens', a.id);
    const b = db.insert('screens', { name: 'B' });
    expect(b.id).toBe(2);
  });

  it('findById coerces string ids', () => {
    const a = db.insert('screens', { name: 'A' });
    expect(db.findById('screens', String(a.id))).toMatchObject({ name: 'A' });
    expect(db.findById('screens', 999)).toBeNull();
  });

  it('update merges changes and returns the row; null when missing', () => {
    const a = db.insert('screens', { name: 'A', ip: '1.2.3.4' });
    const updated = db.update('screens', a.id, { name: 'B' });
    expect(updated).toMatchObject({ name: 'B', ip: '1.2.3.4' });
    expect(db.update('screens', 999, { name: 'X' })).toBeNull();
  });

  it('remove reports whether a row was deleted', () => {
    const a = db.insert('screens', { name: 'A' });
    expect(db.remove('screens', a.id)).toBe(true);
    expect(db.remove('screens', a.id)).toBe(false);
  });

  it('findAll sorts by the given field', () => {
    db.insert('activities', { start_time: '2026-07-02T10:00:00Z' });
    db.insert('activities', { start_time: '2026-07-01T10:00:00Z' });
    const rows = db.findAll('activities', 'start_time');
    expect(rows[0].start_time).toBe('2026-07-01T10:00:00Z');
  });

  it('upsertByField inserts then updates in place', () => {
    db.upsertByField('activities', 'calendar_uid', 'u1', { calendar_uid: 'u1', title: 'first' });
    db.upsertByField('activities', 'calendar_uid', 'u1', { calendar_uid: 'u1', title: 'second' });
    const rows = db.findAll('activities');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('second');
  });

  it('settings round-trip via setSetting / setSettings / getSettings', () => {
    db.setSetting('rink_name', 'Test Rink');
    db.setSettings({ skate_keyword: 'Skate', foo: 'bar' });
    const s = db.getSettings();
    expect(s.rink_name).toBe('Test Rink');
    expect(s.skate_keyword).toBe('Skate');
    expect(s.foo).toBe('bar');
  });

  it('keeps a .bak of the previous state after each save', () => {
    db.insert('screens', { name: 'A' });
    db.insert('screens', { name: 'B' });
    const bak = JSON.parse(fs.readFileSync(`${dbFilePath()}.bak`, 'utf8'));
    expect(bak.screens).toHaveLength(1);
    expect(bak.screens[0].name).toBe('A');
  });

  it('recovers from db.json.bak when db.json is corrupt', () => {
    db.insert('screens', { name: 'A' });
    db.insert('screens', { name: 'B' }); // second save creates the .bak
    fs.writeFileSync(dbFilePath(), '{ not json', 'utf8');

    const rows = db.findAll('screens');
    expect(rows).toHaveLength(1); // backup is one save behind
    expect(rows[0].name).toBe('A');
    // The corrupt file is preserved for inspection
    expect(fs.existsSync(`${dbFilePath()}.corrupt`)).toBe(true);
  });

  it('throws instead of silently resetting when db.json and the backup are both unreadable', () => {
    db.insert('screens', { name: 'A' }); // first save — no .bak yet
    fs.writeFileSync(dbFilePath(), '{ not json', 'utf8');
    expect(() => db.findAll('screens')).toThrow(/Refusing to reset/);
  });
});

describe('transaction', () => {
  it('batches many operations into a single save', () => {
    db.insert('screens', { name: 'Before' }); // establishes db.json
    db.transaction((tx) => {
      tx.insert('screens', { name: 'A' });
      tx.insert('screens', { name: 'B' });
      tx.update('screens', 1, { name: 'Before2' });
    });
    // One save → the .bak holds the exact pre-transaction state
    const bak = JSON.parse(fs.readFileSync(`${dbFilePath()}.bak`, 'utf8'));
    expect(bak.screens).toHaveLength(1);
    expect(bak.screens[0].name).toBe('Before');
    expect(db.findAll('screens')).toHaveLength(3);
    expect(db.findById('screens', 1)).toMatchObject({ name: 'Before2' });
  });

  it('reads inside a transaction see earlier writes from the same transaction', () => {
    const result = db.transaction((tx) => {
      tx.upsertByField('activities', 'calendar_uid', 'u1', { calendar_uid: 'u1', title: 'first' });
      const existing = tx.findByField('activities', 'calendar_uid', 'u1');
      tx.upsertByField('activities', 'calendar_uid', 'u1', { calendar_uid: 'u1', title: `${existing.title}+second` });
      return tx.findAll('activities').length;
    });
    expect(result).toBe(1);
    expect(db.findAll('activities')[0].title).toBe('first+second');
  });

  it('persists nothing when the callback throws', () => {
    db.insert('screens', { name: 'Kept' });
    expect(() =>
      db.transaction((tx) => {
        tx.insert('screens', { name: 'Lost' });
        throw new Error('boom');
      })
    ).toThrow('boom');
    const rows = db.findAll('screens');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Kept');
  });
});

describe('cache invalidation', () => {
  it('picks up external writes to db.json', () => {
    db.insert('screens', { name: 'A' }); // populates the in-memory cache
    const onDisk = JSON.parse(fs.readFileSync(dbFilePath(), 'utf8'));
    onDisk.screens.push({ id: 99, name: 'External' });
    fs.writeFileSync(dbFilePath(), JSON.stringify(onDisk, null, 2), 'utf8');

    const rows = db.findAll('screens');
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('External');
  });

  it('returned rows are copies — mutating them does not corrupt the store', () => {
    db.insert('screens', { name: 'A' });
    const row = db.findAll('screens')[0];
    row.name = 'Mutated';
    expect(db.findAll('screens')[0].name).toBe('A');
    const byId = db.findById('screens', 1);
    byId.name = 'Mutated';
    expect(db.findById('screens', 1).name).toBe('A');
  });
});

describe('games -> activities migration', () => {
  // Older db.json files (pre-rename) store hockey games, rink events, figure
  // skating events, and public skate sessions under a "games" key. Existing
  // installs must not lose that data or its id sequence on upgrade.
  it('folds an old "games" key into "activities" and drops the old key on next save', () => {
    fs.writeFileSync(dbFilePath(), JSON.stringify({
      screens: [],
      games: [{ id: 7, title: 'Legacy Game', start_time: '2026-07-01T00:00:00Z' }],
      _seq: { screens: 1, games: 8 },
    }), 'utf8');

    const rows = db.findAll('activities');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 7, title: 'Legacy Game' });

    // Continues the old sequence rather than restarting at 1
    const inserted = db.insert('activities', { title: 'New Activity' });
    expect(inserted.id).toBe(8);

    const onDisk = JSON.parse(fs.readFileSync(dbFilePath(), 'utf8'));
    expect(onDisk.games).toBeUndefined();
    expect(onDisk.activities).toHaveLength(2);
    expect(onDisk._seq.games).toBeUndefined();
  });

  it('is a no-op when the db.json is already on the new schema', () => {
    db.insert('activities', { title: 'Already Migrated' });
    const rows = db.findAll('activities');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Already Migrated');
  });
});
