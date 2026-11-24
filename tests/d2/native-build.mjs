// Actions-only native production adapter build and synthetic run.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {rootPath} from './isolation.mjs';
if(process.platform!=='win32'||process.env.RUNNER_OS!=='Windows'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('BLOCKER: GitHub-hosted Windows build only');
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const expectedName='d2-'+process.env.GITHUB_RUN_ID+'-win32';
if(path.basename(process.argv[2]||'')!==expectedName)throw Error('BLOCKER: exact per-run Windows synthetic root required');
let root;
try{await fs.access(path.join(process.argv[2],'.d2-synthetic-only.json'));root=await rootPath(process.argv[2]);}
catch(error){if(error.code!=='ENOENT')throw error;root=await rootPath(process.argv[2],{create:true});}
const build=path.join(root,'native-build');await fs.mkdir(build);
let commandIndex=0,buildEnv={...process.env},firstFailure=null;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const run=(exe,args,timeout=240000)=>new Promise((resolve,reject)=>execFile(exe,args,{cwd:build,env:buildEnv,windowsHide:true,timeout,maxBuffer:32*1024*1024},async(error,stdout,stderr)=>{
 const label='command-'+String(++commandIndex).padStart(2,'0');
 const receipt={argv:[exe,...args],exitCode:error?.code??0,signal:error?.signal??null,killed:error?.killed??false,error:error?.message??null,sourceSha:process.env.GITHUB_SHA};
 try{
  await fs.writeFile(path.join(build,label+'.stdout.log'),stdout,{flag:'wx'});await fs.writeFile(path.join(build,label+'.stderr.log'),stderr,{flag:'wx'});
  await fs.writeFile(path.join(build,label+'.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(error){firstFailure??=receipt;await fs.writeFile(path.join(root,'native-first-error.json'),JSON.stringify(firstFailure,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});reject(error);}else resolve(stdout+'\n'+stderr);
 }catch(writeError){if(error)error.logWriteError=writeError;reject(error||writeError);}
}));
const inventory=JSON.parse(await run('C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe',['-all','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-format','json']));
const vs=inventory.find(v=>v.isComplete);if(!vs)throw Error('BLOCKER: preinstalled MSVC unavailable');
const vcBase=path.join(vs.installationPath,'VC/Tools/MSVC');
const vcVersions=(await fs.readdir(vcBase)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const vc=path.join(vcBase,vcVersions[0]),sdk='C:/Program Files (x86)/Windows Kits/10';
const sdkVersions=(await fs.readdir(path.join(sdk,'Include'))).filter(x=>x.startsWith('10.')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
if(!sdkVersions.length)throw Error('BLOCKER: preinstalled Windows SDK unavailable');const sv=sdkVersions[0];
const originalPath=Object.entries(buildEnv).find(([key])=>key.toLowerCase()==='path')?.[1]||'';
for(const key of Object.keys(buildEnv))if(key.toLowerCase()==='path')delete buildEnv[key];
buildEnv.PATH=path.join(vc,'bin/Hostx64/x64')+path.delimiter+originalPath;
const vendor=path.join(repo,'windows/vendor'),expectedVendor={'sqlite3.c':'254d5579c10ae6a7425ddd055abbdecc5d7b7e6b473ddf28729cd831f25bbd8d','cJSON.c':'7879ae840ed0ac04c121d51423148b954dba0d24f0872d17c1a6e572613ef523'};
const vendorObserved={};for(const [file,expected] of Object.entries(expectedVendor)){const bytes=await fs.readFile(path.join(vendor,file));vendorObserved[file]={expected,actual:hash(bytes),bytes:bytes.length};}
await fs.writeFile(path.join(root,'vendor-identity-receipt.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,files:vendorObserved},null,2)+'\n',{flag:'wx'});
for(const [file,item] of Object.entries(vendorObserved))if(item.expected!==item.actual)throw Error('BLOCKER: reviewed raw vendor identity drift '+file);

// Unambiguous source identity: UTF-8 length fields plus exact checkout source
// bytes, including the actual storage/undo dependencies and bundled SQLite.
const sourceFiles=['windows/migration.c','windows/migration.h','windows/database.c','windows/native.h','windows/util.c','windows/operations.c','windows/ui.h','windows/vendor/sqlite3.c','windows/vendor/sqlite3.h','windows/vendor/cJSON.c','windows/vendor/cJSON.h'];
const chunks=[],sourceReceipt=[];
const encoded=bytes=>Buffer.concat([Buffer.from('S'+bytes.length+':','utf8'),bytes]);
for(const identity of ['mytodo-storage-source-build-v1','mytodo-storage-fingerprint-v1','d1-01-candidate.1','mytodo-storage-infrastructure-0001','0','1',String(sourceFiles.length)])chunks.push(encoded(Buffer.from(identity,'utf8')));
for(const file of sourceFiles){const bytes=await fs.readFile(path.join(repo,file));chunks.push(encoded(Buffer.from(file,'utf8')),encoded(bytes));sourceReceipt.push({file,bytes:bytes.length,sha256:hash(bytes)});}
const implementationChecksum=hash(Buffer.concat(chunks));
const fixtureBytes=await fs.readFile(path.join(here,'shared-fixture.json')),fixtureSha256=hash(fixtureBytes);
await fs.writeFile(path.join(root,'shared-fixture.json'),fixtureBytes,{flag:'wx'});
const injected=path.join(build,'build-identity.h');
await fs.writeFile(injected,'#define MYTODO_STORAGE_BUILD_IDENTITY "'+implementationChecksum+'"\n#define MYTODO_D2_FIXTURE_SHA256 "'+fixtureSha256+'"\n',{flag:'wx'});
await fs.writeFile(path.join(root,'production-source-identity.json'),JSON.stringify({algorithm:'mytodo-storage-source-build-v1',sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,contractId:'d1-01-candidate.1',migrationId:'mytodo-storage-infrastructure-0001',implementationChecksum,files:sourceReceipt,fixtureSha256},null,2)+'\n',{flag:'wx'});
const exe=path.join(build,'d2-native-runner.exe');
const args=['/nologo','/TC','/O1','/Gy','/MT','/std:c11','/utf-8','/W3','/D_CRT_SECURE_NO_WARNINGS','/DSQLITE_ENABLE_JSON1','/DSQLITE_THREADSAFE=1','/DSQLITE_OMIT_LOAD_EXTENSION','/FI'+injected,
 '/I'+vendor,'/I'+path.join(vc,'include'),...['ucrt','shared','um'].map(x=>'/I'+path.join(sdk,'Include',sv,x)),'/Fe:'+exe,
 path.join(here,'native-runner.c'),...['database.c','migration.c','util.c','operations.c'].map(x=>path.join(repo,'windows',x)),path.join(vendor,'sqlite3.c'),path.join(vendor,'cJSON.c'),
 '/link','/SUBSYSTEM:CONSOLE','/OPT:REF','/STACK:4194304','/LIBPATH:'+path.join(vc,'lib/x64'),'/LIBPATH:'+path.join(sdk,'Lib',sv,'ucrt/x64'),'/LIBPATH:'+path.join(sdk,'Lib',sv,'um/x64'),
 'advapi32.lib','ole32.lib','shell32.lib','user32.lib'];
await run(path.join(vc,'bin/Hostx64/x64/cl.exe'),args);
await fs.writeFile(path.join(root,'native-build-receipt.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,toolchain:vc,windowsSdk:sv,exe,sha256:hash(await fs.readFile(exe)),implementationChecksum,productionEntryCompiled:true,actualSources:['windows/database.c','windows/migration.c','windows/util.c','windows/operations.c'],appState:'actual App with existing undo_capture readiness guard; no GUI startup'},null,2)+'\n',{flag:'wx'});
await run(exe,[root],240000);
const results=JSON.parse(await fs.readFile(path.join(root,'results.json'),'utf8'));
if(results.failed!==0||results.passed!==results.total||results.implementationChecksum!==implementationChecksum)throw Error('BLOCKER: actual native suite or build identity verification failed');
console.log(JSON.stringify({root,exe,total:results.total,passed:results.passed,implementationChecksum}));
