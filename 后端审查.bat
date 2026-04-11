@echo off
chcp 65001 >nul
echo ===========================================
echo   LOL Data System - Python 后端代码审查 (Ruff)
echo ===========================================
echo.

cd /d "%~dp0"

:: 检查是否安装 ruff
pip show ruff >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [首次运行] 正在安装极速静态扫描器 Ruff...
    pip install ruff
)

echo 正在检查 backend/ 目录...
echo.
ruff check backend/ 

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] 完美！后端代码规范全部达标。
) else (
    echo.
    echo [WARN] 发现潜在的 Python 语法错误、未引用的变量或规范问题。
    echo 提示: 很多问题可以自动修复。如果要自动格式化，请在终端执行: ruff check --fix backend/
)

echo.
pause
