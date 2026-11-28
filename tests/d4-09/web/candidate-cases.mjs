import assert from 'node:assert/strict';

const action = (name, id) => `[data-action="${name}"]${id === undefined ? '' : `[data-id="${id}"]`}`;
const field = (form, name) => `[data-form="${form}"] [name="${name}"]`;
const vfield = (form, name) => `[data-v2-form="${form}"] [name="${name}"]`;
const get = (a, expression) => a.eval(expression);
const state = a => get(a, 'D4Prototype.getState()');
const value = (a, selector) => get(a, `document.querySelector(${JSON.stringify(selector)}).value`);
const preview = '[data-d409-work-preview]';
const list = '[data-d409-work-list]';
const previewId = a => get(a, 'document.querySelector("[data-d409-work-preview]")?.dataset.previewId');
const inputValue = (a, selector) => get(a, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {value:e.value,dirty:e.closest('form').dataset.dirty};})()`);
async function select(a, id) {
  if (!await a.visible(list)) await a.click(action('work-preview-back'));
  await a.click(action('work-preview-select', id));
  assert.equal(await previewId(a), id);
  assert.equal(await a.visible(preview), true);
}
async function assertSplit(a, left, right) {
  await a.eval('document.querySelector("main").scrollTop=0;true');
  await a.settle();
  const l = await a.box(left), r = await a.box(right);
  assert.ok(l.width >= 220 && r.width >= 220, 'Both desktop panes have useful width');
  assert.ok(r.x >= l.right - 2, 'Desktop panes are alongside each other');
  assert.ok(Math.abs(r.y - l.y) <= 32, 'Desktop panes begin together');
  a.observe({split: {left: l, right: r}});
}
async function firstEntity(a, route) {
  const key = {'work-items': 'workItems', projects: 'projects', templates: 'templates', processes: 'processes', contacts: 'contacts'}[route];
  return (await state(a))[key].find(x => !x.archived);
}
async function openV2(a) {
  await a.navigate('settings');
  await a.until('!!document.querySelector("[data-v2-candidate]")', 'V2 panel mounted');
  await a.click('[data-v2-action="open"]');
}

export const candidateCases = [
  {id: 'W409-U01', name: 'All twenty real candidate routes remain reachable through the visible navigation', async run(a) {
    const routes = await get(a, 'D4Prototype.routes');
    assert.equal(routes.length, 20); assert.equal(new Set(routes).size, 20);
    assert.equal(await get(a, 'document.body.hasAttribute("data-d409-ui")'), true, 'Actual candidate carries the new UI marker');
    assert.equal(await get(a, '!!window.D409WebPrototype'), false, 'Memory-only design prototype must not replace the candidate');
    for (const route of routes) {
      await a.navigate(route);
      const observed = await get(a, `({route:D4Prototype.getRoute(),main:document.querySelector('main').dataset.route,active:[...document.querySelectorAll('nav [aria-current="page"]')].map(x=>x.dataset.id),title:document.querySelector('main .page-heading h1,main .page-heading h2')?.textContent?.trim()})`);
      assert.equal(observed.route, route); assert.equal(observed.main, route); assert.deepEqual(observed.active, [route]);
      assert.ok(observed.title, 'Visible page title on ' + route);
      a.observe(observed);
      if (['dashboard', 'tasks', 'settings'].includes(route)) await a.screenshot('desktop-' + route);
    }
  }},
  {id: 'W409-U02', name: 'Desktop work preview is read-only and forwards to the original detail and edit/save flow', async run(a) {
    await a.navigate('work-items');
    const work = await firstEntity(a, 'work-items'), before = await a.stores();
    await select(a, work.id);
    assert.deepEqual(await a.stores(), before, 'Selecting a preview never writes either storage domain');
    await assertSplit(a, list, preview);
    assert.equal(await get(a, 'document.querySelector("[data-d409-work-preview]").querySelectorAll("form,input,textarea,select").length'), 0);
    await a.screenshot('desktop-work-split');
    await a.click(action('work-preview-detail', work.id));
    assert.equal(await a.visible('.modal .work-note-content'), true);
    await a.click('.modal ' + action('work-close'));
    await a.click(action('work-preview-edit', work.id));
    const note = 'D409 original editor saves\n完整备注继续保留。';
    await a.fill(field('work-work-item', 'notes'), note);
    await a.submit('[data-form="work-work-item"]');
    const saved = (await state(a)).workItems.find(x => x.id === work.id);
    assert.equal(saved.notes, note);
    for (const key of ['id', 'title', 'projectId', 'processId', 'plannedStart', 'dueDate', 'status', 'owner']) assert.deepEqual(saved[key], work[key], key);
    await select(a, work.id);
    assert.equal(await get(a, 'document.querySelector("[data-d409-preview-notes]").textContent'), note);
    await a.reload();
    assert.equal((await state(a)).workItems.find(x => x.id === work.id).notes, note);
  }},
  {id: 'W409-U03', name: 'Project/template/process/contact previews share the layout without cloning old forms or changing data', async run(a) {
    for (const route of ['projects', 'templates', 'processes', 'contacts']) {
      await a.navigate(route);
      const entity = await firstEntity(a, route), before = await a.stores();
      assert.ok(entity, 'Known synthetic route has data: ' + route);
      await select(a, entity.id);
      assert.deepEqual(await a.stores(), before, route + ' preview is read-only');
      await assertSplit(a, list, preview);
      assert.equal(await get(a, 'document.querySelector("[data-d409-work-preview]").querySelectorAll("form,input,textarea,select").length'), 0);
      const unexpected = await get(a, `[...document.querySelectorAll('[data-d409-work-preview] [data-action]')].map(e=>e.dataset.action).filter(x=>!x.startsWith('work-preview-'))`);
      assert.deepEqual(unexpected, [], 'Preview actions have separate presentation selectors');
      await a.noOverflow(route);
      await a.screenshot('desktop-' + route + '-preview');
    }
  }},
  {id: 'W409-U04', name: '360/412/768 layouts start with the original list and allow explicit preview/back; immediate menu hit works after resize', async run(a) {
    for (const width of [360, 412, 768]) {
      await a.configure(1440, 960, false);
      await a.reload(); await a.navigate('work-items');
      await a.configureRaw(width, 900, width < 768);
      if (width < 768) {
        const firstHit = await a.hit(action('nav-toggle'), {scroll: false});
        a.observe({width, firstHitAfterResize: firstHit, noPreClickSleep: true});
        assert.equal(firstHit.ok, true, 'First click must not be covered by the closed sidebar');
        await a.click(action('nav-toggle'));
        assert.equal(await get(a, 'document.querySelector(".app-shell").classList.contains("nav-open")'), true);
        await a.screenshot('menu-' + width);
        await a.click('nav ' + action('go', 'work-items'));
      } else await a.settle();
      assert.equal(await a.visible('.work-record-table'), true, 'Old initial mobile table remains available');
      assert.equal(await a.visible(list), true);
      await a.noOverflow('initial-list-' + width);
      await a.screenshot('list-' + width);
      const work = await firstEntity(a, 'work-items'), before = await a.stores();
      await select(a, work.id);
      assert.equal(await a.visible(list), false, 'Explicit selection uses one pane on narrow screens');
      await a.noOverflow('preview-' + width);
      await a.screenshot('preview-' + width);
      await a.click(action('work-preview-back'));
      assert.equal(await a.visible(list), true);
      assert.deepEqual(await a.stores(), before, 'Narrow preview/back do not persist UI selection');
    }
  }},
  {id: 'W409-U05', name: 'Historical timestamps, unknown values and full selectable work notes survive new preview and original editor', async run(a) {
    const fixture = {id: 'd409-rich-work', title: 'D409 historical values', projectId: 'missing-original-project', processId: 'missing-original-process', owner: null, status: 'legacy-wait', priority: null, description: null, notes: '首行：保留完整长备注\n' + '不能裁剪、可选择的历史正文。'.repeat(36) + '\n末行：完整证据', plannedStart: '2032-05-07T04:34:56.789+05:30', dueDate: 'legacy-unknown-time-' + 'ABCDEFGHIJ'.repeat(20), history: [], attachments: [], archived: false, extension: {opaque: [null, 0, 'kept']}};
    await a.fixture('rich historical synthetic work item', `D4Prototype.repo.updateDemo(d=>{d.workItems.unshift(${JSON.stringify(fixture)});});true`);
    for (const width of [1440, 360, 412]) {
      await a.configure(width, 960, width < 768); await a.navigate('work-items'); await select(a, fixture.id);
      const contents = await get(a, 'document.querySelector("[data-d409-work-preview]").textContent');
      assert.ok(contents.includes(fixture.plannedStart)); assert.ok(contents.includes(fixture.dueDate));
      assert.equal(await get(a, 'document.querySelector("[data-d409-preview-notes]").textContent'), fixture.notes);
      await a.noOverflow('long-preview-' + width);
      await a.click(action('work-preview-detail', fixture.id));
      const box = await a.box('.modal .work-note-content');
      assert.equal(box.userSelect === 'none', false); assert.ok(['none', ''].includes(box.lineClamp));
      assert.ok(!['hidden', 'clip'].includes(box.overflowY) || box.scrollHeight <= box.clientHeight + 1, 'Long note is not clipped');
      assert.ok(box.scrollWidth <= box.clientWidth + 2, 'Long note wraps without clipping');
      const selected = await get(a, `(()=>{const e=document.querySelector('.modal .work-note-content');e.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);return String(s);})()`);
      assert.equal(selected, fixture.notes);
      a.observe({selectionEvidence: 'Browser DOM Range rendering only; not Android system long-press selection', width});
      await a.screenshot('long-note-selection-' + width);
      await a.click('.modal ' + action('work-close'));
    }
    await a.click(action('work-preview-edit', fixture.id));
    await a.fill(field('work-work-item', 'notes'), fixture.notes + '\n已编辑');
    await a.submit('[data-form="work-work-item"]');
    const saved = (await state(a)).workItems.find(x => x.id === fixture.id);
    for (const key of ['projectId', 'processId', 'plannedStart', 'dueDate', 'owner', 'status', 'priority', 'description', 'extension']) assert.deepEqual(saved[key], fixture[key], key);
    assert.equal(saved.notes, fixture.notes + '\n已编辑');
    await a.reload(); assert.deepEqual((await state(a)).workItems.find(x => x.id === fixture.id), saved);
  }},
  {id: 'W409-U06', name: 'Task drawer repaint preserves dirty content, baseline, focus and caret before explicit cancellation', async run(a) {
    await a.navigate('tasks'); await a.click(action('task-open', 'd4-task-0'));
    const taskBefore = await get(a, 'D4Prototype.repo.getTask("d4-task-0")');
    const selector = field('task-edit', 'notes'), draft = 'D409 草稿\n保持光标与输入，不自动覆盖';
    await a.fill(selector, draft); await a.click(selector);
    await get(a, `document.querySelector(${JSON.stringify(selector)}).setSelectionRange(3,8,'forward');true`);
    const before = await a.snapshot('dirty-task-before-repaint');
    await a.fixture('unrelated synthetic UI repaint', 'D4Prototype.repo.updateDemo(d=>{d.ui.d409Repaint="task-draft";});true');
    const after = await a.snapshot('dirty-task-after-repaint');
    const first = before.forms.find(x => x.name === 'task-edit'), next = after.forms.find(x => x.name === 'task-edit');
    assert.deepEqual(next, first); assert.deepEqual(after.focus, before.focus);
    assert.equal(await value(a, selector), draft);
    assert.deepEqual(await get(a, 'D4Prototype.repo.getTask("d4-task-0")'), taskBefore, 'An unrelated repaint does not save a draft');
    await a.screenshot('task-dirty-focus');
    await a.click(action('task-discard'));
    assert.deepEqual(await get(a, 'D4Prototype.repo.getTask("d4-task-0")'), taskBefore);
    await a.click(action('task-open', 'd4-task-0'));
    assert.equal(await value(a, selector), taskBefore.notes);
  }},
  {id: 'W409-U07', name: 'Multiline notes use real Enter/Ctrl+Enter and retain cancel/delete/persistence behavior', async run(a) {
    await a.navigate('notes');
    const tasks = await get(a, 'D4Prototype.repo.state.tasks');
    await a.click(action('personal-note-new'));
    const selector = field('personal-note', 'body');
    await a.text(selector, 'D409 第一行'); await a.key(null, 'Enter'); await a.text(null, '第二行');
    assert.equal(await value(a, selector), 'D409 第一行\n第二行');
    assert.equal((await state(a)).notes.length, 0, 'Plain Enter is a newline, not Save');
    await a.key(null, 'Enter', 2);
    const note = (await state(a)).notes.find(x => x.body === 'D409 第一行\n第二行'); assert.ok(note);
    await a.reload(); await a.navigate('notes');
    assert.equal((await state(a)).notes.find(x => x.id === note.id).body, note.body);
    await a.click(action('personal-note-edit', note.id)); await a.fill(selector, 'Discarded temporary edit');
    await a.click('.modal ' + action('personal-close'));
    assert.equal((await state(a)).notes.find(x => x.id === note.id).body, note.body);
    for (const width of [1440, 360, 412]) {
      await a.configure(width, 900, width < 768); await a.noOverflow('notes-' + width); await a.screenshot('notes-' + width);
    }
    await a.click(action('personal-note-delete', note.id)); await a.click(action('personal-close'));
    assert.ok((await state(a)).notes.some(x => x.id === note.id));
    await a.click(action('personal-note-delete', note.id)); await a.click(action('personal-note-delete-confirm', note.id));
    assert.equal((await state(a)).notes.some(x => x.id === note.id), false);
    await a.reload(); assert.equal((await state(a)).notes.some(x => x.id === note.id), false);
    assert.deepEqual(await get(a, 'D4Prototype.repo.state.tasks'), tasks, 'Independent note deletion leaves tasks intact');
  }},
  {id: 'W409-U08', name: 'Timer focus/history layout uses the existing running clock and preserves config draft across live ticks', async run(a) {
    await a.navigate('pomodoro');
    await a.fill(field('personal-timer-config', 'mode'), 'countup'); await a.submit('[data-form="personal-timer-config"]');
    await assertSplit(a, '#personal-timer', '[data-d409-timer-history]');
    await a.click(action('personal-timer-start'));
    const initial = await get(a, 'document.querySelector("#personal-timer-display").textContent');
    await a.fill(field('personal-timer-config', 'durationMinutes'), '37');
    await get(a, 'window.__d409TimerForm=document.querySelector("[data-form=personal-timer-config]");true');
    await a.until('document.querySelector("#personal-timer-display").textContent!==' + JSON.stringify(initial), 'real timer tick without synthetic clock', 5000);
    assert.equal(await value(a, field('personal-timer-config', 'durationMinutes')), '37');
    assert.equal(await get(a, 'window.__d409TimerForm===document.querySelector("[data-form=personal-timer-config]")'), true);
    assert.equal((await inputValue(a, field('personal-timer-config', 'durationMinutes'))).dirty, 'true');
    await a.navigate('notes'); await a.navigate('pomodoro');
    assert.equal(await value(a, field('personal-timer-config', 'durationMinutes')), '37');
    assert.equal(await get(a, 'document.querySelector("#personal-timer").dataset.status'), 'running');
    await a.click(action('personal-timer-pause'));
    const paused = await get(a, 'D4Prototype.repo.demo.personal.timer');
    assert.equal(paused.status, 'paused'); assert.ok(paused.elapsedMillis >= 500, 'Existing clock records elapsed real time');
    await a.click(action('personal-timer-resume')); await a.click(action('personal-timer-finish'));
    const completed = await get(a, 'D4Prototype.repo.demo.personal.timer');
    assert.ok(completed.history.length >= 1); assert.ok(completed.history[0].elapsedMillis >= paused.elapsedMillis);
    await a.screenshot('timer-desktop');
    for (const width of [360, 412]) {
      await a.configure(width, 900, true);
      const focus = await a.box('#personal-timer'), history = await a.box('[data-d409-timer-history]');
      assert.ok(history.y >= focus.bottom - 2, 'Narrow timer uses the same content in vertical order');
      await a.noOverflow('timer-' + width); await a.screenshot('timer-' + width);
    }
    await a.reload(); assert.deepEqual(await get(a, 'D4Prototype.repo.demo.personal.timer.history'), completed.history);
    a.observe({timerEvidence: 'Real web timer only; no fake clock, no Android lifecycle claim', session: completed.history[0]});
  }},
  {id: 'W409-U09', name: 'Narrow modal headings, keyboard focus loop, close and reachable save remain usable', async run(a) {
    for (const width of [360, 412, 1440]) {
      await a.configure(width, 900, width < 768); await a.navigate('work-items');
      await a.click(action('work-new-work-item'));
      assert.equal(await get(a, 'document.querySelector(".modal").getAttribute("role")'), 'dialog');
      assert.equal(await get(a, 'document.querySelector(".modal").getAttribute("aria-modal")'), 'true');
      assert.ok((await get(a, 'document.querySelector(".modal-head").textContent')).includes('新建工作事项'));
      await a.click('.modal-head ' + action('close-modal'));
      assert.equal(await a.visible('.modal'), false);
      await a.click(action('work-new-work-item'));
      await a.fill(field('work-work-item', 'title'), 'D409 accessible modal ' + width);
      await a.click('.modal [data-form="work-work-item"] button[type="submit"]');
      const created = (await state(a)).workItems.find(x => x.title === 'D409 accessible modal ' + width); assert.ok(created);
      await a.click(action('work-edit-work-item', created.id));
      await a.noOverflow('work-modal-' + width);
      await a.screenshot('work-edit-modal-' + width);
      await a.click('.modal-head ' + action('close-modal'));
      // Use the note editor for keyboard loop evidence; opening focuses its first field.
      await a.navigate('notes'); await a.click(action('personal-note-new'));
      for (let i = 0; i < 10; i++) {
        await a.key(null, 'Tab', i < 5 ? 0 : 8);
        assert.equal(await get(a, 'document.querySelector(".modal").contains(document.activeElement)'), true, 'Focus stays inside dialog');
      }
      await a.screenshot('modal-focus-' + width);
      await a.key(null, 'Escape'); assert.equal(await a.visible('.modal'), false);
    }
  }},
  {id: 'W409-U10', name: 'Supporting pages keep real content and readable 360/412/desktop geometry', async run(a) {
    for (const width of [1440, 360, 412]) {
      await a.configure(width, 900, width < 768);
      for (const route of ['analytics', 'catalogs', 'timeline', 'archive', 'sync', 'devices', 'data-system', 'about']) {
        await a.navigate(route); await a.noOverflow(route + '-' + width);
        await a.screenshot(route + '-' + width);
      }
    }
    await a.click(action('personal-about-history'));
    assert.ok((await get(a, 'document.querySelector(".modal").textContent')).includes('版本历史'));
    await a.screenshot('known-version-history');
    await a.click(action('personal-close'));
  }},
  {id: 'W409-U11', name: 'Filtering and archiving cannot leave a stale preview; selecting remains a presentation operation', async run(a) {
    await a.navigate('work-items');
    const items = (await state(a)).workItems.filter(x => !x.archived); assert.ok(items.length >= 2);
    await select(a, items[0].id);
    await a.fill(field('work-filter', 'query'), 'D409 no matching synthetic row'); await a.submit('[data-form="work-filter"]');
    assert.equal(await a.visible(action('work-preview-select', items[0].id)), false);
    assert.notEqual(await previewId(a), items[0].id, 'Excluded selection does not render stale detail');
    await a.click(action('work-reset-filter', 'work-items'));
    const before = await a.stores(); await select(a, items[1].id); assert.deepEqual(await a.stores(), before);
    await a.click(action('work-archive-workItems', items[1].id));
    assert.equal((await state(a)).workItems.find(x => x.id === items[1].id).archived, true);
    assert.notEqual(await previewId(a), items[1].id);
    assert.equal(await a.visible(action('work-preview-select', items[1].id)), false);
    await a.navigate('archive'); assert.ok((await get(a, 'document.querySelector("main").textContent')).includes(items[1].title));
    await a.screenshot('archived-without-stale-preview');
  }},
  {id: 'W409-U12', name: 'Feedback editor preserves actual selected file bytes and draft during unrelated repaint and saves through existing flow', async run(a) {
    await a.configure(412, 900, true); await a.navigate('feedback'); await a.click(action('personal-feedback-new'));
    await a.fill(field('personal-feedback', 'title'), 'D409 UI with original image');
    await a.fill(field('personal-feedback', 'body'), '完整意见正文\n原始图片不能因布局重绘丢失。');
    const expected = await a.fixture('browser-generated PNG file, not an OS file-picker action', `(async()=>{const c=document.createElement('canvas');c.width=24;c.height=16;const g=c.getContext('2d');g.fillStyle='#175cd3';g.fillRect(0,0,24,16);g.fillStyle='#ffffff';g.fillRect(3,4,9,5);const b=await new Promise(r=>c.toBlob(r,'image/png')),file=new File([b],'d409-original.png',{type:'image/png',lastModified:1735689600000}),t=new DataTransfer();t.items.add(file);const input=document.querySelector('[data-form="personal-feedback"] [name="images"]');input.files=t.files;input.dispatchEvent(new Event('change',{bubbles:true}));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');return {name:file.name,size:file.size,sha256:hash};})()`);
    await a.until('document.querySelector("[data-feedback-selected] img")?.complete', 'selected original image decoded');
    const before = await a.snapshot('feedback-draft-before-repaint');
    await a.fixture('unrelated synthetic UI repaint with live file object', 'D4Prototype.repo.updateDemo(d=>{d.ui.d409Repaint="feedback-file";});true');
    const after = await a.snapshot('feedback-draft-after-repaint');
    assert.deepEqual(after.forms.find(x => x.name === 'personal-feedback'), before.forms.find(x => x.name === 'personal-feedback'));
    await a.noOverflow('feedback-draft'); await a.screenshot('feedback-original-file-draft');
    await a.submit('[data-form="personal-feedback"]');
    const saved = await get(a, 'D4Prototype.repo.demo.personal.feedback.ideas.find(x=>x.title==="D409 UI with original image")');
    assert.ok(saved); assert.equal(saved.images.length, 1); assert.equal(saved.images[0].sha256, expected.sha256); assert.equal(saved.images[0].size, expected.size);
    await a.click(action('personal-feedback-detail', saved.id)); await a.screenshot('feedback-original-image-detail');
    await a.reload(); assert.deepEqual(await get(a, 'D4Prototype.repo.demo.personal.feedback.ideas.find(x=>x.id===' + JSON.stringify(saved.id) + ')'), saved);
  }}
];

export const serviceCases = [
  {id: 'W409-S01', name: 'Actual V2 layout preserves its panel object and draft while its storage remains isolated from the main UI', async run(a) {
    await openV2(a);
    const before = await a.stores();
    await a.fill(vfield('task', 'title'), 'D409 V2 actual service'); await a.fill(vfield('task', 'notes'), '独立服务实际保存');
    await a.submit('[data-v2-form="task"]');
    const task = await get(a, 'D408V2Candidate.snapshot().state.tasks.at(-1)'); assert.ok(task);
    const saved = await a.stores(); assert.equal(saved.main, before.main); assert.notEqual(saved.v2, before.v2);
    await a.click('[data-v2-action="select"][data-id="' + task.id + '"]');
    const selectionBytes = await a.stores(); assert.deepEqual(selectionBytes, saved, 'Selection does not persist or merge stores');
    await a.fill(vfield('edit', 'notes'), 'D409 V2 retained draft\nSame DOM object');
    await get(a, 'window.__d409V2Host=document.querySelector("[data-v2-candidate]");true');
    await a.fixture('unrelated main workspace repaint', 'D4Prototype.repo.updateDemo(d=>{d.ui.d409Repaint="v2-draft";});true');
    assert.equal(await get(a, 'window.__d409V2Host===document.querySelector("[data-v2-candidate]")'), true);
    await a.navigate('notes'); await a.navigate('settings');
    assert.equal(await get(a, 'window.__d409V2Host===document.querySelector("[data-v2-candidate]")'), true);
    assert.equal(await value(a, vfield('edit', 'notes')), 'D409 V2 retained draft\nSame DOM object');
    for (const width of [1440, 360, 412]) {
      await a.configure(width, 960, width < 768); await a.noOverflow('service-' + width);
      await a.click(vfield('edit', 'notes')); await a.screenshot('actual-service-' + width);
    }
    const mainBeforeSave = (await a.stores()).main;
    await a.submit('[data-v2-form="edit"]'); assert.equal((await a.stores()).main, mainBeforeSave);
    await a.reload(); await openV2(a);
    assert.equal(await get(a, 'D408V2Candidate.snapshot().state.tasks.find(x=>x.id===' + JSON.stringify(task.id) + ').notes'), 'D409 V2 retained draft\nSame DOM object');
  }},
  {id: 'W409-S02', name: 'Narrow V2 failure keeps visible input and exact durable bytes; one real retry creates one record', async run(a) {
    await a.configure(360, 900, true); await openV2(a);
    await a.fill(vfield('task', 'title'), 'D409 V2 one retry'); await a.fill(vfield('task', 'notes'), 'Visible preserved failed input');
    const before = await a.stores(), stateBefore = await get(a, 'D408V2Candidate.snapshot().state');
    await a.fixture('isolated V2 quota failure only', `(()=>{const original=Storage.prototype.setItem;window.__d409BlockV2=true;Storage.prototype.setItem=function(key,value){if(key===D408V2Candidate.storageKey&&window.__d409BlockV2)throw new DOMException('D409 isolated quota','QuotaExceededError');return original.call(this,key,value);};return true;})()`);
    await a.submit('[data-v2-form="task"]');
    assert.deepEqual(await a.stores(), before); assert.deepEqual(await get(a, 'D408V2Candidate.snapshot().state'), stateBefore);
    assert.equal(await value(a, vfield('task', 'title')), 'D409 V2 one retry');
    assert.match(await get(a, 'document.querySelector("[data-v2-status]").textContent'), /quota/);
    assert.equal((await a.hit('[data-v2-form="task"] button[type="submit"]')).ok, true);
    await a.noOverflow('v2-write-failure'); await a.screenshot('service-write-failure');
    await a.fixture('release isolated V2 quota failure', 'window.__d409BlockV2=false;true');
    await a.submit('[data-v2-form="task"]');
    assert.equal(await get(a, 'D408V2Candidate.snapshot().state.tasks.filter(x=>x.title==="D409 V2 one retry").length'), 1);
    assert.equal((await a.stores()).main, before.main);
    await a.reload(); await openV2(a);
    assert.equal(await get(a, 'D408V2Candidate.snapshot().state.tasks.filter(x=>x.title==="D409 V2 one retry").length'), 1);
  }}
];
