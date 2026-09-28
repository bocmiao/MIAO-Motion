param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$rootBoundary = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$prefix = 'http://127.0.0.1:4173/'
$skipBrowser = $NoBrowser -or $env:MIAO_MOTION_NO_BROWSER -eq '1'
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css'; '.json'='application/json'; '.wasm'='application/wasm'; '.task'='application/octet-stream'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.svg'='image/svg+xml'; '.txt'='text/plain; charset=utf-8'; '.vrm'='model/vrm' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 4173)
try {
  $listener.Start()
} catch {
  try {
    $existing = Invoke-WebRequest ($prefix + '.miao-instance') -UseBasicParsing -TimeoutSec 2
    if ([string]$existing.Content -eq 'MIAO-Motion-portable-v1') {
      Write-Host '喵动已经运行，正在打开现有窗口。'
      if (-not $skipBrowser) { Start-Process $prefix }
      exit 0
    }
  } catch { }
  Write-Host '无法启动：4173 端口已被其他程序使用。请关闭该程序，或使用喵动安装版。'
  exit 1
}
Write-Host "喵动已启动：$prefix"
Write-Host '请保留此窗口；关闭此窗口会停止程序。'
if (-not $skipBrowser) { Start-Process $prefix }
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $file = $null
    try {
      $client.ReceiveTimeout = 5000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $header = [Collections.Generic.List[byte]]::new()
      while ($header.Count -lt 16384) {
        $byte = $stream.ReadByte()
        if ($byte -lt 0) { break }
        $header.Add([byte]$byte)
        $n = $header.Count
        if ($n -ge 4 -and $header[$n-4] -eq 13 -and $header[$n-3] -eq 10 -and $header[$n-2] -eq 13 -and $header[$n-1] -eq 10) { break }
      }
      if ($header.Count -eq 0) { continue }
      $request = [Text.Encoding]::ASCII.GetString($header.ToArray())
      $line = ($request -split "`r`n")[0] -split ' '
      $status = 200; $contentType = 'text/plain; charset=utf-8'; $bytes = [byte[]]@()
      $method = $line[0]
      if ($line.Count -ne 3 -or $header.Count -ge 16384 -or -not $request.EndsWith("`r`n`r`n")) { $status = 400 }
      elseif ($method -notin @('GET', 'HEAD')) { $status = 405 }
      elseif ($line[1] -eq '/.miao-instance') { $bytes = [Text.Encoding]::UTF8.GetBytes('MIAO-Motion-portable-v1') }
      else {
        $relative = [Uri]::UnescapeDataString(($line[1] -split '\?')[0]).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
        if ($relative.Contains('\') -or $relative.Contains(':') -or $relative.Contains([char]0)) { $status = 403 }
        else {
          $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
          if (-not $path.StartsWith($rootBoundary, [StringComparison]::OrdinalIgnoreCase)) { $status = 403 }
          elseif (-not [IO.File]::Exists($path)) { $status = 404 }
          else {
            $file = [IO.File]::OpenRead($path)
            $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
            $contentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { 'application/octet-stream' }
          }
        }
      }
      $length = if ($file) { $file.Length } else { $bytes.Length }
      $response = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status Response`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`nCache-Control: no-cache`r`n`r`n")
      $stream.Write($response, 0, $response.Length)
      if ($method -eq 'GET') {
        if ($file) { $file.CopyTo($stream) } else { $stream.Write($bytes, 0, $bytes.Length) }
      }
    } catch {
      Write-Host '一个请求已中断，喵动继续运行。'
    } finally {
      if ($file) { $file.Dispose() }
      $client.Dispose()
    }
  }
} finally { $listener.Stop() }
