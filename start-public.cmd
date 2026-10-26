@echo off
chcp 65001 >nul
title 货运雷达 - 公网演示（临时链接）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public.ps1"
echo.
echo 脚本已结束，按任意键关闭窗口...
pause >nul
