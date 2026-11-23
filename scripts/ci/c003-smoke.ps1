param([Parameter(Mandatory=$true)][ValidateSet('windows-c','javascript','android')][string]$Platform,[Parameter(Mandatory=$true)][string]$SourceSha)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Cloud only'}
$root=Join-Path $env:RUNNER_TEMP ('c003-smoke-'+$Platform)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$receipt=[ordered]@{platform=$Platform;sourceSha=$SourceSha;workflowSha=$env:GITHUB_SHA;runUrl="$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";status='running';commands=@();runner=@{os=$env:RUNNER_OS;image=$env:ImageOS;imageVersion=$env:ImageVersion};startedAt=[DateTime]::UtcNow.ToString('o')}
$code=1
function Invoke-Recorded([string]$Label,[string]$Exe,[string[]]$Arguments){
  & $Exe @Arguments *> (Join-Path $root ($Label+'.log'))
  $nativeCode=$LASTEXITCODE
  $receipt.commands+=@{label=$Label;command=@($Exe)+$Arguments;exitCode=$nativeCode;log=$Label+'.log'}
  if($nativeCode -ne 0){throw "$Label exited $nativeCode"}
}
try{
  $head=(& git rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0 -or $head -ne $SourceSha){throw 'Historical adapter source SHA mismatch'}
  $state=& git status --porcelain=v1;if($LASTEXITCODE -ne 0 -or "$state".Trim()){throw 'Historical adapter checkout not clean'}
  $node=(Get-Command node -CommandType Application).Source
  $v=& $node --version;if($LASTEXITCODE -ne 0 -or "$v" -notmatch '^v(\d+\.\d+\.\d+)$' -or [version]$Matches[1] -lt [version]'22.13.0'){throw 'Preinstalled Node>=22.13 required'}
  $receipt.node=@{path=$node;version="$v"};$env:EXPECTED_SOURCE_SHA=$SourceSha
  if($env:JAVA_HOME_17_X64){$env:JAVA_HOME=$env:JAVA_HOME_17_X64}
  if($Platform -eq 'android'){
    Invoke-Recorded 'android-build' $node @('tests/protocol-harness/android/build-android.mjs','--output-dir',(Join-Path $root 'build'))
    $receipt.buildStatus='passed';$receipt.protocolStatus='blocked';$receipt.reason='No preinstalled system image; no actual Android SQLite execution; no download attempted';$receipt.status='blocked';$code=78
  }else{
    $suite='tests/protocol-vectors/suite.json'
    if($Platform -eq 'windows-c'){$exe=Join-Path $root 'windows-protocol.exe';Invoke-Recorded 'windows-build' $node @('tests/protocol-harness/build-windows-protocol.mjs',$exe);$prefix=@()}
    else{$exe=$node;$prefix=@('tests/protocol-harness/js-harness.mjs')}
    $sample=Join-Path $root 'sample.json';$result=Join-Path $root 'received.json';$db1=Join-Path $root 'producer';$db2=Join-Path $root 'receiver'
    Invoke-Recorded 'generate-basic' $exe ($prefix+@('generate','--suite',$suite,'--case','basic-note','--db-dir',$db1,'--output',$sample))
    Invoke-Recorded 'receive-basic' $exe ($prefix+@('receive','--suite',$suite,'--case','basic-note','--db-dir',$db2,'--output',$result,'--input',$sample))
    Invoke-Recorded 'process-restart' $exe ($prefix+@('report','--suite',$suite,'--case','basic-note','--db-dir',$db2,'--output',(Join-Path $root 'restarted.json')))
    $receipt.status='passed';$receipt.protocolStatus='single-platform-smoke-only';$code=0
  }
}catch{$receipt.status='failed';$receipt.error=$_.Exception.ToString();$code=1}
finally{
  $receipt.wrapperExitCode=$code;$receipt.finishedAt=[DateTime]::UtcNow.ToString('o')
  $receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $root 'receipt.json') -Encoding utf8
  Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {@{path=[IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'payload-sha256.json') -Encoding utf8
  $receipt | ConvertTo-Json -Depth 5
}
exit $code
