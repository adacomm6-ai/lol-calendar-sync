@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\oneclick-local-prod.ps1"
set "EC=%errorlevel%"
if not "%EC%"=="0" (
  echo [FAIL] oneclick_local.bat failed with exit code %EC%.
  echo [HINT] Check logs\prod-local.log and logs\prod-local.err.log.
  pause
)
exit /b %EC%
