# RinkScreens — Feature Backlog

Items here are planned but not yet implemented.

---

## Bugs

- **Calendar re-sync wipes locker room assignments** — every iCal refresh overwrites `home_team`, `away_team`, `home_locker`, `away_locker` with empty strings, losing anything the admin has entered. Fix: only overwrite those fields if they are currently empty.
  - **Ask Hanna:** How often should each calendar poll for updates once connected?
  - **Ask Hanna:** If a calendar re-sync brings in updated game info, how should we handle locker room assignments that have already been set — keep them as-is, clear them so they can be reassigned, or prompt the admin to review?

---

## Improvements

- **Game import — parse team names and subheadings from title** — parse calendar event titles on import using these rules:
  - If the title contains a colon (`:`), everything before the colon is the **subheading** (e.g. division or category like "Squirt"), and everything after is the matchup
  - If the matchup portion contains "vs" (case-insensitive), split on "vs" to extract team names
  - If no "vs" is present, set both `home_team` and `away_team` to `"<Subheading> TBD"` (or `"<Full Title> TBD"` if no colon)
  - Store the subheading as a new `subheading` field on the game record
  - **Home/Away parsing rules:**
    - **Default calendar:** format is `Away vs Home` (or `Away vs. Home`) — first team = away, second team = home
    - **NCWHL calendar:** format is `"Green Game G6 (Home) vs. G8 (Away)"` — teams are explicitly labeled with `(Home)` and `(Away)` tags in the title; parse by looking for these tags rather than position. The subheading before the colon (e.g. "Green Game") identifies it as NCWHL.
    - NCWHL games will be imported from a **separate calendar** and merged into the main game list. Locker room assignment for NCWHL games:
      - If there is any other hockey game within 2 hours of the NCWHL block, continue the locker room numbering sequence from those surrounding games (no overlap)
      - If the NCWHL games are isolated (no other games within 2 hours), start fresh at 1 & 3, then 2 & 4
    - Store the source calendar on each game record so NCWHL games can be identified and handled separately if needed.

- **Game Board display — subheading group headers** — when games have a `subheading` value, group them on the Game Board display under a header row showing the subheading (e.g. "Squirt"). Multiple subheadings can appear on the same day, each with their games listed below. Games without a subheading display as before with no group header.



- ~~**Calendar URL validation**~~ — **Done.** Server validates the URL on save and returns a descriptive error; Settings tab displays it inline below the URL field.

---

## Features

### Screen thumbnails on Screens dashboard
Display a live thumbnail preview of each screen on the Screens tab in the admin dashboard. Layout should show 3 screens per row, each with a medium-sized thumbnail large enough to clearly see what is currently being displayed. Implementation options:
- Embed the `/tv/:screenId` display URL in a scaled-down `<iframe>` as a preview
- Or periodically screenshot the display and show as an image (more complex)

Preferred approach: scaled iframe — simple, always reflects live content, no extra server work.

### Screen rotation / playlist
Allow a single TV screen to cycle through multiple display types on a configurable interval. Admin can build a playlist for a screen — e.g., Game Board for 30 seconds, then Standings Webpage for 20 seconds, then Public Skate for 30 seconds — and the TV rotates through them automatically. Requirements:
- Add/remove/reorder display items in a playlist per screen
- Set a duration (seconds) per item, or a single global interval for the whole playlist
- Playlist state should survive a page reload on the TV (resume at the current item or restart from the beginning)
- WebSocket push should be able to interrupt and force a reload of the current item when data changes

### Webpage embed display type
Add a new display type ("Webpage") that renders an external URL inside the TV display screen using an `<iframe>`. Configurable per screen — admin enters any URL (e.g., a live stats page) and the TV browser loads it full-screen.

Initial URL: `https://league.iceoasis.com/icy.php/public/division/96/standings` (division ID changes each season)

Considerations:
- Some external sites block iframe embedding via `X-Frame-Options` / `Content-Security-Policy` headers; if `iceoasis.com` blocks iframes, the server can proxy-fetch the page HTML and serve it locally to work around that
- Should support an optional auto-refresh interval so the stats page reloads periodically
- **Ask Hanna:** How often should the standings page refresh/reload on the TV display?

### Admin login
Protect the admin panel with a username + password login page. The `/tv/:screenId` display pages stay public (no login required on TVs). Use `express-session` with in-memory or file-based persistence.

### Upcoming Public Skate display screen
New display type that shows upcoming public skate sessions pulled from a dedicated iCal calendar. Requirements:
- Admin configures a public skate iCal URL in Settings (separate from the hockey games calendar)
- Display shows a list of upcoming sessions with date, time, and any description from the calendar event
- Sessions are sorted chronologically; past sessions are excluded
- Calendar polls on the same interval as other calendars
- Retains the existing admission pricing panel alongside the session list
- **Ask: What is the iCal URL for the public skate calendar?**

### Rename "Public Skate" display to "Rink Events"
Update all references from "Public Skate" to "Rink Events" — display type label in the admin Screens tab, the TV display page heading, the admin tab name, and any internal `display_type` value stored in `db.json`. Consider a migration step so existing screens configured as `skate` continue to work.

The Rink Events display will have two modes:

1. **Pricing screen** — retains the existing price list functionality (configurable admission tiers with label + price)

2. **Upcoming Events screen** — pulls from multiple iCal calendars (separate from the hockey games calendar) to build a combined list of upcoming rink events (e.g., public skate, lessons, stick & puck, etc.). Requirements:
   - Admin can add/remove multiple iCal URLs in the Settings tab, each with a label/name
   - Events from all calendars are merged and sorted by date/time into a single upcoming list
   - Display shows event name, date, time, and description
   - Calendars poll on the same interval as the games calendar
   - **Ask: What iCal calendar URLs will be used for rink events?**

### Auto-assign locker rooms
Add a button (or automatic logic) in the Games tab that assigns locker room numbers to a day's games according to these rules:

**Default rule (weekdays and Saturday/Sunday non-morning games)**
- Games are sorted by start time (earliest first)
- First game of the day: Home = 1, Away = 3
- Second game: Home = 2, Away = 4
- Continue alternating pairs through the rest of the day

**Weekend exception (Saturday & Sunday — when games are scheduled before the Blackstars game)**
- If there are any hockey games scheduled *before* the Blackstars game on that day:
  1. Assign the Blackstars game(s) first, starting at locker room 1 & 2, then 3 & 4, etc.
  2. Then assign the games that fall *before* the Blackstars game in *reverse* chronological order (latest-before-Blackstars first), using the next available locker room pairs (e.g., starting at 3 & 4 if Blackstars took 1 & 2).
  3. Games *after* the Blackstars game follow the default rule (sequential, next available pairs).
- If no games are scheduled before the Blackstars game, use the default rule for the whole day.
