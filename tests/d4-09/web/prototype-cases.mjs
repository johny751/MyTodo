import assert from 'node:assert/strict';

// GitHub Actions browser checks for the memory-only design prototype.
// Buttons and keyboard use the harness's real CDP input. Form values use DOM
// input/change events. DOM Range checks prove selectable rendering, not touch
// long-press, OS selection handles, persistence or production acceptance.
const js = value => JSON.stringify(value);
const q = selector => `document.querySelector(${js(selector)})`;
const all = selector => `Array.from(document.querySelectorAll(${js(selector)}))`;
const text = selector => `${q(selector)}?.textContent`;
const count = selector => `document.querySelectorAll(${js(selector)}).length`;
const close = '#editor-dialog .dialog-head [data-action="editor-close"]';
const save = '#editor-dialog [data-save-editor]';
const smallSave = '#editor-dialog button[type="submit"][form="small-editor"]';
const names = {
  dashboard:'工作台',tasks:'四象限',notes:'独立便签',pomodoro:'番茄钟',analytics:'统计分析',
  feedback:'优化意见',catalogs:'分类管理',timeline:'任务时间轴','work-items':'工作事项',
  projects:'项目管理',templates:'流程模板',processes:'流程实例',contacts:'往来与跟进',
  archive:'工作归档',sync:'同步中心',devices:'设备管理','data-system':'数据与系统',
  settings:'系统设置',about:'关于与版本'
};
// Navigation names identify destinations; editorial page headings may differ.
const pageTitles = {...names,dashboard:'今天，把重要的事往前推进',about:'关于 MyTodo'};

async function tap(a, selector) {
  assert.equal(await a.eval(count(selector)),1,`Unique click target: ${selector}`);
  await a.click(selector);
}
async function route(a,id) {
  if (await a.eval('innerWidth <= 640 && !document.querySelector(".app").classList.contains("nav-open")')) {
    await tap(a,'[data-action="nav-toggle"]');
  }
  await tap(a,`.nav-link[data-action="go"][data-id="${id}"]`);
  await a.until(`${q('#page')}.dataset.route === ${js(id)}`,`Reached ${id}`);
  assert.equal(await a.eval(text('.nav-link[aria-current="page"] span')),names[id]);
  assert.equal(await a.eval(text('.breadcrumb strong')),names[id]);
  assert.equal(await a.eval(text('#page h1')),pageTitles[id]);
}
async function ready(a) {
  assert.equal(await a.eval(`${q('#page')}.dataset.route`),'dashboard','Fresh browser context');
  const initial = await a.eval('window.D409WebPrototype.inspect()');
  assert.equal(initial.storage,'memory-only');
  assert.equal(initial.network,false);
  assert.deepEqual(initial.counts,{items:5,projects:3,templates:2,processes:2,contacts:2,feedback:2,tasks:7,notes:3});
}
async function has(a,selector,value) {
  const actual = await a.eval(text(selector));
  assert.ok(typeof actual==='string' && actual.includes(value),`${selector} contains ${value}`);
}
async function field(a,name,value,form='#entity-editor') {
  await a.fill(`${form} [name="${name}"]`,value);
}
async function saved(a,selector=save) {
  await tap(a,selector);
  await a.until(`!${q('#editor-dialog')}.open`,'Editor closed after successful save');
}
async function confirm(a,action='confirm-accept') {
  await a.until(`${q('#confirm-dialog')}.open`,'Confirmation opened');
  await tap(a,`#confirm-dialog [data-action="${action}"]`);
}
async function top(a) {
  await a.eval(`${q('#page')}.scrollTop=0`);
  await a.settle();
}
async function layout(a) {
  const geometry=await a.eval(`(()=>{const p=document.querySelector('#page'),r=p.getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,pageWidth:p.clientWidth,pageScrollWidth:p.scrollWidth,pageLeft:r.left,pageRight:r.right}})()`);
  assert.ok(geometry.documentWidth<=geometry.width+1,'No document horizontal overflow');
  assert.ok(geometry.pageScrollWidth<=geometry.pageWidth+1,'No page horizontal overflow');
  assert.ok(geometry.pageLeft>=-1 && geometry.pageRight<=geometry.width+1,'Main page fits viewport');
  await a.observe({layout:geometry,units:'CSS pixels'});
}
async function closedMobileNavigation(a,label) {
  // Check immediately after the normal two-frame layout settle. Do not retry or
  // wait for the old transform animation, which used to block the first click.
  const geometry=await a.eval(`(()=>{const b=document.querySelector('[data-action="nav-toggle"]'),s=document.querySelector('.sidebar'),shade=document.querySelector('.nav-shade'),r=b.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),style=getComputedStyle(s),sr=s.getBoundingClientRect();return {width:innerWidth,open:document.querySelector('.app').classList.contains('nav-open'),button:{left:r.left,top:r.top,width:r.width,height:r.height},hit:h?.closest('[data-action]')?.dataset.action||h?.tagName,hitInsideButton:h===b||b.contains(h),sidebar:{left:sr.left,right:sr.right,visibility:style.visibility,pointerEvents:style.pointerEvents,transition:style.transitionProperty},shadeDisplay:getComputedStyle(shade).display}})()`);
  await a.observe({navigationAfterResize:label,geometry});
  assert.equal(geometry.open,false,'Navigation starts closed');
  assert.equal(geometry.sidebar.visibility,'hidden','Closed narrow navigation does not paint over content');
  assert.equal(geometry.sidebar.pointerEvents,'none','Closed narrow navigation cannot intercept input');
  assert.equal(geometry.shadeDisplay,'none','Closed navigation has no active shade');
  assert.equal(geometry.hitInsideButton,true,'First menu click is unobscured immediately after resize');
}
async function newEntity(a,kind,title,extra={}) {
  await tap(a,`#page .page-actions [data-action="new"][data-id="${kind}"]`);
  await field(a,'title',title);
  for (const [key,value] of Object.entries(extra)) await field(a,key,value);
  await saved(a);
}
async function selected(a,routeId) {
  return await a.eval(`window.D409WebPrototype.inspect().selected[${js(routeId)}]`);
}

export const cases = [
  {
    id:'W409-P01',name:'All 20 routes are reachable through visible navigation and task controls',
    async run(a) {
      await ready(a);
      assert.equal(await a.eval(count('.nav-link')),19);
      const visited=[];
      for (const id of Object.keys(names)) {
        await route(a,id);
        visited.push(id);
        await layout(a);
        if (id==='dashboard') {await top(a);await a.screenshot('web-desktop-dashboard');}
        if (id==='work-items') {await top(a);await a.screenshot('web-desktop-work-list-detail');}
      }
      await route(a,'tasks');
      await tap(a,'[data-action="task-view"][data-id="t1"]');
      assert.equal(await a.eval(`${q('#page')}.dataset.route`),'task-detail');
      await has(a,'[data-detail="t1"]','确认本周交付清单');
      visited.push('task-detail');
      assert.equal(new Set(visited).size,20);
      await a.observe({visitedRoutes:visited,navigation:'real mouse on sidebar and task controls'});
    }
  },
  {
    id:'W409-P02',name:'Work creation, edit, archive, restore and guarded deletion preserve content',
    async run(a) {
      await ready(a);await route(a,'work-items');
      await newEntity(a,'items','云端原型工作事项',{notes:'第一行：明确下一步。\n第二行：保留完整历史。',projectId:'p2',owner:'回归负责人',next:'核对回归结果'});
      const id=await selected(a,'work-items');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.items'),6);
      await has(a,`[data-detail="${id}"]`,'回归负责人');
      await has(a,`[data-detail="${id}"] [data-selectable-note]`,'第二行：保留完整历史。');
      await tap(a,`[data-action="edit"][data-id="items|${id}"]`);
      assert.equal(await a.eval(`${q('#entity-editor [name="projectId"]')}.value`),'p2');
      await field(a,'title','云端原型工作事项 · 已编辑');await saved(a);
      await has(a,`[data-detail="${id}"] .timeline-list`,'更新记录');
      await has(a,`[data-detail="${id}"] .timeline-list`,'新建事项');
      await tap(a,`[data-action="archive"][data-id="items|${id}"]`);await confirm(a,'confirm-cancel');
      assert.equal(await a.eval(count(`[data-detail="${id}"]`)),1,'Cancel keeps item visible');
      await tap(a,`[data-action="archive"][data-id="items|${id}"]`);await confirm(a);
      assert.equal(await a.eval(count(`tr[data-record="${id}"]`)),0);
      await route(a,'archive');await has(a,'#page','云端原型工作事项 · 已编辑');
      await tap(a,`[data-action="restore"][data-id="items|${id}"]`);
      await route(a,'work-items');await tap(a,`[data-action="select"][data-id="items|${id}"]`);
      await has(a,`[data-detail="${id}"] [data-selectable-note]`,'第二行：保留完整历史。');
      await tap(a,`[data-action="delete"][data-id="items|${id}"]`);await confirm(a,'confirm-cancel');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.items'),6);
      await tap(a,`[data-action="delete"][data-id="items|${id}"]`);await confirm(a);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.items'),5);
      assert.equal(await a.eval(count(`tr[data-record="${id}"]`)),0);
    }
  },
  {
    id:'W409-P03',name:'Project CRUD retains members and color; referenced projects resist deletion',
    async run(a) {
      await ready(a);await route(a,'projects');
      await tap(a,'[data-action="delete"][data-id="projects|p1"]');
      await has(a,'#editor-title','项目仍有关联记录');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.projects'),3);
      await tap(a,close);
      await newEntity(a,'projects','无关联回归项目',{members:'成员甲、成员乙',color:'q3',notes:'项目完整说明',due:'2026-12-12'});
      const id=await selected(a,'projects');
      await tap(a,`[data-action="edit"][data-id="projects|${id}"]`);
      assert.equal(await a.eval(`${q('#entity-editor [name="members"]')}.value`),'成员甲、成员乙');
      assert.equal(await a.eval(`${q('#entity-editor [name="color"]')}.value`),'q3');
      await field(a,'owner','新负责人');await saved(a);
      await has(a,`[data-detail="${id}"]`,'新负责人');
      await tap(a,`[data-action="delete"][data-id="projects|${id}"]`);await confirm(a);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.projects'),3);
    }
  },
  {
    id:'W409-P04',name:'Dirty editor supports continue, discard and save-before-close without losing drafts',
    async run(a) {
      await ready(a);await route(a,'work-items');
      const initial=await a.eval(text('[data-detail="w1"] [data-selectable-note]'));
      await tap(a,'[data-action="edit"][data-id="items|w1"]');
      await field(a,'notes','尚未保存的两行草稿\n必须仍然可编辑');
      await tap(a,close);await confirm(a,'confirm-cancel');
      assert.equal(await a.eval(`${q('#editor-dialog')}.open`),true);
      assert.equal(await a.eval(`${q('#entity-editor [name="notes"]')}.value`),'尚未保存的两行草稿\n必须仍然可编辑');
      await tap(a,close);await confirm(a);
      assert.equal(await a.eval(`${q('#editor-dialog')}.open`),false);
      assert.equal(await a.eval(text('[data-detail="w1"] [data-selectable-note]')),initial);
      await tap(a,'[data-action="edit"][data-id="items|w1"]');
      await field(a,'notes','保存并关闭后的完整草稿\n第二行原样保留');
      await a.key(null,'Escape');await confirm(a,'confirm-save');
      await a.until(`!${q('#editor-dialog')}.open`,'Save-and-close completed');
      assert.equal(await a.eval(text('[data-detail="w1"] [data-selectable-note]')),'保存并关闭后的完整草稿\n第二行原样保留');
    }
  },
  {
    id:'W409-P05',name:'Failed save retains the exact draft and retry commits it once',
    async run(a) {
      await ready(a);await route(a,'settings');await tap(a,'[data-action="error-demo"]');
      await route(a,'work-items');await tap(a,'[data-action="edit"][data-id="items|w1"]');
      const original=await a.eval(text('[data-detail="w1"] [data-selectable-note]'));
      const draft='失败时仍保留：中文、标点与 <原文>。\nRetry preserves the second line.';
      await field(a,'notes',draft);await tap(a,save);
      assert.equal(await a.eval(`${q('#editor-dialog')}.open`),true);
      assert.equal(await a.eval(`${q('#entity-editor [name="notes"]')}.value`),draft);
      assert.equal(await a.eval(text('[data-detail="w1"] [data-selectable-note]')),original);
      await has(a,'#editor-error','演示保存失败');await has(a,save,'重试保存');
      await a.screenshot('web-save-failure-draft-retained');
      await saved(a);
      assert.equal(await a.eval(text('[data-detail="w1"] [data-selectable-note]')),draft);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.items'),5);
      assert.equal(await a.eval(count('[data-detail="w1"] .timeline-list li')),3,'One history entry after retry');
    }
  },
  {
    id:'W409-P06',name:'Search, status, project, compact density and empty-state creation are interactive',
    async run(a) {
      await ready(a);await route(a,'work-items');
      assert.equal(await a.eval(count('tr[data-record]')),4);
      await a.fill('[data-filter="query"]','交付材料');
      assert.deepEqual(await a.eval(`${all('tr[data-record]')}.map(e=>e.dataset.record)`),['w2']);
      await a.fill('[data-filter="query"]','');await a.fill('[data-filter="status"]','doing');
      assert.deepEqual(await a.eval(`${all('tr[data-record]')}.map(e=>e.dataset.record)`),['w1']);
      await a.fill('[data-filter="project"]','p2');
      assert.equal(await a.eval(count('tr[data-record]')),0);
      await tap(a,'[data-action="clear-filter"]');
      assert.equal(await a.eval(count('tr[data-record]')),4);
      await tap(a,'[data-action="menu"]');await tap(a,'[role="menuitem"][data-action="density"]');
      assert.equal(await a.eval(`${q('.app')}.classList.contains('compact')`),true);
      await tap(a,'[data-action="menu"]');await tap(a,'[role="menuitem"][data-action="empty-demo"]');
      assert.equal(await a.eval(count('tr[data-record]')),0);
      await tap(a,'.list-panel .empty [data-action="new"][data-id="items"]');
      await field(a,'title','从空状态新建的事项');await saved(a);
      assert.equal(await a.eval(count('tr[data-record]')),5,'Saved item exits empty demonstration');
      await has(a,'.detail','从空状态新建的事项');
    }
  },
  {
    id:'W409-P07',name:'Template version and process snapshot remain separate through pause, advance and completion',
    async run(a) {
      await ready(a);await route(a,'templates');
      await tap(a,'[data-action="delete"][data-id="templates|tp1"]');
      await has(a,'#editor-title','模板正在使用');await tap(a,close);
      await tap(a,'[data-action="edit"][data-id="templates|tp1"]');
      await field(a,'stepLines','确认回归目标\n完成实际验证\n整理证据');await saved(a);
      await has(a,'[data-detail="tp1"]','步骤定义 · v4');
      await tap(a,'[data-action="instantiate"][data-id="tp1"]');
      await field(a,'title','独立快照流程','#small-editor');await saved(a,smallSave);
      const id=await selected(a,'processes');
      const steps=await a.eval(`${all(`[data-detail="${id}"] .work-flow li`)}.map(e=>e.lastChild.textContent)`);
      assert.deepEqual(steps,['确认回归目标','完成实际验证','整理证据']);
      await tap(a,`[data-action="process-toggle"][data-id="${id}"]`);
      await has(a,`[data-detail="${id}"] > .panel-body > .status`,'已暂停');
      await tap(a,`[data-action="process-next"][data-id="${id}"]`);
      await has(a,'#web-toast','请先继续流程');
      await has(a,`[data-detail="${id}"] .work-flow .current`,'确认回归目标');
      await tap(a,`[data-action="process-toggle"][data-id="${id}"]`);
      await tap(a,`[data-action="process-next"][data-id="${id}"]`);
      await has(a,`[data-detail="${id}"] .work-flow .current`,'完成实际验证');
      await route(a,'templates');await tap(a,'[data-action="edit"][data-id="templates|tp1"]');
      await field(a,'stepLines','后续模板定义\n不会覆盖已有实例');await saved(a);
      await has(a,'[data-detail="tp1"]','步骤定义 · v5');
      await route(a,'processes');await tap(a,`[data-action="select"][data-id="processes|${id}"]`);
      assert.deepEqual(await a.eval(`${all(`[data-detail="${id}"] .work-flow li`)}.map(e=>e.lastChild.textContent)`),steps);
      await tap(a,`[data-action="process-next"][data-id="${id}"]`);
      await tap(a,`[data-action="process-next"][data-id="${id}"]`);
      await has(a,`[data-detail="${id}"] > .panel-body > .status`,'已完成');
      assert.equal(await a.eval(count(`[data-action="process-next"][data-id="${id}"]`)),0);
      await a.screenshot('web-process-completed-snapshot');
    }
  },
  {
    id:'W409-P08',name:'Contact follow-up create, edit, complete and reopen preserve separate records',
    async run(a) {
      await ready(a);await route(a,'contacts');
      await tap(a,'[data-action="followup-new"][data-id="c1"]');
      await field(a,'title','确认原型回归材料','#small-editor');
      await field(a,'notes','先确认来源，再归档记录。','#small-editor');await saved(a,smallSave);
      const id=await a.eval(`${q('[data-detail="c1"] [data-action="followup-edit"]')}.dataset.id`);
      assert.notEqual(id,'c1|f1');
      await tap(a,`[data-action="followup-edit"][data-id="${id}"]`);
      assert.equal(await a.eval(`${q('#small-editor [name="notes"]')}.value`),'先确认来源，再归档记录。');
      await field(a,'notes','已经核对来源。\n还需要保留回执。','#small-editor');await saved(a,smallSave);
      await tap(a,`[data-action="followup-toggle"][data-id="${id}"]`);
      await has(a,`[data-action="followup-toggle"][data-id="${id}"]`,'重新跟进');
      await tap(a,`[data-action="followup-toggle"][data-id="${id}"]`);
      await has(a,`[data-action="followup-toggle"][data-id="${id}"]`,'完成跟进');
      await has(a,'[data-detail="c1"]','还需要保留回执。');
      assert.equal(await a.eval(count('[data-detail="c1"] [data-action="followup-edit"]')),2,'Existing follow-up retained');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.contacts'),2);
      await a.observe({scope:'prototype follow-up UI only',priorHumanAcceptance:'unknown; unchanged'});
    }
  },
  {
    id:'W409-P09',name:'Task multiline keyboard, children, menu move, quadrant zoom and completion work together',
    async run(a) {
      await ready(a);await route(a,'tasks');
      await tap(a,'#page .page-actions [data-action="new"][data-id="tasks"]');
      await field(a,'title','多行任务标题');
      await a.key('#entity-editor [name="title"]','End',2);
      await a.key(null,'Enter');
      assert.equal(await a.eval(`${q('#editor-dialog')}.open`),true,'Plain Enter does not submit task textarea');
      assert.equal(await a.eval(`${q('#entity-editor [name="title"]')}.value`),'多行任务标题\n');
      await field(a,'title','多行任务标题\n第二行');await a.key(null,'Enter',2);
      await a.until(`!${q('#editor-dialog')}.open`,'Ctrl+Enter saves');
      const id=await selected(a,'tasks');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.tasks'),8);
      await tap(a,`[data-action="task-view"][data-id="${id}"]`);
      await tap(a,`[data-action="child-add"][data-id="${id}"]`);
      await field(a,'title','回归子任务\n保留原文','#small-editor');await a.key(null,'Enter',2);
      await a.until(`!${q('#editor-dialog')}.open`,'Ctrl+Enter saves child');
      const child=await a.eval(`${q(`[data-detail="${id}"] [data-action="child-toggle"]`)}.dataset.id`);
      await tap(a,`[data-action="child-toggle"][data-id="${child}"]`);
      await has(a,`[data-action="child-toggle"][data-id="${child}"]`,'✓');
      await route(a,'tasks');
      await tap(a,`[data-action="task-menu"][data-id="${id}"]`);
      await tap(a,`[data-action="task-move"][data-id="${id}"]`);
      assert.equal(await a.eval(`${q(`[data-task-row="${id}"]`)}.closest('[data-quadrant]').dataset.quadrant`),'1');
      await tap(a,'[data-action="zoom"][data-id="1"]');
      assert.equal(await a.eval(count('[data-quadrant]')),1);
      await tap(a,'[data-action="zoom"][data-id="all"]');
      assert.equal(await a.eval(count('[data-quadrant]')),4);
      await tap(a,`[data-action="task-toggle"][data-id="${id}"]`);
      assert.equal(await a.eval(count(`[data-task-row="${id}"]`)),0,'Completed task leaves pending view');
      await tap(a,'[data-action="task-mode"][data-id="done"]');
      assert.equal(await a.eval(count(`[data-task-row="${id}"]`)),1);
      await a.observe({taskMove:'visible menu action',dragAndDropExercised:false});
    }
  },
  {
    id:'W409-P10',name:'Timer task search, navigation, pause, resume and early-end history follow real elapsed time',
    async run(a) {
      await ready(a);await route(a,'pomodoro');
      await tap(a,'[data-action="timer-settings"]');
      await field(a,'minutes','2','#small-editor');await saved(a,smallSave);
      assert.equal(await a.eval(text('#timer-clock')),'02:00');
      await tap(a,'[data-action="timer-pick"]');await a.fill('[name="picker-query"]','不存在的任务');
      await has(a,'#editor-dialog','没有匹配任务');
      await a.fill('[name="picker-query"]','确认本周');
      await tap(a,'.task-picker > li:not(.child) [data-action="timer-select"][data-id="t1"]');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().timer.taskId'),'t1');
      await has(a,'.timer-task','确认本周交付清单');
      await tap(a,'[data-action="timer-toggle"]');
      await a.until('window.D409WebPrototype.inspect().timer.remaining < 120','Real elapsed second',5000);
      await route(a,'dashboard');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().timer.running'),true);
      await route(a,'pomodoro');await tap(a,'[data-action="timer-toggle"]');
      const paused=await a.eval('window.D409WebPrototype.inspect().timer');
      assert.equal(paused.running,false);assert.ok(paused.remaining<120 && paused.remaining>0);
      await route(a,'notes');await route(a,'pomodoro');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().timer.remaining'),paused.remaining);
      await top(a);await a.screenshot('web-desktop-timer-paused-history');
      await tap(a,'[data-action="timer-toggle"]');
      await a.until(`window.D409WebPrototype.inspect().timer.remaining < ${paused.remaining}`,'Resumed real elapsed second',5000);
      await tap(a,'[data-action="timer-end"]');await confirm(a);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().timer.running'),false);
      assert.equal(await a.eval(count('.history-row')),4);
      await has(a,'.history-row:first-of-type','确认本周交付清单');
      await has(a,'.history-row:first-of-type','提前结束');
      await a.fill('[data-filter="history"]','完成专注');assert.equal(await a.eval(count('.history-row')),2);
      await a.fill('[data-filter="history"]','提前结束');assert.equal(await a.eval(count('.history-row')),2);
      await a.observe({actualTimerSecondsObserved:120-paused.remaining,naturalCompletionExercised:false,backgroundOSServiceExercised:false});
    }
  },
  {
    id:'W409-P11',name:'List menu keyboard and global-search Escape restore predictable focus',
    async run(a) {
      await ready(a);await route(a,'work-items');await tap(a,'[data-action="menu"]');
      assert.equal(await a.eval('document.activeElement.dataset.action'),'density');
      await a.key(null,'End');assert.equal(await a.eval('document.activeElement.dataset.action'),'export');
      await a.key(null,'Home');assert.equal(await a.eval('document.activeElement.dataset.action'),'density');
      await a.key(null,'ArrowDown');assert.equal(await a.eval('document.activeElement.dataset.action'),'empty-demo');
      await a.key(null,'ArrowUp');assert.equal(await a.eval('document.activeElement.dataset.action'),'density');
      await a.key(null,'Escape');assert.equal(await a.eval(count('[role="menu"]')),0);
      assert.equal(await a.eval('document.activeElement.dataset.action'),'menu');
      await a.key(null,'k',2);assert.equal(await a.eval('document.activeElement.dataset.focus'),'global-search');
      await a.fill('.search [name="query"]','确认本周交付清单');
      await a.key('.search [name="query"]','Enter');
      await has(a,'#editor-title','搜索结果');
      await tap(a,'#editor-dialog [data-action="edit-after-close"][data-id="tasks|t1"]');
      assert.equal(await a.eval(`${q('#entity-editor [name="title"]')}.value`),'确认本周交付清单');
      await tap(a,close);
      await tap(a,'[data-action="reminders"]');await a.key(null,'Escape');
      assert.equal(await a.eval(`${q('#editor-dialog')}.open`),false);
      assert.equal(await a.eval('document.activeElement.dataset.action'),'reminders');
    }
  },
  {
    id:'W409-P12',name:'Notes retain multiline content through create, search, edit and delete',
    async run(a) {
      await ready(a);await route(a,'notes');
      const note='第一段需要完整保留。\n\n第二段包含 <标签> & 符号，不作为HTML执行。';
      await newEntity(a,'notes','回归独立便签',{notes:note});
      const id=await selected(a,'notes');
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.notes'),4);
      await a.fill('[data-filter="query"]','回归独立便签');
      assert.equal(await a.eval(count('.note-card')),1);
      assert.equal(await a.eval(text('.note-card p')),note);
      await tap(a,`[data-action="edit"][data-id="notes|${id}"]`);
      assert.equal(await a.eval(`${q('#entity-editor [name="notes"]')}.value`),note);
      await field(a,'notes',note+'\n追加结论。');await saved(a);
      await has(a,'.note-card p','追加结论。');
      await tap(a,`[data-action="delete"][data-id="notes|${id}"]`);await confirm(a);
      assert.equal(await a.eval(count('.note-card')),0);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.notes'),3);
      await a.fill('[data-filter="query"]','');assert.equal(await a.eval(count('.note-card')),3);
    }
  },
  {
    id:'W409-P13',name:'Feedback draft text and category persist through edit and confirmed deletion',
    async run(a) {
      await ready(a);await route(a,'feedback');
      await newEntity(a,'feedback','回归意见记录',{notes:'正文第一行\n正文第二行',category:'界面问题',status:'draft'});
      const id=await selected(a,'feedback');
      await has(a,`[data-detail="${id}"] > .panel-body > .status`,'草稿');
      await tap(a,`[data-action="edit"][data-id="feedback|${id}"]`);
      assert.equal(await a.eval(`${q('#entity-editor [name="category"]')}.value`),'界面问题');
      assert.equal(await a.eval(`${q('#entity-editor [name="notes"]')}.value`),'正文第一行\n正文第二行');
      assert.equal(await a.eval(count('#entity-editor input[type="file"][name="images"]')),1);
      await field(a,'status','submitted');await saved(a);
      await has(a,`[data-detail="${id}"] > .panel-body > .status`,'已记录');
      await tap(a,`[data-action="delete"][data-id="feedback|${id}"]`);await confirm(a);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.feedback'),2);
      await a.observe({imageSystemPickerExercised:false,imagePersistenceExercised:false,remoteSubmission:false});
    }
  },
  {
    id:'W409-P14',name:'Settings loading, density and V2 prototype panel remain separate from main task counts',
    async run(a) {
      await ready(a);await route(a,'settings');
      await a.fill('[data-filter="density"]','compact');assert.equal(await a.eval(`${q('.app')}.classList.contains('compact')`),true);
      await a.fill('[data-filter="density"]','comfortable');assert.equal(await a.eval(`${q('.app')}.classList.contains('compact')`),false);
      await tap(a,'[data-action="loading-demo"]');
      await a.until(`!!${q('#page [aria-busy="true"]')}`,'Loading feedback visible');
      await a.until(`!!${q('#v2-prototype-panel')}`,'Loading resolves locally',5000);
      await tap(a,'[data-action="service-open"]');
      for (const title of ['隔离面板任务一','隔离面板任务二']) {
        await tap(a,'[data-action="service-new"]');await field(a,'title',title,'#small-editor');await saved(a,smallSave);
      }
      assert.equal(await a.eval(count('#v2-prototype-panel [data-action="service-remove"]')),2);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.tasks'),7);
      await a.screenshot('web-desktop-settings-v2');
      await tap(a,'[data-action="service-remove"][data-id="0"]');
      await has(a,'#v2-prototype-panel','隔离面板任务二');
      await tap(a,'[data-action="service-clear"]');await confirm(a,'confirm-cancel');
      assert.equal(await a.eval(count('#v2-prototype-panel [data-action="service-remove"]')),1);
      await tap(a,'[data-action="service-clear"]');await confirm(a);
      assert.equal(await a.eval(count('#v2-prototype-panel [data-action="service-remove"]')),0);
      assert.equal(await a.eval('window.D409WebPrototype.inspect().counts.tasks'),7);
      await a.observe({v2:'memory-only visual panel; actual V2 service/storage not invoked'});
    }
  },
  {
    id:'W409-P15',name:'360 and 412 layouts navigate, return from details and edit with no horizontal overflow',
    async run(a) {
      await ready(a);
      for (const width of [360,412]) {
        await a.configure(1440,960,false);
        await a.configure(width,900,true);
        await closedMobileNavigation(a,`desktop-to-${width}`);
        for (const id of ['dashboard','tasks','notes','pomodoro','settings']) {
          await route(a,id);await layout(a);
          if (id==='dashboard' || id==='pomodoro') {await top(a);await a.screenshot(`web-${width}-${id}`);}
        }
        await route(a,'work-items');
        assert.equal(await a.eval('getComputedStyle(document.querySelector(".list-panel")).display'),'none');
        await top(a);await layout(a);await a.screenshot(`web-${width}-work-detail`);
        await tap(a,'.detail-back[data-action="detail-close"]');
        assert.notEqual(await a.eval('getComputedStyle(document.querySelector(".list-panel")).display'),'none');
        await layout(a);await a.screenshot(`web-${width}-work-list`);
        await tap(a,'[data-action="select"][data-id="items|w1"]');
        await tap(a,'[data-action="edit"][data-id="items|w1"]');
        await field(a,'notes',`宽度 ${width} 的原型编辑。\n仍能找到保存按钮。`);
        const dialog=await a.eval(`(()=>{const d=document.querySelector('#editor-dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,client:d.clientWidth,scroll:d.scrollWidth}})()`);
        assert.ok(dialog.left>=0 && dialog.right<=dialog.width+1 && dialog.scroll<=dialog.client+1,'Editor fits narrow viewport');
        await saved(a);
        await has(a,'[data-detail="w1"] [data-selectable-note]',`宽度 ${width}`);
        await layout(a);
      }
    }
  },
  {
    id:'W409-P16',name:'Long work notes remain exact, unclipped and visibly selectable at desktop, 360 and 412',
    async run(a) {
      await ready(a);await route(a,'work-items');
      const note=Array.from({length:18},(_,i)=>`第 ${String(i+1).padStart(2,'0')} 条历史：2026-11-28 09:${String(i).padStart(2,'0')} +08:00 · 保留完整记录、负责人以及下一步行动。`).join('\n')+'\n'+('LongUnbrokenHistoricalReference_'.repeat(8))+'\n结束标记：原文完整。';
      await tap(a,'[data-action="edit"][data-id="items|w1"]');await field(a,'notes',note);await saved(a);
      for (const width of [1440,360,412]) {
        await a.configure(width,960,width<640);
        const selector='[data-detail="w1"] [data-selectable-note]';
        assert.equal(await a.eval(text(selector)),note,'Exact Unicode, line breaks and historical text retained');
        const reading=await a.eval(`(()=>{const e=${q(selector)},s=getComputedStyle(e);return {clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflowY:s.overflowY,whiteSpace:s.whiteSpace,wordBreak:s.overflowWrap}})()`);
        assert.ok(reading.scrollHeight<=reading.clientHeight+1,'Note is not vertically clipped');
        assert.ok(reading.scrollWidth<=reading.clientWidth+1,'Long unbroken reference wraps');
        assert.equal(reading.whiteSpace,'pre-wrap');
        await a.eval(`(()=>{const e=${q(selector)};e.scrollIntoView({block:'start',inline:'nearest'});const r=document.createRange();r.setStart(e.firstChild,0);r.setEnd(e.firstChild,Math.min(e.firstChild.length,140));const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString();})()`);
        assert.equal(await a.eval('getSelection().toString()'),note.slice(0,140));
        await layout(a);await a.screenshot(`web-${width}-long-note-selection`);
        await a.observe({width,reading,selectionMethod:'DOM Range; not native long-press',exactCharacters:note.length});
        await a.eval('getSelection().removeAllRanges()');
      }
    }
  }
];
