import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeState} from '../../src/model.mjs';
import {bindExistingV2Storage,createV2Service,V2_CAPABILITIES} from '../../prototypes/d4-06/v2-service.mjs';

if(process.env.GITHUB_ACTIONS!=='true'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA||!process.env.RUNNER_TEMP)throw Error('D4-06 tests require exact hosted Actions identity');
const now='2032-05-07T12:30:59.007Z';
const empty=()=>normalizeState({version:2,tasks:[],notes:[],projects:[],tags:[],places:[]});
function fixture(){let state=empty(),reads=0,writes=0,serial=0,fail=false;const storage=bindExistingV2Storage({readState:async()=>{reads++;return structuredClone(state);},writeState:async next=>{if(fail)throw Error('synthetic write rejected');writes++;state=structuredClone(next);return next;}},{scope:'isolated-synthetic',storageId:'d406-memory'});return {storage,service:createV2Service({storage,clock:()=>now,idFactory:()=>`synthetic-${++serial}`}),counts:()=>({reads,writes}),state:()=>structuredClone(state),fail:value=>{fail=value;}};}

test('D4-06 requires explicit isolated storage admission and performs no automatic I/O',()=>{
 assert.throws(()=>createV2Service(),/explicitly bound/);assert.throws(()=>bindExistingV2Storage({}),/isolated/);
 assert.throws(()=>bindExistingV2Storage({readState(){},writeState(){}},{scope:'production',storageId:'real'}),/production admission is blocked/);
 const f=fixture();assert.deepEqual(f.counts(),{reads:0,writes:0});assert.equal(f.service.capabilities,V2_CAPABILITIES);assert.equal(V2_CAPABILITIES.remoteSync,false);
});

test('D4-06 new work entities and hidden relation fields are rejected without writes',async()=>{
 const f=fixture();for(const field of V2_CAPABILITIES.unsupported){await assert.rejects(f.storage.writeState({...empty(),[field]:[]}),/model admission/);assert.throws(()=>f.service.unsupported(field),/no writes/);}
 assert.throws(()=>f.service.createTask({title:'synthetic',projectId:'unsupported'}),/model admission/);
 assert.throws(()=>f.service.createProject({name:'synthetic',owner:'unsupported'}),/model admission/);
 const task={id:'bad',title:'synthetic',subtasks:[],projectId:'forbidden'};await assert.rejects(f.storage.writeState({...empty(),tasks:[task]}),/model admission/);
 assert.deepEqual(f.counts(),{reads:0,writes:0});
});

test('D4-06 existing task scheduling, nested edits, ordering and notes remain separate',async()=>{
 const f=fixture(),s=f.service;
 await s.createProject({name:'Approved model',description:'synthetic'});
 let state=await s.createTask({title:'Parent',project:'Approved model',tags:['existing tag'],place:'existing place',repeat:{frequency:'daily',interval:1,weekdays:[],until:'',anchor:'2032-05-07T09:00'}});
 const parent=state.tasks[0].id;state=await s.addSubtask(parent,'Child');const child=state.tasks[0].subtasks[0].id;
 state=await s.editTask(child,{notes:'  exact child note\nline two  '},state.tasks[0].subtasks[0]);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].subtasks[0].id,child);
 state=await s.moveTask(parent,2);assert.equal(state.tasks[0].quadrant,2);
 state=await s.setTaskDone(parent,true);assert.equal(state.tasks[0].completedAt,now);assert.equal(state.tasks.length,2);assert.equal(state.tasks[1].generatedFrom,parent);
 const tasks=structuredClone(state.tasks);state=await s.createNote('  Independent note\nunchanged spaces  ');assert.deepEqual(state.tasks,tasks);const note=state.notes[0];
 state=await s.editNote(note.id,'Revised independent note');assert.equal(state.notes[0].createdAt,now);assert.deepEqual(state.tasks,tasks);assert.equal(state.projects.length,1);
 assert.deepEqual(state.tags,['existing tag']);assert.deepEqual(state.places,['existing place']);
});

test('D4-06 queued edits survive rejected storage and never claim failed writes',async()=>{
 const f=fixture();await Promise.all([f.service.createNote('First'),f.service.createNote('Second')]);assert.equal(f.state().notes.length,2);
 f.fail(true);await assert.rejects(f.service.createNote('Rejected'),/write rejected/);assert.deepEqual(f.state().notes.map(n=>n.body),['First','Second']);
 f.fail(false);await f.service.createNote('After failure');assert.deepEqual(f.state().notes.map(n=>n.body),['First','Second','After failure']);assert.equal(f.counts().writes,3);
});

test('D4-06 reuses the unchanged browser storage and real SQLite replica in a synthetic Actions directory',async()=>{
 const directory=await fs.mkdtemp(path.join(await fs.realpath(process.env.RUNNER_TEMP),'d4-web-v2-'));
 const originalWindow=globalThis.window,originalFetch=globalThis.fetch;const operations=[];let store;
 try{
  const {createSQLiteStore}=await import('../../src/sqlite-store.mjs');store=createSQLiteStore(directory);await store.initialize(empty());
  globalThis.window={};
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'/api/sync');const input=JSON.parse(options.body);assert.equal(input.op,'replica');assert.ok(['inspect','state','commit'].includes(input.action));operations.push(input.action);
   return new Response(JSON.stringify(store.call(input)),{status:200,headers:{'Content-Type':'application/json'}});
  };
  // This calls the actual unchanged src/storage.mjs and src/sync-client.mjs.
  // Only the HTTP transport is isolated to the actual temporary SQLite store.
  const existing=await import('../../src/storage.mjs');const port=bindExistingV2Storage(existing,{scope:'isolated-synthetic',storageId:directory});let serial=0;
  const service=createV2Service({storage:port,clock:()=>now,idFactory:()=>`d406-sqlite-${++serial}`});
  await service.createProject({name:'SQLite existing project'});let saved=await service.createTask({title:'SQLite existing task',project:'SQLite existing project',notes:'Original mature fields',start:'2032-05-07T20:30'});
  const task=saved.tasks[0];await service.addSubtask(task.id,'SQLite child');saved=await service.createNote('SQLite independent note');
  const rows=store.call({action:'state'}).rows;assert.ok(rows.every(row=>['tasks','notes','projects','tags','places'].includes(JSON.parse(row.key)[0])));
  store.close();store=createSQLiteStore(directory);assert.deepEqual(store.read(),saved);assert.ok(operations.includes('commit'));assert.equal(saved.tasks[0].subtasks.length,1);
  const before=JSON.stringify(store.read());assert.throws(()=>service.createTask({title:'forbidden work',workItemId:'synthetic-work'}),/model admission/);assert.equal(JSON.stringify(store.read()),before);
  await fs.writeFile(path.join(directory,'d406-service-receipt.json'),JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,storageId:directory,scope:'synthetic temporary SQLite only; in-process HTTP transport; no remote request',database:'tasks.sqlite',modelVersion:2,operations,rows:rows.length,unsupported:V2_CAPABILITIES.unsupported,productionAdmission:false},null,2)+'\n');
 }finally{store?.close();globalThis.window=originalWindow;globalThis.fetch=originalFetch;}
});
