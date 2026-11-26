import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const e=process.env;
assert.equal(e.GITHUB_ACTIONS,'true','Cloud-only native regression');
assert.equal(process.platform,'win32');
assert.match(e.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA,'Workflow binds exact source SHA');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),e.GITHUB_SHA);
assert.match(e.GITHUB_RUN_ID??'',/^\d+$/);assert.match(e.GITHUB_RUN_ATTEMPT??'',/^\d+$/);
const [binary,destination]=process.argv.slice(2);assert.ok(binary&&destination,'Usage: run-native.mjs executable new-evidence-directory');
const exe=await fs.realpath(binary),root=path.resolve(destination),runner=await fs.realpath(e.RUNNER_TEMP);
assert.equal(path.dirname(root).toLowerCase(),runner.toLowerCase());assert.match(path.basename(root),/^d4-[a-z0-9-]+$/);
await fs.mkdir(root);const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const startedAtUtc=new Date().toISOString(),executableHash=sha(await fs.readFile(exe)),suites=[],errors=[];
const run=(name,args)=>new Promise(resolve=>{const started=new Date().toISOString();execFile(exe,args,{windowsHide:false,timeout:180000,maxBuffer:16*1024*1024,encoding:'utf8'},async(error,stdout,stderr)=>{
 const receipt={name,arguments:args,startedAtUtc:started,completedAtUtc:new Date().toISOString(),exitCode:typeof error?.code==='number'?error.code:error?null:0,error:error?String(error):null,killed:!!error?.killed};
 await fs.writeFile(path.join(root,`${name}.stdout.log`),stdout??'');await fs.writeFile(path.join(root,`${name}.stderr.log`),stderr??'');await fs.writeFile(path.join(root,`${name}.command.json`),JSON.stringify(receipt,null,2)+'\n');resolve(receipt);
 });});
for(const dpi of [96,144]){
 const data=path.join(root,`data-${dpi}`),render=path.join(root,`render-${dpi}`);await fs.mkdir(data);await fs.mkdir(render);
 const command=await run(`native-${dpi}`,['--data-dir',data,'--d408-regression','--d408-render',render,'--visual-dpi',String(dpi)]);
 try{const report=JSON.parse(await fs.readFile(path.join(render,'d408-report.json'),'utf8'));assert.equal(report.sourceSha,e.GITHUB_SHA);assert.equal(report.dpi,dpi);assert.equal(report.candidateIdentity,'D4-08');assert.equal(report.productionAdmission,false);assert.deepEqual(report.suites.map(s=>s.name).sort(),['boundary','feedback','keyboard','timer','work']);
  for(const s of report.suites){const checks=report.checks.filter(c=>c.suite===s.name);assert.equal(s.executed,checks.length);assert.equal(s.passedCount,checks.filter(c=>c.passed===true).length);assert.equal(s.failedCount,s.executed-s.passedCount);suites.push({...s,dpi,processExitCode:command.exitCode,reportPath:`render-${dpi}/d408-report.json`,passed:s.passed===true&&command.exitCode===0});}
 }catch(error){errors.push({dpi,error:String(error),command});}
}
// Keep native original PNGs. CI-only preview conversion produces small model-readable evidence.
const previewScript=path.resolve('tests/d4-08/windows/make-previews.ps1');
const previews=await new Promise(resolve=>execFile('pwsh',['-NoProfile','-File',previewScript,'-Directory',root],{windowsHide:true,encoding:'utf8',timeout:60000},(error,stdout,stderr)=>resolve({exitCode:typeof error?.code==='number'?error.code:error?null:0,stdout,stderr,error:error?String(error):null})));
await fs.writeFile(path.join(root,'previews.stdout.log'),previews.stdout??'');await fs.writeFile(path.join(root,'previews.stderr.log'),previews.stderr??'');if(previews.exitCode!==0)errors.push({previewError:previews});
const report={schemaVersion:1,suite:'D4-08 native candidate',sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,candidateIdentity:'D4-08',resourceVersion:'0.9.2',executable:{path:exe,sha256:executableHash},startedAtUtc,completedAtUtc:new Date().toISOString(),productionAdmission:false,realDataAccess:false,execution:'GitHub Actions Windows synthetic isolated directories',suites,errors,passed:suites.length===10&&suites.every(s=>s.passed)&&errors.length===0,limitations:['These are separate timer, feedback, work, keyboard and boundary suites at each DPI.','External SendInput UI reproduction is reported separately.','Original nine D404 suites remain a separate executable and report.','Cloud synthetic HWND execution is not owner physical acceptance.','Timer recovery after reboot pauses at last durable checkpoint when monotonic continuity cannot be proved.']};
await fs.writeFile(path.join(root,'native-report.json'),JSON.stringify(report,null,2)+'\n');
const files=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()){const bytes=await fs.readFile(file);files.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}await walk(root);await fs.writeFile(path.join(root,'SHA256.json'),JSON.stringify(files,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
