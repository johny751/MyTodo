import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('C006 builds require GitHub Actions Windows.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const output=path.resolve(process.argv[2]||'');
const rel=path.relative(path.resolve(process.env.RUNNER_TEMP||''),output);
if(!process.env.RUNNER_TEMP||!process.argv[2]||!path.isAbsolute(process.argv[2])||!rel||path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep))throw Error('Absolute new output beneath RUNNER_TEMP required.');
const run=(exe,args)=>new Promise(resolve=>execFile(exe,args,{cwd:root,windowsHide:true,maxBuffer:16*1024*1024,timeout:600000},(error,stdout,stderr)=>resolve({exitCode:error?typeof error.code==='number'?error.code:null:0,signal:error?.signal||null,stdout,stderr})));
const git=await run('git',['rev-parse','HEAD']);const sourceSha=git.stdout.trim(),expected=process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA;
if(git.exitCode!==0||!/^[a-f0-9]{40}$/.test(sourceSha)||sourceSha!==expected)throw Error('Frozen source SHA mismatch.');
const recipeFile=path.join(root,'scripts/build-windows.mjs'),syncFile=path.join(root,'windows/sync.c'),databaseFile=path.join(root,'windows/database.c');
const original=await fs.readFile(recipeFile,'utf8'),sync=await fs.readFile(syncFile),database=await fs.readFile(databaseFile);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const replacements=[["'main.c','util.c'","'../tests/c006/windows/migration-native.c','util.c'"],["'sync.c','gui.c'","'gui.c'"],['/SUBSYSTEM:WINDOWS','/SUBSYSTEM:CONSOLE']];
let adapted=original;for(const [from,to]of replacements){if(adapted.split(from).length!==2)throw Error('Reviewed native recipe marker changed.');adapted=adapted.replace(from,to);}
const marker="const args=['/nologo',";if(adapted.split(marker).length!==2)throw Error('Native builder arguments marker changed.');
const definitions=['/DGX_C006_SYNC_SOURCE="'+syncFile.replaceAll('\\','/')+'"','/DGX_C006_SOURCE_SHA="'+sourceSha+'"','/DGX_C006_SYNC_SHA256="'+digest(sync)+'"','/DGX_C006_DATABASE_SHA256="'+digest(database)+'"'];
adapted=adapted.replace(marker,marker+definitions.map(value=>JSON.stringify(value)).join(',')+',');
const tempRecipe=path.join(root,'scripts','.c006-build-'+crypto.randomUUID()+'.mjs');
await fs.mkdir(path.dirname(output),{recursive:true});
try{await fs.access(output);throw Error('Existing output refused.');}catch(error){if(error.code!=='ENOENT')throw error;}
const receipt={sourceSha,startedAt:new Date().toISOString(),finishedAt:null,productionSyncSha256:digest(sync),productionDatabaseSha256:digest(database),builderSha256:digest(Buffer.from(original)),adaptedBuilderSha256:digest(Buffer.from(adapted)),harnessSha256:digest(await fs.readFile(path.join(root,'tests/c006/windows/migration-native.c'))),recipeChanges:replacements,productionSourceModified:false,transportSeam:'WinHttpOpen, WinHttpConnect and WinHttpOpenRequest API wrappers in test translation unit; no-proxy, loopback port, TLS removed only for fixture',exitCode:null,outputSha256:null};
try{await fs.writeFile(tempRecipe,adapted,{flag:'wx'});const result=await run(process.execPath,[tempRecipe,output,'--public-release']);receipt.exitCode=result.exitCode;receipt.signal=result.signal;await fs.writeFile(path.join(path.dirname(output),'native-build.stdout.log'),result.stdout);await fs.writeFile(path.join(path.dirname(output),'native-build.stderr.log'),result.stderr);if(result.exitCode===0)receipt.outputSha256=digest(await fs.readFile(output));}finally{await fs.unlink(tempRecipe).catch(()=>{});receipt.finishedAt=new Date().toISOString();await fs.writeFile(path.join(path.dirname(output),'native-build-receipt.json'),JSON.stringify(receipt,null,2));}
console.log(JSON.stringify(receipt));if(receipt.exitCode!==0)process.exitCode=1;
