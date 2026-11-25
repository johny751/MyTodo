(function () {
  'use strict';
  // The Android preview owns this session. A failed bridge never starts a Web clock.
  var bridge = window.GxD4Preview;
  if (!bridge) return;
  var protocol;
  try { protocol = typeof bridge.nativeTimerProtocol === 'function' ? bridge.nativeTimerProtocol() : -1; } catch (_) { protocol = -1; }
  var state = null, error = '', mutation = null, reading = null, serial = 0;
  var requests = new Map(), listeners = new Set();
  var client = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  function emit() { listeners.forEach(function (listener) { try { listener(); } catch (failure) { console.error('原生计时界面刷新失败', failure); } }); }
  function info() { return {provider: 'android-native', protocol: 1, ready: state !== null, busy: mutation !== null, error: error, state: state ? structuredClone(state) : null}; }
  function instant(value, empty) { return typeof value === 'string' && ((empty && value === '') || /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value); }
  function statistics(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(function (entry) {
      return /^-?\d+$/.test(entry[0]) && Number.isSafeInteger(entry[1]) && entry[1] >= 0;
    });
  }
  function history(value) {
    return Array.isArray(value) && value.length <= 10000 && value.every(function (item) {
      return item && typeof item.id === 'string' && item.id.length > 0 &&
        ['focus', 'break'].includes(item.phase) && ['countup', 'countdown'].includes(item.mode) &&
        ['ended', 'completed'].includes(item.outcome) && typeof item.taskId === 'string' &&
        instant(item.startedAt, false) && instant(item.finishedAt, false) &&
        Number.isSafeInteger(item.elapsedMillis) && item.elapsedMillis >= 0;
    });
  }
  function accept(value) {
    if (!value || value.provider !== 'android-native' || value.protocol !== 1 ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 ||
        !['idle', 'running', 'paused', 'ended', 'completed'].includes(value.status) ||
        !['focus', 'break'].includes(value.phase) || !['countup', 'countdown'].includes(value.mode) ||
        !['countup', 'countdown'].includes(value.focusMode) || typeof value.taskId !== 'string' ||
        !instant(value.startedAt, true) || typeof value.completionPending !== 'boolean' || typeof value.completionId !== 'string' ||
        !history(value.history) || !statistics(value.focusedMillisByDay) || !statistics(value.completedSessionsByDay) ||
        typeof value.sessionId !== 'string' || !Number.isFinite(value.elapsedMillis) || value.elapsedMillis < 0 ||
        !Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 180 ||
        !Number.isInteger(value.breakMinutes) || value.breakMinutes < 1 || value.breakMinutes > 180) {
      throw new Error('原生计时状态格式无效，请保留页面并重新读取');
    }
    // An older concurrent read must not overwrite an acknowledged command.
    if (!state || value.revision >= state.revision) state = structuredClone(value);
    error = '';
    return structuredClone(state);
  }
  function request(payload) {
    return new Promise(function (resolve, reject) {
      if (protocol !== 1) { reject(new Error('当前 Android 计时接口不可用')); return; }
      var id = client + '-' + (++serial);
      var timeout = window.setTimeout(function () {
        requests.delete(id);
        reject(new Error('原生计时操作尚未确认；请重新读取状态，不要重复开始'));
      }, 15000);
      requests.set(id, {resolve: resolve, reject: reject, timeout: timeout});
      try { bridge.timerCall(id, JSON.stringify(payload)); }
      catch (failure) { window.clearTimeout(timeout); requests.delete(id); reject(failure); }
    });
  }
  document.addEventListener('gx-d4-native-timer', function (event) {
    var response = event.detail, pending = response && requests.get(response.id);
    if (!pending) return;
    requests.delete(response.id); window.clearTimeout(pending.timeout);
    if (response.error) pending.reject(new Error(String(response.error)));
    else pending.resolve(response.value);
  });
  function refresh() {
    // Read after a pending command, so a stale elapsed snapshot cannot race it.
    if (mutation) return mutation.then(function () { return refresh(); }, function () { return refresh(); });
    if (reading) return reading;
    reading = request({op: 'snapshot'}).then(accept).catch(function (failure) {
      error = failure.message || String(failure); throw failure;
    }).finally(function () { reading = null; emit(); });
    return reading;
  }
  function command(action, values) {
    if (mutation) return Promise.reject(new Error('上一项计时操作尚未确认'));
    if (!state || error) return Promise.reject(new Error('请先成功读取原生计时状态'));
    var submitted = structuredClone(values || {}), commandId = client + '-command-' + (++serial);
    // Commands are never retried automatically with a new identity.
    mutation = (reading || Promise.resolve()).then(function () {
      if (!state || error) throw new Error('请先成功读取原生计时状态');
      return request({op: 'command', action: action, values: submitted, commandId: commandId, expectedRevision: state.revision});
    }).then(accept)
      .catch(function (failure) { error = failure.message || String(failure); throw failure; })
      .finally(function () { mutation = null; emit(); });
    emit();
    return mutation;
  }
  function refreshQuietly() { refresh().catch(function () {}); }
  document.addEventListener('gx-d4-native-timer-resume', refreshQuietly);
  window.addEventListener('focus', refreshQuietly);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshQuietly(); });
  window.D4NativeTimer = Object.freeze({info: info, refresh: refresh, command: command,
    subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; }});
}());
