import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {freshDirectory,writeFresh} from '../../d1-01/android/guard.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const enc=value=>{const b=Buffer.from(value,'utf8');return Buffer.concat([Buffer.from('S'+b.length+':'),b]);};
export async function build(context,command){
  const folder=await freshDirectory(context.root,'android-build'),sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME,jdk=process.env.JAVA_HOME_17_X64||process.env.JAVA_HOME;
  if(!sdk||!jdk)throw Error('BLOCKER: preinstalled SDK/JDK missing');
  const tools=path.join(sdk,'build-tools/35.0.0'),platform=path.join(sdk,'platforms/android-34/android.jar'),java=name=>path.join(jdk,'bin',name);
  const productionNames=['ReplicaDatabase.java','MigrationRegistry.java','ReplicaTaskRecord.java','DailyTaskPolicy.java'];
  const base=path.join(repo,'android/src/local/gxtodo/replica'),sources=productionNames.map(n=>path.join(base,n));
  const identity=[enc('mytodo-storage-fingerprint-v2'),enc('implementation'),enc('mytodo-storage-infrastructure-0001'),enc('d1-01-candidate.1')],inputs=[];
  for(let i=0;i<sources.length;i++){const bytes=await fs.readFile(sources[i]),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),relative='android/src/local/gxtodo/replica/'+productionNames[i];identity.push(enc(relative),enc(text));inputs.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}
  const checksum=hash(Buffer.concat(identity)),fixture=await fs.readFile(path.join(repo,'tests/d2/shared-fixture.json'));
  const classes=path.join(folder,'classes'),dex=path.join(folder,'dex'),assets=path.join(folder,'assets'),generated=path.join(folder,'generated');for(const dir of [classes,dex,assets,generated])await fs.mkdir(dir);
  const compiled=path.join(generated,'D2CompiledIdentity.java');await writeFresh(compiled,Buffer.from('package local.gxtodo.replica; final class D2CompiledIdentity {static final String CHECKSUM="'+checksum+'";}\n'));
  const metadata={framework:'d2-real-storage-api-v1',contractId:'d1-01-candidate.1',runId:context.runId,runAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceSha:process.env.GITHUB_SHA,
    implementationChecksum:checksum,implementationSources:inputs,sharedFixtureSha256:hash(fixture),productionStorageSourcesCompiled:true,productionAppEntryLoaded:false,
    applicationId:'local.mytodo.d2storage',versionName:'0.0.1-d2-storage',versionCode:1,builtAtUtc:new Date().toISOString(),buildTimezone:'UTC',author:'by codex',gitShort:process.env.GITHUB_SHA.slice(0,5),
    versionHistory:[{versionName:'0.0.1-d2-storage',versionCode:1,changes:'Independent synthetic caller of branch production storage API; no launcher, INTERNET or startup migration'}]};
  await writeFresh(path.join(assets,'build-metadata.json'),Buffer.from(JSON.stringify(metadata,null,2)+'\n'));await writeFresh(path.join(assets,'shared-fixture.json'),fixture);
  const unsigned=path.join(folder,'unsigned.apk'),aligned=path.join(folder,'aligned.apk'),apk=path.join(folder,'mytodo-d2-storage.apk'),manifest=path.join(here,'AndroidManifest.xml');
  if(/uses-permission|MainActivity|android.intent.action.MAIN/.test(await fs.readFile(manifest,'utf8')))throw Error('BLOCKER: forbidden app entry/permission');
  await command('d2-aapt2',path.join(tools,'aapt2'),['link','-o',unsigned,'--manifest',manifest,'-I',platform,'-A',assets]);
  await command('d2-javac',java('javac'),['-encoding','UTF-8','--release','17','-classpath',platform,'-d',classes,...sources,compiled,path.join(here,'D2StorageInstrumentation.java')]);
  const jar=path.join(folder,'classes.jar');await command('d2-jar',java('jar'),['cf',jar,'-C',classes,'.']);
  await command('d2-d8',java('java'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',platform,'--output',dex,jar]);
  const names=(await fs.readdir(dex)).filter(n=>/^classes(?:\d+)?\.dex$/.test(n));if(!names.includes('classes.dex'))throw Error('No actual API dex');
  await command('d2-insert-dex',java('jar'),['uf',unsigned,...names.flatMap(n=>['-C',dex,n])]);
  await command('d2-align',path.join(tools,'zipalign'),['-f','-p','4',unsigned,aligned]);
  const key=path.join(folder,'d2-synthetic.p12');await command('d2-test-key',java('keytool'),['-genkeypair','-keystore',key,'-storetype','PKCS12','-storepass','d2-test-only','-keypass','d2-test-only','-alias','d2-test','-keyalg','RSA','-keysize','2048','-validity','1','-dname','CN=MyTodo D2 synthetic API','-noprompt']);
  await command('d2-sign',java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'sign','--ks',key,'--ks-key-alias','d2-test','--ks-pass','pass:d2-test-only','--key-pass','pass:d2-test-only','--out',apk,aligned]);
  await command('d2-sign-check',java('java'),['-jar',path.join(tools,'lib/apksigner.jar'),'verify','--verbose','--print-certs',apk]);
  const receipt={...metadata,status:'built',apk,apkBytes:(await fs.stat(apk)).size,apkSha256:hash(await fs.readFile(apk)),formalReleaseSigning:false};await writeFresh(path.join(context.root,'android-build-receipt.json'),Buffer.from(JSON.stringify(receipt,null,2)+'\n'));return receipt;
}
