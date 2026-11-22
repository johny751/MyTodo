$ErrorActionPreference = 'Stop'
$runtimeDir = if (Test-Path -LiteralPath 'M:\dev\gxtodo-local\data') { 'M:\dev\gxtodo-local' } else { Join-Path $env:LOCALAPPDATA 'GxTodoLocal' }
$pidFile = Join-Path $runtimeDir 'server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host '没有记录的本地服务。'; exit }
$localPid = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverFile = Join-Path $PSScriptRoot 'server.mjs'
$localProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $localPid)
if ($localProcess -and $localProcess.CommandLine -and $localProcess.CommandLine.IndexOf($serverFile.Replace('\','/'),[StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Stop-Process -Id $localPid
  Write-Host '本地服务已停止，数据已保留。'
} elseif ($localProcess -and $localProcess.CommandLine -and $localProcess.CommandLine.IndexOf($serverFile,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Stop-Process -Id $localPid
  Write-Host '本地服务已停止，数据已保留。'
} else { Write-Host '该 PID 不再对应这个项目，没有停止任何进程。' }
