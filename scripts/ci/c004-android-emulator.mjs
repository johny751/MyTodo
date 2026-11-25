import { constants, createReadStream } from 'node:fs';
import { access, appendFile, mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Linux' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'linux') {
  throw new Error('C0-04 Android provisioning requires the GitHub-hosted Linux job.');
}

const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const runnerTemp = process.env.RUNNER_TEMP;
if (!path.isAbsolute(runnerTemp || '') || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) {
  throw new Error('GitHub runner evidence root or source SHA is unavailable.');
}
const output = path.join(runnerTemp, 'c004-android-emulator');
const runtimeRoot = path.join(runnerTemp, 'c004-android-runtime');
const api = '34';
const tag = 'default';
const abi = 'x86_64';
const imagePackage = `system-images;android-${api};${tag};${abi}`;
const avd = 'mytodo-c004-api34-default-x86_64';
const port = '5554';
const serial = `emulator-${port}`;
const emulator = sdk && path.join(sdk, 'emulator/emulator');
const adb = sdk && path.join(sdk, 'platform-tools/adb');
const imageDir = sdk && path.join(sdk, 'system-images', `android-${api}`, tag, abi);
const systemImage = imageDir && path.join(imageDir, 'system.img');
const environmentFile = path.join(output, 'environment.json');
const emulatorLog = path.join(output, 'emulator.log');
const receipt = {
  schema: 'mytodo-c004-android-emulator', version: 1,
  sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  runner: { os: process.env.RUNNER_OS, arch: process.env.RUNNER_ARCH, image: process.env.ImageOS,
    imageVersion: process.env.ImageVersion, environment: process.env.RUNNER_ENVIRONMENT },
  startedAt: new Date().toISOString(), status: 'blocked', exitCode: null, serial: null,
  requested: { api, tag, abi, imagePackage, serial, avd, expectedRevision: process.env.MYTODO_ANDROID_IMAGE_REVISION || '4' },
  sdk: sdk || null,
  installPolicy: { enabled: process.env.MYTODO_ANDROID_IMAGE_INSTALL === '1', attempted: false, packages: [],
    source: 'official Google Android SDK repository via the preinstalled sdkmanager', licenseOperation: 'existing SDK licenses only' },
  gradle: { usedForBuild: false }, commands: [],
};
const environment = { ...process.env, ANDROID_AVD_HOME: path.join(runtimeRoot, 'avd'),
  ANDROID_USER_HOME: path.join(runtimeRoot, 'android-home'), GRADLE_USER_HOME: path.join(runtimeRoot, 'gradle-probe') };
if (sdk) Object.assign(environment, { ANDROID_SDK_ROOT: sdk, ANDROID_HOME: sdk });

class Blocked extends Error {}
const readable = async (file, mode = constants.R_OK) => {
  if (!file) return false;
  try { await access(file, mode); return true; } catch { return false; }
};
const sha256 = data => createHash('sha256').update(data).digest('hex');

async function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}

async function run(label, executable, args, { timeout = 30_000, input } = {}) {
  const command = { label, argv: [executable, ...args], startedAt: new Date().toISOString() };
  receipt.commands.push(command);
  let timer;
  const result = await new Promise(resolve => {
    const child = spawn(executable, args, { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', spawnError = null;
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    child.on('error', error => { spawnError = String(error); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    timer = setTimeout(() => { command.timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.on('close', (exitCode, signal) => resolve({ stdout, stderr, exitCode, signal, spawnError }));
  });
  clearTimeout(timer);
  const bytes = Buffer.from(`${result.stdout}\n--- stderr ---\n${result.stderr}`);
  const log = `${String(receipt.commands.length).padStart(3, '0')}-${label}.log`;
  await writeFile(path.join(output, log), bytes);
  Object.assign(command, { exitCode: result.exitCode, signal: result.signal, spawnError: result.spawnError,
    finishedAt: new Date().toISOString(), log, logSha256: sha256(bytes) });
  return result;
}

async function requireCommand(label, exe, args, options) {
  const result = await run(label, exe, args, options);
  if (result.exitCode !== 0) throw new Blocked(`${label} exited ${result.exitCode}. See its command log.`);
  return result.stdout.trim();
}

async function imageFiles() {
  const installedRoot = sdk && path.join(sdk, 'system-images');
  const found = [];
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await visit(full);
      else if (item.isFile() && item.name === 'system.img') found.push(path.relative(sdk, full));
    }
  }
  if (await readable(installedRoot)) await visit(installedRoot);
  return found.sort();
}

async function describeFile(file) {
  const digest = createHash('sha256');
  for await (const block of createReadStream(file)) digest.update(block);
  return { file: path.basename(file), bytes: (await stat(file)).size, sha256: digest.digest('hex') };
}

function parseProperties(properties) {
  return Object.fromEntries(properties.split(/\r?\n/).filter(line => line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

async function waitForStableEnvironment() {
  const readiness = receipt.readiness = {
    startedAt: new Date().toISOString(), status: 'observing', deadlineMs: 180_000,
    minimumStableMs: 30_000, sampleIntervalMs: 5_000, samples: [],
    scope: 'Read-only environment observations before any protocol case; no case retry or future lifecycle guarantee.',
  };
  try {
    const packages = await requireCommand('runtime-google-services-inventory', adb,
      ['-s', serial, 'shell', 'pm', 'list', 'packages', '--user', '0']);
    const installedPackages = packages.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!installedPackages.includes('package:android') ||
        installedPackages.some(line => !/^package:[A-Za-z0-9_.]+$/.test(line))) {
      throw new Blocked('The Android package inventory did not provide a valid installed-package list.');
    }
    readiness.installedPackageCount = installedPackages.length;
    readiness.googleServicesInstalled = installedPackages.includes('package:com.google.android.gms');
    if (readiness.googleServicesInstalled) throw new Blocked('The default image unexpectedly includes Google Play services.');
    const deadline = Date.now() + readiness.deadlineMs;
    let previousKey = null, stableSince = null;
    for (let poll = 1; Date.now() < deadline; poll++) {
      try { process.kill(receipt.emulatorLaunch.pid, 0); }
      catch { throw new Blocked('The emulator process exited during readiness observation.'); }
      const probe = (label, ...args) => run(`readiness-${poll}-${label}`, adb,
        ['-s', serial, 'shell', ...args], { timeout: 8_000 });
      const boot = await probe('boot', 'getprop', 'sys.boot_completed');
      const webview = await probe('webview', 'dumpsys', 'webviewupdate');
      const overlays = await probe('overlays', 'cmd', 'overlay', 'list', '--user', '0');
      const activities = await probe('activities', 'dumpsys', 'activity', 'activities');
      const provider = webview.stdout.match(/Current WebView package[^\n]*\(([^,()]+),\s*([^()]+)\)/i);
      const started = webview.stdout.match(/Number of relros started:\s*(\d+)/);
      const finished = webview.stdout.match(/Number of relros finished:\s*(\d+)/);
      const configurations = [...new Set(activities.stdout.split(/\r?\n/)
        .map(line => line.trim()).filter(line => line.startsWith('mGlobalConfig=')))].sort();
      const ready = [boot, webview, overlays, activities].every(result => result.exitCode === 0) &&
        boot.stdout.trim() === '1' && provider && started && finished && Number(started[1]) > 0 &&
        started[1] === finished[1] && /WebView package dirty:\s*false/.test(webview.stdout) &&
        /Any WebView package installed:\s*true/.test(webview.stdout) && configurations.length > 0 && overlays.stdout.trim();
      const key = ready ? sha256(JSON.stringify({ provider: provider.slice(1).map(value => value.trim()),
        overlays: overlays.stdout.trim(), configurations })) : null;
      const now = Date.now();
      if (!key || key !== previousKey) stableSince = key ? now : null;
      previousKey = key;
      const stableMs = stableSince === null ? 0 : now - stableSince;
      readiness.samples.push({ poll, at: new Date(now).toISOString(), ready: Boolean(ready),
        fingerprintSha256: key, stableMs, provider: provider ? provider.slice(1).map(value => value.trim()) : null,
        relrosStarted: started ? Number(started[1]) : null, relrosFinished: finished ? Number(finished[1]) : null,
        globalConfigurations: configurations });
      if (key && stableMs >= readiness.minimumStableMs && now <= deadline) {
        readiness.status = 'passed';
        readiness.finishedAt = new Date(now).toISOString();
        readiness.observedStableMs = stableMs;
        return webview.stdout.trim();
      }
      if (Date.now() < deadline) await sleep(readiness.sampleIntervalMs);
    }
    readiness.status = 'blocked';
    readiness.finishedAt = new Date().toISOString();
    throw new Blocked('Android boot, WebView, overlays and global configuration did not remain stable within the readiness deadline.');
  } catch (error) {
    readiness.status = error instanceof Blocked ? 'blocked' : 'failed';
    readiness.reason = error.message;
    readiness.finishedAt = new Date().toISOString();
    throw error;
  }
}

async function start() {
  if (await readable(environmentFile)) throw new Error('This job already has an emulator setup receipt.');
  const head = (await run('git-head', 'git', ['rev-parse', 'HEAD'])).stdout.trim();
  if (head !== process.env.GITHUB_SHA || head !== process.env.EXPECTED_SOURCE_SHA) {
    throw new Error('Android emulator checkout does not match the workflow source SHA.');
  }
  receipt.initial = { sdkExists: await readable(sdk), emulatorExists: await readable(emulator, constants.X_OK),
    adbExists: await readable(adb, constants.X_OK), systemImages: await imageFiles(),
    targetImageExists: await readable(systemImage), kvmExists: await readable('/dev/kvm', constants.F_OK),
    kvmAccessible: await readable('/dev/kvm', constants.R_OK | constants.W_OK) };
  const javaHome = process.env.JAVA_HOME_17_X64 || process.env.JAVA_HOME;
  const java = javaHome && path.join(javaHome, 'bin/java');
  if (!await readable(java, constants.X_OK)) throw new Blocked('Preinstalled JDK 17 is unavailable.');
  environment.JAVA_HOME = javaHome;
  environment.PATH = `${path.dirname(java)}:${environment.PATH}`;
  await requireCommand('java-version', java, ['-version']);
  await requireCommand('javac-version', path.join(javaHome, 'bin/javac'), ['-version']);
  const gradle = await run('gradle-version', 'gradle', ['--offline', '--version']);
  receipt.gradle = { usedForBuild: false, exitCode: gradle.exitCode,
    version: gradle.stdout.match(/^Gradle\s+(\S+)/m)?.[1] || null, log: receipt.commands.at(-1).log };
  if (!receipt.initial.adbExists) throw new Blocked('The hosted SDK lacks its preinstalled platform-tools adb.');
  await requireCommand('adb-version', adb, ['version']);
  const packages = [!receipt.initial.emulatorExists && 'emulator', !receipt.initial.targetImageExists && imagePackage].filter(Boolean);
  receipt.installPolicy.packages = packages;
  if (packages.length && !receipt.installPolicy.enabled) {
    throw new Blocked(`Installed-only mode cannot find ${packages.join(', ')}. KVM access was inventoried.`);
  }
  if (!receipt.initial.kvmExists) throw new Blocked('The hosted Linux runner exposes no /dev/kvm device.');
  receipt.kvm = { accessibleBefore: receipt.initial.kvmAccessible, accessibleAfter: null, accessMethod: 'preinstalled' };
  if (!receipt.initial.kvmAccessible) {
    const uid = (await requireCommand('runner-uid', 'id', ['-u']));
    if (!/^\d+$/.test(uid) || uid === '0') throw new Error('Unexpected non-numeric or root hosted runner UID.');
    receipt.kvm.accessMethod = 'runner UID ACL';
    await requireCommand('kvm-runner-access', 'sudo', ['-n', 'setfacl', '-m', `u:${uid}:rw`, '/dev/kvm']);
  }
  receipt.kvm.accessibleAfter = await readable('/dev/kvm', constants.R_OK | constants.W_OK);
  if (!receipt.kvm.accessibleAfter) throw new Blocked('The hosted runner user still lacks access to its /dev/kvm device.');
  const toolRoot = path.join(sdk, 'cmdline-tools');
  const versions = await readdir(toolRoot).catch(() => []);
  let tools;
  for (const version of ['latest', ...versions.filter(item => /^\d+(\.\d+)*$/.test(item)).sort((a,b) => b.localeCompare(a, 'en', { numeric: true }))]) {
    const candidate = path.join(toolRoot, version, 'bin');
    if (await readable(path.join(candidate, 'avdmanager'), constants.X_OK) &&
        await readable(path.join(candidate, 'sdkmanager'), constants.X_OK)) { tools = candidate; break; }
  }
  if (!tools) throw new Blocked('Preinstalled official Android SDK command-line tools are unavailable.');
  const sdkmanager = path.join(tools, 'sdkmanager');
  const avdmanager = path.join(tools, 'avdmanager');
  await requireCommand('sdkmanager-version', sdkmanager, ['--version']);
  if (packages.length) {
    if (!await readable(path.join(sdk, 'licenses/android-sdk-license'))) {
      throw new Blocked('The preinstalled SDK has no existing Android SDK license.');
    }
    receipt.installPolicy.attempted = true;
    await requireCommand('install-official-android-packages', sdkmanager,
      [`--sdk_root=${sdk}`, '--channel=0', '--install', ...packages], { timeout: 540_000 });
  }
  if (!await readable(emulator, constants.X_OK)) throw new Blocked('The requested SDK emulator package did not provide its executable.');
  // Ubuntu 24.04 runners can omit the PulseAudio client library required even with -no-audio.
  const libpulse = '/usr/lib/x86_64-linux-gnu/libpulse.so.0';
  receipt.hostPackages = {libpulsePresent: await readable(libpulse), installAllowed: process.env.MYTODO_ANDROID_PULSE_INSTALL === '1'};
  if (!receipt.hostPackages.libpulsePresent) {
    if (!receipt.hostPackages.installAllowed) throw new Blocked('Missing libpulse.so.0 in installed-only host dependency mode.');
    const ubuntuSources = '/etc/apt/sources.list.d/ubuntu.sources';
    if (!await readable(ubuntuSources)) throw new Blocked('The Ubuntu runner has no official ubuntu.sources file.');
    const aptOptions = ['-o', `Dir::Etc::sourcelist=${ubuntuSources}`, '-o', 'Dir::Etc::sourceparts=-'];
    await requireCommand('update-official-ubuntu-package-index', 'sudo', ['-n', 'apt-get', ...aptOptions, 'update'], {timeout:180_000});
    await requireCommand('install-host-libpulse0', 'sudo',
      ['-n','apt-get',...aptOptions,'install','-y','--no-install-recommends','libpulse0'], {timeout:240_000});
    if (!await readable(libpulse)) throw new Blocked('libpulse0 installation did not provide libpulse.so.0.');
  }
  receipt.hostPackages.libpulse = await describeFile(libpulse);
  receipt.hostPackages.libpulsePackage = await requireCommand('libpulse0-version','dpkg-query',['-W','libpulse0']);
  const emulatorPropertiesPath = path.join(sdk, 'emulator', 'source.properties');
  if (!await readable(emulatorPropertiesPath)) throw new Blocked('The SDK emulator package does not provide source.properties.');
  const emulatorProperties = await readFile(emulatorPropertiesPath, 'utf8');
  const emulatorRevision = parseProperties(emulatorProperties)['Pkg.Revision'];
  if (!emulatorRevision) throw new Blocked('The SDK emulator package does not report its package revision.');
  await writeFile(path.join(output, 'emulator-source.properties'), emulatorProperties);
  receipt.emulatorPackage = {
    package: 'emulator', location: path.relative(sdk, path.dirname(emulator)), revision: emulatorRevision,
    sourcePropertiesSha256: sha256(emulatorProperties), executable: await describeFile(emulator),
    version: await requireCommand('emulator-version', emulator, ['-version']),
  };
  receipt.kvm.accelerationCheck = await requireCommand('emulator-acceleration-check', emulator, ['-accel-check']);
  if (!await readable(systemImage)) throw new Blocked(`The requested package did not provide ${systemImage}.`);
  const properties = await readFile(path.join(imageDir, 'source.properties'), 'utf8');
  const metadata = parseProperties(properties);
  if (metadata['AndroidVersion.ApiLevel'] !== api || metadata['SystemImage.Abi'] !== abi ||
      metadata['SystemImage.TagId'] !== tag || !metadata['Pkg.Revision']) {
    throw new Blocked('The installed system image metadata does not match the requested API, tag, ABI, and revision.');
  }
  if (receipt.requested.expectedRevision && receipt.requested.expectedRevision !== metadata['Pkg.Revision']) {
    throw new Blocked(`Expected system image revision ${receipt.requested.expectedRevision}, observed ${metadata['Pkg.Revision']}.`);
  }
  await writeFile(path.join(output, 'system-image-source.properties'), properties);
  receipt.image = { package: imagePackage, location: path.relative(sdk, imageDir), revision: metadata['Pkg.Revision'],
    sourcePropertiesSha256: sha256(properties), system: await describeFile(systemImage) };
  await mkdir(environment.ANDROID_AVD_HOME, { recursive: true });
  await mkdir(environment.ANDROID_USER_HOME, { recursive: true });
  await requireCommand('create-clean-avd', avdmanager, ['create', 'avd', '--name', avd, '--package', imagePackage], { input: 'no\n' });
  await requireCommand('start-adb', adb, ['start-server']);
  const before = await requireCommand('adb-device-inventory-before', adb, ['devices', '-l']);
  if (before.split(/\r?\n/).some(line => line.startsWith(`${serial}\t`) || line.startsWith(`${serial} `))) {
    throw new Blocked(`The reserved test serial ${serial} is already occupied.`);
  }
  const args = ['-avd', avd, '-port', port, '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot',
    '-accel', 'on', '-gpu', 'swiftshader_indirect', '-camera-back', 'none', '-camera-front', 'none',
    '-cores', '2', '-memory', '3072', '-no-metrics'];
  const logHandle = await open(emulatorLog, 'wx');
  try {
    const child = spawn(emulator, args, { env: environment, detached: true, stdio: ['ignore', logHandle.fd, logHandle.fd] });
    let spawnError, processExit;
    child.on('error', error => { spawnError = String(error); });
    child.on('exit', (code, signal) => {
      processExit = { exitCode: code, signal, at: new Date().toISOString() };
      if (receipt.emulatorLaunch) receipt.emulatorLaunch.processExit = processExit;
    });
    await new Promise(resolve => { child.once('spawn', resolve); child.once('error', resolve); });
    receipt.emulatorLaunch = { argv: [emulator, ...args], pid: child.pid ?? null, spawnError: spawnError ?? null,
      startedAt: new Date().toISOString(), log: path.basename(emulatorLog), processExit: processExit ?? null };
    if (spawnError) throw new Blocked(`Emulator could not launch. ${spawnError}`);
    child.unref();
  } finally { await logHandle.close(); }
  const deadline = Date.now() + 360_000;
  let booted = false;
  for (let poll = 1; Date.now() < deadline; poll++) {
    try { process.kill(receipt.emulatorLaunch.pid, 0); }
    catch { throw new Blocked('The emulator process exited before boot. See emulator.log.'); }
    const result = await run(`boot-poll-${poll}`, adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { timeout: 8_000 });
    if (result.exitCode === 0 && result.stdout.trim() === '1') { booted = true; break; }
    await sleep(5_000);
  }
  if (!booted) throw new Blocked(`Android boot deadline exceeded for ${serial}.`);
  const shell = (label, ...tail) => requireCommand(label, adb, ['-s', serial, 'shell', ...tail]);
  const runtime = {
    api: await shell('runtime-api', 'getprop', 'ro.build.version.sdk'),
    abi: await shell('runtime-abi', 'getprop', 'ro.product.cpu.abi'),
    emulator: await shell('runtime-emulator', 'getprop', 'ro.kernel.qemu'),
    fingerprint: await shell('runtime-fingerprint', 'getprop', 'ro.build.fingerprint'),
    webview: await shell('runtime-webview', 'dumpsys', 'webviewupdate'),
  };
  if (runtime.api !== api || runtime.abi !== abi || runtime.emulator !== '1') {
    throw new Blocked('Runtime getprop does not match the requested API, ABI, and emulator kind.');
  }
  const webViewPackage = runtime.webview.match(/Current WebView package[^\n]*\(([^,()]+),\s*([^()]+)\)/i);
  if (!webViewPackage) throw new Blocked('The booted Android image has no selected WebView provider.');
  runtime.webview = await waitForStableEnvironment();
  const stableWebViewPackage = runtime.webview.match(/Current WebView package[^\n]*\(([^,()]+),\s*([^()]+)\)/i);
  runtime.webviewPackage = stableWebViewPackage[1].trim();
  runtime.webviewVersion = stableWebViewPackage[2].trim();
  const sqlite = await run('runtime-sqlite-cli', adb, ['-s', serial, 'shell', 'sqlite3', '--version']);
  runtime.sqliteCli = { exitCode: sqlite.exitCode, version: sqlite.exitCode === 0 ? sqlite.stdout.trim() : null,
    role: 'Optional device shell probe. Actual framework SQLite version comes from the instrumentation database.' };
  receipt.runtime = runtime;
  receipt.serial = serial;
  receipt.status = 'ready';
  if (!process.env.GITHUB_ENV) throw new Error('GitHub step environment file is unavailable.');
  await appendFile(process.env.GITHUB_ENV, `MYTODO_ANDROID_SERIAL=${serial}\nJAVA_HOME=${javaHome}\n`);
}

async function finish() {
  if (!await readable(environmentFile)) throw new Error('Emulator startup did not produce its receipt.');
  const startup = JSON.parse(await readFile(environmentFile, 'utf8'));
  if (startup.sourceSha !== receipt.sourceSha || startup.runId !== receipt.runId || startup.runAttempt !== receipt.runAttempt) {
    throw new Error('Emulator startup receipt belongs to a different workflow run.');
  }
  receipt.startupStatus = startup.status;
  receipt.status = 'finished';
  if (startup.emulatorLaunch?.pid) {
    if (startup.serial === serial) {
      await run('android-runtime-errors', adb, ['-s', serial, 'logcat', '-d', '-t', '500', 'AndroidRuntime:E', '*:S']);
    }
    const stop = await run('stop-emulator', adb, ['-s', serial, 'emu', 'kill'], { timeout: 10_000 });
    if (stop.exitCode !== 0) receipt.reason = 'adb emulator shutdown reported a failure. GitHub reclaims its runner and emulator at job exit.';
    for (let i = 0; i < 10; i++) {
      try { process.kill(startup.emulatorLaunch.pid, 0); await sleep(1_000); }
      catch { break; }
    }
    receipt.emulatorLog = await describeFile(emulatorLog);
  }
}

const mode = process.argv[2];
if (!['start', 'finish'].includes(mode) || process.argv.length !== 3) throw new Error('Use start or finish.');
await mkdir(output, { recursive: true });
try {
  await (mode === 'start' ? start() : finish());
  receipt.exitCode = 0;
} catch (error) {
  receipt.status = error instanceof Blocked ? 'blocked' : 'failed';
  receipt.reason = error.message;
  receipt.serial = null;
  receipt.exitCode = error instanceof Blocked ? 78 : 1;
}
receipt.finishedAt = new Date().toISOString();
await atomicJson(mode === 'start' ? environmentFile : path.join(output, 'shutdown.json'), receipt);
if (mode === 'finish') {
  const files = await readdir(output, { withFileTypes: true });
  const hashes = [];
  for (const file of files.filter(item => item.isFile() && item.name !== 'payload-sha256.json').sort((a,b) => a.name.localeCompare(b.name))) {
    hashes.push(await describeFile(path.join(output, file.name)));
  }
  await atomicJson(path.join(output, 'payload-sha256.json'), hashes);
}
console.log(JSON.stringify({ status: receipt.status, serial: receipt.serial, exitCode: receipt.exitCode,
  reason: receipt.reason, evidenceDirectory: output }));
process.exitCode = receipt.exitCode;
