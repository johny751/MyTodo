import test from 'node:test';
import assert from 'node:assert/strict';
import {completionDay,normalizeState,visibleTasks} from '../src/model.mjs';
import {setTaskDone} from '../src/schedule.mjs';
import {flattenTasks} from '../src/task-tree.mjs';

const day='2026-11-01';
const task=(id,fields={})=>({id,title:id,createdAt:'2026-10-01T00:00:00Z',...fields});
const stateWith=tasks=>normalizeState({version:2,tasks,notes:[],projects:[],tags:[],places:[]});
const completedIds=(tasks,options={})=>visibleTasks(tasks,{date:day,status:'done',completedOn:day,...options}).map(t=>t.id).sort();

test('实际完成日按北京时间处理 UTC 和带时区时间戳',()=>{
 assert.equal(completionDay('2026-10-31T15:59:59.999Z'),'2026-10-31');
 assert.equal(completionDay('2026-10-31T16:00:00.000Z'),day);
 assert.equal(completionDay('2026-11-01T23:30:00-07:00'),'2026-11-02');
 assert.equal(completionDay('2026-11-01T00:15'),day);
 assert.equal(completionDay(''), '');
 assert.equal(completionDay('invalid'), '');
});

test('完成操作写入的北京时间午夜边界决定当天结果，重新打开后移除',()=>{
 const state=stateWith([task('before-midnight'),task('after-midnight'),task('pending')]);
 setTaskDone(state,'before-midnight',true,'2026-10-31T15:59:59.999Z');
 setTaskDone(state,'after-midnight',true,'2026-10-31T16:00:00.000Z');
 assert.deepEqual(completedIds(state.tasks),['after-midnight']);
 setTaskDone(state,'after-midnight',false);
 assert.deepEqual(completedIds(state.tasks),[]);
 assert.equal(state.tasks[1].completedAt,'');
});

test('当天完成包括过去和未来安排的任务，排除当天安排但其他日完成的任务',()=>{
 const state=stateWith([
  task('old-schedule',{start:'2026-10-01T09:00'}),
  task('future-schedule',{start:'2026-12-01T09:00'}),
  task('unscheduled'),
  task('completed-yesterday',{start:day+'T09:00'}),
  task('no-completion-time',{start:day+'T10:00',done:true})
 ]);
 for(const id of ['old-schedule','future-schedule','unscheduled'])setTaskDone(state,id,true,'2026-11-01T02:00:00Z');
 setTaskDone(state,'completed-yesterday',true,'2026-10-31T02:00:00Z');
 assert.deepEqual(completedIds(state.tasks),['future-schedule','old-schedule','unscheduled']);
 assert.deepEqual(visibleTasks(state.tasks,{date:day,status:'done'}).map(t=>t.id).sort(),['completed-yesterday','no-completion-time','unscheduled']);
});

test('已过重复截止日的任务仍按实际完成日出现，未完成任务不混入',()=>{
 const state=stateWith([
  task('expired-repeat',{start:'2026-10-31T09:00',repeat:{frequency:'daily',until:'2026-10-31'}}),
  task('pending-with-stale-time',{completedAt:'2026-11-01T02:00:00Z'})
 ]);
 setTaskDone(state,'expired-repeat',true,'2026-11-01T02:00:00Z');
 assert.equal(state.tasks.length,2);
 assert.deepEqual(completedIds(state.tasks),['expired-repeat']);
 assert.deepEqual(visibleTasks(state.tasks,{date:day,status:'done'}),[]);
 assert.deepEqual(completedIds(state.tasks,{status:'all'}),['expired-repeat']);
});

test('时间轴展开每层子任务后按各自实际完成日筛选',()=>{
 const state=stateWith([task('parent',{start:day+'T09:00',subtasks:[
  task('child-yesterday',{subtasks:[task('grandchild-today',{start:'2026-12-01T09:00'})]}),
  task('sibling-today',{start:'2026-10-01T09:00'})
 ]})]);
 setTaskDone(state,'child-yesterday',true,'2026-10-31T02:00:00Z');
 setTaskDone(state,'grandchild-today',true,'2026-10-31T16:00:00Z');
 setTaskDone(state,'sibling-today',true,'2026-11-01T02:00:00Z');
 assert.deepEqual(completedIds(flattenTasks(state.tasks)),['grandchild-today','sibling-today']);
 assert.deepEqual(completedIds(state.tasks),[]);
});
