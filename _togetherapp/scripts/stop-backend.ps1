$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.private/backend.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { throw 'No managed backend PID file. Stop the terminal running the backend instead.' }
$backendId = [int](Get-Content -LiteralPath $pidFile -Raw)
$backendProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $backendId"
if ($backendProcess.Name -ne 'node.exe' -or $backendProcess.CommandLine -notmatch 'server\.mjs') { throw 'The PID no longer refers to the Together backend. Nothing was stopped.' }
Stop-Process -Id $backendId
Write-Host 'Together backend stopped. Private account data remains on disk.'
