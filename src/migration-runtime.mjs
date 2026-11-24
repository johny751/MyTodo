// Branch-only explicit infrastructure step. No startup call or test imports.
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MIGRATION_ID='mytodo-storage-infrastructure-0001';
export const CONTRACT_ID='d1-01-candidate.1';
export const ALGORITHM_ID='mytodo-storage-fingerprint-v2';
export const INFRASTRUCTURE_DDL=[
 "CREATE TABLE storage_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,contract_id TEXT NOT NULL,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,target_schema_fingerprint TEXT NOT NULL,target_raw_fingerprint TEXT NOT NULL,target_user_version INTEGER NOT NULL,source_snapshot_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'))",
 'CREATE TABLE storage_migration_snapshots(snapshot_id TEXT PRIMARY KEY,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,schema_payload TEXT NOT NULL,raw_payload TEXT NOT NULL)',
 "CREATE TABLE storage_migration_audit(attempt_id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,result TEXT NOT NULL CHECK(result='committed'),implementation_checksum TEXT NOT NULL)"
];
export const REORDERED_CORE_DDL=[
 'CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))',
 'CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)',
 'CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)'
];
const CORE_DDL=[
 'CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)',
 'CREATE TABLE entities (key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)',
 'CREATE TABLE outbox (id INTEGER PRIMARY KEY,event TEXT NOT NULL)'
];
const INDEX_DDL=[
 'CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)',
 'CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)',
 'CREATE INDEX task_parent ON entities(parent_id)'
];
const CORE_TABLES=['entities','meta','outbox'];
const INFRA_TABLES=['storage_migration_registry','storage_migration_snapshots','storage_migration_audit'];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const binary=(a,b)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
const normalizeSQL=sql=>sql.replace(/\s+/g,' ').trim().replace(/^(CREATE(?: UNIQUE)? (?:TABLE|INDEX)) IF NOT EXISTS /,'$1 ').replace(/\s*([(),=])\s*/g,'$1');
const fields=values=>Buffer.concat(values.map(v=>v===null?Buffer.from('N;'):Buffer.concat([Buffer.from('S'+Buffer.byteLength(v,'utf8')+':'),Buffer.from(v,'utf8')])));
const payload=(role,values)=>fields([ALGORITHM_ID,role,...values]).toString('utf8');
const equalSnapshot=(a,b)=>['schemaFingerprint','rawFingerprint','userVersion','snapshotId','schemaPayload','rawPayload'].every(k=>a[k]===b[k]);
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function schemaObjects(db){return db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY').all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);}
function schemaPayload(objects){const ordered=[...objects].sort((a,b)=>binary(a[0],b[0])||binary(a[1],b[1])||binary(a[2],b[2]));return payload('schema',[String(ordered.length),...ordered.flat()]);}
function decodeSchema(encoded){
 const bytes=Buffer.from(encoded,'utf8'),result=[];let at=0;
 while(at<bytes.length){
  if(bytes[at]===78&&bytes[at+1]===59){result.push(null);at+=2;continue;}
  if(bytes[at++]!==83)fail('blockedSnapshot','invalid snapshot field tag');
  const colon=bytes.indexOf(58,at);if(colon<0)fail('blockedSnapshot','snapshot field length missing');
  const count=bytes.subarray(at,colon).toString('ascii');if(!/^(0|[1-9][0-9]*)$/.test(count)||!Number.isSafeInteger(Number(count)))fail('blockedSnapshot','invalid snapshot field length');
  at=colon+1;const end=at+Number(count);if(end>bytes.length)fail('blockedSnapshot','truncated snapshot field');
  result.push(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at,end)));at=end;
 }
 if(result[0]!==ALGORITHM_ID||result[1]!=='schema'||!/^\d+$/.test(result[2]??'')||result.length!==3+Number(result[2])*4)fail('blockedSnapshot','snapshot schema framing mismatch');
 return Array.from({length:Number(result[2])},(_,i)=>result.slice(3+i*4,7+i*4));
}
function rawPayload(db){
 const result=[String(CORE_TABLES.length)];
 for(const table of CORE_TABLES){
  const columns=db.prepare('PRAGMA table_info('+quote(table)+')').all().map(c=>c.name);
  if(!columns.length)fail('blockedSchema','missing original table '+table);
  const select=columns.map((name,i)=>`typeof(${quote(name)}) AS t${i},CASE WHEN typeof(${quote(name)}) IN ('null','real') THEN NULL ELSE hex(CAST(${quote(name)} AS BLOB)) END AS h${i},CASE WHEN typeof(${quote(name)})='real' THEN ${quote(name)} ELSE NULL END AS r${i}`).join(',');
  const statement=db.prepare('SELECT '+select+' FROM '+quote(table));
  if(typeof statement.setReadBigInts==='function')statement.setReadBigInts(true);
  const rows=statement.all().map(row=>fields(columns.flatMap((_,i)=>{
   let real=null;if(row['t'+i]==='real'){const bits=Buffer.alloc(8);bits.writeDoubleBE(row['r'+i]);real=bits.toString('hex');}
   return [row['t'+i],row['h'+i],real];
  }))).sort(Buffer.compare);
  result.push(table,String(columns.length),...columns,String(rows.length));
  for(const row of rows)result.push({encoded:row});
 }
 const header=fields([ALGORITHM_ID,'raw']);
 return Buffer.concat([header,...result.map(v=>typeof v==='object'?v.encoded:fields([v]))]).toString('utf8');
}
export function captureD2Snapshot(db,{insideTransaction=false}={}){
 if(!insideTransaction)db.exec('BEGIN');
 try{
  const schema=schemaPayload(schemaObjects(db)),raw=rawPayload(db),version=db.prepare('PRAGMA user_version').get().user_version;
  const schemaFingerprint=digest(Buffer.from(schema,'utf8')),rawFingerprint=digest(Buffer.from(raw,'utf8'));
  return {schemaFingerprint,rawFingerprint,userVersion:version,
   snapshotId:digest(fields([ALGORITHM_ID,'snapshot',schemaFingerprint,rawFingerprint,String(version)])),schemaPayload:schema,rawPayload:raw};
 }finally{if(!insideTransaction)db.exec('ROLLBACK');}
}
function validateSnapshot(source){
 if(!source||source.userVersion!==0||typeof source.schemaPayload!=='string'||typeof source.rawPayload!=='string')fail('blockedSnapshot','version-zero source snapshot required');
 if(source.schemaFingerprint!==digest(Buffer.from(source.schemaPayload,'utf8'))||source.rawFingerprint!==digest(Buffer.from(source.rawPayload,'utf8'))||source.snapshotId!==digest(fields([ALGORITHM_ID,'snapshot',source.schemaFingerprint,source.rawFingerprint,'0'])))fail('blockedSnapshot','source snapshot bytes/fingerprints differ');
 decodeSchema(source.schemaPayload);
}
function knownSourceLayout(db,objects){
 const expectedNames=new Set(['meta','entities','outbox','task_filter','task_reminders','task_parent','sqlite_autoindex_entities_1']);
 if(objects.length!==7||objects.some(r=>!expectedNames.has(r[1])))fail('blockedSchema','unknown source schema object');
 for(let i=0;i<3;i++){
  const table=['meta','entities','outbox'][i],object=objects.find(r=>r[0]==='table'&&r[1]===table&&r[2]===table);
  if(!object||![CORE_DDL[i],REORDERED_CORE_DDL[i]].some(sql=>normalizeSQL(sql)===normalizeSQL(object[3]??'')))fail('blockedSchema','unsupported complete table DDL '+table);
  if(db.prepare('PRAGMA foreign_key_list('+quote(table)+')').all().length)fail('blockedSchema','unexpected source foreign key');
 }
 for(let i=0;i<3;i++){
  const name=['task_filter','task_reminders','task_parent'][i],object=objects.find(r=>r[0]==='index'&&r[1]===name&&r[2]==='entities');
  if(!object||normalizeSQL(object[3]??'')!==normalizeSQL(INDEX_DDL[i]))fail('blockedSchema','unsupported source index '+name);
 }
 const automatic=objects.find(r=>r[1]==='sqlite_autoindex_entities_1');
 if(automatic?.[0]!=='index'||automatic[2]!=='entities'||automatic[3]!==null)fail('blockedSchema','source primary key index differs');
 const definitions={meta:{id:['INTEGER',0,null,1],value:['TEXT',1,null,0]},outbox:{id:['INTEGER',0,null,1],event:['TEXT',1,null,0]},entities:{key:['TEXT',0,null,1],kind:['TEXT',1,null,0],id:['TEXT',1,null,0],data:['TEXT',1,null,0],record:['TEXT',1,null,0],deleted:['INTEGER',1,null,0],conflicts:['TEXT',1,null,0],parent_id:['TEXT',0,null,0],done:['INTEGER',0,null,0],quadrant:['INTEGER',0,null,0],reminder_at:['INTEGER',0,null,0],start:['TEXT',0,null,0]}};
 for(const table of CORE_TABLES){
  const info=db.prepare('PRAGMA table_info('+quote(table)+')').all(),expected=definitions[table];
  if(info.length!==Object.keys(expected).length||info.some(c=>!expected[c.name]||JSON.stringify([c.type,c.notnull,c.dflt_value,c.pk])!==JSON.stringify(expected[c.name])))fail('blockedSchema','source column attributes differ '+table);
 }
 const indexes=db.prepare('PRAGMA index_list(entities)').all();
 for(const index of indexes){const wanted={task_filter:['kind','deleted','done','quadrant','start'],task_reminders:['kind','deleted','done','reminder_at'],task_parent:['parent_id'],sqlite_autoindex_entities_1:['key']}[index.name];
  if(!wanted||index.unique!==(index.name==='sqlite_autoindex_entities_1'?1:0)||index.partial!==0||JSON.stringify(db.prepare('PRAGMA index_info('+quote(index.name)+')').all().map(v=>v.name))!==JSON.stringify(wanted))fail('blockedSchema','source index attributes differ');
 }
}
function expectedTarget(source){
 const objects=decodeSchema(source.schemaPayload);
 for(let i=0;i<INFRA_TABLES.length;i++){const table=INFRA_TABLES[i];objects.push(['table',table,table,INFRASTRUCTURE_DDL[i]],['index','sqlite_autoindex_'+table+'_1',table,null]);}
 return schemaPayload(objects);
}
export function migrationBuildIdentity(sourceSha){
 if(typeof sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(sourceSha)||/^0+$/.test(sourceSha))fail('blockedBuildIdentity','recorded source SHA required');
 const directory=path.dirname(fileURLToPath(import.meta.url));
 const sources=['sqlite-store.mjs','migration-runtime.mjs'].map(name=>{const bytes=fs.readFileSync(path.join(directory,name));return {name,bytes,sha256:digest(bytes)};});
 const checksum=digest(Buffer.concat([fields([ALGORITHM_ID,'implementation','node',MIGRATION_ID,CONTRACT_ID]),...sources.flatMap(v=>[fields(['src/'+v.name]),fields([new TextDecoder('utf-8',{fatal:true}).decode(v.bytes)])])]));
 const files=sources.map(v=>({name:'src/'+v.name,bytes:v.bytes.length,sha256:v.sha256}));
 return {sourceSha,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
  platform:'node',framework:'d2-real-storage-api-v1',checksum,implementationChecksum:checksum,files,sources:files};
}
function validateRequest(request,identity){
 if(request?.migrationId!==MIGRATION_ID||request.contractId!==CONTRACT_ID||request.algorithmId!==ALGORITHM_ID)fail('blockedPlan','unsupported migration plan/contract/algorithm');
 if(!identity)fail('blockedBuildIdentity','build-bound identity was not supplied');
 const actual=migrationBuildIdentity(identity.sourceSha);
 if(request.implementationChecksum!==actual.implementationChecksum||identity.implementationChecksum!==actual.implementationChecksum||JSON.stringify(identity.sources)!==JSON.stringify(actual.sources))fail('blockedBuildIdentity','actual implementation source bytes differ from recorded build identity');
 if(process.env.GITHUB_ACTIONS==='true'&&identity.sourceSha!==process.env.GITHUB_SHA)fail('blockedBuildIdentity','test checkout and build identity differ');
 if(process.env.GITHUB_ACTIONS==='true'&&(identity.runId!==process.env.GITHUB_RUN_ID||identity.runAttempt!==process.env.GITHUB_RUN_ATTEMPT))fail('blockedBuildIdentity','test run/attempt and build identity differ');
 validateSnapshot(request.sourceSnapshot);return actual;
}
function inspect(db,request){
 db.exec('BEGIN');try{
 const source=request.sourceSnapshot,current=captureD2Snapshot(db,{insideTransaction:true}),objects=schemaObjects(db),registryObject=objects.find(r=>r[1]===INFRA_TABLES[0]);
 if(!registryObject){
  if(current.userVersion===0&&current.schemaPayload===source.schemaPayload)return {status:current.rawFingerprint===source.rawFingerprint?'notCommitted':'blockedDataAdvanced',snapshot:current};
  return {status:'blockedUnknown',snapshot:current};
 }
 const target=expectedTarget(source);
 if(current.userVersion!==1||current.schemaPayload!==target)return {status:'blockedUnknown',reason:'target schema/version differs',snapshot:current};
 const registry=db.prepare('SELECT * FROM storage_migration_registry').all();
 const snapshots=db.prepare('SELECT * FROM storage_migration_snapshots').all();
 const audits=db.prepare('SELECT * FROM storage_migration_audit').all();
 if(registry.length!==1||snapshots.length!==1||audits.length!==1)return {status:'blockedUnknown',reason:'registry/snapshot/audit count differs',snapshot:current};
 const row=registry[0],saved=snapshots[0],audit=audits[0],wanted={migration_id:MIGRATION_ID,checksum:request.implementationChecksum,contract_id:CONTRACT_ID,source_schema_fingerprint:source.schemaFingerprint,source_raw_fingerprint:source.rawFingerprint,source_user_version:0,target_schema_fingerprint:digest(Buffer.from(target,'utf8')),target_raw_fingerprint:source.rawFingerprint,target_user_version:1,source_snapshot_id:source.snapshotId,status:'committed'};
 if(Object.entries(wanted).some(([k,v])=>row[k]!==v)||saved.snapshot_id!==source.snapshotId||saved.source_schema_fingerprint!==source.schemaFingerprint||saved.source_raw_fingerprint!==source.rawFingerprint||saved.source_user_version!==0||saved.schema_payload!==source.schemaPayload||saved.raw_payload!==source.rawPayload||audit.migration_id!==MIGRATION_ID||audit.source_snapshot_id!==source.snapshotId||audit.implementation_checksum!==request.implementationChecksum||audit.result!=='committed'||typeof audit.attempt_id!=='string'||!audit.attempt_id)return {status:'blockedUnknown',reason:'immutable registry/snapshot/audit differs',snapshot:current};
 return {status:current.rawFingerprint===source.rawFingerprint?'committed':'blockedDataAdvanced',snapshot:current};
 }finally{db.exec('ROLLBACK');}
}
export function inspectD2MigrationOutcome(databasePath,request,{buildIdentity}={}){
 validateRequest(request,buildIdentity);
 const db=new DatabaseSync(databasePath,{readOnly:true});
 try{return inspect(db,request);}finally{db.close();}
}
export function runStorageMigration(db,databasePath,request,{buildIdentity,observer,auditSink,closeOriginal}={}){
 const attemptId=crypto.randomUUID();let transaction=false,commitAttempted=false;
 const event=(stage,details={})=>{const data={attemptId,migrationId:MIGRATION_ID,databasePath,stage,...details};if(auditSink)auditSink(data);return data;};
 const observe=stage=>{event(stage);if(observer)observer(stage,{attemptId,databasePath,connection:db});};
 try{
  validateRequest(request,buildIdentity);event('prepared',{sourceSnapshotId:request.sourceSnapshot.snapshotId,checksum:request.implementationChecksum});
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE name='storage_migration_registry'").get();
  if(exists){const result=inspect(db,request);if(result.status==='committed')result.status='idempotent';event(result.status);return {...result,attemptId};}
  knownSourceLayout(db,schemaObjects(db));
  const before=captureD2Snapshot(db);if(!equalSnapshot(before,request.sourceSnapshot))fail(before.rawFingerprint!==request.sourceSnapshot.rawFingerprint?'blockedDataAdvanced':'blockedSnapshot','source changed since explicit snapshot');
  db.exec('BEGIN IMMEDIATE');transaction=true;
  const locked=captureD2Snapshot(db,{insideTransaction:true});knownSourceLayout(db,schemaObjects(db));
  if(!equalSnapshot(locked,request.sourceSnapshot))fail('blockedDataAdvanced','source changed before exclusive transaction');
  observe('sourceVerified');for(const sql of INFRASTRUCTURE_DDL)db.exec(sql);observe('afterSchema');
  db.prepare('INSERT INTO storage_migration_snapshots(snapshot_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,schema_payload,raw_payload) VALUES(?,?,?,?,?,?)').run(locked.snapshotId,locked.schemaFingerprint,locked.rawFingerprint,0,locked.schemaPayload,locked.rawPayload);
  observe('afterSnapshot');
  const target=expectedTarget(locked),actual=captureD2Snapshot(db,{insideTransaction:true});
  if(actual.rawFingerprint!==locked.rawFingerprint)fail('blockedDataAdvanced','original raw cells changed inside infrastructure transaction');
  if(actual.schemaPayload!==target)fail('blockedSchema','actual target objects differ from independent source-plus-six expectation');
  db.prepare('INSERT INTO storage_migration_registry(migration_id,checksum,contract_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,target_schema_fingerprint,target_raw_fingerprint,target_user_version,source_snapshot_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(MIGRATION_ID,request.implementationChecksum,CONTRACT_ID,locked.schemaFingerprint,locked.rawFingerprint,0,digest(Buffer.from(target,'utf8')),locked.rawFingerprint,1,locked.snapshotId,'committed');
  db.prepare('INSERT INTO storage_migration_audit(attempt_id,migration_id,source_snapshot_id,result,implementation_checksum) VALUES(?,?,?,?,?)').run(attemptId,MIGRATION_ID,locked.snapshotId,'committed',request.implementationChecksum);
  db.exec('PRAGMA user_version=1');observe('beforeCommit');commitAttempted=true;db.exec('COMMIT');transaction=false;observe('afterCommit');event('committed');
  return {status:'committed',attemptId,sourceSnapshotId:locked.snapshotId,targetSchemaFingerprint:actual.schemaFingerprint};
 }catch(error){
  let rollbackError=null,closeError=null;
  if(transaction||commitAttempted){try{db.exec('ROLLBACK');transaction=false;}catch(e){rollbackError=e;}}
  if(commitAttempted){
   let outcome={status:'blockedUnknown'};
   try{if(typeof closeOriginal!=='function')throw Error('explicit owner close callback missing');closeOriginal();outcome=inspectD2MigrationOutcome(databasePath,request,{buildIdentity});}catch(e){closeError=e;}
   const details={status:outcome.status,attemptId,unknownCommitObserved:true,primaryError:String(error),rollbackError:rollbackError?String(rollbackError):null,closeError:closeError?String(closeError):null,outcome};
   try{event('unknownCommitResolved',details);}catch(auditError){details.auditError=String(auditError);}
   return details;
  }
  if(error&&typeof error==='object'&&rollbackError)error.rollbackError=rollbackError;
  try{event('failed',{primaryError:String(error),rollbackError:rollbackError?String(rollbackError):null});}catch(auditError){if(error&&typeof error==='object')error.auditError=auditError;}
  throw error;
 }
}
