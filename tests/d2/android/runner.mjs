import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {build} from './build.mjs';
import {createSidecarProbe,verifySidecarProbe} from './sidecar-probe.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const runId=process.env.GITHUB_RUN_ID,sourceSha=process.env.GITHUB_SHA,GUARD='MYTODO_D2_SYNTHETIC_ONLY';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.platform!=='linux'||!/^\d+$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('BLOCKER: GitHub-hosted Linux only');
const temp=await fs.realpath(process.env.RUNNER_TEMP),requested=process.argv[2],root=path.join(temp,'d2-'+runId+'-android');
if(process.argv.length!==3||!path.isAbsolute(requested||'')||path.normalize(requested)!==root)throw Error('BLOCKER: exact dedicated D2 root required');
for(let cursor=temp;;cursor=path.dirname(cursor)){if((await fs.lstat(cursor)).isSymbolicLink())throw Error('BLOCKER: symlink temp ancestor');if(cursor===path.dirname(cursor))break;}
const marker={syntheticOnly:true,contractId:'d1-01-candidate.1',runId,framework:'d2-real-storage-api-v1'};
try{await fs.mkdir(root);await fs.writeFile(path.join(root,'.d2-synthetic-only.json'),JSON.stringify(marker)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
if((await fs.lstat(root)).isSymbolicLink()||await fs.realpath(root)!==root)throw Error('BLOCKER: root resolution changed');
const markerFile=path.join(root,'.d2-synthetic-only.json');if((await fs.lstat(markerFile)).isSymbolicLink())throw Error('BLOCKER: linked marker');const actual=JSON.parse(await fs.readFile(markerFile,'utf8'));
if(Object.keys(actual).length!==4||Object.entries(marker).some(([k,v])=>actual[k]!==v))throw Error('BLOCKER: wrong D2 marker');
const logs=path.join(root,'android-run-logs');await fs.mkdir(logs);
const environment={...process.env,MYTODO_D1_GUARD:'MYTODO_D1_SYNTHETIC_ONLY',EXPECTED_SOURCE_SHA:sourceSha};
const receipt={framework:marker.framework,contractId:marker.contractId,runId,runAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceSha,status:'failed',commands:[],firstError:null,productionAppEntryLoaded:false};
async function command(label,exe,args,{allowFailure=false,timeout=240000,input}={}){
 const entry={label,argv:[exe,...args]};receipt.commands.push(entry);const inputBytes=input===undefined?null:Buffer.isBuffer(input)?input:Buffer.from(input);
 const result=await new Promise(resolve=>{
  const child=spawn(exe,args,{env:environment,windowsHide:true,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];let settled=false,spawnError=null,total=0;
  const timer=setTimeout(()=>{entry.timedOut=true;child.kill('SIGKILL');},timeout);
  const append=(list,b)=>{total+=b.length;if(total>32*1024*1024){entry.sizeLimit=true;child.kill('SIGKILL');}list.push(b);};
  child.stdout.on('data',b=>append(stdout,b));child.stderr.on('data',b=>append(stderr,b));child.stdin.on('error',e=>{entry.stdinError=String(e);});child.stdin.end(inputBytes??undefined);
  const finish=(exitCode,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({exitCode,signal,spawnError,timedOut:entry.timedOut===true,sizeLimit:entry.sizeLimit===true,stdinError:entry.stdinError??null,stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr)});};
  child.on('error',e=>{spawnError=String(e);finish(null,null);});child.on('close',finish);
 });
 const prefix=String(receipt.commands.length).padStart(3,'0')+'-'+label;await fs.writeFile(path.join(logs,prefix+'.stdout'),result.stdout,{flag:'wx'});await fs.writeFile(path.join(logs,prefix+'.stderr'),result.stderr,{flag:'wx'});
 Object.assign(entry,{...result,stdout:undefined,stderr:undefined,stdinBytes:inputBytes?.length??0,stdinSha256:inputBytes?hash(inputBytes):null,stdoutBytes:result.stdout.length,stderrBytes:result.stderr.length,stdoutSha256:hash(result.stdout),stderrSha256:hash(result.stderr),stdoutFile:prefix+'.stdout',stderrFile:prefix+'.stderr'});
 if(!allowFailure&&(result.exitCode!==0||result.timedOut||result.sizeLimit||result.stdinError||result.spawnError))throw Error(label+' failed; original command streams retained');return result;
}
const packageName='local.mytodo.d2storage';let adb,serial,started=false;
const selected=(label,args,options)=>command(label,adb,['-s',serial,...args],options);
async function fetch(name,db=false){
 if(!['android-storage-receipt.json','cross-source.sqlite','cross-target.sqlite','cross-source-snapshot.json','migration-audit.jsonl','rollback-first-error.jsonl','unknown-first-error.jsonl'].includes(name))throw Error('BLOCKER: fixed private output required');
 const a=await selected('capture-'+name,['exec-out','run-as',packageName,'cat','files/d1-fixtures/'+name]);const b=await selected('confirm-'+name,['exec-out','run-as',packageName,'cat','files/d1-fixtures/'+name]);
 if(a.stderr.length||b.stderr.length||hash(a.stdout)!==hash(b.stdout)||db&&(a.stdout.length<100||a.stdout.subarray(0,16).toString('ascii')!=='SQLite format 3\0'))throw Error('BLOCKER: unconfirmed file bytes');
 await fs.writeFile(path.join(root,name),a.stdout,{flag:'wx'});return a.stdout;
}
try{
 const head=(await command('source-head','git',['rev-parse','HEAD'])).stdout.toString('utf8').trim();if(head!==sourceSha)throw Error('BLOCKER: source checkout mismatch');
 await command('capture-contract-units',process.execPath,['--test',path.join(here,'sidecar-probe.test.mjs')]);
 const artifact=await build({root,runId},command);receipt.build=artifact;
 const emulator=path.resolve(here,'../../d1-01/emulator.mjs');started=true;await command('emulator-start',process.execPath,[emulator,'start'],{timeout:1500000});
 const emu=JSON.parse(await fs.readFile(path.join(temp,'d1-android-emulator/environment.json'),'utf8'));if(emu.status!=='ready'||emu.sourceSha!==sourceSha||emu.runId!==runId||emu.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||!/^emulator-\d+$/.test(emu.serial||''))throw Error('BLOCKER: exact emulator identity required');serial=emu.serial;
 adb=path.join(process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME,'platform-tools/adb');
 const installed=await selected('install-test-only',['install',artifact.apk]);if(!/^Success$/m.test(installed.stdout.toString('utf8').replaceAll('\r','')))throw Error('Independent APK install did not succeed');
 await selected('instrumentation',['shell','am','instrument','-w','-r','-e','runId',runId,'-e','sourceSha',sourceSha,'-e','guard',GUARD,packageName+'/local.gxtodo.replica.D2StorageInstrumentation']);
 const data=JSON.parse((await fetch('android-storage-receipt.json')).toString('utf8'));receipt.storage=data;
 if(data.status!=='passed'||data.runId!==runId||data.sourceSha!==sourceSha||data.implementationChecksum!==artifact.implementationChecksum||data.actualProductionStorageApi!==true||data.actualFramework!==true||data.productionAppEntryLoaded!==false)throw Error('BLOCKER: real storage API receipt/identity failure');
 for(const name of ['cross-source.sqlite','cross-target.sqlite']){const bytes=await fetch(name,true),expected=data.files?.[name];if(!expected?.writersClosed||bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('BLOCKER: database seal mismatch');for(const suffix of ['-wal','-shm','-journal']){const probe=createSidecarProbe(name+suffix),observed=await selected('sidecar-'+name+suffix,['shell','-T','run-as',packageName,'sh'],{allowFailure:true,input:probe.stdinBytes});receipt.sidecars??=[];receipt.sidecars.push(verifySidecarProbe(probe,observed));}}
 await fetch('cross-source-snapshot.json');for(const [name,expected] of Object.entries(data.externalAttemptAudits??{})){const bytes=await fetch(name);if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('BLOCKER: external audit mismatch');}receipt.status='passed';
}catch(error){receipt.firstError=String(error.stack||error);receipt.status='failed';}
finally{
 if(started){try{const shut=await command('emulator-finish',process.execPath,[path.resolve(here,'../../d1-01/emulator.mjs'),'finish'],{allowFailure:true,timeout:120000});if(shut.exitCode!==0||shut.timedOut||shut.sizeLimit){receipt.shutdownError='See original streams';receipt.status='failed';}}catch(error){receipt.shutdownError=String(error);receipt.status='failed';}}
 await fs.writeFile(path.join(root,'android-runner-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 const payload=[];async function seal(folder){for(const file of await fs.readdir(folder)){const p=path.join(folder,file),stat=await fs.lstat(p);if(stat.isSymbolicLink())throw Error('BLOCKER: linked output');if(stat.isDirectory())await seal(p);else if(stat.isFile())payload.push({path:path.relative(root,p).replaceAll('\\','/'),bytes:stat.size,sha256:hash(await fs.readFile(p))});}}await seal(root);await fs.writeFile(path.join(root,'payload-sha256.json'),JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:receipt.status,passed:receipt.storage?.passed??0,failed:receipt.storage?.failed??null,primaryReceipt:'android-runner-receipt.json'}));process.exitCode=receipt.status==='passed'?0:1;
}
