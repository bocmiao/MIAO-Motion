param([string]$Zip = 'portable/MIAO-Motion-portable.zip')
$ErrorActionPreference = 'Stop'
$extract = Join-Path $env:RUNNER_TEMP '喵动 普通用户 解压验证'
Expand-Archive $Zip -DestinationPath $extract -Force
$package = Join-Path $extract 'MIAO-Motion-portable'
$launcher = Join-Path $package '双击启动喵动.bat'
$env:MIAO_MOTION_NO_BROWSER = '1'
# A standard local account verifies that no http.sys URL ACL/admin access is needed.
$user = 'MiaoSmoke'
$password = [Guid]::NewGuid().ToString('N') + '!aA9'
$secure = ConvertTo-SecureString $password -AsPlainText -Force
New-LocalUser -Name $user -Password $secure -AccountNeverExpires | Out-Null
Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
icacls $extract /grant "${user}:(OI)(CI)RX" /T | Out-Null
$credential = [Management.Automation.PSCredential]::new("$env:COMPUTERNAME\$user", $secure)
$process = $null
try {
  $process = Start-Process cmd.exe -ArgumentList "/c `"`"$launcher`"`"" -Credential $credential -WorkingDirectory $package -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    try { $response = Invoke-WebRequest 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2; break } catch { Start-Sleep -Milliseconds 500 }
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'MIAO Motion') { throw '解压后的便携版未启动' }
  $second = Start-Process powershell.exe -ArgumentList "-NoProfile -File `"$package\support\portable-server.ps1`" -NoBrowser" -PassThru -Wait
  if ($second.ExitCode -ne 0) { throw '重复启动未复用已有服务' }
  $client = [Net.Sockets.TcpClient]::new('127.0.0.1', 4173)
  $bytes = [Text.Encoding]::ASCII.GetBytes("GET /mediapipe/vision_wasm_internal.wasm HTTP/1.1`r`nHost: 127.0.0.1`r`n`r`n")
  $client.GetStream().Write($bytes, 0, $bytes.Length)
  $client.Client.LingerState = [Net.Sockets.LingerOption]::new($true, 0)
  $client.Dispose()
  Start-Sleep -Seconds 1
  if ((Invoke-WebRequest 'http://127.0.0.1:4173/.miao-instance' -UseBasicParsing).Content -ne 'MIAO-Motion-portable-v1') { throw '中断下载后服务退出' }
} finally {
  if ($process) { taskkill /PID $process.Id /T /F 2>$null | Out-Null }
  Remove-LocalUser -Name $user
}
