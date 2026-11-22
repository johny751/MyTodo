import test from 'node:test';
import assert from 'node:assert/strict';
import {readState,writeState} from '../src/storage.mjs';
import {seedState,normalizeState} from '../src/model.mjs';

test('安卓首次启动保存空白数据，重新读取保持空白',async()=>{
 let saved='';globalThis.window={GxNative:{readStateFor:()=>saved,writeStateFor:(account,value)=>{saved=value;return 'ok';}}};
 const first=await readState(),second=await readState();assert.ok(saved);assert.deepEqual(second,first);for(const field of ["tasks","notes","projects","tags","places"])assert.deepEqual(first[field],[]);
});
test('安卓写入后排序、子任务和交互设置一同保留',async()=>{
 let saved='';globalThis.window={GxNative:{readStateFor:()=>saved,writeStateFor:(account,value)=>{saved=value;return 'ok';}}};
 const state=seedState();state.settings={swipeMenu:false,swipeComplete:true,longPressMs:1500,undoMs:8000};state.tasks[0].order=9216;state.tasks[0].subtasks=[{id:'child',title:'第一行\n第二行',done:true}];
 await writeState(state);const loaded=await readState();assert.equal(loaded.tasks[0].order,9216);assert.deepEqual(loaded.settings,state.settings);assert.deepEqual(loaded,normalizeState(state));assert.deepEqual(loaded.tasks[0].subtasks.map(({id,title,done})=>({id,title,done})),state.tasks[0].subtasks);
});
test('安卓存储拒绝写入时显示失败，不把失败当成保存成功',async()=>{
 globalThis.window={GxNative:{readStateFor:()=>'',writeStateFor:()=> '保存失败，请检查手机可用空间'}};
 await assert.rejects(writeState(seedState()),/保存失败/);await assert.rejects(readState(),/保存失败/);
});
test('已有数据损坏时停止读取，不使用空白数据覆盖',async()=>{
 let writes=0;globalThis.window={GxNative:{readStateFor:()=>'{broken',writeStateFor:()=>{writes++;return 'ok';}}};
 await assert.rejects(readState());assert.equal(writes,0);
});
