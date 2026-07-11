@echo off
REM Optional: makes RinkScreens start automatically (hidden, no console window)
REM whenever this PC logs in, so a reboot doesn't require someone to manually
REM double-click start-rinkscreens.bat. Safe to run more than once.
cd /d "%~dp0"

echo This will make RinkScreens start automatically when this PC logs in.
echo (You can undo this later with uninstall-autostart.bat)
pause

schtasks /Create /TN "RinkScreens" /TR "wscript.exe \"%~dp0run-hidden.vbs\"" /SC ONLOGON /RL LIMITED /F

if %ERRORLEVEL% EQU 0 (
  echo.
  echo Done. RinkScreens will start automatically on next login.
  echo To start it right now without rebooting, double-click start-rinkscreens.bat.
) else (
  echo.
  echo Something went wrong creating the scheduled task. You can still start
  echo RinkScreens manually with start-rinkscreens.bat.
)
pause
