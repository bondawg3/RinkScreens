@echo off
REM Removes the auto-start scheduled task created by install-autostart.bat.
schtasks /Delete /TN "RinkScreens" /F
echo.
echo Auto-start removed. RinkScreens will no longer launch automatically at login.
pause
