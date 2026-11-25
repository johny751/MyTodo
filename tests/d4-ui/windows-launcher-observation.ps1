param(
  [Parameter(Mandatory=$true)][ValidateSet('extract','inventory','cleanup','preview')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string]$ProfilePath,
  [string]$ExpectedExecutable,
  [string]$ExpectedRawUrl,
  [string]$NotBefore
)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:D4_PREVIEW_CI_INSPECT -cne '1') {
  throw 'Only explicitly opted-in hosted Windows Actions observation is authorized'
}
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Emit($value) { ConvertTo-Json -InputObject $value -Depth 15 -Compress }
function Digest([string]$file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }

if ($Mode -eq 'extract') {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (!(Test-Path -LiteralPath $OutputPath -PathType Container) -or @(Get-ChildItem -LiteralPath $OutputPath -Force).Count -ne 0) {
    throw 'Extraction destination must already exist and be empty'
  }
  $expected=@('mytodo-d4-01-demo.html','open-mytodo-demo.bat','README.md','build-receipt.json','browser-results.json','synthetic-final-state.json','OFL.txt','COPYRIGHT.txt','open-isolated-preview.cmd','SHA256SUMS.txt')
  $zip=[IO.Compression.ZipFile]::OpenRead($InputPath)
  try {
    if ($zip.Entries.Count -ne $expected.Count) { throw 'Unexpected archive entry count' }
    $names=@($zip.Entries | ForEach-Object { $_.FullName })
    if (@($names | Select-Object -Unique).Count -ne $expected.Count) { throw 'Duplicate archive entry' }
    foreach ($entry in $zip.Entries) {
      if ($expected -cnotcontains $entry.FullName -or $entry.Length -gt 134217728) { throw 'Unexpected or oversized archive entry' }
    }
    $rows=@(foreach ($entry in $zip.Entries) {
      $destination=Join-Path $OutputPath $entry.FullName
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)
      [pscustomobject]@{file=$entry.FullName;bytes=(Get-Item -LiteralPath $destination).Length;sha256=(Digest $destination)}
    })
    Emit $rows
  } finally { $zip.Dispose() }
  exit 0
}

if ($Mode -eq 'preview') {
  Add-Type -AssemblyName System.Drawing
  $original=[Drawing.Image]::FromFile($InputPath)
  try {
    $scale=[Math]::Min(1.0,960.0/[Math]::Max($original.Width,$original.Height))
    $width=[Math]::Max(1,[int][Math]::Floor($original.Width*$scale))
    $height=[Math]::Max(1,[int][Math]::Floor($original.Height*$scale))
    $small=New-Object Drawing.Bitmap($width,$height)
    try {
      $graphics=[Drawing.Graphics]::FromImage($small)
      try { $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $graphics.DrawImage($original,0,0,$width,$height) }
      finally { $graphics.Dispose() }
      $codec=[Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
      $parameters=New-Object Drawing.Imaging.EncoderParameters(1)
      try {
        foreach ($quality in @(80,65,50,35,20)) {
          if ($parameters.Param[0]) { $parameters.Param[0].Dispose() }
          $parameters.Param[0]=New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality,[long]$quality)
          $small.Save($OutputPath,$codec,$parameters)
          if ((Get-Item -LiteralPath $OutputPath).Length -le 204800) { break }
        }
      } finally { $parameters.Dispose() }
      if ((Get-Item -LiteralPath $OutputPath).Length -gt 204800) { throw 'Preview exceeds the 200 KiB evidence limit' }
      Emit ([pscustomobject]@{
        original=[pscustomobject]@{width=$original.Width;height=$original.Height;bytes=(Get-Item -LiteralPath $InputPath).Length;sha256=(Digest $InputPath)}
        preview=[pscustomobject]@{width=$width;height=$height;bytes=(Get-Item -LiteralPath $OutputPath).Length;sha256=(Digest $OutputPath);originalPixelsPerX=($original.Width/[double]$width);originalPixelsPerY=($original.Height/[double]$height)}
      })
    } finally { $small.Dispose() }
  } finally { $original.Dispose() }
  exit 0
}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class D4LauncherWindows {
  [DllImport("shell32.dll",SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)]string value,out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect rect);
  public static string[] Arguments(string value) {
    int count; IntPtr memory=CommandLineToArgvW(value,out count);
    if(memory==IntPtr.Zero) throw new InvalidOperationException("Cannot parse observed command line");
    try { var result=new List<string>();for(int i=0;i<count;i++)result.Add(Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory,i*IntPtr.Size)));return result.ToArray(); }
    finally { LocalFree(memory); }
  }
}
'@
if (!$ProfilePath -or !$ExpectedExecutable -or !$ExpectedRawUrl -or !$NotBefore) { throw 'Missing exact ownership identity' }
$earliest=[DateTime]::Parse($NotBefore).ToUniversalTime()
function Row($process) {
  [pscustomobject]@{pid=[int]$process.ProcessId;parentPid=[int]$process.ParentProcessId;executable=$process.ExecutablePath;createdAt=$process.CreationDate.ToUniversalTime().ToString('o');commandLine=$process.CommandLine;sessionId=[int]$process.SessionId}
}
function OwnedSnapshot {
  $all=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'")
  $roots=@(foreach ($process in $all) {
    if ($process.ExecutablePath -ine $ExpectedExecutable -or !$process.CommandLine -or $process.CreationDate.ToUniversalTime() -lt $earliest) { continue }
    $argv=[D4LauncherWindows]::Arguments($process.CommandLine)
    if ($argv -ccontains ('--user-data-dir='+$ProfilePath) -and $argv -ccontains ('--app='+$ExpectedRawUrl) -and
        @($argv | Where-Object { $_ -like '--type=*' }).Count -eq 0) { $process }
  })
  if ($roots.Count -gt 1) { throw 'Multiple browser roots claim this unique profile and URL' }
  $processes=@()
  $root=$null
  if ($roots.Count -eq 1) {
    $main=$roots[0]; $processes=@((Row $main)); $known=@([int]$main.ProcessId)
    for ($level=0;$level -lt 12;$level++) {
      $children=@($all | Where-Object { $known -contains [int]$_.ParentProcessId -and $known -notcontains [int]$_.ProcessId -and $_.ExecutablePath -ieq $ExpectedExecutable -and $_.CreationDate.ToUniversalTime() -ge $main.CreationDate.ToUniversalTime() })
      if ($children.Count -eq 0) { break }
      foreach ($child in $children) { $known+=([int]$child.ProcessId);$processes+=(Row $child) }
    }
    $live=Get-Process -Id $main.ProcessId -ErrorAction SilentlyContinue
    if ($live) {
      $handle=$live.MainWindowHandle
      $rect=New-Object D4LauncherWindows+Rect
      $gotRect=[D4LauncherWindows]::GetWindowRect($handle,[ref]$rect)
      $desktop=[pscustomobject]@{left=[D4LauncherWindows]::GetSystemMetrics(76);top=[D4LauncherWindows]::GetSystemMetrics(77);width=[D4LauncherWindows]::GetSystemMetrics(78);height=[D4LauncherWindows]::GetSystemMetrics(79)}
      $intersects=$gotRect -and [Math]::Min($rect.Right,$desktop.left+$desktop.width) -gt [Math]::Max($rect.Left,$desktop.left) -and [Math]::Min($rect.Bottom,$desktop.top+$desktop.height) -gt [Math]::Max($rect.Top,$desktop.top)
      $root=Row $main
      $root | Add-Member -NotePropertyName arguments -NotePropertyValue ([D4LauncherWindows]::Arguments($main.CommandLine))
      $root | Add-Member -NotePropertyName productVersion -NotePropertyValue ([Diagnostics.FileVersionInfo]::GetVersionInfo($main.ExecutablePath).ProductVersion)
      $root | Add-Member -NotePropertyName window -NotePropertyValue ([pscustomobject]@{handle=$handle.ToInt64();title=$live.MainWindowTitle;visible=[D4LauncherWindows]::IsWindowVisible($handle);minimized=[D4LauncherWindows]::IsIconic($handle);rectAvailable=$gotRect;left=$rect.Left;top=$rect.Top;right=$rect.Right;bottom=$rect.Bottom;desktop=$desktop;intersectsDesktop=$intersects})
    }
  }
  [pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');controller=[pscustomobject]@{pid=$PID;sessionId=(Get-Process -Id $PID).SessionId;interactive=[Environment]::UserInteractive};root=$root;processes=@($processes)}
}
if ($Mode -eq 'inventory') { Emit (OwnedSnapshot);exit 0 }

# Read the exact prior ownership snapshot and include currently observed descendants.
# Recheck executable and creation identity immediately before stopping every PID.
$prior=Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json
$current=OwnedSnapshot
$records=@($prior.processes)+@($current.processes)
$byIdentity=@{}
foreach ($record in $records) {
  if ($record -and $record.executable -ieq $ExpectedExecutable -and [DateTime]::Parse($record.createdAt).ToUniversalTime() -ge $earliest) {
    $byIdentity[([string]$record.pid)+'/'+$record.createdAt]=$record
  }
}
$steps=@()
if ($current.root) {
  # The exact current root was selected by executable, creation time, unique
  # profile and file URL. Recheck its creation identity before native tree stop.
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$current.root.pid)
  if ($live -and $live.ExecutablePath -ieq $current.root.executable -and $live.CreationDate.ToUniversalTime().ToString('o') -ceq $current.root.createdAt) {
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=Join-Path $env:SystemRoot 'System32/taskkill.exe'
    $start.Arguments='/PID '+$current.root.pid+' /T /F'
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $tree=[Diagnostics.Process]::Start($start)
    try {
      $treeOut=$tree.StandardOutput.ReadToEndAsync();$treeError=$tree.StandardError.ReadToEndAsync()
      if (!$tree.WaitForExit(10000)) { $tree.Kill();throw 'Owned taskkill request timed out' }
      $steps+=([pscustomobject]@{pid=$current.root.pid;status='requested-owned-tree-stop';exitCode=$tree.ExitCode;stdout=$treeOut.Result;stderr=$treeError.Result;createdAt=$current.root.createdAt})
    } finally { $tree.Dispose() }
  } elseif (!$live) { $steps+=([pscustomobject]@{pid=$current.root.pid;status='already-exited'}) }
  else { $steps+=([pscustomobject]@{pid=$current.root.pid;status='identity-changed-not-stopped'}) }
}
# A prior snapshot also covers descendants if the browser exited before cleanup.
foreach ($record in @($byIdentity.Values | Sort-Object { [DateTime]::Parse($_.createdAt) } -Descending)) {
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
  if (!$live) { $steps+=([pscustomobject]@{pid=$record.pid;status='already-exited'});continue }
  if ($live.ExecutablePath -ine $record.executable -or $live.CreationDate.ToUniversalTime().ToString('o') -cne $record.createdAt) {
    $steps+=([pscustomobject]@{pid=$record.pid;status='identity-changed-not-stopped'});continue
  }
  try {
    Stop-Process -Id $record.pid -Force -ErrorAction Stop
    $steps+=([pscustomobject]@{pid=$record.pid;status='stopped-owned-identity';createdAt=$record.createdAt})
  } catch {
    $race=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
    if (!$race) { $steps+=([pscustomobject]@{pid=$record.pid;status='already-exited'}) }
    elseif ($race.ExecutablePath -ine $record.executable -or $race.CreationDate.ToUniversalTime().ToString('o') -cne $record.createdAt) { $steps+=([pscustomobject]@{pid=$record.pid;status='identity-changed-not-stopped'}) }
    else { throw }
  }
}
Start-Sleep -Milliseconds 500
$remaining=@()
foreach ($record in $byIdentity.Values) {
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
  if ($live -and $live.ExecutablePath -ieq $record.executable -and $live.CreationDate.ToUniversalTime().ToString('o') -ceq $record.createdAt) { $remaining+=(Row $live) }
}
$after=OwnedSnapshot
# Detect survivors that appeared after a snapshot. Detection never authorizes
# killing an unrecorded identity, and any such survivor blocks profile removal.
$knownPids=@($byIdentity.Values | ForEach-Object { [int]$_.pid })
$survivors=@()
$allAfter=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.ExecutablePath -ieq $ExpectedExecutable -and $_.CreationDate.ToUniversalTime() -ge $earliest })
for ($level=0;$level -lt 12;$level++) {
  $added=$false
  foreach ($process in $allAfter) {
    if (@($survivors | Where-Object { $_.pid -eq [int]$process.ProcessId }).Count -gt 0) { continue }
    $argv=if ($process.CommandLine) { [D4LauncherWindows]::Arguments($process.CommandLine) } else { @() }
    if ($knownPids -contains [int]$process.ParentProcessId -or $argv -ccontains ('--user-data-dir='+$ProfilePath)) {
      $survivors+=(Row $process);$knownPids+=([int]$process.ProcessId);$added=$true
    }
  }
  if (!$added) { break }
}
Emit ([pscustomobject]@{before=$current;steps=@($steps);remaining=@($remaining);unresolvedSurvivors=@($survivors);after=$after;passed=($remaining.Count -eq 0 -and $survivors.Count -eq 0 -and !$after.root -and @($steps | Where-Object {$_.status -eq 'identity-changed-not-stopped'}).Count -eq 0)})
