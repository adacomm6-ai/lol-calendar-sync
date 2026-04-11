@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║    LOL Data System — 备份并发布          ║
echo  ║    Backup ^& Publish Workflow             ║
echo  ╚══════════════════════════════════════════╝
echo.

:: 切换到脚本所在目录（项目根目录）
cd /d "%~dp0"

:: 检查 PowerShell 是否可用
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未找到 PowerShell，请确认系统支持 PowerShell 5.0+
    pause
    exit /b 1
)

:: 以绕过执行策略的方式运行 ps1 脚本
:: NOTE: -ExecutionPolicy Bypass 仅对本次调用有效，不修改系统策略
powershell -ExecutionPolicy Bypass -NoLogo -File "%~dp0backup_and_log.ps1"
