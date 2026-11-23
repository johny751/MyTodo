import fs from 'node:fs/promises';
import path from 'node:path';
import {fork,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cloudOnly,confined,startMigrationServer,sha} from '../c006-harness/fixture-server.mjs';

cloudOnly();
const argv=process.argv.slice(2),option=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1];};
const sourceRoot=process.cwd(),root=confined(option('--output'));
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sourceSha!==process.env.EXPECTED_SOURCE_SHA||!/^[0-9a-f]{40}$/.test(sourceSha))throw Error('Exact source SHA is required');
execFileSync('git',['diff','--exit-code','HEAD','--','src','windows','android']);
await fs.mkdir(root,{recursive:true});
const worker=fileURLToPath(new URL('./js-worker.mjs',import.meta.url)),results=[];
const empty={version:1,tasks:[],notes:[],projects:[],tags:[],places:[]};
const legacy={...empty,tasks:[{id:'legacy-task',title:'旧云恢复 🧭',createdAt:'2026-01-01T00:00:00Z',subtasks:[{id:'legacy-child',title:'子任务',createdAt:'2026-01-01T00:00:00Z'}]}],notes:[{id:'legacy-note',body:'legacy body',createdAt:'2026-01-01T00:00:00Z'}],projects:[{id:'legacy-project',name:'synthetic project',description:'retained'}],tags:['迁移'],places:['测试']};
const local={...empty,notes:[{id:'local-note',body:'local survives',createdAt:'2026-01-02T00:00:00Z'}]};
const legacyText=JSON.stringify({format:'gxtodo-sync',version:1,state:legacy});
const legacyKey=JSON.stringify(['notes','legacy-note']),localKey=JSON.stringify(['notes','local-note']);
const must=(condition,message)=>{if(!condition)throw Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const domain=state=>Object.fromEntries(Object.entries(state).filter(([key])=>key!=='settings'));
const retained=audit=>audit.rows.map(({key,record,deleted})=>({key,record,deleted})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
function imported(audit,{deletedNote=false,localBody='local survives'}={}){
 const task=audit.state.tasks.find(t=>t.id==='legacy-task');
 must(task?.title==='旧云恢复 🧭'&&task.subtasks.some(t=>t.id==='legacy-child'&&t.title==='子任务'),'Imported task tree is incomplete');
 must(audit.state.projects.find(p=>p.id==='legacy-project')?.description==='retained'&&audit.state.tags.includes('迁移')&&audit.state.places.includes('测试'),'Imported project/tag/place content is incomplete');
 must(audit.state.notes.find(n=>n.id==='local-note')?.body===localBody,'Local note was lost or changed');
 if(deletedNote)must(!audit.state.notes.some(n=>n.id==='legacy-note')&&audit.rows.find(r=>r.key===legacyKey)?.deleted,'Concurrent legacy-note tombstone is missing');
 else must(audit.state.notes.find(n=>n.id==='legacy-note')?.body==='legacy body','Imported legacy note content is incomplete');
}
let sequence=0;
async function runWorker(context,spec,{killAtGate=false,onGate=null}={}){
 const ordinal=++sequence,specFile=path.join(context.directory,'worker-'+ordinal+'.json'),output=path.join(context.directory,'result-'+ordinal+'.json');
 const full={sourceRoot,caseId:context.id,dbDir:context.dbDir,origin:context.server.origin,folder:context.server.folder,...spec,output};
 await fs.writeFile(specFile,JSON.stringify(full,null,2)+'\n');
 const processResult=await new Promise(resolve=>{
  const child=fork(worker,[specFile],{cwd:sourceRoot,env:process.env,stdio:['ignore','pipe','pipe','ipc'],execArgv:['--experimental-sqlite']});
  let stdout='',stderr='',gate=null,killed=false,timedOut=false,spawnError=null,callbackError=null,gateTask=Promise.resolve();
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},90000);
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',e=>spawnError=String(e));
  child.on('message',message=>{
   if(message.type!=='gate')return;
   if(gate){callbackError='Unexpected second selected gate';child.kill('SIGKILL');return;}
   gate=message;
   if(killAtGate){killed=child.kill('SIGKILL');return;}
   if(!onGate){callbackError='No controller for resumable gate';child.kill('SIGKILL');return;}
   gateTask=(async()=>{try{await onGate(message);child.send({type:'resume',caseId:context.id});}catch(error){callbackError=String(error?.stack||error);child.kill('SIGKILL');}})();
  });
  child.on('close',async(code,signal)=>{clearTimeout(timer);await gateTask;resolve({pid:child.pid,code,signal,stdout,stderr,gate,killed,timedOut,spawnError,callbackError});});
 });
 const evidence=await fs.readFile(output,'utf8').then(JSON.parse).catch(()=>null),combined={specFile,output,process:processResult,evidence};
 context.operations.push(combined);await fs.writeFile(path.join(context.directory,'process-'+ordinal+'.json'),JSON.stringify(combined,null,2)+'\n');
 must(!processResult.spawnError&&!processResult.timedOut&&!processResult.callbackError,'Worker/gate failed: '+(processResult.callbackError||processResult.spawnError||'timeout'));
 if(killAtGate)must(processResult.killed&&processResult.signal==='SIGKILL'&&processResult.code===null&&evidence?.status==='paused-at-gate','Actual SIGKILL at selected gate was not evidenced');
 else must(processResult.signal===null&&((processResult.code===0&&evidence?.status==='passed')||(processResult.code===1&&evidence?.status==='rejected')),'Child exit and production result disagree');
 if(onGate)must(processResult.gate,'Concurrent edit gate was not reached');
 must(evidence.sourceSha===sourceSha&&evidence.pid===processResult.pid,'Evidence provenance mismatch');
 return combined;
}
const accepted=result=>{must(result.process.code===0&&result.evidence.status==='passed'&&!result.evidence.sync?.busy,'Expected accepted production operation');return result.evidence;};
const rejected=result=>{must(result.process.code===1&&result.evidence.status==='rejected','Expected explicit production rejection');return result.evidence;};
const initialize=async(c,state=local,dbDir=c.dbDir)=>accepted(await runWorker(c,{operation:'initialize',state,dbDir}));
const audit=async(c,dbDir=c.dbDir)=>accepted(await runWorker(c,{operation:'audit',dbDir}));
async function drain(c,dbDir=c.dbDir){
 let latest;
 for(let n=0;n<6;n++){latest=accepted(await runWorker(c,{operation:'sync',dbDir}));if(!latest.sync.more)break;}
 must(latest&&!latest.sync.more&&latest.after.outbox.length===0&&!latest.after.meta.pending,'Outbox did not drain');return latest.after;
}
async function inventory(c,label){const files=await c.server.readFiles();await fs.writeFile(path.join(c.directory,label+'-cloud.json'),JSON.stringify(files,null,2)+'\n');return files;}
async function expectCloud(c,expected){
 const files=await inventory(c,'accepted'),guard=JSON.parse(files.find(f=>f.path==='state.json').text),backup=files.find(f=>f.path===guard.backup);
 must(backup?.plainSha256===sha(Buffer.from(legacyText)),'Immutable backup bytes changed');
 const manifest=JSON.parse(files.find(f=>f.path==='v2/manifest.json').text);
 must(manifest.snapshot?.parts?.length>0,'Migration did not publish a referenced recovery snapshot');
 for(const part of manifest.snapshot.parts){const actual=files.find(f=>f.path===part.path);must(actual?.plainSha256===part.sha256,'Referenced snapshot is missing or digest differs');}
 const published=[];
 for(const file of files.filter(f=>f.path.startsWith('v2/b-'))){const batch=JSON.parse(file.text);if(batch.index<=(manifest.heads[batch.device]||0))published.push(...batch.events);}
 for(const entry of expected.outbox)must(published.some(event=>same(event,entry.event)),'Original durable outbox event was not published unchanged');
 return files;
}
async function observer(c,expected){
 const dbDir=path.join(c.directory,'fresh-observer');await initialize(c,empty,dbDir);const actual=await drain(c,dbDir);
 must(same(domain(actual.state),domain(expected.state)),'Fresh observer domain differs from producer');
 must(same(retained(actual),retained(expected)),'Fresh observer lost retained events or tombstones');
 return actual;
}
async function test(id,{faults=[]}={},body){
 const directory=path.join(root,id);await fs.mkdir(directory,{recursive:true});
 const server=await startMigrationServer({directory:path.join(directory,'cloud'),folder:id,initialFiles:[{path:'state.json',body:legacyText}],faults});
 const c={id,directory,dbDir:path.join(directory,'producer-db'),server,operations:[]};let status='passed',error=null;
 try{await body(c);}catch(cause){status='failed';error=String(cause?.stack||cause);}finally{await server.flush();await inventory(c,'final');await server.close();}
 const result={id,platform:'javascript',sourceSha,status,error,operations:c.operations,faults:server.faults(),logPath:server.logPath};
 await fs.writeFile(path.join(directory,'case-result.json'),JSON.stringify(result,null,2)+'\n');results.push(result);process.stdout.write(JSON.stringify({id,status,error})+'\n');
}

for(const [id,phase,effect,persisted] of [
 ['C006-B42-snapshot-before','before-write',{status:500},false],
 ['C006-B43-snapshot-disconnect','after-write',{disconnect:true},true]
])await test(id,{faults:[{id,method:'PUT',pathPrefix:'v2/s-',phase,effect}]},async c=>{
 await initialize(c);const failed=rejected(await runWorker(c,{operation:'sync'})),files=await inventory(c,'failure');
 must(c.server.faults()[0].used===1,'Selected snapshot fault was not exercised');
 must(!files.some(f=>f.path==='v2/manifest.json'),'Failed initial snapshot published a manifest');
 must(failed.after.meta.legacyMigration?.sha256===sha(Buffer.from(legacyText)),'Import marker was not committed before snapshot failure');
 must(failed.after.rows.some(r=>r.key===legacyKey&&!r.deleted)&&failed.after.outbox.length>0,'Failed snapshot lost imported rows or outbox');
 imported(failed.after);
 const request=c.server.entries.find(e=>e.faults.some(f=>f.id===id));
 must(request?.writeCommitted===persisted&&request.disconnected===persisted,'Actual snapshot write/disconnect boundary differs');
 const part=files.find(f=>f.path===request.relative);
 must(persisted?part?.plainSha256===request.request.plainSha256:!part,'Snapshot bytes do not match the selected boundary');
 const resumed=await drain(c);
 must(resumed.databaseFile===failed.after.databaseFile&&resumed.meta.actor===failed.after.meta.actor,'Failure retry changed database identity');
 must(resumed.meta.seq===failed.after.meta.seq&&resumed.meta.queue===failed.after.meta.queue&&same(retained(resumed),retained(failed.after)),'Snapshot retry reimported events or altered retained rows');
 const finalFiles=await expectCloud(c,failed.after);
 if(persisted)must(finalFiles.find(f=>f.path===part.path)?.wireSha256===part.wireSha256,'Retry overwrote persisted immutable orphan snapshot');
 await observer(c,resumed);
});

await test('C006-B44-kill-after-snapshot',{},async c=>{
 await initialize(c);const killed=await runWorker(c,{operation:'sync',gate:{phase:'after-request',method:'PUT',pathPrefix:'v2/s-'}},{killAtGate:true});
 const saved=killed.evidence.gate.audit,files=await inventory(c,'interrupted'),part=files.find(f=>f.path===killed.evidence.gate.input.path);
 must(part&&saved.meta.legacyMigration&&saved.rows.some(r=>r.key===legacyKey&&!r.deleted),'Kill gate precedes durable import/snapshot');
 imported(saved);
 const upload=c.server.entries.find(e=>e.method==='PUT'&&e.relative===part.path&&e.writeCommitted&&[200,201,204].includes(e.status));
 must(upload&&part.plainSha256===upload.request.plainSha256,'Killed snapshot does not match successful actual PUT bytes');
 must(!files.some(f=>f.path==='v2/manifest.json')&&!c.server.entries.some(e=>e.method==='PUT'&&e.relative==='v2/manifest.json'),'Manifest publication preceded the selected snapshot gate');
 const reopened=await audit(c);
 must(reopened.pid!==killed.evidence.pid&&reopened.after.databaseFile===saved.databaseFile&&same(reopened.after.raw,saved.raw),'New process did not reopen the exact killed SQLite state');
 const busy=await runWorker(c,{operation:'sync'});
 must(busy.process.code===0&&busy.evidence.sync?.busy===true&&same(busy.evidence.after.raw,saved.raw),'Unexpired real lease was ignored or mutated');
 // Wait for the original wall-clock lease without changing production time or metadata.
 let remaining=saved.meta.lease.until-Date.now()+100;
 while(remaining>0){await new Promise(resolve=>setTimeout(resolve,Math.min(remaining,30000)));remaining=saved.meta.lease.until-Date.now()+100;}
 const resumed=await drain(c);
 must(resumed.databaseFile===saved.databaseFile&&resumed.meta.actor===saved.meta.actor&&resumed.meta.seq===saved.meta.seq&&resumed.meta.queue===saved.meta.queue,'Same-database resume reimported or changed actor');
 must(same(retained(resumed),retained(saved)),'Kill recovery changed durable records');
 const finalFiles=await expectCloud(c,saved);
 must(finalFiles.find(f=>f.path===part.path)?.wireSha256===part.wireSha256,'Kill recovery overwrote immutable snapshot');
 await observer(c,resumed);
});

await test('C006-B45-real-edit-cas',{},async c=>{
 await initialize(c);let concurrent=null,gateAudit=null;
 const resumed=accepted(await runWorker(c,{operation:'sync',gate:{phase:'before-call',action:'commit',containsKey:legacyKey,resume:true}},
  {onGate:async message=>{
   gateAudit=message.gate.audit;
   concurrent=accepted(await runWorker(c,{operation:'edit',changes:[{key:legacyKey,values:{_deleted:true}},{key:localKey,values:{body:'concurrent edit survives'}}]}));
   must(concurrent.pid!==message.pid&&concurrent.after.databaseFile===gateAudit.databaseFile&&concurrent.after.meta.actor===gateAudit.meta.actor,'Concurrent editor did not use a second process on the same SQLite');
   must(concurrent.after.meta.revision>message.gate.input.expected,'Concurrent edit did not advance actual SQLite revision');
  }}));
 const failedCAS=resumed.commitTrace.find(e=>e.expected===resumed.gate.input.expected&&e.rows.some(row=>row.key===legacyKey)&&e.outcome.ok===false);
 must(failedCAS&&same(failedCAS.observed.raw,concurrent.after.raw),'The paused import did not hit a real failed CAS without partial writes');
 const final=await drain(c);
 must(final.rows.find(r=>r.key===legacyKey)?.deleted===true,'Stale import changes resurrected the concurrent tombstone');
 must(final.state.notes.find(n=>n.id==='local-note')?.body==='concurrent edit survives','Import retry lost concurrent local edit');
 imported(final,{deletedNote:true,localBody:'concurrent edit survives'});
 must(final.meta.legacyMigration?.sha256===sha(Buffer.from(legacyText)),'Successful retried import lacks atomic marker');
 must(resumed.commitTrace.some(e=>e.expected>=concurrent.after.meta.revision&&e.outcome.ok===true&&e.meta.legacyMigration&&e.rows.some(row=>row.key!==legacyKey)),'Import did not recompute and commit after concurrent revision');
 must(same(final.meta.legacyMigration,resumed.after.meta.legacyMigration),'Migration marker changed after successful retry');
 await expectCloud(c,concurrent.after);await observer(c,final);
});

const summary={suite:'C006 supplementary initial snapshot and real edit CAS',sourceSha,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 executed:results.length,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,
 scope:'Four real Node SQLite/HTTP/process tests only; supplements rather than replaces frozen C006 evidence',results:results.map(({id,status,error})=>({id,status,error}))};
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');process.stdout.write(JSON.stringify(summary)+'\n');process.exitCode=summary.failed?1:0;
