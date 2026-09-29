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
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
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
  $cdpReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:9222/json/version'; $cdpReady = $true; break } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $cdpReady) { throw 'WebView2 验证连接未就绪' }
  node scripts/check-desktop-camera.mjs
  if ($LASTEXITCODE -ne 0) { throw '安装版角色画面未到达 DirectShow 接收器' }
  $camera = Get-ItemPropertyValue 'HKLM:\SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}\InprocServer32' '(default)'
  $expected = Join-Path $env:ProgramFiles 'MIAO Motion Camera\softcam.dll'
  if ($camera -ne $expected) { throw "摄像头没有注册在受保护目录：$camera" }
  foreach ($path in @($expected, (Split-Path $expected))) {
    $acl = Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected) { throw "摄像头目录或文件仍继承不受控权限：$path" }
    foreach ($rule in $acl.Access) {
      $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
      if ($sid -notin @('S-1-5-18','S-1-5-32-544') -and $rule.AccessControlType -eq 'Allow' -and
          (([int]$rule.FileSystemRights -band 0xD0116) -ne 0)) { throw "普通用户可修改摄像头组件：$rule" }
    }
  }
} finally { if (-not $app.HasExited) { Stop-Process -Id $app.Id } }
$uninstaller = Get-ChildItem $installDir -Filter '*uninstall*.exe' | Select-Object -First 1
if (-not $uninstaller) { throw '找不到卸载器' }
$remove = Start-Process $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
if ($remove.ExitCode -ne 0) { throw '静默卸载失败' }
if (Test-Path 'HKLM:\SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}') { throw '卸载后虚拟摄像头仍注册在系统中' }
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
