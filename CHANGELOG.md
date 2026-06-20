# Changelog

All notable changes to RinkScreens are documented here.

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
