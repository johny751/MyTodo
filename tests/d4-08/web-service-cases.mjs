import assert from 'node:assert/strict';
const snapshot=a=>a.eval('D408V2Candidate.snapshot()');
const field=(form,name)=>'[data-v2-form="'+form+'"] [name="'+name+'"]';
async function open(a){await a.navigate('settings');await a.until('!!document.querySelector("[data-v2-candidate]")','service UI mounted');await a.click('[data-v2-action="open"]');}
async function submit(a,kind){await a.submit('[data-v2-form="'+kind+'"]');}
async function task(a,title='V2 service task'){await a.fill(field('task','title'),title);await a.fill(field('task','notes'),'Service UI original notes');await submit(a,'task');return (await snapshot(a)).state.tasks.at(-1);}
export const serviceCases=[
 {id:'S1',name:'Mounted UI creates, edits, completes and moves existing V2 entities through isolated service persistence across reload',async run(a){
  assert.equal(await a.eval('!!window.D408V2Candidate'),true);const core=await a.eval('D4Prototype.repo.state');
  assert.equal((await snapshot(a)).state,null);assert.equal(await a.eval('localStorage.getItem(D408V2Candidate.storageKey)'),null);
  await open(a);assert.equal((await snapshot(a)).state.tasks.length,0);
  await a.fill(field('project','name'),'D408 existing model project');await a.fill(field('project','description'),'Synthetic project via service');await submit(a,'project');
  await a.fill(field('task','project'),'D408 existing model project');const first=await task(a);
  assert.equal(first.project,'D408 existing model project');await a.click('[data-v2-action="select"][data-id="'+first.id+'"]');
  await a.fill(field('edit','title'),'D408 edited through service');await a.fill(field('edit','notes'),'Persisted edited notes');await submit(a,'edit');
  await a.fill(field('child','title'),'D408 existing child');await submit(a,'child');
  await a.click('[data-v2-action="done"][data-id="'+first.id+'"]');await a.click('[data-v2-action="move"][data-id="'+first.id+'"]');
  await a.fill(field('note','body'),'D408 note original');await submit(a,'note');await a.fill(field('note-edit','body'),'D408 note edited');await submit(a,'note-edit');
  const before=(await snapshot(a)).state;assert.equal(before.tasks[0].title,'D408 edited through service');assert.equal(before.tasks[0].notes,'Persisted edited notes');assert.equal(before.tasks[0].subtasks[0].title,'D408 existing child');assert.equal(before.tasks[0].done,true);assert.equal(before.tasks[0].quadrant,1);assert.equal(before.notes[0].body,'D408 note edited');
  const persisted=await a.eval('JSON.parse(localStorage.getItem(D408V2Candidate.storageKey))');assert.deepEqual(persisted.state,before);assert.equal(persisted.scope,'isolated-synthetic');assert.equal(persisted.storageId,await a.eval('D408V2Candidate.storageKey'));
  await a.eval(`(()=>{const original=URL.createObjectURL;window.__v2Export=null;URL.createObjectURL=function(blob){if(blob.type.includes('json'))window.__v2Export=blob.text();return original.call(this,blob);};return true;})()`);await a.click('[data-v2-action="export"]');assert.deepEqual(JSON.parse(await a.eval('window.__v2Export')).state,before);
  a.observe({calls:(await snapshot(a)).log,persisted});await a.screenshot('mounted-existing-model');await a.reload();await open(a);assert.deepEqual((await snapshot(a)).state,before);assert.deepEqual(await a.eval('D4Prototype.repo.state'),core);
 }},
 {id:'S2',name:'Service write failure retains live input and durable bytes; one retry commits once and survives reload',async run(a){
  await open(a);await task(a,'Initial isolated task');const before=await a.eval('localStorage.getItem(D408V2Candidate.storageKey)'),state=(await snapshot(a)).state;
  await a.fill(field('task','title'),'D408 service retry');await a.fill(field('task','notes'),'Keep this draft after quota failure');
  await a.eval('window.__v2DraftHost=document.querySelector("[data-v2-candidate]");D4Prototype.repo.updateDemo(d=>{d.ui={...(d.ui||{}),d408UnrelatedRepaint:true};})');await a.settle();assert.equal(await a.eval('window.__v2DraftHost===document.querySelector("[data-v2-candidate]")'),true);assert.equal(await a.eval('document.querySelector('+JSON.stringify(field('task','title'))+').value'),'D408 service retry');await a.navigate('notes');await a.navigate('settings');assert.equal(await a.eval('window.__v2DraftHost===document.querySelector("[data-v2-candidate]")'),true);assert.equal(await a.eval('document.querySelector('+JSON.stringify(field('task','notes'))+').value'),'Keep this draft after quota failure');
  await a.eval(`(()=>{const original=Storage.prototype.setItem;window.__v2WriteBlocked=true;Storage.prototype.setItem=function(key,value){if(key===D408V2Candidate.storageKey&&window.__v2WriteBlocked)throw new DOMException('D408 isolated service quota','QuotaExceededError');return original.call(this,key,value);};return true;})()`);
  await submit(a,'task');assert.equal(await a.eval('localStorage.getItem(D408V2Candidate.storageKey)'),before);assert.deepEqual((await snapshot(a)).state,state);assert.equal(await a.eval('document.querySelector('+JSON.stringify(field('task','title'))+').value'),'D408 service retry');assert.match((await snapshot(a)).error,/quota/);await a.screenshot('write-failure-keeps-input');
  await a.eval('window.__v2WriteBlocked=false');await submit(a,'task');assert.equal((await snapshot(a)).state.tasks.filter(t=>t.title==='D408 service retry').length,1);await a.reload();await open(a);assert.equal((await snapshot(a)).state.tasks.filter(t=>t.title==='D408 service retry').length,1);
 }},
 {id:'S3',name:'Corrupt or wrong-identity storage remains untouched and unsupported model writes are refused',async run(a){
  const core=await a.eval('D4Prototype.repo.state');await a.eval('localStorage.setItem(D408V2Candidate.storageKey,JSON.stringify({kind:"foreign-real-user-data",version:1,state:{tasks:[]}}))');const bytes=await a.eval('localStorage.getItem(D408V2Candidate.storageKey)');
  await open(a);assert.equal((await snapshot(a)).state,null);assert.match((await snapshot(a)).error,/身份不符/);assert.equal(await a.eval('localStorage.getItem(D408V2Candidate.storageKey)'),bytes);
  const rejection=await a.eval(`(async()=>{let writes=0;const seed={version:2,settings:{},tasks:[],notes:[],projects:[],tags:[],places:[]};const port=D4V2Service.bindExistingV2Storage({readState:async()=>seed,writeState:async next=>{writes++;return next;}},{scope:'isolated-synthetic',storageId:'d408-rejection-probe'});const service=D4V2Service.createV2Service({storage:port});const errors=[];try{await service.createTask({title:'invalid work field',workItemId:'forbidden'});}catch(e){errors.push(e.message);}try{service.unsupported('pomodoro');}catch(e){errors.push(e.message);}try{D4V2Service.bindExistingV2Storage({readState:async()=>seed,writeState:async x=>x},{scope:'production',storageId:'refused'});}catch(e){errors.push(e.message);}return {writes,errors};})()`);
  assert.equal(rejection.writes,0);assert.equal(rejection.errors.length,3);assert.match(rejection.errors[0],/admission/);assert.deepEqual(await a.eval('D4Prototype.repo.state'),core);assert.equal(await a.eval('localStorage.getItem(D408V2Candidate.storageKey)'),bytes);a.observe(rejection);
 }}
];
