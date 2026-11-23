import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {captureRemoteFile} from '../../protocol-harness/android/remote-file-evidence.mjs';
import {cloudOnly,confined,startMigrationServer,sha} from '../c006-harness/fixture-server.mjs';
cloudOnly();
const argv=process.argv.slice(2),option=name=>{const n=argv.indexOf(name);return n<0?null:argv[n+1];};
const output=confined(option('--output')),apk=confined(option('--apk')),serial=option('--serial');
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sourceSha!==process.env.EXPECTED_SOURCE_SHA||!/^[0-9a-f]{40}$/.test(sourceSha)||!/^emulator-[0-9]+$/.test(serial||''))throw Error('Exact commit and cloud emulator required');
execFileSync('git',['diff','--exit-code','HEAD','--','src','windows','android']);
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME;if(!sdk)throw Error('Configured cloud SDK required');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const pkg='local.gxtodo.protocolharness',component=pkg+'/local.gxtodo.replica.ProtocolHarnessInstrumentation';
const environment=JSON.parse(await fs.readFile(option('--environment'),'utf8'));
if(environment.status!=='ready'||environment.sourceSha!==sourceSha||environment.runId!==process.env.GITHUB_RUN_ID||environment.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||environment.serial!==serial)throw Error('Exact-run ready emulator evidence required');
const build=JSON.parse(await fs.readFile(path.join(path.dirname(apk),'build-receipt.json'),'utf8')),apkSha256=sha(await fs.readFile(apk));
if(build.status!=='passed'||build.exitCode!==0||build.sourceSha!==sourceSha||build.outputs?.[path.basename(apk)]?.sha256!==apkSha256)throw Error('APK build receipt differs from current source or bytes');
await fs.mkdir(output,{recursive:true});
const save=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const must=(value,message)=>{if(!value)throw Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const business=a=>({sqlEntities:a.sqlEntities,sqlOutbox:a.sqlOutbox});
const domain=a=>a.rows.map(row=>({key:row.key,data:row.data,deleted:row.deleted})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
const retained=a=>a.rows.map(row=>({key:row.key,events:row.record.events.map(canonical).sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:a.seq-b.seq)})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
const receipt={schema:'mytodo-c006-android-interruption-run',sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 serial,apkSha256,environment,commands:[],startedAt:new Date().toISOString()},cases=[];
receipt.captureHelper={path:'tests/protocol-harness/android/remote-file-evidence.mjs',sha256:sha(await fs.readFile(new URL('../../protocol-harness/android/remote-file-evidence.mjs',import.meta.url)))};
let commandSequence=0,attemptSequence=0;
async function command(directory,label,args,{input,allowFailure=false,timeout=20000}={}){
 const entry={label,command:[adb,'-s',serial,...args],startedAt:new Date().toISOString()};receipt.commands.push(entry);
 const result=await new Promise(resolve=>{
  const child=spawn(adb,['-s',serial,...args],{env:process.env,windowsHide:true});const out=[],err=[];let hard;
  const timer=setTimeout(()=>{entry.timedOut=true;child.kill('SIGTERM');hard=setTimeout(()=>child.kill('SIGKILL'),5000);},timeout);
  child.stdout.on('data',data=>out.push(Buffer.from(data)));child.stderr.on('data',data=>err.push(Buffer.from(data)));
  child.once('error',error=>entry.spawnError=String(error));child.stdin.on('error',error=>entry.stdinError=String(error));child.stdin.end(input);
  child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hard);resolve({code,signal,bytes:Buffer.concat(out),stderr:Buffer.concat(err)});});
 });
 const prefix=String(++commandSequence).padStart(4,'0')+'-'+label;
 await fs.writeFile(path.join(directory,prefix+'.stdout'),result.bytes,{flag:'wx'});await fs.writeFile(path.join(directory,prefix+'.stderr'),result.stderr,{flag:'wx'});
 Object.assign(entry,{exitCode:result.code,signal:result.signal,completedAt:new Date().toISOString(),stdoutSha256:sha(result.bytes),stderrSha256:sha(result.stderr)});
 if(!allowFailure)must(result.code===0&&!result.signal&&!entry.timedOut&&!entry.spawnError&&!entry.stdinError,'ADB command failed: '+label);
 return {...result,text:result.bytes.toString('utf8'),timedOut:!!entry.timedOut,spawnError:entry.spawnError,stdinError:entry.stdinError};
}
async function gone(directory,label){
 for(let n=0;n<16;n++){
  const check=await command(directory,label+'-'+n,['shell','pidof',pkg],{allowFailure:true});
  if(check.code===1&&!check.text.trim()&&!check.timedOut&&!check.spawnError)return;
  await sleep(250);
 }
 throw Error('Original Android process is still alive; refusing to treat forced cleanup as the requested kill');
}
async function stop(directory,label){await command(directory,label,['shell','am','force-stop',pkg]);await gone(directory,label+'-pid');}
async function exportDatabase(directory,dbCase,leaf='database'){
 const target=path.join(directory,leaf);await fs.mkdir(target);const files=[];
 const observe=async(label,args,options={})=>{
  const result=await command(directory,'capture-'+label,args,{...options,allowFailure:true});
  return {...result,stdout:result.text,stderr:result.stderr.toString('utf8')};
 };
 for(const name of ['tasks.sqlite','tasks.sqlite-wal','tasks.sqlite-shm','tasks.sqlite-journal']){
  const item=await captureRemoteFile({packageName:pkg,remote:'files/protocol-cases/'+dbCase+'/'+name,name,directory:target,
   observe,selected:(...args)=>args,sqlite:name==='tasks.sqlite'});
  files.push({name,...item,status:item.state});
 }
 await save(path.join(target,'files.json'),files);
 must(files.some(file=>file.name==='tasks.sqlite'&&file.status==='preserved'&&file.sqliteHeaderValid&&file.localReadbackVerified),'Real SQLite database is unavailable or not verified');
 must(files.every(file=>file.status==='preserved'||(file.before?.valid&&file.before.state==='unavailable'&&file.before.reason==='missing')),'SQLite sidecar evidence is incomplete or not verified');
 return files;
}
async function operation(context,operation,extra={}){
 const attemptId='attempt-'+String(++attemptSequence).padStart(3,'0'),dbCase=extra.dbCase||context.id;
 must(/^[A-Za-z0-9_-]{1,45}$/.test(dbCase),'Unsafe stable database case');
 const directory=path.join(context.directory,attemptId);await fs.mkdir(directory);
 const spec={sourceSha,caseId:context.id,attemptId,dbCase,operation,fixtureUrl:context.server.origin,folder:context.server.folder,...extra};
 const stem=dbCase+'-'+attemptId,resultName=stem+'.json',requestName=stem+'-in.json';
 const observed={attemptId,dbCase,operation,directory,exitAt:spec.exitAt||null,status:'failed'};context.operations.push(observed);
 await save(path.join(directory,'request.json'),spec);
 let started=false;
 try{
  await stop(directory,'before-stop');
  const exists=await command(directory,'database-exists',['shell','run-as',pkg,'test','-f','files/protocol-cases/'+dbCase+'/tasks.sqlite'],{allowFailure:true});
  must(!exists.timedOut&&!exists.spawnError&&[0,1].includes(exists.code)&&(operation==='initialize')===(exists.code===1),'Operation would silently initialize or replace the selected database');
  await command(directory,'request-dir',['shell','run-as',pkg,'mkdir','-p','files']);
  for(const name of [requestName,resultName,resultName+'.before.json',resultName+'.gate.json']){
   const exists=await command(directory,'unique-'+name,['shell','run-as',pkg,'test','-e','files/'+name],{allowFailure:true});
   must(exists.code===1&&!exists.timedOut&&!exists.spawnError,'Refusing to reuse an Android evidence filename');
  }
  const request=Buffer.from(JSON.stringify(spec)),written=await command(directory,'request-write',['shell','-T','run-as',pkg,'tee','files/'+requestName],{input:request});
  must(written.bytes.equals(request),'Android request bytes changed');
  started=true;
  const instrument=await command(directory,'instrument',['shell','am','instrument','-w','-r','-e','caseId',dbCase,'-e','requestName',requestName,'-e','resultName',resultName,component],{allowFailure:true,timeout:195000});
  const codes=[...instrument.text.matchAll(/INSTRUMENTATION_CODE:\s*(-?\d+)/g)],code=codes.length?Number(codes.at(-1)[1]):null;
  observed.instrumentation={adbExitCode:instrument.code,instrumentationCode:code,timedOut:instrument.timedOut,signal:instrument.signal};
  await command(directory,'exit-info',['shell','dumpsys','activity','exit-info',pkg],{allowFailure:true});
  await command(directory,'crash-log',['logcat','-b','crash','-d','-t','100'],{allowFailure:true});
  if(spec.exitAt)await gone(directory,'natural-exit-pid');else await stop(directory,'after-stop');
  observed.database=await exportDatabase(directory,dbCase);
  const evidence={};
  for(const suffix of ['', '.before.json','.gate.json']){
   const remote='files/'+resultName+suffix,present=await command(directory,'evidence-exists'+(suffix||'-result'),['shell','run-as',pkg,'test','-f',remote],{allowFailure:true});
   if(present.code===1&&!present.timedOut&&!present.spawnError)continue;
   must(present.code===0&&!present.timedOut&&!present.spawnError,'Cannot inspect boundary evidence');
   const read=await command(directory,'evidence-read'+(suffix||'-result'),['exec-out','run-as',pkg,'cat',remote]);
   await fs.writeFile(path.join(directory,'native'+(suffix||'-result.json')),read.bytes,{flag:'wx'});evidence[suffix]=JSON.parse(read.text);
  }
  const before=evidence['.before.json'];
  must(before&&before.sourceSha===sourceSha&&before.caseId===context.id&&before.attemptId===attemptId&&before.dbCase===dbCase&&before.provenance?.sourceSha===sourceSha,'Before-operation source and identity evidence missing');
  if(spec.exitAt){
   const marker=evidence['.gate.json'],boundary=spec.exitAt==='after-import'?'after-real-import-commit':'after-real-manifest-success-response';
   must(marker&&marker.boundary===boundary&&marker.sourceSha===sourceSha&&marker.caseId===context.id&&marker.attemptId===attemptId&&marker.dbCase===dbCase&&Number.isInteger(marker.processId)&&marker.processId>0&&marker.processId===before.before.pid&&marker.audit.pid===marker.processId&&marker.audit.databaseFile===before.before.databaseFile&&!evidence['']&&!instrument.timedOut&&!instrument.spawnError,'Termination lacks the exact native PID/database/source gate, or produced an unexpected normal result');
   must(marker.audit.meta.lease?.token&&marker.audit.meta.lease.until>marker.deviceTimeMillis,'Intentional death did not leave the actual unexpired production lease');
   observed.status='observed-boundary';observed.before=before;observed.marker=marker;
  }else{
   const result=evidence[''];must(instrument.code===0&&!instrument.signal&&!instrument.timedOut&&!instrument.spawnError&&code===-1&&result?.status==='passed'&&result.sourceSha===sourceSha&&result.caseId===context.id&&result.attemptId===attemptId&&result.dbCase===dbCase,'Unexpected real Android failure; no automatic replacement database retry');
   observed.status='observed';observed.result=result;
  }
  return observed;
 }catch(error){observed.error=String(error.stack||error);if(started&&!observed.database){try{await stop(directory,'failure-stop');observed.database=await exportDatabase(directory,dbCase,'failure-database');}catch(capture){observed.captureError=String(capture);}}throw error;}
 finally{await save(path.join(directory,'process.json'),observed);}
}
const empty={version:1,tasks:[],notes:[],projects:[],tags:[],places:[]};
const legacy={...empty,tasks:[{id:'legacy-task',title:'恢复 中文 🧭',createdAt:'2026-01-01T00:00:00Z',subtasks:[{id:'legacy-child',title:'子任务',createdAt:'2026-01-01T00:00:00Z'}]}],notes:[{id:'legacy-note',body:'legacy content',createdAt:'2026-01-01T00:00:00Z'}],tags:['迁移'],places:['测试']};
const legacyText=JSON.stringify({format:'gxtodo-sync',version:1,state:legacy}),local={...empty,notes:[{id:'local-note',body:'local survives',createdAt:'2026-01-02T00:00:00Z'}]};
function assertLegacy(audit){
 const get=(kind,id)=>audit.rows.find(row=>row.key===JSON.stringify([kind,id]));
 must(get('notes','legacy-note')?.data.body==='legacy content'&&!get('notes','legacy-note').deleted,'Legacy note is missing or changed');
 must(get('tasks','legacy-task')?.data.title==='恢复 中文 🧭'&&!get('tasks','legacy-task').deleted,'Legacy Unicode task is missing');
 must(get('tasks','legacy-child')?.data.parentId==='legacy-task'&&get('tasks','legacy-child').data.title==='子任务'&&!get('tasks','legacy-child').deleted,'Legacy child relationship is missing');
 must(get('tags','迁移')?.data.name==='迁移'&&get('places','测试')?.data.name==='测试','Legacy tag or place is missing');
 must(new Set(audit.rows.map(row=>row.key)).size===audit.rows.length,'Duplicate domain keys');
}
async function drain(context,extra={}){
 let last;for(let n=0;n<6;n++){last=(await operation(context,'sync',extra)).result;if(!last.sync.more)break;}
 must(last&&!last.sync.more&&!last.sync.busy&&last.after.outbox.length===0&&last.after.meta.pending==null&&last.after.meta.lease==null,'Real Android outbox/pending/lease did not drain');return last;
}
async function inventory(context,label){await context.server.flush();const files=await context.server.readFiles();await save(path.join(context.directory,label+'-cloud.json'),files);return files;}
async function isolateOriginal(context,killed){
 const source='files/protocol-cases/'+context.id,destination='files/c006-retired-'+context.id;
 const original=await command(context.directory,'original-directory',['shell','run-as',pkg,'test','-d',source],{allowFailure:true});
 const isolated=await command(context.directory,'isolated-absent',['shell','run-as',pkg,'test','-e',destination],{allowFailure:true});
 must(original.code===0&&!original.timedOut&&!original.spawnError&&isolated.code===1&&!isolated.timedOut&&!isolated.spawnError,'Cannot isolate the original synthetic database directory safely');
 // Only this exact synthetic case directory is moved, after verified real process death and raw export.
 await command(context.directory,'isolate-original',['shell','run-as',pkg,'mv',source,destination]);
 const absent=await command(context.directory,'original-path-absent',['shell','run-as',pkg,'test','-e',source],{allowFailure:true});
 must(absent.code===1&&!absent.timedOut&&!absent.spawnError,'Original database remains available at its production path');
 const retainedBytes=(await command(context.directory,'isolated-database',['exec-out','run-as',pkg,'cat',destination+'/tasks.sqlite'])).bytes;
 must(sha(retainedBytes)===killed.database.find(file=>file.name==='tasks.sqlite').sha256,'Isolating the original database changed its saved SQLite bytes');
 await save(path.join(context.directory,'original-database-isolation.json'),{source,destination,originalPathAbsent:true,originalPid:killed.marker.processId,retainedSha256:sha(retainedBytes),retainedBytes:retainedBytes.length,reason:'Fresh-device takeover must not access the original production database path'});
}
async function test(id,body){
 const directory=path.join(output,id);await fs.mkdir(directory);
 const server=await startMigrationServer({directory:path.join(directory,'cloud'),folder:id,initialFiles:[{path:'state.json',body:legacyText}]});
 const context={id,directory,server,operations:[]};let status='passed',error=null;
 try{await command(directory,'reverse',['reverse','tcp:'+server.port,'tcp:'+server.port]);await body(context);}
 catch(cause){status='failed';error=String(cause.stack||cause);}
 finally{await server.close();await inventory(context,'final');await command(directory,'remove-reverse',['reverse','--remove','tcp:'+server.port],{allowFailure:true});}
 const result={id,status,error,sourceSha,operations:context.operations};cases.push(result);await save(path.join(directory,'case.json'),result);
 process.stdout.write(JSON.stringify({id,status,error:error?.split('\n')[0]||null})+'\n');
}
let fatal=null;
try{
 must((await command(output,'qemu',['shell','getprop','ro.kernel.qemu'])).text.trim()==='1'&&(await command(output,'boot',['shell','getprop','sys.boot_completed'])).text.trim()==='1','A booted emulator is required');
 // Install exactly once before all attempts; retries never reinstall or replace case databases.
 await command(output,'install',['install','-r',apk],{timeout:90000});
 await test('C006-A26-import-kill',async context=>{
  await operation(context,'initialize',{state:local});
  const killed=await operation(context,'sync',{exitAt:'after-import',importKey:JSON.stringify(['notes','legacy-note'])}),marker=killed.marker;
  must(marker.observation.ok===true&&marker.observation.rowCount>0,'Import gate did not follow a successful production commit');assertLegacy(marker.audit);
  const cloud=await inventory(context,'interrupted');must(!cloud.some(file=>file.path==='v2/manifest.json'),'After-import gate ran after manifest publication');
  const guard=JSON.parse(cloud.find(file=>file.path==='state.json').text);must(cloud.find(file=>file.path===guard.backup)?.plainSha256===sha(Buffer.from(legacyText)),'Interrupted migration lost its exact immutable backup');
  const reopened=(await operation(context,'audit')).result;
  must(reopened.before.pid!==marker.processId&&reopened.before.databaseFile===marker.audit.databaseFile&&reopened.before.meta.actor===marker.audit.meta.actor&&same(business(reopened.before),business(marker.audit))&&same(reopened.before.meta,marker.audit.meta),'Reopen changed the interrupted database or committed import');
  const busy=(await operation(context,'sync',{expectedBusy:true})).result;
  must(busy.sync.busy===true&&same(busy.after.meta.lease,marker.audit.meta.lease)&&same(business(busy.after),business(marker.audit)),'Restart bypassed or rewrote the actual lease');
  const delay=marker.audit.meta.lease.until-busy.after.deviceTimeMillis+200;
  must(Number.isFinite(delay)&&delay>0&&delay<=121000,'Recorded device lease is not within the production bound');
  await save(path.join(context.directory,'lease-wait.json'),{lease:marker.audit.meta.lease,observedDeviceTime:busy.after.deviceTimeMillis,waitMilliseconds:delay,usesActualDeviceClock:true});
  await sleep(delay);
  const resumed=await drain(context);assertLegacy(resumed.after);
  must(resumed.before.databaseFile===marker.audit.databaseFile&&resumed.after.meta.actor===marker.audit.meta.actor&&resumed.after.meta.seq===marker.audit.meta.seq,'Same-database recovery replaced identity or reimported logical changes');
  must(same(domain(resumed.after),domain(marker.audit))&&same(retained(resumed.after),retained(marker.audit)),'Recovery changed an interrupted local or legacy row or retained event');
  const recovered=await inventory(context,'recovered'),published=JSON.parse(recovered.find(file=>file.path==='v2/manifest.json').text);
  const events=recovered.filter(file=>file.path.startsWith('v2/b-')).map(file=>({file,batch:JSON.parse(file.text)}))
   .filter(({file,batch})=>batch.epoch===published.epoch&&batch.index>=1&&batch.index<=(published.heads[batch.device]||0)&&file.path==='v2/b-'+batch.device+'-'+batch.index+'.json.gz').flatMap(({batch})=>batch.events);
  for(const original of marker.audit.outbox)must(events.some(event=>same(event,original.event)),'An interrupted imported/local event was not published unchanged');
  const observer=context.id+'-observer';await operation(context,'initialize',{state:empty,dbCase:observer});const seen=await drain(context,{dbCase:observer});
  assertLegacy(seen.after);must(same(domain(seen.after),domain(marker.audit))&&same(retained(seen.after),retained(marker.audit)),'Fresh Android observer differs from the complete interrupted state');
 });
 await test('C006-A30-manifest-kill',async context=>{
  await operation(context,'initialize',{state:empty});
  const killed=await operation(context,'sync',{exitAt:'after-manifest'}),marker=killed.marker;
  must([200,201,204].includes(marker.observation.status),'Initial manifest success response was not observed');
  const cloud=await inventory(context,'interrupted'),manifest=JSON.parse(cloud.find(file=>file.path==='v2/manifest.json').text),lastRequest=Math.max(...context.server.entries.map(entry=>entry.id));
  must(same(manifest,marker.observation.manifest)&&Object.keys(manifest.heads).length===0&&!cloud.some(file=>file.path.startsWith('v2/b-')),'Takeover was bypassed by published batches or a different manifest');
  await isolateOriginal(context,killed);
  const observer=context.id+'-observer';await operation(context,'initialize',{state:empty,dbCase:observer});const seen=await drain(context,{dbCase:observer});
  assertLegacy(seen.after);must(seen.after.meta.actor!==marker.audit.meta.actor&&seen.after.databaseFile!==marker.audit.databaseFile,'Takeover reused the original device database');
  must(seen.after.meta.seq===0&&seen.after.meta.queue===0&&seen.after.outbox.length===0&&same(domain(seen.after),domain(marker.audit))&&same(retained(seen.after),retained(marker.audit)),'Fresh observer synthesized new events or changed the complete original snapshot state');
  const observerRequests=context.server.entries.filter(entry=>entry.id>lastRequest);
  must(!observerRequests.some(entry=>entry.method==='GET'&&(entry.relative==='state.json'||entry.relative.startsWith('v2/legacy-')))&&!observerRequests.some(entry=>entry.method==='PUT'&&entry.relative.startsWith('v2/b-')),'Snapshot-only observer fetched legacy recovery data or published new batches');
  const parts=manifest.snapshot?.parts||[];
  must(parts.length>0&&parts.every(part=>cloud.find(file=>file.path===part.path)?.plainSha256===part.sha256&&context.server.entries.some(entry=>entry.id>lastRequest&&entry.method==='GET'&&entry.relative===part.path&&entry.status===200)),'Fresh Android device did not recover from the actual reachable snapshot');
 });
}catch(error){fatal=String(error.stack||error);}
finally{
 const summary={suite:'C006 Android actual internal migration process death',sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
  executed:cases.length,passed:cases.filter(row=>row.status==='passed').length,failed:cases.filter(row=>row.status==='failed').length,status:!fatal&&cases.length===2&&cases.every(row=>row.status==='passed')?'passed':'failed',fatal,
  scope:'A26 actual post-import-commit death, original DB lease/recovery; A30 actual post-initial-manifest-response death, fresh Android snapshot takeover. No native C forced termination or other Android boundaries claimed.',results:cases.map(({id,status,error})=>({id,status,error}))};
 receipt.finishedAt=new Date().toISOString();receipt.status=summary.status;await save(path.join(output,'execution.json'),receipt);await save(path.join(output,'summary.json'),summary);
 process.stdout.write(JSON.stringify(summary)+'\n');process.exitCode=summary.status==='passed'?0:1;
}
