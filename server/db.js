/**
 * Lightweight JSON file store.
 * Provides a thin synchronous API so the rest of the server reads naturally.
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
  games: [],
  skate_prices: [],
  calendars: [],
  locker_rooms: [],
  locker_sequences: [],
  leagues: [],
  teams: [],
  _seq: { screens: 1, displays: 1, backgrounds: 1, games: 1, skate_prices: 1, calendars: 1, locker_rooms: 1, locker_sequences: 1, leagues: 1, teams: 1 },
};

function load() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
      try { fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt`); } catch (_) {}
      console.error(`[db] db.json is corrupt: ${err.message} (copy saved as db.json.corrupt)`);
      // fall through to backup recovery
    }
  } else if (!fs.existsSync(BAK_FILE)) {
    return JSON.parse(JSON.stringify(DEFAULTS)); // fresh install
  }
  try {
    const data = JSON.parse(fs.readFileSync(BAK_FILE, 'utf8'));
    console.warn('[db] recovered previous state from db.json.bak');
    return data;
  } catch (_) {
    throw new Error(
      'db.json is unreadable and no valid db.json.bak exists. ' +
      'Refusing to reset to defaults — inspect data/db.json.corrupt to recover.'
    );
  }
}

// Write-to-temp + rename so a crash mid-write can never leave a truncated
// db.json; the previous state is kept as db.json.bak for recovery.
function save(data) {
  fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(DB_FILE)) {
    try { fs.renameSync(DB_FILE, BAK_FILE); } catch (_) {}
  }
  fs.renameSync(TMP_FILE, DB_FILE);
}

function nextId(data, table) {
  const id = data._seq[table] || 1;
  data._seq[table] = id + 1;
  return id;
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getSettings() {
  const data = load();
  return data.settings || {};
}

function setSetting(key, value) {
  const data = load();
  if (!data.settings) data.settings = {};
  data.settings[key] = value;
  save(data);
}

function setSettings(kvPairs) {
  const data = load();
  if (!data.settings) data.settings = {};
  for (const [k, v] of Object.entries(kvPairs)) data.settings[k] = v;
  save(data);
}

// ── Generic table helpers ──────────────────────────────────────────────────────

function findAll(table, sortBy) {
  const data = load();
  const rows = [...(data[table] || [])];
  if (sortBy) rows.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : a[sortBy] < b[sortBy] ? -1 : 0));
  return rows;
}

function findById(table, id) {
  const data = load();
  return (data[table] || []).find((r) => r.id === Number(id)) || null;
}

function insert(table, row) {
  const data = load();
  if (!data[table]) data[table] = [];
  const id = nextId(data, table);
  const newRow = { id, created_at: new Date().toISOString(), ...row };
  data[table].push(newRow);
  save(data);
  return newRow;
}

function update(table, id, changes) {
  const data = load();
  const idx = (data[table] || []).findIndex((r) => r.id === Number(id));
  if (idx === -1) return null;
  data[table][idx] = { ...data[table][idx], ...changes };
  save(data);
  return data[table][idx];
}

function remove(table, id) {
  const data = load();
  const before = (data[table] || []).length;
  data[table] = (data[table] || []).filter((r) => r.id !== Number(id));
  save(data);
  return data[table].length < before;
}

function findByField(table, field, value) {
  const data = load();
  return (data[table] || []).find((r) => r[field] === value) || null;
}

function upsertByField(table, field, value, row) {
  const data = load();
  if (!data[table]) data[table] = [];
  const idx = data[table].findIndex((r) => r[field] === value);
  if (idx === -1) {
    const id = nextId(data, table);
    data[table].push({ id, ...row });
  } else {
    data[table][idx] = { ...data[table][idx], ...row };
  }
  save(data);
}

module.exports = {
  getSettings, setSetting, setSettings,
  findAll, findById, insert, update, remove, findByField, upsertByField,
};
