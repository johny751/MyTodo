#requires -Version 7.2
# Archived JSON/text/hash parsing only. No project or database execution.
$ErrorActionPreference='Stop'
$runId='45199685003';$source='19ceea620d1f7c21d89e5c65f1aa9fcac437caaa'
$root='outputs/c0-07/evidence/'+$runId
$checks=[Collections.Generic.List[object]]::new();$platforms=[Collections.Generic.List[object]]::new();$kills=[Collections.Generic.List[object]]::new()
function Read-CoreJson([string]$P){return ,(Get-Content -LiteralPath $P -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -NoEnumerate -Depth 100)}
function Get-CoreHash([string]$P){(Get-FileHash -LiteralPath $P -Algorithm SHA256).Hash.ToLowerInvariant()}
function Same($A,$B){($A | ConvertTo-Json -Compress -Depth 100) -ceq ($B | ConvertTo-Json -Compress -Depth 100)}
function Test-CoreEvidence([string]$Id,[bool]$Pass){$checks.Add([ordered]@{id=$Id;passed=$Pass})}
function Leaf([string]$P){$name=($P.Replace('\','/').Split('/'))[-1];if($name -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Unsafe receipt filename'};return $name}
$integrityPath='work/c007-19ce-c006-core-integrity-only-raw.json';$integrity=Read-CoreJson $integrityPath
$collector=Read-CoreJson ($root+'/collection-summary.json');$cloud=Read-CoreJson ($root+'/all-files-sha256.json')
$acceptance=Read-CoreJson ($root+'/artifacts/c006-report-'+$runId+'-1/acceptance.json')
Test-CoreEvidence 'identity' ($collector.runId -ceq $runId -and $collector.sourceSha -ceq $source -and $acceptance.runId -ceq $runId -and $acceptance.sourceSha -ceq $source)
Test-CoreEvidence 'integrity' ($integrity.auditExitCode -eq 0 -and $integrity.auditIssues.Count -eq 0)
foreach($spec in @(@{tag='js';name='javascript';summary='summary.json';casePrefix='';expected=59},@{tag='native';name='windows-native';summary='cases/summary.json';casePrefix='cases/';expected=18},@{tag='android';name='android';summary='cases/summary.json';casePrefix='cases/';expected=6})){
 $artifact='c006-'+$spec.tag+'-'+$runId+'-1';$base=$root+'/artifacts/'+$artifact;$summary=Read-CoreJson ($base+'/'+$spec.summary)
 $caseRows=if($spec.tag -eq 'android'){$summary.cases}else{$summary.results}
 $acceptedPlatform=@($acceptance.platforms | Where-Object {$_.platform -ceq $spec.name})
 Test-CoreEvidence ($spec.tag+':summary') ($summary.sourceSha -ceq $source -and $summary.executed -eq $spec.expected -and $summary.passed -eq $spec.expected -and $summary.failed -eq 0 -and $caseRows.Count -eq $spec.expected)
 Test-CoreEvidence ($spec.tag+':acceptance-binding') ($acceptedPlatform.Count -eq 1 -and $acceptedPlatform[0].sha256 -ceq (Get-CoreHash ($base+'/'+$spec.summary)) -and (Same $acceptedPlatform[0].cases $caseRows))
 $caseAudits=[Collections.Generic.List[object]]::new();$operations=0;$rejected=0;$nativeAccepted=0;$jsPassed=0;$crashed=0;$restartCount=0;$caseIds=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
 foreach($row in $caseRows){
  if($row.id -cnotmatch '^[A-Za-z0-9_-]+$' -or !$caseIds.Add($row.id)){throw 'Unsafe/duplicate case id'}
  $dir=$base+'/'+$spec.casePrefix+$row.id;$caseName=if($spec.tag -eq 'android'){'case.json'}else{'case-result.json'};$case=Read-CoreJson ($dir+'/'+$caseName)
  Test-CoreEvidence ($spec.tag+':'+$row.id+':case') ($case.id -ceq $row.id -and $case.sourceSha -ceq $source -and $case.status -ceq 'passed' -and $null -eq $case.error -and $row.status -ceq 'passed' -and $null -eq $row.error)
  $caseOps=0;$caseRejects=0;$dbCases=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach($op in $case.operations){
   $operations++;$caseOps++
   if($spec.tag -ne 'android'){
    $name=Leaf $op.output;$result=Read-CoreJson ($dir+'/'+$name);$process=Read-CoreJson ($dir+'/'+$name.Replace('result-','process-'))
    Test-CoreEvidence ($spec.tag+':'+$row.id+':'+$name+':copies') ((Same $result $op.evidence) -and (Same $process $op))
    Test-CoreEvidence ($spec.tag+':'+$row.id+':'+$name+':identity') ($result.sourceSha -ceq $source -and $result.caseId -ceq $row.id)
    $isKill=$op.process.signal -ceq 'SIGKILL' -and $op.process.killed -eq $true -and $null -eq $op.process.code -and $result.status -ceq 'paused-at-gate'
    $isJsPass=$result.status -ceq 'passed' -and $op.process.code -eq 0
    $isJsReject=$result.status -ceq 'rejected' -and $op.process.code -eq 1
    $isNativePass=$op.platform -ceq 'windows-native' -and $result.accepted -eq $true -and $result.exitCode -eq 0 -and $op.process.code -eq 0
    $isNativeReject=$op.platform -ceq 'windows-native' -and $result.accepted -eq $false -and $result.exitCode -eq 1 -and $op.process.code -eq 1
    Test-CoreEvidence ($spec.tag+':'+$row.id+':'+$name+':outcome') (($isKill -or $isJsPass -or $isJsReject -or $isNativePass -or $isNativeReject) -and !$op.process.timedOut -and !$op.process.spawnError -and !$op.process.callbackError -and ($isKill -or !$op.process.signal))
    if($isJsPass){$jsPassed++};if($isNativePass){$nativeAccepted++};if($isJsReject -or $isNativeReject){$rejected++;$caseRejects++}
    if($isKill){$kills.Add([ordered]@{platformSuite=$spec.name;caseId=$row.id;result=$name;status=$result.status;signal=$op.process.signal;resultSha256=(Get-CoreHash ($dir+'/'+$name));evidencePresent=$true;note='Records selected JS worker termination; native suite entry is JS killed then fresh native takeover, not native kill recovery.'})}
   }else{
    $name=Leaf $op.out;$receipt=Read-CoreJson ($dir+'/'+$name+'.receipt.json');$main=Read-CoreJson ($dir+'/'+$name+'.main.json');$restart=Read-CoreJson ($dir+'/'+$name+'.restart.json');$result=Read-CoreJson ($dir+'/'+$name)
    $null=$dbCases.Add($op.dbCase);$crashed+=$receipt.crashedAttempts.Count;$restartCount++
    Test-CoreEvidence ('android:'+$row.id+':'+$name+':receipt') ((Same $receipt $op.receipt) -and $receipt.sourceSha -ceq $source -and $receipt.runId -ceq $runId -and $receipt.caseId -ceq $row.id -and $receipt.dbCase -ceq $op.dbCase -and $receipt.status -ceq 'passed' -and $receipt.exitCode -eq 0 -and $op.execution.code -eq 0 -and !$op.execution.signal -and !$op.execution.error -and !$op.execution.timedOut)
    Test-CoreEvidence ('android:'+$row.id+':'+$name+':hashes') ($receipt.main.resultSha256 -ceq (Get-CoreHash ($dir+'/'+$name+'.main.json')) -and $receipt.restart.resultSha256 -ceq (Get-CoreHash ($dir+'/'+$name+'.restart.json')) -and $receipt.outputSha256 -ceq (Get-CoreHash ($dir+'/'+$name)) -and $receipt.inputSha256 -ceq (Get-CoreHash ($dir+'/'+(Leaf $op.input))) -and $receipt.sqliteExport.auditSha256 -ceq (Get-CoreHash ($dir+'/'+$name+'.export-audit.json')))
    Test-CoreEvidence ('android:'+$row.id+':'+$name+':same-db-restart') ($main.provenance.sourceSha -ceq $source -and $restart.provenance.sourceSha -ceq $source -and $main.provenance.runtime.processId -ne $restart.provenance.runtime.processId -and (Same $main.raw $restart.raw) -and $receipt.restartComparison.status -ceq 'passed' -and $receipt.restartComparison.processIds[0] -eq $main.provenance.runtime.processId -and $receipt.restartComparison.processIds[1] -eq $restart.provenance.runtime.processId)
    Test-CoreEvidence ('android:'+$row.id+':'+$name+':no-crash-and-export') ($receipt.crashedAttempts.Count -eq 0 -and $receipt.failureEvidence.Count -eq 0 -and $receipt.sqliteExport.actualAuditMatches -eq $true -and $receipt.sqliteExport.fileUnchangedByRead -eq $true -and $receipt.main.instrumentationCode -eq -1 -and $receipt.restart.instrumentationCode -eq -1 -and $result.status -ceq 'passed' -and $result.operationAccepted -eq $result.expectedAccepted)
    if($result.operationAccepted -eq $false){$rejected++;$caseRejects++}
   }
  }
  $caseAudits.Add([ordered]@{id=$row.id;status=$case.status;operations=$caseOps;expectedRejections=$caseRejects;dbCases=@($dbCases);faults=$case.faults})
 }
 $platforms.Add([ordered]@{platform=$spec.name;cases=$caseRows.Count;passed=$summary.passed;failed=$summary.failed;operations=$operations;expectedRejections=$rejected;nativeAccepted=$nativeAccepted;jsPassed=$jsPassed;androidProcessRestarts=$restartCount;androidCrashedAttempts=$crashed;casesSummary=$caseAudits.ToArray();notExecuted=$summary.notExecuted;scope=$summary.scope})
}
$failureRows=@(foreach($f in $collector.failures){$entry=@($cloud | Where-Object {$_.path -ceq $f.path});$localExists=Test-Path -LiteralPath ($root+'/artifacts/'+$f.path);Test-CoreEvidence ('excluded:'+ $f.path) ($f.kind -ceq 'unexpected-credential-fixture-in-artifact' -and $entry.Count -eq 1 -and $entry[0].copiedToTextArchive -eq $false -and $entry[0].omittedReason -ceq 'credential-fixture-excluded' -and !$localExists);[ordered]@{path=$f.path;kind=$f.kind;copiedToTextArchive=$entry[0].copiedToTextArchive;omittedReason=$entry[0].omittedReason;localExists=$localExists}})
Test-CoreEvidence 'collector-qualification' ($collector.collectionExitCode -eq 1 -and $collector.evidenceComplete -eq $false -and $failureRows.Count -eq 24)
Test-CoreEvidence 'acceptance-counts' ($acceptance.executed -eq 83 -and $acceptance.passed -eq 83 -and $acceptance.failed -eq 0 -and $acceptance.errors.Count -eq 0 -and $acceptance.status -ceq 'passed' -and $kills.Count -eq 7)
$failed=@($checks | Where-Object {!$_.passed})
$result=[ordered]@{schema='mytodo-c007-19ce-c006-core-independent-evidence-audit';version=1;runId=$runId;sourceSha=$source;scriptSha256=(Get-CoreHash $PSCommandPath);auditedAt=[DateTimeOffset]::UtcNow.ToString('o');integrityAuditPath=$integrityPath;integrityAuditSha256=(Get-CoreHash $integrityPath);integrityOnly=[ordered]@{localTextFiles=$integrity.locallyVerifiedTextFiles;localTextBytes=$integrity.localTextBytes;cloudFiles=$integrity.cloudInventoriedFiles;producerRows=$integrity.producerRows;producerLocalRows=$integrity.producerLocalBytesVerifiedRows;producerCloudRows=$integrity.producerCloudCollectorHashComparedRows;issues=$integrity.auditIssues};recordedCases=83;platforms=$platforms.ToArray();selectedJsKills=$kills.ToArray();originalCollectorExitCode=$collector.collectionExitCode;originalCollectorEvidenceComplete=$collector.evidenceComplete;originalExcludedCredentialFailures=$failureRows;auditChecks=$checks.ToArray();failedAuditChecks=$failed;auditPassed=($failed.Count -eq 0);localProjectExecutions=0;limitations=@('C007 generic audit execution fields are inapplicable; only integrity fields were consumed.','83 means actual harness cases:59 JavaScript,18 native-suite cases,6 Android; not a universal platform cross-product.','Native suite includes JavaScript cooperation; its selected killed worker is JavaScript, not native forced-termination recovery.','Android24 operations each used a force-stop and new instrumentation process to reopen the selected dbCase. No Android internal migration boundary abrupt-kill acceptance is claimed.','24 credential fixtures remain cloud-only and unread/undecrypted; original collector1/incomplete remains.','Cloud-only hashes are collector/producer comparisons, not local binary rehashing.','The archive text inventory still requires separately trusted transfer provenance.','This independent audit verifies archived receipts and selected outcome consistency, not re-execution of project tests or a complete semantic proof of every case.')}
$out='work/c007-19ce-c006-core-audit.json';if(Test-Path -LiteralPath $out){throw 'Existing output'}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($out),($result | ConvertTo-Json -Depth 100)+"`n",[Text.UTF8Encoding]::new($false))
[pscustomobject]@{path=$out;sha256=(Get-CoreHash $out);checkCount=$checks.Count;failed=$failed.Count;failedChecks=$failed;platforms=$platforms | ForEach-Object {[ordered]@{platform=$_.platform;cases=$_.cases;operations=$_.operations;rejected=$_.expectedRejections;restarts=$_.androidProcessRestarts;crashes=$_.androidCrashedAttempts}}} | ConvertTo-Json -Depth 6
if($failed.Count){exit 1}
