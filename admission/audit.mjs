import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {requireContext,safeFile,hash,json} from './guard.mjs';
export function errorRecord(value,seen=new WeakSet(),depth=0){
 if(value===null||value===undefined)return value??null;
 if(typeof value!=='object')return {message:String(value)};
 if(depth>6||seen.has(value))return {message:'[nested error reference]'};seen.add(value);
 const out={name:String(value.name||'Error'),message:String(value.message||value),stack:typeof value.stack==='string'?value.stack:null};
 for(const k of ['code','errno','errcode','errstr','sqliteCode','sqliteExtendedCode','syscall','operation','status'])if(value[k]!==undefined)out[k]=String(value[k]);
 for(const k of ['cause','primaryError','rollbackError','closeError','logWriteError'])if(value[k]!==undefined)out[k]=errorRecord(value[k],seen,depth+1);
 for(const k of ['rollbackErrors','cleanupErrors'])if(Array.isArray(value[k]))out[k]=value[k].map(e=>errorRecord(e,seen,depth+1));
 return out;
}
export async function createAudit(context,{toolChecksum,sourceSnapshotId=null,leaseGeneration=null,operation}){
 requireContext(context);if(!/^[a-f0-9]{64}$/.test(toolChecksum)||!operation)throw Error('Bound audit identity required');
 const attemptId=crypto.randomUUID(),file=await safeFile(context,'audit-'+attemptId+'.jsonl',{missing:true}),handle=await fs.open(file,'wx');let sequence=0,previousDigest=null,closed=false;
 const identity=Object.freeze({sourceSha:context.sourceSha,runId:context.runId,runAttempt:context.runAttempt,toolChecksum,sourceSnapshotId,leaseGeneration,operation,attemptId});
 return {
  file,attemptId,identity,
  async append(type,details={}){if(closed)throw Error('Audit is closed');const record={sequence:++sequence,previousDigest,identity,type,details};const digest=hash(Buffer.from(JSON.stringify(record))),bytes=Buffer.from(JSON.stringify({...record,digest})+'\n');let offset=0;while(offset<bytes.length){const written=await handle.write(bytes,offset,bytes.length-offset,null);if(written.bytesWritten<1)throw Error('External audit short write');offset+=written.bytesWritten;}await handle.sync();previousDigest=digest;return digest;},
  async failure(primary){return this.append('failure',{error:errorRecord(primary)});},
  receipt(){return Object.freeze({attemptId,entries:sequence,finalDigest:previousDigest,closed});},
  async close(){if(closed)return;await handle.close();closed=true;}
 };
}
export async function verifyAudit(context,file,expected,{finalDigest=null,entries=null,requireOutcome=false}={}){
 requireContext(context);const bytes=await fs.readFile(await safeFile(context,file),'utf8'),lines=bytes.trim().split('\n');let previous=null,sequence=0,identity=null;
 let terminalType=null;for(const line of lines){const parsed=JSON.parse(line),{digest,...record}=parsed;if(record.sequence!==++sequence||record.previousDigest!==previous||hash(Buffer.from(JSON.stringify(record)))!==digest)throw Error('Audit chain mismatch');terminalType=record.type;
  if(!identity)identity=record.identity;if(JSON.stringify(record.identity)!==JSON.stringify(identity))throw Error('Attempt identity changed');for(const [k,v] of Object.entries(expected))if(identity[k]!==v)throw Error('Audit expected identity mismatch: '+k);previous=digest;
 }if(requireOutcome&&terminalType!=='outcome')throw Error('Audit lacks terminal outcome');if(finalDigest!==null&&previous!==finalDigest||entries!==null&&sequence!==entries)throw Error('Audit final tip/count mismatch');return {identity,entries:sequence,digest:previous,terminalType,complete:terminalType==='outcome',anchored:finalDigest!==null&&entries!==null};
}
