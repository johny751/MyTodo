import {rekeyDescendants} from './task-tree.mjs';
import {normalizeState} from './model.mjs';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=v=>v===undefined?undefined:structuredClone(v);
export const emptyState=()=>normalizeState({version:1,tasks:[],notes:[],projects:[],tags:[],places:[]});
function hash(value){let a=2166136261,b=5381;for(const c of JSON.stringify(value)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(36)+(b>>>0).toString(36);}
function mergeValue(base,local,remote,flags){
 if(eq(local,remote))return copy(local);if(eq(base,local))return copy(remote);if(eq(base,remote))return copy(local);
 if(local===undefined||remote===undefined){flags.conflict=true;return copy(local??remote);}
 if(Array.isArray(local)&&Array.isArray(remote)){
  if([...local,...remote,...(base||[])].every(v=>typeof v==='string')){const b=base||[];return [...new Set([...local,...remote])].filter(v=>!b.includes(v)||local.includes(v)&&remote.includes(v));}
  if([...local,...remote,...(base||[])].every(v=>v&&typeof v.id==='string')){return [...new Set([...local,...remote].map(v=>v.id))].map(id=>mergeValue(base?.find(v=>v.id===id),local.find(v=>v.id===id),remote.find(v=>v.id===id),flags)).filter(Boolean);}
 }
 if(local&&remote&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){
  const result={};for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){const v=key==='completedAt'&&local[key]&&remote[key]?[local[key],remote[key]].sort().at(-1):(key==='reminderAt'||key==='order'&&!eq(base?.[key],local[key])&&!eq(base?.[key],remote[key]))?copy(local[key]??remote[key]):mergeValue(base?.[key],local[key],remote[key],flags);if(v!==undefined)result[key]=v;}return result;
 }
 flags.conflict=true;return copy(local);
}
export function mergeStates(base,local,remote){
 const b=normalizeState(base||emptyState()),l=normalizeState(local),r=normalizeState(remote),result=copy(l),conflicts=[];
 for(const key of ['tasks','notes','projects']){
  const merged=[];for(const id of new Set([...b[key],...l[key],...r[key]].map(x=>x.id))){const before=b[key].find(x=>x.id===id),mine=l[key].find(x=>x.id===id),theirs=r[key].find(x=>x.id===id),flags={conflict:false};const value=mergeValue(before,mine,theirs,flags);if(value)merged.push(value);
   if(flags.conflict){conflicts.push({type:key,id,title:value?.title||value?.name||'内容'});if(mine&&theirs&&!eq(value,theirs)){const other=copy(theirs);other.id='conflict-'+hash([key,id,theirs]);if(key==='tasks'){other.title='[同步冲突副本] '+other.title;rekeyDescendants(other,(_,i)=>other.id+'-sub-'+i);}if(key==='notes')other.body='[同步冲突副本]\n'+other.body;if(key==='projects')other.name='[同步冲突副本] '+other.name;if(!l[key].some(x=>x.id===other.id)&&!r[key].some(x=>x.id===other.id))merged.push(other);}}
  }result[key]=merged;
 }
 for(const key of ['tags','places'])result[key]=mergeValue(b[key],l[key],r[key],{});
 // Interaction preferences belong to the device, so phone and desktop can differ.
 result.settings=l.settings;return {state:normalizeState(result),conflicts};
}
export function decodeRemote(text){const value=JSON.parse(text);if(value.format!=='gxtodo-sync'||value.version!==1)throw new Error('云端文件不是受支持的待办同步文件，未作覆盖');const normalized=normalizeState(value.state);if(normalized.tasks.length!==value.state.tasks.length||normalized.notes.length!==value.state.notes.length||normalized.projects.length!==value.state.projects.length)throw new Error('云端条目超出容量，未作覆盖');return normalized;}
export const encodeRemote=state=>JSON.stringify({format:'gxtodo-sync',version:1,state:normalizeState(state)});
// Transport uses conditional writes. A stale ETag always causes a fresh merge.
export async function syncExchange({local,base,request,maxAttempts=3}){
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const response=await request({method:'GET'});if(response.status!==200&&response.status!==404)throw new Error(syncError(response.status));
  const remote=response.status===404?emptyState():decodeRemote(response.body);if(response.status===200&&(!response.etag||response.etag.startsWith('W/')))throw new Error('云端未返回可用于并发保护的 ETag，本次未上传');
  const merged=mergeStates(base,local,remote);const write=await request({method:'PUT',body:encodeRemote(merged.state),etag:response.status===404?null:response.etag});
  if([409,412].includes(write.status))continue;if(![200,201,204].includes(write.status))throw new Error(syncError(write.status));return merged;
 }throw new Error('其他设备正在同步，请稍后重试；本地改动已保留');
}
export function syncError(status){return ({401:'坚果云账号或应用密码不正确',403:'坚果云拒绝访问，请检查应用密码及目录权限',404:'同步目录不存在',429:'坚果云请求过于频繁，请稍后重试',507:'坚果云空间不足'})[status]||('同步失败（HTTP '+status+'），本地数据已保留');}
