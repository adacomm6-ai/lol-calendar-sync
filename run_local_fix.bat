
@echo off
echo ==========================================
echo      LolData System - Local Roster Fix
echo ==========================================
echo.

echo 1. Ensuring Local SQLite Configuration...
call node scripts/switch_db_provider.js sqlite

echo.
echo 2. Regenerating Prisma Client (Clean Build)...
call npx prisma generate

echo.
echo 3. Running UNIVERSAL Roster Sync Script...
call node scripts/universal_roster_sync.js

echo.
echo ==========================================
echo Fix Complete! 
echo Please restart your 'npm run dev' output to see changes in the dashboard.
echo ==========================================
pause
