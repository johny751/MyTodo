// Controlled conversion of the known pure baseline graph; no npm/bundler dependency.
// The resulting document contains one classic script and is usable from Windows file://.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceSha=process.env.GITHUB_SHA,runId=process.env.GITHUB_RUN_ID,runAttempt=process.env.GITHUB_RUN_ATTEMPT;
if(process.env.GITHUB_ACTIONS!=='true'||!/^[a-f0-9]{40}$/.test(sourceSha||'')||!/^\d+$/.test(runId||'')||!/^\d+$/.test(runAttempt||'')||process.env.EXPECTED_SOURCE_SHA!==sourceSha)throw Error('D4 build requires exact authorized Actions source/run/attempt');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim()!==sourceSha)throw Error('D4 checkout SHA differs from requested source');
const requested=process.argv[2];if(!requested||!path.isAbsolute(requested))throw Error('Use build-demo.mjs <fresh absolute RUNNER_TEMP/d4-output-directory>');
const temp=await fs.realpath(process.env.RUNNER_TEMP),output=path.resolve(requested);
if(path.dirname(output)!==temp||!path.basename(output).startsWith('d4-'))throw Error('D4 output must be a direct fresh RUNNER_TEMP/d4-* directory');

const graph=[
 'src/task-tree.mjs','src/schedule.mjs','src/model.mjs','src/sync-core.mjs',
 'src/task-editor.mjs','src/personal-ui.mjs','prototypes/d4-01/domain.mjs'
];
const known=new Set(graph),modules=new Map(),inputs=[];
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function readBytes(relative){const bytes=await fs.readFile(path.join(ROOT,relative));inputs.push({path:relative,bytes:bytes.length,sha256:sha256(bytes)});return bytes;}
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
async function read(relative){return decode(await readBytes(relative));}
const identifier=/^[A-Za-z_$][\w$]*$/;
function compileModule(relative,source){
 const dependencies=[],bindings=[];
 let body=source.replace(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2\s*;[ \t]*(?:\r?\n|$)/gm,(_,names,_quote,specifier)=>{
  if(!specifier.startsWith('.'))throw Error('D4 unexpected nonlocal import '+specifier);
  const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier));
  if(!known.has(dependency))throw Error('D4 import outside approved pure graph '+dependency);
  const converted=names.split(',').map(part=>{
   const [name,alias,...extra]=part.trim().split(/\s+as\s+/);
   if(extra.length||!identifier.test(name)||alias&&!identifier.test(alias))throw Error('D4 unsupported named import '+part);
   return alias?name+':'+alias:name;
  }).join(',');
  dependencies.push(dependency);bindings.push('const {'+converted+'}=__D4Modules['+JSON.stringify(dependency)+'];');return '';
 });
 const exported=[];
 for(const match of body.matchAll(/^[ \t]*export\s+(?:(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*))/gm))exported.push(match[1]||match[2]);
 if(!exported.length||new Set(exported).size!==exported.length)throw Error('D4 missing/duplicate exports '+relative);
 body=body.replace(/^[ \t]*export\s+(?=(?:async\s+)?function\b|(?:const|let)\b)/gm,'');
 if(/^[ \t]*(?:import\b|export\b)/m.test(body)||/\bimport\s*\(/.test(body))throw Error('D4 unsupported residual ESM syntax '+relative);
 return {dependencies,exports:exported,code:'__D4Modules['+JSON.stringify(relative)+']=(()=>{\n'+bindings.join('\n')+'\n'+body+'\nreturn Object.freeze({'+exported.join(',')+'});\n})();'};
}
for(const relative of graph)modules.set(relative,compileModule(relative,await read(relative)));
const ordered=[],visiting=new Set(),visited=new Set();
function visit(relative){if(visited.has(relative))return;if(visiting.has(relative))throw Error('D4 cyclic pure graph '+relative);visiting.add(relative);for(const dependency of modules.get(relative).dependencies)visit(dependency);visiting.delete(relative);visited.add(relative);ordered.push(relative);}
visit('prototypes/d4-01/domain.mjs');if(ordered.length!==graph.length)throw Error('D4 graph includes unused/untracked modules');
let html=await read('prototypes/d4-01/index.html');
const css=await read('prototypes/d4-01/styles.css'),pages=await read('prototypes/d4-01/work-pages.js'),app=await read('prototypes/d4-01/app.js'),personal=await read('prototypes/d4-01/personal-pages.js'),mobile=await read('prototypes/d4-01/mobile-controls.js');
const fontPath='prototypes/d4-01/fonts/NotoSansSC-VF.ttf',oflPath='prototypes/d4-01/fonts/OFL.txt',copyrightPath='prototypes/d4-01/fonts/COPYRIGHT.txt';
const fontBytes=await readBytes(fontPath),fontSha256=sha256(fontBytes);
if(fontBytes.length!==17773244||fontSha256!=='763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a')throw Error('D4 embedded font differs from the approved local Noto Sans SC asset');
const oflBytes=await readBytes(oflPath),copyrightBytes=await readBytes(copyrightPath),ofl=decode(oflBytes),copyright=decode(copyrightBytes);
if(!/SIL\s+OPEN\s+FONT\s+LICENSE\s+(?:Version\s+)?1\.1/i.test(ofl)||!['PREAMBLE','DEFINITIONS','TERMINATION','DISCLAIMER'].every(section=>ofl.includes(section))||!/PERMISSION\s*(?:&|AND)\s*CONDITIONS/i.test(ofl)||!/copyright/i.test(copyright))throw Error('D4 full font license/copyright notice is missing or unsupported');
const font={family:'Noto Sans SC',sha256:fontSha256,bytes:fontBytes.length,license:'OFL-1.1'};
const fontFace='/* Noto Sans SC: SIL OFL 1.1; full notices in #d4-font-license and the package. */\n@font-face{font-family:"Noto Sans SC";font-style:normal;font-weight:100 900;font-display:swap;src:url("data:font/ttf;base64,'+fontBytes.toString('base64')+'") format("truetype");}\n';
const escapeNotice=value=>value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const fontLicenseMarkup='<template id="d4-font-license" data-license="OFL-1.1"><pre>'+escapeNotice(copyright+'\n\n'+ofl)+'</pre></template>\n';
html=html.replace(/<link\b[^>]*href\s*=\s*['"](?:\.\/)?styles\.css['"][^>]*>/gi,'');
html=html.replace(/<script\b[^>]*src\s*=\s*['"](?:\.\/)?(?:domain\.mjs|work-pages\.js|personal-pages\.js|mobile-controls\.js|app\.js)['"][^>]*>\s*<\/script\s*>/gi,'');
if(/<script\b|<link\b[^>]*(?:rel\s*=\s*['"]stylesheet['"]|href\s*=\s*['"](?:https?:|\/\/))/i.test(html))throw Error('D4 HTML contains an unsupported script/stylesheet dependency');
if(/@import\b/i.test(css)||/<\/style/i.test(css))throw Error('D4 stylesheet contains an external import or closing style token');
for(const match of css.matchAll(/url\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi))if(!/^(?:data:|#)/i.test(match[2].trim()))throw Error('D4 stylesheet references an unbundled asset');
if(/<(?:img|iframe|audio|video|source)\b[^>]*\b(?:src|poster)\s*=\s*['"](?!(?:data:|#))[^'"]+['"]/i.test(html))throw Error('D4 HTML references an unbundled media asset');
if(!/<\/head\s*>/i.test(html)||!/<\/body\s*>/i.test(html))throw Error('D4 template lacks head/body closing tags');
const buildTimeUtc=new Date().toISOString();
const identity={kind:'d4-03-offline-classic-demo',sourceSha,runId,runAttempt,buildTimeUtc,coreVersion:2,storageKey:'mytodo-d4-03-demo-v1',font,productionLogicChanged:false,productionSyncEnabled:false};
const script='"use strict";\n(()=>{\nconst __D4Modules=Object.create(null);\n'+ordered.map(relative=>modules.get(relative).code).join('\n')+'\nglobalThis.DemoDomain=__D4Modules["prototypes/d4-01/domain.mjs"];\nglobalThis.D4_BUILD=Object.freeze('+JSON.stringify(identity)+');\n'+pages+'\n'+personal+'\n'+mobile+'\n'+app+'\n})();\n';
new vm.Script(script,{filename:'d4-01-offline-bundle.js'}); // GHA syntax compilation only; no browser/UI code executes here.
html=html.replace(/<\/head\s*>/i,()=>'<style data-d4-inline="styles">\n'+fontFace+css+'\n</style>\n</head>');
html=html.replace(/<\/body\s*>/i,()=>fontLicenseMarkup+'<script data-d4-inline="classic">\n'+script.replace(/<\/script/gi,'<\\/script')+'\n</script>\n</body>');
if(/<script\b[^>]*(?:\bsrc\s*=|\btype\s*=\s*['"]module['"])/i.test(html)||/<link\b[^>]*rel\s*=\s*['"]stylesheet['"]/i.test(html))throw Error('D4 offline artifact retains external/module dependencies');
await fs.mkdir(output);const artifact=Buffer.from(html,'utf8'),filename='mytodo-d4-01-demo.html';
await fs.writeFile(path.join(output,filename),artifact,{flag:'wx'});
await fs.writeFile(path.join(output,'OFL.txt'),oflBytes,{flag:'wx'});await fs.writeFile(path.join(output,'COPYRIGHT.txt'),copyrightBytes,{flag:'wx'});
const fontLicense={id:'OFL-1.1',fullNoticesEmbedded:true,ofl:{source:oflPath,file:'OFL.txt',bytes:oflBytes.length,sha256:sha256(oflBytes)},copyright:{source:copyrightPath,file:'COPYRIGHT.txt',bytes:copyrightBytes.length,sha256:sha256(copyrightBytes)}};
const receipt={...identity,status:'built',browserRuntime:'UNVERIFIED until UI acceptance',scriptSyntaxCompiled:true,inputs,fontLicense,dependencyGraph:ordered.map(relative=>({path:relative,dependencies:modules.get(relative).dependencies,exports:modules.get(relative).exports})),artifact:{file:filename,bytes:artifact.length,sha256:sha256(artifact)},limitations:['Discussion prototype and isolated synthetic data only.','No platform final implementation or production storage/sync is activated.','file:// persistence can fall back to memory when the browser restricts localStorage.']};
await fs.writeFile(path.join(output,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'built',sourceSha,output,artifact:receipt.artifact,pureModules:ordered.length}));
