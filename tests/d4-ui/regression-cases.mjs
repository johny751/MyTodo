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
  const filter = name => '[data-form="task-filter"] [name="' + name + '"]';
  const menu = id => '[data-task-id="' + id + '"] [data-action="task-menu"]';
  const open = id => api.click('[data-task-id="' + id + '"] [data-action="task-open"]');
  const rows = () => read('[...document.querySelectorAll(".board .task-row")].map(el=>el.dataset.taskId)');
  const settle = () => read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');

  async function reset(mobile = false) {
    await api.configure(mobile ? 412 : 1440, mobile ? 915 : 960, mobile);
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
    await open('d4-task-0');
    await api.fill(edit('tagQuery'), '候选');
    assert.equal(await read('document.querySelectorAll("[data-catalog=tags] [role=option]").length'), 3);
    await api.key(edit('tagQuery'), 'ArrowUp');
    assert.equal(await read('document.querySelector("[data-catalog=tags] .catalog-list .selected")?.dataset.id'), '候选三');
    await api.key(edit('tagQuery'), 'Enter');
    assert.ok((await read('JSON.parse(document.querySelector(' + JSON.stringify(edit('tags')) + ').value)')).includes('候选三'));
    await api.submit('[data-form="task-edit"]');
    assert.ok((await task('d4-task-0')).tags.includes('候选三'));
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
      assert.equal(await read('document.querySelectorAll("[data-quadrant]").length'), 1);
      await invoke();
      assert.equal(await read('document.querySelectorAll("[data-quadrant]").length'), 4);
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
