#requires -Version 7.2
# Independent archived JSON/text/hash parsing. Does not execute project code.
$ErrorActionPreference='Stop'
$root='outputs/c0-07/evidence/45199685003/artifacts'
$source='19ceea620d1f7c21d89e5c65f1aa9fcac437caaa'
$checks=[Collections.Generic.List[object]]::new()
$rows=[Collections.Generic.List[object]]::new()
function Read-AuditJson([string]$p){return ,(Get-Content -LiteralPath $p -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable -NoEnumerate -Depth 100)}
function Same-Audit($a,$b){($a | ConvertTo-Json -Depth 100 -Compress) -ceq ($b | ConvertTo-Json -Depth 100 -Compress)}
function Check-Audit([string]$id,[bool]$ok){$checks.Add([ordered]@{id=$id;passed=$ok})}
function Audit-Leaf([string]$p){$n=($p.Replace('\','/').Split('/'))[-1];if($n -cnotmatch '^[a-zA-Z0-9._-]+$'){throw 'Unsafe filename'};return $n}
function Path-Audit([string]$p){$p.Replace('\','/').TrimEnd('/')}
foreach($suite in @(@{name='javascript';base='c006-js-45199685003-1';summary='summary.json';prefix=''},@{name='windows-native';base='c006-native-45199685003-1';summary='cases/summary.json';prefix='cases/'})){
 $base=$root+'/'+$suite.base;$summary=Read-AuditJson ($base+'/'+$suite.summary)
 foreach($caseRow in $summary.results){
  $dir=$base+'/'+$suite.prefix+$caseRow.id;$case=Read-AuditJson ($dir+'/case-result.json');$last=@{}
  foreach($op in $case.operations){
   $e=$op.evidence;$spec=Read-AuditJson ($dir+'/'+(Audit-Leaf $op.specFile));$name=Audit-Leaf $op.output;$id=$suite.name+':'+$case.id+':'+$name
   $native=$op.platform -ceq 'windows-native';$isKill=$op.process.killed -eq $true
   Check-Audit ($id+':request-process-identity') ($e.caseId -ceq $spec.caseId -and $e.operation -ceq $spec.operation -and $e.sourceSha -ceq $source -and $e.pid -eq $op.process.pid -and $e.pid -gt 0)
   $reopenChecks=0;$chainChecked=$false
   if($native){
    Check-Audit ($id+':selected-directory') ((Path-Audit $e.directory) -ceq (Path-Audit $spec.directory))
    foreach($stage in @('before','after','reopened')){
     $a=$e[$stage]
     Check-Audit ($id+':'+$stage+':sql-health') ($a.integrity -eq $true -and $a.autocommit -eq $true -and $a.readErrors.Count -eq 0 -and $null -ne $a.sqlMeta -and $null -ne $a.sqlEntities -and $null -ne $a.sqlOutbox)
    }
    foreach($field in @('sqlMeta','sqlEntities','sqlOutbox','meta','rows','outbox')){Check-Audit ($id+':reopened:'+ $field) (Same-Audit $e.after[$field] $e.reopened[$field]);$reopenChecks++}
    Check-Audit ($id+':fixture-health') (!$e.auditFailed -and !$e.transportGuardFailed -and !$e.reopenError)
    $db=Path-Audit $e.directory;$state=$e.after
   }else{
    $db=(Path-Audit $spec.dbDir)+'/tasks.sqlite'
    $states=[ordered]@{before=$e.before};if($isKill){$states['gate']=$e.gate.audit}else{$states['after']=$e.after}
    foreach($stage in $states.Keys){$a=$states[$stage];Check-Audit ($id+':'+$stage+':selected-file') ((Path-Audit $a.databaseFile) -ceq $db);Check-Audit ($id+':'+$stage+':sql-health') ($a.integrity.Count -eq 1 -and $a.integrity[0].integrity_check -ceq 'ok')}
    if($spec.operation -ceq 'audit'){Check-Audit ($id+':audit-does-not-mutate') (Same-Audit $e.before.raw $e.after.raw)}
    if($last.ContainsKey($db)){
     $chainChecked=$true
     Check-Audit ($id+':new-worker-pid') ($last[$db].pid -ne $e.pid)
     Check-Audit ($id+':new-worker-same-db-state') (Same-Audit $last[$db].raw $e.before.raw)
    }
    if($isKill){
     Check-Audit ($id+':selected-kill-identity') ($e.gate.pid -eq $e.pid -and $op.process.gate.pid -eq $e.pid -and $op.process.signal -ceq 'SIGKILL' -and $null -eq $op.process.code)
     $state=$e.gate.audit
    }else{$state=$e.after}
    $last[$db]=@{pid=$e.pid;raw=$state.raw}
   }
   $rows.Add([ordered]@{suite=$suite.name;caseId=$case.id;result=$name;native=$native;operation=$e.operation;pid=$e.pid;db=$db;status=$e.status;accepted=$e.accepted;exitCode=$op.process.code;signal=$op.process.signal;selectedKill=$isKill;nativeCloseReopenFields=$reopenChecks;jsSameDbProcessChainChecked=$chainChecked})
  }
 }
}
$failed=@($checks | Where-Object {!$_.passed})
$rawPath='work/c007-19ce-c006-core-audit.json';$raw=Read-AuditJson $rawPath
$result=[ordered]@{schema='mytodo-c007-19ce-node-native-reopen-evidence-audit';version=1;sourceSha=$source;runId='45199685003';auditedAt=[DateTimeOffset]::UtcNow.ToString('o');scriptSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();originalCoreAudit=[ordered]@{path=$rawPath;sha256=(Get-FileHash -LiteralPath $rawPath -Algorithm SHA256).Hash.ToLowerInvariant();checks=$raw.auditChecks.Count;failures=$raw.failedAuditChecks};operations=$rows.ToArray();checks=$checks.ToArray();failedChecks=$failed;auditPassed=($failed.Count -eq 0);summary=[ordered]@{operations=$rows.Count;nativeOperations=@($rows | Where-Object {$_.native}).Count;jsOperations=@($rows | Where-Object {!$_.native}).Count;nativeCloseReopens=@($rows | Where-Object {$_.nativeCloseReopenFields -eq 6}).Count;jsSameDbProcessChainLinks=@($rows | Where-Object {$_.jsSameDbProcessChainChecked}).Count;selectedJsKills=@($rows | Where-Object {$_.selectedKill}).Count;checks=$checks.Count;failedChecks=$failed.Count};localProjectExecutions=0;limitations=@('Checks archived receipt/request identities, raw state equality and selected process outcomes; not a fresh execution of project tests.','Native close/reopen is inside each native process; JavaScript same-database links compare consecutive archived new-worker snapshots.','The seven selected killed workers are JavaScript, including the one in the native suite.','Android no-extra-crash observation remains false in the original audit and requires separately qualified Android deep review.','Archive completeness and cloud-only credential exclusions retain their original collector qualifications.')}
$out='work/c007-19ce-node-native-reopens-audit.json';if(Test-Path -LiteralPath $out){throw 'Existing output'}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($out),($result | ConvertTo-Json -Depth 100)+"`n",[Text.UTF8Encoding]::new($false))
[ordered]@{path=$out;bytes=(Get-Item -LiteralPath $out).Length;sha256=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant();summary=$result.summary;failed=$failed} | ConvertTo-Json -Depth 5
if($failed.Count){exit 1}
