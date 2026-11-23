import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {materializeFixture,startFixtureServer} from './fixture-server.mjs';
import {verifyResult,compareResults,compareRestart} from './compare-results.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('Protocol matrix must execute only on a GitHub Windows runner');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=process.cwd(),output=path.resolve(option('--output',path.join(process.env.RUNNER_TEMP,'c003-matrix')));
const relative=path.relative(path.resolve(process.env.RUNNER_TEMP),output);
if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Matrix evidence must be below RUNNER_TEMP');
await fs.mkdir(output,{recursive:true});
const suitePath=path.resolve('tests/protocol-vectors/suite.json'),suite=JSON.parse(await fs.readFile(suitePath,'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const summary={schema:'mytodo-c003-matrix',version:1,status:'running',startedAt:new Date().toISOString(),
 runUrl:`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
 sourceSha:process.env.GITHUB_SHA,expectedSourceSha:process.env.EXPECTED_SOURCE_SHA,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 runner:{os:process.env.RUNNER_OS,arch:process.env.RUNNER_ARCH,image:process.env.ImageOS,imageVersion:process.env.ImageVersion,node:process.version,sqlite:process.versions.sqlite},
 suiteSha256:hash(await fs.readFile(suitePath)),suiteCases:suite.cases.length,commands:[],executions:[],comparisons:[],
 receiptCoverage:{independentReceiptTable:'absent in existing production schema',deliveryLedger:'absent in existing production schema',actualPublishAckFault:'skipped; not implemented in C0-03, requires C0-07'},
 productionSourcesModified:false,downloadsAttempted:false};
let commandNumber=0;
async function command(label,exe,argv,timeout=180000) {
 const number=++commandNumber,entry={label,command:[exe,...argv],startedAt:new Date().toISOString()};
 const logs=path.join(output,'commands');await fs.mkdir(logs,{recursive:true});
 const prefix=path.join(logs,String(number).padStart(4,'0')+'-'+label.replace(/[^a-zA-Z0-9_-]/g,'_'));
 const result=await new Promise(resolve=>{
  const child=spawn(exe,argv,{cwd:root,env:process.env,windowsHide:true});let stdout='',stderr='',done=false;
  const timer=setTimeout(()=>{entry.timedOut=true;child.kill();},timeout);
  child.stdout.on('data',bytes=>{stdout+=bytes;});child.stderr.on('data',bytes=>{stderr+=bytes;});
  const finish=(code,signal,error)=>{if(done)return;done=true;clearTimeout(timer);resolve({code,signal,stdout,stderr,error});};
  child.on('error',error=>finish(null,null,String(error)));child.on('close',(code,signal)=>finish(code,signal));
 });
 await fs.writeFile(prefix+'.stdout.log',result.stdout);await fs.writeFile(prefix+'.stderr.log',result.stderr+(result.error||''));
 Object.assign(entry,{exitCode:result.code,signal:result.signal,spawnError:result.error,finishedAt:new Date().toISOString(),stdoutLog:prefix+'.stdout.log',stderrLog:prefix+'.stderr.log'});
 summary.commands.push(entry);console.log(JSON.stringify({label,exitCode:result.code,signal:result.signal}));return {...result,entry};
}
const exists=async filename=>{try{await fs.access(filename);return true;}catch{return false;}};
const read=async filename=>JSON.parse(await fs.readFile(filename,'utf8'));
let windowsExe,androidApk,androidSerial=option('--android-serial',null),androidReason;
try {
 const git=await command('git-head','git',['rev-parse','HEAD']);
 if(git.code!==0||git.stdout.trim()!==process.env.EXPECTED_SOURCE_SHA)throw Error('Checkout does not match frozen source SHA');
 const state=await command('git-preflight','git',['status','--porcelain=v1']);
 if(state.code!==0||state.stdout.trim())throw Error('Protocol checkout not pristine');
 const built=path.join(output,'build-windows','windows-protocol.exe');
 const cbuild=await command('windows-adapter-build',process.execPath,['tests/protocol-harness/build-windows-protocol.mjs',built],660000);
 if(cbuild.code===0&&await exists(built))windowsExe=built;
 const androidBuildDir=path.join(output,'build-android');
 const abuild=await command('android-adapter-build',process.execPath,['tests/protocol-harness/android/build-android.mjs','--output-dir',androidBuildDir],660000);
 const apk=path.join(androidBuildDir,'mytodo-c003-test.apk');
 if(abuild.code===0&&await exists(apk))androidApk=apk;
  summary.androidBuild={status:abuild.code===0&&androidApk?'passed':abuild.code===78?'blocked':'failed',processExitCode:abuild.code,apk:androidApk||null};
 const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME;
 const emulator=sdk&&path.join(sdk,'emulator','emulator.exe'),adb=sdk&&path.join(sdk,'platform-tools','adb.exe');
 const images=[];
 if(sdk&&await exists(path.join(sdk,'system-images'))) {
  async function walkImages(dir) {for(const entry of await fs.readdir(dir,{withFileTypes:true})){const item=path.join(dir,entry.name);if(entry.isDirectory())await walkImages(item);else if(entry.name==='system.img')images.push(item);}}
  await walkImages(path.join(sdk,'system-images'));
 }
 summary.androidEnvironment={androidHome:sdk,emulator,emulatorExists:emulator?await exists(emulator):false,adb,adbExists:adb?await exists(adb):false,systemImages:images,serial:androidSerial,status:'blocked'};
 if(!androidSerial||!images.length||!androidApk)androidReason=!images.length?'GitHub preinstalled Android SDK has no system image; real Android SQLite/WebView execution blocked; no download attempted':!androidApk?'Test APK did not build; inspect actual Android build logs':'No booted GitHub emulator serial supplied';
 else {summary.androidEnvironment.status='execution-attempted';androidReason=null;}
 await fs.writeFile(path.join(output,'android-environment.json'),JSON.stringify(summary.androidEnvironment,null,2));
 const platforms=['windows-c','javascript','android'];
 const results=new Map();
 async function execute(platform,selected,mode,{sample,suiteFile=suitePath,resolvedSuite=suite,fixtureUrl,tag='' }={}) {
  const id=[selected.id,mode,platform,tag].filter(Boolean).join('--'),directory=path.join(output,'cases',id);
  await fs.mkdir(directory,{recursive:true});const outfile=path.join(directory,'result.json'),db=path.join(directory,'db');
  let result,run;
  if(platform==='windows-c'&&!windowsExe||platform==='android'&&androidReason) {
   result={schema:'mytodo-protocol-harness-result',version:1,platform,caseId:selected.id,mode,status:platform==='windows-c'?'failed':'blocked',error:platform==='windows-c'?'Windows adapter failed to compile; no native execution':androidReason};
   await fs.writeFile(outfile,JSON.stringify(result,null,2));
  } else {
   const inputFile=path.join(directory,'input.json');if(sample)await fs.writeFile(inputFile,JSON.stringify(sample,null,2));
   const common=[mode,'--suite',suiteFile,'--case',selected.id,'--db-dir',db,'--output',outfile];
   if(sample)common.push('--input',inputFile);if(fixtureUrl)common.push('--fixture-url',fixtureUrl);
   if(platform==='windows-c')run=await command(id,windowsExe,common);
   else if(platform==='javascript')run=await command(id,process.execPath,['tests/protocol-harness/js-harness.mjs',...common]);
   else {
    await fs.writeFile(inputFile,JSON.stringify({suite:resolvedSuite,caseId:selected.id,mode,sample,fixtureUrl,provenance:{sourceSha:summary.sourceSha}}));
    run=await command(id,process.execPath,['tests/protocol-harness/android/run-android.mjs','--apk',androidApk,'--serial',androidSerial,'--input',inputFile,'--output',outfile,'--db-case',id.slice(0,80)],660000);
   }
   try{result=await read(outfile);}catch(error){result={platform,caseId:selected.id,mode,status:'failed',error:'Adapter emitted no valid result: '+String(error)};await fs.writeFile(outfile,JSON.stringify(result,null,2));}
   // A process exit must agree with its report. Never turn a crashed child green.
   const expectedCode=result.status==='passed'?0:result.status==='blocked'?(platform==='windows-c'?2:78):1;
   if(run.code!==expectedCode){result.status='failed';result.error='Actual child exit '+run.code+' contradicts report status/expected exit '+expectedCode;}
  }
  const verification=verifyResult(result,selected,suite.defaults);
  let restartVerification;
  if(result.reopened&&platform!=='android') {
   const reopenedFile=path.join(directory,'process-restart.json');
   const reportArgs=['report','--suite',suiteFile,'--case',selected.id,'--db-dir',db,'--output',reopenedFile];
   const report=await command(id+'-process-restart',platform==='windows-c'?windowsExe:process.execPath,platform==='windows-c'?reportArgs:['tests/protocol-harness/js-harness.mjs',...reportArgs]);
   try{const restarted=await read(reopenedFile);restartVerification=compareRestart(result,restarted);if(report.code!==0)restartVerification.status='failed';}
   catch(error){restartVerification={status:'failed',error:String(error)};}
  }
  const status=verification.status==='failed'||restartVerification?.status==='failed'?'failed':verification.status;
  const receipt={id,caseId:selected.id,category:selected.category,expectationMode:selected.expectationMode,mode,platform,sourcePlatform:tag||null,status,executionStatus:result.status,
    processExitCode:run?.code??null,processSignal:run?.signal??null,output:outfile,outputSha256:hash(await fs.readFile(outfile)),verification,restartVerification};
  summary.executions.push(receipt);await fs.writeFile(path.join(directory,'verification.json'),JSON.stringify(receipt,null,2));
  result.status=status;
  return {result,receipt};
 }
 for(const selected of suite.cases) {
  const generated=new Map();
  for(const platform of platforms){const value=await execute(platform,selected,'generate');generated.set(platform,value);results.set(selected.id+'-gen-'+platform,value);}
  for(const other of ['windows-c','android'])summary.comparisons.push({caseId:selected.id,mode:'generate',left:other,right:'javascript',...compareResults(generated.get(other).result,generated.get('javascript').result)});
  for(const source of platforms) {
   const sample=generated.get(source).result;
   if(!sample.wire||generated.get(source).receipt.status!=='passed') {
    for(const target of platforms)summary.comparisons.push({caseId:selected.id,mode:'receive',source,target,status:sample.status==='blocked'?'blocked':'skipped',reason:'Producer did not pass actual execution/persistence; sample remains archived without treating dependent receivers as executed'});
    continue;
   }
   let resolved={suite,suiteFile:suitePath},server;
   try {
    if(selected.fixturePlan){resolved=await materializeFixture({suite,caseId:selected.id,sample,directory:path.join(output,'fixtures',selected.id+'--'+source)});server=await startFixtureServer({directory:resolved.directory});}
    const received=new Map();
    for(const target of platforms)received.set(target,await execute(target,selected,'receive',{sample,suiteFile:resolved.suiteFile,resolvedSuite:resolved.suite,fixtureUrl:server?.origin,tag:source}));
    for(const other of ['windows-c','android'])summary.comparisons.push({caseId:selected.id,mode:'receive',source,left:other,right:'javascript',...compareResults(received.get(other).result,received.get('javascript').result)});
   }catch(error){summary.comparisons.push({caseId:selected.id,mode:'receive',source,status:'failed',reason:'Physical fixture/driver error: '+String(error.stack||error)});}
   finally{if(server)await server.close();}
  }
  await fs.writeFile(path.join(output,'summary.partial.json'),JSON.stringify(summary,null,2));
 }
 const post=await command('git-post','git',['diff','--exit-code']);summary.productionSourceDiffExit=post.code;
 summary.status=summary.androidBuild.status==='failed'||summary.executions.some(x=>x.status==='failed')||summary.comparisons.some(x=>x.status==='failed')||post.code!==0?'failed':summary.executions.some(x=>x.status==='blocked')||summary.comparisons.some(x=>x.status==='blocked')?'blocked':'passed';
}catch(error){summary.status='failed';summary.driverError=String(error.stack||error);}
finally {
 summary.finishedAt=new Date().toISOString();summary.exitCode=summary.status==='passed'?0:summary.status==='blocked'?78:1;
 const count=rows=>Object.fromEntries(['passed','failed','blocked','skipped','static-reviewed'].map(status=>[status,rows.filter(row=>row.status===status).length]));
 summary.executionCounts=count(summary.executions);summary.comparisonCounts=count(summary.comparisons);
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
 const payload=[];async function collect(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())await collect(full);else {const bytes=await fs.readFile(full);payload.push({path:path.relative(output,full).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});}}}
 await collect(output);await fs.writeFile(path.join(output,'payload-sha256.json'),JSON.stringify(payload,null,2));
 console.log(JSON.stringify({status:summary.status,sourceSha:summary.sourceSha,executionCounts:summary.executionCounts,comparisonCounts:summary.comparisonCounts,exitCode:summary.exitCode,output}));process.exitCode=summary.exitCode;
}
