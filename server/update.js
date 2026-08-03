/**
 * Self-update: checks GitHub Releases for a newer version and, when asked,
 * downloads the code-only release asset and applies it in place. Mirrors
 * backup.js's self-rescheduling-timer pattern for the periodic check.
 *
 * The release asset is code-only (server/, client/dist/, package.json,
 * package-lock.json, node_modules) — it never contains data/ or uploads/,
 * so applying an update can never touch the rink's live data. The actual
 * file swap + restart happens in a detached PowerShell helper (see
 * scripts/release-assets/apply-update.ps1) because the running Node
 * process can't safely overwrite or restart itself.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const db = require('./db');

const APP_DIR = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(APP_DIR, 'package.json');
const DEFAULT_REPO = 'bondawg3/RinkScreens';
const ASSET_NAME = 'rinkscreens-update.zip';

function currentVersion() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')).version;
}

function repoSlug() {
  return (db.getSettings().update_github_repo || DEFAULT_REPO).trim();
}

// Newer-than comparison for "vX.Y.Z" / "X.Y.Z" tags. Returns true if `a` > `b`.
function isNewer(a, b) {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function githubRequest(url, { asStream = false } = {}) {
  const token = db.getSettings().update_github_token;
  const headers = { 'User-Agent': 'RinkScreens-Updater', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (asStream) headers.Accept = 'application/octet-stream';
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub request failed (${res.status}): ${body.slice(0, 300) || res.statusText}`);
  }
  return res;
}

// Queries GitHub for the latest release, caches the result in settings, and
// returns the status object the admin panel reads.
async function checkForUpdate() {
  const repo = repoSlug();
  const res = await githubRequest(`https://api.github.com/repos/${repo}/releases/latest`);
  const release = await res.json();
  const latest = release.tag_name || '';
  const current = currentVersion();
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);

  db.setSettings({
    update_last_checked_at: new Date().toISOString(),
    update_latest_version: latest,
    update_release_notes: release.body || '',
    update_release_url: release.html_url || '',
    update_asset_available: asset ? 'true' : 'false',
    update_check_error: '',
  });

  return getStatus();
}

function getStatus() {
  const s = db.getSettings();
  const current = currentVersion();
  const latest = s.update_latest_version || '';
  return {
    current_version: current,
    latest_version: latest || null,
    update_available: !!latest && isNewer(latest, current) && s.update_asset_available === 'true',
    checked_at: s.update_last_checked_at || null,
    release_notes: s.update_release_notes || '',
    release_url: s.update_release_url || '',
    check_error: s.update_check_error || '',
    auto_check_enabled: s.update_check_enabled !== 'false',
    check_mode: s.update_check_mode === 'daily' ? 'daily' : 'interval',
    check_interval_hours: s.update_check_interval_hours || '24',
    check_time: s.update_check_time || '03:00',
    next_check_at: nextCheckAt ? nextCheckAt.toISOString() : null,
    auto_install_enabled: s.update_auto_install_enabled === 'true',
    install_time: s.update_install_time || '03:30',
    next_install_at: nextInstallAt ? nextInstallAt.toISOString() : null,
    last_install_at: s.update_last_install_at || null,
    github_token_set: !!s.update_github_token,
    github_repo: repoSlug(),
  };
}

// Milliseconds until the next occurrence of a "HH:MM" (24h, local time) wall
// clock time — today if it hasn't passed yet, otherwise tomorrow.
function msUntilNextTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  const [h, min] = m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [3, 0];
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

let scheduleTimer = null;
let installTimer = null;
let nextCheckAt = null;
let nextInstallAt = null;

function clearSchedule() {
  if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
  nextCheckAt = null;
}

function clearInstallSchedule() {
  if (installTimer) { clearTimeout(installTimer); installTimer = null; }
  nextInstallAt = null;
}

// Self-rescheduling check timer. Runs either on a fixed interval or once a
// day at a specific time, depending on update_check_mode.
function startScheduler() {
  clearSchedule();
  const settings = db.getSettings();
  const enabled = settings.update_check_enabled !== 'false';
  if (!enabled) return false;

  const mode = settings.update_check_mode === 'daily' ? 'daily' : 'interval';
  const ms = mode === 'daily'
    ? msUntilNextTime(settings.update_check_time)
    : Math.max(parseFloat(settings.update_check_interval_hours) || 24, 1) * 60 * 60_000;
  nextCheckAt = new Date(Date.now() + ms);

  scheduleTimer = setTimeout(() => {
    (async () => {
      try {
        if (db.getSettings().update_check_enabled !== 'false') await checkForUpdate();
      } catch (err) {
        db.setSetting('update_check_error', err.message);
        console.error('[update] scheduled check failed:', err.message);
      }
      startScheduler();
    })();
  }, ms);
  scheduleTimer.unref();

  return enabled;
}

// Separate daily timer: at the configured time, refreshes the update status
// and installs automatically if a newer version is available. Kept apart
// from the check schedule since admins may want to check often but only
// ever install unattended at one quiet, predictable time (e.g. 3 AM).
function startInstallScheduler() {
  clearInstallSchedule();
  const settings = db.getSettings();
  const enabled = settings.update_auto_install_enabled === 'true';
  if (!enabled) return false;

  const ms = msUntilNextTime(settings.update_install_time);
  nextInstallAt = new Date(Date.now() + ms);

  installTimer = setTimeout(() => {
    (async () => {
      try {
        if (db.getSettings().update_auto_install_enabled === 'true') {
          await checkForUpdate();
          if (getStatus().update_available) {
            console.log(`[update] auto-installing ${db.getSettings().update_latest_version}`);
            await installUpdate();
            return; // installUpdate() exits the process; the restarted server re-schedules on boot
          }
        }
      } catch (err) {
        db.setSetting('update_check_error', err.message);
        console.error('[update] auto-install failed:', err.message);
      }
      startInstallScheduler();
    })();
  }, ms);
  installTimer.unref();

  return enabled;
}

const UPDATE_TASK_NAME = 'RinkScreensUpdateApply';

// Downloads the release asset, stages a helper to apply it once this process
// exits, then schedules this process to exit so the helper can safely
// overwrite the running app's files and restart it.
//
// The helper is launched via a one-shot Scheduled Task rather than a plain
// detached child process. When RinkScreens itself autostarts via Task
// Scheduler (install-autostart.bat), Windows runs it inside a job object
// that kills the entire process tree — including "detached" children — the
// moment the main task process exits. A separately-registered task isn't
// part of that job, so it survives.
async function installUpdate() {
  const s = db.getSettings();
  if (s.update_asset_available !== 'true') throw new Error('No installable update asset found. Run "Check Now" first.');

  const repo = repoSlug();
  const releaseRes = await githubRequest(`https://api.github.com/repos/${repo}/releases/latest`);
  const release = await releaseRes.json();
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) throw new Error(`Release ${release.tag_name} has no ${ASSET_NAME} asset.`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rinkscreens-update-'));
  const zipPath = path.join(workDir, ASSET_NAME);

  const assetRes = await githubRequest(asset.url, { asStream: true });
  const buf = Buffer.from(await assetRes.arrayBuffer());
  fs.writeFileSync(zipPath, buf);

  const scriptSrc = path.join(APP_DIR, 'scripts', 'release-assets', 'apply-update.ps1');
  const scriptDest = path.join(workDir, 'apply-update.ps1');
  fs.copyFileSync(scriptSrc, scriptDest);

  const logPath = path.join(workDir, 'apply-update.log');

  // schtasks' /TR argument parsing can't reliably handle a command line with
  // several quoted, space-containing arguments, so bake the whole invocation
  // into a wrapper .cmd and point /TR at just that one (quoted) path. The
  // wrapper also deletes its own task once it's done, so nothing lingers in
  // Task Scheduler.
  const wrapperPath = path.join(workDir, 'apply-update.cmd');
  const wrapper = [
    '@echo off',
    `powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${scriptDest}" -ZipPath "${zipPath}" -AppDir "${APP_DIR}" -ParentPid ${process.pid} -LogPath "${logPath}"`,
    `schtasks /Delete /TN "${UPDATE_TASK_NAME}" /F`,
    '',
  ].join('\r\n');
  fs.writeFileSync(wrapperPath, wrapper);

  // /ST must be a valid time even though /Run below fires immediately; a
  // minute out gives the scheduled instance a chance to fire on its own as a
  // fallback if the explicit /Run somehow doesn't take.
  const st = new Date(Date.now() + 60_000);
  const startTime = `${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}`;

  // /RU + /IT force "run only when this user is logged on" (interactive
  // token), which needs no stored password — without it, schtasks' default
  // logon type can require one, which fails with "Access is denied" on an
  // account signed in via PIN/Windows Hello instead of a traditional password.
  const runAsUser = process.env.USERNAME || '';

  execFileSync('schtasks', [
    '/Create', '/TN', UPDATE_TASK_NAME, '/TR', `"${wrapperPath}"`,
    '/SC', 'ONCE', '/ST', startTime, '/RU', runAsUser, '/IT', '/F',
  ]);
  execFileSync('schtasks', ['/Run', '/TN', UPDATE_TASK_NAME]);

  db.setSetting('update_last_install_at', new Date().toISOString());

  // The helper script above only waits up to 30s for this process to exit
  // before it starts overwriting files regardless — so this process must
  // actually exit, not just spawn the helper and hope. Delayed slightly so
  // the HTTP response for a manual "Install Update" click has time to reach
  // the browser first; not unref'd, since it must fire even with nothing
  // else keeping the event loop alive.
  setTimeout(() => process.exit(0), 1500);

  return { version: release.tag_name };
}

module.exports = {
  currentVersion,
  checkForUpdate,
  getStatus,
  startScheduler,
  startInstallScheduler,
  installUpdate,
};
