$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  cmake -S native -B native/build -A x64
  if ($LASTEXITCODE -ne 0) { throw '原生摄像头配置失败，需要 Visual Studio C++ 和 Windows SDK。' }
  cmake --build native/build --config Release
  if ($LASTEXITCODE -ne 0) { throw '原生摄像头编译失败。' }
  New-Item -ItemType Directory -Path src-tauri/camera -Force | Out-Null
  Copy-Item -LiteralPath native/build/Release/softcam.dll -Destination src-tauri/camera/softcam.dll
  Copy-Item -LiteralPath native/build/Release/camera-register.exe -Destination src-tauri/camera/camera-register.exe
  Copy-Item -LiteralPath native/softcam/LICENSE -Destination src-tauri/camera/LICENSE-Softcam.txt
} finally { Pop-Location }
