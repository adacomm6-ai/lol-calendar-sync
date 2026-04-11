@echo off
echo ==========================================
echo          Quick Git Push
echo ==========================================
echo.

:: Get Commit Message
set /p msg="Enter Commit Message (default: Update): "
if "%msg%"=="" set msg=Update

echo.
echo 1. Adding files...
call git add .

echo.
echo 2. Committing...
call git commit -m "%msg%"

echo.
echo 3. Pushing...
call git push

echo.
echo Done!
pause
