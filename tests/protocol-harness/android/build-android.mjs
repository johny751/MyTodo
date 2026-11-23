import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

// Deliberately refuse local execution before starting any project tool.
if (process.env.GITHUB_ACTIONS !== 'true' && process.env.CODESPACES !== 'true') {
  throw new Error('C0-03 Android build is restricted to authorized GitHub cloud environments');
}
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const root = path.resolve(option('--root', path.resolve(here, '../../..')));
const build = path.resolve(option('--output-dir', path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'c003-android')));
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const javaHome = process.env.JAVA_HOME;
const receipt = {
  schema: 'mytodo-c003-android-build', version: 1, status: 'failed',
  startedAt: new Date().toISOString(), runner: {os: process.env.RUNNER_OS, image: process.env.ImageOS,
    imageVersion: process.env.ImageVersion, githubRunId: process.env.GITHUB_RUN_ID, node: process.version},
  commands: [], sourceHashes: {}, assets: {}, outputs: {},
};
await fs.mkdir(build, {recursive: true});
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function command(label, executable, argv, cwd = root) {
  const log = path.join(build, label + '.log');
  const entry = {label, command: [executable, ...argv], log, startedAt: new Date().toISOString()};
  receipt.commands.push(entry);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, argv, {cwd, env: process.env, windowsHide: true});
    let text = '';
    child.stdout.on('data', bytes => { text += bytes; process.stdout.write(bytes); });
    child.stderr.on('data', bytes => { text += bytes; process.stderr.write(bytes); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({code, signal, text}));
  }).catch(error => ({code: null, signal: null, text: String(error), spawnError: String(error)}));
  await fs.writeFile(log, result.text);
  Object.assign(entry, {exitCode: result.code, signal: result.signal, spawnError: result.spawnError,
    completedAt: new Date().toISOString(), logSha256: hash(Buffer.from(result.text))});
  if (result.code !== 0) {
    const error = new Error(`${label} exited ${result.code}: ${result.spawnError || 'see command log'}`);
    error.exitCode = Number.isInteger(result.code) && result.code > 0 ? result.code : 1;
    throw error;
  }
  return result.text.trim();
}
async function copyAsset(relative, source = path.join(root, relative)) {
  const bytes = await fs.readFile(source);
  const target = path.join(build, 'assets', relative);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, bytes);
  receipt.assets[relative] = hash(bytes);
}
async function sources(directory, suffix) {
  const found = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await sources(full, suffix));
    else if (entry.name.endsWith(suffix)) found.push(full);
  }
  return found.sort();
}
let exitCode = 1;
try {
  if (!sdk || !javaHome) {
    const error = new Error('GitHub runner lacks configured ANDROID_HOME/ANDROID_SDK_ROOT or JAVA_HOME; no dependency download is attempted');
    error.blocked = true; throw error;
  }
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const java = name => path.join(javaHome, 'bin', name + suffix);
  const tools = path.join(sdk, 'build-tools', '35.0.0');
  const platform = path.join(sdk, 'platforms', 'android-34', 'android.jar');
  const required = [platform, path.join(tools, 'aapt2' + suffix), path.join(tools, 'zipalign' + suffix),
    path.join(tools, 'lib/d8.jar'), path.join(tools, 'lib/apksigner.jar'), java('javac'), java('keytool')];
  for (const file of required) {
    try { await fs.access(file); }
    catch {
      const error = new Error('GitHub runner lacks preinstalled Android/JDK tool: ' + file);
      error.blocked = true; throw error;
    }
  }
  receipt.sourceSha = await command('git-head', 'git', ['rev-parse', 'HEAD']);
  receipt.worktree = await command('git-status', 'git', ['status', '--porcelain=v1']);
  await command('java-version', java('java'), ['-version']);
  await command('javac-version', java('javac'), ['-version']);
  await command('aapt2-version', path.join(tools, 'aapt2' + suffix), ['version']);
  await command('d8-version', java('java'), ['-cp', path.join(tools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--version']);
  const packageFiles = ['ReplicaDatabase.java', 'AccountStore.java', 'SyncStore.java', 'PomodoroTasks.java', 'DailyTaskPolicy.java'];
  const nativeSources = packageFiles.map(name => path.join(root, 'android/src/local/gxtodo/replica', name));
  const testSources = await sources(path.join(here, 'src'), '.java');
  for (const source of [...nativeSources, ...testSources]) receipt.sourceHashes[path.relative(root, source).replaceAll('\\', '/')] = hash(await fs.readFile(source));
  for (const source of await sources(path.join(root, 'src'), '.mjs')) await copyAsset(path.relative(root, source));
  const shared = path.join(root, 'tests/protocol-harness');
  for (const source of await sources(shared, '.mjs')) {
    if (source.startsWith(path.join(shared, 'android') + path.sep)) continue;
    await copyAsset(path.relative(root, source));
  }
  await copyAsset('tests/protocol-harness/android/android-adapter.mjs', path.join(here, 'android-adapter.mjs'));
  await copyAsset('index.html', path.join(here, 'index.html'));
  await copyAsset('harness-entry.mjs', path.join(here, 'harness-entry.mjs'));
  const delta = await fs.readFile(path.join(root, 'src/delta-sync.mjs'));
  const adapted = Buffer.concat([delta, Buffer.from('\nexport const __c003Internals={manifestValue,bind,checkpoint,pull,prepare,publish,makeSnapshot};\n')]);
  const deltaPath = path.join(build, 'assets/src/c003-delta-adapter.mjs');
  await fs.writeFile(deltaPath, adapted);
  receipt.assets['src/c003-delta-adapter.mjs'] = hash(adapted);
  receipt.deltaAdapter = {originalSha256: hash(delta), adaptedSha256: hash(adapted),
    adaptation: 'Original source bytes plus test-only private-symbol export; no function-body edits'};
  const metadata = {schema: 'mytodo-c003-android-source-provenance', version: 1,
    sourceSha: receipt.sourceSha, runner: receipt.runner, sourceHashes: receipt.sourceHashes,
    assets: receipt.assets, deltaAdapter: receipt.deltaAdapter,
    builtAt: new Date().toISOString(), buildTimezone: 'UTC',
    applicationId: 'local.gxtodo.protocolharness', releaseApk: false};
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  await fs.writeFile(path.join(build, 'assets/build-metadata.json'), metadataBytes);
  receipt.assets['build-metadata.json'] = hash(metadataBytes);
  for (const directory of ['classes', 'dex', 'generated']) await fs.mkdir(path.join(build, directory), {recursive: true});
  const compiled = path.join(build, 'resources.zip');
  const unsigned = path.join(build, 'unsigned.apk');
  const aligned = path.join(build, 'aligned.apk');
  const apk = path.join(build, 'mytodo-c003-test.apk');
  await command('aapt2-compile', path.join(tools, 'aapt2' + suffix), ['compile', '--dir', path.join(here, 'res'), '-o', compiled]);
  await command('aapt2-link', path.join(tools, 'aapt2' + suffix), ['link', '-o', unsigned, '--manifest', path.join(here, 'AndroidManifest.xml'),
    '-I', platform, '--java', path.join(build, 'generated'), '-A', path.join(build, 'assets'), compiled]);
  await command('javac', java('javac'), ['-encoding', 'UTF-8', '--release', '17', '-classpath', platform,
    '-d', path.join(build, 'classes'), ...nativeSources, ...testSources, ...await sources(path.join(build, 'generated'), '.java')]);
  const jar = path.join(build, 'classes.jar');
  await command('jar', java('jar'), ['cf', jar, '-C', path.join(build, 'classes'), '.']);
  await command('d8', java('java'), ['-cp', path.join(tools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--min-api', '26',
    '--lib', platform, '--output', path.join(build, 'dex'), jar]);
  const dex = (await fs.readdir(path.join(build, 'dex'))).filter(name => /^classes(?:\d+)?\.dex$/.test(name)).sort();
  if (!dex.includes('classes.dex')) throw new Error('D8 produced no primary dex');
  await command('apk-dex', java('jar'), ['uf', unsigned, ...dex.flatMap(name => ['-C', path.join(build, 'dex'), name])]);
  await command('zipalign', path.join(tools, 'zipalign' + suffix), ['-f', '-p', '4', unsigned, aligned]);
  const key = path.join(build, 'synthetic-c003-test.p12');
  // This independent test application uses an ephemeral synthetic signing key.
  // Formal MyTodo signing material and Android user data are never accessed.
  await command('keytool-test-only', java('keytool'), ['-genkeypair', '-keystore', key, '-storetype', 'PKCS12',
    '-storepass', 'c003-test-only', '-keypass', 'c003-test-only', '-alias', 'c003-test', '-keyalg', 'RSA',
    '-keysize', '2048', '-validity', '1', '-dname', 'CN=MyTodo C003 isolated CI test', '-noprompt']);
  await command('apksigner-test-only', java('java'), ['-jar', path.join(tools, 'lib/apksigner.jar'), 'sign', '--ks', key,
    '--ks-key-alias', 'c003-test', '--ks-pass', 'pass:c003-test-only', '--key-pass', 'pass:c003-test-only', '--out', apk, aligned]);
  await command('apksigner-verify', java('java'), ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', apk]);
  const apkEntries = new Set((await command('verify-packaged-webview-assets', java('jar'), ['tf', apk])).split(/\r?\n/));
  const missingAssets = Object.keys(receipt.assets).filter(relative => !apkEntries.has('assets/' + relative));
  if (missingAssets.length) throw new Error('WebView assets missing from test APK: ' + missingAssets.join(', '));
  for (const output of [apk, unsigned]) receipt.outputs[path.basename(output)] = {path: output, sha256: hash(await fs.readFile(output))};
  receipt.status = 'passed'; exitCode = 0;
} catch (error) {
  receipt.status = error.blocked ? 'blocked' : 'failed';
  receipt.error = String(error.stack || error);
  exitCode = error.blocked ? 78 : error.exitCode || 1;
} finally {
  receipt.exitCode = exitCode; receipt.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(build, 'build-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({status: receipt.status, exitCode, receipt: path.join(build, 'build-receipt.json'), outputs: receipt.outputs}));
  process.exitCode = exitCode;
}
