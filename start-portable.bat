@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist dist\index.html (
  echo 请先右键 ZIP 文件，选择“全部解压缩”，不要在压缩包预览窗口中启动。
  echo 便携包不完整：缺少 dist\index.html，请重新下载并校验 SHA-256。
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-server.ps1"
if errorlevel 1 pause
