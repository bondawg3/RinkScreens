# RinkScreens

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

Open `http://localhost:3001/admin` to configure the system.

For development (hot reload on both client and server):

```powershell
npm run dev
```

---

## Admin panel

Navigate to `/admin` from any browser on the local network.

### Screens tab
- Register TVs by name and IP address
- Assign a display type per screen: **Game Board**, **Public Skate**, or **Custom Message**
- Assign a background image per screen
- Preview link opens the TV display URL
- Online/offline status shown via WebSocket presence

### Games tab
- Lists all imported hockey games
- Sort by **Date & Time** (grouped by day, then by calendar) or **By Calendar**
- Assign home/away team names and locker rooms per game via dropdowns
- Locker room dropdowns auto-save on change; Edit button for team name changes
- **Refresh Calendar** button forces an immediate re-sync

### Public Skate tab
- Configure admission pricing tiers (label + price + sort order)

### Backgrounds tab
- Upload JPG/PNG/GIF/WebP images up to 20 MB
- Assign a background to any screen; delete unused backgrounds

### Calendars tab
- Add Hockey Games, Public Skates, and Rink Events calendars
- Each calendar has a name, iCal URL, poll interval (minutes), and for Hockey Games a **team order** setting (Away vs. Home or Home vs. Away)
- Validates iCal format on save; rejects duplicate names and URLs

### Settings tab
- Set the rink name (shown in the TV header)
- Upload a rink logo (replaces the text name in the TV header)
- Manage **Locker Rooms** — add/edit/delete rooms available in game assignment dropdowns
- Manage **Locker Room Sequences** — define named pairing patterns for auto-assignment

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
| Title contains "Practice", "Scrimmage", or "League Pickup" | Full raw title | _(blank)_ | _(blank)_ |

### NCWHL calendar special rules
Calendars with "NCWHL" in the name use a different parsing strategy:
- Title = everything up to and including the word "Game" (e.g. `"Maroon Game M2 (Home) vs. M7 (Away)"` → title `"Maroon Game"`)
- `(Home)` and `(Away)` tags are stripped before the "vs" split
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
| Game Board | Today's games with time, away vs. home team, locker rooms |
| Public Skate | Upcoming public skate sessions and admission pricing |
| Custom Message | Static text message configured per screen |

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

All data is stored in `data/db.json` — a flat JSON file, no database binary required.

| Table | Purpose |
|---|---|
| `screens` | Registered TVs and their display config |
| `backgrounds` | Uploaded background image records |
| `games` | Imported calendar events + admin assignments |
| `calendars` | iCal calendar sources with type and poll settings |
| `skate_prices` | Public skate admission tiers |
| `locker_rooms` | Available locker room names |
| `locker_sequences` | Named locker room pairing patterns |
| `settings` | Rink name, logo filename, legacy iCal URL |

Uploaded files are stored in `uploads/` (gitignored).

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

- **Server**: Node.js + Express 5 + `node-ical` + `ws` + `multer`
- **Client**: React 18 + Vite + React Router v6 + CSS Modules
- **TV display**: Plain HTML/CSS/JS (no framework, TV browser compatible)
- **Build**: `@vitejs/plugin-legacy` + `terser` for ES5 fallback bundle
