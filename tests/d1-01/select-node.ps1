$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'This script selects a preinstalled Node for the GitHub-hosted Windows job.'
}

$candidates = @()
$active = Get-Command node.exe -ErrorAction SilentlyContinue
if ($active) { $candidates += $active.Source }
if ($env:RUNNER_TOOL_CACHE) {
    $pattern = Join-Path $env:RUNNER_TOOL_CACHE 'node/*/x64/node.exe'
    $candidates += @(Get-ChildItem $pattern -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
}

foreach ($executable in ($candidates | Select-Object -Unique)) {
    $version = & $executable --version
    if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.(\d+)\.\d+') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        if ($major -gt 22 -or ($major -eq 22 -and $minor -ge 13)) {
            Write-Output "$executable $version"
            Add-Content -LiteralPath $env:GITHUB_PATH -Value (Split-Path $executable -Parent) -Encoding utf8
            exit 0
        }
    }
}

Write-Output 'No preinstalled Node 22.13 or newer was found.'
exit 78
