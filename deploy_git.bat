@echo off
echo ==========================================
echo       LolData System - Git Deploy V2
echo ==========================================
echo.
echo *** FIRST TIME SETUP ***
echo We need to configure your Git Identity (Email and Name).
echo You only need to do this once.
echo.

set /p email="Enter your Email (e.g. user@gmail.com): "
set /p name="Enter your Name (e.g. Max): "

echo.
echo Configuring Git...
call git config --global user.email "%email%"
call git config --global user.name "%name%"

echo.
echo ==========================================
echo       Starting Deployment...
echo ==========================================

echo.
echo 1. Initializing Git...
call git init

echo.
echo 2. Adding files...
call git add .

echo.
echo 3. Committing...
call git commit -m "Deploy Redesigned Odds Module"

echo.
echo 4. Setting Branch...
call git branch -M main

echo.
echo 5. Setting Remote...
call git remote remove origin 2>nul
call git remote add origin https://github.com/664971425-max/lol-data-system.git

echo.
echo ==========================================
echo READY TO PUSH!
echo.
echo Please login to GitHub if prompted.
echo.
echo Press any key to push...
pause

call git push -u origin main --force

echo.
echo Done!
pause
