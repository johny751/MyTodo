import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {runCases} from './interaction-cases.mjs';
import {runWorkCases} from './work-cases.mjs';
const env=process.env,out=resolve(process.argv[2]||''),html=join(out,'mytodo-d4-01-demo.html');
if(env.GITHUB_ACTIONS!=='true'||!env.GITHUB_RUN_ID||!env.GITHUB_RUN_ATTEMPT||env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('Hosted Actions identity required');
if(!env.RUNNER_TEMP||relative(resolve(env.RUNNER_TEMP),out).startsWith('..')||out===resolve(env.RUNNER_TEMP)||!existsSync(html))throw Error('Expected fresh synthetic artifact under RUNNER_TEMP');
const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);if(!executable)throw Error('Hosted Chrome unavailable; no download fallback');
const screenshots=join(out,'screenshots');mkdirSync(screenshots);
const events=[],checks=[],errors=[],requests=[],blocked=[],protocolErrors=[];let chrome,ws,counter=0,failed;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function serialize(error){return {name:error?.name,message:String(error?.message||error),stack:error?.stack};}
const report={kind:'D4 synthetic real-browser validation',sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,platform:process.platform,checks,errors,requests,blocked,protocolErrors,startedAt:new Date().toISOString()};
let send;
try {
 chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+join(out,'chrome-synthetic-profile'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 let stderr='';chrome.stderr.on('data',chunk=>{stderr+=chunk;});chrome.on('error',e=>errors.push(serialize(e)));
 let devtools;for(let i=0;i<100;i++){devtools=stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1];if(devtools)break;if(chrome.exitCode!==null)throw Error('Chrome exited: '+stderr);await wait(100);}if(!devtools)throw Error('Chrome debugging startup timed out: '+stderr);
 const pending=new Map();ws=new WebSocket(devtools);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const job=pending.get(message.id);if(job){pending.delete(message.id);clearTimeout(job.timer);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);}}else {if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);if(message.method==='Network.requestWillBeSent'){const url=message.params.request.url;requests.push({url:url.startsWith('data:')?url.slice(0,url.indexOf(',')+1)+'[inline asset omitted]':url,type:message.params.type,inlineCharacters:url.startsWith('data:')?url.length:undefined});}}};
 send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const target=await send('Target.createTarget',{url:'about:blank'}),attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}),sid=attached.sessionId;
 const cmd=(method,params={})=>send(method,params,sid);
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Network.enable');
 await cmd('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const evaluate=async expression=>{const result=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 await cmd('Page.navigate',{url:pathToFileURL(html).href});
 for(let i=0;i<100;i++){if(await evaluate('!!window.D4Prototype'))break;await wait(50);}assert.equal(await evaluate('!!window.D4Prototype'),true,'Application ready');
 const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
 const api={eval:evaluate,async click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');if(e.disabled)throw Error('Disabled target');e.click();return true;})()`);await settle();},async fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');if(e.type==='checkbox')e.checked=${Boolean(value)};else e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);await settle();},async submit(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing form');if(!e.checkValidity())throw Error('Invalid form: '+[...e.elements].filter(x=>!x.checkValidity()).map(x=>x.name));e.requestSubmit();return true;})()`);await settle();},async check(name,fn){const at=new Date().toISOString();try{await fn();checks.push({name,status:'passed',at});}catch(error){checks.push({name,status:'failed',at,error:serialize(error)});await api.screenshot('failure-'+checks.length);throw error;}},async screenshot(name){await evaluate('document.fonts.ready.then(()=>true)');if(!name.startsWith('failure-'))await evaluate('new Promise(resolve=>setTimeout(resolve,document.querySelector("#toast").classList.contains("visible")?3300:0))');const result=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(screenshots,name+'.png'),Buffer.from(result.data,'base64'));},async navigate(r){await api.click(`nav [data-action="go"][data-id="${r}"]`);assert.equal(await evaluate('window.D4Prototype.getRoute()'),r);},async reload(){await cmd('Page.reload');await wait(150);await settle();}};
 await api.check('Offline CJK font identity loaded before visual review',async()=>{await evaluate('document.fonts.ready.then(()=>true)');const font=await evaluate('Array.from(document.fonts).find(f=>f.family.replace(/"/g,"")==="Noto Sans SC")?.status');assert.equal(font,'loaded');report.font=await evaluate('window.D4_BUILD.font');assert.equal(report.font?.sha256,'763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a');});
 await runCases(api);await runWorkCases(api);
 await api.navigate('dashboard');await api.screenshot('desktop-dashboard');await api.navigate('tasks');await api.screenshot('desktop-tasks');await api.click('[data-action="task-open"][data-id="d4-task-0"]');await api.screenshot('desktop-task-detail');await api.click('[data-action="close-modal"]');await api.navigate('projects');await api.screenshot('desktop-projects');await api.navigate('processes');await api.screenshot('desktop-processes');await api.navigate('analytics');await api.screenshot('desktop-analytics');
 await cmd('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await api.navigate('dashboard');await api.screenshot('mobile-dashboard');
 await api.check('Mobile layout and all navigation destinations',async()=>{assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await api.click('[data-action="nav-toggle"]');assert.equal(await evaluate('document.querySelector(".app-shell").classList.contains("nav-open")'),true);await api.screenshot('mobile-navigation');});
 await api.navigate('tasks');await api.screenshot('mobile-tasks');
 await api.check('No page external network and no runtime exceptions',async()=>{const external=requests.filter(x=>/^(https?|wss?):/.test(x.url));assert.deepEqual(external,[]);assert.deepEqual(errors,[]);});
 writeFileSync(join(out,'synthetic-final-state.json'),JSON.stringify(await evaluate('({core:window.D4Prototype.repo.state,demo:window.D4Prototype.repo.demo,persistence:window.D4Prototype.repo.persistence()})'),null,2));
 report.status='passed';
}catch(error){failed=error;report.status='failed';report.failure=serialize(error);}
finally{report.finishedAt=new Date().toISOString();writeFileSync(join(out,'browser-results.json'),JSON.stringify(report,null,2));if(ws?.readyState===WebSocket.OPEN)ws.close();if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await wait(300);if(chrome.exitCode===null)chrome.kill('SIGKILL');}}
if(failed)throw failed;
console.log(JSON.stringify({status:report.status,checks:checks.length,sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID}));
