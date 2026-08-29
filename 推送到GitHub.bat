@echo off
cd /d "%~dp0"
echo.
echo [Freight Radar] Pushing to GitHub...
echo First time: a browser window will open. Please login to GitHub and authorize.
echo.
git push -u origin main
echo.
echo Done! If you see red errors above, screenshot them and send to me.
echo.
pause
