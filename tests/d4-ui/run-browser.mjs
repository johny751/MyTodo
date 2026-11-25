import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,appendFileSync,statSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {runCases} from './interaction-cases.mjs';
import {runWorkCases} from './work-cases.mjs';
import {runPersonalCases} from './personal-cases.mjs';
import {runMobileCases} from './mobile-cases.mjs';
import {runRegressionCases} from './regression-cases.mjs';
import {runLegacyCases} from './legacy-cases.mjs';
import {runMobileDateFilterCase} from './mobile-datefilter-case.mjs';
const env=process.env,out=resolve(process.argv[2]||''),html=join(out,'mytodo-d4-01-demo.html');
if(env.GITHUB_ACTIONS!=='true'||!env.GITHUB_RUN_ID||!env.GITHUB_RUN_ATTEMPT||env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('Hosted Actions identity required');
if(!env.RUNNER_TEMP||relative(resolve(env.RUNNER_TEMP),out).startsWith('..')||out===resolve(env.RUNNER_TEMP)||!existsSync(html))throw Error('Expected fresh synthetic artifact under RUNNER_TEMP');
const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!executable)throw Error('Hosted Chrome unavailable; no download fallback');
const screenshots=join(out,'screenshots');mkdirSync(screenshots);
const events=[],checks=[],errors=[],requests=[],blocked=[],protocolErrors=[];let chrome,ws,counter=0,failed;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function serialize(error){return {name:error?.name,message:String(error?.message||error),stack:error?.stack};}
const report={kind:'D4 synthetic real-browser validation',sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,platform:process.platform,checks,errors,requests,blocked,protocolErrors,startedAt:new Date().toISOString()};
// One fresh-profile process and one connection share a fixed monotonic startup deadline.
const chromeProfile=join(out,'chrome-synthetic-profile'),startupClock=performance.now(),startupBudgetMs=60000,startupDeadline=startupClock+startupBudgetMs;
let chromeFailure=null,startupReady=false,rejectStartupPending=()=>{};
const startup={kind:'D4 hosted browser startup diagnostics',sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,platform:process.platform,arch:process.arch,nodeVersion:process.version,runnerOS:env.RUNNER_OS,runnerArch:env.RUNNER_ARCH,imageOS:env.ImageOS,imageVersion:env.ImageVersion,executable,profile:chromeProfile,endpointDiscovery:'validated stderr or fresh-profile DevToolsActivePort; require agreement when both available',endpointMatched:false,startupBudgetMs,deadlineClock:'performance.now',deadlineScope:'spawn through CDP setup',pollIntervalMs:100,spawnLimit:1,connectionLimit:1,stage:'before-spawn',events:[],observations:[],streams:{stdout:{file:'chrome-startup-stdout.txt',bytes:0,savedBytes:0},stderr:{file:'chrome-startup-stderr.txt',bytes:0,savedBytes:0}},diagnosticErrors:[]};
function diagnosticError(where,error){if(startup.diagnosticErrors.length<20)startup.diagnosticErrors.push({where,...serialize(error)});}
function writeStartup(){try{writeFileSync(join(out,'chrome-startup-diagnostics.json'),JSON.stringify(startup,null,2)+'\n');}catch(error){diagnosticError('write-startup',error);}}
function startupEvent(type,details={}){startup.events.push({type,at:new Date().toISOString(),elapsedMs:performance.now()-startupClock,...details});writeStartup();}
function diagnosticFile(path,includeText=false){
 try{const info=statSync(path),result={exists:true,bytes:info.size,modifiedAt:info.mtime.toISOString(),isFile:info.isFile()};if(includeText&&info.isFile()){if(info.size<=4096)result.text=readFileSync(path,'utf8');else result.textOmitted='Larger than 4096-byte diagnostic limit';}return result;}
 catch(error){return error.code==='ENOENT'?{exists:false}:{error:serialize(error)};}
}
function observeStartup(phase){startup.observations.push({phase,at:new Date().toISOString(),elapsedMs:performance.now()-startupClock,pid:chrome?.pid??null,exitCode:chrome?.exitCode??null,signalCode:chrome?.signalCode??null,killed:chrome?.killed??false,profileExists:existsSync(chromeProfile),devToolsActivePort:diagnosticFile(join(chromeProfile,'DevToolsActivePort'),true)});writeStartup();}
function captureStartupStream(name,chunk){
 const stream=startup.streams[name];stream.bytes+=chunk.length;const remaining=Math.max(0,1048576-stream.savedBytes);
 try{if(remaining){const saved=chunk.subarray(0,remaining);appendFileSync(join(out,stream.file),saved);stream.savedBytes+=saved.length;}}catch(error){diagnosticError('capture-'+name,error);}
 stream.omittedBytes=stream.bytes-stream.savedBytes;
}
function startupRemaining(stage){
 if(chromeFailure)throw chromeFailure;
 if(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null||chrome.killed))throw Error('Chrome exited before startup completed');
 const remaining=startupDeadline-performance.now();if(remaining<=0)throw Error('Chrome startup deadline exceeded during '+stage+' after '+startupBudgetMs+' ms');return remaining;
}
function validateDebuggerEndpoint(value,source){
 const pattern=/^ws:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const match=pattern.exec(value);if(!match||Number(match[1])>65535)throw Error('Invalid Chrome debugger endpoint in '+source);return value;
}
function debuggerEvidence(stderr){
 // Only complete stderr lines count. A partially written port file remains pending.
 const stderrEndpoints=[...new Set([...stderr.matchAll(/^DevTools listening on ([^\r\n]+)\r?\n/gm)].map(match=>validateDebuggerEndpoint(match[1],'stderr')))];
 if(stderrEndpoints.length>1)throw Error('Conflicting Chrome debugger endpoints in stderr');
 const stderrEndpoint=stderrEndpoints[0]||null,file=diagnosticFile(join(chromeProfile,'DevToolsActivePort'),true);let fileEndpoint=null,fileState='absent';
 if(file.error)throw Error('Cannot inspect Chrome DevToolsActivePort: '+file.error.message);
 if(file.exists){
  if(!file.isFile||typeof file.text!=='string')throw Error('Chrome DevToolsActivePort is not a bounded text file');
  const match=/^([1-9]\d{0,4})\r?\n(\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\r?\n)?$/i.exec(file.text);
  fileState=match?'valid':'pending-invalid-or-partial';
  if(match)fileEndpoint=validateDebuggerEndpoint('ws://127.0.0.1:'+match[1]+match[2],'DevToolsActivePort');
 }
 if(stderrEndpoint&&fileEndpoint&&stderrEndpoint!==fileEndpoint)throw Error('Chrome stderr and DevToolsActivePort endpoints disagree');
 const endpoint=file.exists&&!fileEndpoint?null:(fileEndpoint||stderrEndpoint);
 startup.endpointEvidence={stderrEndpoint,fileEndpoint,fileState,selectedEndpoint:endpoint,selectedFrom:fileEndpoint?(stderrEndpoint?'both':'DevToolsActivePort'):(stderrEndpoint?'stderr':null),elapsedMs:performance.now()-startupClock};
 return endpoint;
}
startup.executableFile=diagnosticFile(executable);
for(const stream of Object.values(startup.streams)){try{writeFileSync(join(out,stream.file),'');}catch(error){diagnosticError('initialize-'+stream.file,error);}}
observeStartup('before-spawn');
let send;
try {
 if(existsSync(chromeProfile))throw Error('Chrome synthetic profile must not exist before its only startup');
 startupRemaining('before-spawn');
 startup.stage='spawn';
 chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+chromeProfile,'about:blank'],{stdio:['ignore','pipe','pipe']});
 let stderr='';chrome.stderr.on('data',chunk=>{stderr+=chunk;captureStartupStream('stderr',chunk);});chrome.stdout.on('data',chunk=>captureStartupStream('stdout',chunk));
 chrome.on('spawn',()=>startupEvent('spawn',{pid:chrome.pid}));
 chrome.on('error',e=>{chromeFailure=e;errors.push(serialize(e));startupEvent('process-error',{error:serialize(e)});if(!startupReady)rejectStartupPending(e);});
 chrome.on('exit',(code,signal)=>{chromeFailure=Error('Chrome exited: code='+code+' signal='+signal);startupEvent('process-exit',{code,signal,cleanupRequested:!!startup.cleanupRequestedAt});if(!startupReady)rejectStartupPending(chromeFailure);});
 chrome.on('close',(code,signal)=>startupEvent('process-close',{code,signal,cleanupRequested:!!startup.cleanupRequestedAt}));
 chrome.stdout.on('error',e=>startupEvent('stdout-error',{error:serialize(e)}));chrome.stderr.on('error',e=>startupEvent('stderr-error',{error:serialize(e)}));
 startup.stage='debugger-endpoint-poll';observeStartup('after-spawn-call');
 let devtools,pollCount=0,nextObservationMs=5000;
 while(!devtools){
  startupRemaining('debugger-endpoint-poll');pollCount++;devtools=debuggerEvidence(stderr);startup.pollCount=pollCount;
  if(devtools){startupRemaining('debugger-endpoint-selected');break;}
  if(performance.now()-startupClock>=nextObservationMs){observeStartup('debugger-still-pending');nextObservationMs+=5000;}
  await wait(Math.min(startup.pollIntervalMs,startupRemaining('debugger-endpoint-poll')));
 }
 startup.endpointMatched=true;startup.selectedEndpoint=devtools;observeStartup('debugger-poll-finished');
 startup.stage='websocket-connect';observeStartup('before-websocket-connect');
 const pending=new Map();startupRemaining('before-websocket-connect');ws=new WebSocket(devtools);await new Promise((resolve,reject)=>{
  const remaining=startupRemaining('websocket-connect');let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);ws.removeEventListener('open',onOpen);ws.removeEventListener('error',onError);ws.removeEventListener('close',onClose);chrome.removeListener('error',onError);chrome.removeListener('exit',onExit);error?reject(error):resolve();};
  const onOpen=()=>{try{startupRemaining('websocket-open');if(debuggerEvidence(stderr)!==devtools)throw Error('Chrome endpoint evidence changed before WebSocket opened');startupRemaining('websocket-open-final');finish();}catch(error){finish(error);}};
  const onError=error=>finish(error instanceof Error?error:Error('Chrome WebSocket connection failed'));
  const onClose=()=>finish(Error('Chrome WebSocket closed before opening')),onExit=(code,signal)=>finish(Error('Chrome exited during WebSocket connect: code='+code+' signal='+signal));
  const timer=setTimeout(()=>finish(Error('Chrome startup deadline exceeded during websocket-connect after '+startupBudgetMs+' ms')),remaining);
  ws.addEventListener('open',onOpen);ws.addEventListener('error',onError);ws.addEventListener('close',onClose);chrome.once('error',onError);chrome.once('exit',onExit);
 });startup.stage='cdp-setup';observeStartup('websocket-open');
 rejectStartupPending=error=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();};
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const job=pending.get(message.id);if(job){pending.delete(message.id);clearTimeout(job.timer);try{if(!startupReady)startupRemaining('cdp-response');message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);}catch(error){job.reject(error);}}}else {if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);if(message.method==='Network.requestWillBeSent'){const url=message.params.request.url;requests.push({url:url.startsWith('data:')?url.slice(0,url.indexOf(',')+1)+'[inline asset omitted]':url,type:message.params.type,inlineCharacters:url.startsWith('data:')?url.length:undefined});}}};
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const timeout=startupReady?15000:Math.min(15000,startupRemaining('CDP '+method));const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const target=await send('Target.createTarget',{url:'about:blank'}),attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}),sid=attached.sessionId;
 const cmd=(method,params={})=>send(method,params,sid);
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Network.enable');
 startupRemaining('cdp-ready');if(debuggerEvidence(stderr)!==devtools)throw Error('Chrome endpoint evidence changed before CDP became ready');startupRemaining('cdp-ready-final');startupReady=true;startup.readyElapsedMs=performance.now()-startupClock;
 startup.stage='cdp-ready';observeStartup('cdp-ready');
 await cmd('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const evaluate=async expression=>{const result=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 await cmd('Page.navigate',{url:pathToFileURL(html).href});
 for(let i=0;i<100;i++){if(await evaluate('!!window.D4Prototype'))break;await wait(50);}assert.equal(await evaluate('!!window.D4Prototype'),true,'Application ready');
 const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
 // A rectangle alone does not prove that a CDP touch can reach its element.
 // Clip through scroll ancestors and require the actual hit-tested target.
 const touchPoint=async(selector,{fraction=.5,edge=false,scroll=false}={})=>{
  if(scroll)await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing touch target');el.scrollIntoView({block:'nearest',inline:'nearest'});return true;})()`);
  const p=await evaluate(`(()=>{
   const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing touch target');
   const r=el.getBoundingClientRect();let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
   for(let parent=el.parentElement;parent;parent=parent.parentElement){const css=getComputedStyle(parent),box=parent.getBoundingClientRect();if(/^(auto|scroll|hidden|clip)$/.test(css.overflowX)){left=Math.max(left,box.left+parent.clientLeft);right=Math.min(right,box.left+parent.clientLeft+parent.clientWidth);}if(/^(auto|scroll|hidden|clip)$/.test(css.overflowY)){top=Math.max(top,box.top+parent.clientTop);bottom=Math.min(bottom,box.top+parent.clientTop+parent.clientHeight);}}
   const visible=right-left>2&&bottom-top>2,y=${edge?'bottom-Math.min(12,(bottom-top)/4)':'top+(bottom-top)*'+fraction};
   const candidates=${edge?'[.5,.25,.75,.1,.9]':'[.5]'};let selected=null,lastHit=null;
   if(visible)for(const ratio of candidates){const x=left+(right-left)*ratio,hit=document.elementFromPoint(x,y);lastHit=hit?.tagName+':'+(hit?.className||'');if(hit&&(hit===el||el.contains(hit))){selected={x,y};break;}}
   return {...selected,visible,hitMatches:!!selected,hit:lastHit,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},clip:{left,top,right,bottom},scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
  })()`);
  assert.ok(p.visible&&p.hitMatches,`Visible touch target must win elementFromPoint: ${selector} ${JSON.stringify(p)}`);
  if(edge)assert.ok(p.y>=p.rect.bottom-42&&p.y<p.rect.bottom,'The real list auto-scroll edge must be visible; offscreen coordinates are forbidden');
  return p;
 };
 const api={eval:evaluate,async click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');if(e.disabled)throw Error('Disabled target');e.click();return true;})()`);await settle();},async fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');if(e.type==='checkbox')e.checked=${Boolean(value)};else e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);await settle();},async submit(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing form');if(!e.checkValidity())throw Error('Invalid form: '+[...e.elements].filter(x=>!x.checkValidity()).map(x=>x.name));e.requestSubmit();return true;})()`);await settle();},async check(name,fn){const at=new Date().toISOString();try{await fn();checks.push({name,status:'passed',at});}catch(error){checks.push({name,status:'failed',at,error:serialize(error)});await api.screenshot('failure-'+checks.length);throw error;}},async screenshot(name){await evaluate('document.fonts.ready.then(()=>true)');if(!name.startsWith('failure-'))await evaluate('new Promise(resolve=>setTimeout(resolve,document.querySelector("#toast").classList.contains("visible")?3300:0))');const result=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(screenshots,name+'.png'),Buffer.from(result.data,'base64'));},async navigate(r){await api.click(`nav [data-action="go"][data-id="${r}"]`);assert.equal(await evaluate('window.D4Prototype.getRoute()'),r);},async reload(){await cmd('Page.reload');await wait(150);await settle();}};
 Object.assign(api,{
  async configure(width,height,mobile){await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});await settle();},
  async point(selector,after=false){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*${after?'.95':'.5'}}})()`);},
  async tap(selector,point){const p=point||await api.point(selector);await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();},
  async swipe(from,to,{cancel=false,beforeRelease}={}){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from[0],y:from[1]}]});try{for(let i=1;i<=8;i++){await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from[0]+(to[0]-from[0])*i/8,y:from[1]+(to[1]-from[1])*i/8}]});await wait(30);}if(beforeRelease)await beforeRelease();await cmd('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}catch(error){await cmd('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});throw error;}await wait(550);await settle();},
  async drag(source,target,{hold=550,after=false,cancel=false,afterDown,beforeMove,beforeRelease}={}){
   await touchPoint(target,{fraction:after ? .95 : .5,scroll:true});await touchPoint(source,{scroll:true});
   const p=await touchPoint(source),to=await touchPoint(target,{fraction:after ? .95 : .5});let touching=false;
   try{
    await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});touching=true;if(afterDown)await afterDown();await wait(hold);if(beforeMove)await beforeMove();
    const active=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(screenshots,'touch-drag-active.png'),Buffer.from(active.data,'base64'));
    for(let i=1;i<=12;i++){await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+(to.x-p.x)*i/12,y:p.y+(to.y-p.y)*i/12}]});await wait(35);}
    const hit=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(target)}),hit=document.elementFromPoint(${to.x},${to.y});return !!el&&!!hit&&(el===hit||el.contains(hit));})()`);
    assert.ok(hit,'Drag release coordinates must still hit the requested target');
    if(beforeRelease)await beforeRelease();await cmd('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});touching=false;await wait(550);await settle();
   }finally{if(touching)await cmd('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
  },
  async mouseDrag(source,target,{pointerType='mouse',after=false}={}){
   assert.ok(['mouse','pen'].includes(pointerType),'Mouse drag requires a real mouse or pen protocol channel');
   const fraction=after ? .95 : .1;
   await touchPoint(target,{fraction,scroll:true});await touchPoint(source,{scroll:true});
   const p=await touchPoint(source),to=await touchPoint(target,{fraction}),id=await evaluate(`document.querySelector(${JSON.stringify(source)}).closest('.task-row')?.dataset.taskId`);let pressed=false;
   try{
    await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,pointerType,buttons:0});
    await evaluate('(()=>{window.__d4PointerProbe=null;document.addEventListener("pointerdown",event=>{window.__d4PointerProbe={pointerType:event.pointerType,trusted:event.isTrusted};},{capture:true,once:true});return true;})()');
    await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,pointerType,button:'left',buttons:1,clickCount:1});pressed=true;
    assert.deepEqual(await evaluate('window.__d4PointerProbe'),{pointerType,trusted:true},'The requested CDP channel emits a trusted pointer event');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.task-row.dragging')).some(row=>row.dataset.taskId===${JSON.stringify(id)})`),'Mouse or pen handle press activates the requested task');
    for(let i=1;i<=12;i++){await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+(to.x-p.x)*i/12,y:p.y+(to.y-p.y)*i/12,pointerType,button:'left',buttons:1});await wait(20);}
    const hit=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(target)}),hit=document.elementFromPoint(${to.x},${to.y});return !!el&&!!hit&&(el===hit||el.contains(hit));})()`);
    assert.ok(hit,'Mouse or pen release coordinates must still hit the requested target');
    await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:to.x,y:to.y,pointerType,button:'left',buttons:0,clickCount:1});pressed=false;await settle();
    assert.equal(await evaluate('!!document.querySelector(".dragging,.drag-ghost,.drop-target,.swiping")'),false,'Mouse or pen release leaves no active gesture decoration');
   }finally{if(pressed){await api.key(null,'Escape');await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:to.x,y:to.y,pointerType,button:'left',buttons:0,clickCount:1});}await evaluate('delete window.__d4PointerProbe');}
  },
  async holdScroll(source,list,hold){
   await touchPoint(source,{scroll:true});const p=await touchPoint(source),to=await touchPoint(list,{edge:true});
   assert.ok(to.scrollHeight>to.clientHeight&&to.scrollTop+to.clientHeight<to.scrollHeight-1,'Synthetic list must have actual room to scroll downward');
   const id=await evaluate(`document.querySelector(${JSON.stringify(source)}).closest('.task-row')?.dataset.taskId`);assert.ok(id,'Held drag requires a task row');let touching=false;
   try{
    await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});touching=true;await wait(hold);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.task-row.dragging')).some(row=>row.dataset.taskId===${JSON.stringify(id)})`),'Real long press must activate the held task before auto-scroll');
    for(let i=1;i<=12;i++){await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+(to.x-p.x)*i/12,y:p.y+(to.y-p.y)*i/12}]});await wait(30);}
    const deadline=Date.now()+2200;let scrolling=false;
    while(Date.now()<deadline){scrolling=await evaluate(`(()=>{const list=document.querySelector(${JSON.stringify(list)}),hit=document.elementFromPoint(${to.x},${to.y});return !!list&&!!hit&&list.contains(hit)&&list.scrollTop>${to.scrollTop}&&Array.from(document.querySelectorAll('.task-row.dragging')).some(row=>row.dataset.taskId===${JSON.stringify(id)});})()`);if(scrolling)break;await wait(100);}
    assert.ok(scrolling,'Actual list scrollTop must increase while the same touch continues holding the task at a visible list edge');
    await api.screenshot('touch-held-auto-scroll');await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;await wait(550);await settle();
   }finally{if(touching)await cmd('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
  },
  async key(selector,key){if(selector){await api.tap(selector);}const codes={Enter:13,ArrowDown:40,ArrowUp:38,Escape:27};await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:codes[key]||0,nativeVirtualKeyCode:codes[key]||0});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key]||0,nativeVirtualKeyCode:codes[key]||0});await settle();}
 });
 await api.check('Offline CJK font identity loaded before visual review',async()=>{await evaluate('document.fonts.ready.then(()=>true)');const font=await evaluate('Array.from(document.fonts).find(f=>f.family.replace(/"/g,"")==="Noto Sans SC")?.status');assert.equal(font,'loaded');report.font=await evaluate('window.D4_BUILD.font');assert.equal(report.font?.sha256,'763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a');});
 await runCases(api);await runWorkCases(api);await runPersonalCases(api);await runMobileCases(api);await runRegressionCases(api);await runLegacyCases(api);await api.configure(1440,960,false);
 await api.navigate('dashboard');await api.screenshot('desktop-dashboard');await api.navigate('tasks');await api.screenshot('desktop-tasks');await api.click('[data-action="task-open"][data-id="d4-task-0"]');await api.screenshot('desktop-task-detail');await api.click('[data-action="close-modal"]');await api.navigate('projects');await api.screenshot('desktop-projects');await api.navigate('processes');await api.screenshot('desktop-processes');await api.navigate('analytics');await api.screenshot('desktop-analytics');
 await cmd('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await api.navigate('dashboard');await api.screenshot('mobile-dashboard');
 await api.check('Mobile layout and all navigation destinations',async()=>{assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await api.click('[data-action="nav-toggle"]');assert.equal(await evaluate('document.querySelector(".app-shell").classList.contains("nav-open")'),true);await evaluate('Promise.race([Promise.all(document.querySelector(".side-nav").getAnimations({subtree:true}).map(a=>a.finished)),new Promise((resolve,reject)=>setTimeout(()=>reject(Error("Navigation presentation did not settle")),1500))]).then(()=>true)');const navBox=await evaluate('(()=>{const r=document.querySelector(".side-nav").getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})()');assert.ok(navBox.left>=-1&&navBox.right<=412&&navBox.width>=200,'Open navigation is fully inside the phone viewport');await api.screenshot('mobile-navigation');});
 await api.navigate('tasks');await api.screenshot('mobile-tasks');
 await api.check('Mobile work records retain readable fields and real edit actions',async()=>{
  for(const width of [360,412]){
   await api.configure(width,915,true);await api.navigate('work-items');
   const layout=await evaluate(`(()=>{const table=document.querySelector('.work-record-table'),row=table?.querySelector('tbody tr'),title=row?.querySelector('[data-action="work-work-detail"]'),time=row?.querySelector('[data-label="计划 / 截止时间"]'),buttons=[...row?.querySelectorAll('.row-actions button')||[]];return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,tableWidth:table?.scrollWidth,tableClient:table?.clientWidth,titleWidth:title?.getBoundingClientRect().width,timeWidth:time?.getBoundingClientRect().width,labels:[...row?.querySelectorAll('td')||[]].map(e=>e.dataset.label),id:row?.querySelector('[data-action="work-edit-work-item"]')?.dataset.id,buttons:buttons.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};})()`);
   assert.equal(layout.width,width);assert.ok(layout.documentWidth<=width,'Phone document must not scroll horizontally');assert.ok(layout.tableWidth<=layout.tableClient+1,'Work record fields and actions must fit without sideways scrolling');assert.ok(layout.titleWidth>=200,'Phone title remains readable');assert.ok(layout.timeWidth>=250,'The full time range uses a wide line');assert.deepEqual(layout.labels,['工作事项 / 负责人','项目','状态','计划 / 截止时间','任务完成','操作']);assert.equal(layout.buttons.length,3);assert.ok(layout.buttons.every(b=>b.width>=44&&b.height>=44),'Every phone record action has a full touch target');assert.ok(layout.id);
   await api.tap('[data-action="work-edit-work-item"][data-id="'+layout.id+'"]');assert.equal(await evaluate('document.querySelector("[data-form=work-work-item] [name=id]")?.value'),layout.id,'Real edit opens the exact record');await api.tap('[data-action="work-close"]');assert.equal(await evaluate('!!document.querySelector("[data-form=work-work-item]")'),false);
  }
 });
 await runMobileDateFilterCase(api,cmd,out,{sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT});
 // Cloud-only presentation capture. These nine images are not additional test cases.
 await api.configure(412,915,true);
 const mobileShowcase=[];
 for(const route of ['notes','pomodoro','feedback','work-items','contacts','archive','analytics','templates','processes']){
  await api.navigate(route);
  await evaluate(`Promise.race([(async()=>{while(window.D4Prototype.getRoute()!==${JSON.stringify(route)}||document.querySelector('main')?.dataset.route!==${JSON.stringify(route)})await new Promise(requestAnimationFrame);await document.fonts.ready;await Promise.all(document.querySelector('.app-shell').getAnimations({subtree:true}).map(a=>a.finished));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})(),new Promise((resolve,reject)=>setTimeout(()=>reject(Error('Phone presentation route or animations did not settle: '+${JSON.stringify(route)})),1500))])`);
  const observed=await evaluate('({route:window.D4Prototype.getRoute(),domRoute:document.querySelector("main").dataset.route,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,heading:document.querySelector("main .page-heading h1")?.textContent||"",unfinishedAnimations:document.querySelector(".app-shell").getAnimations({subtree:true}).filter(a=>a.pending||!["finished","idle"].includes(a.playState)).map(a=>({playState:a.playState,pending:a.pending}))})');
  assert.equal(observed.route,route,'Presentation capture route identity');
  assert.equal(observed.domRoute,route,'Presentation capture rendered route identity');
  assert.equal(observed.width,412,'Presentation capture uses the real phone viewport width');
  assert.equal(observed.height,915,'Presentation capture uses the real phone viewport height');
  assert.deepEqual(observed.unfinishedAnimations,[],'Phone presentation animations have finished');
  const file='mobile-'+route+'.png';await api.screenshot('mobile-'+route);
  mobileShowcase.push({file,route,observed});
 }
 await api.navigate('tasks');
 writeFileSync(join(out,'mobile-showcase-receipt.json'),JSON.stringify({kind:'d403-cloud-browser-phone-showcase',sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,scope:'Presentation screenshots from actual emulated phone viewport; no new business test count; not Android native evidence',viewport:{width:412,height:915,deviceScaleFactor:1,mobile:true},screenshots:mobileShowcase},null,2)+'\n');
 await api.check('No page external network and no runtime exceptions',async()=>{const external=requests.filter(x=>/^(https?|wss?):/.test(x.url));assert.deepEqual(external,[]);assert.deepEqual(errors,[]);});
 writeFileSync(join(out,'synthetic-final-state.json'),JSON.stringify(await evaluate('({core:window.D4Prototype.repo.state,demo:window.D4Prototype.repo.demo,persistence:window.D4Prototype.repo.persistence()})'),null,2));
 report.status='passed';
}catch(error){failed=error;report.status='failed';report.failure=serialize(error);startup.firstFailure={stage:startup.stage,error:serialize(error)};observeStartup('caught-failure');}
finally{report.executedCount=checks.length;report.passed=checks.filter(c=>c.status==='passed').length;report.failed=checks.filter(c=>c.status==='failed').length;report.remainingSuites=failed?'aborted after preserved first failure':'all suites executed';report.finishedAt=new Date().toISOString();writeFileSync(join(out,'browser-results.json'),JSON.stringify(report,null,2));startup.result=report.status;observeStartup('before-cleanup');if(ws?.readyState===WebSocket.OPEN||ws?.readyState===WebSocket.CONNECTING)ws.close();if(chrome&&chrome.exitCode===null){startup.cleanupRequestedAt=new Date().toISOString();startupEvent('cleanup-request',{signal:'SIGTERM'});chrome.kill('SIGTERM');await wait(300);if(chrome.exitCode===null){startupEvent('cleanup-request',{signal:'SIGKILL'});chrome.kill('SIGKILL');}}observeStartup('after-cleanup');}
if(failed)throw failed;
console.log(JSON.stringify({status:report.status,checks:checks.length,sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID}));
