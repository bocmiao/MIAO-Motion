@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm run build || goto :error
start "MIAO Motion Server" cmd /k "npm run start"
timeout /t 2 /nobreak >nul
start "MIAO Motion" http://127.0.0.1:4173
exit /b 0
:error
echo Start failed. Copy the error above when asking for help.
pause
exit /b 1
