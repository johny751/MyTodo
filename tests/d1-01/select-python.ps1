$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'GitHub cloud runtime selection only' }
$candidates=@()
$candidates += @(Get-Command python.exe -All -CommandType Application -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if ($env:RUNNER_TOOL_CACHE) {
 $candidates += @(Get-ChildItem (Join-Path $env:RUNNER_TOOL_CACHE 'Python/*/x64/python.exe') -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
}
foreach($executable in ($candidates | Select-Object -Unique)) {
 if($executable -match '(?i)[/\\]Microsoft[/\\]WindowsApps[/\\]python(?:3)?\.exe$') { continue }
 $probe=& $executable -c "import sys; print('D1_REAL_PYTHON|' + sys.executable + '|' + str(sys.version_info.major) + '.' + str(sys.version_info.minor)); sys.exit(0 if sys.version_info >= (3,11) else 1)"
 if($LASTEXITCODE -eq 0 -and $probe -match '^D1_REAL_PYTHON\|([^|]+)\|3\.[0-9]+$') {
  $selected=$Matches[1]
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "D1_PYTHON=$selected" -Encoding utf8
  Write-Output $probe
  exit 0
 }
}
throw 'BLOCKER: no proven preinstalled Python >=3.11; Store execution aliases excluded'
