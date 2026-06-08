@echo off
echo === Economic Calendar - First-time Setup ===
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org (LTS version)
    pause
    exit /b 1
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git not found. Install from https://git-scm.com
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

if not exist ".env.local" (
    echo ERROR: .env.local file missing!
    echo Ask the dashboard owner to send you the .env.local file
    echo and place it in this folder, then run setup again.
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo Building production app...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo === Setup complete! ===
echo Run start.bat to launch the dashboard.
echo.
pause
