@echo off
title UPGRADE MARKETPLACE - WICK ARSENAL
rem Double-click to deploy the upgraded marketplace (adds tier bids: "any Marksman").
rem Your NFTs are not touched - only the trading venue changes.
rem Asks for your private key privately (never shown, never saved, never in history).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-new-market.ps1"
