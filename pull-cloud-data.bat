@echo off
setlocal
cd /d %~dp0

echo ==========================================
echo   Pull Cloud Data To Local SQLite (Full)
echo ==========================================
echo.
echo This operation is read-only on cloud and full-replace on local SQLite.
echo A local DB backup will be created automatically.
echo.
pause

call npm run sync:cloud-to-local:full
if errorlevel 1 (
  echo.
  echo [FAIL] Cloud-to-local sync failed.
  pause
  exit /b 1
)

echo.
echo [OK] Cloud-to-local sync completed.
pause
endlocal
