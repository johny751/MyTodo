import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRange,shiftDate,visibleTasks,seedState,normalizeState} from '../src/model.mjs';
test('周从星期一开始，正确跨越月末',()=>assert.deepEqual(dateRange('2026-11-01','week'),['2026-10-26','2026-11-01']));
test('月范围包含闰年二月，月切换不溢出',()=>{assert.deepEqual(dateRange('2024-02-19','month'),['2024-02-01','2024-02-29']);assert.equal(shiftDate('2026-01-31','month',1),'2026-02-28');assert.equal(shiftDate('2026-03-31','month',-1),'2026-02-28');});
test('待办保留逾期任务，未来任务按范围出现',()=>{const tasks=seedState('2026-10-16').tasks;tasks[0].start='2026-10-01T12:00';tasks[1].start='2026-10-17T12:00';assert.deepEqual(visibleTasks(tasks,{date:'2026-10-16'}).map(t=>t.id),['demo-task-0','demo-task-2','demo-task-3']);assert.equal(visibleTasks(tasks,{date:'2026-10-16',period:'week'}).length,4);});
test('完成筛选与分类搜索互相独立',()=>{const tasks=seedState('2026-10-16').tasks;tasks[1].done=true;assert.equal(visibleTasks(tasks,{date:'2026-10-16',status:'done',query:'学习'}).length,1);assert.equal(visibleTasks(tasks,{date:'2026-10-16',status:'pending',group:{type:'tag',name:'学习'}}).length,0);});
test('持久化格式可往返，重复 ID 不会破坏任务关系',()=>{const state=seedState('2026-10-16');assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))),state);state.tasks[1].id=state.tasks[0].id;assert.throws(()=>normalizeState(state),/重复 ID/);});
