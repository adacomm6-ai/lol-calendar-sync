@echo off
cd /d "%~dp0"
npm.cmd run dev:local > recovery-dev.out.log 2> recovery-dev.err.log
