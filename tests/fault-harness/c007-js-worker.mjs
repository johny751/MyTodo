import fs from 'node:fs/promises';
import {openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {editReplica,applyRemote} from '../../src/replica.mjs';
import {ensureDeltaAdapter} from '../protocol-harness/js-harness.mjs';
import {sqlFaultPlan,clearSqlFaults} from './c007-sql-faults.mjs';

// Draft: run only on GitHub; every invocation handles the SAME caller-supplied dbDir.
if(process.env.GITHUB_ACTIONS!=='true') throw Error('C007 runs only on GitHub Actions');
if(!globalThis.crypto) globalThis.crypto=webcrypto;
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
const sha = b=>createHash('sha256').update(b).digest('hex');
function confined(value){
  const root=path.resolve(process.env.RUNNER_TEMP||''),target=path.resolve(value||''),rel=path.relative(root,target);
  if(!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('C007 path must be under RUNNER_TEMP');
  return target;
}
const requestPath=confined(args.request),output=confined(args.output),spec=JSON.parse(await fs.readFile(requestPath,'utf8'));
const dbDir=confined(spec.dbDir),database=path.join(dbDir,'tasks.sqlite');
await fs.mkdir(path.dirname(output),{recursive:true});
const receipt={schema:'mytodo-c007-attempt',version:1,platform:'javascript',sourceSha:process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA,
  caseId:spec.caseId,attemptId:spec.attemptId,dbDir,operation:spec.operation,startedAt:new Date().toISOString(),status:'failed',
  processId:process.pid,node:process.version,sqlite:process.versions.sqlite,fault:spec.fault||{kind:'none'},faultHits:0};
const source=path.resolve('src/sqlite-store.mjs'),copy=path.resolve('src/.c007-store-'+randomUUID()+'.mjs');
let store,db,adapted=false,exitCode=1;
async function durable(file,value){const h=await fs.open(file,'wx');try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}finally{await h.close();}}
async function checkpoint(boundary){await durable(output+'.'+boundary+'.json',{...receipt,boundary,at:new Date().toISOString()});}
function audit(){
  // main. qualifies physical tables; this observer does not confuse TEMP fault views with stored content.
  return {meta:JSON.parse(db.prepare('SELECT value FROM main.meta WHERE id=1').get().value),
    rows:db.prepare('SELECT key,kind,id,data,record,deleted,conflicts FROM main.entities ORDER BY key').all().map(r=>({...r,data:JSON.parse(r.data),record:JSON.parse(r.record),conflicts:JSON.parse(r.conflicts)})),
    outbox:db.prepare('SELECT id,event FROM main.outbox ORDER BY id').all().map(r=>({id:r.id,event:JSON.parse(r.event)})),
    schema:db.prepare("SELECT type,name,sql FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()};
}
async function wireRequest(input){
  const url=new URL(spec.fixtureUrl);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||!['/',''].includes(url.pathname))throw Error('C007 only contacts its loopback fixture');
  if(!['GET','PUT','MKCOL'].includes(input.method)||!/^v2\/[A-Za-z0-9_.-]+$/.test(input.path))throw Error('C007 path/method not allowed');
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(spec.folder||''))throw Error('Unsafe fixture folder');
  const headers={};if(input.etag)headers[input.method==='GET'?'If-None-Match':'If-Match']=input.etag;
  else if(input.method==='PUT')headers['If-None-Match']='*';
  let body=input.body==null?undefined:Buffer.from(input.body,'utf8');
  if(body&&input.path.endsWith('.gz'))body=gzipSync(body);
  const r=await fetch(url.origin+'/dav/'+spec.folder+'/'+input.path,{method:input.method,headers,body,signal:AbortSignal.timeout(15000)});
  let bytes=Buffer.from(await r.arrayBuffer());if(r.status===200&&input.path.endsWith('.gz'))bytes=gunzipSync(bytes);
  return {status:r.status,etag:r.headers.get('etag'),body:bytes.toString('utf8')};
}
try{
  const expected=process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA;
  if(!/^[a-f0-9]{40}$/.test(expected||'')||spec.sourceSha!==expected)throw Error('Frozen source SHA differs');
  if(spec.mode==='init'){
    await fs.mkdir(dbDir,{recursive:true});
    try{await fs.access(database);throw Error('Refusing to initialize an existing database');}catch(e){if(e.code!=='ENOENT')throw e;}
  }else await fs.access(database);
  const original=await fs.readFile(source,'utf8'),needle='return {call,close:()=>db.close(),';
  if(original.split(needle).length!==2)throw Error('Store access seam changed; review instead of broad replacement');
  const commitNeedle="db.exec('COMMIT');return {ok:true,revision:next.revision};";
  if(original.split(commitNeedle).length!==2)throw Error('Exact Node COMMIT observation seam changed');
  const replacement=original.replace(needle,'return {__c007Db:db,call,close:()=>db.close(),')
   .replace(commitNeedle,"globalThis.__c007BeforeCommit?.(input,db);"+commitNeedle);
  await fs.writeFile(copy,replacement,{flag:'wx'});adapted=true;
  receipt.storeAdaptation={originalSha256:sha(original),adaptedSha256:sha(replacement),difference:'Expose existing handle and insert a synchronous observation callback immediately before original COMMIT; original SQL, order and return preserved'};
  const {createSQLiteStore}=await import(pathToFileURL(copy));store=createSQLiteStore(dbDir);db=store.__c007Db;
  db.function('c007_fault_hit',()=>{receipt.faultHits++;return 0;});
  if(spec.mode==='init'){
    if(!/^[A-Za-z0-9-]{1,80}$/.test(spec.actor||''))throw Error('Invalid fixture actor');
    const current=store.call({action:'inspect',keys:[]}).meta;
    store.call({action:'commit',expected:current.revision,meta:{...current,actor:current.actor,scope:spec.scope,epoch:spec.epoch,initialized:true},rows:[],outbox:[]});
    // Actor substitution is bootstrap-only, before any event exists, as in the C0-03 adapter.
    const meta=JSON.parse(db.prepare('SELECT value FROM meta WHERE id=1').get().value);
    db.prepare('UPDATE meta SET value=? WHERE id=1').run(JSON.stringify({...meta,actor:spec.actor}));
  }
  receipt.before=audit();await checkpoint('before');
  globalThis.__c007BeforeCommit=(transactionInput,handle)=>{
    if(spec.exitAt!=='before-commit')return;
    if(handle!==db)throw Error('Unexpected SQLite handle at commit observation');
    // All original SQL writes have returned; the original COMMIT statement has not executed.
    // This synchronous observer never schedules an await inside the production transaction.
    const marker={...receipt,boundary:'before-real-sqlite-commit',processId:process.pid,
      commitInput:{ack:transactionInput.ack??null,rows:transactionInput.rows?.length||0},uncommitted:audit(),at:new Date().toISOString()};
    const fd=openSync(output+'.before-commit.json','wx');try{writeFileSync(fd,JSON.stringify(marker,null,2));fsyncSync(fd);}finally{closeSync(fd);}
    process.exit(86);
  };
  const {delta,provenance}=await ensureDeltaAdapter();receipt.deltaAccess=provenance;
  let ackCommitted=false;
  const call=async input=>{
    const value=store.call(input);
    if(input.action==='commit'&&input.ack!=null&&value.ok){
      ackCommitted=true;
      if(spec.exitAt==='after-ack-commit'){
        receipt.ackCommitted=true;await checkpoint('after-ack-commit');process.exit(86);
      }
    }
    return value;
  };
  const fault=sqlFaultPlan(spec.fault);
  if(fault.foreignKeys){db.exec('PRAGMA foreign_keys=ON');if(db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)throw Error('Foreign key fault could not be armed');}
  for(const statement of fault.statements)db.exec(statement);
  receipt.faultArmed=true;
  try{
    switch(spec.operation?.op||'audit'){
      case 'local':receipt.returned=await editReplica(call,spec.operation.changes);break;
      case 'remote':receipt.returned=await applyRemote(call,spec.operation.events,undefined,spec.operation.cursor||null);break;
      case 'inspect':receipt.returned=await call({action:'inspect',keys:spec.operation.keys});break;
      case 'page':receipt.returned=await call({action:'page',after:spec.operation.after||'',limit:100});break;
      case 'outbox':receipt.returned=await call({action:'outbox',limit:500});break;
      case 'prepare':receipt.returned=await delta.prepare(call,spec.operation.manifest);break;
      case 'publish':{
        const pending=(await call({action:'inspect',keys:[]})).meta.pending;
        if(!pending)throw Error('No durable pending batch; use prior prepare in same database');
        const remote=await wireRequest({method:'GET',path:'v2/manifest.json'});
        receipt.returned=await delta.publish(call,wireRequest,{value:delta.manifestValue(remote),etag:remote.etag},pending);break;
      }
      case 'audit':receipt.returned=receipt.before;break;
      default:throw Error('Unsupported C007 operation');
    }
    receipt.operationAccepted=true;
  }catch(error){
    receipt.operationAccepted=false;
    receipt.operationError={name:error.name,message:error.message,code:error.code??null,errcode:error.errcode??null,errstr:error.errstr??null};
    // Observe the actual exception attached by production before any cleanup SQL.
    if(error.rollbackError){const rollbackError=error.rollbackError;receipt.operationError.rollbackError={name:rollbackError.name,message:rollbackError.message,code:rollbackError.code??null,errcode:rollbackError.errcode??null,errstr:rollbackError.errstr??null};}
  }
  receipt.ackCommitted=ackCommitted;
  // Copy the original fault result before cleanup/audit can execute more SQL.
  await checkpoint('operation');
  clearSqlFaults(db);receipt.faultDisarmed=true;receipt.after=audit();
  receipt.status='observed';exitCode=0; // Observer exit 0 is NEVER a scenario acceptance verdict.
}catch(error){receipt.error={name:error.name,message:error.message,code:error.code??null};}
finally{
  delete globalThis.__c007BeforeCommit;
  try{store?.close();}catch(error){receipt.closeError=String(error);exitCode=1;}
  if(adapted)await fs.unlink(copy).catch(error=>{receipt.cleanupError=String(error);});
  receipt.completedAt=new Date().toISOString();receipt.observerExitCode=exitCode;
  await durable(output,receipt);process.exitCode=exitCode;
}
