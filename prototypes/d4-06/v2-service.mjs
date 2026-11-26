// Candidate service over the unchanged V2 model. No default storage, HTTP client,
// seed, global account, timer, native bridge or synchronization is started here.
import {normalizeState,dayKey,moveTask,isEntityId} from '../../src/model.mjs';
import {findTaskEntry,flattenTasks} from '../../src/task-tree.mjs';
import {saveTaskRecord,quickSubtask} from '../../src/task-editor.mjs';
import {setTaskDone} from '../../src/schedule.mjs';
import {validateSchedule} from '../../src/personal-ui.mjs';

const ports=new WeakSet();
const clone=value=>structuredClone(value);
const allowed={
 state:new Set(['version','settings','tasks','notes','projects','tags','places']),
 task:new Set(['id','order','title','quadrant','done','start','end','allDay','repeat','reminder','reminderAt','seriesId','generatedFrom','review','weight','project','place','tags','notes','subtasks','createdAt','completedAt']),
 note:new Set(['id','body','createdAt']),project:new Set(['id','name','description','archived']),
 settings:new Set(['swipeMenu','swipeComplete','longPressMs','undoMs']),
 repeat:new Set(['frequency','interval','weekdays','until','anchor']),reminder:new Set(['mode','minutes','days','at'])
};
const taskEditable=new Set(['title','quadrant','start','end','allDay','repeat','reminder','weight','review','project','place','tags','notes']);
function fields(value,keys,where){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(where+' must be an object');
 for(const key of Object.keys(value))if(!keys.has(key))throw Error('V2 model admission required: '+where+'.'+key);
}
function existingState(input){
 fields(input,allowed.state,'state');if(input.version!==2)throw Error('Only existing V2 storage is admitted; migration is not enabled');
 fields(input.settings||{},allowed.settings,'settings');
 let count=0;const seen=new WeakSet();
 function tasks(rows,depth=0){
  if(!Array.isArray(rows)||(rows.length&&depth>64))throw Error('Invalid V2 task tree');
  for(const row of rows){fields(row,allowed.task,'task');if(++count>100000||seen.has(row))throw Error('Invalid V2 task tree');seen.add(row);if(row.repeat)fields(row.repeat,allowed.repeat,'repeat');if(row.reminder)fields(row.reminder,allowed.reminder,'reminder');tasks(row.subtasks||[],depth+1);}
 }
 tasks(input.tasks);for(const row of input.notes||[])fields(row,allowed.note,'note');for(const row of input.projects||[])fields(row,allowed.project,'project');
 return normalizeState(clone(input));
}

export const V2_CAPABILITIES=Object.freeze({
 modelVersion:2,entities:Object.freeze(['tasks','notes','projects','tags','places']),
 unsupported:Object.freeze(['workItems','projectMeta','taskLinks','templates','processes','processInstances','contacts','attachments','pomodoro','feedback']),
 productionAdmission:false,remoteSync:false,automaticConnection:false
});

// The caller must supply a storage implementation already bound to a dedicated
// synthetic account/directory. This declaration is auditable scope, not a way to
// turn a real-user database into a safe fixture. Production remains refused.
export function bindExistingV2Storage({readState,writeState}={},admission={}){
 if(admission.scope!=='isolated-synthetic'||typeof admission.storageId!=='string'||!admission.storageId.trim())throw Error('An explicit isolated synthetic storage identity is required; production admission is blocked');
 if(typeof readState!=='function'||typeof writeState!=='function')throw Error('Explicit existing readState/writeState functions are required');
 const port=Object.freeze({identity:Object.freeze({scope:admission.scope,storageId:admission.storageId}),
  async readState(){return existingState(await readState());},
  async writeState(state){return existingState(await writeState(existingState(state)));}
 });ports.add(port);return port;
}

export function createV2Service({storage,clock=()=>new Date().toISOString(),idFactory=()=>globalThis.crypto.randomUUID()}={}){
 if(!ports.has(storage))throw Error('An explicitly bound existing V2 storage port is required');
 let queue=Promise.resolve();
 const enqueue=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const stamp=()=>{const value=clock();if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('Invalid operation clock');return value;};
 function freshId(state){const value=idFactory();if(!isEntityId(value)||flattenTasks(state.tasks).some(t=>t.id===value)||state.notes.some(n=>n.id===value)||state.projects.some(p=>p.id===value))throw Error('Invalid or duplicate V2 entity ID');return value;}
 function required(state,id){const entry=findTaskEntry(state.tasks,id);if(!entry)throw Error('Task not found');return entry;}
 function edit(change){return enqueue(async()=>{const next=await storage.readState();change(next);return storage.writeState(existingState(next));});}
 function validate(task){if(typeof task.title!=='string'||!task.title.trim()||task.title.trim().length>2000)throw Error('Task title must contain 1–2000 characters');task.title=task.title.trim();if(task.start&&task.end&&task.end<task.start)throw Error('Task end precedes start');validateSchedule(task);}
 function catalogs(state,task){state.tags=[...new Set([...state.tags,...task.tags])];if(task.place&&!state.places.includes(task.place))state.places.push(task.place);if(task.project&&!state.projects.some(p=>p.name===task.project))state.projects.push({id:freshId(state),name:task.project,description:'',archived:false});}
 return Object.freeze({
  capabilities:V2_CAPABILITIES,storageIdentity:storage.identity,
  read:()=>enqueue(()=>storage.readState()),
  createTask(patch={},parentId=null){fields(patch,taskEditable,'task patch');const captured=clone(patch);return edit(state=>{const parent=parentId?required(state,parentId).task:null,at=stamp(),task={id:freshId(state),title:'',order:0,quadrant:parent?.quadrant??0,done:false,start:dayKey(new Date(at))+'T09:00',end:'',allDay:false,repeat:null,reminder:null,weight:0,review:'',project:parent?.project||'',place:parent?.place||'',tags:[...(parent?.tags||[])],notes:'',subtasks:[],createdAt:at,completedAt:'',...captured};validate(task);saveTaskRecord(state,task,null,parentId);catalogs(state,task);});},
  editTask(id,patch,base=null){fields(patch,taskEditable,'task patch');const captured=clone(patch),baseline=base===null?null:clone(base);if(baseline){fields(baseline,allowed.task,'task baseline');if(baseline.id!==id)throw Error('Editor baseline ID mismatch');}return edit(state=>{const current=required(state,id).task,updated={...clone(baseline||current),...captured};validate(updated);const saved=saveTaskRecord(state,updated,baseline);catalogs(state,saved);});},
  addSubtask(parentId,title){return edit(state=>{const parent=required(state,parentId).task;parent.subtasks.push(quickSubtask(parent,title,freshId(state),stamp()));});},
  setTaskDone(id,done=true){if(typeof done!=='boolean')throw Error('Completion must be boolean');return edit(state=>{required(state,id);setTaskDone(state,id,done,stamp());});},
  moveTask(id,quadrant,beforeId=null){return edit(state=>{if(required(state,id).parent)throw Error('Use the existing child ordering contract for subtasks');moveTask(state.tasks,id,quadrant,beforeId);});},
  createNote(body){if(typeof body!=='string'||!body.trim()||body.length>50000)throw Error('Note body must contain 1–50000 characters');return edit(state=>{state.notes.push({id:freshId(state),body,createdAt:stamp()});});},
  editNote(id,body){if(typeof body!=='string'||!body.trim()||body.length>50000)throw Error('Note body must contain 1–50000 characters');return edit(state=>{const note=state.notes.find(n=>n.id===id);if(!note)throw Error('Note not found');note.body=body;});},
  createProject(input){fields(input,new Set(['name','description']),'project input');const captured=clone(input);if(typeof captured.name!=='string'||!captured.name.trim()||captured.name.trim().length>100)throw Error('Project name must contain 1–100 characters');if(captured.description!==undefined&&(typeof captured.description!=='string'||captured.description.length>10000))throw Error('Invalid project description');return edit(state=>{const name=captured.name.trim();if(state.projects.some(p=>p.name===name))throw Error('Project name already exists');state.projects.push({id:freshId(state),name,description:captured.description||'',archived:false});});},
  unsupported(entity){throw Error('V2 model admission required for '+String(entity)+'; no writes performed');}
 });
}
