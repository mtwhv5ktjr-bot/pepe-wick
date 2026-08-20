@echo off
REM Publish games.wick.pics EXACTLY as it stands right now.
REM
REM   ship.cmd                 (commits with a default message)
REM   ship.cmd "add tip jar"   (your own message)
REM
REM Difference from sync.cmd: sync.cmd first RE-COPIES the game, the range, the
REM siege build and re-ports the arsenal app from their source folders, so it
REM ships whatever happens to be sitting in those projects too. This one ships
REM only what is already in this folder — nothing else moves.
setlocal
cd /d "%~dp0"

set MSG=%~1
if "%MSG%"=="" set MSG=update site

echo.
echo These files will go live on https://games.wick.pics
echo ------------------------------------------------------
git status --short
echo ------------------------------------------------------

REM nothing staged and nothing changed = nothing to do
git diff --quiet && git diff --cached --quiet
if %errorlevel%==0 (
  echo.
  echo Nothing has changed — already published.
  exit /b 0
)

git add -A
git commit -m "%MSG%"
if errorlevel 1 ( echo. & echo Commit failed. & exit /b 1 )
git push
if errorlevel 1 (
  echo.
  echo PUSH FAILED. If a browser opened, sign in to GitHub and run ship.cmd again.
  exit /b 1
)

echo.
echo Pushed. https://games.wick.pics updates in about a minute.
echo Hard-refresh with Ctrl+F5 if you still see the old page.
endlocal
