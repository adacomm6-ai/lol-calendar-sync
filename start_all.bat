@echo off
echo ===========================================
echo   Starting LolData System - DUAL MODE
echo ===========================================
echo.
echo Launching Development Server (Port 3000)...
start "LolData DEV (3000)" cmd /k "call start_dev.bat"

echo.
echo Launching Production Server (Port 3001)...
echo This may take a moment to build...
start "LolData PROD (3001)" cmd /k "call start_prod.bat"

echo.
echo [SUCCESS] Both environments are starting in separate windows.
echo Dev URL:  http://localhost:3000
echo Prod URL: http://localhost:3001
echo.
echo You can close this window now.
pause
