import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GUARD,CANDIDATE,hash,freshDirectory,writeFresh} from './guard.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));

export async function build(context,command) {
  const build=await freshDirectory(context.root,'android-build');
  const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME,javaHome=process.env.JAVA_HOME_17_X64||process.env.JAVA_HOME;
  if(!sdk||!javaHome)throw new Error('BLOCKER: preinstalled Android/JDK toolchain not configured');
  const tools=path.join(sdk,'build-tools','35.0.0'),platform=path.join(sdk,'platforms','android-34','android.jar');
  const java=name=>path.join(javaHome,'bin',name);
  for(const file of [platform,path.join(tools,'aapt2'),path.join(tools,'zipalign'),path.join(tools,'lib/d8.jar'),path.join(tools,'lib/apksigner.jar'),java('javac'),java('jar'),java('java'),java('keytool')])await fs.access(file);
  const classes=path.join(build,'classes'),dex=path.join(build,'dex'),assets=path.join(build,'assets'),generated=path.join(build,'generated');
  for(const dir of [classes,dex,assets,generated])await fs.mkdir(dir);
  const source=path.join(here,'FixtureInstrumentation.java'),manifest=path.join(here,'AndroidManifest.xml');
  const metadata={schema:'mytodo-d1-independent-apk',version:1,purpose:'independent-synthetic',guard:GUARD,candidate:CANDIDATE,
    runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceSha:process.env.GITHUB_SHA,
    fixtureSha256:context.fixtureSha256,applicationId:'local.mytodo.d1fixture',versionName:'0.0.1-d1-fixture',versionCode:1,
    builtAtUtc:new Date().toISOString(),buildTimezone:'UTC',author:'by codex',gitShort:process.env.GITHUB_SHA.slice(0,5),
    releaseApk:false,formalSigningUsed:false,productionSourcesLoaded:false,feedbackAarLoaded:false,
    versionHistory:[{versionName:'0.0.1-d1-fixture',versionCode:1,changes:'Independent synthetic framework SQLite/JSONObject generator; no UI or production entry'}],
    sources:{'FixtureInstrumentation.java':hash(await fs.readFile(source)),'AndroidManifest.xml':hash(await fs.readFile(manifest))},
    toolchain:{}};
  for(const [label,exe,args] of [['java-version',java('java'),['-version']],['javac-version',java('javac'),['-version']],
    ['aapt2-version',path.join(tools,'aapt2'),['version']],['d8-version',java('java'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--version']]]) {
    const observed=await command(label,exe,args);metadata.toolchain[label]={stdout:observed.stdout.toString('utf8'),stderr:observed.stderr.toString('utf8')};
  }
  await writeFresh(path.join(assets,'fixture.json'),context.fixtureBytes);
  await writeFresh(path.join(assets,'build-metadata.json'),Buffer.from(JSON.stringify(metadata,null,2)+'\n'));
  const unsigned=path.join(build,'unsigned.apk'),aligned=path.join(build,'aligned.apk'),apk=path.join(build,'mytodo-d1-fixture.apk');
  await command('aapt2-link',path.join(tools,'aapt2'),['link','-o',unsigned,'--manifest',manifest,'-I',platform,'--java',generated,'-A',assets]);
  await command('javac',java('javac'),['-encoding','UTF-8','--release','17','-classpath',platform,'-d',classes,source]);
  const jar=path.join(build,'classes.jar');await command('jar',java('jar'),['cf',jar,'-C',classes,'.']);
  await command('d8',java('java'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',platform,'--output',dex,jar]);
  const names=(await fs.readdir(dex)).filter(name=>/^classes(?:\d+)?\.dex$/.test(name)).sort();if(!names.includes('classes.dex'))throw new Error('D8 produced no primary dex');
  await command('apk-dex',java('jar'),['uf',unsigned,...names.flatMap(name=>['-C',dex,name])]);
  await command('zipalign',path.join(tools,'zipalign'),['-f','-p','4',unsigned,aligned]);
  const key=path.join(build,'synthetic-d1-signing.p12');
  await command('synthetic-keytool',java('keytool'),['-genkeypair','-keystore',key,'-storetype','PKCS12','-storepass','d1-test-only','-keypass','d1-test-only',
    '-alias','d1-test','-keyalg','RSA','-keysize','2048','-validity','1','-dname','CN=MyTodo D1 independent synthetic CI','-noprompt']);
  await command('apksigner',java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'sign','--ks',key,'--ks-key-alias','d1-test',
    '--ks-pass','pass:d1-test-only','--key-pass','pass:d1-test-only','--out',apk,aligned]);
  const verify=await command('apksigner-verify',java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'verify','--verbose','--print-certs',apk]);
  const entries=(await command('apk-list',java('jar'),['tf',apk])).stdout.toString('utf8').split(/\r?\n/);
  for(const name of ['assets/fixture.json','assets/build-metadata.json','classes.dex'])if(!entries.includes(name))throw new Error('Missing independent APK entry '+name);
  if(entries.some(name=>name.includes('feedback-kit')||name.startsWith('assets/src/')))throw new Error('BLOCKER: production assets/AAR appeared in isolated APK');
  const result={...metadata,status:'passed',apk,apkSha256:hash(await fs.readFile(apk)),apkBytes:(await fs.stat(apk)).size,
    certificateVerification:verify.stdout.toString('utf8'),completedAtUtc:new Date().toISOString()};
  await writeFresh(path.join(context.root,'android-build-receipt.json'),Buffer.from(JSON.stringify(result,null,2)+'\n'));return result;
}
