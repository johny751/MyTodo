import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// This suite is source-only preparation locally. Its only authorized execution
// is against the exact candidate checkout on GitHub Actions.
const e = process.env;
if (e.GITHUB_ACTIONS !== 'true' || !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA || '') ||
    !/^\d+$/.test(e.GITHUB_RUN_ID || '') || !/^\d+$/.test(e.GITHUB_RUN_ATTEMPT || '') ||
    e.EXPECTED_SOURCE_SHA !== e.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim() !== e.GITHUB_SHA) {
  throw new Error('Native adapter contracts require the exact hosted Actions checkout');
}
const sourcePath = 'prototypes/d4-01/native-timer-adapter.js';
const source = readFileSync(sourcePath, 'utf8');
const personalSourcePath = 'prototypes/d4-01/personal-pages.js';
const personalSource = readFileSync(personalSourcePath, 'utf8');
console.log(JSON.stringify({kind: 'native-timer-adapter-contracts', sourceSha: e.GITHUB_SHA,
  runId: e.GITHUB_RUN_ID, runAttempt: e.GITHUB_RUN_ATTEMPT, platform: process.platform,
  file: sourcePath, sha256: createHash('sha256').update(source).digest('hex'),
  scope: 'mock bridge ordering and UI provider contract; not Android durability or real elapsed-time proof'}));

const copy = value => structuredClone(value);
const hostValue = value => JSON.parse(JSON.stringify(value));
function snapshot(overrides = {}) {
  return {provider: 'android-native', protocol: 1, revision: 1, sessionId: 'session-1',
    status: 'running', phase: 'focus', mode: 'countdown', focusMode: 'countdown',
    durationMinutes: 25, breakMinutes: 5, taskId: 'task-1', startedAt: '2026-11-25T07:00:00.000Z',
    elapsedMillis: 1200, remainingMillis: 1498800, completionPending: false, completionId: '',
    history: [], focusedMillisByDay: {'20782': 1200}, completedSessionsByDay: {}, ...copy(overrides)};
}
function target() {
  const callbacks = new Map();
  return {addEventListener(type, callback) {
    const list = callbacks.get(type) || []; list.push(callback); callbacks.set(type, list);
  }, dispatch(type, detail) { for (const callback of callbacks.get(type) || []) callback({type, detail}); }};
}
function harness({kind = 'normal'} = {}) {
  const calls = [], timers = new Map(), logs = [];
  let timerId = 0;
  const document = {...target(), hidden: false};
  const window = {...target(), setTimeout(callback, delay) { const id = ++timerId; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); }};
  if (kind !== 'absent') {
    window.GxD4Preview = {nativeTimerProtocol() {
      if (kind === 'throwing-protocol') throw new Error('capability-fault');
      return kind === 'unsupported' ? 2 : 1;
    }, timerCall(id, json) {
      if (kind === 'throwing-call') throw new Error('bridge-disconnected');
      calls.push({id, payload: JSON.parse(json)});
    }};
    if (kind === 'missing-protocol') delete window.GxD4Preview.nativeTimerProtocol;
    if (kind === 'missing-call') delete window.GxD4Preview.timerCall;
  }
  const context = vm.createContext({window, document, structuredClone, queueMicrotask,
    performance: {now: () => 0}, console: {error(...args) { logs.push(args); }}});
  vm.runInContext(source, context, {filename: sourcePath, timeout: 1000});
  function reply(index, value, error) {
    const request = calls[index]; assert.ok(request, 'reply must reference an observed outgoing call');
    document.dispatch('gx-d4-native-timer', {id: request.id, ...(error ? {error} : {value: copy(value)})});
  }
  function expire() {
    assert.ok(timers.size > 0, 'timeout injection must target an actual pending request');
    const pending = [...timers.values()]; timers.clear();
    for (const timer of pending) { assert.equal(timer.delay, 15000); timer.callback(); }
  }
  return {window, document, api: window.D4NativeTimer, calls, timers, logs, context, reply, expire};
}
async function turns() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function ready(h, value = snapshot()) { const promise = h.api.refresh(); h.reply(h.calls.length - 1, value); await promise; }
function rejected(promise) { return promise.then(() => null, error => error); }

test('ordinary Web has no native provider; incomplete Android capabilities fail closed', async () => {
  assert.equal(harness({kind: 'absent'}).api, undefined);
  for (const kind of ['missing-protocol', 'throwing-protocol', 'unsupported', 'missing-call', 'throwing-call']) {
    const h = harness({kind}); assert.ok(h.api, kind + ' must retain the Android provider');
    await assert.rejects(h.api.refresh());
    assert.equal(h.api.info().ready, false); assert.ok(h.api.info().error, kind);
    await assert.rejects(h.api.command('start'), /成功读取/);
    assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  }
});

test('coalesced reads, unrelated and duplicate replies preserve acknowledged state', async () => {
  const h = harness(), first = h.api.refresh(), second = h.api.refresh();
  assert.equal(first, second); assert.equal(h.calls.length, 1);
  h.document.dispatch('gx-d4-native-timer', {id: 'unrelated', value: snapshot({revision: 500})});
  await turns(); assert.equal(h.api.info().ready, false);
  h.reply(0, snapshot()); await first;
  h.reply(0, snapshot({revision: 900})); await turns();
  assert.equal(h.api.info().state.revision, 1); assert.equal(h.timers.size, 0);
  const leaked = h.api.info(); leaked.state.history.push({id: 'caller-mutation'}); leaked.state.revision = 99;
  assert.equal(h.api.info().state.revision, 1); assert.deepEqual(hostValue(h.api.info().state.history), []);
});

test('a command awaits a read, takes its new revision, clones values, and refresh awaits the command', async () => {
  const h = harness(); await ready(h, snapshot({revision: 7}));
  const read = h.api.refresh();
  const values = {mode: 'countdown', durationMinutes: 31, breakMinutes: 6, taskId: 'draft-task'};
  const command = h.api.command('configure', values), afterCommand = h.api.refresh();
  values.durationMinutes = 99; values.taskId = 'changed-after-submit';
  assert.notEqual(afterCommand, read, 'explicit refresh cannot return the pre-command read');
  assert.equal(h.api.info().busy, true); await turns(); assert.equal(h.calls.length, 2);
  h.reply(1, snapshot({revision: 8, status: 'completed', completionPending: true, completionId: 'session-1'}));
  await read; await turns();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].payload.expectedRevision, 8);
  assert.deepEqual(h.calls[2].payload.values, {mode: 'countdown', durationMinutes: 31, breakMinutes: 6, taskId: 'draft-task'});
  assert.equal(h.calls[2].payload.action, 'configure'); assert.match(h.calls[2].payload.commandId, /^web-.*-command-\d+$/);
  h.reply(2, snapshot({revision: 9, durationMinutes: 31})); await command; await turns();
  assert.equal(h.calls.length, 4); assert.deepEqual(h.calls[3].payload, {op: 'snapshot'});
  h.reply(3, snapshot({revision: 9, durationMinutes: 31, elapsedMillis: 1400})); await afterCommand;
  assert.equal(h.api.info().busy, false); assert.equal(h.api.info().state.elapsedMillis, 1400);
});

test('failed pending read blocks its queued command without sending any mutation', async () => {
  const h = harness(); await ready(h);
  const readFailure = rejected(h.api.refresh()), commandFailure = rejected(h.api.command('pause'));
  h.reply(1, null, 'timer-read-failed');
  assert.match(String(await readFailure), /timer-read-failed/); assert.match(String(await commandFailure), /timer-read-failed/);
  assert.equal(h.calls.length, 2); assert.equal(h.api.info().busy, false); assert.ok(h.api.info().error);
});

test('timeout blocks new mutations, ignores late command reply, and recovers only by snapshot', async () => {
  const h = harness(); await ready(h, snapshot({revision: 3}));
  const failure = rejected(h.api.command('pause')); await turns();
  const originalId = h.calls[1].payload.commandId; h.expire();
  assert.match(String(await failure), /尚未确认/); assert.equal(h.api.info().busy, false);
  await assert.rejects(h.api.command('start'), /成功读取/); assert.equal(h.calls.length, 2);
  const recovery = h.api.refresh(); assert.equal(h.calls.length, 3);
  h.reply(1, snapshot({revision: 4, status: 'paused'})); await turns();
  assert.equal(h.api.info().state.revision, 3); assert.ok(h.api.info().error, 'late response cannot clear uncertainty');
  h.reply(2, snapshot({revision: 4, status: 'paused'})); await recovery;
  assert.equal(h.api.info().state.status, 'paused'); assert.equal(h.api.info().error, '');
  assert.equal(h.calls.filter(call => call.payload.op === 'command').length, 1);
  assert.equal(h.calls[1].payload.commandId, originalId);
});

test('old timed-out read cannot overwrite a later confirmed revision', async () => {
  const h = harness(); await ready(h, snapshot({revision: 3}));
  const failure = rejected(h.api.refresh()); h.expire(); assert.ok(await failure);
  const fresh = h.api.refresh(); h.reply(2, snapshot({revision: 5, status: 'paused'})); await fresh;
  h.reply(1, snapshot({revision: 4})); await turns();
  assert.equal(h.api.info().state.revision, 5); assert.equal(h.api.info().state.status, 'paused');
});

test('native stale revision and queue errors require refresh, with no automatic retry', async () => {
  for (const error of ['stale-revision: expected 1, current 2; refresh required', 'timer-queue-full: command not accepted']) {
    const h = harness(); await ready(h);
    const failure = rejected(h.api.command('pause')); await turns(); h.reply(1, null, error);
    assert.match(String(await failure), /stale-revision|timer-queue-full/);
    await assert.rejects(h.api.command('resume'), /成功读取/); assert.equal(h.calls.length, 2);
    const read = h.api.refresh(); h.reply(2, snapshot({revision: 2, status: 'paused'})); await read;
    assert.equal(h.api.info().error, ''); assert.equal(h.calls.length, 3);
  }
});

test('one pending mutation prevents a second command and preserves its original identity', async () => {
  const h = harness(); await ready(h);
  const pause = h.api.command('pause'); await turns();
  const id = h.calls[1].payload.commandId;
  await assert.rejects(h.api.command('pause'), /上一项/); assert.equal(h.calls.length, 2);
  h.reply(1, snapshot({revision: 2, status: 'paused'})); await pause;
  const resume = h.api.command('resume'); await turns();
  assert.notEqual(h.calls[2].payload.commandId, id); assert.equal(h.calls[2].payload.expectedRevision, 2);
  h.reply(2, snapshot({revision: 3, status: 'running'})); await resume;
});

test('invalid native snapshots retain last confirmed state and reject another command', async () => {
  const invalid = [
    {provider: 'web'}, {protocol: 2}, {revision: -1}, {status: 'unknown'}, {focusMode: null},
    {taskId: 12}, {startedAt: '2026-02-31T00:00:00.000Z'}, {completionPending: 1}, {completionId: null},
    {history: [null]}, {history: [{id: 'bad'}]}, {focusedMillisByDay: []},
    {focusedMillisByDay: {'not-a-day': 1}}, {completedSessionsByDay: {'20782': -1}},
    {completedSessionsByDay: {'20782': 1.5}}, {elapsedMillis: -1}, {durationMinutes: 181}, {breakMinutes: 0},
  ];
  for (const patch of invalid) {
    const h = harness(); await ready(h);
    const failure = rejected(h.api.refresh()); h.reply(1, snapshot({revision: 2, ...patch}));
    assert.match(String(await failure), /格式无效/, JSON.stringify(patch));
    assert.equal(h.api.info().state.revision, 1); assert.ok(h.api.info().error);
    await assert.rejects(h.api.command('start'), /成功读取/); assert.equal(h.calls.length, 2);
  }
});

test('lower revision cannot roll back the cache and equal revision may advance elapsed', async () => {
  const h = harness(); await ready(h, snapshot({revision: 6, elapsedMillis: 5000}));
  const old = h.api.refresh(); h.reply(1, snapshot({revision: 5, elapsedMillis: 1})); await old;
  assert.equal(h.api.info().state.revision, 6); assert.equal(h.api.info().state.elapsedMillis, 5000);
  const equal = h.api.refresh(); h.reply(2, snapshot({revision: 6, elapsedMillis: 6000})); await equal;
  assert.equal(h.api.info().state.elapsedMillis, 6000);
});

test('render subscriber failures do not turn confirmed persistence into a command error', async () => {
  const h = harness(); let notified = 0;
  h.api.subscribe(() => { throw new Error('render-fault'); });
  const unsubscribe = h.api.subscribe(() => { notified++; });
  await ready(h); assert.equal(notified, 1); assert.equal(h.logs.length, 1);
  const pause = h.api.command('pause'); await turns(); h.reply(1, snapshot({revision: 2, status: 'paused'})); await pause;
  assert.equal(h.api.info().error, ''); assert.equal(h.api.info().state.status, 'paused'); assert.equal(notified, 3);
  unsubscribe(); const read = h.api.refresh(); h.reply(2, snapshot({revision: 2, status: 'paused'})); await read;
  assert.equal(notified, 3);
});

test('focus, resume and visible refreshes only read snapshots and never claim completion', async () => {
  const h = harness(); await ready(h, snapshot({status: 'completed', completionPending: true, completionId: 'session-1'}));
  h.document.hidden = true; h.document.dispatch('visibilitychange'); await turns(); assert.equal(h.calls.length, 1);
  h.document.hidden = false;
  h.window.dispatch('focus'); h.document.dispatch('visibilitychange'); h.document.dispatch('gx-d4-native-timer-resume');
  await turns(); assert.equal(h.calls.length, 2, 'lifecycle read events coalesce');
  assert.deepEqual(h.calls[1].payload, {op: 'snapshot'});
  h.reply(1, snapshot({status: 'completed', completionPending: true, completionId: 'session-1'})); await turns();
  assert.equal(h.api.info().state.completionPending, true);
  assert.equal(h.calls.filter(call => call.payload.action === 'claim-completion').length, 0);
});

test('personal page snapshot preserves an unsaved dirty form and does not consume completion', async () => {
  const h = harness(); await ready(h);
  // Deliberately small DOM doubles exercise the real personal-page subscriber.
  // This proves dirty-form/provider contracts, not browser layout or touch behavior.
  const fields = {mode: {value: 'countup'}, durationMinutes: {value: '47'}, breakMinutes: {value: '9'}, taskId: {value: 'unsaved-task'}};
  const submitted = {disabled: false};
  const form = {dataset: {dirty: 'true'}, isConnected: true,
    elements: {namedItem: name => fields[name]}, querySelector: selector => selector === '[type="submit"]' ? submitted : null};
  const display = {textContent: ''}, panel = {dataset: {}}, notice = {outerHTML: ''};
  const panels = {innerHTML: '', nativeSignature: undefined,
    querySelector(selector) { return selector === '#personal-timer-display' ? display : selector === '#personal-timer' ? panel : null; },
    querySelectorAll() { return []; }};
  const host = {nativeNotice: '', querySelector(selector) { return selector === '#personal-native-panels' ? panels : selector === '#personal-native-state' ? notice : null; }};
  h.document.querySelector = selector => selector === '#personal-timer-content' ? host : selector === '[data-form="personal-timer-config"]' ? form : null;
  h.window.DemoDomain = {helpers: {flattenTasks: tasks => tasks}};
  const ctx = {getState: () => ({tasks: []}), repo: {demo: {personal: {}}, reminderAt: () => NaN},
    esc: value => String(value), toast: () => {}};
  vm.runInContext(personalSource, h.context, {filename: personalSourcePath, timeout: 1000});
  const before = JSON.stringify(fields);
  assert.equal(h.window.DemoPersonalPages.tick(ctx), false);
  assert.deepEqual(h.calls[1].payload, {op: 'snapshot'});
  h.reply(1, snapshot({revision: 2, status: 'completed', elapsedMillis: 1500000,
    completionPending: true, completionId: 'session-1'})); await turns();
  assert.equal(JSON.stringify(fields), before); assert.equal(form.dataset.dirty, 'true');
  assert.equal(h.api.info().state.completionPending, true);
  assert.equal(h.calls.filter(call => call.payload.op === 'command').length, 0);
  assert.equal(panel.dataset.revision, '2'); assert.equal(display.textContent, '00:00');
  assert.equal(h.logs.length, 0, 'a mock DOM omission must not silently hide subscriber failure');
});
