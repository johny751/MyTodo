import {initializeReplica,editReplica,applyRemote,updateMeta} from '../../src/replica.mjs';

// This module dispatches fixture operations to unchanged production entrypoints.
// It never implements event validation, conflict merging, snapshots, or ACK rules.
const copy = value => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function normalizeAudit(raw) {
  if (!raw || !raw.meta) throw new Error('Production audit did not return persisted metadata');
  const rows = (raw.rows || []).map(row => ({key: row.key, data: row.data, record: row.record, deleted: Boolean(row.deleted), conflicts: row.conflicts || []}))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const outbox = Array.isArray(raw.outbox) ? raw.outbox : raw.outbox?.entries || raw.outboxArray || [];
  const semantic = {};
  for (const key of ['version','actor','seq','clock','queue','vector','cursors','initialized','scope','epoch','pending']) {
    semantic[key] = raw.meta[key] === undefined ? null : raw.meta[key];
  }
  if (semantic.pending?.body) {
    // The raw JSON body stays in raw.meta. Comparison canonicalizes JSON object
    // keys only; differing event/conflict array orders remain visible.
    semantic.pending = {...semantic.pending,body:JSON.parse(semantic.pending.body)};
  }
  // Keep record.events and conflict value arrays in production order.
  return canonical({meta: semantic, rows, outbox});
}
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const errorText = error => String(error?.stack || error?.message || error);
function wireFrom(raw) {
  const outbox = Array.isArray(raw.outbox) ? raw.outbox : raw.outbox?.entries || raw.outboxArray || [];
  const pending = raw.meta?.pending;
  return {events: outbox.map(item => copy(item.event)), records: (raw.rows || []).map(row => copy(row.record)),
    batch: pending?.body ? JSON.parse(pending.body) : null, batchBody: pending?.body || null};
}
function sourceEvents(operation, sample) {
  let events;
  if (operation.fromSample === 'events') events = copy(sample?.wire?.events);
  else if (operation.fromSample === 'records') events = sample?.wire?.records?.flatMap(record => record.events.map(event => ({key:record.key,...copy(event)})));
  else events = copy(operation.events);
  if (!Array.isArray(events)) throw new Error('Fixture has no actual producer events');
  if (operation.reverse) events.reverse();
  if (operation.duplicate) events = [...events, ...copy(events)];
  return events;
}

export async function executeCase(options) {
  const {suite,caseId,mode='receive',platform='javascript',call,seed,reopen,audit,fault,request,delta,sample,provenance={}} = options;
  const result = {schema:'mytodo-protocol-harness-result',version:1,platform,caseId,mode,status:'failed',stages:[],provenance,
    receiptCoverage:{independentReceiptTable:'absent-in-current-production-schema',targetDeliveryLedger:'absent-in-current-production-schema'}};
  const selected = suite?.cases?.find(item => item.id === caseId);
  if (suite?.schema !== 'mytodo-protocol-vectors' || suite.version !== 1 || !selected) {
    result.error='Unknown common suite/case'; return result;
  }
  result.expectationMode=selected.expectationMode;
  const failures=[];
  try {
    if (mode !== 'report') {
      const actor=mode === 'generate' ? suite.defaults.producerActor : suite.defaults.receiverActor;
      await seed({actor,defaults:suite.defaults});
      const initial=await call({action:'inspect',keys:[]});
      if (!initial.meta.initialized) {
        await initializeReplica(call,{version:2,tasks:[],notes:[],projects:[],tags:[],places:[],settings:initial.meta.settings});
      }
      const current=await call({action:'inspect',keys:[]});
      if (current.meta.scope !== suite.defaults.scope || current.meta.epoch !== suite.defaults.epoch) {
        if (current.meta.scope != null && current.meta.scope !== suite.defaults.scope) throw new Error('Fixture refuses to rebind an existing nonempty store');
        await updateMeta(call,meta=>{meta.scope=suite.defaults.scope;meta.epoch=suite.defaults.epoch;});
      }
    }
    result.initial=await audit();
    const operations=mode === 'report' ? [] : selected[mode];
    if (!Array.isArray(operations)) throw new Error('Fixture mode must be generate, receive, or report');
    for (let index=0; index<operations.length; index++) {
      const operation=operations[index],stage={index,op:operation.op,expect:operation.expect || 'observe',accepted:false};
      result.stages.push(stage);
      stage.before=await audit();
      try {
        switch (operation.op) {
          case 'local':
            stage.returned=await editReplica(call,operation.changes,undefined,{context:operation.context ?? null});break;
          case 'remote': {
            const events=sourceEvents(operation,sample);
            stage.inputEvents=events;
            const cursor=Object.hasOwn(operation,'device')||Object.hasOwn(operation,'index')
              ? {device:operation.device,index:operation.index} : null;
            stage.returned=await applyRemote(call,events,undefined,cursor);break;
          }
          case 'manifest':
            if (!delta?.manifestValue) throw new Error('Actual delta manifest access is unavailable');
            stage.returned=delta.manifestValue(operation.response);break;
          case 'prepare':
            if (!delta?.prepare) throw new Error('Actual delta prepare access is unavailable');
            stage.returned=await delta.prepare(call,operation.manifest);break;
          case 'pull':
            if (!delta?.pull || !request) throw new Error('Actual delta pull/real HTTP fixture access is unavailable');
            if (selected.fixturePlan && !suite.fixtureResolved) throw new Error('Fixture plan must first be resolved into physical files and a concrete manifest');
            stage.returned=await delta.pull(call,request,operation.manifest,()=>true,operation.budget ?? 12);break;
          case 'checkpoint':
            if (!delta?.checkpoint || !request) throw new Error('Actual delta checkpoint/real HTTP fixture access is unavailable');
            stage.returned=await delta.checkpoint(call,request,operation.manifest,()=>true);break;
          case 'sqlFault':
            if (!fault) throw new Error('Real SQL fault injection is unavailable');
            stage.returned=await fault(operation);break;
          case 'reopen': await reopen();break;
          case 'export': stage.returned=await audit();break;
          default: throw new Error('Unknown fixture operation: '+operation.op);
        }
        stage.accepted=true;
      } catch (error) { stage.error=errorText(error); }
      stage.after=await audit();
      stage.matchesExpectation=stage.expect === 'observe' || (stage.expect === 'accept' && stage.accepted) || (stage.expect === 'reject' && !stage.accepted);
      if (!stage.matchesExpectation) failures.push(operation.op+': expected '+stage.expect+', actual '+(stage.accepted?'accepted':'rejected'));
      // A rejected atomic operation must not acknowledge, advance any cursor,
      // remove pending/outbox or leave partial entities. Pull is separately
      // checked because completed prior batches/parts legitimately persist.
      if (!stage.accepted && ['local','remote','prepare','manifest'].includes(operation.op)) {
        stage.rejectedStateUnchanged=same(normalizeAudit(stage.before),normalizeAudit(stage.after));
        if (!stage.rejectedStateUnchanged) failures.push(operation.op+': rejected operation changed persisted protocol state');
      }
      if (operation.op === 'reopen') {
        stage.persistedAfterReopen=same(normalizeAudit(stage.before),normalizeAudit(stage.after));
        if (!stage.persistedAfterReopen) failures.push('Production close/reopen changed persisted protocol state');
      }
      if (!stage.accepted && operation.op === 'pull') {
        const before=normalizeAudit(stage.before),after=normalizeAudit(stage.after);
        stage.outboxAndPendingPreserved=same(before.outbox,after.outbox) && same(before.meta.pending,after.meta.pending);
        if (!stage.outboxAndPendingPreserved) failures.push('Failed pull removed pending/outbox before acknowledgement');
        if (selected.category === 'snapshot-recovery') {
          stage.snapshotCursorUnadvanced=same(before.meta.cursors,after.meta.cursors);
          if (!stage.snapshotCursorUnadvanced) failures.push('Incomplete snapshot advanced cursor');
        }
        if (caseId === 'batch-gap' && stage.after.meta.cursors[suite.defaults.producerActor] !== 1) failures.push('Missing middle batch did not preserve cursor at the actual first batch');
        if (caseId === 'batch-over-500' && !same(before.meta.cursors,after.meta.cursors)) failures.push('Rejected oversized batch advanced cursor');
      }
    }
    result.raw=await audit();
    result.wire=wireFrom(result.raw);
    await reopen();
    result.reopened=await audit();
    result.persisted=same(normalizeAudit(result.raw),normalizeAudit(result.reopened));
    if (!result.persisted) failures.push('Final production close/reopen audit differs');
    result.normalized=normalizeAudit(result.reopened);
    result.compatibilityStatus='requires-three-platform-cross-comparison';
    result.failures=failures;
    result.status=failures.length ? 'failed':'passed';
    if (failures.length) result.error=failures.join('; ');
  } catch (error) {
    result.error=errorText(error);result.failures=[...failures,result.error];
    try { result.raw=await audit(); result.wire=wireFrom(result.raw); await reopen(); result.reopened=await audit(); result.normalized=normalizeAudit(result.reopened); }
    catch (auditError) { result.auditError=errorText(auditError); }
  }
  return result;
}
export const executeSuiteCase=executeCase;
