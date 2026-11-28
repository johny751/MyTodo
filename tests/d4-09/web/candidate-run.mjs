import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {candidateCases, serviceCases} from './candidate-cases.mjs';
import {createDriver} from './candidate-driver.mjs';

// D409 additive UI gate; source adaptation only. Frozen D401/D408 tests remain unchanged.
// Run only in hosted GitHub Actions against the already-built exact candidate HTML.
const env=process.env, html=resolve(process.argv[2]||''), out=resolve(process.argv[3]||''), root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const suiteSHA=env.GITHUB_SHA, appSHA=env.D409_APP_SOURCE_SHA;
if(env.GITHUB_ACTIONS!=='true'||env.EXPECTED_SOURCE_SHA!==suiteSHA||!/^[a-f0-9]{40}$/.test(suiteSHA||'')||!/^[a-f0-9]{40}$/.test(appSHA||'')||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||''))throw Error('D409 requires hosted Actions and separate exact suite/app source identities');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()!==suiteSHA)throw Error('Suite checkout differs from GITHUB_SHA');
const temp=resolve(env.RUNNER_TEMP||''), inside=p=>{const r=relative(temp,p);return r&&!r.startsWith('..')&&!/^[A-Za-z]:/.test(r);};
if(!inside(html)||!inside(out)||!existsSync(html)||existsSync(out))throw Error('Use existing RUNNER_TEMP HTML and a fresh RUNNER_TEMP output directory');
const build=JSON.parse(readFileSync(join(dirname(html),'build-receipt.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(build.sourceSha!==appSHA||build.artifact.sha256!==sha(readFileSync(html)))throw Error('HTML receipt/source/hash mismatch');
mkdirSync(out,{recursive:true});mkdirSync(join(out,'screenshots'));mkdirSync(join(out,'snapshots'));
const browser=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!browser)throw Error('Hosted Chromium unavailable; no download fallback');
const pause=ms=>new Promise(r=>setTimeout(r,ms)), serialError=e=>({name:e?.name||'Error',message:String(e?.message||e),stack:e?.stack});
const report={kind:'d409-candidate-ui-independent-real-browser',suiteSourceSHA:suiteSHA,appSourceSHA:appSHA,runId:env.GITHUB_RUN_ID,attempt:Number(env.GITHUB_RUN_ATTEMPT),platform:process.platform,runnerOS:env.RUNNER_OS,htmlSha256:build.artifact.sha256,startedAt:new Date().toISOString(),cases:[],infrastructureErrors:[],scope:'Isolated browser only; not Android system gestures, native lifecycle, Win32, SQLite, or production admission'};
const variant=env.D409_WEB_VARIANT;
if(!['demo','service'].includes(variant))throw Error('Set D409_WEB_VARIANT=demo or service');
if(Boolean(build.d408Composition)!==(variant==='service'))throw Error('Requested variant differs from the built HTML receipt');
if(String(build.runId)!==env.GITHUB_RUN_ID||String(build.runAttempt)!==env.GITHUB_RUN_ATTEMPT)throw Error('HTML must be built in this exact Actions run/attempt');
if(appSHA!==suiteSHA)throw Error('D409 UI gate requires the same candidate source for app and suite');
const specs=variant==='service'?[...candidateCases,...serviceCases]:candidateCases;
const planned=variant==='service'?14:12;
assert.equal(specs.length,planned);assert.equal(new Set(specs.map(x=>x.id)).size,planned);
report.variant=variant;report.caseIds=specs.map(x=>x.id);report.buildReceiptSha256=sha(readFileSync(join(dirname(html),'build-receipt.json')));
report.runnerInputs=['tests/d4-09/web/candidate-run.mjs','tests/d4-09/web/candidate-driver.mjs','tests/d4-09/web/candidate-cases.mjs'].map(path=>({path,sha256:sha(readFileSync(join(root,path)))}));
report.legacyHarnessSource={path:'tests/d4-08/web-run.mjs',sha256:sha(readFileSync(join(root,'tests/d4-08/web-run.mjs'))),reused:'CDP startup and isolated-context orchestration copied into this additive runner; legacy file not edited or imported'};
let chrome, ws, seq=0, stderr='', processError=null;const pending=new Map(), sessions=new Map();
const write=()=>writeFileSync(join(out,'d409-web-results.json'),JSON.stringify(report,null,2)+'\n');
const trace=entry=>appendFileSync(join(out,'d409-web-input-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...entry})+'\n');
function send(method,params={},sessionId){return new Promise((resolveJob,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve:resolveJob,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
 const profile=join(out,'chrome-profile');
 chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 chrome.stderr.on('data',b=>{stderr+=b.toString();appendFileSync(join(out,'chrome-stderr.txt'),b);});chrome.stdout.on('data',b=>appendFileSync(join(out,'chrome-stdout.txt'),b));chrome.on('error',e=>{processError=e;});chrome.on('exit',(code,signal)=>{processError=Error('Chromium exited '+code+'/'+signal);});
 const started=performance.now();let endpoint;
 report.startup={budgetMs:60000,spawnCount:1,transientPortReadCount:0,transientPortReads:[]};
 while(!endpoint){
  if(processError)throw processError;if(performance.now()-started>60000)throw Error('Chromium startup deadline exceeded');
  const fromStderr=stderr.match(/^DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)\r?$/mi)?.[1],portFile=join(profile,'DevToolsActivePort');let fromFile,filePending=false;
  if(existsSync(portFile)){
   try{const m=/^(\d+)\r?\n(\/devtools\/browser\/[a-f0-9-]+)\r?\n?$/.exec(readFileSync(portFile,'utf8'));if(m)fromFile='ws://127.0.0.1:'+m[1]+m[2];else filePending=true;}
   catch(error){if(!['EBUSY','ENOENT'].includes(error.code))throw error;filePending=true;report.startup.transientPortReadCount++;const observation={code:error.code,message:error.message,elapsedMs:performance.now()-started};if(report.startup.transientPortReads.length<32)report.startup.transientPortReads.push(observation);trace({kind:'startup-transient-port-read',...observation});write();}
  }
  if(fromStderr&&fromFile&&fromStderr!==fromFile)throw Error('Conflicting debugger endpoints');endpoint=filePending?null:fromFile||fromStderr;if(!endpoint)await pause(100);
 }
 if(!/^ws:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/devtools\/browser\/[a-f0-9-]+$/i.test(endpoint)||Number(new URL(endpoint).port)>65535)throw Error('Invalid local debugger endpoint');
 ws=new WebSocket(endpoint);await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);yes();},{once:true});ws.addEventListener('error',e=>{clearTimeout(timer);no(e);},{once:true});});
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else {const current=sessions.get(m.sessionId);if(!current)return;if(m.method==='Runtime.exceptionThrown')current.runtimeErrors.push(m.params.exceptionDetails);if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;current.requests.push({url:u.startsWith('data:')?u.slice(0,u.indexOf(',')+1)+'[omitted]':u,type:m.params.type});}}};
 for(const spec of specs){
  const result={id:spec.id,name:spec.name,startedAt:new Date().toISOString(),status:'running',observations:[],runtimeErrors:[],requests:[]};report.cases.push(result);write();let contextId,targetId,sid,a;
  try{
   contextId=(await send('Target.createBrowserContext')).browserContextId;targetId=(await send('Target.createTarget',{url:'about:blank',browserContextId:contextId})).targetId;sid=(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;sessions.set(sid,result);
   const cmd=(method,params={})=>send(method,params,sid), evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails){result.observations.push({failedEvaluation:expression});throw Error(JSON.stringify(r.exceptionDetails));}return r.result.value;};
   await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});
   a=createDriver({evaluate,cmd,trace,result,write,out,sha,spec,pause,variant});
   await a.configure();await cmd('Page.navigate',{url:pathToFileURL(html).href});await a.until('!!window.D4Prototype','application ready',15000);await a.settle();assert.equal(await evaluate('D4_BUILD.sourceSha'),appSHA);assert.equal(await evaluate('!!window.D408V2Candidate'),variant==='service','Actual service mount matches requested variant');await a.snapshot('before');
   await spec.run(a);assert.deepEqual(result.runtimeErrors,[],'No uncaught page exceptions');assert.deepEqual(result.requests.filter(x=>/^(https?|wss?):/.test(x.url)),[],'No page remote requests');await a.snapshot('after');result.status='passed';
  }catch(error){result.status='failed';result.failure=serialError(error);if(a){for(const capture of [()=>a.snapshot('first-failure'),()=>a.screenshot('first-failure')])try{await capture();}catch(e){(result.captureErrors??=[]).push(serialError(e));}}}
  finally{result.finishedAt=new Date().toISOString();write();if(sid)sessions.delete(sid);if(contextId)try{await send('Target.disposeBrowserContext',{browserContextId:contextId});}catch(e){report.infrastructureErrors.push(serialError(e));}write();}
 }
}catch(error){report.infrastructureErrors.push(serialError(error));}
finally{
 report.finishedAt=new Date().toISOString();report.counts={planned:specs.length,executed:report.cases.length,passed:report.cases.filter(x=>x.status==='passed').length,failed:report.cases.filter(x=>x.status==='failed').length,notExecuted:specs.length-report.cases.length};report.status=report.infrastructureErrors.length||report.counts.failed||report.counts.notExecuted?'failed':'passed';write();
 if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}if(chrome&&chrome.exitCode===null)chrome.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Runner closed'));}pending.clear();
 console.log(JSON.stringify({status:report.status,suiteSourceSHA:suiteSHA,appSourceSHA:appSHA,...report.counts,out}));if(report.status!=='passed')process.exitCode=1;
}
