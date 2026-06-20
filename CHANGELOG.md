# Changelog

All notable changes to RinkScreens are documented here.

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
