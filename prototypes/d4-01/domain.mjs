// D4 discussion prototype only. The mature modules below are copied baseline bytes.
// No production storage, replication entry, notification scheduler or network starts here.
import {QUADRANTS as matureQuadrants,dayKey as matureDayKey,dateRange,shiftDate,normalizeState,seedState,visibleTasks,searchAll,matchesQuery,moveTask as matureMoveTask,isEntityId} from '../../src/model.mjs';
import {setTaskDone as matureSetTaskDone,nextOccurrence as matureNextOccurrence,reminderTime,repeatLabel,reminderLabel,taskStats,parseTime,formatTime} from '../../src/schedule.mjs';
import {flattenTasks,findTaskEntry,findTask,moveSubtask as matureMoveSubtask} from '../../src/task-tree.mjs';
import {saveTaskRecord,quickSubtask} from '../../src/task-editor.mjs';
import {validateSchedule} from '../../src/personal-ui.mjs';

export const STORAGE_KEY='mytodo-d4-03-demo-v1';
export const STORAGE_KIND='mytodo-d4-03-synthetic-demo';
export const QUADRANTS=matureQuadrants;
export const helpers=Object.freeze({dayKey:matureDayKey,dateRange,shiftDate,normalizeState,visibleTasks,searchAll,matchesQuery,flattenTasks,findTaskEntry,parseTime,formatTime,nextOccurrence:matureNextOccurrence,reminderTime,repeatLabel,reminderLabel,taskStats,saveTaskRecord,quickSubtask,validateSchedule});

const clone=value=>structuredClone(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const editableFields=new Set(['title','quadrant','start','end','allDay','repeat','reminder','weight','review','project','place','tags','notes']);
function mockObject(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('演示扩展必须是对象');
 for(const key of Object.keys(value))if(['__proto__','prototype','constructor'].includes(key))throw new Error('无效的演示扩展字段');
 return JSON.parse(JSON.stringify(value));
}
function validateTask(task){
 if(!task.title.trim())throw new Error('请输入任务内容');
 if(task.start&&task.end&&task.end<task.start)throw new Error('结束时间不能早于开始时间');
 validateSchedule(task);
}

// Storage-like, a direct V2 seed, or {state,demo,storage,clock,idFactory}.
// clock is () => an ISO instant; start/end and reminder rules remain Asia/Shanghai strings.
export function createRepository(seedStorage=null){
 const options=seedStorage?.version&&Array.isArray(seedStorage.tasks)?{state:seedStorage}:
  seedStorage&&typeof seedStorage.getItem==='function'?{storage:seedStorage}:
  seedStorage&&typeof seedStorage==='object'?seedStorage:{};
 const clock=typeof options.clock==='function'?options.clock:()=>new Date().toISOString();
 const now=()=>{const value=String(clock());if(!Number.isFinite(Date.parse(value)))throw new Error('演示时钟必须返回有效 ISO 时间');return value;};
 let serial=0;
 const idFactory=typeof options.idFactory==='function'?options.idFactory:()=>{
  const uuid=globalThis.crypto?.randomUUID?.();
  return 'd4-demo-'+(uuid||Date.now().toString(36)+'-'+(++serial).toString(36)+'-'+Math.random().toString(36).slice(2,10));
 };
 const initialState=normalizeState(clone(options.state||seedState(matureDayKey(new Date(now())))));
 const initialDemo=mockObject(options.demo||{});
 let state=clone(initialState),demo=clone(initialDemo),storage=null;
 const persistenceInfo={key:STORAGE_KEY,mode:'memory',loaded:false,error:null};
 const listeners=new Set();
 let batchDepth=0,batchDirty=false,batchSnapshot=null,batchFailure=null;
 try{
  storage=own(options,'storage')?options.storage:globalThis.localStorage;
  if(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function'){
   persistenceInfo.mode='localStorage';const raw=storage.getItem(STORAGE_KEY);
   if(raw!==null&&raw!==undefined){
    const saved=JSON.parse(raw);
    if(saved.kind!==STORAGE_KIND||saved.version!==1)throw new Error('不支持的演示存储格式');
    state=normalizeState(saved.state);demo=mockObject(saved.demo||{});persistenceInfo.loaded=true;
   }
  }else storage=null;
 }catch(error){
  state=clone(initialState);demo=clone(initialDemo);storage=null;
  persistenceInfo.mode='memory';persistenceInfo.error=String(error.message||error);
 }
 function persist(){
  if(!storage)return;
  try{storage.setItem(STORAGE_KEY,JSON.stringify({kind:STORAGE_KIND,version:1,state,demo}));}
  catch(error){storage=null;persistenceInfo.mode='memory';persistenceInfo.error=String(error.message||error);}
 }
 function emit(type){for(const listener of listeners){try{listener(clone(state),{type,demo:clone(demo)});}catch{ /* An observer cannot undo an already accepted demo edit. */ }}}
 function publish(type){if(batchDepth){batchDirty=true;return;}persist();emit(type);}
 function protectedChange(action){try{return action();}catch(error){if(batchDepth&&!batchFailure)batchFailure=error;throw error;}}
 function syncCallback(fn){if(typeof fn!=='function'||Object.prototype.toString.call(fn)==='[object AsyncFunction]')throw new Error('工作区修改必须是同步函数');}
 function syncResult(value){if(value&&typeof value.then==='function')throw new Error('工作区修改不能返回 Promise/async 结果');return value;}
 function commit(mutator,type='transaction'){
  return protectedChange(()=>{const next=clone(state),value=syncResult(mutator(next)),normalized=normalizeState(next);
   state=normalized;publish(type);return value;});
 }
 function required(tasks,id){const entry=findTaskEntry(tasks,id);if(!entry)throw new Error('任务不存在');return entry;}
 function freshId(core,value){
  const id=value===undefined?idFactory():value;
  if(!isEntityId(id)||flattenTasks(core.tasks).some(t=>t.id===id)||core.notes.some(n=>n.id===id)||core.projects.some(p=>p.id===id))throw new Error('无效或重复的演示 ID');
  return id;
 }
 function classifications(core,task){
  core.tags=[...new Set([...core.tags,...(task.tags||[])])];
  if(task.place&&!core.places.includes(task.place))core.places.push(task.place);
  if(task.project&&!core.projects.some(p=>p.name===task.project))core.projects.push({id:freshId(core),name:task.project,description:'',archived:false});
 }
 function checkedSaved(core,id){const normalized=normalizeState(core),task=required(normalized.tasks,id).task;validateTask(task);return task;}
 function changedFields(base,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('任务修改必须是对象');
  const updated=clone(base);
  for(const [key,value] of Object.entries(patch)){
   if(editableFields.has(key))updated[key]=clone(value);
   else if(key==='done')continue;
   else if(!own(base,key)||JSON.stringify(base[key])!==JSON.stringify(value))throw new Error('请用专用接口修改任务结构或演示扩展：'+key);
  }
  if(typeof updated.title!=='string'||!updated.title.trim()||updated.title.trim().length>2000)throw new Error('任务内容请输入 1–2000 个字');
  updated.title=updated.title.trim();return updated;
 }
 function taskResult(id){return clone(findTask(state.tasks,id)||null);}
 const repository={
  get state(){return clone(state);},get demo(){return clone(demo);},
  getState:()=>clone(state),getDemo:()=>clone(demo),persistence:()=>({...persistenceInfo}),
  getTask:taskResult,
  listTasks(options={}){const {includeSubtasks=false,...filter}=options;return clone(visibleTasks(includeSubtasks?flattenTasks(state.tasks):state.tasks,{date:matureDayKey(new Date(now())),...filter}));},
  search(query){return clone(searchAll(state,String(query??'')));},
  stats(at=Date.parse(now())){return taskStats(flattenTasks(state.tasks),at);},
  reminderAt(id){return reminderTime(required(state.tasks,id).task);},
  nextOccurrence(id){return matureNextOccurrence(required(state.tasks,id).task);},
  createTask(fields={},parentId=null){
   let id;
   commit(core=>{
    const parent=parentId?required(core.tasks,parentId).task:null;
    id=freshId(core,fields.id);const stamp=now();
    const base={id,order:0,title:'',quadrant:parent?.quadrant??0,done:false,start:parent?.start||matureDayKey(new Date(stamp))+'T09:00',end:'',allDay:parent?.allDay||false,repeat:null,reminder:null,weight:0,review:'',project:parent?.project||'',place:parent?.place||'',tags:parent?[...parent.tags]:[],notes:'',subtasks:[],seriesId:'',generatedFrom:'',createdAt:stamp,completedAt:'',reminderAt:null};
    const patch={...fields};delete patch.id;
    const updated=changedFields(base,patch);
    saveTaskRecord(core,updated,null,parentId);classifications(core,updated);checkedSaved(core,id);
    if(own(fields,'done')&&fields.done===true)matureSetTaskDone(core,id,true,stamp);
   },'createTask');return taskResult(id);
  },
  addSubtask(parentId,fields){
   if(typeof fields!=='string')return repository.createTask(fields||{},parentId);
   let id;commit(core=>{const parent=required(core.tasks,parentId).task;id=freshId(core);const child=quickSubtask(parent,fields,id,now());parent.subtasks.push(child);checkedSaved(core,id);},'addSubtask');return taskResult(id);
  },
  updateTask(id,patch,base=null){
   commit(core=>{
    if(base!==null&&(!base||typeof base!=='object'||Array.isArray(base)||base.id!==id))throw new Error('任务编辑基线与任务 ID 不匹配');
    const task=required(core.tasks,id).task,wasDone=task.done,updated=changedFields(base===null?task:base,patch);
    // A captured editor base uses the frozen three-way save, including conflict
    // copies and the current containing array. Two-argument callers are unchanged.
    const saved=saveTaskRecord(core,updated,base===null?null:clone(base));classifications(core,saved);checkedSaved(core,id);
    if(own(patch,'done')&&typeof patch.done==='boolean'&&patch.done!==wasDone)matureSetTaskDone(core,id,patch.done,now());
   },'updateTask');return taskResult(id);
  },
  deleteTask(id){let removed;commit(core=>{const entry=required(core.tasks,id);removed=clone(entry.task);entry.siblings.splice(entry.siblings.indexOf(entry.task),1);},'deleteTask');return removed;},
  setTaskDone(id,done=true){if(typeof done!=='boolean')throw new Error('完成状态必须是布尔值');commit(core=>{required(core.tasks,id);matureSetTaskDone(core,id,done,now());},'setTaskDone');return taskResult(id);},
  moveTask(id,quadrant,beforeId=null){let moved;commit(core=>{const entry=required(core.tasks,id);if(entry.parent)throw new Error('子任务请使用同级排序接口');moved=matureMoveTask(core.tasks,id,quadrant,beforeId);},'moveTask');return moved;},
  moveSubtask(parentId,id,beforeId=null){let moved;commit(core=>{moved=matureMoveSubtask(core.tasks,parentId,id,beforeId);},'moveSubtask');return moved;},
  transaction(mutator){return protectedChange(()=>{syncCallback(mutator);commit(mutator,'transaction');return clone(state);});},
  replaceState(next,{preserveDemo=true}={}){return protectedChange(()=>{const normalized=normalizeState(clone(next));state=normalized;if(!preserveDemo)demo=clone(initialDemo);publish('replaceState');return clone(state);});},
  updateDemo(patchOrMutator){
   return protectedChange(()=>{const next=clone(demo);if(typeof patchOrMutator==='function')syncCallback(patchOrMutator);
    const result=syncResult(typeof patchOrMutator==='function'?patchOrMutator(next):Object.assign(next,mockObject(patchOrMutator)));
    demo=mockObject(result&&typeof result==='object'?result:next);publish('updateDemo');return clone(demo);});
  },
  reset(next=initialState){return protectedChange(()=>{state=normalizeState(clone(next));demo=clone(initialDemo);publish('reset');return clone(state);});},
  batch(fn){
   return protectedChange(()=>{
    syncCallback(fn);const outer=batchDepth===0;
    if(outer){batchSnapshot={state:clone(state),demo:clone(demo)};batchFailure=null;batchDirty=false;}
    batchDepth++;
    try{const result=syncResult(fn(repository));if(batchFailure)throw batchFailure;return result;}
    catch(error){if(!batchFailure)batchFailure=error;throw error;}
    finally{
     batchDepth--;
     if(outer){const failed=batchFailure,dirty=batchDirty,snapshot=batchSnapshot;batchSnapshot=null;batchFailure=null;batchDirty=false;
      if(failed){state=snapshot.state;demo=snapshot.demo;}else if(dirty){persist();emit('batch');}
     }
    }
   });
  },
  subscribe(listener){if(typeof listener!=='function')throw new Error('订阅需要函数');listeners.add(listener);return ()=>listeners.delete(listener);}
 };
 return repository;
}
