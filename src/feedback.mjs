export const FEEDBACK_FORMAT='gxtodo.feedback';
export const FEEDBACK_VERSION=1;
export const FEEDBACK_KEY='gxtodo.feedback.v1';
export const FEEDBACK_BACKUP_KEY='gxtodo.feedback.before-import.v1';
const encode=value=>new TextEncoder().encode(value).byteLength;
const idDefault=()=>crypto.randomUUID();
const nextStamp=(now,after)=>new Date(Math.max(Date.parse(now),after?Date.parse(after)+1:-Infinity)).toISOString();
export async function withFeedbackWriteLock(operation,{locks=globalThis.navigator?.locks}={}){if(!locks?.request)throw Error('当前浏览器不支持安全保存意见，请使用最新版 Chrome 或 Edge');return locks.request('gxtodo.feedback.v1.write',operation);}
function timestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))throw Error('意见时间格式无效');
 const ms=Date.parse(value);if(!Number.isFinite(ms))throw Error('意见时间无效');
 const normalized=new Date(ms).toISOString();
 if(normalized!==(value.length===20?value.replace('Z','.000Z'):value))throw Error('意见时间无效');
 return normalized;
}
function text(value,max,bytes,label){
 if(typeof value!=='string'||Array.from(value).length>max||encode(value)>bytes)throw Error(label+'内容超出限制');
 return value;
}
export function normalizeIdea(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('意见记录无效');
 if(typeof value.id!=='string'||!value.id||value.id.length>128||!/^[A-Za-z0-9_.-]+$/.test(value.id))throw Error('意见编号无效');
 const title=text(value.title??'',200,800,'标题'),body=text(value.body??'',50000,200000,'正文');
 if(!title.trim()&&!body.trim())throw Error('请填写意见标题或内容');
 if(!['pending','resolved'].includes(value.status))throw Error('意见状态无效');
 return {id:value.id,title,body,status:value.status,createdAt:timestamp(value.createdAt),updatedAt:timestamp(value.updatedAt)};
}
export function normalizeFeedback(value){
 if(!value||value.format!==FEEDBACK_FORMAT||value.version!==FEEDBACK_VERSION||!Array.isArray(value.ideas)||value.ideas.length>10000)throw Error('请选择有效的优化意见 JSON 备份');
 const ideas=value.ideas.map(normalizeIdea),ids=new Set();for(const idea of ideas){if(ids.has(idea.id))throw Error('备份中存在重复意见编号');ids.add(idea.id);}
 return {format:FEEDBACK_FORMAT,version:FEEDBACK_VERSION,ideas};
}
export function parseFeedback(text){
 if(typeof text!=='string'||encode(text)>16*1024*1024)throw Error('意见备份最大为 16 MiB');
 let value;try{value=JSON.parse(text);}catch{throw Error('意见备份不是有效 JSON');}return normalizeFeedback(value);
}
const empty=()=>({format:FEEDBACK_FORMAT,version:FEEDBACK_VERSION,ideas:[]});
export function queryIdeas(ideas,query='',status='all'){
 const words=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 return ideas.filter(idea=>(status==='all'||idea.status===status)&&words.every(word=>(idea.title+'\n'+idea.body).normalize('NFKC').toLocaleLowerCase().includes(word)))
 .sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.id.localeCompare(b.id));
}
export function mergeFeedback(existing,incoming,{makeId=idDefault,now=()=>new Date().toISOString()}={}){
 const current=normalizeFeedback(existing),addition=normalizeFeedback(incoming),map=new Map(current.ideas.map(x=>[x.id,x]));let added=0,updated=0,conflicts=0;
 for(const idea of addition.ideas){
  const old=map.get(idea.id);
  if(!old){map.set(idea.id,idea);added++;continue;}
  if(Date.parse(idea.updatedAt)>Date.parse(old.updatedAt)){map.set(idea.id,idea);updated++;continue;}
  if(idea.updatedAt===old.updatedAt&&JSON.stringify(idea)!==JSON.stringify(old)){
   if([...map.values()].some(x=>x.title===idea.title&&x.body===idea.body&&x.status===idea.status&&x.createdAt===idea.createdAt))continue;
   let id;for(let i=0;i<100;i++){id=makeId();if(!map.has(id))break;if(i===99)throw Error('无法分配新的意见编号');}
   map.set(id,normalizeIdea({...idea,id,updatedAt:nextStamp(now(),idea.updatedAt)}));conflicts++;
  }
 }
 return {data:normalizeFeedback({...current,ideas:[...map.values()]}),added,updated,conflicts};
}
export class FeedbackStore{
 constructor(storage,{makeId=idDefault,now=()=>new Date().toISOString()}={}){this.storage=storage;this.makeId=makeId;this.now=now;}
 read(){const raw=this.storage.getItem(FEEDBACK_KEY);return raw===null?empty():parseFeedback(raw);}
 persist(data){const valid=normalizeFeedback(data);const json=JSON.stringify(valid);if(encode(json)>16*1024*1024)throw Error('意见存储最大为 16 MiB，请先导出备份整理');this.storage.setItem(FEEDBACK_KEY,json);return valid;}
 save(draft,base=null){
  const data=this.read(),old=data.ideas.find(x=>x.id===draft.id);
  if(draft.id&&!old)throw Error('这条意见已删除，当前内容仍保留在编辑器中');
  if(old&&base&&JSON.stringify(old)!==JSON.stringify(base))throw Error('这条意见已在其他窗口修改，请复制当前内容后重新打开');
  const stamp=nextStamp(this.now(),old?.updatedAt),body=String(draft.body??'').trim(),title=String(draft.title??'').trim()||Array.from(body.split('\n')[0]).slice(0,50).join('');
  const idea=normalizeIdea({id:old?.id||this.makeId(),title,body,status:draft.status||'pending',createdAt:old?.createdAt||stamp,updatedAt:stamp});
  if(old)data.ideas=data.ideas.map(x=>x.id===old.id?idea:x);else data.ideas.push(idea);
  this.persist(data);return idea;
 }
 remove(id,base=null){
  const data=this.read(),idea=data.ideas.find(x=>x.id===id);if(!idea)return false;
  if(base&&JSON.stringify(idea)!==JSON.stringify(base))throw Error('这条意见已在其他窗口修改，请重新打开');
  this.persist({...data,ideas:data.ideas.filter(x=>x.id!==id)});return true;
 }
 export(){return JSON.stringify(this.read(),null,2);}
 import(text){
  const incoming=parseFeedback(text),before=this.read(),result=mergeFeedback(before,incoming,{makeId:this.makeId,now:this.now});
  this.storage.setItem(FEEDBACK_BACKUP_KEY,JSON.stringify(before));
  this.persist(result.data);return result;
 }
 previousBackup(){const value=this.storage.getItem(FEEDBACK_BACKUP_KEY);if(value===null)throw Error('尚无导入前备份');return JSON.stringify(parseFeedback(value),null,2);}
}
