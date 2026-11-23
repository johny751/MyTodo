import fs from 'node:fs/promises';
import path from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 scenario materialization only on GitHub');
const [platform,target]=process.argv.slice(2);
if(!['windows-c','javascript','android'].includes(platform)||!target)throw Error('Usage: make-c007-scenario.mjs windows-c|javascript|android RUNNER_TEMP/file.json');
const root=path.resolve(process.env.RUNNER_TEMP||''),file=path.resolve(target),relative=path.relative(root,file);
if(!process.env.RUNNER_TEMP||!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Scenario must be below RUNNER_TEMP');
const actor='c007-A',epoch='c007-epoch',manifest={format:'gxtodo-delta',version:2,epoch,heads:{},snapshot:null};
const note=(id,body,deleted=false)=>({key:JSON.stringify(['notes',id]),values:{id,body,_deleted:deleted}});
const scenario={caseId:'c007-real-sql-atomicity',platform,dbCase:'c007-real-sql-'+platform,dbDir:path.join(root,'c007-'+platform+'-same-database'),
  defaults:{mode:'resume',actor,epoch,scope:JSON.stringify(['fixture-user','C007']),folder:'C007'},steps:[
    {id:'seed',request:{mode:'init',operation:{op:'local',changes:[note('one','retained'),note('tombstone','deleted',true)]}},accepted:true,outboxCount:2},
    {id:'prepare',request:{operation:{op:'prepare',manifest}},accepted:true,pendingRetained:true,outboxCount:2},
    {id:'later-event',request:{operation:{op:'local',changes:[note('later','must not be acknowledged')]}},accepted:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'meta-failure',request:{fault:{kind:'update-abort',table:'meta'},operation:{op:'local',changes:[note('one','forbidden partial edit')]}},accepted:false,requireSqlError:true,requireFaultHit:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'step-failure',request:{fault:{kind:'insert-abort',table:'entities',id:'blocked'},operation:{op:'local',changes:[note('first-write','must roll back'),note('blocked','trigger target')]}},accepted:false,requireSqlError:true,requireFaultHit:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'commit-failure',request:{fault:{kind:platform==='windows-c'?'commit-reject':'commit-deferred-fk',table:'meta'},operation:{op:'local',changes:[note('one','cannot commit')]}},accepted:false,requireSqlError:true,requireFaultHit:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'read-failure',request:{fault:{kind:platform==='windows-c'?'prepare-deny':'prepare-fail',table:'outbox'},operation:{op:'outbox'}},accepted:false,requireSqlError:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'read-step-failure',request:{fault:{kind:'read-overflow',table:'outbox'},operation:{op:'outbox'}},accepted:false,requireSqlError:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
    {id:'normal-edit',request:{operation:{op:'local',changes:[note('one','normal after failures')]}},accepted:true,outboxCount:4,pendingRetained:true,pendingBodyFrom:'prepare'},
  ]};
if(platform==='javascript'){
 const priorId='rollback-first-write',blockedId='rollback-blocked';
 const position=scenario.steps.findIndex(step=>step.id==='commit-failure');
 if(position<0)throw Error('C007 rollback probe insertion anchor changed');
 scenario.steps.splice(position+1,0,{id:'rollback-double-failure',
  request:{fault:{kind:'insert-rollback',table:'entities',id:blockedId,priorId},operation:{op:'local',changes:[note(priorId,'real prior write must roll back'),note(blockedId,'real RAISE(ROLLBACK) target')]}},
  accepted:false,requireSqlError:true,requireFaultHit:true,unchanged:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare',
  rollbackErrorChain:{primaryMessage:'C007_SQL_ROLLBACK_ABORT',rollbackMessage:'cannot rollback - no transaction is active',firstWriteKey:note(priorId,'').key,blockedKey:note(blockedId,'').key}});
}
if(platform==='windows-c')for(const step of scenario.steps)if(step.id==='commit-failure')step.requireCommitHookPrimary=true;
if(platform==='android')for(const step of scenario.steps){step.requireFaultHit=false;if(step.id==='commit-failure')step.requireCommitStage=true;}
scenario.steps.push({id:'exit-before-commit',request:{exitAt:'before-commit',fault:{kind:'none'},operation:{op:'local',changes:[note('one','must roll back after termination')]}},expectedExitCode:86,pendingRetained:true,outboxCount:4,pendingBodyFrom:'prepare'});
if(platform==='windows-c'){
 // These extra steps exercise the exact native guards changed by C007.
 // The main tables remain intact; read faults shadow them with TEMP views.
 const retained={accepted:false,unchanged:true,outboxCount:4,pendingRetained:true,pendingBodyFrom:'prepare'};
 const read=(id,fault,operation)=>({id,request:{fault,operation},...retained,requireSqlError:fault.kind!=='read-invalid-json',errorIncludes:fault.kind==='read-invalid-json'?'JSON':'SQLite'});
 const key=JSON.stringify(['notes','one']);
 scenario.steps.push(
  read('row-prepare-denied',{kind:'prepare-deny',table:'entities'},{op:'inspect',key}),
  read('row-step-overflow',{kind:'read-overflow',table:'entities',id:'one'},{op:'inspect',key}),
  read('page-prepare-denied',{kind:'prepare-deny',table:'entities'},{op:'page',after:''}),
  read('page-partial-step-overflow',{kind:'read-overflow',table:'entities',id:'tombstone'},{op:'page',after:''}),
  read('meta-prepare-denied',{kind:'prepare-deny',table:'meta'},{op:'meta'}),
  read('meta-step-overflow',{kind:'read-overflow',table:'meta'},{op:'meta'}),
  read('meta-invalid-json',{kind:'read-invalid-json',table:'meta'},{op:'meta'}),
  read('row-invalid-json',{kind:'read-invalid-json',table:'entities',id:'one'},{op:'inspect',key}),
  read('page-invalid-json',{kind:'read-invalid-json',table:'entities',id:'tombstone'},{op:'page',after:''}),
  read('outbox-invalid-json',{kind:'read-invalid-json',table:'outbox'},{op:'outbox'}),
  read('local-row-read-denied',{kind:'prepare-deny',table:'entities'},{op:'local',changes:[note('one','must retain original record')]}),
  read('remote-row-read-denied',{kind:'prepare-deny',table:'entities'},{op:'remote',device:'c007-B',index:1,events:[{...note('one','must not merge'),actor:'c007-B',seq:1,clock:10,context:{}}]}),
  {id:'pending-prepare-commit-denied',request:{fault:{kind:'commit-deny'},operation:{op:'prepare',manifest}},...retained,requireSqlError:true,requireFaultHit:true,errorIncludes:'not authorized',commitDeniedPhase:'direct'},
  {id:'request-renew-commit-denied',request:{fault:{kind:'commit-deny'},operation:{op:'renew-request'}},...retained,requireSqlError:true,requireFaultHit:true,errorIncludes:'not authorized',commitDeniedPhase:'direct',cloud:{requestDelta:0}},
  {id:'ack-original',request:{operation:{op:'ack'}},accepted:true,pendingRetained:false,outboxCount:2,cursor:{actor,value:1}},
  {id:'prepare-rest',request:{operation:{op:'prepare',manifest:{...manifest,heads:{[actor]:1}}}},accepted:true,pendingRetained:true,outboxCount:2},
  {id:'ack-rest',request:{operation:{op:'ack'}},accepted:true,pendingRetained:false,outboxCount:0,cursor:{actor,value:2}},
  {id:'empty-prepare-commit-denied',request:{fault:{kind:'commit-deny'},operation:{op:'prepare-empty',manifest:{...manifest,heads:{[actor]:2}}}},accepted:false,unchanged:true,requireSqlError:true,requireFaultHit:true,errorIncludes:'not authorized',commitDeniedPhase:'direct',pendingRetained:false,outboxCount:0},
  {id:'empty-prepare-normal',request:{operation:{op:'prepare-empty',manifest:{...manifest,heads:{[actor]:2}}}},accepted:true,unchanged:true,pendingRetained:false,outboxCount:0},
  {id:'cache-commit-denied',request:{fault:{kind:'commit-phase-deny',phase:'cache'},operation:{op:'full-sync'}},accepted:false,requireSqlError:true,requireFaultHit:true,errorIncludes:'not authorized',commitDeniedPhase:'cache',businessUnchanged:true,cachedManifest:false,leaseRetained:false,pendingRetained:false,outboxCount:0,cloud:{head:2,minGets:1,puts:0}},
  {id:'release-commit-denied',request:{fault:{kind:'commit-phase-deny',phase:'release'},operation:{op:'full-sync'}},accepted:false,requireSqlError:true,requireFaultHit:true,errorIncludes:'not authorized',commitDeniedPhase:'release',businessUnchanged:true,cachedManifest:true,leaseRetained:true,pendingRetained:false,outboxCount:0,cloud:{head:2,minGets:1,puts:0}},
 );
 scenario.cloud={initialFiles:[{path:'v2/manifest.json',body:JSON.stringify({...manifest,heads:{[actor]:2},snapshot:{id:'c007-prior',parts:[],cursors:{[actor]:2}}})}],faults:[]};
}
await fs.writeFile(file,JSON.stringify(scenario,null,2),{flag:'wx'});
