@echo off
title REVEAL GUNS - WICK ARSENAL
rem Double-click this file to reveal every gun so holders can use them in-game.
rem It briefly closes the mint, reveals, then REOPENS the mint so the sale continues.
rem Asks for your private key privately (never shown, never saved, never in history).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-reveal-guns.ps1"
