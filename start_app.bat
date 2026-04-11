@echo off
echo ==================================================
echo       LOL Data System - One-Click Launcher
echo ==================================================
echo.

echo [1/3] Starting Backend Server (Python API)...
start "LOL Backend (Port 8000)" cmd /k "cd backend && python api.py"

echo [2/3] Starting Frontend Server (Next.js)...
start "LOL Frontend (Port 3000)" cmd /k "npm run dev -- --webpack -H 0.0.0.0"

echo [3/3] Waiting for services to initialize...
timeout /t 5 >nul

echo.
echo Launching Browser...
start http://localhost:3000

echo.
echo Done! Minimize this window but do not close the server windows.
pause
