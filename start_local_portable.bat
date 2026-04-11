@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
title LoL Data System - BP Local Portable Start

rem Try common Node.js install paths first
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"

rem Portable entry now uses the safer local startup path by default.
call "%~dp0start_local_safe.bat"
exit /b %errorlevel%
