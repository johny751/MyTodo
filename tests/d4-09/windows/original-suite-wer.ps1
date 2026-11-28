[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedExeSha256,
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$NodePath,
    [Parameter(Mandatory)][string]$OriginalEvidenceDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)

# D4-09 admitted CI wrapper: invoke only on the authorized GitHub Actions Windows job; never dot-source locally.
# WER is armed BEFORE exactly one unchanged original nine-suite invocation.
# The wrapper propagates the original runner exit exactly once that runner returns.
# A separate always() diagnostic-integrity gate MUST inspect diagnosticsComplete.
if ($env:GITHUB_ACTIONS -cne 'true' -or -not $IsWindows) { throw 'GitHub Actions Windows only.' }
if (-not [Environment]::Is64BitProcess -or $PSVersionTable.PSVersion.Major -lt 7) { throw '64-bit PowerShell 7+ is required.' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$utf8 = [Text.UTF8Encoding]::new($false)
$eventWaitMs = 10000 # Bounded best effort; unchanged runner has its own 180000ms per-process timeout.
$expectedRunnerSha256 = 'e93a911b6fe175886f3c613214c1dd3f7e4d5ff4c8f3ca96f4d8f91441bfd35d'
function Require($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject $Value -Depth 40) + "`n", $utf8)
}
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Full-Existing([string]$Path) { (Get-Item -LiteralPath $Path -Force).FullName.TrimEnd('\', '/') }
function Is-Within([string]$Path, [string]$Root) {
    $Path.StartsWith($Root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-NoReparse([string]$Path, [string]$StopAt) {
    $cursor = Get-Item -LiteralPath $Path -Force
    while ($null -ne $cursor) {
        Require (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) "Reparse-point path is not admitted: $($cursor.FullName)"
        if ($cursor.FullName.TrimEnd('\', '/') -ieq $StopAt.TrimEnd('\', '/')) { return }
        $cursor = $cursor.Parent
    }
    throw "Path did not reach its required root: $Path"
}


foreach ($name in @('GITHUB_SHA', 'EXPECTED_SOURCE_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RUNNER_TEMP')) {
    Require (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) "Missing $name"
}
Require ($env:GITHUB_SHA -cmatch '^[a-f0-9]{40}$' -and $env:EXPECTED_SOURCE_SHA -ceq $env:GITHUB_SHA) 'Exact source authorization is missing.'
Require ($env:GITHUB_RUN_ID -match '^\d+$' -and $env:GITHUB_RUN_ATTEMPT -match '^\d+$') 'Exact Actions run identity is missing.'
$repo = Full-Existing $SourceRoot
$runnerTemp = Full-Existing $env:RUNNER_TEMP
$exe = Full-Existing $ExePath
$node = Full-Existing $NodePath
$runner = Full-Existing (Join-Path $repo 'scripts/d4-04-native-regression.mjs')
$original = [IO.Path]::GetFullPath($OriginalEvidenceDirectory).TrimEnd('\', '/')
$output = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\', '/')
Require (Is-Within $exe $runnerTemp) 'Original executable must be inside RUNNER_TEMP.'
Require ([IO.Path]::GetDirectoryName($original) -ieq $runnerTemp) 'Original evidence must be a direct RUNNER_TEMP child.'
Require ([IO.Path]::GetFileName($original) -cmatch '^d4-[a-z0-9-]+$') 'Original evidence must use d4-* naming.'
Require ([IO.Path]::GetDirectoryName($output) -ieq $runnerTemp) 'Diagnostic output must be a direct RUNNER_TEMP child.'
Require ([IO.Path]::GetFileName($output) -cmatch '^d4-original-suite-diag-[a-z0-9-]+$') 'Use a new d4-original-suite-diag-* output name.'
Require ($original -ine $output) 'Original and diagnostic outputs must differ.'
Require (-not (Test-Path -LiteralPath $original) -and -not (Test-Path -LiteralPath $output)) 'Never reuse or overwrite original or diagnostic evidence.'
Assert-NoReparse ([IO.Path]::GetDirectoryName($exe)) $runnerTemp
Require (((Get-Item -LiteralPath $exe).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Executable cannot be a link.'
Assert-NoReparse ([IO.Path]::GetDirectoryName($runner)) $repo
Require (((Get-Item -LiteralPath $runner).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Original runner cannot be a link.'
Assert-NoReparse $runnerTemp $runnerTemp
$head = (& git -C $repo rev-parse HEAD | Out-String).Trim()
Require ($LASTEXITCODE -eq 0 -and $head -ceq $env:GITHUB_SHA) 'Checkout HEAD differs from authorized source.'
$dirty = (& git -C $repo status --porcelain --untracked-files=no | Out-String).Trim()
Require ($LASTEXITCODE -eq 0 -and -not $dirty) 'Tracked source changes are not admitted.'
Require ((Hash $runner) -ceq $expectedRunnerSha256) 'Original runner bytes differ from the frozen nine-suite runner.'
$actualExeSha = Hash $exe
Require ($actualExeSha -ceq $ExpectedExeSha256.ToLowerInvariant()) 'Original executable hash differs.'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
Require ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Administrator required for scoped HKLM64 LocalDumps.'
$null = New-Item -ItemType Directory -Path $output
$dumpDirectory = Join-Path $output 'dumps'
$null = New-Item -ItemType Directory -Path $dumpDirectory
$errors = [Collections.Generic.List[string]]::new()
$restoreErrors = [Collections.Generic.List[string]]::new()
$exeName = [IO.Path]::GetFileName($exe)
$runnerExitCode = $null
$runnerStartedAtUtc = $null
$originalReportPath = Join-Path $original 'native-regression.json'
$originalReportHash = $null
$manifest = [ordered]@{
    schemaVersion = 1; kind = 'original-nine-suite-wer-wrapper'; diagnosticRevision = 1
    sourceSha = $head; runId = $env:GITHUB_RUN_ID; runAttempt = $env:GITHUB_RUN_ATTEMPT
    startedAtUtc = [DateTime]::UtcNow.ToString('o'); completedAtUtc = $null
    script = @{ path = $PSCommandPath; sha256 = Hash $PSCommandPath }
    executable = @{ path = $exe; bytes = (Get-Item -LiteralPath $exe).Length; sha256 = $actualExeSha }
    node = @{ path = $node; sha256 = Hash $node }
    runner = @{ path = $runner; sha256 = $expectedRunnerSha256; arguments = @($runner, $exe, $original); workingDirectory = $repo; environment = 'inherited; no product environment override'; invocationCount = 0; startedAtUtc = $null; endedAtUtc = $null; exitCode = $null }
    originalSourceInputs = @('windows/drag-test.c', 'scripts/d4-04-native-regression.mjs', 'scripts/build-windows.mjs' | ForEach-Object { @{ path = $_; sha256 = Hash (Join-Path $repo $_) } })
    originalReport = $null; originalEvidenceDirectory = $original
    werArmedAtUtc = $null; postExitEventWaitMs = $eventWaitMs
    productionAdmission = $false; originalFailureResolved = $false; replacesOriginalSuites = $false
    diagnosticsComplete = $false; registryRestored = $false
    fatalErrors = $errors; registryRestorationErrors = $restoreErrors
    limitations = @(
        'One unchanged original runner invocation only. No replay/retry or test modification.',
        'Original runner owns synthetic isolated data, startup guards, suite order, arguments and per-process timeouts.',
        'WER is armed before original startup. Dumps/events remain best effort, including timeout and cancellation limitations.',
        'Standard EXE is unmodified. No debugger, symbol download, product instrumentation or diagnostic executable substitution.',
        'Raw original reports and process stdout/stderr remain at the original runner output directory and must be uploaded separately.',
        'Original runner exit is propagated exactly; diagnostic-integrity failure must be checked in a separate always() gate.',
        'finally restores only three scoped values. Runner shutdown/cancellation may interrupt cleanup; durable registry backup is retained.',
        'A successful new original run does not establish root cause or erase historical original failures.'
    )
}
Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
# Only these three per-image settings are written. Other values and all sibling image keys are untouched.
# Microsoft: https://learn.microsoft.com/windows/win32/wer/collecting-user-mode-dumps
$werPath = 'SOFTWARE\Microsoft\Windows\Windows Error Reporting'
$localDumpsPath = $werPath + '\LocalDumps'
$imagePath = $localDumpsPath + '\' + $exeName
$valueNames = @('DumpFolder', 'DumpCount', 'DumpType')
$registryBase = $null; $registryParent = $null; $imageKey = $null
$backup = $null; $registryTouched = $false; $localDumpsCreated = $false; $imageCreated = $false

function Read-RegistryValue($Key, [string]$Name) {
    if ($null -eq $Key -or $Key.GetValueNames() -notcontains $Name) { return [pscustomobject]@{ name = $Name; existed = $false; kind = $null; value = $null } }
    return [pscustomobject]@{ name = $Name; existed = $true; kind = $Key.GetValueKind($Name).ToString(); value = $Key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
}
function Registry-Equal($Left, $Right) {
    if ($Left.existed -ne $Right.existed -or $Left.kind -cne $Right.kind) { return $false }
    if (-not $Left.existed) { return $true }
    return (ConvertTo-Json -InputObject $Left.value -Compress -Depth 10) -ceq (ConvertTo-Json -InputObject $Right.value -Compress -Depth 10)
}
function Snapshot-Dumps {
    $rows = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $dumpDirectory -Force -File -Filter '*.dmp')) {
        $row = [ordered]@{ name = $file.Name; bytes = $file.Length; lastWriteUtc = $file.LastWriteTimeUtc.ToString('o'); sha256 = $null; hashError = $null }
        try { $row.sha256 = Hash $file.FullName } catch { $row.hashError = $_.Exception.Message }
        $fresh = Get-Item -LiteralPath $file.FullName
        $row.observedStableDuringHash = $fresh.Length -eq $file.Length -and $fresh.LastWriteTimeUtc -eq $file.LastWriteTimeUtc
        $rows += $row
    }
    return $rows
}
function Collect-Events([string]$Directory, [DateTime]$StartedAtUtc, [DateTime]$EndedAtUtc, [int]$ProcessId) {
    $eventRows = [Collections.Generic.List[object]]::new()
    $record = [ordered]@{ queryStartedAtUtc = [DateTime]::UtcNow.ToString('o'); processId = $ProcessId; windowStartUtc = $StartedAtUtc.AddSeconds(-2).ToString('o'); windowEndUtc = $EndedAtUtc.ToString('o'); matchingEvents = $eventRows; scanned = 0; maxRecords = 256; truncated = $false; error = $null }
    $reader = $null; $watch = [Diagnostics.Stopwatch]::StartNew()
    try {
        $from = $StartedAtUtc.AddSeconds(-2).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        $until = $EndedAtUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        $xpath = "*[System[(EventID=1000 or EventID=1001) and (Provider[@Name='Application Error'] or Provider[@Name='Windows Error Reporting']) and TimeCreated[@SystemTime >= '$from' and @SystemTime <= '$until']]]"
        $query = [Diagnostics.Eventing.Reader.EventLogQuery]::new('Application', [Diagnostics.Eventing.Reader.PathType]::LogName, $xpath)
        $reader = [Diagnostics.Eventing.Reader.EventLogReader]::new($query)
        while ($record.scanned -lt 256 -and $watch.ElapsedMilliseconds -lt 10000) {
            $event = $reader.ReadEvent([TimeSpan]::FromMilliseconds(250))
            if ($null -eq $event) { break }
            try {
                $record.scanned++
                $xml = $event.ToXml()
                if ($xml.IndexOf($exeName, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
                $name = 'application-event-' + $event.RecordId + '.xml'
                $path = Join-Path $Directory $name
                [IO.File]::WriteAllText($path, $xml, $utf8)
                $message = $null
                try { $message = $event.FormatDescription() } catch { $message = 'Description unavailable; raw XML retained.' }
                $eventRows.Add([ordered]@{ file = $name; sha256 = Hash $path; recordId = $event.RecordId; provider = $event.ProviderName; eventId = $event.Id; timeCreatedUtc = $event.TimeCreated.ToUniversalTime().ToString('o'); exactExePathAppears = $xml.IndexOf($exe, [StringComparison]::OrdinalIgnoreCase) -ge 0; attribution = 'EXE name and bounded time window; inspect raw EventData for faulting process ID before attribution'; message = $message })
            } finally { $event.Dispose() }
        }
        $record.truncated = $record.scanned -ge 256 -or $watch.ElapsedMilliseconds -ge 10000
    } catch { $record.error = $_.Exception.Message }
    finally { if ($null -ne $reader) { $reader.Dispose() } }
    $record.queryDurationMs = $watch.ElapsedMilliseconds
    Write-Json (Join-Path $Directory 'application-events.json') $record
    return $record
}

try {
    $registryBase = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
    $registryParent = $registryBase.OpenSubKey($werPath, $true)
    Require ($null -ne $registryParent) 'Expected existing WER parent key is unavailable; no broad registry path creation is allowed.'
    $local = $registryBase.OpenSubKey($localDumpsPath, $true)
    $localDumpsExisted = $null -ne $local
    if ($null -ne $local) { $local.Dispose() }
    $imageKey = $registryBase.OpenSubKey($imagePath, $true)
    $imageExisted = $null -ne $imageKey
    $values = @($valueNames | ForEach-Object { Read-RegistryValue $imageKey $_ })
    $backup = [pscustomobject]@{ hive = 'HKEY_LOCAL_MACHINE'; registryView = 'Registry64'; key = $imagePath; localDumpsParentExisted = $localDumpsExisted; imageKeyExisted = $imageExisted; values = $values; capturedAtUtc = [DateTime]::UtcNow.ToString('o') }
    # CLIXML retains original numeric/binary/multistring value types. JSON is the human-readable mirror.
    $backup | Export-Clixml -LiteralPath (Join-Path $output 'registry-before.clixml') -Depth 12 -Encoding utf8
    Write-Json (Join-Path $output 'registry-before.json') $backup
    $manifest.registryBackup = @{ file = 'registry-before.clixml'; sha256 = Hash (Join-Path $output 'registry-before.clixml'); key = 'HKLM64\' + $imagePath }
    Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
    if (-not $localDumpsExisted) { $local = $registryParent.CreateSubKey('LocalDumps', $true); $localDumpsCreated = $true; $local.Dispose() }
    if (-not $imageExisted) { $imageKey = $registryBase.CreateSubKey($imagePath, $true); $imageCreated = $true }
    $registryTouched = $true
    $imageKey.SetValue('DumpFolder', $dumpDirectory, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $imageKey.SetValue('DumpCount', 32, [Microsoft.Win32.RegistryValueKind]::DWord)
    $imageKey.SetValue('DumpType', 2, [Microsoft.Win32.RegistryValueKind]::DWord)
    $imageKey.Flush()
    Write-Json (Join-Path $output 'registry-active.json') @($valueNames | ForEach-Object { Read-RegistryValue $imageKey $_ })
    $active = @($valueNames | ForEach-Object { Read-RegistryValue $imageKey $_ })
    Require ($active[0].existed -and $active[0].kind -ceq 'ExpandString' -and $active[0].value -ceq $dumpDirectory) 'DumpFolder readback differs.'
    Require ($active[1].existed -and $active[1].kind -ceq 'DWord' -and $active[1].value -eq 32) 'DumpCount readback differs.'
    Require ($active[2].existed -and $active[2].kind -ceq 'DWord' -and $active[2].value -eq 2) 'DumpType readback differs.'
    $manifest.werArmedAtUtc = [DateTime]::UtcNow.ToString('o')
    Require ((Hash $exe) -ceq $actualExeSha -and (Hash $runner) -ceq $expectedRunnerSha256) 'Executable or runner changed before launch.'
    $runnerStartedAtUtc = [DateTime]::UtcNow
    $manifest.runner.startedAtUtc = $runnerStartedAtUtc.ToString('o')
    $manifest.runner.invocationCount = 1
    Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
    Push-Location -LiteralPath $repo
    try {
        # Preserve original direct Node invocation and console output. The runner itself
        # captures each child process stdout/stderr/exit into original evidence.
        & $node $runner $exe $original
        $runnerExitCode = [int]$LASTEXITCODE
        $manifest.runner.exitCode = $runnerExitCode
    } finally {
        $manifest.runner.endedAtUtc = [DateTime]::UtcNow.ToString('o')
        Pop-Location
    }
    # Snapshot original bytes immediately; never rewrite the runner's files.
    if (Test-Path -LiteralPath $originalReportPath) {
        $originalReportHash = Hash $originalReportPath
        $originalReport = Get-Content -LiteralPath $originalReportPath -Raw -Encoding utf8 | ConvertFrom-Json
        $manifest.originalReport = @{ path = $originalReportPath; sha256 = $originalReportHash; passed = $originalReport.passed }
        Require ($originalReport.sourceSha -ceq $head -and [string]$originalReport.runId -ceq $env:GITHUB_RUN_ID -and [string]$originalReport.runAttempt -ceq $env:GITHUB_RUN_ATTEMPT) 'Original report run/source binding differs.'
        Require ($originalReport.executable.sha256 -ceq $actualExeSha -and $originalReport.executable.name -ceq $exeName) 'Original report executable binding differs.'
        $expectedSuites = @('workspace-96', 'workspace-144', 'legacy-self-test', 'legacy-advanced', 'legacy-catalog', 'legacy-detail', 'legacy-repaint', 'legacy-drag', 'legacy-feedback')
        Require (@($originalReport.suites).Count -eq 9 -and @($originalReport.startupGuards).Count -eq 10) 'Original run is incomplete.'
        for ($i = 0; $i -lt 9; $i++) { Require ($originalReport.suites[$i].id -ceq $expectedSuites[$i]) 'Original suite order differs.' }
        $manifest.originalReport.legacyDrag = @($originalReport.suites | Where-Object { $_.id -ceq 'legacy-drag' })[0]
    } else { throw 'Original runner did not leave its report; original exit is still retained.' }
} catch { $errors.Add($_.ToString()) }
finally {
    # Collect while the scoped WER key remains active, even when original runner failed.
    if ($null -ne $runnerStartedAtUtc) {
        try {
            $wait = [Diagnostics.Stopwatch]::StartNew()
            while ($wait.ElapsedMilliseconds -lt $eventWaitMs) { Start-Sleep -Milliseconds ([int][Math]::Max(1, [Math]::Min(250, $eventWaitMs - $wait.ElapsedMilliseconds))) }
            $manifest.actualPostExitWaitMs = $wait.ElapsedMilliseconds
            # PID=0 means several children; XML attribution requires exact EXE/time/PID inspection.
            $manifest.eventCollection = Collect-Events $output $runnerStartedAtUtc ([DateTime]::UtcNow) 0
            if ($null -ne $manifest.eventCollection.error) { $errors.Add('Event query returned an error: ' + $manifest.eventCollection.error) }
        } catch { $errors.Add('Event collection: ' + $_.Exception.Message) }
    }
    if ($null -ne $backup -and ($registryTouched -or $imageCreated)) {
        foreach ($before in $backup.values) {
            try {
                if ($before.existed) { $imageKey.SetValue($before.name, $before.value, [Enum]::Parse([Microsoft.Win32.RegistryValueKind], $before.kind)) }
                else { $imageKey.DeleteValue($before.name, $false) }
            } catch { $restoreErrors.Add('Restore ' + $before.name + ': ' + $_.Exception.Message) }
        }
        try {
            $imageKey.Flush()
            $afterValues = @($valueNames | ForEach-Object { Read-RegistryValue $imageKey $_ })
            for ($i = 0; $i -lt $backup.values.Count; $i++) { Require (Registry-Equal $backup.values[$i] $afterValues[$i]) ('Registry restore mismatch: ' + $backup.values[$i].name) }
            Write-Json (Join-Path $output 'registry-restored-values.json') $afterValues
        } catch { $restoreErrors.Add('Verify restored values: ' + $_.Exception.Message) }
    }
    if ($null -ne $imageKey) { try { $imageKey.Dispose() } catch { $restoreErrors.Add('Dispose image key: ' + $_.Exception.Message) }; $imageKey = $null }
    if ($null -ne $registryBase -and $imageCreated) {
        try {
            $key = $registryBase.OpenSubKey($imagePath)
            if ($null -ne $key) {
                $empty = $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0; $key.Dispose()
                Require $empty 'New image key contains unexpected values/subkeys; preserving it instead of recursive deletion.'
                $registryBase.DeleteSubKey($imagePath, $false)
            }
        } catch { $restoreErrors.Add('Remove newly created empty image key: ' + $_.Exception.Message) }
    }
    if ($null -ne $registryBase -and $localDumpsCreated) {
        try {
            $key = $registryBase.OpenSubKey($localDumpsPath)
            if ($null -ne $key) {
                $empty = $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0; $key.Dispose()
                Require $empty 'New LocalDumps parent is no longer empty; preserving it instead of recursive deletion.'
                $registryBase.DeleteSubKey($localDumpsPath, $false)
            }
        } catch { $restoreErrors.Add('Remove newly created empty LocalDumps parent: ' + $_.Exception.Message) }
    }
    if ($null -ne $registryParent) { try { $registryParent.Dispose() } catch { $restoreErrors.Add('Dispose WER parent: ' + $_.Exception.Message) } }
    if ($null -ne $registryBase) { try { $registryBase.Dispose() } catch { $restoreErrors.Add('Dispose registry base: ' + $_.Exception.Message) } }
    try {
        Require ((Hash $exe) -ceq $actualExeSha) 'Original executable bytes changed.'
        Require ((Hash $runner) -ceq $expectedRunnerSha256) 'Original runner bytes changed.'
        if ($null -ne $originalReportHash) { Require ((Hash $originalReportPath) -ceq $originalReportHash) 'Original report bytes changed.' }
        $manifest.originalFiles = @()
        if (Test-Path -LiteralPath $original) {
            $manifest.originalFiles = @(Get-ChildItem -LiteralPath $original -File -Recurse -Force | Sort-Object FullName | ForEach-Object { @{ file = [IO.Path]::GetRelativePath($original, $_.FullName).Replace('\', '/'); bytes = $_.Length; sha256 = Hash $_.FullName } })
        }
    } catch { $errors.Add('Preservation/inventory: ' + $_.Exception.Message) }
    $manifest.registryRestored = $null -ne $backup -and $restoreErrors.Count -eq 0
    try {
        $manifest.finalDumpInventory = @(Snapshot-Dumps)
        foreach ($dump in $manifest.finalDumpInventory) { Require ($null -eq $dump.hashError -and $dump.observedStableDuringHash) ('Dump was unhashable or changed while hashing: ' + $dump.name) }
    } catch { $errors.Add('Final dump inventory: ' + $_.Exception.Message) }
    $manifest.completedAtUtc = [DateTime]::UtcNow.ToString('o')
    $manifest.diagnosticsComplete = $null -ne $runnerExitCode -and $null -ne $originalReportHash -and $errors.Count -eq 0 -and $manifest.registryRestored
    $manifest.wrapperExitCode = $(if ($null -ne $runnerExitCode) { $runnerExitCode } else { 2 })
    try {
        Write-Json (Join-Path $output 'registry-restore-receipt.json') @{ restored = $manifest.registryRestored; errors = $restoreErrors.ToArray(); atUtc = [DateTime]::UtcNow.ToString('o'); newImageKeyCreated = $imageCreated; newLocalDumpsParentCreated = $localDumpsCreated }
        Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
        $files = @(Get-ChildItem -LiteralPath $output -Force -File -Recurse | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object FullName)
        $lines = foreach ($file in $files) { try { (Hash $file.FullName) + '  ' + [IO.Path]::GetRelativePath($output, $file.FullName).Replace('\', '/') } catch { '# UNHASHED ' + [IO.Path]::GetRelativePath($output, $file.FullName) + ' : ' + $_.Exception.Message } }
        [IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), [string[]]$lines, $utf8)
    } catch { Write-Host ('Diagnostic persistence failed: ' + $_.Exception.Message) }
}
if ($null -ne $runnerExitCode) { exit $runnerExitCode }
exit 2
