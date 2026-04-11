@echo off
echo ==========================================
echo       LolData System - Force Deploy
echo ==========================================
echo.
echo Detected Remote Conflict / Data Isolation Request.
echo We need to FORCE push the code.
echo.

echo -1. Create Safety Backup...
powershell -ExecutionPolicy Bypass -NoLogo -Command "& { & '%~dp0backup_and_log.ps1' 'Pre-Force-Deploy-Safety' }"

echo 0. Preparing for Cloud (Switching to Postgres)...
call node scripts/switch_db_provider.js postgresql

echo 1. Initializing Git...
start /wait cmd /c "rmdir /s /q .git & exit 0"
if exist .git (
    echo [WARNING] Failed to delete .git folder. Skipping delete.
)
call git init
call git config user.email "664971425@qq.com"
call git config user.name "League Admin"

echo.
echo 2. Adding files...
call git add .

echo.
echo 3. Committing...
call git commit -m "Force Deploy"

echo.
echo 4. Setting Branch...
call git branch -M main

echo.
echo 5. Setting Remote...
call git remote remove origin 2>nul
call git remote add origin https://github.com/664971425-max/lol-data-system.git

echo.
echo ==========================================
echo READY TO PUSH (FORCE)!
echo.
echo Please login to GitHub if prompted.
echo.
echo Press any key to push...
pause

call git push -u origin main --force

echo.
echo 6. Syncing Cloud DB Schema (Prisma)...
echo    This only creates missing tables/columns, does NOT touch existing data.

call node scripts/push_schema.js

call node scripts/switch_db_provider.js sqlite


echo.
echo Done!
pause
