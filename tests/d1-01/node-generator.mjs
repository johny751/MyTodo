// Independent synthetic generator. Never imports a production storage entry point.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const GUARD='MYTODO_D1_SYNTHETIC_ONLY', CANDIDATE='d1-01-candidate.1', FIXTURE='synthetic-fixed-v1';
const SCHEMA=`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL);
CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT);
CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start);
CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at);
CREATE INDEX task_parent ON entities(parent_id);
CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL);`;
function fail(reason){throw new Error('BLOCKER: '+reason);}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function text(value,label){if(typeof value!=='string'||value.includes('\0'))fail(label+' must be NUL-free TEXT');return value;}
function ancestry(file,leafDirectory){
  let cursor=file, first=true;
  for(;;){
    const stat=fs.lstatSync(cursor);
    if(stat.isSymbolicLink())fail('symlink/junction ancestor');
    if((!first||leafDirectory)&&!stat.isDirectory())fail('non-directory ancestor');
    if(first&&!leafDirectory&&(!stat.isFile()||stat.nlink!==1))fail('regular, non-hardlinked input required');
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;first=false;
  }
}
function readJson(file,withSource=false){ancestry(file,false);const bytes=fs.readFileSync(file);if(bytes.includes(0))fail('NUL input');const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes),json=JSON.parse(source);return withSource?{json,source}:json;}
function rootGuard(arg){
  const runId=process.env.GITHUB_RUN_ID, tempArg=process.env.RUNNER_TEMP;
  if(process.env.GITHUB_ACTIONS!=='true'||!/^\d+$/.test(runId||'')||!tempArg)fail('GitHub Actions/runId/RUNNER_TEMP required');
  if(!path.isAbsolute(arg||'')||!path.isAbsolute(tempArg))fail('absolute dedicated root required');
  const root=path.resolve(arg),temp=path.resolve(tempArg);
  ancestry(temp,true);ancestry(root,true);
  const realRoot=fs.realpathSync(root),realTemp=fs.realpathSync(temp);
  const equal=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
  if(!equal(realRoot,root)||!equal(realTemp,temp))fail('noncanonical/reparse path');
  const rel=path.relative(realTemp,realRoot);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))fail('root must be strictly beneath RUNNER_TEMP');
  const markerInput=readJson(path.join(root,'D1-SYNTHETIC.json'),true),marker=markerInput.json;
  if(!object(marker)||Object.keys(marker).length!==3||marker.guard!==GUARD||marker.runId!==runId||marker.candidate!==CANDIDATE)fail('exact run marker mismatch');
  if([...markerInput.source.matchAll(/"(?:guard|runId|candidate)"\s*:/g)].length!==3)fail('duplicate/nonliteral marker keys');
  return {root,runId};
}
function bindable(value){return value===null||typeof value==='string'||typeof value==='number'||typeof value==='bigint'||value instanceof Uint8Array;}
function valueType(value){return Array.isArray(value)?'array':value===null?'null':typeof value;}

if(process.argv.length!==3)fail('usage: node node-generator.mjs <syntheticRoot>');
const {root,runId}=rootGuard(process.argv[2]), fixture=readJson(path.join(root,'fixture.json'));
if(!object(fixture)||Object.keys(fixture).length!==9||fixture.synthetic!==true||fixture.guard!==GUARD||fixture.candidate!==CANDIDATE||fixture.fixtureId!==FIXTURE||fixture.runId!==runId)fail('fixture identity mismatch');
if(fixture.schema!==SCHEMA||!Array.isArray(fixture.rows)||!Array.isArray(fixture.outbox))fail('fixed schema/fixture arrays required');
text(fixture.meta,'meta');
const keys=new Set(),outIds=new Set();
for(const row of fixture.rows){
  if(!object(row)||Object.keys(row).length!==7)fail('exact row object required');
  for(const name of ['key','kind','id','data','record','conflicts'])text(row[name],name);
  if(![0,1].includes(row.deleted)||keys.has(row.key))fail('deleted flag/duplicate row key');keys.add(row.key);
  const key=JSON.parse(row.key);if(!Array.isArray(key)||key.length!==2||key[0]!==row.kind||key[1]!==row.id)fail('row identity mismatch');
  if(!object(JSON.parse(row.data)))fail('object payload required for legacy projections');
}
for(const item of fixture.outbox){
  if(!object(item)||Object.keys(item).length!==2||!Number.isSafeInteger(item.id)||item.id<1||outIds.has(item.id))fail('outbox safe unique id required');
  outIds.add(item.id);text(item.event,'event');
}
const dbFile=path.join(root,'node-source.sqlite'),receiptFile=path.join(root,'node-generator-receipt.json');
for(const file of [dbFile,dbFile+'-wal',dbFile+'-shm',receiptFile])if(fs.existsSync(file))fail('refuse existing output: '+path.basename(file));
rootGuard(root);
fs.closeSync(fs.openSync(dbFile,'wx',0o600)); // Reserve a fresh regular file before SQLite opens it.
let db;
const diagnostics=[];
try{
  db=new DatabaseSync(dbFile,{allowExtension:false});
  db.exec('PRAGMA trusted_schema=OFF;');db.exec(SCHEMA);db.exec('BEGIN IMMEDIATE;');
  db.prepare('INSERT INTO d1_synthetic_guard(token,fixture_id) VALUES(?,?)').run(GUARD,FIXTURE);
  db.prepare('INSERT INTO meta(id,value) VALUES(1,?)').run(fixture.meta);
  const explicitInsert='INSERT INTO entities(key,kind,id,data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)';
  const legacyObservationInsert=db.prepare(explicitInsert);
  const safeSourceInsert=db.prepare(explicitInsert);
  const exists=db.prepare('SELECT key FROM entities WHERE key=?');
  for(const row of fixture.rows){
    const d=JSON.parse(row.data);
    // These expressions are the existing Node legacy SQL projection expressions.
    // Original data/record/conflicts TEXT is bound unchanged, never reserialized.
    const projected=[d.parentId||null,d.done?1:0,d.quadrant??null,Number.isFinite(d.reminderAt)?d.reminderAt:null,d.start||''];
    const names=['parent_id','done','quadrant','reminder_at','start'];
    const base=[row.key,row.kind,row.id,row.data,row.record,row.deleted,row.conflicts];
    const unsupported=projected.map((v,i)=>!bindable(v)?i:-1).filter(i=>i>=0);
    if(unsupported.length){
      let observed;
      try{legacyObservationInsert.run(...base,...projected);}
      catch(error){if(!(error instanceof TypeError||error.code==='ERR_INVALID_ARG_TYPE'))throw error;observed=error;}
      if(!observed||exists.get(row.key))fail('legacy binding observation did not reject without insertion');
      for(const i of unsupported)diagnostics.push({key:row.key,field:names[i],reason:'legacy-binding-rejected',inputType:valueType(projected[i]),code:observed.code||null,error:observed.message,legacyRowInserted:false,storageMode:'syntheticQuarantineStorage',sourceCell:'SQL NULL',claim:'separate synthetic raw storage; no legacy repair or transaction-success claim'});
      // Separate source storage after the rejected observation: candidate tools
      // consume original TEXT, never the quarantined legacy SQL projection cells.
      const safeSourceCells=projected.map((value,i)=>unsupported.includes(i)?null:value);
      safeSourceInsert.run(...base,...safeSourceCells);
    }else safeSourceInsert.run(...base,...projected);
  }
  const enqueue=db.prepare('INSERT INTO outbox(id,event) VALUES(?,?)');
  for(const item of fixture.outbox)enqueue.run(item.id,item.event);
  // Verify exact SQL TEXT payloads, including huge integer tokens inside JSON strings.
  const read=db.prepare('SELECT kind,id,data,record,deleted,conflicts FROM entities WHERE key=?');
  for(const row of fixture.rows){const actual=read.get(row.key);for(const name of ['kind','id','data','record','deleted','conflicts'])if(actual?.[name]!==row[name])fail('original cell changed: '+row.key+'/'+name);}
  if(db.prepare('SELECT value FROM meta WHERE id=1').get().value!==fixture.meta)fail('meta TEXT changed');
  const readEvent=db.prepare('SELECT event FROM outbox WHERE id=?');
  for(const item of fixture.outbox)if(readEvent.get(item.id).event!==item.event)fail('event TEXT changed');
  db.exec('COMMIT;');
  const rows=db.prepare('SELECT count(*) AS n FROM entities').get().n,outboxCount=db.prepare('SELECT count(*) AS n FROM outbox').get().n;
  const sqliteVersion=db.prepare('SELECT sqlite_version() AS version').get().version;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');db.close();db=undefined;
  const receipt={status:'created',synthetic:true,guard:GUARD,fixtureId:FIXTURE,runId,candidate:CANDIDATE,generator:'independent-node-sqlite',sqliteVersion,rows,outboxCount,sourceFile:path.basename(dbFile),rawTextPreserved:true,syntheticQuarantineStorage:{rows:new Set(diagnostics.map(x=>x.key)).size,projectionFields:diagnostics.length,candidateInput:'original TEXT only'},legacyBindingObservations:diagnostics,projectionDiagnostics:diagnostics,limitations:['Synthetic generator only; no production storage wrapper.','Legacy binding rejection and separate syntheticQuarantineStorage are distinct observations; no legacy insertion repair or transaction-success claim.','No production migration, synchronization, or device compatibility claim.']};
  rootGuard(root);
  fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({status:'created',generator:receipt.generator,rows,outboxCount,diagnostics:diagnostics.length})+'\n');
}catch(error){
  if(db){try{db.exec('ROLLBACK;');}catch(rollbackError){error.rollbackError=rollbackError.message;}try{db.close();}catch(closeError){error.closeError=closeError.message;}}
  throw error; // Keep the first failure and the partial synthetic database for CI evidence.
}
