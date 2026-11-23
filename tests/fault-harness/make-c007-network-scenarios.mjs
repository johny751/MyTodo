import fs from 'node:fs/promises';
import path from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 scenarios only run on GitHub Actions');
const [platform,directory]=process.argv.slice(2),root=path.resolve(process.env.RUNNER_TEMP||''),output=path.resolve(directory||''),rel=path.relative(root,output);
if(!['windows-c','javascript','android'].includes(platform)||!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Usage: platform RUNNER_TEMP/new-directory');
await fs.mkdir(output,{recursive:false});
const note=(id,body,deleted=false)=>({key:JSON.stringify(['notes',id]),values:{id,body,_deleted:deleted}});
const plans=[
 {id:'batch-rejected',network:{pathPrefix:'v2/b-',phase:'before-write',effect:{status:503}},head:0,absent:true},
 {id:'batch-response-lost',network:{pathPrefix:'v2/b-',phase:'after-write',effect:{disconnect:true}},head:0},
 {id:'manifest-rejected',network:{path:'v2/manifest.json',phase:'before-write',effect:{status:503}},head:0},
 {id:'manifest-response-lost',network:{path:'v2/manifest.json',phase:'after-write',effect:{disconnect:true}},head:1},
 {id:'ack-delete-failed',fault:{kind:'delete-abort',table:'outbox'},head:1},
 {id:'ack-meta-failed',fault:{kind:'update-abort',table:'meta'},head:1},
 {id:'ack-commit-failed',fault:{kind:platform==='windows-c'?'commit-reject':'commit-deferred-fk',table:'meta'},head:1},
 {id:'after-ack-commit-exit',exitAt:'after-ack-commit',head:1},
 {id:'before-ack-commit-exit',exitAt:'before-commit',head:1},
];
const manifestFiles=[];
for(const plan of plans){
 const caseId='C007-'+plan.id,actor='c007-A',epoch='c007-epoch',manifest={format:'gxtodo-delta',version:2,epoch,heads:{},snapshot:null};
 const exit=!!plan.exitAt,committed=plan.exitAt==='after-ack-commit';
 const scenario={caseId,platform,dbDir:path.join(root,caseId+'-'+platform),dbCase:caseId+'-'+platform,
  defaults:{mode:'resume',actor,epoch,scope:JSON.stringify(['fixture-user','C007']),folder:'C007'},
  cloud:{initialFiles:[{path:'v2/manifest.json',body:JSON.stringify(manifest)}],faults:plan.network?[{id:plan.id,method:'PUT',...plan.network}]:[]},steps:[
   {id:'seed',request:{mode:'init',operation:{op:'local',changes:[note('one','retained'),note('deleted','tombstone',true)]}},accepted:true,outboxCount:2},
   {id:'prepare',request:{operation:{op:'prepare',manifest}},accepted:true,pendingRetained:true,outboxCount:2},
   {id:'later-event',request:{operation:{op:'local',changes:[note('later','must not be acknowledged')]}},accepted:true,outboxCount:3,pendingRetained:true,pendingBodyFrom:'prepare'},
   {id:'publish-fault',request:{fault:plan.fault||{kind:'none'},exitAt:plan.exitAt,operation:{op:'publish'}},expectedExitCode:exit?86:0,accepted:exit?undefined:false,
    unchanged:!exit,requireSqlError:!!plan.fault,requireFaultHit:!!plan.fault&&platform!=='android',requireCommitStage:platform==='android'&&plan.id==='ack-commit-failed',requireCommitHookPrimary:platform==='windows-c'&&plan.id==='ack-commit-failed',pendingRetained:!committed,outboxCount:committed?1:3,pendingBodyFrom:committed?undefined:'prepare',cursor:committed?{actor,value:1}:undefined,
    cloud:{head:plan.head,batchAbsent:plan.absent,batchBodyFrom:plan.absent?undefined:'prepare',faultUsed:plan.network?plan.id:undefined},restartCloudAfter:true},
   {id:'resume-publish',request:{fault:{kind:'none'},operation:{op:committed?'audit':'publish'}},accepted:true,pendingRetained:false,outboxCount:1,cursor:{actor,value:1},cloud:{head:1,batchBodyFrom:'prepare',noDuplicateBatch:true}},
  ]};
 const file=path.join(output,caseId+'.json');await fs.writeFile(file,JSON.stringify(scenario,null,2),{flag:'wx'});manifestFiles.push({caseId,file});
}
await fs.writeFile(path.join(output,'cases.json'),JSON.stringify(manifestFiles,null,2),{flag:'wx'});
