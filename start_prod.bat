@echo off
echo ===========================================
echo   Starting LolData System - PRODUCTION
echo ===========================================
echo.
echo Mode: Production (Optimized, High Performance)
echo Step 1: Building Application...
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Please check errors above.
    pause
    exit /b %errorlevel%
)
echo.
echo [SUCCESS] Build complete.
echo.
echo Step 2: Starting Server...
echo URL:  http://localhost:3001
echo.
npm start -- -p 3001
pause
