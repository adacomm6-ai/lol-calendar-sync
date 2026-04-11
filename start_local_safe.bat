@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
title LoL Data System - BP Local Start (Hidden)

set "APP_DB_TARGET=local"
set "DATABASE_URL=file:./prisma/dev.db"
set "LOCAL_URL=http://localhost:3000"
set "LOG_DIR=%CD%\logs"
set "DEV_LOG=%LOG_DIR%\dev-local.log"
set "DEV_ERR=%LOG_DIR%\dev-local.err.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo ==========================================
echo   LoL Data System - Local Hidden Start
echo ==========================================
echo APP_DB_TARGET=%APP_DB_TARGET%
echo DATABASE_URL=%DATABASE_URL%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js is not installed or not in PATH.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [FAIL] npm is not installed or not in PATH.
  exit /b 1
)

for /f "delims=" %%I in ('node -v') do set "NODE_VER=%%I"
for /f "delims=" %%I in ('npm -v') do set "NPM_VER=%%I"

echo [INFO] Node: !NODE_VER!
echo [INFO] npm: !NPM_VER!
echo.

if not exist "node_modules" (
  echo [INFO] node_modules not found, installing dependencies...
  call npm.cmd install --prefer-offline --no-audit --no-fund
  if errorlevel 1 (
    echo [FAIL] npm install failed. Please check network or permissions.
    exit /b 1
  )
)

echo [INFO] Running TypeScript syntax check...
call npm.cmd exec -- tsc --noEmit --pretty false
if errorlevel 1 (
  echo [FAIL] TypeScript syntax check failed. Please fix source errors first.
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  if not "%%P"=="0" (
    echo [INFO] Port 3000 is occupied by PID %%P, killing...
    taskkill /PID %%P /F >nul 2>nul
  )
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  if not "%%P"=="0" (
    echo [INFO] Port 3001 is occupied by PID %%P, killing...
    taskkill /PID %%P /F >nul 2>nul
  )
)

if exist ".next\dev\lock" (
  echo [INFO] Found .next\dev\lock, removing...
  del /f /q ".next\dev\lock" >nul 2>nul
)

set "NODE_EXE="
for /f "delims=" %%I in ('where.exe node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE (
  echo [FAIL] Could not resolve node.exe path.
  exit /b 1
)

echo [INFO] Starting local dev pipeline in hidden mode...
set "WD=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; if (Test-Path Env:PATH) { Remove-Item Env:PATH -ErrorAction SilentlyContinue }; $wd=$env:WD; $node=$env:NODE_EXE; $out=$env:DEV_LOG; $err=$env:DEV_ERR; if(Test-Path $out){ Remove-Item $out -Force -ErrorAction SilentlyContinue }; if(Test-Path $err){ Remove-Item $err -Force -ErrorAction SilentlyContinue }; $p=Start-Process -WindowStyle Hidden -FilePath $node -ArgumentList @('scripts/dev-local.js') -WorkingDirectory $wd -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path (Join-Path $wd '.local-dev.pid') -Value $p.Id -Encoding ascii"
if errorlevel 1 (
  echo [FAIL] Failed to send hidden startup command.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=3000; $deadline=(Get-Date).AddSeconds(120); while((Get-Date) -lt $deadline){ if (netstat -ano | Select-String -Pattern (':'+$port+'\s+.*LISTENING')) { exit 0 }; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo [FAIL] Port 3000 did not become ready in 120s.
  echo [INFO] Last stderr logs:
  if exist "%DEV_ERR%" powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path $env:DEV_ERR -Tail 60"
  echo [INFO] Last stdout logs:
  if exist "%DEV_LOG%" powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path $env:DEV_LOG -Tail 60"
  exit /b 1
)

echo [OK] LoLData is listening on 3000.

if /I not "%NO_OPEN_BROWSER%"=="1" (
  start "" "%LOCAL_URL%"
)

echo.
echo [DONE] Hidden startup completed.
exit /b 0
