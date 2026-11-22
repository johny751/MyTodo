import {clone,equal,buildState,diffState,editReplica,applyRemote,updateMeta} from './replica.mjs';
import {decodeRemote,mergeStates,emptyState,syncError} from './sync-core.mjs';
const bytes=s=>new TextEncoder().encode(s).length;
const batchPath=(device,index)=>'v2/b-'+device+'-'+index+'.json.gz';
const uuid=()=>crypto.randomUUID();
const sum=values=>Object.values(values).reduce((a,b)=>a+b,0);
const maxCursors=(a,b)=>{const out={...a};for(const [k,v] of Object.entries(b))out[k]=Math.max(out[k]||0,v);return out;};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
function manifestValue(response){
 if(response.status!==200)throw Error(syncError(response.status));const m=JSON.parse(response.body);
 if(m.format!=='gxtodo-delta'||m.version!==2||typeof m.epoch!=='string'||!m.heads||Object.keys(m.heads).length>256)throw Error('同步清单版本不受支持');
 for(const [actor,n] of Object.entries(m.heads))if(!/^[a-zA-Z0-9-]{1,80}$/.test(actor)||!Number.isSafeInteger(n)||n<0)throw Error('同步清单进度错误');
 if(!response.etag||response.etag.startsWith('W/'))throw Error('坚果云未提供并发保护标识，本次未上传');return m;
}
const requireStatus=(r,allowed)=>{if(!allowed.includes(r.status))throw Error(syncError(r.status));return r;};
async function immutable(request,path,body){
 const put=await request({method:'PUT',path,body,etag:null});if(put.status===412){const read=await request({method:'GET',path});if(read.status!==200||read.body!==body)throw Error('同名同步批次内容不同，已停止以避免覆盖；请勿在设备间复制活动数据库');}else requireStatus(put,[200,201,204]);
}
async function ensureManifest(call,request,legacyBase){
 let read=await request({method:'GET',path:'v2/manifest.json'});if(![404,409].includes(read.status))return {value:manifestValue(read),etag:read.etag};
 // Jianguoyun returns 409 when an ancestor collection does not exist.
 requireStatus(await request({method:'MKCOL',path:'v2/'}),[200,201,204,405]);
 read=await request({method:'GET',path:'v2/manifest.json'});if(read.status!==404)return {value:manifestValue(read),etag:read.etag};
 let legacy=null,guard;
 // Fence the old full-file protocol before new writers start. The original cloud file is immutable backup.
 for(let i=0;i<8;i++){
  const old=await request({method:'GET',path:'state.json'});if(![200,404].includes(old.status))throw Error(syncError(old.status));
  if(old.status===200){const data=JSON.parse(old.body);if(data.format==='gxtodo-sync'&&data.version===2){guard=data;break;}decodeRemote(old.body);if(!old.etag||old.etag.startsWith('W/'))throw Error('旧同步文件缺少并发保护标识');legacy='v2/legacy-'+uuid()+'.json.gz';await immutable(request,legacy,old.body);}
  guard={format:'gxtodo-sync',version:2,backup:legacy,message:'请将全部设备升级到 0.8.0 或更新版本；旧版数据已备份。'};
  const fenced=await request({method:'PUT',path:'state.json',body:JSON.stringify(guard),etag:old.status===200?old.etag:null});if([200,201,204].includes(fenced.status))break;if(fenced.status!==412)throw Error(syncError(fenced.status));guard=null;
 }
 if(!guard)throw Error('其他设备正在迁移同步目录，请稍后重试');
 if(guard.backup){const old=requireStatus(await request({method:'GET',path:guard.backup}),[200]),snapshot=await call({action:'state'}),state=buildState(snapshot.rows,snapshot.meta.settings);const merged=mergeStates(legacyBase||emptyState(),state,decodeRemote(old.body)).state;await editReplica(call,diffState(state,merged).changes,merged.settings);}
 const value={format:'gxtodo-delta',version:2,epoch:uuid(),heads:{},snapshot:null,legacy:guard.backup||null};
 const created=await request({method:'PUT',path:'v2/manifest.json',body:JSON.stringify(value),etag:null});if(![200,201,204,412].includes(created.status))throw Error(syncError(created.status));read=await request({method:'GET',path:'v2/manifest.json'});return {value:manifestValue(read),etag:read.etag};
}
async function bind(call,scope,epoch){
 const {meta}=await call({action:'inspect',keys:[]});if(meta.scope===scope&&meta.epoch===epoch)return;
 if(meta.scope==null){await updateMeta(call,m=>{m.scope=scope;m.epoch=epoch;m.cursors={};m.pending=null;m.cachedManifest=null;});return;}
 // Moving to another cloud directory publishes every surviving field version, including tombstones.
 for(let attempt=0;attempt<8;attempt++){
  const start=await call({action:'inspect',keys:[]}),next=clone(start.meta),outbox=[];let after='',changed=false;
  while(true){const page=await call({action:'page',after,limit:100});if(page.meta.revision!==start.meta.revision){changed=true;break;}for(const row of page.rows)for(const event of row.record.events)outbox.push({id:++next.queue,event:{key:row.key,...event}});if(page.rows.length<100)break;after=page.rows.at(-1).key;}
  if(changed)continue;next.scope=scope;next.epoch=epoch;next.cursors={};next.pending=null;next.cachedManifest=null;
  const saved=await call({action:'commit',expected:start.meta.revision,meta:next,rows:[],outbox,clearOutbox:true});if(saved.ok)return;
 }
 throw Error('同步目录切换期间数据正在变化，请重试');
}
async function checkpoint(call,request,m,shouldContinue){
 const s=m.snapshot;if(!s)return;const {meta}=await call({action:'inspect',keys:[]});const missing=sum(m.heads)-sum(meta.cursors);if(missing<16&&Object.keys(meta.cursors).length)return;
 if(!Array.isArray(s.parts)||s.parts.length>10000||!s.cursors)throw Error('同步快照格式错误');
 for(const part of s.parts){if(!shouldContinue())return;const r=requireStatus(await request({method:'GET',path:part.path}),[200]);if(await sha(r.body)!==part.sha256)throw Error('快照校验失败，本地进度未推进');const chunk=JSON.parse(r.body);if(chunk.epoch!==m.epoch||chunk.id!==s.id||!Array.isArray(chunk.records))throw Error('快照不匹配');const events=chunk.records.flatMap(record=>record.events.map(event=>({key:record.key,...event})));await applyRemote(call,events);}
 if(!shouldContinue())return;
 await updateMeta(call,next=>{next.cursors=maxCursors(next.cursors,s.cursors);});
}
async function pull(call,request,m,shouldContinue,budget){
 await checkpoint(call,request,m,shouldContinue);let count=0;
 for(const device of Object.keys(m.heads).sort()){
  let cursor=(await call({action:'inspect',keys:[]})).meta.cursors[device]||0;
  while(cursor<m.heads[device]){
   if(!shouldContinue()||count>=budget)return {count,more:true};const index=cursor+1,r=requireStatus(await request({method:'GET',path:batchPath(device,index)}),[200]),batch=JSON.parse(r.body);
   if(batch.format!=='gxtodo-batch'||batch.epoch!==m.epoch||batch.device!==device||batch.index!==index||!Array.isArray(batch.events)||batch.events.length>500)throw Error('同步批次顺序或内容错误，未跳过缺失批次');
   await applyRemote(call,batch.events,next=>{next.cursors[device]=Math.max(next.cursors[device]||0,index);});cursor=index;count++;
  }
 }
 return {count,more:false};
}
async function prepare(call,m){
 for(let i=0;i<8;i++){
  const {meta,entries}=await call({action:'outbox',limit:500});if(meta.pending)return meta.pending;if(!entries.length)return null;
  const events=[];let through=0,encodedBytes=2;for(const entry of entries){const length=bytes(JSON.stringify(entry.event))+1;if(events.length&&encodedBytes+length>384*1024)break;events.push(entry.event);encodedBytes+=length;through=entry.id;}
  const index=(m.heads[meta.actor]||0)+1,body=JSON.stringify({format:'gxtodo-batch',epoch:m.epoch,device:meta.actor,index,events});if(bytes(body)>1024*1024)throw Error('单条变更太大，请缩短任务内容');
  const pending={device:meta.actor,index,through,body,path:batchPath(meta.actor,index)},next={...meta,pending};const result=await call({action:'commit',expected:meta.revision,meta:next,rows:[],outbox:[]});if(result.ok)return pending;
 }
 throw Error('生成上传批次时数据繁忙，请重试');
}
async function publish(call,request,manifest,pending){
 await immutable(request,pending.path,pending.body);
 for(let attempt=0;attempt<10;attempt++){
  if(manifest.value.epoch!==JSON.parse(pending.body).epoch)throw Error('云端同步空间已改变，请重新同步');
  const current=manifest.value,head=current.heads[pending.device]||0;
  if(head>=pending.index){await updateMeta(call,m=>{m.cursors[pending.device]=Math.max(m.cursors[pending.device]||0,pending.index);m.pending=null;},{ack:pending.through});return manifest;}
  if(head!==pending.index-1)throw Error('设备批次出现断档，已保留待上传记录');
  const next={...current,heads:{...current.heads,[pending.device]:pending.index}},result=await request({method:'PUT',path:'v2/manifest.json',etag:manifest.etag,body:JSON.stringify(next)});
  if([200,201,204].includes(result.status)){
   await updateMeta(call,m=>{m.cursors[pending.device]=Math.max(m.cursors[pending.device]||0,pending.index);m.pending=null;},{ack:pending.through});
   const read=await request({method:'GET',path:'v2/manifest.json'});return {value:manifestValue(read),etag:read.etag};
  }
  if(result.status!==412)throw Error(syncError(result.status));const read=await request({method:'GET',path:'v2/manifest.json'});manifest={value:manifestValue(read),etag:read.etag};
 }
 throw Error('多台设备正在提交，改动已保留，将稍后重试');
}
async function makeSnapshot(call,request,manifest,shouldContinue){
 const start=await call({action:'outbox',limit:1}),m=manifest.value,meta=start.meta;if(start.entries.length||meta.pending||!shouldContinue())return;
 if(m.snapshot&&sum(meta.cursors)-sum(m.snapshot.cursors)<64)return;
 if(Object.entries(m.heads).some(([k,n])=>(meta.cursors[k]||0)<n))return;
 const id=uuid(),parts=[];let after='',records=[],size=0;
 const flush=async()=>{if(!records.length)return;const body=JSON.stringify({id,epoch:m.epoch,records}),file='v2/s-'+id+'-'+parts.length+'.json.gz';await immutable(request,file,body);parts.push({path:file,sha256:await sha(body)});records=[];size=0;};
 while(true){if(!shouldContinue())return;const page=await call({action:'page',after,limit:100});if((page.meta.dataRevision||0)!==(meta.dataRevision||0))return;for(const row of page.rows){const length=bytes(JSON.stringify(row.record));if(size+length>384*1024)await flush();records.push(row.record);size+=length;}if(page.rows.length<100)break;after=page.rows.at(-1).key;}
 await flush();if(((await call({action:'inspect',keys:[]})).meta.dataRevision||0)!==(meta.dataRevision||0))return;
 const read=await request({method:'GET',path:'v2/manifest.json'}),latest=manifestValue(read);if(latest.snapshot&&Object.entries(latest.snapshot.cursors).some(([k,v])=>v>(meta.cursors[k]||0)))return;
 const snapshot={id,parts,cursors:meta.cursors,createdAt:new Date().toISOString()},result=await request({method:'PUT',path:'v2/manifest.json',etag:read.etag,body:JSON.stringify({...latest,snapshot})});if(![200,201,204,412].includes(result.status))throw Error(syncError(result.status));
}
async function exchangeDelta({call,request,scope,legacyBase=null,shouldContinue=()=>true,maxBatches=12,snapshots=true}){
 const initial=await call({action:'inspect',keys:[]}),cached=initial.meta.scope===scope?initial.meta.cachedManifest:null;
 let read=await request({method:'GET',path:'v2/manifest.json',etag:cached?.etag}),manifest;
 if(read.status===304&&cached)manifest=cached;else if([404,409].includes(read.status))manifest=await ensureManifest(call,request,legacyBase);else manifest={value:manifestValue(read),etag:read.etag};
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
