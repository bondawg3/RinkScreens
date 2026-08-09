/**
 * Backup/restore for the JSON data store and uploaded files, plus a
 * self-rescheduling timer (same pattern as calendar.js polling) that takes
 * automatic backups on an admin-configurable interval.
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const db = require('./db');

const DATA_DIR = process.env.RINKSCREENS_DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.RINKSCREENS_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const DEFAULT_BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DEFAULT_BACKUP_DIR)) fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });

let scheduleTimer = null;

// The admin can point backups at any folder (e.g. an external drive or
// network share) via the backup_dir setting; falls back to data/backups
// when unset, or when the configured folder isn't reachable right now
// (a USB drive that's unplugged shouldn't crash a scheduled backup).
function getBackupDir() {
  const configured = db.getSettings().backup_dir;
  if (!configured) return DEFAULT_BACKUP_DIR;
  try {
    fs.mkdirSync(configured, { recursive: true });
    fs.accessSync(configured, fs.constants.W_OK);
    return configured;
  } catch (err) {
    console.error(`[backup] configured backup_dir "${configured}" is unavailable (${err.message}), using default`);
    return DEFAULT_BACKUP_DIR;
  }
}

// Validates a candidate backup folder path, creating it if needed. Throws
// with a user-facing message on failure; used before persisting the setting.
function validateBackupDir(dir) {
  if (!path.isAbsolute(dir)) throw new Error('Backup location must be an absolute path');
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.rinkscreens-write-test-${Date.now()}`);
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
}

// Top-level entries for the folder picker: drive letters on Windows, "/" on
// POSIX. The admin browser may be on a different machine than the server, so
// a native file-picker input can't be used — this drives a server-side
// directory browser instead.
function listRoots() {
  if (process.platform === 'win32') {
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const p = `${letter}:\\`;
      if (fs.existsSync(p)) drives.push({ name: `${letter}:`, path: p });
    }
    return drives;
  }
  return listDir('/');
}

// Subdirectories of an absolute path, for the folder picker to descend into.
function listDir(dirPath) {
  if (!path.isAbsolute(dirPath)) throw new Error('path must be absolute');
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) throw new Error('not a directory');
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: path.join(dirPath, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makeSubdir(dirPath, name) {
  if (!path.isAbsolute(dirPath)) throw new Error('path must be absolute');
  if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('invalid folder name');
  const newPath = path.join(dirPath, name);
  fs.mkdirSync(newPath);
  return newPath;
}

function safeFilename(filename) {
  if (!filename || typeof filename !== 'string' || /[\\/]/.test(filename) || filename.includes('..')) {
    throw new Error('invalid backup filename');
  }
  return filename;
}

// Pinned backups are kept forever — exempt from retention pruning and from
// manual delete until unpinned. Tracked as a filename list in settings since
// backups themselves are plain files with no other metadata store.
function getPinnedSet() {
  try {
    const raw = db.getSettings().backup_pinned_files;
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function setPinned(filename, pinned) {
  safeFilename(filename);
  const pins = getPinnedSet();
  if (pinned) pins.add(filename); else pins.delete(filename);
  db.setSetting('backup_pinned_files', JSON.stringify([...pins]));
}

function listBackups() {
  const dir = getBackupDir();
  const pinned = getPinnedSet();
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString(), pinned: pinned.has(f) };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Retention only applies to unpinned backups — pinned ones are kept
// regardless of count, and don't count against the limit.
function pruneBackups() {
  const dir = getBackupDir();
  const retention = parseInt(db.getSettings().backup_retention_count, 10) || 14;
  const unpinned = listBackups().filter((b) => !b.pinned);
  for (const b of unpinned.slice(retention)) {
    try { fs.unlinkSync(path.join(dir, b.filename)); } catch (_) {}
  }
}

// Zips db.json + uploads/ into data/backups/. `reason` tags the filename
// (manual, scheduled, pre-restore) so admins can tell backups apart.
function createBackup(reason = 'manual') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${ts}-${reason}.zip`;
  const zip = new AdmZip();
  if (fs.existsSync(DB_FILE)) zip.addLocalFile(DB_FILE);
  if (fs.existsSync(UPLOAD_DIR)) zip.addLocalFolder(UPLOAD_DIR, 'uploads');
  zip.writeZip(path.join(getBackupDir(), filename));
  if (reason !== 'pre-restore') db.setSetting('last_backup_at', new Date().toISOString());
  pruneBackups();
  return filename;
}

function deleteBackup(filename) {
  safeFilename(filename);
  if (getPinnedSet().has(filename)) throw new Error('This backup is kept permanently — unpin it before deleting');
  const p = path.join(getBackupDir(), filename);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

function getBackupPath(filename) {
  safeFilename(filename);
  const p = path.join(getBackupDir(), filename);
  return fs.existsSync(p) ? p : null;
}

// Restores db.json + uploads/ from a zip file (either a stored backup or one
// just uploaded by the admin). Takes a safety "pre-restore" backup of the
// current state first, so a bad restore is itself recoverable.
function restoreFromZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const dbEntry = entries.find((e) => e.entryName === 'db.json');
  if (!dbEntry) throw new Error('Backup is missing db.json — not a valid RinkScreens backup');
  const dbContent = dbEntry.getData().toString('utf8');
  JSON.parse(dbContent); // throws if corrupt, before we touch anything on disk

  createBackup('pre-restore');

  fs.writeFileSync(DB_FILE, dbContent, 'utf8');

  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const uploadRoot = path.resolve(UPLOAD_DIR);
  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.startsWith('uploads/')) continue;
    const rel = entry.entryName.slice('uploads/'.length);
    if (!rel) continue;
    // Zip-slip guard: a crafted entry like "uploads/../../server/index.js"
    // passes the startsWith check above but must not be allowed to write
    // outside the uploads dir (that would overwrite app code, run on restart).
    const dest = path.resolve(uploadRoot, rel);
    if (dest !== uploadRoot && !dest.startsWith(uploadRoot + path.sep)) {
      console.warn(`[backup] skipped unsafe zip entry: ${entry.entryName}`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
  }
}

function clearSchedule() {
  if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
}

// Self-rescheduling timer, same shape as calendar.js's legacy poll loop:
// each run backs up (if due) then reschedules itself off the current settings.
function startScheduler() {
  clearSchedule();
  const settings = db.getSettings();
  const enabled = settings.backup_auto_enabled !== 'false';
  const hours = parseFloat(settings.backup_interval_hours) || 24;
  const ms = Math.max(hours, 0.25) * 60 * 60_000;

  scheduleTimer = setTimeout(() => {
    try {
      if (db.getSettings().backup_auto_enabled !== 'false') createBackup('scheduled');
    } catch (err) {
      console.error('[backup] scheduled backup failed:', err.message);
    }
    startScheduler();
  }, ms);
  scheduleTimer.unref();

  return enabled;
}

module.exports = {
  DEFAULT_BACKUP_DIR,
  getBackupDir,
  validateBackupDir,
  listRoots,
  listDir,
  makeSubdir,
  listBackups,
  setPinned,
  createBackup,
  deleteBackup,
  getBackupPath,
  restoreFromZip,
  startScheduler,
};
