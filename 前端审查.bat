@echo off
chcp 65001 >nul
echo ===========================================
echo   LOL Data System - 前端自动化审查 (E2E)
echo ===========================================
echo.
echo 即将启动 Playwright 测试 (自动挂起本地服务器)...
echo.

:: 确信在项目根目录运行
cd /d "%~dp0"

:: 运行测试
call npx playwright test

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] 审查完成，所有测试通过！
) else (
    echo.
    echo [FAIL] 审查失败，请查看生成的 HTML 报告！
)

echo.
echo 正在打开测试报告...
call npx playwright show-report

pause
