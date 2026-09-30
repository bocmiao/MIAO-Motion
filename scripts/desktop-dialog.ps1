param([string]$Destination, [switch]$Cancel)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '仅允许隔离 Windows CI 操作系统保存窗口' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeSaveDialog {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string className, string title);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out int processId);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, StringBuilder text);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  public static string ReadText(IntPtr window) {
    var text = new StringBuilder(32768);
    SendMessage(window, 0x000D, new IntPtr(text.Capacity), text);
    return text.ToString();
  }
}
'@
# Owned dialogs are nested beneath their owner in UI Automation, not desktop
# children. Resolve the native dialog first, then inspect its controls with UIA.
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $dialogHandle = [NativeSaveDialog]::FindWindow('#32770', '保存导出文件')
  $dialog = if ($dialogHandle -ne [IntPtr]::Zero) { [Windows.Automation.AutomationElement]::FromHandle($dialogHandle) } else { $null }
  if (-not $dialog) { Start-Sleep -Milliseconds 200 }
} while (-not $dialog -and [DateTime]::UtcNow -lt $deadline)
if (-not $dialog) {
  $windows = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) { Write-Host "Native window: $($window.Current.Name) / PID $($window.Current.ProcessId)" }
  throw '没有出现系统另存为窗口'
}
$owner = [NativeSaveDialog]::GetWindow([IntPtr]$dialog.Current.NativeWindowHandle, 4)
$ownerProcess = 0
$null = [NativeSaveDialog]::GetWindowThreadProcessId($owner, [ref]$ownerProcess)
if ($owner -eq [IntPtr]::Zero -or $ownerProcess -ne $dialog.Current.ProcessId) { throw '另存为窗口没有绑定喵动窗口' }
Write-Host '另存为窗口已绑定喵动窗口'
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
[void][NativeSaveDialog]::SendMessage($dialogHandle, 0x0028, [IntPtr]$edit.Current.NativeWindowHandle, [IntPtr]1)
[Windows.Forms.SendKeys]::SendWait('^a')
[Windows.Forms.SendKeys]::SendWait('^v')
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $entered = [NativeSaveDialog]::ReadText([IntPtr]$edit.Current.NativeWindowHandle)
  if ($entered -ne $Destination) { Start-Sleep -Milliseconds 200 }
} while ($entered -ne $Destination -and [DateTime]::UtcNow -lt $deadline)
if ($entered -ne $Destination) { throw "文件名输入未完成：$entered" }
Write-Host "Native Save As entered destination: $entered"
$buttonCondition = [Windows.Automation.AndCondition]::new(
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1'),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, 'Save'))
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $button = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $buttonCondition)
  if (-not $button) { Start-Sleep -Milliseconds 200 }
} while (-not $button -and [DateTime]::UtcNow -lt $deadline)
if (-not $button) { throw '另存为窗口缺少保存按钮' }
Write-Host "Native Save As button: $($button.Current.Name) / $($button.Current.AutomationId)"
if (-not [NativeSaveDialog]::PostMessage([IntPtr]$button.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)) { throw '无法点击保存按钮' }
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  Start-Sleep -Milliseconds 200
  $remaining = [NativeSaveDialog]::FindWindow('#32770', '保存导出文件')
} while ($remaining -ne [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline)
if ($remaining -ne [IntPtr]::Zero) { throw '点击保存后另存为窗口未关闭' }
