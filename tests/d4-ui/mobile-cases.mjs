import assert from 'node:assert/strict';
export async function runMobileCases(api){
 const read=api.eval,go=api.navigate;
 await api.configure(412,915,true);
 await go('settings');await api.click('[data-action=reset-ask]');await api.click('[data-action=reset-confirm]');
 await api.check('M01 Mobile startup uses four functional quadrants',async()=>{await api.reload();assert.equal(await read('D4Prototype.getRoute()'),'tasks');assert.equal(await read('document.querySelectorAll("[data-quadrant]").length'),4);const rows=await read('[...document.querySelectorAll("[data-quadrant]")].map(x=>x.getBoundingClientRect().top)');assert.equal(rows[0],rows[1]);assert.equal(rows[2],rows[3]);await api.screenshot('mobile-four-quadrants');});
 await api.check('M02-M03 Touch quadrant zoom and return',async()=>{await api.tap('[data-action=quadrant-focus][data-id="0"]');assert.equal(await read('document.querySelectorAll(".board [data-quadrant]").length'),1);assert.equal(await read('document.querySelectorAll(".quadrant-peek[data-quadrant]").length'),3);await api.screenshot('mobile-zoom');await api.tap('[data-action=quadrant-back]');assert.equal(await read('document.querySelectorAll("[data-quadrant]").length'),4);});
 await api.check('M04 Touch long hold reorders without completion or deletion',async()=>{const before=await read('D4Prototype.repo.state.tasks');const source='[data-quadrant="0"] [data-task-id="d4-task-0"] .task-title',target='[data-quadrant="0"] [data-task-id="d4-task-1"]';await api.drag(source,target,{hold:3200,after:true});const ordered=await read('D4Prototype.repo.state.tasks.filter(t=>t.quadrant===0&&!t.done).sort((a,b)=>a.order-b.order).map(t=>t.id)');assert.equal(ordered.at(-1),'d4-task-0');await api.reload();assert.deepEqual(await read('[...document.querySelectorAll("[data-quadrant=\\"0\\"] .task-row")].map(x=>x.dataset.taskId)'),ordered);const after=await read('D4Prototype.repo.state.tasks');assert.equal(after.length,before.length);for(const t of before){const next=after.find(x=>x.id===t.id);assert.equal(next.done,t.done);assert.equal(next.title,t.title);}await api.screenshot('mobile-reordered');});
 await api.check('M05 Cross-quadrant touch move keeps identity and all other fields',async()=>{const before=await read('D4Prototype.repo.getTask("d4-task-0")'),link=await read('D4Prototype.repo.demo.taskLinks["d4-task-0"]');await api.drag('[data-task-id="d4-task-0"] .task-title','[data-quadrant="1"] .quadrant-head',{hold:3200});const after=await read('D4Prototype.repo.getTask("d4-task-0")');assert.equal(after.quadrant,1);for(const key of Object.keys(before).filter(k=>!['quadrant','order'].includes(k)))assert.deepEqual(after[key],before[key],key);assert.deepEqual(await read('D4Prototype.repo.demo.taskLinks["d4-task-0"]'),link);await api.reload();assert.equal(await read('D4Prototype.repo.getTask("d4-task-0").quadrant'),1);await api.screenshot('mobile-cross-move');});
 await api.check('M06 Full menu and explicit move use existing task identity',async()=>{await api.tap('[data-task-id="d4-task-0"] [data-action=task-menu]');const actions=await read('[...document.querySelectorAll(".task-menu-actions [data-action]")].map(x=>x.dataset.action)');for(const action of ['task-open','task-toggle','task-up','task-down','task-move','task-subtask','task-notes','task-reminder','task-delete','task-review'])assert.ok(actions.includes(action),action);await api.screenshot('mobile-task-menu');await api.tap('[data-action=task-move][data-id="d4-task-0|0"]');assert.equal(await read('D4Prototype.repo.getTask("d4-task-0").quadrant'),0);});
 await api.check('M07-M09 Catalog click and keyboard autocomplete preserve IDs and unique tags',async()=>{await api.tap('[data-task-id="d4-task-0"] [data-action=task-open]');await api.fill('[name=tagQuery]','协');await api.tap('[data-catalog=tags] [data-action=catalog-pick][data-id="协作"]');await api.fill('[name=tagQuery]','新手机标签');await api.key('[name=tagQuery]','ArrowDown');await api.key('[name=tagQuery]','Enter');await api.fill('[name=projectQuery]','产品');await api.tap('[data-catalog=projects] [data-action=catalog-pick][data-id="project-product"]');await api.fill('[name=place]','远');await api.tap('[data-catalog=places] [data-action=catalog-pick][data-id="远程"]');await api.fill('[name=review]','手机复盘原值');await api.submit('[data-form=task-edit]');const t=await read('D4Prototype.repo.getTask("d4-task-0")');assert.ok(t.tags.includes('协作'));assert.ok(t.tags.includes('新手机标签'));assert.equal(new Set(t.tags).size,t.tags.length);assert.equal(t.place,'远程');assert.equal(t.review,'手机复盘原值');assert.equal(await read('D4Prototype.repo.demo.taskLinks["d4-task-0"].projectId'),'project-product');});
 await api.tap('[data-action=close-modal]');
 for(const route of ['tasks','notes','pomodoro','projects','work-items','templates','processes','analytics','settings','sync'])await api.check('M-edge-'+route+' Global real touch edge navigation',async()=>{await go(route);await api.swipe([3,175],[155,177]);assert.equal(await read('document.querySelector(".app-shell").classList.contains("nav-open")'),true);if(route==='notes')await api.screenshot('mobile-edge-navigation');await api.tap('.nav-item[data-id=tasks]');assert.equal(await read('D4Prototype.getRoute()'),'tasks');assert.equal(await read('document.querySelector(".app-shell").classList.contains("nav-open")'),false);});
 await api.check('M16-M17 Overlay, left swipe and back close drawer',async()=>{await api.swipe([3,175],[150,175]);await api.tap('.nav-shade', {x:375,y:170});assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'),false);await api.swipe([3,175],[150,175]);await api.swipe([210,175],[100,175]);assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'),false);await api.swipe([3,175],[150,175]);await api.key(null,'Escape');assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'),false);});
 await api.check('M18 Edge navigation preserves unsaved task draft',async()=>{await go('tasks');await api.tap('[data-task-id="d4-task-0"] [data-action=task-open]');await api.fill('[name=title]','尚未保存的手机草稿');await api.swipe([3,155],[150,155]);await api.tap('.nav-item[data-id=notes]');await api.swipe([3,155],[150,155]);await api.tap('.nav-item[data-id=tasks]');assert.equal(await read('document.querySelector("[data-form=task-edit] [name=title]").value'),'尚未保存的手机草稿');assert.notEqual(await read('D4Prototype.repo.getTask("d4-task-0").title'),'尚未保存的手机草稿');await api.tap('[data-action=close-modal]');});
 await api.check('M-scroll Content vertical scroll does not become navigation or drag',async()=>{await go('tasks');const before=await read('D4Prototype.repo.state.tasks.map(t=>({id:t.id,quadrant:t.quadrant,order:t.order,done:t.done}))');await api.swipe([110,420],[110,220]);assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'),false);assert.deepEqual(await read('D4Prototype.repo.state.tasks.map(t=>({id:t.id,quadrant:t.quadrant,order:t.order,done:t.done}))'),before);});
 await api.check('M-legacy Content swipe menu and completion retain guarded undo',async()=>{await go('tasks');const p=await api.point('[data-task-id="d4-task-0"] .task-title');await api.swipe([p.x,p.y],[p.x-100,p.y]);assert.ok(await read('!!document.querySelector(".task-menu-actions")'));await api.tap('[data-action=close-modal]');const before=await read('D4Prototype.repo.getTask("d4-task-0")');const p2=await api.point('[data-task-id="d4-task-0"] .task-title');await api.swipe([p2.x,p2.y],[p2.x+100,p2.y]);assert.equal(await read('D4Prototype.repo.getTask("d4-task-0").done'),!before.done);await api.tap('#undo-notice [data-action=task-undo]');assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0")'),before);});
 // Force the reminder poll between real task input and real Undo input. This
 // reproduces the interleaving without waiting for a favourable timer phase.
 const undoEnvelope=()=>read('({core:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
 const pollUndoReminders=()=>read(`DemoPersonalPages.reminders.check({repo:D4Prototype.repo,getState:D4Prototype.getState,esc:value=>String(value),toast:()=>{}})`);
 async function withUndoReminderFixture(count,body){
  const saved=await undoEnvelope();
  try{
   await go('tasks');
   await read(`(()=>{const repo=D4Prototype.repo,H=DemoDomain.helpers,state=repo.state;state.tasks=[];
    repo.batch(()=>{repo.replaceState(state);for(let i=0;i<${count};i++)repo.createTask({id:'d403-undo-'+i,title:'Undo reminder '+i,quadrant:0,start:H.dayKey()+'T12:00',reminder:{mode:'custom',at:H.shiftDate(H.dayKey(),'day',-1)+'T09:00'},notes:'Preserve raw note '+i,tags:['raw,tag']});repo.createTask({id:'d403-undo-later',title:'Subsequent real edit',quadrant:0,start:H.dayKey()+'T12:00',notes:'Original follow-up note'});repo.updateDemo(d=>{d.personal=d.personal||{};d.personal.timer=null;d.personal.reminderLedger={};d.personal.reminderNotices=[];});});return true;})()`);
   await pollUndoReminders();await api.reload();await go('tasks');
   await api.fill('[data-form=task-filter] [name=sort]','manual');await api.fill('[data-form=task-filter] [name=query]','');await api.fill('[data-form=task-filter] [name=projectId]','');await api.fill('[data-form=task-filter] [name=status]','pending');await api.fill('[data-form=task-filter] [name=allDates]',true);await api.submit('[data-form=task-filter]');
   await api.tap('[data-action=quadrant-focus][data-id="0"]');
   await body();
  }catch(error){await api.screenshot('failure-mobile-undo-reminder-fixture');throw error;}finally{
   await read(`(()=>{D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(${JSON.stringify(saved.core)});D4Prototype.repo.updateDemo(()=>(${JSON.stringify(saved.demo)}));});return true;})()`);
   assert.deepEqual(await undoEnvelope(),saved,'The reminder Undo fixture restores the entire prior workspace');
   await api.reload();await go('tasks');
  }
 }
 async function completeUndoReminder(){const p=await api.point('[data-task-id="d403-undo-0"] .task-title');await api.swipe([p.x,p.y],[p.x+100,p.y]);assert.equal(await read('D4Prototype.repo.getTask("d403-undo-0").done'),true);}
 for(const item of [{action:'complete',count:1},{action:'delete',count:1},{action:'complete',count:6}])await api.check('M-undo-reminders-'+item.action+'-'+item.count+' Real Undo retains the exact workspace after reminder reconciliation',()=>withUndoReminderFixture(item.count,async()=>{
  const before=await undoEnvelope();assert.equal(before.demo.personal.reminderNotices.length,Math.min(5,item.count));
  if(item.action==='complete')await completeUndoReminder();
  else{await api.tap('[data-task-id="d403-undo-0"] [data-action=task-menu]');await api.tap('[data-action=task-delete][data-id="d403-undo-0"]');await api.tap('[data-action=task-delete-confirm][data-id="d403-undo-0"]');assert.equal(await read('D4Prototype.repo.getTask("d403-undo-0")'),null);}
  const after=await undoEnvelope(),polled=await pollUndoReminders();
  assert.deepEqual(await undoEnvelope(),after,'The completion/deletion has already settled all of its own derived reminder changes');
  assert.equal(polled.notices.some(n=>n.taskId==='d403-undo-0'),false);
  assert.equal(Object.keys(polled.ledger).some(key=>key.startsWith('d403-undo-0|')),false);
  assert.equal(polled.notices.length,item.count===6?5:0);
  if(item.count===6)assert.equal(polled.notices.some(n=>n.taskId==='d403-undo-5'),true,'The sixth overdue reminder fills the freed slot before the Undo snapshot');
  await api.tap('#undo-notice [data-action=task-undo]');
  assert.deepEqual(await undoEnvelope(),before,'Real Undo restores exact task fields, receipts, notices and all unrelated workspace values');
 }));
 await api.check('M-undo-reminders-new-personal Real Undo removes a newly created reminder domain',()=>withUndoReminderFixture(2,async()=>{
  await pollUndoReminders();
  await read('D4Prototype.repo.updateDemo(d=>{delete d.personal;})');
  const before=await undoEnvelope();assert.equal(Object.hasOwn(before.demo,'personal'),false);
  await completeUndoReminder();
  assert.equal(await read('Object.hasOwn(D4Prototype.repo.demo,"personal")'),true,'The remaining overdue task creates its first reminder domain');
  const after=await undoEnvelope();await pollUndoReminders();assert.deepEqual(await undoEnvelope(),after);
  await api.tap('#undo-notice [data-action=task-undo]');
  assert.deepEqual(await undoEnvelope(),before,'Exact Undo replacement removes top-level fields introduced by this action');
 }));
 await api.check('M-undo-reminders-conflict Real later editor save still blocks whole-workspace Undo',()=>withUndoReminderFixture(1,async()=>{
  await completeUndoReminder();await pollUndoReminders();
  await api.tap('[data-task-id="d403-undo-later"] [data-action=task-open]');await api.fill('[data-form=task-edit] [name=notes]','Saved after completion; must survive rejected Undo');await api.tap('[data-form=task-edit] button[type=submit]');await api.tap('[data-action=close-modal]');
  const afterEdit=await undoEnvelope();assert.equal(afterEdit.core.tasks.find(t=>t.id==='d403-undo-later').notes,'Saved after completion; must survive rejected Undo');
  await api.tap('#undo-notice [data-action=task-undo]');
  assert.equal(await read('document.querySelector("#toast").textContent'),'期间数据已有改变，未覆盖后续修改');
  assert.deepEqual(await undoEnvelope(),afterEdit,'Rejected Undo preserves the subsequent real edit and completed task');
 }));
 await api.check('M-raw Tags with delimiters and multi-weekday rules survive actual editor save',async()=>{await read('D4Prototype.repo.updateTask("d4-task-0",{tags:["含,逗号","含，中文"],repeat:{frequency:"weekly",interval:1,weekdays:[1,3,5],until:"",anchor:DemoDomain.helpers.dayKey()+"T09:00"}})');await api.click('[data-task-id="d4-task-0"] [data-action=task-open]');await api.submit('[data-form=task-edit]');const t=await read('D4Prototype.repo.getTask("d4-task-0")');assert.deepEqual(t.tags,['含,逗号','含，中文']);assert.deepEqual(t.repeat.weekdays,[1,3,5]);await api.click('[data-task-id="d4-task-0"] [data-action=task-open]');await api.fill('[name=weekday]','2');await api.submit('[data-form=task-edit]');assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0").repeat.weekdays'),[2]);});
 await api.tap('[data-action=close-modal]');
 await api.check('M-swipe-cancel Touch move does not commit before release and cancellation preserves task',async()=>{const before=await read('D4Prototype.repo.getTask("d4-task-0")'),p=await api.point('[data-task-id="d4-task-0"] .task-title');await api.swipe([p.x,p.y],[p.x+100,p.y],{cancel:true,beforeRelease:async()=>{assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0")'),before);assert.equal(await read('!!document.querySelector(".task-menu-actions")'),false);}});assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0")'),before);});
 await api.check('M-zoom-cross Single quadrant has three live cross-move drop targets',async()=>{await api.tap('[data-action=quadrant-focus][data-id="0"]');const before=await read('D4Prototype.repo.getTask("d4-task-0")');assert.equal(await read('document.querySelectorAll(".quadrant-peek").length'),3);await api.drag('.single-quadrant [data-task-id="d4-task-0"] .task-title','.quadrant-peek[data-quadrant="1"]',{hold:3200});const after=await read('D4Prototype.repo.getTask("d4-task-0")');assert.equal(after.quadrant,1);for(const key of Object.keys(before).filter(k=>!['quadrant','order'].includes(k)))assert.deepEqual(after[key],before[key],key);await api.tap('[data-action=quadrant-back]');await api.tap('[data-task-id="d4-task-0"] [data-action=task-menu]');await api.tap('[data-action=task-move][data-id="d4-task-0|0"]');});
 await api.check('M-subtasks Touch order, one commit, immediate close and real keyboard order preserve siblings',async()=>{
  await api.tap('[data-task-id="d4-task-0"] [data-action=task-open]');
  const before=await read('D4Prototype.repo.getTask("d4-task-0")'),draft=before.notes+'\n子任务排序期间保留的父任务草稿';
  await api.fill('[data-form=task-edit] [name=notes]',draft);
  await api.drag('[data-subtask-list] [data-task-id="d4-sub-0"] .drag-handle','[data-subtask-list] [data-task-id="d4-sub-1"]',{hold:100,after:true});
  const after=await read('D4Prototype.repo.getTask("d4-task-0")');
  assert.deepEqual(after.subtasks.map(t=>t.id),['d4-sub-1','d4-sub-0']);
  assert.deepEqual(await read('[...document.querySelectorAll("[data-subtask-list] .task-row")].map(row=>row.dataset.taskId)'),['d4-sub-1','d4-sub-0'],'The visible sibling list follows touch order immediately');
  assert.equal(after.notes,before.notes,'Sorting does not silently save the parent draft');
  assert.equal(await read('document.querySelector("[data-form=task-edit] [name=notes]").value'),draft,'Sorting retains the unsaved parent field');
  for(const t of before.subtasks){const next=after.subtasks.find(x=>x.id===t.id);for(const key of Object.keys(t).filter(k=>k!=='order'))assert.deepEqual(next[key],t[key],key);}
  assert.equal(await read('D4Prototype.repo.state.tasks.some(t=>t.id==="d4-sub-0")'),false);
  // A real zero-movement handle touch commits once. Compatibility MouseEvents
  // must not start a second drag; its synthetic trailing click remains blocked.
  await read('(()=>{const probe={batches:0};probe.stop=D4Prototype.repo.subscribe((state,detail)=>{if(detail.type==="batch")probe.batches++;});window.__d4SubtaskGestureProbe=probe;return true;})()');
  try{
   const immediateStart=await read('performance.now()');
   await api.tap('[data-subtask-list] [data-task-id="d4-sub-0"] .drag-handle');
   assert.equal(await read('window.__d4SubtaskGestureProbe.batches'),1,'One real handle touch causes one repository batch');
   const replay=await read('(()=>{const handle=document.querySelector("[data-subtask-list] [data-task-id=\\"d4-sub-0\\"] .drag-handle"),r=handle.getBoundingClientRect(),options={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0};handle.dispatchEvent(new MouseEvent("mousedown",{...options,buttons:1}));handle.dispatchEvent(new MouseEvent("mouseup",{...options,buttons:0}));const target=handle.closest(".task-row").querySelector(".task-title"),event=new MouseEvent("click",{bubbles:true,cancelable:true});target.dispatchEvent(event);return {batches:window.__d4SubtaskGestureProbe.batches,prevented:event.defaultPrevented,dirty:!!document.querySelector(".dragging,.drag-ghost,.drop-target,.swiping")};})()');
   assert.equal(replay.batches,1,'Compatibility mouse replay cannot submit a second order change');
   assert.equal(replay.prevented,true,'The original task trailing click is still suppressed');
   assert.equal(replay.dirty,false,'Touch and compatibility events leave no active gesture decoration');
   assert.equal(await read('document.querySelector("[data-form=task-edit] [name=id]").value'),'d4-task-0','The trailing click does not open a child detail');
   assert.equal(await read('document.querySelector("[data-form=task-edit] [name=notes]").value'),draft,'Handle touch retains the parent draft');
   const closePoint=await api.point('[data-action=close-modal]');
   assert.equal(await read('(()=>{const target=document.querySelector("[data-action=close-modal]"),hit=document.elementFromPoint('+closePoint.x+','+closePoint.y+');return !!hit&&(hit===target||target.contains(hit));})()'),true,'The immediate close tap hits the actual close button');
   await api.tap('[data-action=close-modal]',closePoint);
   const immediateElapsed=(await read('performance.now()'))-immediateStart;
   assert.ok(immediateElapsed<500,'Real close elapsed '+immediateElapsed.toFixed(1)+'ms; it must complete inside the original 500ms trailing-click window');
   assert.equal(await read('!!document.querySelector("[data-form=task-edit]")'),false,'Real close dismisses the subtask editor');
   assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0").subtasks.map(t=>t.id)'),['d4-sub-1','d4-sub-0'],'Closing preserves the touch order');
   assert.equal(await read('D4Prototype.repo.getTask("d4-task-0").notes'),draft,'The explicit close saves the retained draft');
  }finally{await read('(()=>{window.__d4SubtaskGestureProbe?.stop();delete window.__d4SubtaskGestureProbe;return true;})()');}
  // Focus is not a touch: ArrowUp must perform the move itself and exercise
  // the existing keyboard action close behavior instead of a boundary toast.
  await api.tap('[data-task-id="d4-task-0"] [data-action=task-open]');
  assert.equal(await read('(()=>{const handle=document.querySelector("[data-subtask-list] [data-task-id=\\"d4-sub-0\\"] .drag-handle");handle.focus();return document.activeElement===handle;})()'),true);
  await api.key(null,'ArrowUp');
  assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0").subtasks.map(t=>t.id)'),['d4-sub-0','d4-sub-1'],'The keyboard itself moves the second child upward');
  assert.equal(await read('!!document.querySelector("[data-form=task-edit]")'),false,'Successful keyboard reorder retains its close behavior');
 });
 for(const pointerType of ['mouse','pen'])await api.check('M-'+pointerType+' Real CDP pointer sorting preserves task identity',async()=>{
  await api.tap('[data-task-id="d4-task-0"] [data-action=task-open]');
  const before=await read('D4Prototype.repo.getTask("d4-task-0")'),source='[data-subtask-list] [data-task-id="d4-sub-0"] .drag-handle',target='[data-subtask-list] [data-task-id="d4-sub-1"]';
  await api.configure(412,915,false);
  try{
   await api.mouseDrag(source,target,{pointerType,after:true});
   assert.deepEqual(await read('D4Prototype.repo.getTask("d4-task-0").subtasks.map(t=>t.id)'),['d4-sub-1','d4-sub-0']);
   assert.deepEqual(await read('[...document.querySelectorAll("[data-subtask-list] .task-row")].map(row=>row.dataset.taskId)'),['d4-sub-1','d4-sub-0']);
   await api.mouseDrag(source,target,{pointerType,after:false});
   const after=await read('D4Prototype.repo.getTask("d4-task-0")');
   assert.deepEqual(after.subtasks.map(t=>t.id),['d4-sub-0','d4-sub-1']);
   for(const t of before.subtasks){const next=after.subtasks.find(x=>x.id===t.id);for(const key of Object.keys(t).filter(k=>k!=='order'))assert.deepEqual(next[key],t[key],key);}
  }finally{await api.configure(412,915,true);}
  await api.tap('[data-action=close-modal]');
  assert.equal(await read('!!document.querySelector("[data-form=task-edit]")'),false);
 });
 // Real held touch must keep its source nodes while reminder state changes.
 async function withGestureRenderFixture(body){
  const saved=await read('({state:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
  try{
   await go('tasks');
   await read(`(()=>{const repo=D4Prototype.repo,state=repo.state;state.tasks=[];repo.batch(()=>{repo.replaceState(state);for(let i=0;i<3;i++)repo.createTask({id:'d403-render-'+i,title:'Held reminder task '+i,quadrant:0,start:DemoDomain.helpers.dayKey()+'T12:00',notes:'Exact raw note '+i,tags:['raw,tag']});});return true;})()`);
   await api.fill('[data-form=task-filter] [name=sort]','manual');await api.fill('[data-form=task-filter] [name=query]','');await api.fill('[data-form=task-filter] [name=projectId]','');await api.fill('[data-form=task-filter] [name=status]','pending');await api.fill('[data-form=task-filter] [name=allDates]',true);await api.submit('[data-form=task-filter]');
   await api.tap('[data-action=quadrant-focus][data-id="0"]');
   await body();
  }finally{
   await read(`(()=>{const p=window.__d403RenderProbe;if(p){p.stop();p.observer.disconnect();delete window.__d403RenderProbe;}DemoMobileControls.cancel();D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(${JSON.stringify(saved.state)});D4Prototype.repo.updateDemo(()=>(${JSON.stringify(saved.demo)}));});return true;})()`);
   await go('tasks');
   assert.deepEqual(await read('D4Prototype.repo.state'),saved.state,'Synthetic fixture restores all core values');
   assert.deepEqual(await read('D4Prototype.repo.demo'),saved.demo,'Synthetic fixture restores all demo values');
  }
 }
 const beginRenderProbe=()=>read(`(()=>{const row=document.querySelector('[data-task-id="d403-render-0"]'),p={row,replacements:0,batches:0};p.stop=D4Prototype.repo.subscribe((state,detail)=>{if(detail.type==='batch')p.batches++;});p.observer=new MutationObserver(records=>{p.replacements+=records.filter(r=>r.type==='childList'&&r.target===document.querySelector('#app')).length;});p.observer.observe(document.querySelector('#app'),{childList:true});window.__d403RenderProbe=p;return true;})()`);
 const changeReminderDuringTouch=()=>read(`(()=>{const repo=D4Prototype.repo;repo.updateDemo(d=>{d.personal=d.personal||{};d.personal.reminderLedger={'d403-expired-fixture|0':'sent'};d.personal.reminderNotices=[{key:'d403-expired-fixture|0',taskId:'d403-expired-fixture',title:'Removed synthetic reminder',at:0}];});DemoPersonalPages.reminders.check({repo,getState:D4Prototype.getState,esc:value=>String(value),toast:()=>{}},Date.now());return {ledger:repo.demo.personal.reminderLedger,notices:repo.demo.personal.reminderNotices};})()`);
 const heldRenderState=()=>read(`(()=>{const p=window.__d403RenderProbe;return {connected:p.row.isConnected,same:document.querySelector('[data-task-id="d403-render-0"]')===p.row,replacements:p.replacements,batches:p.batches,dragging:p.row.classList.contains('dragging'),ghost:!!document.querySelector('.drag-ghost')};})()`);
 for(const cancel of [false,true])await api.check('M-repository-held-'+(cancel?'cancel':'release')+' Reminder updates preserve held node and flush one render',()=>withGestureRenderFixture(async()=>{
  const before=await read('D4Prototype.repo.state.tasks');await beginRenderProbe();
  await api.drag('[data-task-id="d403-render-0"] .task-title','[data-task-id="d403-render-1"]',{
   hold:3200,after:true,cancel,
   afterDown:async()=>{
    assert.deepEqual(await changeReminderDuringTouch(),{ledger:{},notices:[]},'Authoritative reminder state changes immediately while the finger remains down');
    const held=await heldRenderState();assert.equal(held.connected,true);assert.equal(held.same,true);assert.equal(held.replacements,0,'No repo render replaces the pre-longpress source');
    assert.deepEqual(await read('D4Prototype.repo.state.tasks'),before);
   },
   beforeMove:async()=>{
    const held=await heldRenderState();assert.equal(held.connected,true);assert.equal(held.same,true);assert.equal(held.dragging,true,'Original row activates before the first MOVE');assert.equal(held.ghost,true);assert.equal(held.replacements,0);
    assert.deepEqual(await read('D4Prototype.repo.state.tasks'),before,'Holding alone cannot commit an order change');
   },
   beforeRelease:async()=>{
    const held=await heldRenderState();assert.equal(held.connected,true);assert.equal(held.same,true);assert.equal(held.replacements,0);assert.equal(held.batches,0);
    assert.deepEqual(await read('D4Prototype.repo.state.tasks'),before,'No task field changes before real UP or CANCEL');
   }
  });
  const observed=await heldRenderState(),after=await read('D4Prototype.repo.state.tasks');
  assert.equal(observed.replacements,1,'Queued reminder updates and the final order commit coalesce into one render');
  assert.equal(observed.connected,false);assert.equal(observed.batches,cancel?0:1,'Only a released gesture submits one order batch');
  assert.equal(await read('!!document.querySelector(".dragging,.drag-ghost,.drop-target,.swiping")'),false);
  if(cancel)assert.deepEqual(after,before,'Real cancellation preserves every raw task field');
  else{
   assert.deepEqual(await read('[...document.querySelectorAll(".single-quadrant .task-row")].map(row=>row.dataset.taskId)'),['d403-render-1','d403-render-0','d403-render-2'],'The actual release reorders the visible rows');
   const raw=tasks=>tasks.map(task=>{const copy=structuredClone(task);delete copy.order;return copy;}).sort((a,b)=>a.id.localeCompare(b.id));
   assert.deepEqual(raw(after),raw(before),'Reorder preserves all non-order raw fields');
  }
 }));
 await api.check('M-repository-held-navigation Explicit navigation cancels touch and renders immediately',()=>withGestureRenderFixture(async()=>{
  const before=await read('D4Prototype.repo.state.tasks'),p=await api.point('[data-task-id="d403-render-0"] .task-title');await beginRenderProbe();
  await api.swipe([p.x,p.y],[p.x+35,p.y],{cancel:true,beforeRelease:async()=>{
   await changeReminderDuringTouch();assert.equal((await heldRenderState()).replacements,0);
   await go('notes');assert.equal(await read('document.querySelector("main").dataset.route'),'notes','Explicit navigation is never held behind a repository refresh');
   assert.equal(await read('!!document.querySelector(".dragging,.drag-ghost,.drop-target,.swiping")'),false);
  }});
  assert.equal(await read('D4Prototype.getRoute()'),'notes');assert.deepEqual(await read('D4Prototype.repo.state.tasks'),before);assert.equal((await heldRenderState()).replacements,1,'Explicit navigation consumes the pending refresh without a second render');
 }));

 await api.check('M-large Real scroll and held drag auto-scroll preserve every task',async()=>{assert.equal(await read('!!document.querySelector("#modal-root .modal-shade")'),false,'Long-list drag starts on an unobstructed board');await read('(()=>{D4Prototype.repo.batch(()=>{for(let i=0;i<45;i++)D4Prototype.repo.createTask({id:"d403-scroll-"+i,title:"合成长列表 "+i,quadrant:0,start:DemoDomain.helpers.dayKey()+"T12:00"});});return true;})()');await api.tap('[data-action=quadrant-focus][data-id="0"]');const list='[data-quadrant="0"] .quadrant-list',before=await read('D4Prototype.repo.state.tasks.length');await api.holdScroll('[data-task-id="d4-task-0"] .task-title',list,3200);assert.ok(await read('document.querySelector('+JSON.stringify(list)+').scrollTop')>0);assert.equal(await read('D4Prototype.repo.state.tasks.length'),before);await api.screenshot('mobile-long-list-scroll');await api.tap('[data-action=quadrant-back]');});
}
