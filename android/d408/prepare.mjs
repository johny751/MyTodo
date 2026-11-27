import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const e = process.env;
if (e.GITHUB_ACTIONS !== 'true' || e.EXPECTED_SOURCE_SHA !== e.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim() !== e.GITHUB_SHA) throw Error('Exact Actions source required');
const [input, output] = process.argv.slice(2).map(x => path.resolve(x));
if (path.dirname(output) !== await fs.realpath(e.RUNNER_TEMP) || !path.basename(output).startsWith('d408-native-')) throw Error('Fresh RUNNER_TEMP/d408-native-* directory required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const html = await fs.readFile(input, 'utf8'), prior = JSON.parse(await fs.readFile(path.join(path.dirname(input), 'build-receipt.json'), 'utf8'));
if (prior.sourceSha !== e.GITHUB_SHA || prior.runId !== e.GITHUB_RUN_ID || prior.runAttempt !== e.GITHUB_RUN_ATTEMPT || prior.artifact.sha256 !== hash(html)) throw Error('Same run HTML receipt required');
const aar = 'android/libs/feedback-kit-1.2.0.aar', aarHash = hash(await fs.readFile(aar));
if (aarHash !== '4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade') throw Error('Pinned FeedbackKit mismatch');
await fs.mkdir(output); await fs.mkdir(path.join(output, 'assets')); await fs.mkdir(path.join(output, 'generated/local/gxtodo/d403preview'), {recursive: true});
const versionTracks = {
  'D4-08 UI and Android development validation': {versionTrack:'development',versionBase:408000,nameOffset:0},
  'D4-08 candidate and preserved regression': {versionTrack:'candidate',versionBase:418000,nameOffset:10000}
};
const track=versionTracks[e.GITHUB_WORKFLOW],runNumber=Number(e.GITHUB_RUN_NUMBER);
if(!track||!/^[1-9]\d*$/.test(e.GITHUB_RUN_NUMBER)||!Number.isSafeInteger(runNumber)||runNumber>9999||
  !/^[1-9]\d*$/.test(e.GITHUB_RUN_ID)||!/^[1-9]\d*$/.test(e.GITHUB_RUN_ATTEMPT))throw Error('Unknown workflow or exhausted version range');
const versionCode=track.versionBase+runNumber,versionName='0.8.'+(track.nameOffset+runNumber);
const buildTimeUTC = new Date().toISOString();
const identity = {packageName: 'local.gxtodo.d408candidate', versionCode, versionName, sourceSHA: e.GITHUB_SHA, buildTimeUTC,
  runId: e.GITHUB_RUN_ID, runAttempt: e.GITHUB_RUN_ATTEMPT, runNumber:e.GITHUB_RUN_NUMBER,workflowName:e.GITHUB_WORKFLOW,
  versionTrack:track.versionTrack,versionBase:track.versionBase,syntheticOnly: true, stableSigning: false, productionSync: false,
  originalD403TestsUnchanged: true, feedbackAarSha256: aarHash, inputHtmlSha256: hash(html)};
const changes = ['恢复完整原生番茄钟、任务选择、计时历史与每日统计', '原 FeedbackKit 完整工具和列表成为明确主流程，保留独立数据库、图片和恢复能力',
  '扩展应用内侧导航起始区并保留系统返回，继续使用唯一持久计时会话',
  'D408 独立包及启动后恢复适配；所有能力须由本轮云端验证，稳定签名及覆盖升级待单独审批'];
const knownHistory = JSON.parse(await fs.readFile('android/d408/version-history.json', 'utf8'));
if (!Array.isArray(knownHistory)) throw Error('Known candidate history must be an array');
const historyKeys = new Set();
for (const entry of knownHistory) {
  const key = [entry.sourceSHA, entry.runId, entry.runAttempt].join('/');
  const priorTrack=versionTracks[entry.workflowName],priorRun=Number(entry.runNumber);
  if (entry.packageName !== identity.packageName || !priorTrack || entry.versionTrack!==priorTrack.versionTrack || entry.versionBase!==priorTrack.versionBase ||
      !/^[1-9]\d*$/.test(entry.runNumber) || !Number.isSafeInteger(priorRun) || priorRun>9999 ||
      entry.versionCode!==priorTrack.versionBase+priorRun || entry.versionName!=='0.8.'+(priorTrack.nameOffset+priorRun) ||
      (entry.versionTrack===identity.versionTrack&&(priorRun>runNumber||(priorRun===runNumber&&(entry.runId!==identity.runId||Number(entry.runAttempt)>=Number(identity.runAttempt))))) ||
      typeof entry.versionName !== 'string' || !/^[a-f0-9]{40}$/.test(entry.sourceSHA) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.buildTimeUTC) || !Number.isFinite(Date.parse(entry.buildTimeUTC)) ||
      !/^[1-9]\d*$/.test(entry.runId) || !/^[1-9]\d*$/.test(entry.runAttempt) || historyKeys.has(key) ||
      !Array.isArray(entry.changes) || !entry.changes.every(change => typeof change === 'string') || typeof entry.statusText !== 'string' ||
      entry.stableSigning !== false || entry.syntheticOnly !== true || entry.released !== false || entry.accepted !== false ||
      !entry.provenance || !['archiveSha256','apkSha256','identitySha256','signerSha256'].every(field=>/^[a-f0-9]{64}$/.test(entry.provenance[field]||''))) throw Error('Invalid known candidate history');
  historyKeys.add(key);
}
const history = [{...identity, changes, status: 'UNVERIFIED', statusText: '本次候选等待云端验证；未发布、未验收。',
  released: false, accepted: false}, ...knownHistory.sort((a, b) => b.buildTimeUTC.localeCompare(a.buildTimeUTC)||b.versionCode-a.versionCode)];
const historyText = history.map(entry => entry.versionName + ' / versionCode ' + entry.versionCode + '\nby codex · ' + entry.sourceSHA.slice(0, 5) +
  '\nAPK 编译时间：' + entry.buildTimeUTC + ' (UTC)\n云端运行：' + entry.runId + ' / attempt ' + entry.runAttempt +
  '\n工作流：'+entry.workflowName+' / run number '+entry.runNumber+
  '\n独立临时 CI 签名；跨运行覆盖未经批准。\n' + entry.statusText + '\n' + entry.changes.join('\n')).join('\n\n');
let bundle = html.replaceAll('MyTodo D4-03 Android 隔离体验 APK', 'MyTodo D4-08 Android 原生集成候选 APK');
if (!bundle.includes('</body>')) throw Error('HTML insertion anchor missing');
bundle = bundle.replace('</body>', '<script>\n' + await fs.readFile('android/d408/native-integration.js', 'utf8') + '\n</script>\n</body>');
const buildInfo = 'package local.gxtodo.d403preview;\npublic final class BuildInfo {\n' +
  Object.entries({VERSION_NAME: versionName, SOURCE_SHA: e.GITHUB_SHA, BUILD_TIME_UTC: buildTimeUTC, RUN_ID: e.GITHUB_RUN_ID,
    RUN_ATTEMPT: e.GITHUB_RUN_ATTEMPT, HTML_SHA256: hash(bundle), HISTORY_TEXT: historyText}).map(([k,v]) => 'public static final String '+k+'='+JSON.stringify(v)+';').join('\n') +
  '\npublic static final int VERSION_CODE=' + versionCode + ';\n}\n';
await fs.writeFile(path.join(output, 'generated/local/gxtodo/d403preview/BuildInfo.java'), buildInfo);
await fs.writeFile(path.join(output, 'assets/version-history.json'), JSON.stringify(history, null, 2)+'\n');
await fs.writeFile(path.join(output, 'assets/index.html'), bundle);
const copied = [];
for (const file of ['NativeTimerSession.java', 'NativeTimerStore.java']) {
  const source = 'prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/' + file;
  const original = await fs.readFile(source, 'utf8'); let value = original;
  if (file === 'NativeTimerSession.java') {
    const anchor = 'private static final int VISIBLE_HISTORY_LIMIT = 10000;';
    if (!value.includes(anchor)) throw Error('History view bound anchor changed');
    value = value.replace(anchor, 'private static final int VISIBLE_HISTORY_LIMIT = Integer.MAX_VALUE;');
  }
  if (file === 'NativeTimerStore.java') {
    const anchor = '                instance.persist();';
    if (value.split(anchor).length !== 2) throw Error('Timer store integration anchor changed');
    value = value.replace(anchor, anchor + '\n                if ("command".equals(op) && !"claim-completion".equals(command.optString("action")))\n                    local.gxtodo.replica.D408Integration.timerChanged(app, value);');
  }
  await fs.writeFile(path.join(output, 'generated/local/gxtodo/d403preview', file), value);
  copied.push({source, sourceSha256: hash(original), generatedSha256: hash(value), transformed: value !== original});
}
// Candidate-only generated seam. The released source and old D405 profile stay byte-for-byte unchanged.
const seamSource = 'android/src/local/gxtodo/replica/NativeIntegration.java';
const seamOriginal = await fs.readFile(seamSource, 'utf8');
if (!seamOriginal.includes('local.gxtodo.d405candidate') || !seamOriginal.includes('D405Integration')) throw Error('Frozen integration seam anchor changed');
const seam = seamOriginal.replaceAll('d405', 'd408').replaceAll('D405', 'D408').replaceAll('D4-05','D4-08');
await fs.mkdir(path.join(output,'generated/local/gxtodo/replica'),{recursive:true});
await fs.writeFile(path.join(output,'generated/local/gxtodo/replica/NativeIntegration.java'),seam);
copied.push({source:seamSource,sourceSha256:hash(seamOriginal),generatedSha256:hash(seam),transformed:true});
let manifest = (await fs.readFile('android/d408/AndroidManifest.xml', 'utf8')).replace('__VERSION_CODE__', versionCode).replace('__VERSION_NAME__', versionName);
await fs.writeFile(path.join(output, 'AndroidManifest.xml'), manifest);
await fs.writeFile(path.join(output, 'd408-build-identity.json'), JSON.stringify({...identity, packagedHtmlSha256: hash(bundle), timerSources: copied}, null, 2)+'\n');
