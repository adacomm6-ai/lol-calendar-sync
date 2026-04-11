@echo off
setlocal
cd /d %~dp0

echo ==========================================
echo   正在准备导出 Supabase 数据...
echo ==========================================
echo.

node scripts/export-supabase-all.js

echo.
echo 已完成所有表的导出操作。
pause
