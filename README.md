# RinkScreens

Digital signage system for ice rinks. Pulls events from a public Google Calendar and displays them on smart TVs around the facility via a local web server. An admin dashboard lets staff control what each screen shows in real time.

## Features

- **Game Board display** — shows upcoming game time, home/away teams, and assigned locker rooms
- **Public Skate display** — lists upcoming public skate sessions with configurable admission pricing
- **Real-time control** — admin changes push instantly to TVs via WebSocket (no refresh needed)
- **Per-screen settings** — each TV can show a different display type and background image
- **Google Calendar sync** — events pulled automatically every 5 minutes from a public iCal URL
- **Background images** — upload JPG/PNG images; assign one per screen
- **Custom message mode** — display a simple text message on any screen

## Architecture

```
Express server (port 3001)
  ├── REST API  (/api/*)
  ├── WebSocket  (real-time push to TVs)
  ├── File uploads  (/uploads/*)
  └── Serves React SPA  (client/dist/)

Data stored in: data/db.json  (JSON flat-file, no native dependencies)
Uploads stored in: uploads/
```

## Requirements

- Node.js v18 or later
- All TVs and the server PC must be on the same Wi-Fi network
- Google Calendar must be set to **public** (or use the Secret iCal address)

## Installation

```bash
# Clone / copy the project to the server PC
cd C:\Exocomps\RinkScreens

# Install dependencies
npm install

# Build the React client
npm run build

# Start the server
node server/index.js
```

The server listens on `http://0.0.0.0:3001`.

## Development

```bash
npm run dev
```

Starts the Express server (`node --watch`) and Vite dev server concurrently. The Vite dev server proxies `/api` and `/uploads` to port 3001.

## Usage

### Admin dashboard

Open `http://[server-ip]:3001/admin` in any browser on the network.

| Tab | Purpose |
|-----|---------|
| **Screens** | Register TVs (name + IP), assign display type and background, click **Preview** to open the display URL |
| **Games** | View calendar-synced events; assign home/away team names and locker room numbers per game |
| **Public Skate** | Configure admission pricing tiers (label + price) shown on the Public Skate display |
| **Backgrounds** | Upload background images (JPG/PNG/GIF/WebP, max 20 MB) |
| **Settings** | Set rink name, Google Calendar iCal URL, public-skate keyword filter, poll interval |

### Connecting a TV

1. Add the screen in **Admin → Screens** (give it a name and the TV's IP).
2. On the TV, open the browser and navigate to:
   ```
   http://[server-ip]:3001/display/[screen-id]
   ```
   The screen ID is the number shown in the Screens table.
3. The TV connects via WebSocket and updates automatically whenever the admin changes its configuration.

### Google Calendar setup

1. Open Google Calendar → calendar settings → **Integrate calendar**.
2. Copy the **Secret address in iCal format** (or the public iCal URL if the calendar is public).
3. Paste it into **Admin → Settings → Google Calendar iCal URL** and save.
4. Click **Refresh Calendar** in the Games tab to pull events immediately.

Events whose titles contain the **Public Skate Keyword** (default: `Public Skate`) are shown on the Public Skate display; all other future events appear on the Game Board.

## Project Structure

```
RinkScreens/
  server/
    index.js          Express + WebSocket entry point
    db.js             JSON flat-file data store
    calendar.js       iCal polling and sync
    ws.js             WebSocket manager
    routes/
      api.js          REST endpoints
      upload.js       Background image upload
  client/
    src/
      App.jsx         React Router setup
      pages/
        Display.jsx         TV display page
        views/
          GameBoard.jsx     Game Board display view
          PublicSkate.jsx   Public Skate display view
        admin/              Admin dashboard tabs
      hooks/
        useApi.js           Fetch hook
        useWebSocket.js     WebSocket hook
  uploads/            Uploaded background images (gitignored)
  data/               db.json runtime data (gitignored)
  .claude/            Claude Code config
```

## WebSocket Protocol

The server pushes JSON messages to connected TV browsers:

| Message | Meaning |
|---------|---------|
| `{ "type": "reload" }` | Screen config changed — TV re-fetches its settings |
| `{ "type": "refresh_data" }` | New calendar data — TV re-fetches event data |
| `{ "type": "ping" }` | Heartbeat — TV responds with `{ "type": "pong" }` |

TVs auto-reconnect every 3 seconds if the connection drops.

## Running at Windows Startup

To start RinkScreens automatically when the server PC boots, create a scheduled task:

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "server/index.js" -WorkingDirectory "C:\Exocomps\RinkScreens"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "RinkScreens" -Action $action -Trigger $trigger -RunLevel Highest
```
