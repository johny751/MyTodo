import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createSyncStore,configScope} from '../../src/sync-server.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('C0-05 execution requires the real GitHub Windows user DPAPI context.');
const [native,helper,output]=process.argv.slice(2);
if(!native||!helper||!output||!process.env.RUNNER_TEMP)throw Error('Usage: native.exe helper.exe absolute-report-directory');
const within=value=>{const relative=path.relative(path.resolve(process.env.RUNNER_TEMP),path.resolve(value));return relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
if(![native,helper,output].every(v=>path.isAbsolute(v)&&within(v)))throw Error('All credential test paths must be beneath RUNNER_TEMP.');
await fs.access(native);await fs.access(helper);await fs.mkdir(output,{recursive:true});
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const expectedSource=process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA;if(!/^[a-f0-9]{40}$/.test(sourceSha)||sourceSha!==expectedSource)throw Error('Credential runner frozen source SHA mismatch.');
const fixtureRoot=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'c005-credentials-'));
const password='synthetic-only-'+crypto.randomBytes(20).toString('hex')+'-中文🙂páss';
const username='fixture-'+crypto.randomBytes(8).toString('hex')+'-用户@example.invalid';
const knownSecrets=[password,username];
const config={enabled:true,autoSync:false,username,password,folder:'C005-Only'};
const report={version:1,sourceSha,runner:{os:process.env.RUNNER_OS,imageVersion:process.env.ImageVersion,node:process.version,windows:process.getSystemVersion?.()||null},startedAt:new Date().toISOString(),finishedAt:null,dpapi:'real CryptProtectData/CryptUnprotectData, same GitHub Windows runner user',userContextSha256:crypto.createHash('sha256').update(execFileSync('whoami',['/user','/fo','csv'],{encoding:'utf8'})).digest('hex'),networkRequests:0,cases:[],subprocesses:[],credentialPlaintextLogged:false,exitCode:null};
function check(value,label){if(!value)throw Error(label);}
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
async function processCall(exe,args,input,kind){return new Promise(resolve=>{const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});const out=[],err=[];let settled=false,spawnError=false,timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},30000);child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('error',()=>{spawnError=true;});child.on('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);const stdout=Buffer.concat(out),stderr=Buffer.concat(err);const protectedOutput=kind==='helper';const leak=knownSecrets.some(s=>stderr.includes(Buffer.from(s))||(!protectedOutput&&stdout.includes(Buffer.from(s))));report.credentialPlaintextLogged||=leak;report.subprocesses.push({kind,operation:args[0],exitCode:code,signal:signal||null,spawnError,timedOut,stdoutBytes:stdout.length,stderrBytes:stderr.length,stderrDiagnostic:leak?'[credential output redacted]':stderr.toString('utf8').slice(0,5000),unexpectedPlaintext:leak});resolve({code,stdout,stderr,spawnError,timedOut});});child.stdin.on('error',()=>{});child.stdin.end(input);});}
const c=async(op,dir,value)=>{const result=await processCall(native,[op,dir],value?JSON.stringify(value):'', 'native');check(!result.spawnError&&!result.timedOut&&(result.code===0||result.code===1),'Native credential adapter did not complete normally');let payload;try{payload=JSON.parse(result.stdout.toString('utf8'));}catch{throw Error('Native credential adapter result missing');}check(payload&&payload.ok===(result.code===0),'Native credential adapter exit/result mismatch');return result;};
const h=(op,value)=>processCall(helper,[op],value,'helper');
async function readViaNode(dir,expected,existing){let intercepted=false;const fetchImpl=async(url,options)=>{intercepted=true;check(options.headers.Authorization==='Basic '+Buffer.from(expected.username+':'+expected.password,'utf8').toString('base64'),'Node decrypted credential differs');return new Response('{}',{status:200});};const store=existing||await createSyncStore(dir,{credentialHelper:helper,fetchImpl});const redacted=await store({op:'config-get'});check(redacted.username===expected.username&&redacted.folder===expected.folder&&redacted.configured===!!expected.password&&!Object.hasOwn(redacted,'password'),'Node config read differs');await store({op:'request',scope:configScope(expected),method:'GET',path:'state.json'});if(!existing)check(intercepted,'In-memory transport was not reached');return store;}
async function rejects(action,label){let rejected=false;try{await action();}catch{rejected=true;}check(rejected,label);}
async function scenario(id,action){const dir=path.join(fixtureRoot,id);await fs.mkdir(dir);const entry={id,status:'running',checks:[],fileSha256:null};report.cases.push(entry);try{await action(dir,entry);entry.status='passed';try{entry.fileSha256=digest(await fs.readFile(path.join(dir,'sync-config.enc')));}catch{}}catch(error){entry.status='failed';if(entry.fixture?.status==='running')entry.fixture.status='failed';entry.error=knownSecrets.some(s=>String(error.message).includes(s))?'Credential-sensitive failure redacted':String(error.message);}}
for(const unicode of [false,true]){
 const value=unicode?config:{...config,username:'synthetic@example.invalid',password:'synthetic-'+crypto.randomBytes(16).toString('hex')};knownSecrets.push(value.username,value.password);
 await scenario('c-to-node-'+(unicode?'unicode':'ascii'),async(dir,e)=>{check((await c('write',dir,value)).code===0,'C config_save failed');const bytes=await fs.readFile(path.join(dir,'sync-config.enc'));check(!bytes.includes(Buffer.from(value.password)),'Credential file contains plaintext');await readViaNode(dir,value);e.checks=['C production config_save','Node real DPAPI/read/request'];e.observedWireFormat=bytes.toString().startsWith('gx-dpapi-v1:')?'modern-prefix':'legacy-unprefixed';});
 await scenario('node-to-c-'+(unicode?'unicode':'ascii'),async(dir,e)=>{const store=await createSyncStore(dir,{credentialHelper:helper});await store({op:'config-save',config:value});check((await c('verify',dir,value)).code===0,'C config_read differs');await readViaNode(dir,value);e.checks=['Node production save','C production config_read','Node process-store reopen'];});
}
await scenario('c-modern-format',async(dir,e)=>{check((await c('write',dir,config)).code===0,'C config_save failed');await readViaNode(dir,config);e.checks=['C output actually read by Node'];check((await fs.readFile(path.join(dir,'sync-config.enc'),'utf8')).startsWith('gx-dpapi-v1:'),'C modern prefix missing');e.checks.push('modern prefix');});
await scenario('node-blank-password-preserves',async(dir,e)=>{const store=await createSyncStore(dir,{credentialHelper:helper});await store({op:'config-save',config});await store({op:'config-save',config:{...config,password:''}});await readViaNode(dir,config);check((await c('verify',dir,config)).code===0,'C reread after blank Node password differs');e.checks=['Node save and blank-password update','Node exact read after update','C exact read'];});
await scenario('empty-file-first-open',async(dir,e)=>{const file=path.join(dir,'sync-config.enc');await fs.writeFile(file,'');const results={cReadRejected:(await c('read-fails',dir)).code===0};const store=await createSyncStore(dir,{credentialHelper:helper});try{await store({op:'config-get'});results.nodeReadRejected=false;}catch{results.nodeReadRejected=true;}try{await store({op:'config-save',config});results.nodeSaveRejected=false;}catch{results.nodeSaveRejected=true;}results.nodeOriginalPreserved=(await fs.readFile(file)).length===0;await fs.writeFile(file,'');results.cSaveRejected=(await c('write',dir,config)).code===1;results.cOriginalPreserved=(await fs.readFile(file)).length===0;e.checks=results;check(Object.values(results).every(Boolean),'First-open empty-file protections failed');});
await scenario('legacy-utf16',async(dir,e)=>{const encrypted=await h('--protect',Buffer.from(JSON.stringify(config),'utf16le'));check(encrypted.code===0,'Legacy DPAPI creation failed');const file=path.join(dir,'sync-config.enc');await fs.writeFile(file,encrypted.stdout);await readViaNode(dir,config);check((await c('verify',dir,config)).code===0,'C legacy read failed');check(digest(await fs.readFile(file))===digest(encrypted.stdout),'Read modified legacy file');check((await c('write',dir,config)).code===0,'C legacy upgrade failed');check((await fs.readFile(file,'utf8')).startsWith('gx-dpapi-v1:'),'C legacy rewrite not modern');await readViaNode(dir,config);e.checks=['same-user real DPAPI UTF16 legacy','C/Node exact Unicode read','read preserves bytes','C upgrade and Node reread'];});
await scenario('legacy-powershell',async(dir,e)=>{
 const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 e.fixture={stage:'environment-diagnostic',status:'running',sameProcessPowerShellRoundTrip:false,strictHex:false};
 // This separate process receives no credential input. Capture module resolution
 // evidence before choosing the Windows PowerShell module by its built-in path.
 const diagnosticScript=`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);
 $result=[ordered]@{processId=$PID;pshome=$PSHOME;psVersionTable=[ordered]@{};psModulePath=$env:PSModulePath;available=@();defaultImport=$null;explicitManifest=$null;explicitImport=$null};
 foreach($entry in $PSVersionTable.GetEnumerator()){$result.psVersionTable[$entry.Key]=[string]$entry.Value};
 try{$result.available=@(Get-Module -ListAvailable -Name Microsoft.PowerShell.Security | ForEach-Object {[ordered]@{name=$_.Name;version=[string]$_.Version;path=$_.Path}})}catch{$result.availableError=$_.Exception.Message};
 try{Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;$result.defaultImport=[ordered]@{success=$true;modules=@(Get-Module Microsoft.PowerShell.Security | ForEach-Object {[ordered]@{name=$_.Name;version=[string]$_.Version;path=$_.Path}})}}catch{$result.defaultImport=[ordered]@{success=$false;error=$_.Exception.Message;errorId=$_.FullyQualifiedErrorId;type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult}};
 $manifest=$PSHOME+'/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1';$result.explicitManifest=$manifest;
 try{Import-Module $manifest -Force -ErrorAction Stop;$result.explicitImport=[ordered]@{success=$true;modules=@(Get-Module Microsoft.PowerShell.Security | ForEach-Object {[ordered]@{name=$_.Name;version=[string]$_.Version;path=$_.Path}})}}catch{$result.explicitImport=[ordered]@{success=$false;error=$_.Exception.Message;errorId=$_.FullyQualifiedErrorId;type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult}};
 Import-Module ($PSHOME+'/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force -ErrorAction Stop;[Console]::Out.Write((Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject $result -Depth 10 -Compress));[Console]::Out.Flush();if(-not $result.explicitImport.success){exit 1}`;
 const diagnostic=await processCall(ps,['-NoProfile','-NonInteractive','-Command',diagnosticScript],'','powershell-module-diagnostic');
 let diagnosticData;try{diagnosticData=JSON.parse(diagnostic.stdout.toString('utf8'));}catch{throw Error('PowerShell module diagnostic JSON missing');}
 e.powerShellEnvironment=diagnosticData;
 check(!diagnostic.spawnError&&!diagnostic.timedOut&&diagnostic.code===0&&diagnostic.stderr.length===0&&diagnosticData.explicitImport?.success===true,'Windows PowerShell built-in security module unavailable');
 e.fixture.stage='protect-and-self-check';
 // Only protected bytes reach stdout. Verify the original PowerShell format with
 // the same PowerShell decoder in memory before testing the application readers.
 const script=`$ErrorActionPreference='Stop';$stage='initialize';$pointer=[IntPtr]::Zero;$secure=$null;$restored=$null;try{
 [Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);
 $stage='load-built-in-security';Import-Module ($PSHOME+'/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -Force -ErrorAction Stop;
 $stage='read-input';$plain=[Console]::In.ReadToEnd();if([string]::IsNullOrEmpty($plain)){throw 'Empty fixture input'};
 $stage='protect';$secure=Microsoft.PowerShell.Security\\ConvertTo-SecureString $plain -AsPlainText -Force;
 $encoded=Microsoft.PowerShell.Security\\ConvertFrom-SecureString $secure;
 if([string]::IsNullOrEmpty($encoded) -or $encoded.Length % 2 -ne 0 -or $encoded -notmatch '^[0-9a-fA-F]+$'){throw 'Invalid protected fixture format'};
 $stage='self-check';$restored=Microsoft.PowerShell.Security\\ConvertTo-SecureString $encoded;
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored);
 $decoded=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer);
 if(-not [string]::Equals($plain,$decoded,[StringComparison]::Ordinal)){throw 'Protected fixture self-check failed'};
 [Console]::Out.Write($encoded);[Console]::Out.Flush();
 }catch{[Console]::Error.WriteLine('PowerShell credential fixture failed at '+$stage+'; type='+$_.Exception.GetType().Name+'; hresult='+$_.Exception.HResult);exit 1}
 finally{if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};if($secure){$secure.Dispose()};if($restored){$restored.Dispose()};$plain=$null;$decoded=$null}`;
 const encoded=await processCall(ps,['-NoProfile','-NonInteractive','-Command',script],JSON.stringify(config),'legacy-powershell');
 e.fixture.process={exitCode:encoded.code,spawnError:encoded.spawnError,timedOut:encoded.timedOut,stderrBytes:encoded.stderr.length,stdoutBytes:encoded.stdout.length};
 check(!encoded.spawnError&&!encoded.timedOut&&encoded.code===0&&encoded.stderr.length===0,'PowerShell legacy fixture preparation did not complete normally');
 const encodedText=encoded.stdout.toString('ascii');
 check(encoded.stdout.length>0&&encoded.stdout.length%2===0&&/^[0-9a-fA-F]+$/.test(encodedText)&&Buffer.from(encodedText,'ascii').equals(encoded.stdout),'PowerShell legacy fixture output is not strict protected hex');
 e.fixture={...e.fixture,status:'passed',sameProcessPowerShellRoundTrip:true,strictHex:true,stage:'application-readers'};
 await fs.writeFile(path.join(dir,'sync-config.enc'),encoded.stdout);
 await readViaNode(dir,config);e.checks.push('Node reads self-checked PowerShell legacy file');
 check((await c('verify',dir,config)).code===0,'C PowerShell legacy read failed');e.checks.push('C reads self-checked PowerShell legacy file');
});
const seed=await h('--protect',Buffer.from(JSON.stringify(config),'utf8'));check(seed.code===0,'Synthetic DPAPI seed failed');const wire='gx-dpapi-v1:'+seed.stdout.toString('ascii');const mutations={truncated:wire.slice(0,-20),'odd-hex':wire.slice(0,-1),'wrong-prefix':wire.replace('gx-dpapi-v1:','gx-dpapi-v2:'),'nonhex':wire.slice(0,20)+'zz'+wire.slice(22),'cipher-corrupt':wire.slice(0,-2)+(wire.endsWith('00')?'01':'00'),'empty':'','nul-trailing':wire+'\0','oversized':'f'.repeat(526000)};
for(const [id,bad]of Object.entries(mutations))await scenario('reject-'+id,async(dir,e)=>{const file=path.join(dir,'sync-config.enc');check((await c('write',dir,config)).code===0,'Initial C save failed');const cached=await createSyncStore(dir,{credentialHelper:helper});await cached({op:'config-get'});await fs.writeFile(file,bad);const before=digest(await fs.readFile(file));check((await c('read-fails',dir)).code===0,'C accepted malformed file');await rejects(()=>cached({op:'config-get'}),'Node cached read accepted malformed file');await rejects(()=>cached({op:'config-save',config}),'Node overwrote unreadable credentials');const fresh=await createSyncStore(dir,{credentialHelper:helper});await rejects(()=>fresh({op:'config-get'}),'Node fresh read accepted malformed file');check((await c('write',dir,config)).code===1,'C overwrote unreadable credentials');check(digest(await fs.readFile(file))===before,'Failed read/save altered original bytes');e.checks=['C reject','Node cached and fresh reject','both save reject','original bytes retained'];});
for(const [id,plain]of [['invalid-json',Buffer.from('{not-json')],['json-scalar',Buffer.from('null')],['invalid-utf8',Buffer.from([0xff,0xfe])],['trailing-json',Buffer.from('{}{}')]])await scenario('protected-'+id,async(dir,e)=>{const encrypted=await h('--protect',plain);check(encrypted.code===0,'Malformed DPAPI fixture creation failed');const file=path.join(dir,'sync-config.enc'),bad=Buffer.concat([Buffer.from('gx-dpapi-v1:'),encrypted.stdout]);await fs.writeFile(file,bad);check((await c('read-fails',dir)).code===0,'C accepted malformed decrypted payload');const store=await createSyncStore(dir,{credentialHelper:helper});await rejects(()=>store({op:'config-get'}),'Node accepted malformed decrypted payload');await rejects(()=>store({op:'config-save',config}),'Node replaced malformed decrypted payload');check((await c('write',dir,config)).code===1,'C replaced malformed decrypted payload');check(digest(await fs.readFile(file))===digest(bad),'Malformed protected file changed');e.checks=['real DPAPI malformed plaintext rejection','file preserved'];});
await scenario('read-access-denied',async(dir,e)=>{
 const file=path.join(dir,'sync-config.enc');check((await c('write',dir,config)).code===0,'Initial C save failed');const before=digest(await fs.readFile(file));
 const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const script=`$ErrorActionPreference='Stop';$file=$null;try{
 $file=[IO.File]::Open($env:C005_LOCK_FILE,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);
 [Console]::Out.WriteLine('locked');[Console]::Out.Flush();
 $release=[Console]::In.ReadLine();if($null -eq $release){throw 'Lock release signal missing'}
 }catch{[Console]::Error.WriteLine('PowerShell credential lock fixture failed');exit 1}
 finally{if($file){$file.Dispose()}}
 [Console]::Out.WriteLine('released');[Console]::Out.Flush()`;
 const holder=spawn(ps,['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,C005_LOCK_FILE:file},windowsHide:true,stdio:['pipe','pipe','pipe']});
 const stdoutChunks=[],stderrChunks=[];let spawnError=false,ready=false,closed=false,readyTimedOut=false,forcedKill=false,readyResolve,readyReject,doneResolve;
 const readyPromise=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const donePromise=new Promise(resolve=>{doneResolve=resolve;});
 const readyTimer=setTimeout(()=>{readyTimedOut=true;readyReject(Error('Credential lock fixture timeout'));},15000);
 holder.stdin.on('error',()=>{});
 holder.stdout.on('data',chunk=>{stdoutChunks.push(chunk);if(!ready&&/^locked\r?\n/.test(Buffer.concat(stdoutChunks).toString('utf8'))){ready=true;clearTimeout(readyTimer);readyResolve();}});
 holder.stderr.on('data',chunk=>stderrChunks.push(chunk));
 holder.once('error',()=>{spawnError=true;clearTimeout(readyTimer);readyReject(Error('Credential lock fixture could not start'));});
 holder.once('close',(code,signal)=>{
  closed=true;clearTimeout(readyTimer);const stdout=Buffer.concat(stdoutChunks),stderr=Buffer.concat(stderrChunks);
  const leak=knownSecrets.some(value=>stdout.includes(Buffer.from(value))||stderr.includes(Buffer.from(value)));report.credentialPlaintextLogged||=leak;
  const receipt={kind:'credential-lock-holder',operation:'lock-until-stdin-release',exitCode:code,signal:signal||null,spawnError,readyTimedOut,forcedKill,readyObserved:ready,stdoutBytes:stdout.length,stderrBytes:stderr.length,stderrDiagnostic:leak?'[credential output redacted]':stderr.toString('utf8').slice(0,5000),unexpectedPlaintext:leak,releasedObserved:/^locked\r?\nreleased\r?\n$/.test(stdout.toString('utf8'))};
  report.subprocesses.push(receipt);e.lockFixture=receipt;if(!ready)readyReject(Error('Credential lock fixture exited before acquiring lock'));doneResolve(receipt);
 });
 let receipt;
 try{
  await readyPromise;
  check((await c('read-fails',dir)).code===0,'C treated unreadable file as missing');
  check((await c('write',dir,config)).code===1,'C saved over locked credentials');
  const store=await createSyncStore(dir,{credentialHelper:helper});
  await rejects(()=>store({op:'config-get'}),'Node accepted locked file');
  await rejects(()=>store({op:'config-save',config}),'Node saved locked file');
 }finally{
  holder.stdin.end('\n');const stop=closed?null:setTimeout(()=>{forcedKill=true;holder.kill();},5000);
  receipt=await donePromise;if(stop)clearTimeout(stop);
 }
 check(!receipt.spawnError&&!receipt.readyTimedOut&&!receipt.forcedKill&&receipt.exitCode===0&&!receipt.signal&&receipt.stderrBytes===0&&receipt.releasedObserved,'Credential lock fixture did not release and exit normally');
 check(digest(await fs.readFile(file))===before,'Locked original changed');
 e.checks=['real Windows exclusive sharing failure','both reads and saves reject','original bytes retained','lock fixture released and exited normally'];
});
report.finishedAt=new Date().toISOString();report.counts={passed:report.cases.filter(c=>c.status==='passed').length,failed:report.cases.filter(c=>c.status==='failed').length};report.exitCode=report.counts.failed||report.credentialPlaintextLogged?1:0;
const serialized=JSON.stringify(report,null,2);check(!knownSecrets.some(s=>serialized.includes(s)),'Report attempted credential disclosure');await fs.writeFile(path.join(output,'credential-report.json'),serialized);console.log(JSON.stringify({sourceSha:report.sourceSha,counts:report.counts,credentialPlaintextLogged:report.credentialPlaintextLogged,exitCode:report.exitCode}));process.exitCode=report.exitCode;
