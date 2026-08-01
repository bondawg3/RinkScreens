# Changelog

All notable changes to RinkScreens are documented here.

## [1.23.4] — 2026-07-31

### Fixed
- **Locker room screens with few events never split into pages** — a day with 5 or fewer games/events on a locker-room screen always rendered as a single page, even when a long gap (e.g. an afternoon skate) should have separated it into multiple screens. That floor is removed, so the existing 60-minute gap rule now applies regardless of how many events are in the day. To avoid a screen flashing by with just 1 or 2 events, consecutive small pages (2 or fewer games each) are now merged back together into one page.

## [1.23.3] — 2026-07-31

### Changed
- **Displays use a TV number instead of an IP address** — since screens no longer need a fixed IP to be reached, each display in Settings > Displays is now assigned a simple TV number (1, 2, 3, …) instead of an IP address. That number sets the display's web address (e.g. `/tv/2`), which is now shown directly in the Displays tab and titled "Display 2" above the display's name, so pointing a TV's browser at the right URL no longer requires knowing its network IP.

## [1.23.2] — 2026-08-01

### Added
- **Scheduled update checks and unattended auto-install** — the Updates tab's "Check schedule" can now run on a fixed interval (as before) or daily at a specific time. A separate "Automatically install updates" option installs a newer version unattended at a chosen time (e.g. 3 AM) with no confirmation prompt, so the rink doesn't need staff around to approve it — the server restarts as part of installing, so pick a time when the TVs briefly going offline won't matter.

### Fixed
- **Installing an update could corrupt the running app** — the update installer's helper script only waits up to 30 seconds for the server process to exit before it starts overwriting files regardless, but nothing ever told the server to actually exit after starting an install. A manual "Install Update" click worked by luck only if the process happened to be restarted within that window; unattended auto-installs would have hit the timeout on every run and started copying files out from under a process still using them. The server now exits itself shortly after handing off to the installer.

### Added
- **Pin backups to keep them forever** — each backup in the Backups tab's history now has a "Keep Permanently" button. Pinned backups are exempt from the automatic retention pruning (they don't count against "Keep last N backups") and can't be deleted until unpinned, so a backup you want to hang onto indefinitely (e.g. before a season change) won't get silently cleaned up.

## [1.23.0] — 2026-07-31

### Added
- **Automatic updates** — a new Settings > Updates tab checks GitHub Releases for newer versions of RinkScreens and can install them with one click. Updates only ever replace app code (server, built client, dependencies) and automatically restart the server; the `data` and `uploads` folders are never part of an update package, so screens, displays, calendars, and uploaded images are always preserved. Checking runs automatically on a configurable interval (default every 24 hours) and needs a GitHub personal access token since the repo is private — see INSTALL.md for setup. Publishing a new release for the rink PC to find is now `npm run publish-release` (requires the GitHub CLI).

## [1.22.18] — 2026-07-31

### Changed
- **Backup location is now a folder picker** — the Backups tab's location field is no longer free text; "Choose Folder…" opens a browser that navigates the server machine's actual drives and folders (with a "+ New Folder" option), so there's no risk of a typo'd path. Free-text entry never worked well here since the admin panel can be opened from a different machine than the server, so a native OS file picker couldn't resolve a usable server-side path.

## [1.22.17] — 2026-07-31

### Added
- **Configurable backup location** — the Backups tab now has a "Backup location" field so backups can be saved to any absolute folder on the server machine (e.g. an external drive or network share) instead of just the default `data/backups`. The location is validated (must be an absolute, writable path) before saving, and the tab shows exactly where backups are currently being written. If the configured folder becomes unreachable (e.g. a USB drive unplugged), backups automatically fall back to the default location rather than failing.

## [1.22.16] — 2026-07-31

### Added
- **Data backup & restore** — a new Backups tab in Settings zips the settings/screens/calendars database and all uploaded files (logo, backgrounds) into a downloadable `.zip`. Backups can be created on demand, downloaded, restored, or deleted, and restoring from an uploaded file is also supported. An automatic backup scheduler runs on an admin-configurable interval (default every 24 hours) and prunes old backups down to a configurable retention count (default 14). Restoring always takes a safety "pre-restore" backup of the current state first.

## [1.22.15] — 2026-07-19

### Fixed
- **Recurring practices/games now actually sync** — Hockey calendars were parsed with a library that doesn't expand recurring events (`RRULE`), so any weekly-recurring practice series (e.g. "Blackstars 8U Practice") was silently dropped on every sync — only the series' long-past original start date was ever considered, which always fell outside the import window. Hockey calendars now use the same recurrence-expanding parser as the other calendar types, so weekly/recurring practices and games show up on the correct dates going forward.

## [1.22.14] — 2026-07-19

### Fixed
- **Hockey/Game Board screens now stay in true chronological order** — games, practices, and stick-&-shoot sessions from different calendars that are interleaved throughout the day (e.g. Team A, Team B, Team A) no longer get merged into out-of-order per-team blocks; a new calendar header now starts whenever the calendar actually changes.
- **Busy days split at natural gaps instead of a blind count** — a day with more than 5 hockey events now prefers to split into pages at the day's largest time gap (e.g. around an afternoon public skate), falling back to a fixed page size only when no clear gap exists.
- **Page rotation now follows the actual schedule** — Hockey and Figure Skating screens with multiple pages now flip to the next page once that page's events have actually ended, instead of a flat countdown timer.

### Added
- **Preview page navigation** — the admin screen preview bar now has prev/next controls to step through every page a multi-page Hockey or Figure Skating screen produces, not just the first one.

## [1.22.13] — 2026-07-12

### Changed
- **Install package now includes demo data** — `npm run package` bundles the current `data/db.json` and `uploads/` folder into the release zip, so unzipping gives a working install pre-loaded with the existing rink config, screens, and images instead of a blank first run.

## [1.22.12] — 2026-07-11

### Added
- **"Show seconds" option for the Date/Time announcement element** — a checkbox (for the "Date & Time" and "Time only" formats) that adds a ticking `:SS` to the live clock on the TV, off by default.

## [1.22.11] — 2026-07-11

### Added
- **"DS-Digital" font** — added the user-supplied DS-Digital font family (normal + bold) to the Announcement editor's font picker, self-hosted from `client/public/fonts`. It's now the default font for new Date/Time elements, replacing DSEG7 Classic as the default (DSEG14 Classic and DSEG7 Classic remain available as alternatives).

## [1.22.10] — 2026-07-11

### Added
- **"DSEG7 Classic" font** — a true 7-segment digital font (like a calculator display), added alongside DSEG14 Classic. DSEG14's letterforms (especially "Y") use extra diagonal segments that can look unfamiliar; DSEG7 Classic uses simpler, more calculator-like letter shapes and is now the default for new Date/Time elements. DSEG14 Classic remains available in the font picker.

## [1.22.9] — 2026-07-11

### Added
- **True 7/14-segment digital font ("DSEG14 Classic")** for the Announcement editor's font picker — the blocky LCD/digital-watch look (segments visible even when "off"), self-hosted as a webfont so it renders correctly on TVs without internet access to Google Fonts. Now the default font for new Date/Time elements.

## [1.22.8] — 2026-07-11

### Added
- **Digital-style fonts for text and Date/Time elements** — added "Orbitron" (bold LCD/digital look) and "Share Tech Mono" (monospace terminal look) to the font picker in the Announcement editor, loaded via Google Fonts. New Date/Time elements now default to Orbitron for a digital watchface feel.

## [1.22.7] — 2026-07-11

### Added
- **Date/Time element for Announcement screens** — a new "+ Date/Time" element type in the Announcement editor, alongside Heading/Body/Footer/Image. Configurable format (date & time, date only, or time only), plus the usual font, size, color, bold, and alignment controls. On the TV display it updates live every second.

## [1.22.6] — 2026-07-11

### Fixed
- **Screen edit modal (Hockey, Rink Events, Figure Skating, Public Skate, Custom) was getting cramped** as more per-type settings accumulated (Layout, Overflow, Rotate Interval, Pricing, Locker Rooms...). Widened the modal (440px → 520px, fixing the truncated "Two columns (max 12 rows each)" label) and split it into a sticky title, an independently scrolling body, and sticky Cancel/Save buttons — so a tall form scrolls internally instead of the whole modal growing past the viewport. Same fix applied to the Pricing picker modal, which shares the same layout.

## [1.22.5] — 2026-07-11

### Fixed
- **Figure Skating's Rotate Interval control disappeared outside "Rotate pages" mode** — it now always shows (with a note that it only takes effect when Overflow is set to "Rotate pages"), instead of vanishing while browsing the "None" or "Flow with time" options.

## [1.22.4] — 2026-07-11

### Changed
- **Terminology cleanup: "Game Board" → "Hockey"** — the admin UI (nav tab, scheduler palette, screen-type dropdowns) already used "Hockey" everywhere; this fixes the remaining stale "Game Board" wording in the README and a code comment so docs match what's actually on screen. No behavior change.

## [1.22.3] — 2026-07-11

### Added
- **Configurable page-rotation speed on Hockey screens** — a "Page Rotation Interval" input (with a Seconds/Minutes toggle, matching the Webpage screen's refresh-interval control) now lets each Hockey screen set how fast it cycles pages on a busy day (more than 6 events), instead of a fixed 30-second default.

### Changed
- **Figure Skating's rotation-speed field** now uses the same value + Seconds/Minutes toggle control as Hockey and Webpage, instead of a plain "seconds" number box.

## [1.22.2] — 2026-07-10

### Added
- **Hockey screen pagination for busy days** — a day with more than 6 hockey-calendar entries (games, practices, stick & shoot, etc. — anything from a "Hockey Games"-typed calendar that isn't a public skate) now splits into pages of 6 that rotate automatically every 30 seconds, in chronological order (earliest events first), instead of all cramming onto one screen with ever-shrinking text. Each page still groups its events by calendar with the usual header row.

## [1.22.1] — 2026-07-10

### Fixed
- **Scheduler timeline gridlines were invisible** — they were styled for a dark background; the admin panel is a light theme. Hour lines are now a solid ice-blue, quarter-hour lines a dotted ice-blue, both clearly visible on the timeline's white background.
- **Hour labels overlapped the grid instead of sitting in the left gutter** — they're now positioned in the dedicated gutter column, calendar-style, instead of floating inside the first grid line.
- **Screen thumbnails didn't rescale when the palette's column density changed** (and the 4-column density in particular clipped the screen) — thumbnails now use a `ResizeObserver` to keep the scaled iframe matched to their actual cell width at any density.
- **Scheduler palette was missing screen types and screens** — it was grouped by an ad hoc "display type" list left over from an earlier iteration (labels like "Game Board" with no Custom/Announcement groups) and silently dropped screens marked hidden. The palette now groups screens to match the real admin tabs (Hockey, Rink Events, Figure Skating, Public Skate, Webpage, Announcements, Custom) and only its own per-type checkboxes hide a group; a type with zero visible screens is still listed, just greyed out. The Displays tab's screen-assignment dropdown had the same stale type list and has been fixed the same way, and now only lists visible screens (plus whichever screen a display is already assigned to, so its selection never disappears).
- **Display card's screen dropdown could overflow its thumbnail** — it now fills the card width and truncates long labels instead of stretching the card.

### Changed
- Bigger whole-day (⤢) and delete (🗑) buttons on scheduled blocks, and more breathing room around the day timeline's top/bottom edges plus a taller scroll area.
- The "Show Pricing on this screen" checkbox no longer appears when editing or creating a Hockey screen — it isn't applicable there.
- Removed a legacy leftover "Custom Message" screen and screen-type from a prior iteration; any screen types outside the current tab set now have nowhere to silently linger.

## [1.22.0] — 2026-07-08

### Added
- **Visual drag-and-drop scheduler** — the per-display 📅 button now opens a full-page scheduler (its own route off the Displays tab) instead of the type-in modal. A vertical day timeline sits beside a palette of screen thumbnails grouped by display type; drag a thumbnail onto the timeline to schedule it. Blocks start at the 15-minute slot they're dropped on, default to one hour, and resize by dragging their top/bottom edges in 15-minute steps (15-minute minimum). Dropping onto an occupied time shifts neighbouring blocks toward the nearest free space (blocks are fixed-duration and never shrink); when the day can't absorb it, you're prompted to replace the block at the drop point (if it's the same size or larger) or told it "does not fit the available time slot." Each block has a 🗑 remove button and a whole-day (`00:00–24:00`) button.
- **Palette controls** — the screen palette is grouped to match the admin's screen-type tabs (Hockey, Rink Events, Figure Skating, Public Skate, Webpage, Announcements, Custom), with per-type show/hide checkboxes and a 2–4-column density selector. Only screens marked visible are schedulable; a type with no visible screens is still listed but greyed out.
- **Richer date navigation** — prev/next day buttons and a date picker (today … +31 days), plus a **Week starts** Sunday/Monday selector.
- **Duplicate day / duplicate week** — copy the current day to the next day, or the whole week to the following week (week bounds follow the Week Start choice), via a new `POST /api/displays/:id/schedule/copy` range-copy endpoint that preserves each block's day-offset and skips blocks that would overlap existing ones on a target day.
- **Shared view preferences** — side-swap, grid density, week start, and hidden types persist server-side (in `settings.schedule_prefs`) and apply for every admin.

### Changed
- Schedule edits from the visual editor save through a new atomic `PUT /api/displays/:id/schedule/day` endpoint that replaces a day's blocks in one transaction, so rearranging blocks never hits a transient-overlap rejection. The v1 single-day `…/schedule/bulk` endpoint was replaced by the more general range-copy endpoint, and the v1 schedule modal was removed.

## [1.21.0] — 2026-07-08

### Added
- **Display scheduling** — each physical display can now be preset with what it shows throughout the day, up to a month ahead. A new 📅 Schedule button on each display card (Displays tab) opens a day-by-day calendar of time blocks; each block picks an existing screen to show during that window. Outside any block, the display falls back to its assigned screen. Blocks snap to 15-minute boundaries (matching typical ice slots), cannot overlap, and cannot cross midnight (enter two blocks instead). A "copy this day" control replicates one day's blocks across a date range, skipping days where they'd overlap existing blocks.
- **On-time switching** — TVs re-fetch exactly at each schedule boundary (block start/end/midnight) via a `valid_until` timestamp from the new `GET /api/displays/:id/active` endpoint, instead of waiting for the next 60-second poll.
- New API: `GET /api/displays/:id/active`, `GET/POST /api/displays/:id/schedule`, `POST /api/displays/:id/schedule/bulk`, `PATCH/DELETE /api/schedule-blocks/:id`, backed by a new `display_schedules` table. Blocks older than a week are pruned at server startup.

### Changed
- **BREAKING: TV URLs are now per display, not per screen** — physical TVs must load `/tv/:displayId` (the display's id from the Displays tab) instead of `/tv/:screenId`. Every TV's configured URL needs a one-time update after deploying this version. Admin previews of a screen config live at `/tv/screen/:screenId` (all in-app preview links and thumbnails updated).
- **Online status** — a display's Online badge now reflects its own WebSocket connection (previously displays never showed online); a screen shows online when an admin preview of it is open or a connected display is currently showing it (including via a schedule block).
- Editing a screen now refreshes every display currently showing it — including displays showing it through a schedule block, not just those assigned to it.
- Deleting a screen is blocked while current/future schedule blocks reference it (the error lists which displays); deleting a display removes its schedule blocks.

## [1.20.0] — 2026-07-06

### Added
- **Duplicate screen button** — every screen card (Game Board, Public Skate, Figure Skating, Rink Events, Custom, Webpage, and Announcement tabs) now has a duplicate button (⧉) to the right of Delete. It creates a copy of the screen with all the same settings, named "&lt;screen name&gt; - Copy", via a new `POST /api/screens/:id/duplicate` endpoint.

### Changed
- **Screen card Edit/Delete buttons are now icons** — matching the angled pencil (✎) and trash can (🗑) icons already used elsewhere in the admin (Games tab, Calendars), instead of "Edit"/"Delete" text labels.
- **Preview links are now a TV icon (📺)** — every "Preview" link that opens a screen's `/tv/:id` page (screen cards on all type tabs, plus the Displays tab) now shows a TV icon instead of the text label.

## [1.19.0] — 2026-07-06

Codebase-wide consolidation pass: same behavior and visuals, less duplicated code and far less disk I/O. No screen types or admin workflows change.

### Changed
- **JSON store now caches in memory with batched writes** — `db.js` keeps the parsed database in memory (revalidated against the file's mtime/size, so external edits are still picked up) and gains a `transaction()` API that batches many operations into a single file write. Calendar sync previously rewrote the whole `db.json` once per imported event (hundreds of writes per poll cycle); sync, locker-room auto-assign, title reparse, and cascade deletes now each write the file once. Saves also force a strictly increasing mtime so rapid same-size writes can't be mistaken for an unchanged file.
- **TV display (`tv.html`) render helpers consolidated** — the per-screen-type renderers now share one implementation of the pricing panel, price-list fetch/filter, calendar/team lookup maps, today-window filtering, and the game/event table row builders (a full duplicate of the pricing panel builder inside the figure-skating renderer is gone). Game rows on Game Board and Custom screens are now rendered by the same code, so they can no longer drift apart. Custom screens fetch their six data sources in parallel instead of one after another, and Game Board its three.
- **Duplicate admin tabs merged** — Rink Events and Figure Skating tabs were byte-for-byte copies except for labels; both are now thin wrappers around a shared `CalendarEventsTab`. The screen-preview `Thumbnail` (five copies), week navigation bar, screen-card visibility/delete controls (`useScreenCards` + `EyeButton`/`InUseBadge`/`EyeHint`), and date formatting helpers (`utils/date.js`) are each defined once and shared across tabs.
- **API route helpers** — `/games`, `/rink-events`, and `/figure-skating` share one activities-by-calendar-type query; the six copies of the case-insensitive duplicate-name check share `findByNameCi`; both calendar sync branches share one fetch-with-timeout helper.

### Fixed
- **Stale rotation timer after changing a screen's type** — a Figure Skating screen in "Rotate pages" mode kept its rotation timer running after the screen was switched to another display type, periodically overwriting the new content with stale figure-skating pages. Webpage screens had the same leak with their auto-refresh timer. All per-type timers are now cleared on every screen reload.
- **Announcement layout bleeding into other screen types** — switching a screen from Announcement to another type kept the announcement's zero-padding content layout until a full page reload; the padding override is now reset on every reload.
- **Admin screen-preview date defaulted to UTC** — the preview thumbnails' date navigation used the UTC date, so evenings (after 5pm PDT) previewed tomorrow instead of today; it now uses the local date, matching the TV preview bar.

### Removed
- **Dead admin components** — `RinkSettingsTab.jsx` (superseded by the Settings page) and `ScreensTab.jsx` (superseded by the per-type screen sections) were no longer routed anywhere; ~29 KB of unmaintained source deleted. Their CSS modules remain in use by other tabs.

## [1.18.0] — 2026-07-06

### Added
- **Show Locker Room Numbers toggle** — Hockey (Game Board) and Custom screens now have a "Show Locker Room Numbers" checkbox in the screen edit form, on by default. When turned off, hockey game rows merge the title and matchup into a single field instead of showing separate Home/Away/LR# columns. On the Custom tab the checkbox is disabled until a Hockey calendar is selected.
- **Calendar group labels on Custom tab** — the Custom screen's calendar picker now shows each calendar's type (Hockey, Public Skate, Rink Events, Figure Skating) next to its name, since that tab mixes calendars from every type.

### Changed
- **Custom screen always shows its heading and subheading** — the screen-name banner and "Events" subheading now render regardless of whether pricing is enabled, instead of only appearing when pricing was on.
- **Custom screen rows no longer prefix the calendar name** — merged/general event rows show just the time and title, without the calendar name tag.
- **Rink Events subheading renamed** — the aligned subheading now reads "Schedule" instead of "Rink Events".
- **Uniform banner/subheading casing across all screens** — removed the forced uppercase styling from the shared banner and subheading elements, so Public Skate, Figure Skating, Game Board, Custom, and Rink Events screens all render titles in normal case.

## [1.17.0] — 2026-07-06

### Changed
- **Renamed the `games` data table to `activities`** — the table has held hockey games, rink events, figure skating events, and public skate sessions for a while, and the "games" name was a leftover from before it grew into a shared store. `display_type: 'games'` (the Game Board screen type) is unrelated and unchanged. Existing `data/db.json` files are migrated automatically on first load — the old `games` key (and its id sequence) is folded into `activities` in memory and the old key disappears from disk on the next write, with no data or id loss.

## [1.16.0] — 2026-07-05

### Added
- **Standardized pricing layout** — Game Board, Rink Events, and Custom screens now show the same ice-blue screen-name banner and aligned section-title header as Figure Skating/Public Skate whenever "Show Pricing" is enabled, instead of an unlabeled table sitting next to the Admission panel
- **Two-column layout disables pricing** — Figure Skating's "Show Pricing" checkbox is now disabled (and unchecked) while the two-column layout is selected, since there isn't room for both; the label grays out with an italic explanation
- **Custom screens now include Public Skate sessions** — the Custom screen builder was missing a call to `/api/skate-sessions`, so Public Skate sessions (which live in the `games` table under `public_skates` calendars, excluded from `/api/games`) never appeared even when their calendar was selected
- **Regression tests for Custom screen data sources** — pin down that `/api/games` intentionally excludes non-hockey calendars, and that each of the four endpoints the Custom screen aggregates (`games`, `rink-events`, `figure-skating`, `skate-sessions`) is correctly scoped by the screen's selected calendars

### Fixed
- **Public Skate admission table rounded corners** — `border-collapse: collapse` on the client-facing Public Skate page prevented the parent's `overflow: hidden` from clipping the last row's corners; added explicit `border-bottom-*-radius` to the last row's cells

## [1.15.0] — 2026-07-05

### Added
- **Pricing on all screen types** — the "Show Pricing" checkbox and per-screen tier picker, previously only available on Figure Skating screens, now works on Public Skate, Game Board (hockey), Rink Events, and Custom screens. Public Skate's pricing panel is now opt-in and tier-selectable instead of always showing every configured price.

## [1.14.11] — 2026-07-05

### Fixed
- **Admission price table rounding, for real this time** — the row background was painted by the `<tr>` element, which has no border-radius and ignored the rounding set on the cells; moved the background onto the `.price-label`/`.price-amount` cells themselves so the last row's rounded corners actually clip the visible background

## [1.14.10] — 2026-07-05

### Fixed
- **Admission price table rounding actually rendering** — browsers ignore `border-radius` on table cells when `border-collapse: collapse` is set, which silently defeated the previous corner-rounding fix; switched the price table to `border-collapse: separate` with zero spacing so the rounded bottom corners actually render

## [1.14.9] — 2026-07-05

### Fixed
- **Admission price table bottom corners** — the last row now explicitly rounds its bottom corners instead of relying only on the parent container's clipping

## [1.14.8] — 2026-07-05

### Fixed
- **Figure skating "Upcoming Sessions" header corners** — the header sits above a gapped (spaced-out) sessions table rather than a flush list, so its bottom corners were left square against the background; it now rounds on all four corners

## [1.14.7] — 2026-07-05

### Changed
- **Figure skating screen colors** — swapped the title banner to light blue and the "Upcoming Sessions" header to dark blue, and switched the sessions header to the shared section-title style so it lines up with the Admission price table header

## [1.14.6] — 2026-07-05

### Changed
- **Figure skating screen** — added a full-width title banner (like the public skate screen) and renamed the events list heading to "Upcoming Sessions"

## [1.14.5] — 2026-07-05

### Added
- **Favicon** — added the Nazareth Ice Oasis icon as the browser favicon on both the admin/React app and the TV display page

## [1.14.4] — 2026-07-05

### Changed
- **Hockey tab heading** — the page heading in the Hockey admin tab now reads "Hockey" instead of "Games", matching the nav rename

## [1.14.3] — 2026-07-05

### Changed
- **"Games" renamed to "Hockey"** — the admin nav tab and the Calendars section label ("Hockey Games" → "Hockey") now better reflect that the section covers all hockey-related calendar entries (games, practices, training), not just games

## [1.14.2] — 2026-07-05

### Changed
- **Calendars list simplified** — removed the Calendar Name and iCal URL columns from the calendars list (Calendar Name is still visible in the edit modal); the list was getting visually cluttered

## [1.14.1] — 2026-07-05

### Changed
- **Calendars list polish** — Calendar Name now shows in italic gray under the Display Name instead of its own column; the read-only Calendar Name field in the edit modal is now visibly greyed out; the iCal URL now wraps to show the full link instead of truncating; Sync/Edit/Remove are compact icon-only buttons on one line (↻ / ✎ / 🗑)

## [1.14.0] — 2026-07-05

### Added
- **Calendar Name field** — when editing a calendar, the admin panel now shows a read-only "Calendar Name" pulled from the iCal file's own title (`X-WR-CALNAME`), separate from the admin-chosen "Display Name". Makes it possible to tell which upstream calendar a URL actually points to, since the link itself gives no clue

## [1.13.1] — 2026-07-05

### Added
- **Custom color swatch preview** — in Leagues & Teams, entering a custom hex color shows a live swatch of that color to the right of the hex box (hidden for preset colors, which already highlight in the palette)

## [1.13.0] — 2026-07-05

### Added
- **Public Skate heading banner** — skate TV screens show a full-width banner across the top of the content area with the screen's name (e.g. "Public Skates"), left-aligned and styled to match the section headers

## [1.12.1] — 2026-07-05

### Fixed
- **Public Skate TV screens now show sessions from Public Skates calendars** — the TV skate view was still wired to the hockey-games data source (legacy keyword matching), so sessions imported from a Public Skates calendar never appeared on the TV. It now pulls from the skate-sessions endpoint and respects the screen's selected calendar(s) and "days to show" setting. `/api/skate-sessions` accepts an optional `from` date parameter so the preview date bar keeps working

## [1.12.0] — 2026-07-05

### Fixed
- **New calendars sync immediately** — adding a calendar now triggers a first sync in the background and starts its poll cycle; previously new calendars were never polled until a server restart or a global Refresh Calendar
- **Poll interval changes apply immediately** — editing a calendar's poll interval or URL reschedules its polling right away instead of after the next scheduled fire
- **Deleting a calendar fully cleans up** — its games are removed (so they can't linger invisibly or resurface on skate screens), its poll timer is cancelled, and an in-flight sync for a just-deleted calendar aborts instead of re-importing games
- **In-progress public skate sessions stay on screen** — sessions are now shown until they end instead of disappearing the moment they start (both the API and the TV page)
- **Password change logs out old sessions** — the JWT signing secret is rotated on password change (and on first-run setup after a reset), so previously issued admin tokens stop working immediately
- **Pickup events keep their full title** — "Practice"/"Scrimmage"/"League Pickup"/"Stick & Shoot" events with a colon in the title (e.g. "CON: Practice") no longer get colon-split, matching the documented rule

### Changed
- **NCWHL (Home)/(Away) tags now decide home vs. away** — previously the tags were stripped and ignored, with the calendar's team order setting deciding; the tags now override team order when present (use **Reparse Titles** in the Games tab to apply to existing games)
- **iCal URLs hidden from TVs** — unauthenticated `GET /api/calendars` now returns only id, name, and type; the URL (a Google "secret address" credential) and sync details require an admin token. The calendar debug endpoint now requires auth
- **TV page escapes all displayed text** — event titles, team names, prices, announcements, and the rink name are HTML-escaped before rendering, so a stray `<` in a calendar event title can no longer blank or script a TV
- **Upload hardening** — uploaded images must have a MIME type matching their extension, and `/uploads` is served with `nosniff` and a CSP header that neutralizes scripts in SVG files opened directly

## [1.11.1] — 2026-07-04

### Fixed
- **Settings endpoint no longer leaks secrets** — unauthenticated `GET /api/settings` (used by TV displays) now returns only `rink_name` and `logo_filename`; previously it exposed the JWT signing secret and admin password hash to anyone on the network. Authenticated admin requests get all settings except those two secrets, and `PATCH /api/settings` refuses to overwrite them
- **Database writes are now atomic with automatic backup** — `db.json` is written via temp-file-and-rename so a crash or power loss mid-write can never truncate it; the previous state is kept as `db.json.bak`. If `db.json` is ever corrupt, the server recovers from the backup (preserving the bad file as `db.json.corrupt`) instead of silently resetting all data to defaults
- **WebSocket errors no longer crash the server** — socket errors (e.g. a TV dropping off Wi-Fi mid-frame) were unhandled `'error'` events that killed the Node process; they are now caught and logged, and heartbeat pings are only sent to open sockets

## [1.11.0] — 2026-07-04

### Added
- **Automated test suite** — Vitest + Supertest; 53 tests covering calendar title parsing (colon/vs/pickup/NCWHL rules), locker room auto-assignment (sequence cycling, blocks, conflicts, manual preservation, reset), the JSON store, and the REST API (auth setup/login/token checks, screens, displays, calendars, games, locker rooms, pricing). Run with `npm test` (or `npm run test:watch` during development)

### Changed
- **Data directory override** — the JSON store honors a `RINKSCREENS_DATA_DIR` environment variable so tests run against a temp directory and never touch the real `data/db.json`; production behavior is unchanged

## [1.10.0] — 2026-07-04

### Added
- **Calendar sync status** — Settings → Calendars now shows a "Last Sync" column per calendar: green ✓ with time-ago and event count on success, red ✗ with the error message on failure, or "Never synced" if it hasn't run yet
- **Public Skate: days to show** — public skate screens have a "Days to show" setting (1–14 days) controlling how far ahead upcoming sessions are listed on the TV

### Changed
- **Pricing moved to Settings** — admission pricing management moved out of the Public Skate tab into a dedicated Settings → Pricing sub-tab; description generalized since pricing applies to public skate and other rink events. Public Skate tab now shows only its screens section and upcoming sessions list
- **Calendar URL validation removed** — adding or editing a calendar no longer pre-fetches and validates the iCal URL (Google and some providers return non-iCal responses to server requests, causing false rejections); the URL is saved immediately and any real fetch problem surfaces in the sync status column on the first sync. Duplicate name and duplicate URL checks remain

## [1.9.0] — 2026-07-04

### Added
- **Settings sub-tabs** — Settings page now has sub-tabs: General, Calendars, Locker Rooms (includes sequences), Displays, and Admin; Calendars tab merged in from its own top-level tab
- **Available Screens section in Displays tab** — shows all visible screens as thumbnails below the assigned displays, with type label and which display (if any) is using each screen
- **Screen visibility toggle (eye icon)** — eye icon on every screen card toggles whether the screen appears in Available Screens; blocked with helper text when the screen is currently assigned to a display
- **Custom tab** — new tab for creating screens from any combination of calendars across all types (hockey, rink events, figure skating, public skate); TV renders a time-sorted unified schedule for the day
- **Figure Skating: two-column layout** — optional two-column display fitting up to 12 rows per column (24 events per page)
- **Figure Skating: overflow rotate mode** — when events exceed one page, the TV automatically cycles through pages at a configurable interval (seconds)
- **Figure Skating: overflow flow mode** — shows only upcoming events from the current time onward; past events drop off automatically; reloads every 5 minutes instead of 60 seconds
- **Figure Skating: time consolidation** — events sharing the same start minute are grouped; the time label appears once and all groups are listed beneath it
- **Preview date bar** — floating overlay on all preview links (opened with `?preview`) showing ← prev / date picker / → next / Today buttons; changing the date rerenders the screen in place without a full page reload

### Changed
- **Displays tab** — display registration moved to Settings → Displays sub-tab; Displays tab now focuses on screen assignment and Available Screens
- **Preview links** — all Preview buttons throughout the admin now open with `?preview` so the date navigation bar is always shown

### Fixed
- **figure_skating TV branch missing closing bracket** — a missing `});` caused the entire `loadScreen` function to short-circuit, leaving all displays blank after the figure skating refactor

## [1.8.0] — 2026-07-04

### Added
- **Displays management in Settings** — register physical TV devices (name + IP) in the Settings tab; full add/edit/delete with duplicate name and IP validation
- **Displays tab** — Screens tab renamed to Displays; add form removed from tab (displays registered in Settings only)
- **Conflict dates in auto-assign warning** — locker room conflict alert now lists the specific dates affected (e.g. "conflicts detected on: Wed Jul 2, Sun Jul 12") instead of just the count

### Fixed
- **Locker auto-assign excludes non-hockey calendars** — figure skating and rink events calendars no longer consume pair indices or receive locker assignments; only `hockey_games` type calendars participate
- **Pair index carries forward across blocks** — when a new 150-minute block starts, the pair index continues from where the previous block left off so the same pair is never assigned twice in a row across a block boundary
- **Blackstars / per-calendar locker order** — removed calendar-change pair-index reset that was causing conflicts when multiple hockey leagues share the same day; sequence now flows continuously within and across blocks

## [1.7.0] — 2026-07-01

### Added
- **Figure Skating calendar type** — new calendar type with its own admin tab showing events grouped by day and week pagination; recurring events expanded via `ical-expander` (RRULE support)
- **Figure Skating TV display type** — new screen display showing today's figure skating events in table format
- **Game delete button** — red trashcan icon (🗑) on each game row in the Games tab
- **Default locker sequence setting** — Settings tab now shows a "Set Default" button per sequence; the selected sequence is used as the auto-assign fallback when no league- or calendar-level sequence is configured
- **Per-calendar locker sequence** — hockey games calendar edit modal now includes a Locker Room Sequence dropdown; setting it here also syncs to the matching league and vice versa (one source of truth)
- **Poll interval unit toggle** — calendar poll interval field now has a Minutes / Days toggle alongside the number input (same pill-style as the Home/Away toggle); table column shows `5m` or `1d` etc.

### Changed
- **Locker sequence sync** — setting the sequence in the Leagues tab now propagates to the matching hockey calendar and vice versa; `GET /calendars` falls back to the league's sequence for the modal display
- **Games tab** — server now filters to only return hockey_games calendar events (freestyle/figure skating events excluded)
- **Auto-assign reset** — now clears all locker assignments for the scope (not just `lr_auto_assigned=1` ones) to handle games imported before the flag was added

### Fixed
- **Stick & Shoot parsing** — `Stick&Shoot` (no spaces) now parsed the same as practices; title normalized to `Stick & Shoot` on import
- **Blank event titles** — events with no title now import with an empty string instead of `(No title)`
- **ical-expander TypeError** — fixed `Cannot read properties of undefined (reading 'uid')` when resyncing figure skating calendars
- **Location filter** — San Mateo location filter now only applies to hockey_games calendars (was incorrectly excluding figure skating events)
- **Background upload auth** — upload request now includes `Authorization: Bearer` header

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
