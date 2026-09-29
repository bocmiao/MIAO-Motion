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
# Match Playwright's foreground test environment: receiver processes must not
# cause WebView2's native-window occlusion to suspend DOM polling in CI.
$browserArguments = '--remote-debugging-port=9222 --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $browserArguments
# Elevated WebView2 150+ ignores environment overrides. Apply a scoped debugging
# policy only inside disposable GitHub runners, never on a developer/user machine.
$debugPolicy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $debugPolicy -Force | Out-Null
New-ItemProperty -Path $debugPolicy -Name 'miao-motion.exe' -Value $browserArguments -PropertyType String -Force | Out-Null
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
if (-not $app.HasExited) { $null = $app.WaitForExit(15000) }

# ---- Component lifecycle: reinstall, manual upgrade, blocked removal, other user ----
$serverKey = 'HKLM:\SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}'
$instanceKey = 'HKLM:\SOFTWARE\Classes\CLSID\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\MIAO Motion Camera'
$userKey = 'HKCU:\Software\MIAO Motion\Camera'
$protectedDll = Join-Path $env:ProgramFiles 'MIAO Motion Camera\softcam.dll'
$mainExe = $exe.FullName
$uninstallExe = Join-Path $installDir 'uninstall.exe'
$helper = Join-Path $env:RUNNER_TEMP 'miao-camera-register.exe'
function Get-UserFlag([string]$Name) {
  (Get-ItemProperty -LiteralPath $userKey -Name $Name -ErrorAction SilentlyContinue).$Name
}
function Get-CameraPath {
  (Get-ItemProperty -LiteralPath "$serverKey\InprocServer32" -ErrorAction SilentlyContinue).'(default)'
}
# Waits for a process that does not hand off to a child (installer, `_?=` uninstaller,
# helper). A hidden, unhandled dialog would otherwise only surface as a step timeout.
function Invoke-Bounded([string]$File, [string[]]$Arguments, [string]$Label, [int]$Seconds = 240) {
  Write-Host "${Label}：$File $($Arguments -join ' ')"
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  $null = $process.Handle
  if (-not $process.WaitForExit($Seconds * 1000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "${Label} 超过 ${Seconds} 秒未结束，可能出现了未设置静默默认值的对话框"
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "${Label} 失败，退出码 $($process.ExitCode)" }
}
# Adds or removes an explicit "Everyone: deny Delete" ACE on the DirectShow instance
# key (DACL only, 64-bit view) so camera-register.exe cannot unregister.
function Set-InstanceKeyDeny([System.Security.AccessControl.RegistryAccessRule]$Rule, [bool]$Enable) {
  $subKey = $instanceKey -replace '^HKLM:\\', ''
  $rights = [System.Security.AccessControl.RegistryRights]::ReadPermissions -bor [System.Security.AccessControl.RegistryRights]::ChangePermissions
  $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($subKey, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights)
  if (-not $key) { throw "找不到 DirectShow 实例键：$instanceKey" }
  try {
    $acl = $key.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    if ($Enable) { $acl.AddAccessRule($Rule) } else { $acl.RemoveAccessRuleSpecific($Rule) }
    $key.SetAccessControl($acl)
  } finally { $key.Close() }
}
function Assert-Uninstalled([string]$Label) {
  if (Test-Path -LiteralPath $mainExe) { throw "${Label}：卸载没有完成，主程序仍在 $mainExe" }
}

if ((Get-UserFlag 'RegisteredByUser') -ne 1) { throw '当前用户安装组件后没有写入 HKCU RegisteredByUser 标记' }
Copy-Item -LiteralPath (Join-Path $installDir 'camera\camera-register.exe') -Destination $helper -Force
$denyRule = $null
try {
  Write-Host '1/4 同版本静默重装：已在受保护目录的组件保持不变、不再请求权限'
  $deployed = (Get-Item -LiteralPath $protectedDll).LastWriteTimeUtc
  Invoke-Bounded $installer.FullName @('/S', "/D=$installDir") '同版本静默重装'
  if ((Get-CameraPath) -ne $protectedDll) { throw "重装后组件注册路径异常：$(Get-CameraPath)" }
  if ((Get-Item -LiteralPath $protectedDll).LastWriteTimeUtc -ne $deployed) { throw '重装时不应重新部署已受保护的组件' }

  Write-Host '2/4 模拟手动升级：安装包先运行旧卸载器（不带 /UPDATE，带 _?=），再安装新版本'
  # Same command line as the Tauri template's PageLeaveReinstall (GUI/passive upgrade).
  Invoke-Bounded $uninstallExe @('/S', "_?=$installDir") '升级前卸载旧版本'
  Assert-Uninstalled '升级前卸载'
  if (Test-Path -LiteralPath $serverKey) { throw '升级前卸载应注销当前用户安装的组件' }
  if ((Get-UserFlag 'ReinstallPending') -ne 1) { throw '升级前卸载没有记录 ReinstallPending' }
  Invoke-Bounded $installer.FullName @('/S', "/D=$installDir") '升级安装'
  if ((Get-CameraPath) -ne $protectedDll) { throw "升级后虚拟摄像头没有恢复：$(Get-CameraPath)" }
  if ($null -ne (Get-UserFlag 'ReinstallPending')) { throw '恢复组件后应清除 ReinstallPending' }
  if ((Get-UserFlag 'RegisteredByUser') -ne 1) { throw '恢复组件后应重新写入 RegisteredByUser' }

  Write-Host '3/4 注销失败时卸载不阻塞：临时拒绝删除 DirectShow 实例键'
  $everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
  $denyRule = [System.Security.AccessControl.RegistryAccessRule]::new($everyone,
    [System.Security.AccessControl.RegistryRights]::Delete, [System.Security.AccessControl.AccessControlType]::Deny)
  Set-InstanceKeyDeny $denyRule $true
  Invoke-Bounded $uninstallExe @('/S', "_?=$installDir") '注销失败时静默卸载'
  Assert-Uninstalled '注销失败时卸载'
  # The helper ran and failed: the denied key survives and no restore is scheduled.
  if (-not (Test-Path -LiteralPath $instanceKey)) { throw '拒绝删除后实例键仍被删除，未能模拟注销失败' }
  if ($null -ne (Get-UserFlag 'ReinstallPending')) { throw '注销失败时不应记录 ReinstallPending' }
  Set-InstanceKeyDeny $denyRule $false
  $denyRule = $null
  Invoke-Bounded $helper @('unregister-silent') '清理注销失败残留'
  if ((Test-Path -LiteralPath $instanceKey) -or (Test-Path -LiteralPath $serverKey)) { throw '清理后虚拟摄像头仍注册在系统中' }

  Write-Host '4/4 其他用户安装的受保护组件：卸载不注销、不阻塞'
  Invoke-Bounded $installer.FullName @('/S', "/D=$installDir") '重新安装'
  if (Test-Path -LiteralPath $serverKey) { throw '注销失败后的重新安装不应自动恢复组件' }
  Invoke-Bounded (Join-Path $installDir 'camera\camera-register.exe') @('register-silent') '注册组件'
  if ((Get-CameraPath) -ne $protectedDll) { throw "组件注册路径异常：$(Get-CameraPath)" }
  # No HKCU marker: what a second Windows user of the same PC sees.
  Remove-ItemProperty -LiteralPath $userKey -Name 'RegisteredByUser'
  # Normal uninstall path: NSIS copies itself to %TEMP% and runs that child. -Wait
  # includes descendants; Process.WaitForExit() would return too early. The CI
  # step timeout bounds this call.
  $remove = Start-Process $uninstallExe -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
  if ($remove.ExitCode -ne 0) { throw "静默卸载失败，退出码 $($remove.ExitCode)" }
  Assert-Uninstalled '他人组件存在时卸载'
  if ((Get-CameraPath) -ne $protectedDll) { throw '卸载不应注销其他用户安装的受保护组件' }
  Invoke-Bounded $helper @('unregister-silent') '清理测试组件'
  if ((Test-Path -LiteralPath $instanceKey) -or (Test-Path -LiteralPath $serverKey)) { throw '清理后虚拟摄像头仍注册在系统中' }
} finally {
  # Best-effort cleanup that never replaces the original error.
  if ($denyRule) {
    try { Set-InstanceKeyDeny $denyRule $false } catch { Write-Warning "恢复实例键权限失败：$_" }
  }
  if ((Test-Path -LiteralPath $serverKey) -or (Test-Path -LiteralPath $instanceKey)) {
    try { Start-Process -FilePath $helper -ArgumentList 'unregister-silent' -Wait -WindowStyle Hidden } catch { Write-Warning "清理组件失败：$_" }
  }
  if ((Test-Path -LiteralPath $mainExe) -and (Test-Path -LiteralPath $uninstallExe)) {
    try { Start-Process $uninstallExe -ArgumentList '/S' -Wait -WindowStyle Hidden } catch { Write-Warning "清理安装失败：$_" }
  }
  Remove-Item -LiteralPath $helper -Force -ErrorAction SilentlyContinue
}
Write-Host '安装、角色收帧、受保护权限、重装、升级恢复、注销失败与多用户卸载均通过'
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
