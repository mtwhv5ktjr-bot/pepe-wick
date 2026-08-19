@echo off
title Add LB_GH_TOKEN
cd /d "%~dp0"
set "PATH=C:\Users\Bia\NEWFOL~1\pangle-agent\node\node-v24.17.0-win-x64;%PATH%"
echo.
echo   ================================================
echo     Add the GitHub token to Vercel
echo   ================================================
echo.
echo   The Vercel CLI will ask for the VALUE.
echo   Paste the token there and press Enter.
echo.
echo   (Right-click pastes in this window. The text may
echo    not appear as you paste - that is normal.)
echo.
npx --yes vercel env add LB_GH_TOKEN production
echo.
echo   ------------------------------------------------
echo   If it said "Added" or "Created", you are done.
echo   Tell Claude and it will deploy and verify.
echo   ------------------------------------------------
echo.
pause
