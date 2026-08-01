@echo off
title LAUNCH WICK BILLBOARDS
rem Double-click to deploy the self-serve in-game billboard contract.
rem Asks for your private key privately (never shown, never saved, never in history).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-launch-billboards.ps1"
