@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist dist\index.html (
  echo 便携包不完整：缺少 dist\index.html，请重新下载并校验 SHA-256。
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-server.ps1"
if errorlevel 1 pause
