(function () {
  'use strict';
  const native = window.GxD405Native;
  if (!native || native.profile() !== 'd405-synthetic-native-services') return;
  const pending = new Map();
  let serial = 0, writing = false, writeAgain = false, lastSaved = '';
  function call(method, value) {
    return new Promise((resolve, reject) => {
      const id = 'd405-' + Date.now() + '-' + (++serial);
      const timeout = setTimeout(() => { pending.delete(id); reject(Error('原生操作尚未确认')); }, 15000);
      pending.set(id, {resolve, reject, timeout});
      if (value === undefined) native[method](id); else native[method](id, value);
    });
  }
  document.addEventListener('gx-d405-native', event => {
    const response = event.detail, request = pending.get(response?.id);
    if (!request) return;
    pending.delete(response.id); clearTimeout(request.timeout);
    if (response.error) request.reject(Error(response.error)); else request.resolve(response.value);
  });
  async function saveReminders() {
    if (writing) { writeAgain = true; return; }
    const text = JSON.stringify(window.D4Prototype.repo.getState());
    if (lastSaved === text) return;
    writing = true;
    try { await call('saveReminderState', text); lastSaved = text; document.documentElement.dataset.nativeReminders = 'saved'; }
    catch (error) {
      document.documentElement.dataset.nativeReminders = 'error'; console.error('原生提醒未保存', error.message);
      let warning = document.querySelector('[data-d405-reminder-error]');
      if (!warning) { warning = document.createElement('p'); warning.dataset.d405ReminderError = 'true'; warning.setAttribute('role', 'alert'); document.body.prepend(warning); }
      warning.textContent = '系统提醒尚未保存：' + error.message + '。当前页面修改仍保留，请重新打开应用后核对。';
    }
    finally { writing = false; if (writeAgain) { writeAgain = false; saveReminders(); } }
  }
  function renderControls() {
    const route = window.D4Prototype?.getRoute();
    if (!['feedback', 'pomodoro', 'settings'].includes(route) || document.querySelector('[data-d405-controls]')) return;
    const host = document.createElement('div'); host.className = 'panel panel-body'; host.dataset.d405Controls = 'true';
    if (route === 'feedback') {
      const button = document.createElement('button'); button.className = 'button primary'; button.textContent = '打开原生优化意见';
      button.dataset.d405Feedback = 'true'; button.onclick = () => native.openFeedback(); host.append(button);
      const note = document.createElement('p'); note.textContent = '原生意见独立保存在本应用；原有合成意见仍可在下方查看和导出。'; host.append(note);
    } else {
      const identity = JSON.parse(window.GxD4Preview.versionInfo());
      const version = document.createElement('p'); version.textContent = 'MyTodo D4-05 ' + identity.versionName + ' / versionCode ' + identity.versionCode + ' · by codex · ' + identity.sourceSha.slice(0, 5) + ' · APK 编译时间：' + identity.buildTimeUtc + ' (UTC)'; host.append(version);
      for (const [label, action] of [['开启系统通知', 'requestNotifications'], ['设置准时提醒权限', 'requestExactAlarms']]) {
        const button = document.createElement('button'); button.className = 'button'; button.textContent = label;
        button.onclick = () => native[action](); host.append(button);
      }
      const status = document.createElement('p'); status.textContent = '正在读取系统通知状态'; host.append(status);
      call('notificationStatus').then(value => { status.textContent = value.text; }).catch(error => { status.textContent = error.message; });
    }
    document.querySelector('main')?.prepend(host);
  }
  function ready() {
    if (!window.D4Prototype) { setTimeout(ready, 50); return; }
    window.D4Prototype.repo.subscribe(saveReminders); saveReminders(); renderControls();
    // render() replaces main. Observe the stable application root so controls return after same-route saves.
    new MutationObserver(renderControls).observe(document.querySelector('#app'), {childList: true, subtree: true});
    window.addEventListener('hashchange', renderControls);
    // Read-only diagnostic accessor. No selection/focus mutation occurs here.
    window.D405SelectionTrace = () => ({route: window.D4Prototype.getRoute(),
      activeTag: document.activeElement?.tagName, activeName: document.activeElement?.getAttribute('name'),
      selection: String(window.getSelection()), rangeCount: window.getSelection()?.rangeCount || 0});
  }
  ready();
}());
