import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 evidence tooling only runs on GitHub');
const [mode,directory,extra]=process.argv.slice(2),sourceSha=process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA;
const sha=b=>createHash('sha256').update(b).digest('hex'),identity={sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT};
function confined(value){const base=path.resolve(process.env.RUNNER_TEMP||''),target=path.resolve(value||''),rel=path.relative(base,target);if(!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Evidence path outside RUNNER_TEMP');return target;}
async function writeNew(file,value){const h=await fs.open(file,'wx');try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}}
async function walk(directory){const files=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const item=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Symbolic links are not permitted in C007 evidence');if(entry.isDirectory())files.push(...await walk(item));else if(entry.isFile())files.push(item);}return files.sort();}
async function describe(file,root){const bytes=await fs.readFile(file);return {path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)};}
function matching(value){return Object.entries(identity).every(([key,v])=>v&&value[key]===v);}
const root=confined(directory);
if(mode==='start'){
 await fs.mkdir(root,{recursive:false});
 const receipt={schema:'mytodo-c007-source',version:1,...identity,platform:extra,status:'failed',startedAt:new Date().toISOString(),sources:[],runtime:{node:process.version,sqlite:process.versions.sqlite,runnerOs:process.env.RUNNER_OS,image:process.env.ImageOS,imageVersion:process.env.ImageVersion}};
 try{
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||head!==sourceSha||process.env.GITHUB_SHA!==head)throw Error('Frozen checkout SHA mismatch');
  const required=['tests/c006/c006-harness/fixture-server.mjs','.github/workflows/c0-07-fault-recovery.yml','src/sqlite-store.mjs','src/replica.mjs','src/delta-sync.mjs','windows/database.c','windows/sync.c','android/src/local/gxtodo/replica/ReplicaDatabase.java','android/src/local/gxtodo/replica/AccountStore.java','tests/protocol-harness/windows-protocol.c','tests/protocol-harness/js-harness.mjs','tests/protocol-harness/build-windows-protocol.mjs','scripts/ci/c004-android-emulator.mjs'];
  for(const directory of ['tests/fault-harness','tests/protocol-harness/android'])for(const file of await walk(directory))required.push(file);
  for(const file of [...new Set(required)].sort())receipt.sources.push(await describe(path.resolve(file),process.cwd()));
  receipt.fixtureDependency={path:'tests/c006/c006-harness/fixture-server.mjs',sameCheckout:true};receipt.status='recorded';
 }catch(error){receipt.error=String(error.stack||error);}
 await writeNew(path.join(root,'source.json'),receipt);process.exitCode=receipt.status==='recorded'?0:1;
}else if(mode==='seal'){
 await fs.mkdir(root,{recursive:true});
 const seal={schema:'mytodo-c007-seal',version:1,...identity,platform:extra,status:'failed',finishedAt:new Date().toISOString(),files:[],sourceUnchanged:false};
 try{
  const source=JSON.parse(await fs.readFile(path.join(root,'source.json'),'utf8'));
  if(!matching(source)||source.platform!==extra||source.status!=='recorded')throw Error('Missing or failed exact-source receipt');
  for(const entry of source.sources){const observed=await describe(path.resolve(entry.path),process.cwd());if(observed.bytes!==entry.bytes||observed.sha256!==entry.sha256)throw Error('Original source changed during execution: '+entry.path);}
  seal.sourceUnchanged=true;
  for(const file of await walk(root))if(path.basename(file)!=='seal.json')seal.files.push(await describe(file,root));
  seal.status='sealed';
 }catch(error){seal.error=String(error.stack||error);for(const file of await walk(root))if(path.basename(file)!=='seal.json')seal.files.push(await describe(file,root));}
 await writeNew(path.join(root,'seal.json'),seal);process.exitCode=seal.status==='sealed'?0:1;
}else if(mode==='report'){
 const output=confined(extra);await fs.mkdir(output,{recursive:false});
 const report={schema:'mytodo-c007-report',version:1,...identity,status:'failed',platforms:[],errors:[]};
 const expectedCases=['sql-atomicity','C007-batch-rejected','C007-batch-response-lost','C007-manifest-rejected','C007-manifest-response-lost','C007-ack-delete-failed','C007-ack-meta-failed','C007-ack-commit-failed','C007-after-ack-commit-exit','C007-before-ack-commit-exit'];
 for(const platform of ['javascript','windows-c','android']){
  const result={platform,status:'failed',cases:[]};report.platforms.push(result);
  try{
   const artifact=path.join(root,'c007-'+platform+'-'+identity.runId+'-'+identity.runAttempt),seal=JSON.parse(await fs.readFile(path.join(artifact,'seal.json'),'utf8'));
   if(!matching(seal)||seal.platform!==platform||seal.status!=='sealed'||!seal.sourceUnchanged)throw Error('Incomplete exact-source seal for '+platform);
   for(const item of seal.files){const local=path.resolve(artifact,...item.path.split('/')),rel=path.relative(artifact,local);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Invalid artifact index path');const observed=await describe(local,artifact);if(observed.bytes!==item.bytes||observed.sha256!==item.sha256)throw Error('Evidence hash mismatch: '+item.path);}
   const suite=JSON.parse(await fs.readFile(path.join(artifact,'suite/suite.json'),'utf8'));
   if(suite.sourceSha!==sourceSha||suite.platform!==platform)throw Error('Real platform suite identity differs');
   result.suiteStatus=suite.status;result.suiteExitCode=suite.exitCode;
   const cases=suite.cases?.map(c=>c.caseId)||[];
   if(cases.length!==expectedCases.length||new Set(cases).size!==cases.length||expectedCases.some(id=>!cases.includes(id)))throw Error('Missing or duplicate C007 scenarios');
   for(const entry of suite.cases){
    const outcome={caseId:entry.caseId,status:'failed'};result.cases.push(outcome);
    try{
     const summary=JSON.parse(await fs.readFile(path.join(artifact,'suite',entry.caseId,'summary.json'),'utf8'));
     const expectedAttempts=entry.caseId==='sql-atomicity'?(platform==='windows-c'?31:platform==='javascript'?11:10):5;
     Object.assign(outcome,{attempts:summary.attempts?.length,checks:summary.checks?.length,failedChecks:summary.checks?.filter(c=>c.passed!==true)||[],error:summary.error||null});
     const passed=entry.status==='passed'&&entry.exitCode===0&&summary.sourceSha===sourceSha&&summary.platform===platform&&summary.status==='passed'&&summary.exitCode===0&&summary.attempts?.length===expectedAttempts&&summary.checks?.length>0&&summary.checks.every(c=>c.passed===true);
     if(!passed)throw Error('Case receipt is incomplete or failed');
     for(const attempt of summary.attempts){if(!summary.checks.some(c=>c.id===attempt.id+':same-db-restart'&&c.passed)||!summary.checks.some(c=>c.id===attempt.id+':database-preserved'&&c.passed))throw Error('No same-database restart evidence: '+attempt.id);}
     outcome.status='passed';
    }catch(error){outcome.error=outcome.error||String(error.stack||error);}
   }
   result.status=suite.status==='passed'&&suite.exitCode===0&&result.cases.every(c=>c.status==='passed')?'passed':'failed';
  }catch(error){result.error=String(error.stack||error);report.errors.push({platform,error:result.error});}
 }
 report.status=report.platforms.length===3&&report.platforms.every(p=>p.status==='passed')?'passed':'failed';report.exitCode=report.status==='passed'?0:1;
 await writeNew(path.join(output,'report.json'),report);await fs.writeFile(path.join(output,'report.md'),'# C0-07 actual execution\n\nSource: `'+sourceSha+'`\n\nStatus: **'+report.status+'**\n\n'+report.platforms.map(p=>'- '+p.platform+': '+p.status+(p.error?' — '+p.error.split('\n')[0]:'')).join('\n')+'\n',{flag:'wx'});
 const reportSealPath=path.join(output,'seal.json'),reportSeal={schema:'mytodo-c007-report-seal',version:1,...identity,status:'sealed',finishedAt:new Date().toISOString(),reportStatus:report.status,reportExitCode:report.exitCode,files:[]};
 for(const file of await walk(output))if(file!==reportSealPath)reportSeal.files.push(await describe(file,output));
 await writeNew(reportSealPath,reportSeal);process.exitCode=report.exitCode;
}else throw Error('Use start, seal or report');
