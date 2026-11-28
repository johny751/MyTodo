[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
# D4-09 admitted CI evidence gate. Read-only and CI invocation only.
if ($env:GITHUB_ACTIONS -cne 'true' -or -not $IsWindows) { throw 'GitHub Actions Windows only.' }
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
$directory = (Get-Item -LiteralPath $OutputDirectory -Force).FullName.TrimEnd('\', '/')
$runnerTemp = (Get-Item -LiteralPath $env:RUNNER_TEMP -Force).FullName.TrimEnd('\', '/')
Require ([IO.Path]::GetDirectoryName($directory) -ieq $runnerTemp -and [IO.Path]::GetFileName($directory) -cmatch '^d4-original-suite-diag-[a-z0-9-]+$') 'Diagnostic directory is outside its admitted root.'
Require (((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Diagnostic directory cannot be a link.'
$files = @(Get-ChildItem -LiteralPath $directory -Force -File -Recurse)
$allEntries = @(Get-ChildItem -LiteralPath $directory -Force -Recurse)
foreach ($entry in $allEntries) { Require (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) ('Diagnostic link not admitted: ' + $entry.FullName) }
$actual = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($directory, $file.FullName).Replace('\', '/')
    if ($relative -ceq 'SHA256SUMS.txt') { continue }
    $actual.Add($relative, $file.FullName)
}
$sumPath = Join-Path $directory 'SHA256SUMS.txt'
Require (Test-Path -LiteralPath $sumPath -PathType Leaf) 'SHA256SUMS missing.'
$sums = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
foreach ($line in [IO.File]::ReadAllLines($sumPath)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    Require ($line -cmatch '^([a-f0-9]{64})  (.+)$') ('Malformed or UNHASHED sum entry: ' + $line)
    $digest = $Matches[1]; $relative = $Matches[2]
    Require (-not $sums.ContainsKey($relative)) ('Duplicate sum entry: ' + $relative)
    Require ($actual.ContainsKey($relative)) ('Unexpected or missing diagnostic member: ' + $relative)
    Require ((Hash $actual[$relative]) -ceq $digest) ('Diagnostic digest mismatch: ' + $relative)
    $sums.Add($relative, $digest)
}
Require ($sums.Count -eq $actual.Count) 'SHA256SUMS does not cover the exact diagnostic file set including hidden files.'
foreach ($relative in $actual.Keys) { Require ($sums.ContainsKey($relative)) ('Unlisted diagnostic member: ' + $relative) }
$m = Get-Content -LiteralPath (Join-Path $directory 'diagnostic-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
Require ($m.kind -ceq 'original-nine-suite-wer-wrapper' -and $m.schemaVersion -eq 1) 'Unexpected manifest kind/schema.'
Require ($m.sourceSha -ceq $env:GITHUB_SHA -and $env:EXPECTED_SOURCE_SHA -ceq $env:GITHUB_SHA -and [string]$m.runId -ceq $env:GITHUB_RUN_ID -and [string]$m.runAttempt -ceq $env:GITHUB_RUN_ATTEMPT) 'Manifest run/source binding differs.'
Require ($m.diagnosticsComplete -eq $true -and $m.registryRestored -eq $true -and @($m.fatalErrors).Count -eq 0 -and @($m.registryRestorationErrors).Count -eq 0) 'Diagnostic capture/restoration incomplete.'
Require ($m.productionAdmission -eq $false -and $m.originalFailureResolved -eq $false -and $m.replacesOriginalSuites -eq $false) 'Diagnostic claims exceeded its scope.'
Require ($m.runner.invocationCount -eq 1 -and $null -ne $m.runner.exitCode -and $m.runner.exitCode -eq $m.wrapperExitCode) 'Original exit or invocation count was not preserved.'
Require ([DateTimeOffset]::Parse($m.werArmedAtUtc) -le [DateTimeOffset]::Parse($m.runner.startedAtUtc)) 'WER was not armed before the original runner.'
Require ((Hash $m.runner.path) -ceq 'e93a911b6fe175886f3c613214c1dd3f7e4d5ff4c8f3ca96f4d8f91441bfd35d' -and (Hash $m.runner.path) -ceq $m.runner.sha256) 'Original runner bytes differ.'
Require ((Hash $m.executable.path) -ceq $m.executable.sha256) 'Standard executable bytes differ.'
Require ((Hash $m.originalReport.path) -ceq $m.originalReport.sha256) 'Original report bytes differ.'
$report = Get-Content -LiteralPath $m.originalReport.path -Raw -Encoding utf8 | ConvertFrom-Json
Require ($report.sourceSha -ceq $m.sourceSha -and [string]$report.runId -ceq $env:GITHUB_RUN_ID -and [string]$report.runAttempt -ceq $env:GITHUB_RUN_ATTEMPT -and $report.executable.sha256 -ceq $m.executable.sha256) 'Original report binding differs.'
Require (($report.passed -eq $true -and $m.runner.exitCode -eq 0) -or ($report.passed -eq $false -and $m.runner.exitCode -ne 0)) 'Original report outcome differs from original runner exit.'
$before = Get-Content -LiteralPath (Join-Path $directory 'registry-before.json') -Raw | ConvertFrom-Json
$restored = Get-Content -LiteralPath (Join-Path $directory 'registry-restored-values.json') -Raw | ConvertFrom-Json
Require ((ConvertTo-Json -InputObject $before.values -Compress -Depth 12) -ceq (ConvertTo-Json -InputObject $restored -Compress -Depth 12)) 'Registry value readback differs from durable backup.'
Require ((Hash (Join-Path $directory 'registry-before.clixml')) -ceq $m.registryBackup.sha256) 'Registry backup digest differs.'
$receipt = Get-Content -LiteralPath (Join-Path $directory 'registry-restore-receipt.json') -Raw | ConvertFrom-Json
Require ($receipt.restored -eq $true -and @($receipt.errors).Count -eq 0) 'Registry restore receipt is incomplete.'
Write-Host ('Diagnostic integrity verified: {0} complete hashed files; original runner exit {1} is unchanged.' -f $sums.Count, $m.runner.exitCode)
