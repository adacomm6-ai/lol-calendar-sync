@echo off
echo Starting Player Sync Process...
echo Scanning matches for new players...
node scripts/scan_and_sync_players.js
echo.
echo Sync Complete. Press any key to exit.
pause >nul
