// Cloud real-DOM cases. The root harness owns Chrome/CDP, source guards and artifacts.
// api.eval is used for observations/export instrumentation; mutations use actual UI controls.
import assert from 'node:assert/strict';

export async function runCases(api){
 if(process.env.GITHUB_ACTIONS!=='true'||!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||!/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT||'')||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA)throw Error('D4 DOM cases are authorized only in the exact Actions checkout');
 const sourceSha=process.env.GITHUB_SHA,runId=process.env.GITHUB_RUN_ID;
 const read=expression=>api.eval('Promise.resolve().then(()=>('+expression+'))');
 const core=()=>read('window.D4Prototype.repo.state');
 const byId=id=>read('window.D4Prototype.repo.getTask('+JSON.stringify(id)+')');
 const go=route=>api.click('.nav-item[data-action="go"][data-id="'+route+'"]');
 const close=()=>api.click('.modal [data-action="close-modal"]');
 const open=id=>api.click('.page [data-action="task-open"][data-id="'+id+'"]');
 const field=name=>'form[data-form="task-edit"] [name="'+name+'"]';
 const filter=name=>'form[data-form="task-filter"] [name="'+name+'"]';
 const rows=()=>read('Array.from(document.querySelectorAll(".page .board .task-row")).map(x=>x.dataset.taskId)');
 const routes=['tasks','notes','pomodoro','analytics','feedback','dashboard','work-items','projects','templates','processes','contacts','archive','sync','devices','data-system','settings','about','task-detail'];
 let today,createdId,childId,nextId,editedTitle;
 const title='D4 UI 合成验收 '+runId;

 await api.check('core-single-file-provenance-and-V2',async()=>{
  const value=await read('({protocol:location.protocol,source:window.D4_BUILD?.sourceSha||window.D4Build?.sourceSHA||"",routes:window.D4Prototype.routes,key:window.D4Prototype.storageKey,core:window.D4Prototype.repo.state,moduleScripts:document.querySelectorAll("script[type=module],script[src]").length})');
  assert.equal(value.protocol,'file:');assert.equal(value.source,sourceSha);assert.equal(value.key,'mytodo-d4-03-demo-v1');assert.equal(value.moduleScripts,0);assert.deepEqual(value.routes,routes);assert.equal(value.core.version,2);
  assert.equal(value.core.tasks.some(t=>'status' in t||'projectId' in t),false);
  today=await read('window.DemoDomain.helpers.dayKey()');return {protocol:value.protocol,sourceSha:value.source,routes:routes.length,coreVersion:2};
 });

 // Start from the factory using the actual settings/reset controls, not a model shortcut.
 await api.check('core-reset-through-settings-controls',async()=>{
  await go('settings');await api.click('.page [data-action="reset-ask"]');await api.click('.modal [data-action="reset-confirm"]');
  assert.equal(await read('document.querySelector("main.page").dataset.route'),'tasks');assert.ok((await core()).tasks.some(t=>t.id==='d4-task-0'));return {actualResetControls:true};
 });

 for(const route of routes)await api.check('core-route-'+route,async()=>{
  await go(route);const value=await read('({route:document.querySelector("main.page").dataset.route,active:document.querySelector(".nav-item.active").dataset.id,title:document.querySelector(".page-heading h1,.page-heading h2")?.textContent||""})');
  assert.equal(value.route,route);assert.equal(value.active,route);assert.ok(value.title.trim());await api.screenshot('core-route-'+route);return value;
 });

 await api.check('core-weekday-default-and-invalid-schedule-refusal',async()=>{
  await go('tasks');await api.click('.page .page-actions [data-action="task-new"]');
  const weekday=await read('Number(document.querySelector("form[data-form=task-edit] select[name=weekday]").value)');
  const expected=await read('new Date('+JSON.stringify(today+'T00:00:00Z')+').getUTCDay()');assert.equal(weekday,expected);
  const before=await core();await api.fill(field('title'),'D4-invalid-schedule-'+runId);await api.fill(field('repeat'),'weekly');await api.fill(field('start'),today+'T10:00');
  const previous=await read('window.DemoDomain.helpers.shiftDate('+JSON.stringify(today)+',"day",-1)');await api.fill(field('until'),previous);await api.submit('form[data-form="task-edit"]');
  assert.deepEqual(await core(),before);assert.match(await read('document.querySelector("#toast").textContent'),/重复结束日期/);assert.ok(await read('!!document.querySelector("form[data-form=task-edit]")'));
  await api.fill(field('repeat'),'');await api.fill(field('until'),'');await api.fill(field('reminderMode'),'custom');await api.fill(field('reminderAt'),'');await api.submit('form[data-form="task-edit"]');
  assert.deepEqual(await core(),before);assert.match(await read('document.querySelector("#toast").textContent'),/自定义提醒/);await close();return {shanghaiWeekday:weekday,failedDraftPreserved:true};
 });

 await api.check('core-create-task-repeat-and-reminder-through-form',async()=>{
  await go('tasks');await api.click('.page .page-actions [data-action="task-new"]');
  for(const [name,value] of Object.entries({title,quadrant:'1',projectId:'project-product',start:today+'T10:00',end:today+'T11:00',place:'离线会议室',tags:JSON.stringify(['界面','D4验收']),weight:'5',repeat:'daily',interval:'1',reminderMode:'offset',minutes:'15',notes:'单文件离线 CRUD 合成测试'}))await api.fill(field(name),value);
  await api.submit('form[data-form="task-edit"]');
  const value=await read('window.D4Prototype.repo.state.tasks.find(t=>t.title==='+JSON.stringify(title)+')');assert.ok(value);createdId=value.id;
  assert.equal(value.done,false);assert.equal(value.quadrant,1);assert.equal(value.project,'产品迭代');assert.equal(value.projectId,undefined);assert.equal(value.status,undefined);assert.equal(value.start,today+'T10:00');assert.equal(value.end,today+'T11:00');
  assert.equal(value.repeat.frequency,'daily');assert.equal(value.repeat.interval,1);assert.equal(value.repeat.anchor,value.start);assert.deepEqual(value.repeat.weekdays,[]);assert.equal(value.reminder.mode,'offset');assert.equal(value.reminder.minutes,15);
  const expected=await read('window.DemoDomain.helpers.parseTime('+JSON.stringify(today+'T10:00')+')-15*60000');assert.equal(value.reminderAt,expected);
  assert.equal(await read('window.D4Prototype.repo.demo.taskLinks['+JSON.stringify(createdId)+'].projectId'),'project-product');assert.ok((await rows()).includes(createdId));return {id:createdId,actualForm:true,coreProjectName:value.project};
 });

 await api.check('core-edit-task-custom-reminder-and-add-complete-child',async()=>{
  assert.ok(createdId,'create case did not produce a task');await open(createdId);editedTitle=title+' · 已编辑';
  await api.fill(field('title'),editedTitle);await api.fill(field('reminderMode'),'custom');await api.fill(field('reminderAt'),today+'T09:40');await api.submit('form[data-form="task-edit"]');
  const edited=await byId(createdId);assert.equal(edited.title,editedTitle);assert.equal(edited.repeat.anchor,today+'T10:00');assert.equal(edited.reminder.mode,'custom');assert.equal(edited.reminder.at,today+'T09:40');
  await open(createdId);await api.fill('form[data-form="subtask-add"] input[name="title"]','D4 合成子步骤 '+runId);await api.submit('form[data-form="subtask-add"]');
  const parent=await byId(createdId);assert.equal(parent.subtasks.length,1);childId=parent.subtasks[0].id;assert.equal(parent.subtasks[0].project,parent.project);assert.deepEqual(parent.subtasks[0].tags,parent.tags);
  assert.equal((await core()).tasks.some(t=>t.id===childId),false);await api.click('.modal [data-action="task-toggle"][data-id="'+childId+'"]');assert.equal((await byId(childId)).done,true);
  assert.equal(await read('window.D4Prototype.repo.demo.taskLinks['+JSON.stringify(childId)+'].projectId'),'project-product');await close();return {id:createdId,childId,nestedArrayPreserved:true,customReminder:edited.reminder.at};
 });

 await api.check('core-completion-generates-one-retimed-next-occurrence',async()=>{
  assert.ok(childId,'child case did not produce a child');await open(createdId);await api.click('.modal [data-action="task-toggle"][data-id="'+createdId+'"]');
  let state=await core();const original=state.tasks.find(t=>t.id===createdId),next=state.tasks.find(t=>t.generatedFrom===createdId);assert.ok(next);nextId=next.id;
  const tomorrow=await read('window.DemoDomain.helpers.shiftDate('+JSON.stringify(today)+',"day",1)');assert.equal(original.done,true);assert.equal(original.reminderAt,null);assert.equal(next.done,false);assert.equal(next.start,tomorrow+'T10:00');assert.equal(next.end,tomorrow+'T11:00');assert.equal(next.reminder.at,tomorrow+'T09:40');assert.equal(next.project,'产品迭代');
  assert.equal(next.subtasks.length,1);assert.notEqual(next.subtasks[0].id,childId);assert.equal(next.subtasks[0].done,false);assert.equal(next.subtasks[0].completedAt,'');
  await api.click('.modal [data-action="task-toggle"][data-id="'+createdId+'"]');await api.click('.modal [data-action="task-toggle"][data-id="'+createdId+'"]');state=await core();assert.equal(state.tasks.filter(t=>t.generatedFrom===createdId).length,1);await close();
  return {original:createdId,next:nextId,repeatCopies:1,retimedCustomReminder:next.reminder.at};
 });

 await api.check('core-reminder-center-shows-pending-next-not-completed-original',async()=>{
  assert.ok(nextId,'repeat case did not produce a next task');await api.click('.topbar [data-action="reminders"]');
  const value=await read('({next:!!document.querySelector('+JSON.stringify('.modal [data-action="task-open"][data-id="'+nextId+'"]')+'),original:!!document.querySelector('+JSON.stringify('.modal [data-action="task-open"][data-id="'+createdId+'"]')+'),text:document.querySelector(".modal").textContent})');
  assert.equal(value.next,true);assert.equal(value.original,false);assert.match(value.text,/北京时间/);assert.match(value.text,/不发送系统通知/);await api.screenshot('core-reminder-center');await close();return {pendingNextIncluded:true,completedOriginalExcluded:true};
 });

 await api.check('core-global-search-retains-mature-place-and-AND-fields',async()=>{
  assert.ok(nextId);await api.fill('form[data-form="global-search"] input[name="query"]','Ｄ４ UI 离线会议室');await api.submit('form[data-form="global-search"]');
  assert.equal(await read('!!document.querySelector('+JSON.stringify('.modal [data-action="task-open"][data-id="'+createdId+'"]')+')'),true);
  assert.equal(await read('!!document.querySelector('+JSON.stringify('.modal [data-action="task-open"][data-id="'+nextId+'"]')+')'),true);await close();
  await api.fill('form[data-form="global-search"] input[name="query"]','D4 UI 不存在的关联词');await api.submit('form[data-form="global-search"]');assert.match(await read('document.querySelector(".modal").textContent'),/没有找到/);await close();return {nfkcAndPlaceSearch:true,allTermsRequired:true};
 });

 await api.check('core-status-project-query-and-date-filters-use-actual-form',async()=>{
  await go('tasks');for(const [name,value] of Object.entries({query:editedTitle,status:'pending',projectId:'project-product',date:today,period:'day',sort:'time'}))await api.fill(filter(name),value);
  if(!await read('document.querySelector("form[data-form=task-filter] input[name=allDates]").checked'))await api.click(filter('allDates'));
  await api.submit('form[data-form="task-filter"]');assert.deepEqual(await rows(),[nextId]);await api.fill(filter('status'),'done');await api.submit('form[data-form="task-filter"]');assert.deepEqual(await rows(),[createdId]);await api.screenshot('core-filtered-completed-task');
  return {pendingNext:nextId,completedOriginal:createdId,projectId:'project-product',actualFilterSubmit:true};
 });

 await api.check('core-delete-original-subtree-preserves-next-and-its-project-association',async()=>{
  assert.ok(nextId);await open(createdId);await api.click('.modal [data-action="task-delete"][data-id="'+createdId+'"]');await api.click('.modal [data-action="task-delete-confirm"][data-id="'+createdId+'"]');
  assert.equal(await byId(createdId),null);assert.equal(await byId(childId),null);const next=await byId(nextId);assert.ok(next);assert.equal(next.project,'产品迭代');assert.equal(next.subtasks.length,1);
  const decorated=await read('window.DemoDomain.helpers.flattenTasks(window.D4Prototype.getState().tasks).find(t=>t.id==='+JSON.stringify(nextId)+')');assert.equal(decorated.projectId,'project-product');
  return {deletedOriginalSubtree:true,preservedNext:nextId,coreProjectName:next.project,mockProjectLinkPreserved:true};
 });

 await api.check('core-settings-build-identity-and-marked-export-boundary',async()=>{
  await go('settings');const pageText=await read('document.querySelector("main.page").textContent');assert.ok(pageText.includes(sourceSha.slice(0,8)));assert.equal(pageText.includes('源码未构建'),false);
  await api.eval('(()=>{window.__D4_EXPORT_ORIGINAL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__D4_EXPORT_BLOB=blob;return window.__D4_EXPORT_ORIGINAL.call(URL,blob);};return true;})()');
  try{
   await api.click('.page [data-action="export-demo"]');const serialized=await api.eval('window.__D4_EXPORT_BLOB.text()'),value=JSON.parse(serialized);assert.equal(value.kind,'mytodo-d4-03-synthetic-demo');assert.equal(value.version,1);assert.equal(value.state.version,2);assert.equal(value.sourceSHA,sourceSha);
   assert.deepEqual(value.state,await core());assert.equal(value.state.tasks.some(t=>'projectId' in t||'status' in t),false);assert.ok(value.demo.taskLinks);assert.equal(value.demo.taskLinks[createdId],undefined);
   return {markedSyntheticExport:true,sourceSha:value.sourceSHA,coreVersion:2,coreAndMockSeparated:true};
  }finally{await api.eval('(()=>{URL.createObjectURL=window.__D4_EXPORT_ORIGINAL;delete window.__D4_EXPORT_ORIGINAL;delete window.__D4_EXPORT_BLOB;return true;})()');}
 });
}
