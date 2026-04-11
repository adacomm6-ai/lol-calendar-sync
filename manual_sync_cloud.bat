@echo off
echo ==========================================
echo       Manual Cloud DB Sync (Timeout Optimized)
echo ==========================================
echo.
echo 1. Switching Schema to PostgreSQL (with 5min timeout)...
call node scripts/switch_db_provider.js postgresql

echo.
echo 2. Pushing Schema to Cloud (Supabase)...
echo    (Using Hardcoded URL in schema.prisma with statement_timeout=300000)
call npx prisma db push --schema prisma/schema.prisma --accept-data-loss

echo.
echo 3. Switching Schema back to SQLite...
call node scripts/switch_db_provider.js sqlite

echo.
echo ==========================================
echo Sync Process Finished.
echo If you see "Your database is now in sync", it worked!
echo Now you can run force_deploy.bat to update the website.
echo ==========================================
pause
