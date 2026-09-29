param([string]$File, [int]$X, [int]$Y)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Native file drag is only allowed in disposable Windows CI' }
$source = (Resolve-Path -LiteralPath $File).Path
$app = Get-Process -Name miao-motion | Select-Object -First 1
$helper = Join-Path $PSScriptRoot '../native/build/Release/desktop-file-drop.exe'
& $helper $source $app.MainWindowHandle.ToInt64() $X $Y
if ($LASTEXITCODE -ne 0) { throw "Native Shell file drag failed: $LASTEXITCODE" }
