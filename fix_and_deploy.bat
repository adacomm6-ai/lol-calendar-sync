@echo off
echo ==========================================
echo       LolData System - Git Fixer
echo ==========================================
echo.
echo Detected Large File Error (GitHub Limit 100MB).
echo We need to ignore the .zip backup file and try again.
echo.

echo 1. Cleaning up old Git history...
start /wait cmd /c "rmdir /s /q .git & exit 0"
if exist .git (
    echo [WARNING] Failed to delete .git folder automatically.
    echo Please manually delete the hidden .git folder in this directory.
    pause
)

echo.
echo 2. Updating .gitignore...
echo. >> .gitignore
echo # Ignore Backup Files >> .gitignore
echo *.zip >> .gitignore
echo *.rar >> .gitignore
echo *.7z >> .gitignore
echo.
echo Added *.zip to .gitignore

echo.
echo 3. Restarting Deployment...
echo.
call deploy_git.bat
