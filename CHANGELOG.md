# Changelog

All notable changes to RinkScreens are documented here.

## [1.6.0] — 2026-06-28

### Added
- **Locker room auto-assignment** — locker rooms are automatically assigned after each calendar sync for newly-imported games with no lockers set; uses each league's configured sequence (falling back to a sequence named "Standard"); groups games within a day into 150-minute blocks and cycles through the sequence pairs continuously, including cross-league continuation within a block
- **Reset Auto-Assign LRs button** in the Games tab — resets all auto-assigned locker rooms and re-runs assignment with current sequence settings; manually-set locker rooms are always preserved
- **Per-day Reset Auto-Assign LRs button** in each day group header — same reset-and-reassign but scoped to one day only
- **Conflict detection** — when two consecutive games in a block would share a locker room, a warning is shown after auto-assign runs
- Manually editing a locker room via the Games tab now marks that assignment as manual so auto-assign won't overwrite it

## [1.5.0] — 2026-06-27

### Added
- **Leagues tab** — manage leagues and their teams; set a team's color with a color picker; assign a default locker room sequence per league via dropdown

## [1.4.2] — 2026-06-27

### Changed
- **Game Board TV** — calendar group header is now a single compact row: calendar name fills the time/title area as a dark blue pill, with Home/LR# and Away/LR# pills on the right (was two separate rows)

## [1.4.1] — 2026-06-27

### Fixed
- **Game import** — games with no parseable "vs" matchup now leave home/away team blank instead of showing "Away TBD" / "Home TBD"

## [1.4.0] — 2026-06-27

### Added
- **Admin authentication** — single-password login protecting all write operations; first run shows a setup form to create the password
- **JWT session** — 30-day token stored in localStorage; auto-redirects to `/login` on 401 or when token is missing
- **Log out button** in the admin header
- **Change password** section at the bottom of the Settings tab
- TV display endpoints remain open (no auth required) so screens continue working without credentials

## [1.3.3] — 2026-06-26

### Fixed
- **Screens edit modal** — Save was broken due to `webpage_refresh` missing from the PATCH route destructure, causing a server ReferenceError; also added error display inside the modal so failures are visible

## [1.3.2] — 2026-06-26

### Fixed
- **Webpage display** — iframe now centers correctly when width is less than 100% (changed transform-origin to top center)

### Added
- **Webpage display** — Refresh Interval slider (0–60 min, Off when 0); TV reloads the iframe at the configured interval

## [1.3.1] — 2026-06-26

### Changed
- **Webpage display** — added Width (10–100%) and Zoom (25–300%) sliders in the screen edit modal; TV applies width centering and zoom scaling to the embedded iframe

## [1.3.0] — 2026-06-26

### Added
- **Webpage embed display type** — screens can now be set to "Webpage" mode; a URL field appears in the edit modal and the TV renders it full-screen in an iframe

## [1.2.9] — 2026-06-26

### Changed
- **Public Skate TV display** — pricing subheading now appears on a second line below the label, slightly indented and in a smaller font

## [1.2.8] — 2026-06-26

### Changed
- **Public Skate tab** — added optional Subheading field to each pricing tier (e.g. "18+", "Under 12"); shown as a column in the table

## [1.2.7] — 2026-06-26

### Changed
- **Screens tab** — added "Rink Events" as a display type option when creating or editing a screen

## [1.2.6] — 2026-06-26

### Added
- **Rink Events tab** — new admin tab showing events pulled from Rink Events calendars, grouped by day then calendar, with weekly pagination
- **Rink Events calendar sync** — server now polls `rink_events`-type calendars alongside `hockey_games` calendars
- **`/api/rink-events` endpoint** — returns games whose calendar is type `rink_events`

## [1.2.5] — 2026-06-26

### Added
- **Screen thumbnails** — Screens tab now shows a 3-column card grid with a live scaled iframe preview of each TV display; edit moved to a modal overlay

## [1.2.4] — 2026-06-26

### Changed
- **TV Game Board** — calendar sub-heading now appears first in each group, column header row second (Home/LR#/Away/LR# only — Time and Title area transparent)
- **TV Game Board** — swapped row colors: sub-heading is now medium blue, column header row is light blue
- **TV Game Board** — rounded corners on all visible row segments and sub-heading
- **TV Game Board** — sub-heading font size now matches game row text and scales with auto-fit
- **Admin Games tab** — Games tab column color order fixed: column headers now medium blue, sub-headers light blue

## [1.2.3] — 2026-06-26

### Changed
- **TV Game Board** — overhauled layout to mirror admin Games tab: games grouped by calendar with sub-header rows, columns for Time, Title, Home, LR#, Away, LR#
- **TV Game Board** — locker room numbers shown in black cells with white text directly attached to each team
- **TV Game Board** — transparent gaps between Title/Home and Home LR/Away columns matching row gap spacing
- **TV Game Board** — text auto-scales down if content doesn't fit the screen; starts at 2em
- **TV Game Board** — larger header banner (2em text, 64px logo)
- **Admin Games tab** — column order changed to Time, Title, Home Team, Home Locker, Away Team, Away Locker
- **Calendar sync** — stores `raw_title` on each game; reparse now uses raw title so team parsing works correctly after first import
- **Calendar sync** — team names are re-parsed on re-sync if previously blank or TBD (only preserves admin-entered names)

## [1.2.2] — 2026-06-26

### Added
- **Weekly pagination in Games tab** — "By Date & Time" view now shows one week at a time; Previous/Next buttons page through weeks; defaults to the current week on load; empty state shows "No games this week"

### Changed
- **Games tab color order** — day group headers (darkest, `#064878`), calendar sub-headers (medium, `#1a7abf`), and column header rows (lightest, `#4da3d4`) now go darker → lighter top to bottom for a cleaner visual hierarchy

## [1.2.1] — 2026-06-26

### Added
- **Reparse Titles button** in the Games tab — re-runs title/team parsing on all existing games without a full calendar re-sync

### Changed
- **Title parsing overhauled** — colon in event title splits into title (before) and matchup (after); no colon + "vs" parses teams and leaves title blank; no colon + no "vs" keeps full title with Away TBD / Home TBD teams
- **NCWHL parsing** — title set to everything up to "Game" word; `(Home)`/`(Away)` tags stripped before team split
- **Practice/scrimmage/pickup events** — titles containing "Practice", "Scrimmage", or "League Pickup" import with title only and both team fields left blank
- **Sync cleanup** — games previously imported that now fail the location filter or fall outside the 30-day window are removed on next refresh
- **Import window** — changed from open-ended future to 30 days from now; events older than 12 hours or more than 30 days out are excluded
- **Subheading field removed** from admin UI (still stored internally, will be used on TV Game Board display in a future release)

## [1.2.0] — 2026-06-26

### Added
- **Team order setting per calendar** — Hockey Games calendars now have an "Away vs. Home" / "Home vs. Away" toggle in the Add/Edit modal; the setting is stored per calendar and used during import to assign teams to the correct home/away columns; shown as a column in the Calendars table
- **Auto team parsing on import** — game titles containing "vs" are automatically split into away/home teams using the calendar's team order setting; titles without "vs" set both teams to `<Title> TBD`
- **Subheading parsing** — titles with a colon are split: everything before the colon becomes the subheading (e.g. "Squirt"), the rest is the matchup; subheading stored on each game record for future grouping
- **NCWHL calendar special rules** — calendars with "NCWHL" in the name use a different parsing strategy: subheading is extracted as everything up to and including the word "Game" (e.g. "Green Game"), `(Home)` and `(Away)` tags are stripped before team parsing, and the colon rule is skipped
- **Location filter on import** — events with a location set that does not contain "San Mateo" are excluded from import (away games at other rinks)

### Changed
- **Games tab** — "By Date & Time" view now groups games under a date subheading per day; each day further groups by calendar with a light blue sub-header
- **Games tab** — "Calendar Title" column renamed to "Title"

## [1.1.9] — 2026-06-24

### Added
- **Locker Room Sequences** in Settings — create named pairing patterns (e.g. "Standard", "NCWHL") with an ordered list of home/away locker room pairs; pairs can be reordered with up/down arrows; sequences can be edited and deleted; foundation for auto-assign feature

## [1.1.8] — 2026-06-23

### Changed
- **Games tab** — locker room dropdowns are now always visible on every row; selecting a locker room saves immediately without needing to click Edit; Edit button remains for team name changes only

## [1.1.7] — 2026-06-23

### Changed
- **Games tab** — locker room assignment fields are now dropdowns populated from the Locker Rooms list in Settings, replacing free-text inputs

## [1.1.6] — 2026-06-23

### Added
- **Locker Rooms section** in Settings — add locker rooms by name; inline edit and delete per row; duplicate name check on add and edit

## [1.1.5] — 2026-06-23

### Changed
- **Games tab** — removed Remove Unassigned button; calendar group headers now use a medium blue distinct from the dark blue column headers; each group renders as one cohesive card with consistent corner rounding

## [1.1.4] — 2026-06-23

### Added
- **Remove Unassigned button** in the Games tab — appears only when unassigned games exist; prompts for confirmation before deleting all games not linked to a calendar

## [1.1.3] — 2026-06-23

### Fixed
- Logo upload now posts to the correct `/api/logo` endpoint (was incorrectly posting to `/upload/logo`)
- Upgraded Express 4 → 5; fixed catch-all route syntax (`*` → `/{*path}`) required by Express 5's stricter path-to-regexp; DEP0169 deprecation warning now gone without suppression flags

## [1.1.2] — 2026-06-23

### Added
- **Rink logo upload** — upload a logo image (JPG, PNG, SVG, WebP, max 5 MB) in the Settings tab; when set, the logo replaces the rink name text in the TV header bar; removing the logo reverts to the text name
- **TV header bar** changed to white with dark blue text; logo constrained to 48px max height on screen

## [1.1.1] — 2026-06-23

### Added
- **Settings tab** restored as a separate tab with just Rink Name for now
- Rink Name removed from the Calendars tab

## [1.1.0] — 2026-06-23

### Changed
- **Settings tab renamed to Calendars** — tab now focuses solely on calendar management; general settings form removed
- **Rink Name** moved to a compact inline field at the top of the Calendars tab
- **Calendar polling now driven by the Calendars table** — Hockey Games calendars are polled independently using each calendar's own poll interval; falls back to the legacy `ical_url` setting if no hockey calendars have been added yet
- **Games import now stores `calendar_id`** — each synced game records which calendar it came from, enabling the "By Calendar" sort in the Games tab

## [1.0.9] — 2026-06-23

### Added
- **Games tab sort toggle** — switch between "By Date & Time" (default) and "By Calendar" views; By Calendar groups games under their calendar name with a header row; games not yet linked to a calendar appear under "Unassigned"

## [1.0.8] — 2026-06-23

### Added
- **Edit calendar** — each calendar row now has an Edit button that opens the modal pre-filled; validates name uniqueness and URL only when changed

## [1.0.7] — 2026-06-23

### Added
- **Calendars section in Settings** — replace the single iCal URL field with a full calendar manager; add Hockey Games, Public Skates, and Rink Events calendars each with a name, iCal URL, and poll interval
- **Add Calendar modal** — validates that the name is unique, the URL is not already in use, and that the URL is a valid iCal feed before saving; shows inline error messages for each case
- **Calendars API** — `GET/POST/PATCH/DELETE /api/calendars` endpoints with duplicate name/URL and iCal format validation

## [1.0.6] — 2026-06-23

### Fixed
- Calendar URL validation now triggers correctly on the first save attempt; removed `type="url"` from the iCal URL input so the browser's own URL check no longer interferes with server-side validation

## [1.0.5] — 2026-06-23

### Added
- **Build info label** — version number and build date shown in the bottom-right corner of the admin dashboard; updates automatically on each build
- **Calendar URL validation** — saving an invalid or non-iCal URL in Settings now shows a descriptive error message inline below the URL field instead of silently saving

## [1.0.4] — 2026-06-20

### Added
- **TV-compatible display page** (`/tv/:screenId`) — plain HTML/CSS/JavaScript with no React or ES modules; works on Samsung, LG, and other smart TV built-in browsers that cannot run modern JavaScript bundles
- **Legacy JS build** — added `@vitejs/plugin-legacy` + `terser` to generate an ES5-compatible bundle as a fallback for older TV browsers loading the admin dashboard
- Preview links in the Screens tab now point to `/tv/:screenId` (the TV-compatible URL) instead of the React display route

### Fixed
- `vite.config.js` renamed to `vite.config.mjs` to resolve ESM/CJS conflict with `@vitejs/plugin-legacy` v8

## [1.0.3] — 2026-06-20

### Changed
- **Game Board layout** — locker room numbers now appear inline next to team names (e.g. `B4 (1) VS B5 (2)`) instead of as separate chips in a side column
- Away and Home columns are now equal-width on either side of a centered VS, so the matchup is visually centered on screen
- Removed the separate Locker Rooms column

## [1.0.2] — 2026-06-20

### Changed
- **Game Board display** now shows only today's games instead of all upcoming games
- Removed the date column from each game row (redundant now that only today's games show)
- Empty state message updated to "No games scheduled for today"

## [1.0.1] — 2026-06-19

### Fixed
- **Calendar sync** — events from up to 12 hours ago are now included so in-progress or recently-started games appear on the Game Board (previously only strictly future events were stored)
- **Team/locker data preservation** — calendar re-sync no longer wipes out admin-assigned home team, away team, home locker, and away locker values

## [1.0.0] — 2026-06-19

### Added
- **Game Board display** — full-screen TV view showing upcoming games with time, away team vs. home team, and locker room assignments
- **Public Skate display** — TV view showing upcoming public skate sessions and configurable admission pricing
- **Admin dashboard** with five tabs: Screens, Games, Public Skate, Backgrounds, Settings
- **Screen management** — register TVs by name and IP address; assign display type and background per screen; preview link opens the display URL; online/offline status via WebSocket presence
- **Google Calendar integration** — polls a public iCal URL every N minutes (configurable); upserts upcoming events into the local store; manual "Refresh Calendar" button in admin
- **Locker room assignment** — admin can assign home/away team names and locker room numbers to each calendar event
- **Public skate pricing** — configurable admission tiers (label + price + sort order) displayed on the Public Skate screen
- **Background image uploads** — JPG/PNG/GIF/WebP up to 20 MB; assign a background per screen; delete backgrounds from admin
- **Real-time WebSocket push** — screen config changes and calendar refreshes push instantly to connected TV browsers with no manual refresh
- **Auto-reconnect** — TV browsers reconnect automatically every 3 seconds if the server restarts
- **Heartbeat** — server pings all clients every 30 seconds; stale connections are terminated
- **JSON flat-file data store** — no native binary dependencies; data persisted to `data/db.json`
- **Single-server production build** — React app built with Vite and served statically from Express; one process, one port (3001)
- **Custom message mode** — display a static text message on any screen
- **Live clock** — displayed in the header of every TV view
- **Configurable rink name** — shown in the TV header; set in admin Settings
- **Public skate keyword filter** — calendar events whose title contains the keyword (default: `Public Skate`) are routed to the Public Skate display; all other events appear on the Game Board
- **Windows startup instructions** — documented PowerShell scheduled task for auto-start at boot
