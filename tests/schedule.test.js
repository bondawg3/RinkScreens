import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import apiRouter from '../server/routes/api.js';
import db from '../server/db.js';
import { resolveActive, validateBlock, pruneOldBlocks, localDateStr } from '../server/schedule.js';
import { resetDb } from './helpers.js';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const PASSWORD = 'hunter22222';

async function setupAdmin() {
  const res = await request(app).post('/api/auth/setup').send({ password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

function seed() {
  const screenA = db.insert('screens', { name: 'Base', display_type: 'games' });
  const screenB = db.insert('screens', { name: 'Alt', display_type: 'skate' });
  const display = db.insert('displays', { name: 'Lobby TV', ip: '10.0.0.5', screen_id: screenA.id });
  return { screenA, screenB, display };
}

beforeEach(resetDb);

describe('validateBlock', () => {
  it('accepts 15-minute-aligned times and 24:00 ends', () => {
    expect(validateBlock({ date: '2026-07-10', start_time: '09:15', end_time: '10:30' })).toBeNull();
    expect(validateBlock({ date: '2026-07-10', start_time: '23:45', end_time: '24:00' })).toBeNull();
  });

  it('rejects off-grid times, bad dates, and non-positive ranges', () => {
    expect(validateBlock({ date: '2026-07-10', start_time: '09:10', end_time: '10:00' })).toBeTruthy();
    expect(validateBlock({ date: '2026-07-10', start_time: '09:00', end_time: '09:00' })).toBeTruthy();
    expect(validateBlock({ date: '2026-07-10', start_time: '22:00', end_time: '21:00' })).toBeTruthy();
    expect(validateBlock({ date: 'July 10', start_time: '09:00', end_time: '10:00' })).toBeTruthy();
    expect(validateBlock({ date: '2026-07-10', start_time: '24:00', end_time: '24:00' })).toBeTruthy();
  });
});

describe('resolveActive', () => {
  it('falls back to the base screen when no block is active', () => {
    const { screenA, display } = seed();
    const r = resolveActive(display.id, new Date(2026, 6, 10, 8, 0));
    expect(r.screen_id).toBe(screenA.id);
    expect(r.scheduled).toBe(false);
  });

  it('returns the block screen during its window and reports boundaries', () => {
    const { screenB, display } = seed();
    db.insert('display_schedules', {
      display_id: display.id, date: '2026-07-10',
      start_time: '09:00', end_time: '11:30', content_screen_id: screenB.id,
    });

    const during = resolveActive(display.id, new Date(2026, 6, 10, 10, 0));
    expect(during.screen_id).toBe(screenB.id);
    expect(during.scheduled).toBe(true);
    expect(during.valid_until).toEqual(new Date(2026, 6, 10, 11, 30));

    const before = resolveActive(display.id, new Date(2026, 6, 10, 8, 0));
    expect(before.scheduled).toBe(false);
    expect(before.valid_until).toEqual(new Date(2026, 6, 10, 9, 0)); // next block start

    const after = resolveActive(display.id, new Date(2026, 6, 10, 12, 0));
    expect(after.scheduled).toBe(false);
    expect(after.valid_until).toEqual(new Date(2026, 6, 11, 0, 0)); // midnight
  });

  it('block starting at its start minute is active; end minute is exclusive', () => {
    const { screenA, screenB, display } = seed();
    db.insert('display_schedules', {
      display_id: display.id, date: '2026-07-10',
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    expect(resolveActive(display.id, new Date(2026, 6, 10, 9, 0)).screen_id).toBe(screenB.id);
    expect(resolveActive(display.id, new Date(2026, 6, 10, 10, 0)).screen_id).toBe(screenA.id);
  });

  it('ignores blocks on other dates and other displays', () => {
    const { screenA, screenB, display } = seed();
    const other = db.insert('displays', { name: 'Rink TV', ip: '10.0.0.6' });
    db.insert('display_schedules', {
      display_id: display.id, date: '2026-07-11',
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    db.insert('display_schedules', {
      display_id: other.id, date: '2026-07-10',
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    expect(resolveActive(display.id, new Date(2026, 6, 10, 9, 30)).screen_id).toBe(screenA.id);
  });
});

describe('schedule API', () => {
  it('creates, lists, and deletes blocks; TV /active resolves them', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    const date = localDateStr(new Date());

    const create = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date, start_time: '00:00', end_time: '24:00', content_screen_id: screenB.id });
    expect(create.status).toBe(200);

    const list = await request(app)
      .get(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(1);

    // /active is unauthenticated (TVs have no token) and resolves the block
    const active = await request(app).get(`/api/displays/${display.id}/active`);
    expect(active.status).toBe(200);
    expect(active.body.scheduled).toBe(true);
    expect(active.body.screen.id).toBe(screenB.id);
    expect(new Date(active.body.valid_until).getTime()).toBeGreaterThan(Date.now());

    const del = await request(app)
      .delete(`/api/schedule-blocks/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const afterDelete = await request(app).get(`/api/displays/${display.id}/active`);
    expect(afterDelete.body.scheduled).toBe(false);
    expect(afterDelete.body.screen.name).toBe('Base');
  });

  it('rejects overlapping and invalid blocks', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();

    const ok = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', start_time: '09:00', end_time: '11:00', content_screen_id: screenB.id });
    expect(ok.status).toBe(200);

    const overlap = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', start_time: '10:00', end_time: '12:00', content_screen_id: screenB.id });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error).toMatch(/Overlaps/);

    const offGrid = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', start_time: '12:05', end_time: '13:00', content_screen_id: screenB.id });
    expect(offGrid.status).toBe(400);

    const badScreen = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', start_time: '13:00', end_time: '14:00', content_screen_id: 9999 });
    expect(badScreen.status).toBe(400);

    // adjacent (touching) blocks are fine
    const adjacent = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', start_time: '11:00', end_time: '12:00', content_screen_id: screenB.id });
    expect(adjacent.status).toBe(200);
  });

  async function addBlock(token, display, screen, date, start_time, end_time) {
    const res = await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date, start_time, end_time, content_screen_id: screen.id });
    expect(res.status).toBe(200);
  }

  it('copy: duplicates a single day to another date, skipping overlaps', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    await addBlock(token, display, screenB, '2026-08-01', '09:00', '10:15');
    await addBlock(token, display, screenB, '2026-08-01', '12:00', '13:00');
    // pre-existing conflict on the destination day
    await addBlock(token, display, screenB, '2026-08-05', '09:30', '10:00');

    const copy = await request(app)
      .post(`/api/displays/${display.id}/schedule/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({ from_start: '2026-08-01', from_end: '2026-08-01', to_start: '2026-08-05' });
    expect(copy.status).toBe(200);
    expect(copy.body).toEqual({ created: 1, skipped: 1, replaced: 0 }); // 12:00 copied; 09:00 overlaps

    const list = await request(app)
      .get(`/api/displays/${display.id}/schedule?from=2026-08-05&to=2026-08-05`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(2);
  });

  it('copy: duplicates a 7-day week preserving each block\'s day-offset', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    // Sun 2026-08-02 week (Sun–Sat): blocks on Sun and Wed
    await addBlock(token, display, screenB, '2026-08-02', '09:00', '10:00');
    await addBlock(token, display, screenB, '2026-08-05', '14:00', '15:00');

    const copy = await request(app)
      .post(`/api/displays/${display.id}/schedule/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({ from_start: '2026-08-02', from_end: '2026-08-08', to_start: '2026-08-09' });
    expect(copy.status).toBe(200);
    expect(copy.body).toEqual({ created: 2, skipped: 0, replaced: 0 });

    // Wed block (offset +3) lands on 2026-08-12
    const wed = await request(app)
      .get(`/api/displays/${display.id}/schedule?from=2026-08-12&to=2026-08-12`)
      .set('Authorization', `Bearer ${token}`);
    expect(wed.body).toHaveLength(1);
    expect(wed.body[0].start_time).toBe('14:00');
  });

  it('copy preview: reports conflicting destination days without writing', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    await addBlock(token, display, screenB, '2026-08-01', '09:00', '10:00');
    await addBlock(token, display, screenB, '2026-08-05', '09:30', '10:30'); // conflicts

    const preview = await request(app)
      .post(`/api/displays/${display.id}/schedule/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({ from_start: '2026-08-01', from_end: '2026-08-01', to_start: '2026-08-05', mode: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body.total).toBe(1);
    expect(preview.body.conflictDates).toEqual([
      { date: '2026-08-05', incoming: 1, existing: 1, conflicting: 1 },
    ]);

    // nothing written
    const list = await request(app)
      .get(`/api/displays/${display.id}/schedule?from=2026-08-05&to=2026-08-05`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(1);
  });

  it('copy replace: evicts the overlapped blocks on a resolved day, keeps the rest', async () => {
    const token = await setupAdmin();
    const { screenA, screenB, display } = seed();
    await addBlock(token, display, screenB, '2026-08-01', '09:00', '10:00');
    await addBlock(token, display, screenA, '2026-08-05', '09:30', '10:30'); // overlaps the copy
    await addBlock(token, display, screenA, '2026-08-05', '14:00', '15:00'); // untouched

    const copy = await request(app)
      .post(`/api/displays/${display.id}/schedule/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from_start: '2026-08-01', from_end: '2026-08-01', to_start: '2026-08-05',
        mode: 'apply', resolutions: { '2026-08-05': 'replace' },
      });
    expect(copy.status).toBe(200);
    expect(copy.body).toEqual({ created: 1, skipped: 0, replaced: 1 });

    const list = await request(app)
      .get(`/api/displays/${display.id}/schedule?from=2026-08-05&to=2026-08-05`)
      .set('Authorization', `Bearer ${token}`);
    const times = list.body.map((b) => b.start_time).sort();
    expect(times).toEqual(['09:00', '14:00']); // 09:30 evicted, 09:00 copied in, 14:00 kept
  });

  it('copy: rejects a destination that overlaps the source range', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    await addBlock(token, display, screenB, '2026-08-02', '09:00', '10:00');
    const copy = await request(app)
      .post(`/api/displays/${display.id}/schedule/copy`)
      .set('Authorization', `Bearer ${token}`)
      .send({ from_start: '2026-08-02', from_end: '2026-08-08', to_start: '2026-08-05' });
    expect(copy.status).toBe(400);
    expect(copy.body.error).toMatch(/overlaps the source/i);
  });

  it('stores and returns schedule_prefs through settings (admin-only)', async () => {
    const token = await setupAdmin();
    const prefs = { swap_sides: true, grid_density: 3, week_start: 1, hidden_types: ['webpage'] };
    const patch = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ schedule_prefs: prefs });
    expect(patch.status).toBe(200);

    const admin = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(admin.body.schedule_prefs).toEqual(prefs);

    // TVs (unauthenticated) must not receive it
    const pub = await request(app).get('/api/settings');
    expect(pub.body.schedule_prefs).toBeUndefined();
  });

  it('day-replace swaps the whole day atomically and rejects overlaps', async () => {
    const token = await setupAdmin();
    const { screenA, screenB, display } = seed();
    await addBlock(token, display, screenB, '2026-08-01', '09:00', '10:00');

    const put = await request(app)
      .put(`/api/displays/${display.id}/schedule/day`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', blocks: [
        { start_time: '08:00', end_time: '09:00', content_screen_id: screenA.id },
        { start_time: '09:00', end_time: '10:30', content_screen_id: screenB.id },
      ] });
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(2);

    const list = await request(app)
      .get(`/api/displays/${display.id}/schedule?from=2026-08-01&to=2026-08-01`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(2); // old 09:00–10:00 replaced, not appended

    const bad = await request(app)
      .put(`/api/displays/${display.id}/schedule/day`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-08-01', blocks: [
        { start_time: '08:00', end_time: '09:30', content_screen_id: screenA.id },
        { start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id },
      ] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/overlap/i);
  });

  it('blocks deleting a screen that future schedule blocks reference', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2099-01-01', start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id });

    const del = await request(app)
      .delete(`/api/screens/${screenB.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(400);
    expect(del.body.error).toMatch(/Lobby TV/);

    // unreferenced screens still delete fine
    const extra = db.insert('screens', { name: 'Unused', display_type: 'games' });
    const ok = await request(app)
      .delete(`/api/screens/${extra.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
  });

  it('deleting a display cascades its schedule blocks', async () => {
    const token = await setupAdmin();
    const { screenB, display } = seed();
    await request(app)
      .post(`/api/displays/${display.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2099-01-01', start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id });

    await request(app)
      .delete(`/api/displays/${display.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(db.findAll('display_schedules')).toHaveLength(0);
  });

  it('prunes blocks older than the keep window', () => {
    const { screenB, display } = seed();
    db.insert('display_schedules', {
      display_id: display.id, date: '2020-01-01',
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    const future = localDateStr(new Date(Date.now() + 86400000));
    db.insert('display_schedules', {
      display_id: display.id, date: future,
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    expect(pruneOldBlocks(7)).toBe(1);
    expect(db.findAll('display_schedules')).toHaveLength(1);
  });

  it('keeps the last 30 days and drops anything older (default window)', () => {
    const { screenB, display } = seed();
    const mk = (daysAgo) => db.insert('display_schedules', {
      display_id: display.id,
      date: localDateStr(new Date(Date.now() - daysAgo * 86400000)),
      start_time: '09:00', end_time: '10:00', content_screen_id: screenB.id,
    });
    mk(29);  // inside the window — kept
    mk(31);  // outside — pruned
    mk(400); // outside — pruned
    expect(pruneOldBlocks()).toBe(2);
    expect(db.findAll('display_schedules')).toHaveLength(1);
  });
});
