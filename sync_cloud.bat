@echo off
echo ===============================================
echo      LolData System - One-Click Cloud Sync
echo ===============================================
echo.

:: Ask for commit message, default to "Update" + timestamp
set "defaultMsg=Update %date% %time%"
set /p msg="Enter commit message (Press Enter for default): "
if "%msg%"=="" set msg=%defaultMsg%

echo.
echo [1/3] Adding changes...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "%msg%"

echo.
echo [3/3] Pushing to cloud...
git push

echo.
echo ===============================================
if %errorlevel% equ 0 (
    echo                Sync Complete!
) else (
    echo                Sync FAILED!
)
echo ===============================================
pause
