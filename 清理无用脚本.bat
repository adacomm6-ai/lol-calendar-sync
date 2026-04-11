@echo off
chcp 65001 >nul
echo 正在启动智能脚本归档...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0archive_orphans.ps1"
pause
