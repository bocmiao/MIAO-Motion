$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Only disposable Windows CI may control these windows' }
# External-link checks launch the real default browser. Release its processes before
# testing saves and rendering; WebView2 uses the separate msedgewebview2 process.
Get-Process -Name msedge -ErrorAction SilentlyContinue | Stop-Process -Force
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DesktopForeground {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
}
'@
$app = Get-Process -Name miao-motion | Select-Object -First 1
[void][DesktopForeground]::ShowWindow($app.MainWindowHandle, 9)
[void][DesktopForeground]::SetForegroundWindow($app.MainWindowHandle)
