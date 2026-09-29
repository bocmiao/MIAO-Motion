param([string]$Destination, [switch]$Cancel)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '仅允许隔离 Windows CI 操作系统保存窗口' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeSaveDialog {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
}
'@
$condition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, '保存导出文件')
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $dialog = [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, $condition)
  if (-not $dialog) { Start-Sleep -Milliseconds 200 }
} while (-not $dialog -and [DateTime]::UtcNow -lt $deadline)
if (-not $dialog) {
  $windows = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) { Write-Host "Native window: $($window.Current.Name) / PID $($window.Current.ProcessId)" }
  throw '没有出现系统另存为窗口'
}
if ($Cancel) {
  if (-not [NativeSaveDialog]::PostMessage([IntPtr]$dialog.Current.NativeWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { throw '无法关闭另存为窗口' }
  exit 0
}
$hostCondition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, 'FileNameControlHost')
$editCondition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1001')
$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
  $fileNameHost = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $hostCondition)
  $edit = if ($fileNameHost) { $fileNameHost.FindFirst([Windows.Automation.TreeScope]::Descendants, $editCondition) } else { $null }
  if (-not $edit) { Start-Sleep -Milliseconds 200 }
} while (-not $edit -and [DateTime]::UtcNow -lt $deadline)
if (-not $edit) {
  $controls = $dialog.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
  foreach ($control in $controls) { Write-Host "Dialog control: $($control.Current.Name) / $($control.Current.AutomationId) / $($control.Current.ControlType.ProgrammaticName)" }
  throw '另存为窗口缺少文件名输入框'
}
# Native file dialogs keep an internal filename model. Real keyboard input updates
# it reliably; WM_SETTEXT alone can change the display without the selected path.
$dialogHandle = [IntPtr]$dialog.Current.NativeWindowHandle
[void][NativeSaveDialog]::SetForegroundWindow($dialogHandle)
if ([NativeSaveDialog]::GetForegroundWindow() -ne $dialogHandle) { throw '另存为窗口未获得焦点，停止输入' }
[Windows.Forms.Clipboard]::SetText($Destination)
[Windows.Forms.SendKeys]::SendWait('%n')
[Windows.Forms.SendKeys]::SendWait('^a')
[Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 300
Write-Host "Native Save As destination: $Destination"
$buttonCondition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1')
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $button = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $buttonCondition)
  if (-not $button) { Start-Sleep -Milliseconds 200 }
} while (-not $button -and [DateTime]::UtcNow -lt $deadline)
if (-not $button) { throw '另存为窗口缺少保存按钮' }
if (-not [NativeSaveDialog]::PostMessage([IntPtr]$button.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) { throw '无法点击保存按钮' }
