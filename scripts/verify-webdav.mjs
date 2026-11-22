import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createSQLiteStore} from '../src/sqlite-store.mjs';
import {createSyncStore} from '../src/sync-server.mjs';
import {syncDelta} from '../src/delta-sync.mjs';
import {editReplica,entityKey} from '../src/replica.mjs';
import {emptyState} from '../src/sync-core.mjs';
import {seedState} from '../src/model.mjs';
if(process.argv.includes('--help')){console.log('Usage: node scripts/verify-webdav.mjs --data-dir <new isolated directory>\nRead {username,password,folder} from stdin; folder must start GxTodo-QA-. No credentials in command arguments. See docs/android-testing.md.');process.exit(0);}
if(process.argv[2]!=='--data-dir'||!process.argv[3]||process.argv.length!==4)throw Error('A new --data-dir is required');
const base=path.resolve(process.argv[3]);
await fs.mkdir(base); // Never overwrite an existing test directory.

let input='';for await(const chunk of process.stdin)input+=chunk;
const credentials=JSON.parse(input); input='';
if(!/^GxTodo-QA-[A-Za-z0-9-]+$/.test(credentials.folder))throw Error('Only isolated QA folders are allowed');
const report={folder:credentials.folder,startedAt:new Date().toISOString(),status:'running',steps:[],requests:[],checks:{}};
const stores=[];let next=0;
async function save(){await fs.writeFile(path.join(base,'result.json'),JSON.stringify(report,null,2));}
async function mark(step){report.steps.push({step,at:new Date().toISOString()});await save();console.log(step);}
async function pacedFetch(target,opts){
 const at=Math.max(Date.now(),next);next=at+2300;
 await new Promise(r=>setTimeout(r,Math.max(0,at-Date.now())));
 const response=await fetch(target,opts);
 report.requests.push({method:opts.method,path:new URL(target).pathname.split('/').slice(3).join('/'),status:response.status,requestBytes:opts.body?.length||0,etag:response.headers.get('etag'),at:new Date().toISOString()});
 return response;
}
async function device(name){
 const dir=path.join(base,name);await fs.mkdir(dir,{recursive:true});
 const store=createSQLiteStore(dir);stores.push(store);await store.initialize(emptyState());
 const sync=await createSyncStore(dir,{fetchImpl:pacedFetch});
 const config=await sync({op:'config-save',config:{...credentials,enabled:true,autoSync:false}});
 return {name,store,call:i=>store.call(i),request:i=>sync({op:'request',scope:config.scope,...i}),scope:config.scope,async edit(fn){const state=store.read();fn(state);await store.save(state);}};
}
const run=(d,extra={})=>syncDelta({call:d.call,request:d.request,scope:d.scope,snapshots:false,...extra});
async function converge(ds){
 for(let round=0;round<4;round++){
  const results=await Promise.all(ds.map(d=>run(d)));
  const m=JSON.parse((await ds[0].request({method:'GET',path:'v2/manifest.json'})).body);
  if(ds.every(d=>{const {meta,entries}=d.call({action:'outbox'});return !entries.length&&!meta.pending&&Object.entries(m.heads).every(([id,n])=>meta.cursors[id]===n);}))return m;
 }
 throw Error('Convergence did not complete after four rounds');
}
const note=(id,body)=>({id,body,createdAt:'2026-10-19T00:00:00Z'});
const task=(id,title)=>({...structuredClone(seedState('2026-10-19').tasks[0]),id,title,reminderAt:null,reminder:null,subtasks:[]});
function equalAll(ds){const expected=ds[0].store.read();for(const d of ds)assert.deepEqual(d.store.read(),expected);return expected;}
try{
 const ds=[];for(let i=0;i<6;i++)ds.push(await device('device-'+(i+1)));
 // Fail closed if the random folder happens to have been used already.
 const absent=await ds[0].request({method:'GET',path:'v2/manifest.json'});assert.ok([404,409].includes(absent.status));
 for(let i=0;i<6;i++)await ds[i].edit(s=>{s.tasks.push(task('cloud-task-'+i,'Cloud-device-'+(i+1)));s.notes.push(note('cloud-note-'+i,'first-'+i));if(i===0)s.tasks.push(task('cloud-shared','Cloud-shared-base'));});
 await mark('Prepared six independent SQLite clients and a new isolated cloud folder');
 await run(ds[0]);
 await Promise.all(ds.slice(1).map(d=>run(d)));
 await converge(ds);let state=equalAll(ds);assert.equal(state.tasks.length,7);assert.equal(state.notes.length,6);
 report.checks.sixInitialAdds=true;await mark('Six-device concurrent additions converged: 7 tasks and 6 notes on every client');
 for(let i=0;i<6;i++)await ds[i].edit(s=>{
  s.tasks.find(t=>t.id==='cloud-task-'+i).title='Cloud-device-'+(i+1)+'-edited';s.notes.push(note('second-note-'+i,'second-'+i));
  if(i<2)s.tasks.find(t=>t.id==='cloud-shared').title=i===0?'Cloud-computer-version':'Cloud-phone-version';
  if(i===2)s.tasks.find(t=>t.id==='cloud-shared').notes='Independent-field-preserved';
  if(i===0)s.tasks=s.tasks.filter(t=>t.id!=='cloud-task-5');
 });
 await Promise.all(ds.slice(0,5).map(d=>run(d)));await run(ds[5]);
 await converge(ds);state=equalAll(ds);assert.equal(state.tasks.length,6);assert.equal(state.notes.length,12);
 assert.equal(state.tasks.find(t=>t.id==='cloud-shared').notes,'Independent-field-preserved');
 assert.ok(!state.tasks.some(t=>t.id==='cloud-task-5'));
 for(let i=0;i<5;i++)assert.equal(state.tasks.find(t=>t.id==='cloud-task-'+i).title,'Cloud-device-'+(i+1)+'-edited');
 const conflict=ds[0].call({action:'conflicts'}).find(c=>c.key===entityKey('tasks','cloud-shared')&&c.field==='title');
 assert.ok(conflict);assert.deepEqual(new Set(conflict.values.map(v=>v.value)),new Set(['Cloud-computer-version','Cloud-phone-version']));
 report.checks.interleavedEdits=true;report.checks.sameFieldConflict=true;report.checks.independentFieldMerge=true;report.checks.offlineEditDoesNotResurrectDeletion=true;
 await mark('Interleaved edits, offline sixth device, deletion and same-field conflict all converged');
 await editReplica(ds[0].call,[{key:entityKey('tasks','cloud-shared'),values:{title:'Cloud-resolved'}}]);
 await converge(ds);state=equalAll(ds);assert.equal(state.tasks.find(t=>t.id==='cloud-shared').title,'Cloud-resolved');
 for(const d of ds)assert.ok(!d.call({action:'conflicts'}).some(c=>c.key===entityKey('tasks','cloud-shared')));
 report.checks.explicitConflictResolution=true;await mark('Explicit conflict selection reached all six clients');
 await run(ds[0],{snapshots:true});
 const m=JSON.parse((await ds[0].request({method:'GET',path:'v2/manifest.json'})).body);assert.ok(m.snapshot?.parts.length);
 const fresh=await device('snapshot-client');await fresh.edit(s=>s.notes.push(note('bootstrap-local','Retained-offline-local')));
 const before=report.requests.length;await run(fresh);const bootRequests=report.requests.slice(before);
 assert.ok(bootRequests.some(r=>r.method==='GET'&&r.path.includes('/s-')));
 assert.ok(fresh.store.read().notes.some(n=>n.id==='bootstrap-local'));
 await converge([...ds,fresh]);state=equalAll([...ds,fresh]);assert.equal(state.notes.length,13);
 report.checks.realSnapshotBootstrap=true;report.checks.localEditsSurviveBootstrap=true;
 // Populate manifest cache after the snapshot and inspect a truly idle round.
 await run(ds[0]);const idleStart=report.requests.length;await run(ds[0]);const idle=report.requests.slice(idleStart);
 assert.equal(idle.length,1);assert.equal(idle[0].status,304);assert.equal(idle[0].method,'GET');
 report.checks.idleConditionalGet304=true;report.checks.concurrentConditionalWrite412=report.requests.some(r=>r.status===412);
 report.counts={tasks:state.tasks.length,notes:state.notes.length};report.status='passed';
 await mark('Snapshot bootstrap retained local edits; idle check used one HTTP 304 request');
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{for(const store of stores)store.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,requests:report.requests.length,checks:report.checks,counts:report.counts}));}
