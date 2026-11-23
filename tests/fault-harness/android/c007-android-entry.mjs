import {runAndroidEntry} from './tests/protocol-harness/android/android-adapter.mjs';
import {editReplica,applyRemote,updateMeta} from './src/replica.mjs';
import {__c003Internals as delta} from './src/.c003-delta-adapter.mjs';
await runAndroidEntry(async(input,adapter)=>{
 const metadata=await(await fetch('./build-metadata.json')).json(),runtime=await adapter.describe();
 if(!/^[a-f0-9]{40}$/.test(input.sourceSha||'')||metadata.sourceSha!==input.sourceSha)throw Error('C007 APK source SHA mismatch');
 const receipt={schema:'mytodo-c007-attempt',version:1,platform:'android',sourceSha:metadata.sourceSha,caseId:input.caseId,attemptId:input.attemptId,operation:input.operation,fault:input.fault||{kind:'none'},runtime,status:'failed',observerExitCode:1};
 if(input.mode==='init'){
  const existing=await adapter.audit();
  if(existing.meta.initialized||existing.rows.length||existing.outbox.length)throw Error('C007 initialization requires an empty fixture database');
  await adapter.seed({actor:input.actor});
  await updateMeta(adapter.call,m=>{m.scope=input.scope;m.epoch=input.epoch;m.initialized=true;});
 }
 receipt.before=await adapter.audit();receipt.dbDir=receipt.before.databaseFile;
 await adapter.control({op:'c007Save',suffix:'before',value:receipt});
 await adapter.control({op:'c007Fault',fault:receipt.fault});
 try{
  const op=input.operation||{op:'audit'};
  switch(op.op){
   case 'local':receipt.returned=await editReplica(adapter.call,op.changes);break;
   case 'remote':receipt.returned=await applyRemote(adapter.call,op.events,undefined,op.cursor||null);break;
   case 'inspect':receipt.returned=await adapter.call({action:'inspect',keys:op.keys});break;
   case 'page':receipt.returned=await adapter.call({action:'page',after:op.after||'',limit:100});break;
   case 'outbox':receipt.returned=await adapter.call({action:'outbox',limit:500});break;
   case 'prepare':receipt.returned=await delta.prepare(adapter.call,op.manifest);break;
   case 'publish':{
    const pending=(await adapter.call({action:'inspect',keys:[]})).meta.pending;
    if(!pending)throw Error('C007 publish requires durable pending');
    const remote=await adapter.request({method:'GET',path:'v2/manifest.json'});
    receipt.returned=await delta.publish(adapter.call,adapter.request,{value:delta.manifestValue(remote),etag:remote.etag},pending);break;
   }
   case 'audit':receipt.returned=receipt.before;break;
   default:throw Error('Unsupported C007 Android operation');
  }
  receipt.operationAccepted=true;
 }catch(error){receipt.operationAccepted=false;receipt.operationError=String(error?.stack||error);}
 receipt.nativeError=await adapter.control({op:'c007Diagnostics'});
 await adapter.control({op:'c007Save',suffix:'operation',value:receipt});
 await adapter.control({op:'c007ClearFault'});
 receipt.after=await adapter.audit();receipt.observerExitCode=0;
 // Instrumentation status only acknowledges a complete observer receipt. Controller evaluates acceptance.
 receipt.status='passed';receipt.observationStatus='observed';return receipt;
});
