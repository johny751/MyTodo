import {canonical,normalizeAudit} from './shared-executor.mjs';

const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fullAudit=raw=>canonical({...raw,rows:(raw?.rows||[]).slice().sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)});
export function compareRestart(original,restarted) {
  const sameState=!!original.reopened&&!!restarted.raw&&same(fullAudit(original.reopened),fullAudit(restarted.raw))&&same(fullAudit(restarted.raw),fullAudit(restarted.reopened));
  return {status:sameState&&restarted.status==='passed'?'passed':'failed',fullPersistedStateEqual:sameState,excludedMeta:[]};
}
export function verifyResult(result,selected,defaults) {
  const checks=[];
  const add=(name,ok,detail)=>checks.push({name,status:ok?'passed':'failed',detail});
  if(result?.status==='blocked')return {status:'blocked',checks:[{name:'production-execution',status:'blocked',detail:result.error||'Production API/environment unavailable'}]};
  add('result-contract',result?.schema==='mytodo-protocol-harness-result'&&result.version===1&&result.caseId===selected.id&&['generate','receive','report'].includes(result.mode));
  if (!result?.raw || !result?.reopened) {
    return {status:result?.status==='blocked'?'blocked':'failed',checks:[{name:'actual-persisted-audit',status:result?.status==='blocked'?'blocked':'failed',detail:result?.error||'No actual production audit'}]};
  }
  add('close-reopen-full-audit',same(fullAudit(result.raw),fullAudit(result.reopened)),'Same-platform metadata includes revision/dataRevision/settings/lease; object keys and row order only are canonicalized.');
  const expected=result.mode==='report'?[]:selected[result.mode]||[];
  add('stage-contract',(result.stages||[]).length===expected.length);
  add('wire-present',Array.isArray(result.wire?.events)&&Array.isArray(result.wire?.records)&&Object.hasOwn(result.wire||{},'batchBody'));
  for(const audit of [result.raw,result.reopened])if(audit.integrity)add('sqlite-integrity',Array.isArray(audit.integrity)&&audit.integrity.length>0&&audit.integrity.every(item=>item.integrity_check==='ok'));
  if(result.platform==='javascript')add('sqlite-integrity-present',Array.isArray(result.raw.integrity)&&Array.isArray(result.reopened.integrity));
  if(result.platform==='Windows C')add('sqlite-integrity',result.integrity===true);
  if(result.processRestart) add('separate-process-restart',result.processRestart.status==='passed',result.processRestart);
  for(const [position,stage] of (result.stages||[]).entries()) {
    const spec=expected[stage.index];
    add('stage-'+stage.index+'-contract',stage.index===position&&!!spec&&stage.op===spec.op&&stage.expect===(spec.expect||'observe'));
    if(spec?.expect&&spec.expect!=='observe')add('stage-'+stage.index+'-expected',spec.expect==='accept'?stage.accepted===true:stage.accepted===false);
    if(!stage.before||!stage.after) {add('stage-'+stage.index+'-audit',false,'Missing actual before/after audit');continue;}
    if(stage.op==='reopen') add('stage-'+stage.index+'-reopen',same(fullAudit(stage.before),fullAudit(stage.after)));
    if(!stage.accepted&&['local','remote','manifest','prepare'].includes(stage.op)) add('stage-'+stage.index+'-reject-atomic',same(fullAudit(stage.before),fullAudit(stage.after)));
    if(!stage.accepted&&stage.op==='pull') {
      add('stage-'+stage.index+'-failed-pull-obligation',same(stage.before.outbox,stage.after.outbox)&&same(stage.before.meta?.pending,stage.after.meta?.pending));
      if(selected.category==='snapshot-recovery'||selected.id==='batch-over-500') add('stage-'+stage.index+'-failed-pull-cursor',same(stage.before.meta?.cursors,stage.after.meta?.cursors));
      if(selected.id==='batch-gap') add('stage-'+stage.index+'-gap-resume',stage.after.meta?.cursors?.[defaults.producerActor]===1);
    }
    if((stage.before.readErrors||[]).length||(stage.after.readErrors||[]).length) add('stage-'+stage.index+'-SQL-read-diagnostic',false,{before:stage.before.readErrors,after:stage.after.readErrors});
  }
  if(result.mode==='receive') {
    const row=result.reopened.rows?.[0];
    const ordering={
      'actor-A-a': {actors:['A','a'], body:'lower'},
      'actor-A-a-reverse': {actors:['A','a'], body:'lower'},
      'actor-hyphen-ascii': {actors:['A','A-','A0','a','a-'], body:'4'}
    };
    const ordered=ordering[selected.id];
    if(ordered) {
      add('protocol-actor-winner-and-history',row?.data?.body===ordered.body &&
        same(row?.record?.events?.map(event=>event.actor),ordered.actors) &&
        same(row?.conflicts?.find(conflict=>conflict.field==='body')?.values?.map(choice=>choice.device),ordered.actors) &&
        row?.conflicts?.find(conflict=>conflict.field==='body')?.title===ordered.body);
    }
    if(selected.id==='prepare-int32-overflow') {
      const pending=result.reopened.meta?.pending;
      const body=pending?.body ? JSON.parse(pending.body) : null;
      add('durable-positive-batch-index',pending?.index===2147483648 && body?.index===2147483648 &&
        pending.path==='v2/b-'+defaults.receiverActor+'-2147483648.json.gz');
    }
    if(selected.id==='snapshot-cursor-unsafe') {
      const stage=result.stages.find(candidate=>candidate.op==='pull');
      add('invalid-snapshot-rejected-before-write',same(fullAudit(stage?.before),fullAudit(stage?.after)));
    }
    const cursorCase=result.mode==='receive' && ['cursor-int32-max','cursor-int32-plus-one','cursor-max-safe'].includes(selected.id);
    if(cursorCase) {
      const spec=selected.receive.find(operation=>operation.op==='remote');
      add('durable-exact-cursor',result.reopened.meta?.cursors?.[spec.device]===spec.index);
    }
  }
  add('final-SQL-read-diagnostic' ,!(result.raw.readErrors||[]).length&&!(result.reopened.readErrors||[]).length,{raw:result.raw.readErrors,reopened:result.reopened.readErrors});
  return {status:checks.some(x=>x.status==='failed')||result.status==='failed'?'failed':result.status==='blocked'?'blocked':'passed',checks};
}
function differences(a,b,prefix='',out=[]) {
  if(same(a,b))return out;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b)) {out.push({path:prefix,left:a,right:b});return out;}
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
    if(out.length>=60)break;
    differences(a[key],b[key],prefix+'/'+key,out);
  }
  return out;
}
export function compareResults(left,right) {
  if(!left?.reopened||!right?.reopened) return {status:left?.status==='blocked'||right?.status==='blocked'?'blocked':'failed',reason:'One implementation has no actual persisted export'};
  const a=normalizeAudit(left.reopened),b=normalizeAudit(right.reopened);
  const stageShape=result=>(result.stages||[]).map(stage=>({index:stage.index,op:stage.op,accepted:stage.accepted}));
  const deltas=differences(a,b);
  const acceptedSame=same(stageShape(left),stageShape(right));
  const wireSame=same(left.wire?.events,right.wire?.events)&&same(left.wire?.batchBody,right.wire?.batchBody);
  const status=left.status==='blocked'||right.status==='blocked'?'blocked':left.status==='failed'||right.status==='failed'?'failed':!deltas.length&&acceptedSame&&wireSame?'passed':'failed';
  return {status,leftExecutionStatus:left.status,rightExecutionStatus:right.status,
    semanticEqual:!deltas.length,stageAcceptanceEqual:acceptedSame,wireEventsAndPendingBytesEqual:wireSame,
    differences:deltas,stageDifferences:acceptedSame?[]:differences(stageShape(left),stageShape(right)),
    excludedCrossPlatformMeta:['revision','dataRevision','settings','lease','cachedManifest'],
    preserved:['record.events array order','conflicts array order','conflict value array order','tombstones','vector','clock','cursors','outbox','pending.body bytes'],
    leftPendingBody:left.wire?.batchBody,rightPendingBody:right.wire?.batchBody};
}
