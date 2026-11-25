import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir=path.resolve(process.argv[2]||''),env=process.env;
if(env.GITHUB_ACTIONS!=='true'||env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||path.dirname(dir)!==path.resolve(env.RUNNER_TEMP)||!path.basename(dir).startsWith('d4-'))throw Error('Only cloud synthetic artifact packaging authorized');
const report=JSON.parse(await fs.readFile(path.join(dir,'browser-results.json'),'utf8'));
if(report.status!=='passed'||report.sourceSHA!==env.GITHUB_SHA||report.runId!==env.GITHUB_RUN_ID||report.runAttempt!==env.GITHUB_RUN_ATTEMPT)throw Error('Exact source/run/attempt UI acceptance required');
const receipt=JSON.parse(await fs.readFile(path.join(dir,'build-receipt.json'),'utf8'));
const html='mytodo-d4-01-demo.html',archive='mytodo-d4-experience.zip';
if(receipt.sourceSha!==env.GITHUB_SHA||receipt.runId!==env.GITHUB_RUN_ID||receipt.runAttempt!==env.GITHUB_RUN_ATTEMPT||receipt.artifact.file!==html)throw Error('Exact build source/run/attempt and shipped filename required');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=await fs.readFile(path.join(dir,html));
if(bytes.length!==receipt.artifact.bytes||sha256(bytes)!==receipt.artifact.sha256)throw Error('Accepted artifact identity mismatch');
await fs.writeFile(path.join(dir,'open-mytodo-demo.bat'),'@echo off\r\nstart "" "%~dp0mytodo-d4-01-demo.html"\r\n',{flag:'wx'});
await fs.writeFile(path.join(dir,'README.md'),'# MyTodo D4-03 隔离体验版\n\nWindows 解压全部文件后，运行 open-isolated-preview.cmd，以已安装的 Edge/Chrome 独立浏览器配置打开。也可双击 mytodo-d4-01-demo.html，或运行 open-mytodo-demo.bat 使用默认浏览器。无需本地编译、无需安装依赖；页面资源已内嵌。\n\n20 个页面通过左侧导航访问；手机默认四象限，支持左边缘右滑、放大、拖动和完整任务菜单。任务、子任务、项目、事项、流程、往来、归档和统计操作使用合成数据。提醒显示于应用内提醒中心。\n\n保存仅使用 mytodo-d4-03-demo-v1 专用演示空间；浏览器限制 file:// 保存时退回当前会话内存。设置页可导出合成修改或重置示例。\n\n这是隔离整合候选。Windows 使用浏览器页面，未替换原 Win32；Android 隔离 APK 另行提供。本包浏览器检查通过不能代表 Android 或完整三端验收。原生后台和生产存储整合尚待验证。Android issue #1 保持开放。\n\n验证源码：'+env.GITHUB_SHA+'\nActions：https://github.com/johny751/MyTodo/actions/runs/'+env.GITHUB_RUN_ID+'\nattempt：'+env.GITHUB_RUN_ATTEMPT+'\n',{flag:'wx'});
const files=[html,'open-mytodo-demo.bat','README.md','build-receipt.json','browser-results.json','synthetic-final-state.json'];
await fs.copyFile('prototypes/d4-01/fonts/OFL.txt',path.join(dir,'OFL.txt'));
files.push('OFL.txt','COPYRIGHT.txt');
// The shared platform template also ships with Android's d4-03 HTML. Adapt only this browser package.
const launcherTemplate=await fs.readFile('prototypes/d4-03-platforms/windows/open-isolated-preview.cmd','utf8');
if(launcherTemplate.split('mytodo-d4-03-demo.html').length!==3)throw Error('Unexpected shared launcher filename contract');
await fs.writeFile(path.join(dir,'open-isolated-preview.cmd'),launcherTemplate.replaceAll('mytodo-d4-03-demo.html',html),{flag:'wx'});
files.push('open-isolated-preview.cmd');
const launcher=await fs.readFile(path.join(dir,'open-isolated-preview.cmd'),'utf8');
const launchTargets=[...launcher.matchAll(/^set "D4_PREVIEW_HTML=%~dp0([^"\r\n]+)"\r?$/gm)].map(match=>match[1]);
if(launchTargets.length!==1||launchTargets[0]!==html||!files.includes(launchTargets[0]))throw Error('Windows isolated launcher must target the exact shipped HTML');
const hashes=[];
for(const file of files){const b=await fs.readFile(path.join(dir,file));hashes.push(sha256(b)+'  '+file);}
await fs.writeFile(path.join(dir,'SHA256SUMS.txt'),hashes.join('\n')+'\n',{flag:'wx'});
files.push('SHA256SUMS.txt');
const expected=[];
for(const file of files){const b=await fs.readFile(path.join(dir,file));expected.push({file,bytes:b.length,sha256:sha256(b)});}
const commandOptions={cwd:dir,windowsHide:true,maxBuffer:128*1024*1024};
let observed;
if(process.platform==='win32'){
 // The hosted PATH may resolve GNU tar; -a does not select ZIP there. Use an explicit ZIP API.
 const powershell=path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const script=`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=$env.D4_PACKAGE_ROOT
$names=@(ConvertFrom-Json -InputObject $env.D4_PACKAGE_FILES)
$archive=Join-Path $root 'mytodo-d4-experience.zip'
$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try { foreach($name in $names) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $root $name),$name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null } }
finally { $zip.Dispose() }
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
 $rows=@(foreach($entry in $zip.Entries) {
  $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
  try { $digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant();[pscustomobject]@{file=$entry.FullName;bytes=$entry.Length;sha256=$digest} }
  finally { $sha.Dispose();$stream.Dispose() }
 })
 ConvertTo-Json -InputObject $rows -Compress
} finally { $zip.Dispose() }
`;
 observed=JSON.parse(execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{...commandOptions,env:{...env,D4_PACKAGE_ROOT:dir,D4_PACKAGE_FILES:JSON.stringify(files)},encoding:'utf8'}).replace(/^\uFEFF/,''));
}else{
 execFileSync('zip',['-q',archive,...files],commandOptions);
 const names=execFileSync('unzip',['-Z1',archive],{...commandOptions,encoding:'utf8'}).trimEnd().split(/\r?\n/);
 observed=names.map(file=>{if(!files.includes(file))throw Error('Unexpected ZIP entry '+file);const b=execFileSync('unzip',['-p',archive,file],commandOptions);return {file,bytes:b.length,sha256:sha256(b)};});
}
const archiveBytes=await fs.readFile(path.join(dir,archive));
if(archiveBytes.length<22||archiveBytes.readUInt32LE(0)!==0x04034b50)throw Error('Experience archive is not ZIP');
if(!Array.isArray(observed)||observed.length!==expected.length||new Set(observed.map(row=>row.file)).size!==expected.length)throw Error('ZIP entry count or uniqueness mismatch');
for(const item of expected){const actual=observed.find(row=>row.file===item.file);if(!actual||actual.bytes!==item.bytes||actual.sha256!==item.sha256)throw Error('ZIP entry bytes differ from accepted artifact '+item.file);}
const packageReceipt={kind:'d4-03-verified-experience-archive',status:'packaged-and-read-back',sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,platform:process.platform,format:'zip',archive:{file:archive,bytes:archiveBytes.length,sha256:sha256(archiveBytes)},files:expected,verification:{exactFileList:true,uniqueEntries:true,everyEntryReadBack:true,everyEntrySHA256Matched:true,launcherTarget:html,launcherExecuted:false},scope:'Accepted browser artifact packaging only; not original Win32 or Android acceptance'};
await fs.writeFile(path.join(dir,'package-receipt.json'),JSON.stringify(packageReceipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:packageReceipt.status,sourceSHA:env.GITHUB_SHA,checks:report.checks.length,run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,archive:packageReceipt.archive}));
