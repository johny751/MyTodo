import {flattenTasks} from './task-tree.mjs';
import {normalizeRepeat,normalizeReminder,reminderTime} from './schedule.mjs';
export const QUADRANTS = ['很重要-很紧急', '重要-不紧急', '不重要-紧急', '不重要-不紧急'];
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
}
export function dateRange(key, period='day') {
  const [y,m,d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  const format = v => v.toISOString().slice(0,10);
  if (period === 'week') {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay()+6)%7);
    const end = new Date(date); end.setUTCDate(end.getUTCDate()+6);
    return [format(date),format(end)];
  }
  if (period === 'month') return [format(new Date(Date.UTC(y,m-1,1))),format(new Date(Date.UTC(y,m,0)))];
  return [key,key];
}
export function shiftDate(key, period, step) {
  const [y,m,d]=key.split('-').map(Number);
  if (period==='month') return new Date(Date.UTC(y,m-1+step,Math.min(d,new Date(Date.UTC(y,m+step,0)).getUTCDate()))).toISOString().slice(0,10);
  return new Date(Date.UTC(y,m-1,d+step*(period==='week'?7:1))).toISOString().slice(0,10);
}
export const DEFAULT_SETTINGS = Object.freeze({swipeMenu:true,swipeComplete:true,longPressMs:3000,undoMs:8000});
export function normalizeSettings(settings={}) { return {swipeMenu:typeof settings.swipeMenu==='boolean'?settings.swipeMenu:true,swipeComplete:typeof settings.swipeComplete==='boolean'?settings.swipeComplete:true,longPressMs:Math.min(10000,Math.max(300,Number(settings.longPressMs)||3000)),undoMs:Math.min(30000,Math.max(3000,Number(settings.undoMs)||8000))}; }
export function matchesQuery(query, ...fields) {const terms=String(query).normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);const haystack=fields.flat(Infinity).filter(v=>v!=null).join(' ').normalize('NFKC').toLocaleLowerCase();return terms.every(t=>haystack.includes(t));}
export function taskSearchText(t) {return [t.title,t.notes,t.project,t.place,t.tags,flattenTasks(t.subtasks||[]).map(s=>[s.title,s.notes,s.review,s.tags,s.project,s.place]),t.start,t.end,t.review,t.repeat?'重复':'',t.reminder?'提醒':'',t.done?'已完成':'未完成'];}
export function searchAll(state,query) { if(!query.trim())return {tasks:[],notes:[],projects:[],tags:[],places:[]}; return {tasks:visibleTasks(flattenTasks(state.tasks),{status:'all',allDates:true,query}),notes:state.notes.filter(n=>matchesQuery(query,n.body,n.createdAt)),projects:state.projects.filter(p=>matchesQuery(query,p.name,p.description)),tags:state.tags.filter(n=>matchesQuery(query,n)),places:state.places.filter(n=>matchesQuery(query,n))}; }
export function compareOrder(a,b){return (a.order??0)-(b.order??0)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);}
export function moveTask(tasks,id,quadrant,beforeId=null){
  if(!Number.isInteger(quadrant)||quadrant<0||quadrant>3)throw new Error('无效象限');
  const task=tasks.find(t=>t.id===id);if(!task)throw new Error('任务不存在');if(beforeId===id)return false;
  const oldQuadrant=task.quadrant;const target=tasks.filter(t=>t.quadrant===quadrant&&t.id!==id).sort(compareOrder);
  const index=beforeId==null?target.length:target.findIndex(t=>t.id===beforeId);if(index<0)throw new Error('排序目标不存在');
  const previous=tasks.filter(t=>t.quadrant===quadrant).sort(compareOrder).map(t=>t.id).join('|');
  target.splice(index,0,task);task.quadrant=quadrant;target.forEach((t,i)=>t.order=i*1024);
  if(oldQuadrant!==quadrant)tasks.filter(t=>t.quadrant===oldQuadrant).sort(compareOrder).forEach((t,i)=>t.order=i*1024);
  return oldQuadrant!==quadrant||previous!==target.map(t=>t.id).join('|');
}
export function completionDay(value){
 if(typeof value!=='string'||!value)return '';
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))return value.slice(0,10);
 const ms=Date.parse(value);return Number.isFinite(ms)?dayKey(new Date(ms)):'';
}
export function visibleTasks(tasks, options={}) {
  const {date=dayKey(),period='day',status='pending',query='',group=null,allDates=false,sort='time',completedOn=''}=options;
  const [start,end]=dateRange(date,period);
  const term=query.trim().toLowerCase();
  return tasks.filter(t=>{
    if(status==='pending' && t.done || status==='done' && !t.done) return false;
    if(completedOn&&(!t.done||completionDay(t.completedAt)!==completedOn))return false;
    if(!allDates && !completedOn && t.repeat?.until && t.repeat.until<start) return false;
    const scheduled=t.start?.slice(0,10);
    if(!allDates && !completedOn && scheduled && (scheduled>end || (scheduled<start && t.done))) return false;
    if(group && (group.type==='tag' ? !t.tags.includes(group.name) : t[group.type]!==group.name)) return false;
    if(term && !matchesQuery(term,taskSearchText(t))) return false;
    return true;
  }).sort((a,b)=>sort==='manual'?compareOrder(a,b):Number(a.done)-Number(b.done)||(a.start||'9999').localeCompare(b.start||'9999')||a.createdAt.localeCompare(b.createdAt));
}
const text=(value,max=10000)=>typeof value==='string'?value.slice(0,max):'';
const list=value=>Array.isArray(value)?value:[];
const stamp=value=>text(value,40);
export function normalizeState(input) {
  if(!input || ![1,2].includes(input.version) || !Array.isArray(input.tasks) || !Array.isArray(input.notes) || !Array.isArray(input.projects) || !Array.isArray(input.tags) || !Array.isArray(input.places)) throw new Error('数据格式不正确');
  const ids=new Set();
  const id=value=>{if(typeof value!=='string'||!value||value.length>100||ids.has(value))throw new Error('数据包含无效或重复 ID'); ids.add(value);return value;};
  let count=0;
  function task(t,index,parent=null,depth=0){
    if(!t||typeof t!=='object')throw new Error('任务格式不正确');
    if(++count>100000)throw new Error('任务和子任务总数超过 100,000 条，请先整理数据');
    if(depth>64)throw new Error('子任务嵌套超过 64 层，未保存此次修改');
    const children=list(t.subtasks);if(children.length>100)throw new Error('每条任务最多容纳 100 个直接子任务');
    const result={id:id(t.id),order:Number.isFinite(t.order)?t.order:index*1024,title:text(t.title,2000).trim(),quadrant:Math.max(0,Math.min(3,Math.trunc(Number(t.quadrant??parent?.quadrant)||0))),done:!!t.done,start:stamp(t.start),end:stamp(t.end),allDay:!!t.allDay,repeat:normalizeRepeat(t.repeat,stamp(t.start)),reminder:normalizeReminder(t.reminder),reminderAt:reminderTime(t),seriesId:text(t.seriesId,100),generatedFrom:text(t.generatedFrom,100),review:text(t.review,10000),weight:Math.min(100,Math.max(0,Number(t.weight)||0)),project:text(t.project??parent?.project,100),place:text(t.place??parent?.place,100),tags:[...new Set(list(t.tags??parent?.tags).map(v=>text(v,100)).filter(Boolean))].slice(0,30),notes:text(t.notes,50000),subtasks:[],createdAt:stamp(t.createdAt||parent?.createdAt),completedAt:stamp(t.completedAt)};
    result.subtasks=children.map((s,i)=>task(s,i,result,depth+1)).sort(compareOrder);return result;
  }
  return {version:2,settings:normalizeSettings(input.settings),
    tasks:input.tasks.map((t,i)=>task(t,i)),
    notes:input.notes.slice(0,10000).map(n=>({id:id(n.id),body:text(n.body,50000),createdAt:stamp(n.createdAt)})),
    projects:input.projects.slice(0,1000).map(p=>({id:id(p.id),name:text(p.name,100),description:text(p.description,10000),archived:!!p.archived})),
    tags:[...new Set(input.tags.map(x=>text(x,100).trim()).filter(Boolean))].slice(0,1000),
    places:[...new Set(input.places.map(x=>text(x,100).trim()).filter(Boolean))].slice(0,1000)
  };
}
export function seedState(today=dayKey()) {
  const now=new Date().toISOString();
  return normalizeState({version:1,settings:{...DEFAULT_SETTINGS},tasks:QUADRANTS.map((_,i)=>({id:'demo-task-'+i,order:i*1024,title:['整理今天的待办','规划下周的学习安排','确认本周日程','整理收藏资料'][i],quadrant:i,done:false,start:today+'T'+['17:00','20:00','15:00','21:00'][i],end:'',project:i===1?'个人计划':'',place:'',tags:i===1?['学习']:['日常'],notes:'这是一条本地演示任务。点击修改，或将它标记为完成。',subtasks:[],createdAt:now,completedAt:''})),notes:[{id:'demo-note',body:'欢迎使用本地版。\n在四象限里安排任务，也可以在这里随手记录想法。',createdAt:now}],projects:[{id:'demo-project',name:'个人计划',description:'学习与生活的长期计划',archived:false}],tags:['日常','学习'],places:['家里','办公室']});
}
