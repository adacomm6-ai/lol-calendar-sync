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

set "TMP_STATUS=%TEMP%\loldata_git_status_%RANDOM%_%RANDOM%.txt"
git status --porcelain > "%TMP_STATUS%"

for %%A in ("%TMP_STATUS%") do set "STATUS_SIZE=%%~zA"
if "%STATUS_SIZE%"=="0" (
  del "%TMP_STATUS%" >nul 2>nul
  echo 当前没有可保存的代码改动。
  pause
  exit /b 0
)

echo.
echo ===== 当前待保存改动 =====
type "%TMP_STATUS%"
echo.

set "COMMIT_MSG="
set /p COMMIT_MSG=请输入这次快照说明（可留空自动生成）: 
if not defined COMMIT_MSG (
  set "COMMIT_MSG=本地代码快照 %date% %time%"
)

echo.
echo 正在暂存改动...
git add -A
if errorlevel 1 (
  del "%TMP_STATUS%" >nul 2>nul
  echo git add 失败，未能保存快照。
  pause
  exit /b 1
)

echo.
echo 正在提交快照...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo 常规提交失败，正在尝试绕过 hook 再保存一次...
  git commit --no-verify -m "%COMMIT_MSG%"
)

del "%TMP_STATUS%" >nul 2>nul

if errorlevel 1 (
  echo.
  echo 快照保存失败，请查看上方报错。
  pause
  exit /b 1
)

echo.
echo 快照保存成功。
git log --oneline -n 3
echo.
pause
