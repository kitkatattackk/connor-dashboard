@echo off
echo Connor Dashboard — Build Script
echo =================================
echo.

:: Check Node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Node.js not found. Download from https://nodejs.org
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install

echo.
echo Building Windows installer...
call npm run build:win

echo.
echo Done! Check the dist\ folder for the installer.
pause
