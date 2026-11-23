import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startMigrationServer} from '../c006/c006-harness/fixture-server.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 controller only runs on GitHub Actions');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const eq=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function confined(value){const target=path.resolve(value||''),base=path.resolve(process.env.RUNNER_TEMP||''),rel=path.relative(base,target);if(!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Fixture path outside RUNNER_TEMP');return target;}
const scenario=JSON.parse(await fs.readFile(confined(args.scenario),'utf8')),out=confined(args.output),dbDir=confined(scenario.dbDir);
await fs.mkdir(out,{recursive:false});
const summary={schema:'mytodo-c007-same-db',version:1,sourceSha:process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA,caseId:scenario.caseId,platform:scenario.platform,dbDir,attempts:[],checks:[],status:'failed'};
async function saveNew(file,value){const h=await fs.open(file,'wx');try{await h.writeFile(JSON.stringify(value,null,2));await h.sync();}finally{await h.close();}}
async function rawFiles(dir,sourceDirectory=dbDir){
  await fs.mkdir(dir,{recursive:false});const files=[];
  for(const name of ['tasks.sqlite','tasks.sqlite-wal','tasks.sqlite-shm','tasks.sqlite-journal']){
    const source=path.join(sourceDirectory,name);try{const bytes=await fs.readFile(source);await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});files.push({name,state:'preserved',bytes:bytes.length,sha256:sha(bytes)});}
    catch(error){if(error.code!=='ENOENT')throw error;files.push({name,state:'absent-at-observation'});}
  }
  await saveNew(path.join(dir,'files.json'),files);return files;
}
function protocolState(audit){
  if(!audit)return null;const meta=structuredClone(audit.meta);
  return {meta,rows:audit.rows.map(row=>({key:row.key,data:row.data,record:row.record,deleted:!!row.deleted,conflicts:row.conflicts})),outbox:audit.outbox};
}
function businessState(audit){const state=protocolState(audit);for(const field of ['revision','lease','cachedManifest'])delete state.meta[field];return state;}
function auditValid(value){return !!value&&value.meta&&Array.isArray(value.rows)&&Array.isArray(value.outbox)&&(!value.readErrors||Array.isArray(value.readErrors)&&value.readErrors.length===0);}
async function inventory(directory){
  const files=[];
  async function walk(current){for(const entry of await fs.readdir(current,{withFileTypes:true})){const target=path.join(current,entry.name);if(entry.isSymbolicLink())throw Error('Evidence inventory contains symbolic link');if(entry.isDirectory())await walk(target);else{const bytes=await fs.readFile(target);files.push({path:path.relative(directory,target).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
  await walk(directory);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
async function child(request,file,prefix){
  const spec=path.join(out,prefix+'.request.json');await saveNew(spec,request);
  const exe=scenario.platform==='windows-c'?confined(args['windows-exe']):process.execPath;
  const argv=scenario.platform==='windows-c'?['--request',spec,'--db-dir',dbDir,'--output',file]:scenario.platform==='android'?['tests/fault-harness/android/c007-android-worker.mjs','--request',spec,'--output',file,'--apk',confined(args.apk),'--prepared',confined(args.prepared),'--serial',args.serial]:['tests/fault-harness/c007-js-worker.mjs','--request',spec,'--output',file];
  const receipt={command:[exe,...argv],startedAt:new Date().toISOString()};
  const result=await new Promise(resolve=>{
    const proc=spawn(exe,argv,{windowsHide:true,env:process.env});let stdout='',stderr='';
    let hardTimer;
    const timer=setTimeout(()=>{receipt.timedOut=true;proc.kill('SIGTERM');hardTimer=setTimeout(()=>{receipt.forcedKill=true;proc.kill('SIGKILL');},5000);},scenario.platform==='android'?300000:180000);
    proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');proc.stdout.on('data',x=>stdout+=x);proc.stderr.on('data',x=>stderr+=x);
    proc.once('error',error=>{receipt.spawnError=String(error);});
    proc.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardTimer);receipt.processClosed=true;resolve({code,signal,stdout,stderr});});
  });
  await fs.writeFile(path.join(out,prefix+'.stdout.log'),result.stdout,{flag:'wx'});await fs.writeFile(path.join(out,prefix+'.stderr.log'),result.stderr,{flag:'wx'});
  Object.assign(receipt,{exitCode:result.code,signal:result.signal,completedAt:new Date().toISOString(),stdoutSha256:sha(result.stdout),stderrSha256:sha(result.stderr)});
  await saveNew(path.join(out,prefix+'.process.json'),receipt);return receipt;
}
let last,server;
async function cloudEvidence(prefix){
  if(!server)return null;await server.flush();const files=await server.readFiles();
  const directory=path.join(out,prefix+'.cloud');await fs.mkdir(directory);
  const inventory=[];
  for(const entry of files){const bytes=await fs.readFile(path.join(server.cloudRoot,...entry.path.split('/'))),target=path.join(directory,...entry.path.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});inventory.push({...entry,etag:'"'+sha(bytes)+'"'});}
  const trace={files:inventory,requests:structuredClone(server.entries),faults:server.faults(),durability:'Observed disk bytes after rename; no power-loss durability claim'};
  await saveNew(path.join(directory,'trace.json'),trace);return trace;
}
try{
  if(!['windows-c','javascript','android'].includes(scenario.platform))throw Error('Unsupported real platform worker');
  if(!Array.isArray(scenario.steps)||!scenario.steps.length||scenario.steps.length>40)throw Error('Scenario requires 1-40 explicit steps');
  if(scenario.cloud)server=await startMigrationServer({...scenario.cloud,directory:path.join(out,'server'),folder:scenario.defaults.folder});
  for(let i=0;i<scenario.steps.length;i++){
    const step=scenario.steps[i],prefix=String(i).padStart(3,'0')+'-'+step.id;
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(step.id||''))throw Error('Unsafe step id');
    const file=path.join(out,prefix+'.result.json');
    const request={...scenario.defaults,...step.request,sourceSha:summary.sourceSha,caseId:scenario.caseId,attemptId:prefix,dbDir,dbCase:scenario.dbCase,...(server?{fixtureUrl:server.origin}: {})};
    if(request.mode==='init'&&i!==0)throw Error('Cannot reinitialize after the first step');
    const requestStart=server?.entries.length||0;
    const processResult=await child(request,file,prefix),attempt={id:prefix,dbDir,process:processResult};summary.attempts.push(attempt);
    const expected=step.expectedExitCode??0;summary.checks.push({id:prefix+':exit',passed:processResult.exitCode===expected&&!processResult.timedOut&&!processResult.spawnError&&processResult.signal===null&&processResult.processClosed});
    // Every attempt gets immutable pre-reopen bytes after the worker has exited.
    attempt.preReopenFiles=await rawFiles(path.join(out,prefix+'.pre-reopen'),scenario.platform==='android'?file+'.database':dbDir);
    summary.checks.push({id:prefix+':database-preserved',passed:attempt.preReopenFiles.some(f=>f.name==='tasks.sqlite'&&f.state==='preserved')});
    if(expected===86){
      const suffix=request.exitAt==='after-ack-commit'?'after-ack-commit':'before-commit';
      const marker=JSON.parse(await fs.readFile(file+'.'+suffix+'.json','utf8'));
      attempt.marker=marker;summary.checks.push({id:prefix+':boundary-marker',passed:Number.isInteger(marker.processId)&&marker.processId>0&&marker.sourceSha===summary.sourceSha&&marker.caseId===scenario.caseId&&marker.attemptId===prefix&&marker.boundary===(suffix==='before-commit'?'before-real-sqlite-commit':scenario.platform==='javascript'?'after-ack-commit':'after-real-ack-return')});
    }else{
      const observed=JSON.parse(await fs.readFile(file,'utf8'));attempt.receiptSha256=sha(await fs.readFile(file));attempt.observed=observed;
      summary.checks.push({id:prefix+':observer',passed:observed.observerExitCode===0&&observed.sourceSha===summary.sourceSha&&observed.caseId===scenario.caseId&&observed.attemptId===prefix});
      summary.checks.push({id:prefix+':audits-complete',passed:auditValid(observed.before)&&auditValid(observed.after)});
      if(scenario.platform==='windows-c')summary.checks.push({id:prefix+':transaction-ended',passed:observed.autocommitAfterOperation===true});
      if(typeof step.accepted==='boolean')summary.checks.push({id:prefix+':operation',passed:observed.operationAccepted===step.accepted});
      if(step.requireSqlError)summary.checks.push({id:prefix+':sqlite-error',passed:scenario.platform==='windows-c'?observed.sqliteCode!==0&&observed.sqliteCode!=null||observed.nativeSqlErrors?.some(e=>e.primaryCode!==0&&e.primaryCode!==27&&e.primaryCode!==28):scenario.platform==='android'?/^android\.database\.sqlite\.SQLite/.test(observed.nativeError?.class||''):observed.operationError?.code==='ERR_SQLITE_ERROR'});
      if(step.requireCommitStage)summary.checks.push({id:prefix+':commit-stage',passed:scenario.platform==='android'?observed.nativeError?.stack?.some(s=>/SQLiteSession\.endTransaction|SQLiteDatabase\.endTransaction/.test(s)):true});
      if(step.requireFaultHit)summary.checks.push({id:prefix+':fault-hit',passed:observed.faultHits>0});
      if(step.rollbackErrorChain){
        const primary=observed.operationError,secondary=primary?.rollbackError,expected=step.rollbackErrorChain;
        summary.checks.push({id:prefix+':rollback-probe-new-rows',passed:scenario.platform==='javascript'&&auditValid(observed.before)&&!observed.before.rows.some(row=>row.key===expected.firstWriteKey||row.key===expected.blockedKey)});
        summary.checks.push({id:prefix+':original-sql-error-preserved',passed:scenario.platform==='javascript'&&primary?.code==='ERR_SQLITE_ERROR'&&Number.isInteger(primary.errcode)&&(primary.errcode&255)===19&&primary.message===expected.primaryMessage});
        summary.checks.push({id:prefix+':secondary-rollback-error-observed',passed:scenario.platform==='javascript'&&secondary?.code==='ERR_SQLITE_ERROR'&&Number.isInteger(secondary.errcode)&&(secondary.errcode&255)===1&&secondary.message===expected.rollbackMessage});
        summary.checks.push({id:prefix+':rollback-probe-schema-preserved',passed:Array.isArray(observed.before?.schema)&&Array.isArray(observed.after?.schema)&&eq(observed.before.schema,observed.after.schema)});
      }
      if(step.requireCommitHookPrimary){
        // SQLITE_CONSTRAINT_COMMITHOOK = SQLITE_CONSTRAINT (19) | (2 << 8).
        // SQLite logging need not emit the original COMMIT-hook failure.
        // Accept the same-operation native error pair or one complete log entry.
        const operationCommitHook=observed.sqliteCode===19&&observed.sqliteExtendedCode===531;
        const loggedCommitHook=observed.nativeSqlErrors?.some(error=>error.primaryCode===19&&error.extendedCode===531);
        summary.checks.push({id:prefix+':native-commit-hook-error',passed:scenario.platform==='windows-c'&&observed.fault?.kind==='commit-reject'&&observed.faultHits>0&&observed.operationAccepted===false&&(operationCommitHook||loggedCommitHook)});
        summary.checks.push({id:prefix+':commit-primary-diagnostic-preserved',passed:scenario.platform==='windows-c'&&observed.operationError==='constraint failed'&&!/rollback|no transaction/i.test(observed.operationError)});
      }
      if(step.unchanged)summary.checks.push({id:prefix+':atomic',passed:eq(protocolState(observed.before),protocolState(observed.after))});
      if(step.errorIncludes)summary.checks.push({id:prefix+':primary-error-preserved',passed:typeof observed.operationError==='string'&&observed.operationError.includes(step.errorIncludes)});
      if(step.commitDeniedPhase){
        summary.checks.push({id:prefix+':commit-denied-phase',passed:observed.commitDeniedPhase===step.commitDeniedPhase});
        if(step.commitDeniedPhase!=='direct')summary.checks.push({id:prefix+':real-metadata-phase',passed:observed.commitPhaseObserved===step.commitDeniedPhase&&typeof observed.syncTokenObserved==='string'&&observed.syncTokenObserved.length>0&&observed.commitPhaseToken===observed.syncTokenObserved&&observed.before.meta.lease===null&&observed.before.meta.cachedManifest===null});
      }
      if(step.businessUnchanged)summary.checks.push({id:prefix+':business-preserved',passed:eq(businessState(observed.before),businessState(observed.after))});
      last=observed;
    }
    // This is a NEW process using the exact dbDir; it has no seed/fault/lease mutation.
    const auditFile=path.join(out,prefix+'.reopened.json'),auditRequest={...request,attemptId:prefix+'-reopen',mode:'resume',fault:{kind:'none'},operation:{op:'audit'},exitAt:null};
    const auditProcess=await child(auditRequest,auditFile,prefix+'-reopen');
    const reopened=JSON.parse(await fs.readFile(auditFile,'utf8'));attempt.reopened={process:auditProcess,receiptSha256:sha(await fs.readFile(auditFile))};
    summary.checks.push({id:prefix+':same-db-restart',passed:auditProcess.exitCode===0&&!auditProcess.spawnError&&auditProcess.signal===null&&!auditProcess.timedOut&&auditProcess.processClosed&&reopened.observerExitCode===0&&reopened.sourceSha===summary.sourceSha&&reopened.caseId===scenario.caseId&&reopened.attemptId===prefix+'-reopen'&&auditValid(reopened.before)&&auditValid(reopened.after)&&path.resolve(reopened.dbDir)===dbDir});
    if(scenario.platform==='windows-c')summary.checks.push({id:prefix+':reopened-transaction-ended',passed:reopened.autocommitAfterOperation===true});
    attempt.postReopenFiles=await rawFiles(path.join(out,prefix+'.post-reopen'),scenario.platform==='android'?auditFile+'.database':dbDir);
    if(scenario.platform==='android')summary.checks.push({id:prefix+':new-native-process',passed:Number.isInteger(reopened.runtime?.processId)&&reopened.runtime.processId!==(attempt.marker?.processId||last?.runtime?.processId)&&reopened.deviceDatabase=== (attempt.marker?.databaseFile||last?.deviceDatabase)});
    if(expected===0)summary.checks.push({id:prefix+':reopen-state',passed:eq(protocolState(last.after),protocolState(reopened.after))});
    if(step.rollbackErrorChain){
      summary.checks.push({id:prefix+':rollback-probe-fresh-process',passed:scenario.platform==='javascript'&&Number.isInteger(last.processId)&&last.processId>0&&Number.isInteger(reopened.processId)&&reopened.processId>0&&last.processId!==reopened.processId&&path.resolve(last.dbDir)===dbDir&&path.resolve(reopened.dbDir)===dbDir});
      summary.checks.push({id:prefix+':rollback-probe-reopened-schema',passed:Array.isArray(last.after?.schema)&&Array.isArray(reopened.before?.schema)&&Array.isArray(reopened.after?.schema)&&eq(last.after.schema,reopened.before.schema)&&eq(reopened.before.schema,reopened.after.schema)});
    }
    if(expected===86){
      const beforeEvidence=JSON.parse(await fs.readFile(file+'.before.json','utf8')),expectedState=protocolState(beforeEvidence.before);
      if(request.exitAt==='before-commit'&&scenario.platform!=='windows-c'){
        const staged=protocolState(attempt.marker.uncommitted);
        summary.checks.push({id:prefix+':real-uncommitted-writes',passed:auditValid(attempt.marker.uncommitted)&&staged.meta.revision===expectedState.meta.revision+1&&!eq(staged,expectedState)});
        if(request.operation.op==='publish'){
          const predicted=structuredClone(expectedState),pending=predicted.meta.pending;
          predicted.outbox=predicted.outbox.filter(item=>item.id>pending.through);predicted.meta.cursors[pending.device]=Math.max(predicted.meta.cursors[pending.device]||0,pending.index);predicted.meta.pending=null;predicted.meta.revision++;
          summary.checks.push({id:prefix+':ack-writes-before-commit',passed:eq(staged,predicted)});
        }
      }
      if(request.exitAt==='after-ack-commit'){
        const pending=expectedState.meta.pending;if(!pending)throw Error('ACK crash baseline lacks pending');
        expectedState.outbox=expectedState.outbox.filter(item=>item.id>pending.through);
        expectedState.meta.cursors[pending.device]=Math.max(expectedState.meta.cursors[pending.device]||0,pending.index);
        expectedState.meta.pending=null;expectedState.meta.revision++;
      }
      summary.checks.push({id:prefix+':exact-crash-transaction-state',passed:eq(expectedState,protocolState(reopened.after))});
    }
    if(step.pendingRetained!=null)summary.checks.push({id:prefix+':pending',passed:!!reopened.after.meta.pending===step.pendingRetained});
    if(step.outboxCount!=null)summary.checks.push({id:prefix+':outbox',passed:reopened.after.outbox.length===step.outboxCount});
    if(step.cursor)summary.checks.push({id:prefix+':cursor',passed:reopened.after.meta.cursors[step.cursor.actor]===step.cursor.value});
    if(step.cachedManifest!=null)summary.checks.push({id:prefix+':cache-state',passed:!!reopened.after.meta.cachedManifest===step.cachedManifest});
    if(step.leaseRetained!=null)summary.checks.push({id:prefix+':lease-state',passed:!!reopened.after.meta.lease===step.leaseRetained&&(!step.leaseRetained||reopened.after.meta.lease.token===last.syncTokenObserved)});
    if(step.pendingBodyFrom){const prior=summary.attempts.find(a=>a.id.endsWith('-'+step.pendingBodyFrom));const body=prior?.observed?.after?.meta?.pending?.body;summary.checks.push({id:prefix+':pending-bytes',passed:typeof body==='string'&&body===reopened.after.meta.pending?.body});}
    const cloud=await cloudEvidence(prefix);attempt.cloud=cloud;
    if(step.cloud){
      if(!cloud)throw Error('Cloud assertions need the actual fixture');
      const manifest=JSON.parse(cloud.files.find(f=>f.path==='v2/manifest.json')?.text||'null');
      if(step.cloud.head!=null)summary.checks.push({id:prefix+':cloud-head',passed:(manifest?.heads?.[scenario.defaults.actor]||0)===step.cloud.head});
      if(step.cloud.batchBodyFrom){const prior=summary.attempts.find(a=>a.id.endsWith('-'+step.cloud.batchBodyFrom))?.observed?.after?.meta?.pending;summary.checks.push({id:prefix+':cloud-batch-bytes',passed:!!prior&&cloud.files.find(f=>f.path===prior.path)?.text===prior.body});}
      if(step.cloud.batchAbsent)summary.checks.push({id:prefix+':batch-absent',passed:!cloud.files.some(f=>f.path.startsWith('v2/b-'))});
      if(step.cloud.faultUsed)summary.checks.push({id:prefix+':network-fault-hit',passed:cloud.faults.some(f=>f.id===step.cloud.faultUsed&&f.used===1)});
      if(step.cloud.noDuplicateBatch)summary.checks.push({id:prefix+':one-batch',passed:cloud.files.filter(f=>f.path.startsWith('v2/b-')).length===1});
      const requests=cloud.requests.slice(requestStart);
      if(step.cloud.requestDelta!=null)summary.checks.push({id:prefix+':request-count',passed:requests.length===step.cloud.requestDelta});
      if(step.cloud.minGets!=null)summary.checks.push({id:prefix+':actual-manifest-get',passed:requests.filter(r=>r.method==='GET'&&r.path.endsWith('/v2/manifest.json')).length>=step.cloud.minGets});
      if(step.cloud.puts!=null)summary.checks.push({id:prefix+':no-unexpected-cloud-write',passed:requests.filter(r=>r.method==='PUT').length===step.cloud.puts});
    }
    if(step.restartCloudAfter){
      if(!server)throw Error('No cloud fixture to restart');const directory=path.join(out,'server'),before=await server.readFiles();await server.close();
      server=await startMigrationServer({directory,folder:scenario.defaults.folder});
      summary.checks.push({id:prefix+':cloud-disk-reopen',passed:eq(before,await server.readFiles())});
    }
  }
  summary.status=summary.checks.every(c=>c.passed)?'passed':'failed';
}catch(error){summary.error=String(error.stack||error);}
finally{if(server)await server.close();summary.exitCode=summary.status==='passed'?0:1;await saveNew(path.join(out,'summary.json'),summary);await saveNew(path.join(out,'inventory.json'),await inventory(out));process.exitCode=summary.exitCode;}
