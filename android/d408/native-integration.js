(function () {
  'use strict';
  const native = window.GxD408Native;
  if (!native || native.profile() !== 'd408-synthetic-native-services') return;
  const pending = new Map();
  let serial = 0, writing = false, writeAgain = false, lastSaved = '';
  function call(method, value) {
    return new Promise((resolve, reject) => {
      const id = 'd408-' + Date.now() + '-' + (++serial);
      const timeout = setTimeout(() => { pending.delete(id); reject(Error('原生操作尚未确认')); }, 15000);
      pending.set(id, {resolve, reject, timeout});
      if (value === undefined) native[method](id); else native[method](id, value);
    });
  }
  document.addEventListener('gx-d408-native', event => {
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
      let warning = document.querySelector('[data-d408-reminder-error]');
      if (!warning) { warning = document.createElement('p'); warning.dataset.d408ReminderError = 'true'; warning.setAttribute('role', 'alert'); document.body.prepend(warning); }
      warning.textContent = '系统提醒尚未保存：' + error.message + '。当前页面修改仍保留，请重新打开应用后核对。';
    }
    finally { writing = false; if (writeAgain) { writeAgain = false; saveReminders(); } }
  }
  function renderControls() {
    const route = window.D4Prototype?.getRoute();
    if (!['feedback', 'pomodoro', 'settings'].includes(route) || document.querySelector('[data-d408-controls]')) return;
    const host = document.createElement('div'); host.className = 'panel panel-body'; host.dataset.d408Controls = 'true';
    if (route === 'feedback') {
      const title = document.createElement('h1'); title.textContent = '优化意见'; host.append(title);
      const description = document.createElement('p'); description.textContent = '记录、分类、预览截图、恢复草稿并整理历史意见。原有 FeedbackKit 数据和图片继续独立保存在本候选中。'; host.append(description);
      const button = document.createElement('button'); button.className = 'button primary'; button.textContent = '打开原生优化意见';
      button.dataset.d408Feedback = 'true'; button.onclick = () => native.openFeedback(); host.append(button);
      const tools = document.createElement('p'); tools.textContent = '包括意见列表、分类与处理状态、图片预览、草稿、批量删除与撤销，以及完整备份和恢复。意见保存到本机，不会自动上传。'; host.append(tools);
      const note = document.createElement('p'); note.textContent = '原有网页合成意见属于另一个隔离数据域，仍可继续查看、编辑和导出。'; host.append(note);
      const legacy = document.createElement('button'); legacy.className='button';legacy.textContent='显示网页合成意见';legacy.dataset.d408LegacyFeedback='true';legacy.setAttribute('aria-expanded','false');
      legacy.onclick=()=>{const main=document.querySelector('main'),shown=legacy.getAttribute('aria-expanded')==='true';legacy.setAttribute('aria-expanded',String(!shown));legacy.textContent=shown?'显示网页合成意见':'收起网页合成意见';for(const child of main.children)if(child!==host&&!child.classList.contains('footer-meta'))child.hidden=shown;};host.append(legacy);
    } else {
      const identity = JSON.parse(window.GxD4Preview.versionInfo());
      const version = document.createElement('p'); version.textContent = 'MyTodo D4-08 ' + identity.versionName + ' / versionCode ' + identity.versionCode + ' · by codex · ' + identity.sourceSha.slice(0, 5) + ' · APK 编译时间：' + identity.buildTimeUtc + ' (UTC)'; host.append(version);
      for (const [label, action] of [['开启系统通知', 'requestNotifications'], ['设置准时提醒权限', 'requestExactAlarms']]) {
        const button = document.createElement('button'); button.className = 'button'; button.textContent = label;
        button.onclick = () => native[action](); host.append(button);
      }
      const status = document.createElement('p'); status.textContent = '正在读取系统通知状态'; host.append(status);
      call('notificationStatus').then(value => { status.textContent = value.text; }).catch(error => { status.textContent = error.message; });
    }
    const main=document.querySelector('main');main?.prepend(host);
    if(route==='feedback'&&main)for(const child of main.children)if(child!==host&&!child.classList.contains('footer-meta'))child.hidden=true;
  }
  function ready() {
    if (!window.D4Prototype) { setTimeout(ready, 50); return; }
    window.D4Prototype.repo.subscribe(saveReminders); saveReminders(); renderControls();
    // render() replaces main. Observe the stable application root so controls return after same-route saves.
    new MutationObserver(renderControls).observe(document.querySelector('#app'), {childList: true, subtree: true});
    window.addEventListener('hashchange', renderControls);
    // Read-only diagnostic accessor. No selection/focus mutation occurs here.
    window.D408SelectionTrace = () => ({route: window.D4Prototype.getRoute(),
      activeTag: document.activeElement?.tagName, activeName: document.activeElement?.getAttribute('name'),
      selection: String(window.getSelection()), rangeCount: window.getSelection()?.rangeCount || 0});
  }
  ready();
}());
