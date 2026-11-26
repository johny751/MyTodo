param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or -not $IsWindows){throw 'Actions Windows only'}
Add-Type -AssemblyName System.Drawing
$root=(Resolve-Path -LiteralPath $Directory).Path
$records=@()
foreach($file in Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {$_.Extension -in @('.png','.bmp')}){
 $original=[Drawing.Image]::FromFile($file.FullName)
 try{
  $scale=[Math]::Min(1.0,960.0/[Math]::Max($original.Width,$original.Height))
  $width=[Math]::Max(1,[int]($original.Width*$scale));$height=[Math]::Max(1,[int]($original.Height*$scale))
  $thumb=[Drawing.Bitmap]::new($width,$height);$graphics=[Drawing.Graphics]::FromImage($thumb)
  try{$graphics.DrawImage($original,0,0,$width,$height);$preview=$file.FullName+'.preview.jpg';$thumb.Save($preview,[Drawing.Imaging.ImageFormat]::Jpeg)}finally{$graphics.Dispose();$thumb.Dispose()}
  $records+=@{original=[IO.Path]::GetRelativePath($root,$file.FullName);preview=[IO.Path]::GetRelativePath($root,$preview);width=$original.Width;height=$original.Height;previewWidth=$width;previewHeight=$height;previewToOriginalX=$original.Width/[double]$width;previewToOriginalY=$original.Height/[double]$height;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
 }finally{$original.Dispose()}
}
[IO.File]::WriteAllText((Join-Path $root 'screenshots.json'),(ConvertTo-Json -InputObject @($records) -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
Write-Output "Created $($records.Count) previews"
