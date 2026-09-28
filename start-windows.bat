@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22 or newer is required. Current major version: %NODE_MAJOR%
  pause
  exit /b 1
)
if not exist node_modules\.package-lock.json call npm ci || goto :error
call npm run build || goto :error
start "MIAO Motion Server" cmd /k "npm run start"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 goto :server_error
start "MIAO Motion" http://127.0.0.1:4173
exit /b 0
:server_error
echo The local server did not become ready within 30 seconds.
echo Check the MIAO Motion Server window and copy its error when asking for help.
pause
exit /b 1
:error
echo Start failed. Copy the error above when asking for help.
pause
exit /b 1
