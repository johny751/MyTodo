import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';

const platforms = ['windows-c', 'javascript', 'android'];
const names = {'windows-c': 'C', javascript: 'JS', android: 'Android'};
const sources = [null, ...platforms];
const statuses = ['passed', 'failed', 'blocked', 'skipped', 'static-reviewed'];
const historicalSha = 'd02e416f6f353eb018a72446d4851722f2f956c6';
const historicalRun = 'https://github.com/johny751/MyTodo/actions/runs/45117818661';
const expectedCases = 78;

const {values: options} = parseArgs({options: {
  baseline: {type: 'string'}, desktop: {type: 'string'}, android: {type: 'string'},
  current: {type: 'string'}, format: {type: 'string', default: 'markdown'},
}});
if (!options.baseline || !options.current || !['markdown', 'json'].includes(options.format)) {
  throw new Error('Use --baseline FILE --current FILE [--desktop FILE] [--android FILE] [--format markdown|json]');
}

async function read(filename) {
  if (!filename) return null;
  const bytes = await readFile(filename);
  return {sha256: createHash('sha256').update(bytes).digest('hex'), summary: JSON.parse(bytes.toString('utf8'))};
}
const [historical, complete, desktop, android] = await Promise.all(
  [options.baseline, options.current, options.desktop, options.android].map(read),
);
const before = historical.summary;
const after = complete.summary;
if (before.schema !== 'mytodo-c003-matrix' || before.version !== 1 || before.sourceSha !== historicalSha
    || before.runUrl !== historicalRun || before.suiteCases !== expectedCases) {
  throw new Error('The baseline must be the original 78-case C0-03 run 45117818661 summary');
}
if (after.schema !== 'mytodo-c004-phase' || after.version !== 1 || after.phase !== 'complete'
    || after.suiteCases !== expectedCases || !/^[a-f0-9]{40}$/.test(after.sourceSha)
    || !/^[1-9][0-9]*$/.test(after.runId) || !/^[1-9][0-9]*$/.test(after.runAttempt)) {
  throw new Error('The current input must be the C0-04 complete phase from an actual GitHub attempt');
}
for (const [phase, evidence] of [['desktop', desktop], ['android', android]]) {
  if (!evidence) continue;
  const {summary} = evidence;
  if (summary.schema !== after.schema || summary.version !== after.version || summary.phase !== phase) {
    throw new Error(`Unexpected summary format for ${phase}`);
  }
  for (const field of ['sourceSha', 'runUrl', 'runId', 'runAttempt', 'suiteSemanticSha256']) {
    if (summary[field] !== after[field]) throw new Error(`${phase} receipt differs from complete phase in ${field}`);
  }
}

function index(items, keyFor, label) {
  const map = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (map.has(key) || !statuses.includes(item.status)) throw new Error(`Duplicate or invalid ${label} ${key}`);
    map.set(key, item);
  }
  return map;
}
const priorExecution = index(before.executions, item => item.id, 'historical execution');
const currentReference = index(after.allExecutions, item => item.id, 'current execution');
const currentExecution = index([
  ...(desktop?.summary.executions ?? []), ...(android?.summary.executions ?? []), ...after.executions,
], item => item.id, 'raw phase execution');
for (const [id, item] of currentExecution) {
  const reference = currentReference.get(id);
  for (const field of ['phase', 'status', 'processExitCode', 'executed', 'result', 'outputSha256']) {
    if (item[field] !== reference?.[field]) throw new Error(`Current ${id} has conflicting ${field} receipts`);
  }
}

const comparisonKey = (id, source, left, right) => [id, source ?? 'generate', ...[left, right].sort()].join('|');
const comparisonIndex = (rows, label) => index(rows, row => comparisonKey(row.caseId, row.source, row.left, row.right), label);
const historicalTargetBlocks = before.comparisons.filter(row => !row.left && !row.right);
for (const row of historicalTargetBlocks) {
  if (row.status !== 'blocked' || row.source !== 'android' || !platforms.includes(row.target)) {
    throw new Error(`Unexpected historical target-only entry ${row.caseId}`);
  }
}
const priorTargetBlock = index(historicalTargetBlocks,
  row => [row.caseId, 'receive', row.target, row.source].join('--'), 'historical target-only block');
const priorComparison = comparisonIndex(before.comparisons.filter(row => row.left || row.right), 'historical comparison');
const currentComparison = comparisonIndex(after.comparisons, 'current comparison');
const caseIds = [...new Set(before.executions.map(item => item.caseId))];
if (caseIds.length !== expectedCases) throw new Error('The 78 historical case identities are incomplete');
const knownCases = new Set(caseIds);
for (const item of [...after.comparisons, ...currentExecution.values()]) {
  if (!knownCases.has(item.caseId)) throw new Error(`Unexpected case in the complete phase ${item.caseId}`);
}
for (const item of currentReference.values()) {
  if (!knownCases.has(item.id.split('--')[0])) throw new Error(`Unexpected case in an execution receipt ${item.id}`);
}

const missing = {status: 'skipped', reason: '无对应执行或比较收据'};
const missingCurrent = after.status === 'blocked'
  ? {status: 'blocked', reason: after.error || '完整阶段被阻塞，缺少该位置的收据'} : missing;
const slotId = (id, platform, source) => [id, source ? 'receive' : 'generate', platform, source].filter(Boolean).join('--');
function executionView(receipt, fallback) {
  if (!receipt) return fallback;
  return {
    status: receipt.status, executed: receipt.executed ?? (receipt.processExitCode != null),
    processExitCode: receipt.processExitCode, result: receipt.result ?? receipt.output,
    resultSha256: receipt.outputSha256, phase: receipt.phase,
    reason: receipt.reason ?? receipt.verification?.checks.find(check => check.status === 'blocked')?.detail,
    failedChecks: receipt.verification?.checks.filter(check => check.status === 'failed').map(check => check.name),
  };
}
function comparisonView(row, fallback) {
  if (!row) return fallback;
  return {
    status: row.status, reason: row.reason, semanticEqual: row.semanticEqual,
    stageAcceptanceEqual: row.stageAcceptanceEqual, rawBatchClassification: row.rawBatchClassification,
    differencePaths: row.differences?.map(item => item.path),
    stageDifferencePaths: row.stageDifferences?.map(item => item.path),
    stageStateDifferences: row.stageStateDifferences,
  };
}
function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJson(value[key])]));
  }
  return value;
}
function priorBatchSerializationOnly(oldRow, newRow) {
  if (oldRow?.semanticEqual !== true || oldRow.stageAcceptanceEqual !== true
      || !oldRow.leftPendingBody || !oldRow.rightPendingBody || oldRow.leftPendingBody === oldRow.rightPendingBody
      || newRow?.rawBatchClassification !== 'same-batch-json-different-serialization' || newRow.eventsSame !== true) return false;
  try {
    const orderedJson = body => JSON.stringify(sortedJson(JSON.parse(body)));
    return orderedJson(oldRow.leftPendingBody) === orderedJson(oldRow.rightPendingBody);
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}
function classify(oldRow, newRow, currentStatus) {
  if (oldRow?.status !== 'failed') return null;
  if (currentStatus === 'blocked') return '阻塞，无法验证';
  if (currentStatus !== 'passed') return '仍未解决';
  return priorBatchSerializationOnly(oldRow, newRow) ? '规范允许的序列化差异' : '已修复';
}

const cases = caseIds.map(id => {
  const executions = sources.flatMap(source => platforms.map(platform => {
    const key = slotId(id, platform, source);
    const oldRow = priorExecution.get(key);
    const historicalBlock = priorTargetBlock.get(key);
    const newRow = currentExecution.get(key) ?? currentReference.get(key);
    const afterSlot = executionView(newRow, missingCurrent);
    return {platform, source, before: executionView(oldRow, historicalBlock
      ? {status: 'blocked', reason: historicalBlock.reason, executed: false, processExitCode: null, evidence: 'historical-target-only'}
      : missing), after: afterSlot,
      classification: classify(oldRow, newRow, afterSlot.status)};
  }));
  const comparisons = sources.flatMap(source => platforms.flatMap((left, i) => platforms.slice(i + 1).map(right => {
    const key = comparisonKey(id, source, left, right);
    const oldRow = priorComparison.get(key), newRow = currentComparison.get(key);
    const afterSlot = comparisonView(newRow, missingCurrent);
    return {left, right, source, before: comparisonView(oldRow, missing), after: afterSlot,
      classification: classify(oldRow, newRow, afterSlot.status)};
  })));
  const historicalFailures = [...executions, ...comparisons].filter(slot => slot.classification);
  return {id, category: priorExecution.get(slotId(id, 'windows-c', null)).category, executions, comparisons,
    historicalFailures: historicalFailures.map(slot => slot.classification)};
});

const allComparisons = cases.flatMap(item => item.comparisons);
const allExecutions = cases.flatMap(item => item.executions);
const count = slots => Object.fromEntries(statuses.map(status => [status, slots.filter(slot => slot.status === status).length]));
const cJs = allComparisons.filter(item => item.left === 'windows-c' && item.right === 'javascript' && item.source !== 'android');
const settled = [...allExecutions, ...allComparisons];
const accepted = after.status === 'passed' && after.exitCode === 0 && after.dependencies?.android?.status === 'passed'
  && settled.every(item => item.after.status === 'passed')
  && allExecutions.every(item => item.after.executed === true && item.after.processExitCode === 0 && /^[a-f0-9]{64}$/.test(item.after.resultSha256));
const run = evidence => {
  if (!evidence) return null;
  const {runUrl, runAttempt, sourceSha, suiteSha256, runner, status, exitCode} = evidence.summary;
  return {runUrl, runAttempt, sourceSha, suiteSha256, runner, status, exitCode, summarySha256: evidence.sha256};
};
const report = {
  schema: 'mytodo-c004-comparison-report', version: 1, accepted, caseCount: cases.length,
  baseline: run(historical), current: run(complete), phases: {desktop: run(desktop), android: run(android)},
  androidEnvironment: android?.summary.androidEnvironment ?? null,
  currentExecutions: count(allExecutions.map(item => item.after)),
  currentComparisons: count(allComparisons.map(item => item.after)),
  cJsComparisons: {before: count(cJs.map(item => item.before)), after: count(cJs.map(item => item.after))},
  historicalFailures: Object.fromEntries(['已修复', '规范允许的序列化差异', '仍未解决', '阻塞，无法验证']
    .map(label => [label, settled.filter(item => item.classification === label).length])),
  cases,
};

if (options.format === 'json') {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const lines = ['# C0-04 共同协议向量前后对比', '',
    `历史受测提交 \`${before.sourceSha}\`，进程退出码 \`${before.exitCode}\`。[C0-03 run](${before.runUrl})`, '',
    `当前受测提交 \`${after.sourceSha}\`，完整矩阵进程退出码 \`${after.exitCode ?? '未记录'}\`。[C0-04 run](${after.runUrl})`, '',
    `C0-03 三端共同向量矩阵 **${report.accepted ? '通过' : '未通过'}**。比较采用同一 GitHub 源码和运行批次的收据。`, '',
    `历史 C/JS 比较 ${JSON.stringify(report.cJsComparisons.before)}。当前同范围 ${JSON.stringify(report.cJsComparisons.after)}。`, '',
    `当前全部执行 ${JSON.stringify(report.currentExecutions)}。当前全部比较 ${JSON.stringify(report.currentComparisons)}。`, '',
    `历史失败位置 ${JSON.stringify(report.historicalFailures)}。每个向量可涉及多个执行和比较。`, '',
    '每个方向的状态顺序为 C、JS、Android。每格为历史状态 → 当前状态。skipped 表示对应位置缺少执行或比较收据。', '',
    '| 向量 | 生成 | C 样本接收 | JS 样本接收 | Android 样本接收 | 对应的历史失败状态 |',
    '| --- | --- | --- | --- | --- | --- |'];
  for (const item of cases) {
    const slots = sources.map(source => item.executions.filter(slot => slot.source === source)
      .map(slot => `${slot.before.status} → ${slot.after.status}`).join('<br>'));
    lines.push(`| \`${item.id}\` | ${slots.join(' | ')} | ${[...new Set(item.historicalFailures)].join('、') || '无'} |`);
  }
  lines.push('', '## 逐项比较', '',
    '比较顺序为 C/JS、C/Android、JS/Android。每格为历史状态 → 当前状态。', '',
    '| 向量 | 生成比较 | C 样本比较 | JS 样本比较 | Android 样本比较 |', '| --- | --- | --- | --- | --- |');
  for (const item of cases) {
    const slots = sources.map(source => item.comparisons.filter(slot => slot.source === source)
      .map(slot => `${slot.before.status} → ${slot.after.status}`).join('<br>'));
    lines.push(`| \`${item.id}\` | ${slots.join(' | ')} |`);
  }
  lines.push('', '## 历史失败位置', '',
    '| 向量 | 范围 | 历史状态 | 当前状态 | 结论 |', '| --- | --- | --- | --- | --- |');
  for (const item of cases) {
    for (const slot of [...item.executions, ...item.comparisons].filter(value => value.classification)) {
      const source = slot.source ? `${names[slot.source]} 样本` : '生成';
      const scope = slot.platform ? names[slot.platform] : `${names[slot.left]} / ${names[slot.right]}`;
      lines.push(`| \`${item.id}\` | ${source} · ${scope} | ${slot.before.status} | ${slot.after.status} | ${slot.classification} |`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}
