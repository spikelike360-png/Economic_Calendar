@echo off
title Economic Calendar - Dev Server
cd /d "e:\Economic_Calendar"

:: Check if server already running on port 3000
netstat -an | find "127.0.0.1:3000" | find "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Server already running, opening app...
  goto :open
)

echo Starting dev server...
start "Economic Calendar Server" cmd /k "npm run dev"

echo Waiting for server to be ready...
:waitloop
timeout /t 2 /nobreak >nul
netstat -an | find "127.0.0.1:3000" | find "LISTENING" >nul 2>&1
if %errorlevel%==1 goto :waitloop

:: Small extra pause for Next.js to finish compiling first page
timeout /t 2 /nobreak >nul

:open
echo Opening dashboard...
start msedge --app=http://localhost:3000 --window-size=1400,900 2>nul
if errorlevel 1 (
  start chrome --app=http://localhost:3000 --window-size=1400,900 2>nul
)
