import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {captureRemoteFile} from './remote-file-evidence.mjs';

if (process.env.GITHUB_ACTIONS !== 'true' && process.env.CODESPACES !== 'true') {
  throw new Error('C0-03 Android execution is restricted to authorized GitHub cloud environments');
}
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const apk = option('--apk');
const inputPath = option('--input');
const output = option('--output');
const serial = option('--serial');
const prepareOnly = args.includes('--prepare');
const preparedFile = option('--prepared');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : '';
const packageName = 'local.gxtodo.protocolharness';
const instrumentation = packageName + '/local.gxtodo.replica.ProtocolHarnessInstrumentation';
const receipt = {schema: 'mytodo-c003-android-run', version: 1, status: 'failed', commands: [],
  sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  serial, runnerOs: process.env.RUNNER_OS, node: process.version, verifierSqlite: process.versions.sqlite,
  image: process.env.ImageOS, imageVersion: process.env.ImageVersion, startedAt: new Date().toISOString()};
if (!output) throw new Error('--output is required to retain failed/blocked evidence');
await fs.mkdir(path.dirname(path.resolve(output)), {recursive: true});
const logDir = output + '.logs';
await fs.mkdir(logDir, {recursive: true});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
function persistedFields(audit) {
  return {meta: audit.meta, rows: audit.rows, outbox: audit.outbox};
}
function readExport(filename) {
  const database = new DatabaseSync(filename, {readOnly: true});
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('Exported Android SQLite failed integrity_check: ' + JSON.stringify(integrity));
    }
    const meta = JSON.parse(database.prepare('SELECT value FROM meta WHERE id=1').get().value);
    const rows = database.prepare('SELECT key,kind,id,data,record,deleted,conflicts FROM entities ORDER BY key').all()
      .map(row => ({...row, data:JSON.parse(row.data), record:JSON.parse(row.record), deleted:!!row.deleted, conflicts:JSON.parse(row.conflicts)}));
    const outbox = database.prepare('SELECT id,event FROM outbox ORDER BY id').all().map(item => ({id:item.id,event:JSON.parse(item.event)}));
    return {meta,rows,outbox,integrity};
  } finally { database.close(); }
}
async function command(label, argv, {input, allowFailure = false, timeout = 210000, binary = false} = {}) {
  const entry = {label, command: [adb, ...argv], startedAt: new Date().toISOString()};
  receipt.commands.push(entry);
  const result = await new Promise(resolve => {
    const child = spawn(adb, argv, {env: process.env, windowsHide: true});
    let stdout = '', stderr = '', timer;
    const chunks = [];
    if (!binary) child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    timer = setTimeout(() => { entry.timedOut = true; child.kill('SIGTERM'); }, timeout);
    child.stdout.on('data', bytes => { if (binary) chunks.push(Buffer.from(bytes)); else stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); resolve({code: null, stdout, stderr: stderr + String(error), signal: null}); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({code, signal, stdout, stderr,
      bytes: binary ? Buffer.concat(chunks) : undefined}); });
    child.stdin.on('error', error => { stderr += '\nStdin error: ' + error.message; });
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
async function prepare() {
  try { await fs.access(adb); }
  catch { const error = new Error('GitHub runner lacks preinstalled adb: ' + adb); error.blocked = true; throw error; }
  receipt.adbVersion = (await command('adb-version', ['version'])).stdout.trim();
  receipt.devices = (await command('devices', ['devices', '-l'])).stdout;
  const state = await command('emulator-state', selected('get-state'), {allowFailure: true});
  if (state.code !== 0 || state.stdout.trim() !== 'device') {
    const error = new Error('Selected GitHub emulator is not connected/ready: ' + serial); error.blocked = true; throw error;
  }
  const qemu = (await command('emulator-qemu', selected('shell', 'getprop', 'ro.kernel.qemu'))).stdout.trim();
  const bootQemu = (await command('emulator-boot-qemu', selected('shell', 'getprop', 'ro.boot.qemu'))).stdout.trim();
  const boot = (await command('emulator-boot', selected('shell', 'getprop', 'sys.boot_completed'))).stdout.trim();
  if ((qemu !== '1' && bootQemu !== '1') || boot !== '1') {
    const error = new Error(`Selected cloud device is not a fully booted Android emulator (qemu=${qemu},bootQemu=${bootQemu},boot=${boot})`);
    error.blocked = true; throw error;
  }
  receipt.androidProperties = (await command('android-properties', selected('shell', 'getprop'))).stdout;
  receipt.webView = (await command('webview-provider', selected('shell', 'dumpsys', 'webviewupdate'))).stdout;
  if (!/Current WebView package[^\n]*\([^\n]+\)/.test(receipt.webView)) {
    const error = new Error('GitHub emulator has no ready real WebView provider; see webview-provider log');
    error.blocked = true; throw error;
  }
  receipt.api = (await command('android-api', selected('shell','getprop','ro.build.version.sdk'))).stdout.trim();
  receipt.abi = (await command('android-abi', selected('shell','getprop','ro.product.cpu.abi'))).stdout.trim();
  receipt.fingerprint = (await command('android-image-fingerprint', selected('shell','getprop','ro.build.fingerprint'))).stdout.trim();
  const installed = await command('install-test-apk', selected('install', '-r', apk));
  if (!/^Success$/m.test(installed.stdout.replaceAll('\r',''))) throw new Error('adb install did not report success');
  receipt.installedPackage = (await command('verify-installed-apk', selected('shell','pm','path',packageName))).stdout.trim();
  if (!receipt.installedPackage.startsWith('package:')) throw new Error('adb install did not leave the isolated test package installed');
}

let exitCode = 1;
let result;
let fixturePort;
try {
  if (!serial || !/^emulator-[0-9]+$/.test(serial) || !sdk) {
    const error = new Error('A GitHub emulator serial (--serial emulator-NNNN) and an Android SDK are required');
    error.blocked = true; throw error;
  }
  if (!apk) throw new Error('--apk is required');
  receipt.apkSha256 = hash(await fs.readFile(apk));
  if (prepareOnly && preparedFile) throw new Error('Select either --prepare or --prepared');
  if (preparedFile) {
    const bytes = await fs.readFile(preparedFile);
    const prior = JSON.parse(bytes.toString('utf8'));
    for (const field of ['sourceSha','runId','runAttempt','serial','apkSha256']) {
      if (!receipt[field] || receipt[field] !== prior[field]) throw new Error('Android prepare receipt identity differs: ' + field);
    }
    if (prior.status !== 'passed' || prior.exitCode !== 0 || !prior.installedPackage?.startsWith('package:')) {
      throw new Error('No successful installation recorded for this run and emulator');
    }
    receipt.preparedSha256 = hash(bytes);
    for (const field of ['adbVersion','webView','api','abi','fingerprint','installedPackage']) receipt[field] = prior[field];
  } else {
    await prepare();
  }
  if (prepareOnly) {
    result = {...receipt, status:'passed'};
    receipt.status = 'passed';
    exitCode = 0;
  } else {
    if (!inputPath) throw new Error('--input is required for an Android case');
    const inputBytes = await fs.readFile(inputPath);
    if (inputBytes.length > 8 * 1024 * 1024) throw new Error('Case request exceeds bounded app-private input');
    const input = JSON.parse(inputBytes.toString('utf8'));
    receipt.caseId = input.caseId; receipt.mode = input.mode; receipt.inputSha256 = hash(inputBytes);
    const baseCase = option('--db-case', input.caseId);
    let dbCase = baseCase;
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(dbCase) || ['.', '..'].includes(dbCase)) throw new Error('Invalid isolated --db-case');
    receipt.dbCase = dbCase;
    receipt.crashedAttempts = [];
    receipt.failureEvidence = [];
    if (input.fixtureUrl) {
      const url = new URL(input.fixtureUrl);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Fixture server must be origin-only http://127.0.0.1:PORT');
      }
      fixturePort = url.port;
      await command('reverse-fixture', selected('reverse', 'tcp:' + fixturePort, 'tcp:' + fixturePort));
    }
    async function preserveFailedAttempt(prefix, label, attempt, failedDbCase) {
      // Diagnostic capture only. Never open, recover, truncate or overwrite the failed database.
      // These files stay inside this case's GitHub artifact, before a main retry changes dbCase.
      const directory = output + '.failures/' + prefix;
      const evidence = {schema:'mytodo-android-failed-attempt',version:2,
        sourceSha:receipt.sourceSha,runId:receipt.runId,runAttempt:receipt.runAttempt,
        stage:label,attempt,dbCase:failedDbCase,startedAt:new Date().toISOString(),
        observations:[],files:[],errors:[],originalDatabaseReplayed:false,originalDatabasePreserved:false,allObservedFilesVerified:false,
        snapshotSemantics:'Raw files after diagnostic force-stop; no claim of crash-time transaction state'};
      const reference = {stage:label,attempt,dbCase:failedDbCase,directory,status:'incomplete'};
      receipt.failureEvidence.push(reference);
      async function observe(suffix, argv, options = {}) {
        const index = receipt.commands.length;
        try {
          const result = await command(prefix + '-evidence-' + suffix, argv,
            {allowFailure:true,timeout:10000,...options});
          const entry = receipt.commands[index];
          evidence.observations.push({label:suffix,exitCode:result.code,signal:result.signal,
            timedOut:entry?.timedOut || false,log:entry?.log,logSha256:entry?.logSha256});
          return {...result,timedOut:entry?.timedOut || false,log:entry?.log,logSha256:entry?.logSha256};
        } catch (error) {
          // A diagnostic failure must not replace the original instrumentation failure.
          evidence.errors.push({label:suffix,error:String(error)});
          return null;
        }
      }
      try {
        await fs.mkdir(directory,{recursive:true});
        // Capture exit history before our force-stop adds another intentional exit reason.
        // Unsupported shell commands retain their actual exit/log; no reason is fabricated.
        await observe('exit-info',selected('shell','dumpsys','activity','exit-info',packageName));
        await observe('processes',selected('shell','dumpsys','activity','processes',packageName));
        await observe('logcat',selected('logcat','-b','main','-b','system','-b','events','-b','crash',
          '-v','threadtime','-d','-t','2000'));
        await observe('uptime',selected('shell','cat','/proc/uptime'));
        await observe('meminfo',selected('shell','dumpsys','meminfo',packageName));
        await observe('stop',selected('shell','am','force-stop',packageName));
        let stopped = false;
        for (let poll = 1; poll <= 8; poll++) {
          const state = await observe('process-check-' + poll,selected('shell','pidof',packageName),{timeout:5000});
          if (state?.code === 1 && !state.signal && !state.timedOut && !state.stdout.trim() && !state.stderr.trim()) { stopped = true; break; }
          await sleep(250);
        }
        evidence.mainProcessObservedStopped = stopped;
        if (stopped) {
          const failedDirectory = 'files/protocol-cases/' + failedDbCase + '/';
          const candidates = [
            ...['tasks.sqlite','tasks.sqlite-wal','tasks.sqlite-shm','tasks.sqlite-journal']
              .map(name => ({remote:failedDirectory + name,name})),
            ...['result.json','result.json.bak','result.json.new']
              .map(name => ({remote:'files/' + name,name:'atomic-' + name})),
          ];
          for (const file of candidates) {
            // exec-out may exit 0 while cat errors are returned as stdout. Never use
            // its status alone as evidence that a remote file was copied.
            evidence.files.push(await captureRemoteFile({packageName,...file,directory,observe,selected,
              sqlite:file.name === 'tasks.sqlite'}));
          }
          evidence.originalDatabasePreserved = evidence.files.some(file => file.remote === failedDirectory + 'tasks.sqlite' && file.state === 'preserved');
          evidence.allObservedFilesVerified = evidence.files.every(file => file.state === 'preserved' ||
            (file.before?.valid && file.before.state === 'unavailable' && file.before.reason === 'missing'));
        } else {
          evidence.errors.push({label:'raw-files',error:'Main process exit was not observed; no live-file copy attempted'});
        }
      } catch (error) {
        evidence.errors.push({label:'capture',error:String(error)});
      } finally {
        evidence.completedAt = new Date().toISOString();
        const file = path.join(directory,'evidence.json');
        try {
          await fs.writeFile(file,JSON.stringify(evidence,null,2),{flag:'wx'});
          Object.assign(reference,{status:evidence.errors.length || !evidence.originalDatabasePreserved || !evidence.allObservedFilesVerified ? 'partial':'recorded',
            originalDatabasePreserved:evidence.originalDatabasePreserved === true,
            file,sha256:hash(await fs.readFile(file))});
        } catch (error) {
          reference.error = String(error);
        }
      }
      return reference;
    }
    async function runCase(label, request, attempt) {
      const prefix = attempt === 1 ? label : label + '-retry-' + attempt;
      await command(prefix + '-stop', selected('shell', 'am', 'force-stop', packageName));
      // am force-stop can return while the last instrumentation process is still being reaped.
      let reaped = false;
      for (let poll = 1; poll <= 8; poll++) {
        const state = await command(prefix + '-process-check-' + poll,
          selected('shell', 'pidof', packageName), {allowFailure:true,timeout:5000});
        if (state.code === 1 && !state.stdout.trim()) { reaped = true; break; }
        await sleep(250);
      }
      if (!reaped) throw new Error(prefix + ' did not observe the old application process exit');
      await command(prefix + '-request-directory', selected('shell', 'run-as', packageName, 'mkdir', '-p', 'files'));
      // tee receives JSON on stdin; no shell string contains case data or redirects.
      const requestBytes = Buffer.from(JSON.stringify(request));
      const written = await command(prefix + '-write-request', selected('shell', '-T', 'run-as', packageName, 'tee', 'files/request.json'),
        {input: requestBytes, binary:true});
      if (!written.bytes?.equals(requestBytes)) throw new Error('Android request bytes changed in adb transfer');
      await command(prefix + '-clear-result', selected('shell', 'run-as', packageName, 'rm', '-f', 'files/result.json'));
      const instrument = await command(prefix + '-instrument', selected('shell', 'am', 'instrument', '-w', '-r',
        '-e', 'caseId', dbCase, '-e', 'requestName', 'request.json', '-e', 'resultName', 'result.json', instrumentation), {allowFailure: true});
      const codes = [...instrument.stdout.matchAll(/INSTRUMENTATION_CODE:\s*(-?\d+)/g)];
      const instrumentationCode = codes.length ? Number(codes.at(-1)[1]) : null;
      const read = await command(prefix + '-read-result', selected('exec-out', 'run-as', packageName, 'cat', 'files/result.json'), {allowFailure: true});
      let saved;
      try { saved = JSON.parse(read.stdout); }
      catch {
        const error = new Error(`${prefix} produced no valid atomic JSON result; adb=${instrument.code}, instrumentation=${instrumentationCode}`);
        error.instrumentationCrash = instrument.code === 0 && instrumentationCode === 0 &&
          /^INSTRUMENTATION_RESULT: shortMsg=Process crashed\./m.test(instrument.stdout);
        if (error.instrumentationCrash) {
          await command(prefix + '-crash-buffer', selected('logcat','-b','crash','-d','-t','120'),
            {allowFailure:true,timeout:10000});
          receipt.crashedAttempts.push({stage:label,attempt,dbCase,adbExitCode:instrument.code,instrumentationCode,
            reason:'Process crashed with no valid atomic result',logs:prefix});
          await preserveFailedAttempt(prefix,label,attempt,dbCase);
        }
        throw error;
      }
      const file = output + '.' + label + '.json';
      await fs.writeFile(file, JSON.stringify(saved, null, 2));
      receipt[label] = {adbExitCode: instrument.code, instrumentationCode, resultFile: file,
        resultSha256: hash(await fs.readFile(file)), status: saved.status};
      const expectedInstrumentationCode = saved.status === 'passed' ? -1 : 1;
      if (instrument.code !== 0 || instrumentationCode !== expectedInstrumentationCode || !['passed','failed'].includes(saved.status)) {
        const error = new Error(`${label} failed: adb=${instrument.code}, instrumentation=${instrumentationCode}, status=${saved.status}; see ${file}`);
        error.saved = saved; throw error;
      }
      return saved;
    }
    async function runRecoveringCrash(label, request) {
      for (let attempt = 1; ; attempt++) {
        if (label === 'main' && attempt > 1) {
          // Abandon the isolated crashed fixture; leave it on the runner for diagnostics.
          dbCase = baseCase.slice(0,64) + '-retry-' + attempt;
          receipt.dbCase = dbCase;
        }
        try {
          return await runCase(label,request,attempt);
        } catch (error) {
          if (!error.instrumentationCrash || attempt >= 3) throw error;
          await sleep(750);
        }
      }
    }
    result = await runRecoveringCrash('main', input);
    if (!result.reopened) throw new Error('The initial Android process did not export a reopened database state');
    const restarted = await runRecoveringCrash('restart', {caseId: input.caseId, mode: 'report', provenance: input.provenance});
    const firstRuntime = result.provenance?.runtime, restartRuntime = restarted.provenance?.runtime;
    if (restarted.status !== 'passed' || !restarted.raw || !firstRuntime?.sqliteVersion || !restartRuntime?.webViewVersion) {
      throw new Error('New Android process did not report actual SQLite and WebView runtime versions');
    }
    const separate = Number.isInteger(firstRuntime.processId) && Number.isInteger(restartRuntime.processId) && firstRuntime.processId !== restartRuntime.processId;
    const before = result.reopened;
    const after = restarted.raw;
    receipt.restartComparison = {status: separate && equal(before, after) ? 'passed' : 'failed', compared: Object.keys(before),
      processRestart: 'am force-stop followed by new instrumentation process',
      processIds:[firstRuntime.processId,restartRuntime.processId],
      initialSha256:receipt.main.resultSha256,relaunchedSha256:receipt.restart.resultSha256};
    result.processRestart = receipt.restartComparison;
    result.instrumentationCrashes = receipt.crashedAttempts;
    const database = await command('export-real-sqlite', selected('exec-out', 'run-as', packageName, 'cat',
      'files/protocol-cases/' + dbCase + '/tasks.sqlite'), {binary: true});
    if (!database.bytes || !database.bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
      throw new Error('Closed production database export lacks the SQLite file header');
    }
    const dbFile = output + '.tasks.sqlite';
    await fs.writeFile(dbFile, database.bytes);
    const sqlAudit = readExport(dbFile);
    const portableAuditMatches = equal(persistedFields(after), persistedFields(sqlAudit));
    const exportUnchanged = hash(await fs.readFile(dbFile)) === hash(database.bytes);
    const artifactAudit = output + '.export-audit.json';
    await fs.writeFile(artifactAudit, JSON.stringify(sqlAudit, null, 2));
    receipt.sqliteExport = {path:dbFile,sha256:hash(database.bytes),bytes:database.bytes.length,
      sqliteVersion:result.provenance.runtime.sqliteVersion, actualAuditMatches:portableAuditMatches, fileUnchangedByRead:exportUnchanged,
      integrityCheck:sqlAudit.integrity,auditPath:artifactAudit,auditSha256:hash(await fs.readFile(artifactAudit)),
      state:'all production connections closed by completed restart instrumentation'};
    result.sqliteExport = receipt.sqliteExport;
    if (!portableAuditMatches || !exportUnchanged) throw new Error('Exported SQLite content differs from the live Android reopened database report');
    if (receipt.restartComparison.status !== 'passed') throw new Error('Full Android persisted state differs after force-stop and relaunch');
    result.provenance = {...result.provenance, adbVersion: receipt.adbVersion, apkSha256: receipt.apkSha256};
    receipt.status = result.status;
    exitCode = result.status === 'passed' ? 0 : 1;
  }
} catch (error) {
  receipt.status = error.blocked ? 'blocked' : 'failed'; receipt.error = String(error.stack || error);
  exitCode = error.blocked ? 78 : error.exitCode || 1;
  result = error.saved || result || {schema: 'mytodo-protocol-harness-result', version: 1,
    platform: 'android', caseId: receipt.caseId, mode: receipt.mode, status: receipt.status, error: receipt.error};
  result.status = receipt.status; result.error = receipt.error;
} finally {
  if (fixturePort) await command('remove-fixture-reverse', selected('reverse', '--remove', 'tcp:' + fixturePort), {allowFailure:true,timeout:10000});
  if (!prepareOnly && receipt.status === 'failed' && serial && /^emulator-[0-9]+$/.test(serial) && sdk) {
    await command('android-logcat', selected('logcat', '-d', '-t', '300', 'C003Web:I', 'AndroidRuntime:E', '*:S'), {allowFailure:true,timeout:10000});
  }
  receipt.completedAt = new Date().toISOString(); receipt.exitCode = exitCode;
  await fs.writeFile(output, JSON.stringify(result, null, 2));
  receipt.outputSha256 = hash(await fs.readFile(output));
  await fs.writeFile(output + '.receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({status: receipt.status, exitCode, output, receipt: output + '.receipt.json'}));
  process.exitCode = exitCode;
}
