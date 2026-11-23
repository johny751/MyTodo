import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {captureRemoteFile} from '../protocol-harness/android/remote-file-evidence.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Android evidence verification runs only on GitHub');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const serial = option('--serial'), preparedPath = option('--prepared'), outputArg = option('--output');
if (!args.includes('--output') || !outputArg || !process.env.RUNNER_TEMP) throw Error('RUNNER_TEMP output is required');
const output = path.resolve(outputArg), relative = path.relative(path.resolve(process.env.RUNNER_TEMP),output);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Output must be below RUNNER_TEMP');
if (!/^emulator-[0-9]+$/.test(serial || '') || !preparedPath) throw Error('Prepared emulator is required');
const sourceSha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(sourceSha || '') || sourceSha !== process.env.EXPECTED_SOURCE_SHA) throw Error('Source SHA mismatch');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
if (!sdk) throw Error('Android SDK is required');
const adb = path.join(sdk,'platform-tools',process.platform === 'win32' ? 'adb.exe' : 'adb');
const packageName = 'local.gxtodo.protocolharness';
const selected = (...argv) => ['-s',serial,...argv];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const must = (condition,message) => { if (!condition) throw Error(message); };
const summary = {schema:'mytodo-android-observation-verification',version:1,sourceSha,
  runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,serial,
  status:'failed',startedAt:new Date().toISOString(),commands:[],tests:[],sourceHashes:{},
  physicalCrashRecoveryClaimed:false};
await fs.mkdir(path.join(output,'commands'),{recursive:true});

async function command(label,argv,{input,binary=false,timeout=10000}={}) {
  const entry = {label,command:[adb,...argv],startedAt:new Date().toISOString()};
  const index = summary.commands.push(entry);
  const result = await new Promise(resolve => {
    const child = spawn(adb,argv,{env:process.env,windowsHide:true});
    const chunks = []; let stderr = '',timedOut=false,spawnError=null,stdinError=null,hardTimer;
    const timer = setTimeout(() => {timedOut=true;child.kill('SIGTERM');hardTimer=setTimeout(()=>child.kill('SIGKILL'),1500);},timeout);
    child.stdout.on('data',bytes=>chunks.push(bytes));
    child.stderr.on('data',bytes=>stderr+=bytes.toString('utf8'));
    child.on('error',error=>{spawnError=String(error);});
    child.stdin.on('error',error=>{stdinError=String(error);});
    child.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardTimer);const bytes=Buffer.concat(chunks);
      resolve({code,signal,timedOut,spawnError,stdinError,stderr,stdout:binary?'':bytes.toString('utf8'),bytes});});
    child.stdin.end(input);
  });
  const prefix=path.join(output,'commands',String(index).padStart(3,'0')+'-'+label);
  await fs.writeFile(prefix+'.stdout.bin',result.bytes,{flag:'wx'});
  await fs.writeFile(prefix+'.stderr.txt',result.stderr,{flag:'wx'});
  Object.assign(entry,{exitCode:result.code,signal:result.signal,timedOut:result.timedOut,spawnError:result.spawnError,
    stdinError:result.stdinError,completedAt:new Date().toISOString(),stdoutPath:prefix+'.stdout.bin',
    stdoutBytes:result.bytes.length,stdoutSha256:hash(result.bytes),stderrPath:prefix+'.stderr.txt',stderrSha256:hash(Buffer.from(result.stderr))});
  return {...result,log:prefix+'.stdout.bin',logSha256:hash(result.bytes)};
}
function accepted(result,label) {
  must(result.code===0&&!result.signal&&!result.timedOut&&!result.spawnError&&!result.stdinError&&!result.stderr.trim(),label+' failed');
  return result;
}
async function test(id,run) {
  const entry={id,status:'failed',startedAt:new Date().toISOString()};summary.tests.push(entry);
  try {entry.evidence=await run();entry.status='passed';}
  catch(error){entry.error=String(error.stack||error);}
  entry.completedAt=new Date().toISOString();
}

try {
  const preparedBytes=await fs.readFile(preparedPath),prepared=JSON.parse(preparedBytes);
  for(const [key,value] of Object.entries({sourceSha,serial,runId:summary.runId,runAttempt:summary.runAttempt})) must(prepared[key]===value,'Prepared identity differs: '+key);
  must(prepared.status==='passed'&&prepared.exitCode===0&&prepared.installedPackage?.startsWith('package:'),'No successful same-run install');
  summary.preparedSha256=hash(preparedBytes);summary.apkSha256=prepared.apkSha256;
  for(const file of ['tests/protocol-harness/android/remote-file-evidence.mjs','tests/protocol-harness/android/run-android.mjs','tests/android-observation/verify-remote-file-evidence.mjs']) summary.sourceHashes[file]=hash(await fs.readFile(file));
  accepted(await command('device-state',selected('get-state')),'device state');
  accepted(await command('stop-isolated-package',selected('shell','am','force-stop',packageName)),'stop');
  const remoteRoot='files/evidence-verification-'+crypto.randomBytes(8).toString('hex');
  summary.remoteRoot=remoteRoot;
  accepted(await command('create-case-directory',selected('shell','run-as',packageName,'mkdir','-p',remoteRoot)),'create synthetic directory');
  async function put(name,bytes) {
    const result=accepted(await command('put-'+name,selected('shell','-T','run-as',packageName,'tee',remoteRoot+'/'+name),{input:bytes,binary:true}),'write synthetic file');
    must(result.bytes.equals(bytes),'Synthetic file tee changed bytes');
  }
  async function capture(id,name,{sqlite=false,observe=command}={}) {
    const directory=path.join(output,'cases',id);await fs.mkdir(directory,{recursive:true});
    const result=await captureRemoteFile({packageName,remote:remoteRoot+'/'+name,name,directory,observe,selected,sqlite});
    await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
    return result;
  }
  const fixturePath=path.join(output,'synthetic-source.sqlite');
  const database=new DatabaseSync(fixturePath);
  try {database.exec("CREATE TABLE evidence(id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO evidence VALUES(1,'synthetic observation fixture');");}
  finally {database.close();}
  const sqliteBytes=await fs.readFile(fixturePath);
  await put('present.sqlite',sqliteBytes);
  await test('present-sqlite',async()=>{
    const result=await capture('present-sqlite','present.sqlite',{sqlite:true});
    must(result.state==='preserved'&&result.sqliteHeaderValid&&result.localReadbackVerified&&result.sha256===hash(sqliteBytes),'Real SQLite not verified');return result;
  });
  await test('missing-file',async()=>{
    const result=await capture('missing-file','missing.sqlite',{sqlite:true});
    must(result.state==='unavailable'&&result.before.valid&&result.before.reason==='missing'&&!result.path&&!result.transfer,'Missing file was copied or claimed preserved');
    return result;
  });
  await test('actual-adb-error-mapping',async()=>{
    const shell=await command('shell-exit37',selected('shell','-T',"run-as local.gxtodo.protocolharness sh -c 'printf stdout-marker; printf stderr-marker >&2; exit 37'"));
    must(shell.code===37&&shell.stdout==='stdout-marker'&&shell.stderr==='stderr-marker'&&!shell.signal&&!shell.timedOut,'shell -T stdout/stderr/remote exit mapping differs');
    const legacy=await command('exec-out-missing',selected('exec-out','run-as',packageName,'cat',remoteRoot+'/missing.sqlite'),{binary:true});
    const combined=legacy.bytes.toString('utf8')+legacy.stderr;
    must(!legacy.signal&&!legacy.timedOut&&!legacy.spawnError&&combined.includes('missing.sqlite')&&/No such file|not found/i.test(combined),'No actual missing-file diagnostic was observed');
    return {shell:{exitCode:shell.code,stdout:shell.stdout,stderr:shell.stderr},execOut:{exitCode:legacy.code,stdoutBytes:legacy.bytes.length,stdoutSha256:hash(legacy.bytes),stdoutText:legacy.bytes.toString('utf8'),stderr:legacy.stderr},claim:'exec-out exit status alone is never used to accept captured evidence'};
  });
  await put('empty-wal',Buffer.alloc(0));
  await test('present-empty-sidecar',async()=>{
    const result=await capture('present-empty-sidecar','empty-wal');must(result.state==='preserved'&&result.bytes===0&&result.sha256===hash(Buffer.alloc(0)),'Empty existing file not verified');return result;
  });
  const sidecar=Buffer.from([0,255,10,13,0,128,42,0]);await put('binary-shm',sidecar);
  await test('binary-sidecar-bytes',async()=>{
    const result=await capture('binary-sidecar-bytes','binary-shm');must(result.state==='preserved'&&result.sha256===hash(sidecar),'Binary bytes changed');return result;
  });
  await put('invalid.sqlite',Buffer.from('cat: synthetic missing database\n'));
  await test('invalid-sqlite-header',async()=>{
    const result=await capture('invalid-sqlite-header','invalid.sqlite',{sqlite:true});
    must(result.state==='unavailable'&&result.reason==='invalid-sqlite-header'&&result.diagnostic?.stdoutPath&&!result.path,'Error-like text accepted as SQLite');return result;
  });
  accepted(await command('create-non-file',selected('shell','run-as',packageName,'mkdir',remoteRoot+'/directory')),'make directory');
  await test('non-regular-file',async()=>{const result=await capture('non-regular-file','directory');must(result.state==='unavailable'&&result.reason==='not-regular'&&!result.transfer,'Directory copied');return result;});
  await put('unreadable',Buffer.from('private synthetic bytes'));
  accepted(await command('make-unreadable',selected('shell','run-as',packageName,'chmod','000',remoteRoot+'/unreadable')),'chmod unreadable');
  await test('unreadable-file',async()=>{const result=await capture('unreadable-file','unreadable');must(result.state==='unavailable'&&result.reason==='unreadable'&&!result.transfer,'Unreadable file accepted');return result;});
  await test('rejected-error-text-with-adb-zero',async()=>{
    let altered=false;
    const observe=async(label,argv,options)=>{const actual=await command(label,argv,options);if(argv.includes('exec-out')){altered=true;return {...actual,code:0,signal:null,stderr:'',bytes:Buffer.from('cat: missing file\n')};}return actual;};
    const result=await capture('rejected-error-text-with-adb-zero','present.sqlite',{sqlite:true,observe});
    must(altered&&result.state==='unavailable'&&result.reason==='copy-size-or-sha256-mismatch'&&result.diagnostic?.stdoutPath&&!result.path,'Injected exec-out error text accepted');
    const failedSidecar=await capture('rejected-sidecar-with-adb-zero','binary-shm',{observe});
    must(failedSidecar.before.state==='available'&&failedSidecar.state==='unavailable'&&failedSidecar.reason==='copy-size-or-sha256-mismatch'&&!failedSidecar.path,'Existing sidecar copy error accepted');
    return {main:result,sidecar:failedSidecar,transportFault:'Explicit test-only replacement of actual transfer result; remote probes are real'};
  });
  await put('changing.sqlite',sqliteBytes);
  await test('source-changed-between-probes',async()=>{
    let changed=false;
    const observe=async(label,argv,options)=>{if(label.startsWith('probe-after-')){await put('changing.sqlite',Buffer.from('changed synthetic source'));changed=true;}return command(label,argv,options);};
    const result=await capture('source-changed-between-probes','changing.sqlite',{sqlite:true,observe});
    must(changed&&result.state==='unavailable'&&result.reason==='remote-source-changed-or-unavailable'&&result.diagnostic?.stdoutPath&&!result.path,'Changed source claimed stable');return result;
  });
  for(const [file,sha] of Object.entries(summary.sourceHashes)) must(hash(await fs.readFile(file))===sha,'Source changed during test: '+file);
  must(summary.tests.length===10&&summary.tests.every(test=>test.status==='passed'),'One or more directed evidence checks failed');
  summary.status='passed';
} catch(error) {summary.error=String(error.stack||error);}
finally {
  summary.completedAt=new Date().toISOString();summary.executed=summary.tests.length;
  summary.passed=summary.tests.filter(test=>test.status==='passed').length;summary.failed=summary.tests.filter(test=>test.status!=='passed').length;
  await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});
  process.exitCode=summary.status==='passed'?0:1;
}
