@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"

echo ==========================================
echo   LoL Data System - Local Production Mode
echo ==========================================
echo [INFO] Starting local production mode...
call npm.cmd run prod:local
set "EC=%errorlevel%"
echo.
if "%EC%"=="0" (
  echo [DONE] Local production mode stopped.
) else (
  echo [FAIL] Local production mode exited with code %EC%.
)
pause
exit /b %EC%
