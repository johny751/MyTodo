$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'C0-03 builds and tests must run on GitHub Actions'}
$output=Join-Path $env:RUNNER_TEMP 'c003-matrix'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$receipt=[ordered]@{status='running';runUrl="$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";sourceSha=$env:GITHUB_SHA;commands=@();runner=@{os=$env:RUNNER_OS;arch=$env:RUNNER_ARCH;image=$env:ImageOS;imageVersion=$env:ImageVersion};startedAt=[DateTime]::UtcNow.ToString('o');exitCode=$null}
$code=1
try {
  $candidates=@((Get-Command node -CommandType Application).Source)
  $cache=Join-Path $env:RUNNER_TOOL_CACHE 'node'
  if(Test-Path -LiteralPath $cache){foreach($dir in Get-ChildItem -LiteralPath $cache -Directory){$candidate=Join-Path $dir.FullName 'x64/node.exe';if(Test-Path -LiteralPath $candidate){$candidates+=$candidate}}}
  $selected=$null
  foreach($candidate in $candidates){
    $version=& $candidate --version; $probeExit=$LASTEXITCODE
    $receipt.commands+=@{command=@($candidate,'--version');exitCode=$probeExit;stdout="$version"}
    if($probeExit -eq 0 -and "$version" -match '^v(\d+\.\d+\.\d+)$' -and [version]$Matches[1] -ge [version]'22.13.0'){$selected=$candidate;break}
  }
  if(-not $selected){throw 'No preinstalled Node >=22.13; no dependency download attempted'}
  $receipt.node=@{path=$selected;version=(& $selected --version)}
  if($env:JAVA_HOME_17_X64){$env:JAVA_HOME=$env:JAVA_HOME_17_X64}
  $receipt.javaHome=$env:JAVA_HOME
  $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
  if(Test-Path -LiteralPath $vswhere){
    $vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json
    $vs | Set-Content -LiteralPath (Join-Path $output 'visual-studio-inventory.json') -Encoding utf8
    $receipt.vswhereExitCode=$LASTEXITCODE
    $instance=$vs | ConvertFrom-Json
    $receipt.compilerFiles=@(foreach($installation in $instance){$tools=Join-Path $installation.installationPath 'VC/Tools/MSVC';if(Test-Path -LiteralPath $tools){foreach($compiler in Get-ChildItem -LiteralPath $tools -Filter cl.exe -Recurse | Where-Object {$_.FullName -like '*Hostx64*x64*'}){@{path=$compiler.FullName;fileVersion=$compiler.VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $compiler.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}}})
  }
  $env:EXPECTED_SOURCE_SHA=$env:GITHUB_SHA
  $receipt.command=@($selected,'tests/protocol-harness/run-matrix.mjs','--output',$output)
  & $selected tests/protocol-harness/run-matrix.mjs --output $output *> (Join-Path $output 'matrix.stdout-stderr.log')
  $code=$LASTEXITCODE
  $receipt.exitCode=$code
  $receipt.status=if($code -eq 0){'passed'}elseif($code -eq 78){'blocked'}else{'failed'}
}catch{$receipt.error=$_.Exception.ToString();$receipt.status='failed';$code=1}
finally{
  $receipt.wrapperExitCode=$code;$receipt.finishedAt=[DateTime]::UtcNow.ToString('o')
  $receipt | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $output 'workflow-receipt.json') -Encoding utf8
  Get-ChildItem -LiteralPath $output -Recurse -File | Where-Object {$_.Name -ne 'workflow-payload-sha256.json'} | ForEach-Object {@{path=[IO.Path]::GetRelativePath($output,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'workflow-payload-sha256.json') -Encoding utf8
  $receipt | ConvertTo-Json -Depth 5
}
exit $code
