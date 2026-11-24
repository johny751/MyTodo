import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import {cloudRoot} from './android/guard.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('GitHub Windows synthetic build only');
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const context=await cloudRoot(process.argv[2],'win32'),root=context.root;
const build=path.join(root,'native-build');await fs.mkdir(build);
let commandIndex=0,buildEnv={...process.env};
const run=(exe,args)=>new Promise((resolve,reject)=>execFile(exe,args,{cwd:build,env:buildEnv,windowsHide:true,timeout:240000,maxBuffer:16*1024*1024},async(error,stdout,stderr)=>{
  const label='command-'+String(++commandIndex).padStart(2,'0');
  try{
    await fs.writeFile(path.join(build,label+'.stdout'),stdout);await fs.writeFile(path.join(build,label+'.stderr'),stderr);
    await fs.writeFile(path.join(build,label+'.json'),JSON.stringify({argv:[exe,...args],exitCode:error?.code??0,signal:error?.signal??null,killed:error?.killed??false,error:error?.message??null},null,2)+'\n');
    if(error)reject(error);else resolve(stdout+'\n'+stderr);
  }catch(writeError){if(error)error.logWriteError=writeError;reject(error||writeError);}
}));
const inventory=JSON.parse(await run('C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe',['-all','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-format','json']));
const vs=inventory.find(v=>v.isComplete);if(!vs)throw Error('BLOCKER: preinstalled MSVC unavailable');
const vcBase=path.join(vs.installationPath,'VC/Tools/MSVC');const vcVersions=(await fs.readdir(vcBase)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const vc=path.join(vcBase,vcVersions[0]),sdk='C:/Program Files (x86)/Windows Kits/10';
const originalPath=Object.entries(buildEnv).find(([key])=>key.toLowerCase()==='path')?.[1]||'';
for(const key of Object.keys(buildEnv))if(key.toLowerCase()==='path')delete buildEnv[key];
buildEnv.PATH=path.join(vc,'bin/Hostx64/x64')+path.delimiter+originalPath;
const sv=(await fs.readdir(path.join(sdk,'Include'))).filter(x=>x.startsWith('10.')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0];
const vendor=path.join(repo,'windows/vendor'),expected={'sqlite3.c':'254d5579c10ae6a7425ddd055abbdecc5d7b7e6b473ddf28729cd831f25bbd8d','cJSON.c':'7879ae840ed0ac04c121d51423148b954dba0d24f0872d17c1a6e572613ef523'};
const vendorObserved={};
for(const [file,expectedHash] of Object.entries(expected)){
  const bytes=await fs.readFile(path.join(vendor,file));
  const buffer=Buffer.allocUnsafe(bytes.length);let length=0;const newlineCounts={crlf:0,bareCR:0,bareLF:0};
  for(let i=0;i<bytes.length;i++){
    if(bytes[i]===13&&bytes[i+1]===10){buffer[length++]=10;i++;newlineCounts.crlf++;}
    else{buffer[length++]=bytes[i];if(bytes[i]===13)newlineCounts.bareCR++;if(bytes[i]===10)newlineCounts.bareLF++;}
  }
  vendorObserved[file]={expectedHash,checkoutHash:crypto.createHash('sha256').update(bytes).digest('hex'),
    normalizedLFHash:crypto.createHash('sha256').update(buffer.subarray(0,length)).digest('hex'),checkoutBytes:bytes.length,normalizedBytes:length,newlineCounts};
}
await run('git',['-C',repo,'config','--show-origin','--get-regexp','^core\\.(autocrlf|eol)$']);
await run('git',['-C',repo,'check-attr','--all','--','windows/vendor/sqlite3.c','windows/vendor/cJSON.c']);
await fs.writeFile(path.join(root,'vendor-identity-receipt.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,normalization:'diagnostic byte CRLF-to-LF only; acceptance uses raw checkout hash',files:vendorObserved},null,2)+'\n');
for(const [file,item] of Object.entries(vendorObserved))if(item.checkoutHash!==item.expectedHash)throw Error('BLOCKER: reviewed vendor identity drift '+file);
const exe=path.join(build,'d1-native-generator.exe');
const args=['/nologo','/TC','/O1','/MT','/std:c11','/utf-8','/W3','/D_CRT_SECURE_NO_WARNINGS','/DSQLITE_ENABLE_JSON1','/DSQLITE_THREADSAFE=1','/DSQLITE_OMIT_LOAD_EXTENSION','/I'+vendor,'/I'+path.join(vc,'include'),...['ucrt','shared','um'].map(x=>'/I'+path.join(sdk,'Include',sv,x)),'/Fe:'+exe,path.join(here,'native-generator.c'),path.join(vendor,'sqlite3.c'),path.join(vendor,'cJSON.c'),'/link','/SUBSYSTEM:CONSOLE','/LIBPATH:'+path.join(vc,'lib/x64'),'/LIBPATH:'+path.join(sdk,'Lib',sv,'ucrt/x64'),'/LIBPATH:'+path.join(sdk,'Lib',sv,'um/x64'),'advapi32.lib'];
const output=await run(path.join(vc,'bin/Hostx64/x64/cl.exe'),args);await fs.writeFile(path.join(build,'build.stdout.log'),output);
await fs.writeFile(path.join(root,'native-build-receipt.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,toolchain:vc,windowsSdk:sv,exe,sha256:crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex'),vendor:expected,productionEntryCompiled:false},null,2)+'\n');
console.log(exe);
