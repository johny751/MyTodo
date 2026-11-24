import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import {initialMeta,buildState,initializeReplica,editReplica,diffState} from './replica.mjs';
import {captureD2Snapshot,migrationBuildIdentity,runStorageMigration,inspectD2MigrationOutcome} from './migration-runtime.mjs';

export function createSQLiteStore(directory){
 const db=new DatabaseSync(path.join(directory,'tasks.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entities (key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT); CREATE INDEX IF NOT EXISTS task_filter ON entities(kind,deleted,done,quadrant,start); CREATE INDEX IF NOT EXISTS task_reminders ON entities(kind,deleted,done,reminder_at); CREATE INDEX IF NOT EXISTS task_parent ON entities(parent_id); CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY,event TEXT NOT NULL);');
 db.prepare('INSERT OR IGNORE INTO meta(id,value) VALUES(1,?)').run(JSON.stringify(initialMeta(crypto.randomUUID())));
 const meta=()=>JSON.parse(db.prepare('SELECT value FROM meta WHERE id=1').get().value);
 const decode=row=>row&&({key:row.key,data:JSON.parse(row.data),record:JSON.parse(row.record),deleted:!!row.deleted,conflicts:JSON.parse(row.conflicts)});
 const get=db.prepare('SELECT * FROM entities WHERE key=?');
 const put=db.prepare('INSERT INTO entities(key,kind,id,data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,id=excluded.id,data=excluded.data,record=excluded.record,deleted=excluded.deleted,conflicts=excluded.conflicts,parent_id=excluded.parent_id,done=excluded.done,quadrant=excluded.quadrant,reminder_at=excluded.reminder_at,start=excluded.start');
 const queue=db.prepare('INSERT INTO outbox(id,event) VALUES(?,?)');
 let migrationClosed=false;
 function call(input){
  if(migrationClosed)throw Error('迁移结果未知后原数据库句柄已关闭，请显式重新打开');
  switch(input.action){
   case 'inspect':return {meta:meta(),rows:[...new Set(input.keys||[])].map(k=>decode(get.get(k))).filter(Boolean)};
   case 'state':return {meta:meta(),rows:db.prepare('SELECT key,data,deleted FROM entities WHERE deleted=0').all().map(r=>({key:r.key,data:JSON.parse(r.data),deleted:false}))};
   case 'page':return {meta:meta(),rows:db.prepare('SELECT * FROM entities WHERE key>? ORDER BY key LIMIT ?').all(input.after||'',Math.min(500,input.limit||100)).map(decode)};
   case 'conflicts':return db.prepare("SELECT * FROM entities WHERE conflicts!='[]' ORDER BY key LIMIT 200").all().flatMap(r=>decode(r).conflicts);
   case 'outbox':return {meta:meta(),entries:db.prepare('SELECT * FROM outbox ORDER BY id LIMIT ?').all(Math.min(500,input.limit||100)).map(r=>({id:r.id,event:JSON.parse(r.event)}))};
   case 'commit':{
    db.exec('BEGIN IMMEDIATE');try{const current=meta();if(current.revision!==input.expected){db.exec('ROLLBACK');return {ok:false};}
     if(input.meta.actor!==current.actor||input.meta.version!==2)throw Error('无效的本地数据库版本');
     for(const row of input.rows||[]){const [kind,id]=JSON.parse(row.key),d=row.data;put.run(row.key,kind,id,JSON.stringify(d),JSON.stringify(row.record),row.deleted?1:0,JSON.stringify(row.conflicts||[]),d.parentId||null,d.done?1:0,d.quadrant??null,Number.isFinite(d.reminderAt)?d.reminderAt:null,d.start||'');}
     if(input.clearOutbox)db.exec('DELETE FROM outbox');if(input.ack!=null)db.prepare('DELETE FROM outbox WHERE id<=?').run(input.ack);
     for(const item of input.outbox||[])queue.run(item.id,JSON.stringify(item.event));
     const next={...input.meta,revision:current.revision+1,dataRevision:(current.dataRevision||0)+((input.rows||[]).length?1:0)};db.prepare('UPDATE meta SET value=? WHERE id=1').run(JSON.stringify(next));db.exec('COMMIT');return {ok:true,revision:next.revision};
    }catch(e){
     // A failed COMMIT/statement can already have ended the transaction.
     // Keep that SQLite exception as the primary failure if cleanup also fails.
     try{db.exec('ROLLBACK');}catch(rollbackError){if(e&&typeof e==='object')e.rollbackError=rollbackError;}
     throw e;
    }
   }
   default:throw Error('不支持的数据库操作');
  }
 }
 return {call,close:()=>db.close(),closeChecked(){if(migrationClosed)return {closed:true};try{db.close();migrationClosed=true;return {closed:true};}catch(error){return {closed:false,error};}},
  captureD2Snapshot:()=>captureD2Snapshot(db),migrationBuildIdentity,getD2BuildIdentity:migrationBuildIdentity,
  migrateStorageInfrastructure:(request,options={})=>runStorageMigration(db,path.join(directory,'tasks.sqlite'),request,{...options,closeOriginal:()=>{db.close();migrationClosed=true;}}),
  inspectStorageMigrationOutcome:(request,options={})=>inspectD2MigrationOutcome(path.join(directory,'tasks.sqlite'),request,options),
  read(){const value=call({action:'state'});return buildState(value.rows,value.meta.settings);},initialize:state=>initializeReplica(call,state),async save(state){const before=this.read();await editReplica(call,diffState(before,state).changes,state.settings);return {saved:true};}};
}
