import {runAndroidEntry} from './tests/protocol-harness/android/android-adapter.mjs';
import {normalizeAudit} from './tests/protocol-harness/shared-executor.mjs';
import {syncDelta} from './src/delta-sync.mjs';
import {initializeReplica,editReplica,buildState} from './src/replica.mjs';

// Real production shared synchronization + real AccountStore/ReplicaDatabase.
// The Android transport shell changes only its fixture endpoint and supports MKCOL.
await runAndroidEntry(async(input,adapter)=>{
 const metadata=await(await fetch('./build-metadata.json')).json(),runtime=await adapter.describe();
 const before=await adapter.audit();
 if(input.mode==='report')return {schema:'mytodo-c006-android-report',version:1,platform:'android',caseId:input.caseId,status:'passed',raw:normalizeAudit(before),rawSQL:before,provenance:{...metadata,runtime}};
 if(!/^[a-zA-Z0-9_-]{1,60}$/.test(input.folder))throw Error('Invalid C006 fixture folder');
 const result={schema:'mytodo-c006-android-operation',version:1,platform:'android',caseId:input.caseId,operation:input.operation,before,
  provenance:{...metadata,runtime},expectedAccepted:input.expectedAccepted!==false,operationAccepted:false,status:'failed'};
 try{
  if(input.operation==='initialize'){
   if(before.meta.initialized||before.rows.length||before.outbox.length)throw Error('C006 initialization requires a new app-private database');
   await initializeReplica(adapter.call,input.state);
  }else if(input.operation==='edit')await editReplica(adapter.call,input.changes,input.settings);
  else if(input.operation==='sync')result.sync=await syncDelta({call:adapter.call,request:adapter.request,scope:JSON.stringify(['c006-synthetic',input.folder]),legacyBase:input.legacyBase??null,snapshots:false,maxBatches:12});
  else if(input.operation!=='audit')throw Error('Unknown migration operation');
  result.operationAccepted=true;
 }catch(error){result.productionError=String(error?.stack||error);}
 result.rawSQL=await adapter.audit();result.raw=normalizeAudit(result.rawSQL);
 result.visible=buildState(result.rawSQL.rows,result.rawSQL.meta.settings);
 await adapter.reopen();result.reopened=normalizeAudit(await adapter.audit());
 result.status=result.operationAccepted===result.expectedAccepted&&!result.sync?.busy?'passed':'failed';
 if(result.status!=='passed')result.error='Production outcome did not match explicitly declared acceptance/rejection, or lease is busy';
 return result;
});
