#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$EvidenceRoot,
    [string]$OutputPath
)
# Evidence parsing only. Never loads project code, databases, executables or APKs.
# Exit 1 means an audit/integrity problem. A faithfully recorded red test run
# may have exit 0 here; inspect execution.status separately.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$issues = [Collections.Generic.List[object]]::new()
$executionIssues = [Collections.Generic.List[object]]::new()
$comparer = [StringComparer]::OrdinalIgnoreCase
$textIndex = [Collections.Generic.Dictionary[string,object]]::new($comparer)
$cloudIndex = [Collections.Generic.Dictionary[string,object]]::new($comparer)
$actual = [Collections.Generic.Dictionary[string,object]]::new($comparer)
$manifestAudits = [Collections.Generic.List[object]]::new()
$platformAudits = [Collections.Generic.List[object]]::new()
$reportAudits = [Collections.Generic.List[object]]::new()
$checkedAncestors = [Collections.Generic.HashSet[string]]::new($comparer)
$sealCoveredFiles = [Collections.Generic.HashSet[string]]::new($comparer)
$closedSeals = [Collections.Generic.HashSet[string]]::new($comparer)
$executionReadsRequireSeal=$false

function Issue([string]$Kind,[string]$Path,[string]$Detail) {
    $issues.Add([ordered]@{kind=$Kind;path=$Path;detail=$Detail})
}
function ExecutionIssue([string]$Kind,[string]$Path,[string]$Detail) {
    $executionIssues.Add([ordered]@{kind=$Kind;path=$Path;detail=$Detail})
}
function Is-True($Value) { return $Value -is [bool] -and $Value }
function Is-Integer($Value) {
    return $null -ne $Value -and $Value -isnot [bool] -and
        ($Value -is [int] -or $Value -is [long] -or $Value -is [bigint]) -and $Value -ge 0
}
function Is-Zero($Value) { return (Is-Integer $Value) -and $Value -eq 0 }
function Field($Object,[string]$Name) {
    if ($Object -is [Collections.IDictionary] -and $Object.Contains($Name)) { return ,$Object[$Name] }
    return $null
}
function Sum-Field($Rows,[string]$Name) {
    [long]$sum=0
    foreach ($row in $Rows) { $value=Field $row $Name; if ($null -ne $value) { $sum += [long]$value } }
    return $sum
}
function Check-Ancestors([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if ($checkedAncestors.Contains($cursor)) { break }
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point refused: $cursor" }
            if ($item.PSIsContainer) { $null=$checkedAncestors.Add($cursor) }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }; $cursor = $parent
    }
}
function Safe-Path([string]$Base,$Relative) {
    if ($Relative -isnot [string] -or !$Relative -or $Relative -match '[\\:\x00-\x1f]' -or [IO.Path]::IsPathRooted($Relative)) { throw 'Unsafe relative path' }
    foreach ($part in $Relative.Split('/')) {
        if (!$part -or $part -in '.', '..' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw 'Unsafe or aliased path component' }
    }
    $baseFull = [IO.Path]::GetFullPath($Base).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($baseFull,$Relative.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    if (!$target.StartsWith($baseFull + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Escaping path' }
    Check-Ancestors $target
    return $target
}
function Relative-Path([string]$Base,[string]$Path) { return [IO.Path]::GetRelativePath($Base,$Path).Replace('\','/') }
function Read-Json([string]$Path) {
    return ,([IO.File]::ReadAllText($Path,[Text.UTF8Encoding]::new($false,$true)) | ConvertFrom-Json -AsHashtable -NoEnumerate -Depth 100)
}
function Read-Evidence([string]$Relative) {
    $path = Safe-Path $root $Relative
    if (!$textIndex.ContainsKey($Relative) -or !$actual.ContainsKey($Relative) -or !$actual[$Relative].matched) { throw "Unverified or missing local evidence: $Relative" }
    if ($executionReadsRequireSeal -and !$sealCoveredFiles.Contains($Relative) -and !$closedSeals.Contains($Relative)) { throw "Execution evidence not covered by a validated C007 producer seal: $Relative" }
    return ,(Read-Json $path)
}
function Walk-Files([string]$Directory) {
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Issue 'unsafe-reparse-point' (Relative-Path $root $item.FullName) ''; continue }
        if ($item.PSIsContainer) { Walk-Files $item.FullName } else { $item }
    }
}
function Assert-Array($Value,[string]$Label) { if ($Value -isnot [array]) { throw "$Label must be an array" } }
function Validate-Row($Row,[bool]$RequireBytes=$true,[bool]$StrictSeal=$false) {
    if ($Row -isnot [Collections.IDictionary]) { throw 'Inventory row is not an object' }
    if ($StrictSeal -and (!$Row.Contains('path') -or !$Row.Contains('bytes'))) { throw 'C007 seal rows require path and bytes fields' }
    $relative=Field $Row 'path'; if (!$StrictSeal -and $null -eq $relative) { $relative=Field $Row 'file' }
    $bytes=Field $Row 'bytes'; if (!$StrictSeal -and $null -eq $bytes) { $bytes=Field $Row 'size' }
    $hash=Field $Row 'sha256'
    if ($hash -isnot [string] -or $hash -cnotmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid SHA256' }
    if (($RequireBytes -or $null -ne $bytes) -and !(Is-Integer $bytes)) { throw 'Invalid byte count' }
    return @{path=$relative;bytes=$bytes;sha256=$hash.ToLowerInvariant()}
}
function Match-Identity($Object,[bool]$WithRun) {
    $same = (Field $Object 'sourceSha') -ceq (Field $collection 'sourceSha')
    if ($WithRun) { $same = $same -and [string](Field $Object 'runId') -ceq [string](Field $collection 'runId') -and [string](Field $Object 'runAttempt') -ceq [string](Field $collection 'attempt') }
    return $same
}

$root=[IO.Path]::GetFullPath($EvidenceRoot)
Check-Ancestors $root
if (!(Test-Path -LiteralPath $root -PathType Container)) { throw 'EvidenceRoot must be an existing reports directory' }
if ($OutputPath) {
    $OutputPath=[IO.Path]::GetFullPath($OutputPath)
    if ($OutputPath.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or $OutputPath.StartsWith($root.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be outside the original evidence directory' }
    Check-Ancestors $OutputPath
    if (Test-Path -LiteralPath $OutputPath) { throw 'Refusing to overwrite an existing audit output' }
    if (!(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($OutputPath)) -PathType Container)) { throw 'Output parent directory must already exist' }
}
$collection=$null; $verified=@(); $files=@(); $anchor=$null
try {
    $anchorPath=Safe-Path $root 'text-archive-files-sha256.json'
    $anchor=@{path='text-archive-files-sha256.json';bytes=(Get-Item -LiteralPath $anchorPath).Length;sha256=(Get-FileHash -LiteralPath $anchorPath -Algorithm SHA256).Hash.ToLowerInvariant();independentlyAuthenticated=$false}
    $rows=Read-Json $anchorPath; Assert-Array $rows 'Text inventory'
    foreach ($row in $rows) {
        $relative=[string](Field $row 'path')
        try {
            $entry=Validate-Row $row; $path=Safe-Path $root $entry.path
            if ($entry.path -ieq 'text-archive-files-sha256.json' -or $textIndex.ContainsKey($entry.path)) { throw 'Duplicate/self-referencing text inventory path' }
            $textIndex.Add($entry.path,$entry)
            if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Listed text file is missing' }
            $size=(Get-Item -LiteralPath $path -Force).Length; $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
            $matched=$size -eq $entry.bytes -and $hash -ceq $entry.sha256
            $actual.Add($entry.path,@{bytes=$size;sha256=$hash;matched=$matched})
            if (!$matched) { Issue 'text-bytes-or-hash-mismatch' $entry.path "actualBytes=$size actualSha256=$hash" }
        } catch { Issue 'text-inventory-error' $relative $_.Exception.Message }
    }
    $files=@(Walk-Files $root)
    foreach ($file in $files) {
        $relative=Relative-Path $root $file.FullName
        if ($relative -ine 'text-archive-files-sha256.json' -and !$textIndex.ContainsKey($relative)) { Issue 'unindexed-local-file' $relative '' }
    }
    $collection=Read-Evidence 'collection-summary.json'
    if ((Field $collection 'sourceSha') -isnot [string] -or (Field $collection 'sourceSha') -cnotmatch '^[a-f0-9]{40}$' -or [string](Field $collection 'runId') -cnotmatch '^\d+$' -or !(Is-Integer (Field $collection 'attempt')) -or (Field $collection 'attempt') -lt 1 -or (Field $collection 'repository') -cne 'johny751/MyTodo') { throw 'Invalid collector repository/run/source identity' }
    $cloudRows=Read-Evidence 'all-files-sha256.json'; Assert-Array $cloudRows 'Cloud collector inventory'
    $verified=Read-Evidence 'verified-payloads.json'; Assert-Array $verified 'Collector manifest verification'
    foreach ($row in $cloudRows) {
        $relative=[string](Field $row 'path')
        try {
            $entry=Validate-Row $row; $local='artifacts/'+$entry.path; $null=Safe-Path $root $local
            if ($cloudIndex.ContainsKey($entry.path)) { throw 'Duplicate cloud inventory path' }
            if ((Field $row 'copiedToTextArchive') -isnot [bool]) { throw 'Missing boolean copiedToTextArchive' }
            $entry.copied=Is-True (Field $row 'copiedToTextArchive'); $entry.omittedReason=Field $row 'omittedReason'; $cloudIndex.Add($entry.path,$entry)
            if ($entry.copied) {
                if (!$actual.ContainsKey($local) -or !$actual[$local].matched) { throw 'Copied artifact text is not locally verified' }
                if ($actual[$local].sha256 -cne $entry.sha256 -or $actual[$local].bytes -ne $entry.bytes) { throw 'Cloud/text inventory mismatch' }
            } elseif ($actual.ContainsKey($local)) { throw 'Cloud-only file unexpectedly appears in text archive' }
        } catch { Issue 'cloud-inventory-error' $relative $_.Exception.Message }
    }
    foreach ($relative in $textIndex.Keys) {
        if ($relative.StartsWith('artifacts/',[StringComparison]::OrdinalIgnoreCase) -and !$cloudIndex.ContainsKey($relative.Substring(10))) { Issue 'local-artifact-not-in-cloud-inventory' $relative '' }
    }
    $seenVerified=[Collections.Generic.HashSet[string]]::new($comparer)
    foreach ($manifest in $files | Where-Object { $_.Name -in 'seal.json','sha256.json','payload-sha256.json' -and (Relative-Path $root $_.FullName).StartsWith('artifacts/') }) {
        $relative=Relative-Path $root $manifest.FullName; $before=$issues.Count
        $localRows=0; $cloudOnlyRows=0; $total=0; $obj=$null; $covered=[Collections.Generic.List[string]]::new()
        try {
            $obj=Read-Evidence $relative
            if ($obj -is [array]) { $rows=$obj } else { $rows=Field $obj 'files' }
            Assert-Array $rows 'Producer manifest rows'
            if (!$rows.Count) { throw 'Producer manifest is empty' }; $total=$rows.Count
            $strict=$manifest.Name -eq 'seal.json'; $seen=[Collections.Generic.HashSet[string]]::new($comparer)
            foreach ($row in $rows) {
                $itemPath=[string](Field $row 'path')
                try {
                    $entry=Validate-Row $row $strict $strict; $target=Safe-Path $manifest.DirectoryName $entry.path
                    $targetRelative=Relative-Path $root $target
                    if (!$seen.Add($entry.path)) { throw 'Duplicate producer manifest row' }
                    if (!$targetRelative.StartsWith('artifacts/')) { throw 'Manifest escaped artifacts' }; $cloudRelative=$targetRelative.Substring(10)
                    if (!$cloudIndex.ContainsKey($cloudRelative)) { throw 'Producer file missing from cloud collector inventory' }
                    $cloud=$cloudIndex[$cloudRelative]
                    if ($entry.sha256 -cne $cloud.sha256 -or ($null -ne $entry.bytes -and $entry.bytes -ne $cloud.bytes)) { throw 'Producer/cloud hash or byte count mismatch' }
                    if ($cloud.copied) {
                        if (!$actual.ContainsKey($targetRelative) -or !$actual[$targetRelative].matched -or $actual[$targetRelative].sha256 -cne $entry.sha256) { throw 'Producer text file not locally verified' }; $localRows++
                    } else { $cloudOnlyRows++ }
                    $covered.Add($targetRelative)
                } catch { Issue 'producer-row-not-closed' "$relative -> $itemPath" $_.Exception.Message }
            }
            $parts=$relative.Split('/'); $artifact=$parts[1]; $manifestWithin=$parts[2..($parts.Length-1)] -join '/'
            $matches=@($verified | Where-Object { (Field $_ 'artifact') -ceq $artifact -and (Field $_ 'manifest') -ceq $manifestWithin })
            if ($matches.Count -ne 1) { Issue 'collector-manifest-receipt-count' $relative ([string]$matches.Count) }
            else {
                $null=$seenVerified.Add($artifact+'/'+$manifestWithin); $v=$matches[0]
                if ((Field $v 'rows') -ne $total -or (Field $v 'verifiedRows') -ne ($localRows+$cloudOnlyRows) -or (Field $v 'manifestSha256') -cne $actual[$relative].sha256) { Issue 'collector-manifest-receipt-mismatch' $relative '' }
            }
            if ($strict -and (Field $obj 'schema') -in 'mytodo-c007-seal','mytodo-c007-report-seal' -and !(Match-Identity $obj $true)) { Issue 'seal-run-source-identity-mismatch' $relative '' }
            if ($strict -and (Field $obj 'schema') -in 'mytodo-c007-seal','mytodo-c007-report-seal' -and $issues.Count -eq $before) { $null=$closedSeals.Add($relative); foreach ($coveredPath in $covered) { $null=$sealCoveredFiles.Add($coveredPath) } }
        } catch { Issue 'producer-manifest-error' $relative $_.Exception.Message }
        $manifestAudits.Add([ordered]@{path=$relative;schema=(Field $obj 'schema');status=(Field $obj 'status');sourceUnchanged=(Field $obj 'sourceUnchanged');reportStatus=(Field $obj 'reportStatus');reportExitCode=(Field $obj 'reportExitCode');rows=$total;localBytesVerifiedRows=$localRows;cloudCollectorHashComparedRows=$cloudOnlyRows;unclosedRows=($total-$localRows-$cloudOnlyRows);auditIssues=($issues.Count-$before)})
    }
    foreach ($v in $verified) {
        $key=[string](Field $v 'artifact')+'/'+[string](Field $v 'manifest')
        if (!$seenVerified.Contains($key)) { Issue 'collector-verified-manifest-not-found' $key '' }
    }
    $expectedCases=@('sql-atomicity','C007-batch-rejected','C007-batch-response-lost','C007-manifest-rejected','C007-manifest-response-lost','C007-ack-delete-failed','C007-ack-meta-failed','C007-ack-commit-failed','C007-after-ack-commit-exit','C007-before-ack-commit-exit')
    $executionReadsRequireSeal=$true
    foreach ($file in $files | Where-Object { $_.Name -eq 'suite.json' -and $_.Directory.Name -eq 'suite' }) {
        $relative=Relative-Path $root $file.FullName; $suite=$null; $caseAudits=[Collections.Generic.List[object]]::new(); $platformIssueStart=$executionIssues.Count
        try {
            $suite=Read-Evidence $relative
            if ((Field $suite 'schema') -cne 'mytodo-c007-suite') { continue }
            $platform=Field $suite 'platform'
            if ($platform -notin 'javascript','windows-c','android' -or !(Match-Identity $suite $false)) { throw 'Suite platform/source identity differs' }
            $artifactRelative=Relative-Path $root $file.Directory.Parent.FullName
            $seal=Read-Evidence ($artifactRelative+'/seal.json')
            if ((Field $seal 'schema') -cne 'mytodo-c007-seal' -or (Field $seal 'platform') -cne $platform -or !(Match-Identity $seal $true) -or (Field $seal 'status') -cne 'sealed' -or !(Is-True (Field $seal 'sourceUnchanged'))) { throw 'Platform source seal is incomplete or differs' }
            $cases=Field $suite 'cases'; Assert-Array $cases 'Suite cases'; $seenCases=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
            foreach ($case in $cases) {
                $caseId=[string](Field $case 'caseId'); $summary=$null; $failedChecks=@(); $attempts=@(); $checks=@(); $planned=0; $caseIssueStart=$executionIssues.Count
                $operationReceipts=0; $boundaryReceipts=0; $reopenReceipts=0; $faultHitReceipts=0
                try {
                    if ($caseId -cnotmatch '^[A-Za-z0-9_-]+$' -or !$seenCases.Add($caseId) -or $caseId -cnotin $expectedCases) { throw 'Unsafe, duplicate or unexpected case ID' }
                    $base=Relative-Path $root $file.DirectoryName; $caseBase=$base+'/'+$caseId
                    $summary=Read-Evidence ($caseBase+'/summary.json')
                    $scenarioRelative=if ($caseId -eq 'sql-atomicity') { $base+'/sql.json' } else { $base+'/network-scenarios/'+$caseId+'.json' }
                    $scenario=Read-Evidence $scenarioRelative; $steps=Field $scenario 'steps'; Assert-Array $steps 'Scenario steps'; $planned=$steps.Count
                    $attempts=Field $summary 'attempts'; $checks=Field $summary 'checks'; Assert-Array $attempts 'Attempts'; Assert-Array $checks 'Checks'
                    $expectedSummaryId=if ($caseId -eq 'sql-atomicity') { 'c007-real-sql-atomicity' } else { $caseId }
                    if ((Field $summary 'schema') -cne 'mytodo-c007-same-db' -or !(Match-Identity $summary $false) -or (Field $summary 'platform') -cne $platform -or (Field $scenario 'platform') -cne $platform -or (Field $summary 'caseId') -cne $expectedSummaryId -or (Field $scenario 'caseId') -cne $expectedSummaryId) { throw 'Case summary/scenario identity differs' }
                    $failedChecks=@($checks | Where-Object { !(Is-True (Field $_ 'passed')) })
                    if (!$planned -or !$checks.Count -or $attempts.Count -ne $planned) { ExecutionIssue 'case-count-incomplete' $caseBase "planned=$planned attempts=$($attempts.Count) checks=$($checks.Count)" }
                    $seenChecks=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
                    foreach ($check in $checks) { if ((Field $check 'id') -isnot [string] -or !$seenChecks.Add([string](Field $check 'id'))) { ExecutionIssue 'invalid-or-duplicate-check-id' $caseBase '' } }
                    for ($i=0;$i -lt $attempts.Count;$i++) {
                        $attempt=$attempts[$i]; $id=[string](Field $attempt 'id')
                        if ($id -cnotmatch '^\d{3}-[A-Za-z0-9_-]+$' -or $i -ge $steps.Count -or $id -cne ('{0:d3}-{1}' -f $i,(Field $steps[$i] 'id'))) { ExecutionIssue 'attempt-sequence-differs' $caseBase $id; continue }
                        foreach ($suffix in 'exit','same-db-restart','database-preserved') {
                            $found=@($checks | Where-Object { (Field $_ 'id') -ceq ($id+':'+$suffix) -and (Is-True (Field $_ 'passed')) })
                            if ($found.Count -ne 1) { ExecutionIssue 'attempt-required-check-not-passed' $caseBase ($id+':'+$suffix) }
                        }
                        $expectedExit=Field $steps[$i] 'expectedExitCode'; if ($null -eq $expectedExit) { $expectedExit=0 }
                        $process=Field $attempt 'process'
                        if ((Field $process 'exitCode') -ne $expectedExit -or (Field $process 'signal') -ne $null -or (Field $process 'timedOut') -or (Field $process 'spawnError') -or !(Is-True (Field $process 'processClosed'))) { ExecutionIssue 'attempt-process-not-as-expected' $caseBase $id }
                        foreach ($pair in @(@('receiptSha256','.result.json'),@('reopened','.reopened.json'))) {
                            $wanted=if ($pair[0] -eq 'reopened') { Field (Field $attempt 'reopened') 'receiptSha256' } else { Field $attempt $pair[0] }
                            if ($null -eq $wanted) { if ($pair[0] -eq 'reopened' -or $expectedExit -ne 86) { ExecutionIssue 'missing-attempt-receipt-hash' $caseBase ($id+$pair[1]) }; continue }
                            $receiptRelative=$caseBase+'/'+$id+$pair[1]
                            if (!$actual.ContainsKey($receiptRelative)) { ExecutionIssue 'attempt-receipt-missing' $receiptRelative '' }
                            elseif (!$actual[$receiptRelative].matched -or $actual[$receiptRelative].sha256 -cne $wanted) { Issue 'attempt-receipt-hash-mismatch' $receiptRelative ''; ExecutionIssue 'attempt-receipt-hash-mismatch' $receiptRelative '' }
                            else {
                                $raw=Read-Evidence $receiptRelative
                                $expectedAttemptId=if ($pair[0] -eq 'reopened') { $id+'-reopen' } else { $id }
                                if ((Field $raw 'schema') -cne 'mytodo-c007-attempt' -or !(Match-Identity $raw $false) -or (Field $raw 'caseId') -cne $expectedSummaryId -or (Field $raw 'platform') -cne $platform -or (Field $raw 'attemptId') -cne $expectedAttemptId) { Issue 'attempt-receipt-identity-mismatch' $receiptRelative ''; ExecutionIssue 'attempt-receipt-identity-mismatch' $receiptRelative ''; continue }
                                if (!(Is-Zero (Field $raw 'observerExitCode'))) { ExecutionIssue 'attempt-observation-incomplete' $receiptRelative '' }
                                if ($pair[0] -eq 'reopened' -and (Field (Field $raw 'operation') 'op') -cne 'audit') { Issue 'reopen-operation-identity-mismatch' $receiptRelative ''; ExecutionIssue 'reopen-operation-identity-mismatch' $receiptRelative ''; continue }
                                if ($pair[0] -eq 'reopened') { $reopenReceipts++ }
                                elseif ((Field $raw 'operationAccepted') -is [bool]) { $operationReceipts++; if ((Is-Integer (Field $raw 'faultHits')) -and (Field $raw 'faultHits') -gt 0) { $faultHitReceipts++ } }
                            }
                        }
                        if ($expectedExit -eq 86) {
                            $exitAt=Field (Field $steps[$i] 'request') 'exitAt'; $suffix=if ($exitAt -eq 'after-ack-commit') { 'after-ack-commit' } else { 'before-commit' }
                            try { $marker=Read-Evidence ($caseBase+'/'+$id+'.result.json.'+$suffix+'.json'); if ((Field $marker 'attemptId') -cne $id -or (Field $marker 'caseId') -cne $expectedSummaryId -or !(Match-Identity $marker $false)) { throw 'Marker identity differs' }; $boundaryReceipts++ }
                            catch { ExecutionIssue 'missing-or-invalid-boundary-receipt' $caseBase $id }
                        }
                    }
                } catch { ExecutionIssue 'case-unreadable-or-incomplete' $caseId $_.Exception.Message }
                $casePassed=$executionIssues.Count -eq $caseIssueStart -and $failedChecks.Count -eq 0 -and (Field $case 'status') -ceq 'passed' -and (Is-Zero (Field $case 'exitCode')) -and (Field $summary 'status') -ceq 'passed' -and (Is-Zero (Field $summary 'exitCode'))
                $caseAudits.Add([ordered]@{caseId=$caseId;summaryCaseId=(Field $summary 'caseId');suiteEntryStatus=(Field $case 'status');suiteEntryExitCode=(Field $case 'exitCode');summaryStatus=(Field $summary 'status');summaryExitCode=(Field $summary 'exitCode');plannedOperations=$planned;attempts=@($attempts).Count;operationReceipts=$operationReceipts;boundaryReceipts=$boundaryReceipts;reopenReceipts=$reopenReceipts;faultHitReceipts=$faultHitReceipts;checks=@($checks).Count;failedCheckCount=$failedChecks.Count;failedChecks=$failedChecks;error=(Field $summary 'error');passed=$casePassed})
            }
            foreach ($expected in $expectedCases) { if (!$seenCases.Contains($expected)) { ExecutionIssue 'missing-case' $relative $expected } }
        } catch { ExecutionIssue 'suite-unreadable-or-incomplete' $relative $_.Exception.Message }
        $platformAudits.Add([ordered]@{path=$relative;platform=(Field $suite 'platform');suiteStatus=(Field $suite 'status');suiteExitCode=(Field $suite 'exitCode');cases=$caseAudits.ToArray();caseCount=$caseAudits.Count;attempts=(Sum-Field $caseAudits 'attempts');operationReceipts=(Sum-Field $caseAudits 'operationReceipts');boundaryReceipts=(Sum-Field $caseAudits 'boundaryReceipts');reopenReceipts=(Sum-Field $caseAudits 'reopenReceipts');faultHitReceipts=(Sum-Field $caseAudits 'faultHitReceipts');checks=(Sum-Field $caseAudits 'checks');failedChecks=(Sum-Field $caseAudits 'failedCheckCount');passed=($executionIssues.Count -eq $platformIssueStart -and $caseAudits.Count -eq 10 -and @($caseAudits | Where-Object { !$_.passed }).Count -eq 0 -and (Field $suite 'status') -ceq 'passed' -and (Is-Zero (Field $suite 'exitCode')))})
    }
    foreach ($file in $files | Where-Object { $_.Name -eq 'report.json' -and $_.Directory.Parent.Name -eq 'artifacts' }) {
        $relative=Relative-Path $root $file.FullName
        try {
            $doc=Read-Evidence $relative
            if ((Field $doc 'schema') -ceq 'mytodo-c007-report') {
                if (!(Match-Identity $doc $true)) { Issue 'report-run-source-identity-mismatch' $relative ''; ExecutionIssue 'report-run-source-identity-mismatch' $relative '' }
                $reportErrors=Field $doc 'errors'; Assert-Array $reportErrors 'Report errors'
                if ((Field $doc 'status') -ceq 'passed' -and $reportErrors.Count -ne 0) { Issue 'passed-report-has-errors' $relative ''; ExecutionIssue 'passed-report-has-errors' $relative '' }
                $seal=Read-Evidence ((Relative-Path $root $file.DirectoryName)+'/seal.json')
                $sealMatches=(Field $seal 'schema') -ceq 'mytodo-c007-report-seal' -and (Match-Identity $seal $true) -and (Field $seal 'status') -ceq 'sealed' -and (Field $seal 'reportStatus') -ceq (Field $doc 'status') -and (Field $seal 'reportExitCode') -eq (Field $doc 'exitCode')
                if (!$sealMatches) { Issue 'report-seal-verdict-mismatch' $relative ''; ExecutionIssue 'report-seal-verdict-mismatch' $relative '' }
                $reported=Field $doc 'platforms'; Assert-Array $reported 'Report platforms'
                if ($reported.Count -ne 3) { Issue 'report-platform-count-mismatch' $relative ([string]$reported.Count); ExecutionIssue 'report-platform-count-mismatch' $relative ([string]$reported.Count) }
                foreach ($platform in 'javascript','windows-c','android') {
                    $rp=@($reported | Where-Object { (Field $_ 'platform') -ceq $platform }); $pp=@($platformAudits | Where-Object { $_.platform -ceq $platform })
                    if ($rp.Count -ne 1 -or $pp.Count -ne 1) { ExecutionIssue 'report-platform-count-mismatch' $relative $platform; continue }
                    $expectedStatus=if ($pp[0].passed) { 'passed' } else { 'failed' }
                    if ((Field $rp[0] 'status') -cne $expectedStatus) { Issue 'report-platform-verdict-mismatch' $relative $platform; ExecutionIssue 'report-platform-verdict-mismatch' $relative $platform }
                    $reportedCases=Field $rp[0] 'cases'; Assert-Array $reportedCases 'Report cases'
                    if ((Field $rp[0] 'status') -ceq 'passed' -and $reportedCases.Count -ne $pp[0].cases.Count) { Issue 'report-case-set-mismatch' $relative $platform; ExecutionIssue 'report-case-set-mismatch' $relative $platform }
                    $reportCaseIds=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
                    foreach ($recordedCase in $reportedCases) {
                        if (!$reportCaseIds.Add([string](Field $recordedCase 'caseId'))) { Issue 'duplicate-report-case' $relative ([string](Field $recordedCase 'caseId')); ExecutionIssue 'duplicate-report-case' $relative ([string](Field $recordedCase 'caseId')) }
                        $matches=@($pp[0].cases | Where-Object { $_.caseId -ceq (Field $recordedCase 'caseId') })
                        if ($matches.Count -ne 1) { ExecutionIssue 'report-case-identity-mismatch' $relative ([string](Field $recordedCase 'caseId')); continue }
                        $expectedCaseStatus=if ($matches[0].passed) { 'passed' } else { 'failed' }
                        if ((Field $recordedCase 'status') -cne $expectedCaseStatus) { Issue 'report-case-verdict-mismatch' $relative $matches[0].caseId; ExecutionIssue 'report-case-verdict-mismatch' $relative $matches[0].caseId }
                        if ((Field $recordedCase 'status') -ceq 'passed' -and (!(Is-Integer (Field $recordedCase 'attempts')) -or !(Is-Integer (Field $recordedCase 'checks')) -or $null -eq (Field $recordedCase 'failedChecks'))) { Issue 'passed-report-case-missing-counts' $relative $matches[0].caseId; ExecutionIssue 'passed-report-case-missing-counts' $relative $matches[0].caseId }
                        if ($null -ne (Field $recordedCase 'attempts')) {
                            $reportedFailed=Field $recordedCase 'failedChecks'; Assert-Array $reportedFailed 'Report failed checks'
                            if ((Field $recordedCase 'attempts') -ne $matches[0].attempts -or (Field $recordedCase 'checks') -ne $matches[0].checks -or $reportedFailed.Count -ne $matches[0].failedCheckCount) { Issue 'report-case-count-mismatch' $relative $matches[0].caseId; ExecutionIssue 'report-case-count-mismatch' $relative $matches[0].caseId }
                        }
                    }
                }
                $reportAudits.Add([ordered]@{path=$relative;identityMatches=(Match-Identity $doc $true);sealVerdictMatches=$sealMatches;status=(Field $doc 'status');exitCode=(Field $doc 'exitCode');platforms=$reported;errors=(Field $doc 'errors')})
            }
        }
        catch { ExecutionIssue 'report-unreadable' $relative $_.Exception.Message }
    }
} catch { Issue 'audit-input-error' '' $_.Exception.Message }

foreach ($platform in 'javascript','windows-c','android') { if (@($platformAudits | Where-Object { $_.platform -ceq $platform }).Count -ne 1) { ExecutionIssue 'missing-or-duplicate-platform' '' $platform } }
if ($reportAudits.Count -ne 1) { ExecutionIssue 'missing-or-duplicate-report' '' ([string]$reportAudits.Count) }
$executionPassed=$executionIssues.Count -eq 0 -and @($platformAudits | Where-Object { !$_.passed }).Count -eq 0 -and @($reportAudits | Where-Object { !$_.identityMatches -or $_.status -cne 'passed' -or !(Is-Zero $_.exitCode) }).Count -eq 0
$collectorComplete=(Is-True (Field $collection 'evidenceComplete')) -and (Is-Zero (Field $collection 'collectionExitCode'))
$output=[ordered]@{
    schema='mytodo-c007-independent-evidence-audit';version=2;auditedAt=[DateTimeOffset]::UtcNow.ToString('o');evidenceRoot=$root
    auditor=[ordered]@{path=$PSCommandPath;sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()}
    collector=[ordered]@{runId=(Field $collection 'runId');sourceSha=(Field $collection 'sourceSha');githubConclusion=(Field $collection 'githubConclusion');collectionExitCode=(Field $collection 'collectionExitCode');evidenceComplete=(Field $collection 'evidenceComplete');failures=(Field $collection 'failures')}
    textInventory=$anchor;listedLocalTextFiles=$textIndex.Count;locallyVerifiedTextFiles=@($actual.Values | Where-Object { $_.matched }).Count
    localTextBytes=(Sum-Field $actual.Values 'bytes');cloudInventoriedFiles=$cloudIndex.Count
    producerManifests=$manifestAudits.ToArray();producerRows=(Sum-Field $manifestAudits 'rows')
    producerLocalBytesVerifiedRows=(Sum-Field $manifestAudits 'localBytesVerifiedRows')
    producerCloudCollectorHashComparedRows=(Sum-Field $manifestAudits 'cloudCollectorHashComparedRows')
    archiveIntegrityPassed=($issues.Count -eq 0);auditIssues=$issues.ToArray();auditExitCode=$(if ($issues.Count) { 1 } else { 0 })
    execution=[ordered]@{status=$(if ($executionPassed) { 'passed' } else { 'failed-or-incomplete' });platforms=$platformAudits.ToArray();reports=$reportAudits.ToArray();issues=$executionIssues.ToArray();cases=(Sum-Field $platformAudits 'caseCount');attempts=(Sum-Field $platformAudits 'attempts');checks=(Sum-Field $platformAudits 'checks');failedChecks=(Sum-Field $platformAudits 'failedChecks')}
    recordedRunPassed=($issues.Count -eq 0 -and $collectorComplete -and $executionPassed)
    acceptanceDecision='not-made-by-this-auditor';attemptCountMeaning='Controller child attempts, including startup failures; not a claim that each business operation executed.'
    deepPlatformSemanticsAudit='not-performed-requires-independent-review'
    scope=@('Only archived JSON/text bytes and hashes were read; no project code, tests, database or binary was executed.','Cloud-only hashes were compared with producer and collector records; cloud-only bytes were not locally rehashed.','The text inventory is not self-authenticating; archive/receipt provenance needs its separately trusted download receipt.','Sealed/sourceUnchanged and expected failed operations or exit 86 do not themselves determine test success.','Execution statistics are derived from actual materialized scenarios and receipts, not a fixed 186/187 assumption.')
}
$json=$output | ConvertTo-Json -Depth 100
if ($OutputPath) { $stream=[IO.File]::Open($OutputPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); try { $bytes=[Text.UTF8Encoding]::new($false).GetBytes($json+"`n");$stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() } }
else { $json }
exit $output.auditExitCode
