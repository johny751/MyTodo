// Separate cloud acceptance of the real packaged, headed Windows CMD entry point.
// CDP only observes that launch; this script never creates/navigates a page or runs business actions.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const env=process.env, out=path.resolve(process.argv[2]||'');
if (process.platform!=='win32'||env.GITHUB_ACTIONS!=='true'||env.RUNNER_OS!=='Windows'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.D4_PREVIEW_CI_INSPECT!=='1'||
    env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||
    !/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'')) {
  throw Error('Explicit hosted Windows Actions launcher observation identity required');
}
const temp=await fs.realpath(env.RUNNER_TEMP), realOut=await fs.realpath(out);
if(process.argv.length!==3||realOut!==out||path.dirname(out)!==temp||!path.basename(out).startsWith('d4-')) {
  throw Error('Use the exact package output directly under RUNNER_TEMP');
}
const helper=fileURLToPath(new URL('./windows-launcher-observation.ps1',import.meta.url));
const powershell=path.join(env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const command=path.join(env.SystemRoot,'System32/cmd.exe');
const screenshotDir=path.join(out,'screenshots');
await fs.mkdir(screenshotDir,{recursive:true});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const json=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const identity=value=>value.runId===env.GITHUB_RUN_ID&&value.runAttempt===env.GITHUB_RUN_ATTEMPT;
const describe=async file=>{const bytes=await fs.readFile(file);return {file:path.basename(file),bytes:bytes.length,sha256:sha256(bytes)};};
const receipt={kind:'d4-03-packaged-windows-launcher-observation',version:1,sourceSHA:env.GITHUB_SHA,
  runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,startedAt:new Date().toISOString(),status:'failed',
  scope:'Exact packaged CMD, installed browser, headed synthetic page readiness only. Separate from full browser regression, original Win32, production integration and user-machine acceptance.',
  runner:{os:env.RUNNER_OS,environment:env.RUNNER_ENVIRONMENT,image:env.ImageOS,imageVersion:env.ImageVersion},
  commands:[],observations:[],runtimeExceptions:[],cdpMethods:[],checks:[],cleanup:{status:'not-started'}};
let scratch, marker, profile, launchAt, expectedExecutable, expectedRawUrl, lastOwnership={processes:[]}, ws, failure;
let sessionId, counter=0;
const pending=new Map();
const check=(name,condition)=>{receipt.checks.push({name,status:condition?'passed':'failed',at:new Date().toISOString()});if(!condition)throw Error(name);};
const childEnv={...env};

async function run(label,executable,args,{timeout=30_000,launch=false}={}) {
  const record={label,executable,args,startedAt:new Date().toISOString(),timeoutMs:timeout};receipt.commands.push(record);
  let stdout='',stderr='',size=0,error,overflow=false,timedOut=false;
  const result=await new Promise(resolve=>{
    let settled=false,timer;
    const child=spawn(executable,args,{env:childEnv,cwd:launch?receipt.isolation.extracted:out,
      windowsHide:!launch,windowsVerbatimArguments:launch,stdio:['ignore','pipe','pipe']});
    const finish=(exitCode,signal)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();resolve({exitCode,signal});};
    record.pid=child.pid??null;
    const capture=(name,bytes)=>{size+=bytes.length;if(size>2*1024*1024){overflow=true;child.kill();return;}if(name==='stdout')stdout+=bytes.toString('utf8');else stderr+=bytes.toString('utf8');};
    child.stdout.on('data',bytes=>capture('stdout',bytes));child.stderr.on('data',bytes=>capture('stderr',bytes));
    child.on('error',value=>{error=String(value);});
    timer=setTimeout(()=>{timedOut=true;child.kill();finish(child.exitCode,child.signalCode);},timeout);
    child.on('close',finish);
    // START may leave the GUI process holding inherited pipe handles. The CMD
    // process's own exit is the invocation result, not GUI descendant close.
    if(launch)child.on('exit',(exitCode,signal)=>setTimeout(()=>finish(exitCode,signal),100));
  });
  const stdoutFile=`launcher-${receipt.commands.length}-${label}-stdout.txt`,stderrFile=`launcher-${receipt.commands.length}-${label}-stderr.txt`;
  await fs.writeFile(path.join(out,stdoutFile),stdout,{flag:'wx'});await fs.writeFile(path.join(out,stderrFile),stderr,{flag:'wx'});
  Object.assign(record,result,{finishedAt:new Date().toISOString(),spawnError:error??null,timedOut,overflow,
    stdout:{...await describe(path.join(out,stdoutFile))},stderr:{...await describe(path.join(out,stderrFile))}});
  if(error||timedOut||overflow||result.exitCode!==0)throw Error(`${label} failed: ${JSON.stringify({error,timedOut,overflow,...result})}`);
  return stdout.replace(/^\uFEFF/,'').trim();
}
async function powershellMode(mode,inputPath,outputPath,ownership=false) {
  const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,
    '-Mode',mode,'-InputPath',inputPath,'-OutputPath',outputPath];
  if(ownership)args.push('-ProfilePath',profile,'-ExpectedExecutable',expectedExecutable,'-ExpectedRawUrl',expectedRawUrl,'-NotBefore',launchAt);
  return JSON.parse(await run(mode,powershell,args));
}
async function inventory() {
  const snapshot=await powershellMode('inventory',out,out,true);
  if(snapshot.root)lastOwnership=snapshot;
  receipt.observations.push(snapshot);
  return snapshot;
}
function send(method,params={},sid) {
  const allowed=new Set(['Browser.getVersion','SystemInfo.getProcessInfo','Target.getTargets','Target.attachToTarget','Runtime.enable','Page.enable','Runtime.evaluate','Page.captureScreenshot']);
  if(!allowed.has(method))throw Error('Unsupported launcher observer CDP method');
  receipt.cdpMethods.push({method,at:new Date().toISOString()});
  return new Promise((resolve,reject)=>{
    const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline: '+method));},10_000);
    pending.set(id,{resolve,reject,timer});
    try{ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
}
const snapshotExpression=`(()=>({href:location.href,readyState:document.readyState,visibility:document.visibilityState,
  title:document.title,readyMarker:!!globalThis.D4Prototype,build:globalThis.D4_BUILD||null,
  route:document.querySelector('main')?.dataset.route||null,appPresent:!!document.querySelector('#app .app-shell'),
  storageKey:globalThis.D4Prototype?.storageKey||null,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}}))()`;

try {
  const packageReceipt=await readJson(path.join(out,'package-receipt.json'));
  check('Exact accepted Windows package source/run/attempt',packageReceipt.kind==='d4-03-verified-experience-archive'&&
    packageReceipt.status==='packaged-and-read-back'&&packageReceipt.platform==='win32'&&packageReceipt.sourceSHA===env.GITHUB_SHA&&identity(packageReceipt));
  check('Package receipt proves exactly ten unique files',Array.isArray(packageReceipt.files)&&packageReceipt.files.length===10&&
    new Set(packageReceipt.files.map(row=>row.file)).size===10&&packageReceipt.verification?.everyEntrySHA256Matched===true&&
    packageReceipt.verification?.launcherTarget==='mytodo-d4-01-demo.html'&&packageReceipt.verification?.launcherExecuted===false);
  check('Expected ZIP archive name',packageReceipt.archive?.file==='mytodo-d4-experience.zip');
  const archive=path.join(out,packageReceipt.archive.file);receipt.archive=await describe(archive);
  check('Exact package ZIP bytes and SHA256',receipt.archive.bytes===packageReceipt.archive.bytes&&receipt.archive.sha256===packageReceipt.archive.sha256);
  receipt.packageReceipt=await describe(path.join(out,'package-receipt.json'));
  scratch=await fs.mkdtemp(path.join(temp,'d4 launcher acceptance '));
  check('Fresh extraction root contains spaces under RUNNER_TEMP',path.dirname(scratch)===temp&&path.basename(scratch).startsWith('d4 launcher acceptance ')&&scratch.includes(' '));
  // CMD expansion metacharacters are never accepted in generated launch paths.
  check('Launch path has no CMD expansion metacharacters',!/["%&|<>^!\r\n]/.test(scratch));
  marker=randomUUID();await fs.writeFile(path.join(scratch,'owned-by-this-check.txt'),marker,{flag:'wx'});
  const extracted=path.join(scratch,'Exact shipped ZIP');await fs.mkdir(extracted);
  childEnv.LOCALAPPDATA=path.join(scratch,'Local App Data');await fs.mkdir(childEnv.LOCALAPPDATA);
  profile=path.join(childEnv.LOCALAPPDATA,'MyTodo-D4-03-Preview','browser-profile');
  receipt.isolation={scratch,extracted,localAppData:childEnv.LOCALAPPDATA,profile,ownershipMarkerSha256:sha256(marker)};
  const entries=await powershellMode('extract',archive,extracted);receipt.extractedEntries=entries;
  check('All ten extracted ZIP files equal package receipt',Array.isArray(entries)&&entries.length===10&&packageReceipt.files.every(expected=>
    entries.some(actual=>actual.file===expected.file&&actual.bytes===expected.bytes&&actual.sha256===expected.sha256)));
  const html=path.join(extracted,'mytodo-d4-01-demo.html'),launcher=path.join(extracted,'open-isolated-preview.cmd');
  receipt.launcher=await describe(launcher);receipt.html=await describe(html);
  const built=await readJson(path.join(extracted,'build-receipt.json'));
  check('Extracted build receipt identity and HTML bytes',built.sourceSha===env.GITHUB_SHA&&identity(built)&&
    built.artifact?.file===path.basename(html)&&built.artifact.bytes===receipt.html.bytes&&built.artifact.sha256===receipt.html.sha256);
  const accepted=await readJson(path.join(extracted,'browser-results.json'));
  check('Preserved full browser report belongs to this accepted package',accepted.status==='passed'&&accepted.sourceSHA===env.GITHUB_SHA&&identity(accepted));
  receipt.fullRegression={file:'browser-results.json',status:accepted.status,sourceSHA:accepted.sourceSHA,
    runId:accepted.runId,runAttempt:accepted.runAttempt,interpretation:'Separate prior direct-browser regression; its counts are not attributed to the launcher-selected browser.'};
  const candidates=[path.join(env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe'),
    path.join(env.ProgramFiles,'Microsoft/Edge/Application/msedge.exe'),path.join(env.ProgramFiles,'Google/Chrome/Application/chrome.exe'),
    path.join(childEnv.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe')];
  receipt.browserCandidates=[];
  for(const candidate of candidates){const exists=await fs.stat(candidate).then(value=>value.isFile()).catch(()=>false);receipt.browserCandidates.push({executable:candidate,exists});if(exists&&!expectedExecutable)expectedExecutable=candidate;}
  check('Launcher preferred installed browser is available',!!expectedExecutable);
  receipt.expectedExecutable=expectedExecutable;
  expectedRawUrl='file:///'+html.replaceAll('\\','/');receipt.expectedURL=pathToFileURL(html).href;
  launchAt=new Date().toISOString();receipt.launchStartedAt=launchAt;
  receipt.invocation={executable:command,args:['/d','/s','/c',`""${launcher}""`],headed:true,ciOptIn:childEnv.D4_PREVIEW_CI_INSPECT,
    localAppData:childEnv.LOCALAPPDATA,entryPoint:'Exact extracted shipped open-isolated-preview.cmd'};
  await run('shipped-cmd',command,receipt.invocation.args,{launch:true,timeout:15_000});
  const activePortFile=path.join(profile,'DevToolsActivePort'),discoveryDeadline=Date.now()+45_000;
  let endpoint;
  while(Date.now()<discoveryDeadline){
    const bytes=await fs.readFile(activePortFile).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(bytes){
      check('Owned DevToolsActivePort is bounded',bytes.length>0&&bytes.length<=4096);
      const lines=bytes.toString('utf8').trim().split(/\r?\n/);
      if(lines.length===2&&/^\d{1,5}$/.test(lines[0])&&Number(lines[0])>0&&Number(lines[0])<65536&&/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(lines[1])){
        endpoint=`ws://127.0.0.1:${lines[0]}${lines[1]}`;
        receipt.devTools={endpoint,profileFile:activePortFile,bytes:bytes.length,sha256:sha256(bytes)};break;
      }
    }
    await sleep(250);
  }
  check('Actual launcher created its owned debug endpoint',!!endpoint);
  const first=await inventory();check('Exactly owned browser process found',!!first.root);
  ws=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP connect deadline')),10_000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP connection failed'));},{once:true});});
  ws.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data);}catch(error){failure||=error;return;}
    if(message.id){const job=pending.get(message.id);if(job){pending.delete(message.id);clearTimeout(job.timer);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);}}
    else if(message.method==='Runtime.exceptionThrown')receipt.runtimeExceptions.push(message.params.exceptionDetails);
  });
  receipt.browserVersion=await send('Browser.getVersion');
  const processes=await send('SystemInfo.getProcessInfo');receipt.cdpProcesses=processes.processInfo;
  check('CDP endpoint belongs to the observed launcher browser PID',processes.processInfo.filter(item=>item.type==='browser').length===1&&processes.processInfo.some(item=>item.type==='browser'&&item.id===first.root.pid));
  let target;const targetDeadline=Date.now()+15_000;
  while(Date.now()<targetDeadline){const targets=await send('Target.getTargets');
    receipt.lastTargets=targets.targetInfos.map(item=>({targetId:item.targetId,type:item.type,url:item.url,title:item.title}));
    const matching=targets.targetInfos.filter(item=>item.type==='page'&&item.url===receipt.expectedURL);
    if(matching.length>1)throw Error('Multiple targets match the exact packaged file');if(matching.length===1){target=matching[0];break;}await sleep(250);
  }
  check('Actual launcher-created page has the exact file URL',!!target);receipt.target={targetId:target.targetId,url:target.url,title:target.title};
  sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
  const readyDeadline=Date.now()+30_000;let page;
  while(Date.now()<readyDeadline){
    const result=await send('Runtime.evaluate',{expression:snapshotExpression,returnByValue:true,awaitPromise:false},sessionId);
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));page=result.result.value;
    if(page?.readyMarker&&page.appPresent&&page.readyState==='complete')break;await sleep(250);
  }
  receipt.page=page;
  check('Actual application ready marker and rendered route',page?.readyMarker===true&&page.appPresent===true&&page.readyState==='complete'&&typeof page.route==='string'&&page.route.length>0);
  check('Observed page and D4_BUILD match this source/run/attempt',page.href===receipt.expectedURL&&page.build?.kind==='d4-03-offline-classic-demo'&&
    page.build.sourceSha===env.GITHUB_SHA&&identity(page.build)&&page.build.storageKey==='mytodo-d4-03-demo-v1'&&
    page.storageKey==='mytodo-d4-03-demo-v1'&&page.build.productionLogicChanged===false&&page.build.productionSyncEnabled===false);
  check('Page viewport is bounded and visible',page.visibility==='visible'&&page.viewport.width>0&&page.viewport.height>0&&
    page.viewport.width<=8192&&page.viewport.height<=8192&&page.viewport.devicePixelRatio>0&&page.viewport.devicePixelRatio<=4);
  const visible=await inventory();receipt.selectedBrowser=visible.root;
  check('Headed browser owns a visible non-minimized window in the interactive session',!!visible.root&&
    visible.root.pid===first.root.pid&&visible.root.createdAt===first.root.createdAt&&visible.controller.interactive===true&&
    visible.controller.sessionId>0&&visible.root.sessionId===visible.controller.sessionId&&visible.root.window.handle!==0&&
    visible.root.window.visible===true&&visible.root.window.minimized===false&&visible.root.window.rectAvailable===true&&
    visible.root.window.right>visible.root.window.left&&visible.root.window.bottom>visible.root.window.top&&
    visible.root.window.intersectsDesktop===true&&
    !visible.root.arguments.some(arg=>/^--headless(?:=|$)/i.test(arg))&&visible.root.arguments.includes('--remote-debugging-address=127.0.0.1')&&
    visible.root.arguments.includes('--remote-debugging-port=0')&&typeof visible.root.productVersion==='string'&&visible.root.productVersion.length>0);
  check('No observed application runtime exceptions',receipt.runtimeExceptions.length===0);
  const fonts=await send('Runtime.evaluate',{expression:`document.fonts.ready.then(()=>({status:document.fonts.status,
    notoLoaded:document.fonts.check('14px "Noto Sans SC"','待办'),faces:[...document.fonts].map(face=>({family:face.family,status:face.status}))}))`,
    returnByValue:true,awaitPromise:true},sessionId);
  if(fonts.exceptionDetails)throw Error(JSON.stringify(fonts.exceptionDetails));receipt.fonts=fonts.result.value;
  check('Embedded Noto Sans SC font is loaded before screenshot',receipt.fonts?.status==='loaded'&&receipt.fonts.notoLoaded===true&&
    receipt.fonts.faces.some(face=>face.family.includes('Noto Sans SC')&&face.status==='loaded'));
  const png=Buffer.from((await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},sessionId)).data,'base64');
  check('Original screenshot is bounded PNG',png.length>24&&png.length<32*1024*1024&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  const original=path.join(screenshotDir,'windows-launcher-original.png'),preview=path.join(screenshotDir,'windows-launcher-preview.jpg');
  await fs.writeFile(original,png,{flag:'wx'});receipt.images=await powershellMode('preview',original,preview);
  receipt.images.original.file='screenshots/'+path.basename(original);receipt.images.preview.file='screenshots/'+path.basename(preview);
  check('Original screenshot retained with proportional small preview',receipt.images.original.sha256===sha256(png)&&
    Math.max(receipt.images.preview.width,receipt.images.preview.height)<=960&&receipt.images.preview.bytes<=204800);
  check('ZIP and prior package receipt remain byte-identical',JSON.stringify(await describe(archive))===JSON.stringify(receipt.archive)&&
    JSON.stringify(await describe(path.join(out,'package-receipt.json')))===JSON.stringify(receipt.packageReceipt));
  check('No application exception observed through screenshot capture',receipt.runtimeExceptions.length===0);
  receipt.observationPassed=true;
} catch(error) {failure=error;receipt.reason=String(error?.stack||error);}
finally {
  if(ws)ws.close();for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Observer closed'));}pending.clear();
  receipt.cleanup={status:'running',startedAt:new Date().toISOString()};
  try {
    if(launchAt&&profile&&expectedExecutable){
      const ownershipFile=path.join(out,'launcher-ownership-before-cleanup.json');await json(ownershipFile,lastOwnership);
      receipt.cleanup.processes=await powershellMode('cleanup',ownershipFile,out,true);
      if(!receipt.cleanup.processes.passed)throw Error('Owned browser process cleanup did not complete');
    }
    if(scratch){
      if(path.dirname(scratch)!==temp||!path.basename(scratch).startsWith('d4 launcher acceptance ')||
          await fs.realpath(scratch)!==scratch||await fs.readFile(path.join(scratch,'owned-by-this-check.txt'),'utf8')!==marker)throw Error('Scratch ownership changed; refusing removal');
      await fs.rm(scratch,{recursive:true,maxRetries:3,retryDelay:250});
      receipt.cleanup.scratchRemoved=await fs.stat(scratch).then(()=>false,error=>{if(error.code==='ENOENT')return true;throw error;});
      receipt.cleanup.profileRemoved=receipt.cleanup.scratchRemoved;
    }
    receipt.cleanup.status='passed';
  }catch(error){receipt.cleanup.status='failed';receipt.cleanup.reason=String(error?.stack||error);failure||=error;}
  receipt.cleanup.finishedAt=new Date().toISOString();receipt.finishedAt=new Date().toISOString();
  receipt.status=!failure&&receipt.observationPassed&&receipt.cleanup.status==='passed'?'passed':'failed';
  await json(path.join(out,'launcher-receipt.json'),receipt);
  console.log(JSON.stringify({status:receipt.status,sourceSHA:receipt.sourceSHA,runId:receipt.runId,runAttempt:receipt.runAttempt,
    observationPassed:receipt.observationPassed??false,cleanup:receipt.cleanup.status,reason:receipt.reason??receipt.cleanup.reason??null}));
  process.exitCode=receipt.status==='passed'?0:1;
}
