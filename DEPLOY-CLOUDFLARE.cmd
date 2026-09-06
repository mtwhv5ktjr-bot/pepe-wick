@echo off
title Deploy games.wick.pics to Cloudflare Pages
cd /d "%~dp0"
echo.
echo   ================================================
echo     games.wick.pics  ^>  Cloudflare Pages
echo   ================================================
echo.
echo   Deploys the COMMITTED pepe-wick tree - exactly what
echo   GitHub Pages serves - to Cloudflare Pages as a
echo   parallel target. DNS is not touched.
echo.
echo   You will be asked for a Cloudflare API token
echo   (typing is hidden). How to make one is in
echo   ..\tools\cf\README.md
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\cf\deploy.ps1"
echo.
echo   ------------------------------------------------
echo   If it printed LIVE AND VERIFIED, send Tangent the
echo   deployment URL and the CNAME line shown above.
echo   ------------------------------------------------
echo.
pause
