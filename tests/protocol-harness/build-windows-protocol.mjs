import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';

// No compiler/tool discovery is replaced. The original cloud builder is reused.
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') {
  throw Error('Windows protocol harness compilation is allowed only on GitHub Actions Windows runners.');
}
const args = process.argv.slice(2);
if (args.length !== 1 || !path.isAbsolute(args[0])) {
  throw Error('Usage: node tests/protocol-harness/build-windows-protocol.mjs <absolute RUNNER_TEMP output.exe>');
}
if (!process.env.RUNNER_TEMP || !path.isAbsolute(process.env.RUNNER_TEMP)) {
  throw Error('GitHub RUNNER_TEMP is missing.');
}
const output = path.resolve(args[0]);
const relativeOutput = path.relative(path.resolve(process.env.RUNNER_TEMP), output);
if (!relativeOutput || path.isAbsolute(relativeOutput) || relativeOutput === '..' || relativeOutput.startsWith('..' + path.sep)) {
  throw Error('Harness output must be a new file beneath this runner temporary directory.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'scripts/build-windows.mjs');
const harnessPath = path.join(root, 'tests/protocol-harness/windows-protocol.c');
const syncPath = path.join(root, 'windows/sync.c');
const invoke = (exe, parameters, timeout = 30000) => new Promise((resolve, reject) => {
  execFile(exe, parameters, {cwd:root, windowsHide:true, timeout, maxBuffer:16 * 1024 * 1024}, (error, stdout, stderr) => {
    if (error) {
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    } else resolve({stdout, stderr});
  });
});
const head = (await invoke('git', ['rev-parse', '--verify', 'HEAD'])).stdout.trim();
const expected = process.env.EXPECTED_SOURCE_SHA || process.env.GXTODO_PROTOCOL_SOURCE_SHA || process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(head) || !/^[a-f0-9]{40}$/.test(expected || '') || head !== expected) {
  throw Error('Protocol builder checkout does not match the frozen source SHA.');
}
await fs.access(harnessPath);
try {
  await fs.access(output);
  throw Error('Refusing a pre-existing protocol executable.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const original = await fs.readFile(sourcePath, 'utf8');
const originalSync = await fs.readFile(syncPath, 'utf8');
const mainMarker = "'main.c','util.c'";
const syncMarker = "'sync.c','gui.c'";
const argsMarker = "const args=['/nologo',";
const securityMarker = 'WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE';
if (original.split(mainMarker).length !== 2 || original.split(syncMarker).length !== 2 || original.split(argsMarker).length !== 2) {
  throw Error('Original Windows builder source list changed; review the adapter instead of guessing.');
}
if (originalSync.split(securityMarker).length !== 2) {
  throw Error('The approved single fixture transport flag is not unique; no source was modified.');
}
const temporarySync = path.join(root, 'windows', '.c003-sync-' + crypto.randomUUID() + '.c');
const fixtureSync = originalSync.replace(securityMarker, 'WINHTTP_DEFAULT_ACCEPT_TYPES,0');
const includeDefinition = '/DGXTODO_PROTOCOL_SYNC_SOURCE="' + temporarySync.replaceAll('\\', '/') + '"';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const provenanceDefinitions = [
  includeDefinition,
  '/DGXTODO_PROTOCOL_SYNC_ORIGINAL_SHA="' + digest(Buffer.from(originalSync)) + '"',
  '/DGXTODO_PROTOCOL_SYNC_FIXTURE_SHA="' + digest(Buffer.from(fixtureSync)) + '"',
];
const adapted = original
  .replace(mainMarker, "'../tests/protocol-harness/windows-protocol.c','util.c'")
  .replace(syncMarker, "'gui.c'")
  .replace(argsMarker, argsMarker + provenanceDefinitions.map(x => JSON.stringify(x)).join(',') + ',');
const temporary = path.join(root, 'scripts', '.c003-build-' + crypto.randomUUID() + '.mjs');
const buildDirectory = path.dirname(output);
await fs.mkdir(buildDirectory, {recursive:true});
const receipt = {
  sourceSha:head,
  mode:'Windows C real production modules',
  sourceBuilder:'scripts/build-windows.mjs',
  sourceBuilderSha256:digest(Buffer.from(original)),
  temporaryBuilderSha256:digest(Buffer.from(adapted)),
  productionSyncSha256:digest(Buffer.from(originalSync)),
  fixtureSyncSha256:digest(Buffer.from(fixtureSync)),
  fixtureTransportReplacementCount:1,
  fixtureTransportDifference:'Only the test copy changes WINHTTP_FLAG_SECURE to 0; native WinHTTP connects to the harness-supplied loopback HTTP fixture.',
  harnessSha256:digest(await fs.readFile(harnessPath)),
  replacements:['main.c -> tests/protocol-harness/windows-protocol.c', 'sync.c is included by the harness TU with the one recorded fixture-only transport flag'],
  productionBuilderModified:false,
  productionProtocolModified:false,
  output,
  startedAt:new Date().toISOString(),
  finishedAt:null,
  exitCode:null,
  outputSha256:null,
  outputBytes:null,
};
const receiptPath = path.join(buildDirectory, 'windows-protocol-build.json');
let buildError;
let createdBuilder = false;
let createdSync = false;
try {
  await fs.writeFile(temporary, adapted, {flag:'wx'});
  createdBuilder = true;
  await fs.writeFile(temporarySync, fixtureSync, {flag:'wx'});
  createdSync = true;
  const result = await invoke(process.execPath, [temporary, output, '--public-release'], 600000);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  receipt.exitCode = 0;
  const bytes = await fs.readFile(output);
  receipt.outputSha256 = digest(bytes);
  receipt.outputBytes = bytes.length;
} catch (error) {
  receipt.exitCode = typeof error.code === 'number' ? error.code : null;
  receipt.failure = error.message;
  receipt.signal = error.signal || null;
  receipt.killed = !!error.killed;
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  buildError = error;
} finally {
  receipt.finishedAt = new Date().toISOString();
  // Remove only the exact newly-created recipe; never a directory or user file.
  if (createdBuilder) try { await fs.unlink(temporary); } catch (error) { receipt.cleanupFailure = error.message; }
  if (createdSync) try { await fs.unlink(temporarySync); } catch (error) { receipt.syncCopyCleanupFailure = error.message; }
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify(receipt));
if (buildError) process.exitCode = 1;
