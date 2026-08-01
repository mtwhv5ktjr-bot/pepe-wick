@echo off
title START MINT - WICK ARSENAL
rem Double-click this file to launch the mint.
rem It asks for your private key privately (nothing appears as you paste, and it
rem is never saved to disk, never printed, and never put in command history).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-start-mint.ps1"
