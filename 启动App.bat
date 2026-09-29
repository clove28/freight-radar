@echo off
cd /d "%~dp0"
echo.
echo  [Freight Radar] Starting app...
echo  Keep this window OPEN while using the app.
echo  After about 5 seconds, open your browser and go to:
echo.
echo      http://localhost:3000
echo.
npx tsx --env-file=.env src/server/index.ts
echo.
echo  App stopped. Press any key to close.
pause
