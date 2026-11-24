import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {requireContext,safeFile,fixtureMarker,hash,json,writeFresh} from './guard.mjs';
import {requireIdentity} from './identity.mjs';
import {createAudit,errorRecord} from './audit.mjs';
import {captureShadowSnapshot} from './snapshot.mjs';
import {verifyClosedLease} from './writer-lease.mjs';

export async function components(context,directoryName){
 requireContext(context);const proof=[],buffers=new Map();for(const suffix of ['','-wal','-shm','-journal']){
  const relative=path.join(directoryName,'source.sqlite'+suffix),file=await safeFile(context,relative,{missing:!!suffix});const st=await fs.stat(file,{bigint:true}).catch(e=>{if(suffix&&e.code==='ENOENT')return null;throw e;});
  if(!st){proof.push({suffix,present:false});continue;}if(st.size>64n*1024n*1024n||!st.isFile()||st.nlink!==1n)throw Error('Unknown component size/type/link identity');
  const bytes=await fs.readFile(file);buffers.set(suffix,bytes);proof.push({suffix,present:true,bytes:bytes.length,sha256:hash(bytes),dev:String(st.dev),ino:String(st.ino),mtimeNs:String(st.mtimeNs)});
 }
 return {proof,buffers,digest:hash(Buffer.from(JSON.stringify(proof)))};
}
function readShadow(file){
 let db=null,primary=null,snapshot;try{db=new DatabaseSync(file,{readOnly:true});db.exec('BEGIN');snapshot=captureShadowSnapshot(db);db.exec('ROLLBACK');return snapshot;}
 catch(error){primary=error;if(db){try{db.exec('ROLLBACK');}catch(rollbackError){primary.rollbackErrors=[...(primary.rollbackErrors||[]),rollbackError];}}throw primary;}
 finally{if(db){try{db.close();}catch(closeError){if(primary)primary.closeError=closeError;else throw closeError;}}}
}
export async function preflight(context,{directoryName,identity,registry,lease,expectedSnapshotId=null,expectedActor=null,observer=null}){
 requireContext(context);const result={framework:'mytodo-a-readonly-preflight-v1',productionAdmission:false,sourceSqliteOpened:false,status:'blocked',sourceAccessed:false};
 try{requireIdentity(context,identity);}catch(error){return {...result,status:'blockedBuildIdentity',error:errorRecord(error)};}
 let verifiedBarrier=null,barrierError=null;try{verifiedBarrier=verifyClosedLease(registry,lease);}catch(error){barrierError=error;}
 const audit=await createAudit(context,{toolChecksum:identity.toolChecksum,sourceSnapshotId:expectedSnapshotId,leaseGeneration:verifiedBarrier?.generation??null,operation:'readonly-source-preflight'});result.attemptId=audit.attemptId;result.auditFile=path.relative(context.root,audit.file);let before=null,primary=null;
 try{
  if(barrierError)throw barrierError;const barrier=verifiedBarrier;await audit.append('registered-barrier',{barrier});result.barrier=barrier;
  await fixtureMarker(context,directoryName);result.sourceAccessed=true;before=await components(context,directoryName);result.sourceBefore=before.proof;result.sourceComponentDigest=before.digest;
  await audit.append('source-before',{components:before.proof,digest:before.digest});
  if(before.buffers.get('-journal')?.length)throw Object.assign(new Error('Unknown rollback journal; preserve original'),{status:'blockedJournal'});
  const shadowName='shadow-'+crypto.randomUUID(),shadowDir=await safeFile(context,shadowName,{missing:true});await fs.mkdir(shadowDir);
  for(const suffix of ['','-wal'])if(before.buffers.has(suffix))await writeFresh(context,path.join(shadowName,'source.sqlite'+suffix),before.buffers.get(suffix));
  result.shadowDirectory=shadowName;await audit.append('isolated-shadow-copied',{shadowDirectory:shadowName,copied:['main',...(before.buffers.has('-wal')?['wal']:[])],shm:'not copied; SQLite may create private shadow SHM'});
  if(observer)await observer('afterCopy');verifyClosedLease(registry,lease);
  const snapshot=readShadow(path.join(shadowDir,'source.sqlite'));result.snapshot=snapshot;await audit.append('source-snapshot-captured',{snapshotId:snapshot.snapshotId,schemaFingerprint:snapshot.schemaFingerprint,rawFingerprint:snapshot.rawFingerprint,metadata:snapshot.metadata});
  if(expectedSnapshotId&&snapshot.snapshotId!==expectedSnapshotId)throw Object.assign(new Error('Approved source snapshot changed'),{status:'blockedSnapshotAdvanced'});
  if(expectedActor&&snapshot.metadata.actor!==expectedActor)throw Object.assign(new Error('Approved Actor changed'),{status:'blockedActorAdvanced'});
  result.status=expectedSnapshotId&&expectedActor?'eligibleSynthetic':'capturedForReview';
 }catch(error){primary=error;result.status=error.status||'blockedWriterOrSource';result.error=errorRecord(error);await audit.failure(error).catch(auditError=>{result.auditError=errorRecord(auditError);});}
 finally{
  if(before){try{const after=await components(context,directoryName);result.sourceAfter=after.proof;result.sourceUnchanged=after.digest===before.digest;await audit.append('source-after',{components:after.proof,digest:after.digest,unchanged:result.sourceUnchanged});if(!result.sourceUnchanged){result.priorStatus=result.status;result.status='blockedSourceChanged';}verifyClosedLease(registry,lease);}catch(error){result.cleanupError=errorRecord(error);result.status='blockedSourceVerification';}}
  try{await audit.append('outcome',{status:result.status,sourceSqliteOpened:false,sourceUnchanged:result.sourceUnchanged??null,primaryError:primary?errorRecord(primary):null});}catch(error){result.auditError=errorRecord(error);result.status='blockedAudit';}
  try{await audit.close();result.auditAnchor=audit.receipt();}catch(error){result.auditCloseError=errorRecord(error);result.status='blockedAudit';}
 }
 return result;
}
