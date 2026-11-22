param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$serverFile = Join-Path $projectRoot 'server.mjs'
$nodeRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path -LiteralPath $nodeRuntime)) { $nodeRuntime = (Get-Command node -ErrorAction Stop).Source }
$state = $null
try { $state = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/state' -TimeoutSec 2 } catch {}
if ($state -and $state.version -in @(1, 2) -and $null -ne $state.tasks) {
  Write-Host '本地版已经在运行。'
} else {
  $runtimeDir = if (Test-Path -LiteralPath 'M:\dev\gxtodo-local\data') { 'M:\dev\gxtodo-local' } else { Join-Path $env:LOCALAPPDATA 'GxTodoLocal' }
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $releasePreviousDataDir = $env:GXTODO_DATA_DIR
  try {
    if (!$env:GXTODO_DATA_DIR) { $env:GXTODO_DATA_DIR = Join-Path $runtimeDir 'data' }
    $localProcess = Start-Process -FilePath $nodeRuntime -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log') -PassThru
  } finally {
    if ($null -eq $releasePreviousDataDir) { Remove-Item Env:GXTODO_DATA_DIR -ErrorAction SilentlyContinue } else { $env:GXTODO_DATA_DIR = $releasePreviousDataDir }
  }
  Set-Content -LiteralPath (Join-Path $runtimeDir 'server.pid') -Value $localProcess.Id
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { $state = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/state' -TimeoutSec 1; if ($state.version -in @(1, 2)) { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (!$ready) { throw ('启动失败，请查看 ' + (Join-Path $runtimeDir 'server-error.log')) }
}
Write-Host '访问地址：http://127.0.0.1:4173'
if (!$NoBrowser) { Start-Process 'http://127.0.0.1:4173' }
