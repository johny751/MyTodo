import {normalizeState,normalizeSettings} from './model.mjs';

export const FORMAT='gxtodo-delta';
export const VERSION=2;
export const clone=v=>structuredClone(v);
export const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const entityKey=(kind,id)=>JSON.stringify([kind,id]);
const kinds=new Set(['tasks','notes','projects','tags','places']);
export function initialMeta(actor){return {version:2,revision:0,dataRevision:0,actor,seq:0,clock:0,queue:0,vector:{},cursors:{},initialized:false,scope:null,epoch:null,pending:null,settings:normalizeSettings()};}
export function flattenState(input,normalized=false){
 const state=normalized?input:normalizeState(input),items=new Map();
 const task=(t,parentId=null)=>{const {subtasks,...data}=t;items.set(entityKey('tasks',t.id),{...data,parentId});for(const child of subtasks)task(child,t.id);};
 for(const t of state.tasks)task(t);
 for(const kind of ['notes','projects'])for(const item of state[kind])items.set(entityKey(kind,item.id),clone(item));
 for(const kind of ['tags','places'])for(const name of state[kind])items.set(entityKey(kind,name),{id:name,name});
 return {items,settings:state.settings};
}
export function buildState(rows,settings){
 const state={version:2,settings,tasks:[],notes:[],projects:[],tags:[],places:[]},tasks=new Map();
 for(const row of rows){if(row.deleted)continue;const data=clone(row.data),kind=JSON.parse(row.key)[0];if(kind==='tasks')tasks.set(data.id,{...data,subtasks:[]});else if(kind==='tags'||kind==='places')state[kind].push(data.name);else state[kind].push(data);}
 // A concurrent reparent/delete must never hide a child or create a recursive tree.
 for(const task of tasks.values()){
  let parent=tasks.get(task.parentId),cursor=parent,seen=new Set([task.id]),depth=0;
  while(cursor){if(seen.has(cursor.id)||++depth>64){parent=null;break;}seen.add(cursor.id);cursor=tasks.get(cursor.parentId);}
  if(parent)parent.subtasks.push(task);else state.tasks.push(task);
 }
 for(const task of tasks.values())delete task.parentId;
 state.tasks.sort((a,b)=>(a.order||0)-(b.order||0)||a.id.localeCompare(b.id));
 state.notes.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));state.projects.sort((a,b)=>a.id.localeCompare(b.id));state.tags.sort();state.places.sort();
 return normalizeState(state);
}
export function diffState(before,after,normalized=false){
 const a=flattenState(before,normalized),b=flattenState(after,normalized),changes=[];
 for(const [key,data] of b.items){const prior=a.items.get(key),values={};for(const field of Object.keys(data))if(!prior||!equal(prior[field],data[field]))values[field]=clone(data[field]);if(!prior)values._deleted=false;if(Object.keys(values).length)changes.push({key,values});}
 for(const key of a.items.keys())if(!b.items.has(key))changes.push({key,values:{_deleted:true}});
 return {changes,settings:b.settings};
}
const covered=(context,event)=>(context[event.actor]||0)>=event.seq;
const compare=(a,b)=>a.clock-b.clock||a.actor.localeCompare(b.actor)||a.seq-b.seq;
export function validateEvent(event){
 const [kind,id]=JSON.parse(event.key);if(!kinds.has(kind)||typeof id!=='string'||!id||id.length>200)throw Error('无效的同步记录');
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(event.actor)||!Number.isSafeInteger(event.seq)||event.seq<1||!Number.isSafeInteger(event.clock)||event.clock<1||!event.context||Array.isArray(event.context)||typeof event.values!=='object'||!event.values||Array.isArray(event.values))throw Error('同步变更格式错误');
 for(const [actor,seq] of Object.entries(event.context))if(!/^[a-zA-Z0-9-]{1,80}$/.test(actor)||!Number.isSafeInteger(seq)||seq<0)throw Error('同步版本错误');
 if(Object.keys(event.context).length>256||Object.keys(event.values).some(k=>['__proto__','constructor','prototype','subtasks'].includes(k)))throw Error('同步字段无效');
}
export function applyEvent(record,event){
 validateEvent(event);const result=clone(record||{key:event.key,events:[]});if(result.key!==event.key)throw Error('同步记录不匹配');
 const incoming=clone(event);delete incoming.key;
 const duplicate=result.events.find(e=>e.actor===event.actor&&e.seq===event.seq);
 if(duplicate){for(const [field,value] of Object.entries(duplicate.values))if(field in event.values&&!equal(value,event.values[field]))throw Error('设备标识重复或变更文件被修改');return result;}
 for(const old of result.events){for(const field of Object.keys(incoming.values)){if(!(field in old.values))continue;if(covered(old.context,incoming))delete incoming.values[field];else if(covered(incoming.context,old))delete old.values[field];}}
 result.events=result.events.filter(e=>Object.keys(e.values).length);if(Object.keys(incoming.values).length)result.events.push(incoming);result.events.sort(compare);return result;
}
export function rowFromRecord(record){
 const fields=new Map();for(const event of record.events)for(const [field,value] of Object.entries(event.values)){if(!fields.has(field))fields.set(field,[]);fields.get(field).push({event,value});}
 const data={},conflicts=[];let deleted=false;
 for(const [field,values] of fields){values.sort((a,b)=>compare(a.event,b.event));const choices=values.filter((v,i)=>values.findIndex(x=>equal(v.value,x.value))===i);const winner=values.at(-1).value;
  if(field==='_deleted')deleted=values.some(v=>v.value===true);else data[field]=clone(winner);
  if(choices.length>1)conflicts.push({key:record.key,field,values:choices.map(v=>({value:v.value,device:v.event.actor})),title:data.title||data.name||data.body||JSON.parse(record.key)[1]});
 }
 const [kind,id]=JSON.parse(record.key);data.id=id;return {key:record.key,kind,id,data,record,deleted,conflicts};
}
export async function initializeReplica(call,state){
 for(let attempt=0;attempt<8;attempt++){
  const {meta}=await call({action:'inspect',keys:[]});if(meta.initialized)return;
  const next=clone(meta),rows=[],outbox=[];const flat=flattenState(state);next.settings=flat.settings;
  for(const [key,data] of flat.items){const event={key,actor:next.actor,seq:++next.seq,clock:++next.clock,context:{},values:{...data,_deleted:false}};next.vector[next.actor]=next.seq;rows.push(rowFromRecord(applyEvent(null,event)));outbox.push({id:++next.queue,event});}
  next.initialized=true;const saved=await call({action:'commit',expected:meta.revision,meta:next,rows,outbox});if(saved.ok)return;
 }
 throw Error('初始化期间数据发生变化，请重新打开');
}
export async function editReplica(call,changes,settings,{context=null}={}){
 for(let attempt=0;attempt<8;attempt++){
  const snapshot=await call({action:'inspect',keys:changes.map(c=>c.key)}),meta=clone(snapshot.meta),records=new Map(snapshot.rows.map(r=>[r.key,r.record])),outbox=[];
  for(const change of changes){const event={...clone(change),actor:meta.actor,seq:++meta.seq,clock:++meta.clock,context:{...clone(context||meta.vector),[meta.actor]:meta.seq-1}};meta.vector[meta.actor]=meta.seq;records.set(event.key,applyEvent(records.get(event.key),event));outbox.push({id:++meta.queue,event});}
  if(settings)meta.settings=clone(settings);
  const result=await call({action:'commit',expected:snapshot.meta.revision,meta,rows:[...records.values()].map(rowFromRecord),outbox});if(result.ok)return result;
 }
 throw Error('其他窗口正在保存，请稍后重试；此次修改尚未保存');
}
export async function applyRemote(call,events,update=()=>{}){
 for(let attempt=0;attempt<12;attempt++){
  const snapshot=await call({action:'inspect',keys:[...new Set(events.map(e=>e.key))]}),meta=clone(snapshot.meta),records=new Map(snapshot.rows.map(r=>[r.key,r.record]));
  for(const event of events){validateEvent(event);records.set(event.key,applyEvent(records.get(event.key),event));meta.vector[event.actor]=Math.max(meta.vector[event.actor]||0,event.seq);for(const [actor,seq] of Object.entries(event.context))meta.vector[actor]=Math.max(meta.vector[actor]||0,seq);meta.clock=Math.max(meta.clock,event.clock);}
  update(meta);const result=await call({action:'commit',expected:snapshot.meta.revision,meta,rows:[...records.values()].map(rowFromRecord),outbox:[]});if(result.ok)return result;
 }
 throw Error('保存同步进度时发生并发修改，请重试');
}
export async function updateMeta(call,update,extras={}){
 for(let attempt=0;attempt<12;attempt++){const {meta}=await call({action:'inspect',keys:[]}),next=clone(meta);update(next);const result=await call({action:'commit',expected:meta.revision,meta:next,rows:[],outbox:[],...extras});if(result.ok)return next;}throw Error('同步状态繁忙，请重试');
}
