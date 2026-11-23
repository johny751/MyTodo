[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Windows', 'Web', 'Android')]
    [string]$Mode,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-fA-F0-9]{40}$')]
    [string]$ExpectedSourceSha,

    [switch]$FinalizeOnly,
    [string]$PriorJobStatus = 'unknown'
)

# This script intentionally cannot be used as a local build/test entry point.
if ($env:GITHUB_ACTIONS -ne 'true') {
    throw 'phase0-baseline.ps1 runs only on GitHub Actions; local execution is forbidden.'
}
$ErrorActionPreference = 'Stop'
if (-not $env:RUNNER_TEMP -or -not [IO.Path]::IsPathRooted($env:RUNNER_TEMP)) {
    throw 'GitHub RUNNER_TEMP must be an absolute path.'
}
$script:modeName = $Mode.ToLowerInvariant()
$script:evidence = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP ('mytodo-phase0-' + $script:modeName)))
$script:sourceRoot = if ($env:GITHUB_WORKSPACE) { [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE) } else { $null }
$script:receiptPath = Join-Path $script:evidence 'run-receipt.json'
$script:cases = [Collections.Generic.List[object]]::new()
$script:receipt = $null
$script:tools = @{}
$script:childEnvironment = @{}
$script:adapterPath = $null
$ExpectedSourceSha = $ExpectedSourceSha.ToLowerInvariant()
[IO.Directory]::CreateDirectory($script:evidence) | Out-Null

function Utc-Now { [DateTime]::UtcNow.ToString('o') }

function Write-JsonFile {
    param([string]$Path, $Value)
    $temporary = $Path + '.tmp-' + [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $Value -Depth 20), [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporary, $Path, $true)
}

function New-Case {
    param([string]$Id, [string]$Kind, [bool]$Required = $true)
    [ordered]@{
        id = $Id; kind = $Kind; required = $Required; status = 'not_run'
        startedAt = $null; finishedAt = $null; durationMs = $null; exitCode = $null
        executable = $null; arguments = @(); processId = $null
        execution = $null
        stdoutLog = $null; stderrLog = $null; timeoutMs = $null
        failureCategory = $null; reason = $null; captureIncomplete = $false
    }
}

function Find-Case {
    param([string]$Id)
    foreach ($item in $script:cases) { if ($item.id -eq $Id) { return $item } }
    throw "Unplanned case: $Id"
}

function Save-Evidence {
    if ($null -eq $script:receipt) { return }
    $script:receipt.updatedAt = Utc-Now
    $script:receipt.cases = $script:cases.ToArray()
    Write-JsonFile $script:receiptPath $script:receipt
    Write-JsonFile (Join-Path $script:evidence 'case-results.json') $script:cases.ToArray()
    Write-JsonFile (Join-Path $script:evidence 'artifacts.json') $script:receipt.artifacts
}

function Fail-Phase {
    param([string]$Category, [string]$Message)
    $problem = [InvalidOperationException]::new($Message)
    $problem.Data['Category'] = $Category
    throw $problem
}

function Start-Case {
    param($Item)
    if ($Item.status -ne 'not_run') { Fail-Phase 'source' ('Case was already attempted: ' + $Item.id) }
    $Item.status = 'running'
    $Item.startedAt = Utc-Now
    Save-Evidence
}

function Invoke-InternalCase {
    param([string]$Id, [string]$Category, [scriptblock]$Action)
    $item = Find-Case $Id
    $item.execution = 'powershell-validation-or-packaging'
    $item.stdoutLog = $Id + '.stdout.log'
    $item.stderrLog = $Id + '.stderr.log'
    Start-Case $item
    $clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $Action | Out-Null
        $item.status = 'passed'
        $item.exitCode = 0 # The PowerShell validation/packaging action completed.
        [IO.File]::WriteAllText((Join-Path $script:evidence $item.stdoutLog), ($Id + ': PowerShell action completed successfully.'), [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $script:evidence $item.stderrLog), '', [Text.UTF8Encoding]::new($false))
    } catch {
        $item.status = 'failed'
        $item.exitCode = 1 # Validation result; this is not a native process exit.
        $item.failureCategory = if ($_.Exception.Data['Category']) { [string]$_.Exception.Data['Category'] } else { $Category }
        $item.reason = $_.Exception.Message
        [IO.File]::WriteAllText((Join-Path $script:evidence $item.stdoutLog), ($Id + ': PowerShell action failed; inspect the case receipt and nested command logs.'), [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $script:evidence $item.stderrLog), $item.reason, [Text.UTF8Encoding]::new($false))
        if (-not $_.Exception.Data['Category']) { $_.Exception.Data['Category'] = $Category }
        throw
    } finally {
        $clock.Stop()
        $item.finishedAt = Utc-Now
        $item.durationMs = $clock.ElapsedMilliseconds
        Save-Evidence
        Write-Host ($item.id + ': ' + $item.status + ' exit=' + $item.exitCode)
    }
}

function Invoke-NativeCase {
    param(
        [string]$Id, [string]$Executable, [string[]]$Arguments,
        [int]$TimeoutMs = 30000, [string]$Category = 'test',
        [hashtable]$Environment = @{}, [switch]$OptionalProbe
    )
    if ($OptionalProbe) {
        $script:cases.Add((New-Case $Id 'tool-probe' $false))
    }
    $item = Find-Case $Id
    $item.execution = 'native-process'
    $item.executable = $Executable
    $item.arguments = @($Arguments)
    $item.timeoutMs = $TimeoutMs
    $item.stdoutLog = $Id + '.stdout.log'
    $item.stderrLog = $Id + '.stderr.log'
    Start-Case $item
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $process = [Diagnostics.Process]::new()
    $outStream = $null; $errStream = $null; $outTask = $null; $errTask = $null
    $nativeExit = $null; $timedOut = $false; $started = $false
    try {
        if (-not $Executable -or -not [IO.File]::Exists($Executable)) {
            Fail-Phase 'missingTool' ('Executable is missing: ' + $Executable)
        }
        $start = [Diagnostics.ProcessStartInfo]::new()
        $start.FileName = $Executable
        $start.WorkingDirectory = if ($script:sourceRoot -and [IO.Directory]::Exists($script:sourceRoot)) { $script:sourceRoot } else { $script:evidence }
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        foreach ($argument in $Arguments) { $start.ArgumentList.Add([string]$argument) }
        foreach ($key in $script:childEnvironment.Keys) { $start.Environment[$key] = [string]$script:childEnvironment[$key] }
        foreach ($key in $Environment.Keys) { $start.Environment[$key] = [string]$Environment[$key] }
        $process.StartInfo = $start
        $outStream = [IO.FileStream]::new((Join-Path $script:evidence $item.stdoutLog), [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::Read, 8192, [IO.FileOptions]::Asynchronous)
        $errStream = [IO.FileStream]::new((Join-Path $script:evidence $item.stderrLog), [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::Read, 8192, [IO.FileOptions]::Asynchronous)
        $started = $process.Start()
        if (-not $started) { Fail-Phase $Category ('Process did not start: ' + $Id) }
        $item.processId = $process.Id
        Save-Evidence
        # Direct asynchronous copies retain partial output if a command times out.
        # No background PowerShell event ScriptBlocks or shell interpolation are used.
        $outTask = $process.StandardOutput.BaseStream.CopyToAsync($outStream)
        $errTask = $process.StandardError.BaseStream.CopyToAsync($errStream)
        if ($process.WaitForExit($TimeoutMs)) {
            $nativeExit = $process.ExitCode
        } else {
            $timedOut = $true
            $item.status = 'timeout'
            $item.reason = 'process_timeout'
            # Only this newly-created process and its descendants may be killed.
            try { if (-not $process.HasExited) { $process.Kill($true) } } catch { $item.reason += '; tree termination: ' + $_.Exception.Message }
            $null = $process.WaitForExit(10000)
        }
        foreach ($task in @($outTask, $errTask)) {
            try { if (-not $task.Wait(10000)) { $item.captureIncomplete = $true } }
            catch { $item.captureIncomplete = $true; $item.reason = 'output_capture_failed: ' + $_.Exception.Message }
        }
        if ($timedOut) {
            $item.status = 'timeout'; $item.exitCode = $null; $item.failureCategory = $Category
        } elseif ($item.captureIncomplete) {
            $item.status = 'failed'; $item.exitCode = $nativeExit; $item.failureCategory = $Category
            if (-not $item.reason) { $item.reason = 'output_capture_timeout' }
        } else {
            $item.exitCode = $nativeExit
            $item.status = if ($nativeExit -eq 0) { 'passed' } else { 'failed' }
            if ($nativeExit -ne 0) { $item.failureCategory = $Category; $item.reason = 'native_nonzero_exit' }
        }
    } catch {
        if ($item.status -eq 'running') { $item.status = 'failed' }
        $item.exitCode = $nativeExit
        $item.failureCategory = if ($_.Exception.Data['Category']) { [string]$_.Exception.Data['Category'] } else { $Category }
        $item.reason = $_.Exception.Message
        if ($started) {
            try { if (-not $process.HasExited) { $process.Kill($true); $null = $process.WaitForExit(10000) } } catch {}
        }
    } finally {
        if ($outStream) { try { $outStream.Dispose() } catch {} }
        if ($errStream) { try { $errStream.Dispose() } catch {} }
        $process.Dispose()
        $clock.Stop()
        $item.finishedAt = Utc-Now
        $item.durationMs = $clock.ElapsedMilliseconds
        Save-Evidence
        $displayExit = if ($null -eq $item.exitCode) { 'null' } else { [string]$item.exitCode }
        Write-Host ($item.id + ': ' + $item.status + ' exit=' + $displayExit + ' durationMs=' + $item.durationMs)
    }
    $stdoutPath = Join-Path $script:evidence $item.stdoutLog
    $stderrPath = Join-Path $script:evidence $item.stderrLog
    $result = [pscustomobject]@{
        Case = $item
        Stdout = if ([IO.File]::Exists($stdoutPath)) { [IO.File]::ReadAllText($stdoutPath) } else { '' }
        Stderr = if ([IO.File]::Exists($stderrPath)) { [IO.File]::ReadAllText($stderrPath) } else { '' }
    }
    if ($item.status -ne 'passed' -and -not $OptionalProbe) {
        Fail-Phase $item.failureCategory ($item.id + ': ' + $item.reason + '; see ' + $item.stdoutLog + ' / ' + $item.stderrLog)
    }
    return $result
}

function Require-Path {
    param([string]$Path, [string]$Description, [switch]$Directory)
    $exists = if ($Directory) { [IO.Directory]::Exists($Path) } else { [IO.File]::Exists($Path) }
    if (-not $exists) { Fail-Phase 'missingTool' ($Description + ' is missing: ' + $Path + '; no download attempted') }
}

function Add-Tool {
    param([string]$Name, [string]$Path, [string]$Version)
    if (-not $Version -and [IO.File]::Exists($Path)) { $Version = [Diagnostics.FileVersionInfo]::GetVersionInfo($Path).FileVersion }
    $script:tools[$Name] = [ordered]@{ path = $Path; version = if ($Version) { $Version } else { 'not reported by installed file' } }
    $script:receipt.toolPathsAndVersions = $script:tools
    Save-Evidence
}

function Select-Node {
    $candidates = [Collections.Generic.List[string]]::new()
    $command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $candidates.Add($command.Source) }
    if ($env:RUNNER_TOOL_CACHE) {
        $nodeCache = Join-Path $env:RUNNER_TOOL_CACHE 'node'
        if ([IO.Directory]::Exists($nodeCache)) {
            foreach ($directory in (Get-ChildItem -LiteralPath $nodeCache -Directory | Sort-Object Name -Descending)) {
                foreach ($suffix in @('x64/node.exe', 'node.exe')) {
                    $candidate = Join-Path $directory.FullName $suffix
                    if ([IO.File]::Exists($candidate) -and -not $candidates.Contains($candidate)) { $candidates.Add($candidate) }
                }
            }
        }
    }
    $probeNumber = 0
    foreach ($candidate in $candidates) {
        $probeNumber++
        $result = Invoke-NativeCase ('node-candidate-' + $probeNumber) $candidate @('--version') 30000 'missingTool' -OptionalProbe
        $version = [version]'0.0.0'
        if ($result.Case.status -eq 'passed' -and $result.Stdout.Trim() -match '^v(\d+\.\d+\.\d+)$' -and [version]::TryParse($Matches[1], [ref]$version) -and $version -ge [version]'22.13.0') {
            $script:node = $candidate
            Add-Tool 'node' $candidate $result.Stdout.Trim()
            return
        }
        $result.Case.reason = 'Not selected: Node >=22.13.0 is required'
        Save-Evidence
    }
    Fail-Phase 'missingTool' 'No usable preinstalled Node >=22.13.0 was found on PATH or RUNNER_TOOL_CACHE; no download attempted.'
}

function Check-Msvc {
    $vswhere = 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe'
    Require-Path $vswhere 'vswhere'
    Add-Tool 'vswhere' $vswhere ''
    $vsArgs = if ($Mode -eq 'Windows') { @('-all', '-products', '*', '-format', 'json') } else { @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-format', 'json') }
    $inventory = Invoke-NativeCase 'msvc-inventory' $vswhere $vsArgs 30000 'missingTool'
    try { $installations = @($inventory.Stdout | ConvertFrom-Json) } catch { Fail-Phase 'missingTool' 'vswhere did not return valid JSON.' }
    $installation = if ($Mode -eq 'Windows') { $installations | Where-Object isComplete | Select-Object -First 1 } else { $installations | Select-Object -First 1 }
    if (-not $installation) { Fail-Phase 'missingTool' 'The original build entry cannot select an installed Visual Studio C++ toolchain.' }
    $vcRoot = Join-Path $installation.installationPath 'VC/Tools/MSVC'
    Require-Path $vcRoot 'MSVC version directory' -Directory
    $vcVersions = @(Get-ChildItem -LiteralPath $vcRoot -Directory)
    $vcVersion = if ($Mode -eq 'Windows') { $vcVersions | Sort-Object Name -Descending | Select-Object -First 1 } else { $vcVersions | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 }
    if (-not $vcVersion) { Fail-Phase 'missingTool' 'The selected Visual Studio has no MSVC version directory.' }
    $vc = $vcVersion.FullName
    $cl = Join-Path $vc 'bin/Hostx64/x64/cl.exe'
    Require-Path $cl 'Selected MSVC cl.exe'
    Require-Path (Join-Path $vc 'include') 'Selected MSVC includes' -Directory
    Require-Path (Join-Path $vc 'lib/x64') 'Selected MSVC x64 libraries' -Directory
    Add-Tool 'msvc-cl' $cl $vcVersion.Name
    $sdk = 'C:/Program Files (x86)/Windows Kits/10'
    Require-Path (Join-Path $sdk 'Include') 'Windows SDK includes' -Directory
    $sdkVersion = Get-ChildItem -LiteralPath (Join-Path $sdk 'Include') -Directory | Where-Object { $_.Name -match '^10\.' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (-not $sdkVersion) { Fail-Phase 'missingTool' 'No installed Windows 10/11 SDK Include version is available.' }
    foreach ($part in @('ucrt', 'shared', 'um')) { Require-Path (Join-Path $sdk ('Include/' + $sdkVersion.Name + '/' + $part)) ('Windows SDK ' + $part + ' includes') -Directory }
    foreach ($part in @('ucrt', 'um')) { Require-Path (Join-Path $sdk ('Lib/' + $sdkVersion.Name + '/' + $part + '/x64')) ('Windows SDK ' + $part + ' x64 libraries') -Directory }
    Add-Tool 'windows-sdk' $sdk $sdkVersion.Name
    if ($Mode -eq 'Windows') {
        $rc = Join-Path $sdk ('bin/' + $sdkVersion.Name + '/x64/rc.exe')
        Require-Path $rc 'Selected Windows SDK rc.exe'
        Add-Tool 'windows-rc' $rc $sdkVersion.Name
    }
}

function Check-AndroidTools {
    $javaHome = $env:JAVA_HOME_17_X64
    if (-not $javaHome) { Fail-Phase 'missingTool' 'JAVA_HOME_17_X64 is unavailable; no JDK installation attempted.' }
    foreach ($name in @('java', 'javac', 'jar')) {
        $path = Join-Path $javaHome ('bin/' + $name + '.exe')
        Require-Path $path ('Preinstalled JDK17 ' + $name)
        Set-Variable -Name $name -Value $path -Scope Script
        $arguments = if ($name -eq 'jar') { @('--version') } else { @('-version') }
        $result = Invoke-NativeCase ($name + '-version') $path $arguments 30000 'missingTool'
        $versionText = ($result.Stdout + $result.Stderr).Trim()
        if ($versionText -notmatch '(?m)(?:version\s+\"|javac\s+|jar\s+)17(?:\.|\")') { Fail-Phase 'missingTool' ($name + ' is not verified JDK17: ' + $versionText) }
        Add-Tool ('jdk17-' + $name) $path $versionText
    }
    $script:childEnvironment.JAVA_HOME = $javaHome
    if (-not $env:ANDROID_HOME) { Fail-Phase 'missingTool' 'ANDROID_HOME is unavailable; no SDK installation attempted.' }
    $script:androidSdk = $env:ANDROID_HOME
    $script:androidTools = Join-Path $script:androidSdk 'build-tools/35.0.0'
    $components = @{
        'aapt' = 'build-tools/35.0.0/aapt.exe'
        'aapt2' = 'build-tools/35.0.0/aapt2.exe'
        'zipalign' = 'build-tools/35.0.0/zipalign.exe'
        'd8' = 'build-tools/35.0.0/lib/d8.jar'
        'android-api34' = 'platforms/android-34/android.jar'
    }
    foreach ($name in $components.Keys) {
        $path = Join-Path $script:androidSdk $components[$name]
        Require-Path $path ('Preinstalled Android SDK ' + $name)
        Add-Tool $name $path $(if ($name -eq 'android-api34') { 'API34 installed platform' } else { 'build-tools directory 35.0.0' })
    }
    $properties = Join-Path $script:androidTools 'source.properties'
    if ([IO.File]::Exists($properties)) {
        $revision = [regex]::Match([IO.File]::ReadAllText($properties), '(?m)^Pkg\.Revision\s*=\s*(.+)$').Groups[1].Value.Trim()
        if ($revision -ne '35.0.0') { Fail-Phase 'missingTool' ('Installed Android build-tools revision differs from 35.0.0: ' + $revision) }
        Add-Tool 'android-build-tools' $script:androidTools $revision
    } else { Add-Tool 'android-build-tools' $script:androidTools '35.0.0 directory; source.properties absent' }
    $aaptVersion = Invoke-NativeCase 'aapt-version' (Join-Path $script:androidTools 'aapt.exe') @('version') 30000 'missingTool'
    Add-Tool 'aapt' (Join-Path $script:androidTools 'aapt.exe') $aaptVersion.Stdout.Trim()
    $aapt2Version = Invoke-NativeCase 'aapt2-version' (Join-Path $script:androidTools 'aapt2.exe') @('version') 30000 'missingTool'
    Add-Tool 'aapt2' (Join-Path $script:androidTools 'aapt2.exe') $aapt2Version.Stdout.Trim()
    $d8Version = Invoke-NativeCase 'd8-version' $script:java @('-cp', (Join-Path $script:androidTools 'lib/d8.jar'), 'com.android.tools.r8.D8', '--version') 30000 'missingTool'
    Add-Tool 'd8' (Join-Path $script:androidTools 'lib/d8.jar') $d8Version.Stdout.Trim()
    $script:childEnvironment.GXTODO_ANDROID_BUILD_DIR = Join-Path $env:RUNNER_TEMP 'mytodo-phase0-android-build'
}

function Capture-Artifacts {
    foreach ($artifact in $script:receipt.artifacts) {
        $artifact.present = [IO.File]::Exists($artifact.path)
        $buildCase = Find-Case $artifact.buildCase
        $artifact.producedThisRun = ($artifact.present -and $script:receipt.sourceVerified -and $null -ne $buildCase.startedAt)
        if ($artifact.present -and $artifact.producedThisRun) {
            try {
                $file = [IO.FileInfo]::new($artifact.path)
                $artifact.bytes = $file.Length
                $artifact.sha256 = (Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash.ToLowerInvariant()
                $artifact.absence = $null
                $artifact.buildStartedAt = $buildCase.startedAt
                $artifact.buildFinishedAt = $buildCase.finishedAt
                $artifact.sourceSha = $script:receipt.actualSourceSha
            } catch {
                $artifact.sha256 = $null
                $artifact.absence = 'Artifact exists but could not be read/hashed: ' + $_.Exception.Message
                $script:receipt.evidenceErrors += $artifact.absence
            }
        } else {
            $artifact.bytes = $null; $artifact.sha256 = $null
            $artifact.absence = if ($artifact.present) { 'Pre-existing/untrusted file: no verified build attempt produced this artifact in this run.' } else { 'Not produced by this run; checkout distribution files are not used as replacements.' }
        }
    }
    Save-Evidence
}

function Initialize-Evidence {
    foreach ($entry in @(@('source-head', 'source'), @('source-status', 'source'), @('source-verify', 'validation'), @('source-inputs', 'validation'), @('tool-preflight', 'preflight'))) {
        $script:cases.Add((New-Case $entry[0] $entry[1]))
    }
    if ($Mode -in @('Windows', 'Web')) { $script:cases.Add((New-Case 'msvc-inventory' 'tool-probe')) }
    switch ($Mode) {
        'Windows' {
            foreach ($id in @('windows-build', 'windows-self-test', 'windows-advanced-test', 'windows-feedback-test')) { $script:cases.Add((New-Case $id $(if ($id -eq 'windows-build') { 'build' } else { 'test' }))) }
        }
        'Web' {
            foreach ($entry in @(@('node-sqlite', 'tool-probe'), @('helper-build', 'build'), @('helper-test-copy', 'validation'), @('shared-js-tests', 'test'), @('shared-test-summary', 'validation'), @('web-package', 'package'))) { $script:cases.Add((New-Case $entry[0] $entry[1])) }
        }
        'Android' {
            foreach ($id in @('java-version', 'javac-version', 'jar-version', 'aapt-version', 'aapt2-version', 'd8-version')) { $script:cases.Add((New-Case $id 'tool-probe')) }
            foreach ($entry in @(@('android-pomodoro-tests', 'test'), @('android-daily-tests', 'test'), @('android-notification-controls-tests', 'test'), @('android-adapter', 'validation'), @('android-build', 'build'), @('android-badging', 'inspect'), @('android-manifest-check', 'validation'))) { $script:cases.Add((New-Case $entry[0] $entry[1])) }
        }
    }
    # Named records avoid PowerShell's single-row nested-array enumeration.
    $artifactEntries = [Collections.Generic.List[object]]::new()
    switch ($Mode) {
        'Windows' { $artifactEntries.Add(@{ name = 'MyTodo-phase0.exe'; kind = 'windows-exe'; buildCase = 'windows-build' }) }
        'Web' {
            $artifactEntries.Add(@{ name = 'WebCredentialHelper.exe'; kind = 'windows-dpapi-helper'; buildCase = 'helper-build' })
            $artifactEntries.Add(@{ name = 'MyTodo-web-source.zip'; kind = 'web-source-zip'; buildCase = 'web-package' })
        }
        'Android' { $artifactEntries.Add(@{ name = 'MyTodo-unsigned.apk'; kind = 'android-unsigned-apk'; buildCase = 'android-build' }) }
    }
    $artifacts = @()
    foreach ($entry in $artifactEntries) {
        $artifacts += [ordered]@{ name = $entry.name; kind = $entry.kind; buildCase = $entry.buildCase; path = (Join-Path $script:evidence $entry.name); present = $false; producedThisRun = $false; bytes = $null; sha256 = $null; sourceSha = $null; buildStartedAt = $null; buildFinishedAt = $null; validationStatus = 'not_run'; absence = 'Not produced yet' }
    }
    $server = if ($env:GITHUB_SERVER_URL) { $env:GITHUB_SERVER_URL } else { 'https://github.com' }
    $script:receipt = [ordered]@{
        schemaVersion = 1; mode = $Mode; expectedSourceSha = $ExpectedSourceSha
        repository = $env:GITHUB_REPOSITORY; event = $env:GITHUB_EVENT_NAME
        runId = $env:GITHUB_RUN_ID; runAttempt = $env:GITHUB_RUN_ATTEMPT
        runUrl = ($server + '/' + $env:GITHUB_REPOSITORY + '/actions/runs/' + $env:GITHUB_RUN_ID)
        workflowSha = $env:GITHUB_WORKFLOW_SHA; workflowRef = $env:GITHUB_WORKFLOW_REF; triggerSha = $env:GITHUB_SHA
        sourceRoot = $script:sourceRoot; actualSourceSha = $null; initialGitStatus = $null; sourceVerified = $false
        runner = [ordered]@{ name = $env:RUNNER_NAME; os = $env:RUNNER_OS; arch = $env:RUNNER_ARCH; imageOS = $env:ImageOS; imageVersion = $env:ImageVersion; toolCache = $env:RUNNER_TOOL_CACHE }
        toolPathsAndVersions = @{}; startedAt = (Utc-Now); finishedAt = $null; updatedAt = $null
        jobStatus = 'running'; priorJobStatus = $PriorJobStatus; failureCategory = $null; failureReason = $null
        requiredItemsComplete = $false; requiredArtifactsComplete = $false; evidenceErrors = @(); artifacts = $artifacts; cases = @()
        testSummary = $null; androidAdapter = $null; androidManifest = $null
        limitations = @('Cloud compile/test baseline only', 'No real user databases or credentials', 'No real network sync or three-platform interoperability test', 'Android APK is unsigned and is not install/upgrade evidence', 'Web package excludes Node runtime and DPAPI helper', 'APK Git/time/history UI is not implemented by this CI script')
    }
    Save-Evidence
}

# Finalization is deliberately before tool selection or any process invocation.
if ($FinalizeOnly) {
    if ([IO.File]::Exists($script:receiptPath)) {
        $script:receipt = Get-Content -LiteralPath $script:receiptPath -Raw | ConvertFrom-Json -AsHashtable
        foreach ($item in @($script:receipt.cases)) {
            if ($item.status -eq 'running') {
                $item.status = 'interrupted'; $item.exitCode = $null; $item.finishedAt = Utc-Now
                $item.reason = 'Execution ended before a final result was saved; no success is inferred.'
                if ($item.startedAt) { try { $item.durationMs = ([DateTime]::Parse($item.finishedAt) - [DateTime]::Parse($item.startedAt)).TotalMilliseconds } catch {} }
            }
            $script:cases.Add($item)
        }
        foreach ($artifact in @($script:receipt.artifacts)) {
            $artifact.present = [IO.File]::Exists($artifact.path)
            if (-not $artifact.present) { $artifact.absence = 'Artifact absent during finalization'; $artifact.sha256 = $null; $artifact.bytes = $null }
        }
    } else {
        Initialize-Evidence
        $script:receipt.failureCategory = 'source'
        $script:receipt.failureReason = 'Execution receipt is absent: checkout or executor initialization did not complete. No source/build/test success is inferred.'
        $script:receipt.jobStatus = 'failure'
    }
    $script:receipt.priorJobStatus = $PriorJobStatus
    $incomplete = @($script:cases | Where-Object { $_.required -and $_.status -ne 'passed' })
    $script:receipt.requiredItemsComplete = ($incomplete.Count -eq 0)
    $missingArtifacts = @($script:receipt.artifacts | Where-Object { -not $_.present -or -not $_.sha256 })
    $script:receipt.requiredArtifactsComplete = ($missingArtifacts.Count -eq 0)
    if (($missingArtifacts.Count -gt 0 -or $script:receipt.evidenceErrors.Count -gt 0) -and -not $script:receipt.failureCategory) {
        $script:receipt.failureCategory = 'build'
        $script:receipt.failureReason = 'Finalization found an absent required artifact/SHA256 or unresolved evidenceErrors.'
    }
    if ($script:receipt.runId -ne $env:GITHUB_RUN_ID -or $script:receipt.runAttempt -ne $env:GITHUB_RUN_ATTEMPT -or $script:receipt.mode -ne $Mode -or $script:receipt.expectedSourceSha -ne $ExpectedSourceSha) {
        $script:receipt.failureCategory = 'source'
        $script:receipt.failureReason = 'Receipt identity differs from the current run/mode/frozen source SHA.'
        $script:receipt.jobStatus = 'failure'
    }
    if ($script:receipt.jobStatus -ne 'success' -or $PriorJobStatus -ne 'success' -or $incomplete.Count -gt 0 -or $missingArtifacts.Count -gt 0 -or $script:receipt.evidenceErrors.Count -gt 0) { $script:receipt.jobStatus = 'failure' }
    if (-not $script:receipt.finishedAt) { $script:receipt.finishedAt = Utc-Now }
    foreach ($artifact in $script:receipt.artifacts) { $artifact.validationStatus = $script:receipt.jobStatus }
    Save-Evidence
    Write-Host ('Finalized ' + $Mode + ' evidence: ' + $script:receipt.jobStatus)
    # A newly discovered evidence failure must also fail an otherwise green job.
    # An already failed/cancelled job keeps its original failure while we save evidence.
    if ($PriorJobStatus -eq 'success' -and $script:receipt.jobStatus -ne 'success') { exit 1 }
    exit 0
}

Initialize-Evidence
$phaseExit = 1
try {
    if (-not $script:sourceRoot -or -not [IO.Directory]::Exists($script:sourceRoot)) { Fail-Phase 'source' 'GITHUB_WORKSPACE was not checked out.' }
    $gitCommand = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $gitPath = if ($gitCommand) { $gitCommand.Source } else { '' }
    Add-Tool 'git' $gitPath ''
    $head = Invoke-NativeCase 'source-head' $gitPath @('rev-parse', '--verify', 'HEAD') 30000 'source'
    $script:receipt.actualSourceSha = $head.Stdout.Trim().ToLowerInvariant()
    Save-Evidence
    $status = Invoke-NativeCase 'source-status' $gitPath @('status', '--porcelain=v1', '--untracked-files=all') 30000 'source'
    $script:receipt.initialGitStatus = $status.Stdout
    Save-Evidence
    Invoke-InternalCase 'source-verify' 'source' {
        if ($script:receipt.actualSourceSha -notmatch '^[a-f0-9]{40}$' -or $script:receipt.actualSourceSha -ne $ExpectedSourceSha) { Fail-Phase 'source' ('Actual checkout SHA does not match frozen source SHA: ' + $script:receipt.actualSourceSha) }
        if ($script:receipt.initialGitStatus.Trim()) { Fail-Phase 'source' 'Initial checkout contains staged/unstaged/untracked changes; baseline source is not pristine.' }
        foreach ($artifact in $script:receipt.artifacts) { if ([IO.File]::Exists($artifact.path)) { Fail-Phase 'source' ('Refusing pre-existing evidence artifact: ' + $artifact.path) } }
        if (-not [IO.File]::Exists((Join-Path $script:sourceRoot 'package.json'))) { Fail-Phase 'source' 'Checked-out source has no package.json.' }
        $script:receipt.sourceVerified = $true
        $script:childEnvironment.GXTODO_SOURCE_SHA = $script:receipt.actualSourceSha
        $script:childEnvironment.GXTODO_PHASE0_EVIDENCE_DIR = $script:evidence
    }
    Invoke-InternalCase 'source-inputs' 'source' {
        $inputs = switch ($Mode) {
            'Windows' { @('scripts/build-windows.mjs', 'windows/main.c', 'windows/GxTodo.rc') }
            'Web' { @('scripts/build-credential-helper.mjs', 'windows/credential-helper.c', 'scripts/web-launcher.cjs', 'server.mjs', 'index.html', 'styles.css', 'interaction.css', 'README.md') }
            'Android' { @('scripts/build-android.mjs', 'android/AndroidManifest.xml', 'android/libs/feedback-kit-1.2.0.aar', 'tests/android/run-pomodoro-tests.mjs', 'tests/android/run-daily-tests.mjs', 'tests/android/run-notification-controls-tests.mjs', 'android/src/local/gxtodo/replica/PomodoroClock.java', 'android/src/local/gxtodo/replica/DailyTaskPolicy.java', 'android/src/local/gxtodo/replica/NotificationTimerControls.java') }
        }
        foreach ($relative in $inputs) { if (-not [IO.File]::Exists((Join-Path $script:sourceRoot $relative))) { Fail-Phase 'source' ('Required source input is missing: ' + $relative) } }
        if ($Mode -eq 'Android') {
            $aarHash = (Get-FileHash -LiteralPath (Join-Path $script:sourceRoot 'android/libs/feedback-kit-1.2.0.aar') -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($aarHash -ne '4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade') { Fail-Phase 'source' 'Pinned Android Feedback AAR integrity check failed.' }
        }
        if ($Mode -in @('Web', 'Android') -and -not [IO.Directory]::Exists((Join-Path $script:sourceRoot 'src'))) { Fail-Phase 'source' 'Required source src/ directory is missing.' }
        if ($Mode -eq 'Web' -and -not [IO.Directory]::Exists((Join-Path $script:sourceRoot 'tests'))) { Fail-Phase 'source' 'Required tests/ directory is missing.' }
    }
    Invoke-InternalCase 'tool-preflight' 'missingTool' {
        Select-Node
        if ($Mode -in @('Windows', 'Web')) { Check-Msvc }
        if ($Mode -eq 'Android') { Check-AndroidTools }
    }
    switch ($Mode) {
        'Windows' {
            $exe = Join-Path $script:evidence 'MyTodo-phase0.exe'
            $null = Invoke-NativeCase 'windows-build' $script:node @('scripts/build-windows.mjs', $exe, '--public-release') 480000 'build'
            Capture-Artifacts
            foreach ($caseName in @('self-test', 'advanced-test', 'feedback-test')) {
                $data = Join-Path $env:RUNNER_TEMP ('mytodo-phase0-windows-' + $caseName + '-' + [Guid]::NewGuid().ToString('N'))
                $item = Find-Case ('windows-' + $caseName)
                $item['dataDirectory'] = $data
                $null = Invoke-NativeCase ('windows-' + $caseName) $exe @('--data-dir', $data, ('--' + $caseName)) 120000 'test'
            }
        }
        'Web' {
            $null = Invoke-NativeCase 'node-sqlite' $script:node @('--input-type=module', '-e', "import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync(':memory:'); console.log(d.prepare('select sqlite_version() as version').get()); d.close();") 30000 'missingTool'
            $helper = Join-Path $script:evidence 'WebCredentialHelper.exe'
            $null = Invoke-NativeCase 'helper-build' $script:node @('scripts/build-credential-helper.mjs', $helper) 180000 'build'
            Capture-Artifacts
            Invoke-InternalCase 'helper-test-copy' 'build' {
                if (-not [IO.File]::Exists($helper)) { Fail-Phase 'build' 'This run did not produce WebCredentialHelper.exe.' }
                # The original tests expect this exact path; overwrite only with this run's successful build.
                $testHelper = Join-Path $script:sourceRoot 'dist/WebCredentialHelper.exe'
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($testHelper)) | Out-Null
                [IO.File]::Copy($helper, $testHelper, $true)
            }
            $tests = @(Get-ChildItem -LiteralPath (Join-Path $script:sourceRoot 'tests') -Filter '*.test.mjs' -File | Sort-Object Name)
            if ($tests.Count -eq 0) { Fail-Phase 'source' 'No original tests/*.test.mjs files were found.' }
            Write-JsonFile (Join-Path $script:evidence 'test-files.json') @($tests | ForEach-Object { 'tests/' + $_.Name })
            $testArgs = @('--test', '--test-reporter=tap') + @($tests | ForEach-Object FullName)
            $tapResult = Invoke-NativeCase 'shared-js-tests' $script:node $testArgs 600000 'test'
            Invoke-InternalCase 'shared-test-summary' 'test' {
                $counts = @{}
                foreach ($name in @('tests', 'fail', 'skipped')) {
                    $summaries = [regex]::Matches($tapResult.Stdout, ('(?m)^# ' + $name + ' (\d+)\r?$'))
                    if ($summaries.Count -eq 0) { Fail-Phase 'test' ('TAP lacks a top-level summary for ' + $name) }
                    $counts[$name] = [long]$summaries[$summaries.Count - 1].Groups[1].Value
                }
                $script:receipt.testSummary = $counts
                if ($counts.tests -le 0 -or $counts.fail -ne 0) { Fail-Phase 'test' 'Shared test suite is empty or reports failures.' }
                if ($counts.skipped -ne 0) { Fail-Phase 'skip' 'Required shared test suite contains skipped tests.' }
            }
            Invoke-InternalCase 'web-package' 'build' {
                $web = Join-Path $script:evidence 'web-source'
                if ([IO.Directory]::Exists($web)) { Fail-Phase 'source' 'Refusing a pre-existing web-source packaging directory.' }
                [IO.Directory]::CreateDirectory($web) | Out-Null
                foreach ($file in @('index.html', 'styles.css', 'interaction.css', 'server.mjs', 'package.json', 'README.md')) { [IO.File]::Copy((Join-Path $script:sourceRoot $file), (Join-Path $web $file), $false) }
                Copy-Item -LiteralPath (Join-Path $script:sourceRoot 'src') -Destination (Join-Path $web 'src') -Recurse
                [IO.File]::Copy((Join-Path $script:sourceRoot 'scripts/web-launcher.cjs'), (Join-Path $web 'launcher.cjs'), $false)
                $readme = 'Cloud baseline source package. Requires preinstalled Node >=22.13. No Node runtime, DPAPI helper, signing keys, real databases, credentials or user data are bundled. Use separate empty GXTODO_DATA_DIR and GXTODO_RUNTIME_DIR, then node launcher.cjs start --no-browser. Not an existing-data upgrade or a formal portable release. The suite tests a freshly built DPAPI helper separately with synthetic data.'
                [IO.File]::WriteAllText((Join-Path $web 'BASELINE-README.txt'), $readme, [Text.UTF8Encoding]::new($false))
                $manifest = @(Get-ChildItem -LiteralPath $web -File -Recurse | Sort-Object FullName | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($web.Length + 1).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
                Write-JsonFile (Join-Path $script:evidence 'web-file-manifest.json') $manifest
                [IO.Compression.ZipFile]::CreateFromDirectory($web, (Join-Path $script:evidence 'MyTodo-web-source.zip'), [IO.Compression.CompressionLevel]::Optimal, $false)
            }
        }
        'Android' {
            foreach ($entry in @(@('pomodoro', 'run-pomodoro-tests.mjs'), @('daily', 'run-daily-tests.mjs'), @('notification-controls', 'run-notification-controls-tests.mjs'))) {
                $null = Invoke-NativeCase ('android-' + $entry[0] + '-tests') $script:node @('tests/android/' + $entry[1]) 120000 'test'
            }
            Invoke-InternalCase 'android-adapter' 'source' {
                $original = Join-Path $script:sourceRoot 'scripts/build-android.mjs'
                if (-not [IO.File]::Exists($original)) { Fail-Phase 'source' 'Original Android build script is missing.' }
                $source = [IO.File]::ReadAllText($original)
                $marker = "const key=path.join(base,'local-development.p12'),secretPath=path.join(base,'signing.json');"
                $index = $source.IndexOf($marker, [StringComparison]::Ordinal)
                if ($index -lt 0 -or $source.IndexOf($marker, $index + 1, [StringComparison]::Ordinal) -ge 0) { Fail-Phase 'source' 'Original signing boundary changed or is not unique; adapter requires review.' }
                $prefix = $source.Substring(0, $index)
                if (-not $prefix.Contains("await run(path.join(tools,'zipalign.exe')")) { Fail-Phase 'source' 'The expected zipalign operation is not before the signing boundary.' }
                $tail = @'

const evidence=process.env.GXTODO_PHASE0_EVIDENCE_DIR;
if(!evidence)throw Error('CI evidence directory is missing');
await fs.mkdir(evidence,{recursive:true});
const target=path.join(evidence,'MyTodo-unsigned.apk');
await fs.copyFile(aligned,target);
await fs.writeFile(path.join(evidence,'android-build-details.json'),JSON.stringify({sourceSha:process.env.GXTODO_SOURCE_SHA,applicationId,version,versionCode:hostManifest.match(/android:versionCode="([^"]+)"/)?.[1]??null,unsigned:true,buildDirectory:build,assets,feedback:{version:feedbackVersion,aarSha256:feedbackAarSha256},dexFiles,sha256:crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex'),packageCompletedAt:new Date().toISOString(),note:'Compile and package baseline only. No signing key is read or generated.'},null,2));
console.log('Unsigned compile baseline: '+target);
'@
                $adapterName = '.phase0-unsigned-' + [Guid]::NewGuid().ToString('N') + '.mjs'
                $script:adapterPath = Join-Path $script:sourceRoot ('scripts/' + $adapterName)
                [IO.File]::WriteAllText($script:adapterPath, ($prefix + $tail), [Text.UTF8Encoding]::new($false))
                [IO.File]::Copy($script:adapterPath, (Join-Path $script:evidence 'android-unsigned-adapter.mjs'), $false)
                $script:receipt.androidAdapter = [ordered]@{ sourceScriptSha256 = (Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash.ToLowerInvariant(); adapterSha256 = (Get-FileHash -LiteralPath $script:adapterPath -Algorithm SHA256).Hash.ToLowerInvariant(); signingBoundaryUnique = $true; signingPerformed = $false }
            }
            $null = Invoke-NativeCase 'android-build' $script:node @($script:adapterPath) 600000 'build'
            Capture-Artifacts
            $apk = Join-Path $script:evidence 'MyTodo-unsigned.apk'
            $badging = Invoke-NativeCase 'android-badging' (Join-Path $script:androidTools 'aapt.exe') @('dump', 'badging', $apk) 30000 'build'
            Invoke-InternalCase 'android-manifest-check' 'build' {
                $details = Get-Content -LiteralPath (Join-Path $script:evidence 'android-build-details.json') -Raw | ConvertFrom-Json
                $match = [regex]::Match($badging.Stdout, "(?m)^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
                if (-not $match.Success -or $match.Groups[1].Value -ne $details.applicationId -or $match.Groups[2].Value -ne $details.versionCode -or $match.Groups[3].Value -ne $details.version) { Fail-Phase 'build' 'Unsigned APK manifest identity/version differs from the original source.' }
                $script:receipt.androidManifest = [ordered]@{ applicationId = $match.Groups[1].Value; versionCode = $match.Groups[2].Value; versionName = $match.Groups[3].Value; unsigned = $true }
            }
        }
    }
    $unfinished = @($script:cases | Where-Object { $_.required -and $_.status -ne 'passed' })
    if ($unfinished.Count -gt 0) { Fail-Phase 'test' 'One or more required cases did not pass.' }
    $script:receipt.requiredItemsComplete = $true
    $script:receipt.jobStatus = 'success'
    $phaseExit = 0
} catch {
    $script:receipt.jobStatus = 'failure'
    $script:receipt.failureCategory = if ($_.Exception.Data['Category']) { [string]$_.Exception.Data['Category'] } else { 'source' }
    $script:receipt.failureReason = $_.Exception.Message
    Write-Host ('Phase 0 failed [' + $script:receipt.failureCategory + ']: ' + $script:receipt.failureReason)
} finally {
    if ($script:adapterPath -and [IO.File]::Exists($script:adapterPath)) {
        # Only the exact newly-created temporary adapter is removed, never a directory/tree.
        try { [IO.File]::Delete($script:adapterPath) } catch { $script:receipt.evidenceErrors += 'Temporary adapter cleanup failed: ' + $_.Exception.Message }
    }
    try { Capture-Artifacts } catch { $script:receipt.evidenceErrors += 'Artifact evidence collection failed: ' + $_.Exception.Message }
    $missingArtifacts = @($script:receipt.artifacts | Where-Object { -not $_.present -or -not $_.sha256 })
    $script:receipt.requiredArtifactsComplete = ($missingArtifacts.Count -eq 0)
    if ($phaseExit -eq 0 -and $missingArtifacts.Count -gt 0) { $script:receipt.evidenceErrors += 'Required output artifact or SHA256 is absent.' }
    if ($script:receipt.evidenceErrors.Count -gt 0) {
        if ($phaseExit -eq 0) { $script:receipt.failureCategory = 'build'; $script:receipt.failureReason = 'Evidence could not be completed; see evidenceErrors' }
        $script:receipt.jobStatus = 'failure'; $phaseExit = 1
    }
    foreach ($item in $script:cases) { if ($item.status -eq 'not_run') { $item.reason = 'Not executed after an earlier required failure; exitCode remains null.' } }
    foreach ($artifact in $script:receipt.artifacts) { $artifact.validationStatus = $script:receipt.jobStatus }
    $script:receipt.finishedAt = Utc-Now
    Save-Evidence
    Write-Host ('Evidence directory: ' + $script:evidence)
}
exit $phaseExit
