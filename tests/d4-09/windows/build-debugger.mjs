// Build only the external debugger, on the explicitly authorized Actions job.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const e=process.env,root=process.cwd(),output=path.resolve(process.argv[2]||'');
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(process.platform,'win32');
assert.equal(e.GITHUB_WORKFLOW,'D4-09 candidate UI crash diagnostics');
assert.equal(e.GITHUB_REF,'refs/heads/d4/d4-09-design-candidate-1');
assert.equal(e.GITHUB_SHA,e.EXPECTED_SOURCE_SHA);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),e.GITHUB_SHA);
assert.ok(output.toLowerCase().startsWith(path.resolve(e.RUNNER_TEMP).toLowerCase()+path.sep));
assert.equal(fs.existsSync(output),false,'Never overwrite an earlier debugger build');
fs.mkdirSync(output);
const run=(exe,args)=>execFileSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:180000});
const vswhere='C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe';
const vs=JSON.parse(run(vswhere,['-all','-products','*','-format','json'])).find(v=>v.isComplete);
assert.ok(vs,'The product build uses the existing MSVC installation');
const tools=path.join(vs.installationPath,'VC/Tools/MSVC');
const vc=path.join(tools,fs.readdirSync(tools).sort().reverse()[0]);
const sdk='C:/Program Files (x86)/Windows Kits/10';
const version=fs.readdirSync(path.join(sdk,'Include')).filter(v=>/^10\./.test(v)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).reverse()[0];
const source=path.join(root,'tests/d4-09/windows/legacy-debugger.c');
const binary=path.join(output,'legacy-debugger.exe');
const args=['/nologo','/TC','/O1','/Zi','/MT','/W4','/utf-8','/D_CRT_SECURE_NO_WARNINGS',
  '/I'+path.join(vc,'include'),...['ucrt','shared','um'].map(v=>'/I'+path.join(sdk,'Include',version,v)),
  '/Fo:'+path.join(output,'legacy-debugger.obj'),'/Fd:'+path.join(output,'compiler.pdb'),'/Fe:'+binary,source,
  '/link','/DEBUG:FULL','/INCREMENTAL:NO','/OPT:REF','/OPT:ICF','/PDB:'+path.join(output,'legacy-debugger.pdb'),
  '/LIBPATH:'+path.join(vc,'lib/x64'),'/LIBPATH:'+path.join(sdk,'Lib',version,'ucrt/x64'),
  '/LIBPATH:'+path.join(sdk,'Lib',version,'um/x64'),'dbghelp.lib','kernel32.lib'];
let log='';try{log=run(path.join(vc,'bin/Hostx64/x64/cl.exe'),args);}catch(error){log=String(error.stdout||'')+String(error.stderr||'');throw error;}finally{fs.writeFileSync(path.join(output,'build.log'),log);}
console.log(log);
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({schemaVersion:1,sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,
  compiler:path.join(vc,'bin/Hostx64/x64/cl.exe'),sdkVersion:version,args,sourceSha256:hash(source),
  executable:{file:binary,bytes:fs.statSync(binary).size,sha256:hash(binary)},
  pdb:{file:path.join(output,'legacy-debugger.pdb'),sha256:hash(path.join(output,'legacy-debugger.pdb'))},
  modifiesProductBinary:false,productionAdmission:false},null,2)+'\n');
