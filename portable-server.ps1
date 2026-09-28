param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$rootBoundary = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$prefix = 'http://127.0.0.1:4173/'
$skipBrowser = $NoBrowser -or $env:MIAO_MOTION_NO_BROWSER -eq '1'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8';
  '.wasm' = 'application/wasm'; '.task' = 'application/octet-stream';
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp';
  '.svg' = 'image/svg+xml'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/markdown; charset=utf-8'
}
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
  Write-Host "MIAO Motion is running: $prefix"
  Write-Host 'Close this window to stop MIAO Motion.'
  if (-not $skipBrowser) { Start-Process $prefix }
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      if ($context.Request.HttpMethod -notin @('GET', 'HEAD')) {
        $context.Response.StatusCode = 405
        continue
      }
      $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
      if (-not $path.StartsWith($rootBoundary, [StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        continue
      }
      if (-not [IO.File]::Exists($path)) {
        $context.Response.StatusCode = 404
        continue
      }
      $bytes = [IO.File]::ReadAllBytes($path)
      $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
      $context.Response.ContentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { 'application/octet-stream' }
      $context.Response.ContentLength64 = $bytes.Length
      if ($context.Request.HttpMethod -eq 'GET') { $context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {
      $context.Response.StatusCode = 500
      Write-Warning $_.Exception.Message
    } finally {
      $context.Response.Close()
    }
  }
} catch {
  Write-Host "MIAO_PORTABLE_SERVER_ERROR: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
  Write-Error "Unable to start the local server on port 4173. $($_.Exception.Message)"
  exit 1
} finally {
  $listener.Close()
}
