import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn, fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cloudOnly, confined, startMigrationServer, sha} from '../c006-harness/fixture-server.mjs';

// Cloud-only black-box runner. No copied recovery algorithm or database mutation.
cloudOnly();
if(process.platform !== 'win32') throw Error('The native C006 runner requires a GitHub Windows runner');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[index + 1]]], []));
const sourceRoot = path.resolve(args.source || process.cwd());
const root = confined(args.output || path.join(process.env.RUNNER_TEMP, 'c006-native'));
const executable = path.resolve(args.exe || process.env.C006_NATIVE_EXE || '');
const expected = process.env.EXPECTED_SOURCE_SHA;
if(!/^[0-9a-f]{40}$/.test(expected || '') || !(args.exe || process.env.C006_NATIVE_EXE)) throw Error('Exact source SHA and an explicit native executable are required');
const worker = fileURLToPath(new URL('../c006-harness/js-worker.mjs', import.meta.url));
const must = (condition, message) => { if(!condition) throw Error(message); };
const writeJSON = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');

// All production processes are asynchronous, keeping the loopback server alive.
async function processReceipt(exe, argv, {javascript = false, timeout = 90000, killAtGate = false} = {}) {
 return new Promise(resolve => {
  let child, stdout = '', stderr = '', spawnError = null, timedOut = false, gate = null, killed = false;
  const startedAt = new Date().toISOString();
  try {
   const options = {cwd: sourceRoot, env: process.env, windowsHide: true, stdio: javascript ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']};
   child = javascript ? fork(exe, argv, {...options, execArgv: ['--experimental-sqlite']}) : spawn(exe, argv, options);
  } catch(error) { resolve({pid: null, code: null, signal: null, stdout, stderr, spawnError: String(error), timedOut, startedAt, finishedAt: new Date().toISOString()}); return; }
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  if(javascript)child.on('message', message => {if(message.type === 'gate'){gate=message;if(killAtGate)killed=child.kill('SIGKILL');}});
  child.on('error', error => { spawnError = String(error); });
  child.on('close', (code, signal) => {
   clearTimeout(timer);
   resolve({pid: child.pid ?? null, code, signal, stdout, stderr, spawnError, timedOut, gate, killed, startedAt, finishedAt: new Date().toISOString()});
  });
 });
}
const git = await processReceipt('git', ['rev-parse', 'HEAD']);
must(!git.spawnError && !git.timedOut && git.signal === null && git.code === 0 && git.stdout.trim() === expected, 'Checkout does not match the exact expected source commit');
const clean = await processReceipt('git', ['diff', '--exit-code', 'HEAD', '--', 'src', 'windows', 'android']);
must(!clean.spawnError && !clean.timedOut && clean.signal === null && clean.code === 0, 'Production source has uncommitted modifications');
confined(executable);
const sourceSha = expected;
const coreHashes = Object.fromEntries(await Promise.all(['windows/sync.c', 'windows/database.c', 'src/sqlite-store.mjs', 'src/delta-sync.mjs', 'src/replica.mjs', 'src/sync-core.mjs', 'src/model.mjs'].map(async file => [file, sha(await fs.readFile(path.join(sourceRoot, file)))])));
const binarySha256 = sha(await fs.readFile(executable));
const buildReceipt = JSON.parse(await fs.readFile(path.join(path.dirname(executable), 'native-build-receipt.json'), 'utf8'));
must(buildReceipt.sourceSha === sourceSha && buildReceipt.exitCode === 0 && buildReceipt.outputSha256 === binarySha256 && buildReceipt.productionSyncSha256 === coreHashes['windows/sync.c'] && buildReceipt.productionDatabaseSha256 === coreHashes['windows/database.c'], 'Native binary build provenance does not match this checkout');
await fs.mkdir(root, {recursive: true});
await writeJSON(path.join(root, 'runner-provenance.json'), {sourceSha, coreHashes, binarySha256, executable, buildReceipt, git, clean, node: process.version});

const empty = {version: 1, tasks: [], notes: [], projects: [], tags: [], places: []};
const legacy = {...empty, tasks: [{id: 'legacy-task', title: '旧云恢复 中文 🧭', createdAt: '2026-01-01T00:00:00Z', subtasks: [{id: 'legacy-child', title: '子任务', createdAt: '2026-01-01T00:00:00Z'}]}], notes: [{id: 'legacy-note', body: 'note\nrecovery', createdAt: '2026-01-01T00:00:00Z'}], projects: [{id: 'legacy-project', name: 'legacy project', description: 'synthetic'}], tags: ['迁移'], places: ['测试']};
const legacyText = JSON.stringify({format: 'gxtodo-sync', version: 1, state: legacy});
const backupPath = 'v2/legacy-c006-original.json.gz';
const guard = backup => JSON.stringify({format: 'gxtodo-sync', version: 2, backup});
const G0 = guard(null), G1 = guard(backupPath);
const legacyFiles = [{path: 'state.json', body: legacyText}];
const guardedFiles = [{path: 'state.json', body: G1}, {path: backupPath, body: legacyText}];
const localKey = JSON.stringify(['notes', 'local-note']);
const deletedKey = JSON.stringify(['notes', 'local-deleted']);
const expectedLegacyKeys = [['tasks', 'legacy-task'], ['tasks', 'legacy-child'], ['notes', 'legacy-note'], ['projects', 'legacy-project'], ['tags', '迁移'], ['places', '测试']].map(key => JSON.stringify(key));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const domainRows = audit => JSON.stringify(canonical(audit.rows.map(row => ({key: row.key, data: row.data, deleted: row.deleted})).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)));
const results = [];
let sequence = 0;
const business = audit => JSON.stringify({entities: audit.sqlEntities, outbox: audit.sqlOutbox});
const metadataStable = audit => JSON.stringify(Object.fromEntries(['actor', 'seq', 'clock', 'queue', 'vector', 'cursors', 'scope', 'epoch', 'pending', 'cachedManifest', 'dataRevision'].map(key => [key, audit.meta[key] ?? null])));
function assertNativeAudit(audit) {
 must(audit && audit.integrity === true && audit.autocommit === true && Array.isArray(audit.readErrors) && audit.readErrors.length === 0, 'Native SQL audit or transaction state is invalid');
 must(Array.isArray(audit.sqlEntities) && Array.isArray(audit.sqlOutbox) && Array.isArray(audit.sqlMeta) && Array.isArray(audit.rows) && Array.isArray(audit.outbox), 'Native SQL audit is incomplete');
}
function assertLocal(audit) {
 const local = audit.rows.find(row => row.key === localKey), deleted = audit.rows.find(row => row.key === deletedKey);
 must(local && !local.deleted && local.data.body === 'local survives', 'Native local live record was lost or changed');
 must(deleted && deleted.deleted === true, 'Native local tombstone was lost or resurrected');
}
function assertLegacy(audit) {
 must(expectedLegacyKeys.every(key => audit.rows.some(row => row.key === key && row.deleted === false)), 'Native observer is missing restored legacy records');
 must(audit.rows.find(row => row.key === JSON.stringify(['tasks', 'legacy-task'])).data.title === '旧云恢复 中文 🧭', 'Legacy Unicode content changed');
 must(audit.rows.find(row => row.key === JSON.stringify(['notes', 'legacy-note'])).data.body === 'note\nrecovery', 'Legacy note content changed');
 must(audit.rows.find(row => row.key === JSON.stringify(['tasks', 'legacy-child'])).data.parentId === 'legacy-task' && audit.rows.find(row => row.key === JSON.stringify(['tasks', 'legacy-child'])).data.title === '子任务', 'Legacy child content or tree relationship changed');
 must(audit.rows.find(row => row.key === JSON.stringify(['projects', 'legacy-project'])).data.name === 'legacy project' && audit.rows.find(row => row.key === JSON.stringify(['projects', 'legacy-project'])).data.description === 'synthetic', 'Legacy project content changed');
 must(audit.rows.find(row => row.key === JSON.stringify(['tags', '迁移'])).data.name === '迁移' && audit.rows.find(row => row.key === JSON.stringify(['places', '测试'])).data.name === '测试', 'Legacy tag/place content changed');
}
async function native(context, operation, extra = {}) {
 const ordinal = ++sequence, specFile = path.join(context.directory, 'native-spec-' + ordinal + '.json'), output = path.join(context.directory, 'native-result-' + ordinal + '.json');
 const spec = {caseId: context.id, operation, directory: context.dbDir, folder: context.server.folder, endpoint: context.server.origin, ...extra};
 await writeJSON(specFile, spec);
 const receipt = await processReceipt(executable, [specFile, output]);
 const evidence = await fs.readFile(output, 'utf8').then(JSON.parse).catch(() => null);
 const combined = {platform: 'windows-native', specFile, output, process: receipt, evidence};
 context.operations.push(combined);await writeJSON(path.join(context.directory, 'native-process-' + ordinal + '.json'), combined);
 must(!receipt.spawnError && !receipt.timedOut && receipt.signal === null && [0, 1].includes(receipt.code), 'Native process crashed, timed out, or failed to launch; this is not an expected rejection');
 must(evidence && evidence.pid === receipt.pid && evidence.caseId === context.id && evidence.operation === operation && evidence.sourceSha === sourceSha && evidence.productionSyncSha256 === coreHashes['windows/sync.c'] && evidence.productionDatabaseSha256 === coreHashes['windows/database.c'], 'Native process identity or production provenance mismatch');
 must(evidence.exitCode === receipt.code && evidence.accepted === (receipt.code === 0), 'Native exit status and JSON accepted value disagree');
 must(evidence.auditFailed === false && evidence.transportGuardFailed === false && !evidence.reopenError, 'Native fixture/audit failure cannot count as a production rejection');
 for(const label of ['before', 'after', 'reopened']) assertNativeAudit(evidence[label]);
 must(business(evidence.after) === business(evidence.reopened) && JSON.stringify(evidence.after.sqlMeta) === JSON.stringify(evidence.reopened.sqlMeta), 'Native committed database changed after close/reopen');
 return combined;
}
function accepted(result) {must(result.process.code === 0 && result.evidence.accepted === true, 'Expected accepted native production operation: ' + (result.evidence.error || ''));return result.evidence;}
function rejected(result) {must(result.process.code === 1 && result.evidence.accepted === false && typeof result.evidence.error === 'string' && result.evidence.error.length > 0, 'Expected explicit native production rejection');return result.evidence;}
async function initialize(context, directory = context.dbDir, seed = true) {
 accepted(await native(context, 'init', {directory}));
 if(seed) {
  accepted(await native(context, 'local', {directory, changes: [{key: localKey, values: {id: 'local-note', body: 'local survives', createdAt: '2026-01-02T00:00:00Z', _deleted: false}}, {key: deletedKey, values: {id: 'local-deleted', body: 'must stay deleted', createdAt: '2026-01-02T00:00:00Z', _deleted: false}}]}));
  const out = accepted(await native(context, 'local', {directory, changes: [{key: deletedKey, values: {_deleted: true}}]}));assertLocal(out.after);
 }
}
async function drainNative(context, directory = context.dbDir) {
 let latest;
 for(let i = 0; i < 6; i++) {latest = accepted(await native(context, 'sync', {directory}));if(!latest.more) break;}
 must(latest && latest.more === false && latest.after.outbox.length === 0 && latest.after.meta.pending == null && latest.after.meta.lease == null, 'Native production outbox/pending/lease did not drain');
 return latest;
}
async function javascript(context, operation, extra = {}) {
 const ordinal = ++sequence, specFile = path.join(context.directory, 'js-spec-' + ordinal + '.json'), output = path.join(context.directory, 'js-result-' + ordinal + '.json');
 const spec = {sourceRoot, caseId: context.id, operation, dbDir: path.join(context.directory, 'javascript-migrator-db'), origin: context.server.origin, folder: context.server.folder, output, ...extra};
 await writeJSON(specFile, spec);
 const receipt = await processReceipt(worker, [specFile], {javascript: true});
 const evidence = await fs.readFile(output, 'utf8').then(JSON.parse).catch(() => null);
 const combined = {platform: 'javascript', specFile, output, process: receipt, evidence};
 context.operations.push(combined);await writeJSON(path.join(context.directory, 'js-process-' + ordinal + '.json'), combined);
 must(!receipt.spawnError && !receipt.timedOut && receipt.signal === null && receipt.code === 0, 'JavaScript recovery process did not exit successfully');
 must(evidence && evidence.status === 'passed' && evidence.sourceSha === sourceSha && evidence.pid === receipt.pid && evidence.caseId === context.id && evidence.operation === operation && !evidence.sync?.busy, 'JavaScript recovery evidence is incomplete or busy');
 must(Object.entries(evidence.coreHashes || {}).length === 5 && Object.entries(evidence.coreHashes).every(([file, hash]) => coreHashes[file] === hash), 'JavaScript production hashes do not match this checkout');
 return evidence;
}
async function drainJS(context, dbDir) {
 let latest;
 for(let i = 0; i < 6; i++) {latest = await javascript(context, 'sync', dbDir ? {dbDir} : {});if(!latest.sync.more) break;}
 must(latest && !latest.sync.more && latest.after.outbox.length === 0 && latest.after.meta.pending == null, 'JavaScript production migration did not drain');return latest.after;
}
async function inventory(context, label) {
 await context.server.flush();const files = await context.server.readFiles();await writeJSON(path.join(context.directory, label + '-cloud.json'), files);return files;
}
async function freshNativeObserver(context, requireLegacy) {
 const directory = path.join(context.directory, 'native-observer-db');await initialize(context, directory, false);
 const latest = await drainNative(context, directory);assertLocal(latest.after);if(requireLegacy) assertLegacy(latest.after);
 const keys = latest.after.rows.map(row => row.key);must(new Set(keys).size === keys.length, 'Fresh native observer has duplicate keys');
 return latest.after;
}
async function recoverWithJS(context, frozenFiles) {
 await javascript(context, 'initialize', {state: empty});const migrated = await drainJS(context);
 must(expectedLegacyKeys.every(key => migrated.rows.some(row => row.key === key && !row.deleted)), 'JavaScript migration did not recover all legacy records');
 const restored = await drainNative(context);assertLocal(restored.after);assertLegacy(restored.after);
 must(context.refusedActor && restored.before.meta.actor === context.refusedActor && restored.after.meta.actor === context.refusedActor, 'Recovery changed the refused native database identity');
 const cloud = await inventory(context, 'after-recovery'), state = cloud.find(file => file.path === 'state.json');
 const publishedEvents = cloud.filter(file => /^v2\/b-/.test(file.path)).flatMap(file => JSON.parse(file.text).events);
 must(Array.isArray(context.refusedOutbox) && context.refusedOutbox.length > 0, 'Recovery omitted the original native outbox receipt');
 for(const queued of context.refusedOutbox) {
  const original = queued.event;
  const matched = publishedEvents.find(event => event.actor === original.actor && event.seq === original.seq && event.key === original.key);
  must(matched && JSON.stringify(canonical(matched)) === JSON.stringify(canonical(original)), 'Recovery lost or changed an original native outbox event');
 }
 must(state, 'Legacy guard is missing after recovery');const selected = JSON.parse(state.text).backup, backup = cloud.find(file => file.path === selected);
 must(backup?.plainSha256 === sha(Buffer.from(legacyText, 'utf8')), 'Legacy backup does not preserve the original v1 content');
 for(const original of frozenFiles.filter(file => file.path.endsWith('.gz'))) must(cloud.find(file => file.path === original.path)?.wireSha256 === original.wireSha256, 'An existing immutable legacy backup changed during recovery');
 const fresh = await freshNativeObserver(context, true);must(domainRows(restored.after) === domainRows(fresh), 'Fresh native observer does not match producer domain rows');
 const jsObserver = path.join(context.directory, 'javascript-observer-db');await javascript(context, 'initialize', {state: empty, dbDir: jsObserver});
 const observed = await drainJS(context, jsObserver);
 must(observed.rows.some(row => row.key === localKey && !row.deleted && row.data.body === 'local survives') && observed.rows.some(row => row.key === deletedKey && row.deleted), 'JavaScript independent observer lost native data or tombstone');
 must(expectedLegacyKeys.every(key => observed.rows.some(row => row.key === key && !row.deleted)), 'Independent JavaScript observer lost restored legacy records');
 must(domainRows(restored.after) === domainRows(observed), 'Independent JavaScript and native observers disagree on complete domain rows');
}
async function refuseSafely(context, {conflict = false} = {}) {
 const latest = rejected(await native(context, 'sync'));
 must(/legacy|migration/i.test(latest.error), 'Expected a deliberate legacy migration refusal');
 assertLocal(latest.after);
 must(business(latest.before) === business(latest.after) && metadataStable(latest.before) === metadataStable(latest.after), 'Rejected migration changed business data, outbox, or synchronization progress');
 context.refusedActor = latest.before.meta.actor;
 context.refusedOutbox = latest.before.outbox;
 must(latest.after.meta.lease == null, 'Rejected native sync retained its lease');
 const files = await inventory(context, 'refused');
 must(!files.some(file => file.path === 'v2/manifest.json'), 'Refused legacy migration created an empty manifest');
 must(!context.server.entries.some(entry => entry.method === 'PUT' && entry.relative === 'v2/manifest.json'), 'Refused legacy migration attempted manifest publication');
 if(conflict) assertRereadAfter412(context);
 return files;
}
function assertRereadAfter412(context) {
 const conflict = context.server.entries.find(entry => entry.method === 'PUT' && entry.relative === 'state.json' && entry.status === 412);
 must(conflict && conflict.ifNoneMatch === '*' && conflict.writeCommitted === false, 'Missing actual conditional 412 while creating the legacy fence');
 must(context.server.entries.some(entry => entry.id > conflict.id && entry.method === 'GET' && entry.relative === 'state.json' && entry.status === 200), 'Native migration did not reread state.json after 412');
 must(context.server.faults().every(fault => fault.used === 1), 'A planned 412 race was not exercised');
}
async function test(id, {initialFiles = [], faults = []} = {}, body) {
 const directory = path.join(root, id);await fs.mkdir(directory);
 const server = await startMigrationServer({directory: path.join(directory, 'cloud'), folder: 'C006-' + id.replace(/[^a-zA-Z0-9]/g, '-'), initialFiles, faults});
 const context = {id, directory, dbDir: path.join(directory, 'native-producer-db'), server, operations: []};
 let status = 'passed', error = null;
 try {await inventory(context, 'initial');await body(context);} catch(cause) {status = 'failed';error = String(cause?.stack || cause);}
 finally {
  try {await inventory(context, 'final');} catch(cause) {status = 'failed';error = (error ? error + '\n' : '') + 'Final inventory failed: ' + String(cause?.stack || cause);}
  try {await server.close();} catch(cause) {status = 'failed';error = (error ? error + '\n' : '') + 'Fixture close failed: ' + String(cause?.stack || cause);}
 }
 const result = {id, platform: 'windows-native', executionScope: 'actual production sync_run, with actual JavaScript migration only where explicitly required', status, error, sourceSha, coreHashes, binarySha256, operations: context.operations, faults: server.faults(), logPath: server.logPath};
 await writeJSON(path.join(directory, 'case-result.json'), result);results.push(result);
 process.stdout.write(JSON.stringify({id, status, error: error?.split('\n')[0] ?? null}) + '\n');
}
const race = (id, text) => ({id, method: 'PUT', path: 'state.json', phase: 'before-conditions', effect: {replace: [{path: 'state.json', body: text}]}});

await test('C006-01-empty', {}, async context => {
 await initialize(context);const latest = await drainNative(context);assertLocal(latest.after);
 const files = await inventory(context, 'accepted');must(JSON.parse(files.find(file => file.path === 'state.json').text).backup === null, 'Empty cloud must publish an explicit backup:null guard');
 await freshNativeObserver(context, false);
});
for(const [id, replacement, initialFiles] of [
 ['C006-09-appearing-v1', legacyText, []],
 ['C006-10-appearing-guard', G1, [{path: backupPath, body: legacyText}]]
]) await test(id, {initialFiles, faults: [race(id, replacement)]}, async context => {
 await initialize(context);const files = await refuseSafely(context, {conflict: true});
 must(files.find(file => file.path === 'state.json')?.text === replacement, 'Native refusal overwrote the winning legacy state');
 await recoverWithJS(context, files);
});
await test('C006-11-appearing-empty', {faults: [race('C006-11', G0)]}, async context => {
 await initialize(context);const latest = await drainNative(context);assertLocal(latest.after);assertRereadAfter412(context);
 const files = await inventory(context, 'accepted');must(files.find(file => file.path === 'state.json')?.text === G0, 'Native sync replaced the winning valid empty guard');
 await freshNativeObserver(context, false);
});
for(const [id, initialFiles] of [['C006-14-existing-guard', guardedFiles], ['C006-15-existing-v1', legacyFiles]]) await test(id, {initialFiles}, async context => {
 await initialize(context);const before = await inventory(context, 'before-refusal'), refused = await refuseSafely(context);
 must(JSON.stringify(before) === JSON.stringify(refused), 'Native refusal changed existing cloud bytes');
 must(!context.server.entries.some(entry => entry.method === 'PUT'), 'Native existing-legacy refusal attempted a write');
 await recoverWithJS(context, refused);
});
for(const [suffix, backup] of [['absent', undefined], ['empty', ''], ['number', 7], ['array', []], ['object', {}], ['traversal', 'v2/../state.json'], ['url', 'https://example.invalid/state.json'], ['query', 'v2/legacy-a.json.gz?x'], ['fragment', 'v2/legacy-a.json.gz#x'], ['directory', 'v2/child/legacy-a.json.gz'], ['long', 'v2/legacy-' + 'a'.repeat(160) + '.json.gz']]) {
 await test('C006-19-20-' + suffix, {initialFiles: [{path: 'state.json', body: guard(backup)}]}, async context => {
  await initialize(context);const before = await inventory(context, 'before-refusal'), refused = await refuseSafely(context);
  must(JSON.stringify(before) === JSON.stringify(refused), 'Invalid guard rejection changed cloud files');
  must(!context.server.entries.some(entry => entry.method === 'PUT'), 'Invalid guard rejection attempted a write');
 });
}
await test('C006-30-js-killed-native-snapshot', {initialFiles:legacyFiles}, async context => {
 await javascript(context,'initialize',{state:empty});
 const ordinal=++sequence,specFile=path.join(context.directory,'js-kill-spec-'+ordinal+'.json'),output=path.join(context.directory,'js-kill-result-'+ordinal+'.json');
 await writeJSON(specFile,{sourceRoot,caseId:context.id,operation:'sync',dbDir:path.join(context.directory,'javascript-migrator-db'),origin:context.server.origin,folder:context.server.folder,output,
  gate:{phase:'after-request',method:'PUT',path:'v2/manifest.json'}});
 const execution=await processReceipt(worker,[specFile],{javascript:true,killAtGate:true}),evidence=await fs.readFile(output,'utf8').then(JSON.parse).catch(()=>null);
 context.operations.push({platform:'javascript',specFile,output,process:execution,evidence});await writeJSON(path.join(context.directory,'js-kill-process-'+ordinal+'.json'),context.operations.at(-1));
 must(!execution.spawnError&&!execution.timedOut&&execution.killed&&execution.gate&&evidence?.status==='paused-at-gate'&&evidence.pid===execution.pid&&execution.gate.pid===execution.pid&&execution.gate.caseId===context.id,'Actual JS migration did not reach the successful manifest kill gate');
 must(evidence.sourceSha===sourceSha&&evidence.caseId===context.id&&evidence.operation==='sync'&&Object.entries(evidence.coreHashes||{}).length===5&&Object.entries(evidence.coreHashes).every(([file,hash])=>coreHashes[file]===hash),'Killed JS migration production provenance mismatch');
 must([200,201,204].includes(evidence.gate.outcome?.status),'Manifest persistence was not confirmed before process death');
 const before=await inventory(context,'after-js-kill'),manifest=JSON.parse(before.find(file=>file.path==='v2/manifest.json').text);
 must(Object.keys(manifest.heads).length===0&&!before.some(file=>/^v2\/b-/.test(file.path)),'Snapshot-only recovery precondition was bypassed by published batches');
 const directory=path.join(context.directory,'native-snapshot-observer');await initialize(context,directory,false);
 const observed=await drainNative(context,directory);assertLegacy(observed.after);
 must(observed.after.outbox.length===0,'Native observer synthesized new migration events');
 const snapshotPaths=manifest.snapshot?.parts?.map(part=>part.path)||[];
 must(snapshotPaths.length>0&&snapshotPaths.every(relative=>context.server.entries.some(entry=>entry.method==='GET'&&entry.relative===relative&&entry.status===200)),'Native recovery did not read reachable initial snapshot parts');
});
const summary = {suite: 'C006 native full synchronization and migration refusal/recovery', sourceSha, coreHashes, binarySha256, executed: results.length, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length,
 platformsExecuted: ['windows-native', 'javascript'], notExecuted: ['android (separate runner)', 'native forced-termination lease recovery (not in this suite)'], results: results.map(({id, status, error}) => ({id, status, error}))};
await writeJSON(path.join(root, 'summary.json'), summary);process.stdout.write(JSON.stringify(summary) + '\n');process.exitCode = summary.failed ? 1 : 0;
