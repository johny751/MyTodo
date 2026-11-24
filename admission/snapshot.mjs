import {ALGORITHM,hash} from './guard.mjs';
export const CORE_DDL={
 meta:'CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)',
 entities:'CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)',
 outbox:'CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)'
};
const reversed={
 meta:'CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))',
 entities:'CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)',
 outbox:'CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)'
};
export const INDEX_DDL={task_filter:'CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)',task_reminders:'CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)',task_parent:'CREATE INDEX task_parent ON entities(parent_id)'};
const norm=s=>s.replace(/\s+/g,' ').trim().replace(/^CREATE (TABLE|INDEX) IF NOT EXISTS /,'CREATE $1 ').replace(/\s*([(),=])\s*/g,'$1');
const encode=values=>Buffer.concat(values.map(v=>v===null?Buffer.from('N;'):Buffer.concat([Buffer.from('S'+Buffer.byteLength(v)+':'),Buffer.from(v)])));
const sorted=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const counter=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const actor=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(s);
function blocked(status,message){const e=new Error(message);e.status=status;throw e;}
function knownSchema(objects){
 if(objects.length!==7)blocked('blockedSchema','Unknown source schema objects');
 const seen=new Set();for(const o of objects){if(seen.has(o.name))blocked('blockedSchema','Duplicate schema object');seen.add(o.name);
  if(CORE_DDL[o.name]){if(o.type!=='table'||o.tbl_name!==o.name||![CORE_DDL[o.name],reversed[o.name]].some(sql=>norm(o.sql||'')===norm(sql)))blocked('blockedSchema','Unknown complete table DDL');}
  else if(INDEX_DDL[o.name]){if(o.type!=='index'||o.tbl_name!=='entities'||norm(o.sql||'')!==norm(INDEX_DDL[o.name]))blocked('blockedSchema','Unknown index definition');}
  else if(o.name==='sqlite_autoindex_entities_1'){if(o.type!=='index'||o.tbl_name!=='entities'||o.sql!==null)blocked('blockedSchema','Unknown automatic index');}
  else blocked('blockedSchema','Unrecognized source layout');
 }
}
function parseMetadata(db,text,rawHex,label){
 if(typeof text!=='string'||text.includes('\0')||Buffer.from(text).toString('hex').toUpperCase()!==rawHex)blocked('blockedMetadata','Noncanonical UTF-8 metadata bytes: '+label);
 let value;try{value=JSON.parse(text);}catch{blocked('blockedMetadata','Invalid JSON metadata: '+label);}
 if(!value||Array.isArray(value)||typeof value!=='object')blocked('blockedMetadata','Metadata object required: '+label);
 const duplicate=db.prepare("WITH tree AS (SELECT * FROM json_tree(?)) SELECT child.parent,child.key FROM tree child JOIN tree parent ON child.parent=parent.id WHERE parent.type='object' GROUP BY child.parent,child.key HAVING count(*)>1 LIMIT 1").get(text);
 if(duplicate)blocked('blockedMetadata','Duplicate JSON metadata key: '+label);return value;
}
function metadata(db){
 const rows=db.prepare("SELECT id,typeof(id) AS idType,typeof(value) AS valueType,hex(CAST(value AS BLOB)) AS rawHex,value FROM meta");rows.setReadBigInts(true);const values=rows.all();
 if(values.length!==1||values[0].idType!=='integer'||values[0].id!==1n||values[0].valueType!=='text')blocked('blockedMetadata','Exactly one original metadata row required');
 const m=parseMetadata(db,values[0].value,values[0].rawHex,'meta');if(m.version!==2||!actor(m.actor)||!['seq','clock','queue'].every(k=>counter(m[k])))blocked('blockedActorMetadata','Unknown Actor, metadata version or counters');
 for(const k of ['vector','cursors']){if(!m[k]||Array.isArray(m[k])||typeof m[k]!=='object'||Object.values(m[k]).some(n=>!counter(n)))blocked('blockedActorMetadata','Unknown metadata counter map');}
 const stmt=db.prepare("SELECT id,typeof(id) AS idType,event,typeof(event) AS eventType,hex(CAST(event AS BLOB)) AS rawHex FROM outbox ORDER BY id");stmt.setReadBigInts(true);const outbox=stmt.all();
 for(const row of outbox){if(row.idType!=='integer'||row.id<1n||row.id>BigInt(m.queue)||row.eventType!=='text')blocked('blockedOutboxMetadata','Unknown outbox identity or queue boundary');const event=parseMetadata(db,row.event,row.rawHex,'outbox');
  if(event.actor!==m.actor||!actor(event.actor)||!counter(event.seq)||event.seq===0||event.seq>m.seq||!counter(event.clock)||event.clock===0||event.clock>m.clock||!event.context||Array.isArray(event.context)||typeof event.context!=='object'||!event.values||Array.isArray(event.values)||typeof event.values!=='object')blocked('blockedOutboxMetadata','Unknown outbox Actor/event metadata');
 }
 return {actor:m.actor,metaVersion:m.version,seq:String(m.seq),clock:String(m.clock),queue:String(m.queue),outboxRows:outbox.length,rawMetaSha256:hash(Buffer.from(values[0].rawHex,'hex')),replicationProtected:true};
}
export function captureShadowSnapshot(db){
 const version=Number(db.prepare('PRAGMA user_version').get().user_version);if(version!==0)blocked('blockedVersion','Only the reviewed core source version 0 is in this tool candidate');
 const objects=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY').all();knownSchema(objects);
 try{const integrity=db.prepare('PRAGMA integrity_check').all();if(integrity.length!==1||integrity[0].integrity_check!=='ok')blocked('blockedIntegrity','Readonly shadow integrity check refused');if(db.prepare('PRAGMA foreign_key_check').all().length)blocked('blockedIntegrity','Readonly shadow foreign key check refused');}catch(error){if(!error.status)error.status='blockedIntegrity';throw error;}
 const schema=encode([ALGORITHM,'schema',String(objects.length),...objects.flatMap(o=>[o.type,o.name,o.tbl_name,o.sql])]),chunks=[encode([ALGORITHM,'raw','3'])];
 for(const table of ['entities','meta','outbox']){
  const columns=db.prepare('PRAGMA table_info("'+table+'")').all().map(x=>x.name),stmt=db.prepare('SELECT '+columns.map(c=>'typeof("'+c+'"),CASE WHEN typeof("'+c+'") IN (\'null\',\'real\') THEN NULL ELSE hex(CAST("'+c+'" AS BLOB)) END,"'+c+'"').join(',')+' FROM "'+table+'"');stmt.setReadBigInts(true);stmt.setReturnArrays(true);
  const rows=stmt.all().map(row=>{const fields=[];for(let i=0;i<row.length;i+=3){let bits=null;if(row[i]==='real'){const binary=Buffer.alloc(8);binary.writeDoubleBE(row[i+2]);bits=binary.toString('hex');}fields.push(row[i],row[i+1],bits);}return encode(fields);}).sort(Buffer.compare);
  chunks.push(encode([table,String(columns.length),...columns,String(rows.length)]),...rows);
 }
 const raw=Buffer.concat(chunks),schemaFingerprint=hash(schema),rawFingerprint=hash(raw),snapshotId=hash(encode([ALGORITHM,'snapshot',schemaFingerprint,rawFingerprint,String(version)]));
 return {algorithmId:ALGORITHM,schemaFingerprint,rawFingerprint,userVersion:version,snapshotId,schemaPayload:schema.toString(),rawPayload:raw.toString(),metadata:metadata(db),candidateOnly:true};
}
