import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),e=process.env;
if(e.GITHUB_ACTIONS!=='true'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||
 execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('Exact cloud candidate identity required');
const input=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||''),temp=await fs.realpath(e.RUNNER_TEMP);
if(path.dirname(output)!==temp||!path.basename(output).startsWith('d4-platform-'))throw Error('Fresh direct RUNNER_TEMP/d4-platform-* output required');
const bytes=await fs.readFile(input),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const receipt=JSON.parse(await fs.readFile(path.join(path.dirname(input),'build-receipt.json'),'utf8'));
if(receipt.sourceSha!==e.GITHUB_SHA||receipt.runId!==e.GITHUB_RUN_ID||receipt.runAttempt!==e.GITHUB_RUN_ATTEMPT||
 receipt.artifact.sha256!==hash(bytes)||receipt.artifact.file!==path.basename(input))throw Error('Single HTML artifact must match this Actions build receipt');
const reused=[['prototypes/d4-03-platforms/android/src/local/gxtodo/replica/PomodoroClock.java','1ad9c070920ae62f2abf707e843ecd315434db1d11018f693747d59f7b42af39'],
 ['tests/d4-03-platforms/jvm/PomodoroClockTest.java','4f253e97d96ecba12045fa1c836abbdcbec34b5b854363e7e8948585a5e58b9a']];
for(const [name,expected] of reused)if(hash(await fs.readFile(path.join(root,name)))!==expected)throw Error('Frozen reuse byte mismatch: '+name);
const runNumber=Number(e.GITHUB_RUN_NUMBER),versionCode=403000+runNumber;
if(!Number.isSafeInteger(runNumber)||runNumber<1||versionCode>2147483647)throw Error('Valid Actions run number required for isolated versionCode');
const identity={packageName:'local.gxtodo.d403preview',versionName:'0.3.'+runNumber,versionCode,
 sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,buildTimeUTC:new Date().toISOString(),
 syntheticOnly:true,networkPermission:false,productionStorage:false,productionSync:false,
 reusedSourceSHA:'d4c5af4cbbb9192c19276dd371bd142c2b835534',reusedFiles:reused.map(([file,sha256])=>({file,sha256}))};
await fs.mkdir(output);
await fs.mkdir(path.join(output,'assets'));
await fs.mkdir(path.join(output,'generated/local/gxtodo/d403preview'),{recursive:true});
const history=[{versionName:identity.versionName,versionCode,sourceSHA:e.GITHUB_SHA,buildTimeUTC:identity.buildTimeUTC,
 changes:['D4-03 mobile-first synthetic UI in independent Android WebView.','Frozen original PomodoroClock with independent elapsedRealtime timer experience.','No production database, credentials, networking or sync enabled.']}];
await fs.writeFile(path.join(output,'assets/index.html'),bytes);
await fs.writeFile(path.join(output,'assets/version-history.json'),JSON.stringify(history,null,2)+'\n');
const historyText=identity.versionName+' / code '+versionCode+'\n'+identity.buildTimeUTC+' UTC\n'+history[0].changes.join('\n');
const java='package local.gxtodo.d403preview;\npublic final class BuildInfo {\n'+
 'public static final String VERSION_NAME='+JSON.stringify(identity.versionName)+';\npublic static final int VERSION_CODE='+versionCode+';\n'+
 'public static final String SOURCE_SHA='+JSON.stringify(e.GITHUB_SHA)+';\npublic static final String BUILD_TIME_UTC='+JSON.stringify(identity.buildTimeUTC)+';\n'+
 'public static final String HISTORY_TEXT='+JSON.stringify(historyText)+';\n}\n';
await fs.writeFile(path.join(output,'generated/local/gxtodo/d403preview/BuildInfo.java'),java);
const manifest=(await fs.readFile(path.join(root,'prototypes/d4-03-platforms/android/AndroidManifest.xml'),'utf8'))
 .replace('__VERSION_CODE__',String(versionCode)).replace('__VERSION_NAME__',identity.versionName);
await fs.writeFile(path.join(output,'AndroidManifest.xml'),manifest);
await fs.writeFile(path.join(output,'platform-build-identity.json'),JSON.stringify({...identity,html:{file:path.basename(input),sha256:hash(bytes),bytes:bytes.length}},null,2)+'\n');
await fs.copyFile(path.join(root,'prototypes/d4-03-platforms/windows/open-isolated-preview.cmd'),path.join(output,'open-isolated-preview.cmd'));
await fs.copyFile(input,path.join(output,'mytodo-d4-03-demo.html'));
console.log(JSON.stringify({status:'prepared',output,...identity}));
