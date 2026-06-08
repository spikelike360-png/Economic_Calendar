@echo off
echo === Economic Calendar Dashboard ===
echo.

:: Pull latest changes from GitHub
echo Checking for updates...
git fetch origin master --quiet 2>nul

git rev-list HEAD...origin/master --count >tmp_diff.txt 2>nul
set /p COMMITS_BEHIND=<tmp_diff.txt
del tmp_diff.txt 2>nul

if "%COMMITS_BEHIND%"=="" set COMMITS_BEHIND=0

if %COMMITS_BEHIND% gtr 0 (
    echo Found %COMMITS_BEHIND% new update(s). Applying...
    git pull origin master
    echo.
    echo Rebuilding app with new changes...
    call npm install --silent
    call npm run build
    echo Build done.
    echo.
) else (
    echo Already up to date.
)

echo.
echo Starting dashboard at http://localhost:3000
echo Press Ctrl+C to stop.
echo.

:: Open browser after short delay (start in background)
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start the production server
call npm start
