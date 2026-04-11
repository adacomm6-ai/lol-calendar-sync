@echo off
echo ===========================================
echo   Starting LolData System - DEVELOPMENT
echo ===========================================
echo.
echo Mode: Development (Hot Reloading Enabled)
echo URL:  http://localhost:3000
echo.
cd /d "%~dp0"
echo Launching...
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server crashed or failed to start.
)
pause
