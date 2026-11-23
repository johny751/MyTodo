import {runAndroidEntry} from './tests/protocol-harness/android/android-adapter.mjs';
import {syncDelta} from './src/delta-sync.mjs';
import {initializeReplica,editReplica,buildState} from './src/replica.mjs';

await runAndroidEntry(async(input,adapter)=>{
 const metadata=await(await fetch('./build-metadata.json')).json(),runtime=await adapter.describe(),before=await adapter.audit();
 if(metadata.sourceSha!==input.sourceSha)throw Error('APK and requested source differ');
 const identity={sourceSha:metadata.sourceSha,caseId:input.caseId,attemptId:input.attemptId,dbCase:input.dbCase,operation:input.operation};
 await adapter.control({op:'c006Save',suffix:'before',value:{...identity,provenance:{...metadata,runtime},before}});
 const result={schema:'mytodo-c006-android-interruption',version:1,...identity,provenance:{...metadata,runtime},before,status:'failed'};
 try{
  if(input.operation==='initialize'){
   if(before.meta.initialized||before.rows.length||before.outbox.length)throw Error('Initialization requires an empty real database');
   await initializeReplica(adapter.call,input.state);
  }else if(input.operation==='edit')await editReplica(adapter.call,input.changes,input.settings);
  else if(input.operation==='sync')result.sync=await syncDelta({call:adapter.call,request:adapter.request,
   scope:JSON.stringify(['c006-synthetic',input.folder]),legacyBase:input.legacyBase??null,snapshots:false,maxBatches:12});
  else if(input.operation!=='audit')throw Error('Unknown interruption operation');
  result.after=await adapter.audit();result.visible=buildState(result.after.rows,result.after.meta.settings);
  if(input.exitAt)throw Error('Requested native termination gate was not reached');
  if(!!result.sync?.busy!==!!input.expectedBusy)throw Error('Unexpected production lease outcome');
  result.status='passed';
 }catch(error){result.error=String(error?.stack||error);result.after=await adapter.audit();}
 return result;
});
