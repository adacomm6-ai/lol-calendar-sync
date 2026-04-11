@echo off
setlocal

echo ==========================================
echo     LOL Data System - Cloud One-Click
echo ==========================================
echo.

echo [INFO] Using CLOUD_DATABASE_URL / CLOUD_DIRECT_URL / DIRECT_URL from .env
call npm run deploy:cloud:oneclick
if errorlevel 1 (
  echo.
  echo [FAIL] Cloud one-click flow failed.
  pause
  exit /b 1
)

echo.
echo [OK] Cloud one-click flow completed.
pause
