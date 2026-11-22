import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {quickSubtask,saveTaskRecord} from '../src/task-editor.mjs';
import {findTask} from '../src/task-tree.mjs';
import {emptyState,encodeRemote,decodeRemote} from '../src/sync-core.mjs';
import {normalizeState} from '../src/model.mjs';

const parentFixture=()=>({id:'parent',title:'未来主任务',quadrant:2,order:0,done:false,start:'2040-12-31T21:00',end:'2041-01-01T21:00',allDay:true,project:'项目甲',place:'办公室',tags:['标签甲'],subtasks:[],createdAt:'2026-10-01T00:00:00.000Z'});
test('添加子任务使用当前北京时间，脱离父任务的日期、全天和结束时间',()=>{
 const parent=parentFixture(),before=structuredClone(parent),instant='2026-11-13T05:47:29.321Z';
 const child=quickSubtask(parent,'处理一个小步骤','child',instant);
 assert.equal(child.start,'2026-11-13T13:47');assert.equal(child.createdAt,instant);
 assert.equal(child.end,'');assert.equal(child.allDay,false);assert.equal(child.done,false);
 assert.deepEqual([child.quadrant,child.project,child.place,child.tags],[2,'项目甲','办公室',['标签甲']]);
 child.tags.push('只属于子任务');assert.deepEqual(parent,before);
});
test('未安排日期的父任务也按真实添加时间创建子任务',()=>{
 const parent={...parentFixture(),start:'',end:'',allDay:false};
 assert.equal(quickSubtask(parent,'立即开始','child','2026-11-13T01:02:59Z').start,'2026-11-13T09:02');
});
test('北京时间跨日正确，时间显示按分钟且不受宿主时区影响',()=>{
 const parent=parentFixture();
 assert.equal(quickSubtask(parent,'午夜前','child-a','2026-11-13T15:59:59.999Z').start,'2026-11-13T23:59');
 assert.equal(quickSubtask(parent,'午夜后','child-b','2026-11-13T16:00:00.000Z').start,'2026-11-14T00:00');
});
test('嵌套子任务保存与同步往返保留各自添加时间，不改已有父子任务',()=>{
 const state=emptyState(),parent=parentFixture();state.tasks=[parent];
 const child=quickSubtask(parent,'第一层','child','2026-11-13T08:15:00Z');saveTaskRecord(state,child,null,parent.id);
 const grandchild=quickSubtask(child,'第二层','grandchild','2026-11-13T16:10:00Z');saveTaskRecord(state,grandchild,null,child.id);
 const saved=decodeRemote(encodeRemote(normalizeState(state)));
 assert.equal(findTask(saved.tasks,'parent').start,'2040-12-31T21:00');
 assert.equal(findTask(saved.tasks,'child').start,'2026-11-13T16:15');
 assert.equal(findTask(saved.tasks,'grandchild').start,'2026-11-14T00:10');
 assert.equal(findTask(saved.tasks,'grandchild').allDay,false);
});
test('保存父任务跨日或延迟时，实际添加入口仍使用点击时捕获的时间',async()=>{
 const source=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function addQuickSubtask('),end=source.indexOf('\nfunction conflictsModal()',start);
 assert.ok(start>=0&&end>start);const productionFunction=source.slice(start,end);
 let instant='2026-11-13T15:59:59.999Z';const clicked=instant,parent=parentFixture();
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[instant]));}}
 const context={Date:ClockDate,ui:{quickTitle:'添加时的任务',editor:{id:parent.id}},captureDraft(){},findTask,quickSubtask,uid:()=> 'child-after-delay',
  async saveTask(){instant='2026-11-13T16:02:00.000Z';return true;},
  async commit(apply){apply({tasks:[parent]});return true;},refreshEditor(){},render(){},$:()=>null};
 await vm.runInNewContext('let quickAdding=false;'+productionFunction+';addQuickSubtask(false)',context,{timeout:3000});
 assert.equal(parent.subtasks[0].createdAt,clicked);assert.equal(parent.subtasks[0].start,'2026-11-13T23:59');
 assert.equal(parent.start,'2040-12-31T21:00');
});
