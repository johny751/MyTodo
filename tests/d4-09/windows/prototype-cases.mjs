import assert from 'node:assert/strict';

// Cloud-only cases. Each run receives a new context at windows.html, 1440x960.
// eval is used to read the DOM and time, never to mutate application state or
// synthesize clicks. a.click/key perform the real CDP input supplied by root.
const q = value => JSON.stringify(value);
const dom = selector => `document.querySelector(${q(selector)})`;
const present = selector => `${dom(selector)} !== null`;
const text = selector => `${dom(selector)}?.textContent.trim()`;
const action = (name, prefix = '') => `${prefix ? prefix+' ' : ''}[data-action="${name}"]`;
const row = id => `[data-row-id="${id}"]`;
const detail = id => `[data-detail-id="${id}"]`;
const nav = id => `[data-page="${id}"]`;
const editor = '#editor-dialog';
const routes = [
  ['quadrants','四象限'],['timer','番茄专注'],['dashboard','工作台'],
  ['items','工作事项'],['projects','项目管理'],['templates','流程模板'],
  ['instances','流程实例'],['contacts','往来管理'],['followups','跟进管理'],
  ['archive','工作归档'],['statistics','统计分析'],['settings','系统设置'],
  ['feedback','想法与反馈']
];

async function go(a, id) {
  await a.click(nav(id));
  await a.until(`${dom('.nav-button[aria-current="page"]')}?.dataset.page === ${q(id)}`, `route ${id} selected`);
  assert.equal(await a.eval('location.hash'), `#${id}`);
}
async function expectText(a, selector, expected, message = selector) {
  const actual = await a.eval(text(selector));
  assert.ok(typeof actual === 'string' && actual.includes(expected), `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function expectDialog(a, selector, open = true) {
  await a.until(`${dom(selector)}?.open === ${open}`, `${selector} ${open ? 'open' : 'closed'}`);
}
async function choose(a, selector, value) {
  await a.fill(selector, value);
  await a.until(`${dom(selector)}?.value === ${q(value)}`, `${selector} retains selection ${value}`);
}
async function menu(a, trigger, selectedAction, value) {
  await a.click(trigger);
  await a.until(`${dom('#context-menu')}?.hidden === false`, 'menu opened by real click');
  await a.click(`#context-menu [data-action="${selectedAction}"]${value !== undefined ? `[data-value="${value}"]` : ''}`);
}
async function closeEditor(a) {
  await a.click('#editor-dialog .dialog-header [data-action="close-editor"]');
}
async function currentDetailId(a) {
  const id = await a.eval(`${dom('[data-detail-id]')}?.dataset.detailId`);
  assert.ok(id, 'detail exposes a selected record id');
  return id;
}
async function editRecord(a, id) {
  await a.click(row(id));
  await a.click(action('edit',detail(id)));
  await expectDialog(a,editor);
}
async function save(a) {
  await a.click('#save-record');
  await expectDialog(a,editor,false);
}
async function waitRealTime(a, milliseconds) {
  const deadline = await a.eval(`performance.now() + ${milliseconds}`);
  await a.until(`performance.now() >= ${deadline}`, `real browser time advances by ${milliseconds}ms`, milliseconds+3000);
}
async function noHorizontalOverflow(a, scope) {
  const measurements = await a.eval(`(() => {
    const root=document.documentElement, main=document.querySelector('#workspace');
    return {viewport:innerWidth,rootClient:root.clientWidth,rootScroll:root.scrollWidth,mainClient:main.clientWidth,mainScroll:main.scrollWidth};
  })()`);
  assert.ok(measurements.rootScroll <= measurements.viewport+1, `${scope}: document overflows horizontally ${JSON.stringify(measurements)}`);
  assert.ok(measurements.mainScroll <= measurements.mainClient+1, `${scope}: workspace overflows horizontally ${JSON.stringify(measurements)}`);
  await a.observe({kind:'horizontal-layout',scope,...measurements});
}

export const cases = [
  {
    id:'W01',name:'13 routes use visible navigation and desktop content; principal page screenshots',
    async run(a) {
      assert.equal(await a.eval('document.querySelectorAll(".nav-button").length'),13);
      assert.equal(await a.eval('window.D409WindowsPrototype?.storage'),'memory-only');
      const captured = new Set(['dashboard','items','projects','templates','instances','timer','statistics','settings']);
      for(const [id,title] of routes) {
        await go(a,id);
        assert.equal(await a.eval(text('#page-title')),title);
        assert.equal(await a.eval('document.querySelectorAll(".nav-button[aria-current=page]").length'),1);
        assert.ok((await a.eval(text('#page-content'))).length>30,`${id}: content exists`);
        await noHorizontalOverflow(a,`1440x960:${id}`);
        if(captured.has(id))await a.screenshot(`windows-desktop-${id}`);
      }
      await a.observe({kind:'route-coverage',count:routes.length,routes:routes.map(([id])=>id),nativeDpiClaim:false});
    }
  },
  {
    id:'W02',name:'Quadrant children start folded, update unfinished count, and search reveals matching parent chain',
    async run(a) {
      const task='[data-task-id="t1"]';
      assert.equal(await a.eval(`${dom(`${task} [data-action="expand-task"]`)}.getAttribute('aria-expanded')`),'false');
      assert.equal(await a.eval(`document.querySelectorAll(${q(`${task} [data-child-id]`)}).length`),0);
      await expectText(a,`${task} [data-action="expand-task"]`,'2 项未完成');
      await a.click(`${task} [data-action="expand-task"]`);
      assert.equal(await a.eval(`document.querySelectorAll(${q(`${task} [data-child-id]`)}).length`),3);
      await a.click('[data-child-id="tc2"]');
      assert.equal(await a.eval(`${dom('[data-child-id="tc2"]')}.checked`),true);
      await expectText(a,`${task} [data-action="expand-task"]`,'1 项未完成');
      await a.click(`${task} [data-action="expand-task"]`);
      assert.equal(await a.eval(present('[data-child-id="tc2"]')),false);
      await a.fill('#page-search','补齐空态');
      assert.equal(await a.eval(`document.querySelectorAll('[data-task-id]').length`),1);
      await expectText(a,task,'准备下午的方案评审');
      assert.equal(await a.eval(`${dom('[data-child-id="tc2"]')}.checked`),true);
      await a.screenshot('windows-quadrant-child-search');
      await a.fill('#page-search','');
      assert.equal(await a.eval(`document.querySelectorAll('[data-task-id]').length`),6);
      assert.equal(await a.eval(present('[data-child-id="tc2"]')),false,'forced search expansion does not overwrite user fold state');
      await a.click(`${task} [data-action="toggle-complete"]`);
      assert.ok(await a.eval(`${dom(task)}.classList.contains('is-done')`));
      await a.click(`${task} [data-action="toggle-complete"]`);
      assert.equal(await a.eval(`${dom(task)}.classList.contains('is-done')`),false);
    }
  },
  {
    id:'W03',name:'Real quadrant menu supports keyboard focus, move, zoom and table view',
    async run(a) {
      const trigger='[data-task-id="t1"] [data-action="record-menu"]';
      await a.click(trigger);
      await a.until(`${dom('#context-menu')}.hidden === false`,'task menu is open');
      assert.equal(await a.eval('document.activeElement?.dataset.action'),'edit');
      await a.key(null,'ArrowDown');
      assert.equal(await a.eval('document.activeElement?.dataset.action'),'history');
      await a.key(null,'Escape');
      assert.equal(await a.eval(`${dom('#context-menu')}.hidden`),true);
      assert.equal(await a.eval(`document.activeElement === ${dom(trigger)}`),true,'Esc restores triggering menu button');
      await menu(a,trigger,'move-task','1');
      assert.ok(await a.eval(present('[data-drop-quadrant="1"] [data-task-id="t1"]')));
      assert.equal(await a.eval(present('[data-drop-quadrant="0"] [data-task-id="t1"]')),false);
      await a.click('[data-action="zoom"][data-quadrant="1"]');
      assert.equal(await a.eval('document.querySelectorAll("[data-drop-quadrant]").length'),1);
      assert.equal(await a.eval(`${dom('[data-action="zoom"][data-quadrant="1"]')}.getAttribute('aria-pressed')`),'true');
      await a.screenshot('windows-quadrant-zoom');
      await a.click('[data-action="zoom"][data-quadrant="1"]');
      assert.equal(await a.eval('document.querySelectorAll("[data-drop-quadrant]").length'),4);
      await a.click('[data-action="board-mode"][data-mode="list"]');
      assert.equal(await a.eval('document.querySelectorAll("[data-row-id]").length'),6);
      await a.click(row('t1'));
      await expectText(a,detail('t1'),'重要不紧急');
      await a.observe({kind:'input-boundary',verified:['menu real click','keyboard menu navigation','Esc focus return','menu quadrant move','zoom','table view'],notVerified:['native Win32 drag','browser HTML drag in this case']});
    }
  },
  {
    id:'W04',name:'Work item create edit read archive restore and delete use real controls',
    async run(a) {
      await go(a,'items');
      await a.click('#page-actions [data-action="new"]');
      await expectDialog(a,editor);
      await a.fill('#edit-name','云端交互验证事项');
      await a.fill('#edit-projectLabel','客户工作台改版');
      assert.equal(await a.eval(`${dom('#edit-projectId')}.value`),'p1');
      const note='第一行：实际点击创建。\n历史原文 2026-11-26T23:15:47.123-05:00\n最后一行保留。';
      await a.fill('#edit-notes',note);
      await a.key('#edit-notes','Enter',2);
      await expectDialog(a,editor,false);
      const id=await currentDetailId(a);
      assert.ok(id.startsWith('demo-'));
      await expectText(a,detail(id),'云端交互验证事项');
      await a.click(action('edit',detail(id)));
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),note);
      assert.equal(await a.eval(`${dom('#edit-projectId')}.value`),'p1');
      await a.fill('#edit-name','云端交互验证事项 · 已编辑');
      await save(a);
      await menu(a,action('record-menu',row(id)),'archive');
      assert.equal(await a.eval(present(row(id))),false);
      await go(a,'archive');
      await a.click(row(id));
      await expectText(a,detail(id),'云端交互验证事项 · 已编辑');
      await a.click(action('archive',detail(id)));
      assert.equal(await a.eval(present(row(id))),false);
      await go(a,'items');
      await menu(a,action('record-menu',row(id)),'delete');
      await expectDialog(a,'#confirm-dialog');
      await a.click('#confirm-dialog [data-action="confirm-cancel"]');
      assert.ok(await a.eval(present(row(id))),'cancel deletion keeps row');
      await menu(a,action('record-menu',row(id)),'delete');
      await a.click('#confirm-dialog [data-action="confirm-accept"]');
      await expectDialog(a,'#confirm-dialog',false);
      assert.equal(await a.eval(present(row(id))),false);
      await a.observe({kind:'crud',createdId:id,operations:['create','Ctrl+Enter save','reopen','edit','archive','restore','delete cancel','delete confirm'],storage:'in-memory synthetic'});
    }
  },
  {
    id:'W05',name:'Dirty editor preserves draft through cancel and distinguishes discard from save-and-close',
    async run(a) {
      await go(a,'items');await editRecord(a,'i1');
      const original=await a.eval(`${dom('#edit-notes')}.value`);
      const draft=original+'\n未保存修改 A';
      await a.fill('#edit-notes',draft);await closeEditor(a);
      await expectDialog(a,'#confirm-dialog');
      assert.equal(await a.eval('document.activeElement?.dataset.action'),'confirm-cancel');
      await a.click('#confirm-dialog [data-action="confirm-cancel"]');
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),draft);
      await closeEditor(a);await a.click('#confirm-dialog [data-action="confirm-alternate"]');
      await expectDialog(a,editor,false);await editRecord(a,'i1');
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),original);
      const retained=original+'\n保存并关闭 B';
      await a.fill('#edit-notes',retained);await closeEditor(a);
      await a.click('#confirm-dialog [data-action="confirm-accept"]');
      await expectDialog(a,editor,false);await editRecord(a,'i1');
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),retained);
      await a.key('#edit-name','Escape');await expectDialog(a,editor,false);
    }
  },
  {
    id:'W06',name:'Empty loading and simulated save error use real menu and keep draft for retry',
    async run(a) {
      await go(a,'items');
      await menu(a,'#demo-state-trigger','demo-state','empty');
      assert.ok(await a.eval(present('[data-state="empty"]')));
      assert.equal(await a.eval('document.querySelectorAll("[data-row-id]").length'),0);
      await a.click('[data-action="empty-create"]');await expectDialog(a,editor);
      await a.fill('#edit-name','从空态创建');await save(a);
      await expectText(a,'[data-detail-id]','从空态创建');
      await menu(a,'#demo-state-trigger','demo-state','loading');
      await a.until(present('[data-state="loading"]'),'loading is visible',2000);
      await a.until(`!(${present('[data-state="loading"]')})`,'loading resolves to content',5000);
      await menu(a,'#demo-state-trigger','demo-state','error');
      assert.ok(await a.eval(present('[data-state="error"]')));
      await editRecord(a,'i1');
      const before=await a.eval(`${dom('#edit-notes')}.value`), draft=before+'\n错误后保留的草稿';
      await a.fill('#edit-notes',draft);await a.click('#save-record');
      assert.equal(await a.eval(`${dom(editor)}.open`),true);
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),draft);
      await expectText(a,'#editor-error','模拟保存失败');
      await a.screenshot('windows-editor-save-error');
      await a.click('#editor-error [data-action="retry-editor"]');
      await expectDialog(a,editor,false);
      assert.equal(await a.eval(present('[data-state="error"]')),false);
      await editRecord(a,'i1');assert.equal(await a.eval(`${dom('#edit-notes')}.value`),draft);
      await closeEditor(a);await expectDialog(a,editor,false);
    }
  },
  {
    id:'W07',name:'Project color validates in place and project candidate preserves its stable ID',
    async run(a) {
      await go(a,'projects');await editRecord(a,'p1');
      await a.fill('#edit-color','not-a-color');await a.click('#save-record');
      assert.equal(await a.eval(`${dom(editor)}.open`),true);
      assert.equal(await a.eval(`${dom('#edit-color')}.value`),'not-a-color');
      await expectText(a,'#editor-error','#RRGGBB');
      await a.fill('#edit-color','#27aB83');
      assert.equal(await a.eval(`getComputedStyle(${dom('#edit-color-preview')}).backgroundColor`),'rgb(39, 171, 131)');
      await save(a);await editRecord(a,'p1');
      assert.equal(await a.eval(`${dom('#edit-color')}.value`),'#27aB83','input capitalization remains unchanged');
      await closeEditor(a);await go(a,'items');await editRecord(a,'i1');
      await a.fill('#edit-projectLabel','没有这个项目');await a.click('#save-record');
      await expectText(a,'#editor-error','已有项目');
      assert.equal(await a.eval(`${dom('#edit-projectLabel')}.value`),'没有这个项目');
      await a.fill('#edit-projectLabel','冬季产品发布');
      assert.equal(await a.eval(`${dom('#edit-projectId')}.value`),'p2');
      await save(a);await editRecord(a,'i1');
      assert.equal(await a.eval(`${dom('#edit-projectId')}.value`),'p2');
      assert.equal(await a.eval(`${dom('#edit-projectLabel')}.value`),'冬季产品发布');
      await closeEditor(a);
    }
  },
  {
    id:'W08',name:'Template steps validate, copy is independent, and stopped template rejects instance creation',
    async run(a) {
      await go(a,'templates');await editRecord(a,'tm1');
      await a.fill('#edit-steps','');await a.click('#save-record');
      await expectText(a,'#editor-error','1–20');
      assert.equal(await a.eval(`${dom('#edit-steps')}.value`),'');
      await a.fill('#edit-steps','确认范围\n执行校验\n提交记录');await save(a);
      await menu(a,action('record-menu',row('tm1')),'template-copy');
      const copyId=await currentDetailId(a);assert.notEqual(copyId,'tm1');
      await expectText(a,detail(copyId),'设计评审与交付（副本）');
      assert.equal(await a.eval(`document.querySelectorAll(${q(`${detail(copyId)} .step-list li`)}).length`),3);
      await menu(a,action('record-menu',row('tm1')),'template-toggle');
      await a.click(row('tm1'));await a.click(action('create-instance',detail('tm1')));
      await expectText(a,'#toast','模板已停用');
      assert.equal(await a.eval('location.hash'),'#templates');
      await a.click(row(copyId));await a.click(action('create-instance',detail(copyId)));
      await a.until(`${dom('.nav-button[aria-current=page]')}.dataset.page === 'instances'`,'copy template creates instance');
      await expectText(a,'[data-detail-id]','设计评审与交付（副本） · 新实例');
      assert.equal(await a.eval('document.querySelectorAll("[data-detail-id] .step-list li").length'),3);
    }
  },
  {
    id:'W09',name:'New instance chooses a template and keeps its steps through pause resume and completion',
    async run(a) {
      await go(a,'instances');await a.click('#page-actions [data-action="new"]');
      await expectDialog(a,'#info-dialog');await expectText(a,'#info-title','从模板建立');
      await a.click('#info-dialog [data-action="create-instance"][data-id="tm1"]');
      await expectDialog(a,'#info-dialog',false);
      const id=await currentDetailId(a);assert.ok(id.startsWith('demo-'));
      const originalSteps=await a.eval(`Array.from(document.querySelectorAll(${q(`${detail(id)} .step-list li`)})).map(node => node.childNodes[1]?.textContent.trim())`);
      assert.equal(originalSteps.length,4);
      await a.click(action('instance-pause',detail(id)));
      await expectText(a,`${detail(id)} .detail-project`,'已暂停');
      assert.equal(await a.eval(present(action('instance-advance',detail(id)))),false);
      await a.screenshot('windows-instance-paused');
      await a.click(action('instance-resume',detail(id)));
      await go(a,'templates');await editRecord(a,'tm1');
      await a.fill('#edit-steps','新步骤甲\n新步骤乙');await save(a);
      await go(a,'instances');await a.click(row(id));
      const retained=await a.eval(`Array.from(document.querySelectorAll(${q(`${detail(id)} .step-list li`)})).map(node => node.childNodes[1]?.textContent.trim())`);
      assert.deepEqual(retained,originalSteps,'instance copied steps survive template edit');
      for(let index=0;index<4;index++)await a.click(action('instance-advance',detail(id)));
      await expectText(a,`${detail(id)} .detail-project`,'已完成');
      assert.equal(await a.eval(present(action('instance-advance',detail(id)))),false);
      assert.equal(await a.eval(present(action('instance-pause',detail(id)))),false);
      assert.equal(await a.eval(`document.querySelectorAll(${q(`${detail(id)} .step-list .done`)}).length`),4);
      await a.screenshot('windows-instance-completed');
    }
  },
  {
    id:'W10',name:'Timer countdown starts pauses across navigation resumes and keeps ended history exactly once',
    async run(a) {
      await go(a,'timer');await choose(a,'#timer-minutes','1');
      const initial=await a.eval('document.querySelectorAll(".history-item").length');
      await a.click('[data-action="timer-start"]');
      await a.until(`${text('#timer-clock')} !== '00:01:00'`,'countdown actually advances',5000);
      assert.equal(await a.eval(`${dom('#timer-mode')}.disabled`),true);
      await a.click('[data-action="timer-pause"]');
      const paused=await a.eval(text('#timer-clock'));
      await go(a,'dashboard');await waitRealTime(a,650);await go(a,'timer');
      assert.equal(await a.eval(text('#timer-clock')),paused,'paused timer remains fixed while another page is shown');
      await a.click('[data-action="timer-end"]');await expectDialog(a,'#confirm-dialog');
      await a.click('#confirm-dialog [data-action="confirm-cancel"]');
      await expectText(a,'#timer-state','已暂停');
      await a.click('[data-action="timer-resume"]');
      await a.until(`${text('#timer-clock')} !== ${q(paused)}`,'resumed countdown advances',5000);
      await a.click('[data-action="timer-end"]');await a.click('#confirm-dialog [data-action="confirm-accept"]');
      await expectText(a,'#timer-state','已结束');
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),initial+1);
      await expectText(a,'.history-item','提前结束');
      await go(a,'items');await go(a,'timer');
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),initial+1);
      await a.screenshot('windows-timer-ended-history');
    }
  },
  {
    id:'W11',name:'Timer task search exposes child match; countup completion requires acknowledgement and does not add a pomodoro round',
    async run(a) {
      await go(a,'timer');await a.click('[data-action="timer-task"]');await expectDialog(a,'#info-dialog');
      await a.fill('#task-picker-search','阅读第二份');
      assert.equal(await a.eval('document.querySelectorAll("#task-picker-results [data-action=choose-timer-task]").length'),1);
      await expectText(a,'#task-picker-results','阅读并整理访谈记录');
      await expectText(a,'#task-picker-results','阅读第二份记录');
      await a.click('#task-picker-results [data-action="choose-timer-task"][data-id="t3"]');
      await expectDialog(a,'#info-dialog',false);await expectText(a,'#timer-task-title','阅读并整理访谈记录');
      await choose(a,'#timer-mode','countup');
      const rounds=await a.eval(text('.timer-totals > div:nth-child(2) strong'));
      const initial=await a.eval('document.querySelectorAll(".history-item").length');
      await a.click('[data-action="timer-start"]');
      await a.until(`${text('#timer-clock')} !== '00:00:00'`,'countup advances before completing',5000);
      await a.click('[data-action="timer-finish"]');
      assert.ok(await a.eval(present('[data-action="timer-ack"]')));
      assert.equal(await a.eval(present('[data-action="timer-start"]')),false,'no automatic next round before acknowledgement');
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),initial+1);
      assert.equal(await a.eval(text('.timer-totals > div:nth-child(2) strong')),rounds,'countup completion is not a countdown focus round');
      await a.screenshot('windows-timer-completion-pending');
      await a.click('[data-action="timer-ack"]');
      assert.ok(await a.eval(present('[data-action="timer-start"]')));
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),initial+1);
      await a.click('[data-action="timer-filter"][data-filter-value="break"]');
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),1);
      await expectText(a,'.history-item','休息');
      await a.click('[data-action="timer-filter"][data-filter-value="focus"]');
      assert.equal(await a.eval('document.querySelectorAll(".history-item").length'),4);
      await a.observe({kind:'timer-boundary',countupCompletion:'real elapsed time and real clicks',countdownAtZero:'not exercised by this short UI case',nativeLifecycle:'not exercised'});
    }
  },
  {
    id:'W12',name:'Feedback autosaves a draft before switching and preserves deleted content through undo',
    async run(a) {
      await go(a,'feedback');await a.click('[data-action="feedback-new"]');
      const id=await a.eval(`${dom('.feedback-card.is-selected')}.dataset.id`);
      await a.fill('#feedback-title','云端反馈交互演示');
      await a.fill('#feedback-body','这是合成反馈，不应向远程服务发送。\n切换记录后仍保留。');
      await a.until(`${text('#feedback-save-status')}.includes('已保存在本次会话')`,'650ms autosave reaches saved state',4000);
      await a.click('[data-action="feedback-select"][data-id="fb1"]');
      await a.click(`[data-action="feedback-select"][data-id="${id}"]`);
      assert.equal(await a.eval(`${dom('#feedback-title')}.value`),'云端反馈交互演示');
      assert.ok((await a.eval(`${dom('#feedback-body')}.value`)).includes('切换记录后仍保留'));
      await a.click('[data-action="feedback-submit"]');
      await expectText(a,`.feedback-card[data-id="${id}"]`,'本机已记录');
      await menu(a,'#page-actions [data-action="feedback-menu"]','feedback-delete');
      await expectDialog(a,'#confirm-dialog');await a.click('#confirm-dialog [data-action="confirm-cancel"]');
      assert.ok(await a.eval(present(`.feedback-card[data-id="${id}"]`)));
      await menu(a,'#page-actions [data-action="feedback-menu"]','feedback-delete');
      await a.click('#confirm-dialog [data-action="confirm-accept"]');
      assert.equal(await a.eval(present(`.feedback-card[data-id="${id}"]`)),false);
      await menu(a,'#page-actions [data-action="feedback-menu"]','feedback-undo');
      assert.equal(await a.eval(`${dom('#feedback-title')}.value`),'云端反馈交互演示');
      await expectText(a,'#feedback-save-status','不发送到远程服务');
      await a.observe({kind:'feedback-boundary',tested:['draft autosave','selection flush','local list record','delete cancel','delete confirm','undo'],notTested:['image file picker','remote service']});
    }
  },
  {
    id:'W13',name:'Statistics filters project status and dates with cancelled items excluded from denominator',
    async run(a) {
      await go(a,'statistics');
      const values=()=>a.eval('Array.from(document.querySelectorAll(".overview-metric strong")).map(node=>node.textContent.trim())');
      assert.deepEqual(await values(),['6','1','20%','1']);
      await choose(a,'#project-filter','p2');assert.deepEqual(await values(),['3','1','50%','0']);
      await a.fill('#stats-from','2026-11-28');await a.fill('#stats-to','2026-11-28');
      assert.deepEqual(await values(),['1','0','0%','0']);
      await expectText(a,'.chart-note','含起止两日');
      await a.screenshot('windows-statistics-filtered');
      await a.click('#page-toolbar [data-action="clear-filters"]');
      assert.deepEqual(await values(),['6','1','20%','1']);
      await choose(a,'#status-filter','completed');assert.deepEqual(await values(),['1','1','100%','0']);
      await a.click('[data-action="stats-info"]');await expectDialog(a,'#info-dialog');
      await expectText(a,'#info-content','已取消');await a.click('#info-dialog .dialog-footer [data-action="close-info"]');
    }
  },
  {
    id:'W14',name:'Settings density and motion, version boundary, Ctrl+F and Ctrl+N remain usable',
    async run(a) {
      await go(a,'settings');
      await a.click('[data-action="density"]');
      assert.equal(await a.eval('document.body.classList.contains("is-compact")'),true);
      assert.equal(await a.eval(`${dom('[data-action="density"]')}.getAttribute('aria-checked')`),'true');
      await a.click('[data-action="motion"]');assert.equal(await a.eval('document.body.classList.contains("reduced-motion")'),true);
      await a.click('#page-actions [data-action="version"]');await expectDialog(a,'#info-dialog');
      await expectText(a,'#info-content','7c217d8779ccf21e13733b28868e015e9cfd693a');
      await expectText(a,'#info-content','没有伪造 EXE/APK');
      await a.key(null,'Escape');await expectDialog(a,'#info-dialog',false);
      await a.screenshot('windows-settings-compact');
      await go(a,'items');
      const rowHeight=await a.eval(`${dom(row('i1'))}.getBoundingClientRect().height`);
      assert.ok(rowHeight<=48,`compact row remains reasonably dense: ${rowHeight}`);
      await a.key('#page-title','f',2);assert.equal(await a.eval('document.activeElement.id'),'page-search');
      await a.key('#page-search','n',2);await expectDialog(a,editor);
      await a.fill('#edit-name','键盘新建演示');await a.key('#edit-name','Enter',2);await expectDialog(a,editor,false);
      await expectText(a,'[data-detail-id]','键盘新建演示');
    }
  },
  {
    id:'W15',name:'360 and 412 CSS windows keep all routes within the horizontal workspace and detail returns to list',
    async run(a) {
      for(const width of [360,412]){
        await a.configure(width,860,false);
        for(const [id,title] of routes){await go(a,id);assert.equal(await a.eval(text('#page-title')),title);await noHorizontalOverflow(a,`${width}x860:${id}`);}
        await go(a,'items');await a.click(row('i1'));
        assert.equal(await a.eval(`getComputedStyle(${dom('.workspace-grid .work-list')}).display`),'none');
        assert.notEqual(await a.eval(`getComputedStyle(${dom(detail('i1'))}).display`),'none');
        await noHorizontalOverflow(a,`${width}x860:item-detail`);
        await a.screenshot(`windows-${width}-item-detail`);
        await a.click(action('close-detail',detail('i1')));
        assert.notEqual(await a.eval(`getComputedStyle(${dom('.workspace-grid .work-list')}).display`),'none');
        assert.equal(await a.eval(`${dom(row('i1'))}.getAttribute('aria-selected')`),'true');
      }
      await a.observe({kind:'viewport-limit',widths:[360,412],mobileEmulation:false,nativeSystemGestures:false,meaning:'browser CSS narrow-window checks only'});
    }
  },
  {
    id:'W16',name:'1280x900 desktop window keeps long historical note editable and explicit save visible',
    async run(a) {
      await a.configure(1280,900,false);await go(a,'dashboard');
      await noHorizontalOverflow(a,'1280x900:dashboard');await a.screenshot('windows-1280-workbench');
      await go(a,'items');await editRecord(a,'i1');
      const original=await a.eval(`${dom('#edit-notes')}.value`);
      assert.ok(original.includes('2026-11-26T23:15:47.123-05:00'));
      await a.key('#edit-notes','a',2);
      assert.equal(await a.eval(`${dom('#edit-notes')}.selectionEnd - ${dom('#edit-notes')}.selectionStart`),original.length);
      const geometry=await a.eval(`(() => {const note=${dom('#edit-notes')}.getBoundingClientRect(),save=${dom('#save-record')}.getBoundingClientRect();return {note:{left:note.left,right:note.right,top:note.top,bottom:note.bottom},save:{left:save.left,right:save.right,top:save.top,bottom:save.bottom},width:innerWidth,height:innerHeight};})()`);
      assert.ok(geometry.note.left>=0&&geometry.note.right<=geometry.width,'full note control fits width');
      assert.ok(geometry.save.top>=0&&geometry.save.bottom<=geometry.height,'save remains in viewport with long form');
      await a.screenshot('windows-1280-historical-note-selection');
      await a.click('#save-record');await expectDialog(a,editor,false);await editRecord(a,'i1');
      assert.equal(await a.eval(`${dom('#edit-notes')}.value`),original,'unchanged long note and history text survive save');
      await closeEditor(a);
      await a.observe({kind:'desktop-window-geometry',viewport:[1280,900],deviceScaleOrNativeDpi:'not asserted by this browser test',geometry});
    }
  }
];
