import assert from 'node:assert/strict';

// Actions-only regression suite for the isolated D4 provider.
// Fixture writes below are synthetic setup, not evidence of user-entered data.
// api.fill dispatches DOM input/change; click/tap/key exercise the actual UI handlers.
// Back adapter invocations prove the Web bridge contract, not Android hardware Back.
// Every case resets through UI controls. A failure retains its state for the root
// harness screenshot/log; a successful suite resets again before other suites run.
export async function runRegressionCases(api) {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
      !/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
      env.EXPECTED_SOURCE_SHA !== env.GITHUB_SHA) {
    throw new Error('Regression cases require the exact hosted Actions checkout');
  }

  const read = expression => api.eval(expression);
  const task = id => read('D4Prototype.repo.getTask(' + JSON.stringify(id) + ')');
  const edit = name => '[data-form="task-edit"] [name="' + name + '"]';
  const quick = name => '[data-form="subtask-add"] [name="' + name + '"]';
  const filter = name => '[data-form="task-filter"] [name="' + name + '"]';
  const menu = id => '[data-task-id="' + id + '"] [data-action="task-menu"]';
  const open = id => api.click('[data-task-id="' + id + '"] [data-action="task-open"]');
  const rows = () => read('[...document.querySelectorAll(".board .task-row")].map(el=>el.dataset.taskId)');
  const settle = () => read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');

  async function reset(mobile = false) {
    await api.configure(mobile ? 412 : 1440, mobile ? 915 : 960, mobile);
    // Saving an edited task now keeps its drawer open. Close it explicitly before
    // using navigation instead of relying on the former save-and-close behavior.
    if (await read('!!document.querySelector(".modal")')) await api.click('[data-action="close-modal"]');
    await api.navigate('settings');
    await api.click('[data-action="reset-ask"]');
    await api.click('[data-action="reset-confirm"]');
    assert.equal(await read('D4Prototype.getRoute()'), 'tasks');
    assert.equal(await read('D4Prototype.kind'), 'mytodo-d4-03-synthetic-demo');
  }
  async function check(name, body, mobile = false) {
    await api.check(name, async () => {
      await reset(mobile);
      await body();
    });
  }
  function withoutOrder(value) {
    return value.map(({order, ...raw}) => raw).sort((a, b) => a.id.localeCompare(b.id));
  }
  function unchanged(before, after, edited = []) {
    for (const key of Object.keys(before).filter(key=>!edited.includes(key))) assert.deepEqual(after[key], before[key], key);
  }
  async function historicalParent({repeat = true} = {}) {
    // Valid minute schedule plus genuinely raw legacy payloads. Seconds-bearing
    // custom reminders remain a separately reported BLOCKER, never a fake fixture.
    await read(`(()=>{const today=DemoDomain.helpers.dayKey();D4Prototype.repo.transaction(s=>{
      const t=s.tasks.find(t=>t.id==='d4-task-0');Object.assign(t,{done:false,completedAt:'',
        start:today+'T09:00',end:today+'T11:30',place:'  原始园区\\n楼层 2  ',weight:12.5,
        reminder:{mode:'custom',minutes:0,days:0,at:today+'T08:45'},
        repeat:${repeat?"{frequency:'daily',interval:2,weekdays:[0,2,5],until:'',anchor:today+'T09:00'}":"null"}});
      });return true;})()`);
    await settle();
    return task('d4-task-0');
  }

  await check('R01 Explicit task selection outranks old detail-page draft and ID', async () => {
    const x = await task('d4-task-0'), y = await task('d4-task-1');
    await open(y.id);
    await api.click('[data-action="detail-go"][data-id="' + y.id + '"]');
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('id')) + ').value'), y.id);
    await api.fill(edit('title'), '旧详情页 Y 的未保存草稿');
    await api.navigate('tasks');
    if (await read('!!document.querySelector(".modal")')) await api.click('[data-action="close-modal"]');
    await open(x.id);
    await api.click('[data-action="detail-go"][data-id="' + x.id + '"]');
    assert.equal(await read('D4Prototype.getRoute()'), 'task-detail');
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('id')) + ').value'), x.id);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), x.title);
    await api.fill(edit('title'), '明确选择 X 后保存');
    await api.submit('[data-form="task-edit"]');
    assert.equal((await task(x.id)).title, '明确选择 X 后保存');
    assert.deepEqual(await task(y.id), y);
    await api.screenshot('regression-explicit-task-selection');
  });

  await check('R02 Visible menu up/down skips hidden completed task [synthetic fixture]', async () => {
    // Only fixture construction uses the repository. Reordering uses menu controls.
    await read(`(()=>{
      const repo=D4Prototype.repo;
      repo.transaction(s=>{
        const original=structuredClone(s.tasks[0]),today=DemoDomain.helpers.dayKey();
        s.tasks=['a','hidden','b'].map((suffix,index)=>({...structuredClone(original),
          id:'d4-regression-sort-'+suffix,title:'夹心排序 '+suffix,quadrant:0,
          order:index*1024,start:today+'T09:00',repeat:null,reminder:null,subtasks:[],
          done:suffix==='hidden',completedAt:suffix==='hidden'?new Date().toISOString():'',
          createdAt:'2026-01-01T00:00:00Z'}));
      });
      repo.updateDemo(d=>{d.taskLinks={};d.archivedTaskIds=[];d.taskArchiveTimes={};});
      return {kind:D4Prototype.kind,fixture:'synthetic hidden-completed sandwich'};
    })()`);
    await settle();
    for (const [name, value] of Object.entries({query:'夹心排序',status:'pending',sort:'manual',allDates:true})) {
      await api.fill(filter(name), value);
    }
    await api.submit('[data-form="task-filter"]');
    const a = 'd4-regression-sort-a', b = 'd4-regression-sort-b';
    const raw = await read('D4Prototype.repo.state.tasks');
    assert.deepEqual(await rows(), [a, b]);
    await api.click(menu(a));
    await api.click('[data-action="task-down"][data-id="' + a + '"]');
    assert.deepEqual(await rows(), [b, a]);
    await api.click(menu(a));
    await api.click('[data-action="task-up"][data-id="' + a + '"]');
    assert.deepEqual(await rows(), [a, b]);
    assert.deepEqual(withoutOrder(await read('D4Prototype.repo.state.tasks')), withoutOrder(raw));
    await api.reload();
    // The UI stores manual order; the hidden completion remains intact after reload.
    assert.deepEqual(await rows(), [a, b]);
    assert.equal((await task('d4-regression-sort-hidden')).done, true);
    await api.screenshot('regression-visible-menu-order');
  });

  await check('R03 First autocomplete ArrowUp selects last candidate [synthetic fixture]', async () => {
    await read('D4Prototype.repo.transaction(s=>{s.tags=["候选一","候选二","候选三"];})');
    await settle();
    assert.deepEqual(await read('D4Prototype.repo.state.tags'), ['候选一','候选二','候选三']);
    const before = await task('d4-task-0');
    const options = () => read('[...document.querySelectorAll("[data-catalog=tags] [role=option]")].map(el=>({action:el.dataset.action,id:el.dataset.id}))');
    const pick = id => ({action:'catalog-pick',id});
    async function firstUp(expected) {
      assert.equal(await read('document.querySelector("[data-catalog=tags] .catalog-list .selected")===null'), true, 'Query rebuild starts without an active option');
      await api.key(null, 'ArrowUp');
      assert.deepEqual(await read('(()=>{const el=document.querySelector("[data-catalog=tags] .catalog-list .selected");return el?{action:el.dataset.action,id:el.dataset.id}:null;})()'), expected);
      await api.key(null, 'Enter');
    }
    await open('d4-task-0');
    assert.equal(await read('(()=>{const input=document.querySelector(' + JSON.stringify(edit('tagQuery')) + ');input.focus();return document.activeElement===input;})()'), true, 'Focus setup does not send a preparatory pointer gesture');
    await api.fill(edit('tagQuery'), '候选');
    // A prefix without an exact catalog name appends a real create option.
    // Both its presence and the first-Up boundary must be checked explicitly.
    assert.deepEqual(await options(), [pick('候选一'),pick('候选二'),pick('候选三'),{action:'catalog-create',id:'候选'}]);
    await firstUp({action:'catalog-create',id:'候选'});
    assert.deepEqual(await read('JSON.parse(document.querySelector(' + JSON.stringify(edit('tags')) + ').value)'), [...before.tags,'候选']);
    assert.deepEqual(await task(before.id), before, 'Keyboard selection remains a draft before explicit save');
    assert.deepEqual(await read('D4Prototype.repo.state.tags'), ['候选一','候选二','候选三'], 'Selecting a create option does not silently persist it');

    await api.fill(edit('tagQuery'), '');
    assert.deepEqual(await options(), [pick('候选一'),pick('候选二'),pick('候选三')], 'Empty query has exactly three existing choices and no create row');
    await firstUp(pick('候选三'));

    await api.fill(edit('tagQuery'), '候选二');
    assert.deepEqual(await options(), [pick('候选二')], 'An exact name has no duplicate create option');
    await firstUp(pick('候选二'));
    const expectedTags = [...before.tags,'候选','候选三','候选二'];
    assert.deepEqual(await read('JSON.parse(document.querySelector(' + JSON.stringify(edit('tags')) + ').value)'), expectedTags);
    await api.submit('[data-form="task-edit"]');
    const after = await task(before.id);
    assert.deepEqual(after.tags, expectedTags);
    unchanged(before, after, ['tags']);
  });

  await check('R04 Keyboard invalid catalog name reports error and keeps unsaved draft', async () => {
    const before = await task('d4-task-0'), invalid = '界'.repeat(101);
    await open(before.id);
    await api.fill(edit('title'), '键盘错误后仍在编辑的草稿');
    await api.fill(edit('tagQuery'), invalid);
    await api.key(edit('tagQuery'), 'ArrowDown');
    await api.key(edit('tagQuery'), 'Enter');
    assert.match(await read('document.querySelector("#toast").textContent'), /100/);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), '键盘错误后仍在编辑的草稿');
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('tagQuery')) + ').value'), invalid);
    assert.deepEqual(await task(before.id), before);
    assert.equal(await read('!!document.querySelector("[data-form=task-edit]")'), true);
    await api.screenshot('regression-keyboard-error-draft');
  });

  await check('R05 Keyboard tag-capacity error preserves all 30 tags [synthetic fixture]', async () => {
    const tags = Array.from({length:30}, (_, i) => '容量标签' + i);
    await read('D4Prototype.repo.updateTask("d4-task-0",{tags:' + JSON.stringify(tags) + '})');
    await settle();
    const before = await task('d4-task-0');
    await open(before.id);
    await api.fill(edit('title'), '容量错误后的未保存标题');
    await api.fill(edit('tagQuery'), '额外容量标签');
    await api.key(edit('tagQuery'), 'ArrowDown');
    await api.key(edit('tagQuery'), 'Enter');
    assert.match(await read('document.querySelector("#toast").textContent'), /30/);
    assert.deepEqual(await read('JSON.parse(document.querySelector(' + JSON.stringify(edit('tags')) + ').value)'), tags);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), '容量错误后的未保存标题');
    assert.deepEqual(await task(before.id), before);
  });

  await check('R06 Editor preserves multiline place and fractional weight [synthetic fixture]', async () => {
    const originalPlace = '  园区 A\n楼层 2\n会议室 301  ';
    await read('D4Prototype.repo.updateTask("d4-task-0",{place:' + JSON.stringify(originalPlace) + ',weight:12.5})');
    await settle();
    const before = await task('d4-task-0');
    await open(before.id);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('place')) + ').value'), originalPlace);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('weight')) + ').value'), '12.5');
    await api.submit('[data-form="task-edit"]');
    assert.deepEqual(await task(before.id), before);
    await api.click('[data-action="close-modal"]');
    await open(before.id);
    const nextPlace = '  辅楼\n会议区 B  ';
    await api.fill(edit('place'), nextPlace);
    await api.fill(edit('weight'), '37.25');
    await api.submit('[data-form="task-edit"]');
    const after = await task(before.id);
    // Mature applyPlaceDraft trims an edited value; an untouched historical value
    // above remains exact. The test must not invent a new place-field policy.
    assert.equal(after.place, nextPlace.trim());
    assert.equal(after.weight, 37.25);
    for (const key of Object.keys(before).filter(k=>!['place','weight'].includes(k))) assert.deepEqual(after[key], before[key], key);
    await api.reload();
    assert.equal((await task(before.id)).place, nextPlace.trim());
    assert.equal((await task(before.id)).weight, 37.25);
    await api.screenshot('regression-multiline-place-weight');
  });

  await check('R06b Untouched historical whitespace-only place survives title edit [synthetic fixture]', async () => {
    const historicalPlace = ' \n  ';
    await read('D4Prototype.repo.updateTask("d4-task-0",{place:' + JSON.stringify(historicalPlace) + '})');
    await settle();
    const before = await task('d4-task-0');
    await open(before.id);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('place')) + ').value'), historicalPlace);
    await api.fill(edit('title'), '仅修改标题，历史空白地点保持');
    await api.submit('[data-form="task-edit"]');
    const after = await task(before.id);
    assert.equal(after.title, '仅修改标题，历史空白地点保持');
    for (const key of Object.keys(before).filter(k=>k!=='title')) assert.deepEqual(after[key], before[key], key);
    await api.reload();
    assert.equal((await task(before.id)).place, historicalPlace);
  });

  await check('R07 Timer completion preserves dirty personal configuration [synthetic clock fixture]', async () => {
    const config = name => '[data-form="personal-timer-config"] [name="' + name + '"]';
    await api.navigate('pomodoro');
    for (const [name,value] of Object.entries({durationMinutes:'1',breakMinutes:'1',mode:'countdown',taskId:'d4-task-0'})) await api.fill(config(name), value);
    await api.submit('[data-form="personal-timer-config"]');
    await api.click('[data-action="personal-timer-start"]');
    const session = await read('D4Prototype.repo.demo.personal.timer.sessionId');
    const draft = {durationMinutes:'17',breakMinutes:'7',mode:'countup',taskId:'d4-task-1'};
    for (const [name,value] of Object.entries(draft)) await api.fill(config(name), value);
    // Advance only the isolated clock fixture near its deadline. The application's
    // real interval tick handles completion. This is not a lock-screen/background test.
    await read(`(()=>{
      D4Prototype.repo.updateDemo(d=>{
        const t=d.personal.timer;
        t.elapsedMillis=59990;
        t.anchor.wall=Date.now()-1000;
        t.anchor.elapsed=performance.now()-1000;
      });
      return new Promise(resolve=>setTimeout(()=>resolve(true),2200));
    })()`);
    const timer = await read('D4Prototype.repo.demo.personal.timer');
    assert.equal(timer.status, 'completed');
    assert.equal(timer.sessionId, session);
    assert.equal(timer.history.filter(h=>h.id===session).length, 1);
    for (const [name,value] of Object.entries(draft)) {
      assert.equal(await read('document.querySelector(' + JSON.stringify(config(name)) + ').value'), value, name);
    }
    // Dirty controls are not already committed to the completed timer.
    assert.equal(timer.mode, 'countdown');
    assert.equal(timer.durationMinutes, 1);
    await api.submit('[data-form="personal-timer-config"]');
    const saved = await read('D4Prototype.repo.demo.personal.timer');
    assert.equal(saved.mode, 'countup');
    assert.equal(saved.durationMinutes, 17);
    assert.equal(saved.breakMinutes, 7);
    assert.equal(saved.taskId, 'd4-task-1');
    await api.screenshot('regression-timer-dirty-config');
  });

  await check('R08 Untouched historical second-bearing times survive a title-only DOM save or fail explicitly [synthetic fixture]', async () => {
    // Only start/end can carry raw seconds through the frozen isolated store.
    // normalizeReminder silently removes seconds from custom at; that separate
    // boundary is an explicit BLOCKER, not a passed fixture or a mocked store.
    // This case also requires the untouched valid custom reminder and derived
    // reminderAt to remain identical when the title changes.
    const raw = await read(`(()=>{
      const today=DemoDomain.helpers.dayKey(),fields={start:today+'T09:00:00',end:today+'T11:20:00',reminder:{mode:'custom',minutes:0,days:0,at:today+'T08:45'},repeat:null};
      D4Prototype.repo.transaction(s=>Object.assign(s.tasks.find(t=>t.id==='d4-task-0'),fields));return fields;
    })()`);
    await settle();
    const before = await task('d4-task-0'), draftTitle = '只改标题，保留历史原时间字串';
    assert.equal(before.start, raw.start); assert.equal(before.end, raw.end);
    assert.equal(before.reminder.at, raw.reminder.at);
    await open(before.id);
    const displayed = await read(`(()=>{const f=document.querySelector('[data-form="task-edit"]');return {start:f.elements.start.value,end:f.elements.end.value,reminderAt:f.elements.reminderAt.value,baseline:JSON.parse(f.dataset.baseline)};})()`);
    assert.equal(displayed.baseline.start[0], displayed.start);
    assert.equal(displayed.baseline.end[0], displayed.end);
    assert.equal(displayed.baseline.reminderAt[0], displayed.reminderAt);
    await api.fill(edit('title'), draftTitle);
    // Use the actual submit button: native constraint validation may explicitly
    // reject a historical value, while api.submit intentionally rejects invalid
    // forms before the UI is exercised. Both outcomes require zero silent edits.
    await api.click('[data-form="task-edit"] button[type="submit"]');
    const after = await task(before.id);
    if (after.title === draftTitle) {
      for (const key of Object.keys(before).filter(k=>k!=='title')) assert.deepEqual(after[key], before[key], key);
      assert.equal(after.start, raw.start); assert.equal(after.end, raw.end);
      assert.equal(after.reminder.at, raw.reminder.at);
      assert.equal(await read('!!document.querySelector(".task-drawer [data-form=task-edit]")'), true);
      assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), draftTitle);
    } else {
      assert.deepEqual(after, before);
      assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), draftTitle);
      const failure = await read(`(()=>{const f=document.querySelector('[data-form="task-edit"]');return {dirty:f.dataset.dirty,toast:document.querySelector('#toast').textContent,validation:[...f.elements].filter(e=>!e.checkValidity()).map(e=>e.validationMessage)};})()`);
      assert.equal(failure.dirty, 'true');
      assert.ok(/时间|保存失败|有效/.test(failure.toast) || failure.validation.some(Boolean), 'Historical values require an explicit validation failure');
    }
    await api.screenshot('regression-historical-time-baseline');
  });

  await check('R09 Untouched daily-repeat weekday payload survives title-only save [synthetic fixture]', async () => {
    await read(`(()=>{const today=DemoDomain.helpers.dayKey();D4Prototype.repo.updateTask('d4-task-0',{repeat:{frequency:'daily',interval:2,weekdays:[0,2,5],until:'',anchor:today+'T09:00'},reminder:null});return true;})()`);
    await settle();
    const before = await task('d4-task-0');
    assert.deepEqual(before.repeat.weekdays, [0,2,5]);
    await open(before.id); await api.fill(edit('title'), '日循环原星期载荷不被重建');
    await api.submit('[data-form="task-edit"]');
    const after = await task(before.id);
    assert.equal(after.title, '日循环原星期载荷不被重建');
    assert.deepEqual(after.repeat, before.repeat);
    for (const key of Object.keys(before).filter(k=>k!=='title')) assert.deepEqual(after[key], before[key], key);
    await api.click('[data-action="close-modal"]'); await api.reload();
    assert.deepEqual((await task(before.id)).repeat, before.repeat);
  });

  await check('R10 Task-detail tag chips and hidden values stay equal through a real render [synthetic fixture]', async () => {
    const before = await task('d4-task-0'), added = '详情重绘新增标签';
    await open(before.id); await api.click('[data-action="detail-go"][data-id="' + before.id + '"]');
    assert.equal(await read('D4Prototype.getRoute()'), 'task-detail');
    assert.equal(await read('!!document.querySelector(".modal")'), false);
    await api.fill(edit('title'), '标签重绘期间的标题草稿');
    await api.fill(edit('tagQuery'), added); await api.key(edit('tagQuery'), 'ArrowDown'); await api.key(edit('tagQuery'), 'Enter');
    await api.click('[data-form="task-edit"] [data-action="tag-remove"][data-id="' + before.tags[0] + '"]');
    const state = () => read(`(()=>{const f=document.querySelector('[data-form="task-edit"]');return {id:f.elements.id.value,title:f.elements.title.value,hidden:JSON.parse(f.elements.tags.value),chips:[...f.querySelectorAll('.tag-chip')].map(el=>el.dataset.id),dirty:f.dataset.dirty,baseline:JSON.parse(f.dataset.baseline)};})()`);
    const draft = await state();
    assert.deepEqual(draft.hidden, draft.chips); assert.ok(draft.hidden.includes(added));
    assert.ok(!draft.hidden.includes(before.tags[0])); assert.equal(draft.dirty, 'true');
    // Repository setup triggers the application's real subscription/render path.
    await read('D4Prototype.repo.updateDemo(d=>{d.ui={...(d.ui||{}),regressionRenderTick:1};})'); await settle();
    const restored = await state();
    assert.deepEqual(restored, draft); assert.deepEqual(restored.hidden, restored.chips);
    assert.deepEqual(await task(before.id), before);
    await api.submit('[data-form="task-edit"]');
    const after = await task(before.id);
    assert.equal(after.title, draft.title); assert.deepEqual(after.tags, draft.hidden);
    for (const key of Object.keys(before).filter(k=>!['title','tags'].includes(k))) assert.deepEqual(after[key], before[key], key);
    const displayed = await state();
    assert.deepEqual(displayed.hidden, after.tags); assert.deepEqual(displayed.chips, after.tags);
    await api.screenshot('regression-detail-tag-chips-baseline');
  });

  await check('R11 Consecutive drawer saves retain the drawer and display committed values', async () => {
    const before = await task('d4-task-1');
    await open(before.id); await api.fill(edit('title'), '抽屉保存后的最新标题');
    await api.fill(edit('notes'), '抽屉保持打开，并显示已保存的备注');
    await api.submit('[data-form="task-edit"]');
    const first = await task(before.id);
    assert.equal(first.title, '抽屉保存后的最新标题'); assert.equal(first.notes, '抽屉保持打开，并显示已保存的备注');
    for (const key of Object.keys(before).filter(k=>!['title','notes'].includes(k))) assert.deepEqual(first[key], before[key], key);
    const drawer = () => read(`(()=>{const f=document.querySelector('.task-drawer [data-form="task-edit"]');return f?{id:f.elements.id.value,title:f.elements.title.value,notes:f.elements.notes.value,baseline:JSON.parse(f.dataset.baseline)}:null;})()`);
    const firstDisplay = await drawer(); assert.ok(firstDisplay);
    assert.equal(firstDisplay.id, before.id); assert.equal(firstDisplay.title, first.title); assert.equal(firstDisplay.notes, first.notes);
    assert.equal(firstDisplay.baseline.title[0], first.title); assert.equal(firstDisplay.baseline.notes[0], first.notes);
    await api.fill(edit('title'), '同一抽屉第二次保存'); await api.submit('[data-form="task-edit"]');
    const second = await task(before.id), secondDisplay = await drawer();
    assert.ok(secondDisplay); assert.equal(second.title, '同一抽屉第二次保存');
    assert.equal(second.notes, first.notes); assert.equal(secondDisplay.title, second.title); assert.equal(secondDisplay.notes, second.notes);
    for (const key of Object.keys(first).filter(k=>k!=='title')) assert.deepEqual(second[key], first[key], key);
    assert.match(await read('document.querySelector("#toast").textContent'), /已保存/);
    await api.screenshot('regression-drawer-saved-values');
    await api.click('[data-action="close-modal"]');
    assert.equal(await read('!!document.querySelector(".modal")'), false);
  });

  for (const [name, leave] of [
    ['close', () => api.click('.task-drawer [data-action="close-modal"]')],
    ['back', async () => {await read('D4PreviewBack()'); await settle();}]
  ]) {
    await check('R12-' + name + ' Leaving a valid dirty editor saves raw parent fields before exit [synthetic fixture]', async () => {
      const before = await historicalParent(), title = '离开详情前保存标题 ' + name, notes = '离开详情前保存备注\n' + name;
      await open(before.id); await api.fill(edit('title'), title); await api.fill(edit('notes'), notes);
      assert.deepEqual(await task(before.id), before, 'Typing must remain a draft until the leave gate runs');
      await leave();
      assert.equal(await read('!!document.querySelector(".modal")'), false);
      const saved = await task(before.id);
      assert.equal(saved.title, title); assert.equal(saved.notes, notes); unchanged(before, saved, ['title','notes']);
      await api.reload(); assert.deepEqual(await task(before.id), saved);
      await api.screenshot('regression-leave-saves-' + name);
    });
  }

  for (const [name, attempt, invalid] of [
    ['close', () => api.click('.task-drawer [data-action="close-modal"]'), 'schedule'],
    ['back', async () => {await read('D4PreviewBack()'); await settle();}, 'html-required'],
    ['complete', () => api.click('.task-drawer [data-action="task-toggle"][data-id="d4-task-0"]'), 'trimmed-title'],
    ['subtask', () => api.submit('[data-form="subtask-add"]'), 'trimmed-title']
  ]) {
    await check('R13-' + name + ' Invalid parent draft blocks exit/completion/child creation and retains inputs [synthetic fixture]', async () => {
      const before = await historicalParent({repeat:false}), draftTitle = invalid==='schedule'?'有效标题，但截止早于开始':invalid==='html-required'?'':' \n ';
      const draftEnd = invalid==='schedule'?before.start.slice(0,10)+'T08:30':before.end;
      await open(before.id); await api.fill(edit('title'), draftTitle); await api.fill(edit('end'), draftEnd);
      await api.fill(edit('notes'), '校验失败仍保留备注草稿');
      await api.fill(quick('title'), '校验失败时不能创建的子任务');
      await attempt();
      assert.deepEqual(await task(before.id), before);
      assert.equal(await read('!!document.querySelector(".task-drawer [data-form=task-edit]")'), true);
      assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), draftTitle);
      assert.equal(await read('document.querySelector(' + JSON.stringify(edit('end')) + ').value'), draftEnd);
      assert.equal(await read('document.querySelector(' + JSON.stringify(edit('notes')) + ').value'), '校验失败仍保留备注草稿');
      assert.equal(await read('document.querySelector(' + JSON.stringify(quick('title')) + ').value'), '校验失败时不能创建的子任务');
      const failure = await read(`(()=>{const f=document.querySelector('[data-form="task-edit"]');return {
        toast:document.querySelector('#toast').textContent,validation:[...f.elements].filter(e=>!e.checkValidity()).map(e=>e.validationMessage)
      };})()`);
      assert.ok(/任务内容|有效|保存失败|早于|结束时间/.test(failure.toast) || failure.validation.some(Boolean), 'The blocked action must expose a validation failure');
      // The explicit Cancel action is a deliberate discard; it must not be used
      // as a substitute for the failing close/back save path above.
      await api.click('[data-form="task-edit"] [data-action="task-discard"]');
      assert.deepEqual(await task(before.id), before);
      assert.equal(await read('!!document.querySelector(".modal")'), false);
    });
  }

  await check('R14 Completing a dirty editor first commits parent raw fields [synthetic fixture]', async () => {
    const before = await historicalParent({repeat:false}), title = '保存草稿后完成', notes = '完成前提交的备注\n保持原始地点';
    await open(before.id); await api.fill(edit('title'), title); await api.fill(edit('notes'), notes);
    await api.click('.task-drawer [data-action="task-toggle"][data-id="' + before.id + '"]');
    const saved = await task(before.id);
    assert.equal(saved.title, title); assert.equal(saved.notes, notes); assert.equal(saved.done, true);
    assert.ok(Number.isFinite(Date.parse(saved.completedAt)));
    // Frozen reminderTime returns null for a completed task. Keep the original
    // reminder rule exact while checking this mature derived-value transition.
    assert.equal(saved.reminderAt, null); unchanged(before, saved, ['title','notes','done','completedAt','reminderAt']);
    assert.equal(await read('!!document.querySelector(".task-drawer [data-form=task-edit]")'), true);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), title);
    await api.click('.task-drawer [data-action="close-modal"]'); await api.reload();
    assert.deepEqual(await task(before.id), saved);
    await api.screenshot('regression-complete-saves-parent');
  });

  await check('R15 Adding a quick child first saves parent draft and preserves all other raw fields [synthetic fixture]', async () => {
    const before = await historicalParent(), title = '添加子任务前提交父任务', childTitle = '新子任务\n第二行';
    await open(before.id); await api.fill(edit('title'), title); await api.fill(edit('notes'), '添加子任务前提交父备注');
    await api.fill(quick('title'), '  ' + childTitle + '  '); await api.submit('[data-form="subtask-add"]');
    const saved = await task(before.id), child = saved.subtasks.find(x=>!before.subtasks.some(old=>old.id===x.id));
    assert.equal(saved.title, title); assert.equal(saved.notes, '添加子任务前提交父备注');
    unchanged(before, saved, ['title','notes','subtasks']);
    assert.equal(saved.subtasks.length, before.subtasks.length + 1); assert.ok(child); assert.equal(child.title, childTitle);
    assert.deepEqual(saved.subtasks.filter(x=>x.id!==child.id), before.subtasks);
    for (const key of ['quadrant','project','place','tags']) assert.deepEqual(child[key], saved[key], key);
    assert.equal(await read('document.querySelector(' + JSON.stringify(quick('title')) + ').value'), '');
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), title);
    await api.click('.task-drawer [data-action="close-modal"]'); await api.reload();
    assert.deepEqual(await task(before.id), saved);
    await api.screenshot('regression-subtask-saves-parent');
  });

  await check('R16 Back saves parent and nonblank quick child exactly once [synthetic fixture]', async () => {
    const before = await historicalParent(), childTitle = '返回时保存快捷子任务';
    await open(before.id); await api.fill(edit('notes'), '返回时父任务备注也保存'); await api.fill(quick('title'), childTitle);
    await read('D4PreviewBack()'); await settle();
    assert.equal(await read('!!document.querySelector(".modal")'), false);
    const saved = await task(before.id);
    assert.equal(saved.notes, '返回时父任务备注也保存'); unchanged(before, saved, ['notes','subtasks']);
    const added = saved.subtasks.filter(x=>!before.subtasks.some(old=>old.id===x.id));
    assert.equal(added.length, 1); assert.equal(added[0].title, childTitle);
    assert.deepEqual(saved.subtasks.filter(x=>x.id!==added[0].id), before.subtasks);
    await open(before.id); assert.equal(await read('document.querySelector(' + JSON.stringify(quick('title')) + ').value'), '');
    await api.click('.task-drawer [data-action="close-modal"]');
    assert.deepEqual(await task(before.id), saved, 'Closing again must not duplicate the already-added quick child');
    await api.reload(); assert.deepEqual(await task(before.id), saved);
  });

  await check('R17 Captured editor base merges a distinct synthetic concurrent field edit [synthetic fixture]', async () => {
    const before = await historicalParent(), localTitle = '本地草稿标题', remoteNotes = '隔离并发更新的备注', remotePlace = '  并发原始地点\n房间 B  ';
    const initialIds = await read('D4Prototype.repo.state.tasks.map(t=>t.id)');
    await open(before.id); await api.fill(edit('title'), localTitle);
    // A direct synthetic provider edit simulates a concurrent writer. It is not
    // remote connectivity or production synchronization evidence.
    await read('D4Prototype.repo.updateTask(' + JSON.stringify(before.id) + ',{notes:' + JSON.stringify(remoteNotes) + ',place:' + JSON.stringify(remotePlace) + '})');
    await settle();
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), localTitle);
    await api.submit('[data-form="task-edit"]');
    const saved = await task(before.id);
    assert.equal(saved.title, localTitle); assert.equal(saved.notes, remoteNotes); assert.equal(saved.place, remotePlace);
    unchanged(before, saved, ['title','notes','place']);
    assert.deepEqual(await read('D4Prototype.repo.state.tasks.map(t=>t.id)'), initialIds);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('notes')) + ').value'), remoteNotes);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('place')) + ').value'), remotePlace);
    await api.click('.task-drawer [data-action="close-modal"]'); await api.reload();
    assert.deepEqual(await task(before.id), saved);
    await api.screenshot('regression-editor-distinct-field-merge');
  });

  await check('R18 Same-field conflict preserves local original and complete concurrent conflict copy [synthetic fixture]', async () => {
    await historicalParent();
    await read(`(()=>{D4Prototype.repo.transaction(s=>{const t=s.tasks.find(t=>t.id==='d4-task-0');
      t.subtasks=[{...structuredClone(t),id:'d4-regression-conflict-child',title:'冲突副本须保留子任务',subtasks:[],repeat:null,reminder:null}];
      });return true;})()`); await settle();
    const before = await task('d4-task-0'), localTitle = '本地并发标题', remoteTitle = '并发写入标题';
    const originalIds = await read('D4Prototype.repo.state.tasks.map(t=>t.id)');
    await open(before.id); await api.fill(edit('title'), localTitle);
    await read('D4Prototype.repo.updateTask(' + JSON.stringify(before.id) + ',{title:' + JSON.stringify(remoteTitle) + '})'); await settle();
    const remote = await task(before.id);
    await api.submit('[data-form="task-edit"]');
    const saved = await task(before.id), added = await read('D4Prototype.repo.state.tasks.filter(t=>!' + JSON.stringify(originalIds) + '.includes(t.id))');
    assert.equal(saved.title, localTitle); unchanged(before, saved, ['title']);
    assert.equal(added.length, 1); const copy = added[0];
    assert.match(copy.id, /^conflict-/); assert.equal(copy.title, '[同步冲突副本] ' + remoteTitle);
    unchanged(remote, copy, ['id','title','subtasks']); assert.equal(copy.subtasks.length, remote.subtasks.length);
    for (let i=0;i<copy.subtasks.length;i++) {
      assert.notEqual(copy.subtasks[i].id, remote.subtasks[i].id);
      unchanged(remote.subtasks[i], copy.subtasks[i], ['id']);
    }
    await api.click('.task-drawer [data-action="close-modal"]'); await api.reload();
    assert.deepEqual(await task(before.id), saved); assert.deepEqual(await task(copy.id), copy);
    await api.screenshot('regression-editor-conflict-copy');
  });

  await check('R19 Concurrently deleted parent is never resurrected by saving or closing its draft [synthetic fixture]', async () => {
    const before = await historicalParent(); await open(before.id); await api.fill(edit('title'), '已删除任务仍保留的编辑草稿');
    await read('D4Prototype.repo.deleteTask(' + JSON.stringify(before.id) + ')'); await settle();
    await api.submit('[data-form="task-edit"]');
    assert.equal(await task(before.id), null);
    assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), '已删除任务仍保留的编辑草稿');
    assert.match(await read('document.querySelector("#toast").textContent'), /不存在|删除/);
    await api.click('.task-drawer [data-action="close-modal"]');
    assert.equal(await task(before.id), null); assert.equal(await read('!!document.querySelector(".modal")'), true);
    await api.click('[data-form="task-edit"] [data-action="task-discard"]');
    assert.equal(await read('!!document.querySelector(".modal")'), false);
    assert.equal(await task(before.id), null);
  });

  await check('R20 Synthetic quota failure honestly retains memory edit and blocks destructive editor exits [synthetic storage failure]', async () => {
    const before = await historicalParent({repeat:false}), title = '写入失败仍在内存的标题';
    const storedBefore = await read('localStorage.getItem(D4Prototype.storageKey)');
    assert.equal((await read('D4Prototype.repo.persistence()')).mode, 'localStorage');
    await open(before.id); await api.fill(edit('title'), title);
    // Only the documented D4 synthetic namespace fails. No other namespace is
    // read, removed, overwritten or tested. Restore the native method in finally.
    await read(`(()=>{window.__d4RegressionSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){
      if(key===D4Prototype.storageKey)throw new Error('d4 synthetic quota failure');
      return window.__d4RegressionSetItem.call(this,key,value);
    };return true;})()`);
    try {
      await api.submit('[data-form="task-edit"]');
      const memory = await task(before.id), persistence = await read('D4Prototype.repo.persistence()');
      assert.equal(memory.title, title); unchanged(before, memory, ['title']);
      assert.equal(persistence.mode, 'memory'); assert.match(persistence.error, /synthetic quota failure/);
      assert.equal(await read('localStorage.getItem(D4Prototype.storageKey)'), storedBefore);
      assert.equal(await read('!!document.querySelector(".task-drawer [data-form=task-edit]")'), true);
      assert.match(await read('document.querySelector("#toast").textContent'), /仅保存在当前会话内存/);
      await api.fill(quick('title'), '存储失败时不能创建的子任务');
      for (const attempt of [
        () => api.click('.task-drawer [data-action="close-modal"]'),
        () => api.click('.task-drawer [data-action="task-toggle"][data-id="' + before.id + '"]'),
        () => api.submit('[data-form="subtask-add"]')
      ]) {
        await attempt(); assert.deepEqual(await task(before.id), memory);
        assert.equal(await read('!!document.querySelector(".task-drawer [data-form=task-edit]")'), true);
        assert.equal(await read('document.querySelector(' + JSON.stringify(edit('title')) + ').value'), title);
        assert.equal(await read('document.querySelector(' + JSON.stringify(quick('title')) + ').value'), '存储失败时不能创建的子任务');
        assert.match(await read('document.querySelector("#toast").textContent'), /仅保存在当前会话内存/);
      }
      // The harness keeps toasts in screenshots whose name starts "failure-".
      // This is an expected injected failure; the case status still records the
      // actual assertions, and does not count this evidence filename as a failure.
      await api.screenshot('failure-expected-synthetic-quota-warning');
    } finally {
      await read('(()=>{Storage.prototype.setItem=window.__d4RegressionSetItem;delete window.__d4RegressionSetItem;return true;})()');
      await api.reload();
    }
    // Reopening reads the old durable bytes. The accepted memory edit must never
    // be presented as persistence across reload or as native SQLite validation.
    assert.deepEqual(await task(before.id), before);
    assert.equal(await read('localStorage.getItem(D4Prototype.storageKey)'), storedBefore);
    assert.equal((await read('D4Prototype.repo.persistence()')).mode, 'localStorage');
  });

  for (const [name, expression] of [
    ['D4PreviewBack', 'D4PreviewBack()'],
    ['gx-back', 'window.dispatchEvent(new Event("gx-back"))']
  ]) {
    await check('R-back-' + name + ' Web adapter closes drawer/modal and returns from zoom', async () => {
      const invoke = async () => {await read(expression); await settle();};
      await api.navigate('notes');
      await api.swipe([3,175], [155,177]);
      assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'), true);
      await invoke();
      assert.equal(await read('!!document.querySelector(".app-shell.nav-open")'), false);
      assert.equal(await read('D4Prototype.getRoute()'), 'notes');
      await invoke();
      assert.equal(await read('D4Prototype.getRoute()'), 'tasks');
      await api.tap('[data-action="quadrant-focus"][data-id="0"]');
      assert.equal(await read('document.querySelectorAll(".board [data-quadrant]").length'), 1);
      assert.deepEqual(await read('[...document.querySelectorAll(".quadrant-peeks .quadrant-peek[data-quadrant]")].map(el=>Number(el.dataset.quadrant)).sort()'), [1,2,3]);
      await invoke();
      assert.equal(await read('document.querySelectorAll(".board [data-quadrant]").length'), 4);
      await api.tap('[data-task-id="d4-task-0"] [data-action="task-open"]');
      assert.equal(await read('!!document.querySelector(".modal")'), true);
      await invoke();
      assert.equal(await read('!!document.querySelector(".modal")'), false);
      assert.equal(await read('D4Prototype.getRoute()'), 'tasks');
      await api.navigate('projects');
      await invoke();
      assert.equal(await read('D4Prototype.getRoute()'), 'tasks');
      await api.screenshot('regression-back-' + name);
    }, true);
  }

  await reset();
}
