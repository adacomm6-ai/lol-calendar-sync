@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "PROJECT_A=%~dp0"
set "PROJECT_B=D:\BP"

set "A_SCRIPT=%PROJECT_A%start_local_safe.bat"
set "B_SCRIPT=%PROJECT_B%\one-click-open.bat"

echo ==========================================
echo   Start Two Projects (Hidden Mode)
echo ==========================================
echo Project A: %PROJECT_A%
echo Project B: %PROJECT_B%
echo.

if not exist "%A_SCRIPT%" (
  echo [FAIL] Missing script: %A_SCRIPT%
  exit /b 1
)

if not exist "%B_SCRIPT%" (
  echo [FAIL] Missing script: %B_SCRIPT%
  echo        Please check BP project path.
  exit /b 1
)

echo [INFO] Starting Project A (LoLData) in hidden mode...
set "NO_OPEN_BROWSER=1"
call "%A_SCRIPT%"
set "NO_OPEN_BROWSER="
if errorlevel 1 (
  echo [FAIL] Project A failed to start. Stop here.
  exit /b 1
)

echo [INFO] Starting Project B (BP) in hidden mode...
call "%B_SCRIPT%"
if errorlevel 1 (
  echo [WARN] Project B startup returned error.
)

call :wait_port_ps 5173 90
if errorlevel 1 (
  echo [WARN] BP frontend port 5173 not ready in 90s.
) else (
  echo [OK] BP frontend is listening on 5173.
)

echo [INFO] Opening project pages...
start "" "http://localhost:3000"
start "" "http://127.0.0.1:5173"

echo.
echo [DONE] Dual project hidden-mode startup completed.
exit /b 0

:wait_port_ps
set "TARGET_PORT=%~1"
set "TIMEOUT_SEC=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=%TARGET_PORT%; $deadline=(Get-Date).AddSeconds(%TIMEOUT_SEC%); while((Get-Date) -lt $deadline){ if (netstat -ano | Select-String -Pattern (':'+$port+'\s+.*LISTENING')) { exit 0 }; Start-Sleep -Seconds 2 }; exit 1"
exit /b %errorlevel%
