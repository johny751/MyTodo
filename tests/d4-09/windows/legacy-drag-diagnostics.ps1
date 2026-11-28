[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedExeSha256,
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$OriginalEvidenceDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)

# Supplementary cloud-only diagnostic; original suite outcome remains authoritative.
# Do not invoke locally, dot-source this script, or use real user data.
# The original nine suites, executable, tests and their evidence stay untouched.
if ($env:GITHUB_ACTIONS -cne 'true' -or -not $IsWindows) { throw 'This diagnostic is GitHub Actions Windows only.' }
if (-not [Environment]::Is64BitProcess -or $PSVersionTable.PSVersion.Major -lt 7) { throw '64-bit PowerShell 7+ is required.' }
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$utf8 = [Text.UTF8Encoding]::new($false)
$processTimeoutMs = 180000 # Matches the unchanged d4-04 runner.
$eventWaitMs = 5000       # Bounded best-effort WER/event grace period, never a delivery guarantee.
$iterations = 5            # Fixed count; never retry until green.

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
$original = Full-Existing $OriginalEvidenceDirectory
$output = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\', '/')
Require (Is-Within $exe $runnerTemp) 'The original build executable must be inside RUNNER_TEMP.'
Require (Is-Within $original $runnerTemp) 'The original evidence must be inside RUNNER_TEMP.'
Require ([IO.Path]::GetDirectoryName($output) -ieq $runnerTemp) 'Diagnostic output must be a direct child of RUNNER_TEMP.'
Require ([IO.Path]::GetFileName($output) -cmatch '^d4-legacy-drag-diag-[a-z0-9-]+$') 'Use a d4-legacy-drag-diag-* output name.'
Require (-not (Test-Path -LiteralPath $output)) 'Diagnostic output already exists; never reuse or overwrite prior evidence.'
Assert-NoReparse ([IO.Path]::GetDirectoryName($exe)) $runnerTemp
Require (((Get-Item -LiteralPath $exe).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Executable cannot be a link.'
Assert-NoReparse $original $runnerTemp
Assert-NoReparse $runnerTemp $runnerTemp
$head = (& git -C $repo rev-parse HEAD | Out-String).Trim()
Require ($LASTEXITCODE -eq 0 -and $head -ceq $env:GITHUB_SHA) 'Checkout HEAD differs from authorized Actions source.'
$dirty = (& git -C $repo status --porcelain --untracked-files=no | Out-String).Trim()
Require ($LASTEXITCODE -eq 0 -and -not $dirty) 'Tracked source changes are not admitted.'
$actualExeSha = Hash $exe
Require ($actualExeSha -ceq $ExpectedExeSha256.ToLowerInvariant()) 'Executable SHA-256 does not match the supplied reviewed digest.'
$originalReportPath = Join-Path $original 'native-regression.json'
$originalReportHash = Hash $originalReportPath
$originalReport = Get-Content -LiteralPath $originalReportPath -Raw -Encoding utf8 | ConvertFrom-Json
Require ($originalReport.sourceSha -ceq $head -and [string]$originalReport.runId -ceq $env:GITHUB_RUN_ID -and [string]$originalReport.runAttempt -ceq $env:GITHUB_RUN_ATTEMPT) 'Original nine-suite report is from another source/run/attempt.'
Require ($originalReport.executable.sha256 -ceq $actualExeSha) 'Original nine-suite report identifies another executable.'
Require ($originalReport.executable.name -ceq [IO.Path]::GetFileName($exe)) 'Original report executable name differs.'
Require (@($originalReport.startupGuards).Count -gt 0) 'Original startup guards have not run.'
foreach ($guard in @($originalReport.startupGuards)) { Require ($guard.passed -eq $true) "Original isolation guard failed: $($guard.id)" }
$expectedSuites = @('workspace-96', 'workspace-144', 'legacy-self-test', 'legacy-advanced', 'legacy-catalog', 'legacy-detail', 'legacy-repaint', 'legacy-drag', 'legacy-feedback')
Require (@($originalReport.suites).Count -eq $expectedSuites.Count) 'Original nine-suite run is incomplete; diagnostics do not replace it.'
foreach ($id in $expectedSuites) { Require (@($originalReport.suites | Where-Object { $_.id -ceq $id }).Count -eq 1) "Missing or duplicated original suite: $id" }
$originalDrag = @($originalReport.suites | Where-Object { $_.id -ceq 'legacy-drag' })[0]
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
Require ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'Administrator privileges are required for per-EXE HKLM LocalDumps; do not run a weaker unreported fallback.'

$null = New-Item -ItemType Directory -Path $output
$dumpDirectory = Join-Path $output 'dumps'
$null = New-Item -ItemType Directory -Path $dumpDirectory
$results = [Collections.Generic.List[object]]::new()
$errors = [Collections.Generic.List[string]]::new()
$restoreErrors = [Collections.Generic.List[string]]::new()
$exeName = [IO.Path]::GetFileName($exe)
$manifest = [ordered]@{
    schemaVersion = 1; kind = 'supplementary-legacy-drag-diagnostics'; diagnosticRevision = 1
    sourceSha = $head; runId = $env:GITHUB_RUN_ID; runAttempt = $env:GITHUB_RUN_ATTEMPT
    startedAtUtc = [DateTime]::UtcNow.ToString('o'); completedAtUtc = $null
    script = @{ path = $PSCommandPath; sha256 = Hash $PSCommandPath }
    executable = @{ path = $exe; bytes = (Get-Item -LiteralPath $exe).Length; sha256 = $actualExeSha; originalPdbAvailable = (Test-Path -LiteralPath ([IO.Path]::ChangeExtension($exe, '.pdb'))) }
    originalReport = @{ path = $originalReportPath; sha256 = $originalReportHash; passed = $originalReport.passed; legacyDrag = $originalDrag }
    originalSourceInputs = @('windows/drag-test.c', 'scripts/d4-04-native-regression.mjs', 'scripts/build-windows.mjs' | ForEach-Object { @{ path = $_; sha256 = Hash (Join-Path $repo $_) } })
    processTimeoutMs = $processTimeoutMs; postExitEventWaitMs = $eventWaitMs; requestedIterations = $iterations
    productionAdmission = $false; originalFailureResolved = $false; replacesOriginalSuites = $false
    runResults = $results; fatalErrors = $errors; registryRestorationErrors = $restoreErrors
    limitations = @(
        'Only synthetic, isolated, newly created directories; no real user database or remote synchronization.',
        'The unchanged legacy suite uses programmatic native actions; this is not physical owner acceptance.',
        'No debugger, symbol downloader, minidump writer, PageHeap or product instrumentation is installed or activated.',
        'WER LocalDumps and Application events are best effort; a five-second grace period may miss late or disabled reporting.',
        'The original optimized EXE was built without /Zi and /DEBUG. A dump may have addresses/module offsets without source symbols; this script does not claim to resolve a call stack.',
        'A forced timeout termination normally does not produce a crash dump.',
        'All five fixed repetitions passing does not erase the original access violation or prove a fix.',
        'finally restores scoped registry values on ordinary completion/errors. Agent termination or runner shutdown can interrupt cleanup; the durable backup and recovery instructions remain.'
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
    foreach ($file in @(Get-ChildItem -LiteralPath $dumpDirectory -File -Filter '*.dmp')) {
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

function Run-Iteration([int]$Number) {
    Require ((Hash $exe) -ceq $actualExeSha) 'Executable bytes changed before diagnostic repetition.'
    $directory = Join-Path $output ('iteration-{0:D2}' -f $Number)
    $null = New-Item -ItemType Directory -Path $directory
    $data = Join-Path $directory 'synthetic-data'; $render = Join-Path $directory 'render'
    $null = New-Item -ItemType Directory -Path $data
    $null = New-Item -ItemType Directory -Path $render
    # Exact legacy-drag arguments from scripts/d4-04-native-regression.mjs: no seed, no --visual-dpi override.
    $arguments = @('--data-dir', $data, '--drag-regression', '--drag-render', $render)
    $started = [DateTime]::UtcNow
    $record = [ordered]@{ iteration = $Number; startedAtUtc = $started.ToString('o'); endedAtUtc = $null; args = $arguments; workingDirectory = $repo; gui = $true; environment = 'inherited, matching original runner; no environment overrides'; executableSha256 = $actualExeSha; processId = $null; exitCode = $null; exitCodeHex = $null; timedOut = $false; killed = $false; processStillRunning = $false; processError = $null; outputCaptureComplete = $false; outputErrors = @(); failLines = @(); observedPassed = $false; eventCollection = $null; dumpSnapshot = @() }
    $process = [Diagnostics.Process]::new()
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exe; $info.WorkingDirectory = $repo; $info.UseShellExecute = $false
    $info.CreateNoWindow = $false; $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Normal
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($argument in $arguments) { $info.ArgumentList.Add($argument) }
    $process.StartInfo = $info
    $stdoutPath = Join-Path $directory 'stdout.log'; $stderrPath = Join-Path $directory 'stderr.log'
    $stdoutStream = [IO.File]::Open($stdoutPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $stderrStream = [IO.File]::Open($stderrPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $startedProcess = $false; $copyOut = $null; $copyErr = $null
    Write-Json (Join-Path $directory 'execution.json') $record
    try {
        Require ($process.Start()) 'Native process failed to start.'
        $startedProcess = $true; $record.processId = $process.Id
        $copyOut = $process.StandardOutput.BaseStream.CopyToAsync($stdoutStream)
        $copyErr = $process.StandardError.BaseStream.CopyToAsync($stderrStream)
        Write-Json (Join-Path $directory 'execution.json') $record
        $watch = [Diagnostics.Stopwatch]::StartNew()
        while (-not $process.WaitForExit(250)) {
            if ($watch.ElapsedMilliseconds -ge $processTimeoutMs) {
                $record.timedOut = $true
                try { $process.Kill($true); $record.killed = $true } catch { $record.processError = 'Timeout kill failed: ' + $_.Exception.Message }
                if (-not $process.WaitForExit(5000)) { $record.processStillRunning = $true }
                break
            }
        }
        if ($process.HasExited) {
            $record.exitCode = $process.ExitCode
            $record.exitCodeHex = '0x{0:X8}' -f [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$process.ExitCode), 0)
        }
        foreach ($copy in @($copyOut, $copyErr)) {
            try { if (-not $copy.Wait(5000)) { $record.outputErrors += 'Redirected stream did not finish within five seconds.' } }
            catch { $record.outputErrors += $_.Exception.Message }
        }
        $record.outputCaptureComplete = $copyOut.IsCompletedSuccessfully -and $copyErr.IsCompletedSuccessfully
    } catch { $record.processError = $_.Exception.Message }
    finally {
        if ($startedProcess -and -not $process.HasExited) {
            try { $process.Kill($true); $record.killed = $true; $record.processStillRunning = -not $process.WaitForExit(5000) }
            catch { $record.processStillRunning = $true; $record.outputErrors += 'Final process cleanup: ' + $_.Exception.Message }
        }
        if ($startedProcess) {
            $process.StandardOutput.Dispose(); $process.StandardError.Dispose()
        }
        $stdoutStream.Dispose(); $stderrStream.Dispose(); $process.Dispose()
    }
    $record.endedAtUtc = [DateTime]::UtcNow.ToString('o')
    $record.stdoutSha256 = Hash $stdoutPath; $record.stderrSha256 = Hash $stderrPath
    $stdout = [IO.File]::ReadAllText($stdoutPath, $utf8)
    $record.failLines = @($stdout -split '\r?\n' | Where-Object { $_ -cmatch '^FAIL\b' })
    $summaries = @([regex]::Matches($stdout, '(?m)^DRAG REGRESSION (\d+) checks, (\d+) failures\r?$'))
    $record.summaryComplete = $summaries.Count -eq 1 -and [int]$summaries[0].Groups[1].Value -eq 101 -and [int]$summaries[0].Groups[2].Value -eq 0
    $record.expectedCheckCount = 101
    $record.stdoutTail = @($stdout -split '\r?\n' | Where-Object { $_ -ne '' } | Select-Object -Last 12)
    $record.observedPassed = $record.exitCode -eq 0 -and -not $record.timedOut -and -not $record.processStillRunning -and $null -eq $record.processError -and $record.outputCaptureComplete -and $record.failLines.Count -eq 0 -and $record.summaryComplete
    # Wait only after the target process exits; pending WER/event records may still arrive after this bounded window.
    $wait = [Diagnostics.Stopwatch]::StartNew()
    while ($wait.ElapsedMilliseconds -lt $eventWaitMs) { Start-Sleep -Milliseconds ([int][Math]::Max(1, [Math]::Min(250, $eventWaitMs - $wait.ElapsedMilliseconds))) }
    $record.actualPostExitWaitMs = $wait.ElapsedMilliseconds
    $record.eventCollection = Collect-Events $directory $started ([DateTime]::UtcNow) $(if ($null -eq $record.processId) { 0 } else { $record.processId })
    $record.dumpSnapshot = @(Snapshot-Dumps)
    Write-Json (Join-Path $directory 'execution.json') $record
    $results.Add($record)
    Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
    Write-Host ('Diagnostic iteration {0}: exit={1}; timeout={2}; observedPassed={3}; original failure remains unresolved.' -f $Number, $record.exitCodeHex, $record.timedOut, $record.observedPassed)
    Require (-not $record.processStillRunning) 'A diagnostic process survived cleanup; remaining repetitions must not start.'
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
    if (-not $localDumpsExisted) { $local = $registryParent.CreateSubKey('LocalDumps', $true); $local.Dispose(); $localDumpsCreated = $true }
    if (-not $imageExisted) { $imageKey = $registryBase.CreateSubKey($imagePath, $true); $imageCreated = $true }
    $registryTouched = $true
    $imageKey.SetValue('DumpFolder', $dumpDirectory, [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $imageKey.SetValue('DumpCount', 10, [Microsoft.Win32.RegistryValueKind]::DWord)
    $imageKey.SetValue('DumpType', 2, [Microsoft.Win32.RegistryValueKind]::DWord)
    $imageKey.Flush()
    Write-Json (Join-Path $output 'registry-active.json') @($valueNames | ForEach-Object { Read-RegistryValue $imageKey $_ })
    for ($number = 1; $number -le $iterations; $number++) { Run-Iteration $number }
} catch { $errors.Add($_.ToString()) }
finally {
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
    if ($null -ne $imageKey) { $imageKey.Dispose(); $imageKey = $null }
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
    if ($null -ne $registryParent) { $registryParent.Dispose() }
    if ($null -ne $registryBase) { $registryBase.Dispose() }
    try { Require ((Hash $exe) -ceq $actualExeSha) 'Original executable bytes changed during diagnostics.'; Require ((Hash $originalReportPath) -ceq $originalReportHash) 'Original regression report changed during diagnostics.' }
    catch { $errors.Add($_.Exception.Message) }
    $manifest.completedAtUtc = [DateTime]::UtcNow.ToString('o')
    $manifest.registryRestored = $null -ne $backup -and $restoreErrors.Count -eq 0
    $manifest.completedIterations = $results.Count
    $manifest.allRepetitionsObservedPass = $results.Count -eq $iterations -and @($results | Where-Object { -not $_.observedPassed }).Count -eq 0
    $manifest.originalFailureResolved = $false
    try { $manifest.finalDumpInventory = @(Snapshot-Dumps) } catch { $errors.Add('Final dump inventory: ' + $_.Exception.Message) }
    Write-Json (Join-Path $output 'registry-restore-receipt.json') @{ restored = $manifest.registryRestored; errors = $restoreErrors.ToArray(); atUtc = [DateTime]::UtcNow.ToString('o'); newImageKeyCreated = $imageCreated; newLocalDumpsParentCreated = $localDumpsCreated }
    Write-Json (Join-Path $output 'diagnostic-manifest.json') $manifest
    $files = @(Get-ChildItem -LiteralPath $output -Force -File -Recurse | Where-Object { $_.Name -ne 'SHA256SUMS.txt' })
    $lines = foreach ($file in $files) { try { (Hash $file.FullName) + '  ' + [IO.Path]::GetRelativePath($output, $file.FullName).Replace('\', '/') } catch { '# UNHASHED ' + [IO.Path]::GetRelativePath($output, $file.FullName) + ' : ' + $_.Exception.Message } }
    [IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), [string[]]$lines, $utf8)
}

if ($errors.Count -gt 0 -or $restoreErrors.Count -gt 0 -or $results.Count -ne $iterations) { exit 2 }
if (@($results | Where-Object { -not $_.observedPassed }).Count -gt 0) { exit 1 }
# Exit zero means only that these supplementary executions passed. Original failure/admission is unchanged.
exit 0
