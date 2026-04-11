@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo 未找到 git，请先安装 Git。
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo 当前目录不是 Git 仓库。
  pause
  exit /b 1
)

echo.
echo ===== 当前分支与改动状态 =====
git status --short --branch

echo.
echo ===== 最近 10 条提交 =====
git log --oneline -n 10

echo.
pause
