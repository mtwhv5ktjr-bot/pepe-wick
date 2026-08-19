@echo off
title LAUNCH WICK DUEL
rem Double-click to deploy the WickDuel wager escrow (bet $WICK head-to-head in WICK SHOOTER).
rem Asks for your private key privately (never shown, never saved, never in history).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-launch-duel.ps1"
