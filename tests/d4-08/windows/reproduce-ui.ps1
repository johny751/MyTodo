[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ProductSourceSha,
    [ValidatePattern('^$|^[a-f0-9]{64}$')][string]$ExpectedExecutableSha256 = '',
    [ValidateSet(96,144)][int]$Dpi = 96
)

# This is an external UI regression, never a local inspection convenience.
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $IsWindows) {
    throw 'D4-08 native reproduction may run only on GitHub Actions Windows.'
}
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$exePath = (Resolve-Path -LiteralPath $Executable).Path
$evidenceRoot = [IO.Path]::GetFullPath($OutputDirectory)
$runnerRoot = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path.TrimEnd('\')
if ([IO.Path]::GetDirectoryName($evidenceRoot).TrimEnd('\') -ine $runnerRoot -or
    [IO.Path]::GetFileName($evidenceRoot) -notmatch '^d4-08-[a-z0-9-]+$' -or (Test-Path -LiteralPath $evidenceRoot)) {
    throw 'Output must be a new direct d4-08-* child of RUNNER_TEMP.'
}
if ($env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$') {
    throw 'An exact Actions run ID and attempt are required.'
}
$executableSha = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedExecutableSha256 -and $executableSha -cne $ExpectedExecutableSha256) { throw 'Executable SHA256 mismatch.' }
$harnessHead = (& git -C $PSScriptRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $harnessHead -notmatch '^[a-f0-9]{40}$') { throw 'Cannot identify harness checkout.' }
$null = New-Item -ItemType Directory -Path $evidenceRoot
$dataRoot = Join-Path $evidenceRoot 'synthetic-data'
$null = New-Item -ItemType Directory -Path $dataRoot
$null = New-Item -ItemType Directory -Path (Join-Path $evidenceRoot 'screenshots')
$null = New-Item -ItemType Directory -Path (Join-Path $evidenceRoot 'scenarios')
Start-Transcript -LiteralPath (Join-Path $evidenceRoot 'harness-transcript.log') | Out-Null

$results = [Collections.Generic.List[object]]::new()
$captures = [Collections.Generic.List[object]]::new()
$commands = [Collections.Generic.List[object]]::new()
$script:guiProcess = $null
$script:guiStdout = $null
$script:guiStderr = $null
$fatalError = $null
$startedAtUtc = [DateTime]::UtcNow.ToString('o')
$exportNumber = 0

function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 40) + "`n", [Text.UTF8Encoding]::new($false))
}
function New-NativeProcess([string[]]$Arguments, [bool]$Gui) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $exePath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = -not $Gui
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $info.StandardErrorEncoding = [Text.Encoding]::UTF8
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'Native process did not start.' }
    return $process
}
function Invoke-Native([string]$Name, [string[]]$Arguments) {
    $process = New-NativeProcess $Arguments $false
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(20000)) {
        $process.Kill($true); $process.WaitForExit(); throw "Native CLI timeout: $Name"
    }
    $out = $stdout.GetAwaiter().GetResult(); $err = $stderr.GetAwaiter().GetResult()
    [IO.File]::WriteAllText((Join-Path $evidenceRoot "$Name.stdout.log"), $out, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $evidenceRoot "$Name.stderr.log"), $err, [Text.UTF8Encoding]::new($false))
    $record = [ordered]@{ name=$Name; arguments=$Arguments; exitCode=$process.ExitCode; executedAtUtc=[DateTime]::UtcNow.ToString('o') }
    $commands.Add($record)
    Write-Json (Join-Path $evidenceRoot "$Name.command.json") $record
    if ($process.ExitCode -ne 0) { throw "Native CLI $Name failed with exit $($process.ExitCode): $err" }
}
function Snapshot([string]$Name) {
    if ($script:guiProcess.HasExited) { throw 'Native GUI exited before the UI scenario completed.' }
    $items = @([D408.UiDriver]::Snapshot($script:guiProcess.Id))
    Write-Json (Join-Path $evidenceRoot "$Name.windows.json") $items
    return $items
}
function Find-Control([int]$Id, [string]$Class = '') {
    $items = @([D408.UiDriver]::Snapshot($script:guiProcess.Id) | Where-Object { $_.ControlId -eq $Id -and (-not $Class -or $_.ClassName -ieq $Class) })
    if ($items.Count -eq 0) { throw "Native control missing: ID $Id, class $Class" }
    return $items[0]
}
function Find-Button([string]$Pattern) {
    return ,@([D408.UiDriver]::Snapshot($script:guiProcess.Id) | Where-Object {
        $_.Visible -and $_.Enabled -and $_.ClassName -ieq 'Button' -and $_.Text -match $Pattern
    } | Select-Object -First 1)
}
function Focus-Control([long]$Handle) {
    $actual = [D408.UiDriver]::Focus($Handle)
    if ($actual -ne $Handle) { throw "Keyboard focus mismatch: expected $Handle, actual $actual" }
}
function Press-Key([long]$Handle, [int]$Key, [bool]$Control = $false, [bool]$Shift = $false) {
    Focus-Control $Handle
    [D408.UiDriver]::Chord([uint16]$Key, $Control, $Shift)
    Start-Sleep -Milliseconds 250
}
function Move-CaretToEnd([long]$Handle) {
    Focus-Control $Handle
    $length = [D408.UiDriver]::Text($Handle).Length
    [void][D408.UiDriver]::Message($Handle,0x00B1,$length,$length)
}
function Click-Control([long]$Handle) {
    [D408.UiDriver]::Click($Handle)
    Start-Sleep -Milliseconds 300
}
function Read-Business {
    $script:exportNumber++
    $name = 'readback-{0:D2}' -f $script:exportNumber
    $file = Join-Path $evidenceRoot "$name.json"
    Invoke-Native $name @('--data-dir', $dataRoot, '--export', $file)
    return Get-Content -LiteralPath $file -Raw -Encoding utf8 | ConvertFrom-Json -Depth 40
}
function All-Tasks($Tasks) {
    foreach ($task in @($Tasks)) {
        $task
        if ($task.PSObject.Properties['subtasks']) { All-Tasks $task.subtasks }
    }
}
function Task-ById([string]$Id) {
    $state = Read-Business
    $matches = @(All-Tasks $state.tasks | Where-Object { $_.id -ceq $Id })
    if ($matches.Count -ne 1) { throw "Readback expected one task '$Id', found $($matches.Count)." }
    return $matches[0]
}
function Capture([string]$Name, [long]$Handle) {
    $rect = [D408.UiDriver+RECT]::new()
    if (-not [D408.UiDriver]::GetWindowRect([IntPtr]$Handle, [ref]$rect)) { throw 'Cannot measure screenshot window.' }
    $width = $rect.Right-$rect.Left; $height=$rect.Bottom-$rect.Top
    if ($width -lt 1 -or $height -lt 1) { throw 'Screenshot window has zero area.' }
    $image = [Drawing.Bitmap]::new($width,$height)
    $graphics = [Drawing.Graphics]::FromImage($image)
    $dc = $graphics.GetHdc()
    try { $printed = [D408.UiDriver]::PrintWindow([IntPtr]$Handle,$dc,2) }
    finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    if (-not $printed) { $image.Dispose(); throw 'PrintWindow failed; screenshot is not evidence.' }
    $original = Join-Path $evidenceRoot "screenshots/$Name.png"
    $preview = Join-Path $evidenceRoot "screenshots/$Name.preview.jpg"
    $image.Save($original,[Drawing.Imaging.ImageFormat]::Png)
    $scale = [Math]::Min(1.0,960.0/[Math]::Max($width,$height))
    $previewWidth = [Math]::Max(1,[int]($width*$scale)); $previewHeight=[Math]::Max(1,[int]($height*$scale))
    $thumb = [Drawing.Bitmap]::new($previewWidth,$previewHeight)
    $draw = [Drawing.Graphics]::FromImage($thumb)
    $draw.DrawImage($image,0,0,$previewWidth,$previewHeight)
    $thumb.Save($preview,[Drawing.Imaging.ImageFormat]::Jpeg)
    $draw.Dispose(); $thumb.Dispose(); $image.Dispose()
    $captures.Add([ordered]@{name=$Name; original=$original; preview=$preview; width=$width; height=$height;
        previewWidth=$previewWidth;previewHeight=$previewHeight;previewToOriginalX=$width/[double]$previewWidth;
        previewToOriginalY=$height/[double]$previewHeight;sha256=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash.ToLowerInvariant()})
}
function Scenario([string]$Id, [string]$Expected, [scriptblock]$Body) {
    $begin = [DateTime]::UtcNow
    try {
        $observed = & $Body
        $record = [ordered]@{id=$Id;expected=$Expected;executed=$true;passed=[bool]$observed.passed;
            failureKind=$(if($observed.passed){$null}elseif($Id -eq 'W408-ENTER-CONTROL'){'harness-or-environment'}else{'product-behavior'});observed=$observed;error=$null;
            startedAtUtc=$begin.ToString('o');endedAtUtc=[DateTime]::UtcNow.ToString('o')}
    } catch {
        $record = [ordered]@{id=$Id;expected=$Expected;executed=$true;passed=$false;failureKind='harness-or-environment';
            observed=$null;error=$_.ToString();startedAtUtc=$begin.ToString('o');endedAtUtc=[DateTime]::UtcNow.ToString('o')}
    }
    $results.Add($record)
    Write-Json (Join-Path $evidenceRoot "scenarios/$Id.json") $record
    Write-Output ('{0} {1}: {2}' -f $(if($record.passed){'PASS'}else{'FAIL'}),$Id,$Expected)
}
function Find-TemplateObject($Value, [string]$Name) {
    if ($null -eq $Value -or $Value -is [string] -or $Value -is [ValueType]) { return }
    if ($Value -is [Collections.IEnumerable] -and $Value -isnot [pscustomobject]) {
        foreach($entry in $Value) { Find-TemplateObject $entry $Name }
        return
    }
    $nameProperty=$Value.PSObject.Properties['name']; $titleProperty=$Value.PSObject.Properties['title']
    $stepsProperty=$Value.PSObject.Properties['steps']
    if (($nameProperty -and $nameProperty.Value -ceq $Name -or $titleProperty -and $titleProperty.Value -ceq $Name) -and $stepsProperty) {
        $Value
    }
    foreach($property in $Value.PSObject.Properties) { Find-TemplateObject $property.Value $Name }
}

try {
    Add-Type -Path (Join-Path $PSScriptRoot 'UiDriver.cs')
    Add-Type -AssemblyName System.Drawing
    $fixture = @(
        @{key='["projects","d408-project-alpha"]';values=@{id='d408-project-alpha';name='D408 Alpha Project';description='Synthetic UI fixture';archived=$false;_deleted=$false}},
        @{key='["projects","d408-project-beta"]';values=@{id='d408-project-beta';name='D408 Beta Project';description='Synthetic UI fixture';archived=$false;_deleted=$false}},
        @{key='["tags","D408 Alpha Tag"]';values=@{id='D408 Alpha Tag';name='D408 Alpha Tag';_deleted=$false}},
        @{key='["tags","Existing Tag"]';values=@{id='Existing Tag';name='Existing Tag';_deleted=$false}}
    )
    $fixtureFile = Join-Path $evidenceRoot 'synthetic-fixture.json'
    Write-Json $fixtureFile $fixture
    Invoke-Native 'seed' @('--data-dir',$dataRoot,'--change',$fixtureFile)
    $script:guiProcess = New-NativeProcess @('--data-dir',$dataRoot,'--visual-dpi',"$Dpi") $true
    $script:guiStdout = $script:guiProcess.StandardOutput.ReadToEndAsync()
    $script:guiStderr = $script:guiProcess.StandardError.ReadToEndAsync()
    $main = $null
    for($i=0;$i -lt 60;$i++) {
        if($script:guiProcess.HasExited){throw 'Native GUI exited at startup.'}
        $found=@([D408.UiDriver]::Snapshot($script:guiProcess.Id) | Where-Object {$_.ClassName -eq 'GxNativeModern' -and $_.Visible})
        if($found.Count){$main=$found[0];break}
        Start-Sleep -Milliseconds 200
    }
    if(-not $main){throw 'No real GxNativeModern window became visible.'}
    $null=Snapshot 'startup'
    Capture 'startup' $main.Handle

    Scenario 'W408-WORK-ENTRY' 'Visible primary Work entry opens a real native workspace' {
        $entry=Find-Button '^(工作管理|原生工作区|工作区)$'
        if(-not $entry.Count){return @{passed=$false;reason='No visible primary work navigation button';mainHandle=$main.Handle}}
        Click-Control $entry[0].Handle
        $windows=Snapshot 'work-primary-entry'
        $workspace=@($windows|Where-Object {$_.Visible -and $_.ClassName -match '^Gx.*Work' -and $_.Handle -ne $main.Handle})
        if($workspace.Count){Capture 'work-primary-entry' $workspace[0].Handle;[D408.UiDriver]::Close($workspace[0].Handle);Start-Sleep -Milliseconds 200}
        return @{passed=($workspace.Count -gt 0);entry=$entry[0];workspace=$workspace}
    }
    Scenario 'W408-TIMER-ENTRY' 'Visible primary Pomodoro entry opens native start/pause/history controls' {
        $entry=Find-Button '^(番茄钟|专注计时)$'
        if(-not $entry.Count){return @{passed=$false;reason='No visible native Pomodoro entry'}}
        Click-Control $entry[0].Handle
        $windows=Snapshot 'timer-entry'
        $timer=@($windows|Where-Object {$_.Visible -and $_.ClassName -match '^Gx.*(Timer|Pomodoro)'})
        $start=@($windows|Where-Object {$_.Visible -and $_.ClassName -eq 'Button' -and $_.Text -match '^(开始|开始专注|开始计时)$'})
        $history=@($windows|Where-Object {$_.Visible -and $_.Text -match '(历史|计时记录)'})
        if($timer.Count){Capture 'timer-entry' $timer[0].Handle;[D408.UiDriver]::Close($timer[0].Handle);Start-Sleep -Milliseconds 200}
        return @{passed=($timer.Count -gt 0 -and $start.Count -gt 0 -and $history.Count -gt 0);timer=$timer;start=$start;history=$history}
    }

    Click-Control (Find-Control 100 'Button').Handle
    $title=Find-Control 600 'Edit'
    [D408.UiDriver]::SetText($title.Handle,'D408 seed parent')
    Click-Control (Find-Control 555 'Button').Handle
    $initial=Read-Business
    $parent=@(All-Tasks $initial.tasks|Where-Object {$_.title -ceq 'D408 seed parent'})
    if($parent.Count -ne 1){throw 'Positive control failed: explicit Save did not persist exactly one seed parent.'}
    $parentId=$parent[0].id
    $script:keyboardPositiveControl=$false
    Scenario 'W408-ENTER-CONTROL' 'Plain Enter inserts a newline without saving; explicit native Save remains available' {
        [D408.UiDriver]::SetText($title.Handle,'D408 plain enter')
        Move-CaretToEnd $title.Handle
        Press-Key $title.Handle 13
        $text=[D408.UiDriver]::Text($title.Handle)
        $saved=@(Task-ById $parentId)
        $null=Snapshot 'plain-enter'
        $script:keyboardPositiveControl=($text -ceq "D408 plain enter`r`n" -and $saved.Count -eq 1 -and $saved[0].title -ceq 'D408 seed parent')
        return @{passed=$script:keyboardPositiveControl;input=$text;persisted=$saved}
    }
    Scenario 'W408-CTRLENTER-TITLE' 'Ctrl+Enter saves the edited task title immediately without inserting newline' {
        if(-not $script:keyboardPositiveControl){throw 'Keyboard positive control failed; this scenario cannot classify product behavior.'}
        [D408.UiDriver]::SetText($title.Handle,'D408 title shortcut saved')
        Move-CaretToEnd $title.Handle
        Press-Key $title.Handle 13 $true
        $saved=@(Task-ById $parentId)
        $text=[D408.UiDriver]::Text($title.Handle)
        $null=Snapshot 'title-ctrl-enter';Capture 'title-ctrl-enter' $main.Handle
        return @{passed=($saved.Count -eq 1 -and $saved[0].title -ceq 'D408 title shortcut saved' -and $text -ceq 'D408 title shortcut saved');input=$text;persisted=$saved}
    }
    [D408.UiDriver]::SetText($title.Handle,'D408 stable parent')
    Click-Control (Find-Control 555 'Button').Handle
    Scenario 'W408-CTRLENTER-NOTES' 'Ctrl+Enter from task notes saves the task; ordinary Enter/Shift+Enter remain multiline' {
        if(-not $script:keyboardPositiveControl){throw 'Keyboard positive control failed; this scenario cannot classify product behavior.'}
        $notes=Find-Control 608 'Edit'
        [D408.UiDriver]::SetText($notes.Handle,'D408 notes shortcut saved')
        Move-CaretToEnd $notes.Handle
        Press-Key $notes.Handle 13 $true
        $saved=@(Task-ById $parentId)
        $text=[D408.UiDriver]::Text($notes.Handle)
        $null=Snapshot 'notes-ctrl-enter';Capture 'notes-ctrl-enter' $main.Handle
        return @{passed=($saved.Count -eq 1 -and $saved[0].notes -ceq 'D408 notes shortcut saved' -and $text -ceq 'D408 notes shortcut saved');input=$text;persisted=$saved}
    }
    [D408.UiDriver]::SetText((Find-Control 608 'Edit').Handle,'D408 stable notes')
    Click-Control (Find-Control 555 'Button').Handle
    Scenario 'W408-CTRLENTER-CHILD' 'Ctrl+Enter in child input creates exactly one child and clears the draft while keeping the parent editor open' {
        if(-not $script:keyboardPositiveControl){throw 'Keyboard positive control failed; this scenario cannot classify product behavior.'}
        $quick=Find-Control 571 'Edit'
        [D408.UiDriver]::SetText($quick.Handle,'D408 shortcut child')
        Move-CaretToEnd $quick.Handle
        Press-Key $quick.Handle 13 $true
        $saved=@(Task-ById $parentId)
        $children=@($saved[0].subtasks|Where-Object {$_.title -ceq 'D408 shortcut child'})
        $text=[D408.UiDriver]::Text($quick.Handle)
        $null=Snapshot 'child-ctrl-enter';Capture 'child-ctrl-enter' $main.Handle
        return @{passed=($children.Count -eq 1 -and $text -ceq '');input=$text;children=$children;parent=$saved}
    }
    [D408.UiDriver]::SetText((Find-Control 571 'Edit').Handle,'')
    Scenario 'W408-PROJECT-SUGGESTIONS' 'Typing a partial project exposes selectable suggestions; Down/Enter chooses the candidate without saving the task' {
        $combo=Find-Control 605 'ComboBox';$edit=[D408.UiDriver]::ComboEdit($combo.Handle)
        Focus-Control $edit
        [D408.UiDriver]::Chord(65,$true,$false);[D408.UiDriver]::Chord(8,$false,$false)
        [D408.UiDriver]::TypeText('D408 Al');Start-Sleep -Milliseconds 400
        $dropped=[D408.UiDriver]::Message($combo.Handle,0x0157,0,0)
        $count=[D408.UiDriver]::Message($combo.Handle,0x0146,0,0)
        $null=Snapshot 'project-suggestions';Capture 'project-suggestions' $main.Handle
        if($dropped -eq 0){return @{passed=$false;reason='Typing did not expose a suggestion popup';dropped=$dropped;catalogCount=$count;input=[D408.UiDriver]::Text($edit)}}
        Press-Key $edit 40
        Press-Key $edit 13
        $text=[D408.UiDriver]::Text($combo.Handle);$saved=@(Task-ById $parentId)
        return @{passed=($count -gt 0 -and $text -ceq 'D408 Alpha Project' -and $saved[0].project -ceq '');selected=$text;persisted=$saved;candidateCount=$count}
    }
    # Clear only this synthetic editor's unfinished input before navigation autosave.
    [D408.UiDriver]::SetText((Find-Control 605 'ComboBox').Handle,'')
    [D408.UiDriver]::SetText((Find-Control 571 'Edit').Handle,'')
    Click-Control (Find-Control 552 'Button').Handle
    Scenario 'W408-TEMPLATE-CREATE' 'Workflow template creation uses native controls and persists its name and two steps in isolated candidate storage' {
        $entry=Find-Button '^(工作管理|原生工作区|工作区)$'
        if($entry.Count){Click-Control $entry[0].Handle}else{Press-Key $main.Handle 87 $true $true}
        $windows=Snapshot 'work-open'
        $workspace=@($windows|Where-Object {$_.Visible -and $_.ClassName -match '^Gx.*Work' -and $_.Handle -ne $main.Handle}|Select-Object -First 1)
        if(-not $workspace.Count){throw 'Known native workspace hotkey did not open a window.'}
        $nav=Find-Button '^(流程模板|流程)$'
        if(-not $nav.Count){return @{passed=$false;reason='No template/process navigation control'}}
        Click-Control $nav[0].Handle
        $windows=Snapshot 'template-page';Capture 'template-page' $workspace[0].Handle
        $create=Find-Button '^(＋\s*)?(新建模板|新建流程模板|新建)$'
        if(-not $create.Count){return @{passed=$false;reason='Process page has no enabled visible template create control';visibleButtons=@($windows|Where-Object {$_.Visible -and $_.ClassName -eq 'Button'});notice=@($windows|Where-Object {$_.Visible -and $_.ControlId -eq 4133})}}
        Click-Control $create[0].Handle
        $windows=Snapshot 'template-form'
        $forms=@($windows|Where-Object {$_.Visible -and $_.Enabled -and $_.ClassName -match '^Gx.*Form$' -and $_.Parent -eq $workspace[0].Handle})
        if($forms.Count -ne 1){throw "Expected one active native template form, found $($forms.Count)."}
        # Background controls retain their own enabled style even when their owner is
        # disabled by a modal form. Select only this form's controls, never screen order.
        $formControls=@($windows|Where-Object {$_.Parent -eq $forms[0].Handle -and $_.Visible -and $_.Enabled})
        $edits=@($formControls|Where-Object {$_.ClassName -eq 'Edit'}|Sort-Object Top,Left)
        $save=@($formControls|Where-Object {$_.ClassName -eq 'Button' -and $_.Text -match '^(保存|创建模板)$'})
        if($edits.Count -lt 2 -or -not $save.Count){return @{passed=$false;reason='Template form lacks editable name/steps and Save';editControls=$edits}}
        if($save.Count -ne 1){throw "Expected one template form Save control, found $($save.Count)."}
        [D408.UiDriver]::SetText($edits[0].Handle,'D408 UI template')
        [D408.UiDriver]::SetText($edits[-1].Handle,"First D408 step`r`nSecond D408 step")
        if([D408.UiDriver]::Text($edits[0].Handle) -cne 'D408 UI template' -or [D408.UiDriver]::Text($edits[-1].Handle) -cne "First D408 step`r`nSecond D408 step"){
            throw 'Template form input readback did not match the intended name and two steps.'
        }
        $null=Snapshot 'template-form-filled';Capture 'template-form-filled' $forms[0].Handle
        Click-Control $save[0].Handle
        $matches=@()
        foreach($file in Get-ChildItem -LiteralPath $dataRoot -File -Recurse -Filter '*.json'){
            try{$value=Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8|ConvertFrom-Json -Depth 50}catch{continue}
            foreach($match in @(Find-TemplateObject $value 'D408 UI template')){
                if(@($match.steps).Count -eq 2){$matches+=@{path=$file.FullName;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();template=$match}}
            }
        }
        $null=Snapshot 'template-saved';Capture 'template-saved' $workspace[0].Handle
        return @{passed=($matches.Count -gt 0);persistedTemplates=$matches}
    }
} catch {
    $fatalError=$_.ToString()
    Write-Output "FATAL harness/environment: $fatalError"
} finally {
    if($script:guiProcess){
        if(-not $script:guiProcess.HasExited){
            try{
                $windows=@([D408.UiDriver]::Snapshot($script:guiProcess.Id))
                Write-Json (Join-Path $evidenceRoot 'final.windows.json') $windows
                $mainWindows=@($windows|Where-Object {$_.ClassName -eq 'GxNativeModern'})
                foreach($window in $mainWindows){[D408.UiDriver]::Close($window.Handle)}
                if(-not $script:guiProcess.WaitForExit(5000)){$script:guiProcess.Kill($true);$script:guiProcess.WaitForExit()}
            }catch{if(-not $script:guiProcess.HasExited){$script:guiProcess.Kill($true);$script:guiProcess.WaitForExit()}}
        }
        if($script:guiStdout){[IO.File]::WriteAllText((Join-Path $evidenceRoot 'gui.stdout.log'),$script:guiStdout.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))}
        if($script:guiStderr){[IO.File]::WriteAllText((Join-Path $evidenceRoot 'gui.stderr.log'),$script:guiStderr.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))}
    }
    $passed=@($results|Where-Object {$_.passed}).Count
    $failed=@($results|Where-Object {-not $_.passed}).Count
    $report=[ordered]@{schemaVersion=1;suite='D4-08 external native UI contract';sourceSha=$ProductSourceSha;
        productSourceIdentityBasis='caller supplied SHA, must be bound to the build receipt by workflow';
        harnessSourceSha=$harnessHead;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;
        executable=@{path=$exePath;sha256=$executableSha};dpi=$Dpi;startedAtUtc=$startedAtUtc;completedAtUtc=[DateTime]::UtcNow.ToString('o');
        execution='GitHub Actions Windows, external real HWND/SendInput, synthetic candidate data only';
        productionAdmission=$false;executed=$results.Count;passedCount=$passed;failedCount=$failed;
        passed=($failed -eq 0 -and $results.Count -eq 8 -and -not $fatalError);fatalError=$fatalError;
        results=$results;commands=$commands;captures=$captures;
        limitations=@('These are minimum external UI reproduction cases, not full timer/feedback/work regression.','A missing feature is a product-behavior failure; driver/focus/startup errors are separately classified.','Programmatic Win32 input is not owner physical acceptance.','Original D404/D405 suites are unchanged and reported separately.')}
    Write-Json (Join-Path $evidenceRoot 'ui-report.json') $report
    Stop-Transcript | Out-Null
    $hashes=@(Get-ChildItem -LiteralPath $evidenceRoot -File -Recurse|ForEach-Object{@{path=[IO.Path]::GetRelativePath($evidenceRoot,$_.FullName);bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
    Write-Json (Join-Path $evidenceRoot 'SHA256.json') $hashes
}
if(-not $report.passed){exit 1}
exit 0
