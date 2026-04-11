@echo off
chcp 65001 >nul
echo ===========================================
echo   LOL Data System - 更新前端 UI 视觉快照基准
echo ===========================================
echo.
echo 警告：执行此操作将把本次测试期间页面的最新 UI 排版作为以后的“绝对基准”。
echo 只有当您通过“前端审查.bat”生成的 HTML 报告中确认了：
echo 【所有的红色差异部分都是您期望的合理改动】
echo 此时，您才应该按任意键继续提取新基准！
echo -------------------------------------------
pause

cd /d "%~dp0"
echo.
echo 正在运行框架并截取新的 UI 基准图片...
call npx playwright test --update-snapshots

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] 视觉基准（黄金快照）已成功更新！未来的测试将依据此版 UI 进行对比。
) else (
    echo.
    echo [FAIL] 更新失败，可能存在逻辑运行错误（不仅仅是视觉差异），请排查代码。
)
echo.
pause
