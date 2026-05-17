@echo off
title Macro Dashboard - Building...
cd /d "e:\Economic_Calendar"
echo Building production bundle...
call npm run build
if %errorlevel%==0 (
  echo.
  echo Build complete. You can now use the desktop shortcut.
) else (
  echo.
  echo Build FAILED. Check errors above.
)
pause
