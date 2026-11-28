[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ProductSourceSha,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedExecutableSha256,
    [ValidateSet(96,144)][int]$Dpi=96
)
# Independent addition: do not source, weaken or replace the original 24-case UI suite.
# Native execution, Add-Type compilation, SendInput and capture are Actions-only.
if($env:GITHUB_ACTIONS -cne 'true' -or -not $IsWindows){throw 'Timer history UI may run only on GitHub Actions Windows.'}
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if(-not (Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')){throw 'PowerShell 7.5+ DateKind String is required.'}
if($env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$'){throw 'Exact Actions run and attempt required.'}
$head=(& git -C $PSScriptRoot rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $head -cne $ProductSourceSha -or $head -cne $env:GITHUB_SHA -or $head -cne $env:EXPECTED_SOURCE_SHA){throw 'Source identity mismatch.'}
$exePath=(Resolve-Path -LiteralPath $Executable).Path
$exeItem=Get-Item -LiteralPath $exePath
if($exeItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Executable must be a plain local file.'}
$exeHash=(Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
if($exeHash -cne $ExpectedExecutableSha256){throw 'Executable hash mismatch.'}
$buildReceiptPath=$exePath+'.build.json'
$buildReceipt=Get-Content -LiteralPath $buildReceiptPath -Raw -Encoding utf8 | ConvertFrom-Json -Depth 80
if($buildReceipt.sourceSha -cne $head -or $buildReceipt.runId -cne $env:GITHUB_RUN_ID -or $buildReceipt.runAttempt -cne $env:GITHUB_RUN_ATTEMPT -or $buildReceipt.executable.sha256 -cne $exeHash -or $buildReceipt.uiDesignStage -cne 'D4-09'){throw 'Build receipt does not bind this UI candidate.'}
$runnerRoot=(Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path.TrimEnd('\','/')
$evidenceRoot=[IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\','/')
if([IO.Path]::GetDirectoryName($evidenceRoot).TrimEnd('\','/') -ine $runnerRoot -or [IO.Path]::GetFileName($evidenceRoot) -cne ('d4-09-timer-history-'+$Dpi) -or (Test-Path -LiteralPath $evidenceRoot)){throw 'Output must be a new direct RUNNER_TEMP/d4-09-timer-history-{Dpi} directory.'}
if((Get-Item -LiteralPath $runnerRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'RUNNER_TEMP must be a plain local directory.'}
$null=New-Item -ItemType Directory -Path $evidenceRoot
foreach($folder in @('screenshots','scenarios','readback','processes','synthetic-data')){$null=New-Item -ItemType Directory -Path (Join-Path $evidenceRoot $folder)}
$dataRoot=Join-Path $evidenceRoot 'synthetic-data'
$timerFile=Join-Path $dataRoot 'd408/timer.json'
Start-Transcript -LiteralPath (Join-Path $evidenceRoot 'harness-transcript.log') | Out-Null
$startedAtUtc=[DateTime]::UtcNow.ToString('o');$scale=$Dpi/96.0
$caseIds=@('TH409-01','TH409-02','TH409-03','TH409-04','TH409-05','TH409-06','TH409-07','TH409-08','TH409-09','TH409-10')
$results=[Collections.Generic.List[object]]::new();$captures=[Collections.Generic.List[object]]::new();$commands=[Collections.Generic.List[object]]::new();$readbacks=[Collections.Generic.List[object]]::new();$cleanupErrors=[Collections.Generic.List[string]]::new()
$script:gui=$null;$script:main=0L;$script:timer=0L;$script:outTask=$null;$script:errTask=$null;$script:processIndex=0;$script:processSaved=$false
$script:activeCase='startup';$script:readIndex=0;$script:baselineHistory=$null;$script:baselineStoreHash=$null;$script:entry=$null
$script:desktopBefore=$null;$script:desktopDuring=$null;$script:desktopRestored=$null;$script:coordinateMethod=$null;$script:driverLoaded=$false
$fatalError=$null;$hashError=$null;$report=$null
$titleMarker='TITLE-END-'+$Dpi+'-'+$env:GITHUB_RUN_ID+'-'+$env:GITHUB_RUN_ATTEMPT
$titleBase=('历史全文中文 English verification 可见性与账户记录 ' * 20)
$taskTitle=$titleBase.Substring(0,300-$titleMarker.Length-1)+' '+$titleMarker
$taskId='d409-timer-history-'+$Dpi
function Write-Json([string]$Path,$Value){[IO.File]::WriteAllText($Path,(ConvertTo-Json -InputObject $Value -Depth 90)+"`n",[Text.UTF8Encoding]::new($false))}
function Assert($Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Wait-Until([scriptblock]$Condition,[string]$Description,[int]$Timeout=6000){$watch=[Diagnostics.Stopwatch]::StartNew();do{if(& $Condition){return};Start-Sleep -Milliseconds 80}while($watch.ElapsedMilliseconds -lt $Timeout);throw "Timeout: $Description"}
function Flush-Trace {
    if(-not $script:driverLoaded){return}
    foreach($entry in @([D409.NativeUiDriver]::DrainTrace())){[IO.File]::AppendAllText((Join-Path $evidenceRoot 'input-trace.jsonl'),((@{caseId=$script:activeCase;input=$entry}|ConvertTo-Json -Depth 30 -Compress)+"`n"),[Text.UTF8Encoding]::new($false))}
}
function Windows {return @([D409.NativeUiDriver]::Snapshot($script:gui.Id))}
function Window([string]$Class){$rows=@(Windows|Where-Object {$_.ClassName -ceq $Class -and $_.Visible});Assert ($rows.Count -eq 1) "Expected one $Class window, found $($rows.Count)";return $rows[0].Handle}
function Control([long]$Root,[int]$Id,[string]$Class=''){$rows=@(Windows|Where-Object {$_.Root -eq $Root -and $_.ControlId -eq $Id -and (-not $Class -or $_.ClassName -ieq $Class)});Assert ($rows.Count -eq 1) "Expected control $Id/$Class in $Root, found $($rows.Count)";return $rows[0].Handle}
function Text([long]$Handle){return [D409.NativeUiDriver]::Text($Handle)}
function Click([long]$Handle){[D409.NativeUiDriver]::Click($Handle);Flush-Trace}
function Focus([long]$Handle){[D409.NativeUiDriver]::Focus($Handle);Flush-Trace}
function Key([long]$Handle,[int]$Code,[bool]$Ctrl=$false,[bool]$Shift=$false,[bool]$Alt=$false){[D409.NativeUiDriver]::Chord($Handle,[uint16]$Code,$Ctrl,$Shift,$Alt);Flush-Trace}
function Combo([long]$Handle,[int]$Index){Focus $Handle;Key $Handle 36;for($n=0;$n -lt $Index;$n++){Key $Handle 40};Wait-Until {[D409.NativeUiDriver]::ReadNumber($Handle,0x147,0) -eq $Index} 'real combo keyboard selection'}
function Reachable([long]$Handle){$w=[D409.NativeUiDriver]::Describe($Handle);$r=[D409.NativeUiDriver]::Client($w.Root);Assert ($w.Visible -and $w.Enabled -and $w.Left -ge $r.Left -and $w.Top -ge $r.Top -and $w.Right -le $r.Right -and $w.Bottom -le $r.Bottom) "Control $($w.ControlId) is not wholly visible in its client";$null=[D409.NativeUiDriver]::CheckPoint($Handle,[int](($w.Left+$w.Right)/2),[int](($w.Top+$w.Bottom)/2));return $w}
function Start-Native([string[]]$Arguments,[bool]$Gui){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exePath;$info.UseShellExecute=$false;$info.CreateNoWindow=-not $Gui;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.StandardOutputEncoding=[Text.Encoding]::UTF8;$info.StandardErrorEncoding=[Text.Encoding]::UTF8
    foreach($arg in $Arguments){$info.ArgumentList.Add($arg)}
    $p=[Diagnostics.Process]::new();$p.StartInfo=$info;Assert ($p.Start()) 'Native process failed to start';return $p
}
function Invoke-Native([string]$Name,[string[]]$Arguments){
    $p=Start-Native $Arguments $false;$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();$timedOut=$false
    try{if(-not $p.WaitForExit(20000)){$timedOut=$true;$p.Kill($true);$null=$p.WaitForExit(5000)};Assert ($p.HasExited) "CLI did not terminate: $Name"}
    finally{
        if($p.HasExited){[IO.File]::WriteAllText((Join-Path $evidenceRoot "processes/$Name.stdout.log"),$out.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $evidenceRoot "processes/$Name.stderr.log"),$err.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))}
        $record=[ordered]@{name=$Name;pid=$p.Id;arguments=$Arguments;hasExited=$p.HasExited;exitCode=$(if($p.HasExited){$p.ExitCode}else{$null});timedOut=$timedOut;atUtc=[DateTime]::UtcNow.ToString('o')};$commands.Add($record);Write-Json (Join-Path $evidenceRoot "processes/$Name.json") $record
    }
    Assert (-not $timedOut -and $p.ExitCode -eq 0) "CLI $Name failed; see preserved stdout/stderr and exit record"
}
function Save-GuiProcess([string]$CloseMethod){
    if(-not $script:gui -or $script:processSaved){return}
    $exited=$script:gui.HasExited
    if($exited){[IO.File]::WriteAllText((Join-Path $evidenceRoot "processes/gui-$script:processIndex.stdout.log"),$script:outTask.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $evidenceRoot "processes/gui-$script:processIndex.stderr.log"),$script:errTask.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))}
    $record=[ordered]@{name="gui-$script:processIndex";pid=$script:gui.Id;arguments=@('--data-dir',$dataRoot,'--visual-dpi',"$Dpi");hasExited=$exited;exitCode=$(if($exited){$script:gui.ExitCode}else{$null});closeMethod=$CloseMethod;atUtc=[DateTime]::UtcNow.ToString('o')};$commands.Add($record);Write-Json (Join-Path $evidenceRoot "processes/gui-$script:processIndex.json") $record;$script:processSaved=$exited
}
function Start-Gui {
    $script:processIndex++;$script:processSaved=$false;$script:gui=Start-Native @('--data-dir',$dataRoot,'--visual-dpi',"$Dpi") $true;$script:outTask=$script:gui.StandardOutput.ReadToEndAsync();$script:errTask=$script:gui.StandardError.ReadToEndAsync()
    Write-Json (Join-Path $evidenceRoot "processes/gui-$script:processIndex.started.json") @{pid=$script:gui.Id;sourceSha=$head;executableSha256=$exeHash;arguments=@('--data-dir',$dataRoot,'--visual-dpi',"$Dpi");startedAtUtc=[DateTime]::UtcNow.ToString('o')}
    Wait-Until {Assert (-not $script:gui.HasExited) 'GUI exited at startup';@(Windows|Where-Object {$_.ClassName -ceq 'GxNativeModern' -and $_.Visible}).Count -eq 1} 'native main window' 15000
    $script:main=Window 'GxNativeModern';[D409.NativeUiDriver]::Fit($script:main,[int](1280*$scale),[int](860*$scale));Flush-Trace
}
function Open-Timer {
    Click (Control $script:main 4501 'Button');Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq 'GxD408PomodoroTimer' -and $_.Visible}).Count -eq 1} 'native timer window';$script:timer=Window 'GxD408PomodoroTimer';[D409.NativeUiDriver]::Fit($script:timer,[int](1180*$scale),[int](820*$scale));Flush-Trace
}
function Close-VisibleModules {
    # Close detail first, then hide the native module through its existing close path.
    foreach($class in @('GxD409TimerHistory','GxD408PomodoroTimer')){foreach($w in @(Windows|Where-Object {$_.ClassName -ceq $class -and $_.Visible})){[D409.NativeUiDriver]::Activate($w.Handle);Key 0 115 $false $false $true;Wait-Until {@(Windows|Where-Object {$_.Handle -eq $w.Handle -and $_.Visible}).Count -eq 0} "normal $class close"}}
}
function Stop-Gui {
    if(-not $script:gui){return}
    if(-not $script:gui.HasExited){Close-VisibleModules;[D409.NativeUiDriver]::Activate($script:main);Key 0 115 $false $false $true;Assert ($script:gui.WaitForExit(7000)) 'Normal main close did not complete'}
    Save-GuiProcess 'real Alt+F4 through original window close/save lifecycle';Assert ($script:gui.ExitCode -eq 0) 'Native GUI exited unsuccessfully'
}
function Read-Timer([string]$Label){
    Assert (Test-Path -LiteralPath $timerFile) 'No durable timer envelope'
    $bytes=[IO.File]::ReadAllBytes($timerFile);$raw=[Text.Encoding]::UTF8.GetString($bytes);$envelope=$raw|ConvertFrom-Json -DateKind String -Depth 90
    Assert ($null -ne $envelope.payload -and $envelope.generation -ge 1 -and $envelope.sha256 -match '^[a-f0-9]{64}$') 'Invalid timer envelope shape'
    $script:readIndex++;$name=('readback/{0:D3}-{1}.json' -f $script:readIndex,$Label);$copy=Join-Path $evidenceRoot $name;[IO.File]::WriteAllBytes($copy,$bytes)
    $readbacks.Add(@{caseId=$script:activeCase;path=$name;sha256=(Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant();sourceSha256=(Get-FileHash -LiteralPath $timerFile -Algorithm SHA256).Hash.ToLowerInvariant();generation=$envelope.generation;payloadChecksumAsStored=$envelope.sha256;method='Read-only original timer envelope; no store or SQLite mutation by harness'})
    return $envelope.payload
}
function History-Json($State){return ConvertTo-Json -InputObject @($State.history) -Depth 90 -Compress}
function Assert-History([string]$Label,[bool]$ExactStore=$true){$state=Read-Timer $Label;Assert ((History-Json $state) -ceq $script:baselineHistory) 'History content changed while viewing, scrolling or reopening';if($ExactStore){Assert ((Get-FileHash -LiteralPath $timerFile -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $script:baselineStoreHash) 'History UI mutated the durable timer envelope'};return $state}
function Capture([string]$Name,[long]$Handle){
    # No PrintWindow or synthetic rendering: preserve actual foreground screen pixels.
    $w=[D409.NativeUiDriver]::Describe($Handle);$client=[D409.NativeUiDriver]::Client($Handle);$desktop=[D409.NativeUiDriver]::Desktop()
    Assert ($client.Left -ge $desktop.Left -and $client.Top -ge $desktop.Top -and $client.Right -le $desktop.Left+$desktop.Width -and $client.Bottom -le $desktop.Top+$desktop.Height) 'Capture client exceeds physical desktop'
    $null=[D409.NativeUiDriver]::CheckPoint($Handle,[int](($client.Left+$client.Right)/2),[int](($client.Top+$client.Bottom)/2))
    $left=[Math]::Max($desktop.Left,$w.Left);$top=[Math]::Max($desktop.Top,$w.Top);$width=[Math]::Min($desktop.Left+$desktop.Width,$w.Right)-$left;$height=[Math]::Min($desktop.Top+$desktop.Height,$w.Bottom)-$top
    Assert ($width -gt 0 -and $height -gt 0) 'Capture has no visible pixels'
    $image=[Drawing.Bitmap]::new($width,$height);$graphics=[Drawing.Graphics]::FromImage($image)
    try{$graphics.CopyFromScreen($left,$top,0,0,[Drawing.Size]::new($width,$height))}finally{$graphics.Dispose()}
    $stem="timer-history-$Dpi-$script:activeCase-$Name";$original=Join-Path $evidenceRoot "screenshots/$stem.png";$preview=Join-Path $evidenceRoot "screenshots/$stem.preview.jpg"
    try{
        $image.Save($original,[Drawing.Imaging.ImageFormat]::Png);$ratio=[Math]::Min(1.0,960.0/[Math]::Max($width,$height));$pw=[Math]::Max(1,[int]($width*$ratio));$ph=[Math]::Max(1,[int]($height*$ratio));$thumb=[Drawing.Bitmap]::new($pw,$ph);$draw=[Drawing.Graphics]::FromImage($thumb)
        try{$draw.DrawImage($image,0,0,$pw,$ph);$codec=@([Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object {$_.MimeType -ceq 'image/jpeg'})[0];$parameters=[Drawing.Imaging.EncoderParameters]::new(1);try{$parameters.Param[0]=[Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality,[long]75);$thumb.Save($preview,$codec,$parameters)}finally{$parameters.Dispose()}}finally{$draw.Dispose();$thumb.Dispose()}
    }finally{$image.Dispose()}
    $captures.Add(@{name=$Name;caseId=$script:activeCase;original="screenshots/$stem.png";preview="screenshots/$stem.preview.jpg";captureMethod='CopyFromScreen actual foreground pixels';window=$w;client=$client;desktop=$desktop;crop=@{left=$left;top=$top;width=$width;height=$height};previewWidth=$pw;previewHeight=$ph;previewToOriginalX=$width/[double]$pw;previewToOriginalY=$height/[double]$ph;sha256=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash.ToLowerInvariant();previewSha256=(Get-FileHash -LiteralPath $preview -Algorithm SHA256).Hash.ToLowerInvariant();previewBytes=(Get-Item -LiteralPath $preview).Length})
    Write-Json (Join-Path $evidenceRoot "screenshots/$stem.windows.json") (Windows)
}
function Select-History([bool]$Double=$false){
    $list=Control $script:timer 4613 'ListBox';Assert ([D409.NativeUiDriver]::ReadNumber($list,0x18B,0) -eq 1) 'Expected exactly one real history row';$line=[D409.NativeUiDriver]::ListText($list,0)
    Assert ($line.Contains($taskTitle) -and $line.Contains($script:entry.accountId)) 'History row dropped full task title or account'
    Focus $list;Key $list 36;[D409.NativeUiDriver]::ListItem($list,0,$Double);Flush-Trace
    if(-not $Double){Assert ([D409.NativeUiDriver]::ReadNumber($list,0x188,0) -eq 0) 'Real mouse did not select history row'}
    return $list
}
function Check-List([string]$Size){
    if($Size -ceq 'minimum'){[D409.NativeUiDriver]::Resize($script:timer,[int](650*$scale),[int](680*$scale))}else{[D409.NativeUiDriver]::Fit($script:timer,[int](1180*$scale),[int](820*$scale))};Flush-Trace
    $list=Select-History;$button=Control $script:timer 5226 'Button';$null=Reachable $list;$buttonInfo=Reachable $button;Assert ($buttonInfo.Text -ceq '查看完整记录') 'Full-record button caption changed'
    $geometry=[D409.TimerHistoryProbe]::Describe($list);Assert (($geometry.Style -band 0x00100000) -ne 0) 'History LISTBOX lacks WS_HSCROLL';Assert ($geometry.HorizontalExtent -gt $geometry.ClientWidth) 'Long history row has no usable horizontal extent'
    Capture ($Size+'-selected-list') $script:timer;$null=Assert-History ($Size+'-list');return @{list=$geometry;button=$buttonInfo;window=[D409.NativeUiDriver]::Describe($script:timer);row=[D409.NativeUiDriver]::ListText($list,0)}
}
function Check-Detail([string]$Size,[string]$EntryMethod){
    $list=Select-History ($EntryMethod -ceq 'double-click')
    if($EntryMethod -ceq 'enter'){Focus $list;Key $list 13}elseif($EntryMethod -ceq 'button'){Click (Control $script:timer 5226 'Button')}
    Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq 'GxD409TimerHistory' -and $_.Visible}).Count -eq 1} 'full history detail opens'
    $dialog=Window 'GxD409TimerHistory'
    if($Size -ceq 'minimum'){[D409.NativeUiDriver]::Resize($dialog,[int](460*$scale),[int](360*$scale))}else{[D409.NativeUiDriver]::Fit($dialog,[int](840*$scale),[int](680*$scale))};Flush-Trace
    $edit=Control $dialog 5231 'Edit';$close=Control $dialog 5232 'Button';$null=Reachable $edit;$null=Reachable $close
    $geometry=[D409.TimerHistoryProbe]::Describe($edit)
    Assert (($geometry.Style -band 0x0800) -ne 0 -and ($geometry.Style -band 0x0004) -ne 0 -and ($geometry.Style -band 0x00200000) -ne 0) 'Full history editor needs ES_READONLY, ES_MULTILINE and WS_VSCROLL'
    Assert (($geometry.Style -band 0x0080) -eq 0 -and ($geometry.Style -band 0x00100000) -eq 0) 'Full history editor must wrap instead of horizontal auto-scroll'
    $full=Text $edit;Assert ($full.Contains($taskTitle)) 'Full detail title does not match all original taskTitle characters';Assert ($full.TrimEnd().EndsWith([string]$script:entry.accountId,[StringComparison]::Ordinal)) 'Original accountId is missing from end of detail'
    Focus $edit;Click $edit;Key $edit 36 $true;$top=[D409.TimerHistoryProbe]::Describe($edit);Capture ($Size+'-'+$EntryMethod+'-top') $dialog
    # A real edit attempt must be rejected by the readonly control, without sending EM_SET*.
    [D409.NativeUiDriver]::TypeText($edit,'READONLY-MUST-NOT-INSERT');Flush-Trace;Assert ((Text $edit) -ceq $full) 'Read-only detail accepted typing'
    Key $edit 35 $true;$end=[D409.TimerHistoryProbe]::Describe($edit);$selection=[D409.NativeUiDriver]::Selection($edit);Assert ($selection[0] -eq $full.Length -and $selection[1] -eq $full.Length) 'Ctrl+End did not move caret to actual full text end'
    $titleIndex=$full.IndexOf($titleMarker,[StringComparison]::Ordinal);Assert ($titleIndex -ge 0) 'Unique title tail marker absent'
    $accountIndex=$full.LastIndexOf([string]$script:entry.accountId,[StringComparison]::Ordinal);Assert ($accountIndex -gt $titleIndex) 'Account is not after original title tail'
    $points=@();foreach($index in @($titleIndex,($titleIndex+$titleMarker.Length-1),$accountIndex,($accountIndex+$script:entry.accountId.Length-1))){$point=[D409.TimerHistoryProbe]::CharacterPosition($edit,$index,$full.Substring($index,1));$points+=$point;Assert ($point.GlyphInsideClient) "Tail character $index is outside the visible edit client after Ctrl+End"}
    Capture ($Size+'-'+$EntryMethod+'-tail') $dialog
    # Scroll using input only, then prove both navigation and text survive returning to the tail.
    [D409.NativeUiDriver]::Wheel($edit,240);Flush-Trace;Key $edit 36 $true;Key $edit 35 $true;Assert ((Text $edit) -ceq $full) 'Scrolling changed full detail text'
    $record=@{entryMethod=$EntryMethod;size=$Size;window=[D409.NativeUiDriver]::Describe($dialog);initialGeometry=$geometry;topGeometry=$top;tailGeometry=$end;selection=$selection;titleCharacters=$taskTitle.Length;titleMarker=$titleMarker;accountId=$script:entry.accountId;fullText=$full;tailCharacters=$points;readOnlyTypingRejected=$true}
    Write-Json (Join-Path $evidenceRoot "scenarios/$script:activeCase.geometry.json") $record
    Click $close;Wait-Until {@(Windows|Where-Object {$_.Handle -eq $dialog -and $_.Visible}).Count -eq 0} 'full history close button';$null=Assert-History ($Size+'-'+$EntryMethod);return $record
}
function Case([string]$Id,[string]$Expected,[scriptblock]$Body){
    $script:activeCase=$Id;$begin=[DateTime]::UtcNow.ToString('o');$observed=$null;$errorText=$null
    try{$observed=& $Body}catch{$errorText=$_.ToString()}
    finally{Flush-Trace;$record=[ordered]@{id=$Id;expected=$Expected;executed=$true;passed=($null -eq $errorText);status=$(if($errorText){'fail'}else{'pass'});observed=$observed;error=$errorText;startedAtUtc=$begin;endedAtUtc=[DateTime]::UtcNow.ToString('o')};$results.Add($record);Write-Json (Join-Path $evidenceRoot "scenarios/$Id.json") $record;Write-Output "$($record.status) $Id $Expected"}
    if($errorText){throw $errorText}
}
try {
    Copy-Item -LiteralPath $buildReceiptPath -Destination (Join-Path $evidenceRoot 'executable.build.json')
    Add-Type -Path (Join-Path $PSScriptRoot 'NativeUiDriver.cs')
    $script:driverLoaded=$true
    Add-Type -Path (Join-Path $PSScriptRoot 'TimerHistoryProbe.cs')
    Add-Type -AssemblyName System.Drawing
    $script:coordinateMethod=[D409.NativeUiDriver]::UsePhysicalCoordinates();$script:desktopBefore=[D409.NativeUiDriver]::Desktop();$script:desktopDuring=[D409.NativeUiDriver]::EnsureDesktop(1920,1080)
    Case 'TH409-01' 'Original CLI seeds one 300-character task; real count-up start, finish and acknowledgement produce one default-account history entry' {
        Assert ($taskTitle.Length -eq 300) 'Long task fixture must have exactly 300 UTF-16 characters'
        $fixture=@(@{key=(@('tasks',$taskId)|ConvertTo-Json -Compress);values=@{id=$taskId;title=$taskTitle;quadrant=0;order=0;done=$false;_deleted=$false;parentId=$null;start='';end='';seriesId='';generatedFrom='';review='';project='';place='';notes='Isolated timer history UI fixture';completedAt='';createdAt=$startedAtUtc;allDay=$false;repeat=$null;reminder=$null;reminderAt=$null;weight=0;tags=@()}})
        $fixtureFile=Join-Path $evidenceRoot 'synthetic-task-fixture.json';Write-Json $fixtureFile $fixture;Invoke-Native 'seed-task' @('--data-dir',$dataRoot,'--change',$fixtureFile)
        Start-Gui;Assert (Test-Path -LiteralPath (Join-Path $dataRoot '.mytodo-d404-candidate-v1')) 'Original isolated candidate marker missing';Open-Timer
        Combo (Control $script:timer 4600 'ComboBox') 1
        $taskCombo=Control $script:timer 4603 'ComboBox';$count=[D409.NativeUiDriver]::ReadNumber($taskCombo,0x146,0);$match=-1
        for($n=0;$n -lt $count;$n++){if([D409.NativeUiDriver]::ComboText($taskCombo,$n) -ceq $taskTitle){Assert ($match -eq -1) 'Task selector duplicate match';$match=$n}}
        Assert ($match -ge 0) 'Full seeded task absent from native task selector';Combo $taskCombo $match;Click (Control $script:timer 4604 'Button')
        $configured=Read-Timer 'configured';Assert ($configured.configuration.taskTitle -ceq $taskTitle -and $configured.configuration.taskId -ceq $taskId -and $configured.configuration.accountId -ceq 'default' -and $configured.configuration.mode -ceq 'countup') 'GUI configuration did not preserve task/account association'
        Click (Control $script:timer 4605 'Button');$clock=Text (Control $script:timer 4615 'Static');Wait-Until {(Text (Control $script:timer 4615 'Static')) -cne $clock} 'real count-up clock change' 6000
        $changedClock=Text (Control $script:timer 4615 'Static');Click (Control $script:timer 4609 'Button');Wait-Until {[D409.NativeUiDriver]::Describe((Control $script:timer 4612 'Button')).Enabled} 'finish enables completion acknowledgement';Click (Control $script:timer 4612 'Button')
        $state=Read-Timer 'completed-and-acknowledged';Assert ($state.status -ceq 'completed' -and -not $state.completionPending -and @($state.history).Count -eq 1) 'Real finish/ack did not produce exactly one completed history'
        $script:entry=$state.history[0];Assert ($script:entry.taskTitle -ceq $taskTitle -and $script:entry.taskId -ceq $taskId -and $script:entry.accountId -ceq 'default' -and $script:entry.mode -ceq 'countup' -and $script:entry.status -ceq 'completed' -and $script:entry.elapsedMillis -gt 0) 'Completed history lost original identity or earned time'
        $script:baselineHistory=History-Json $state;$script:baselineStoreHash=(Get-FileHash -LiteralPath $timerFile -Algorithm SHA256).Hash.ToLowerInvariant()
        @{beforeClock=$clock;changedClock=$changedClock;entry=$script:entry;baselineStoreSha256=$script:baselineStoreHash;marker=(Get-Item -LiteralPath (Join-Path $dataRoot '.mytodo-d404-candidate-v1') -Force).FullName;taskTitleCharacters=$taskTitle.Length}
    }
    Case 'TH409-02' 'Wide timer exposes selected full history row, horizontal extent and full-record button' {Check-List 'wide'}
    Case 'TH409-03' 'Wide real double-click opens readonly wrapping detail and exposes title/account tails at Ctrl+End' {Check-Detail 'wide' 'double-click'}
    Case 'TH409-04' 'Wide real Enter opens the same full history without changing the durable envelope' {Check-Detail 'wide' 'enter'}
    Case 'TH409-05' 'Wide full-record button opens the same complete title/account and rejects editing' {Check-Detail 'wide' 'button'}
    Case 'TH409-06' 'Minimum timer retains visible history selection, horizontal extent and full-record button' {Check-List 'minimum'}
    Case 'TH409-07' 'Minimum real double-click detail keeps original title/account tail glyphs inside the edit client' {Check-Detail 'minimum' 'double-click'}
    Case 'TH409-08' 'Minimum real Enter detail wraps complete text and scrolls with input only' {Check-Detail 'minimum' 'enter'}
    Case 'TH409-09' 'Minimum full-record button keeps original history unchanged after viewing and closing' {Check-Detail 'minimum' 'button'}
    Case 'TH409-10' 'Normal close and process reopen preserve complete original history; post-reopen viewing remains read-only' {
        $before=Assert-History 'before-normal-close';Stop-Gui;$afterClose=Assert-History 'after-normal-close' $false;Start-Gui;Open-Timer;$after=Assert-History 'after-process-reopen' $false
        # Original shutdown commits a checkpoint even while inactive. Compare history,
        # not envelope generation, across shutdown; freeze the new envelope for UI reads.
        $script:baselineStoreHash=(Get-FileHash -LiteralPath $timerFile -Algorithm SHA256).Hash.ToLowerInvariant();$detail=Check-Detail 'minimum' 'button'
        @{beforeHistory=$before.history;afterCloseHistory=$afterClose.history;afterReopenHistory=$after.history;detail=$detail;shutdownEnvelopeMayAdvance=$true}
    }
}catch {
    $fatalError=$_.ToString();Write-Output "FATAL $fatalError"
    if($script:driverLoaded -and $script:gui -and -not $script:gui.HasExited){try{Write-Json (Join-Path $evidenceRoot 'failure-windows.json') (Windows);$top=@(Windows|Where-Object {$_.Visible -and $_.Enabled -and $_.Handle -eq $_.Root}|Select-Object -Last 1);if($top.Count){[D409.NativeUiDriver]::Activate($top[0].Handle);Flush-Trace;Capture 'failure' $top[0].Handle}}catch{$cleanupErrors.Add('Failure capture: '+$_.ToString())}}
}finally {
    try{Stop-Gui}catch{
        $cleanupErrors.Add('Normal close failed: '+$_.ToString());if(-not $fatalError){$fatalError='Normal close failed; see cleanupErrors'}
        if($script:gui -and -not $script:gui.HasExited){try{$script:gui.Kill($true);$null=$script:gui.WaitForExit(5000);Save-GuiProcess 'failure-only process termination after normal close failed'}catch{$cleanupErrors.Add('Failure termination/log preservation: '+$_.ToString())}}
    }
    try{if($script:driverLoaded){Flush-Trace;$script:desktopRestored=[D409.NativeUiDriver]::RestoreDesktop();[D409.NativeUiDriver]::RestoreCoordinateContext()}}catch{$cleanupErrors.Add('Desktop restoration: '+$_.ToString());if(-not $fatalError){$fatalError='Desktop restoration failed'}}
    foreach($id in $caseIds){if(-not @($results|Where-Object {$_.id -ceq $id}).Count){$results.Add(@{id=$id;executed=$false;passed=$false;status='blocked';error='Blocked by earlier harness or scenario failure; not a pass'})}}
    $requiredCaptures=@('wide-selected-list','minimum-selected-list');foreach($size in @('wide','minimum')){foreach($method in @('double-click','enter','button')){foreach($position in @('top','tail')){$requiredCaptures+=($size+'-'+$method+'-'+$position)}}}
    $missing=@($requiredCaptures|Where-Object {$name=$_;-not @($captures|Where-Object {$_.name -ceq $name}).Count})
    $failures=@($results|Where-Object {-not $_.passed}).Count
    $report=[ordered]@{schemaVersion=1;kind='d409-timer-history-native-ui';sourceSha=$head;productSourceSha=$ProductSourceSha;harnessSourceSha=$head;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;uiDesignStage='D4-09';productionAdmission=$false;dpi=$Dpi;dpiMeaning='application --visual-dpi scaling; actual OS window DPI recorded separately';executable=@{path=$exePath;sha256=$exeHash;bytes=$exeItem.Length};buildReceiptSha256=(Get-FileHash -LiteralPath $buildReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant();isolatedDataRoot=$dataRoot;titleCharacters=$taskTitle.Length;titleMarker=$titleMarker;desktopBefore=$script:desktopBefore;desktopDuring=$script:desktopDuring;desktopRestored=$script:desktopRestored;coordinateMethod=$script:coordinateMethod;caseIds=$caseIds;results=@($results);passedCount=@($results|Where-Object {$_.passed}).Count;failedCount=$failures;captures=@($captures);missingScreenshots=$missing;commands=@($commands);readbacks=@($readbacks);fatalError=$fatalError;cleanupErrors=@($cleanupErrors);passed=($null -eq $fatalError -and $failures -eq 0 -and $missing.Count -eq 0 -and $cleanupErrors.Count -eq 0);startedAtUtc=$startedAtUtc;endedAtUtc=[DateTime]::UtcNow.ToString('o');limitations=@('Synthetic isolated default account only','No production, remote connection, signing or overwrite-upgrade admission','Original 24-case UI and legacy suites remain separate and unchanged','No direct timer-store or SQLite write; original --change CLI seeds one task','Original normal shutdown can advance envelope revision; complete history must remain unchanged','Control inspection is read-only whitelisted messages; all semantic GUI actions use SendInput')}
    Write-Json (Join-Path $evidenceRoot 'timer-history-ui-report.json') $report
    try{Stop-Transcript | Out-Null}catch{$cleanupErrors.Add('Stop transcript: '+$_.ToString());$report.passed=$false;$report.cleanupErrors=@($cleanupErrors);Write-Json (Join-Path $evidenceRoot 'timer-history-ui-report.json') $report}
    # Exact hidden-inclusive inventory is frozen only after every log/report is closed.
    # Neither the hash manifest nor its integrity sidecar claims to hash itself.
    try{
        $sumPath=Join-Path $evidenceRoot 'SHA256SUMS.txt';$integrityPath=Join-Path $evidenceRoot 'HASH-INTEGRITY.json'
        $hashFiles=@(Get-ChildItem -LiteralPath $evidenceRoot -Force -Recurse -File|Where-Object {$_.FullName -cne $sumPath -and $_.FullName -cne $integrityPath}|Sort-Object FullName)
        $lines=@();foreach($file in $hashFiles){Assert (-not ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Evidence must not contain reparse files';$relative=[IO.Path]::GetRelativePath($evidenceRoot,$file.FullName).Replace('\','/');$lines+=((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$relative)}
        [IO.File]::WriteAllText($sumPath,($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
        $actual=@(Get-ChildItem -LiteralPath $evidenceRoot -Force -Recurse -File|Where-Object {$_.FullName -cne $sumPath -and $_.FullName -cne $integrityPath}|ForEach-Object {[IO.Path]::GetRelativePath($evidenceRoot,$_.FullName).Replace('\','/')}|Sort-Object)
        $expected=@();foreach($line in [IO.File]::ReadAllLines($sumPath)){Assert ($line -match '^([a-f0-9]{64})  (.+)$') 'Malformed evidence hash line';$digest=$Matches[1];$relative=$Matches[2];$expected+=$relative;Assert ((Get-FileHash -LiteralPath (Join-Path $evidenceRoot $relative) -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $digest) "Evidence hash mismatch: $relative"}
        Assert (@(Compare-Object $actual @($expected|Sort-Object)).Count -eq 0 -and @($expected|Select-Object -Unique).Count -eq $actual.Count) 'Evidence inventory is not exact'
        Write-Json (Join-Path $evidenceRoot 'HASH-INTEGRITY.json') @{passed=$true;sourceSha=$head;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;fileCount=$actual.Count;hiddenIncluded=$true;sha256Sums=(Get-FileHash -LiteralPath $sumPath -Algorithm SHA256).Hash.ToLowerInvariant();excludedSelfReferences=@('SHA256SUMS.txt','HASH-INTEGRITY.json');verifiedAtUtc=[DateTime]::UtcNow.ToString('o')}
    }catch{$hashError=$_.ToString();Write-Json (Join-Path $evidenceRoot 'HASH-INTEGRITY.json') @{passed=$false;error=$hashError;sourceSha=$head;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT};Write-Output "FAIL evidence integrity: $hashError"}
}
if(-not $report.passed -or $hashError){exit 1}
