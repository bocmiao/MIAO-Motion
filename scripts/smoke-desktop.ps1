$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem src-tauri/target/release/bundle/nsis/*-setup.exe | Select-Object -First 1
$installDir = Join-Path $env:RUNNER_TEMP 'MiaoDesktopSmoke'
$install = Start-Process $installer.FullName -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "NSIS 安装失败：$($install.ExitCode)" }
$exe = Get-ChildItem $installDir -Filter 'miao-motion.exe' -Recurse | Select-Object -First 1
if (-not $exe) { throw '安装后找不到主程序' }
# PE subsystem 2 means GUI, not a console application.
$bytes = [IO.File]::ReadAllBytes($exe.FullName)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt16($bytes, $pe + 24 + 68) -ne 2) { throw '主程序仍使用控制台子系统' }
$app = Start-Process $exe.FullName -PassThru
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) { throw "安装版启动后退出：$($app.ExitCode)" }
  } while ($app.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
  if ($app.MainWindowHandle -eq 0) { throw '安装版没有创建窗口' }
  Write-Host "安装版窗口已创建：$($app.MainWindowTitle)"
} finally { if (-not $app.HasExited) { Stop-Process -Id $app.Id } }
$uninstaller = Get-ChildItem $installDir -Filter '*uninstall*.exe' | Select-Object -First 1
if (-not $uninstaller) { throw '找不到卸载器' }
$remove = Start-Process $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($remove.ExitCode -ne 0) { throw '静默卸载失败' }
