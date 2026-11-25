import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const e=process.env;
if(e.GITHUB_ACTIONS!=='true'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)
 throw Error('Actions-only exact candidate scope checks');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function files(dir){const entries=await fs.readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(x=>x.isDirectory()?files(dir+'/'+x.name):dir+'/'+x.name))).flat();}
test('frozen original timer and original JVM suite are byte-for-byte preserved',async()=>{
 assert.equal(hash(await fs.readFile('prototypes/d4-03-platforms/android/src/local/gxtodo/replica/PomodoroClock.java')),'1ad9c070920ae62f2abf707e843ecd315434db1d11018f693747d59f7b42af39');
 assert.equal(hash(await fs.readFile('tests/d4-03-platforms/jvm/PomodoroClockTest.java')),'4f253e97d96ecba12045fa1c836abbdcbec34b5b854363e7e8948585a5e58b9a');
});
test('Android preview and tests have isolated identities with zero permissions',async()=>{
 const manifest=await fs.readFile('prototypes/d4-03-platforms/android/AndroidManifest.xml','utf8');
 assert.match(manifest,/package="local\.gxtodo\.d403preview"/);assert.doesNotMatch(manifest,/<uses-permission\b/);
 assert.match(manifest,/allowBackup="false"/);assert.doesNotMatch(manifest,/<service\b/);
 const tests=await fs.readFile('tests/d4-03-platforms/android/AndroidManifest.xml','utf8');
 assert.match(tests,/package="local\.gxtodo\.d403preview\.tests"/);assert.match(tests,/targetPackage="local\.gxtodo\.d403preview"/);assert.doesNotMatch(tests,/<uses-permission\b/);
});
test('app neither imports test tools nor exposes production storage or native bridge',async()=>{
 const list=await files('prototypes/d4-03-platforms/android/src');
 for(const file of list){const source=await fs.readFile(file,'utf8');assert.doesNotMatch(source,/import\s+.*(?:tests|SQLite|GxNative)/,file);assert.doesNotMatch(source,/getExternalFilesDir|getExternalStorageDirectory|AccountManager|WebDav|ServerSocket|OkHttp|HttpURLConnection/,file);}
 const source=await fs.readFile('prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/MainActivity.java','utf8');
 assert.match(source,/addJavascriptInterface\(new PreviewBridge\(\), "GxD4Preview"\)/);
 assert.doesNotMatch(source,/addJavascriptInterface\([^;\n]*"GxNative"/);
 assert.match(source,/setAllowFileAccess\(false\)/);assert.match(source,/setAllowContentAccess\(false\)/);
 assert.match(source,/if\(window\.D4PreviewBack\)return window\.D4PreviewBack\(\)/);
 assert.doesNotMatch(source,/dispatchEvent.*gx-back/);
});
test('actual native touch runner and exact cloud evidence assertions remain mandatory',async()=>{
 const source=await fs.readFile('tests/d4-03-platforms/android/local/gxtodo/d403preview/tests/PreviewInstrumentation.java','utf8');
 assert.match(source,/getUiAutomation\(\)\.injectInputEvent\(event,true\)/);assert.match(source,/SOURCE_TOUCHSCREEN/);
 assert.match(source,/61000L/);assert.match(source,/reopen-for-isolated-test/);assert.match(source,/completedSessionsToday/);
 const runner=await fs.readFile('tests/d4-03-platforms/run-instrumentation.sh','utf8');
 assert.match(runner,/ANDROID_SERIAL/);assert.match(runner,/pm clear local\.gxtodo\.d403preview/);
 assert.doesNotMatch(runner,/pm clear local\.gxtodo(?:\s|$)|uninstall local\.gxtodo(?:\s|$)/);
 const verifier=await fs.readFile('tests/d4-03-platforms/verify-native-report.mjs','utf8');
 assert.match(verifier,/required\.some/);assert.match(verifier,/r\.failed!==0/);assert.match(verifier,/r\.sourceSha!==e\.GITHUB_SHA/);
});
test('independent Windows experience uses only already-installed browser and separate profile',async()=>{
 const source=await fs.readFile('prototypes/d4-03-platforms/windows/open-isolated-preview.cmd','utf8');
 assert.match(source,/MyTodo-D4-03-Preview/);assert.match(source,/--user-data-dir/);assert.match(source,/--app/);
 assert.doesNotMatch(source,/Invoke-WebRequest|curl|https?:\/\/|mytodo\.db|gxtodo\.db/i);
});
