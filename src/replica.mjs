import {isEntityId,normalizeState,normalizeSettings} from './model.mjs';

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
export const isProtocolObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isActor = value => typeof value === 'string' && value.length >= 1 &&
  value.length <= 80 && !/[^a-zA-Z0-9-]/.test(value);
export const counterAt = (map,actor) => Object.hasOwn(map,actor) ? map[actor] : 0;
export const isCounter = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
export const isCounterMap = (value, limit = Infinity) => isProtocolObject(value) &&
  Object.keys(value).length <= limit &&
  Object.entries(value).every(([actor, count]) => isActor(actor) && isCounter(count));

const compareAscii = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const compare = (a,b) => a.clock-b.clock || compareAscii(a.actor,b.actor) || a.seq-b.seq;
const covered = (context,event) => counterAt(context ?? {},event.actor) >= event.seq;
const equalField = (a,b) => {
 if (a === b) return true;
 if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i)=>equalField(v,b[i]));
 if (!isProtocolObject(a) || !isProtocolObject(b)) return false;
 const keys = Object.keys(a);
 return keys.length === Object.keys(b).length && keys.every(key=>Object.hasOwn(b,key) && equalField(a[key],b[key]));
};
function compareFields(a,b) {
 const left = Array.from(a), right = Array.from(b);
 for (let i=0;i<Math.min(left.length,right.length);i++) {
  const difference = left[i].codePointAt(0)-right[i].codePointAt(0);
  if (difference) return difference;
 }
 return left.length-right.length;
}
export function validateEvent(event) {
 if (!isProtocolObject(event) || typeof event.key !== 'string') throw Error('无效的同步记录');
 const key = JSON.parse(event.key);
 if (!Array.isArray(key) || key.length !== 2 || !kinds.has(key[0]) || !isEntityId(key[1])) throw Error('无效的同步记录');
 if (!isActor(event.actor) || !isCounter(event.seq,1) || !isCounter(event.clock,1) ||
     !isCounterMap(event.context,256) || !isProtocolObject(event.values)) throw Error('同步变更格式错误');
 if (Object.keys(event.values).some(k=>k.includes('\0') || ['__proto__','constructor','prototype','subtasks'].includes(k))) throw Error('同步字段无效');
}
export function applyEvent(record,event){
 validateEvent(event);const result=clone(record||{key:event.key,events:[]});if(result.key!==event.key)throw Error('同步记录不匹配');
 const incoming=clone(event);delete incoming.key;
 const duplicate=result.events.find(e=>e.actor===event.actor&&e.seq===event.seq);
 if(duplicate){for(const [field,value] of Object.entries(duplicate.values))if(Object.hasOwn(event.values,field)&&!equalField(value,event.values[field]))throw Error('设备标识重复或变更文件被修改');result.events.sort(compare);return result;}
 for(const old of result.events){for(const field of Object.keys(incoming.values)){if(!Object.hasOwn(old.values,field))continue;if(covered(old.context,incoming))delete incoming.values[field];else if(covered(incoming.context,old))delete old.values[field];}}
 result.events=result.events.filter(e=>Object.keys(e.values).length);if(Object.keys(incoming.values).length)result.events.push(incoming);result.events.sort(compare);return result;
}
export function rowFromRecord(record){
 const fields = new Map();
 for (const event of [...record.events].sort(compare)) {
  for (const [field,value] of Object.entries(event.values)) {
   if (!fields.has(field)) fields.set(field,[]);
   fields.get(field).push({value,device:event.actor});
  }
 }
 const data = {}, conflicts = [];
 let deleted = false;
 for (const field of [...fields.keys()].sort(compareFields)) {
  const values = fields.get(field);
  if (field === '_deleted') deleted = values.some(item=>item.value === true);
  else Object.defineProperty(data,field,{value:clone(values.at(-1).value),enumerable:true,writable:true,configurable:true});
  const choices = values.filter((item,index)=>values.findIndex(other=>equalField(item.value,other.value)) === index);
  if (choices.length > 1) conflicts.push({key:record.key,field,values:choices});
 }
 const [kind,id] = JSON.parse(record.key);
 data.id = id;
 const title = [data.title,data.name,data.body].find(value=>typeof value === 'string' && value.length > 0) ?? id;
 for (const conflict of conflicts) conflict.title = title;
 return {key:record.key,kind,id,data,record,deleted,conflicts};
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
 if(context !== null && !isCounterMap(context,256))throw Error('同步上下文无效');
 for(let attempt=0;attempt<8;attempt++){
  const snapshot=await call({action:'inspect',keys:changes.map(c=>c.key)}),meta=clone(snapshot.meta),records=new Map(snapshot.rows.map(r=>[r.key,r.record])),outbox=[];
  for(const change of changes){
   if(!isCounter(meta.seq)||!isCounter(meta.clock)||!isCounter(meta.queue)||
      Math.max(meta.seq,meta.clock,meta.queue)>=Number.MAX_SAFE_INTEGER)throw Error('本地同步计数已达上限，改动尚未保存');
   const event={...clone(change),actor:meta.actor,seq:++meta.seq,clock:++meta.clock,context:{...clone(context||meta.vector),[meta.actor]:meta.seq-1}};meta.vector[meta.actor]=meta.seq;records.set(event.key,applyEvent(records.get(event.key),event));outbox.push({id:++meta.queue,event});}
  if(settings)meta.settings=clone(settings);
  const result=await call({action:'commit',expected:snapshot.meta.revision,meta,rows:[...records.values()].map(rowFromRecord),outbox});if(result.ok)return result;
 }
 throw Error('其他窗口正在保存，请稍后重试；此次修改尚未保存');
}
export async function applyRemote(call,events,update=()=>{},cursor=null){
 if(!Array.isArray(events))throw Error('同步批次缺少事件数组');
 if(cursor !== null && (!isActor(cursor.device) || !isCounter(cursor.index,1)))throw Error('同步批次游标无效');
 for (const event of events) validateEvent(event);
 for(let attempt=0;attempt<12;attempt++){
  const snapshot=await call({action:'inspect',keys:[...new Set(events.map(e=>e.key))]}),meta=clone(snapshot.meta),records=new Map(snapshot.rows.map(r=>[r.key,r.record]));
  if(!isCounterMap(meta.cursors)||!isCounterMap(meta.vector)||!isCounter(meta.clock))throw Error('本地同步进度无效，待发送记录已保留');
  for(const event of events){records.set(event.key,applyEvent(records.get(event.key),event));meta.vector[event.actor]=Math.max(counterAt(meta.vector,event.actor),event.seq);for(const [actor,seq] of Object.entries(event.context))meta.vector[actor]=Math.max(counterAt(meta.vector,actor),seq);meta.clock=Math.max(meta.clock,event.clock);}
  if(cursor !== null)meta.cursors[cursor.device]=Math.max(counterAt(meta.cursors,cursor.device),cursor.index);
  update(meta);const result=await call({action:'commit',expected:snapshot.meta.revision,meta,rows:[...records.values()].map(rowFromRecord),outbox:[]});if(result.ok)return result;
 }
 throw Error('保存同步进度时发生并发修改，请重试');
}
export async function updateMeta(call,update,extras={}){
 for(let attempt=0;attempt<12;attempt++){const {meta}=await call({action:'inspect',keys:[]}),next=clone(meta);update(next);const result=await call({action:'commit',expected:meta.revision,meta:next,rows:[],outbox:[],...extras});if(result.ok)return next;}throw Error('同步状态繁忙，请重试');
}
