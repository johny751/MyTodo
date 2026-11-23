import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

if (process.env.GITHUB_ACTIONS !== 'true' && process.env.CODESPACES !== 'true') {
  throw new Error('C0-03 Android execution is restricted to authorized GitHub cloud environments');
}
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const apk = option('--apk');
const inputPath = option('--input');
const output = option('--output');
const serial = option('--serial');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : '';
const packageName = 'local.gxtodo.protocolharness';
const instrumentation = packageName + '/local.gxtodo.replica.ProtocolHarnessInstrumentation';
const receipt = {schema: 'mytodo-c003-android-run', version: 1, status: 'failed', commands: [],
  sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runnerOs: process.env.RUNNER_OS,
  image: process.env.ImageOS, imageVersion: process.env.ImageVersion, startedAt: new Date().toISOString()};
if (!output) throw new Error('--output is required to retain failed/blocked evidence');
await fs.mkdir(path.dirname(path.resolve(output)), {recursive: true});
const logDir = output + '.logs';
await fs.mkdir(logDir, {recursive: true});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
async function command(label, argv, {input, allowFailure = false, timeout = 210000, binary = false} = {}) {
  const entry = {label, command: [adb, ...argv], startedAt: new Date().toISOString()};
  receipt.commands.push(entry);
  const result = await new Promise(resolve => {
    const child = spawn(adb, argv, {env: process.env, windowsHide: true});
    let stdout = '', stderr = '', timer;
    const chunks = [];
    timer = setTimeout(() => { entry.timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', bytes => { if (binary) chunks.push(Buffer.from(bytes)); else stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); resolve({code: null, stdout, stderr: stderr + String(error), signal: null}); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({code, signal, stdout, stderr,
      bytes: binary ? Buffer.concat(chunks) : undefined}); });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
  const log = path.join(logDir, String(receipt.commands.length).padStart(3, '0') + '-' + label + '.log');
  const logText = (binary && result.bytes ? `Binary stdout: ${result.bytes.length} bytes, SHA256 ${hash(result.bytes)}` : result.stdout)
    + '\n--- stderr ---\n' + result.stderr;
  await fs.writeFile(log, logText);
  Object.assign(entry, {exitCode: result.code, signal: result.signal, completedAt: new Date().toISOString(),
    log, logSha256: hash(Buffer.from(logText))});
  console.log(JSON.stringify({label, exitCode: result.code, timedOut: entry.timedOut || false, log}));
  if (result.code !== 0 && !allowFailure) {
    const error = new Error(`${label} adb exited ${result.code}; see ${log}`);
    error.exitCode = Number.isInteger(result.code) && result.code > 0 ? result.code : 1; throw error;
  }
  return result;
}
const selected = (...argv) => ['-s', serial, ...argv];
let exitCode = 1;
let result;
try {
  if (!serial || !/^emulator-[0-9]+$/.test(serial) || !sdk) {
    const error = new Error('A GitHub emulator serial (--serial emulator-NNNN) and preinstalled Android SDK are required; no local/physical device fallback');
    error.blocked = true; throw error;
  }
  try { await fs.access(adb); }
  catch { const error = new Error('GitHub runner lacks preinstalled adb: ' + adb); error.blocked = true; throw error; }
  receipt.adbVersion = (await command('adb-version', ['version'])).stdout.trim();
  receipt.devices = (await command('devices', ['devices', '-l'])).stdout;
  const state = await command('emulator-state', selected('get-state'), {allowFailure: true});
  if (state.code !== 0 || state.stdout.trim() !== 'device') {
    const error = new Error('Selected GitHub emulator is not connected/ready: ' + serial); error.blocked = true; throw error;
  }
  const qemu = (await command('emulator-qemu', selected('shell', 'getprop', 'ro.kernel.qemu'))).stdout.trim();
  const boot = (await command('emulator-boot', selected('shell', 'getprop', 'sys.boot_completed'))).stdout.trim();
  if (qemu !== '1' || boot !== '1') {
    const error = new Error(`Selected cloud device is not a fully booted Android emulator (qemu=${qemu},boot=${boot})`);
    error.blocked = true; throw error;
  }
  receipt.androidProperties = (await command('android-properties', selected('shell', 'getprop'))).stdout;
  receipt.webView = (await command('webview-provider', selected('shell', 'dumpsys', 'webviewupdate'))).stdout;
  if (!/Current WebView package[^\n]*\([^\n]+\)/.test(receipt.webView)) {
    const error = new Error('GitHub emulator has no ready real WebView provider; see webview-provider log');
    error.blocked = true; throw error;
  }
  if (!apk || !inputPath) throw new Error('--apk and --input are required');
  receipt.apkSha256 = hash(await fs.readFile(apk));
  const inputBytes = await fs.readFile(inputPath);
  if (inputBytes.length > 8 * 1024 * 1024) throw new Error('Case request exceeds bounded app-private input');
  const input = JSON.parse(inputBytes.toString('utf8'));
  receipt.caseId = input.caseId; receipt.mode = input.mode; receipt.inputSha256 = hash(inputBytes);
  const dbCase = option('--db-case', input.caseId);
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(dbCase) || ['.', '..'].includes(dbCase)) throw new Error('Invalid isolated --db-case');
  receipt.dbCase = dbCase;
  await command('install-test-apk', selected('install', '-r', apk));
  let fixturePort;
  if (input.fixtureUrl) {
    const url = new URL(input.fixtureUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Fixture server must be origin-only http://127.0.0.1:PORT');
    }
    fixturePort = url.port;
    await command('reverse-fixture', selected('reverse', 'tcp:' + fixturePort, 'tcp:' + fixturePort));
  }
  async function runCase(label, request) {
    await command(label + '-stop', selected('shell', 'am', 'force-stop', packageName));
    await command(label + '-request-directory', selected('shell', 'run-as', packageName, 'mkdir', '-p', 'files'));
    // tee receives JSON on stdin; no shell string contains case data or redirects.
    await command(label + '-write-request', selected('shell', '-T', 'run-as', packageName, 'tee', 'files/request.json'),
      {input: Buffer.from(JSON.stringify(request))});
    await command(label + '-clear-result', selected('shell', 'run-as', packageName, 'rm', '-f', 'files/result.json'));
    const instrument = await command(label + '-instrument', selected('shell', 'am', 'instrument', '-w', '-r',
      '-e', 'caseId', dbCase, '-e', 'requestName', 'request.json', '-e', 'resultName', 'result.json', instrumentation), {allowFailure: true});
    const codes = [...instrument.stdout.matchAll(/INSTRUMENTATION_CODE:\s*(-?\d+)/g)];
    const instrumentationCode = codes.length ? Number(codes.at(-1)[1]) : null;
    const read = await command(label + '-read-result', selected('shell', 'run-as', packageName, 'cat', 'files/result.json'), {allowFailure: true});
    let saved;
    try { saved = JSON.parse(read.stdout); }
    catch { throw new Error(`${label} produced no valid atomic JSON result; adb=${instrument.code}, instrumentation=${instrumentationCode}`); }
    const file = output + '.' + label + '.json';
    await fs.writeFile(file, JSON.stringify(saved, null, 2));
    receipt[label] = {adbExitCode: instrument.code, instrumentationCode, resultFile: file,
      resultSha256: hash(await fs.readFile(file)), status: saved.status};
    if (instrument.code !== 0 || instrumentationCode !== -1 || saved.status !== 'passed') {
      const error = new Error(`${label} failed: adb=${instrument.code}, instrumentation=${instrumentationCode}, status=${saved.status}; see ${file}`);
      error.saved = saved; throw error;
    }
    return saved;
  }
  result = await runCase('main', input);
  const restarted = await runCase('restart', {caseId: input.caseId, mode: 'report', provenance: input.provenance});
  const {normalizeAudit} = await import('../shared-executor.mjs');
  const before = normalizeAudit(result.reopened || result.raw);
  const after = normalizeAudit(restarted.raw);
  receipt.restartComparison = {status: equal(before, after) ? 'passed' : 'failed', compared: ['meta', 'rows', 'outbox'],
    processRestart: 'am force-stop followed by new instrumentation process', before, after};
  if (!equal(before, after)) throw new Error('Real Android process restart changed normalized persisted state');
  const database = await command('export-real-sqlite', selected('exec-out', 'run-as', packageName, 'cat',
    'files/protocol-cases/' + dbCase + '/tasks.sqlite'), {binary: true});
  if (!database.bytes || !database.bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
    throw new Error('Closed production database export lacks the SQLite file header');
  }
  await fs.writeFile(output + '.tasks.sqlite', database.bytes);
  receipt.sqliteExport = {path: output + '.tasks.sqlite', sha256: hash(database.bytes), bytes: database.bytes.length,
    state: 'all production connections closed by completed restart instrumentation'};
  result.processRestart = receipt.restartComparison;
  result.provenance = {...result.provenance, adbVersion: receipt.adbVersion, apkSha256: receipt.apkSha256};
  receipt.status = 'passed'; exitCode = 0;
  if (fixturePort) await command('remove-fixture-reverse', selected('reverse', '--remove', 'tcp:' + fixturePort));
} catch (error) {
  receipt.status = error.blocked ? 'blocked' : 'failed'; receipt.error = String(error.stack || error);
  exitCode = error.blocked ? 78 : error.exitCode || 1;
  result = error.saved || result || {schema: 'mytodo-protocol-harness-result', version: 1,
    platform: 'android', caseId: receipt.caseId, mode: receipt.mode, status: receipt.status, error: receipt.error};
  result.status = receipt.status; result.error = receipt.error;
} finally {
  receipt.completedAt = new Date().toISOString(); receipt.exitCode = exitCode;
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  receipt.outputSha256 = hash(await fs.readFile(output));
  await fs.writeFile(output + '.receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({status: receipt.status, exitCode, output, receipt: output + '.receipt.json'}));
  process.exitCode = exitCode;
}
