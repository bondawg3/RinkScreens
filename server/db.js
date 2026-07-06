/**
 * Lightweight JSON file store.
 * Provides a thin synchronous API so the rest of the server reads naturally.
 *
 * The parsed database is cached in memory and revalidated against the file's
 * stat (mtime + size) on each access, so external edits to db.json — tests,
 * hand-fixes while the server runs — are still picked up without paying a
 * full read + JSON.parse on every call.
 */
const fs = require('fs');
const path = require('path');

// RINKSCREENS_DATA_DIR lets tests point the store at a temp directory
const DATA_DIR = process.env.RINKSCREENS_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');
const BAK_FILE = `${DB_FILE}.bak`;
const TMP_FILE = `${DB_FILE}.tmp`;

const DEFAULTS = {
  settings: {
    rink_name: 'Ice Rink',
    ical_url: '',
    poll_interval_minutes: '5',
    skate_keyword: 'Public Skate',
  },
  screens: [],
  displays: [],
  backgrounds: [],
  activities: [],
  skate_prices: [],
  calendars: [],
  locker_rooms: [],
  locker_sequences: [],
  leagues: [],
  teams: [],
  _seq: { screens: 1, displays: 1, backgrounds: 1, activities: 1, skate_prices: 1, calendars: 1, locker_rooms: 1, locker_sequences: 1, leagues: 1, teams: 1 },
};

// Renamed from "games" once the table grew to hold hockey games, rink events,
// figure skating events, and public skate sessions alike. Existing db.json
// files still have the old key on disk — fold it into "activities" in memory
// so the next save() persists it under the new name.
function migrateGamesTable(data) {
  if (data.games && !data.activities) {
    data.activities = data.games;
    delete data.games;
  } else if (data.games) {
    delete data.games;
  }
  if (data._seq && data._seq.games != null) {
    if (data._seq.activities == null) data._seq.activities = data._seq.games;
    delete data._seq.games;
  }
  return data;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache = null;      // parsed data, aliased by every load() while valid
let cacheStat = null;  // stat of DB_FILE when cache was last read/written (null = no file)

function statFile() {
  try {
    const s = fs.statSync(DB_FILE);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

function cacheValid() {
  if (!cache) return false;
  const s = statFile();
  if (!s) return !cacheStat; // fresh install: valid only if we never had a file
  return !!cacheStat && s.mtimeMs === cacheStat.mtimeMs && s.size === cacheStat.size;
}

function invalidateCache() {
  cache = null;
  cacheStat = null;
}

function readFromDisk() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return migrateGamesTable(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    } catch (err) {
      try { fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt`); } catch (_) {}
      console.error(`[db] db.json is corrupt: ${err.message} (copy saved as db.json.corrupt)`);
      // fall through to backup recovery
    }
  } else if (!fs.existsSync(BAK_FILE)) {
    return JSON.parse(JSON.stringify(DEFAULTS)); // fresh install
  }
  try {
    const data = migrateGamesTable(JSON.parse(fs.readFileSync(BAK_FILE, 'utf8')));
    console.warn('[db] recovered previous state from db.json.bak');
    return data;
  } catch (_) {
    throw new Error(
      'db.json is unreadable and no valid db.json.bak exists. ' +
      'Refusing to reset to defaults — inspect data/db.json.corrupt to recover.'
    );
  }
}

function load() {
  if (cacheValid()) return cache;
  invalidateCache();
  const data = readFromDisk();
  cache = data;
  cacheStat = statFile();
  return cache;
}

// Write-to-temp + rename so a crash mid-write can never leave a truncated
// db.json; the previous state is kept as db.json.bak for recovery.
function save(data) {
  const prev = statFile(); // stat of the state being replaced
  fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(DB_FILE)) {
    try { fs.renameSync(DB_FILE, BAK_FILE); } catch (_) {}
  }
  fs.renameSync(TMP_FILE, DB_FILE);
  // Force a strictly increasing mtime: rapid same-size writes can otherwise
  // land on the same (mtime, size) signature, which would make a stale cache
  // in another copy of this module (vitest loads it twice) look valid
  if (prev) {
    const cur = statFile();
    if (cur && cur.mtimeMs <= prev.mtimeMs) {
      const t = (prev.mtimeMs + 1) / 1000;
      try { fs.utimesSync(DB_FILE, t, t); } catch (_) {}
    }
  }
  cache = data;
  cacheStat = statFile();
}

function nextId(data, table) {
  const id = data._seq[table] || 1;
  data._seq[table] = id + 1;
  return id;
}

// ── Core operations ───────────────────────────────────────────────────────────
// Each takes the parsed data object; the public API and transaction() decide
// when to load and save around them. Reads hand out copies so callers can
// never mutate the cache without going through a write.

function _getSettings(data) {
  return { ...(data.settings || {}) };
}

function _setSettings(data, kvPairs) {
  if (!data.settings) data.settings = {};
  for (const [k, v] of Object.entries(kvPairs)) data.settings[k] = v;
}

function _findAll(data, table, sortBy) {
  const rows = (data[table] || []).map((r) => ({ ...r }));
  if (sortBy) rows.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : a[sortBy] < b[sortBy] ? -1 : 0));
  return rows;
}

function _findById(data, table, id) {
  const row = (data[table] || []).find((r) => r.id === Number(id));
  return row ? { ...row } : null;
}

function _insert(data, table, row) {
  if (!data[table]) data[table] = [];
  const id = nextId(data, table);
  const newRow = { id, created_at: new Date().toISOString(), ...row };
  data[table].push(newRow);
  return { ...newRow };
}

function _update(data, table, id, changes) {
  const idx = (data[table] || []).findIndex((r) => r.id === Number(id));
  if (idx === -1) return null;
  data[table][idx] = { ...data[table][idx], ...changes };
  return { ...data[table][idx] };
}

function _remove(data, table, id) {
  const before = (data[table] || []).length;
  data[table] = (data[table] || []).filter((r) => r.id !== Number(id));
  return data[table].length < before;
}

function _findByField(data, table, field, value) {
  const row = (data[table] || []).find((r) => r[field] === value);
  return row ? { ...row } : null;
}

function _upsertByField(data, table, field, value, row) {
  if (!data[table]) data[table] = [];
  const idx = data[table].findIndex((r) => r[field] === value);
  if (idx === -1) {
    const id = nextId(data, table);
    data[table].push({ id, ...row });
  } else {
    data[table][idx] = { ...data[table][idx], ...row };
  }
}

// ── Public API (load + save per call) ─────────────────────────────────────────

function getSettings() {
  return _getSettings(load());
}

function setSetting(key, value) {
  const data = load();
  _setSettings(data, { [key]: value });
  save(data);
}

function setSettings(kvPairs) {
  const data = load();
  _setSettings(data, kvPairs);
  save(data);
}

function findAll(table, sortBy) {
  return _findAll(load(), table, sortBy);
}

function findById(table, id) {
  return _findById(load(), table, id);
}

function insert(table, row) {
  const data = load();
  const newRow = _insert(data, table, row);
  save(data);
  return newRow;
}

function update(table, id, changes) {
  const data = load();
  const updated = _update(data, table, id, changes);
  if (updated) save(data);
  return updated;
}

function remove(table, id) {
  const data = load();
  const removed = _remove(data, table, id);
  save(data);
  return removed;
}

function findByField(table, field, value) {
  return _findByField(load(), table, field, value);
}

function upsertByField(table, field, value, row) {
  const data = load();
  _upsertByField(data, table, field, value, row);
  save(data);
}

// ── Transaction ───────────────────────────────────────────────────────────────
// Batches many operations into a single load + save. fn receives an object
// with the same API as this module (minus transaction) operating on one
// in-memory snapshot; the file is written once when fn returns. fn must be
// synchronous — an await inside would let other writes interleave.

function transaction(fn) {
  const data = load();
  let result;
  try {
    result = fn({
      getSettings: () => _getSettings(data),
      setSetting: (key, value) => _setSettings(data, { [key]: value }),
      setSettings: (kvPairs) => _setSettings(data, kvPairs),
      findAll: (table, sortBy) => _findAll(data, table, sortBy),
      findById: (table, id) => _findById(data, table, id),
      insert: (table, row) => _insert(data, table, row),
      update: (table, id, changes) => _update(data, table, id, changes),
      remove: (table, id) => _remove(data, table, id),
      findByField: (table, field, value) => _findByField(data, table, field, value),
      upsertByField: (table, field, value, row) => _upsertByField(data, table, field, value, row),
    });
  } catch (err) {
    // fn may have half-mutated the shared cache object — drop it so the next
    // load() re-reads the last saved state from disk
    invalidateCache();
    throw err;
  }
  save(data);
  return result;
}

module.exports = {
  getSettings, setSetting, setSettings,
  findAll, findById, insert, update, remove, findByField, upsertByField,
  transaction,
};
