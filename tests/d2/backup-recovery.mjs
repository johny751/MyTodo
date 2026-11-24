// Independent synthetic backup laboratory. Production must never import this module.
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {rootPath,safeFile,hash,json,writeFresh} from './isolation.mjs';
function cell(v){if(v===null)return ['null',null];if(typeof v==='bigint')return ['integer',v.toString()];if(typeof v==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(v);return ['real',b.toString('hex')];}if(typeof v==='string')return ['text',Buffer.from(v).toString('hex')];return ['blob',Buffer.from(v).toString('hex')];}
export function logical(db){
 const stmt=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY");
 const schema=stmt.all(),tables=schema.filter(x=>x.type==='table'&&!x.name.startsWith('sqlite_')).map(x=>x.name).sort(),data={};
 for(const name of tables){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('BLOCKER: unknown table identifier');
  const columns=db.prepare('PRAGMA table_info("'+name+'")').all().map(x=>x.name),q=db.prepare('SELECT '+columns.map(c=>'typeof("'+c+'"),hex(CAST("'+c+'" AS BLOB)),"'+c+'"').join(',')+' FROM "'+name+'"');q.setReadBigInts(true);q.setReturnArrays(true);
  const rows=q.all().map(row=>{const out=[];for(let i=0;i<row.length;i+=3)out.push([row[i],row[i]==='null'?null:row[i+1],row[i]==='real'?cell(row[i+2])[1]:null]);return out;}).sort((a,b)=>Buffer.compare(Buffer.from(JSON.stringify(a)),Buffer.from(JSON.stringify(b))));
  data[name]={columns,rows};
 }
 const version=Number(db.prepare('PRAGMA user_version').get().user_version),payload={schema,data,userVersion:version};return {payload,digest:hash(Buffer.from(JSON.stringify(payload)))};
}
function requireIntegrity(db){const rows=db.prepare('PRAGMA integrity_check').all();if(rows.length!==1||rows[0].integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('BLOCKER: integrity or foreign key failure');}
export async function dbProof(file){const db=new DatabaseSync(file,{readOnly:true});try{requireIntegrity(db);return logical(db);}finally{db.close();}}
export async function snapshot(root,{name,databases,attachments,remote,lease}){
 await rootPath(root);if(!lease?.active||lease.kind!=='synthetic-controlled-writer-barrier')throw Error('BLOCKER: writer and attachment fence absent');
 const folder=await safeFile(root,name,{exists:false});await fs.mkdir(folder);const held=[];
 const manifest={kind:'d2-synthetic-common-snapshot-v1',runId:process.env.GITHUB_RUN_ID,sourceSha:process.env.GITHUB_SHA,remote,databases:[],attachments:[],barrier:'controlled fixture only',createdAtUtc:new Date().toISOString()};
 let primaryError=null;try{
  for(const d of databases){await safeFile(root,d.relative);d.writer.exec('BEGIN IMMEDIATE');held.push(d.writer);}
  for(const d of databases){const source=await safeFile(root,d.relative),target=path.join(folder,d.name+'.sqlite'),reader=new DatabaseSync(source,{readOnly:true});try{await backup(reader,target);}finally{reader.close();}
   const sourceProof=logical(d.writer),targetProof=await dbProof(target);if(sourceProof.digest!==targetProof.digest)throw Error('BLOCKER: backup omitted source values or replication state');
   manifest.databases.push({name:d.name,source:d.relative,file:d.name+'.sqlite',bytes:(await fs.stat(target)).size,sha256:hash(await fs.readFile(target)),logicalDigest:targetProof.digest});
  }
  for(const a of attachments){const original=await safeFile(root,a.relative),bytes=await fs.readFile(original),file='attachment-'+String(manifest.attachments.length)+'.bin';await fs.writeFile(path.join(folder,file),bytes,{flag:'wx'});const copied=await fs.readFile(path.join(folder,file));if(!bytes.equals(copied))throw Error('BLOCKER: image original bytes changed');manifest.attachments.push({name:a.name,source:a.relative,file,bytes:bytes.length,sha256:hash(bytes)});}
  await fs.writeFile(path.join(folder,'manifest.json'),json(manifest),{flag:'wx'});await fs.writeFile(path.join(folder,'manifest.sha256'),hash(Buffer.from(json(manifest)))+'\n',{flag:'wx'});return {folder,manifest};
 }catch(e){primaryError=e;throw e;}finally{const errors=[];for(const db of held.reverse()){try{db.exec('ROLLBACK');}catch(e){errors.push(e);}}if(errors.length){if(primaryError)primaryError.rollbackErrors=errors;else{errors[0].rollbackErrors=errors.slice(1);throw errors[0];}}}
}
export async function verifyBundle(root,folder){
 await safeFile(root,path.relative(root,folder));const manifestFile=await safeFile(root,path.relative(root,path.join(folder,'manifest.json'))),bytes=await fs.readFile(manifestFile),expected=(await fs.readFile(await safeFile(root,path.relative(root,path.join(folder,'manifest.sha256'))),'utf8')).trim();if(hash(bytes)!==expected)throw Error('BLOCKER: altered manifest');
 const m=JSON.parse(bytes);if(m.kind!=='d2-synthetic-common-snapshot-v1'||m.runId!==process.env.GITHUB_RUN_ID||m.sourceSha!==process.env.GITHUB_SHA)throw Error('BLOCKER: wrong snapshot provenance');
 for(const item of [...m.databases,...m.attachments]){const p=await safeFile(root,path.relative(root,path.join(folder,item.file))),b=await fs.readFile(p);if(b.length!==item.bytes||hash(b)!==item.sha256)throw Error('BLOCKER: missing/corrupt component '+item.name);if(item.logicalDigest&&(await dbProof(p)).digest!==item.logicalDigest)throw Error('BLOCKER: raw state mismatch');}
 return m;
}
export async function restoreDecision(root,bundle,{current,remote,lease}){
 const m=await verifyBundle(root,bundle.folder);if(!lease?.active)return {status:'blockedFence'};
 if(remote===null)return {status:'blockedRemoteUnknown'};if(JSON.stringify(remote)!==JSON.stringify(m.remote))return {status:'blockedRemoteAdvanced'};
 if(!Array.isArray(current)||current.length!==m.databases.length||new Set(current.map(d=>d.name)).size!==m.databases.length)return {status:'blockedComponentSet'};
 for(const d of current){const b=m.databases.find(x=>x.name===d.name);if(!b||b.source!==d.relative)return {status:'blockedComponentSet'};if((await dbProof(await safeFile(root,d.relative))).digest!==b.logicalDigest)return {status:'blockedLocalAdvanced'};}
 for(const a of m.attachments){const bytes=await fs.readFile(await safeFile(root,a.source));if(bytes.length!==a.bytes||hash(bytes)!==a.sha256)return {status:'blockedAttachmentAdvanced'};}
 return {status:'eligibleSameSnapshot',manifest:m};
}
// In this laboratory all database handles and attachment writers are controlled by the caller.
// No production path/Actor resume/remote progress mutation capability is exposed.
export async function activateSameSnapshot(root,bundle,options,{fault=null}={}){
 if(options.lease?.databaseHandlesClosed!==true||options.lease?.attachmentWritersClosed!==true)throw Error('BLOCKER: registered database or attachment writer still open');
 const decision=await restoreDecision(root,bundle,options);if(decision.status!=='eligibleSameSnapshot')return decision;
 const stage=await safeFile(root,'restore-stage',{exists:false});await fs.mkdir(stage);const journal={kind:'d2-synthetic-restore-journal',runId:process.env.GITHUB_RUN_ID,sourceSha:process.env.GITHUB_SHA,bundleFolder:bundle.folder,manifestSha256:hash(Buffer.from(json(decision.manifest))),remote:decision.manifest.remote,state:'prepared',items:[]};
 for(const item of [...decision.manifest.databases,...decision.manifest.attachments]){const current=await safeFile(root,item.source),candidate=path.join(stage,item.file),retained=current+'.d2-retained';await safeFile(root,path.relative(root,retained),{exists:false});try{await fs.access(retained);throw Error('BLOCKER: retained path occupied');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(item.logicalDigest){
   // The read-only decision probe can create WAL/SHM even after the original
   // writers closed. Seal via SQLite's supported checkpoint/checked close,
   // within the fixture-owned closed-writer fence; never delete live sidecars.
   const handle=new DatabaseSync(current);let primary=null;try{const before=logical(handle).digest;requireIntegrity(handle);const check=handle.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(check.busy!==0)throw Error('BLOCKER: checkpoint busy');if(before!==item.logicalDigest||logical(handle).digest!==before)throw Error('BLOCKER: checkpoint changed raw snapshot');}catch(e){primary=e;throw e;}finally{try{handle.close();}catch(e){if(primary)primary.closeError=e;else throw e;}}
   for(const suffix of ['-wal','-shm','-journal']){const side=await fs.stat(current+suffix).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(side&&side.size!==0)throw Error('BLOCKER: live database sidecar; all writers must close before activation');}
  }
  await fs.copyFile(path.join(bundle.folder,item.file),candidate,fs.constants.COPYFILE_EXCL);journal.items.push({current,candidate,retained,retainedSha256:hash(await fs.readFile(current)),sha256:item.sha256,logicalDigest:item.logicalDigest??null});}
 const jpath=await writeFresh(root,'restore-journal.json',json(journal));const save=async()=>{const f=await fs.open(jpath,'w');try{await f.writeFile(json(journal));await f.sync();}finally{await f.close();}};
 const hit=p=>{if(fault===p)throw Error('injected '+p);};hit('afterStage');
 for(const item of journal.items){await fs.rename(item.current,item.retained);}journal.state='sourceRetained';await save();hit('afterSourceRetained');
 for(const item of journal.items){await fs.rename(item.candidate,item.current);}journal.state='activated';await save();hit('afterActivation');
 for(const item of journal.items){if(hash(await fs.readFile(item.current))!==item.sha256||item.logicalDigest&&(await dbProof(item.current)).digest!==item.logicalDigest)throw Error('BLOCKER: same-path reopen verification failed');}
 journal.state='confirmed';await save();hit('afterReopen');return {status:'restored',journal};
}
export async function recoverSameSnapshot(root,{remote,lease}){
 if(!lease?.active||lease.databaseHandlesClosed!==true||lease.attachmentWritersClosed!==true||remote===null||remote===undefined)return {status:'blockedRecoveryEvidence'};
 const file=await safeFile(root,'restore-journal.json'),journal=JSON.parse(await fs.readFile(file,'utf8'));if(journal.kind!=='d2-synthetic-restore-journal'||journal.runId!==process.env.GITHUB_RUN_ID||journal.sourceSha!==process.env.GITHUB_SHA)throw Error('BLOCKER: journal provenance');
 const sealed=await verifyBundle(root,journal.bundleFolder);if(hash(Buffer.from(json(sealed)))!==journal.manifestSha256||JSON.stringify(sealed.remote)!==JSON.stringify(journal.remote)||JSON.stringify(remote)!==JSON.stringify(sealed.remote))return {status:'blockedRecoveryEvidence'};
 for(const item of journal.items){for(const p of [item.current,item.candidate,item.retained])await safeFile(root,path.relative(root,p),{exists:false});
  const current=await fs.readFile(item.current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(current){const actualHash=hash(current);if(![item.retainedSha256,item.sha256].includes(actualHash)||item.logicalDigest&&(await dbProof(item.current)).digest!==item.logicalDigest)return {status:'blockedDataAdvanced'};}
  else{const candidate=await fs.readFile(item.candidate),retained=await fs.readFile(item.retained);if(hash(candidate)!==item.sha256||hash(retained)!==item.retainedSha256)return {status:'blockedMixedState'};}
 }
 for(const item of journal.items){try{await fs.access(item.current);}catch(e){if(e.code!=='ENOENT')throw e;await fs.rename(item.candidate,item.current);}if(item.logicalDigest)await dbProof(item.current);}
 journal.state='recoveredConfirmed';await fs.writeFile(file,json(journal));return {status:'recoveredSamePath',journal};
}
