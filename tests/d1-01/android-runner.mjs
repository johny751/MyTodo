import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cloudRoot,GUARD,CANDIDATE,hash,freshDirectory,writeFresh} from './android/guard.mjs';
import {build} from './android/build.mjs';
import {createSidecarProbe,verifySidecarProbe} from './sidecar-probe.mjs';

if(process.argv.length!==3)throw new Error('Use: node tests/d1-01/android-runner.mjs <syntheticRoot>');
// All command execution and writes occur after positive cloud/root/run/fixture guards.
const context=await cloudRoot(process.argv[2]);
const here=path.dirname(fileURLToPath(import.meta.url)),logs=await freshDirectory(context.root,'android-run-logs');
const environment={...process.env,MYTODO_D1_GUARD:GUARD,
  MYTODO_D1_ANDROID_IMAGE_INSTALL:process.env.MYTODO_D1_ANDROID_IMAGE_INSTALL||process.env.MYTODO_ANDROID_IMAGE_INSTALL||'0',
  MYTODO_D1_ANDROID_PULSE_INSTALL:process.env.MYTODO_D1_ANDROID_PULSE_INSTALL||process.env.MYTODO_ANDROID_PULSE_INSTALL||'0'};
const receipt={schema:'mytodo-d1-android-runner',version:1,guard:GUARD,candidate:CANDIDATE,purpose:'independent-synthetic',
  runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceSha:process.env.GITHUB_SHA,fixtureSha256:context.fixtureSha256,
  status:'failed',startedAtUtc:new Date().toISOString(),commands:[],firstError:null,outputs:{},actualProductionEntryLoaded:false};
const packageName='local.mytodo.d1fixture';let adb,serial,emulatorAttempted=false;

async function command(label,exe,args,{allowFailure=false,timeout=240000,input}={}) {
  const inputBytes=input===undefined?null:Buffer.isBuffer(input)?input:Buffer.from(input,'utf8');
  const entry={label,argv:[exe,...args],stdinBytes:inputBytes?.length??0,stdinSha256:inputBytes?hash(inputBytes):null,
    startedAtUtc:new Date().toISOString()};receipt.commands.push(entry);
  const result=await new Promise(resolve=>{
    const child=spawn(exe,args,{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']});const stdout=[],stderr=[];let spawnError=null,settled=false;
    let total=0;const timer=setTimeout(()=>{entry.timedOut=true;child.kill('SIGKILL');},timeout);
    child.stdout.on('data',b=>{total+=b.length;if(total>32*1024*1024){entry.sizeLimit=true;child.kill('SIGKILL');}stdout.push(b);});
    child.stderr.on('data',b=>stderr.push(b));child.stdin.on('error',e=>{entry.stdinError=String(e);});child.stdin.end(inputBytes??undefined);
    const finish=(exitCode,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({exitCode,signal,spawnError,timedOut:entry.timedOut===true,sizeLimit:entry.sizeLimit===true,stdinError:entry.stdinError??null,stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr)});};
    child.on('error',e=>{spawnError=String(e);finish(null,null);});child.on('close',finish);
  });
  const prefix=String(receipt.commands.length).padStart(3,'0')+'-'+label;
  await writeFresh(path.join(logs,prefix+'.stdout'),result.stdout);await writeFresh(path.join(logs,prefix+'.stderr'),result.stderr);
  Object.assign(entry,{exitCode:result.exitCode,signal:result.signal,spawnError:result.spawnError,stdoutBytes:result.stdout.length,stderrBytes:result.stderr.length,
    stdoutSha256:hash(result.stdout),stderrSha256:hash(result.stderr),stdoutFile:prefix+'.stdout',stderrFile:prefix+'.stderr',completedAtUtc:new Date().toISOString()});
  if(!allowFailure&&(result.exitCode!==0||entry.timedOut||entry.sizeLimit||entry.stdinError))throw new Error(label+' failed; see retained stdout/stderr');return result;
}
async function selected(label,args,options){return command(label,adb,['-s',serial,...args],options);}
async function fetch(name,{db=false}={}) {
  if(!/^[a-z0-9.-]+$/.test(name))throw new Error('BLOCKER: fixed private output name required');
  const first=await selected('capture-'+name,['exec-out','run-as',packageName,'cat','files/d1-fixtures/'+name]);
  if(first.stderr.length)throw new Error('Capture emitted stderr '+name);
  const second=await selected('confirm-'+name,['exec-out','run-as',packageName,'cat','files/d1-fixtures/'+name]);
  if(second.stderr.length||hash(first.stdout)!==hash(second.stdout))throw new Error('BLOCKER: output changed during capture '+name);
  if(db&&(first.stdout.length<100||first.stdout.subarray(0,16).toString('ascii')!=='SQLite format 3\0'))throw new Error('BLOCKER: invalid captured SQLite header');
  await writeFresh(path.join(context.root,name),first.stdout);receipt.outputs[name]={bytes:first.stdout.length,sha256:hash(first.stdout)};return first.stdout;
}
let exitCode=1;
try {
  const head=(await command('git-head','git',['rev-parse','HEAD'])).stdout.toString('utf8').trim();if(head!==process.env.GITHUB_SHA)throw new Error('BLOCKER: checkout/source SHA mismatch');
  const unit=await command('sidecar-probe-unit-tests',process.execPath,['--test',path.join(here,'sidecar-probe.test.mjs')]);
  receipt.sidecarProbeUnitTests={status:'passed',node:process.version,stdoutBytes:unit.stdout.length,stderrBytes:unit.stderr.length,
    stdoutSha256:hash(unit.stdout),stderrSha256:hash(unit.stderr),
    moduleSha256:hash(await fs.readFile(path.join(here,'sidecar-probe.mjs'))),testSha256:hash(await fs.readFile(path.join(here,'sidecar-probe.test.mjs')))};
  const artifact=await build(context,command);receipt.build=artifact;
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME;adb=path.join(sdk,'platform-tools','adb');
  emulatorAttempted=true;
  await command('emulator-start',process.execPath,[path.join(here,'emulator.mjs'),'start'],{timeout:1500000});
  const emuRoot=path.join(await fs.realpath(process.env.RUNNER_TEMP),'d1-android-emulator');
  const emu=JSON.parse(await fs.readFile(path.join(emuRoot,'environment.json'),'utf8'));
  if(emu.status!=='ready'||emu.sourceSha!==process.env.GITHUB_SHA||emu.runId!==process.env.GITHUB_RUN_ID||emu.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||!/^emulator-\d+$/.test(emu.serial||''))throw new Error('BLOCKER: emulator identity/status mismatch');
  serial=emu.serial;receipt.emulator=emu;receipt.serial=serial;
  const install=await selected('install-independent-fixture',['install',artifact.apk]);
  if(!/^Success$/m.test(install.stdout.toString('utf8').replaceAll('\r','')))throw new Error('Independent APK install did not report Success');
  const result=await selected('instrumentation',['shell','am','instrument','-w','-r','-e','runId',process.env.GITHUB_RUN_ID,'-e','guard',GUARD,
    packageName+'/local.mytodo.d1fixture.FixtureInstrumentation'],{timeout:240000});
  receipt.instrumentationExitCode=result.exitCode;
  const reportBytes=await fetch('android-generator-receipt.json');const report=JSON.parse(reportBytes.toString('utf8'));
  receipt.generatorStatus=report.status;
  if(report.status!=='passed'||report.actualFramework!==true||report.actualProductionEntryLoaded!==false||report.runId!==process.env.GITHUB_RUN_ID||report.fixtureSha256!==context.fixtureSha256||report.guard!==GUARD||report.fixtureId!==context.fixture.fixtureId)
    throw new Error('BLOCKER: Android generator receipt failed or wrong identity; first error retained');
  for(const name of ['android-source.sqlite','feedback-source.sqlite','feedback-validation.sqlite']) {
    const sealed=report.files?.[name];if(!sealed||!sealed.writersClosed||sealed.sidecars.some(item=>item.exists&&item.bytes!==0))throw new Error('BLOCKER: database capture not sealed');
    const bytes=await fetch(name,{db:true});if(bytes.length!==sealed.bytes||hash(bytes)!==sealed.sha256)throw new Error('BLOCKER: closed database hash mismatch');
    for(const suffix of ['-wal','-shm','-journal']) {
      const expected=createSidecarProbe(name+suffix);
      const observed=await selected('sidecar-'+name+suffix,['shell','-T','run-as',packageName,'sh'],{allowFailure:true,input:expected.stdinBytes});
      receipt.sidecarProbes??=[];
      try {receipt.sidecarProbes.push(verifySidecarProbe(expected,observed));}
      catch(error) {receipt.sidecarProbes.push(error.evidence??{fileName:expected.fileName,remotePath:expected.remotePath,nonce:expected.nonce,allowed:false,error:String(error)});throw error;}
    }
  }
  const image=await fetch('feedback-original.png');if(image.length!==report.feedbackOriginal.bytes||hash(image)!==report.feedbackOriginal.sha256)throw new Error('BLOCKER: original image hash mismatch');
  await fetch('d1-synthetic.json');
  receipt.sqliteVersion=report.sqliteVersion;receipt.fixtureId=report.fixtureId;receipt.actualFramework=true;receipt.rowsCount=report.rowsCount;receipt.outboxCount=report.outboxCount;
  receipt.status='passed';exitCode=0;
} catch(error) {
  receipt.firstError=String(error.stack||error);receipt.status='failed';
  if(adb&&serial) {
    await selected('failure-private-file-inventory',['exec-out','run-as',packageName,'ls','-la','files/d1-fixtures'],{allowFailure:true}).catch(e=>{receipt.failureCollectionError=String(e);});
    // Retain raw command streams before shutdown. Unframed failure output does
    // not prove original file bytes; SQLite-header streams are partial candidates.
    receipt.partialFailureFiles={};
    const partialNames=['android-generator-receipt.json','feedback-original.png','d1-synthetic.json',
      ...['android-source.sqlite','feedback-source.sqlite','feedback-validation.sqlite'].flatMap(name=>[name,name+'-wal',name+'-shm',name+'-journal'])];
    for(const name of partialNames) {
      try {
        const capture=await selected('failure-capture-'+name,['exec-out','run-as',packageName,'cat','files/d1-fixtures/'+name],{allowFailure:true});
        const logged=receipt.commands.at(-1);
        const rawLog={stdoutFile:logged.stdoutFile,stderrFile:logged.stderrFile,stdoutBytes:capture.stdout.length,
          stderrBytes:capture.stderr.length,stdoutSha256:hash(capture.stdout),stderrSha256:hash(capture.stderr),
          hostExitCode:capture.exitCode,hostSignal:capture.signal,timedOut:capture.timedOut,sizeLimit:capture.sizeLimit,stdinError:capture.stdinError};
        if(capture.exitCode!==0||capture.stderr.length||capture.timedOut||capture.sizeLimit||capture.stdinError) {
          receipt.partialFailureFiles[name]={captured:false,fileBytesVerified:false,rawLog,
            reason:'capture command failed, timed out, exceeded limit or emitted stderr; raw output retained only'};continue;
        }
        if(!name.endsWith('.sqlite')) {
          receipt.partialFailureFiles[name]={captured:false,fileBytesVerified:false,rawLog,
            reason:'unframed exec-out cannot prove remote file existence or content; non-DB output retained as command stdout only'};continue;
        }
        if(name.endsWith('.sqlite')&&(capture.stdout.length<100||capture.stdout.subarray(0,16).toString('ascii')!=='SQLite format 3\0')) {
          receipt.partialFailureFiles[name]={captured:false,fileBytesVerified:false,rawLog,reason:'invalid/partial SQLite header; command stdout retained'};continue;
        }
        await writeFresh(path.join(context.root,'failure-'+name),capture.stdout);
        receipt.partialFailureFiles[name]={captured:true,fileBytesVerified:false,sealed:false,sqliteHeaderObserved:true,rawLog,
          hostName:'failure-'+name,bytes:capture.stdout.length,sha256:hash(capture.stdout),
          qualification:'partial SQLite candidate stdout bytes; header observed, completeness and successful file seal unverified'};
      } catch(captureError){receipt.partialFailureFiles[name]={captured:false,fileBytesVerified:false,error:String(captureError)};}
    }
  }
} finally {
  if(adb&&serial)await selected('retained-runtime-errors',['logcat','-d','-t','500','AndroidRuntime:E','*:S'],{allowFailure:true}).catch(e=>{receipt.runtimeLogError=String(e);});
  if(emulatorAttempted) {
    const shutdown=await command('emulator-finish',process.execPath,[path.join(here,'emulator.mjs'),'finish'],{allowFailure:true,timeout:120000}).catch(e=>({exitCode:null,error:String(e)}));
    receipt.shutdown=shutdown.exitCode; if(shutdown.exitCode!==0){receipt.shutdownError=shutdown.error||'see preserved stdout/stderr';receipt.status='failed';exitCode=1;}
  }
  receipt.exitCode=exitCode;receipt.completedAtUtc=new Date().toISOString();
  await writeFresh(path.join(context.root,'android-runner-receipt.json'),Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
  console.log(JSON.stringify({status:receipt.status,exitCode,receipt:path.join(context.root,'android-runner-receipt.json'),actualFramework:receipt.actualFramework===true}));
  process.exitCode=exitCode;
}
