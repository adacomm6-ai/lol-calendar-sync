@echo off
echo ==========================================
echo      LOL Data System - Database Fix
echo ==========================================
echo.
echo Please ensure you have CLOSED the running server windows 
echo (Frontend and Backend) before proceeding.
echo.
pause
echo.

echo [1/2] Syncing Database Schema...
call cmd /c "npx prisma db push"

echo [2/2] Regenerating Prisma Client...
call cmd /c "npx prisma generate"

echo.
echo Fix Complete! You can now run start_app.bat again.
pause
