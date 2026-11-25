import assert from 'node:assert/strict';

export async function runPersonalCases(a) {
  const read = () => a.eval('window.D4Prototype.getState()');
  const demo = () => a.eval('window.D4Prototype.repo.demo.personal || {}');
  const close = () => a.click('.modal [data-action="personal-close"]');
  let noteId, ideaId;

  await a.check('Personal routes preserve independent note content and newest-first order', async () => {
    await a.navigate('notes');
    await a.click('[data-action="personal-note-new"]');
    await a.fill('.modal [name="body"]', '独立便签\n原样保留 <b>文本</b>');
    await a.submit('[data-form="personal-note"]');
    const s = await read(), n = s.notes.find(x => x.body.startsWith('独立便签'));
    assert.ok(n); noteId = n.id;
    assert.deepEqual(Object.keys(n).sort(), ['body', 'createdAt', 'id']);
    assert.equal(await a.eval(`document.querySelector('[data-note-id="${noteId}"] .note-body').textContent`), n.body);
    assert.equal(await a.eval(`document.querySelector('[data-note-id="${noteId}"] .note-body b')===null`), true);
    await a.click(`[data-action="personal-note-edit"][data-id="${noteId}"]`);
    await a.fill('.modal [name="body"]', '独立便签已编辑');
    await a.submit('[data-form="personal-note"]');
    assert.equal((await read()).notes.find(x => x.id === noteId).createdAt, n.createdAt);
    await a.reload(); await a.navigate('notes');
    assert.equal((await read()).notes.find(x => x.id === noteId).body, '独立便签已编辑');
    await a.screenshot('personal-notes');
  });

  await a.check('Task deletion does not delete independent notes', async () => {
    const taskId = await a.eval('window.D4Prototype.repo.createTask({title:"合成便签独立性验证",quadrant:0}).id');
    await a.navigate('tasks');
    await a.eval(`window.D4Prototype.repo.deleteTask(${JSON.stringify(taskId)})`);
    const s = await read();
    assert.ok(!s.tasks.some(x => x.id === taskId));
    assert.equal(s.notes.find(x => x.id === noteId).body, '独立便签已编辑');
  });

  await a.check('Note search, edit, delete use separate functional controls', async () => {
    await a.navigate('notes');
    await a.fill('[data-form="personal-filter"] [name="query"]', '独立 已编辑');
    await a.submit('[data-form="personal-filter"]');
    assert.equal(await a.eval('document.querySelectorAll("[data-note-id]").length'), 1);
    await a.click(`[data-action="personal-note-delete"][data-id="${noteId}"]`);
    await a.click(`[data-action="personal-note-delete-confirm"][data-id="${noteId}"]`);
    assert.ok(!(await read()).notes.some(x => x.id === noteId));
    await a.click('[data-action="personal-filter-clear"][data-id="notes"]');
  });

  await a.check('Synthetic clock uses monotonic time, pause, reload wall anchor, and one completion', async () => {
    const result = await a.eval(`(()=>{
      const c=DemoPersonalPages.clock, start={wall:1700000000000,elapsed:100,boot:'first'};
      let t=c.command(c.create(start),'configure',{durationMinutes:1,breakMinutes:1,mode:'countdown'},start);
      t=c.command(t,'start',{sessionId:'deterministic-session'},start);
      t=c.advance(t,{wall:start.wall-30000,elapsed:10100,boot:'first'}); const monotonic=t.elapsedMillis;
      t=c.command(t,'pause',{}, {wall:start.wall-30000,elapsed:10100,boot:'first'});
      t=c.advance(t,{wall:start.wall+1000000,elapsed:20000,boot:'first'}); const paused=t.elapsedMillis;
      t=c.command(t,'resume',{}, {wall:start.wall+1000000,elapsed:20000,boot:'first'});
      t=c.advance(t,{wall:start.wall+1050000,elapsed:1,boot:'reload'});
      const first=structuredClone(t);t=c.advance(t,{wall:start.wall+2000000,elapsed:950001,boot:'reload'});
      return {monotonic,paused,first,t};
    })()`);
    assert.equal(result.monotonic, 10000); assert.equal(result.paused, 10000);
    assert.equal(result.first.status, 'completed'); assert.equal(result.first.elapsedMillis, 60000);
    assert.equal(result.first.completionPending, true);
    assert.equal(result.t.history.length, 1);
    assert.equal(Object.values(result.t.completedSessionsByDay).reduce((a, b) => a + b, 0), 1);
  });

  await a.check('Synthetic clock credits Beijing midnight overlap and preserves countup/reset history', async () => {
    const r = await a.eval(`(()=>{const c=DemoPersonalPages.clock,n={wall:Date.parse('2026-11-24T15:59:30Z'),elapsed:0,boot:'day'};
      let t=c.command(c.create(n),'configure',{durationMinutes:1,breakMinutes:1,mode:'countup'},n);
      t=c.command(t,'start',{sessionId:'cross-midnight'},n);t=c.command(t,'finish',{}, {wall:n.wall+60000,elapsed:60000,boot:'day'});
      const completed=structuredClone(t);t=c.command(t,'reset',{}, {wall:n.wall+60000,elapsed:60000,boot:'day'});return {completed,t};})()`);
    assert.equal(r.completed.status, 'completed');
    assert.equal(Object.keys(r.completed.focusedMillisByDay).length, 2);
    assert.deepEqual(Object.values(r.completed.focusedMillisByDay).sort(), [30000, 30000]);
    assert.deepEqual(r.completed.completedSessionsByDay, {});
    assert.equal(r.t.history.length, 1); assert.equal(r.t.status, 'idle');
  });

  await a.check('Break timer preserves countup preference and does not count as original focus completion', async () => {
    const r = await a.eval(`(()=>{const c=DemoPersonalPages.clock,n={wall:Date.parse('2026-11-25T01:00:00Z'),elapsed:0,boot:'rest'};
      let t=c.command(c.create(n),'configure',{durationMinutes:1,breakMinutes:1,mode:'countup'},n);
      t=c.command(t,'start',{sessionId:'first-focus'},n);
      t=c.command(t,'finish',{}, {wall:n.wall+30000,elapsed:30000,boot:'rest'});
      t=c.command(t,'break',{sessionId:'first-rest'}, {wall:n.wall+30000,elapsed:30000,boot:'rest'});
      t=c.advance(t,{wall:n.wall+90000,elapsed:90000,boot:'rest'});const rest=structuredClone(t);
      t=c.command(t,'start',{sessionId:'second-focus'}, {wall:n.wall+90000,elapsed:90000,boot:'rest'});
      return {rest,t};})()`);
    assert.equal(r.rest.status, 'completed'); assert.equal(r.rest.phase, 'break');
    assert.deepEqual(r.rest.completedSessionsByDay, {});
    assert.equal(Object.values(r.rest.focusedMillisByDay).reduce((a, b) => a + b, 0), 30000);
    assert.equal(r.t.mode, 'countup'); assert.equal(r.t.focusMode, 'countup');
    assert.equal(r.t.phase, 'focus'); assert.equal(r.t.status, 'running');
    assert.equal(r.rest.history.length, 2);
  });

  await a.check('Pomodoro controls persist across module navigation and reload', async () => {
    await a.navigate('pomodoro');
    await a.fill('[data-form="personal-timer-config"] [name="durationMinutes"]', '1');
    await a.fill('[data-form="personal-timer-config"] [name="breakMinutes"]', '1');
    await a.submit('[data-form="personal-timer-config"]');
    await a.click('[data-action="personal-timer-start"]');
    const first = (await demo()).timer;
    assert.equal(first.status, 'running');
    await a.navigate('projects'); await a.navigate('pomodoro');
    assert.equal((await demo()).timer.sessionId, first.sessionId);
    await a.click('[data-action="personal-timer-pause"]');
    const pause = (await demo()).timer;
    assert.equal(pause.status, 'paused');
    await a.reload(); await a.navigate('pomodoro');
    assert.equal((await demo()).timer.elapsedMillis, pause.elapsedMillis);
    await a.click('[data-action="personal-timer-resume"]');
    assert.equal((await demo()).timer.status, 'running');
    await a.click('[data-action="personal-timer-end"]');
    assert.equal((await demo()).timer.status, 'ended');
    assert.equal((await demo()).timer.history[0].outcome, 'ended');
    await a.click('[data-action="personal-timer-break"]');
    assert.equal((await demo()).timer.phase, 'break');
    await a.click('[data-action="personal-timer-end"]');
    await a.screenshot('personal-pomodoro');
  });

  await a.check('Reminder receipts and snooze preserve five-card cap and reject completed/deleted tasks', async () => {
    const r = await a.eval(`(()=>{const p=DemoPersonalPages.reminders.plan,tasks=Array.from({length:7},(_,i)=>({id:'r'+i,title:'提醒'+i,at:1000,done:false}));
      const first=p(tasks,{},1000,[]),again=p(tasks,first.ledger,1001,first.notices);
      const ledger=structuredClone(first.ledger);ledger['r0|1000']=601000;
      const snoozed=p(tasks,ledger,600999,first.notices.filter(n=>n.key!=='r0|1000'));
      const completed=p([{id:'r0',at:1000,done:true}],snoozed.ledger,700000,snoozed.notices);
      return {first,again,snoozed,completed};})()`);
    assert.equal(r.first.notices.length, 5); assert.equal(r.again.notices.length, 5);
    assert.ok(!r.snoozed.notices.some(n => n.key === 'r0|1000'));
    assert.equal(r.snoozed.ledger['r0|1000'], 601000);
    assert.deepEqual(r.completed.ledger, {}); assert.deepEqual(r.completed.notices, []);
  });

  await a.check('Reminder page notice supports actual snooze, acknowledge and view-task controls', async () => {
    const task = await a.eval(`(()=>{const r=D4Prototype.repo,H=DemoDomain.helpers,at=H.dayKey()+'T23:59',t=r.createTask({title:'合成页内提醒交互',quadrant:0,start:at,reminder:{mode:'custom',at}});r.updateDemo(d=>{d.personal=d.personal||{};d.personal.reminderLedger={};d.personal.reminderNotices=[];H.flattenTasks(r.state.tasks).forEach(x=>{const when=r.reminderAt(x.id);if(x.id!==t.id&&Number.isFinite(when))d.personal.reminderLedger[x.id+'|'+when]='sent';});});return {id:t.id,at:r.reminderAt(t.id)};})()`);
    const key = task.id + '|' + task.at;
    const check = wall => a.eval(`DemoPersonalPages.reminders.check({repo:D4Prototype.repo,getState:D4Prototype.getState,esc:x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast:()=>{}},${wall})`);
    await check(task.at);
    assert.ok((await demo()).reminderNotices.some(n => n.key === key));
    await a.click(`[data-action="personal-reminder-snooze"][data-id="${key}"]`);
    const snooze = (await demo()).reminderLedger[key];
    const wall = await a.eval('Date.now()');
    assert.ok(snooze - wall > 590000 && snooze - wall <= 600000);
    assert.ok(!(await demo()).reminderNotices.some(n => n.key === key));
    await check(snooze + 1);
    await a.click(`[data-action="personal-reminder-dismiss"][data-id="${key}"]`);
    await check(snooze + 2);
    assert.equal((await demo()).reminderLedger[key], 'sent');
    assert.ok(!(await demo()).reminderNotices.some(n => n.key === key));
    await a.eval(`D4Prototype.repo.updateDemo(d=>{d.personal.reminderLedger[${JSON.stringify(key)}]=0;})`);
    await check(task.at);
    await a.click(`[data-action="personal-reminder-open"][data-id="${key}"]`);
    assert.equal(await a.eval('document.querySelector(".modal [name=id]").value'), task.id);
    await a.click('.modal [data-action="close-modal"]');
    await a.eval(`D4Prototype.repo.deleteTask(${JSON.stringify(task.id)})`);
  });

  await a.check('Feedback saves draft and original PNG bytes with SHA256 then retains images on edit', async () => {
    await a.navigate('feedback'); await a.click('[data-action="personal-feedback-new"]');
    await a.fill('.modal [name="title"]', '合成优化意见');
    await a.fill('.modal [name="body"]', '保留原始图片和独立意见');
    const original = await a.eval(`(()=>{const base64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'synthetic-original.png',{type:'image/png'}));document.querySelector('.modal [name="images"]').files=dt.files;return {base64,size:bytes.length};})()`);
    await a.click('[data-action="personal-feedback-save-draft"]');
    assert.equal((await demo()).feedback.draft.body, '保留原始图片和独立意见');
    assert.equal((await demo()).feedback.draft.images[0].base64, original.base64);
    await a.click('[data-action="personal-feedback-draft"]');
    await a.submit('[data-form="personal-feedback"]');
    let x = (await demo()).feedback.ideas.find(i => i.title === '合成优化意见');
    assert.ok(x); ideaId = x.id;
    assert.equal(x.images[0].base64, original.base64); assert.equal(x.images[0].size, original.size);
    assert.match(x.images[0].sha256, /^[a-f0-9]{64}$/);
    await a.click(`[data-action="personal-feedback-edit"][data-id="${ideaId}"]`);
    await a.fill('.modal [name="body"]', '合成优化意见已修改');
    await a.fill('.modal [name="status"]', 'resolved');
    await a.submit('[data-form="personal-feedback"]');
    x = (await demo()).feedback.ideas.find(i => i.id === ideaId);
    assert.equal(x.status, 'resolved'); assert.equal(x.images[0].base64, original.base64);
    await a.reload(); await a.navigate('feedback');
    assert.equal((await demo()).feedback.ideas.find(i => i.id === ideaId).images[0].base64, original.base64);
    await a.screenshot('personal-feedback');
  });

  await a.check('Feedback import rejects corrupt image bytes without changing notes or before-import backup', async () => {
    const before = (await demo()).feedback;
    const bad = {kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: structuredClone(before.ideas)};
    bad.ideas[0].images[0].sha256 = '0'.repeat(64);
    await a.click('[data-action="personal-feedback-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify(bad));
    await a.submit('[data-form="personal-feedback-import"]');
    assert.deepEqual((await demo()).feedback, before);
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('校验'));
    await close();
  });

  await a.check('Feedback equal-time conflict keeps both contents and backup, and delete keeps task data', async () => {
    const before = (await demo()).feedback, original = before.ideas.find(i => i.id === ideaId);
    const other = {...original, body: '同时间不同意见，须保留副本'};
    await a.click('[data-action="personal-feedback-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: [other]}));
    await a.submit('[data-form="personal-feedback-import"]');
    const data = (await demo()).feedback;
    assert.equal(data.ideas.length, before.ideas.length + 1);
    assert.ok(data.ideas.some(i => i.id !== ideaId && i.body === other.body));
    assert.deepEqual(data.beforeImport, before.ideas);
    const copy = data.ideas.find(i => i.id !== ideaId && i.body === other.body);
    assert.ok(Date.parse(copy.updatedAt) > Date.parse(other.updatedAt));
    await a.click('[data-action="personal-feedback-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: [other]}));
    await a.submit('[data-form="personal-feedback-import"]');
    assert.deepEqual((await demo()).feedback.ideas, data.ideas);
    const tasks = (await read()).tasks;
    await a.click(`[data-action="personal-feedback-delete"][data-id="${ideaId}"]`);
    await a.click(`[data-action="personal-feedback-delete-confirm"][data-id="${ideaId}"]`);
    assert.ok(!(await demo()).feedback.ideas.some(i => i.id === ideaId));
    assert.deepEqual((await read()).tasks, tasks);
  });

  await a.check('Feedback preserves original title-only records and blank-field refusal', async () => {
    await a.navigate('feedback'); await a.click('[data-action="personal-feedback-new"]');
    await a.fill('.modal [name="title"]', '只有标题的原有意见');
    await a.submit('[data-form="personal-feedback"]');
    const idea = (await demo()).feedback.ideas.find(x => x.title === '只有标题的原有意见');
    assert.ok(idea); assert.equal(idea.body, '');
    await a.click(`[data-action="personal-feedback-edit"][data-id="${idea.id}"]`);
    await a.fill('.modal [name="title"]', '');
    await a.submit('[data-form="personal-feedback"]');
    assert.equal((await demo()).feedback.ideas.find(x => x.id === idea.id).title, '只有标题的原有意见');
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('标题或内容'));
    await close();
    await a.click('[data-action="personal-feedback-new"]');
    await a.fill('.modal [name="title"]', '  ');
    await a.fill('.modal [name="body"]', '  正文首行自动成为标题\n第二行  ');
    await a.submit('[data-form="personal-feedback"]');
    const bodyOnly = (await demo()).feedback.ideas.find(x => x.title === '正文首行自动成为标题');
    assert.ok(bodyOnly); assert.equal(bodyOnly.body, '正文首行自动成为标题\n第二行');
    await a.click(`[data-action="personal-feedback-edit"][data-id="${bodyOnly.id}"]`);
    await a.fill('.modal [name="body"]', '旧编辑器尝试覆盖');
    await a.eval(`D4Prototype.repo.updateDemo(d=>{d.personal.feedback.ideas.find(x=>x.id===${JSON.stringify(bodyOnly.id)}).body='其他操作已保存的内容';})`);
    await a.submit('[data-form="personal-feedback"]');
    assert.equal((await demo()).feedback.ideas.find(x => x.id === bodyOnly.id).body, '其他操作已保存的内容');
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('其他编辑操作'));
    await close();
  });

  await a.check('Feedback validation follows original Unicode, byte, UTC timestamp and monotonic edit rules', async () => {
    const result = await a.eval(`(async()=>{const make=()=>({id:'boundary',title:'😀'.repeat(200),body:'',status:'pending',createdAt:'2026-11-25T00:00:00Z',updatedAt:'2026-11-25T00:00:00Z',images:[]}),wrap=x=>({kind:'mytodo.d4.synthetic.feedback',version:1,ideas:[x]});
      const accepted=await DemoPersonalPages.validateFeedback(wrap(make())),errors=[];
      for(const patch of [{title:'😀'.repeat(201)},{body:null},{updatedAt:'2026-11-25T08:00:00+08:00'},{createdAt:'2026-02-30T00:00:00Z'}])try{await DemoPersonalPages.validateFeedback(wrap({...make(),...patch}));errors.push(null);}catch(e){errors.push(e.message);}
      return {accepted,errors};})()`);
    assert.equal(Array.from(result.accepted[0].title).length, 200);
    assert.equal(result.accepted[0].createdAt, '2026-11-25T00:00:00.000Z');
    assert.equal(result.errors.length, 4); assert.ok(result.errors.every(Boolean));
    const id = (await demo()).feedback.ideas.find(x => x.title === '只有标题的原有意见').id;
    const future = '2090-01-01T00:00:00.000Z';
    await a.eval(`D4Prototype.repo.updateDemo(d=>{d.personal.feedback.ideas.find(x=>x.id===${JSON.stringify(id)}).updatedAt=${JSON.stringify(future)};})`);
    await a.click(`[data-action="personal-feedback-edit"][data-id="${id}"]`);
    await a.fill('.modal [name="title"]', '时间回退仍保持原版递增时间');
    await a.submit('[data-form="personal-feedback"]');
    assert.equal((await demo()).feedback.ideas.find(x => x.id === id).updatedAt, '2090-01-01T00:00:00.001Z');
  });

  await a.check('Synthetic sync configuration and failure retain task and pending state without transport', async () => {
    await a.navigate('sync');
    const tasks = (await read()).tasks;
    await a.fill('[data-form="personal-sync-config"] [name="enabled"]', true);
    await a.fill('[data-form="personal-sync-config"] [name="folder"]', 'IsolatedOnly');
    await a.submit('[data-form="personal-sync-config"]');
    const pending = (await demo()).sync.pending;
    await a.click('[data-action="personal-sync-error"]');
    assert.equal((await demo()).sync.status, 'error');
    assert.equal((await demo()).sync.pending, pending);
    assert.deepEqual((await read()).tasks, tasks);
    assert.equal(await a.eval('document.querySelectorAll("input[type=password]").length'), 0);
    await a.click('[data-action="personal-sync-conflict"]');
    const conflict = (await demo()).sync.conflicts.at(-1);
    await a.click(`[data-action="personal-sync-choice"][data-id="${conflict.id}|1"]`);
    const resolved = (await demo()).sync.conflicts.find(x => x.id === conflict.id);
    assert.equal(resolved.chosen, 1); assert.deepEqual(resolved.values, conflict.values);
    await a.click('[data-action="personal-sync-success"]');
    assert.equal((await demo()).sync.pending, 0); assert.ok((await demo()).sync.lastSync);
    assert.deepEqual((await read()).tasks, tasks);
    await a.screenshot('personal-sync');
  });

  await a.check('Synthetic device rename and same-workspace backup restore preserve all demo domains', async () => {
    await a.navigate('devices');
    await a.click('[data-action="personal-device-edit"][data-id="synthetic-current-device"]');
    await a.fill('.modal [name="name"]', '合成设备名称');
    await a.submit('[data-form="personal-device"]');
    assert.equal((await demo()).devices[0].name, '合成设备名称');
    await a.navigate('data-system');
    await a.click('[data-action="personal-workspace-backup"]');
    const backup = (await demo()).workspaceBackup;
    await a.navigate('notes'); await a.click('[data-action="personal-note-new"]');
    await a.fill('.modal [name="body"]', '快照之后新增'); await a.submit('[data-form="personal-note"]');
    await a.navigate('data-system'); await a.click('[data-action="personal-workspace-restore"]');
    await a.click('[data-action="personal-workspace-restore-confirm"]');
    assert.deepEqual(await a.eval('window.D4Prototype.repo.state'), backup.state);
    assert.deepEqual((await demo()).sync, backup.demo.personal.sync);
    assert.deepEqual((await demo()).feedback, backup.demo.personal.feedback);
    assert.deepEqual((await demo()).timer, backup.demo.personal.timer);
  });

  await a.check('Workspace import refuses original production format and keeps existing synthetic state', async () => {
    await a.navigate('data-system'); const before = await read();
    await a.click('[data-action="personal-workspace-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify({format: 'gxtodo-sync', state: before}));
    await a.submit('[data-form="personal-workspace-import"]');
    assert.deepEqual(await read(), before);
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('合成工作区'));
    await close();
  });

  await a.check('Workspace import refuses nested second-bearing reminder before clearing raw JSON or replacing any domain', async () => {
    await a.navigate('data-system');
    const original = await a.eval('({kind:DemoDomain.STORAGE_KIND,version:1,state:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
    const incoming = structuredClone(original), parent = incoming.state.tasks[0];
    parent.subtasks.push({...structuredClone(parent), id:'d4-import-raw-reminder', title:'含秒合成导入', repeat:null, reminder:{mode:'custom',at:'2031-11-25T09:10:37'}, subtasks:[]});
    const raw = JSON.stringify(incoming, null, 2);
    await a.click('[data-action="personal-workspace-import"]');
    await a.fill('.modal [name="json"]', raw);
    const stored = await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)');
    await a.submit('[data-form="personal-workspace-import"]');
    assert.deepEqual(await a.eval('D4Prototype.repo.state'), original.state);
    assert.deepEqual(await a.eval('D4Prototype.repo.demo'), original.demo);
    assert.equal(await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)'), stored);
    assert.equal(await a.eval('document.querySelector("[data-form=personal-workspace-import] [name=json]").value'), raw);
    assert.match(await a.eval('document.querySelector("#toast").textContent'), /d4-import-raw-reminder.*reminder\.at.*分钟/);
    // Correcting the same real form to an unchanged supported workspace succeeds.
    await a.fill('.modal [name="json"]', JSON.stringify(original));
    await a.submit('[data-form="personal-workspace-import"]');
    assert.equal(await a.eval('!!document.querySelector("[data-form=personal-workspace-import]")'), false);
    assert.deepEqual(await a.eval('D4Prototype.repo.state'), original.state);
    assert.deepEqual((await demo()).workspaceBackup.state, original.state);
  });

  await a.check('Workspace snapshot restore rejects second-bearing reminder and retains current state plus backup', async () => {
    await a.navigate('data-system');
    const original = await a.eval('D4Prototype.repo.demo');
    try {
      await a.eval(`(()=>{const r=D4Prototype.repo,backup={state:r.state,demo:r.demo,at:new Date().toISOString()};delete backup.demo.personal.workspaceBackup;backup.state.tasks[0].reminder={mode:'custom',at:'2031-11-25T09:10:37'};r.updateDemo(d=>{d.personal.workspaceBackup=backup;});return true;})()`);
      const before = await a.eval('({state:D4Prototype.repo.state,demo:D4Prototype.repo.demo,raw:localStorage.getItem(DemoDomain.STORAGE_KEY)})');
      await a.click('[data-action="personal-workspace-restore"]');
      await a.click('[data-action="personal-workspace-restore-confirm"]');
      assert.deepEqual(await a.eval('D4Prototype.repo.state'), before.state);
      assert.deepEqual(await a.eval('D4Prototype.repo.demo'), before.demo);
      assert.equal(await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)'), before.raw);
      assert.equal(await a.eval('!!document.querySelector("[data-action=personal-workspace-restore-confirm]")'), true);
      assert.match(await a.eval('document.querySelector("#toast").textContent'), /reminder\.at.*分钟/);
      await close();
    } finally {
      await a.eval('D4Prototype.repo.updateDemo(d=>{d.personal.workspaceBackup='+JSON.stringify(original.personal.workspaceBackup)+';})');
    }
  });

  await a.check('Rejected raw reminder storage shows a persistent load warning and never overwrites its original bytes', async () => {
    const previous = await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)');
    assert.ok(previous, 'Existing isolated workspace is available for exact restoration');
    const viewport = await a.eval('({width:innerWidth,height:innerHeight,mobile:matchMedia("(pointer:coarse)").matches})');
    const incoming = JSON.parse(previous);
    const longId = 'd4-' + 'x'.repeat(117);
    incoming.state.tasks[0].id=longId;
    incoming.state.tasks[0].reminder={mode:'custom',at:'2031-11-25T09:10:37'};
    const raw = JSON.stringify(incoming, null, 2);
    try {
      await a.eval('localStorage.setItem(DemoDomain.STORAGE_KEY,'+JSON.stringify(raw)+')');
      await a.configure(360,640,true);
      await a.reload();
      assert.equal(await a.eval('D4Prototype.repo.persistence().loaded'), false);
      assert.match(await a.eval('D4Prototype.repo.persistence().loadError'), /reminder\.at.*分钟/);
      assert.match(await a.eval('document.querySelector("[data-storage-load-error][role=alert]").textContent'), /存储原件未覆盖/);
      assert.equal(await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)'), raw);
      await a.navigate('settings');
      assert.match(await a.eval('document.querySelector("[data-storage-load-error]").textContent'), /备用体验数据/);
      await a.submit('[data-form="settings"]');
      assert.equal(await a.eval('localStorage.getItem(DemoDomain.STORAGE_KEY)'), raw);
      const geometry = await a.eval(`(()=>{const notice=document.querySelector('[data-storage-load-error]'),page=document.querySelector('.workspace>.page'),error=notice.querySelector('p'),text=error.firstChild,id=${JSON.stringify(longId)},start=text.textContent.indexOf(id);if(start<0)throw Error('Missing complete long task ID in load notice');const range=document.createRange();range.setStart(text,start);range.setEnd(text,start+id.length);const box=notice.getBoundingClientRect(),main=page.getBoundingClientRect();return {width:innerWidth,height:innerHeight,notice:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,height:box.height,clientWidth:notice.clientWidth,clientHeight:notice.clientHeight,scrollWidth:notice.scrollWidth,scrollHeight:notice.scrollHeight},page:{top:main.top,bottom:main.bottom,height:main.height},idRects:Array.from(range.getClientRects()).map(r=>({left:r.left,right:r.right,height:r.height}))};})()`);
      assert.equal(geometry.width,360);assert.equal(geometry.height,640);
      assert.ok(geometry.notice.height>0&&geometry.notice.height<=Math.min(geometry.height*.3,240)+1,'Load warning stays within its viewport height budget');
      assert.ok(geometry.notice.left>=0&&geometry.notice.right<=geometry.width+1&&geometry.notice.top>=0&&geometry.notice.bottom<=geometry.height,'Warning remains inside the small viewport');
      assert.ok(geometry.notice.scrollHeight>geometry.notice.clientHeight,'Long warning requires vertical scrolling instead of clipping');
      assert.ok(geometry.notice.scrollWidth<=geometry.notice.clientWidth+1,'Long task ID does not create horizontal overflow');
      assert.ok(geometry.idRects.length>1&&geometry.idRects.every(r=>r.height>0&&r.left>=geometry.notice.left-1&&r.right<=geometry.notice.right+1),'Complete long ID wraps into lines inside the warning');
      assert.ok(geometry.page.top>=geometry.notice.bottom-1&&geometry.page.height>=100&&geometry.page.bottom<=geometry.height+1,'Main content retains a separate usable scroll area below the warning');
      const end = await a.eval(`(()=>{const notice=document.querySelector('[data-storage-load-error]');notice.scrollTop=notice.scrollHeight;const box=notice.getBoundingClientRect(),last=notice.lastElementChild.getBoundingClientRect();return {top:notice.scrollTop,max:notice.scrollHeight-notice.clientHeight,lastBottom:last.bottom,bottom:box.bottom};})()`);
      assert.ok(end.top>0&&Math.abs(end.top-end.max)<=1&&end.lastBottom<=end.bottom+1,'Scrolling reaches the final original-storage preservation message');
      await a.eval('document.querySelector("[data-storage-load-error]").scrollTop=0');
      await a.screenshot('reminder-original-storage-protected');
    } finally {
      try {
        await a.eval('localStorage.setItem(DemoDomain.STORAGE_KEY,'+JSON.stringify(previous)+')');
        await a.reload();
      } finally {
        await a.configure(viewport.width,viewport.height,viewport.mobile);
      }
    }
    assert.equal(await a.eval('D4Prototype.repo.persistence().loaded'), true);
    assert.equal(await a.eval('!!document.querySelector("[data-storage-load-error]")'), false);
  });

  await a.check('Workspace import rejects malformed timer or draft before replacing core or demo', async () => {
    await a.navigate('data-system');
    const before = await read(), p = await demo();
    const incoming = await a.eval('({kind:DemoDomain.STORAGE_KIND,version:1,state:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
    incoming.demo.personal.timer.anchor.wall = 'invalid';
    await a.click('[data-action="personal-workspace-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify(incoming));
    await a.submit('[data-form="personal-workspace-import"]');
    assert.deepEqual(await read(), before); assert.deepEqual(await demo(), p);
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('计时状态'));
    await close();
    const badDraft = await a.eval('({kind:DemoDomain.STORAGE_KIND,version:1,state:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
    badDraft.demo.personal.feedback.draft = {...badDraft.demo.personal.feedback.ideas[0], body: null};
    await a.click('[data-action="personal-workspace-import"]');
    await a.fill('.modal [name="json"]', JSON.stringify(badDraft));
    await a.submit('[data-form="personal-workspace-import"]');
    assert.deepEqual(await read(), before); assert.deepEqual(await demo(), p);
    assert.ok((await a.eval('document.querySelector("#toast").textContent')).includes('字段限制'));
    await close();
  });

  await a.check('About shows injected identity and offline version history without runtime build-time fabrication', async () => {
    await a.navigate('about');
    assert.equal(await a.eval('document.querySelector(".version-info").textContent.includes(window.D4_BUILD.sourceSha.slice(0,5))'), true);
    await a.click('[data-action="personal-about-history"]');
    assert.ok((await a.eval('document.querySelector(".modal").innerText')).includes('版本历史'));
    await close();
    await a.screenshot('personal-about');
  });

  await a.check('Personal async image save blocks duplicate submit and preserves a replacement modal', async () => {
    await a.navigate('feedback'); await a.click('[data-action="personal-feedback-new"]');
    const result = await a.eval(`(async()=>{
      const original=File.prototype.arrayBuffer,source=document.querySelector('[data-form="personal-feedback"]'),data=new FormData(source);
      const repo=DemoDomain.createRepository({state:D4Prototype.repo.state,demo:{},storage:null}),messages=[];let closed=0,release,first;
      const gate=new Promise(resolve=>{release=resolve;});
      const ctx={repo,getState:()=>repo.state,updateDemo:fn=>repo.updateDemo(fn),toast:message=>messages.push(message),closeModal:()=>{closed++;document.querySelector('#modal-root').innerHTML='';}};
      data.set('title','异步防重提交合成意见');data.set('body','保护后来打开的弹窗');data.set('images',new File([new Uint8Array([137,80,78,71])],'personal-delayed.png',{type:'image/png'}));
      File.prototype.arrayBuffer=function(){const file=this;return file.name==='personal-delayed.png'?gate.then(()=>original.call(file)):original.call(file);};
      try {
        first=DemoPersonalPages.submit('personal-feedback',data,ctx);const busy=DemoPersonalPages.isBusy(),disabled=source.querySelector('[name="title"]').disabled;
        let secondError='';try{await DemoPersonalPages.submit('personal-feedback',data,ctx);}catch(error){secondError=error.message;}
        source.closest('.modal').outerHTML='<section class="modal"><form data-form="personal-note"><input name="body" value="后来打开的便签草稿"><button type="button" data-action="personal-close">关闭</button></form></section>';
        release();await first;
        return {busy,disabled,secondError,closed,ideas:repo.demo.personal.feedback.ideas.length,body:document.querySelector('.modal [name="body"]').value,afterBusy:DemoPersonalPages.isBusy()};
      } finally {release();if(first)await first.catch(()=>{});File.prototype.arrayBuffer=original;}
    })()`);
    assert.equal(result.busy, true); assert.equal(result.disabled, true);
    assert.ok(result.secondError.includes('等待完成')); assert.equal(result.ideas, 1);
    assert.equal(result.closed, 0); assert.equal(result.body, '后来打开的便签草稿');
    assert.equal(result.afterBusy, false); await close();
  });

  await a.check('Isolated APK version adapter prefers supplied native identity while preserving HTML identity', async () => {
    try {
      await a.eval(`window.GxD4Preview={isPreview:()=>true,versionInfo:()=>JSON.stringify({apkBuild:true,versionName:'isolated-adapter-test',versionCode:7,sourceSha:'a'.repeat(40),buildTimeUtc:'2026-11-25T01:02:03Z',timezone:'UTC',historyText:'7 · 合成适配器校验'}),openVersionInfo:()=>{window.__versionDialogCalls=(window.__versionDialogCalls||0)+1}}`);
      await a.navigate('about');
      const texts = await a.eval('({apk:document.querySelector(".version-info").textContent,html:document.querySelector(".version-info-html").textContent,sha:D4_BUILD.sourceSha})');
      assert.ok(texts.apk.includes('isolated-adapter-test'));
      assert.ok(texts.apk.includes('versionCode：7'));
      assert.ok(texts.apk.includes('2026-11-25T01:02:03Z UTC'));
      assert.ok(texts.html.includes(texts.sha));
      await a.click('[data-action="personal-apk-version"]');
      assert.equal(await a.eval('window.__versionDialogCalls'), 1);
      await a.click('[data-action="personal-about-history"]');
      assert.ok((await a.eval('document.querySelector(".modal").innerText')).includes('合成适配器校验'));
      await close();
    } finally {
      await a.eval('delete window.GxD4Preview;delete window.__versionDialogCalls');
      await a.navigate('about');
    }
  });
}
