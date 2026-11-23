import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {captureRemoteFile} from '../../protocol-harness/android/remote-file-evidence.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 Android worker requires GitHub Actions');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
function confined(value){const root=path.resolve(process.env.RUNNER_TEMP||''),target=path.resolve(value||''),rel=path.relative(root,target);if(!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('C007 paths must be below RUNNER_TEMP');return target;}
const input=confined(args.request),output=confined(args.output),spec=JSON.parse(await fs.readFile(input,'utf8'));
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME,serial=args.serial,apk=confined(args.apk);
if(!sdk||!/^emulator-[0-9]+$/.test(serial||''))throw Error('GitHub cloud emulator and preinstalled SDK are required');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),pkg='local.gxtodo.protocolharness',component=pkg+'/local.gxtodo.replica.ProtocolHarnessInstrumentation';
if(!/^[A-Za-z0-9_-]{1,64}$/.test(spec.dbCase||'')||!/^[A-Za-z0-9_-]{1,64}$/.test(spec.attemptId||''))throw Error('Unsafe case or attempt');
const resultName=spec.dbCase.slice(0,30)+'-'+spec.attemptId+'.json',requestName=spec.dbCase.slice(0,30)+'-'+spec.attemptId+'-in.json';
if(resultName.length>80||requestName.length>80)throw Error('Evidence name exceeds Android shell limit');
const remoteDirectory='files/protocol-cases/'+spec.dbCase,remoteDatabase=remoteDirectory+'/tasks.sqlite',logs=output+'.logs';
await fs.mkdir(logs,{recursive:false});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),receipt={schema:'mytodo-c007-android-process',sourceSha:spec.sourceSha,caseId:spec.caseId,attemptId:spec.attemptId,dbCase:spec.dbCase,deviceDatabase:remoteDatabase,commands:[],status:'failed'};
async function save(file,value){const h=await fs.open(file,'wx');try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}finally{await h.close();}}
async function command(label,argv,{input,allowFailure=false,timeout=15000}={}){
 const entry={label,command:[adb,'-s',serial,...argv],startedAt:new Date().toISOString()};receipt.commands.push(entry);
 const result=await new Promise(resolve=>{
  const child=spawn(adb,['-s',serial,...argv],{windowsHide:true,env:process.env});let chunks=[],errors=[],hard;
  const timer=setTimeout(()=>{entry.timedOut=true;child.kill('SIGTERM');hard=setTimeout(()=>{entry.hardKill=true;child.kill('SIGKILL');},5000);},timeout);
  child.stdout.on('data',b=>chunks.push(Buffer.from(b)));child.stderr.on('data',b=>errors.push(Buffer.from(b)));
  child.once('error',e=>entry.spawnError=String(e));child.stdin.on('error',e=>entry.stdinError=String(e));child.stdin.end(input);
  child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hard);entry.processClosed=true;resolve({code,signal,bytes:Buffer.concat(chunks),stderr:Buffer.concat(errors)});});
 });
 const prefix=String(receipt.commands.length).padStart(3,'0')+'-'+label;
 await fs.writeFile(path.join(logs,prefix+'.stdout'),result.bytes,{flag:'wx'});await fs.writeFile(path.join(logs,prefix+'.stderr'),result.stderr,{flag:'wx'});
 Object.assign(entry,{exitCode:result.code,signal:result.signal,completedAt:new Date().toISOString(),stdoutSha256:sha(result.bytes),stderrSha256:sha(result.stderr)});
 const observed={...result,text:result.bytes.toString('utf8'),timedOut:!!entry.timedOut,
  spawnError:entry.spawnError||null,stdinError:entry.stdinError||null,processClosed:entry.processClosed===true,hardKill:!!entry.hardKill};
 if(!allowFailure&&(result.code!==0||!commandCompleted(observed)))throw Error(label+' failed; original evidence retained');
 return observed;
}
function commandCompleted(value){return value.processClosed&&!value.timedOut&&!value.hardKill&&!value.spawnError&&!value.stdinError&&value.signal===null;}
async function stop(label){
 await command(label+'-stop',['shell','am','force-stop',pkg]);
 for(let n=0;n<12;n++){
  const state=await command(label+'-pid-'+n,['shell','pidof',pkg],{allowFailure:true});
  if(!commandCompleted(state)||![0,1].includes(state.code))throw Error('Cannot verify Android cleanup process state');
  if(state.code===1&&!state.text.trim()){receipt.stopConfirmed=true;return;}
  await sleep(250);
 }
 throw Error('Original Android process has not exited; no database copy or new process allowed');
}
async function observeNaturalExit(originalPid){
 const observation={originalPid,confirmed:false,checkedBeforeForceStop:true,observations:[]};receipt.naturalExit=observation;
 for(let n=0;n<16;n++){
  const state=await command('natural-exit-pid-'+n,['shell','pidof',pkg],{allowFailure:true});
  const text=state.text.trim(),pids=/^[0-9]+(?:\s+[0-9]+)*$/.test(text)?text.split(/\s+/).map(Number):[];
  observation.observations.push({at:new Date().toISOString(),adbExitCode:state.code,signal:state.signal,
   timedOut:state.timedOut,spawnError:state.spawnError,stdinError:state.stdinError,processClosed:state.processClosed,
   packagePids:pids,originalPidAbsent:!pids.includes(originalPid),stdoutSha256:sha(state.bytes)});
  if(!commandCompleted(state)||![0,1].includes(state.code)||(state.code===0&&(!pids.length||pids.some(pid=>!Number.isSafeInteger(pid)||pid<=0)))||(state.code===1&&text))
   throw Error('Cannot verify natural native process death; cleanup cannot substitute for the requested boundary');
  if(state.code===1){observation.confirmed=true;observation.confirmedAt=new Date().toISOString();return;}
  await sleep(250);
 }
 throw Error('Native process remains alive after the boundary marker; refusing to accept cleanup force-stop as the requested kill');
}
async function exportDatabase(){
 const directory=output+'.database';await fs.mkdir(directory,{recursive:false});const inventory=[];
 const observe=async(label,argv,options={})=>{
  const result=await command('export-'+label,argv,{...options,allowFailure:true});
  return {...result,stdout:result.text,stderr:result.stderr.toString('utf8')};
 };
 for(const name of ['tasks.sqlite','tasks.sqlite-wal','tasks.sqlite-shm','tasks.sqlite-journal']){
  inventory.push({name,...await captureRemoteFile({packageName:pkg,remote:remoteDirectory+'/'+name,name,directory,
   observe,selected:(...argv)=>argv,sqlite:name==='tasks.sqlite'})});
 }
 await save(path.join(directory,'files.json'),inventory);receipt.databaseExport={directory,files:inventory};
 if(!inventory.some(file=>file.name==='tasks.sqlite'&&file.state==='preserved'&&file.sqliteHeaderValid&&file.localReadbackVerified))
  throw Error('Original Android SQLite unavailable or not verified; no preserved-database claim');
 if(!inventory.every(file=>file.state==='preserved'||(file.before?.valid&&file.before.state==='unavailable'&&file.before.reason==='missing')))
  throw Error('Original Android sidecar evidence is incomplete or not verified');
}
let port,exitCode=1,started=false;
try{
 if(spec.sourceSha!==(process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA))throw Error('Android source freeze mismatch');
 const qemu=(await command('qemu',['shell','getprop','ro.kernel.qemu'])).text.trim(),boot=(await command('boot',['shell','getprop','sys.boot_completed'])).text.trim();
 if(qemu!=='1'||boot!=='1')throw Error('Only booted cloud emulator allowed');
 receipt.apkSha256=sha(await fs.readFile(apk));
 const prepared=JSON.parse(await fs.readFile(confined(args.prepared),'utf8'));
 for(const [key,value] of Object.entries({sourceSha:spec.sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,serial,apkSha256:receipt.apkSha256}))if(!value||prepared[key]!==value)throw Error('Prepare receipt differs: '+key);
 if(prepared.status!=='passed'||prepared.exitCode!==0||!prepared.installedPackage?.startsWith('package:'))throw Error('Successful preparation receipt required');
 // Install once through the existing --prepare runner before this controller. Never reinstall while preserving a failed case.
 const installed=await command('installed-package',['shell','pm','path',pkg]);if(!installed.text.startsWith('package:'))throw Error('Test APK must be prepared first');
 await stop('before');
 const exists=await command('database-exists',['shell','run-as',pkg,'test','-f',remoteDatabase],{allowFailure:true});
 if(!commandCompleted(exists)||![0,1].includes(exists.code)||(spec.mode==='init')!==(exists.code===1))throw Error('Initialization/resume mode differs from actual same database existence');
 if(spec.fixtureUrl){const u=new URL(spec.fixtureUrl);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'||u.search||u.hash)throw Error('Invalid fixture origin');port=u.port;await command('reverse',['reverse','tcp:'+port,'tcp:'+port]);}
 await command('request-dir',['shell','run-as',pkg,'mkdir','-p','files']);
 for(const name of [requestName,resultName,resultName+'.before.json',resultName+'.operation.json',resultName+'.after-ack-commit.json',resultName+'.before-commit.json']){
  const present=await command('unique-'+name,['shell','run-as',pkg,'test','-e','files/'+name],{allowFailure:true});if(!commandCompleted(present)||present.code!==1)throw Error('Refusing to reuse immutable Android attempt filename');
 }
 const bytes=await fs.readFile(input),written=await command('write-request',['shell','-T','run-as',pkg,'tee','files/'+requestName],{input:bytes});if(!written.bytes.equals(bytes))throw Error('ADB request bytes differ');
 started=true;
 const instrument=await command('instrument',['shell','am','instrument','-w','-r','-e','caseId',spec.dbCase,'-e','requestName',requestName,'-e','resultName',resultName,component],{allowFailure:true,timeout:150000});
 const codes=[...instrument.text.matchAll(/INSTRUMENTATION_CODE:\s*(-?\d+)/g)];receipt.instrumentationCode=codes.length?Number(codes.at(-1)[1]):null;
 // Observe exit cause before force-stop adds a second exit reason.
 await command('exit-info',['shell','dumpsys','activity','exit-info',pkg],{allowFailure:true});
 await command('crash-log',['logcat','-b','crash','-d','-t','120'],{allowFailure:true});
 // Read fsynced native identity evidence before any cleanup can terminate the app.
 // An intentional-kill attempt must independently prove that its native process is gone.
 const evidence={};
 for(const suffix of ['', '.before.json','.operation.json','.after-ack-commit.json','.before-commit.json']){
  const name='files/'+resultName+suffix,present=await command('evidence-exists'+(suffix||'-result'),['shell','run-as',pkg,'test','-f',name],{allowFailure:true});
  if(!commandCompleted(present))throw Error('Cannot inspect Android checkpoint');
  if(present.code===1)continue;if(present.code!==0)throw Error('Cannot inspect Android checkpoint');
  const read=await command('read'+(suffix||'-result'),['exec-out','run-as',pkg,'cat',name]);
  await fs.writeFile(output+(suffix||'.native.json'),read.bytes,{flag:'wx'});evidence[suffix]=JSON.parse(read.text);
 }
 if(spec.exitAt==='after-ack-commit'||spec.exitAt==='before-commit'){
  const marker=evidence[spec.exitAt==='before-commit'?'.before-commit.json':'.after-ack-commit.json'],expectedBoundary=spec.exitAt==='before-commit'?'before-real-sqlite-commit':'after-real-ack-return';
  const before=evidence['.before.json'];
  if(!marker||marker.boundary!==expectedBoundary||!Number.isInteger(marker.processId)||marker.processId<=0||marker.processId!==before?.runtime?.processId||marker.dbCase!==spec.dbCase||marker.databaseFile!==before?.before?.databaseFile||marker.attemptId!==spec.attemptId||marker.caseId!==spec.caseId||marker.sourceSha!==spec.sourceSha||before?.sourceSha!==spec.sourceSha||before?.caseId!==spec.caseId||before?.attemptId!==spec.attemptId||evidence['']||instrument.code!==0||!commandCompleted(instrument))throw Error('Expected intentional exit has no exact native PID/path/identity marker or has an incomplete instrumentation process receipt');
  if(spec.exitAt==='before-commit'&&(!marker.transactionSuccessfulMarked||!marker.inTransaction))throw Error('COMMIT boundary lacks successful real transaction marker');
  await observeNaturalExit(marker.processId);
  // This cleanup is subsequent to the recorded natural exit and cannot earn a passing boundary.
  await stop('after-confirmed-natural-exit');await exportDatabase();
  receipt.marker=marker;receipt.status='observed-boundary';exitCode=86;
 }else{
  await stop('after');await exportDatabase();
  const observed=evidence[''];
  if(instrument.code!==0||!commandCompleted(instrument)||receipt.instrumentationCode!==-1||observed?.observerExitCode!==0||observed.sourceSha!==spec.sourceSha||observed.caseId!==spec.caseId||observed.attemptId!==spec.attemptId)throw Error('Unexpected Android instrumentation crash/failure; no automatic retry');
  observed.deviceDatabase=observed.before.databaseFile;observed.dbDir=path.resolve(spec.dbDir);await save(output,observed);receipt.status='observed';exitCode=0;
 }
}catch(error){exitCode=1;receipt.status='failed';receipt.error=String(error.stack||error);if(started&&!receipt.databaseExport){try{await stop('failure');await exportDatabase();}catch(capture){receipt.captureError=String(capture);}}}
finally{
 if(port)await command('remove-reverse',['reverse','--remove','tcp:'+port],{allowFailure:true});
 receipt.exitCode=exitCode;await save(output+'.android-process.json',receipt);process.exitCode=exitCode;
}
