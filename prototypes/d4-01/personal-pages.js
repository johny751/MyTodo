(function () {
  'use strict';
  // Isolated UI provider only. No production bridge, credential store or remote transport.
  var routes = ['notes', 'pomodoro', 'feedback', 'sync', 'devices', 'data-system', 'about'];
  var views = {notes: {query: ''}, feedback: {query: '', status: ''}};
  var feedbackBases = new Map();
  var pendingSubmission = null;
  var documentId = 'document-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  var sequence = 0;
  var lastReminderCheck = 0;
  var reminderDockObserver = null, reminderDockHost = null, reminderDockListening = false;
  var MINUTE = 60000, DAY = 86400000, OFFSET = 28800000;
  function clone(x) { return structuredClone(x); }
  function uid(prefix) { return prefix + '-' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + (++sequence)); }
  function time() { return {wall: Date.now(), elapsed: performance.now(), boot: documentId}; }
  function dayOf(wall) { return Math.floor((wall + OFFSET) / DAY); }
  function dayLabel(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
  function esc(ctx, x) { return ctx.esc(String(x == null ? '' : x)); }
  function get(values, key) { return String(values.get(key) || ''); }
  function stamp() { return new Date().toISOString(); }
  // Match the frozen feedback value contract (src/feedback.mjs:7-27).
  function feedbackTime(value) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw new Error('意见时间格式无效'); var ms = Date.parse(value); if (!Number.isFinite(ms)) throw new Error('意见时间无效'); var normalized = new Date(ms).toISOString(); if (normalized !== (value.length === 20 ? value.replace('Z', '.000Z') : value)) throw new Error('意见时间无效'); return normalized; }
  function feedbackText(title, body, draft) { if (typeof title !== 'string' || Array.from(title).length > 200 || new TextEncoder().encode(title).length > 800 || typeof body !== 'string' || Array.from(body).length > 50000 || new TextEncoder().encode(body).length > 200000) throw new Error('意见标题或正文超出原有字段限制'); if (!draft && !title.trim() && !body.trim()) throw new Error('请填写意见标题或内容'); }
  function nextFeedbackStamp(after) { return new Date(Math.max(Date.now(), after ? Date.parse(after) + 1 : -Infinity)).toISOString(); }
  function core(ctx) { return ctx.getState(); }
  function personal(ctx) { return ctx.repo.demo.personal || {}; }
  function ensure(d) {
    if (!d.personal) d.personal = {};
    var p = d.personal;
    if (!p.feedback) p.feedback = {ideas: [], draft: null, beforeImport: null};
    if (!p.sync) p.sync = {enabled: false, autoSync: true, folder: 'DemoOnly', status: 'idle', pending: 3, lastSync: '', error: '', history: [], conflicts: []};
    if (!p.devices) p.devices = [{id: 'synthetic-current-device', name: '当前体验设备', type: 'browser', current: true, connected: false, lastSync: ''}];
    return p;
  }
  function update(ctx, fn, message, close) {
    (ctx.updateDemo || ctx.repo.updateDemo.bind(ctx.repo))(function (d) { fn(ensure(d)); });
    if (close) ctx.closeModal();
    if (message) persistedToast(ctx, message);
    return true;
  }
  function persistedToast(ctx, message) { var persistence = ctx.repo.persistence ? ctx.repo.persistence() : null; ctx.toast(persistence && persistence.mode === 'memory' && persistence.error ? message + '；当前存储不可用，仅保存在内存，请导出备份，重新打开可能丢失。' : message); }
  function button(ctx, label, action, id, style, disabled) { return '<button type="button" class="button ' + (style || '') + '" data-action="' + action + '" data-id="' + esc(ctx, id || '') + '"' + (disabled ? ' disabled' : '') + '>' + esc(ctx, label) + '</button>'; }
  function field(ctx, label, name, value, type, max) { return '<label class="field"><span>' + esc(ctx, label) + '</span><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(ctx, value || '') + '"' + (max ? ' maxlength="' + max + '"' : '') + '></label>'; }
  function textarea(ctx, label, name, value, required, max) { return '<label class="field"><span>' + esc(ctx, label) + '</span><textarea name="' + name + '" rows="5"' + (required ? ' required' : '') + ' maxlength="' + (max || 50000) + '">' + esc(ctx, value || '') + '</textarea></label>'; }
  function hidden(ctx, name, value) { return '<input type="hidden" name="' + name + '" value="' + esc(ctx, value || '') + '">'; }
  function form(ctx, name, title, body, label) { return '<h2>' + esc(ctx, title) + '</h2><form data-form="' + name + '" class="work-form">' + body + '<footer class="form-actions">' + button(ctx, '取消', 'personal-close') + '<button class="button primary" type="submit">' + esc(ctx, label || '保存') + '</button></footer></form>'; }
  function heading(ctx, title, description, actions) { return '<header class="page-heading"><div><h1>' + esc(ctx, title) + '</h1><p>' + esc(ctx, description) + '</p></div><div class="page-actions">' + (actions || '') + '</div></header>'; }
  function empty(ctx, text) { return '<div class="empty-state"><p>' + esc(ctx, text) + '</p></div>'; }
  function search(text, query) { return query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(function (term) { return text.normalize('NFKC').toLocaleLowerCase().includes(term); }); }
  function filterForm(ctx, route, status) {
    var v = views[route];
    return '<form data-form="personal-filter" class="panel work-filters">' + hidden(ctx, 'route', route) + field(ctx, '搜索' + (route === 'notes' ? '便签' : '意见'), 'query', v.query, 'search') + (status ? '<label class="field"><span>处理状态</span><select name="status"><option value="">全部</option><option value="pending"' + (v.status === 'pending' ? ' selected' : '') + '>待处理</option><option value="resolved"' + (v.status === 'resolved' ? ' selected' : '') + '>已解决</option></select></label>' : '') + '<button class="button" type="submit">应用筛选</button>' + button(ctx, '清除', 'personal-filter-clear', route) + '</form>';
  }
  function noteForm(ctx, id) {
    var n = core(ctx).notes.find(function (x) { return x.id === id; });
    if (id && !n) throw new Error('便签已不存在');
    ctx.modal(form(ctx, 'personal-note', id ? '编辑便签' : '新建便签', hidden(ctx, 'id', id) + textarea(ctx, '便签内容 · Ctrl+Enter 保存', 'body', n && n.body, true) + '<p class="form-help">便签独立保存。删除任务不会删除便签。</p>'));
    return true;
  }
  function notesPage(ctx) {
    var notes = core(ctx).notes.filter(function (n) { return search(n.body, views.notes.query); }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id); });
    return heading(ctx, '便签', '独立记录想法与备忘，按创建时间从新到旧排列。', button(ctx, '新建便签', 'personal-note-new', '', 'primary')) + filterForm(ctx, 'notes') + '<div class="notes-grid">' + (notes.length ? notes.map(function (n) { return '<article class="panel note-card" data-note-id="' + esc(ctx, n.id) + '"><time>' + esc(ctx, new Date(n.createdAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})) + '</time><p class="note-body">' + esc(ctx, n.body) + '</p><div class="page-actions">' + button(ctx, '编辑', 'personal-note-edit', n.id) + button(ctx, '删除', 'personal-note-delete', n.id, 'danger') + '</div></article>'; }).join('') : empty(ctx, '还没有便签，记录一个想法。')) + '</div>';
  }

  // Synthetic clock: same-document monotonic elapsed time; reload uses a wall anchor.
  // Android continues to use its original PomodoroClock/SystemClock/service implementation.
  function createClock(now) {
    return {version: 1, mode: 'countdown', focusMode: 'countdown', phase: 'focus', status: 'idle', durationMinutes: 25, breakMinutes: 5, elapsedMillis: 0, anchor: clone(now), sessionId: '', startedAt: '', taskId: '', completionPending: false, history: [], focusedMillisByDay: {}, completedSessionsByDay: {}};
  }
  function anchor(t, now) { t.anchor = clone(now); }
  function credit(t, start, earned, today) {
    if (t.phase !== 'focus' || earned <= 0) return;
    for (var d = today - 31; d <= today; d++) {
      var from = d * DAY - OFFSET, overlap = Math.max(0, Math.min(start + earned, from + DAY) - Math.max(start, from));
      if (overlap) t.focusedMillisByDay[d] = (t.focusedMillisByDay[d] || 0) + overlap;
    }
  }
  function record(t, outcome, wall) {
    if (!t.sessionId || t.history.some(function (h) { return h.id === t.sessionId; })) return;
    t.history.unshift({id: t.sessionId, mode: t.mode, phase: t.phase, taskId: t.taskId, startedAt: t.startedAt, finishedAt: new Date(wall).toISOString(), elapsedMillis: t.elapsedMillis, outcome: outcome});
    if (t.history.length > 10000) t.history.length = 10000;
  }
  function complete(t, wall) {
    if (t.status === 'completed') return;
    t.status = 'completed'; t.completionPending = true;
    // Original Android statistics count completed countdowns; countup history is separate.
    if (t.phase === 'focus' && t.mode === 'countdown') { var d = dayOf(wall); t.completedSessionsByDay[d] = (t.completedSessionsByDay[d] || 0) + 1; }
    record(t, 'completed', wall);
  }
  function advance(input, now) {
    var t = clone(input || createClock(now));
    if (t.status === 'running') {
      var same = t.anchor.boot === now.boot && now.elapsed >= t.anchor.elapsed;
      var delta = Math.max(0, same ? now.elapsed - t.anchor.elapsed : now.wall - t.anchor.wall);
      var target = (t.phase === 'break' ? t.breakMinutes : t.durationMinutes) * MINUTE;
      var earned = t.mode === 'countdown' ? Math.min(delta, Math.max(0, target - t.elapsedMillis)) : delta;
      t.elapsedMillis += earned;
      credit(t, now.wall - delta, earned, dayOf(now.wall));
      if (t.mode === 'countdown' && t.elapsedMillis >= target) complete(t, now.wall - delta + earned);
    }
    anchor(t, now);
    Object.keys(t.focusedMillisByDay).forEach(function (d) { if (+d < dayOf(now.wall) - 31 || +d > dayOf(now.wall)) delete t.focusedMillisByDay[d]; });
    Object.keys(t.completedSessionsByDay).forEach(function (d) { if (+d < dayOf(now.wall) - 31 || +d > dayOf(now.wall)) delete t.completedSessionsByDay[d]; });
    return t;
  }
  function command(input, action, values, now) {
    var t = advance(input, now), v = values || {};
    if (action === 'configure') {
      var minutes = Number(v.durationMinutes), rest = Number(v.breakMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180 || !Number.isInteger(rest) || rest < 1 || rest > 180) throw new Error('计时时长请输入 1–180 分钟');
      if (v.mode !== 'countdown' && v.mode !== 'countup') throw new Error('请选择有效计时模式');
      if (t.status === 'running' || t.status === 'paused') {
        if (v.mode !== t.mode) throw new Error('请先结束当前计时再切换模式');
        t.durationMinutes = minutes; t.breakMinutes = rest;
        if (t.mode === 'countdown' && t.elapsedMillis >= (t.phase === 'break' ? rest : minutes) * MINUTE) {
          t.elapsedMillis = (t.phase === 'break' ? rest : minutes) * MINUTE;
          complete(t, now.wall);
        }
      } else { t.durationMinutes = minutes; t.breakMinutes = rest; t.mode = v.mode; t.phase = 'focus'; t.elapsedMillis = 0; t.status = 'idle'; t.completionPending = false; }
      if (t.phase !== 'break') t.focusMode = v.mode;
      t.taskId = v.taskId || '';
    } else if (action === 'start' || action === 'break') {
      if (t.status === 'running' || t.status === 'paused') throw new Error('请先结束当前计时');
      if (action === 'break') { if (t.phase !== 'break') t.focusMode = t.mode; t.mode = 'countdown'; }
      else if (t.phase === 'break') t.mode = t.focusMode || 'countdown';
      t.phase = action === 'break' ? 'break' : 'focus';
      t.status = 'running'; t.elapsedMillis = 0; t.completionPending = false;
      t.sessionId = v.sessionId || uid('session'); t.startedAt = new Date(now.wall).toISOString();
    } else if (action === 'pause') { if (t.status === 'running') t.status = 'paused'; }
    else if (action === 'resume') { if (t.status === 'paused') t.status = 'running'; }
    else if (action === 'end') { if (t.status === 'running' || t.status === 'paused') { t.status = 'ended'; t.completionPending = false; record(t, 'ended', now.wall); } }
    else if (action === 'finish') { if (t.mode !== 'countup' || !['running', 'paused'].includes(t.status)) throw new Error('倒计时会在到时后完成，提前结束不计作完成'); complete(t, now.wall); }
    else if (action === 'reset') { if (t.status === 'running' || t.status === 'paused') record(t, 'ended', now.wall); if (t.phase === 'break') t.mode = t.focusMode || 'countdown'; t.status = 'idle'; t.elapsedMillis = 0; t.completionPending = false; t.phase = 'focus'; }
    else throw new Error('未知计时操作');
    anchor(t, now); return t;
  }
  function timer(ctx) { return advance(personal(ctx).timer || createClock(time()), time()); }
  function timerText(t) { var millis = t.mode === 'countup' ? t.elapsedMillis : Math.max(0, (t.phase === 'break' ? t.breakMinutes : t.durationMinutes) * MINUTE - t.elapsedMillis), seconds = Math.floor(millis / 1000); return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
  function timerStatus(t) { return ({idle: '待开始', running: '计时中', paused: '已暂停', completed: '本轮已完成', ended: '提前结束'})[t.status]; }
  function timerBody(ctx, t) {
    var active = t.status === 'running' || t.status === 'paused', task = window.DemoDomain.helpers.flattenTasks(core(ctx).tasks).find(function (x) { return x.id === t.taskId; });
    var days = Object.keys(t.focusedMillisByDay).sort(function (a, b) { return +b - +a; });
    return '<section class="panel timer-panel" id="personal-timer" data-status="' + t.status + '"><p class="eyebrow">' + (t.phase === 'break' ? '休息倒计时' : t.mode === 'countup' ? '专注正计时' : '专注倒计时') + '</p><output id="personal-timer-display" class="timer-display" aria-label="当前计时时间">' + timerText(t) + '</output><p id="personal-timer-status" role="status">' + timerStatus(t) + '</p><p>' + esc(ctx, task ? '关联任务：' + task.title : t.taskId ? '关联任务已删除，计时记录保留' : '未关联任务') + '</p><div class="page-actions">' + button(ctx, '开始', 'personal-timer-start', '', 'primary', active) + button(ctx, '暂停', 'personal-timer-pause', '', '', t.status !== 'running') + button(ctx, '继续', 'personal-timer-resume', '', '', t.status !== 'paused') + button(ctx, '提前结束', 'personal-timer-end', '', '', !active) + (t.mode === 'countup' ? button(ctx, '完成本轮', 'personal-timer-finish', '', '', !active) : '') + button(ctx, '开始休息', 'personal-timer-break', '', '', active) + button(ctx, '重置', 'personal-timer-reset') + '</div></section><section class="panel"><h2>最近计时记录</h2>' + (t.history.length ? '<ol class="activity-list">' + t.history.map(function (h) { return '<li><strong>' + (h.phase === 'break' ? '休息' : '专注') + ' · ' + Math.floor(h.elapsedMillis / 60000) + ' 分钟</strong><span>' + (h.outcome === 'completed' ? '已完成' : '提前结束') + ' · ' + esc(ctx, new Date(h.finishedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})) + '</span></li>'; }).join('') + '</ol>' : '<p>完成或结束一轮计时后可查看记录。</p>') + '</section><section class="panel"><h2>个人专注统计 · 北京时间（完成轮次仅含倒计时）</h2>' + (days.length ? '<ul>' + days.map(function (d) { return '<li>' + dayLabel(+d) + ' · ' + Math.floor(t.focusedMillisByDay[d] / 60000) + ' 分钟 · ' + (t.completedSessionsByDay[d] || 0) + ' 轮完成</li>'; }).join('') + '</ul>' : '<p>还没有专注记录。</p>') + '</section>';
  }
  function pomodoroPage(ctx) {
    var t = timer(ctx), tasks = window.DemoDomain.helpers.flattenTasks(core(ctx).tasks).filter(function (x) { return !x.done; });
    var preview = window.GxD4Preview && window.GxD4Preview.isPreview && window.GxD4Preview.isPreview();
    return heading(ctx, '番茄钟', '计时状态独立于页面，切换页面或重新打开体验后继续恢复。', preview ? button(ctx, '原生番茄钟隔离体验', 'personal-native-timer') : '') + '<p class="help-text">合成体验计时；Android 通知、锁屏、后台及重启行为需原生验证。休息计时为本轮新增体验。</p>' + (preview ? '<p class="help-text">原生体验使用独立计时状态，与下面的网页计时各自保存。</p>' : '') + '<div id="personal-timer-content">' + timerBody(ctx, t) + '</div><form data-form="personal-timer-config" class="panel work-form"><h2>计时设置</h2><div class="form-grid"><label class="field"><span>计时模式</span><select name="mode"><option value="countdown"' + (t.mode === 'countdown' ? ' selected' : '') + '>倒计时</option><option value="countup"' + (t.mode === 'countup' ? ' selected' : '') + '>正计时</option></select></label><label class="field"><span>专注分钟</span><input name="durationMinutes" type="number" min="1" max="180" value="' + t.durationMinutes + '" required></label><label class="field"><span>休息分钟</span><input name="breakMinutes" type="number" min="1" max="180" value="' + t.breakMinutes + '" required></label><label class="field"><span>关联任务</span><select name="taskId"><option value="">不关联</option>' + tasks.map(function (x) { return '<option value="' + esc(ctx, x.id) + '"' + (t.taskId === x.id ? ' selected' : '') + '>' + esc(ctx, x.title) + '</option>'; }).join('') + '</select></label></div><button class="button" type="submit">保存计时设置</button></form>';
  }
  function mutateTimer(ctx, action, values) { return update(ctx, function (p) { p.timer = command(p.timer || createClock(time()), action, values, time()); }, ({start: '已开始计时', pause: '已暂停', resume: '已继续计时', end: '已提前结束', finish: '本轮已完成', break: '已开始休息', reset: '已重置计时', configure: '已保存计时设置'})[action]); }
  function tick(ctx) {
    if (Date.now() - lastReminderCheck >= 5000) checkReminders(ctx);
    var saved = personal(ctx).timer;
    if (!saved || saved.status !== 'running') return false;
    var t = advance(saved, time());
    if (t.status === 'completed') {
      update(ctx, function (p) { p.timer = t; }, t.phase === 'break' ? '休息计时完成' : '专注计时完成');
      if (document.querySelector('#personal-timer-content')) document.querySelector('#personal-timer-content').innerHTML = timerBody(ctx, t);
      return true;
    }
    var display = document.querySelector('#personal-timer-display');
    if (display) display.textContent = timerText(t);
    return false;
  }

  function reminderPlan(tasks, ledger, wall, existing) {
    var receipts = clone(ledger || {}), notices = clone(existing || []), active = new Set();
    tasks.forEach(function (t) {
      if (t.done || !Number.isFinite(t.at)) return;
      var key = t.id + '|' + t.at; active.add(key);
      var before = receipts[key], due = typeof before === 'number' ? before : t.at;
      if (before !== 'sent' && due <= wall && notices.length < 5 && !notices.some(function (n) { return n.key === key; })) {
        notices.push({key: key, taskId: t.id, title: t.title, at: t.at}); receipts[key] = 'sent';
      }
    });
    notices = notices.filter(function (n) { return active.has(n.key); });
    Object.keys(receipts).forEach(function (key) { if (!active.has(key)) delete receipts[key]; });
    return {ledger: receipts, notices: notices};
  }
  function measureReminderDock() {
    var host = document.querySelector('#reminder-notice'), space = 0;
    if (host && host.children.length) {
      var box = host.getBoundingClientRect(), bottom = parseFloat(window.getComputedStyle(host).bottom) || 0;
      if (box.height > 0) space = Math.ceil(box.height + Math.max(0, bottom) + 8);
    }
    var value = space + 'px', style = document.documentElement.style;
    if (style.getPropertyValue('--reminder-dock-space') !== value) style.setProperty('--reminder-dock-space', value);
  }
  function observeReminderDock(host) {
    if (!reminderDockObserver && window.ResizeObserver) reminderDockObserver = new window.ResizeObserver(measureReminderDock);
    if (reminderDockObserver && reminderDockHost !== host) {
      reminderDockObserver.disconnect(); reminderDockObserver.observe(host); reminderDockHost = host;
    }
    if (!reminderDockListening) {
      window.addEventListener('resize', measureReminderDock);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', measureReminderDock);
      reminderDockListening = true;
    }
    measureReminderDock();
  }
  function renderReminders(ctx) {
    var host = document.querySelector('#reminder-notice');
    if (!host) return;
    var notices = personal(ctx).reminderNotices || [];
    host.innerHTML = notices.map(function (n) { return '<article class="reminder-card" data-reminder-key="' + esc(ctx, n.key) + '"><strong>合成待办提醒</strong><p>' + esc(ctx, n.title) + '</p><div class="page-actions">' + button(ctx, '查看', 'personal-reminder-open', n.key) + button(ctx, '10 分钟后', 'personal-reminder-snooze', n.key) + button(ctx, '知道了', 'personal-reminder-dismiss', n.key) + '</div></article>'; }).join('');
    observeReminderDock(host);
  }
  function checkReminders(ctx, injectedWall) {
    var wall = Number.isFinite(injectedWall) ? injectedWall : Date.now(); lastReminderCheck = Date.now();
    var p = personal(ctx), tasks = window.DemoDomain.helpers.flattenTasks(core(ctx).tasks).map(function (t) { return {id: t.id, title: t.title, done: t.done, at: ctx.repo.reminderAt(t.id)}; });
    var result = reminderPlan(tasks, p.reminderLedger, wall, p.reminderNotices);
    if (JSON.stringify(result.ledger) !== JSON.stringify(p.reminderLedger || {}) || JSON.stringify(result.notices) !== JSON.stringify(p.reminderNotices || [])) update(ctx, function (next) { next.reminderLedger = result.ledger; next.reminderNotices = result.notices; });
    renderReminders(ctx); return result;
  }

  function feedbackData(ctx) { return personal(ctx).feedback || {ideas: [], draft: null, beforeImport: null}; }
  function feedbackPage(ctx) {
    var data = feedbackData(ctx), v = views.feedback, ideas = data.ideas.filter(function (x) { return (!v.status || x.status === v.status) && search(x.title + ' ' + x.body, v.query); }).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id); });
    return heading(ctx, '优化意见', '在当前合成工作区记录想法，支持本地整理和独立备份。', button(ctx, '记个想法', 'personal-feedback-new', '', 'primary')) + '<div class="page-actions">' + button(ctx, '导出意见', 'personal-feedback-export') + button(ctx, '导入并合并', 'personal-feedback-import') + button(ctx, '导入前备份', 'personal-feedback-previous', '', '', !data.beforeImport) + (data.draft ? button(ctx, '继续草稿', 'personal-feedback-draft') : '') + '</div><p class="help-text">图片只保存在合成意见域，保留原始字节与校验值。此处不会提交给远端，也不连接 Android FeedbackKit 数据库。</p>' + filterForm(ctx, 'feedback', true) + (ideas.length ? '<div class="card-grid">' + ideas.map(function (x) { return '<article class="panel" data-feedback-id="' + esc(ctx, x.id) + '"><span class="pill">' + (x.status === 'resolved' ? '已解决' : '待处理') + '</span><h2>' + esc(ctx, x.title || '未命名意见') + '</h2><p class="note-body">' + esc(ctx, x.body) + '</p><small>' + esc(ctx, new Date(x.updatedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})) + ' · ' + (x.images || []).length + ' 张图片</small><div class="page-actions">' + button(ctx, '编辑', 'personal-feedback-edit', x.id) + button(ctx, '复制', 'personal-feedback-copy', x.id) + button(ctx, '删除', 'personal-feedback-delete', x.id, 'danger') + '</div></article>'; }).join('') + '</div>' : empty(ctx, '还没有匹配的意见，记录一个改进想法。'));
  }
  function feedbackForm(ctx, id, draft) {
    var x = draft || feedbackData(ctx).ideas.find(function (i) { return i.id === id; }) || {title: '', body: '', status: 'pending', images: []};
    if (id && !draft && !feedbackData(ctx).ideas.some(function (i) { return i.id === id; })) throw new Error('意见已不存在');
    if (x.id) { var base = feedbackData(ctx).ideas.find(function (i) { return i.id === x.id; }); if (base) feedbackBases.set(x.id, clone(base)); }
    ctx.modal(form(ctx, 'personal-feedback', id ? '编辑优化意见' : '记录优化意见', hidden(ctx, 'id', x.id || id) + hidden(ctx, 'fromDraft', draft ? '1' : '') + field(ctx, '标题（可留空）', 'title', x.title, 'text', 400) + textarea(ctx, '意见内容（标题或内容至少填一项）', 'body', x.body, false, 100000) + '<label class="field"><span>处理状态</span><select name="status"><option value="pending"' + (x.status === 'pending' ? ' selected' : '') + '>待处理</option><option value="resolved"' + (x.status === 'resolved' ? ' selected' : '') + '>已解决</option></select></label><label class="field"><span>添加原始图片（PNG/JPEG/WebP/GIF，单张最多 4 MiB，总计 8 MiB）</span><input name="images" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><ul>' + (x.images || []).map(function (i) { return '<li>' + esc(ctx, i.name) + ' · ' + i.size + ' 字节 · SHA-256 ' + esc(ctx, i.sha256.slice(0, 12)) + '</li>'; }).join('') + '</ul>' + button(ctx, '保存为草稿', 'personal-feedback-save-draft') + '<p class="form-help">编辑保存会保留已有图片。图片原始文件可单独导出。</p>' + (x.id ? button(ctx, '导出原始图片', 'personal-feedback-images', x.id) : '')));
    return true;
  }
  function bytesBase64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
  function base64Bytes(value) { var s = atob(value); return Uint8Array.from(s, function (c) { return c.charCodeAt(0); }); }
  async function sha(bytes) { if (!window.crypto || !window.crypto.subtle) throw new Error('当前体验环境不支持图片校验，请使用 localhost 或 HTTPS 体验'); var digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  async function imagesFrom(values, old) {
    var images = clone(old || []), files = values.getAll('images').filter(function (f) { return f && typeof f.arrayBuffer === 'function' && f.size; });
    for (var f of files) {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type) || f.size > 4194304) throw new Error('请添加支持的图片，单张不超过 4 MiB');
      var bytes = new Uint8Array(await f.arrayBuffer()), hash = await sha(bytes);
      if (!images.some(function (i) { return i.sha256 === hash; })) images.push({id: uid('image'), name: f.name, mime: f.type, size: bytes.length, sha256: hash, base64: bytesBase64(bytes)});
    }
    if (images.reduce(function (sum, i) { return sum + i.size; }, 0) > 8388608) throw new Error('此条意见图片总计不能超过 8 MiB');
    return images;
  }
  async function validateFeedback(data) {
    if (!data || data.kind !== 'mytodo.d4.synthetic.feedback' || data.version !== 1 || !Array.isArray(data.ideas) || data.ideas.length > 10000) throw new Error('请选择本体验导出的合成意见备份');
    var seen = new Set(), ideas = clone(data.ideas);
    for (var x of ideas) {
      if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(x.id) || seen.has(x.id) || !['pending', 'resolved'].includes(x.status) || !Array.isArray(x.images)) throw new Error('意见字段或编号无效');
      feedbackText(x.title, x.body, false); x.createdAt = feedbackTime(x.createdAt); x.updatedAt = feedbackTime(x.updatedAt);
      seen.add(x.id); var imageTotal = 0;
      for (var i of x.images) { if (!i || typeof i.name !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(i.mime) || typeof i.base64 !== 'string' || !/^[a-f0-9]{64}$/.test(i.sha256)) throw new Error('图片元数据无效'); var bytes = base64Bytes(i.base64); if (bytes.length !== i.size || bytes.length > 4194304 || await sha(bytes) !== i.sha256) throw new Error('图片完整性校验失败，当前数据保留'); imageTotal += bytes.length; }
      if (imageTotal > 8388608) throw new Error('意见图片总计超过限制');
    }
    return ideas;
  }
  async function validatePersonal(p) {
    if (p == null) return;
    if (typeof p !== 'object' || Array.isArray(p)) throw new Error('合成个人工具字段无效');
    if (p.timer) {
      var t = p.timer;
      if (t.focusMode != null && !['countdown', 'countup'].includes(t.focusMode)) throw new Error('合成专注计时模式无效');
      if (t.version !== 1 || !['countdown', 'countup'].includes(t.mode) || !['focus', 'break'].includes(t.phase) || !['idle', 'running', 'paused', 'ended', 'completed'].includes(t.status) || !Number.isInteger(t.durationMinutes) || t.durationMinutes < 1 || t.durationMinutes > 180 || !Number.isInteger(t.breakMinutes) || t.breakMinutes < 1 || t.breakMinutes > 180 || !Number.isFinite(t.elapsedMillis) || t.elapsedMillis < 0 || !t.anchor || !Number.isFinite(t.anchor.wall) || !Number.isFinite(t.anchor.elapsed) || typeof t.anchor.boot !== 'string' || !Array.isArray(t.history) || t.history.length > 10000 || typeof t.sessionId !== 'string' || typeof t.taskId !== 'string' || !t.focusedMillisByDay || !t.completedSessionsByDay) throw new Error('合成计时状态无效');
      for (var h of t.history) if (!h || typeof h.id !== 'string' || !Number.isFinite(h.elapsedMillis) || h.elapsedMillis < 0 || !['completed', 'ended'].includes(h.outcome) || !Number.isFinite(Date.parse(h.finishedAt))) throw new Error('合成计时历史无效');
      for (var map of [t.focusedMillisByDay, t.completedSessionsByDay]) { if (typeof map !== 'object' || Array.isArray(map)) throw new Error('合成计时统计无效'); for (var key of Object.keys(map)) if (!/^-?\d+$/.test(key) || !Number.isFinite(map[key]) || map[key] < 0) throw new Error('合成计时统计无效'); }
    }
    if (p.sync) { var s = p.sync; if (!['idle', 'success', 'error', 'conflict'].includes(s.status) || !Number.isInteger(s.pending) || s.pending < 0 || typeof s.folder !== 'string' || typeof s.error !== 'string' || !Array.isArray(s.history) || !Array.isArray(s.conflicts)) throw new Error('合成同步状态无效'); for (var c of s.conflicts) if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.field !== 'string' || !Array.isArray(c.values) || !c.values.length || !c.values.every(function (v) { return typeof v === 'string'; }) || (c.chosen != null && (!Number.isInteger(c.chosen) || c.chosen < 0 || c.chosen >= c.values.length))) throw new Error('合成冲突状态无效'); }
    if (p.devices && (!Array.isArray(p.devices) || p.devices.filter(function (d) { return d && d.current; }).length !== 1 || !p.devices.every(function (d) { return d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.type === 'string'; }))) throw new Error('合成设备状态无效');
    if (p.feedback) {
      p.feedback.ideas = await validateFeedback({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: p.feedback.ideas});
      if (p.feedback.beforeImport) p.feedback.beforeImport = await validateFeedback({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: p.feedback.beforeImport});
      if (p.feedback.draft) { var draft = clone(p.feedback.draft); feedbackText(draft.title, draft.body, true); draft.id = draft.id || 'synthetic-draft'; if (!draft.title.trim() && !draft.body.trim()) draft.body = 'draft'; await validateFeedback({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: [draft]}); p.feedback.draft.createdAt = feedbackTime(p.feedback.draft.createdAt); p.feedback.draft.updatedAt = feedbackTime(p.feedback.draft.updatedAt); }
    }
    if (p.reminderLedger && (typeof p.reminderLedger !== 'object' || Array.isArray(p.reminderLedger) || !Object.values(p.reminderLedger).every(function (v) { return v === 'sent' || Number.isFinite(v); }))) throw new Error('合成提醒台账无效');
    if (p.reminderNotices && (!Array.isArray(p.reminderNotices) || !p.reminderNotices.every(function (n) { return n && typeof n.key === 'string' && typeof n.taskId === 'string' && typeof n.title === 'string' && Number.isFinite(n.at); }))) throw new Error('合成提醒卡片无效');
  }
  function download(data, filename, mime) { var url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type: mime || 'application/json'})), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function feedbackExport(data) { return JSON.stringify({kind: 'mytodo.d4.synthetic.feedback', version: 1, ideas: data.ideas}, null, 2); }
  function syncData(ctx) { return personal(ctx).sync || {enabled: false, autoSync: true, folder: 'DemoOnly', status: 'idle', pending: 3, lastSync: '', error: '', history: [], conflicts: []}; }
  function syncPage(ctx) {
    var s = syncData(ctx), labels = {idle: '尚未模拟', success: '模拟成功', error: '模拟失败', conflict: '有模拟冲突'}, unresolved = s.conflicts.filter(function (x) { return x.chosen == null; });
    var devices = personal(ctx).devices, currentDevice = Array.isArray(devices) ? devices.find(function (d) { return d && d.current; }) : null;
    var deviceName = currentDevice && currentDevice.name ? currentDevice.name : '当前体验设备（合成）';
    return heading(ctx, '同步中心', '恢复同步入口，当前页面使用隔离状态提供器。', button(ctx, '模拟成功', 'personal-sync-success', '', 'primary') + button(ctx, '模拟错误', 'personal-sync-error') + button(ctx, '模拟冲突', 'personal-sync-conflict')) + '<p class="help-text" role="note">合成环境 · 所有操作只改变体验状态。真实同步与远端设备连接尚未启用。</p><section class="panel" data-provider="synthetic"><h2>当前状态</h2><dl class="detail-grid"><dt>状态</dt><dd data-sync-status="' + s.status + '">' + labels[s.status] + '</dd><dt>上次模拟时间</dt><dd>' + esc(ctx, s.lastSync || '尚无') + '</dd><dt>合成待同步数量</dt><dd data-sync-pending>' + s.pending + '</dd><dt>当前设备</dt><dd>' + esc(ctx, deviceName) + '</dd><dt>错误原因</dt><dd>' + esc(ctx, s.error || '无') + '</dd></dl></section><form data-form="personal-sync-config" class="panel work-form"><h2>模拟配置</h2><label class="field"><span><input name="enabled" type="checkbox"' + (s.enabled ? ' checked' : '') + '> 启用本地模拟状态</span></label><label class="field"><span><input name="autoSync" type="checkbox"' + (s.autoSync ? ' checked' : '') + '> 保留自动同步偏好</span></label>' + field(ctx, '演示目录名称', 'folder', s.folder, 'text', 60) + '<p class="form-help">不会保存真实账号或应用密码；该偏好不会启动网络同步。</p><button class="button" type="submit">保存模拟配置</button></form><section class="panel"><h2>冲突版本 · ' + unresolved.length + ' 项待选择</h2>' + (s.conflicts.length ? s.conflicts.map(function (c) { return '<article><h3>' + esc(ctx, c.title) + '</h3><p>' + esc(ctx, c.field) + ' · 所有候选版本保留</p>' + c.values.map(function (v, index) { return button(ctx, '采用：' + v, 'personal-sync-choice', c.id + '|' + index, c.chosen === index ? 'primary' : ''); }).join('') + (c.chosen != null ? '<p>已记录本地模拟选择：' + esc(ctx, c.values[c.chosen]) + '</p>' : '') + '</article>'; }).join('') : '<p>当前没有模拟冲突。</p>') + '</section><section class="panel"><h2>模拟历史</h2>' + (s.history.length ? '<ol class="activity-list">' + s.history.map(function (h) { return '<li>' + esc(ctx, h.message) + ' · ' + esc(ctx, h.at) + '</li>'; }).join('') + '</ol>' : '<p>还没有模拟操作记录。</p>') + '</section>';
  }
  function simulate(ctx, mode) {
    return update(ctx, function (p) {
      var s = p.sync, at = stamp(); s.status = mode; s.error = mode === 'error' ? '合成故障：网络不可用（无实际网络请求）' : '';
      if (mode === 'success') { s.pending = 0; s.lastSync = at; p.devices.forEach(function (d) { if (d.current) { d.lastSync = at; d.connected = true; } }); }
      if (mode === 'conflict') s.conflicts.push({id: uid('conflict'), title: '合成任务并发标题', field: '标题', values: ['设备 A 的合成标题', '设备 B 的合成标题'], chosen: null});
      s.history.unshift({at: at, status: mode, message: ({success: '合成同步成功', error: '合成同步失败，待发送状态保留', conflict: '生成合成冲突，两版均保留'})[mode]});
    }, '已更新模拟状态');
  }
  function devicesPage(ctx) {
    var ds = personal(ctx).devices || [{id: 'synthetic-current-device', name: '当前体验设备', type: 'browser', current: true, connected: false, lastSync: ''}];
    return heading(ctx, '设备管理', '查看隔离体验设备，设备操作不影响真实同步。') + '<p class="help-text">原版同步具有设备独立复制进度；远端设备列表及管理能力未核实。下列设备均为合成状态。</p><div class="card-grid">' + ds.map(function (d) { return '<article class="panel" data-device-id="' + esc(ctx, d.id) + '"><h2>' + esc(ctx, d.name) + '</h2><p>' + esc(ctx, d.type) + (d.current ? ' · 当前体验设备' : '') + '</p><dl><dt>合成标识</dt><dd>' + esc(ctx, d.id) + '</dd><dt>模拟连接</dt><dd>' + (d.connected ? '模拟已连接' : '模拟未连接') + '</dd><dt>上次模拟同步</dt><dd>' + esc(ctx, d.lastSync || '尚无') + '</dd></dl>' + button(ctx, '修改演示名称', 'personal-device-edit', d.id) + '</article>'; }).join('') + '</div>';
  }
  function dataPage(ctx) {
    var p = personal(ctx);
    return heading(ctx, '数据与系统', '只对当前合成工作区进行导入、导出和恢复。') + '<section class="panel"><h2>合成工作区</h2><p>任务、便签、项目和工作模块的体验数据均在独立命名空间内。</p><div class="page-actions">' + button(ctx, '导出合成工作区', 'export-demo') + button(ctx, '导入合成工作区', 'personal-workspace-import') + button(ctx, '创建合成快照', 'personal-workspace-backup') + button(ctx, '恢复合成快照', 'personal-workspace-restore', '', '', !p.workspaceBackup) + '</div><p class="form-help">拒绝原版业务备份、真实数据库和迁移包。此工具不能证明生产备份或迁移安全。</p></section><section class="panel"><h2>提醒与循环任务</h2><p>任务字段、子任务和循环计算复用冻结基线纯业务模块。系统通知与 Android 后台提醒需原生回归。</p>' + button(ctx, '查看提醒计划', 'reminders') + button(ctx, '返回四象限', 'go', 'tasks') + '</section>';
  }
  function previewVersion() {
    var bridge = window.GxD4Preview;
    if (!bridge || !bridge.isPreview || !bridge.isPreview() || !bridge.versionInfo) return null;
    try { var value = JSON.parse(bridge.versionInfo()); if (!value || value.apkBuild !== true || typeof value.versionName !== 'string' || !Number.isInteger(value.versionCode) || typeof value.sourceSha !== 'string' || typeof value.buildTimeUtc !== 'string') return null; return value; } catch (_) { return null; }
  }
  function formatBuild(b, title) { var built = b.buildTimeUtc || b.builtAt || b.buildTime || '', zone = b.timezone || (b.buildTimeUtc ? 'UTC' : b.buildTimezone || ''); return title + '\n版本：' + (b.versionName || b.version || '未记录') + '\nversionCode：' + (b.versionCode == null ? '未记录' : b.versionCode) + '\nby codex · ' + (b.sourceSha ? b.sourceSha.slice(0, 5) : 'Git 提交未记录') + '\n构建时间：' + (built || '未记录') + (built && zone ? ' ' + zone : '') + '\n完整源码 SHA：' + (b.sourceSha || '未记录'); }
  function buildText() { var apk = previewVersion(); return formatBuild(apk || window.D4_BUILD || {}, apk ? 'MyTodo D4-03 Android 隔离体验 APK' : 'MyTodo D4-03 合成体验'); }
  function aboutPage(ctx) { var apk = previewVersion(); return heading(ctx, '关于与诊断', '构建身份以云端注入记录为准。') + '<section class="panel"><h2>MyTodo</h2><pre class="version-info">' + esc(ctx, buildText()) + '</pre><div class="page-actions">' + button(ctx, '复制版本信息', 'personal-about-copy') + button(ctx, '版本历史', 'personal-about-history') + (apk ? button(ctx, 'APK版本信息', 'personal-apk-version') : '') + '</div>' + (apk ? '<details><summary>网页体验构建身份</summary><pre class="version-info-html">' + esc(ctx, formatBuild(window.D4_BUILD || {}, 'MyTodo D4-03 网页合成体验')) + '</pre></details>' : '') + '<p class="help-text">这是合成体验；Android issue #1 保持开放。浏览器通过不代表三端原生功能全部通过。</p></section>'; }
  function render(route, ctx) { return ({notes: notesPage, pomodoro: pomodoroPage, feedback: feedbackPage, sync: syncPage, devices: devicesPage, 'data-system': dataPage, about: aboutPage})[route] ? ({notes: notesPage, pomodoro: pomodoroPage, feedback: feedbackPage, sync: syncPage, devices: devicesPage, 'data-system': dataPage, about: aboutPage})[route](ctx) : null; }
  function importForm(ctx, kind) { ctx.modal(form(ctx, kind === 'feedback' ? 'personal-feedback-import' : 'personal-workspace-import', kind === 'feedback' ? '导入合成意见备份' : '导入合成工作区', textarea(ctx, '粘贴本体验导出的 JSON', 'json', '', true, 20000000) + '<p class="form-help">完整验证成功后才保存；当前合成数据会先建立快照。</p>', '验证并导入')); return true; }
  async function copyText(ctx, text) { if (navigator.clipboard && navigator.clipboard.writeText) { try { await navigator.clipboard.writeText(text); ctx.toast('已复制'); return; } catch (_) { /* Clipboard unavailable: offer explicit selectable text. */ } } ctx.modal('<h2>复制内容</h2>' + textarea(ctx, '选择并复制', 'copyText', text) + button(ctx, '关闭', 'personal-close')); }
  function handle(action, id, ctx) {
    if (!action.startsWith('personal-')) return false;
    if (pendingSubmission) throw new Error('正在保存或验证意见与附件，请等待完成');
    if (action === 'personal-close') { ctx.closeModal(); return true; }
    if (action === 'personal-native-timer') { if (!window.GxD4Preview || !window.GxD4Preview.isPreview || !window.GxD4Preview.isPreview() || !window.GxD4Preview.openNativeTimer) throw new Error('此版本不包含原生隔离体验'); window.GxD4Preview.openNativeTimer(); return true; }
    if (action === 'personal-apk-version') { if (!previewVersion() || !window.GxD4Preview.openVersionInfo) throw new Error('此版本不包含 APK 版本信息'); window.GxD4Preview.openVersionInfo(); return true; }
    if (action === 'personal-reminder-snooze' || action === 'personal-reminder-dismiss' || action === 'personal-reminder-open') {
      var notice = (personal(ctx).reminderNotices || []).find(function (n) { return n.key === id; });
      if (!notice) return true;
      update(ctx, function (p) { p.reminderLedger = p.reminderLedger || {}; p.reminderLedger[id] = action === 'personal-reminder-snooze' ? Date.now() + 600000 : 'sent'; p.reminderNotices = (p.reminderNotices || []).filter(function (n) { return n.key !== id; }); });
      renderReminders(ctx); if (action === 'personal-reminder-open' && ctx.openTask) ctx.openTask(notice.taskId); return true;
    }
    if (action === 'personal-filter-clear') { if (views[id]) views[id] = {query: '', status: ''}; ctx.navigate(id); var filter = document.querySelector('[data-form="personal-filter"]'); if (filter) { filter.querySelector('[name="query"]').value = ''; var status = filter.querySelector('[name="status"]'); if (status) status.value = ''; } return true; }
    if (action === 'personal-note-new' || action === 'personal-note-edit') return noteForm(ctx, action === 'personal-note-new' ? '' : id);
    if (action === 'personal-note-delete' || action === 'personal-feedback-delete') { var kind = action.includes('feedback') ? 'feedback' : 'note'; ctx.modal('<h2>删除这条' + (kind === 'feedback' ? '意见' : '便签') + '？</h2><p>仅删除当前合成条目。</p><div class="form-actions">' + button(ctx, '取消', 'personal-close') + button(ctx, '确认删除', 'personal-' + kind + '-delete-confirm', id, 'danger') + '</div>'); return true; }
    if (action === 'personal-note-delete-confirm') { ctx.transaction(function (s) { s.notes = s.notes.filter(function (n) { return n.id !== id; }); }); ctx.closeModal(); ctx.toast('已删除便签'); return true; }
    if (action.startsWith('personal-timer-')) return mutateTimer(ctx, action.slice('personal-timer-'.length));
    if (action === 'personal-feedback-new' || action === 'personal-feedback-edit') return feedbackForm(ctx, action === 'personal-feedback-new' ? '' : id);
    if (action === 'personal-feedback-draft') return feedbackForm(ctx, '', feedbackData(ctx).draft);
    if (action === 'personal-feedback-save-draft') { var f = document.querySelector('[data-form="personal-feedback"]'); if (f) submit('personal-feedback-draft', new FormData(f), ctx).catch(function (e) { ctx.toast(e.message); }); return true; }
    if (action === 'personal-feedback-delete-confirm') return update(ctx, function (p) { p.feedback.ideas = p.feedback.ideas.filter(function (x) { return x.id !== id; }); }, '已删除意见', true);
    if (action === 'personal-feedback-export') { download(feedbackExport(feedbackData(ctx)), 'mytodo-d4-synthetic-feedback.json'); ctx.toast('已导出合成意见'); return true; }
    if (action === 'personal-feedback-import') return importForm(ctx, 'feedback');
    if (action === 'personal-feedback-previous') { var previous = feedbackData(ctx).beforeImport; if (!previous) throw new Error('尚无导入前备份'); download(feedbackExport({ideas: previous}), 'mytodo-d4-synthetic-feedback-before-import.json'); return true; }
    if (action === 'personal-feedback-copy') { var idea = feedbackData(ctx).ideas.find(function (x) { return x.id === id; }); if (!idea) throw new Error('意见已不存在'); copyText(ctx, idea.title + '\n' + idea.body + '\n' + (idea.status === 'resolved' ? '已解决' : '待处理')); return true; }
    if (action === 'personal-feedback-images') { var x = feedbackData(ctx).ideas.find(function (i) { return i.id === id; }); if (!x) throw new Error('意见已不存在'); x.images.forEach(function (i) { download(new Blob([base64Bytes(i.base64)], {type: i.mime}), i.name.replace(/[\/\\]/g, '_')); }); ctx.toast(x.images.length ? '已导出原始图片' : '此意见没有图片'); return true; }
    if (action === 'personal-sync-success' || action === 'personal-sync-error' || action === 'personal-sync-conflict') return simulate(ctx, action.slice('personal-sync-'.length));
    if (action === 'personal-sync-choice') { var parts = id.split('|'), index = Number(parts[1]); return update(ctx, function (p) { var c = p.sync.conflicts.find(function (x) { return x.id === parts[0]; }); if (!c || !Number.isInteger(index) || index < 0 || index >= c.values.length) throw new Error('冲突选择无效'); c.chosen = index; p.sync.history.unshift({at: stamp(), status: 'choice', message: '合成冲突选择已记录；两版保留'}); }, '已保留并记录模拟选择'); }
    if (action === 'personal-device-edit') { var device = (personal(ctx).devices || [{id: 'synthetic-current-device', name: '当前体验设备'}]).find(function (d) { return d.id === id; }); if (!device) throw new Error('演示设备已不存在'); ctx.modal(form(ctx, 'personal-device', '修改演示设备名称', hidden(ctx, 'id', id) + field(ctx, '设备名称', 'name', device.name, 'text', 80))); return true; }
    if (action === 'personal-workspace-import') return importForm(ctx, 'workspace');
    if (action === 'personal-workspace-backup') { var snapshot = {state: ctx.repo.state, demo: ctx.repo.demo, at: stamp()}; if (snapshot.demo.personal) delete snapshot.demo.personal.workspaceBackup; return update(ctx, function (p) { p.workspaceBackup = snapshot; }, '已创建合成快照'); }
    if (action === 'personal-workspace-restore') { if (!personal(ctx).workspaceBackup) throw new Error('尚无合成快照'); ctx.modal('<h2>恢复合成快照？</h2><p>恢复当前独立体验的任务、便签和模拟状态，当前修改会被替换。</p>' + button(ctx, '取消', 'personal-close') + button(ctx, '确认恢复', 'personal-workspace-restore-confirm', '', 'danger')); return true; }
    if (action === 'personal-workspace-restore-confirm') { var backup = clone(personal(ctx).workspaceBackup); if (!backup) throw new Error('尚无合成快照'); ctx.repo.batch(function () { ctx.repo.replaceState(backup.state); ctx.repo.updateDemo(backup.demo); ctx.repo.updateDemo(function (d) { ensure(d).workspaceBackup = backup; }); }); ctx.closeModal(); persistedToast(ctx, '已恢复合成快照'); return true; }
    if (action === 'personal-about-copy') { copyText(ctx, buildText()); return true; }
    if (action === 'personal-about-history') { var apk = previewVersion(), b = window.D4_BUILD || {}, history = Array.isArray(b.history) ? b.history : []; ctx.modal('<h2>版本历史</h2><p>按当前构建携带的已知记录显示。</p>' + (apk && typeof apk.historyText === 'string' ? '<pre class="version-info">' + esc(ctx, apk.historyText) + '</pre>' : history.length ? '<ol>' + history.map(function (h) { return '<li>' + esc(ctx, typeof h === 'string' ? h : (h.version || h.versionName || '') + ' · ' + (h.description || h.changes || '') + ' · ' + (h.at || h.date || '')) + '</li>'; }).join('') + '</ol>' : '<p>本体验包尚未记录版本历史。生产旧版本未导入，避免编造历史。</p>') + button(ctx, '关闭', 'personal-close')); return true; }
    return false;
  }
  async function submit(name, values, ctx) {
    if (!name.startsWith('personal-')) return false;
    if (pendingSubmission) throw new Error('正在保存或验证意见与附件，请等待完成');
    if (!['personal-feedback', 'personal-feedback-draft', 'personal-feedback-import', 'personal-workspace-import'].includes(name)) return submitCore(name, values, ctx);
    var actualName = name === 'personal-feedback-draft' ? 'personal-feedback' : name;
    var sourceForm = document.querySelector('[data-form="' + actualName + '"]'), sourceModal = sourceForm && sourceForm.closest('.modal');
    var controls = sourceForm ? Array.from(sourceForm.querySelectorAll('input,textarea,select,button')).map(function (control) { return {element: control, disabled: control.disabled}; }) : [];
    var guardedCtx = Object.create(ctx);
    guardedCtx.closeModal = function () { if (!sourceModal || document.querySelector('.modal') === sourceModal) ctx.closeModal(); };
    pendingSubmission = {name: name, form: sourceForm};
    controls.forEach(function (saved) { saved.element.disabled = true; });
    try { return await submitCore(name, values, guardedCtx); }
    finally { pendingSubmission = null; controls.forEach(function (saved) { if (saved.element.isConnected) saved.element.disabled = saved.disabled; }); }
  }
  async function submitCore(name, values, ctx) {
    if (!name.startsWith('personal-')) return false;
    if (name === 'personal-filter') { var route = get(values, 'route'); if (!views[route]) throw new Error('筛选页面无效'); views[route] = {query: get(values, 'query'), status: get(values, 'status')}; ctx.navigate(route); return true; }
    if (name === 'personal-note') { var id = get(values, 'id'), body = get(values, 'body').trim(); if (!body || body.length > 50000) throw new Error('请输入不超过 50000 字符的便签内容'); ctx.transaction(function (s) { var n = s.notes.find(function (x) { return x.id === id; }); if (id && !n) throw new Error('便签已不存在'); if (n) n.body = body; else s.notes.unshift({id: uid('note'), body: body, createdAt: stamp()}); }); ctx.closeModal(); persistedToast(ctx, '已保存便签'); return true; }
    if (name === 'personal-timer-config') { var taskId = get(values, 'taskId'); if (taskId && !window.DemoDomain.helpers.flattenTasks(core(ctx).tasks).some(function (x) { return x.id === taskId; })) throw new Error('关联任务已不存在'); return mutateTimer(ctx, 'configure', {durationMinutes: get(values, 'durationMinutes'), breakMinutes: get(values, 'breakMinutes'), mode: get(values, 'mode'), taskId: taskId}); }
    if (name === 'personal-feedback' || name === 'personal-feedback-draft') {
      var ideaId = get(values, 'id'), old = feedbackData(ctx).ideas.find(function (x) { return x.id === ideaId; }), title = get(values, 'title'), text = get(values, 'body'), status = get(values, 'status');
      if (ideaId && !old && name === 'personal-feedback') throw new Error('意见已不存在');
      if (old && feedbackBases.has(ideaId) && JSON.stringify(old) !== JSON.stringify(feedbackBases.get(ideaId))) throw new Error('意见已在其他编辑操作中修改，请复制当前内容后重新打开');
      if (name === 'personal-feedback') { text = text.trim(); title = title.trim() || Array.from(text.split('\n')[0]).slice(0, 50).join(''); }
      feedbackText(title, text, name === 'personal-feedback-draft'); if (!['pending', 'resolved'].includes(status)) throw new Error('请填写有效意见状态');
      var savedDraft = feedbackData(ctx).draft, baseImages = get(values, 'fromDraft') === '1' && savedDraft && savedDraft.id === ideaId ? savedDraft.images : old ? old.images : [], images = await imagesFrom(values, baseImages), at = nextFeedbackStamp(old && old.updatedAt);
      var idea = {id: ideaId || uid('idea'), title: title, body: text, status: status, images: images, createdAt: old ? old.createdAt : at, updatedAt: at};
      if (name === 'personal-feedback-draft') { if (!ideaId) idea.id = ''; return update(ctx, function (p) { p.feedback.draft = idea; }, '已保存合成草稿', true); }
      return update(ctx, function (p) { var index = p.feedback.ideas.findIndex(function (x) { return x.id === ideaId; }); if (ideaId && index < 0) throw new Error('意见已不存在'); if (index >= 0 && JSON.stringify(p.feedback.ideas[index]) !== JSON.stringify(old)) throw new Error('意见在保存期间已修改，请重新打开；当前内容未覆盖'); if (index >= 0) p.feedback.ideas[index] = idea; else p.feedback.ideas.push(idea); p.feedback.draft = null; feedbackBases.delete(ideaId); }, '已保存优化意见', true);
    }
    if (name === 'personal-feedback-import') {
      var raw = get(values, 'json'); if (new TextEncoder().encode(raw).length > 20000000) throw new Error('合成意见备份超过限制'); var incoming = await validateFeedback(JSON.parse(raw));
      return update(ctx, function (p) { p.feedback.beforeImport = clone(p.feedback.ideas); incoming.forEach(function (x) { var old = p.feedback.ideas.find(function (i) { return i.id === x.id; }); if (!old) p.feedback.ideas.push(x); else if (x.updatedAt > old.updatedAt) Object.assign(old, x); else if (x.updatedAt === old.updatedAt && JSON.stringify(x) !== JSON.stringify(old)) { if (p.feedback.ideas.some(function (i) { return i.title === x.title && i.body === x.body && i.status === x.status && i.createdAt === x.createdAt && JSON.stringify(i.images) === JSON.stringify(x.images); })) return; x.id = uid('idea-copy'); x.updatedAt = nextFeedbackStamp(x.updatedAt); p.feedback.ideas.push(x); } }); }, '已验证并合并合成意见，导入前备份保留', true);
    }
    if (name === 'personal-sync-config') { var folder = get(values, 'folder').trim(); if (!/^[A-Za-z0-9_-]{1,60}$/.test(folder)) throw new Error('演示目录使用 1–60 位字母、数字、下划线或短横线'); return update(ctx, function (p) { p.sync.enabled = values.has('enabled'); p.sync.autoSync = values.has('autoSync'); p.sync.folder = folder; }, '已保存模拟配置'); }
    if (name === 'personal-device') { var deviceName = get(values, 'name').trim(); if (!deviceName || deviceName.length > 80) throw new Error('请输入有效演示设备名称'); return update(ctx, function (p) { var d = p.devices.find(function (x) { return x.id === get(values, 'id'); }); if (!d) throw new Error('演示设备已不存在'); d.name = deviceName; }, '已修改演示名称', true); }
    if (name === 'personal-workspace-import') { var json = get(values, 'json'); if (new TextEncoder().encode(json).length > 20000000) throw new Error('合成工作区超过限制'); var next = JSON.parse(json); if (!next || next.kind !== window.DemoDomain.STORAGE_KIND || next.version !== 1 || !next.state || !next.demo || typeof next.demo !== 'object' || Array.isArray(next.demo)) throw new Error('仅支持本体验导出的合成工作区'); var normalized = window.DemoDomain.helpers.normalizeState(next.state); await validatePersonal(next.demo.personal); var snapshot = {state: ctx.repo.state, demo: ctx.repo.demo, at: stamp()}; if (snapshot.demo.personal) delete snapshot.demo.personal.workspaceBackup; ctx.repo.batch(function () { ctx.repo.replaceState(normalized); ctx.repo.updateDemo(next.demo); ctx.repo.updateDemo(function (d) { ensure(d).workspaceBackup = snapshot; }); }); ctx.closeModal(); persistedToast(ctx, '已导入合成工作区，原合成快照保留'); return true; }
    return false;
  }
  function key(event, ctx) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.closest('[data-form="personal-note"]')) { event.preventDefault(); event.target.closest('form').requestSubmit(); return true; } return false; }
  window.DemoPersonalPages = Object.freeze({routes: routes, render: render, handle: handle, act: handle, submit: submit, isBusy: function () { return pendingSubmission !== null; }, tick: tick, key: key, clock: Object.freeze({create: createClock, advance: advance,command: command, dayOf: dayOf}), reminders: Object.freeze({plan: reminderPlan, check: checkReminders, render: renderReminders}), validateFeedback: validateFeedback});
}());
