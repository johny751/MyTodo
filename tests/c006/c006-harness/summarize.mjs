import fs from 'node:fs/promises';
import path from 'node:path';
import {cloudOnly,confined,sha} from './fixture-server.mjs';
cloudOnly();
const input=confined(process.argv[2]),output=confined(process.argv[3]),sourceSha=process.env.EXPECTED_SOURCE_SHA;
if(!/^[0-9a-f]{40}$/.test(sourceSha||''))throw Error('Expected exact source SHA missing');
await fs.mkdir(output,{recursive:true});
const run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
const locations=[['javascript',`c006-js-${run}-${attempt}/summary.json`],['windows-native',`c006-native-${run}-${attempt}/cases/summary.json`],['android',`c006-android-${run}-${attempt}/cases/summary.json`]];
const report={schema:'mytodo-c006-acceptance',version:1,sourceSha,runId:run,runAttempt:attempt,status:'failed',platforms:[],errors:[],
 limitations:['Native forced-termination recovery is not claimed by its current suite','Android runs real operation/restart/retry with fixed database; internal-boundary force-stop cases require the dedicated controller','Counts describe executed harness rows; scope is stated by each source suite, not all possible platform cross-products']};
async function verifySeal(artifact){
 const root=path.join(input,artifact),manifest=JSON.parse(await fs.readFile(path.join(root,'sha256.json'),'utf8'));
 if(!Array.isArray(manifest)||!manifest.length)throw Error('Artifact SHA256 manifest is absent or empty');
 const expected=new Map();
 for(const entry of manifest){
  if(typeof entry.path!=='string'||!entry.path||entry.path.includes('\\')||entry.path.startsWith('/')||entry.path.split('/').some(part=>!part||part==='.'||part==='..')||entry.path==='sha256.json'||expected.has(entry.path)||!/^[0-9a-f]{64}$/.test(entry.sha256||'')||!Number.isSafeInteger(entry.bytes)||entry.bytes<0)throw Error('Invalid or duplicate artifact manifest entry');
  expected.set(entry.path,entry);
 }
 const actual=[];
 async function walk(directory,prefix=''){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   const name=prefix+entry.name,absolute=path.join(directory,entry.name);
   if(entry.isSymbolicLink())throw Error('Artifact contains a symbolic link');
   if(entry.isDirectory()){await walk(absolute,name+'/');continue;}
   if(!entry.isFile())throw Error('Artifact contains unsupported file type');
   if(name==='sha256.json')continue;
   const record=expected.get(name),bytes=await fs.readFile(absolute);
   if(!record||record.bytes!==bytes.length||record.sha256!==sha(bytes))throw Error('Artifact file is unlisted or changed: '+name);
   actual.push(name);
  }
 }
 await walk(root);if(actual.length!==expected.size)throw Error('Artifact manifest lists missing files');
 const receipt=JSON.parse(await fs.readFile(path.join(root,'evidence-seal.json'),'utf8'));
 if(receipt.sourceSha!==sourceSha||receipt.runId!==run||receipt.runAttempt!==attempt)throw Error('Evidence seal belongs to another source or workflow attempt');
 return {artifact,files:actual.length,manifestSha256:sha(await fs.readFile(path.join(root,'sha256.json')))};
}
report.evidenceSeals=[];
for(const artifact of [...locations.map(([,relative])=>relative.split('/')[0]),`c006-android-environment-${run}-${attempt}`]){
 try{report.evidenceSeals.push(await verifySeal(artifact));}catch(error){report.errors.push(artifact+' seal: '+String(error?.message||error));}
}
for(const [platform,relative] of locations){
 try{
  const bytes=await fs.readFile(path.join(input,relative)),summary=JSON.parse(bytes);
  if(summary.sourceSha!==sourceSha)throw Error('Source SHA differs');
  if(!Number.isInteger(summary.executed)||summary.executed<=0||summary.passed+summary.failed!==summary.executed)throw Error('Execution accounting is invalid');
  const cases=summary.results||summary.cases;if(!Array.isArray(cases)||cases.length!==summary.executed||cases.some(row=>!['passed','failed'].includes(row.status)))throw Error('Case result inventory is incomplete');
  if(cases.filter(row=>row.status==='passed').length!==summary.passed||cases.filter(row=>row.status==='failed').length!==summary.failed)throw Error('Reported counts differ from actual rows');
  report.platforms.push({platform,path:relative,sha256:sha(bytes),executed:summary.executed,passed:summary.passed,failed:summary.failed,cases});
  if(summary.failed)report.errors.push(platform+' has '+summary.failed+' failed case rows');
 }catch(error){report.errors.push(platform+': '+String(error?.message||error));}
}
try{
 const environment=JSON.parse(await fs.readFile(path.join(input,`c006-android-environment-${run}-${attempt}/environment.json`),'utf8'));
 if(environment.status!=='ready'||environment.sourceSha!==sourceSha||environment.runId!==run||environment.runAttempt!==attempt)throw Error('Runtime receipt is not ready or belongs to another run');
 report.androidRuntime={serial:environment.serial,image:environment.image,runtime:environment.runtime};
}catch(error){report.errors.push('Android environment: '+String(error?.message||error));}
report.executed=report.platforms.reduce((sum,item)=>sum+item.executed,0);report.passed=report.platforms.reduce((sum,item)=>sum+item.passed,0);report.failed=report.platforms.reduce((sum,item)=>sum+item.failed,0);
report.status=report.errors.length?'failed':'passed';report.createdAt=new Date().toISOString();
await fs.writeFile(path.join(output,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# C0-06 actual execution report','','Source: `'+sourceSha+'`. Run: '+run+'/'+attempt+'.','','Status: **'+report.status+'**.','','| Platform | Executed | Passed | Failed |','|---|---:|---:|---:|',...report.platforms.map(p=>`| ${p.platform} | ${p.executed} | ${p.passed} | ${p.failed} |`),'',...report.errors.map(error=>'- '+error),'','Coverage limits:','',...report.limitations.map(item=>'- '+item),''];
await fs.writeFile(path.join(output,'acceptance.md'),lines.join('\n'));process.stdout.write(JSON.stringify({status:report.status,executed:report.executed,passed:report.passed,failed:report.failed,errors:report.errors})+'\n');process.exitCode=report.errors.length?1:0;
