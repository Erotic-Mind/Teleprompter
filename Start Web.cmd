@echo off
cd /d "%~dp0"
echo Starting Prompter (web version)...
start "Prompter Web Server" cmd /k node serve.js
timeout /t 2 >nul
start "" http://localhost:5177
echo.
echo The app opened in your browser at http://localhost:5177
echo Keep the "Prompter Web Server" window open while you use it.
timeout /t 3 >nul
