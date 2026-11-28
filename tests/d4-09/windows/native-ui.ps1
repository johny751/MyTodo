[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ProductSourceSha,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedExecutableSha256,
    [ValidateSet(96,144)][int]$Dpi = 96
)
# Runtime, compilation, UI input, fixture execution and screenshot capture are CI-only.
if ($env:GITHUB_ACTIONS -cne 'true' -or -not $IsWindows) { throw 'D409 native UI may run only on GitHub Actions Windows.' }
$ErrorActionPreference='Stop'
if (-not (Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { throw 'PowerShell 7.5+ DateKind String is required for lossless synthetic JSON fixtures.' }
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if ($env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$') { throw 'Exact run and attempt required.' }
$head=(& git -C $PSScriptRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $ProductSourceSha -or $head -cne $env:GITHUB_SHA -or $head -cne $env:EXPECTED_SOURCE_SHA) { throw 'Source identity mismatch.' }
$exePath=(Resolve-Path -LiteralPath $Executable).Path
$exeItem=Get-Item -LiteralPath $exePath
if ($exeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Executable may not be a reparse point.' }
$exeHash=(Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeHash -cne $ExpectedExecutableSha256) { throw 'Executable hash mismatch.' }
$buildReceiptPath=$exePath+'.build.json'
$buildReceipt=Get-Content -LiteralPath $buildReceiptPath -Raw -Encoding utf8 | ConvertFrom-Json -Depth 80
if ($buildReceipt.sourceSha -cne $head -or $buildReceipt.runId -cne $env:GITHUB_RUN_ID -or $buildReceipt.runAttempt -cne $env:GITHUB_RUN_ATTEMPT -or $buildReceipt.executable.sha256 -cne $exeHash -or $buildReceipt.uiDesignStage -cne 'D4-09') { throw 'Build receipt does not bind this UI candidate.' }
$runnerRoot=(Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path.TrimEnd('\','/')
$evidenceRoot=[IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\','/')
if ([IO.Path]::GetDirectoryName($evidenceRoot).TrimEnd('\','/') -ine $runnerRoot -or [IO.Path]::GetFileName($evidenceRoot) -cne ('d4-09-ui-'+$Dpi) -or (Test-Path -LiteralPath $evidenceRoot)) { throw 'Output must be a new direct RUNNER_TEMP/d4-09-ui-{Dpi} directory.' }
if ((Get-Item -LiteralPath $runnerRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'RUNNER_TEMP must be a plain local directory.' }
$contract=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'native-expected.json') -Raw -Encoding utf8 | ConvertFrom-Json
$null=New-Item -ItemType Directory -Path $evidenceRoot
foreach($folder in @('screenshots','scenarios','readback')){$null=New-Item -ItemType Directory -Path (Join-Path $evidenceRoot $folder)}
$dataRoot=Join-Path $evidenceRoot 'synthetic-data'
$null=New-Item -ItemType Directory -Path $dataRoot
Start-Transcript -LiteralPath (Join-Path $evidenceRoot 'harness-transcript.log') | Out-Null
$results=[Collections.Generic.List[object]]::new()
$captures=[Collections.Generic.List[object]]::new()
$commands=[Collections.Generic.List[object]]::new()
$readbacks=[Collections.Generic.List[object]]::new()
$script:gui=$null;$script:main=$null;$script:work=$null;$script:timer=$null;$script:feedback=$null
$script:outTask=$null;$script:errTask=$null;$script:readIndex=0;$script:processIndex=0;$script:dialogIndex=0
$script:desktopBefore=$null;$script:desktopAfter=$null;$script:desktopRestored=$null
$fatalError=$null;$startedAtUtc=[DateTime]::UtcNow.ToString('o');$script:activeCase='startup'
$scale=$Dpi/96.0
function Write-Json([string]$Path,$Value){[IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 90)+"`n",[Text.UTF8Encoding]::new($false))}
function Assert($Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Wait-Until([scriptblock]$Condition,[string]$Description,[int]$Timeout=5000){$watch=[Diagnostics.Stopwatch]::StartNew();do{if(& $Condition){return};Start-Sleep -Milliseconds 80}while($watch.ElapsedMilliseconds -lt $Timeout);throw "Timeout: $Description"}
function Flush-Trace {
    foreach($entry in @([D409.NativeUiDriver]::DrainTrace())){
        $line=[ordered]@{caseId=$script:activeCase;input=$entry}|ConvertTo-Json -Depth 20 -Compress
        [IO.File]::AppendAllText((Join-Path $evidenceRoot 'input-trace.jsonl'),$line+"`n",[Text.UTF8Encoding]::new($false))
    }
}
function Windows {return @([D409.NativeUiDriver]::Snapshot($script:gui.Id))}
function Window([string]$Class,[bool]$Visible=$true){$rows=@(Windows|Where-Object {$_.ClassName -ceq $Class -and (-not $Visible -or $_.Visible)});Assert ($rows.Count -eq 1) "Expected one $Class window, found $($rows.Count)";return $rows[0].Handle}
function Control([long]$Root,[int]$Id,[string]$Class=''){
    $rows=@(Windows|Where-Object {$_.Root -eq $Root -and $_.ControlId -eq $Id -and (-not $Class -or $_.ClassName -ieq $Class)})
    Assert ($rows.Count -eq 1) "Expected one control $Id / $Class in root $Root, found $($rows.Count)"
    return $rows[0].Handle
}
function Read-Text([long]$Handle){return [D409.NativeUiDriver]::Text($Handle)}
function Click([long]$Handle){[D409.NativeUiDriver]::Click($Handle);Flush-Trace}
function Key([long]$Focus,[int]$Code,[bool]$Ctrl=$false,[bool]$Shift=$false,[bool]$Alt=$false){[D409.NativeUiDriver]::Chord($Focus,[uint16]$Code,$Ctrl,$Shift,$Alt);Flush-Trace}
function Focus([long]$Handle){[D409.NativeUiDriver]::Focus($Handle);Flush-Trace}
function Fill([long]$Handle,[string]$Text){Focus $Handle;Click $Handle;Key $Handle 65 $true;Key $Handle 8;[D409.NativeUiDriver]::TypeText($Handle,$Text);Flush-Trace;Wait-Until {(Read-Text $Handle) -ceq $Text} 'typed native field readback'}
function Combo([long]$Handle,[int]$Index){Focus $Handle;Key $Handle 36;for($i=0;$i -lt $Index;$i++){Key $Handle 40};Wait-Until {[D409.NativeUiDriver]::ReadNumber($Handle,0x147,0) -eq $Index} 'native combo selection'}
function Combo-Match([long]$Handle,[string]$Needle){$count=[D409.NativeUiDriver]::ReadNumber($Handle,0x146,0);for($i=0;$i -lt $count;$i++){if([D409.NativeUiDriver]::ComboText($Handle,$i).Contains($Needle)){Combo $Handle $i;return}};throw "Combo item missing: $Needle"}
function All-Dates {
    # The period ComboBox is an intentionally hidden state holder. Use the real toolbar menu.
    Click (Control $script:main 123 'Button')
    Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq '#32768' -and $_.Visible}).Count -eq 1} 'native toolbar popup'
    Write-Json (Join-Path $evidenceRoot "scenarios/$script:activeCase.period-menu.windows.json") (Windows)
    # The first Down selects the first row of a newly opened native popup.
    for($i=0;$i -lt 4;$i++){Key 0 40}
    Capture ('period-menu-'+$script:activeCase+'-before-enter') (Window '#32768') -ObserveOnly
    Key 0 13
    Wait-Until {([D409.NativeUiDriver]::ReadNumber((Control $script:main 105 'ComboBox'),0x147,0) -eq 3) -and ((Read-Text (Control $script:main 106 'Button')) -ceq '全部日期')} 'all-date selection through real menu'
}
function List-Lines([long]$Handle){$count=[D409.NativeUiDriver]::ReadNumber($Handle,0x18B,0);for($i=0;$i -lt $count;$i++){[D409.NativeUiDriver]::ListText($Handle,$i)}}
function List-Select([long]$Handle,[string]$Needle,[bool]$Double=$false){
    $lines=@(List-Lines $Handle);$index=-1;for($i=0;$i -lt $lines.Count;$i++){if($lines[$i].Contains($Needle)){$index=$i;break}}
    Assert ($index -ge 0) "List row missing: $Needle"
    # Home/Down scrolls a real native list before the actual row mouse hit.
    Focus $Handle;Key $Handle 36;for($i=0;$i -lt $index;$i++){Key $Handle 40}
    [D409.NativeUiDriver]::ListItem($Handle,$index,$Double);Flush-Trace
    if(-not $Double){Assert ([D409.NativeUiDriver]::ReadNumber($Handle,0x188,0) -eq $index) 'List selection did not match hit row'}
}
function Start-Native([string[]]$Arguments,[bool]$Gui){
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exePath;$info.UseShellExecute=$false;$info.CreateNoWindow=-not $Gui
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.Encoding]::UTF8;$info.StandardErrorEncoding=[Text.Encoding]::UTF8
    foreach($arg in $Arguments){$info.ArgumentList.Add($arg)}
    $p=[Diagnostics.Process]::new();$p.StartInfo=$info;Assert ($p.Start()) 'Process failed to start';return $p
}
function Invoke-Native([string]$Name,[string[]]$Arguments){
    $p=Start-Native $Arguments $false;$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(20000)){$p.Kill($true);throw "CLI timeout: $Name"}
    $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
    [IO.File]::WriteAllText((Join-Path $evidenceRoot "$Name.stdout.log"),$out);[IO.File]::WriteAllText((Join-Path $evidenceRoot "$Name.stderr.log"),$err)
    $record=[ordered]@{name=$Name;arguments=$Arguments;pid=$p.Id;exitCode=$p.ExitCode;atUtc=[DateTime]::UtcNow.ToString('o')}
    $commands.Add($record);Write-Json (Join-Path $evidenceRoot "$Name.command.json") $record
    Assert ($p.ExitCode -eq 0) "CLI $Name exit $($p.ExitCode): $err"
}
function Start-Gui {
    $script:processIndex++;$script:gui=Start-Native @('--data-dir',$dataRoot,'--visual-dpi',"$Dpi") $true
    $script:outTask=$script:gui.StandardOutput.ReadToEndAsync();$script:errTask=$script:gui.StandardError.ReadToEndAsync()
    $commands.Add([ordered]@{name='gui-'+$script:processIndex;arguments=@('--data-dir',$dataRoot,'--visual-dpi',"$Dpi");pid=$script:gui.Id;atUtc=[DateTime]::UtcNow.ToString('o')})
    Wait-Until {Assert (-not $script:gui.HasExited) 'Native GUI exited at startup';@(Windows|Where-Object {$_.ClassName -ceq 'GxNativeModern' -and $_.Visible}).Count -eq 1} 'real native main window' 15000
    $script:main=Window 'GxNativeModern';[D409.NativeUiDriver]::Fit($script:main,[int](1280*$scale),[int](860*$scale));Flush-Trace
}
function Stop-Gui {
    if($script:gui -and -not $script:gui.HasExited){[D409.NativeUiDriver]::Activate($script:main);Key 0 115 $false $false $true;Assert ($script:gui.WaitForExit(7000)) 'Main close did not complete original save/shutdown path'}
    if($script:gui){[IO.File]::WriteAllText((Join-Path $evidenceRoot ('gui-'+$script:processIndex+'.stdout.log')),$script:outTask.GetAwaiter().GetResult());[IO.File]::WriteAllText((Join-Path $evidenceRoot ('gui-'+$script:processIndex+'.stderr.log')),$script:errTask.GetAwaiter().GetResult())}
}
function Open-Module([string]$Name){
    $map=@{work=@(4500,'GxD408Work',1280,860);timer=@(4501,'GxD408PomodoroTimer',1180,820);feedback=@(4502,'GxD408Feedback',1080,820)};$entry=$map[$Name]
    foreach($other in @(Windows|Where-Object {$_.Visible -and $_.ClassName -in @('GxD408Work','GxD408PomodoroTimer','GxD408Feedback')})){Hide-Window $other.Handle}
    Click (Control $script:main $entry[0] 'Button');$class=$entry[1]
    Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq $class -and $_.Visible}).Count -eq 1} "native $Name window"
    $handle=Window $class;[D409.NativeUiDriver]::Fit($handle,[int]($entry[2]*$scale),[int]($entry[3]*$scale));Flush-Trace
    Set-Variable -Name $Name -Scope Script -Value $handle;return $handle
}
function Hide-Window([long]$Handle){[D409.NativeUiDriver]::Activate($Handle);Key 0 115 $false $false $true;Wait-Until {-not [D409.NativeUiDriver]::Describe($Handle).Visible} 'native child hide'}
function Page([int]$Index){if(-not $script:work -or -not [D409.NativeUiDriver]::Describe($script:work).Visible){$null=Open-Module 'work'};Click (Control $script:work (4900+$Index) 'Button');Wait-Until {(Read-Text (Control $script:work 5200 'Static')) -ceq @('工作台','工作事项','项目管理','流程模板','流程实例','往来管理','跟进管理','工作归档','统计分析','系统设置')[$Index]} 'work page title'}
function Modal {Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq 'GxD408Form' -and $_.Visible}).Count -eq 1} 'native modal';return Window 'GxD408Form'}
function Save-Modal([long]$Handle){Click (Control $Handle 1 'Button');Wait-Until {@(Windows|Where-Object {$_.Handle -eq $Handle}).Count -eq 0} 'modal closed after native Save'}
function Dismiss-Message([bool]$Accept=$true){
    Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq '#32770' -and $_.Visible}).Count -eq 1} 'native message dialog';$h=Window '#32770'
    $buttons=@(Windows|Where-Object {$_.Root -eq $h -and $_.ClassName -ieq 'Button' -and $_.Visible -and $_.Enabled})
    # Hosted MessageBox has been observed with a sole OK button whose native ID is 2.
    # Bind the action to the visible caption, and retain its actual ID/rectangle in evidence.
    $labels=if($Accept){@('OK','Yes','确定','是')}else{@('Cancel','No','取消','否')}
    $matches=@($buttons|Where-Object {$labels -contains $_.Text.Replace('&','').Trim()})
    Assert ($matches.Count -eq 1) 'Native message action is missing or ambiguous by visible caption'
    $script:dialogIndex++;Write-Json (Join-Path $evidenceRoot ("scenarios/$script:activeCase.message-"+$script:dialogIndex+'.json')) @{accept=$Accept;dialog=[D409.NativeUiDriver]::Describe($h);buttons=$buttons;chosen=$matches[0]}
    Click $matches[0].Handle;Wait-Until {@(Windows|Where-Object {$_.Handle -eq $h}).Count -eq 0} 'message dialog closes'
}
function File-Dialog([string]$Path){
    Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq '#32770' -and $_.Visible}).Count -eq 1} 'native file dialog';$dialog=Window '#32770'
    $fields=@(Windows|Where-Object {$_.Root -eq $dialog -and $_.ClassName -ieq 'Edit' -and $_.Visible -and $_.Enabled})
    $field=@($fields|Where-Object {$_.ControlId -eq 1148});if(-not $field.Count){$field=@($fields|Sort-Object Top -Descending|Select-Object -First 1)}
    Assert ($field.Count -eq 1) 'Native filename field is ambiguous';Fill $field[0].Handle $Path;Click (Control $dialog 1 'Button')
    Wait-Until {@(Windows|Where-Object {$_.Handle -eq $dialog}).Count -eq 0} 'native file dialog closes'
}
function Read-Store([string]$Name){
    $file=Join-Path $dataRoot "d408/$Name.json";Assert (Test-Path -LiteralPath $file) "No durable $Name sidecar"
    $raw=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8);$value=$raw|ConvertFrom-Json -DateKind String -Depth 90
    Assert ($null -ne $value.payload -and $value.generation -ge 1 -and $value.sha256 -match '^[a-f0-9]{64}$') 'Invalid durable envelope shape'
    $script:readIndex++;$name=('readback/{0:D4}-{1}.json' -f $script:readIndex,$Name);[IO.File]::WriteAllText((Join-Path $evidenceRoot $name),$raw,[Text.UTF8Encoding]::new($false))
    $readbacks.Add([ordered]@{caseId=$script:activeCase;file=$name;source=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $evidenceRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant();generation=$value.generation;payloadChecksumAsStored=$value.sha256;method='read-only exact durable envelope; product validates checksum on open'})
    return $value.payload
}
function Read-Tasks {$script:readIndex++;$name='task-export-'+$script:readIndex;$file=Join-Path $evidenceRoot ($name+'.json');Invoke-Native $name @('--data-dir',$dataRoot,'--export',$file);return Get-Content -LiteralPath $file -Raw -Encoding utf8 | ConvertFrom-Json -Depth 80}
function All-Tasks($Tasks){foreach($task in @($Tasks)){$task;if($task.PSObject.Properties['subtasks']){All-Tasks $task.subtasks}}}
function Record-ByName([string]$Kind,[string]$Name){$state=Read-Store 'work';$matches=@($state.$Kind|Where-Object {$_.name -ceq $Name});Assert ($matches.Count -eq 1) "[blocked] Need one $Kind record '$Name', found $($matches.Count)";return $matches[0]}
function Capture([string]$Name,[long]$Handle,[switch]$ObserveOnly){
    if(-not $ObserveOnly){[D409.NativeUiDriver]::Activate($Handle);Flush-Trace};$w=[D409.NativeUiDriver]::Describe($Handle);$client=[D409.NativeUiDriver]::Client($Handle);$desktop=[D409.NativeUiDriver]::Desktop()
    Assert ($client.Left -ge $desktop.Left -and $client.Top -ge $desktop.Top -and $client.Right -le $desktop.Left+$desktop.Width -and $client.Bottom -le $desktop.Top+$desktop.Height) 'Native client exceeds actual desktop; screen evidence would omit controls'
    $left=[Math]::Max($desktop.Left,$w.Left);$top=[Math]::Max($desktop.Top,$w.Top);$right=[Math]::Min($desktop.Left+$desktop.Width,$w.Right);$bottom=[Math]::Min($desktop.Top+$desktop.Height,$w.Bottom)
    $width=$right-$left;$height=$bottom-$top;Assert ($width -gt 0 -and $height -gt 0) 'Screenshot has no visible area'
    $null=[D409.NativeUiDriver]::CheckPoint($Handle,[int](($client.Left+$client.Right)/2),[int](($client.Top+$client.Bottom)/2))
    # Copy actual visible pixels. PrintWindow cannot prove selection/scroll visibility.
    $image=[Drawing.Bitmap]::new($width,$height);$g=[Drawing.Graphics]::FromImage($image)
    try{$g.CopyFromScreen($left,$top,0,0,[Drawing.Size]::new($width,$height))}finally{$g.Dispose()}
    $stem="native-$Dpi-$Name";$original=Join-Path $evidenceRoot "screenshots/$stem.png";$preview=Join-Path $evidenceRoot "screenshots/$stem.preview.jpg"
    try{$image.Save($original,[Drawing.Imaging.ImageFormat]::Png);$ratio=[Math]::Min(1.0,960.0/[Math]::Max($width,$height));$pw=[Math]::Max(1,[int]($width*$ratio));$ph=[Math]::Max(1,[int]($height*$ratio));$thumb=[Drawing.Bitmap]::new($pw,$ph);$draw=[Drawing.Graphics]::FromImage($thumb);try{$draw.DrawImage($image,0,0,$pw,$ph);$thumb.Save($preview,[Drawing.Imaging.ImageFormat]::Jpeg)}finally{$draw.Dispose();$thumb.Dispose()}}finally{$image.Dispose()}
    $captures.Add([ordered]@{name=$Name;caseId=$script:activeCase;original="screenshots/$stem.png";preview="screenshots/$stem.preview.jpg";captureMethod='CopyFromScreen actual foreground pixels';window=$w;client=$client;desktop=$desktop;crop=@{left=$left;top=$top;width=$width;height=$height};width=$width;height=$height;previewWidth=$pw;previewHeight=$ph;previewToOriginalX=$width/[double]$pw;previewToOriginalY=$height/[double]$ph;sha256=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash.ToLowerInvariant();previewSha256=(Get-FileHash -LiteralPath $preview -Algorithm SHA256).Hash.ToLowerInvariant()})
    Write-Json (Join-Path $evidenceRoot "screenshots/$stem.windows.json") (Windows)
}
function Reachable([long]$Handle){$w=[D409.NativeUiDriver]::Describe($Handle);Assert ($w.Visible) "Hidden required control $($w.ControlId)";$client=[D409.NativeUiDriver]::Client($w.Root);Assert ($w.Left -ge $client.Left -and $w.Top -ge $client.Top -and $w.Right -le $client.Right -and $w.Bottom -le $client.Bottom) "Control $($w.ControlId) outside client";if($w.Enabled){$target=if($w.ClassName -in @('Static','msctls_progress32')){$w.Root}else{$Handle};$null=[D409.NativeUiDriver]::CheckPoint($target,[int](($w.Left+$w.Right)/2),[int](($w.Top+$w.Bottom)/2))};return $w}
function Reachable-Children([long]$Root){
    $controls=@(Windows|Where-Object {$_.Root -eq $Root -and $_.Visible -and $_.ClassName -in @('Button','Edit','ComboBox','ListBox')})
    Assert ($controls.Count -gt 0) 'Native layout has no visible interactive controls'
    foreach($control in $controls){Reachable $control.Handle}
}
function Scenario([string]$Id,[string]$Expected,[scriptblock]$Body){
    $script:activeCase=$Id;$begin=[DateTime]::UtcNow;$observed=$null;$errorText=$null;$status='pass';$cleanupErrors=@()
    try{$observed=& $Body}catch{
        $errorText=$_.Exception.Message;$status=if($errorText.StartsWith('[blocked]')){'blocked'}else{'fail'}
        try{Write-Json (Join-Path $evidenceRoot "scenarios/$Id.failure-windows.json") (Windows)}catch{$cleanupErrors+=('window evidence: '+$_.Exception.Message)}
        try{$root=@(Windows|Where-Object {$_.Visible -and $_.Handle -eq $_.Root -and $_.Enabled}|Select-Object -First 1);if($root.Count){Capture ($Id+'-failure') $root[0].Handle}}catch{$cleanupErrors+=('screen evidence: '+$_.Exception.Message)}
        # A validation MessageBox can cover its still-open form. Cancel the top dialog
        # first, then re-enumerate; never send Escape to its disabled owner.
        try{
            for($round=0;$round -lt 6;$round++){
                $dialogs=@(Windows|Where-Object {$_.Visible -and $_.Enabled -and $_.ClassName -in @('GxD408Form','#32770')})
                if(-not $dialogs.Count){break}
                $top=@($dialogs|Where-Object {$_.ClassName -ceq '#32770'}|Select-Object -First 1)
                if(-not $top.Count){$top=@($dialogs|Select-Object -First 1)}
                $closing=$top[0].Handle;[D409.NativeUiDriver]::Activate($closing);Key 0 27
                Wait-Until {@(Windows|Where-Object {$_.Handle -eq $closing -and $_.Visible}).Count -eq 0} 'failed-scenario dialog cancellation'
            }
        }catch{$cleanupErrors+=('dialog cleanup: '+$_.Exception.Message)}
    }
    finally{Flush-Trace}
    $record=[ordered]@{id=$Id;expected=$Expected;executed=($status -ne 'blocked');passed=($status -eq 'pass');status=$status;observed=$observed;error=$errorText;cleanupErrors=$cleanupErrors;failureKind=$(if($status -eq 'pass'){$null}else{'unclassified-see-raw-evidence'});startedAtUtc=$begin.ToString('o');endedAtUtc=[DateTime]::UtcNow.ToString('o')}
    $results.Add($record);Write-Json (Join-Path $evidenceRoot "scenarios/$Id.json") $record;Write-Output "$status $Id $Expected"
}
function Select-Record([int]$PageIndex,[string]$Name){Page $PageIndex;Fill (Control $script:work 4920 'Edit') '';Combo (Control $script:work 4921 'ComboBox') 0;Combo (Control $script:work 4922 'ComboBox') 0;List-Select (Control $script:work 4923 'ListBox') $Name}
function New-Record([int]$PageIndex,[hashtable]$Fields){Page $PageIndex;Click (Control $script:work 4924 'Button');$form=Modal;foreach($id in @($Fields.Keys|Sort-Object)){Fill (Control $form ([int]$id) 'Edit') ([string]$Fields[$id])};Save-Modal $form}
function Main-Only {foreach($other in @(Windows|Where-Object {$_.Visible -and $_.ClassName -in @('GxD408Work','GxD408PomodoroTimer','GxD408Feedback')})){Hide-Window $other.Handle};[D409.NativeUiDriver]::Activate($script:main);Flush-Trace}
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'NativeUiDriver.cs')
    Add-Type -AssemblyName System.Drawing
    $coordinateMethod=[D409.NativeUiDriver]::UsePhysicalCoordinates()
    $script:desktopBefore=[D409.NativeUiDriver]::Desktop()
    # Real workarea at 1920x1080 is sufficient for D409's native minimum bounds.
    # If a hosted desktop is smaller, request a supported temporary mode, then
    # still run against the returned actual bounds if no such mode is exposed.
    $script:desktopAfter=[D409.NativeUiDriver]::EnsureDesktop(1920,1080)
    $fixture=@(for($q=0;$q -lt 4;$q++){
        $id='d409-native-task-'+$q
        @{key=(@('tasks',$id)|ConvertTo-Json -Compress);values=@{id=$id;title="D409 synthetic quadrant $q";quadrant=$q;order=$q*1024;done=$false;_deleted=$false;parentId=$null;start='';end='';seriesId='';generatedFrom='';review='';project='';place='';notes='Synthetic native UI task';completedAt='';createdAt='2026-11-28T00:00:00Z';allDay=$false;repeat=$null;reminder=$null;reminderAt=$null;weight=0;tags=@()}}
    })
    $fixtureFile=Join-Path $evidenceRoot 'synthetic-task-fixture.json';Write-Json $fixtureFile $fixture
    Invoke-Native 'seed-tasks' @('--data-dir',$dataRoot,'--change',$fixtureFile)
    Start-Gui
    Scenario 'N409-01' 'Same-source EXE opens an actual native window in a newly marked isolated synthetic directory' {
        Assert (Test-Path -LiteralPath (Join-Path $dataRoot '.mytodo-d404-candidate-v1')) 'Original candidate guard marker was not created'
        $window=[D409.NativeUiDriver]::Describe($script:main);Assert ($window.Visible -and $window.ProcessId -eq $script:gui.Id) 'Invalid native main HWND'
        All-Dates;Combo (Control $script:main 104 'ComboBox') 2
        Capture 'quadrants' $script:main
        @{window=$window;awareness=[D409.NativeUiDriver]::Awareness($script:main);driverCoordinateMethod=$coordinateMethod;applicationDpi=$Dpi;actualDpi=$window.ActualWindowDpi;sourceSha=$head;executableSha256=$exeHash;dataRoot=$dataRoot}
    }
    Scenario 'N409-02' 'Actual mouse hits open all three native modules and close/reopen keeps the native window identity' {
        $seen=@();foreach($name in @('work','timer','feedback')){$first=Open-Module $name;$seen+=@{name=$name;window=[D409.NativeUiDriver]::Describe($first)};Hide-Window $first;$again=Open-Module $name;Assert ($first -eq $again) "$name hide/reopen replaced HWND";Hide-Window $again};$seen
    }
    Scenario 'N409-03' 'Ten work navigation mouse targets show the correct real title and distinct original actions' {
        $null=Open-Module 'work';$titles=@();for($i=0;$i -lt 10;$i++){Page $i;$title=Read-Text (Control $script:work 5200 'Static');$titles+=$title;$null=Reachable (Control $script:work (4900+$i) 'Button');Capture ('initial-page-'+$i) $script:work};Assert (($titles|Select-Object -Unique).Count -eq 10) 'Navigation repeated a page title';$titles
    }
    Scenario 'N409-04' 'Empty work dashboard exposes real zero totals and original recoverable empty guidance' {
        Page 0;$summary=[D409.NativeUiDriver]::Describe((Control $script:work 4936 'Static'));$empty=[D409.NativeUiDriver]::Describe((Control $script:work 4937 'Static'))
        Assert ($summary.Visible -and $summary.Text.Contains('事项0 · 项目0') -and $empty.Visible -and $empty.Text.Contains('还没有工作记录')) 'Initial empty dashboard contract changed'
        Capture 'empty-dashboard' $script:work;@{overview=$summary;empty=$empty}
    }
    Scenario 'N409-05' 'Real modal input persists a work item; real row selection and double-click open matching detail/editor' {
        New-Record 1 @{4800='D409 Primary Item';4803='UI owner';4804='Description from actual Unicode SendInput';4807='2026-11-28 09:15';4808='2026-12-01 18:20';4809="First note line`r`nSecond note line"}
        $item=Record-ByName 'items' 'D409 Primary Item';Select-Record 1 $item.name
        $detail=Read-Text (Control $script:work 5203 'Edit');Assert ($detail.Contains($item.id) -and $detail.Contains('Second note line')) 'Selected detail does not match actual durable record'
        List-Select (Control $script:work 4923 'ListBox') $item.name $true;$form=Modal;Assert ((Read-Text (Control $form 4800 'Edit')) -ceq $item.name) 'Double-click opened wrong record';Click (Control $form 2 'Button')
        @{record=$item;detail=$detail;rows=@(List-Lines (Control $script:work 4923 'ListBox'))}
    }
    Scenario 'N409-06' 'Per-page search and selected ID survive navigation; no-result filtering clears stale detail and recovers' {
        $item=Record-ByName 'items' 'D409 Primary Item';Select-Record 1 $item.name;Fill (Control $script:work 4920 'Edit') 'Primary';Page 2;Fill (Control $script:work 4920 'Edit') 'ProjectQuery';Page 1
        Assert ((Read-Text (Control $script:work 4920 'Edit')) -ceq 'Primary') 'Item page search was lost'
        Assert ((Read-Text (Control $script:work 5203 'Edit')).Contains($item.id)) 'Item selection was lost'
        Fill (Control $script:work 4920 'Edit') 'no-match-d409'
        Assert ([D409.NativeUiDriver]::Describe((Control $script:work 4937 'Static')).Visible) 'No-result guidance hidden'
        Assert (-not (Read-Text (Control $script:work 5203 'Edit')).Contains($item.id)) 'Filtered-out record remains in detail'
        Fill (Control $script:work 4920 'Edit') '';Page 2;Assert ((Read-Text (Control $script:work 4920 'Edit')) -ceq 'ProjectQuery') 'Project search was replaced by item search';Fill (Control $script:work 4920 'Edit') ''
        @{restored=$true;stalePreviewRemoved=$true;accountSwitch='frozen regression; not repeated externally'}
    }
    Scenario 'N409-07' 'Invalid native work form keeps draft values and corrected Save commits exactly one new record' {
        Page 1;Click (Control $script:work 4924 'Button');$form=Modal;Fill (Control $form 4803 'Edit') 'kept owner';Fill (Control $form 4808 'Edit') '2026-13-01';Click (Control $form 1 'Button');Dismiss-Message
        $form=Modal;Assert ((Read-Text (Control $form 4803 'Edit')) -ceq 'kept owner') 'Validation discarded owner input';Assert ((Read-Text (Control $form 4808 'Edit')) -ceq '2026-13-01') 'Validation discarded invalid date';Capture 'validation-kept-draft' $form
        Fill (Control $form 4800 'Edit') 'D409 Corrected Draft';Fill (Control $form 4808 'Edit') '2026-12-02';Save-Modal $form
        $record=Record-ByName 'items' 'D409 Corrected Draft';Assert ($record.owner -ceq 'kept owner' -and $record.dueDate -ceq '2026-12-02') 'Corrected values were not persisted';$record
    }
    Scenario 'N409-08' 'Project color and same-name project relations persist by stable ID through native controls' {
        New-Record 2 @{4800='D409 Same Name Project';4802='Project owner';4803='A,B';4804='First project description';4805='#358260';4806='2026-12-31';4807='Project notes'}
        $project=Record-ByName 'projects' 'D409 Same Name Project';$script:projectId=$project.id
        New-Record 2 @{4800='D409 Same Name Project';4802='Second owner';4805='#C07030';4807='Second same-name project'}
        $state=Read-Store 'work';Assert (@($state.projects|Where-Object {$_.name -ceq $project.name}).Count -eq 2) 'Same-name project fixture was not created'
        Select-Record 1 'D409 Primary Item';Click (Control $script:work 4925 'Button');$form=Modal;Combo-Match (Control $form 4802 'ComboBox') $project.id;Save-Modal $form
        $item=Record-ByName 'items' 'D409 Primary Item';Assert ($item.projectId -ceq $project.id) 'Same-name project was resolved by label instead of chosen stable ID'
        Select-Record 2 $project.name;$detail=Read-Text (Control $script:work 5203 'Edit');Assert ($detail.Contains('#358260')) 'Project color absent from readable detail'
        @{project=$project;item=$item;selectedDetail=$detail}
    }
    Scenario 'N409-09' 'Template creation validates steps, preserves the draft, and exposes durable enable/disable/copy actions' {
        Page 3;Click (Control $script:work 4924 'Button');$form=Modal;Fill (Control $form 4800 'Edit') 'D409 Two Steps';Fill (Control $form 4803 'Edit') 'Template description';Click (Control $form 1 'Button');Dismiss-Message
        $form=Modal;Assert ((Read-Text (Control $form 4800 'Edit')) -ceq 'D409 Two Steps') 'Zero-step validation lost template name';Fill (Control $form 4805 'Edit') "Prepare`r`nDeliver";Save-Modal $form
        $template=Record-ByName 'templates' 'D409 Two Steps';Assert ($template.steps.Count -eq 2 -and $template.steps[0].id -ne $template.steps[1].id) 'Template steps lack distinct stable IDs'
        foreach($choice in @(3,2)){Select-Record 3 'D409 Two Steps';Click (Control $script:work 4928 'Button');$form=Modal;Combo (Control $form 4800 'ComboBox') $choice;Save-Modal $form;$current=Record-ByName 'templates' 'D409 Two Steps';Assert ($current.enabled -eq ($choice -eq 2)) 'Template availability action did not persist'}
        Select-Record 3 'D409 Two Steps';Click (Control $script:work 4928 'Button');$form=Modal;Combo (Control $form 4800 'ComboBox') 1;Save-Modal $form
        $state=Read-Store 'work';$copies=@($state.templates|Where-Object {$_.id -ne $template.id});Assert ($copies.Count -eq 1 -and $copies[0].steps.Count -eq 2 -and $copies[0].steps[0].id -ne $template.steps[0].id) 'Template copy does not have independent step IDs'
        @{template=$template;copy=$copies[0]}
    }
    Scenario 'N409-10' 'Native instance creation snapshots its template and real pause/resume/advance completes exactly once' {
        $template=Record-ByName 'templates' 'D409 Two Steps';Page 4;Click (Control $script:work 4924 'Button');$form=Modal;Fill (Control $form 4800 'Edit') 'D409 Instance';Combo-Match (Control $form 4801 'ComboBox') $template.id;Fill (Control $form 4802 'Edit') 'Instance notes';Save-Modal $form
        $instance=Record-ByName 'instances' 'D409 Instance';Assert ($instance.templateId -ceq $template.id -and $instance.steps.Count -eq 2 -and $instance.templateSnapshot.id -ceq $template.id) 'Instance snapshot did not match selected template'
        foreach($choice in @(1,2,0,0)){Select-Record 4 'D409 Instance';Click (Control $script:work 4928 'Button');$form=Modal;Combo (Control $form 4800 'ComboBox') $choice;Save-Modal $form;$state=Record-ByName 'instances' 'D409 Instance';if($choice -eq 1){Assert ($state.status -ceq 'paused') 'Pause did not persist'};if($choice -eq 2){Assert ($state.status -ceq 'running') 'Resume did not persist'}}
        $done=Record-ByName 'instances' 'D409 Instance';Assert ($done.status -ceq 'completed' -and $done.currentStep -eq 2) 'Two real advances did not complete two steps';$history=$done.history.Count
        Select-Record 4 'D409 Instance';Click (Control $script:work 4928 'Button');$form=Modal;Save-Modal $form;Dismiss-Message;$again=Record-ByName 'instances' 'D409 Instance';Assert ($again.history.Count -eq $history) 'Repeated completion appended history'
        @{created=$instance;completed=$again}
    }
    Scenario 'N409-11' 'Native contact/followup creation retains stable relations; archive/restore and cancelled delete retain IDs' {
        New-Record 5 @{4800='D409 Contact';4802='Synthetic organization';4803='Coordinator';4804='synthetic@example.invalid';4805='000-000-0000';4806='Local fixture only';4807='Contact note'}
        $contact=Record-ByName 'contacts' 'D409 Contact';$item=Record-ByName 'items' 'D409 Primary Item';Page 6;Click (Control $script:work 4924 'Button');$form=Modal;Fill (Control $form 4800 'Edit') 'D409 Followup';Combo-Match (Control $form 4803 'ComboBox') $contact.id;Combo-Match (Control $form 4804 'ComboBox') $item.id;Fill (Control $form 4805 'Edit') '2026-11-28 11:20';Fill (Control $form 4806 'Edit') '2026-12-03';Fill (Control $form 4807 'Edit') 'Followup note';Save-Modal $form
        $followup=Record-ByName 'followups' 'D409 Followup';Assert ($followup.contactId -ceq $contact.id -and $followup.workItemId -ceq $item.id) 'Followup relation changed'
        Select-Record 1 'D409 Corrected Draft';$record=Record-ByName 'items' 'D409 Corrected Draft';Click (Control $script:work 4927 'Button');Page 7;List-Select (Control $script:work 4923 'ListBox') 'D409 Corrected Draft';Capture 'archive' $script:work;Click (Control $script:work 4927 'Button');$restored=Record-ByName 'items' 'D409 Corrected Draft';Assert ($restored.id -ceq $record.id -and -not $restored.archived) 'Restore changed identity'
        Select-Record 5 'D409 Contact';Click (Control $script:work 4926 'Button');Dismiss-Message $false;Assert ((Record-ByName 'contacts' 'D409 Contact').id -ceq $contact.id) 'Cancelled delete removed contact'
        @{contact=$contact;followup=$followup;archiveId=$record.id;ownerAcceptance='not claimed'}
    }
    Scenario 'N409-12' 'Original backup import exposes exact historical time and full selectable long notes; unchanged edit preserves raw values' {
        $item=Record-ByName 'items' 'D409 Primary Item';$history=($item|ConvertTo-Json -Depth 80)|ConvertFrom-Json -AsHashtable -DateKind String -Depth 80
        $history.id='d409-external-historical';$history.name='D409 Historical Precision';$history.plannedStart='2026-10-01T12:34:56.789+08:00';$history.dueDate='2026-12-31T23:59:58.987+08:00';$history.status='legacy-custom-state';$history.priority=$null;$history.history=@();$history.attachments=@();$history.extension=@{opaque=@(1,$null,'kept')};$history.notes=((1..42|ForEach-Object {"Long readable note line $_ / 中文备注完整保留"}) -join "`r`n")+"`r`nEND-D409-LONG-NOTE"
        $state=Read-Store 'work';$existingRecords=@{};$existingCounts=@{}
        foreach($kind in @('items','projects','templates','instances','contacts','followups')){$existingCounts[$kind]=@($state.$kind).Count;foreach($record in @($state.$kind)){$existingRecords[$kind+'/'+$record.id]=ConvertTo-Json -InputObject $record -Depth 80 -Compress}}
        $state.items=@($state.items)+@($history);$backup=@{format='mytodo.d408.work-backup';version=1;scope='windows-isolated-candidate';state=$state;files=@{}}
        $path=Join-Path $evidenceRoot 'synthetic-historical-work-backup.json';Write-Json $path $backup;Page 1;Click (Control $script:work 4934 'Button');File-Dialog $path;Dismiss-Message
        $imported=Read-Store 'work';$seenImported=@{}
        foreach($kind in @('items','projects','templates','instances','contacts','followups')){
            $expectedCount=$existingCounts[$kind]+$(if($kind -ceq 'items'){1}else{0});Assert (@($imported.$kind).Count -eq $expectedCount) "Synthetic historical import added unexpected $kind copies"
            foreach($record in @($imported.$kind)){$recordKey=$kind+'/'+$record.id;Assert (-not $seenImported.ContainsKey($recordKey)) "Synthetic historical import duplicated ID $recordKey";$seenImported[$recordKey]=$true;if($kind -ceq 'items' -and $record.id -ceq $history.id){continue};Assert ($existingRecords.ContainsKey($recordKey) -and (ConvertTo-Json -InputObject $record -Depth 80 -Compress) -ceq $existingRecords[$recordKey]) "Synthetic historical import changed original record $recordKey"}
        }
        Assert ($seenImported.ContainsKey('items/'+$history.id)) 'Synthetic historical import omitted the added record'
        foreach($recordKey in $existingRecords.Keys){Assert ($seenImported.ContainsKey($recordKey)) "Synthetic historical import omitted original record $recordKey"}
        Select-Record 1 $history.name;$details=Control $script:work 5203 'Edit';$text=Read-Text $details;Assert ($text.Contains($history.plannedStart) -and $text.Contains($history.dueDate) -and $text.Contains('END-D409-LONG-NOTE')) 'Historical text clipped or normalized in detail readback'
        Focus $details;Key $details 65 $true;$selected=[D409.NativeUiDriver]::Selection($details);Assert ($selected[0] -eq 0 -and $selected[1] -eq $text.Length) 'Full native note selection failed';Capture 'selected-note' $script:work;Key $details 35 $true
        Assert ([D409.NativeUiDriver]::ReadNumber($details,0xCE,0) -gt 0) 'Long native detail did not scroll to end'
        Click (Control $script:work 4925 'Button');$form=Modal;Focus (Control $form 4809 'Edit');Capture 'historical-time-footer' $form;Save-Modal $form
        $after=Record-ByName 'items' $history.name;Assert ($after.plannedStart -ceq $history.plannedStart -and $after.dueDate -ceq $history.dueDate -and $after.status -ceq $history.status -and $null -eq $after.priority -and $after.notes -ceq $history.notes -and $after.extension.opaque[2] -ceq 'kept') 'Unchanged historical record lost raw fields'
        @{fixturePath=$path;fixtureSha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();selectedRange=$selected;record=$after;inputMethod='synthetic backup via original native file dialog and restore command';jsonDateKind='String';unchangedExistingRecords=$existingRecords.Count;unexpectedImportCopies=0}
    }
    Scenario 'N409-13' 'Native modal footer remains reachable while Tab/ShiftTab reveal fields and owner modal state is restored' {
        Select-Record 1 'D409 Primary Item';Click (Control $script:work 4925 'Button');$form=Modal;Assert (-not [D409.NativeUiDriver]::Describe($script:work).Enabled) 'Modal owner was not disabled'
        [D409.NativeUiDriver]::Resize($form,[int](640*$scale),[int](450*$scale));Focus (Control $form 4800 'Edit')
        $visited=@();for($i=0;$i -lt 12;$i++){$focus=[D409.NativeUiDriver]::Focused($form);$visited+=[D409.NativeUiDriver]::Describe($focus).ControlId;Key $focus 9}
        Write-Json (Join-Path $evidenceRoot 'scenarios/N409-13.tab-order.json') $visited
        Assert ($visited -contains 4809 -and $visited -contains 1 -and $visited -contains 2) 'Tab traversal failed to reach last field and fixed footer'
        Focus (Control $form 4809 'Edit');$null=Reachable (Control $form 4809 'Edit');$null=Reachable (Control $form 1 'Button');$null=Reachable (Control $form 2 'Button');Key (Control $form 4809 'Edit') 9 $false $true;Assert ([D409.NativeUiDriver]::Describe([D409.NativeUiDriver]::Focused($form)).ControlId -eq 4808) 'ShiftTab did not return to the previous field';Capture 'modal-footer' $form
        Click (Control $form 2 'Button');Wait-Until {[D409.NativeUiDriver]::Describe($script:work).Enabled} 'modal owner restored';@{visited=$visited;modalHandle=$form;closed=$true}
    }
    Scenario 'N409-14' 'Actual native task title, multiline note and quick subtask keyboard inputs persist through the original export path' {
        Main-Only;Click (Control $script:main 100 'Button');$title=Control $script:main 600 'Edit';Fill $title 'D409 Native Keyboard';Click (Control $script:main 555 'Button')
        Fill $title 'D409 Native Keyboard Saved';Key $title 13 $true
        $notes=Control $script:main 608 'Edit';Fill $notes 'Native note first';Key $notes 35 $true;Key $notes 13;[D409.NativeUiDriver]::TypeText($notes,'Native note second');Flush-Trace;Key $notes 13 $true
        $quick=Control $script:main 571 'Edit';Fill $quick 'D409 quick subtask';Key $quick 13 $true
        $state=Read-Tasks;$parents=@(All-Tasks $state.tasks|Where-Object {$_.title -ceq 'D409 Native Keyboard Saved'});$children=@(All-Tasks $state.tasks|Where-Object {$_.title -ceq 'D409 quick subtask'})
        Assert ($parents.Count -eq 1 -and $parents[0].notes.Replace("`r`n","`n").Contains("Native note first`nNative note second")) 'CtrlEnter note readback changed multiline text'
        Assert ($children.Count -eq 1) 'CtrlEnter quick subtask did not persist exactly once';Capture 'task-keyboard' $script:main
        Click (Control $script:main 552 'Button');@{parent=$parents[0];child=$children[0];inputMethod='SendInput, not IME composition'}
    }
    Scenario 'N409-15' 'Actual cross-quadrant mouse drag changes exactly one durable task quadrant without changing its parent' {
        Main-Only;All-Dates;Combo (Control $script:main 104 'ComboBox') 2;Combo (Control $script:main 120 'ComboBox') 0
        $before=Read-Tasks;$source=Control $script:main 1000 'SysListView32';$target=Control $script:main 1001 'SysListView32'
        Assert ([D409.NativeUiDriver]::ReadNumber($source,0x1004,0) -gt 0) 'No actual source row for drag';$a=[D409.NativeUiDriver]::Client($source);$b=[D409.NativeUiDriver]::Client($target)
        [D409.NativeUiDriver]::Drag($source,[int]($a.Left+7*$scale),[int]($a.Top+23*$scale),$target,[int]($b.Left+90*$scale),[int]($b.Top+75*$scale));Flush-Trace
        $after=Read-Tasks;$old=@(All-Tasks $before.tasks);$new=@(All-Tasks $after.tasks);$changes=@()
        foreach($task in $new){$prior=@($old|Where-Object {$_.id -ceq $task.id});if($prior.Count -eq 1 -and $prior[0].quadrant -ne $task.quadrant){$changes+=@{before=$prior[0];after=$task}}}
        Assert ($changes.Count -eq 1 -and $changes[0].before.quadrant -eq 0 -and $changes[0].after.quadrant -eq 1 -and $changes[0].before.parentId -ceq $changes[0].after.parentId) 'Real drag did not move exactly one task across quadrants'
        Capture 'quadrants-after-drag' $script:main;@{changes=$changes;sourceClient=$a;targetClient=$b;method='actual SendInput down/move/up with endpoint hit checks'}
    }
    Scenario 'N409-16' 'Native timer configuration, labels and all original controls remain reachable and real Save persists duration/task' {
        $null=Open-Module 'timer';foreach($id in @(4596,4597,4598,4599,4601,4602,4604,4605,4606,4607,4608,4609,4610,4611,4612,4613,4614,4615,4616,4617,5223,5224,5225)){$null=Reachable (Control $script:timer $id)}
        $label=[D409.NativeUiDriver]::Describe((Control $script:timer 4597 'Static'));$edit=[D409.NativeUiDriver]::Describe((Control $script:timer 4601 'Edit'));Assert ($label.Bottom -le $edit.Top) 'Timer duration label overlaps its input'
        $clockBounds=[D409.NativeUiDriver]::Describe((Control $script:timer 4615 'Static'));$progress=[D409.NativeUiDriver]::Describe((Control $script:timer 5223 'msctls_progress32'));$progressText=[D409.NativeUiDriver]::Describe((Control $script:timer 5224 'Static'));$statusBounds=[D409.NativeUiDriver]::Describe((Control $script:timer 4616 'Static'))
        Assert ($clockBounds.Bottom -le $progress.Top -and $progress.Bottom -le $progressText.Top -and $progressText.Bottom -le $statusBounds.Top) 'Timer clock/progress/status overlap'
        Combo (Control $script:timer 4600 'ComboBox') 0;Fill (Control $script:timer 4601 'Edit') '1';Fill (Control $script:timer 4602 'Edit') '1';Combo-Match (Control $script:timer 4603 'ComboBox') 'D409 synthetic quadrant';Click (Control $script:timer 4604 'Button')
        $state=Read-Store 'timer';Assert ($state.configuration.durationMinutes -eq 1 -and $state.configuration.breakMinutes -eq 1 -and $state.configuration.taskId.StartsWith('d409-native-task-')) 'Native timer configuration did not persist selected task'
        Fill (Control $script:timer 4601 'Edit') '0';Click (Control $script:timer 4604 'Button');Dismiss-Message;$rejected=Read-Store 'timer';Assert ($rejected.configuration.durationMinutes -eq 1) 'Invalid duration replaced last valid config';Fill (Control $script:timer 4601 'Edit') '1';Click (Control $script:timer 4604 'Button')
        @{configuration=$state.configuration;label=$label;field=$edit;clock=$clockBounds;progress=$progress;progressText=$progressText;relatedProject=Read-Text (Control $script:timer 5225 'Edit')}
    }
    Scenario 'N409-17' 'Real timer starts, pauses, hides/reopens, resumes and ends with one durable history record' {
        $null=Open-Module 'timer';Click (Control $script:timer 4605 'Button');Wait-Until {(Read-Text (Control $script:timer 4615 'Static')) -ne '00:01:00'} 'real countdown advances' 5000
        Click (Control $script:timer 4606 'Button');$paused=Read-Store 'timer';Assert ($paused.status -ceq 'paused' -and $paused.elapsedMillis -gt 0) 'Timer pause did not persist earned time';Capture 'timer-paused' $script:timer
        $clock=Read-Text (Control $script:timer 4615 'Static');$null=Open-Module 'work';$null=Open-Module 'timer';Assert ((Read-Text (Control $script:timer 4615 'Static')) -ceq $clock) 'Paused timer accrued hidden time'
        Click (Control $script:timer 4607 'Button');Hide-Window $script:timer;$null=Open-Module 'work';$null=Open-Module 'timer';Wait-Until {(Read-Text (Control $script:timer 4615 'Static')) -ne $clock} 'hidden/resumed timer advances' 5000
        Click (Control $script:timer 4608 'Button');Dismiss-Message;$ended=Read-Store 'timer';Assert ($ended.status -ceq 'ended' -and $ended.history.Count -eq 1 -and $ended.history[0].id -ceq $paused.sessionId -and $ended.elapsedMillis -gt $paused.elapsedMillis) 'End history or elapsed continuity changed'
        @{paused=$paused;ended=$ended;clockBasis='real OS clocks; no fakeClock or acceleration'}
    }
    Scenario 'N409-18' 'Real one-minute countdown completes once and ACK, count-up completion and early rest retain original history semantics' {
        $null=Open-Module 'timer';$baseline=Read-Store 'timer';Assert ($baseline.status -in @('idle','ended','completed')) '[blocked] Timer must be inactive after prior scenario'
        Combo (Control $script:timer 4600 'ComboBox') 0;Fill (Control $script:timer 4601 'Edit') '1';Click (Control $script:timer 4604 'Button');Click (Control $script:timer 4605 'Button');$begin=[DateTime]::UtcNow
        Wait-Until {(Read-Text (Control $script:timer 4616 'Static')).Contains('请点击「确认完成」')} 'real 60-second countdown completion' 75000
        $done=Read-Store 'timer';Assert ($done.status -ceq 'completed' -and $done.elapsedMillis -eq 60000 -and $done.completionPending -and $done.history.Count -eq $baseline.history.Count+1) 'Real countdown completion did not persist exactly one row'
        Click (Control $script:timer 4612 'Button');$acked=Read-Store 'timer';Assert (-not $acked.completionPending -and $acked.history.Count -eq $done.history.Count) 'ACK duplicated history'
        Combo (Control $script:timer 4600 'ComboBox') 1;Click (Control $script:timer 4604 'Button');Click (Control $script:timer 4605 'Button');Wait-Until {(Read-Text (Control $script:timer 4615 'Static')) -ne '00:00:00'} 'real count-up advances' 5000
        Assert (-not [D409.NativeUiDriver]::Describe((Control $script:timer 5223 'msctls_progress32')).Visible -and (Read-Text (Control $script:timer 5224 'Static')).Contains('无固定终点')) 'Count-up displays a false percentage/end target'
        Capture 'timer-countup' $script:timer;Click (Control $script:timer 4609 'Button');Click (Control $script:timer 4612 'Button')
        Click (Control $script:timer 4610 'Button');Click (Control $script:timer 4608 'Button');Dismiss-Message;$end=Read-Store 'timer'
        $rounds=@($end.history|Where-Object {$_.phase -ceq 'focus' -and $_.mode -ceq 'countdown' -and $_.status -ceq 'completed'});Assert ($rounds.Count -eq 1 -and $end.history.Count -eq $baseline.history.Count+3) 'Count-up or rest incorrectly created completed focus rounds'
        Capture 'timer-history' $script:timer;@{startedAtUtc=$begin.ToString('o');finishedAtUtc=[DateTime]::UtcNow.ToString('o');countdown=$done;final=$end;completedFocusRounds=$rounds.Count}
    }
    Scenario 'N409-19' 'Statistics use original real records/date filters and rejected dates preserve the previous valid results' {
        Page 8;Fill (Control $script:work 4920 'Edit') '';Combo (Control $script:work 4921 'ComboBox') 0;Combo (Control $script:work 4922 'ComboBox') 0
        Fill (Control $script:work 4938 'Edit') '2026-12-01';Fill (Control $script:work 4939 'Edit') '2026-12-02';Click (Control $script:work 4940 'Button');$before=@(List-Lines (Control $script:work 4923 'ListBox'))
        Assert (@($before|Where-Object {$_.StartsWith('模块总览')}).Count -eq 6 -and @($before|Where-Object {$_.Contains('筛选事项合计：事项2')}).Count -eq 1) 'Date-inclusive original statistics totals differ'
        Fill (Control $script:work 4938 'Edit') '2026-02-30';Click (Control $script:work 4940 'Button');Dismiss-Message;$after=@(List-Lines (Control $script:work 4923 'ListBox'));Assert (($before -join "`n") -ceq ($after -join "`n")) 'Invalid date replaced last valid statistics'
        Click (Control $script:work 4941 'Button');Capture 'statistics' $script:work;@{validRows=$before;rejectedRows=$after}
    }
    Scenario 'N409-20' 'Feedback draft debounce, real PNG file selection/preview, local submit, delete and undo persist actual bytes' {
        $null=Open-Module 'feedback';Click (Control $script:feedback 4707 'Button');Fill (Control $script:feedback 4702 'Edit') 'D409 Feedback';$body=Control $script:feedback 4704 'Edit';Fill $body "Native feedback first line`r`nNative feedback second line"
        $start=[DateTime]::UtcNow;Wait-Until {(Read-Text (Control $script:feedback 4718 'Static')).Contains('草稿已保存')} '650ms draft debounce persisted' 5000;$draft=Read-Store 'feedback';Assert (@($draft.drafts|Where-Object {$_.title -ceq 'D409 Feedback'}).Count -eq 1) 'Auto draft not found in durable store'
        $png=Join-Path $evidenceRoot 'synthetic-feedback.png';$bitmap=[Drawing.Bitmap]::new(64,40);$graphics=[Drawing.Graphics]::FromImage($bitmap);try{$graphics.Clear([Drawing.Color]::FromArgb(30,130,92));$bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
        $pngHash=(Get-FileHash -LiteralPath $png -Algorithm SHA256).Hash.ToLowerInvariant();Click (Control $script:feedback 4712 'Button');File-Dialog $png
        $state=Read-Store 'feedback';$entry=@($state.drafts|Where-Object {$_.title -ceq 'D409 Feedback'});Assert ($entry.Count -eq 1 -and $entry[0].attachments.Count -eq 1 -and $entry[0].attachments[0].sha256 -ceq $pngHash) 'Native image import changed attachment bytes/hash'
        $persisted=Join-Path $dataRoot ('d408/feedback-images/'+$entry[0].attachments[0].id+'.image');Assert ((Get-FileHash -LiteralPath $persisted -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $pngHash) 'Persisted image hash mismatch'
        List-Select (Control $script:feedback 4706 'ListBox') 'synthetic-feedback.png';Click (Control $script:feedback 4713 'Button');Wait-Until {@(Windows|Where-Object {$_.ClassName -ceq 'GxD408FeedbackImage' -and $_.Visible}).Count -eq 1} 'GDI+ native preview';$preview=Window 'GxD408FeedbackImage';[D409.NativeUiDriver]::Fit($preview,[int](780*$scale),[int](620*$scale));Capture 'feedback-image-preview' $preview;[D409.NativeUiDriver]::Activate($preview);Key 0 115 $false $false $true
        Click (Control $script:feedback 4709 'Button');$submitted=Read-Store 'feedback';$idea=@($submitted.ideas|Where-Object {$_.title -ceq 'D409 Feedback'});Assert ($idea.Count -eq 1) 'Local submit did not persist idea'
        Focus $body;Key $body 65 $true;$selection=[D409.NativeUiDriver]::Selection($body);Assert ($selection[1] -eq (Read-Text $body).Length) 'Feedback body selection incomplete';Capture 'feedback' $script:feedback
        Click (Control $script:feedback 4710 'Button');Dismiss-Message;$deleted=Read-Store 'feedback';Assert (@($deleted.deleted|Where-Object {$_.id -ceq $idea[0].id}).Count -eq 1) 'Deletion batch missing';Click (Control $script:feedback 4711 'Button');$restored=Read-Store 'feedback';Assert (@($restored.ideas|Where-Object {$_.id -ceq $idea[0].id}).Count -eq 1) 'Undo did not restore same idea ID'
        @{debounceObservedAtUtc=[DateTime]::UtcNow.ToString('o');inputFinishedAtUtc=$start.ToString('o');pngSha256=$pngHash;ideaId=$idea[0].id;selection=$selection;store=$restored}
    }
    Scenario 'N409-21' 'All populated native work pages and honest local settings/source information are captured from real windows' {
        $slugs=@('dashboard','items','projects','templates','instances','contacts','followups','archive','statistics','settings');$pages=@()
        for($i=0;$i -lt 10;$i++){Page $i;Fill (Control $script:work 4920 'Edit') '';Combo (Control $script:work 4921 'ComboBox') 0;Combo (Control $script:work 4922 'ComboBox') 0;$list=Control $script:work 4923 'ListBox';if($i -lt 8 -and [D409.NativeUiDriver]::Describe($list).Visible -and [D409.NativeUiDriver]::ReadNumber($list,0x18B,0) -gt 0){Focus $list;Key $list 36;[D409.NativeUiDriver]::ListItem($list,0,$false);Flush-Trace};if($i -ne 7){Capture $slugs[$i] $script:work};$pages+=@{page=$i;title=Read-Text (Control $script:work 5200 'Static');rows=@(List-Lines $list)}}
        $settings=@(List-Lines (Control $script:work 4923 'ListBox')) -join "`n";Assert ($settings.Contains('独立候选') -and $settings.Contains('备份') -and (Read-Text (Control $script:work 4924 'Button')) -ceq '原系统设置') 'Settings identity or original settings entry is missing'
        @{pages=$pages;buildReceiptSource=$buildReceipt.sourceSha;uiDesignStage=$buildReceipt.uiDesignStage;compatibilityIdentity=$buildReceipt.candidateIdentity}
    }
    Scenario 'N409-22' 'Keyboard Tab and ShiftTab move actual modal focus; Escape cancels without writing its draft' {
        $before=Record-ByName 'items' 'D409 Primary Item';Select-Record 1 $before.name;Click (Control $script:work 4925 'Button');$form=Modal;$name=Control $form 4800 'Edit';Focus $name;Key $name 9;$next=[D409.NativeUiDriver]::Focused($form);Assert ([D409.NativeUiDriver]::Describe($next).ControlId -eq 4801) 'Tab did not move to native status field';Key $next 9 $false $true;Assert ([D409.NativeUiDriver]::Focused($form) -eq $name) 'ShiftTab did not restore name focus';Fill $name 'D409 cancelled keyboard draft';Capture 'keyboard-focus' $form;Key $name 27
        Wait-Until {@(Windows|Where-Object {$_.Handle -eq $form}).Count -eq 0} 'Escape closes modal';$after=Record-ByName 'items' 'D409 Primary Item';Assert ($before.updatedAt -ceq $after.updatedAt -and $before.name -ceq $after.name) 'Escape wrote cancelled draft';@{before=$before;after=$after;focusReturned=[D409.NativeUiDriver]::Focused($script:work)}
    }
    Scenario 'N409-23' 'Native minimum, maximize and restore layouts retain required actions inside the actual desktop at requested application scaling' {
        $matrix=@();foreach($name in @('work','timer','feedback')){$handle=Open-Module $name;$minWidth=@{work=1060;timer=650;feedback=980}[$name];[D409.NativeUiDriver]::Resize($handle,[int]($minWidth*$scale),[int](680*$scale));$buttons=@{work=@(4924,4925,4926,4933,4934);timer=@(4604,4605,4608,4612,4617);feedback=@(4707,4709,4710,4717)}[$name]
            foreach($id in $buttons){$null=Reachable (Control $handle $id 'Button')};$geometry=@(Reachable-Children $handle);Capture $(if($name -eq 'work'){'minimum-layout'}else{'minimum-'+$name}) $handle
            $statistics=@();if($name -eq 'work'){Page 8;foreach($id in @(4938,4939)){$null=Reachable (Control $handle $id 'Edit')};foreach($id in @(4940,4941)){$null=Reachable (Control $handle $id 'Button')};$statistics=@(Reachable-Children $handle);Capture 'minimum-statistics-dates' $handle;Page 1}
            [D409.NativeUiDriver]::WindowState($handle,3);foreach($id in $buttons){$null=Reachable (Control $handle $id 'Button')};$maximized=@(Reachable-Children $handle);Capture ('maximized-'+$name) $handle;[D409.NativeUiDriver]::WindowState($handle,9);$restoredControls=@(Reachable-Children $handle);$matrix+=@{name=$name;applicationDpi=$Dpi;actualWindowDpi=[D409.NativeUiDriver]::Describe($handle).ActualWindowDpi;minimumControls=$geometry;minimumStatisticsControls=$statistics;maximizedControls=$maximized;restoredControls=$restoredControls;restored=[D409.NativeUiDriver]::Describe($handle)}
        };$matrix
    }
    Scenario 'N409-24' 'Normal main close and reopen preserve work IDs, timer history and feedback records through original lifecycle paths' {
        $workBefore=Read-Store 'work';$timerBefore=Read-Store 'timer';$feedbackBefore=Read-Store 'feedback';Main-Only;Stop-Gui;Start-Gui;$null=Open-Module 'work';$workAfter=Read-Store 'work';$null=Open-Module 'timer';$timerAfter=Read-Store 'timer';$null=Open-Module 'feedback';$feedbackAfter=Read-Store 'feedback'
        foreach($kind in @('items','projects','templates','instances','contacts','followups')){Assert ((ConvertTo-Json -InputObject @($workBefore.$kind|ForEach-Object {$_.id}|Sort-Object) -Compress) -ceq (ConvertTo-Json -InputObject @($workAfter.$kind|ForEach-Object {$_.id}|Sort-Object) -Compress)) "Reopen changed $kind IDs"}
        Assert (($timerBefore.history|ConvertTo-Json -Depth 80 -Compress) -ceq ($timerAfter.history|ConvertTo-Json -Depth 80 -Compress)) 'Reopen changed completed timer history'
        Assert ((ConvertTo-Json -InputObject @($feedbackBefore.ideas|ForEach-Object {$_.id}|Sort-Object) -Compress) -ceq (ConvertTo-Json -InputObject @($feedbackAfter.ideas|ForEach-Object {$_.id}|Sort-Object) -Compress)) 'Reopen changed feedback IDs'
        @{work=$workAfter;timer=$timerAfter;feedback=$feedbackAfter;saveFailureCoverage='frozen original suites; no external injection claimed'}
    }
} catch {$fatalError=$_.ToString();Write-Output "FATAL $fatalError"}
finally {
    try{if($script:gui -and -not $script:gui.HasExited){Main-Only;Stop-Gui}}catch{if(-not $fatalError){$fatalError='Cleanup close: '+$_.ToString()};if($script:gui -and -not $script:gui.HasExited){$script:gui.Kill($true)}}
    try{Flush-Trace;$script:desktopRestored=[D409.NativeUiDriver]::RestoreDesktop();[D409.NativeUiDriver]::RestoreCoordinateContext()}catch{if(-not $fatalError){$fatalError='Desktop restoration: '+$_.ToString()}}
    foreach($id in $contract.caseIds){if(-not @($results|Where-Object {$_.id -ceq $id}).Count){$results.Add([ordered]@{id=$id;expected='See native-expected contract';executed=$false;passed=$false;status='blocked';observed=$null;error='Blocked by fatal harness/startup failure';failureKind='harness-or-environment';startedAtUtc=$null;endedAtUtc=$null})}}
    $missing=@($contract.requiredScreenshots|Where-Object {$required=$_;-not @($captures|Where-Object {$_.name -ceq $required}).Count})
    $passedCount=@($results|Where-Object {$_.passed}).Count;$failedCount=@($results|Where-Object {-not $_.passed}).Count
    $report=[ordered]@{schemaVersion=1;kind='d409-native-ui';sourceSha=$head;productSourceSha=$ProductSourceSha;harnessSourceSha=$head;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;candidateIdentity='D4-08';uiDesignStage='D4-09';productionAdmission=$false;dpi=$Dpi;dpiMeaning='application --visual-dpi scaling, not a claim of OS DPI or physical display validation';executable=@{path=$exePath;sha256=$exeHash;bytes=$exeItem.Length};buildReceiptSha256=(Get-FileHash -LiteralPath $buildReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant();isolatedDataRoot=$dataRoot;desktopBefore=$script:desktopBefore;desktopDuring=$script:desktopAfter;desktopRestored=$script:desktopRestored;executed=@($results|Where-Object {$_.executed}).Count;passedCount=$passedCount;failedCount=$failedCount;blockedCount=@($results|Where-Object {$_.status -eq 'blocked'}).Count;results=@($results);captures=@($captures);missingScreenshots=$missing;commands=@($commands);readbacks=@($readbacks);fatalError=$fatalError;passed=($null -eq $fatalError -and $failedCount -eq 0 -and $results.Count -eq $contract.caseIds.Count -and $missing.Count -eq 0);startedAtUtc=$startedAtUtc;endedAtUtc=[DateTime]::UtcNow.ToString('o');limitations=$contract.limits;inputMethods=@('SendInput mouse with WindowFromPoint/PID/native-parent checks','SendInput Unicode and key chords; not IME composition','Win32 window management and explicitly logged SetFocus API','Original CLI synthetic task fixture/export; original UI form/file restore for work data','CopyFromScreen original PNG and <=960px JPEG previews')}
    Write-Json (Join-Path $evidenceRoot 'ui-report.json') $report
    Stop-Transcript | Out-Null
}
if(-not $report.passed){exit 1}
