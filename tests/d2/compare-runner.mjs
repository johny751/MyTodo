// Independent cross-end oracle over real platform-produced SQLite artifacts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {rootPath,safeFile,hash,json,writeFresh} from './isolation.mjs';
import {dbProof} from './backup-recovery.mjs';
const [win,node,android,backupRoot,out]=process.argv.slice(2);if(!out)throw Error('Use compare-runner.mjs <win> <node> <android> <backup> <output>');
const root=await rootPath(out,{create:true}),report={schema:'d2-cross-comparison-v1',sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,status:'failed',cases:[]};
const algorithm='mytodo-storage-fingerprint-v1',migrationId='mytodo-storage-infrastructure-0001',contractId='d1-01-candidate.1';
const ddl=[
 "CREATE TABLE storage_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,contract_id TEXT NOT NULL,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,target_schema_fingerprint TEXT NOT NULL,target_raw_fingerprint TEXT NOT NULL,target_user_version INTEGER NOT NULL,source_snapshot_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'))",
 'CREATE TABLE storage_migration_snapshots(snapshot_id TEXT PRIMARY KEY,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,schema_payload TEXT NOT NULL,raw_payload TEXT NOT NULL)',
 "CREATE TABLE storage_migration_audit(attempt_id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,result TEXT NOT NULL CHECK(result='committed'),implementation_checksum TEXT NOT NULL)"
];
const fields=values=>Buffer.concat(values.map(v=>v===null?Buffer.from('N;'):Buffer.concat([Buffer.from('S'+Buffer.byteLength(v)+':'),Buffer.from(v)])));
const eq=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const schemaPayload=objects=>fields([algorithm,'schema',String(objects.length),...[...objects].sort((a,b)=>eq(a[0],b[0])||eq(a[1],b[1])||eq(a[2],b[2])).flat()]);
const normalize=s=>s.replace(/\s+/g,' ').trim().replace(/^(CREATE(?: UNIQUE)? (?:TABLE|INDEX)) IF NOT EXISTS /,'$1 ').replace(/\s*([(),=])\s*/g,'$1');
function knownLayout(before,db){
 const canonical={meta:'CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)',entities:'CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)',outbox:'CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)'};
 const reverse={meta:'CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))',entities:'CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)',outbox:'CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)'};
 const indices={task_filter:'CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)',task_reminders:'CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)',task_parent:'CREATE INDEX task_parent ON entities(parent_id)'};
 const seen=new Set();for(const [type,name,table,sql] of before.objects){
  assert(!seen.has(type+':'+name),'duplicate schema object');seen.add(type+':'+name);
  if(type==='table'&&canonical[name]){assert(table===name&&[canonical[name],reverse[name]].map(normalize).includes(normalize(sql)),'unknown core table SQL '+name);}
  else if(type==='index'&&indices[name])assert(table==='entities'&&normalize(sql)===normalize(indices[name]),'unknown core index SQL');
  else if(type==='index'&&name==='sqlite_autoindex_entities_1')assert(table==='entities'&&sql===null,'unknown automatic index');
  else if(type==='table'&&name==='android_metadata'){assert(table===name&&normalize(sql)===normalize('CREATE TABLE android_metadata (locale TEXT)'),'unknown Android locale schema');
   const p=db.prepare('PRAGMA table_info(android_metadata)').all();assert(p.length===1&&p[0].cid===0&&p[0].name==='locale'&&p[0].type==='TEXT'&&p[0].notnull===0&&p[0].dflt_value===null&&p[0].pk===0,'Android locale columns');const rows=db.prepare('SELECT locale,typeof(locale) AS t FROM android_metadata').all();assert(rows.length===1&&rows[0].t==='text'&&rows[0].locale.length>0,'Android locale raw value');}
  else throw Error('unknown source schema object '+type+' '+name);
 }
 for(const name of Object.keys(canonical))assert(seen.has('table:'+name),'missing core table');for(const name of Object.keys(indices))assert(seen.has('index:'+name),'missing core index');assert(seen.has('index:sqlite_autoindex_entities_1'),'missing core primary-key index');
}
async function producer(r,platform,checksum){
 const read=async file=>JSON.parse(await fs.readFile(await safeFile(r,file),'utf8'));
 const identity=x=>assert(x.sourceSha===process.env.GITHUB_SHA&&x.runId===process.env.GITHUB_RUN_ID&&x.runAttempt===process.env.GITHUB_RUN_ATTEMPT&&x.implementationChecksum===checksum,'producer source/run/attempt/checksum identity');
 if(platform==='windows'){const result=await read('results.json'),build=await read('native-build-receipt.json'),source=await read('production-source-identity.json');[result,build,source].forEach(identity);assert(result.status==='passed'&&result.total===30&&result.passed===30&&result.failed===0&&result.cases.length===30&&result.cases.every(c=>c.passed===true),'Windows real suite failed');assert(build.productionEntryCompiled===true&&result.actualProductionApis.includes('db_put')&&result.actualProductionApis.includes('db_migration_reopen'),'Windows actual API evidence');return {passed:30,buildIdentity:checksum};}
 if(platform==='node'){const result=await read('node-report.json'),source=await read('production-source-identity.json');[result,source].forEach(identity);assert(result.status==='passed'&&result.passed===16&&result.failed===0&&result.cases.length===16&&result.cases.every(c=>c.status==='passed')&&result.actualProductionEntry===true&&result.startupMigration===false,'Node real suite failed');return {passed:16,buildIdentity:checksum};}
 const storage=await read('android-storage-receipt.json'),build=await read('android-build-receipt.json'),runner=await read('android-runner-receipt.json');[storage,build].forEach(identity);assert(runner.sourceSha===process.env.GITHUB_SHA&&runner.runId===process.env.GITHUB_RUN_ID&&runner.runAttempt===process.env.GITHUB_RUN_ATTEMPT&&runner.status==='passed','Android runner identity/status');assert(storage.status==='passed'&&storage.failed===0&&storage.passed===storage.cases.length&&storage.cases.every(c=>c.status==='passed')&&storage.actualProductionStorageApi===true&&storage.actualFramework===true&&storage.productionAppEntryLoaded===false&&build.productionStorageSourcesCompiled===true,'Android actual production storage suite failed');
 for(const name of ['cross-source.sqlite','cross-target.sqlite']){const entry=storage.files[name],bytes=await fs.readFile(await safeFile(r,name));assert(entry&&entry.writersClosed===true&&entry.bytes===bytes.length&&entry.sha256===hash(bytes)&&entry.sidecars.every(s=>!s.exists||s.bytes===0),'Android positive file sealing evidence');}return {passed:storage.passed,buildIdentity:checksum};
}
function fingerprints(db){
 const objects=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY').all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
 const tables=['entities','meta','outbox'];if(objects.some(r=>r[0]==='table'&&r[1]==='android_metadata'))tables.unshift('android_metadata');
 const chunks=[fields([algorithm,'raw',String(tables.length)])];
 for(const table of tables){const cols=db.prepare('PRAGMA table_info("'+table+'")').all().map(x=>x.name),stmt=db.prepare('SELECT '+cols.map(c=>'typeof("'+c+'"),CASE WHEN "'+c+'" IS NULL THEN NULL ELSE hex(CAST("'+c+'" AS BLOB)) END,CASE WHEN typeof("'+c+'")=\'real\' THEN "'+c+'" ELSE NULL END').join(',')+' FROM "'+table+'"');stmt.setReturnArrays(true);stmt.setReadBigInts(true);
  const rows=stmt.all().map(r=>{const values=[];for(let i=0;i<r.length;i+=3){let real=null;if(r[i]==='real'){const b=Buffer.alloc(8);b.writeDoubleBE(r[i+2]);real=b.toString('hex');}values.push(r[i],r[i+1],real);}return fields(values);}).sort(Buffer.compare);
  chunks.push(fields([table,String(cols.length),...cols,String(rows.length)]),...rows);
 }
 const schema=schemaPayload(objects),raw=Buffer.concat(chunks),userVersion=Number(db.prepare('PRAGMA user_version').get().user_version);
 return {objects,schemaPayload:schema.toString(),rawPayload:raw.toString(),schemaFingerprint:hash(schema),rawFingerprint:hash(raw),userVersion,snapshotId:hash(fields([algorithm,'snapshot',hash(schema),hash(raw),String(userVersion)]))};
}
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
async function check(name,fn){const c={name,status:'failed'};report.cases.push(c);try{c.evidence=await fn();c.status='passed';}catch(e){c.primaryError=String(e);c.stack=e.stack;}}
const coreData={};
for(const [platform,input] of [['windows',win],['node',node],['android',android]])await check(platform+'-independent-source-registry-raw-target-validation',async()=>{
 const r=await rootPath(input),sfile=await safeFile(r,'cross-source.sqlite'),tfile=await safeFile(r,'cross-target.sqlite'),source=new DatabaseSync(sfile,{readOnly:true}),target=new DatabaseSync(tfile,{readOnly:true});
 try{const before=fingerprints(source),after=fingerprints(target),proofS=await dbProof(sfile),proofT=await dbProof(tfile),registry=target.prepare('SELECT * FROM storage_migration_registry').all(),snapshots=target.prepare('SELECT * FROM storage_migration_snapshots').all(),audit=target.prepare('SELECT * FROM storage_migration_audit').all();
  knownLayout(before,source);assert(before.userVersion===0&&after.userVersion===1,'version transition');assert(before.rawPayload===after.rawPayload,'original raw changed');
  const expected=[...before.objects];for(const sql of ddl){const name=/^CREATE TABLE (\w+)/.exec(sql)[1];expected.push(['table',name,name,sql],['index','sqlite_autoindex_'+name+'_1',name,null]);}
  assert(after.schemaPayload===schemaPayload(expected).toString(),'target schema differs from independent expected source + six objects');assert(registry.length===1&&snapshots.length===1&&audit.length===1,'registry/snapshot/success audit count');
  const row=registry[0],snap=snapshots[0];assert(row.migration_id===migrationId&&row.contract_id===contractId&&row.status==='committed'&&/^[a-f0-9]{64}$/.test(row.checksum),'registry identity');
  assert(row.source_schema_fingerprint===before.schemaFingerprint&&row.source_raw_fingerprint===before.rawFingerprint&&row.source_user_version===0&&row.target_schema_fingerprint===after.schemaFingerprint&&row.target_raw_fingerprint===after.rawFingerprint&&row.target_user_version===1&&row.source_snapshot_id===before.snapshotId,'registry immutable evidence');
  assert(snap.snapshot_id===before.snapshotId&&snap.schema_payload===before.schemaPayload&&snap.raw_payload===before.rawPayload&&snap.source_raw_fingerprint===before.rawFingerprint&&snap.source_schema_fingerprint===before.schemaFingerprint&&snap.source_user_version===0,'snapshot original bytes');assert(audit[0].migration_id===migrationId&&audit[0].source_snapshot_id===before.snapshotId&&audit[0].result==='committed'&&audit[0].implementation_checksum===row.checksum,'audit identity');
  const producerEvidence=await producer(r,platform,row.checksum);coreData[platform]=Object.fromEntries(['entities','meta','outbox'].map(k=>[k,proofS.payload.data[k]]));assert(JSON.stringify(coreData[platform])===JSON.stringify(Object.fromEntries(['entities','meta','outbox'].map(k=>[k,proofT.payload.data[k]]))),'independent typed-cell comparator');
  return {producer:producerEvidence,source:before,target:{schemaFingerprint:after.schemaFingerprint,rawFingerprint:after.rawFingerprint,userVersion:after.userVersion},implementationChecksum:row.checksum,androidLocalMetadata:proofS.payload.data.android_metadata??null};
 }finally{source.close();target.close();}
});
for(const [a,b] of [['windows','node'],['node','android'],['android','windows']])await check('cross-core-'+a+'-'+b,async()=>{assert(coreData[a]&&coreData[b],'missing platform results');assert(JSON.stringify(coreData[a])===JSON.stringify(coreData[b]),'cross-end original core values diverge');return {coreRawEqual:true,androidMetadata:'separate recognized device-local domain'};});
await check('backup-and-restore-result-evidence',async()=>{const r=await rootPath(backupRoot),b=JSON.parse(await fs.readFile(await safeFile(r,'backup-results.json'),'utf8'));assert(b.sourceSha===process.env.GITHUB_SHA&&b.runId===process.env.GITHUB_RUN_ID&&b.status==='passed'&&b.failed===0&&b.passed===b.cases.length&&b.cases.every(x=>x.status==='passed'),'backup framework failed or source identity mismatch');return {passed:b.passed,failed:b.failed,limitations:b.limitations};});
report.passed=report.cases.filter(x=>x.status==='passed').length;report.failed=report.cases.length-report.passed;report.status=report.failed?'failed':'passed';await writeFresh(root,'comparison-results.json',json(report));console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed}));if(report.failed)process.exitCode=1;
