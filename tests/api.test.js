import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import apiRouter from '../server/routes/api.js';
import db from '../server/db.js';
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

beforeEach(resetDb);

describe('auth', () => {
  it('rejects setup with a short password', async () => {
    const res = await request(app).post('/api/auth/setup').send({ password: 'short' });
    expect(res.status).toBe(400);
  });

  it('sets up once, then refuses a second setup', async () => {
    await setupAdmin();
    const again = await request(app).post('/api/auth/setup').send({ password: PASSWORD });
    expect(again.status).toBe(409);
  });

  it('login fails before setup and with a wrong password', async () => {
    const before = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(before.status).toBe(401);

    await setupAdmin();
    const wrong = await request(app).post('/api/auth/login').send({ password: 'nope-nope' });
    expect(wrong.status).toBe(401);

    const right = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(right.status).toBe(200);
    expect(right.body.token).toBeTruthy();
  });

  it('auth/check reports configured and token validity', async () => {
    const unconfigured = await request(app).get('/api/auth/check');
    expect(unconfigured.body).toMatchObject({ configured: false, valid: false });

    const token = await setupAdmin();
    const valid = await request(app).get('/api/auth/check').set('Authorization', `Bearer ${token}`);
    expect(valid.body).toMatchObject({ configured: true, valid: true });

    const garbage = await request(app).get('/api/auth/check').set('Authorization', 'Bearer garbage');
    expect(garbage.body).toMatchObject({ configured: true, valid: false });
  });

  it('protected routes reject missing or bad tokens', async () => {
    const noToken = await request(app).post('/api/screens').send({ name: 'X' });
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .post('/api/screens')
      .set('Authorization', 'Bearer nonsense')
      .send({ name: 'X' });
    expect(badToken.status).toBe(401);
  });
});

describe('settings', () => {
  it('unauthenticated GET exposes only public display fields, never secrets', async () => {
    await setupAdmin(); // creates admin_password_hash and jwt_secret
    db.setSetting('rink_name', 'Test Rink');
    db.setSetting('ical_url', 'https://calendar.google.com/secret-address.ics');

    const res = await request(app).get('/api/settings');
    expect(res.body.rink_name).toBe('Test Rink');
    expect(res.body.jwt_secret).toBeUndefined();
    expect(res.body.admin_password_hash).toBeUndefined();
    expect(res.body.ical_url).toBeUndefined();
  });

  it('authenticated GET returns admin fields but still strips secrets', async () => {
    const token = await setupAdmin();
    db.setSetting('default_locker_sequence_id', 3);

    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.default_locker_sequence_id).toBe(3);
    expect(res.body.jwt_secret).toBeUndefined();
    expect(res.body.admin_password_hash).toBeUndefined();
  });

  it('PATCH cannot overwrite jwt_secret or admin_password_hash', async () => {
    const token = await setupAdmin();
    const before = db.getSettings();

    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ rink_name: 'New Name', jwt_secret: 'evil', admin_password_hash: 'evil' });
    expect(res.status).toBe(200);

    const after = db.getSettings();
    expect(after.rink_name).toBe('New Name');
    expect(after.jwt_secret).toBe(before.jwt_secret);
    expect(after.admin_password_hash).toBe(before.admin_password_hash);
  });
});

describe('screens', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('creates a screen and returns normalized defaults from GET', async () => {
    const created = await auth(request(app).post('/api/screens')).send({ name: 'Rink TV' });
    expect(created.status).toBe(200);

    const list = await request(app).get('/api/screens');
    const screen = list.body.find((s) => s.id === created.body.id);
    expect(screen).toMatchObject({
      name: 'Rink TV',
      bg_opacity: 100,
      visible: true,
      two_column: false,
      overflow_mode: 'none',
      rotate_interval: 30,
      days_ahead: 14,
      online: false,
    });
  });

  it('requires a name', async () => {
    const res = await auth(request(app).post('/api/screens')).send({});
    expect(res.status).toBe(400);
  });

  it('patches partial fields without clobbering others', async () => {
    const created = await auth(request(app).post('/api/screens')).send({ name: 'TV', bg_opacity: 55 });
    const patch = await auth(request(app).patch(`/api/screens/${created.body.id}`)).send({ visible: false });
    expect(patch.status).toBe(200);

    const list = await request(app).get('/api/screens');
    const screen = list.body.find((s) => s.id === created.body.id);
    expect(screen.visible).toBe(false);
    expect(screen.bg_opacity).toBe(55);
    expect(screen.name).toBe('TV');
  });

  it('404s when patching a missing screen', async () => {
    const res = await auth(request(app).patch('/api/screens/999')).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('displays', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('rejects duplicate names (case-insensitive) and duplicate IPs', async () => {
    await auth(request(app).post('/api/displays')).send({ name: 'Lobby', ip: '10.0.0.5' });

    const dupName = await auth(request(app).post('/api/displays')).send({ name: 'LOBBY', ip: '10.0.0.6' });
    expect(dupName.status).toBe(400);

    const dupIp = await auth(request(app).post('/api/displays')).send({ name: 'Cafe', ip: '10.0.0.5' });
    expect(dupIp.status).toBe(400);
  });

  it('requires both name and ip', async () => {
    const res = await auth(request(app).post('/api/displays')).send({ name: 'Lobby' });
    expect(res.status).toBe(400);
  });
});

describe('calendars', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('requires name, url, and type', async () => {
    const res = await auth(request(app).post('/api/calendars')).send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate names and duplicate URLs', async () => {
    await auth(request(app).post('/api/calendars')).send({ name: 'League', url: 'http://a', type: 'hockey_games' });

    const dupName = await auth(request(app).post('/api/calendars')).send({ name: 'league', url: 'http://b', type: 'hockey_games' });
    expect(dupName.status).toBe(400);

    const dupUrl = await auth(request(app).post('/api/calendars')).send({ name: 'Other', url: 'http://a', type: 'hockey_games' });
    expect(dupUrl.status).toBe(400);
  });

  it('hides the iCal URL and sync details from unauthenticated GET', async () => {
    db.insert('calendars', { name: 'League', url: 'https://calendar.google.com/secret.ics', type: 'hockey_games' });

    const unauth = await request(app).get('/api/calendars');
    expect(unauth.body).toHaveLength(1);
    expect(unauth.body[0].name).toBe('League');
    expect(unauth.body[0].url).toBeUndefined();

    const authed = await auth(request(app).get('/api/calendars'));
    expect(authed.body[0].url).toBe('https://calendar.google.com/secret.ics');
  });

  it('requires auth for the calendar debug endpoint', async () => {
    const res = await request(app).get('/api/games/debug-calendar');
    expect(res.status).toBe(401);
  });

  it('deleting a calendar also deletes its games', async () => {
    const cal = db.insert('calendars', { name: 'League', url: 'http://a', type: 'hockey_games' });
    const keep = db.insert('calendars', { name: 'Other', url: 'http://b', type: 'hockey_games' });
    db.insert('games', { calendar_id: cal.id, start_time: '2026-07-10T18:00:00.000Z' });
    db.insert('games', { calendar_id: keep.id, start_time: '2026-07-10T18:00:00.000Z' });

    const res = await auth(request(app).delete(`/api/calendars/${cal.id}`));
    expect(res.body.removed_games).toBe(1);

    const games = db.findAll('games');
    expect(games).toHaveLength(1);
    expect(games[0].calendar_id).toBe(keep.id);
  });
});

describe('token invalidation on password change', () => {
  it('old tokens stop working after a password change', async () => {
    const oldToken = await setupAdmin();

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' });
    expect(change.status).toBe(200);
    const newToken = change.body.token;

    const withOld = await request(app)
      .post('/api/screens')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ name: 'X' });
    expect(withOld.status).toBe(401);

    const withNew = await request(app)
      .post('/api/screens')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ name: 'X' });
    expect(withNew.status).toBe(200);
  });
});

describe('skate sessions', () => {
  it('keeps in-progress sessions visible until they end', async () => {
    const now = Date.now();
    db.insert('games', {
      is_skate: 1, calendar_id: null,
      start_time: new Date(now - 30 * 60000).toISOString(), // started 30 min ago
      end_time: new Date(now + 60 * 60000).toISOString(),   // ends in an hour
    });
    db.insert('games', {
      is_skate: 1, calendar_id: null,
      start_time: new Date(now - 3 * 3600000).toISOString(), // fully in the past
      end_time: new Date(now - 2 * 3600000).toISOString(),
    });

    const res = await request(app).get('/api/skate-sessions');
    expect(res.body).toHaveLength(1);
    expect(new Date(res.body[0].end_time).getTime()).toBeGreaterThan(now);
  });

  it('?from= returns sessions relative to that date (for the TV preview bar)', async () => {
    db.insert('games', {
      is_skate: 1, calendar_id: null,
      start_time: '2026-06-01T18:00:00.000Z',
      end_time: '2026-06-01T20:00:00.000Z',
    });

    const withoutFrom = await request(app).get('/api/skate-sessions');
    expect(withoutFrom.body).toHaveLength(0); // past session, hidden by default

    const withFrom = await request(app).get('/api/skate-sessions?from=2026-06-01T00:00:00.000Z');
    expect(withFrom.body).toHaveLength(1);

    const badFrom = await request(app).get('/api/skate-sessions?from=not-a-date');
    expect(badFrom.status).toBe(200); // invalid value falls back to now
    expect(badFrom.body).toHaveLength(0);
  });

  it('restricts sessions to Public Skates calendars when any are configured', async () => {
    const skateCal = db.insert('calendars', { name: 'Skates', type: 'public_skates', url: 'http://s' });
    const hockeyCal = db.insert('calendars', { name: 'Hockey', type: 'hockey_games', url: 'http://h' });
    const future = new Date(Date.now() + 3600000).toISOString();
    db.insert('games', { is_skate: 1, calendar_id: skateCal.id, start_time: future, title: 'skate-cal' });
    db.insert('games', { is_skate: 1, calendar_id: hockeyCal.id, start_time: future, title: 'keyword' });

    const res = await request(app).get('/api/skate-sessions');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('skate-cal');
  });
});

describe('games', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('a manual locker change clears the auto-assigned flag', async () => {
    const game = db.insert('games', {
      start_time: '2026-07-10T18:00:00.000Z',
      home_team: 'A', away_team: 'B',
      home_locker: '1', away_locker: '2',
      lr_auto_assigned: 1,
    });

    await auth(request(app).patch(`/api/games/${game.id}`)).send({ home_locker: '5' });
    expect(db.findById('games', game.id)).toMatchObject({ home_locker: '5', lr_auto_assigned: 0 });
  });

  it('a team-only edit preserves the auto-assigned flag', async () => {
    const game = db.insert('games', {
      start_time: '2026-07-10T18:00:00.000Z',
      home_team: 'A', away_team: 'B',
      home_locker: '1', away_locker: '2',
      lr_auto_assigned: 1,
    });

    await auth(request(app).patch(`/api/games/${game.id}`)).send({ home_team: 'C' });
    expect(db.findById('games', game.id)).toMatchObject({ home_team: 'C', lr_auto_assigned: 1 });
  });

  it('GET /games only returns hockey-calendar or legacy games', async () => {
    const hockey = db.insert('calendars', { name: 'H', type: 'hockey_games', url: 'http://h' });
    const figure = db.insert('calendars', { name: 'F', type: 'figure_skating', url: 'http://f' });
    db.insert('games', { calendar_id: hockey.id, start_time: '2026-07-10T18:00:00.000Z', title: 'hockey' });
    db.insert('games', { calendar_id: figure.id, start_time: '2026-07-10T18:00:00.000Z', title: 'figure' });
    db.insert('games', { calendar_id: null, start_time: '2026-07-10T18:00:00.000Z', title: 'legacy' });

    const res = await request(app).get('/api/games');
    const titles = res.body.map((g) => g.title);
    expect(titles).toContain('hockey');
    expect(titles).toContain('legacy');
    expect(titles).not.toContain('figure');
  });
});

describe('locker rooms and sequences', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('rejects duplicate locker room names case-insensitively', async () => {
    await auth(request(app).post('/api/locker-rooms')).send({ name: 'Room 1' });
    const dup = await auth(request(app).post('/api/locker-rooms')).send({ name: 'room 1' });
    expect(dup.status).toBe(400);
  });

  it('requires at least one pair for a sequence', async () => {
    const res = await auth(request(app).post('/api/locker-sequences')).send({ name: 'Empty', pairs: [] });
    expect(res.status).toBe(400);
  });
});

describe('skate prices', () => {
  let token;
  beforeEach(async () => { token = await setupAdmin(); });
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('requires label and price, then lists by sort order', async () => {
    const bad = await auth(request(app).post('/api/skate-prices')).send({ label: 'Adult' });
    expect(bad.status).toBe(400);

    await auth(request(app).post('/api/skate-prices')).send({ label: 'Adult', price: '$12', sort_order: 2 });
    await auth(request(app).post('/api/skate-prices')).send({ label: 'Child', price: '$8', sort_order: 1 });

    const list = await request(app).get('/api/skate-prices');
    expect(list.body.map((p) => p.label)).toEqual(['Child', 'Adult']);
  });
});

describe('custom screen data sources', () => {
  // The Custom screen's TV renderer (server/tv.html) builds its combined agenda by
  // fetching /api/games, /api/rink-events, /api/figure-skating, and /api/skate-sessions,
  // then filtering each by the screen's selected calendar_ids. A prior bug showed no
  // Public Skate sessions on Custom screens because /api/games silently excludes
  // non-hockey calendars — the sessions never reached the client at all. This pins
  // down the per-endpoint calendar scoping the renderer depends on.
  it('excludes public-skate sessions from /api/games but includes them via /api/skate-sessions', async () => {
    const skateCal = db.insert('calendars', { name: 'Public Skate', type: 'public_skates', url: 'http://s' });
    const future = new Date(Date.now() + 3600000).toISOString();
    const end = new Date(Date.now() + 5400000).toISOString();
    db.insert('games', { is_skate: 1, calendar_id: skateCal.id, start_time: future, end_time: end });

    const games = await request(app).get('/api/games');
    expect(games.body).toHaveLength(0);

    const sessions = await request(app).get('/api/skate-sessions');
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0].calendar_id).toBe(skateCal.id);
  });

  it('scopes each of the four Custom-screen data sources to their own calendar_ids', async () => {
    const hockeyCal = db.insert('calendars', { name: 'Hockey', type: 'hockey_games', url: 'http://h' });
    const otherHockeyCal = db.insert('calendars', { name: 'Hockey 2', type: 'hockey_games', url: 'http://h2' });
    const skateCal = db.insert('calendars', { name: 'Skate', type: 'public_skates', url: 'http://s' });
    const rinkCal = db.insert('calendars', { name: 'Rink', type: 'rink_events', url: 'http://r' });
    const figureCal = db.insert('calendars', { name: 'Figure', type: 'figure_skating', url: 'http://f' });
    const future = new Date(Date.now() + 3600000).toISOString();

    db.insert('games', { calendar_id: hockeyCal.id, start_time: future, title: 'included-game' });
    db.insert('games', { calendar_id: otherHockeyCal.id, start_time: future, title: 'excluded-game' });
    db.insert('games', { is_skate: 1, calendar_id: skateCal.id, start_time: future, end_time: future });
    db.insert('games', { calendar_id: rinkCal.id, start_time: future, title: 'rink-event' });
    db.insert('games', { calendar_id: figureCal.id, start_time: future, title: 'figure-event' });

    // A Custom screen configured with calendar_ids limited to one of each source it can
    // pull from, deliberately leaving out otherHockeyCal.
    const selected = [hockeyCal.id, skateCal.id, rinkCal.id, figureCal.id];
    const filterByCalIds = (items, calIds) =>
      (!calIds || !calIds.length) ? items : items.filter((x) => calIds.includes(x.calendar_id));

    const games = await request(app).get('/api/games');
    const rinkEvents = await request(app).get('/api/rink-events');
    const figureEvents = await request(app).get('/api/figure-skating');
    const sessions = await request(app).get('/api/skate-sessions');

    expect(filterByCalIds(games.body, selected).map((g) => g.title)).toEqual(['included-game']);
    expect(filterByCalIds(sessions.body, selected)).toHaveLength(1);
    expect(filterByCalIds(rinkEvents.body, selected).map((e) => e.title)).toEqual(['rink-event']);
    expect(filterByCalIds(figureEvents.body, selected).map((e) => e.title)).toEqual(['figure-event']);
  });
});
