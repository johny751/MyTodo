import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const e=process.env;
if(e.GITHUB_ACTIONS!=='true'||process.platform!=='win32'||!e.RUNNER_TEMP||
 !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA??'')||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||
 !/^\d+$/.test(e.GITHUB_RUN_ID??'')||!/^\d+$/.test(e.GITHUB_RUN_ATTEMPT??'')||
 execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim()!==e.GITHUB_SHA)throw Error('Exact Windows Actions source/run identity required');
const args=process.argv.slice(2);
if(args.length!==2||args.some(arg=>!arg))throw Error('Usage: node tests/d4-native/package-windows.mjs <build-directory> <evidence-directory>');
const temp=await fs.realpath(e.RUNNER_TEMP),dirs=[];
for(const arg of args){
 const requested=path.resolve(arg),stat=await fs.lstat(requested),dir=await fs.realpath(requested);
 if(!stat.isDirectory()||stat.isSymbolicLink()||path.dirname(dir).toLowerCase()!==temp.toLowerCase()||
    !/^d4-[a-z0-9-]+$/i.test(path.basename(dir)))throw Error('Only real direct d4-* RUNNER_TEMP directories');
 dirs.push(dir);
}
const [build,evidence]=dirs;
if(build.toLowerCase()===evidence.toLowerCase())throw Error('Build and evidence directories must differ');
const reportBytes=await fs.readFile(path.join(evidence,'native-regression.json'));
const report=JSON.parse(reportBytes.toString('utf8'));
const suiteIds=['workspace-96','workspace-144','legacy-self-test','legacy-advanced','legacy-catalog','legacy-detail','legacy-repaint','legacy-drag','legacy-feedback'];
const guardIds=['bare-executable-rejected','existing-unmarked-database-rejected','invalid-marker-rejected','fresh-empty-directory-admitted','matching-marker-admitted','marker-bound-to-original-root','duplicate-directory-rejected','remote-sync-command-rejected','external-config-command-rejected','linked-directory-rejected'];
const exactPassedSet=(records,ids)=>Array.isArray(records)&&records.length===ids.length&&
 new Set(records.map(record=>record?.id)).size===ids.length&&
 records.every(record=>ids.includes(record?.id)&&record.passed===true&&record.killed===false&&record.signal===null);
if(report.schema!==1||report.suite!=='D4-04 native candidate'||report.executedOn!=='GitHub Actions windows runner'||
 report.productionAdmission!==false||report.passed!==true||report.sourceSha!==e.GITHUB_SHA||
 report.runId!==e.GITHUB_RUN_ID||report.runAttempt!==e.GITHUB_RUN_ATTEMPT||
 !Number.isFinite(Date.parse(report.startedAtUtc))||!Number.isFinite(Date.parse(report.completedAtUtc))||
 Date.parse(report.completedAtUtc)<Date.parse(report.startedAtUtc)||
 !exactPassedSet(report.suites,suiteIds)||!exactPassedSet(report.startupGuards,guardIds)||
 report.suites.some(s=>s.exitCode!==0||s.error!==null||!Array.isArray(s.failLines)||s.failLines.length!==0||
   (s.id.startsWith('workspace-')&&(!Number.isInteger(s.checks)||s.checks<=0)))||
 report.startupGuards.some(g=>g.expectedExitCode!==(g.id==='fresh-empty-directory-admitted'||g.id==='matching-marker-admitted'?0:64)||g.exitCode!==g.expectedExitCode))throw Error('Complete successful native evidence from this exact source/run is required before packaging');
const exe='MyTodo-Native-Candidate.exe',bytes=await fs.readFile(path.join(build,exe));
const sha256=createHash('sha256').update(bytes).digest('hex');
if(report.executable?.name!==exe||sha256!==report.executable?.sha256)throw Error('Tested executable differs');
const quote=v=>"'"+v.replace(/'/g,"''")+"'";
const nativeResource=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',
 '(Get-Item -LiteralPath '+quote(path.join(build,exe))+').VersionInfo | Select-Object FileVersion,ProductVersion | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
if(nativeResource.FileVersion!=='0.9.2'||nativeResource.ProductVersion!=='0.9.2')throw Error('Preserved native resource version differs');
const metadata={sourceSHA:e.GITHUB_SHA,acceptedSource:'9fe8824754af4e8b541f3550e677564183fa7c1f',runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,
 kind:'Actual Win32 native candidate',nativeResource,executable:{file:exe,bytes:bytes.length,sha256},packagedAtUtc:new Date().toISOString(),
 regressionEvidence:{file:'native-regression.json',sha256:createHash('sha256').update(reportBytes).digest('hex'),
  suites:report.suites.map(s=>({id:s.id,passed:s.passed,checks:s.checks})),startupGuardCount:report.startupGuards.length,completedAtUtc:report.completedAtUtc},
 productionAdmission:false,browserRequired:false,database:'Existing native SQLite with explicit isolated candidate directory only',
 limitations:['Independent work items, process, contacts and native pomodoro persistence require model admission.','No production sync or signing/upgrade approval.','Synthetic Actions verification only.']};
await fs.writeFile(path.join(build,'native-build-identity.json'),JSON.stringify(metadata,null,2)+'\n');
await fs.writeFile(path.join(build,'Start-Native-Candidate.cmd'),'@echo off\r\nsetlocal\r\n"%~dp0MyTodo-Native-Candidate.exe" --data-dir "%~dp0candidate-data"\r\n');
await fs.copyFile('docs/d4-04-native-integration.md',path.join(build,'README-native.md'));
await fs.copyFile('docs/d4-04-model-admission-proposal.md',path.join(build,'MODEL-ADMISSION.md'));
const members=[exe,'Start-Native-Candidate.cmd','native-build-identity.json','README-native.md','MODEL-ADMISSION.md'];
const sums=[];for(const name of members)sums.push(createHash('sha256').update(await fs.readFile(path.join(build,name))).digest('hex')+'  '+name);
await fs.writeFile(path.join(build,'SHA256SUMS.txt'),sums.join('\n')+'\n');members.push('SHA256SUMS.txt');
execFileSync('powershell.exe',['-NoProfile','-Command','Compress-Archive -LiteralPath '+members.map(m=>quote(path.join(build,m))).join(',')+' -DestinationPath '+quote(path.join(build,'MyTodo-Win32-Native-Candidate.zip'))],{windowsHide:true});
console.log(JSON.stringify(metadata));
