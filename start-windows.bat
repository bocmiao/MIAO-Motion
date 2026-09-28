@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set NODE_MAJOR=0
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。源码版需要 Node.js 22 或更新版本：https://nodejs.org/
  echo 如果你下载的是免构建便携包，请运行 start-portable.bat。
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if not defined NODE_MAJOR set NODE_MAJOR=0
if %NODE_MAJOR% LSS 22 (
  echo Node.js 版本过低。需要 22 或更新版本，当前主版本：%NODE_MAJOR%
  pause
  exit /b 1
)
for /f %%h in ('node scripts\lock-hash.mjs') do set LOCK_HASH=%%h
set INSTALLED_HASH=
if exist node_modules\.miao-lock-sha set /p INSTALLED_HASH=<node_modules\.miao-lock-sha
if not "%LOCK_HASH%"=="%INSTALLED_HASH%" (
  echo 正在安装或同步依赖，请稍候……
  call npm ci || goto :error
  >node_modules\.miao-lock-sha echo %LOCK_HASH%
)
for /f %%v in ('node -p "require('./package.json').version"') do set APP_VERSION=%%v
set BUILT_VERSION=
if exist dist\.build-version set /p BUILT_VERSION=<dist\.build-version
if not "%APP_VERSION%"=="%BUILT_VERSION%" (
  echo 正在准备应用文件，首次运行时间会稍长……
  call npm run build:app || goto :error
)
start "MIAO Motion Server" cmd /k "npm run start"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); do { try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 goto :server_error
start "MIAO Motion" http://127.0.0.1:4173
exit /b 0
:server_error
echo 本地服务在 30 秒内没有就绪。
echo 请查看 MIAO Motion Server 窗口，并在反馈时附上错误和诊断报告。
pause
exit /b 1
:error
echo 启动失败。请复制上方错误，在反馈时一并提供。
pause
exit /b 1
