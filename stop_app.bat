@echo off
echo ==================================================
echo          Stopping LOL Data System
echo ==================================================
echo.

echo Killing Python processes (Backend)...
taskkill /F /IM python.exe /T 2>nul

echo Killing Node.js processes (Frontend)...
taskkill /F /IM node.exe /T 2>nul

echo.
echo ==================================================
echo Done. Old servers have been closed.
echo You can now run 'start_app.bat' again.
echo ==================================================
pause
