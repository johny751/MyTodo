import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSQLiteStore} from '../src/sqlite-store.mjs';
import {editReplica,diffState,applyRemote,entityKey,applyEvent,rowFromRecord} from '../src/replica.mjs';
import {syncDelta} from '../src/delta-sync.mjs';
import {emptyState,encodeRemote,decodeRemote} from '../src/sync-core.mjs';
import {seedState} from '../src/model.mjs';
import {createSyncStore} from '../src/sync-server.mjs';
import {gzipSync,gunzipSync} from 'node:zlib';
function cloud(){
 const files=new Map(),calls=[];let version=0,hook=null;
 const request=async input=>{
  calls.push({...input});if(hook){const result=await hook(input);if(result)return result;}
  const name=input.path||'state.json',current=files.get(name);await new Promise(r=>setTimeout(r,Math.random()*2));
  // Read after yielding: simulate atomic compare-and-swap at the server.
  const latest=files.get(name);
  if(input.method==='MKCOL')return {status:201};
  if(input.method==='GET')return latest?(input.etag===latest.etag?{status:304,etag:latest.etag}:{status:200,...latest}):{status:404};
  if(input.method==='PUT'){
   if(input.etag==null?!!latest:input.etag!==latest?.etag)return {status:412};
   const entry={body:input.body,etag:'"'+(++version)+'"'};files.set(name,entry);return {status:201,etag:entry.etag};
  }
  throw Error('unsupported');
 };
 return {files,calls,request,setHook:f=>hook=f};
}
async function device(t,state=emptyState()){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gxtodo-delta-'));let store=createSQLiteStore(dir);await store.initialize(state);
 t.after(async()=>{store.close();assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});});
 return {dir,get store(){return store;},call:i=>store.call(i),state:()=>store.read(),async edit(fn){const before=store.read(),next=structuredClone(before);fn(next);const diff=diffState(before,next);await editReplica(i=>store.call(i),diff.changes,diff.settings);},restart(){store.close();store=createSQLiteStore(dir);}};
}
const run=(d,c,options={})=>syncDelta({call:d.call,request:c.request,scope:'six-devices',snapshots:false,...options});
async function converge(devices,c,options={}){for(let round=0;round<3;round++)for(const d of devices){let result;let guard=0;do{result=await run(d,c,options);assert.ok(++guard<200);}while(result.more);}}
const note=(id,body)=>({id,body,createdAt:'2026-10-19T00:00:00Z'});

test('六端同一周期先后及同时添加修改，所有来源的批次最终完整收敛',async t=>{
 const c=cloud(),devices=await Promise.all(Array.from({length:6},()=>device(t)));await run(devices[0],c);
 await Promise.all(devices.map((d,i)=>d.edit(s=>s.notes.push(note('device-'+i,'first-'+i)))));
 await Promise.all(devices.map(d=>run(d,c)));await converge(devices,c);
 for(const d of devices)assert.equal(d.state().notes.length,6);
 await Promise.all(devices.map((d,i)=>d.edit(s=>{s.notes.find(n=>n.id==='device-'+i).body='edited-'+i;s.notes.push(note('second-'+i,'new'));})));
 // The sixth device stays offline while the other five publish repeatedly.
 for(const d of devices.slice(0,5))await run(d,c);await run(devices[5],c);await converge(devices,c);
 const expected=devices[0].state();assert.equal(expected.notes.length,12);
 for(let i=0;i<6;i++)assert.equal(expected.notes.find(n=>n.id==='device-'+i).body,'edited-'+i);
 for(const d of devices){assert.deepEqual(d.state(),expected);assert.deepEqual(d.call({action:'inspect',keys:[]}).meta.cursors,JSON.parse(c.files.get('v2/manifest.json').body).heads);}
});
test('上传成功但清单提交中断，重启后复用同一批次，清单竞争不覆盖他人进度',async t=>{
 const c=cloud(),a=await device(t),b=await device(t);await run(a,c);await a.edit(s=>s.notes.push(note('durable','saved offline')));
 let broken=false;c.setHook(input=>{if(!broken&&input.method==='PUT'&&input.path==='v2/manifest.json'&&Object.keys(JSON.parse(input.body).heads).length){broken=true;throw Error('simulated disconnect');}});
 await assert.rejects(run(a,c),/disconnect/);assert.ok(a.call({action:'inspect',keys:[]}).meta.pending);a.restart();c.setHook(null);await b.edit(s=>s.notes.push(note('other','other device')));await run(b,c);await converge([a,b],c);
 assert.equal(a.state().notes.length,2);assert.deepEqual(a.state(),b.state());assert.equal(a.call({action:'outbox'}).entries.length,0);
});
test('缺少中间批次不跳跃推进，恢复后补齐每一批而不重复',async t=>{
 const c=cloud(),a=await device(t),b=await device(t);await run(a,c);for(let i=0;i<3;i++){await a.edit(s=>s.notes.push(note('n'+i,'batch'+i)));await run(a,c);}
 const actor=a.call({action:'inspect',keys:[]}).meta.actor;let blocked=true;c.setHook(i=>i.method==='GET'&&i.path==='v2/b-'+actor+'-2.json.gz'&&blocked?{status:404}:null);
 await assert.rejects(run(b,c));assert.equal(b.call({action:'inspect',keys:[]}).meta.cursors[actor],1);assert.equal(b.state().notes.length,1);blocked=false;await converge([a,b],c);assert.equal(b.state().notes.length,3);assert.deepEqual(a.state(),b.state());
});
test('同字段并发版本保留，显式选择收敛，删除不会被离线旧副本复活',async t=>{
 const c=cloud(),a=await device(t),b=await device(t),d=await device(t);await a.edit(s=>s.notes.push(note('n','base')));await converge([a,b,d],c);
 await a.edit(s=>s.notes[0].body='computer');await b.edit(s=>s.notes[0].body='phone');await Promise.all([run(a,c),run(b,c)]);await converge([a,b],c);
 const conflicts=a.call({action:'conflicts'});assert.equal(conflicts.length,1);assert.deepEqual(new Set(conflicts[0].values.map(v=>v.value)),new Set(['computer','phone']));
 await editReplica(a.call,[{key:entityKey('notes','n'),values:{body:'phone'}}]);await converge([a,b],c);assert.equal(a.call({action:'conflicts'}).length,0);assert.equal(b.state().notes[0].body,'phone');
 await a.edit(s=>s.notes=[]);await run(a,c);await d.edit(s=>s.notes[0].body='offline edit');await converge([a,b,d],c);for(const dev of [a,b,d])assert.equal(dev.state().notes.length,0);
 // Explicit restore sees the deletion and intentionally revives the preserved record.
 await editReplica(d.call,[{key:entityKey('notes','n'),values:{_deleted:false}}]);await converge([a,b,d],c);assert.equal(a.state().notes.length,1);assert.ok(a.call({action:'conflicts'}).some(x=>x.field==='body'));
});
test('事务失败不落下半条数据、发件箱或进度，磁盘重开后仍可恢复',async t=>{
 const a=await device(t);await a.edit(s=>s.notes.push(note('n','original')));const current=a.call({action:'inspect',keys:[entityKey('notes','n')]}),row=structuredClone(current.rows[0]),pending=a.call({action:'outbox'}).entries[0];row.data.body='must rollback';
 assert.throws(()=>a.call({action:'commit',expected:current.meta.revision,meta:current.meta,rows:[row],outbox:[pending]}));a.restart();assert.equal(a.state().notes[0].body,'original');assert.equal(a.call({action:'inspect',keys:[]}).meta.revision,current.meta.revision);
});
test('快照支持新设备跳过旧日志、保留本地离线新增，校验失败不推进进度',async t=>{
 const c=cloud(),a=await device(t),b=await device(t),d=await device(t);await a.edit(s=>{for(let i=0;i<250;i++)s.notes.push(note('n'+i,'snapshot item '+i));});await run(a,c,{snapshots:true});
 const m=JSON.parse(c.files.get('v2/manifest.json').body);assert.ok(m.snapshot);const part=m.snapshot.parts[0].path,original=c.files.get(part);c.files.set(part,{...original,body:original.body+' '});await assert.rejects(run(b,c),/校验/);assert.deepEqual(b.call({action:'inspect',keys:[]}).meta.cursors,{});c.files.set(part,original);
 await d.edit(s=>s.notes.push(note('offline','keep local')));c.calls.length=0;await run(d,c);assert.ok(!c.calls.some(x=>x.method==='GET'&&/v2\/b-/.test(x.path)));await converge([a,b,d],c);assert.equal(d.state().notes.length,251);assert.deepEqual(a.state(),d.state());
});
test('旧 JSON 云端迁移先备份并阻止旧客户端覆盖，再合并原记录',async t=>{
 const c=cloud(),a=await device(t),old=seedState('2026-10-19');c.files.set('state.json',{body:encodeRemote(old),etag:'"legacy"'});await a.edit(s=>s.notes.push(note('offline','offline addition')));await run(a,c);
 const guard=JSON.parse(c.files.get('state.json').body);assert.equal(guard.version,2);assert.deepEqual(decodeRemote(c.files.get(guard.backup).body),old);assert.throws(()=>decodeRemote(c.files.get('state.json').body));assert.equal(a.state().tasks.length,4);assert.ok(a.state().notes.some(n=>n.id==='offline'));
});
test('无变化检查只获取小清单，304 不重复下载记录、不改实体或发件箱',async t=>{
 const c=cloud(),a=await device(t);await a.edit(s=>s.notes.push(note('n','payload')));await converge([a],c);c.calls.length=0;const revision=a.call({action:'inspect',keys:[]}).meta.revision;await run(a,c);assert.deepEqual(c.calls.map(x=>x.method+':'+x.path),['GET:v2/manifest.json']);assert.equal(a.call({action:'outbox'}).entries.length,0);assert.equal(a.call({action:'inspect',keys:[]}).meta.revision,revision+2);
});
test('实际 WebDAV 传输适配器压缩增量文件并正确使用条件 GET',async t=>{
 const a=await device(t);const storage=new Map();let serial=0;const fetchImpl=async(target,options)=>{if(options.method==='MKCOL')return new Response(null,{status:201});const entry=storage.get(target);if(options.method==='GET')return !entry?new Response(null,{status:404}):options.headers['If-None-Match']===entry.etag?new Response(null,{status:304,headers:{etag:entry.etag}}):new Response(entry.body,{status:200,headers:{etag:entry.etag}});if(options.headers['If-None-Match']==='*'&&entry||options.headers['If-Match']&&options.headers['If-Match']!==entry?.etag)return new Response(null,{status:412});const saved={body:options.body,etag:'"'+(++serial)+'"'};storage.set(target,saved);return new Response(null,{status:201,headers:{etag:saved.etag}});};
 const sync=await createSyncStore(a.dir,{fetchImpl,protect:async s=>s,unprotect:async s=>s});const cfg=await sync({op:'config-save',config:{username:'test@example.invalid',password:'test',folder:'Six',enabled:true}});const c={request:i=>sync({op:'request',scope:cfg.scope,...i})};await a.edit(s=>s.notes.push(note('n','repeated '.repeat(1000))));await run(a,c);const batch=[...storage].find(([key])=>key.endsWith('.json.gz'));assert.ok(Buffer.isBuffer(batch[1].body));const decoded=gunzipSync(batch[1].body).toString();assert.ok(batch[1].body.length<Buffer.byteLength(decoded)/3);
});
test('乱序重复应用和同时变更不同字段，最终投影与冲突一致',()=>{
 const key=entityKey('notes','n'),base={key,actor:'A',seq:1,clock:1,context:{},values:{id:'n',body:'base',createdAt:'day',_deleted:false}},one={key,actor:'B',seq:1,clock:2,context:{A:1},values:{body:'B'}},two={key,actor:'C',seq:1,clock:2,context:{A:1},values:{createdAt:'later'}},three={key,actor:'D',seq:1,clock:3,context:{A:1,B:1},values:{body:'D'}};
 const orders=[[base,one,two,three],[three,two,one,base,three],[two,base,three,one]],results=orders.map(events=>rowFromRecord(events.reduce((r,e)=>applyEvent(r,e),null)));for(const r of results){assert.equal(r.data.body,'D');assert.equal(r.data.createdAt,'later');assert.equal(r.conflicts.length,0);}
});

test('同一数据库的两个浏览器同步会话只允许一个发送者，编辑仍可入队',async t=>{
 const c=cloud(),a=await device(t);await run(a,c);await a.edit(s=>s.notes.push(note('n','first')));let unblock,started;const barrier=new Promise(r=>started=r),wait=new Promise(r=>unblock=r);let stopped=false;c.setHook(async i=>{if(i.method==='GET'&&!stopped){stopped=true;started();await wait;}return null;});
 const first=run(a,c);await barrier;const second=await run(a,c);assert.equal(second.busy,true);await a.edit(s=>s.notes.push(note('during','queued while syncing')));unblock();await first;c.setHook(null);await converge([a],c);assert.equal(a.state().notes.length,2);assert.equal(a.call({action:'outbox'}).entries.length,0);
});
test('切换到新云目录完整携带当前记录、删除标记和待同步内容',async t=>{
 const old=cloud(),next=cloud(),a=await device(t),b=await device(t);await a.edit(s=>s.notes.push(note('keep','before'),note('delete','remove')));await run(a,old);await a.edit(s=>{s.notes=s.notes.filter(n=>n.id!=='delete');s.notes[0].body='after';});await run(a,next,{scope:'new-folder'});await run(b,next,{scope:'new-folder'});assert.equal(b.state().notes.length,1);assert.equal(b.state().notes[0].body,'after');assert.ok(b.call({action:'inspect',keys:[entityKey('notes','delete')]}).rows[0].deleted);
});

test('窗口未见到远端字段更新时保存草稿，保留并发版本而不假装已经观察到',async t=>{
 const c=cloud(),a=await device(t),b=await device(t);await a.edit(s=>s.notes.push(note('n','base')));await converge([a,b],c);const seen=a.call({action:'inspect',keys:[]}).meta.vector;await b.edit(s=>s.notes[0].body='remote');await run(b,c);await run(a,c);await editReplica(a.call,[{key:entityKey('notes','n'),values:{body:'draft'}}],null,{context:seen});await converge([a,b],c);const values=a.call({action:'conflicts'})[0].values.map(v=>v.value);assert.ok(values.includes('draft')&&values.includes('remote'));
});

test('嵌套任务跨设备新增、修改和删除后可达，不因父级变化丢失记录',async t=>{
 const c=cloud(),a=await device(t),b=await device(t);const seed=seedState('2026-10-19');await a.edit(s=>s.tasks=[seed.tasks[0]]);await converge([a,b],c);await a.edit(s=>s.tasks[0].notes='电脑修改父任务备注');await b.edit(s=>s.tasks[0].subtasks.push({...seed.tasks[1],id:'child-new',subtasks:[]}));await converge([a,b],c);assert.equal(a.state().tasks[0].subtasks[0].id,'child-new');assert.equal(a.state().tasks[0].notes,'电脑修改父任务备注');
 await a.edit(s=>s.tasks=[]);await b.edit(s=>s.tasks[0].subtasks.push({...seed.tasks[2],id:'child-offline',subtasks:[]}));await converge([a,b],c);assert.equal(a.state().tasks.length,1);assert.equal(a.state().tasks[0].id,'child-offline');assert.deepEqual(a.state(),b.state());
});
test('快照期间仅租约元数据变化不妨碍发布，业务记录变化会阻止混合快照',async t=>{
 const c=cloud(),a=await device(t);await a.edit(s=>s.notes.push(note('n','snapshot')));let touched=false;c.setHook(async i=>{if(i.method==='PUT'&&i.path.startsWith('v2/s-')&&!touched){touched=true;const {meta}=a.call({action:'inspect',keys:[]});a.call({action:'commit',expected:meta.revision,meta:{...meta,lease:{...meta.lease,until:meta.lease.until+5000}},rows:[],outbox:[]});}return null;});await run(a,c,{snapshots:true});assert.ok(JSON.parse(c.files.get('v2/manifest.json').body).snapshot);
});

test('坚果云父目录缺失返回 409，建集合后重读清单再安全初始化',async t=>{
 const c=cloud(),a=await device(t);let made=false;
 c.setHook(i=>{if(i.method==='MKCOL')made=true;if(i.method==='GET'&&i.path==='v2/manifest.json'&&!made)return {status:409};return null;});
 await a.edit(s=>s.notes.push(note('new-cloud','first synchronization')));await run(a,c);
 assert.ok(made);assert.ok(c.files.has('v2/manifest.json'));assert.equal(a.call({action:'outbox'}).entries.length,0);
 assert.equal(c.calls.filter(i=>i.method==='GET'&&i.path==='v2/manifest.json').length>=3,true);
});
test('创建集合后清单仍为 409 时停止，不覆盖已有云端状态',async t=>{
 const c=cloud(),a=await device(t);c.setHook(i=>i.method==='GET'&&i.path==='v2/manifest.json'?{status:409}:null);
 await a.edit(s=>s.notes.push(note('pending','keep local')));await assert.rejects(run(a,c));
 assert.equal(c.calls.some(i=>i.method==='PUT'),false);assert.equal(a.call({action:'outbox'}).entries.length,1);
});
