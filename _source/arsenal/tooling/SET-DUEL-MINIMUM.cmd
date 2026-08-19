@echo off
title WICK DUEL - set the minimum stake
cd /d "%~dp0"
set "PATH=C:\Users\Bia\NEWFOL~1\pangle-agent\node\node-v24.17.0-win-x64;%PATH%"
echo.
echo   ================================================
echo     WICK DUEL - set the minimum stake
echo   ================================================
echo.
echo   Lowering the floor to $1 makes the $1, $5 and $10
echo   tiers appear in the lobby. Nothing else changes.
echo.
set /p DOLLARS=  New minimum in dollars [1]: 
if "%DOLLARS%"=="" set DOLLARS=1
echo.
echo   This sends ONE transaction from the owner wallet.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-set-min.ps1" %DOLLARS%
echo.
pause
