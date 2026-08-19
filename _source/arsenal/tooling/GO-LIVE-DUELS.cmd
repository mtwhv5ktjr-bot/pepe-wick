@echo off
title WICK DUEL - go live
cd /d "%~dp0"
set "PATH=C:\Users\Bia\NEWFOL~1\pangle-agent\node\node-v24.17.0-win-x64;%PATH%"
echo.
echo   ============================================
echo     WICK DUEL - bring the referee online
echo   ============================================
echo.
echo   You need a GitHub token with:
echo     repository   mtwhv5ktjr-bot/wick-board
echo     permission   Contents: Read and write
echo.
choice /c YN /n /m "  Open the GitHub token page now? [Y/N] "
if errorlevel 2 goto :run
start "" "https://github.com/settings/personal-access-tokens/new"
echo.
echo   Make the token, copy it, then come back here.
echo.
pause
:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-duels-live.ps1"
echo.
pause
