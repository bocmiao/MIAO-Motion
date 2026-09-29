$ErrorActionPreference = 'Stop'
$reg = (Resolve-Path 'native/build/Release/camera-register.exe').Path
$registration = Start-Process -FilePath $reg -ArgumentList 'register-silent' -Wait -PassThru -WindowStyle Hidden
if ($registration.ExitCode -ne 0) { throw "原生摄像头注册失败：$($registration.ExitCode)" }
$sender = $null
try {
  if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw '验证接收帧需要 ffmpeg' }
  $sender = Start-Process -FilePath 'native/build/Release/camera-sender.exe' -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 1
  New-Item -ItemType Directory -Path test-results -Force | Out-Null
  ffmpeg -hide_banner -y -f dshow -video_size 640x360 -i 'video=MIAO Motion Camera' -frames:v 1 -update 1 test-results/native-camera.png
  if ($LASTEXITCODE -ne 0) { throw 'DirectShow 接收失败' }
  node scripts/check-native-frame.mjs
  if ($LASTEXITCODE -ne 0) { throw '原生摄像头颜色或方向验证失败' }
} finally {
  if ($sender -and -not $sender.HasExited) { Stop-Process -Id $sender.Id -Force }
  $removal = Start-Process -FilePath $reg -ArgumentList 'unregister-silent' -Wait -PassThru -WindowStyle Hidden
  if ($removal.ExitCode -ne 0) { throw "原生摄像头卸载失败：$($removal.ExitCode)" }
}
