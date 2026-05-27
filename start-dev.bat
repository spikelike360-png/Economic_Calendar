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
start "" /b cmd /c "cd /d e:\Economic_Calendar && npm run dev > e:\Economic_Calendar\dev-server.log 2>&1"

echo Waiting for server to be ready...
powershell -Command "while($true){try{$r=Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 2 -EA Stop;if($r.StatusCode -eq 200){break}}catch{Start-Sleep 2}}"

:open
echo Opening dashboard...
start chrome --app=http://localhost:3000 --window-size=1400,900 2>nul
if errorlevel 1 (
  start msedge --app=http://localhost:3000 --window-size=1400,900 2>nul
)
