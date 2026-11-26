import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import crypto from 'node:crypto';

// This runner intentionally cannot execute outside GitHub Actions.
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') {
  throw new Error('Native regression runs only on a GitHub Actions Windows runner.');
}
const [exeArg, outputArg] = process.argv.slice(2);
if (!exeArg || !outputArg) throw new Error('Usage: node scripts/d4-04-native-regression.mjs <exe> <new-evidence-directory>');
const exe = path.resolve(exeArg), output = path.resolve(outputArg);
const required = name => { if (!process.env[name]) throw new Error(`Missing ${name}`); return process.env[name]; };
const sourceSha = required('GITHUB_SHA');
if (!/^[a-f0-9]{40}$/.test(sourceSha) || required('EXPECTED_SOURCE_SHA') !== sourceSha ||
    !/^\d+$/.test(required('GITHUB_RUN_ID')) || !/^\d+$/.test(required('GITHUB_RUN_ATTEMPT'))) {
  throw new Error('Exact Actions source/run identity is required.');
}
const head = await new Promise((resolve, reject) => execFile('git', ['rev-parse', 'HEAD'],
  {encoding: 'utf8', windowsHide: true}, (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
if (head !== sourceSha) throw new Error('Checkout HEAD differs from the exact Actions source SHA.');
const runnerTemp = await fs.realpath(required('RUNNER_TEMP'));
const parent = await fs.realpath(path.dirname(output));
if (parent.toLowerCase() !== runnerTemp.toLowerCase() || !/^d4-[a-z0-9-]+$/i.test(path.basename(output))) {
  throw new Error('Evidence must be a new direct d4-* child of RUNNER_TEMP.');
}
await fs.access(exe);
await fs.mkdir(output);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const suites = [
  {id: 'workspace-96', flag: '--work-regression', renderFlag: '--work-render', dpi: 96, gui: true},
  {id: 'workspace-144', flag: '--work-regression', renderFlag: '--work-render', dpi: 144, gui: true},
  {id: 'legacy-self-test', flag: '--self-test'},
  {id: 'legacy-advanced', flag: '--advanced-test'},
  {id: 'legacy-catalog', flag: '--ui-regression', gui: true},
  {id: 'legacy-detail', flag: '--detail-regression', gui: true},
  {id: 'legacy-repaint', flag: '--repaint-regression', gui: true},
  {id: 'legacy-drag', flag: '--drag-regression', renderFlag: '--drag-render', gui: true},
  {id: 'legacy-feedback', flag: '--feedback-test'},
];
const manifest = {
  schema: 1, suite: 'D4-04 native candidate', sourceSha,
  runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  executedOn: 'GitHub Actions windows runner', productionAdmission: false,
  executable: {name: path.basename(exe), sha256: sha256(await fs.readFile(exe))},
  startedAtUtc: new Date().toISOString(), startupGuards: [], suites: [],
  limitations: [
    'Synthetic explicit --data-dir only; no real user database or remote sync.',
    'Processes/contacts/independent work items and native pomodoro remain blocked.',
    'Legacy storage migration suite is not part of this scoped integration runner.',
    'Programmatic native control actions are not physical owner testing.'
  ]
};
const execute = (args, gui = false) => new Promise(resolve => execFile(exe, args, {
  // A visible Win32 test needs its real initial ShowWindow; SW_HIDE from the
  // process startup info would override that first call and suppress paints.
  windowsHide: !gui, encoding: 'utf8', timeout: 180000, maxBuffer: 12 * 1024 * 1024
}, (error, stdout, stderr) => resolve({
  stdout: stdout ?? '', stderr: stderr ?? '', exitCode: error?.code ?? 0,
  signal: error?.signal ?? null, killed: error?.killed ?? false, error: error?.message ?? null
})));
const guardRoot = path.join(output, 'startup-guards');
await fs.mkdir(guardRoot);
async function guard(id, args, exitCode, verify = async () => true) {
  const result = await execute(args);
  const passed = result.exitCode === exitCode && await verify();
  const record = {id, args, expectedExitCode: exitCode, ...result, passed};
  manifest.startupGuards.push(record);
  await fs.writeFile(path.join(guardRoot, id + '.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`${passed ? 'PASS' : 'FAIL'} startup/${id}`);
}
await guard('bare-executable-rejected', ['--inspect'], 64);
const occupied = path.join(guardRoot, 'occupied');await fs.mkdir(occupied);
const sentinel = Buffer.from('Existing user database sentinel: do not open or alter.');
await fs.writeFile(path.join(occupied, 'tasks.sqlite'), sentinel);
await guard('existing-unmarked-database-rejected', ['--data-dir', occupied, '--inspect'], 64,
  async () => (await fs.readFile(path.join(occupied, 'tasks.sqlite'))).equals(sentinel) && (await fs.readdir(occupied)).length === 1);
const wrongMarker = path.join(guardRoot, 'wrong-marker');await fs.mkdir(wrongMarker);
await fs.writeFile(path.join(wrongMarker, '.mytodo-d404-candidate-v1'), 'wrong candidate');
await guard('invalid-marker-rejected', ['--data-dir', wrongMarker, '--inspect'], 64,
  async () => (await fs.readdir(wrongMarker)).length === 1);
const fresh = path.join(guardRoot, 'fresh');await fs.mkdir(fresh);
await guard('fresh-empty-directory-admitted', ['--data-dir', fresh, '--inspect'], 0,
  async () => (await fs.readFile(path.join(fresh, '.mytodo-d404-candidate-v1'), 'utf8')).startsWith('MyTodo D4-04 isolated native candidate v1\nroot='));
await guard('matching-marker-admitted', ['--data-dir', fresh, '--inspect'], 0);
const copied = path.join(guardRoot, 'copied-marker');await fs.mkdir(copied);
await fs.copyFile(path.join(fresh, '.mytodo-d404-candidate-v1'), path.join(copied, '.mytodo-d404-candidate-v1'));
await guard('marker-bound-to-original-root', ['--data-dir', copied, '--inspect'], 64,
  async () => (await fs.readdir(copied)).length === 1);
await guard('duplicate-directory-rejected', ['--data-dir', fresh, '--data-dir', occupied, '--inspect'], 64);
await guard('remote-sync-command-rejected', ['--data-dir', fresh, '--sync'], 64);
await guard('external-config-command-rejected', ['--data-dir', fresh, '--use-config', occupied, 'preview'], 64);
const junction = path.join(guardRoot, 'linked');await fs.symlink(fresh, junction, 'junction');
const linkBefore = await fs.lstat(junction);
const targetBefore = await fs.realpath(junction);
const targetMarkerHash = sha256(await fs.readFile(path.join(fresh, '.mytodo-d404-candidate-v1')));
await guard('linked-directory-rejected', ['--data-dir', junction, '--inspect'], 64);
// Remove only this known synthetic junction, never recursively or its target.
const linkNow = await fs.lstat(junction);
if (!linkBefore.isSymbolicLink() || !linkNow.isSymbolicLink() ||
    targetBefore.toLowerCase() !== (await fs.realpath(fresh)).toLowerCase() ||
    (await fs.realpath(junction)).toLowerCase() !== targetBefore.toLowerCase()) {
  throw new Error('Synthetic junction identity changed; no cleanup was attempted.');
}
await fs.unlink(junction);
let linkAfter;
try { const current = await fs.lstat(junction);linkAfter = {exists: true, isSymbolicLink: current.isSymbolicLink()}; }
catch (error) { if (error.code !== 'ENOENT') throw error;linkAfter = {exists: false, error: error.code}; }
const targetStillIntact = (await fs.lstat(fresh)).isDirectory() &&
  targetMarkerHash === sha256(await fs.readFile(path.join(fresh, '.mytodo-d404-candidate-v1')));
await fs.writeFile(path.join(guardRoot, 'junction-cleanup.json'), JSON.stringify({
  operation: 'fs.unlink of fixture junction only', junction, targetBefore,
  before: {isSymbolicLink: linkBefore.isSymbolicLink(), size: linkBefore.size, inode: linkBefore.ino},
  after: linkAfter, targetMarkerHash, targetStillIntact
}, null, 2) + '\n');
if (linkAfter.exists || !targetStillIntact) throw new Error('Synthetic junction cleanup evidence failed.');
await fs.writeFile(path.join(output, 'native-regression.json'), JSON.stringify(manifest, null, 2) + '\n');
// A broken isolation guard must never be followed by the database/UI suites.
if (manifest.startupGuards.some(result => !result.passed)) {
  manifest.passed = false;
  await fs.writeFile(path.join(output, 'native-regression.json'), JSON.stringify(manifest, null, 2) + '\n');
  throw new Error('Candidate startup isolation guard failed; native suites were not started.');
}
for (const suite of suites) {
  const directory = path.join(output, suite.id);
  // Never replace or reuse an earlier suite database/report.
  await fs.mkdir(directory);
  const data = path.join(directory, 'synthetic-data'), render = path.join(directory, 'render');
  await fs.mkdir(data); await fs.mkdir(render);
  let fixture = null;
  if (suite.id === 'legacy-repaint') {
    // The unchanged historical repaint suite explicitly requires seeded tasks
    // (docs/windows-native.md). Use only this suite's fresh isolated database
    // and the existing native local-change entry, never a user backup/import.
    const changes = Array.from({length: 4}, (_, quadrant) => {
      const id = `d404-repaint-fixture-${quadrant}`;
      return {key: JSON.stringify(['tasks', id]), values: {
        id, title: `D4-04 synthetic repaint task ${quadrant + 1}`, quadrant,
        order: quadrant * 1024, done: false, _deleted: false, parentId: null,
        start: '', end: '', seriesId: '', generatedFrom: '', review: '', project: '', place: '',
        notes: 'Synthetic native repaint fixture.\nNo real user data or remote connection.',
        completedAt: '', createdAt: '2026-11-26T00:00:00Z', allDay: false,
        repeat: null, reminder: null, reminderAt: null, weight: 0, tags: []
      }};
    });
    const fixturePath = path.join(directory, 'synthetic-fixture.json');
    const fixtureBytes = JSON.stringify(changes, null, 2) + '\n';
    await fs.writeFile(fixturePath, fixtureBytes);
    const fixtureArgs = ['--data-dir', data, '--change', fixturePath];
    const preparation = await execute(fixtureArgs);
    await fs.writeFile(path.join(directory, 'fixture-stdout.log'), preparation.stdout);
    await fs.writeFile(path.join(directory, 'fixture-stderr.log'), preparation.stderr);
    fixture = {file: path.basename(fixturePath), sha256: sha256(fixtureBytes), taskCount: changes.length,
      args: fixtureArgs, exitCode: preparation.exitCode, signal: preparation.signal,
      killed: preparation.killed, error: preparation.error,
      passed: preparation.exitCode === 0 && !preparation.killed && preparation.signal === null,
      stdoutSha256: sha256(preparation.stdout), stderrSha256: sha256(preparation.stderr)};
    await fs.writeFile(path.join(directory, 'fixture-execution.json'), JSON.stringify(fixture, null, 2) + '\n');
  }
  const args = ['--data-dir', data, suite.flag];
  if (suite.renderFlag) args.push(suite.renderFlag, render);
  if (suite.dpi) args.push('--visual-dpi', String(suite.dpi));
  const start = Date.now();
  const execution = await execute(args, suite.gui === true);
  await fs.writeFile(path.join(directory, 'stdout.log'), execution.stdout);
  await fs.writeFile(path.join(directory, 'stderr.log'), execution.stderr);
  const failLines = execution.stdout.split(/\r?\n/).filter(line => /^FAIL\b/.test(line));
  let nativeReport = null;
  if (suite.flag === '--work-regression') {
    try { nativeReport = JSON.parse(await fs.readFile(path.join(render, 'workspace-report.json'), 'utf8')); }
    catch { /* Missing evidence is a failed suite, even if an exit code was zero. */ }
  }
  const passed = (fixture === null || fixture.passed) && execution.exitCode === 0 && failLines.length === 0 &&
    (suite.flag !== '--work-regression' || (nativeReport?.checks > 0 && nativeReport.failures === 0));
  const record = {id: suite.id, args, gui: suite.gui === true, fixture, passed, exitCode: execution.exitCode,
    signal: execution.signal, killed: execution.killed, error: execution.error,
    durationMs: Date.now() - start, failLines,
    checks: nativeReport?.checks ?? null,
    stdoutSha256: sha256(execution.stdout), stderrSha256: sha256(execution.stderr)};
  manifest.suites.push(record);
  await fs.writeFile(path.join(directory, 'execution.json'), JSON.stringify(record, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'native-regression.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${passed ? 'PASS' : 'FAIL'} ${suite.id} (exit ${execution.exitCode})`);
}
manifest.completedAtUtc = new Date().toISOString();
manifest.passed = manifest.startupGuards.every(result => result.passed) && manifest.suites.every(suite => suite.passed);
await fs.writeFile(path.join(output, 'native-regression.json'), JSON.stringify(manifest, null, 2) + '\n');
if (!manifest.passed) process.exitCode = 1;
