import assert from 'node:assert/strict';

// Actions-only browser design checks. These cases never constitute Android system,
// storage, background service, picker, signing or production acceptance evidence.
const js = value => JSON.stringify(value);
const query = selector => `document.querySelector(${js(selector)})`;
const count = selector => `document.querySelectorAll(${js(selector)}).length`;
const text = selector => `${query(selector)}?.textContent`;
const body = '#page-content';
const sheetClose = '#detail-sheet .sheet-heading [data-action="close-sheet"]';
const pickerClose = '#task-picker [data-action="close-picker"]';
const names = {home:'四象限',dashboard:'工作台',tasks:'任务',timer:'番茄钟',notes:'备注',stats:'统计',work:'工作事项',instances:'流程实例',projects:'项目',contacts:'联系人',feedback:'优化意见',settings:'设置'};

async function ready(a,width=412){
  await a.configure(width,900,true);
  await a.until('Boolean(window.D409AndroidPrototype && document.querySelector("#page-title"))','Android design prototype initialized');
  assert.equal(await a.eval(text('#page-title')),'四象限','Each case must start in a fresh default context');
  await a.observe({scope:'memory-only browser design',width,height:900,androidSystemValidation:false});
}
async function tap(a,selector){
  assert.equal(await a.eval(count(selector)),1,`Unique click selector: ${selector}`);
  await a.eval(`${query(selector)}.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
  await a.settle();
  await a.click(selector);
  await a.settle();
}
async function route(a,id){
  await tap(a,'#nav-trigger');
  await a.until(`${query('#nav-drawer')}.open`,'Navigation drawer opened');
  await tap(a,`#drawer-links [data-route="${id}"]`);
  await a.until(`${text('#page-title')} === ${js(names[id])}`,`Reached ${id}`);
  assert.equal(await a.eval(`${query('#nav-drawer')}.open`),false,'Drawer closes after navigation');
}
async function expectText(a,selector,value){assert.match(await a.eval(text(selector)),new RegExp(value),`${selector} contains ${value}`);}
async function timerTop(a){await a.eval(`${query(body)}.scrollTop=0`);await a.settle();}
async function history(a){await tap(a,'#page-content [data-action="timer-tab"][data-value="history"]');}
async function settings(a){if(!await a.eval(`${query('#timer-settings')}.open`))await tap(a,'#timer-settings > summary');}
async function confirm(a,index){await a.until(`${query('#confirm-dialog')}.open`,'Confirmation dialog opened');await tap(a,`#confirm-dialog [data-confirm="${index}"]`);}
async function assertLayout(a){
  const geometry=await a.eval(`(()=>{const c=document.querySelector('#page-content'),h=document.querySelector('.app-header'),n=document.querySelector('.bottom-nav'),f=document.querySelector('.app-frame');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {content:rect(c),header:rect(h),nav:rect(n),frame:rect(f),innerWidth,documentWidth:document.documentElement.scrollWidth,contentWidth:c.clientWidth,contentScrollWidth:c.scrollWidth,navTarget:rect(document.querySelector('#nav-trigger'))}})()`);
  assert.ok(geometry.documentWidth<=geometry.innerWidth+1,'No document horizontal overflow');
  assert.ok(geometry.contentScrollWidth<=geometry.contentWidth+1,'No main content horizontal overflow');
  assert.ok(geometry.content.y>=geometry.header.bottom-1,'Header does not cover main viewport');
  assert.ok(geometry.content.bottom<=geometry.nav.y+1,'Bottom navigation does not cover main viewport');
  assert.ok(geometry.navTarget.width>=48&&geometry.navTarget.height>=48,'Menu target is at least 48 CSS pixels');
  await a.observe({layout:geometry,units:'CSS pixels; not native dp'});
}

export const cases = [
  {
    id:'A409-P01',name:'412px: all twelve pages remain reachable through the drawer',
    async run(a){
      await ready(a);
      assert.deepEqual(await a.eval('window.D409AndroidPrototype.routeNames'),Object.keys(names));
      for(const id of Object.keys(names)){
        await route(a,id);
        assert.equal(await a.eval(text('#page-title')),names[id]);
        await assertLayout(a);
        if(['dashboard','work','instances'].includes(id))await a.screenshot(`android-412-${id}`);
        if(id==='contacts')await expectText(a,body,'待人工审阅');
      }
      await tap(a,'#nav-trigger');
      assert.equal(await a.eval(count('#drawer-links [data-route]')),12);
      await a.screenshot('android-412-drawer');
      await a.key(null,'Escape');
      await a.until(`!${query('#nav-drawer')}.open`,'Esc closes drawer');
      assert.equal(await a.eval('document.activeElement.id'),'nav-trigger');
    }
  },
  {
    id:'A409-P02',name:'360px: compact work, notes, statistics and timer preserve layout and touch targets',
    async run(a){
      await ready(a,360);
      for(const id of ['home','dashboard','work','notes','stats','timer']){
        await route(a,id);await assertLayout(a);
        const targets=await a.eval(`Array.from(document.querySelectorAll('#page-content button')).filter(e=>e.getClientRects().length).map(e=>({label:e.textContent.trim().slice(0,32),height:e.getBoundingClientRect().height}))`);
        assert.ok(targets.every(target=>target.height>=47.5),'Rendered action heights are at least 48 CSS px');
      }
      await a.screenshot('android-360-timer-idle');
      await tap(a,'#nav-trigger');await a.screenshot('android-360-drawer');
      await tap(a,'#drawer-links [data-route="dashboard"]');
      await a.screenshot('android-360-dashboard');
    }
  },
  {
    id:'A409-P03',name:'Menu keyboard dismissal and new-task draft protection',
    async run(a){
      await ready(a);
      await tap(a,'#page-menu-trigger');
      await a.until(`${query('#page-menu')}.open`,'Page menu open');
      await a.key(null,'Escape');
      await a.until(`!${query('#page-menu')}.open`,'Page menu closed by Esc');
      assert.equal(await a.eval('document.activeElement.id'),'page-menu-trigger');
      await tap(a,'#page-menu-trigger');await tap(a,'#page-menu [data-action="new-task"]');
      await a.fill('#new-title','云端原型草稿 A409');await a.fill('#new-description','输入必须保留，不能因关闭丢失。');
      await tap(a,sheetClose);await expectText(a,'#confirm-title','保留新建内容');
      await confirm(a,0);
      assert.equal(await a.eval(`${query('#new-title')}.value`),'云端原型草稿 A409');
      assert.equal(await a.eval(`${query('#detail-sheet')}.open`),true);
      await tap(a,sheetClose);await confirm(a,2);
      assert.equal(await a.eval(`${query('#detail-sheet')}.open`),false);
      await route(a,'tasks');await a.fill('#list-search','云端原型草稿 A409');
      assert.equal(await a.eval(count('#task-list-results .task-row')),1);
      await expectText(a,'#task-list-results','云端原型草稿 A409');
    }
  },
  {
    id:'A409-P04',name:'Task query and selection survive navigation; task menu moves and deletes a leaf in memory',
    async run(a){
      await ready(a);await route(a,'tasks');
      await a.fill('#list-search','整理会议纪要');
      assert.equal(await a.eval(count('#task-list-results .task-row')),2);
      await tap(a,'#page-content [data-action="task-filter"][data-value="open"]');
      await route(a,'dashboard');await route(a,'tasks');
      assert.equal(await a.eval(`${query('#list-search')}.value`),'整理会议纪要');
      assert.equal(await a.eval(`${query('[data-action="task-filter"][data-value="open"]')}.getAttribute('aria-selected')`),'true');
      await tap(a,'#task-list-results [data-action="task-menu"][data-id="agenda"]');
      await tap(a,'#sheet-body [data-action="move-task"]');await tap(a,'#sheet-body [data-action="set-quadrant"][data-value="1"]');
      await tap(a,'#task-list-results [data-action="task-menu"][data-id="agenda"]');await tap(a,'#sheet-body [data-action="delete-task"]');
      await confirm(a,0);assert.equal(await a.eval(count('#task-list-results [data-task="agenda"]')),1,'Cancelled deletion retains row');
      await tap(a,'#sheet-body [data-action="delete-task"]');await confirm(a,1);
      assert.equal(await a.eval(count('#task-list-results [data-task="agenda"]')),0);
      assert.equal(await a.eval(count('#task-list-results [data-task="same-title"]')),1,'Same-title distinct identity remains');
    }
  },
  {
    id:'A409-P05',name:'Timer idle, running, pause, resume, cancellation and early-end history',
    async run(a){
      await ready(a);await route(a,'timer');
      assert.equal(await a.eval(text('#timer-value')),'25:00');await a.screenshot('android-412-timer-idle');
      await tap(a,'#timer-primary');await a.until(`${text('#timer-state')}==='计时中'`,'Countdown is running');
      await a.until(`${text('#timer-value')}!=='25:00'`,'Displayed countdown advances');
      await timerTop(a);await a.screenshot('android-412-timer-running');
      await tap(a,'#timer-primary');assert.equal(await a.eval(text('#timer-state')),'已暂停');
      const paused=await a.eval(text('#timer-value'));await timerTop(a);await a.screenshot('android-412-timer-paused');
      await route(a,'stats');await route(a,'timer');assert.equal(await a.eval(text('#timer-value')),paused,'Paused display survives page switch');
      await tap(a,'#timer-primary');assert.equal(await a.eval(text('#timer-state')),'计时中');
      await tap(a,'#page-content [data-action="end-timer"]');await confirm(a,0);
      assert.equal(await a.eval(text('#timer-state')),'计时中','Cancel does not end session');
      await tap(a,'#page-content [data-action="end-timer"]');await confirm(a,1);
      assert.equal(await a.eval(text('#timer-state')),'提前结束');
      await history(a);assert.equal(await a.eval(count('.history-row')),4);
      await expectText(a,'.history-row:first-of-type','提前结束');
      await tap(a,'#page-content [data-action="history-detail"][data-id="memory-session-1"]');
      await expectText(a,'#sheet-body','memory-session-1');await expectText(a,'#sheet-body','timer-review');
      await a.observe({timerAuthority:'browser memory only',nativeClockOrPersistenceProved:false});
    }
  },
  {
    id:'A409-P06',name:'Count-up completion, break and reset retain history and completion-count semantics',
    async run(a){
      await ready(a);await route(a,'timer');await settings(a);
      await tap(a,'#timer-settings [data-action="set-mode"][data-value="countup"]');await tap(a,'#timer-settings [data-action="save-timer-config"]');
      await timerTop(a);await tap(a,'#timer-primary');
      assert.equal(await a.eval(`${query('#timer-settings [data-action="set-mode"][data-value="countdown"]')}.disabled`),true);
      await a.until(`${text('#timer-value')}!=='00:00'`,'Count-up display advances');await timerTop(a);await a.screenshot('android-412-timer-countup');
      await tap(a,'#page-content [data-command="finish"]');assert.equal(await a.eval(text('#timer-state')),'本轮已完成');
      assert.equal(await a.eval(text('.tiny-stats > div:nth-child(2) strong')),'1','Count-up completion adds no countdown round');
      await tap(a,'#page-content [data-command="break"]');await expectText(a,'.timer-summary','休息时间');
      await timerTop(a);await a.screenshot('android-412-timer-break');await settings(a);
      await tap(a,'#timer-settings [data-action="reset-timer"]');await confirm(a,1);
      assert.equal(await a.eval(text('#timer-state')),'准备开始');
      await history(a);assert.equal(await a.eval(count('.history-row')),5,'Count-up and ended break each append one history row');
      await tap(a,'#page-content [data-action="history-filter"][data-value="break"]');assert.equal(await a.eval(count('.history-row')),2);
      await tap(a,'#page-content [data-action="history-detail"][data-id="memory-session-2"]');await expectText(a,'#sheet-body','休息');await expectText(a,'#sheet-body','倒计时');
    }
  },
  {
    id:'A409-P07',name:'Task picker unfolds parent/child rows and identifies duplicate-title search results',
    async run(a){
      await ready(a);await route(a,'timer');await tap(a,'#page-content [data-action="choose-task"]');
      assert.equal(await a.eval(count('#task-tree [data-tree-id="timer-review"]')),0,'Child hidden while parent collapsed');
      await tap(a,'#task-tree [data-action="toggle-tree"][data-id="release"]');
      await tap(a,'#task-tree [data-action="toggle-tree"][data-id="timer-review"]');
      assert.equal(await a.eval(count('#task-tree [data-tree-id="timer-copy"]')),1);
      await a.screenshot('android-412-task-picker-expanded');
      await a.fill('#task-search','整理会议纪要');
      assert.equal(await a.eval(count('#task-tree [data-action="select-task"]')),4,'Two matches plus their two ancestor rows');
      for(const id of ['client','agenda','weekly','same-title'])assert.equal(await a.eval(count(`#task-tree [data-tree-id="${id}"]`)),1);
      await expectText(a,'#picker-result-status','2 项标题匹配');await a.screenshot('android-412-task-picker-duplicate-search');
      await a.fill('#task-search','不存在的关键词');await expectText(a,'#task-tree','没有匹配任务');
      await a.fill('#task-search','');assert.equal(await a.eval(count('#task-tree [data-tree-id="timer-copy"]')),1,'Clear search restores prior expansion');
      await expectText(a,'#task-tree [data-tree-id="orphan"]','父级未返回');
      await a.fill('#task-search','整理会议纪要');await tap(a,'#task-tree [data-action="select-task"][data-id="agenda"]');
      assert.equal(await a.eval(`${query('#task-picker')}.open`),false);await expectText(a,'#linked-task-title','整理会议纪要');
      assert.equal(await a.eval(count('#timer-draft-notice')),1,'Selection remains unsaved');
      await settings(a);await tap(a,'#timer-settings [data-action="save-timer-config"]');assert.equal(await a.eval(count('#timer-draft-notice')),0);
      await tap(a,'#page-content [data-action="choose-task"]');await a.fill('#task-search','整理会议纪要');
      assert.equal(await a.eval(`${query('#task-tree [data-action="select-task"][data-id="agenda"]')}.getAttribute('aria-pressed')`),'true');
    }
  },
  {
    id:'A409-P08',name:'Timer draft validates numeric limits and handles continue, discard and save before navigation',
    async run(a){
      await ready(a);await route(a,'timer');await settings(a);await a.fill('#focus-minutes','0');
      await tap(a,'#timer-settings [data-action="save-timer-config"]');await expectText(a,'#timer-error','1–180');
      assert.equal(await a.eval(`${query('#focus-minutes')}.value`),'0','Invalid input retained');
      await a.fill('#focus-minutes','35');await tap(a,'#nav-trigger');await tap(a,'#drawer-links [data-route="work"]');
      await confirm(a,0);assert.equal(await a.eval(text('#page-title')),'番茄钟');await tap(a,'#nav-drawer [data-action="close-drawer"]');
      assert.equal(await a.eval(`${query('#focus-minutes')}.value`),'35');
      await tap(a,'#nav-trigger');await tap(a,'#drawer-links [data-route="work"]');await confirm(a,1);
      assert.equal(await a.eval(text('#page-title')),'工作事项');await route(a,'timer');await settings(a);
      assert.equal(await a.eval(`${query('#focus-minutes')}.value`),'25','Discard restores saved configuration');
      await a.fill('#focus-minutes','40');await tap(a,'#nav-trigger');await tap(a,'#drawer-links [data-route="dashboard"]');await confirm(a,2);
      assert.equal(await a.eval(text('#page-title')),'工作台');await route(a,'timer');await settings(a);
      assert.equal(await a.eval(`${query('#focus-minutes')}.value`),'40');assert.equal(await a.eval(count('#timer-draft-notice')),0);
    }
  },
  {
    id:'A409-P09',name:'Unconfirmed timer action keeps idle state, disables mutation, and allows one retry',
    async run(a){
      await ready(a);await route(a,'timer');await tap(a,'.demo-tools > summary');await tap(a,'.demo-tools [data-action="fail-next"]');
      await tap(a,'#timer-primary');await expectText(a,'#timer-error','演示写入未确认');
      assert.equal(await a.eval(text('#timer-state')),'准备开始');assert.equal(await a.eval(`${query('#timer-primary')}.disabled`),true);
      await timerTop(a);await a.screenshot('android-412-timer-unconfirmed');
      await tap(a,'#timer-error [data-action="retry-command"]');assert.equal(await a.eval(text('#timer-state')),'计时中');
      assert.equal(await a.eval(count('#timer-error')),0);assert.equal(await a.eval(`${query('#timer-primary')}.disabled`),false);
      await tap(a,'#page-content [data-action="end-timer"]');await confirm(a,1);await history(a);
      assert.equal(await a.eval(count('.history-row')),4,'Retry produces one session record, not duplicates');
      await a.observe({injectedFailure:'explicit browser demo mode',realDiskFailure:false,receiptPersistenceProof:false});
    }
  },
  {
    id:'A409-P10',name:'360px long note remains selectable and draft survives rejected navigation then Ctrl+Enter save',
    async run(a){
      await ready(a,360);await route(a,'notes');await assertLayout(a);
      await expectText(a,'.note-paper','2026-11-28T10:32:18.427\\+08:00');await expectText(a,'.note-paper','末尾应保持可读');
      const selection=await a.eval(`(()=>{const el=document.querySelector('.note-paper > div'),range=document.createRange();range.selectNodeContents(el);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return {selected:selection.toString(),userSelect:getComputedStyle(el).userSelect,length:selection.toString().length}})()`);
      assert.ok(selection.length>250,'Long note is selectable');assert.match(selection.selected,/时区、秒或毫秒/);
      await a.screenshot('android-360-notes-dom-selection');await a.observe({selectionMethod:'DOM Range',androidNativeSelectionTest:false});
      await a.eval('getSelection().removeAllRanges()');await tap(a,'#page-content [data-action="edit-note"]');
      const note='云端备注草稿\n时区保留 2026-11-28T10:32:18.427+08:00\n末尾仍可见。';await a.fill('#note-editor',note);
      await tap(a,'#nav-trigger');await tap(a,'#drawer-links [data-route="stats"]');await confirm(a,0);await tap(a,'#nav-drawer [data-action="close-drawer"]');
      assert.equal(await a.eval(`${query('#note-editor')}.value`),note);await a.key('#note-editor','Enter',2);
      await a.until(`!${query('#note-editor')}`,'Ctrl+Enter saved note');await route(a,'stats');await route(a,'notes');
      assert.equal(await a.eval(text('.note-paper > div')),note);
    }
  },
  {
    id:'A409-P11',name:'Work details preserve long notes and open independent workflow instance and step views',
    async run(a){
      await ready(a);await route(a,'work');await tap(a,'#work-list [data-action="work-detail"][data-id="w3"]');
      await expectText(a,'#sheet-body','发布前检查');await expectText(a,'#sheet-body','2026-11-28T10:32:18.427\\+08:00');
      await a.screenshot('android-412-work-long-detail');await tap(a,'#sheet-actions [data-action="view-instance"]');
      assert.equal(await a.eval(text('#page-title')),'流程实例');assert.equal(await a.eval(`${query('#detail-sheet')}.open`),false);
      await tap(a,'#page-content [data-action="instance-detail"][data-id="i1"]');await expectText(a,'#sheet-body','创建时模板快照 v3');
      assert.equal(await a.eval(count('#sheet-body [data-action="step-detail"]')),5);
      await tap(a,'#sheet-body [data-action="step-detail"][data-id="step-c"]');await expectText(a,'#sheet-body','step-c');await expectText(a,'#sheet-body','交互设计');
      await tap(a,sheetClose);await tap(a,'#page-content [data-action="new-instance"]');await tap(a,'#sheet-body [data-action="create-instance"]');
      assert.equal(await a.eval(count('#page-content [data-action="instance-detail"]')),3,'Creates a separate synthetic instance row');
      await expectText(a,body,'新建演示实例 1');
    }
  },
  {
    id:'A409-P12',name:'Feedback images load, preview, cancel deletion and confirm removal; invalid content preserves draft',
    async run(a){
      await ready(a);await route(a,'feedback');await a.fill('#feedback-text','需要同时保留图片与说明的演示意见');await tap(a,'#page-content [data-action="add-feedback-image"]');
      assert.equal(await a.eval(count('.image-tile')),1);const image=await a.eval(`${query('.image-tile img')}.src`);assert.match(image,/^data:image\/svg\+xml/);
      await tap(a,'#page-content [data-action="preview-feedback-image"]');await a.until(`${query('#image-preview')}.open && ${query('#preview-image')}.complete && ${query('#preview-image')}.naturalWidth>0`,'Synthetic image preview loaded');
      await a.screenshot('android-412-feedback-image-preview');await tap(a,'#image-preview [data-action="close-image"]');
      await tap(a,'#page-content [data-action="remove-feedback-image"]');await confirm(a,0);assert.equal(await a.eval(`${query('.image-tile img')}.src`),image);
      await tap(a,'#page-content [data-action="remove-feedback-image"]');await a.screenshot('android-412-feedback-delete-confirm');await confirm(a,1);
      assert.equal(await a.eval(count('.image-tile')),0);await a.fill('#feedback-text','');await tap(a,'#page-content [data-action="save-feedback"]');await expectText(a,'#feedback-error','请填写意见内容');
      await a.fill('#feedback-text','纠正后的意见');await tap(a,'#page-content [data-action="save-feedback"]');await tap(a,'#page-content [data-action="feedback-list"]');await expectText(a,'#sheet-body','纠正后的意见');
      await a.observe({imageSource:'generated inline SVG fixture',realAndroidPickerOrFeedbackKitInvoked:false});
    }
  },
  {
    id:'A409-P13',name:'Feedback saved snapshot survives discarded text, category and image edits; backup demonstrations are labeled',
    async run(a){
      await ready(a);await route(a,'feedback');await a.fill('#feedback-text','已保存的反馈基线');await tap(a,'#page-content [data-action="add-feedback-image"]');await tap(a,'#page-content [data-action="save-feedback"]');
      await a.fill('#feedback-text','未保存改动');await a.fill('#feedback-category','功能建议');await tap(a,'#page-content [data-action="add-feedback-image"]');
      await tap(a,'#nav-trigger');await tap(a,'#drawer-links [data-route="home"]');await confirm(a,1);await route(a,'feedback');
      assert.equal(await a.eval(`${query('#feedback-text')}.value`),'已保存的反馈基线');assert.equal(await a.eval(`${query('#feedback-category')}.value`),'交互体验');assert.equal(await a.eval(count('.image-tile')),1);
      await tap(a,'#page-content [data-action="feedback-backup"]');await expectText(a,'#sheet-body','不会生成 ZIP');
      await tap(a,'#sheet-body [data-action="demo-export"]');await expectText(a,'#backup-status','导出完成 · 演示');
      await tap(a,'#sheet-body [data-action="demo-restore"]');await confirm(a,0);await expectText(a,'#backup-status','导出完成 · 演示');
      await tap(a,'#sheet-body [data-action="demo-restore"]');await confirm(a,1);await expectText(a,'#backup-status','恢复完成 · 演示');
      await tap(a,'#sheet-body [data-action="demo-corrupt"]');await expectText(a,'#backup-status','当前意见未替换');await a.screenshot('android-412-feedback-error-design');
      await a.observe({backup:'visual state demonstration only',zipCreated:false,realStorageReplaced:false});
    }
  },
  {
    id:'A409-P14',name:'Loading, empty and error recover without erasing note draft; version is explicitly not an APK',
    async run(a){
      await ready(a);await route(a,'notes');await tap(a,'#page-content [data-action="edit-note"]');await a.fill('#note-editor','状态恢复不能丢失的备注草稿');
      for(const status of ['loading','empty','error']){
        await tap(a,'#page-menu-trigger');await tap(a,'#page-menu [data-action="demo-states"]');await tap(a,`#sheet-body [data-action="set-route-state"][data-value="${status}"]`);
        await tap(a,'#page-content [data-action="restore-route"]');assert.equal(await a.eval(`${query('#note-editor')}.value`),'状态恢复不能丢失的备注草稿');
      }
      await tap(a,'#page-content [data-action="save-note"]');await route(a,'settings');await tap(a,'#page-content [data-action="version-info"]');
      await expectText(a,'#sheet-body','非 APK');await expectText(a,'#sheet-body','编译时间：不适用');await expectText(a,'#sheet-body','7c217');
      await tap(a,'#sheet-actions [data-action="version-history"]');await expectText(a,'#sheet-body','418009');await expectText(a,'#sheet-body','2026-11-27T14:42:14.529Z');await a.screenshot('android-412-version-history');
    }
  },
  {
    id:'A409-P15',name:'Browser-only back closes top modal then walks page history without oscillation',
    async run(a){
      await ready(a);await route(a,'dashboard');await route(a,'work');await route(a,'notes');await tap(a,'#page-menu-trigger');
      assert.equal(await a.eval('window.D409AndroidPrototype.back()'),true);assert.equal(await a.eval(`${query('#page-menu')}.open`),false);assert.equal(await a.eval(text('#page-title')),'备注');
      for(const title of ['工作事项','工作台','四象限']){assert.equal(await a.eval('window.D409AndroidPrototype.back()'),true);assert.equal(await a.eval(text('#page-title')),title);}
      assert.equal(await a.eval('window.D409AndroidPrototype.back()'),false);
      await a.observe({backMethod:'explicit prototype JavaScript API',androidSystemBackProved:false,browserHistoryOverridden:false});
    }
  },
  {
    id:'A409-P16',name:'Browser touch design simulation opens drawer on long horizontal edge swipe and preserves editable content',
    async run(a){
      await ready(a);await route(a,'dashboard');
      const box=await a.eval(`(()=>{const r=document.querySelector('#page-content').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()`);
      const start=[box.left+4,box.top+60];const end=[box.left+100,box.top+62];
      await a.swipe(start,end,{duration:300});await a.until(`${query('#nav-drawer')}.open`,'Browser design edge swipe opens drawer');
      await a.screenshot('android-412-browser-edge-drawer');await tap(a,'#nav-drawer [data-action="close-drawer"]');
      await route(a,'notes');await tap(a,'#page-content [data-action="edit-note"]');await a.fill('#note-editor','边缘导航不应清空的备注草稿');
      const input=await a.eval(`(()=>{const e=document.querySelector('#note-editor');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()`);
      await a.swipe([input.left+8,input.top+40],[input.left+100,input.top+42],{duration:300});
      assert.equal(await a.eval(`${query('#nav-drawer')}.open`),false,'Editable input is excluded');assert.equal(await a.eval(`${query('#note-editor')}.value`),'边缘导航不应清空的备注草稿');
      await a.observe({gestureScope:'CDP touch inside desktop browser',threshold:'48 CSS px content edge; horizontal 55px or 32px/0.45pxms',nativeDp:false,systemExclusionRects:false,androidGesturalOrThreeButtonValidation:false});
    }
  }
];
