// Package only a same-run EXE already validated by both frozen and new native UI suites.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const e=process.env;
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(process.platform,'win32');
assert.equal(e.GITHUB_REF,'refs/heads/d4/d4-09-design-candidate-1');
assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),e.GITHUB_SHA);
const build=fs.realpathSync(process.argv[2]),temp=fs.realpathSync(e.RUNNER_TEMP);
assert.equal(path.dirname(build).toLowerCase(),temp.toLowerCase());assert.equal(path.basename(build),'d4-08-build');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const exe=path.join(build,'MyTodo-D408-Candidate.exe'),exeBytes=fs.readFileSync(exe),exeHash=hash(exeBytes);
const receipt=read(exe+'.build.json'),retainedPackage=read(path.join(build,'package-receipt.json'));
for(const value of [receipt,retainedPackage]){
  assert.equal(value.sourceSha,e.GITHUB_SHA);assert.equal(value.runId,e.GITHUB_RUN_ID);assert.equal(value.runAttempt,e.GITHUB_RUN_ATTEMPT);
  assert.equal(value.productionAdmission,false);assert.equal(value.candidateIdentity,'D4-08');assert.equal(value.resourceVersion,'0.9.2');
}
assert.equal(receipt.uiDesignStage,'D4-09');assert.equal(receipt.uiBaselineSHA,'7c217d8779ccf21e13733b28868e015e9cfd693a');
assert.equal(receipt.executable.sha256,exeHash);assert.equal(receipt.executable.bytes,exeBytes.length);
assert.equal(retainedPackage.passed,true);assert.equal(retainedPackage.readback.passed,true);
assert.equal(retainedPackage.retainedRegression.executableSha256,exeHash);
assert.equal(retainedPackage.retainedRegression.suites,9);assert.equal(retainedPackage.retainedRegression.startupGuards,10);
const originalZip=path.join(build,retainedPackage.archive.file);assert.equal(hash(fs.readFileSync(originalZip)),retainedPackage.archive.sha256);
const expected=read('tests/d4-09/windows/native-expected.json');
const expectedIds=Array.isArray(expected)?expected.map(x=>typeof x==='string'?x:x.id):expected.caseIds;
assert.ok(Array.isArray(expectedIds)&&expectedIds.length>0);assert.equal(new Set(expectedIds).size,expectedIds.length);
const reports=[];
for(const dpi of [96,144]){
  const file=path.join(temp,'d4-09-ui-'+dpi,'ui-report.json'),r=read(file);
  assert.equal(r.sourceSha,e.GITHUB_SHA);assert.equal(r.runId,e.GITHUB_RUN_ID);assert.equal(r.runAttempt,e.GITHUB_RUN_ATTEMPT);
  assert.equal(r.harnessSourceSha,e.GITHUB_SHA);assert.equal(r.productionAdmission,false);
  assert.equal(r.executable.sha256,exeHash);assert.equal(r.dpi,dpi);assert.equal(r.passed,true);assert.equal(r.fatalError,null);
  assert.equal(r.executed,expectedIds.length);assert.equal(r.passedCount,expectedIds.length);assert.equal(r.failedCount,0);
  assert.deepEqual(r.results.map(x=>x.id).sort(),expectedIds.slice().sort());
  assert.ok(r.results.every(x=>x.executed===true&&x.passed===true&&x.error===null));
  reports.push({file,report:r});
}
const timerReports=[];
for(const dpi of [96,144]){
  const directory=path.join(temp,'d4-09-timer-history-'+dpi),file=path.join(directory,'timer-history-ui-report.json');
  assert.ok(fs.existsSync(file),`missing timer history report ${dpi}`);
  const r=read(file);
  assert.equal(r.sourceSha,e.GITHUB_SHA);assert.equal(r.runId,e.GITHUB_RUN_ID);assert.equal(r.runAttempt,e.GITHUB_RUN_ATTEMPT);
  assert.equal(r.harnessSourceSha,e.GITHUB_SHA);assert.equal(r.productionAdmission,false);assert.equal(r.dpi,dpi);
  assert.equal(r.passed,true);assert.equal(r.fatalError,null);assert.equal(r.executed,10);assert.equal(r.passedCount,10);assert.equal(r.failedCount,0);
  assert.ok(r.results.every(x=>x.executed===true&&x.passed===true&&x.error===null));
  timerReports.push({dpi,directory,file,report:r});
}
const destination=path.join(build,'MyTodo-D409-Windows-Candidate');assert.ok(!fs.existsSync(destination));fs.mkdirSync(destination);
fs.copyFileSync(exe,path.join(destination,'MyTodo-D409-Candidate.exe'));
fs.copyFileSync(exe+'.build.json',path.join(destination,'build-receipt.json'));
fs.copyFileSync(path.join(build,'package-receipt.json'),path.join(destination,'frozen-regression-package-receipt.json'));
for(const value of reports)fs.copyFileSync(value.file,path.join(destination,'ui-report-'+value.report.dpi+'.json'));
for(const value of timerReports){
  fs.copyFileSync(value.file,path.join(destination,'timer-history-ui-report-'+value.dpi+'.json'));
  fs.cpSync(path.join(value.directory,'screenshots'),path.join(destination,'timer-history-'+value.dpi+'-screenshots'),{recursive:true});
}
fs.copyFileSync(path.join(temp,'d4-08-native-evidence','native-report.json'),path.join(destination,'retained-d408-native-report.json'));
fs.copyFileSync(path.join(temp,'d4-08-retained-evidence','native-regression.json'),path.join(destination,'retained-d404-native-report.json'));
fs.writeFileSync(path.join(destination,'Start-D409-Candidate.cmd'),'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0MyTodo-D409-Candidate.exe" --data-dir "%~dp0D409-Candidate-Data"\r\nif errorlevel 1 pause\r\n','ascii');
fs.writeFileSync(path.join(destination,'README.md'),`# MyTodo D4-09 Windows 原生 UI 候选\n\n双击 Start-D409-Candidate.cmd 打开真实 Win32 EXE。隔离数据保存在同目录 D409-Candidate-Data，原有启动守卫继续拒绝默认应用数据和未标记旧数据库。\n\nUI阶段：D4-09。兼容业务容器身份：D4-08。继承PE资源版本：0.9.2；二者为保留原数据及测试合同，不代表本次源码没有更新。\n\nSource SHA: ${e.GITHUB_SHA}\nActions: ${e.GITHUB_RUN_ID} / attempt ${e.GITHUB_RUN_ATTEMPT}\n构建时间：${receipt.buildCompletedAtUtc} (UTC)\nEXE SHA256: ${exeHash}\n\n工作管理、计时和相关原生呈现依据已验证三端设计改造。所有原入口、SQLite路径、独立工作/计时存储和原业务操作继续保留。新设计回归与原D408及D404回归分别列报告。96/144是应用缩放检查；实际系统DPI和输入方式以原始报告为准，不冒充物理设备人工验收。\n\n这是隔离候选。联系人、跟进、归档人工状态未明确。未批准生产数据模型/Schema迁移、远端同步、LAN/WebDAV、稳定签名、用户旧版本覆盖升级；issue #1和原生产BLOCKER保持。\n`);
const entries=fs.readdirSync(destination).sort().map(file=>{const data=fs.readFileSync(path.join(destination,file));return {path:file,bytes:data.length,sha256:hash(data)};});
const identity={sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,uiDesignStage:'D4-09',candidateIdentity:'D4-08',productionAdmission:false,executableSha256:exeHash};
fs.writeFileSync(path.join(destination,'SHA256.json'),JSON.stringify({...identity,entries},null,2)+'\n');
const zip=path.join(build,'MyTodo-D409-Windows-Candidate.zip');execFileSync('tar',['-a','-cf',zip,'-C',build,path.basename(destination)],{stdio:'pipe',windowsHide:true});
const prefix=path.basename(destination)+'/',expectedMembers=[...entries.map(x=>prefix+x.path),prefix+'SHA256.json'].sort();
const members=execFileSync('tar',['-tf',zip],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).filter(Boolean);
assert.equal(new Set(members).size,members.length);assert.deepEqual(members.filter(x=>!x.endsWith('/')).sort(),expectedMembers);
const readback=path.join(temp,'d4-09-package-readback');fs.mkdirSync(readback);execFileSync('tar',['-xf',zip,'-C',readback],{windowsHide:true,stdio:'pipe'});
for(const member of expectedMembers){const actual=path.join(readback,...member.split('/'));assert.ok(fs.lstatSync(actual).isFile());assert.equal(hash(fs.readFileSync(actual)),hash(fs.readFileSync(path.join(build,...member.split('/')))),member);}
fs.writeFileSync(path.join(build,'d409-package-receipt.json'),JSON.stringify({...identity,passed:true,archive:{file:path.basename(zip),bytes:fs.statSync(zip).size,sha256:hash(fs.readFileSync(zip))},entries,readback:{passed:true,members:expectedMembers},newUiCasesPerDpi:expectedIds.length,timerHistoryCasesPerDpi:10,timerHistoryReports:timerReports.map(x=>({dpi:x.dpi,sha256:hash(fs.readFileSync(x.file))})),retainedPackageSha256:hash(fs.readFileSync(path.join(build,'package-receipt.json')))},null,2)+'\n');
console.log(JSON.stringify({passed:true,archive:zip,sourceSha:e.GITHUB_SHA,newUiCasesPerDpi:expectedIds.length}));
