// No local runnable packaging. Every accepted suite binds this same HTML hash.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const e=process.env,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),[app,features,services,work,out]=process.argv.slice(2).map(x=>path.resolve(x)),temp=path.resolve(e.RUNNER_TEMP||'');
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA);assert.match(e.GITHUB_SHA||'',/^[a-f0-9]{40}$/);assert.match(e.GITHUB_RUN_ID||'',/^\d+$/);assert.match(e.GITHUB_RUN_ATTEMPT||'',/^\d+$/);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),e.GITHUB_SHA);
assert.equal(process.argv.slice(2).length,5);
for(const dir of [app,features,services,work,out]){assert.equal(typeof dir,'string');assert.equal(path.dirname(dir),temp);assert.ok(path.basename(dir).startsWith('d4-'));}
assert.equal(new Set([app,features,services,work,out]).size,5);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const htmlName='mytodo-d4-01-demo.html',html=await fs.readFile(path.join(app,htmlName)),htmlHash=sha(html),build=await json(path.join(app,'build-receipt.json')),legacy=await json(path.join(app,'browser-results.json')),binding=await json(path.join(app,'d408-legacy-artifact-binding.json')),feature=await json(path.join(features,'d408-web-results.json')),service=await json(path.join(services,'d408-web-results.json')),workReport=await json(path.join(work,'d408-web-results.json'));
function identity(record,shaField,attemptField){assert.equal(record[shaField],e.GITHUB_SHA);assert.equal(record.runId,e.GITHUB_RUN_ID);assert.equal(String(record[attemptField]),e.GITHUB_RUN_ATTEMPT);assert.equal(record.status,'passed');}
assert.equal(build.sourceSha,e.GITHUB_SHA);assert.equal(build.runId,e.GITHUB_RUN_ID);assert.equal(build.runAttempt,e.GITHUB_RUN_ATTEMPT);assert.equal(build.artifact.sha256,htmlHash);assert.equal(build.artifact.bytes,html.length);assert.ok(build.d408Composition);assert.equal(build.d408Composition.productionAdmission,false);assert.equal(build.d408Composition.storageKey,'mytodo-d408-v2-isolated-v1');
identity(legacy,'sourceSHA','runAttempt');identity(binding,'sourceSHA','runAttempt');assert.equal(legacy.checks.length,164);assert.equal(legacy.passed,164);assert.equal(legacy.failed,0);assert.ok(legacy.checks.every(c=>c.status==='passed'));assert.equal(binding.htmlSha256Before,htmlHash);assert.equal(binding.htmlSha256After,htmlHash);assert.equal(binding.reportSha256,sha(await fs.readFile(path.join(app,'browser-results.json'))));assert.equal(binding.runnerPath,'tests/d4-ui/run-browser.mjs');assert.equal(binding.runnerSha256,sha(await fs.readFile(path.join(root,binding.runnerPath))));
for(const license of ['ofl','copyright'])assert.equal(sha(await fs.readFile(path.join(app,build.fontLicense[license].file))),build.fontLicense[license].sha256);
for(const [report,ids,kind] of [[feature,['T1','T2','T3','T4','F1','F2','F3','F4','F5','F6','F7','F8','F9','N1','N2','N3','N4','N5','K1','K2','K3'],'d408-web-independent-real-browser'],[service,['S1','S2','S3'],'d408-mounted-v2-service-independent-browser'],[workReport,['W01','W02'],'d408-work-preservation-independent-browser']]){identity(report,'suiteSourceSHA','attempt');assert.equal(report.appSourceSHA,e.GITHUB_SHA);assert.equal(report.kind,kind);assert.equal(report.htmlSha256,htmlHash);assert.deepEqual(report.counts,{planned:ids.length,executed:ids.length,passed:ids.length,failed:0,notExecuted:0});assert.equal(report.infrastructureErrors.length,0);assert.deepEqual(report.cases.map(c=>c.id).sort(),ids.slice().sort());assert.ok(report.cases.every(c=>c.status==='passed'));}
await fs.mkdir(out);const files=[];
async function write(name,bytes){await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});files.push(name);}
async function copy(from,to){await write(to,await fs.readFile(from));}
await write(htmlName,html);await copy(path.join(app,'build-receipt.json'),'build-receipt.json');await copy(path.join(app,'browser-results.json'),'legacy-164-results.json');await copy(path.join(app,'d408-legacy-artifact-binding.json'),'legacy-artifact-binding.json');await copy(path.join(features,'d408-web-results.json'),'feature-21-results.json');await copy(path.join(services,'d408-web-results.json'),'service-3-results.json');await copy(path.join(app,'OFL.txt'),'OFL.txt');await copy(path.join(app,'COPYRIGHT.txt'),'COPYRIGHT.txt');
await copy(path.join(root,'tests/d4-08/WEB-SERVICE-README.md'),'SERVICE-BOUNDARY.md');
await copy(path.join(work,'d408-web-results.json'),'work-2-results.json');
const launcher=await fs.readFile(path.join(root,'prototypes/d4-03-platforms/windows/open-isolated-preview.cmd'),'utf8');assert.equal(launcher.split('mytodo-d4-03-demo.html').length,3);await write('open-isolated-preview.cmd',launcher.replaceAll('mytodo-d4-03-demo.html',htmlName));
const readme=`# MyTodo D4-08 Web 隔离候选

解压后在 Windows 运行 open-isolated-preview.cmd，使用已安装的 Edge/Chrome 独立浏览器配置打开；也可直接打开 ${htmlName}。无需本地编译，字体和页面资源已内嵌。此包是 Web 页面，不是 Win32 原生程序。

四象限、个人工具和工作管理合成体验使用 mytodo-d4-03-demo-v1。设置页的“现有模型隔离工作区”由用户主动打开，使用独立键 mytodo-d408-v2-isolated-v1，并通过现有 V2 service 保存项目、任务、子任务和便签。两个空间分别保存；浏览器配置或文件位置变化可能导致看不到此前数据，请先导出各空间需要保留的内容。反馈图片保留原始内容，保存失败时保留编辑器并支持重试。浏览器限制 localStorage 时不得把内存提示当作持久成功。

同一 HTML SHA-256：${htmlHash}
源码：${e.GITHUB_SHA}
Actions run：${e.GITHUB_RUN_ID}，attempt：${e.GITHUB_RUN_ATTEMPT}

四套报告独立列示：旧浏览器回归 164/164；D4-08 新 Web 功能 21/21；实际挂载的隔离 V2 service 3/3；工作关系和模板保全专项 2/2。各套报告分别列出数量，不合并通过率。旧 runner 外部绑定记录证明测试前后 HTML 哈希一致；三套新 runner 各自记录同一 HTML 哈希，打包门禁核对精确 case ID。完整原始截图、输入轨迹、存储快照、控制台与 Actions 日志另随本次 CI 证据归档保留。

仅使用隔离合成数据。没有生产数据库迁移、真实用户数据、生产同步、LAN/WebDAV 或 D2 接入。服务面板证明浏览器专用存储链；旧 SQLite 服务测试是另一条证据链。Android 原生生命周期、系统导航与 Win32 能力以各自报告为准。D4 和 issue #1 的生产阻断未解除。

SIL OFL 1.1 字体许可与版权见 OFL.txt、COPYRIGHT.txt。候选验收不能视为生产准入或签名升级批准。
`;
await write('README.md',readme);
const manifest={kind:'d408-web-candidate-package-content',sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,htmlSha256:htmlHash,storageKeys:['mytodo-d4-03-demo-v1','mytodo-d408-v2-isolated-v1'],suites:[{name:'legacy',passed:164,planned:164},{name:'features',passed:21,planned:21},{name:'mounted-service',passed:3,planned:3},{name:'work-preservation',passed:2,planned:2}],productionAdmission:false,files:[]};
for(const file of files){const b=await fs.readFile(path.join(out,file));manifest.files.push({file,bytes:b.length,sha256:sha(b)});}
await write('MANIFEST.json',JSON.stringify(manifest,null,2)+'\n');
const sums=[];for(const file of files)sums.push(sha(await fs.readFile(path.join(out,file)))+'  '+file);await write('SHA256SUMS.txt',sums.join('\n')+'\n');
const expected=[];for(const file of files){const b=await fs.readFile(path.join(out,file));expected.push({file,bytes:b.length,sha256:sha(b)});}
const archive='Web-D408-Candidate.zip',options={cwd:out,windowsHide:true,maxBuffer:128*1024*1024};let observed;
if(process.platform==='win32'){
 const powershell=path.join(e.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const helper=String.raw`param([string]$PackageRoot,[string]$FilesBase64)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$names=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($FilesBase64)))
$archive=Join-Path $PackageRoot 'Web-D408-Candidate.zip'
$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try {foreach($name in $names){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $PackageRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}} finally {$zip.Dispose()}
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {$rows=@(foreach($entry in $zip.Entries){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try {[pscustomobject]@{file=$entry.FullName;bytes=$entry.Length;sha256=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}} finally {$hash.Dispose();$stream.Dispose()}});ConvertTo-Json -InputObject $rows -Compress} finally {$zip.Dispose()}
`;
 const helperFile=path.join(temp,'d4-web-package-'+e.GITHUB_RUN_ID+'-'+e.GITHUB_RUN_ATTEMPT+'.ps1');await fs.writeFile(helperFile,helper,{flag:'wx'});
 observed=JSON.parse(execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helperFile,'-PackageRoot',out,'-FilesBase64',Buffer.from(JSON.stringify(files)).toString('base64')],{...options,encoding:'utf8'}).replace(/^\uFEFF/,''));
}else{
 execFileSync('zip',['-q',archive,...files],options);const names=execFileSync('unzip',['-Z1',archive],{...options,encoding:'utf8'}).trimEnd().split(/\r?\n/);
 observed=names.map(file=>{assert.ok(files.includes(file));const bytes=execFileSync('unzip',['-p',archive,file],options);return {file,bytes:bytes.length,sha256:sha(bytes)};});
}
assert.equal(observed.length,expected.length);assert.equal(new Set(observed.map(x=>x.file)).size,expected.length);for(const wanted of expected)assert.deepEqual(observed.find(x=>x.file===wanted.file),wanted);
const archiveBytes=await fs.readFile(path.join(out,archive));assert.equal(archiveBytes.readUInt32LE(0),0x04034b50);
const receipt={kind:'d408-verified-web-candidate-archive',status:'packaged-and-read-back',sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,htmlSha256:htmlHash,archive:{file:archive,bytes:archiveBytes.length,sha256:sha(archiveBytes)},files:expected,verification:{sameHTMLAcrossFourSuites:true,suiteCount:4,exactFileList:true,everyMemberReadBack:true,everyMemberHashMatched:true},suites:manifest.suites,productionAdmission:false};
await fs.writeFile(path.join(out,'package-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
