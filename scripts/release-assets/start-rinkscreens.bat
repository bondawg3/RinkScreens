@echo off
REM Starts the RinkScreens server. Double-click this file to run it.
REM Leave this window open while the system is in use - closing it stops the server.
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencies not found - this should not happen in a packaged release.
  echo Try re-running the installer, or contact support.
  pause
  exit /b 1
)

echo Starting RinkScreens...
echo Admin panel:  http://localhost:3001/admin
echo (TVs on the same network connect to this PC's IP address on port 3001)
echo.
echo Press Ctrl+C to stop the server.
echo.

node server\index.js
pause
