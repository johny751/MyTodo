// Run only in the authorized Actions branch. Tests use in-memory synthetic state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepository,helpers,STORAGE_KEY,STORAGE_KIND} from '../../prototypes/d4-01/domain.mjs';
import {normalizeState,visibleTasks,searchAll} from '../../src/model.mjs';
import {nextOccurrence,reminderTime,setTaskDone} from '../../src/schedule.mjs';
import {findTaskEntry,flattenTasks} from '../../src/task-tree.mjs';
import {saveTaskRecord,quickSubtask} from '../../src/task-editor.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA)throw Error('D4 tests require the exact authorized Actions source/run');
const FIXED_NOW='2026-11-25T04:00:00.000Z';
const empty=()=>normalizeState({version:2,tasks:[],notes:[],projects:[],tags:[],places:[]});
const task=(id,extra={})=>({id,title:id,quadrant:0,done:false,start:'2026-11-25T10:00',end:'',tags:[],subtasks:[],createdAt:FIXED_NOW,...extra});
function repository(options={}){let serial=0;return createRepository({state:empty(),demo:{meetings:[]},storage:null,clock:()=>FIXED_NOW,idFactory:()=>`synthetic-${++serial}`,...options});}
function memoryStorage(initial={}){const map=new Map(Object.entries(initial)),reads=[],writes=[];return {map,reads,writes,getItem(key){reads.push(key);return map.get(key)??null;},setItem(key,value){writes.push(key);map.set(key,value);}};}

test('D4 actual baseline function identities and V2 namespace are retained',()=>{
 assert.equal(helpers.normalizeState,normalizeState);assert.equal(helpers.visibleTasks,visibleTasks);assert.equal(helpers.searchAll,searchAll);
 assert.equal(helpers.nextOccurrence,nextOccurrence);assert.equal(helpers.reminderTime,reminderTime);assert.equal(helpers.findTaskEntry,findTaskEntry);
 assert.equal(helpers.saveTaskRecord,saveTaskRecord);assert.equal(helpers.quickSubtask,quickSubtask);
 const r=repository({demo:{meetings:[{id:'mock',status:'planned',projectId:'mock-project'}]}});
 assert.equal(r.state.version,2);assert.equal(r.state.meetings,undefined);assert.equal(r.demo.meetings[0].projectId,'mock-project');
 const snapshot=r.state;snapshot.tasks.push(task('outside'));assert.equal(r.state.tasks.length,0);
});

test('D4 root and nested CRUD preserve containing arrays and inherited mature fields',()=>{
 const r=repository(),root=r.createTask({id:'root',title:'原任务',project:'产品计划',place:'办公室',tags:['设计'],quadrant:1});
 const child=r.addSubtask(root.id,{id:'child',title:'子任务'}),grand=r.addSubtask(child.id,'快速孙任务');
 assert.equal(child.project,'产品计划');assert.equal(child.place,'办公室');assert.deepEqual(child.tags,['设计']);assert.equal(child.quadrant,1);
 assert.equal(grand.start,'2026-11-25T12:00');
 r.updateTask(child.id,{title:'已编辑子任务',notes:'保留结构'});
 assert.equal(r.state.tasks.length,1);assert.equal(r.state.tasks[0].subtasks[0].title,'已编辑子任务');assert.equal(r.state.tasks[0].subtasks[0].subtasks[0].id,grand.id);
 r.deleteTask(child.id);assert.equal(r.getTask(grand.id),null);assert.equal(r.state.tasks[0].subtasks.length,0);
 r.deleteTask(root.id);assert.equal(r.state.tasks.length,0);assert.equal(r.state.projects[0].name,'产品计划');
});

test('D4 invalid schedule edits roll back the entire draft and its classifications',()=>{
 const r=repository(),before=r.state;
 assert.throws(()=>r.createTask({id:'bad',title:'失败草稿',project:'不应创建',start:'2026-11-25T10:00',repeat:{frequency:'weekly',weekdays:[],interval:1}}),/重复星期/);
 assert.deepEqual(r.state,before);
 r.createTask({id:'ok',title:'正确任务'});const accepted=r.state;
 assert.throws(()=>r.updateTask('ok',{start:'2026-11-25T11:00',end:'2026-11-25T10:00'}),/结束时间/);
 assert.deepEqual(r.state,accepted);assert.throws(()=>r.updateTask('ok',{title:'  '}),/1–2000/);
 assert.deepEqual(r.state,accepted);assert.throws(()=>r.createTask({id:'ok',title:'重复 ID'}),/重复/);
});

test('D4 completion delegates to mature repeat logic and resets/retimes descendants once',()=>{
 const r=repository();r.createTask({id:'daily',title:'每日检查',start:'2026-11-25T10:00',end:'2026-11-25T11:00',repeat:{frequency:'daily',interval:1},reminder:{mode:'offset',minutes:30},project:'产品计划'});
 r.addSubtask('daily',{id:'child',title:'复查',start:'2026-11-25T10:15',end:'2026-11-25T10:30',reminder:{mode:'custom',at:'2026-11-25T09:00'},review:'旧复盘'});
 r.setTaskDone('child',true);r.setTaskDone('daily',true);
 const next=r.state.tasks.find(t=>t.generatedFrom==='daily');
 assert.equal(r.getTask('daily').completedAt,FIXED_NOW);assert.equal(next.start,'2026-11-26T10:00');assert.equal(next.end,'2026-11-26T11:00');assert.equal(next.project,'产品计划');
 assert.notEqual(next.subtasks[0].id,'child');assert.equal(next.subtasks[0].done,false);assert.equal(next.subtasks[0].review,'');assert.equal(next.subtasks[0].start,'2026-11-26T10:15');assert.equal(next.subtasks[0].reminder.at,'2026-11-26T09:00');
 r.setTaskDone('daily',true);r.setTaskDone('daily',false);r.setTaskDone('daily',true);assert.equal(r.state.tasks.length,2);
});

test('D4 edit-done uses the mature next occurrence rather than bypassing it',()=>{
 const r=repository();r.createTask({id:'repeat-update',title:'更新完成',repeat:{frequency:'daily',interval:1}});
 r.updateTask('repeat-update',{done:true});assert.equal(r.state.tasks.length,2);
 const direct={...empty(),tasks:[task('expected',{repeat:{frequency:'daily',interval:1}})]};setTaskDone(direct,'expected',true,FIXED_NOW);
 assert.equal(r.state.tasks.find(t=>!t.done).start,direct.tasks.find(t=>!t.done).start);
});

test('D4 monthly repeats preserve January anchor through February and March',()=>{
 const r=repository();r.createTask({id:'month',title:'月末',start:'2026-01-31T16:00',repeat:{frequency:'monthly',interval:1,anchor:'2026-01-31T16:00'}});
 r.setTaskDone('month',true);const feb=r.state.tasks.find(t=>!t.done);assert.equal(feb.start,'2026-02-28T16:00');
 r.setTaskDone(feb.id,true);const mar=r.state.tasks.find(t=>!t.done);assert.equal(mar.start,'2026-03-31T16:00');assert.equal(mar.repeat.anchor,'2026-01-31T16:00');
});

test('D4 repeat capacity failure preserves the pending original state',()=>{
 const seed=empty();seed.tasks=[task('parent',{subtasks:Array.from({length:100},(_,i)=>task('child-'+i,i===0?{repeat:{frequency:'daily',interval:1}}:{}))})];
 const r=repository({state:seed}),before=r.state;assert.throws(()=>r.setTaskDone('child-0',true),/容量上限/);assert.deepEqual(r.state,before);
});

test('D4 reminder calculations use Shanghai rule semantics and completion disables reminder',()=>{
 const r=repository();r.createTask({id:'offset',title:'提前提醒',start:'2026-11-25T10:00',reminder:{mode:'offset',minutes:30}});
 assert.equal(r.reminderAt('offset'),Date.parse('2026-11-25T09:30:00+08:00'));
 r.createTask({id:'day',title:'日前提醒',reminder:{mode:'day',days:2}});assert.equal(r.reminderAt('day'),Date.parse('2026-11-23T09:00:00+08:00'));
 r.createTask({id:'custom',title:'独立提醒',start:'',reminder:{mode:'custom',at:'2026-11-25T14:20'}});assert.equal(r.reminderAt('custom'),Date.parse('2026-11-25T14:20:00+08:00'));
 r.setTaskDone('offset',true);assert.equal(r.reminderAt('offset'),null);assert.equal(r.getTask('offset').reminderAt,null);
});

test('D4 search/filter use mature NFKC AND search, nested content and name-based groups',()=>{
 const r=repository();r.createTask({id:'api',title:'API 评审',project:'产品',tags:['会议']});r.addSubtask('api',{id:'nested',title:'子任务',notes:'API 跟进'});r.createTask({id:'other',title:'其他任务',project:'生活'});
 assert.deepEqual(r.search('ＡＰＩ 会议').tasks.map(t=>t.id).sort(),['api','nested']);assert.equal(r.search('API 不存在').tasks.length,0);
 assert.equal(r.listTasks({allDates:true,status:'all',group:{type:'project',name:'产品'}}).length,1);
 assert.equal(r.listTasks({allDates:true,status:'all',includeSubtasks:true,group:{type:'project',name:'产品'}}).length,2);
 assert.equal(r.getTask('api').projectId,undefined);assert.equal(r.getTask('api').status,undefined);
});

test('D4 manual root and sibling moves reuse mature ordering without promoting children',()=>{
 const r=repository();for(const id of ['a','b','c'])r.createTask({id,title:id});
 r.moveTask('c',0,'a');assert.deepEqual(r.listTasks({allDates:true,sort:'manual'}).map(t=>t.id),['c','a','b']);
 const first=r.addSubtask('a','第一项'),second=r.addSubtask('a','第二项');r.moveSubtask('a',second.id,first.id);
 assert.deepEqual(r.getTask('a').subtasks.map(t=>t.id),[second.id,first.id]);assert.equal(r.state.tasks.length,3);assert.throws(()=>r.moveTask(first.id,1),/子任务/);
});

test('D4 persistence reads/writes only its isolated key and restores core plus mock data',()=>{
 const storage=memoryStorage({'gxtodo-local':'REAL-PROJECT-PLACEHOLDER-DO-NOT-READ'}),r=repository({storage});
 r.createTask({id:'persisted',title:'演示保存'});r.updateDemo(d=>{d.meetings.push({id:'mock-meeting',status:'planned'});});
 assert.deepEqual([...new Set(storage.reads)],[STORAGE_KEY]);assert.deepEqual([...new Set(storage.writes)],[STORAGE_KEY]);assert.equal(storage.map.get('gxtodo-local'),'REAL-PROJECT-PLACEHOLDER-DO-NOT-READ');
 const saved=JSON.parse(storage.map.get(STORAGE_KEY));assert.equal(saved.kind,STORAGE_KIND);const reopened=repository({storage});assert.equal(reopened.persistence().loaded,true);assert.equal(reopened.getTask('persisted').title,'演示保存');assert.equal(reopened.demo.meetings[0].id,'mock-meeting');
});

test('D4 file-style storage restriction and quota failures keep current edits in memory',()=>{
 const unavailable=repository({storage:{getItem(){throw Error('SecurityError');},setItem(){throw Error('must not write');}}});
 unavailable.createTask({id:'memory',title:'仍可演示'});assert.equal(unavailable.persistence().mode,'memory');assert.equal(unavailable.state.tasks.length,1);
 const quota=repository({storage:{getItem(){return null;},setItem(){throw Error('QuotaExceededError');}}});quota.createTask({id:'quota',title:'保留修改'});assert.equal(quota.getTask('quota').title,'保留修改');assert.equal(quota.persistence().mode,'memory');
});

test('D4 malformed/foreign demo record is preserved and never read as production state',()=>{
 for(const raw of ['{',JSON.stringify({kind:'foreign',version:1,state:empty()})]){
  const storage=memoryStorage({[STORAGE_KEY]:raw}),r=repository({storage});r.createTask({id:'fallback',title:'内存草稿'});
  assert.equal(r.persistence().mode,'memory');assert.equal(storage.map.get(STORAGE_KEY),raw);assert.equal(storage.writes.length,0);
 }
});

test('D4 batch core edits and independent mock updates keep V2 fields and observer snapshots',()=>{
 const r=repository(),events=[],stop=r.subscribe((s,e)=>{events.push(e.type);s.tasks.length=0;});r.createTask({id:'batch',title:'批量任务',project:'旧名称'});
 r.transaction(core=>{core.tasks[0].project='新名称';core.projects[0].name='新名称';});r.updateDemo({meetings:[{id:'m',projectId:'mock-project',status:'planned'}]});
 const replaced=r.state;replaced.notes.push({id:'note',body:'批量便签',createdAt:FIXED_NOW});r.replaceState(replaced);
 assert.equal(r.state.tasks[0].project,'新名称');assert.equal(r.getTask('batch').status,undefined);assert.equal(r.getTask('batch').projectId,undefined);assert.equal(r.demo.meetings.length,1);
 assert.deepEqual(events,['createTask','transaction','updateDemo','replaceState']);stop();r.replaceState(r.state,{preserveDemo:false});assert.deepEqual(r.demo,{meetings:[]});
 assert.throws(()=>r.transaction(core=>{core.tasks.push({...core.tasks[0]});}),/重复 ID/);assert.equal(flattenTasks(r.state.tasks).length,1);
});

test('D4 export/import boundary uses mature V2 normalization and refuses invalid state atomically',()=>{
 const r=repository();r.createTask({id:'roundtrip',title:'导出 e\u0301 😀',start:'2026-11-25T10:00',end:'2026-11-25T11:00',project:'项目名称',repeat:{frequency:'monthly',interval:1,anchor:'2026-11-25T10:00',until:'2027-03-25'},reminder:{mode:'custom',at:'2026-11-25T09:10'}});
 r.addSubtask('roundtrip',{id:'roundtrip-child',title:'子任务',notes:'逐字保留\n第二行'});r.updateDemo({meetings:[{id:'only-mock',status:'planned',projectId:'mock-project'}]});
 const snapshot=r.getState(),serialized=JSON.stringify(snapshot),mockBefore=r.getDemo();r.replaceState(JSON.parse(serialized));assert.deepEqual(r.state,snapshot);assert.deepEqual(r.demo,mockBefore);
 const old=JSON.parse(serialized);old.version=1;old.tasks[0].status='completed';old.tasks[0].projectId='foreign-id';old.tasks[0].reminderAt=0;
 r.replaceState(old);assert.equal(r.getTask('roundtrip').done,false);assert.equal(r.getTask('roundtrip').project,'项目名称');assert.equal(r.getTask('roundtrip').status,undefined);assert.equal(r.getTask('roundtrip').projectId,undefined);assert.equal(r.getTask('roundtrip').reminderAt,Date.parse('2026-11-25T09:10:00+08:00'));assert.equal(r.state.version,2);
 const accepted=r.state;assert.throws(()=>r.replaceState({...accepted,version:99}),/数据格式/);assert.deepEqual(r.state,accepted);assert.deepEqual(r.demo,mockBefore);
 const duplicate=structuredClone(accepted);duplicate.tasks.push(structuredClone(duplicate.tasks[0]));assert.throws(()=>r.replaceState(duplicate),/重复 ID/);assert.deepEqual(r.state,accepted);
});

test('D4 nested workspace batch persists one combined envelope and emits one event',()=>{
 const storage=memoryStorage(),r=repository({storage}),events=[];r.subscribe((_state,event)=>events.push(event.type));
 r.batch(()=>{
  r.createTask({id:'atomic',title:'原子工作区任务',project:'工作项目'});
  r.updateDemo(d=>{d.taskLinks={atomic:{projectId:'mock-project',workItemId:'mock-work'}};});
  r.batch(()=>{r.updateTask('atomic',{notes:'同批修改'});r.transaction(core=>{core.notes.push({id:'atomic-note',body:'同一封存',createdAt:FIXED_NOW});});});
 });
 assert.deepEqual(storage.writes,[STORAGE_KEY]);assert.deepEqual(events,['batch']);
 const sealed=JSON.parse(storage.map.get(STORAGE_KEY));assert.equal(sealed.state.tasks[0].notes,'同批修改');assert.equal(sealed.state.notes[0].id,'atomic-note');assert.equal(sealed.demo.taskLinks.atomic.workItemId,'mock-work');assert.equal(sealed.state.tasks[0].projectId,undefined);
});

test('D4 workspace batch rolls back core and mock, with no persistence/event, and rejects async',()=>{
 const seed=empty();seed.tasks=[task('original')];const storage=memoryStorage(),r=repository({state:seed,storage}),events=[];r.subscribe((_state,event)=>events.push(event.type));const beforeCore=r.state,beforeDemo=r.demo;
 assert.throws(()=>r.batch(()=>{r.updateTask('original',{title:'不应提交'});r.updateDemo({meetings:[{id:'uncommitted'}]});throw Error('workspace-primary');}),/workspace-primary/);
 assert.deepEqual(r.state,beforeCore);assert.deepEqual(r.demo,beforeDemo);assert.equal(storage.writes.length,0);assert.equal(events.length,0);
 let asyncEntered=false;assert.throws(()=>r.batch(async()=>{asyncEntered=true;r.deleteTask('original');}),/同步/);assert.equal(asyncEntered,false);
 assert.throws(()=>r.batch(()=>{r.updateDemo({meetings:[{id:'thenable'}]});return Promise.resolve();}),/Promise/);assert.deepEqual(r.state,beforeCore);assert.deepEqual(r.demo,beforeDemo);
 assert.throws(()=>r.batch(()=>{r.updateTask('original',{notes:'outer draft'});try{r.batch(()=>{r.updateDemo({meetings:[{id:'nested'}]});throw Error('nested-primary');});}catch{};}),/nested-primary/);
 assert.deepEqual(r.state,beforeCore);assert.deepEqual(r.demo,beforeDemo);assert.equal(storage.writes.length,0);assert.equal(events.length,0);
});
