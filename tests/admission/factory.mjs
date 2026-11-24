import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {directory,writeFresh,FRAMEWORK,json} from '../../admission/guard.mjs';
import {WriterRegistry} from '../../admission/writer-lease.mjs';
// Independent fixed source layout, not imported from the admission whitelist.
const SCHEMA=[
 'CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)',
 'CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)',
 'CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)',
 'CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)',
 'CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)',
 'CREATE INDEX task_parent ON entities(parent_id)'
];
export const META={version:2,actor:'synthetic-actor',seq:2,clock:3,queue:9,vector:{'synthetic-actor':2},cursors:{'synthetic-remote':5},pending:{'synthetic-pending':1},scope:null,epoch:null,initialized:true,revision:4,dataRevision:2,manifest:{batch:'synthetic-2'},ack:6,settings:{}};
export const event=n=>({key:'["tasks","synthetic-task"]',actor:'synthetic-actor',seq:n,clock:n,context:{},values:{title:'synthetic task '+n}});
export function seed(db,{typed=true}={}){
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');for(const sql of SCHEMA)db.exec(sql);
 db.prepare('INSERT INTO meta(id,value) VALUES(1,?)').run(JSON.stringify(META));
 db.prepare('INSERT INTO outbox(id,event) VALUES(?,?)').run(8,JSON.stringify(event(1)));
 if(typed)db.exec("INSERT INTO entities(key,kind,id,data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start) VALUES('synthetic-typed','tasks','synthetic-typed',' {\"title\":\"合成 é 😀\"} ','{}',0,'[]',X'610062FF',9007199254740993,1.0000000000000002,9223372036854775807,NULL)");
}
export async function newDirectory(context,name){const dir=await directory(context,name);await writeFresh(context,path.join(name,'.synthetic-source.json'),json({framework:FRAMEWORK,syntheticOnly:true,sourceSha:context.sourceSha,runId:context.runId,runAttempt:context.runAttempt,database:'source.sqlite'}));return dir;}
export async function fixture(context,name,{mutate=null,attachment=false,closeFault=false,unknownClose=false}={}){
 const dir=await newDirectory(context,name),db=new DatabaseSync(path.join(dir,'source.sqlite'));seed(db);if(mutate)await mutate(db,dir);
 const expected=[{id:'core',kind:'sqlite'}],registry=new WriterRegistry(attachment?[...expected,{id:'image',kind:'file'}]:expected);let file=null;
 registry.register({id:'core',kind:'sqlite',close:async()=>{if(closeFault)throw Object.assign(new Error('diagnostic close fault before actual close'),{code:'A_CLOSE_DIAGNOSTIC'});db.close();},closed:async()=>unknownClose?false:db.isOpen===false});
 if(attachment){file=await fs.open(path.join(dir,'original-image.bin'),'wx');await file.write(Buffer.from([0,255,137,80,78,71]));registry.register({id:'image',kind:'file',close:async()=>file.close(),closed:async()=>file.fd===-1});}
 return {dir,db,file,registry,name,async seal(){return registry.acquire();},async cleanup(){if(db.isOpen)db.close();if(file&&file.fd!==-1)await file.close();}};
}
