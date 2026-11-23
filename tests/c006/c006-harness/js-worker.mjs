import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {cloudOnly,confined,sha} from './fixture-server.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
cloudOnly();
const spec=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const sourceRoot=path.resolve(spec.sourceRoot),dbDir=confined(spec.dbDir),output=confined(spec.output);
if(!/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SOURCE_SHA||''))throw Error('Exact expected source SHA is required');
await fs.mkdir(dbDir,{recursive:true});await fs.mkdir(path.dirname(output),{recursive:true});
const load=file=>import(pathToFileURL(path.join(sourceRoot,file)).href);
const [{createSQLiteStore},{syncDelta},{editReplica},{normalizeState}]=await Promise.all([
 load('src/sqlite-store.mjs'),load('src/delta-sync.mjs'),load('src/replica.mjs'),load('src/model.mjs')]);
const coreFiles=['src/sqlite-store.mjs','src/delta-sync.mjs','src/replica.mjs','src/sync-core.mjs','src/model.mjs'];
const hashes=Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,sha(await fs.readFile(path.join(sourceRoot,file)))])));
const store=createSQLiteStore(dbDir),dbFile=path.join(dbDir,'tasks.sqlite');
const audit=()=>{
 const sql=new DatabaseSync(dbFile);
 try{
  const raw={meta:sql.prepare('SELECT * FROM meta ORDER BY id').all(),entities:sql.prepare('SELECT * FROM entities ORDER BY key').all(),outbox:sql.prepare('SELECT * FROM outbox ORDER BY id').all()};
  const integrity=sql.prepare('PRAGMA integrity_check').all();
  if(integrity.some(row=>row.integrity_check!=='ok'))throw Error('SQLite integrity failed');
  return {databaseFile:dbFile,raw,integrity,meta:JSON.parse(raw.meta[0].value),rows:raw.entities.map(r=>({key:r.key,data:JSON.parse(r.data),record:JSON.parse(r.record),deleted:!!r.deleted,conflicts:JSON.parse(r.conflicts)})),outbox:raw.outbox.map(r=>({id:r.id,event:JSON.parse(r.event)})),state:store.read()};
 }finally{sql.close();}
};
const result={platform:'javascript',pid:process.pid,caseId:spec.caseId,operation:spec.operation,sourceSha:process.env.EXPECTED_SOURCE_SHA,
 coreHashes:hashes,node:process.version,sqlite:process.versions.sqlite,started:new Date().toISOString(),status:'running',before:audit()};
const save=async()=>fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
let gateSeen=0;
const gate=async(phase,input,outcome=null)=>{
 const selected=spec.gate;
 if(!selected||selected.phase!==phase||selected.method&&selected.method!==input.method||selected.path&&selected.path!==input.path||selected.pathPrefix&&!input.path?.startsWith(selected.pathPrefix)||selected.action&&selected.action!==input.action)return;
 if(selected.containsKey&&!input.rows?.some(row=>row.key===selected.containsKey))return;
 gateSeen++;if(gateSeen!==(selected.at??1))return;
 result.gate={...selected,observedAt:new Date().toISOString(),pid:process.pid,input:{method:input.method,path:input.path,action:input.action},outcome,audit:audit()};
 result.status='paused-at-gate';await save();
 if(!process.send)throw Error('A real parent IPC channel is required for process gates');
 process.send({type:'gate',pid:process.pid,caseId:spec.caseId,output,gate:result.gate});
 // Keep an actual child process alive until the parent terminates it at this gate.
 await new Promise(()=>{setInterval(()=>{},1000);});
};
const call=async input=>{await gate('before-call',input);const value=store.call(input);if(input.action!=='commit'||value.ok)await gate('after-call',input,input.action==='commit'?{ok:value.ok,revision:value.revision}:null);return value;};
const request=async input=>{
 await gate('before-request',input);
 const origin=new URL(spec.origin);
 if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Only loopback origin is allowed');
 if(!/^[a-zA-Z0-9_-]{1,60}$/.test(spec.folder)||!['GET','PUT','MKCOL'].includes(input.method)||! /^(state\.json|v2\/|v2\/[a-zA-Z0-9_.-]+)$/.test(input.path))throw Error('Unsafe fixture request');
 const headers={};
 if(input.etag)headers[input.method==='GET'?'If-None-Match':'If-Match']=input.etag;
 else if(input.method==='PUT')headers['If-None-Match']='*';
 let body;if(input.body!=null){body=Buffer.from(input.body,'utf8');if(input.path.endsWith('.gz'))body=gzipSync(body);}
 const response=await fetch(origin.origin+'/dav/'+spec.folder+'/'+input.path,{method:input.method,headers,body,signal:AbortSignal.timeout(15000)});
 const wire=Buffer.from(await response.arrayBuffer()),plain=input.path.endsWith('.gz')&&wire.length&&response.status===200?gunzipSync(wire):wire;
 const value={status:response.status,etag:response.headers.get('etag'),body:plain.toString('utf8')};
 if(input.method!=='PUT'||[200,201,204].includes(value.status))await gate('after-request',input,{status:value.status,etag:value.etag});return value;
};
let exitCode=0;
try{
 if(spec.operation==='initialize'){
  if(result.before.meta.initialized||result.before.rows.length||result.before.outbox.length)throw Error('Initialization requires a new database');
  await store.initialize(normalizeState(spec.state));
 }else if(spec.operation==='edit'){
  await editReplica(call,spec.changes,spec.settings);
 }else if(spec.operation==='migration-sql-fault'){
  // Persistent real SQLite trigger intercepts the production connection too.
  const sql=new DatabaseSync(dbFile);
  try{
   sql.exec('DROP TRIGGER IF EXISTS c006_import_marker_failure');
   if(spec.enabled)sql.exec("CREATE TRIGGER c006_import_marker_failure BEFORE UPDATE ON meta WHEN json_extract(NEW.value,'$.legacyMigration') IS NOT NULL BEGIN SELECT RAISE(ABORT,'C006_IMPORT_MARKER_FAILURE'); END");
  }finally{sql.close();}
 }else if(spec.operation==='sync'){
  result.sync=await syncDelta({call,request,scope:JSON.stringify(['c006-synthetic',spec.folder]),legacyBase:spec.legacyBase??null,snapshots:false,maxBatches:12});
 }else if(spec.operation!=='audit')throw Error('Unknown C006 worker operation');
 result.status='passed';
}catch(error){exitCode=1;result.status='rejected';result.error=String(error?.stack||error);}
finally{result.after=audit();result.finished=new Date().toISOString();await save();store.close();}
process.stdout.write(JSON.stringify({caseId:result.caseId,operation:result.operation,status:result.status,busy:result.sync?.busy??false})+'\n');
process.exitCode=exitCode;
