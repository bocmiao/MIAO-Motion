param([string]$Destination, [switch]$Cancel)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw '仅允许隔离 Windows CI 操作系统保存窗口' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, '保存导出文件')
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $dialog = [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, $condition)
  if (-not $dialog) { Start-Sleep -Milliseconds 200 }
} while (-not $dialog -and [DateTime]::UtcNow -lt $deadline)
if (-not $dialog) { throw '没有出现系统另存为窗口' }
if ($Cancel) {
  $dialog.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close()
  exit 0
}
$editCondition = [Windows.Automation.AndCondition]::new(
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Edit),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1001'))
$edit = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $editCondition)
if (-not $edit) { throw '另存为窗口缺少文件名输入框（1001）' }
$edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).SetValue($Destination)
$buttonCondition = [Windows.Automation.AndCondition]::new(
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button),
  [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1'))
$button = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $buttonCondition)
if (-not $button) { throw '另存为窗口缺少保存按钮' }
$button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
