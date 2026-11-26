import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const e = process.env;
if (e.GITHUB_ACTIONS !== 'true' || e.EXPECTED_SOURCE_SHA !== e.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim() !== e.GITHUB_SHA) throw Error('Exact Actions source required');
const [input, output] = process.argv.slice(2).map(x => path.resolve(x));
if (path.dirname(output) !== await fs.realpath(e.RUNNER_TEMP) || !path.basename(output).startsWith('d405-native-')) throw Error('Fresh RUNNER_TEMP/d405-native-* directory required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const html = await fs.readFile(input, 'utf8'), prior = JSON.parse(await fs.readFile(path.join(path.dirname(input), 'build-receipt.json'), 'utf8'));
if (prior.sourceSha !== e.GITHUB_SHA || prior.runId !== e.GITHUB_RUN_ID || prior.runAttempt !== e.GITHUB_RUN_ATTEMPT || prior.artifact.sha256 !== hash(html)) throw Error('Same run HTML receipt required');
const aar = 'android/libs/feedback-kit-1.2.0.aar', aarHash = hash(await fs.readFile(aar));
if (aarHash !== '4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade') throw Error('Pinned FeedbackKit mismatch');
await fs.mkdir(output); await fs.mkdir(path.join(output, 'assets')); await fs.mkdir(path.join(output, 'generated/local/gxtodo/d403preview'), {recursive: true});
const versionCode = 405000 + Number(e.GITHUB_RUN_NUMBER), versionName = '0.5.' + e.GITHUB_RUN_NUMBER;
if (!Number.isSafeInteger(versionCode) || versionCode <= 405000 || versionCode > 2147483647) throw Error('Invalid run identity');
const buildTimeUTC = new Date().toISOString();
const identity = {packageName: 'local.gxtodo.d405candidate', versionCode, versionName, sourceSHA: e.GITHUB_SHA, buildTimeUTC,
  runId: e.GITHUB_RUN_ID, runAttempt: e.GITHUB_RUN_ATTEMPT, syntheticOnly: true, stableSigning: false, productionSync: false,
  originalD403TestsUnchanged: true, feedbackAarSha256: aarHash, inputHtmlSha256: hash(html)};
const changes = ['正式前台服务接入统一计时会话、通知暂停继续与到时唤醒', '原生提醒和 FeedbackKit 1.2.0 接入独立合成应用空间',
  '修复云端生命周期验证的锁屏时序与解锁恢复，并记录失败时窗口和电源状态', '提醒验证数据通过现有任务仓库和真实原生桥接写入，并确认镜像一致及结束清理',
  '版本历史保留已知候选的真实编译时间、云端结果和未验收状态',
  '独立 D4-05 生命周期验证；稳定签名及覆盖升级待专门审批'];
const knownHistory = JSON.parse(await fs.readFile('android/d405/version-history.json', 'utf8'));
if (!Array.isArray(knownHistory)) throw Error('Known candidate history must be an array');
const historyKeys = new Set();
for (const entry of knownHistory) {
  const key = [entry.sourceSHA, entry.runId, entry.runAttempt].join('/');
  if (entry.packageName !== identity.packageName || !Number.isSafeInteger(entry.versionCode) || entry.versionCode >= versionCode ||
      typeof entry.versionName !== 'string' || !/^[a-f0-9]{40}$/.test(entry.sourceSHA) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.buildTimeUTC) || !Number.isFinite(Date.parse(entry.buildTimeUTC)) ||
      !/^[1-9]\d*$/.test(entry.runId) || !/^[1-9]\d*$/.test(entry.runAttempt) || historyKeys.has(key) ||
      !Array.isArray(entry.changes) || !entry.changes.every(change => typeof change === 'string') || typeof entry.statusText !== 'string' ||
      entry.stableSigning !== false || entry.syntheticOnly !== true || entry.released !== false || entry.accepted !== false) throw Error('Invalid known candidate history');
  historyKeys.add(key);
}
const history = [{...identity, changes, status: 'UNVERIFIED', statusText: '本次候选等待云端验证；未发布、未验收。',
  released: false, accepted: false}, ...knownHistory.sort((a, b) => b.versionCode - a.versionCode || b.buildTimeUTC.localeCompare(a.buildTimeUTC))];
const historyText = history.map(entry => entry.versionName + ' / versionCode ' + entry.versionCode + '\nby codex · ' + entry.sourceSHA.slice(0, 5) +
  '\nAPK 编译时间：' + entry.buildTimeUTC + ' (UTC)\n云端运行：' + entry.runId + ' / attempt ' + entry.runAttempt +
  '\n独立临时 CI 签名；跨运行覆盖未经批准。\n' + entry.statusText + '\n' + entry.changes.join('\n')).join('\n\n');
let bundle = html.replaceAll('MyTodo D4-03 Android 隔离体验 APK', 'MyTodo D4-05 Android 原生集成候选 APK');
if (!bundle.includes('</body>')) throw Error('HTML insertion anchor missing');
bundle = bundle.replace('</body>', '<script>\n' + await fs.readFile('android/d405/native-integration.js', 'utf8') + '\n</script>\n</body>');
const buildInfo = 'package local.gxtodo.d403preview;\npublic final class BuildInfo {\n' +
  Object.entries({VERSION_NAME: versionName, SOURCE_SHA: e.GITHUB_SHA, BUILD_TIME_UTC: buildTimeUTC, RUN_ID: e.GITHUB_RUN_ID,
    RUN_ATTEMPT: e.GITHUB_RUN_ATTEMPT, HTML_SHA256: hash(bundle), HISTORY_TEXT: historyText}).map(([k,v]) => 'public static final String '+k+'='+JSON.stringify(v)+';').join('\n') +
  '\npublic static final int VERSION_CODE=' + versionCode + ';\n}\n';
await fs.writeFile(path.join(output, 'generated/local/gxtodo/d403preview/BuildInfo.java'), buildInfo);
await fs.writeFile(path.join(output, 'assets/version-history.json'), JSON.stringify(history, null, 2)+'\n');
await fs.writeFile(path.join(output, 'assets/index.html'), bundle);
const copied = [];
for (const file of ['NativeTimerSession.java', 'NativeTimerStore.java', 'NativeTimerActivity.java']) {
  const source = 'prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/' + file;
  const original = await fs.readFile(source, 'utf8'); let value = original;
  if (file === 'NativeTimerStore.java') {
    const anchor = '                instance.persist();';
    if (value.split(anchor).length !== 2) throw Error('Timer store integration anchor changed');
    value = value.replace(anchor, anchor + '\n                if ("command".equals(op) && !"claim-completion".equals(command.optString("action")))\n                    local.gxtodo.replica.D405Integration.timerChanged(app, value);');
  }
  if (file === 'NativeTimerActivity.java') {
    const anchor = '            if (resumed && value.optBoolean("completionPending"))\n                send("claim-completion", new JSONObject(), false, null);';
    if (!value.includes(anchor)) throw Error('Foreground claim anchor changed');
    value = value.replace(anchor, '            // D4-05 native service owns completion delivery and its durable claim.');
    value = value.replace('未接入生产通知、任务数据库或同步。', '后台计时与系统通知已接入；任务数据仍是独立合成空间。');
  }
  await fs.writeFile(path.join(output, 'generated/local/gxtodo/d403preview', file), value);
  copied.push({source, sourceSha256: hash(original), generatedSha256: hash(value), transformed: value !== original});
}
let manifest = (await fs.readFile('android/d405/AndroidManifest.xml', 'utf8')).replace('__VERSION_CODE__', versionCode).replace('__VERSION_NAME__', versionName);
await fs.writeFile(path.join(output, 'AndroidManifest.xml'), manifest);
await fs.writeFile(path.join(output, 'd405-build-identity.json'), JSON.stringify({...identity, packagedHtmlSha256: hash(bundle), timerSources: copied}, null, 2)+'\n');
