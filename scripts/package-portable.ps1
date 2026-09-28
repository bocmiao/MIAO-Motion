param([string]$Output = 'release')
$ErrorActionPreference = 'Stop'
$package = Join-Path $Output 'MIAO-Motion-portable'
$support = Join-Path $package 'support'
New-Item -ItemType Directory -Force $support | Out-Null
Copy-Item dist, portable-server.ps1 -Destination $support -Recurse
Copy-Item LICENSE, THIRD_PARTY_NOTICES.md -Destination $package
$launcher = "@echo off`r`nchcp 65001 >nul`r`nsetlocal`r`ncd /d `"%~dp0support`"`r`nif not exist dist\index.html (`r`n echo 请先右键压缩包，选择 全部解压缩，再双击启动。`r`n pause`r`n exit /b 1`r`n)`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0support\portable-server.ps1`"`r`nif errorlevel 1 pause`r`n"
[IO.File]::WriteAllText((Join-Path $package '双击启动喵动.bat'), $launcher, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $package '先看这里.txt'), '先全部解压缩，再双击“双击启动喵动.bat”。用户教程位于 support/dist/help.html。运行时请保留命令窗口。模型和设置保存在当前浏览器中，不与安装版共享。', [Text.UTF8Encoding]::new($true))
Compress-Archive -Path $package -DestinationPath (Join-Path $Output 'MIAO-Motion-portable.zip') -Force
$zip = Join-Path $Output 'MIAO-Motion-portable.zip'
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
"$hash  MIAO-Motion-portable.zip" | Set-Content "$zip.sha256" -Encoding ascii
