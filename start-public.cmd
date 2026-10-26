@echo off
rem Keep this file ASCII-only. cmd.exe parses batch files in the OEM codepage,
rem and non-ASCII bytes here break the following lines: verified that Chinese
rem text truncated the powershell argument list into "'tionPolicy' is not
rem recognized". All Chinese output lives in start-public.ps1 (UTF-8 with BOM).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "start-public.ps1"
echo.
pause
