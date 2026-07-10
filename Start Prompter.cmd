@echo off
cd /d "%~dp0"
echo ============================================
echo   Prompter
echo ============================================
echo.
echo Setting up the prompter screen...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extend-displays.ps1"
echo.
if not exist "node_modules" (
  echo First run - installing the app, this takes a minute...
  call npm install
  echo.
)
echo Launching Prompter...
start "" "%~dp0node_modules\.bin\electron.cmd" .
echo Done. This window can be closed.
timeout /t 3 >nul
