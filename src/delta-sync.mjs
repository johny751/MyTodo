import {clone,equal,buildState,diffState,editReplica,applyRemote,updateMeta,isProtocolObject,isActor,isCounter,isCounterMap,counterAt,validateEvent} from './replica.mjs';
import {decodeRemote,mergeStates,emptyState,syncError} from './sync-core.mjs';
const bytes=s=>new TextEncoder().encode(s).length;
const batchPath=(device,index)=>'v2/b-'+device+'-'+index+'.json.gz';
const uuid=()=>crypto.randomUUID();
// Only the threshold matters. Cap the sum to avoid losing integer precision.
const progressGap=(heads,cursors,threshold)=>{
 let gap=0;
 for(const [actor,head] of Object.entries(heads)){
  gap+=Math.min(threshold,Math.max(0,head-(counterAt(cursors,actor))));
  if(gap>=threshold)return threshold;
 }
 return gap;
};
const maxCursors=(a,b)=>{const out={...a};for(const [k,v] of Object.entries(b))out[k]=Math.max(counterAt(out,k),v);return out;};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
const parseWire = text => {
 for (let index=0;index<text.length;index++) {
  if (text[index] !== '\\') continue;
  if (text.startsWith('u0000',index+1)) throw Error('同步 JSON 中包含无法保留的 NUL 字符');
  index++;
 }
 return JSON.parse(text);
};
function validateManifest(m){
 if(!isProtocolObject(m)||m.format!=='gxtodo-delta'||m.version!==2||
    typeof m.epoch!=='string'||!m.epoch||/[\u0000\uD800-\uDFFF]/u.test(m.epoch))throw Error('同步清单版本不受支持');
 if(!isCounterMap(m.heads,256))throw Error('同步清单进度错误');
 const s=m.snapshot;
 if(s===undefined||s===null)return;
 if(!isProtocolObject(s)||typeof s.id!=='string'||!s.id||/[\u0000\uD800-\uDFFF]/u.test(s.id)||
    !Array.isArray(s.parts)||s.parts.length>10000||!isCounterMap(s.cursors)||
    Object.entries(s.cursors).some(([actor,index])=>index>(counterAt(m.heads,actor)))||
    s.parts.some(p=>!isProtocolObject(p)||typeof p.path!=='string'||p.path.length>=160||!/^v2\/s-[a-zA-Z0-9_-]+\.json\.gz$/.test(p.path)||
       typeof p.sha256!=='string'||!(/^[0-9a-f]{64}$/).test(p.sha256)))throw Error('同步快照格式或进度错误');
}
function manifestValue(response){
 if(response.status!==200)throw Error(syncError(response.status));
 if(typeof response.etag!=='string'||!response.etag||response.etag.startsWith('W/'))throw Error('坚果云未提供并发保护标识，本次未上传');
 const m=parseWire(response.body);
 validateManifest(m);
 return m;
}
function validatePending(p,actor,epoch){
 if(!isProtocolObject(p)||!isActor(p.device)||p.device!==actor||!isCounter(p.index,1)||
    !isCounter(p.through,1)||typeof p.body!=='string'||bytes(p.body)>1024*1024||p.path!==batchPath(p.device,p.index))
  throw Error('本地待上传批次无效，待发送记录已保留');
 const body=parseWire(p.body);
 if(!isProtocolObject(body)||body.format!=='gxtodo-batch'||body.device!==p.device||
    body.index!==p.index||body.epoch!==epoch||!Array.isArray(body.events)||!body.events.length||body.events.length>500)
  throw Error('本地待上传批次内容无效，待发送记录已保留');
 for(const event of body.events)validateEvent(event);
 return body;
}
const requireStatus=(r,allowed)=>{if(!allowed.includes(r.status))throw Error(syncError(r.status));return r;};
async function immutable(request,path,body){
 const put=await request({method:'PUT',path,body,etag:null});if(put.status===412){const read=await request({method:'GET',path});if(read.status!==200||read.body!==body)throw Error('同名同步批次内容不同，已停止以避免覆盖；请勿在设备间复制活动数据库');}else requireStatus(put,[200,201,204]);
}
// C006 candidate. Uses the existing v2 snapshot and event wire formats.
function migrationGuard(value) {
 if(!isProtocolObject(value)||value.format!=='gxtodo-sync'||value.version!==2||
    !Object.hasOwn(value,'backup')||
    !(value.backup===null||(typeof value.backup==='string'&&value.backup.length<160&&
      /^v2\/legacy-[a-zA-Z0-9_-]+\.json\.gz$/.test(value.backup))))
  throw Error('旧版迁移标记格式错误，未覆盖云端文件');
 return value;
}

// Unlike action:state, page includes durable tombstones and retained field events.
async function migrationRows(call) {
 for(let attempt=0;attempt<8;attempt++) {
  const {meta}=await call({action:'inspect',keys:[]});
  const rows=[];let after='',changed=false;
  while(true) {
   const page=await call({action:'page',after,limit:100});
   if(page.meta.revision!==meta.revision){changed=true;break;}
   rows.push(...page.rows);
   if(page.rows.length<100)break;
   after=page.rows.at(-1).key;
  }
  if(!changed&&(await call({action:'inspect',keys:[]})).meta.revision===meta.revision)
   return {meta,rows};
 }
 throw Error('迁移期间本地数据正在变化，请稍后重试');
}

async function importLegacyOnce(call,scope,backup,body,legacyBase) {
 // Parse the same wire restrictions used by the v2 protocol before v1 decoding.
 parseWire(body);
 const remote=decodeRemote(body),digest=await sha(body);
 const retry=Symbol('legacy-import-revision-changed');
 for(let attempt=0;attempt<8;attempt++) {
  const snapshot=await migrationRows(call),prior=snapshot.meta.legacyMigration;
  if(isProtocolObject(prior)&&prior.scope===scope&&prior.backup===backup) {
   if(prior.sha256!==digest)throw Error('旧版不可变备份内容已改变，已停止迁移');
   return;
  }
  const state=buildState(snapshot.rows,snapshot.meta.settings);
  const merged=mergeStates(legacyBase||emptyState(),state,remote).state;
  const deleted=new Set(snapshot.rows.filter(row=>row.deleted).map(row=>row.key));
  // Explicit durable deletion wins over the old, full-file backup.
  const changes=diffState(state,merged).changes.filter(change=>!deleted.has(change.key));
  const marker={scope,backup,sha256:digest};
  const guardedCall=async input=>{
   if(input.action==='inspect') {
    const value=await call(input);
    if(value.meta.revision!==snapshot.meta.revision)throw retry;
    return value;
   }
   if(input.action==='commit') {
    if(input.expected!==snapshot.meta.revision)throw retry;
    // Metadata and import events share this actual production SQLite commit.
    const saved=await call({...input,meta:{...input.meta,legacyMigration:marker}});
    if(!saved.ok)throw retry;
    return saved;
   }
   return call(input);
  };
  try {
   // Empty changes still commit the marker through editReplica.
   await editReplica(guardedCall,changes,merged.settings);
   return;
  } catch(error) {if(error!==retry)throw error;}
 }
 throw Error('迁移保存期间本地数据正在变化，请稍后重试');
}

async function initialMigrationSnapshot(call,request,epoch) {
 for(let attempt=0;attempt<8;attempt++) {
  const start=await migrationRows(call),id=uuid(),parts=[];
  let records=[],size=0;
  const flush=async()=>{
   if(!records.length)return;
   const body=JSON.stringify({id,epoch,records});
   // Match the native expanded-file ceiling; never publish an unreadable part.
   if(bytes(body)>8*1024*1024)throw Error('迁移快照条目过大，原数据与备份已保留');
   const file='v2/s-'+id+'-'+parts.length+'.json.gz';
   await immutable(request,file,body);
   parts.push({path:file,sha256:await sha(body)});records=[];size=0;
  };
  for(const row of start.rows) {
   const length=bytes(JSON.stringify(row.record));
   if(records.length&&size+length>384*1024)await flush();
   records.push(row.record);size+=length;
  }
  await flush();
  const latest=await call({action:'inspect',keys:[]});
  if((latest.meta.dataRevision||0)!==(start.meta.dataRevision||0))continue;
  // No batch has been advertised yet. Raw records retain actor/seq/context;
  // subsequent outbox publication or replay therefore remains idempotent.
  return {id,parts,cursors:{},createdAt:new Date().toISOString()};
 }
 throw Error('迁移快照期间数据持续变化，请稍后重试');
}

async function ensureManifest(call,request,legacyBase,scope) {
 let read=await request({method:'GET',path:'v2/manifest.json'});
 if(![404,409].includes(read.status))return {value:manifestValue(read),etag:read.etag};
 requireStatus(await request({method:'MKCOL',path:'v2/'}),[200,201,204,405]);
 read=await request({method:'GET',path:'v2/manifest.json'});
 if(read.status!==404)return {value:manifestValue(read),etag:read.etag};
 let guard=null;
 for(let attempt=0;attempt<8;attempt++) {
  let legacy=null;
  const old=await request({method:'GET',path:'state.json'});
  if(![200,404].includes(old.status))throw Error(syncError(old.status));
  if(old.status===200) {
   const data=parseWire(old.body);
   if(isProtocolObject(data)&&data.format==='gxtodo-sync'&&data.version===2) {
    guard=migrationGuard(data);break;
   }
   decodeRemote(old.body);
   if(typeof old.etag!=='string'||!old.etag||old.etag.startsWith('W/'))
    throw Error('旧同步文件缺少并发保护标识');
   legacy='v2/legacy-'+uuid()+'.json.gz';
   await immutable(request,legacy,old.body);
  }
  const proposed={format:'gxtodo-sync',version:2,backup:legacy,
   message:'请将全部设备升级到 0.8.0 或更新版本；旧版数据已备份。'};
  const fenced=await request({method:'PUT',path:'state.json',body:JSON.stringify(proposed),
   etag:old.status===200?old.etag:null});
  if([200,201,204].includes(fenced.status)){guard=proposed;break;}
  if(fenced.status!==412)throw Error(syncError(fenced.status));
 }
 if(!guard)throw Error('其他设备正在迁移同步目录，请稍后重试');
 migrationGuard(guard);
 if(guard.backup!==null) {
  const old=requireStatus(await request({method:'GET',path:guard.backup}),[200]);
  await importLegacyOnce(call,scope,guard.backup,old.body,legacyBase);
 }
 const epoch=uuid();
 // Upload a reachable initial recovery state BEFORE publishing the manifest.
 // All consumers, including existing native clients, already read this format.
 const snapshot=await initialMigrationSnapshot(call,request,epoch);
 const value={format:'gxtodo-delta',version:2,epoch,heads:{},snapshot,legacy:guard.backup};
 validateManifest(value);
 const created=await request({method:'PUT',path:'v2/manifest.json',body:JSON.stringify(value),etag:null});
 if(![200,201,204,412].includes(created.status))throw Error(syncError(created.status));
 read=await request({method:'GET',path:'v2/manifest.json'});
 return {value:manifestValue(read),etag:read.etag};
}
async function bind(call,scope,epoch){
 const {meta}=await call({action:'inspect',keys:[]});if(meta.scope===scope&&meta.epoch===epoch)return;
 if(meta.scope==null){await updateMeta(call,m=>{m.scope=scope;m.epoch=epoch;m.cursors={};m.pending=null;m.cachedManifest=null;});return;}
 // Moving to another cloud directory publishes every surviving field version, including tombstones.
 for(let attempt=0;attempt<8;attempt++){
  const start=await call({action:'inspect',keys:[]}),next=clone(start.meta),outbox=[];let after='',changed=false;
  while(true){const page=await call({action:'page',after,limit:100});if(page.meta.revision!==start.meta.revision){changed=true;break;}for(const row of page.rows)for(const event of row.record.events){if(!isCounter(next.queue)||next.queue>=Number.MAX_SAFE_INTEGER)throw Error('发件箱编号已达上限，待发送记录已保留');outbox.push({id:++next.queue,event:{key:row.key,...event}});}if(page.rows.length<100)break;after=page.rows.at(-1).key;}
  if(changed)continue;next.scope=scope;next.epoch=epoch;next.cursors={};next.pending=null;next.cachedManifest=null;
  const saved=await call({action:'commit',expected:start.meta.revision,meta:next,rows:[],outbox,clearOutbox:true});if(saved.ok)return;
 }
 throw Error('同步目录切换期间数据正在变化，请重试');
}
async function checkpoint(call,request,m,shouldContinue){
 validateManifest(m);
 const {meta}=await call({action:'inspect',keys:[]});
 if(!isCounterMap(meta.cursors))throw Error('本地同步进度无效，待发送记录已保留');
 const s=m.snapshot;if(!s || (progressGap(m.heads,meta.cursors,16)<16&&Object.keys(meta.cursors).length))return;
 for(const part of s.parts){if(!shouldContinue())return;const r=requireStatus(await request({method:'GET',path:part.path}),[200]);if(await sha(r.body)!==part.sha256)throw Error('快照校验失败，本地进度未推进');const chunk=parseWire(r.body);if(chunk?.epoch!==m.epoch||chunk.id!==s.id||!Array.isArray(chunk.records))throw Error('快照不匹配');const events=chunk.records.flatMap(record=>{
  if(!isProtocolObject(record)||typeof record.key!=='string'||!Array.isArray(record.events))throw Error('快照记录格式错误');
  return record.events.map(event=>{
   if(!isProtocolObject(event)||Object.hasOwn(event,'key'))throw Error('快照事件格式错误');
   return {...event,key:record.key};
  });
 });await applyRemote(call,events);}
 if(!shouldContinue())return;
 await updateMeta(call,next=>{
  if(!isCounterMap(next.cursors))throw Error('本地同步进度无效，待发送记录已保留');
  next.cursors=maxCursors(next.cursors,s.cursors);
 });
}
async function pull(call,request,m,shouldContinue,budget){
 await checkpoint(call,request,m,shouldContinue);let count=0;
 for(const device of Object.keys(m.heads).sort()){
  let cursor=counterAt((await call({action:'inspect',keys:[]})).meta.cursors,device);
  while(cursor<m.heads[device]){
   if(!shouldContinue()||count>=budget)return {count,more:true};const index=cursor+1,r=requireStatus(await request({method:'GET',path:batchPath(device,index)}),[200]),batch=parseWire(r.body);
   if(!isProtocolObject(batch)||batch.format!=='gxtodo-batch'||batch.epoch!==m.epoch||batch.device!==device||batch.index!==index||!Array.isArray(batch.events)||batch.events.length>500)throw Error('同步批次顺序或内容错误，未跳过缺失批次');
   await applyRemote(call,batch.events,undefined,{device,index});cursor=index;count++;
  }
 }
 return {count,more:false};
}
async function prepare(call,m){
 validateManifest(m);
 for(let i=0;i<8;i++){
  const {meta,entries}=await call({action:'outbox',limit:500});
  if(meta.pending!=null){validatePending(meta.pending,meta.actor,m.epoch);return meta.pending;}
  if(!entries.length)return null;
  if(!isActor(meta.actor)||(counterAt(m.heads,meta.actor))===Number.MAX_SAFE_INTEGER)throw Error('批次编号不可用，待发送记录已保留');
  const events=[];let through=0,encodedBytes=2;for(const entry of entries){const length=bytes(JSON.stringify(entry.event))+1;if(events.length&&encodedBytes+length>384*1024)break;if(!isCounter(entry.id,1))throw Error('发件箱编号无效');validateEvent(entry.event);events.push(entry.event);encodedBytes+=length;through=entry.id;}
  const index=(counterAt(m.heads,meta.actor))+1,body=JSON.stringify({format:'gxtodo-batch',epoch:m.epoch,device:meta.actor,index,events});if(bytes(body)>1024*1024)throw Error('单条变更太大，请缩短任务内容');
  const pending={device:meta.actor,index,through,body,path:batchPath(meta.actor,index)},next={...meta,pending};const result=await call({action:'commit',expected:meta.revision,meta:next,rows:[],outbox:[]});if(result.ok)return pending;
 }
 throw Error('生成上传批次时数据繁忙，请重试');
}
async function publish(call,request,manifest,pending){
 validateManifest(manifest.value);
 const {meta}=await call({action:'inspect',keys:[]});
 const body=validatePending(pending,meta.actor,manifest.value.epoch);
 await immutable(request,pending.path,pending.body);
 for(let attempt=0;attempt<10;attempt++){
  if(manifest.value.epoch!==body.epoch)throw Error('云端同步空间已改变，请重新同步');
  const current=manifest.value,head=counterAt(current.heads,pending.device);
  if(head>=pending.index){await updateMeta(call,m=>{m.cursors[pending.device]=Math.max(counterAt(m.cursors,pending.device),pending.index);m.pending=null;},{ack:pending.through});return manifest;}
  if(head!==pending.index-1)throw Error('设备批次出现断档，已保留待上传记录');
  const next={...current,heads:{...current.heads,[pending.device]:pending.index}};validateManifest(next);const result=await request({method:'PUT',path:'v2/manifest.json',etag:manifest.etag,body:JSON.stringify(next)});
  if([200,201,204].includes(result.status)){
   await updateMeta(call,m=>{m.cursors[pending.device]=Math.max(counterAt(m.cursors,pending.device),pending.index);m.pending=null;},{ack:pending.through});
   const read=await request({method:'GET',path:'v2/manifest.json'});return {value:manifestValue(read),etag:read.etag};
  }
  if(result.status!==412)throw Error(syncError(result.status));const read=await request({method:'GET',path:'v2/manifest.json'});manifest={value:manifestValue(read),etag:read.etag};
 }
 throw Error('多台设备正在提交，改动已保留，将稍后重试');
}
async function makeSnapshot(call,request,manifest,shouldContinue){
 const start=await call({action:'outbox',limit:1}),m=manifest.value,meta=start.meta;if(start.entries.length||meta.pending||!shouldContinue())return;
 const snapshotGap=m.snapshot?progressGap(meta.cursors,m.snapshot.cursors,64):null;
 // Promote the initial zero-cursor recovery snapshot after the first published batch.
 if(m.snapshot&&snapshotGap<64&&(snapshotGap===0||Object.values(m.snapshot.cursors).some(index=>index>0)))return;
 if(Object.entries(m.heads).some(([k,n])=>(counterAt(meta.cursors,k))<n))return;
 const id=uuid(),parts=[];let after='',records=[],size=0;
 const flush=async()=>{if(!records.length)return;const body=JSON.stringify({id,epoch:m.epoch,records}),file='v2/s-'+id+'-'+parts.length+'.json.gz';await immutable(request,file,body);parts.push({path:file,sha256:await sha(body)});records=[];size=0;};
 while(true){if(!shouldContinue())return;const page=await call({action:'page',after,limit:100});if((page.meta.dataRevision||0)!==(meta.dataRevision||0))return;for(const row of page.rows){const length=bytes(JSON.stringify(row.record));if(size+length>384*1024)await flush();records.push(row.record);size+=length;}if(page.rows.length<100)break;after=page.rows.at(-1).key;}
 await flush();if(((await call({action:'inspect',keys:[]})).meta.dataRevision||0)!==(meta.dataRevision||0))return;
 const read=await request({method:'GET',path:'v2/manifest.json'}),latest=manifestValue(read);if(latest.epoch!==m.epoch||
    Object.entries(meta.cursors).some(([actor,index])=>index>counterAt(latest.heads,actor))||
    (latest.snapshot&&Object.entries(latest.snapshot.cursors).some(([actor,index])=>index>counterAt(meta.cursors,actor))))return;
 const snapshot={id,parts,cursors:meta.cursors,createdAt:new Date().toISOString()},result=await request({method:'PUT',path:'v2/manifest.json',etag:read.etag,body:JSON.stringify({...latest,snapshot})});if(![200,201,204,412].includes(result.status))throw Error(syncError(result.status));
}
async function exchangeDelta({call,request,scope,legacyBase=null,shouldContinue=()=>true,maxBatches=12,snapshots=true}){
 const initial=await call({action:'inspect',keys:[]});
 if(!isCounterMap(initial.meta.cursors))throw Error('本地同步进度无效，待发送记录已保留');
 if(initial.meta.pending!=null)validatePending(initial.meta.pending,initial.meta.actor,initial.meta.epoch);
 let cached=initial.meta.scope===scope?initial.meta.cachedManifest:null;
 if(cached){try{validateManifest(cached.value);if(typeof cached.etag!=='string'||!cached.etag||cached.etag.startsWith('W/'))cached=null;}catch{cached=null;}}
 let read=await request({method:'GET',path:'v2/manifest.json',etag:cached?.etag}),manifest;
 if(read.status===304&&cached)manifest=cached;else if([404,409].includes(read.status))manifest=await ensureManifest(call,request,legacyBase,scope);else manifest={value:manifestValue(read),etag:read.etag};
 await bind(call,scope,manifest.value.epoch);
 const first=await pull(call,request,manifest.value,shouldContinue,maxBatches);let pushed=0;
 while(shouldContinue()&&pushed<maxBatches){const pending=await prepare(call,manifest.value);if(!pending)break;manifest=await publish(call,request,manifest,pending);pushed++;}
 let final=first;if(pushed)final=await pull(call,request,manifest.value,shouldContinue,maxBatches);
 const out=await call({action:'outbox',limit:1}),more=final.more||out.entries.length>0||!!out.meta.pending;
 if(!equal((await call({action:'inspect',keys:[]})).meta.cachedManifest,manifest))await updateMeta(call,m=>{m.cachedManifest=manifest;});
 if(!more&&snapshots&&shouldContinue())await makeSnapshot(call,request,manifest,shouldContinue);
 return {more:!!more,downloaded:first.count+(pushed?final.count:0),uploaded:pushed,conflicts:await call({action:'conflicts'})};
}

// A database may be shared by two browser tabs. A renewable lease prevents two senders using one actor.
export async function syncDelta(options){
 const original=options.call,token=uuid();let acquired=false;
 for(let attempt=0;attempt<8;attempt++){
  const {meta}=await original({action:'inspect',keys:[]});if(meta.lease&&meta.lease.until>Date.now())return {more:true,busy:true,downloaded:0,uploaded:0,conflicts:[]};
  const result=await original({action:'commit',expected:meta.revision,meta:{...meta,lease:{token,until:Date.now()+120000}},rows:[],outbox:[]});if(result.ok){acquired=true;break;}
 }
 if(!acquired)throw Error('另一个窗口正在同步');
 const call=async input=>{if(input.action==='commit'&&input.meta.lease?.token!==token)throw Error('同步会话已过期，改动已保留');return original(input);};
 const request=async input=>{const {meta}=await original({action:'inspect',keys:[]});if(meta.lease?.token!==token)throw Error('同步会话已由另一个窗口接续');if(meta.lease.until-Date.now()<45000)await updateMeta(call,m=>{m.lease={token,until:Date.now()+120000};});return options.request(input);};
 try{return await exchangeDelta({...options,call,request});}
 finally{const {meta}=await original({action:'inspect',keys:[]});if(meta.lease?.token===token)await original({action:'commit',expected:meta.revision,meta:{...meta,lease:null},rows:[],outbox:[]});}
}
