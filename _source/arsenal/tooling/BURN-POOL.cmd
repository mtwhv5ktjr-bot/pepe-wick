@echo off
title BURN POOLED PLS - WICK ARSENAL
rem Double-click to buy $WICK with the PLS pooled in the contracts and burn it.
rem Asks for a wallet key privately (never shown, never saved, never in history).
rem That wallet only pays gas - it cannot receive any of the pooled PLS.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helper-burn-pool.ps1"
