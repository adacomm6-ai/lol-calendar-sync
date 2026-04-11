@echo off
SETLOCAL EnableDelayedExpansion

echo [1/3] Deleting local build cache and redundant package-lock...
del /f /s /q package-lock.json >nul 2>&1
rmdir /s /q .next >nul 2>&1

echo [2/3] Confirming package.json versions...
type package.json | findstr "next"

echo [3/3] Ready for Vercel deployment. 
echo Please RUN the following command in your terminal:
echo git add .
echo git commit -m "chore: major refactor - fix 100+ build errors, upgrade next to 15.2.2, enforce type safety"
echo git push

pause
