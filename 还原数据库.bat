@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════╗
     ║    LOL Data System — 还原数据库          ║
     ║    Database Restore Workflow              ║
     ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未找到 PowerShell，请确认系统支持 PowerShell 5.0+
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoLogo -File "%~dp0restore_db.ps1"
