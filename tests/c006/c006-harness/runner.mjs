import fs from 'node:fs/promises';
import path from 'node:path';
import {fork,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {cloudOnly,confined,startMigrationServer,sha} from './fixture-server.mjs';

cloudOnly();
const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,all)=>index%2?pairs:[...pairs,[value.replace(/^--/,''),all[index+1]]],[]));
const sourceRoot=path.resolve(args.source||process.cwd()),root=confined(args.output||path.join(process.env.RUNNER_TEMP,'c006-js'));
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
if(sourceSha!==process.env.EXPECTED_SOURCE_SHA||!/^[0-9a-f]{40}$/.test(sourceSha))throw Error('Source SHA does not match expected exact commit');
execFileSync('git',['diff','--exit-code','HEAD','--','src','windows','android'],{cwd:sourceRoot});
await fs.mkdir(root,{recursive:true});
const worker=fileURLToPath(new URL('./js-worker.mjs',import.meta.url)),results=[];
const empty={version:1,tasks:[],notes:[],projects:[],tags:[],places:[]};
const legacy={...empty,tasks:[{id:'legacy-task',title:'旧云恢复 中文 🧭',createdAt:'2026-01-01T00:00:00Z',subtasks:[{id:'legacy-child',title:'子任务',createdAt:'2026-01-01T00:00:00Z'}]}],notes:[{id:'legacy-note',body:'note\nrecovery',createdAt:'2026-01-01T00:00:00Z'}],projects:[{id:'legacy-project',name:'legacy project',description:'synthetic'}],tags:['迁移'],places:['测试']};
const local={...empty,notes:[{id:'local-note',body:'local survives',createdAt:'2026-01-02T00:00:00Z'}]};
const legacyText=JSON.stringify({format:'gxtodo-sync',version:1,state:legacy});
const legacy2={...legacy,notes:[...legacy.notes,{id:'legacy-concurrent',body:'writer two',createdAt:'2026-01-03T00:00:00Z'}]};
const legacy2Text=JSON.stringify({format:'gxtodo-sync',version:1,state:legacy2});
const backupPath='v2/legacy-c006-original.json.gz';
const guard=backup=>JSON.stringify({format:'gxtodo-sync',version:2,backup});
const legacyFiles=[{path:'state.json',body:legacyText}];
const guardedFiles=[{path:'state.json',body:guard(backupPath)},{path:backupPath,body:legacyText}];
function must(condition,message){if(!condition)throw Error(message);}
const allIds=state=>{const out=[];const visit=t=>{out.push(t.id);for(const child of t.subtasks||[])visit(child);};for(const t of state.tasks)visit(t);for(const kind of ['notes','projects'])out.push(...state[kind].map(x=>x.id));return out.sort();};
const ids=allIds(legacy),hasLegacy=audit=>ids.every(id=>allIds(audit.state).includes(id));
const business=audit=>JSON.stringify({entities:audit.raw.entities,outbox:audit.raw.outbox});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const domain=state=>canonical(Object.fromEntries(Object.entries(state).filter(([key])=>key!=='settings')));
let operationSequence=0;
async function runWorker(context,spec,{killAtGate=false}={}){
 const ordinal=++operationSequence,file=path.join(context.directory,'worker-'+ordinal+'.json'),output=path.join(context.directory,'result-'+ordinal+'.json');
 const full={sourceRoot,caseId:context.id,dbDir:context.dbDir,origin:context.server.origin,folder:context.server.folder,...spec,output};
 await fs.writeFile(file,JSON.stringify(full,null,2)+'\n');
 const processResult=await new Promise(resolve=>{
  const child=fork(worker,[file],{cwd:sourceRoot,env:process.env,stdio:['ignore','pipe','pipe','ipc'],execArgv:['--experimental-sqlite']});
  let stdout='',stderr='',gate=null,killed=false,timedOut=false,spawnError=null,done=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},45000);
  child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
  child.on('error',error=>{spawnError=String(error);});
  child.on('message',message=>{
   if(message.type!=='gate')return;
   gate=message;
   if(killAtGate){killed=child.kill('SIGKILL');}
  });
  child.on('close',(code,signal)=>{if(done)return;done=true;clearTimeout(timer);resolve({pid:child.pid,code,signal,stdout,stderr,gate,killed,timedOut,spawnError});});
 });
 const evidence=await fs.readFile(output,'utf8').then(JSON.parse).catch(()=>null);
 const combined={specFile:file,output,process:processResult,evidence};context.operations.push(combined);
 await fs.writeFile(path.join(context.directory,'process-'+ordinal+'.json'),JSON.stringify(combined,null,2)+'\n');
 must(!processResult.spawnError&&!processResult.timedOut,'Worker spawn error or uncontrolled timeout');
 if(killAtGate){must(processResult.killed&&processResult.gate&&evidence?.status==='paused-at-gate','Intentional process termination gate was not reached');}
 else{
  must(processResult.signal===null&&[0,1].includes(processResult.code),'Worker unexpectedly crashed');
  must(evidence&&((processResult.code===0&&evidence.status==='passed')||(processResult.code===1&&evidence.status==='rejected')),'Exit status and recorded production outcome disagree');
 }
 return combined;
}
const accepted=result=>{must(result.process.code===0&&result.evidence.status==='passed'&&!result.evidence.sync?.busy,'Expected accepted production operation');return result.evidence;};
const rejected=result=>{must(result.process.code===1&&result.evidence.status==='rejected','Expected explicit production rejection');return result.evidence;};
async function initialize(context,state=local,dbDir=context.dbDir){return accepted(await runWorker(context,{operation:'initialize',state,dbDir}));}
async function sync(context,extra={}){return runWorker(context,{operation:'sync',...extra});}
async function drain(context,extra={}){
 let latest;
 for(let i=0;i<6;i++){latest=accepted(await sync(context,extra));if(!latest.sync.more)break;}
 must(latest&&!latest.sync.more&&latest.after.outbox.length===0&&latest.after.meta.pending==null,'Production outbox did not drain');return latest.after;
}
async function observe(context,{requireLegacy=true,extraIds=['local-note'],compareProducer=true}={}){
 const dbDir=path.join(context.directory,'observer-db');await initialize(context,empty,dbDir);
 const audit=await drain(context,{dbDir});
 if(requireLegacy){
  must(hasLegacy(audit),'Independent observer is missing legacy records');
  must(audit.state.tasks.find(t=>t.id==='legacy-task')?.title==='旧云恢复 中文 🧭','Legacy title/UTF-8 content changed');
  must(audit.state.tasks.find(t=>t.id==='legacy-task')?.subtasks.some(t=>t.id==='legacy-child'&&t.title==='子任务'),'Legacy child relationship changed');
  must(audit.state.notes.find(n=>n.id==='legacy-note')?.body==='note\nrecovery','Legacy note content changed');
  must(audit.state.projects.find(p=>p.id==='legacy-project')?.description==='synthetic','Legacy project changed');
  must(audit.state.tags.includes('迁移')&&audit.state.places.includes('测试'),'Legacy tag/place content changed');
 }
 must(extraIds.every(id=>allIds(audit.state).includes(id)),'Independent observer is missing local records');
 must(new Set(allIds(audit.state)).size===allIds(audit.state).length,'Observer has duplicate domain IDs');
 if(compareProducer){
  const producer=accepted(await runWorker(context,{operation:'audit'})).after;
  must(JSON.stringify(domain(audit.state))===JSON.stringify(domain(producer.state)),'Independent observer and persisted producer states differ');
 }
 return audit;
}
async function inventory(context,label){const files=await context.server.readFiles();await fs.writeFile(path.join(context.directory,label+'-cloud.json'),JSON.stringify(files,null,2)+'\n');return files;}
async function test(id,{initialFiles=legacyFiles,faults=[]}={},body){
 const directory=path.join(root,id);await fs.mkdir(directory,{recursive:true});
 const server=await startMigrationServer({directory:path.join(directory,'cloud'),folder:'C006-'+id.replace(/[^a-zA-Z0-9]/g,'-'),initialFiles,faults});
 const context={id,directory,dbDir:path.join(directory,'producer-db'),server,operations:[]};
 let status='passed',error=null;
 try{await body(context);}catch(cause){status='failed';error=String(cause?.stack||cause);}
 finally{await server.flush();await inventory(context,'final');await server.close();}
 const result={id,platform:'javascript',status,error,sourceSha,operations:context.operations,faults:server.faults(),logPath:server.logPath};
 await fs.writeFile(path.join(directory,'case-result.json'),JSON.stringify(result,null,2)+'\n');results.push(result);
 process.stdout.write(JSON.stringify({id,status,error:error?.split('\n')[0]??null})+'\n');
}
const fixtureFault=(id,method,path,phase,effect)=>({id,method,path,phase,effect});

await test('C006-01-empty',{initialFiles:[]},async c=>{await initialize(c);await drain(c);await observe(c,{requireLegacy:false});const files=await inventory(c,'accepted');must(JSON.parse(files.find(f=>f.path==='state.json').text).backup===null,'Empty migration guard retained a backup');});
await test('C006-02-legacy',{},async c=>{
 await initialize(c);await drain(c);await observe(c);const files=await inventory(c,'accepted'),g=JSON.parse(files.find(f=>f.path==='state.json').text),b=files.find(f=>f.path===g.backup);
 must(b?.plainSha256===sha(Buffer.from(legacyText,'utf8')),'Immutable backup did not preserve original v1 bytes');
 const fence=c.server.entries.find(e=>e.method==='PUT'&&e.relative==='state.json');must(fence?.ifMatch==='"'+sha(Buffer.from(legacyText,'utf8'))+'"','Fence lacks original strong ETag condition');
});
for(const [id,pathOrPrefix,phase,effect] of [
 ['C006-03-backup-before','v2/legacy-','before-write',{status:500}],
 ['C006-04-backup-after','v2/legacy-','after-write',{disconnect:true}],
 ['C006-05-fence-before','state.json','before-write',{status:500}],
 ['C006-06-fence-after','state.json','after-write',{disconnect:true}],
 ['C006-27-manifest-before','v2/manifest.json','before-write',{status:500}],
 ['C006-28-manifest-after','v2/manifest.json','after-write',{disconnect:true}]
]){
 const fault={id,method:'PUT',phase,effect,...(pathOrPrefix.endsWith('-')?{pathPrefix:pathOrPrefix}:{path:pathOrPrefix})};
 await test(id,{faults:[fault]},async c=>{await initialize(c);const failed=rejected(await sync(c));must(failed.after.rows.some(r=>JSON.parse(r.key)[1]==='local-note'),'Failed migration lost local item');await inventory(c,'failure');await drain(c);await observe(c);must(c.server.faults()[0].used===1,'Planned fault was not actually exercised');});
}
for(const [id,replacement,expectedLegacy,extraIds] of [
 ['C006-07-reread-v1',{path:'state.json',body:legacy2Text},true,['local-note','legacy-concurrent']],
 ['C006-08-reread-missing',{path:'state.json',remove:true},false,['local-note']]
])await test(id,{faults:[fixtureFault(id,'PUT','state.json','before-conditions',{replace:[replacement]})]},async c=>{
 await initialize(c);await drain(c);await observe(c,{requireLegacy:expectedLegacy,extraIds});const files=await inventory(c,'accepted'),g=JSON.parse(files.find(f=>f.path==='state.json').text);
 must(c.server.entries.some(e=>e.relative==='state.json'&&e.status===412),'Expected real conditional conflict did not occur');
 if(!expectedLegacy)must(g.backup===null,'A stale failed-attempt backup leaked into a later empty fence');
});
for(const [id,replacement,requireLegacy] of [
 ['C006-09-appearing-v1',{path:'state.json',body:legacyText},true],
 ['C006-10-appearing-guard',{path:'state.json',body:guard(backupPath)},true],
 ['C006-11-appearing-empty',{path:'state.json',body:guard(null)},false]
])await test(id,{initialFiles:id.includes('10')?[{path:backupPath,body:legacyText}]:[],faults:[fixtureFault(id,'PUT','state.json','before-conditions',{replace:[replacement]})]},async c=>{await initialize(c);await drain(c);await observe(c,{requireLegacy});must(c.server.entries.some(e=>e.relative==='state.json'&&e.status===412),'Actual 412 was not observed');});
for(const [suffix,etag] of [['missing',null],['weak','weak']])await test('C006-13-etag-'+suffix,{faults:[fixtureFault('etag','GET','state.json','before',{etag})]},async c=>{
 await initialize(c);const out=rejected(await sync(c));must(business(out.before)===business(out.after),'ETag rejection changed business rows/outbox');must(!c.server.entries.some(e=>e.method==='PUT'),'ETag rejection attempted a write');
});
await test('C006-12-eight-conflicts',{faults:[{id:'eight-conflicts',method:'PUT',path:'state.json',phase:'before-write',times:8,effect:{status:412}}]},async c=>{
 await initialize(c);const failed=rejected(await sync(c));must(business(failed.before)===business(failed.after),'Fence contention changed business state');must(c.server.faults()[0].used===8,'Expected eight production fence attempts');must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Exhausted contention published manifest');await drain(c);await observe(c);
});
for(const status of [404,500])await test('C006-16-backup-'+status,{initialFiles:guardedFiles,faults:[fixtureFault('backup-get','GET',backupPath,'before',{status})]},async c=>{
 await initialize(c);const out=rejected(await sync(c));must(business(out.before)===business(out.after),'Backup error changed business rows/outbox');must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Backup error created manifest');await drain(c);await observe(c);
});
const correctGzip=gzipSync(Buffer.from(legacyText)),badCrc=Buffer.from(correctGzip);badCrc[badCrc.length-8]^=1;
for(const [suffix,backup] of [['truncated',{wireBase64:correctGzip.subarray(0,correctGzip.length-5).toString('base64')}],['crc',{wireBase64:badCrc.toString('base64')}],['json',{body:'{broken'}],['format',{body:JSON.stringify({format:'unknown',version:1,state:legacy})}]])await test('C006-17-'+suffix,{initialFiles:[{path:'state.json',body:guard(backupPath)},{path:backupPath,...backup}]},async c=>{
 await initialize(c);const out=rejected(await sync(c));must(business(out.before)===business(out.after),'Corrupt backup partially imported');must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Corrupt backup created manifest');await c.server.putFile({path:backupPath,body:legacyText});await drain(c);await observe(c);
});
for(const [suffix,value] of [['absent',undefined],['empty',''],['number',7],['array',[]],['object',{}],['traversal','v2/../state.json'],['url','https://example.invalid/state.json'],['query','v2/legacy-a.json.gz?x'],['fragment','v2/legacy-a.json.gz#x'],['directory','v2/child/legacy-a.json.gz'],['long','v2/legacy-'+'a'.repeat(160)+'.json.gz']])await test('C006-19-20-'+suffix,{initialFiles:[{path:'state.json',body:guard(value)}]},async c=>{
 await initialize(c);const out=rejected(await sync(c));must(business(out.before)===business(out.after),'Invalid guard changed business rows/outbox');must(!c.server.entries.some(e=>e.method==='PUT'),'Invalid guard attempted a write');
});
const oversized={...legacy,notes:Array.from({length:10001},(_,i)=>({id:'capacity-note-'+i,body:'synthetic',createdAt:'2026-01-01T00:00:00Z'}))};
await test('C006-18-capacity',{initialFiles:[{path:'state.json',body:guard(backupPath)},{path:backupPath,body:JSON.stringify({format:'gxtodo-sync',version:1,state:oversized})}]},async c=>{
 await initialize(c);const failed=rejected(await sync(c));must(business(failed.before)===business(failed.after),'Capacity rejection partially imported');must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Capacity rejection published manifest');
});
for(const [suffix,body] of [['format',JSON.stringify({format:'unknown',version:2,backup:null})],['string-version',JSON.stringify({format:'gxtodo-sync',version:'2',backup:null})],['version',JSON.stringify({format:'gxtodo-sync',version:3,backup:null})],['trailing',guard(null)+'junk'],['nul','{"format":"gxtodo-sync","version":2,"backup":null,"message":"\\u0000"}']])await test('C006-21-'+suffix,{initialFiles:[{path:'state.json',body}]},async c=>{
 await initialize(c);const failed=rejected(await sync(c));must(business(failed.before)===business(failed.after),'Malformed envelope changed business state');must(!c.server.entries.some(e=>e.method==='PUT'),'Malformed envelope attempted PUT');
});
const winningManifest=JSON.stringify({format:'gxtodo-delta',version:2,epoch:'winning-epoch',heads:{},snapshot:null,legacy:backupPath});
for(const mode of ['valid','missing','malformed','weak']){
 const faults=[fixtureFault('manifest-race','PUT','v2/manifest.json','before-conditions',{replace:[{path:'v2/manifest.json',body:mode==='malformed'?'{}':winningManifest}]})];
 if(mode==='missing')faults.push({...fixtureFault('winner-read','GET','v2/manifest.json','before',{replace:[{path:'v2/manifest.json',remove:true}]}),at:4});
 if(mode==='weak')faults.push({...fixtureFault('winner-read','GET','v2/manifest.json','before',{etag:'weak'}),at:4});
 await test((mode==='valid'?'C006-22':'C006-23')+'-winner-'+mode,{faults},async c=>{
  await initialize(c);const first=await sync(c);
  must(c.server.entries.some(e=>e.method==='PUT'&&e.relative==='v2/manifest.json'&&e.status===412),'Winner race did not generate a real 412');
  if(mode==='valid'){const passed=accepted(first);must(passed.after.meta.epoch==='winning-epoch','Losing epoch was used');await observe(c);}
  else{const failed=rejected(first);must(failed.after.outbox.length>0,'Invalid winner dropped imported durable outbox');await c.server.putFile({path:'v2/manifest.json',body:winningManifest});await drain(c);await observe(c);}
 });
}

// Real process kill rows use original SQLite files; production lease is never edited.
for(const [id,gate,crossDevice] of [
 ['C006-24-kill-after-backup',{phase:'after-request',method:'PUT',pathPrefix:'v2/legacy-'},false],
 ['C006-25-kill-after-fence',{phase:'after-request',method:'PUT',path:'state.json'},false],
 ['C006-26-kill-after-import',{phase:'after-call',action:'commit',containsKey:JSON.stringify(['notes','legacy-note'])},false],
 ['C006-29-kill-after-manifest',{phase:'after-request',method:'PUT',path:'v2/manifest.json'},false],
 ['C006-30-fresh-takeover',{phase:'after-request',method:'PUT',path:'v2/manifest.json'},true],
 ['C006-31-kill-after-batch',{phase:'after-request',method:'PUT',pathPrefix:'v2/b-'},false]
])await test(id,{},async c=>{
 await initialize(c);const killed=await runWorker(c,{operation:'sync',gate},{killAtGate:true});await inventory(c,'interrupted');
 if(crossDevice){await observe(c,{extraIds:[],compareProducer:false});return;}
 const busy=await sync(c);must(busy.process.code===0&&busy.evidence.sync?.busy===true,'Restart ignored unexpired production lease');
 must(busy.evidence.after.databaseFile===killed.evidence.gate.audit.databaseFile&&busy.evidence.after.meta.actor===killed.evidence.gate.audit.meta.actor,'Restart changed SQLite database identity');
 const remaining=killed.evidence.gate.audit.meta.lease.until-Date.now()+100;
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
 await drain(c);await observe(c);
});
for(const [id,base] of [['C006-34-delete-with-base',legacy],['C006-35-delete-without-base',null]])await test(id,{initialFiles:guardedFiles},async c=>{
 await initialize(c,legacy);accepted(await runWorker(c,{operation:'edit',changes:[{key:JSON.stringify(['notes','legacy-note']),values:{_deleted:true}}]}));
 const out=await drain(c,{legacyBase:base}),deleted=out.rows.find(r=>r.key===JSON.stringify(['notes','legacy-note']));
 must(deleted?.deleted===true,'Legacy recovery resurrected a local tombstone');
 const observer=await observe(c,{requireLegacy:false,extraIds:[]});must(!allIds(observer.state).includes('legacy-note'),'Observer received resurrected deleted legacy item');
});
await test('C006-32-two-migrators',{},async c=>{
 await initialize(c);const second=path.join(c.directory,'second-producer');await initialize(c,{...empty,notes:[{id:'local-second',body:'second device',createdAt:'2026-01-04T00:00:00Z'}]},second);
 const attempts=await Promise.all([sync(c),sync(c,{dbDir:second})]);attempts.forEach(accepted);
 await drain(c);await drain(c,{dbDir:second});await drain(c);await observe(c,{extraIds:['local-note','local-second']});
 const files=await c.server.readFiles(),manifest=JSON.parse(files.find(f=>f.path==='v2/manifest.json').text);
 for(const attempt of attempts)must(attempt.evidence.after.meta.epoch===manifest.epoch,'Concurrent migrator retained a losing epoch');
});
await test('C006-33-three-way-base',{},async c=>{
 const modified=structuredClone(legacy);modified.notes[0].body='local one-field edit';modified.notes.push(...local.notes);
 await initialize(c,modified);await drain(c,{legacyBase:legacy});const observed=await observe(c,{requireLegacy:false});
 must(hasLegacy(observed)&&observed.state.notes.find(n=>n.id==='legacy-note').body==='local one-field edit','Three-way merge lost local change or old cloud entries');
});
await test('C006-36-edit-during-retry',{faults:[fixtureFault('manifest-before','PUT','v2/manifest.json','before-write',{status:500})]},async c=>{
 await initialize(c);rejected(await sync(c));accepted(await runWorker(c,{operation:'edit',changes:[{key:JSON.stringify(['notes','legacy-note']),values:{_deleted:true}},{key:JSON.stringify(['tasks','legacy-task']),values:{title:'edited during interruption'}}]}));
 const resumed=await drain(c);must(resumed.rows.find(r=>JSON.parse(r.key)[1]==='legacy-note')?.deleted,'Migration retry resurrected deletion made during interruption');must(resumed.state.tasks.find(t=>t.id==='legacy-task')?.title==='edited during interruption','Migration retry lost interruption-time edit');
 await observe(c,{requireLegacy:false});
});
await test('C006-37-conflict-retry',{initialFiles:[{path:'state.json',body:JSON.stringify({format:'gxtodo-sync',version:1,state:{...legacy,notes:[{...legacy.notes[0],body:'remote changed'}]}})}],faults:[fixtureFault('manifest-before','PUT','v2/manifest.json','before-write',{status:500})]},async c=>{
 const modified=structuredClone(legacy);modified.notes[0].body='local changed';await initialize(c,modified);
 rejected(await sync(c,{legacyBase:legacy}));const resumed=await drain(c,{legacyBase:legacy});
 const conflicts=resumed.state.notes.filter(n=>n.id.startsWith('conflict-'));must(conflicts.length===1&&conflicts[0].body==='[同步冲突副本]\nremote changed','Retry duplicated or lost deterministic conflict copy');must(resumed.state.notes.find(n=>n.id==='legacy-note')?.body==='local changed','Retry lost local conflict branch');await observe(c,{requireLegacy:false,extraIds:[]});
});
await test('C006-38-v2-delete-after-migration',{},async c=>{
 await initialize(c);await drain(c);accepted(await runWorker(c,{operation:'edit',changes:[{key:JSON.stringify(['notes','legacy-note']),values:{_deleted:true}}]}));await drain(c);
 const observed=await observe(c,{requireLegacy:false});must(!allIds(observed.state).includes('legacy-note'),'Historical backup replay resurrected a subsequent v2 deletion');must(observed.rows.find(r=>JSON.parse(r.key)[1]==='legacy-note')?.deleted,'Fresh observer did not retain published tombstone');
});
await test('C006-39-import-marker-atomic',{},async c=>{
 await initialize(c);accepted(await runWorker(c,{operation:'migration-sql-fault',enabled:true}));const failed=rejected(await sync(c));
 must(failed.error.includes('C006_IMPORT_MARKER_FAILURE'),'Actual SQLite marker write failure did not occur');
 must(business(failed.before)===business(failed.after)&&!failed.after.meta.legacyMigration,'Import events or marker escaped the aborted production transaction');
 must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Failed atomic import published manifest');
 accepted(await runWorker(c,{operation:'migration-sql-fault',enabled:false}));await drain(c);await observe(c);
});
await test('C006-40-import-marker-repeat',{faults:[{id:'two-manifest-failures',method:'PUT',path:'v2/manifest.json',phase:'before-write',times:2,effect:{status:500}}]},async c=>{
 await initialize(c);const first=rejected(await sync(c));must(first.after.meta.legacyMigration?.sha256===sha(Buffer.from(legacyText)),'Successful import did not durably record actual backup digest');
 accepted(await runWorker(c,{operation:'edit',changes:[{key:JSON.stringify(['notes','legacy-note']),values:{body:'new local edit after import'}}]}));
 const beforeRetry=accepted(await runWorker(c,{operation:'audit'})).after,second=rejected(await sync(c));
 must(second.after.meta.seq===beforeRetry.meta.seq&&second.after.meta.queue===beforeRetry.meta.queue&&business(second.before)===business(second.after),'Matching import marker replayed legacy events or changed local edit');
 must(second.after.meta.legacyMigration.sha256===first.after.meta.legacyMigration.sha256,'Retry changed the migration marker');
 await drain(c);const observed=await observe(c,{requireLegacy:false});must(observed.state.notes.find(n=>n.id==='legacy-note').body==='new local edit after import','Retry overwrote a post-import local edit');
});
await test('C006-41-import-backup-tamper',{faults:[fixtureFault('manifest-before','PUT','v2/manifest.json','before-write',{status:500})]},async c=>{
 await initialize(c);const first=rejected(await sync(c)),files=await c.server.readFiles(),backup=JSON.parse(files.find(f=>f.path==='state.json').text).backup;
 must(first.after.meta.legacyMigration?.backup===backup,'Import marker did not bind the selected backup');
 await c.server.putFile({path:backup,body:legacy2Text});const second=rejected(await sync(c));
 must(second.error.includes('备份内容已改变'),'Immutable backup tamper was not explicitly rejected');must(business(second.before)===business(second.after),'Tampered backup changed local business data');must(!(await c.server.readFiles()).some(f=>f.path==='v2/manifest.json'),'Tampered backup produced manifest');
});
const summary={suite:'C006 real JavaScript legacy migration',sourceSha,executed:results.length,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,
 platformsExecuted:['javascript'],notExecuted:['windows-native (separate runner required)','android (integration required)'],results:results.map(({id,status,error})=>({id,status,error}))};
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
process.stdout.write(JSON.stringify(summary)+'\n');process.exitCode=summary.failed?1:0;
