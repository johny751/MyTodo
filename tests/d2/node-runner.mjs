// Actual production Node entry tests. All inputs are fresh marked Actions fixtures.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import assert from 'node:assert/strict';
import {createSQLiteStore} from '../../src/sqlite-store.mjs';
import {MIGRATION_ID,CONTRACT_ID,ALGORITHM_ID,REORDERED_CORE_DDL,captureD2Snapshot,inspectD2MigrationOutcome} from '../../src/migration-runtime.mjs';
import {applyEvent,rowFromRecord,entityKey} from '../../src/replica.mjs';
import {rootPath,safeFile,hash,json,writeFresh,FRAMEWORK} from './isolation.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const requestFor=(store,snapshot=store.captureD2Snapshot())=>{const build=store.getD2BuildIdentity(process.env.GITHUB_SHA);return {request:{migrationId:MIGRATION_ID,contractId:CONTRACT_ID,algorithmId:ALGORITHM_ID,implementationChecksum:build.implementationChecksum,sourceSnapshot:snapshot},build};};
// Independent test oracle: a new read-only handle and rowid/cell queries.
// It does not import a production encoder or hash a production payload.
function canonicalRawOracle(file){
 const db=new DatabaseSync(file,{readOnly:true}),encode=value=>{
  if(value===null)return Buffer.from('N;');
  assert.equal(typeof value,'string');const bytes=Buffer.from(value,'utf8');
  return Buffer.concat([Buffer.from(`S${bytes.length}:`),bytes]);
 },q=value=>'"'+value.replaceAll('"','""')+'"',tables=['entities','meta','outbox'];
 const chunks=[encode('mytodo-storage-fingerprint-v2'),encode('raw'),encode(String(tables.length))];
 db.exec('BEGIN');
 try{
  for(const table of tables){
   const columns=db.prepare(`PRAGMA table_info(${q(table)})`).all().map(v=>v.name);
   chunks.push(encode(table),encode(String(columns.length)),...columns.map(encode));
   const rowids=db.prepare(`SELECT rowid AS physical_id FROM ${q(table)}`);rowids.setReadBigInts(true);
   const encodedRows=[];
   for(const identity of rowids.all()){
    const cells=[];
    for(const column of columns){
     const sql=`SELECT typeof(${q(column)}) AS storage_type,CASE WHEN ${q(column)} IS NULL OR typeof(${q(column)})='real' THEN NULL ELSE hex(CAST(${q(column)} AS BLOB)) END AS original_hex,CASE WHEN typeof(${q(column)})='real' THEN ${q(column)} ELSE NULL END AS real_value FROM ${q(table)} WHERE rowid=?`;
     const statement=db.prepare(sql);statement.setReadBigInts(true);const cell=statement.get(identity.physical_id);
     let ieee=null;
     if(cell.storage_type==='real'){const binary=Buffer.alloc(8);binary.writeDoubleBE(cell.real_value);ieee=binary.toString('hex');}
     cells.push(encode(cell.storage_type),encode(cell.original_hex),encode(ieee));
    }
    encodedRows.push(Buffer.concat(cells));
   }
   encodedRows.sort(Buffer.compare);chunks.push(encode(String(encodedRows.length)),...encodedRows);
  }
  const bytes=Buffer.concat(chunks);
  return {rawPayload:bytes.toString('utf8'),rawFingerprint:hash(bytes),userVersion:db.prepare('PRAGMA user_version').get().user_version};
 }finally{db.exec('ROLLBACK');db.close();}
}
function seedAPI(store){
 const meta=structuredClone(store.call({action:'inspect',keys:[]}).meta),rows=[],outbox=[];
 for(const [kind,id,values] of [['tasks','node-real-task',{title:'真实Node入口合成任务 e\u0301 😀',parentId:null,quadrant:1,done:false,reminderAt:-1,notes:'原始备注',unknown:{keep:true}}],['notes','node-real-note',{body:'独立便签'}],['tasks','node-tombstone',{title:'保留墓碑',_deleted:true}]]){
  const event={key:entityKey(kind,id),actor:meta.actor,seq:++meta.seq,clock:++meta.clock,context:{...meta.vector},values:{_deleted:false,...values}};
  meta.vector[meta.actor]=meta.seq;rows.push(rowFromRecord(applyEvent(null,event)));outbox.push({id:++meta.queue,event});
 }
 meta.initialized=true;meta.pending={device:meta.actor,index:1,through:meta.queue,body:JSON.stringify({format:'gxtodo-batch',epoch:'synthetic-epoch',device:meta.actor,index:1,events:outbox.map(v=>v.event)},null,1),path:'v2/b-'+meta.actor+'-1.json.gz'};
 const original=store.call({action:'inspect',keys:[]}).meta;
 assert.equal(store.call({action:'commit',expected:original.revision,meta,rows,outbox}).ok,true);
 assert.equal(store.call({action:'outbox'}).entries.length,3);
 return {actualEntry:'createSQLiteStore.call(commit)',rows:3,outbox:3,actor:meta.actor};
}
function auditSink(file){return event=>{const fd=fsSync.openSync(file,'a');try{fsSync.writeSync(fd,JSON.stringify(event)+'\n');fsSync.fsyncSync(fd);}finally{fsSync.closeSync(fd);}};}
async function fixture(root,name,{reordered=false}={}){
 const directory=await safeFile(root,name,{exists:false});await fs.mkdir(directory);
 if(reordered){const db=new DatabaseSync(path.join(directory,'tasks.sqlite'));try{for(const sql of REORDERED_CORE_DDL)db.exec(sql);}finally{db.close();}}
 const store=createSQLiteStore(directory),proof=seedAPI(store);
 return {directory,file:path.join(directory,'tasks.sqlite'),store,proof,...requestFor(store),audit:path.join(directory,'attempts.jsonl')};
}
async function worker(root,mode,directory,requestFile,fault){
 await rootPath(root);directory=await safeFile(root,path.relative(root,directory));requestFile=await safeFile(root,path.relative(root,requestFile));
 const recorded=JSON.parse(await fs.readFile(requestFile,'utf8'));
 if(mode==='probe'){const outcome=inspectD2MigrationOutcome(path.join(directory,'tasks.sqlite'),recorded.request,{buildIdentity:recorded.build});process.stdout.write(JSON.stringify({pid:process.pid,database:path.join(directory,'tasks.sqlite'),outcome})+'\n');return;}
 const store=createSQLiteStore(directory);
 try{
  const result=store.migrateStorageInfrastructure(recorded.request,{buildIdentity:recorded.build,auditSink:auditSink(path.join(directory,'worker-audit.jsonl')),observer(stage){if(stage===fault){process.kill(process.pid,'SIGKILL');throw Error('BLOCKER: hard kill unexpectedly returned');}}});process.stdout.write(JSON.stringify({pid:process.pid,database:path.join(directory,'tasks.sqlite'),result})+'\n');
 }finally{store.closeChecked();}
}
async function child(root,label,args){
 const result=await new Promise(resolve=>{const p=spawn(process.execPath,[fileURLToPath(import.meta.url),...args],{env:process.env,stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];let error=null,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;p.kill('SIGKILL');},90000);
  p.stdout.on('data',b=>stdout.push(b));p.stderr.on('data',b=>stderr.push(b));p.on('error',e=>{error=String(e);});p.on('close',(exitCode,signal)=>{clearTimeout(timer);resolve({pid:p.pid,exitCode,signal,error,timedOut,stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr)});});});
 await writeFresh(root,label+'.stdout',result.stdout);await writeFresh(root,label+'.stderr',result.stderr);
 assert.equal(result.timedOut,false);assert.equal(result.error,null);
 return {...result,stdout:result.stdout.toString('utf8'),stderr:result.stderr.toString('utf8'),stdoutSha256:hash(result.stdout),stderrSha256:hash(result.stderr)};
}
async function main(input){
 const root=await rootPath(input,{create:true}),report={platform:'node',sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,framework:FRAMEWORK,contractId:CONTRACT_ID,migrationId:MIGRATION_ID,algorithmId:ALGORITHM_ID,actualProductionEntry:true,startupMigration:false,cases:[]};
 const record=async(id,name,fn)=>{const item={id,name,status:'failed'};try{item.evidence=await fn();item.status='passed';}catch(error){item.error=String(error.stack||error);item.rollbackError=error.rollbackError?String(error.rollbackError):null;}report.cases.push(item);await fs.writeFile(path.join(root,'node-report.json'),json(report));};
 await record('N01','Actual production commit with no startup migration',async()=>{const f=await fixture(root,'api');try{await writeFresh(root,'production-source-identity.json',json(f.store.getD2BuildIdentity(process.env.GITHUB_SHA)));const db=new DatabaseSync(f.file,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,0);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'storage_migration_%'").get().n,0);}finally{db.close();}return f.proof;}finally{f.store.closeChecked();}});
 await record('N02','Explicit named writes tolerate extra columns; migration refuses unknown layout',async()=>{const f=await fixture(root,'extra');try{const db=new DatabaseSync(f.file);try{for(const table of ['meta','entities','outbox'])db.exec(`ALTER TABLE ${table} ADD COLUMN synthetic_extra TEXT DEFAULT 'sentinel'`);}finally{db.close();}
  const value=f.store.call({action:'inspect',keys:[entityKey('tasks','node-real-task')]}),meta=value.meta;assert.equal(f.store.call({action:'commit',expected:meta.revision,meta,rows:value.rows,outbox:[]}).ok,true);
  const check=new DatabaseSync(f.file,{readOnly:true});try{for(const table of ['meta','entities','outbox'])assert.equal(check.prepare(`SELECT synthetic_extra FROM ${table} LIMIT 1`).get().synthetic_extra,'sentinel');}finally{check.close();}
  const current=requestFor(f.store),before=f.store.captureD2Snapshot();assert.throws(()=>f.store.migrateStorageInfrastructure(current.request,{buildIdentity:current.build}),e=>e.code==='blockedSchema');assert.deepEqual(f.store.captureD2Snapshot(),before);return {actualNamedWrite:true,unknownLayoutRefused:true};}finally{f.store.closeChecked();}});
 await record('N03','All three reverse-column fixtures use actual named writer and manual step',async()=>{const f=await fixture(root,'reverse',{reordered:true});try{const before=f.store.captureD2Snapshot(),result=f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build,auditSink:auditSink(f.audit)});assert.equal(result.status,'committed');assert.equal(f.store.captureD2Snapshot().rawFingerprint,before.rawFingerprint);return {result,actualNamedWrite:f.proof};}finally{f.store.closeChecked();}});
 await record('N04','Infrastructure registry/snapshot/audit/version commit preserves all original raw cells',async()=>{const f=await fixture(root,'normal');try{const before=f.store.captureD2Snapshot(),result=f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build,auditSink:auditSink(f.audit)});assert.equal(result.status,'committed');const after=f.store.captureD2Snapshot();assert.equal(after.userVersion,1);assert.equal(after.rawPayload,before.rawPayload);
  const db=new DatabaseSync(f.file,{readOnly:true});try{for(const [table,columns] of [['storage_migration_registry',11],['storage_migration_snapshots',6],['storage_migration_audit',5]]){assert.equal(db.prepare(`PRAGMA table_info(${table})`).all().length,columns);assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,1);}}finally{db.close();}return {result,sourceRawFingerprint:before.rawFingerprint,targetRawFingerprint:after.rawFingerprint};}finally{f.store.closeChecked();}});
 await record('N05','Exact fixed-window repeat is idempotent with no new database rows',async()=>{const f=await fixture(root,'repeat');try{assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'committed');const before=f.store.captureD2Snapshot();assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'idempotent');assert.deepEqual(f.store.captureD2Snapshot(),before);return {idempotent:true};}finally{f.store.closeChecked();}});
 await record('N06','Real ACK still cleans original queue; later migration blocksDataAdvanced without rewriting',async()=>{const f=await fixture(root,'ack');try{assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'committed');const meta=f.store.call({action:'inspect',keys:[]}).meta;assert.equal(f.store.call({action:'commit',expected:meta.revision,meta,rows:[],outbox:[],ack:2}).ok,true);assert.deepEqual(f.store.call({action:'outbox'}).entries.map(v=>v.id),[3]);const before=f.store.captureD2Snapshot();assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'blockedDataAdvanced');assert.deepEqual(f.store.captureD2Snapshot(),before);return {actualAckSemanticsPreserved:true,oldSnapshotNotRestored:true};}finally{f.store.closeChecked();}});
 await record('N07','Unknown trigger source rejected before transaction',async()=>{const f=await fixture(root,'unknown');try{const db=new DatabaseSync(f.file);try{db.exec('CREATE TRIGGER synthetic_unknown AFTER UPDATE ON meta BEGIN SELECT 1; END');}finally{db.close();}const before=f.store.captureD2Snapshot(),current=requestFor(f.store,before);assert.throws(()=>f.store.migrateStorageInfrastructure(current.request,{buildIdentity:current.build}),e=>e.code==='blockedSchema');assert.deepEqual(f.store.captureD2Snapshot(),before);return {unknownTriggerRetained:true};}finally{f.store.closeChecked();}});
 await record('N08','Unrecorded or incorrect implementation identity and old-v1 plan rejected without writes',async()=>{const f=await fixture(root,'identity');try{const before=f.store.captureD2Snapshot();assert.throws(()=>f.store.migrateStorageInfrastructure(f.request),e=>e.code==='blockedBuildIdentity');assert.throws(()=>f.store.migrateStorageInfrastructure({...f.request,implementationChecksum:'0'.repeat(64)},{buildIdentity:f.build}),e=>e.code==='blockedBuildIdentity');assert.deepEqual(f.store.captureD2Snapshot(),before);assert.throws(()=>f.store.migrateStorageInfrastructure({...f.request,algorithmId:'mytodo-storage-fingerprint-v1'},{buildIdentity:f.build}),e=>e.code==='blockedPlan');assert.deepEqual(f.store.captureD2Snapshot(),before);return {actualImplementationChecksum:f.build.implementationChecksum,oldV1RequestRejected:true,sourceSnapshotUnchanged:true};}finally{f.store.closeChecked();}});
 await record('N09','Actual SQLite RAISE(ROLLBACK) preserves primary and cleanup errors',async()=>{const f=await fixture(root,'rollback');try{let caught;try{f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build,auditSink:auditSink(f.audit),observer(stage,{connection}){if(stage==='afterSchema')connection.exec("CREATE TRIGGER synthetic_primary BEFORE INSERT ON storage_migration_snapshots BEGIN SELECT RAISE(ROLLBACK,'node-real-primary'); END");}});}catch(e){caught=e;}
  assert.ok(caught);assert.match(String(caught),/node-real-primary/);assert.ok(caught.rollbackError);assert.deepEqual(f.store.captureD2Snapshot(),f.request.sourceSnapshot);return {primaryError:String(caught),actualRollbackError:String(caught.rollbackError)};}finally{f.store.closeChecked();}});
 for(const [id,stage,expected] of [['N10','beforeCommit','notCommitted'],['N11','afterCommit','committed']])await record(id,'Unknown COMMIT response confirmed by a fresh same-path handle '+stage,async()=>{const f=await fixture(root,'unknown-'+stage);try{const result=f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build,auditSink:auditSink(f.audit),observer(observed,{connection}){if(observed===stage){if(stage==='beforeCommit')connection.exec('ROLLBACK');else throw Error('synthetic lost commit response');}}});assert.equal(result.status,expected);assert.equal(result.unknownCommitObserved,true);assert.ok(result.primaryError);assert.throws(()=>f.store.call({action:'inspect',keys:[]}));return result;}finally{f.store.closeChecked();}});
 for(const [id,stage,expected] of [['N12','beforeCommit','notCommitted'],['N13','afterCommit','committed']])await record(id,'Actual process death and independent same-database reopen '+stage,async()=>{const f=await fixture(root,'kill-'+stage);f.store.closeChecked();const requestFile=await writeFresh(root,id+'-request.json',json({request:f.request,build:f.build}));const first=await child(root,id+'-first',['worker',root,f.directory,requestFile,stage]);assert.ok(first.exitCode!==0||first.signal);assert.doesNotMatch(first.stderr,/hard kill unexpectedly returned/);if(process.platform!=='win32')assert.equal(first.signal,'SIGKILL');const reopened=await child(root,id+'-reopen',['probe',root,f.directory,requestFile]);assert.equal(reopened.exitCode,0);const value=JSON.parse(reopened.stdout);assert.notEqual(value.pid,first.pid);assert.equal(value.database,f.file);assert.equal(value.outcome.status,expected);return {first,newProcess:value,requestChecksum:f.request.implementationChecksum};});
 await record('N14','Common raw historical boundary fixture after a proven actual API write',async()=>{const f=await fixture(root,'cross');try{const definition=JSON.parse(await fs.readFile(path.join(HERE,'shared-fixture.json'),'utf8'));assert.equal(definition.syntheticOnly,true);const db=new DatabaseSync(f.file);try{db.exec('BEGIN IMMEDIATE');for(const sql of definition.sql)db.exec(sql);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
  const before=f.store.captureD2Snapshot(),current=requestFor(f.store,before);f.store.closeChecked();const reader=new DatabaseSync(f.file,{readOnly:true});try{await backup(reader,await safeFile(root,'cross-source.sqlite',{exists:false}));}finally{reader.close();}
  const targetDirectory=await safeFile(root,'cross-target-case',{exists:false});await fs.mkdir(targetDirectory);const source=new DatabaseSync(await safeFile(root,'cross-source.sqlite'),{readOnly:true});try{await backup(source,path.join(targetDirectory,'tasks.sqlite'));}finally{source.close();}
  const target=createSQLiteStore(targetDirectory);try{assert.equal(target.captureD2Snapshot().rawPayload,before.rawPayload);assert.equal(target.migrateStorageInfrastructure(current.request,{buildIdentity:current.build,auditSink:auditSink(path.join(targetDirectory,'attempts.jsonl'))}).status,'committed');assert.equal(target.captureD2Snapshot().rawPayload,before.rawPayload);}finally{target.closeChecked();}
  const finalReader=new DatabaseSync(path.join(targetDirectory,'tasks.sqlite'),{readOnly:true});try{await backup(finalReader,await safeFile(root,'cross-target.sqlite',{exists:false}));}finally{finalReader.close();}
  report.crossSourceFile='cross-source.sqlite';report.crossTargetFile='cross-target.sqlite';report.implementationChecksum=current.request.implementationChecksum;
  return {actualApiProof:f.proof,rawFixtureId:definition.fixtureId,sourceRawFingerprint:before.rawFingerprint,coreRawPreserved:true,fixtureDoesNotClaimRealHistory:true};}finally{f.store.closeChecked();}});
 await record('N15','Exact adjacent REAL64 bits and full independent canonical raw oracle',async()=>{
  const f=await fixture(root,'real');
  try{
   const db=new DatabaseSync(f.file),key=entityKey('tasks','node-real-task');
   const expectedBits=['3ff0000000000001','3ff0000000000002'];
   const observations=[];
   try{
    for(let i=0;i<expectedBits.length;i++){
     const exactValue=Buffer.from(expectedBits[i],'hex').readDoubleBE();
     db.prepare('UPDATE entities SET quadrant=? WHERE key=?').run(exactValue,key);
     const actualCell=db.prepare('SELECT typeof(quadrant) t,hex(CAST(quadrant AS BLOB)) h,quadrant value FROM entities WHERE key=?').get(key);
     assert.equal(actualCell.t,'real');const returnedBits=Buffer.alloc(8);returnedBits.writeDoubleBE(actualCell.value);
     assert.equal(returnedBits.toString('hex'),expectedBits[i]);
     const captured=captureD2Snapshot(db),oracle=canonicalRawOracle(f.file);
     assert.equal(captured.rawPayload,oracle.rawPayload);assert.equal(captured.rawFingerprint,oracle.rawFingerprint);
     assert.equal(captured.userVersion,oracle.userVersion);assert.equal(captured.userVersion,0);
     await writeFresh(root,path.relative(root,path.join(f.directory,`oracle-${i}-raw.lp`)),oracle.rawPayload);
     observations.push({expectedReal64beHex:expectedBits[i],actualReal64beHex:returnedBits.toString('hex'),
      actualCastHex:actualCell.h,rawFingerprint:captured.rawFingerprint,oracleFingerprint:oracle.rawFingerprint,
      rawPayload:captured.rawPayload,schemaPayload:captured.schemaPayload,schemaFingerprint:captured.schemaFingerprint,userVersion:captured.userVersion});
    }
    assert.equal(BigInt('0x'+observations[1].actualReal64beHex)-BigInt('0x'+observations[0].actualReal64beHex),1n);
    assert.equal(observations[0].schemaPayload,observations[1].schemaPayload);
    assert.equal(observations[0].schemaFingerprint,observations[1].schemaFingerprint);
    assert.equal(observations[0].userVersion,observations[1].userVersion);
    assert.notEqual(observations[0].rawPayload,observations[1].rawPayload);
    assert.notEqual(observations[0].rawFingerprint,observations[1].rawFingerprint);
    return {sqliteVersion:db.prepare('SELECT sqlite_version() version').get().version,
     real64BitDistance:'1',fullPayloadAndDigestMatchIndependentOracle:true,schemaAndVersionUnchanged:true,
     castTextCollisionObserved:observations[0].actualCastHex===observations[1].actualCastHex,
     castTextEqualityRequired:false,observations:observations.map(({rawPayload,schemaPayload,...evidence})=>evidence),
     historicalCastCollisionPremise:'UNVERIFIED on other engines; CI2 failure preserved, no universal text-precision claim'};
   }finally{db.close();}
  }finally{f.store.closeChecked();}
 });
 await record('N16','Independent target schema rejects later infrastructure index drift',async()=>{const f=await fixture(root,'target-drift');try{assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'committed');const db=new DatabaseSync(f.file);try{db.exec('CREATE INDEX synthetic_target_drift ON storage_migration_audit(result)');}finally{db.close();}const before=f.store.captureD2Snapshot();assert.equal(f.store.migrateStorageInfrastructure(f.request,{buildIdentity:f.build}).status,'blockedUnknown');assert.deepEqual(f.store.captureD2Snapshot(),before);return {targetDriftNotRepaired:true};}finally{f.store.closeChecked();}});
 report.passed=report.cases.filter(c=>c.status==='passed').length;report.failed=report.cases.length-report.passed;report.status=report.failed?'failed':'passed';
 await fs.writeFile(path.join(root,'node-report.json'),json(report));
 const sealed=[];for(const file of await fs.readdir(root,{recursive:true})){const p=path.join(root,file),stat=await fs.lstat(p);if(stat.isFile())sealed.push({path:file,bytes:stat.size,sha256:hash(await fs.readFile(p))});}
 await writeFresh(root,'payload-sha256.json',json(sealed));if(report.failed)throw Error('Node real API tests failed; original reports and fixtures retained');
 process.stdout.write(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,report:path.join(root,'node-report.json')})+'\n');
}
if(['worker','probe'].includes(process.argv[2]))await worker(process.argv[3],process.argv[2],process.argv[4],process.argv[5],process.argv[6]);else await main(process.argv[2]);
