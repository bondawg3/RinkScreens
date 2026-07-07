# RinkScreens — v1.20.0

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
   (Game Board)     (Public Skate)
```

Each TV opens `http://[server-ip]:3001/tv/[screenId]` in its built-in browser. The server pushes updates via WebSocket so screens react instantly when admin changes anything — no manual refresh needed.

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

### Displays tab
- View all registered TV displays with live thumbnails of their assigned screen
- Assign a screen to each display via dropdown (auto-saves)
- **Available Screens** section shows all visible, unassigned screens with type label and current assignment
- Preview link opens the TV display with the date navigation bar

### Games tab
- Lists all imported hockey games
- Sort by **Date & Time** (grouped by day, then by calendar with week pagination) or **By Calendar**
- Assign home/away team names and locker rooms per game via dropdowns
- Locker room dropdowns auto-save on change; Edit button for team name changes
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
- Full-screen canvas editor: drag text and image elements freely
- Text controls: font, size, color, bold, alignment
- Background: color picker (presets + custom hex) and background image with opacity
- Images tab (formerly Backgrounds) splits uploads into **Background** and **General** types; inline label editing with ✏ / ✓ / ✕

### Custom tab
- Create screens that pull from any combination of calendars across all types
- TV shows a time-sorted unified schedule for the day

### Figure Skating tab
- Lists upcoming figure skating events grouped by day with week pagination
- Per-tab Screens section: configure figure skating display screens with optional **two-column layout** (12 rows per column), **rotate pages** (cycles through all events at a set interval), or **flow with time** (shows only upcoming events, auto-updates every 5 minutes)
- Events sharing the same start time are consolidated: time shown once, all groups listed beneath

### Images tab
- Upload JPG/PNG/GIF/WebP/SVG images up to 20 MB
- Tag each image as **Background** (used as screen backgrounds with opacity) or **General** (used as elements in announcement canvases)
- Inline label editing per image

### Settings tab
Settings is organized into sub-tabs:
- **General** — rink name and logo (logo replaces text in TV header)
- **Calendars** — add/edit/delete iCal calendars (Hockey Games, Public Skates, Rink Events, Figure Skating) with poll interval and locker sequence overrides; **Last Sync** column shows success/failure status per calendar
- **Pricing** — admission pricing tiers (label + subheading + price + sort order); each screen (Public Skate, Game Board, Rink Events, Figure Skating, Custom) has a **Show Pricing** checkbox plus a picker for which tiers to display on that screen
- **Locker Rooms** — add/edit/delete rooms; define named **Locker Room Sequences** for auto-assignment
- **Displays** — register physical TV devices (name + IP address)
- **Admin** — change the admin login password

### Leagues & Teams tab
- One tab per league; leagues are auto-created from Hockey Games calendars on sync
- Set a team's background and text color (shown on the Game Board TV display)
- Set a display name override per team (used on TV instead of the calendar name)
- Assign a **Locker Room Sequence** per league used by auto-assignment; syncs automatically to/from the matching calendar's sequence setting

---

## Calendar import rules

Games are pulled from all calendars in the **Hockey Games** category.

### Location filter
Events with a location that does **not** contain "San Mateo" are skipped (away games at other rinks). Events with no location are always imported.

### Import window
Events are imported if they start within the last 12 hours through the next 30 days. Events outside this window are skipped, and previously imported games that fall outside it are removed on the next sync.

### Title parsing

| Condition | Stored Title | Away | Home |
|---|---|---|---|
| Title has a colon | Everything before `:` (e.g. "CON") | Parsed from matchup after colon | Parsed from matchup after colon |
| No colon, has "vs" | _(blank)_ | First team per team order setting | Second team per team order setting |
| No colon, no "vs" | Full raw title | `Away TBD` | `Home TBD` |
| Title contains "Practice", "Scrimmage", "League Pickup", or "Stick & Shoot" | Full raw title, even if it contains a colon (normalized to "Stick & Shoot") | `Open` | `Open` |

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

All display pages live at `/tv/:screenId` — plain HTML/CSS/JS with no React or ES modules, compatible with Samsung, LG, and other smart TV built-in browsers.

| Display type | What it shows |
|---|---|
| Game Board | Today's games with time, away vs. home team, locker rooms (toggleable) — optional admission pricing panel |
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
