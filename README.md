# RinkScreens — v1.30.1

Digital signage system for ice rinks. Pulls games from Google Calendar (iCal) and displays them on smart TVs around the facility. An admin panel on any local browser lets staff control what each screen shows and manage locker room assignments, pricing, and backgrounds.

---

## How it works

```
┌─────────────────────────────────────────────┐
│        Node.js Server (local rink PC)       │
│  · Polls iCal calendars on a schedule       │
│  · REST API for admin CRUD                  │
│  · WebSocket push to TV browsers            │
│  · Serves built React admin SPA             │
└──────────────┬──────────────────────────────┘
               │  local Wi-Fi
      ┌────────┴────────┐
   TV #1 browser    TV #2 browser   ...
   /tv/1            /tv/2
   (Hockey)         (Public Skate)
```

Each TV opens `http://[server-ip]:3001/tv/[tvNumber]` in its built-in browser (the display's TV number, set in Settings > Displays and shown as its web address in the admin Displays tab). What the display renders is resolved through its schedule: an active schedule block's screen when one applies, otherwise the display's assigned screen. The server pushes updates via WebSocket so screens react instantly when admin changes anything — no manual refresh needed.

---

## Quick start

```powershell
npm install
npm run build
node server/index.js
```

Open `http://localhost:3001/admin` to configure the system. The first visit redirects to `/login` where you create a password; subsequent visits require that password to access the admin panel.

For development (hot reload on both client and server):

```powershell
npm run dev
```

---

## Admin panel

Navigate to `/admin` from any browser on the local network.

Every screen card also has a duplicate button (⧉) next to Delete that creates a copy of the screen with the same settings, named "&lt;screen name&gt; - Copy".

Screens within each tab's list can be reordered by dragging the ⠿ handle (in the date-nav bar on tabs that have one, otherwise in the card's action row); the order persists immediately.

### Displays tab
- View all registered TV displays, each titled "Display &lt;TV number&gt;", with live thumbnails of their assigned screen
- Each display's web address (`/tv/[tvNumber]`) is shown in place of an IP address, since displays are no longer tied to a fixed network IP
- Assign a screen to each display via dropdown (auto-saves)
- **Available Screens** section shows all visible, unassigned screens with type label and current assignment
- Preview link opens the TV display with the date navigation bar, plus page navigation (‹ / ›) to step through every page a multi-page Hockey or Figure Skating screen produces, since preview doesn't auto-rotate pages

### Games tab
- Lists all imported hockey games
- Sort by **Date & Time** (grouped by day, then by calendar with week pagination) or **By Calendar**
- Assign home/away team names and locker rooms per game via dropdowns
- Locker room dropdowns auto-save on change; ✎ button for team name changes
- Practice-mode games sharing an exact start time are grouped onto one row with a single shared locker-room assignment (dropdown updates every game in the group)
- Delete individual games with the 🗑 button (re-import on next calendar sync)
- **Refresh Calendar** button forces an immediate re-sync
- **Reset Auto-Assign LRs** resets all auto-assigned locker rooms and re-runs assignment; per-day reset button on each day group header

### Public Skate tab
- Per-tab Screens section: configure public skate display screens, including a **Days to show** setting (1–14 days) controlling how far ahead upcoming sessions are listed
- Lists upcoming public skate sessions pulled from Public Skates calendars

### Webpage tab
- Create screens that display an external URL in a scaled iframe
- Configure width %, zoom %, and auto-refresh interval (minutes or days)
- Resync button forces an immediate iframe reload on the live TV

### Announcements tab
- Full-screen canvas editor: drag text, image, and date/time elements freely; Ctrl+Z / Cmd+Z (Shift to redo) undoes canvas gestures and property edits
- Text controls: font, size, color, bold, alignment
- Every slider and number field has +/− step buttons for precise nudging, and the selected canvas element can be nudged 1px at a time with the arrow keys
- Text elements can optionally be given a bounding box ("Bounding box (auto-fit text)") — the configured size becomes a maximum that auto-shrinks (wrapping onto more lines first if the box is tall enough) until the text fits the box; drag the yellow corner/edge handles on the canvas to resize instead of only using the sliders
- Bounding-box text supports vertical justification (top/middle/bottom), internal padding, corner radius, and its own background color/opacity
- A bounding-box text element can hold multiple independently-styled **stacked lines** (a "mail merge" composite) instead of one uniform block — each line has its own font/size/color/alignment, plus a **horizontal divider line** type (color/thickness/width%) and configurable line spacing; the whole stack shrinks together so relative sizing is preserved
- Images support a configurable border (width, color, and which side — all around, or just top/bottom/left/right)
- An optional **header divider line** (width + color) separates the rink name/clock header from the screen's content — configured per Announcement screen, or per RSS template
- Date/Time element: shows date & time, date only, or time only, updating live on the TV; optional "Show seconds"; same font/size/color/bold/alignment controls as text
- Font picker includes "Orbitron", "Share Tech Mono", "DS-Digital", "DSEG7 Classic", and "DSEG14 Classic" (segmented LCD looks, self-hosted) for a digital-watchface feel — DS-Digital is the default for new Date/Time elements
- Background: color picker (presets + custom hex, with its own transparency slider) and background image with independent opacity
- Images tab (formerly Backgrounds) splits uploads into **Background** and **General** types; inline label editing with ✏ / ✓ / ✕

### RSS Feed tab
- Add one or more RSS/Atom feed URLs; each feed is polled and cached server-side on its own configurable interval (default 15 min), with a manual "sync now" button, inline editing (name/URL/poll interval), and sync-error status per feed
- **Webpage feeds** — a feed can also be a plain news/section webpage instead of an RSS URL. The server scrapes the page, auto-detects article links (or use an optional CSS selector override), and extracts each article's title, excerpt, and image via Readability; a configurable item count controls how many articles are pulled per sync. Items behave identically to RSS items everywhere else (templates, tokens, logos, rotation).
- **Each feed can have a logo** (upload or link by URL), editable inline from the Feeds table
- **A screen can pull from multiple feeds at once** — select as many as you want, then choose **Per Feed** (N items from each, interleaved so the rotation mixes sources) or **Total (by date)** (merge all selected feeds' items and keep only the N most recent overall)
- **A screen can cycle through multiple slide templates** — build several distinct layouts in a tab bar above the canvas (rename/duplicate/delete); each template has its own background (color/transparency, or image + opacity) and header divider line
- **Templates can be pinned to a specific feed** to keep a consistent color scheme/branding for that source (📌 badge) — pinned templates are only ever used for that feed's articles; unpinned templates (🔁 badge) form a rotation pool for everything else, so a mix of dedicated and rotating templates is fully supported
- Same drag-and-drop canvas editor as Announcements (including undo, resize handles, bounding-box text with stacked lines/dividers, and image borders), but text elements bind to feed fields via `{{title}}`, `{{description}}`, and `{{pubDate}}` tokens, a dedicated image element pulls each item's feed image, and a **"+ Logo" element** places a selected feed's logo — resizable/movable/borderable like any image, and only shown on slides whose article actually came from that feed
- Text elements support the same bounding-box auto-fit sizing as Announcements — the default layout uses it for title/description since article length varies per item
- Items with no embedded image fall back to the linked article's Open Graph (`og:image`) thumbnail
- The feed-image element crops to a fixed box (width % × height %) via `object-fit: cover` by default — a server-side focal point (auto-detected per item, cached across polls) keeps the interesting part of the image visible, or pin a manual Focal X/Y instead. Switch to **Fit Whole Image** (`object-fit: contain`) to letterbox instead of cropping.
- Configure how many of the feed's latest items to cycle through and how many seconds each slide stays up
- Open a screen's `?preview` link to manually step through every slide currently in rotation with the same page-nav controls used by games/figure-skating previews

### Custom tab
- Create screens that pull from any combination of calendars across all types
- TV shows a time-sorted unified schedule for the day

### Figure Skating tab
- Lists upcoming figure skating events grouped by day with week pagination
- Per-tab Screens section: configure figure skating display screens with optional **two-column layout** (12 rows per column), **rotate pages** (cycles through all events, advancing once each page's sessions have actually ended, with `rotate_interval` as a minimum floor between flips), or **flow with time** (shows only upcoming events, auto-updates every 5 minutes)
- Events sharing the same start time are consolidated: time shown once, all groups listed beneath

### Images tab
- Upload JPG/PNG/GIF/WebP/SVG images up to 20 MB
- Tag each image as **Background** (used as screen backgrounds with opacity) or **General** (used as elements in announcement canvases)
- Inline label editing per image

### Settings tab
Settings is organized into sub-tabs:
- **General** — rink name and logo (logo replaces text in TV header)
- **Calendars** — add/edit/delete iCal calendars (Hockey Games, Public Skates, Rink Events, Figure Skating) with poll interval and locker sequence assignment; **Last Sync** column shows success/failure status per calendar
- **Pricing** — admission pricing tiers (label + subheading + price + sort order); each screen (Public Skate, Hockey, Rink Events, Figure Skating, Custom) has a **Show Pricing** checkbox plus a picker for which tiers to display on that screen
- **Locker Rooms** — add/edit/delete rooms; define named **Locker Room Sequences** for auto-assignment
- **Displays** — register physical TV devices (name + TV number, which sets its `/tv/[tvNumber]` web address)
- **Backups** — create, download, restore, or delete backups of `db.json` + uploaded files as a `.zip`; configure automatic backup interval and how many backups to retain; restoring a backup file from disk is also supported. See [Backups](#backups) below.
- **Updates** — check GitHub for newer versions and install them with one click; configure the check schedule (interval or daily time) and optional unattended auto-install at a scheduled time. See [Automatic updates](#automatic-updates) below.
- **Admin** — change the admin login password

### Leagues & Teams tab
- One tab per league; leagues are auto-created from Hockey Games calendars on sync
- Set a team's background and text color (shown on the Hockey TV display)
- Set a display name override per team (used on TV instead of the calendar name)

---

## Calendar import rules

Games are pulled from all calendars in the **Hockey Games** category.

### Location filter
Events with a location that does **not** contain "San Mateo" are skipped (away games at other rinks). Events with no location are always imported.

### Import window
Events are imported if they start within the last 12 hours through the next 30 days. Events outside this window are skipped, and a game that disappears from the feed while still inside the window is removed on the next sync. Games naturally age out of the window as time passes; those finished games are pruned separately, on server startup, once they're more than 30 days old — so the data store doesn't grow without bound.

### Title parsing

| Condition | Stored Title | Away | Home |
|---|---|---|---|
| Title has a colon | Everything before `:` (e.g. "CON") | Parsed from matchup after colon | Parsed from matchup after colon |
| No colon, has "vs" | _(blank)_ | First team per team order setting | Second team per team order setting |
| No colon, no "vs" | Full raw title | _(blank, displays as `Open`)_ | _(blank, displays as `Open`)_ |
| Calendar's Locker Room Assignments mode is "Open" or "Practice" | Full raw title, even if it contains a colon | `Open` | `Open` |
| Calendar's Locker Room Assignments mode is "Stick & Shoot" | Full raw title, even if it contains a colon | `Adults` | `Youth` |

Each Hockey calendar has a **Locker Room Assignments** setting with four modes: **Teams** (the rules above parse home/away from the title), **Stick & Shoot** (every event gets `Youth`/`Adults` regardless of title), **Open** (every event gets `Open`/`Open`), and **Practice** (also `Open`/`Open`, but with grouped locker assignment — see below).

On the combined "custom" Events TV screen, a non-Teams-mode game displays its title (e.g. "Stick & Shoot") instead of "Open vs Open". Hockey-specific screens (Game Board) still show the Away/Home columns per the mode's labels.

**Practice mode grouping**: events sharing an exact start time on a Practice-mode calendar are treated as one time slot everywhere they're displayed (Games tab, TV display, lobby Game Board) — one row, one shared pair of locker room assignments, each event's own title listed underneath. This is meant for back-to-back practice bookings on the same sheet of ice that should share a locker room pair rather than each getting its own.

### NCWHL calendar special rules
Calendars with "NCWHL" in the name use a different parsing strategy:
- Title = everything up to and including the word "Game" (e.g. `"Maroon Game M2 (Home) vs. M7 (Away)"` → title `"Maroon Game"`)
- `(Home)` / `(Away)` tags decide which team is home and which is away (overriding the team order setting), then are stripped from the displayed names; when no tags are present the calendar's team order setting applies
- The colon rule is not applied

### Reparse Titles
The **Reparse Titles** button in the Games tab re-runs title and team parsing on all existing games using the current rules, without re-fetching from the calendar.

### Data preservation
Re-syncing never overwrites locker room assignments or team names already set by the admin.

---

## TV display pages

Physical TVs load `/tv/:displayId`; admin previews of a single screen config load `/tv/screen/:screenId`. Both are plain HTML/CSS/JS with no React or ES modules, compatible with Samsung, LG, and other smart TV built-in browsers.

### Display scheduling
Each display can be preset with what it shows through the day, up to a month ahead (📅 button on the display card opens a full-page **visual scheduler**). Drag screen thumbnails from the type-grouped palette onto a vertical day timeline; blocks snap to 15-minute boundaries, default to one hour, and resize by dragging their edges. Dropping onto an occupied time shifts neighbouring blocks to the nearest free space (never shrinking them), or prompts to replace when the day is full. Each block has remove and whole-day buttons. Navigate day-by-day (or jump via the date picker), pick a Sunday/Monday week start, and duplicate a day to the next day or a week to the following week. Outside any block the display falls back to its assigned screen, and TVs switch exactly at block boundaries. View preferences (side-swap, column density, week start, hidden types) are saved server-side for all admins.

| Display type | What it shows |
|---|---|
| Hockey | Today's games with time, away vs. home team, locker rooms (toggleable) — optional admission pricing panel. Includes any non-game hockey calendar activity too (practices, stick & shoot, etc. — anything from a calendar typed "Hockey Games" that isn't flagged as a public skate). Events from different calendars are always shown in true chronological order (a calendar's header can repeat later in the day if another calendar's event falls in between). A day with more than 5 such events automatically splits into pages — preferring the day's largest natural gap (e.g. an afternoon public skate) as the split point, falling back to fixed-size chunks when no clear gap exists — instead of cramming everything onto one screen. Pages rotate automatically once that page's events have actually ended, with `rotate_interval` as a minimum floor between flips |
| Public Skate | Heading banner (screen name), upcoming public skate sessions — optional admission pricing panel |
| Rink Events | Today's rink events in table format, "Schedule" subheading — optional admission pricing panel |
| Figure Skating | Today's figure skating events in table format — optional admission pricing panel |
| Custom | Combined games/rink events/figure skating/public skate for today in one table, locker rooms toggleable for hockey rows, always shows the screen-name heading and "Events" subheading — optional admission pricing panel |
| Custom Message | Static text message configured per screen |

Pricing is opt-in per screen via the **Show Pricing** checkbox in each type's Screens section; the selected tiers render in a side panel next to the schedule.

The TV header shows the rink logo (or name) on the left, a live clock on the right, and the current date centered.

---

## WebSocket protocol

| Message | Meaning |
|---|---|
| `{ "type": "reload" }` | Screen config changed — TV reloads |
| `{ "type": "refresh_data" }` | New calendar data — TV re-fetches |
| `{ "type": "ping" }` | Heartbeat every 30 s |

TVs auto-reconnect every 3 seconds if the server restarts.

---

## Data storage

All data is stored in `data/db.json` — a flat JSON file, no database binary required. The parsed database is cached in memory (revalidated against the file's timestamp, so hand-edits while the server runs are still picked up), and bulk operations like calendar sync write the file once per run via `db.transaction()` instead of once per row. Writes are atomic (temp file + rename), and the previous state is kept as `data/db.json.bak`; if `db.json` is ever corrupted, the server recovers from the backup automatically and preserves the bad file as `db.json.corrupt`.

| Table | Purpose |
|---|---|
| `screens` | Registered TVs and their display config |
| `backgrounds` | Uploaded background image records |
| `activities` | Imported calendar events + admin assignments |
| `calendars` | iCal calendar sources with type and poll settings |
| `skate_prices` | Public skate admission tiers |
| `locker_rooms` | Available locker room names |
| `locker_sequences` | Named locker room pairing patterns |
| `leagues` | Leagues with locker sequence assignment |
| `teams` | Teams with display name and color per league |
| `settings` | Rink name, logo filename, legacy iCal URL |

Uploaded files are stored in `uploads/` (gitignored).

### Backups

The Settings → Backups tab zips `data/db.json` and everything in `uploads/` into `data/backups/backup-<timestamp>-<reason>.zip`. Backups can be created on demand ("Back Up Now"), downloaded, restored, or deleted from that tab, and a `.zip` from disk can be uploaded and restored directly.

An automatic scheduler (on by default, every 24 hours) takes a "scheduled" backup on the configured interval and prunes old backups down to the configured retention count (default 14) — both are adjustable in the Backups tab. Restoring always takes a "pre-restore" safety backup of the current state first, so a bad restore can itself be undone.

Any backup can be pinned via **Keep Permanently** — pinned backups are exempt from retention pruning (they don't count toward "Keep last N") and can't be deleted until unpinned.

By default backups are saved to `data/backups`, but the Backups tab's **Backup location** can point them at any folder on the server machine (an external drive, a mapped network share, etc.) via "Choose Folder…", which browses the server's actual drives/folders (with a "+ New Folder" option) rather than a free-text path — the admin panel may be opened from a different machine than the server, so a native OS file picker wouldn't resolve to a usable server-side path. The chosen path is validated as writable before it's saved; if a configured folder later becomes unreachable, backups silently fall back to the default location instead of failing.

### Automatic updates

The Settings → Updates tab checks GitHub Releases for newer versions of RinkScreens and can install them in place. It only ever downloads and applies the `rinkscreens-update.zip` release asset, which contains code only (`server/`, `client/dist/`, `package.json`, `package-lock.json`, production `node_modules`) — never `data/` or `uploads/` — so installing an update cannot touch the rink's live data.

**Check schedule** runs either on a fixed interval (default every 24 hours) or daily at a specific time; "Check Now" runs it on demand. When a newer version with an installable asset is found, an **Install Update** button appears — installing spawns a detached PowerShell helper (`scripts/release-assets/apply-update.ps1`) that waits for the server process to exit (the server now exits itself shortly after handing off), copies the new files over the install directory (never deleting anything, so `data/`/`uploads/` are untouched even though they're outside the update package), and restarts the app.

**Automatically install updates** installs a newer version unattended, with no confirmation prompt, at a configured time of day — useful for scheduling installs for a quiet hour (e.g. 3 AM) rather than whenever a rink employee happens to click "Check Now". It runs its own check right before installing, independent of the regular check schedule, so it always installs whatever is actually latest.

The repo is public, so no GitHub token or other credentials are required — checking and installing just work.

To publish a new version for the rink PC to find, run `npm run publish-release` from the dev machine (requires the [GitHub CLI](https://cli.github.com/), already authenticated) — it builds the update package and creates/updates a GitHub Release tagged with the current `package.json` version.

---

## Testing

```powershell
npm test            # run the full suite once
npm run test:watch  # watch mode during development
```

Tests live in `tests/` (Vitest + Supertest) and cover calendar title parsing, locker room auto-assignment, the JSON store, and the REST API. They run against a temp data directory (via the `RINKSCREENS_DATA_DIR` env var), so the real `data/db.json` is never touched.

---

## Forgot admin password

Run this on the server machine (RDP or physical access):

```powershell
node server/reset-password.js
```

This clears the stored password hash. The next visit to `/login` shows the first-run setup form to create a new password. No data is lost.

---

## Building an install package

```powershell
npm run package
```

Runs the test suite, builds the client, and stages a self-contained release
zip in `release/rinkscreens-v<version>.zip` with production-only
`node_modules`, the installer batch files (`INSTALL.md`), and the current
`data/db.json` and `uploads/` folder — so unzipping produces a working install
already loaded with the existing rink config, screens, and images rather than
a blank first run. Since it bundles live data (including the admin password
hash and JWT secret), only share the resulting zip with people who should
have access to the current setup.

---

## Windows auto-start

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "C:\Exocomps\RinkScreens\server\index.js" -WorkingDirectory "C:\Exocomps\RinkScreens"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "RinkScreens" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

---

## Tech stack

- **Auth**: `bcryptjs` password hashing + JWT (30-day, stored in localStorage)
- **Server**: Node.js + Express 5 + `node-ical` + `ws` + `multer`
- **Client**: React 18 + Vite + React Router v6 + CSS Modules
- **TV display**: Plain HTML/CSS/JS (no framework, TV browser compatible)
- **Build**: `@vitejs/plugin-legacy` + `terser` for ES5 fallback bundle
