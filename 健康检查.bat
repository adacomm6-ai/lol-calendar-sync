@echo off
chcp 65001 >nul
echo.
echo  +==========================================+
echo  ^|  LOL Data System - Health Check          ^|
echo  +==========================================+
echo.

cd /d "%~dp0"

where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] PowerShell not found.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoLogo -File "%~dp0health_check.ps1"
