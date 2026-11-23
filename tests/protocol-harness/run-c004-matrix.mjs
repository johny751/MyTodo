import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {materializeFixture, startFixtureServer} from './fixture-server.mjs';
import {verifyResult, compareResults, compareRestart} from './compare-results.mjs';
import {canonical, normalizeAudit} from './shared-executor.mjs';

if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) {
  throw new Error('The protocol matrix must run on GitHub Actions');
}

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i];
  const value = process.argv[i + 1];
  if (!['--phase','--output','--desktop','--android','--android-environment','--android-serial','--android-shard'].includes(name) || !value || options.has(name)) {
    throw new Error('Invalid matrix argument: ' + name);
  }
  options.set(name, value);
}
const phase = options.get('--phase');
if (!['desktop','android','complete'].includes(phase) || !options.has('--output')) throw new Error('--phase and --output are required');
if (phase !== 'android' && process.platform !== 'win32') throw new Error('Native Windows adapters require a Windows runner');

const runnerTemp = path.resolve(process.env.RUNNER_TEMP);
function under(base, file) {
  const target = path.resolve(base, file);
  const relative = path.relative(base, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Path outside the isolated test directory: ' + file);
  }
  return target;
}
const output = under(runnerTemp, options.get('--output'));
await fs.mkdir(output);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const relativeFrom = (base, file) => path.relative(base, file).split(path.sep).join('/');
const suitePath = path.resolve('tests/protocol-vectors/suite.json');
const suiteBytes = await fs.readFile(suitePath);
const suite = JSON.parse(suiteBytes);
const shardCount = 8;
const shardOption = options.get('--android-shard');
if (shardOption !== undefined && (phase !== 'android' || !/^[0-7]$/.test(shardOption))) {
  throw new Error('Only Android accepts --android-shard 0 through 7');
}
const shard = shardOption === undefined ? null : Number(shardOption);
const assignedCases = slot => suite.cases.filter((_,index) => slot === null || index % shardCount === slot);
const jsonDigest = value => hash(JSON.stringify(canonical(value)));
const identity = {
  sourceSha: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  suiteSemanticSha256: jsonDigest(suite),
};
const summary = {
  schema:'mytodo-c004-phase', version:1, phase, ...identity,
  suiteSha256:hash(suiteBytes), suiteCases:suite.cases.length, androidShard:shard,
  runUrl:`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${identity.runId}`,
  runner:{os:process.env.RUNNER_OS,arch:process.env.RUNNER_ARCH,image:process.env.ImageOS,imageVersion:process.env.ImageVersion,node:process.version,sqlite:process.versions.sqlite},
  startedAt:new Date().toISOString(), commands:[], executions:[], comparisons:[], dependencies:{},
};
const desktop = ['windows-c','javascript'];
const platforms = [...desktop,'android'];
const oldPlatformName = platform => platform === 'windows-c' ? 'Windows C' : platform;
const idFor = (test, platform, source) => [test.id,source ? 'receive' : 'generate',platform,source].filter(Boolean).join('--');
const results = new Map();

async function command(label, executable, args, timeout = 180000) {
  const logDir = path.join(output, 'commands');
  await fs.mkdir(logDir, {recursive:true});
  const prefix = path.join(logDir, String(summary.commands.length + 1).padStart(4,'0') + '-' + label);
  const receipt = {label,argv:[executable,...args],startedAt:new Date().toISOString()};
  summary.commands.push(receipt);
  const result = await new Promise(resolve => {
    const child = spawn(executable, args, {env:{...process.env, EXPECTED_SOURCE_SHA:identity.sourceSha}, windowsHide:true});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => {stdout += chunk;});
    child.stderr.setEncoding('utf8').on('data', chunk => {stderr += chunk;});
    child.stdin.end();
    const timer = setTimeout(() => {receipt.timedOut = true; child.kill();},timeout);
    child.on('error', error => {receipt.spawnError = error.message;});
    child.on('close',(exitCode,signal) => {clearTimeout(timer); resolve({exitCode,signal,stdout,stderr});});
  });
  const stdoutFile = prefix + '.stdout.log', stderrFile = prefix + '.stderr.log';
  await Promise.all([fs.writeFile(stdoutFile,result.stdout),fs.writeFile(stderrFile,result.stderr)]);
  Object.assign(receipt, {
    exitCode:result.exitCode,signal:result.signal,finishedAt:new Date().toISOString(),
    stdout:relativeFrom(output,stdoutFile),stdoutSha256:hash(result.stdout),
    stderr:relativeFrom(output,stderrFile),stderrSha256:hash(result.stderr),
  });
  console.log(JSON.stringify({label,exitCode:result.exitCode,signal:result.signal,timedOut:!!receipt.timedOut}));
  return result;
}

async function inventory(base, dir = base) {
  const payload = [];
  for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) payload.push(...await inventory(base, file));
    else if (entry.isFile() && file !== path.join(base,'payload-sha256.json')) {
      const bytes = await fs.readFile(file);
      payload.push({path:relativeFrom(base,file),sha256:hash(bytes),bytes:bytes.length});
    } else if (!entry.isFile()) throw new Error('Unexpected non-regular evidence path: ' + file);
  }
  return payload.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

async function importPhase(name, location = options.get('--' + name), slot = null) {
  const dependency = slot === null ? name : name + '-' + slot;
  if (!location) return null;
  const source = under(runnerTemp, location);
  try {await fs.access(path.join(source, 'summary.json'));}
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    summary.dependencies[dependency] = {status:'blocked',reason:'GitHub job did not publish the phase summary'};
    return null;
  }
  const [payload, manifest] = await Promise.all([inventory(source),read(path.join(source,'payload-sha256.json'))]);
  if (jsonDigest(payload) !== jsonDigest(manifest)) throw new Error(name + ' evidence file SHA256, size, or inventory mismatch');
  const prior = await read(path.join(source,'summary.json'));
  if (prior.schema !== 'mytodo-c004-phase' || prior.version !== 1 || prior.phase !== name) throw new Error('Wrong evidence phase: ' + name);
  for (const field of Object.keys(identity)) if (prior[field] !== identity[field]) throw new Error(name + ' evidence differs in ' + field);
  const expected = name === 'desktop' ? desktop : ['android'];
  const sources = name === 'desktop' ? desktop : platforms;
  if ((prior.androidShard ?? null) !== slot) throw new Error('Wrong evidence shard: ' + dependency);
  const required = new Set(assignedCases(slot).flatMap(test => expected.flatMap(platform => [idFor(test,platform),...sources.map(source => idFor(test,platform,source))])));
  for (const item of prior.executions) {
    if (!required.delete(item.id) || results.has(item.id)) throw new Error('Unexpected or duplicate execution ' + item.id);
    const relative = `cases/${item.id}/result.json`;
    if (item.result !== relative || payload.find(entry => entry.path === relative)?.sha256 !== item.outputSha256) {
      throw new Error('Execution receipt does not match archived result: ' + item.id);
    }
    const result = await read(path.join(source,relative));
    results.set(item.id, {receipt:{...item,phase:name},result});
  }
  summary.dependencies[dependency] = {status:required.size ? 'failed' : prior.status,exitCode:prior.exitCode,runner:prior.runner,artifactFiles:payload.length,
    missingExecutions:[...required],
    manifestSha256:hash(await fs.readFile(path.join(source,'payload-sha256.json'))),suiteSha256:prior.suiteSha256};
  return prior;
}

async function importAndroid() {
  const location = options.get('--android');
  if (!location) throw new Error('Android artifact input directory is required');
  const source = under(runnerTemp, location);
  const phases = [];
  for (let slot=0;slot<shardCount;slot++) {
    const name = 'c004-android-shard-' + slot + '-' + identity.runId + '-' + identity.runAttempt;
    phases.push(await importPhase('android',path.join(source,name),slot));
  }
  const shards = Array.from({length:shardCount},(_,slot)=>summary.dependencies['android-'+slot]);
  const status = statusOf(shards);
  summary.dependencies.android = {status,shards:shards.length,missing:shards.filter(item=>!item.artifactFiles).length};
  const executions = [...results.values()].filter(({receipt})=>receipt.platform==='android').map(({receipt})=>receipt);
  await save(path.join(output,'android-summary.json'),{
    schema:'mytodo-c004-phase',version:1,phase:'android',...identity,
    suiteSha256:summary.suiteSha256,suiteCases:summary.suiteCases,runUrl:summary.runUrl,
    status,exitCode:status==='passed'?0:status==='blocked'?78:1,
    runner:phases[0]?.runner,androidEnvironment:phases[0]?.androidEnvironment,
    executionCounts:count(executions),executions,
    shards:phases.map((phase,index)=>phase ? {index,runner:phase.runner,status:phase.status,exitCode:phase.exitCode,
      androidBuild:phase.androidBuild,androidEnvironment:phase.androidEnvironment} : {index,status:'blocked'}),
  });
}

let windowsExe, androidApk, preparedFile;
let buildAvailability;
const androidSerial = options.get('--android-serial') || process.env.MYTODO_ANDROID_SERIAL;
async function buildWindows() {
  const exe = path.join(output, 'build-windows', 'windows-protocol.exe');
  const build = await command('windows-adapter-build',process.execPath,['tests/protocol-harness/build-windows-protocol.mjs',exe],660000);
  if (build.exitCode === 0) {
    const bytes = await fs.readFile(exe);
    windowsExe = exe;
    summary.windowsBuild = {status:'passed',exitCode:0,sha256:hash(bytes),bytes:bytes.length};
  } else {
    summary.windowsBuild = {status:'failed',exitCode:build.exitCode,signal:build.signal};
  }
}
async function prepareAndroid() {
  const location = options.get('--android-environment');
  let environment;
  if (location) try {environment = await read(under(runnerTemp, location));}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  summary.androidEnvironment = environment ?? {status:'blocked',reason:'No actual GitHub emulator-start receipt was produced'};
  if (!environment) return {status:'blocked',error:summary.androidEnvironment.reason};
  for (const field of ['sourceSha','runId','runAttempt']) {
    if (String(environment[field]) !== String(identity[field])) throw new Error('Emulator receipt does not match the run: ' + field);
  }
  if (environment.status !== 'ready') return {status:environment.status === 'failed' ? 'failed' : 'blocked',error:environment.reason};
  if (!androidSerial || !/^emulator-\d+$/.test(androidSerial) || environment.serial !== androidSerial) {
    throw new Error('Android phase requires the exact serial proven ready by the GitHub emulator receipt');
  }
  const dir = path.join(output, 'build-android');
  const apk = path.join(dir, 'mytodo-c003-test.apk');
  const build = await command('android-adapter-build',process.execPath,['tests/protocol-harness/android/build-android.mjs','--output-dir',dir],660000);
  summary.androidBuild = {status:build.exitCode === 0 ? 'passed' : build.exitCode === 78 ? 'blocked' : 'failed',exitCode:build.exitCode,signal:build.signal};
  if (build.exitCode !== 0) return {status:summary.androidBuild.status,error:'Android adapter build did not complete; inspect tool receipts'};
  androidApk = apk;
  summary.androidBuild.apkSha256 = hash(await fs.readFile(apk));
  const receiptStem = path.join(output,'emulator-prepare.json');
  const prep = await command('android-install',process.execPath,['tests/protocol-harness/android/run-android.mjs',
    '--apk',apk,'--serial',androidSerial,'--output',receiptStem,'--prepare'],180000);
  preparedFile = receiptStem + '.receipt.json';
  const receipt = await read(preparedFile);
  summary.androidPrepare = {status:receipt.status,actualExitCode:prep.exitCode,receipt:relativeFrom(output,preparedFile),receiptSha256:hash(await fs.readFile(preparedFile))};
  if (prep.exitCode !== 0 || receipt.status !== 'passed') {
    return {status:prep.exitCode === 78 ? 'blocked' : 'failed',error:receipt.error || 'Actual emulator install failed'};
  }
  return null;
}

function unavailable(test, platform, source) {
  if (platform === 'android' && buildAvailability) return buildAvailability;
  if (platform === 'windows-c' && !windowsExe && summary.windowsBuild?.status === 'failed') return {status:'failed',error:'Windows native adapter failed to build'};
  if (source) {
    const producer = results.get(idFor(test,source));
    if (!producer?.result?.wire || producer.receipt.status !== 'passed') {
      return {status:!producer || producer.receipt.status === 'blocked' ? 'blocked' : 'skipped',error:'The producer did not provide a verified actual sample'};
    }
  }
  return null;
}

async function execute(test, platform, source) {
  const id = idFor(test,platform,source), mode = source ? 'receive' : 'generate';
  const directory = path.join(output,'cases',id);
  await fs.mkdir(directory,{recursive:true});
  const resultPath = path.join(directory,'result.json');
  const db = path.join(directory,'db'), input = path.join(directory,'input.json');
  const reason = unavailable(test,platform,source);
  const producer = source && results.get(idFor(test,source));
  let result, run, restarted, fixture, driverError;
  if (reason) {
    result = {schema:'mytodo-protocol-harness-result',version:1,caseId:test.id,platform:oldPlatformName(platform),mode,...reason};
    await save(resultPath,result);
  } else {
    let fixtureSuite = suitePath, androidSuite = {...suite,cases:[test]};
    try {
      if (source && test.fixturePlan) {
        const materialized = await materializeFixture({suite,caseId:test.id,sample:producer.result,directory:path.join(directory,'fixture')});
        fixtureSuite = materialized.suiteFile;
        androidSuite = materialized.suite;
        fixture = await startFixtureServer({directory:materialized.directory});
      }
      const common = [mode,'--suite',fixtureSuite,'--case',test.id,'--db-dir',db,'--output',resultPath];
      if (producer) {await save(input,producer.result); common.push('--input',input);}
      if (fixture) common.push('--fixture-url',fixture.origin);
      if (platform === 'android') {
        await save(input,{suite:androidSuite,caseId:test.id,mode,sample:producer?.result,fixtureUrl:fixture?.origin,provenance:{sourceSha:identity.sourceSha}});
        run = await command(id,process.execPath,['tests/protocol-harness/android/run-android.mjs',
          '--apk',androidApk,'--serial',androidSerial,'--input',input,'--output',resultPath,
          '--db-case',id.length <= 80 ? id : 'case-' + hash(id).slice(0,40),'--prepared',preparedFile],500000);
      } else {
        const exe = platform === 'windows-c' ? windowsExe : process.execPath;
        const prefix = platform === 'windows-c' ? [] : ['tests/protocol-harness/js-harness.mjs'];
        run = await command(id,exe,[...prefix,...common]);
        const auditPath = path.join(directory,'process-restart.json');
        if ((await read(resultPath).catch(() => null))?.reopened) {
          const report = await command(id+'-process-restart',exe,[...prefix,'report','--suite',fixtureSuite,'--case',test.id,'--db-dir',db,'--output',auditPath]);
          restarted = {processExitCode:report.exitCode,output:await read(auditPath).catch(() => null)};
        }
      }
    } catch (error) {
      driverError = String(error.stack || error);
    } finally {
      if (fixture) try {await fixture.close();} catch (error) {driverError ??= String(error.stack || error);}
    }
    try {result = await read(resultPath);}
    catch (error) {
      result = {caseId:test.id,platform:oldPlatformName(platform),mode,status:'failed',error:driverError || 'No valid adapter result: '+error.message};
      await save(resultPath,result);
    }
  }
  let verification = {status:reason?.status,checks:[]};
  if (!reason) {
    verification = verifyResult(result,test,suite.defaults);
    const add = (name, ok, detail) => {
      verification.checks.push({name,status:ok?'passed':'failed',detail});
      if (!ok) verification.status = 'failed';
    };
    const expectedCode = result.status === 'passed' ? 0 : result.status === 'blocked' ? platform === 'windows-c' ? 2 : 78 : 1;
    add('actual-process-exit',!!run && run.exitCode === expectedCode,{actual:run?.exitCode ?? null,expected:expectedCode,signal:run?.signal ?? null});
    if (driverError) add('fixture-and-driver',false,driverError);
    if (result.status !== 'blocked') {
      add('source-and-case-identity',result.caseId === test.id && result.mode === mode && result.platform === oldPlatformName(platform) && result.provenance?.sourceSha === identity.sourceSha);
      if (platform === 'android') {
        add('android-closed-database-export',result.sqliteExport?.actualAuditMatches === true && result.sqliteExport?.fileUnchangedByRead === true,result.sqliteExport);
        add('android-actual-process-restart',result.processRestart?.status === 'passed',result.processRestart);
      } else {
        const checked = restarted?.output ? compareRestart(result,restarted.output) : null;
        add('full-actual-process-restart',restarted?.processExitCode === 0 && checked?.status === 'passed',checked);
      }
    }
  }
  const receipt = {id,caseId:test.id,category:test.category,expectationMode:test.expectationMode,phase,platform,mode,sourcePlatform:source ?? null,
    status:verification.status,reason:result.error,executionStatus:result.status,processExitCode:run?.exitCode ?? null,processSignal:run?.signal ?? null,
    executed:!!run,producerSha256:producer?.receipt.outputSha256 ?? null,result:relativeFrom(output,resultPath),
    outputSha256:hash(await fs.readFile(resultPath)),verification};
  await save(path.join(directory,'verification.json'),receipt);
  summary.executions.push(receipt);
  results.set(id,{result,receipt});
}

function semanticStages(result) {
  return (result.stages || []).map(({index,op,before,after}) => ({index,op,before:normalizeAudit(before),after:normalizeAudit(after)}));
}
function resultReference(value) {
  if (!value) return null;
  const {id,phase,status,result,outputSha256,executed,processExitCode} = value.receipt;
  return {id,phase,status,result,outputSha256,executed,processExitCode};
}
function compare(test, left, right, source) {
  const a = results.get(idFor(test,left,source)), b = results.get(idFor(test,right,source));
  const entry = {caseId:test.id,mode:source?'receive':'generate',source:source ?? null,left,right,leftResult:resultReference(a),rightResult:resultReference(b)};
  if (!a || !b) return {...entry,status:'blocked',reason:'The expected phase artifact is unavailable'};
  // The historical C0-03 comparator retains and reports raw wire differences.
  // Across serializers, JSON escaping/number formatting inside an independent
  // batch can differ. This does not waive arrays, parsed fields, or persisted
  // same-sender body bytes used by retry/immutable checks.
  const outcome = compareResults({...a.result,status:a.receipt.status},{...b.result,status:b.receipt.status});
  if (a.receipt.status !== 'passed' || b.receipt.status !== 'passed') {
    const states = [a.receipt.status,b.receipt.status];
    return {...entry,...outcome,status:states.includes('failed')?'failed':states.includes('blocked')?'blocked':'skipped'};
  }
  const rawSame = jsonDigest(normalizeAudit(a.result.raw)) === jsonDigest(normalizeAudit(b.result.raw));
  const stagesA = semanticStages(a.result), stagesB = semanticStages(b.result);
  const stageDifferences = stagesA.flatMap((stage,i) => ['before','after']
    .filter(part => jsonDigest(stage[part]) !== jsonDigest(stagesB[i]?.[part])).map(part => ({index:i,op:stage.op,part,
      leftSha256:jsonDigest(stage[part]),rightSha256:jsonDigest(stagesB[i]?.[part])})));
  const eventsSame = jsonDigest(a.result.wire.events) === jsonDigest(b.result.wire.events);
  const batchSame = jsonDigest(a.result.wire.batch) === jsonDigest(b.result.wire.batch);
  const same = outcome.semanticEqual && outcome.stageAcceptanceEqual && eventsSame && batchSame && rawSame && !stageDifferences.length;
  const batchBytesMatch = a.result.wire.batchBody === b.result.wire.batchBody;
  return {...entry,...outcome,status:same?'passed':'failed',eventsSame,batchSame,rawSame,stageStateDifferences:stageDifferences,
    rawBatchBytesMatch:batchBytesMatch,rawBatchClassification:batchBytesMatch?'identical':batchSame?'same-batch-json-different-serialization':'different-batch-json'};
}

function count(rows) {
  return Object.fromEntries(['passed','failed','blocked','skipped'].map(status => [status,rows.filter(row => row.status === status).length]));
}
function statusOf(rows) {
  if (rows.some(row => row.status === 'failed')) return 'failed';
  if (rows.some(row => row.status !== 'passed')) return 'blocked';
  return 'passed';
}

try {
  if (!/^[0-9a-f]{40}$/.test(identity.sourceSha ?? '') || !identity.runId || !identity.runAttempt) throw new Error('Missing frozen GitHub source/run identity');
  if (new Set(suite.cases.map(test => test.id)).size !== suite.cases.length || suite.cases.some(test => !/^[\w-]{1,80}$/.test(test.id))) {
    throw new Error('Suite contains a duplicate or unsafe case ID');
  }
  const git = await command('git-head','git',['rev-parse','HEAD']);
  if (git.exitCode || git.stdout.trim() !== identity.sourceSha) throw new Error('Checked-out source differs from frozen SHA');
  const clean = await command('git-preflight','git',['status','--porcelain=v1']);
  if (clean.exitCode || clean.stdout.trim()) throw new Error('Protocol checkout must start clean');

  if (phase === 'desktop') await buildWindows();
  else await importPhase('desktop');
  if (phase === 'android') buildAvailability = await prepareAndroid();
  if (phase === 'complete') {
    await importAndroid();
    if (suite.cases.some(test => results.get(idFor(test,'android'))?.receipt.status === 'passed')) await buildWindows();
  }

  for (const test of assignedCases(shard)) {
    if (phase === 'desktop') {
      for (const platform of desktop) await execute(test,platform);
      for (const source of desktop) for (const platform of desktop) await execute(test,platform,source);
    } else if (phase === 'android') {
      await execute(test,'android');
      for (const source of platforms) await execute(test,'android',source);
    } else {
      for (const platform of desktop) await execute(test,platform,'android');
      for (const source of [undefined,...platforms]) for (let i=0; i<platforms.length; i++) {
        for (const right of platforms.slice(i+1)) summary.comparisons.push(compare(test,platforms[i],right,source));
      }
    }
  }
  const unchanged = await command('git-worktree-diff','git',['diff','HEAD','--exit-code']);
  summary.trackedSourceDiffExit = unchanged.exitCode;
  if (phase === 'complete') {
    summary.producerLineage = [...results.values()].filter(({receipt}) => receipt.executed && receipt.sourcePlatform).map(({receipt}) => {
      const producer = results.get(idFor({id:receipt.caseId},receipt.sourcePlatform));
      const match = !!producer && producer.receipt.status === 'passed' && producer.receipt.outputSha256 === receipt.producerSha256;
      return {receiver:receipt.id,producer:producer?.receipt.id,status:match?'passed':'failed',
        expectedProducerSha256:producer?.receipt.outputSha256,recordedProducerSha256:receipt.producerSha256};
    });
  }
  const related = [...summary.executions,...summary.comparisons,...Object.values(summary.dependencies),...(summary.producerLineage || [])];
  summary.status = unchanged.exitCode !== 0 || summary.windowsBuild?.status === 'failed' ? 'failed' : statusOf(related);
} catch (error) {
  summary.status = 'failed';
  summary.error = String(error.stack || error);
  console.error(summary.error);
} finally {
  summary.finishedAt = new Date().toISOString();
  summary.executionCounts = count(summary.executions);
  summary.comparisonCounts = count(summary.comparisons);
  if (phase === 'complete') {
    summary.allExecutionCounts = count([...results.values()].map(value => value.receipt));
    summary.allExecutions = [...results.values()].map(resultReference);
    summary.expectedExecutions = suite.cases.length * 12;
    summary.expectedComparisons = suite.cases.length * 12;
    summary.cJsComparisonCounts = count(summary.comparisons.filter(row => row.left === 'windows-c' && row.right === 'javascript' && row.source !== 'android'));
  }
  summary.exitCode = summary.status === 'passed' ? 0 : summary.status === 'blocked' ? 78 : 1;
  summary.coverage = {actualPublishAckFault:'skipped; C0-07 covers this',independentReceiptTable:'absent in existing production schema'};
  await save(path.join(output,'summary.json'),summary);
  await save(path.join(output,'payload-sha256.json'),await inventory(output));
  console.log(JSON.stringify({phase,...identity,status:summary.status,exitCode:summary.exitCode,
    executionCounts:summary.executionCounts,comparisonCounts:summary.comparisonCounts,allExecutionCounts:summary.allExecutionCounts}));
  process.exitCode = summary.exitCode;
}
