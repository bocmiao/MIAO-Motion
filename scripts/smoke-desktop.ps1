$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '完整安装链路验证仅允许在隔离的 GitHub Actions Windows runner 执行' }
$installer = Get-ChildItem src-tauri/target/release/bundle/nsis/*-setup.exe | Select-Object -First 1
$installDir = Join-Path $env:RUNNER_TEMP 'MiaoDesktopSmoke'
Write-Host '开始静默安装测试包'
$install = Start-Process $installer.FullName -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "NSIS 安装失败：$($install.ExitCode)" }
$exe = Get-ChildItem $installDir -Filter 'miao-motion.exe' -Recurse | Select-Object -First 1
if (-not $exe) { throw '安装后找不到主程序' }
# PE subsystem 2 means GUI, not a console application.
$bytes = [IO.File]::ReadAllBytes($exe.FullName)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt16($bytes, $pe + 24 + 68) -ne 2) { throw '主程序仍使用控制台子系统' }
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
# Elevated WebView2 150+ ignores environment overrides. Apply a scoped debugging
# policy only inside disposable GitHub runners, never on a developer/user machine.
$debugPolicy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $debugPolicy -Force | Out-Null
New-ItemProperty -Path $debugPolicy -Name 'miao-motion.exe' -Value '--remote-debugging-port=9222' -PropertyType String -Force | Out-Null
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
  if ($LASTEXITCODE -ne 0) { throw '安装版端到端验证失败，请查看原始错误和接收端画面' }
  Write-Host '角色收帧通过，开始检查组件权限'
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
} finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id }
  Remove-ItemProperty -Path $debugPolicy -Name 'miao-motion.exe' -ErrorAction SilentlyContinue
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
}
$uninstaller = Get-ChildItem $installDir -Filter '*uninstall*.exe' | Select-Object -First 1
if (-not $uninstaller) { throw '找不到卸载器' }
Write-Host '开始静默卸载并核对注册项'
# NSIS launches a temporary child uninstaller. -Wait includes descendants;
# Process.WaitForExit() can return before the real uninstaller finishes.
# The CI step's five-minute timeout bounds the complete test.
$remove = Start-Process $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($remove.ExitCode -ne 0) { throw '静默卸载失败' }
if (Test-Path 'HKLM:\SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}') { throw '卸载后虚拟摄像头仍注册在系统中' }
Write-Host '安装、角色收帧、受保护权限和卸载注销均通过'
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
