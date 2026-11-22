import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sdk=process.env.ANDROID_HOME||'C:/ProgramFolder/IDE/android-sdk-windows';
const javaHome=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio panda4/jbr';
const base=process.env.GXTODO_ANDROID_BUILD_DIR||'M:/dev/gxtodo-android-build';
const info=JSON.parse(await fs.readFile(path.join(root,'dist/android-build.json'),'utf8'));
const serial=process.env.GXTODO_QA_SERIAL||'emulator-5580';
if(serial!=='emulator-5580')throw Error('This test only runs on isolated emulator-5580 / GxTodo_QA');
const tool=path.join(sdk,'build-tools/35.0.0'),platform=path.join(sdk,'platforms/android-34/android.jar');
const java=name=>path.join(javaHome,'bin',name+'.exe');
const adb=path.join(sdk,'platform-tools/adb.exe');
const run=promisify(execFile),env={...process.env,JAVA_HOME:javaHome,TEMP:path.join(base,'tmp'),TMP:path.join(base,'tmp')};
const cmd=(exe,args)=>run(exe,args,{env,windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
const device=args=>cmd(adb,['-s',serial,...args]);
if(!(await device(['emu','avd','name'])).stdout.includes('GxTodo_QA'))throw Error('Wrong AVD');
const build=await fs.mkdtemp(path.join(base,'focus-tests091-'));
for(const dir of ['classes','dex'])await fs.mkdir(path.join(build,dir));
const testPkg='local.gxtodo.replica.qa.focus091';
await fs.writeFile(path.join(build,'AndroidManifest.xml'),'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="'+testPkg+'"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="34"/><application android:label="GxTodo isolated focus tests"/><instrumentation android:name="local.gxtodo.replica.FocusInstrumentedTest" android:targetPackage="local.gxtodo.replica"/></manifest>');
await cmd(java('javac'),['-encoding','UTF-8','--release','8','-classpath',platform+path.delimiter+path.join(info.buildDirectory,'classes.jar'),'-d',path.join(build,'classes'),path.join(root,'tests/android/FocusInstrumentedTest.java')]);
await cmd(java('jar'),['cf',path.join(build,'tests.jar'),'-C',path.join(build,'classes'),'.']);
await cmd(java('java'),['-cp',path.join(tool,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',platform,'--classpath',path.join(info.buildDirectory,'classes.jar'),'--output',path.join(build,'dex'),path.join(build,'tests.jar')]);
const unsigned=path.join(build,'unsigned.apk'),aligned=path.join(build,'aligned.apk'),apk=path.join(build,'focus-tests.apk');
await cmd(path.join(tool,'aapt2.exe'),['link','-I',platform,'--manifest',path.join(build,'AndroidManifest.xml'),'-o',unsigned]);
await cmd(java('jar'),['uf',unsigned,'-C',path.join(build,'dex'),'classes.dex']);
await cmd(path.join(tool,'zipalign.exe'),['-f','-p','4',unsigned,aligned]);
env.GX_FOCUS_TEST_SIGN_PASSWORD=JSON.parse(await fs.readFile(path.join(base,'signing.json'),'utf8')).password;
await cmd(java('java'),['-jar',path.join(tool,'lib/apksigner.jar'),'sign','--ks',path.join(base,'local-development.p12'),'--ks-key-alias','gxtodo-local','--ks-pass','env:GX_FOCUS_TEST_SIGN_PASSWORD','--key-pass','env:GX_FOCUS_TEST_SIGN_PASSWORD','--out',apk,aligned]);
delete env.GX_FOCUS_TEST_SIGN_PASSWORD;
const installed=(await device(['install','-r',apk])).stdout;if(!installed.includes('Success'))throw Error(installed);
await device(['shell','am','force-stop','local.gxtodo.replica']);
try{
 const result=await device(['shell','am','instrument','-w',testPkg+'/local.gxtodo.replica.FocusInstrumentedTest']);
 console.log(result.stdout);
 if(!/Focus instrumentation: \d+ assertions passed/.test(result.stdout)||/FAILED|INSTRUMENTATION_FAILED|Process crashed/.test(result.stdout))throw Error('Device instrumentation failed');
}finally{
 await device(['uninstall',testPkg]); // Only the disposable instrumentation APK created above.
}
console.log('Instrumentation build: '+build);
