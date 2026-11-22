import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {execFile,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSyncStore} from '../src/sync-server.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const execute=(file,args,options={})=>new Promise(resolve=>execFile(file,args,{windowsHide:true,timeout:20000,maxBuffer:1024*1024,...options},(error,stdout,stderr)=>resolve({code:error?.code||0,stdout,stderr})));
const listen=(server,port=0,host='127.0.0.1')=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen({port,host,exclusive:true},()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>server.close(resolve));
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gxtodo-web-release-'));
 const install=path.join(directory,'install'),data=path.join(directory,'data'),runtime=path.join(directory,'runtime');
 await fs.mkdir(install);await fs.copyFile(path.join(sourceRoot,'scripts/web-launcher.cjs'),path.join(install,'launcher.cjs'));
 for(const file of ['server.mjs','package.json','index.html','styles.css','interaction.css','README.md'])await fs.copyFile(path.join(sourceRoot,file),path.join(install,file));
 await fs.cp(path.join(sourceRoot,'src'),path.join(install,'src'),{recursive:true});
 const probe=net.createServer();let port=await listen(probe);await close(probe);
 if(port>65525)port=41730;
 const env={...process.env,GXTODO_DATA_DIR:data,GXTODO_RUNTIME_DIR:runtime,PORT:String(port)};
 const run=action=>execute(process.execPath,[path.join(install,'launcher.cjs'),action,'--no-browser'],{env});
 const state=async()=>{const file=(await fs.readdir(runtime)).find(f=>f.endsWith('.json'));return file?{file:path.join(runtime,file),value:JSON.parse(await fs.readFile(path.join(runtime,file),'utf8'))}:null;};
 t.after(async()=>{await run('stop');const current=await state().catch(()=>null);if(current?.value.pid)try{process.kill(current.value.pid);}catch{}assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.match(path.basename(directory),/^gxtodo-web-release-/);await fs.rm(directory,{recursive:true,force:true});});
 return {directory,install,data,runtime,port,run,state};
}
async function readHealth(port){return fetch('http://127.0.0.1:'+port+'/api/health').then(r=>r.json());}
function connects(host,port){return new Promise(resolve=>{const socket=net.connect({host,port});socket.setTimeout(700);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});}
test('网页发布启动避开非HTTP占用端口，重复启动复用，停止和重启保留数据',async t=>{
 const f=await fixture(t),sockets=new Set(),blocker=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await listen(blocker,f.port);t.after(async()=>{for(const socket of sockets)socket.destroy();await close(blocker);});
 const started=await f.run('start');assert.equal(started.code,0,started.stderr);
 let state=(await f.state()).value;assert.equal(state.port,f.port+1);
 const health=await readHealth(state.port);assert.equal(health.pid,state.pid);assert.equal(path.resolve(health.dataDir),f.data);assert.equal(path.resolve(health.installRoot),f.install);
 for(const module of (await fs.readdir(path.join(sourceRoot,'src'))).filter(name=>name.endsWith('.mjs')&&!['account-store.mjs','sqlite-store.mjs','sync-server.mjs'].includes(name))){const response=await fetch('http://127.0.0.1:'+state.port+'/src/'+module);assert.equal(response.status,200,module);await response.body.cancel();}
 const outside=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal);if(outside)assert.equal(await connects(outside.address,state.port),false);
 const hostStatus=await new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:state.port,path:'/api/health',headers:{Host:'example.invalid:'+state.port}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostStatus,403);
 const repeated=await f.run('start');assert.equal(repeated.code,0,repeated.stderr);assert.equal((await f.state()).value.pid,state.pid);assert.match((await f.run('status')).stdout,/正在运行/);
 const invalid=await fetch('http://127.0.0.1:'+state.port+'/api/local-control/stop',{method:'POST',headers:{'Content-Type':'application/json','x-gx-control':'é'.repeat(64)},body:'{}'});assert.equal(invalid.status,403);assert.equal((await readHealth(state.port)).pid,state.pid);
 const saved=await fetch('http://127.0.0.1:'+state.port+'/api/state').then(r=>r.json());saved.tags=['isolated-release-check'];
 const write=await fetch('http://127.0.0.1:'+state.port+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json','x-gx-storage':'2'},body:JSON.stringify(saved)});assert.equal(write.status,200);await write.body.cancel();
 assert.equal((await f.run('stop')).code,0);assert.match((await f.run('status')).stdout,/未运行/);assert.equal(await connects('127.0.0.1',state.port),false);
 assert.equal((await f.run('stop')).code,0);assert.equal((await f.run('start')).code,0);
 state=(await f.state()).value;assert.notEqual(state.pid,health.pid);const restored=await fetch('http://127.0.0.1:'+state.port+'/api/state').then(r=>r.json());assert.deepEqual(restored.tags,saved.tags);
});
test('两个并发启动只创建一个服务，版本改变时拒绝复用旧服务',async t=>{
 const f=await fixture(t),results=await Promise.all([f.run('start'),f.run('start')]);for(const result of results)assert.equal(result.code,0,result.stderr);
 const first=(await f.state()).value,health=await readHealth(first.port);assert.equal(health.pid,first.pid);
 const packageFile=path.join(f.install,'package.json'),original=await fs.readFile(packageFile,'utf8'),updated=JSON.parse(original);updated.version+='-qa-new';await fs.writeFile(packageFile,JSON.stringify(updated));
 const changed=await f.run('start');assert.equal(changed.code,1);assert.match(changed.stderr,/其他版本/);assert.equal((await readHealth(first.port)).pid,first.pid);await fs.writeFile(packageFile,original);
 const otherInstall=path.join(f.directory,'second-install');await fs.cp(f.install,otherInstall,{recursive:true});
 const other=await execute(process.execPath,[path.join(otherInstall,'launcher.cjs'),'start','--no-browser'],{env:{...process.env,GXTODO_DATA_DIR:f.data,GXTODO_RUNTIME_DIR:f.runtime,PORT:String(first.port+11)}});assert.equal(other.code,1);assert.match(other.stderr,/原启动方式/);assert.equal((await readHealth(first.port)).pid,first.pid);
});
test('失效的PID记录不会停止仍在监听的其他服务',async t=>{
 const f=await fixture(t);assert.equal((await f.run('start')).code,0);const state=await f.state(),original=state.value;await fs.writeFile(state.file,JSON.stringify({...original,pid:original.pid+1}));
 assert.equal((await f.run('stop')).code,0);assert.equal((await readHealth(original.port)).pid,original.pid);await fs.writeFile(state.file,JSON.stringify(original));
});
const helper=path.join(sourceRoot,'dist/WebCredentialHelper.exe');
const hasHelper=process.platform==='win32'&&await fs.access(helper).then(()=>true,()=>false);
function helperCall(operation,input){return new Promise(resolve=>{const child=spawn(helper,[operation],{windowsHide:true,stdio:['pipe','pipe','pipe']});const output=[];child.stdout.on('data',chunk=>output.push(chunk));child.stderr.resume();child.once('error',error=>resolve({code:-1,output:Buffer.alloc(0),error}));child.once('close',code=>resolve({code,output:Buffer.concat(output)}));child.stdin.on('error',()=>{});child.stdin.end(input);});}
test('Windows DPAPI helper保留UTF8新配置并兼容合成UTF16旧配置', {skip:!hasHelper&&'Windows helper build unavailable'},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gxtodo-dpapi-qa-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.match(path.basename(directory),/^gxtodo-dpapi-qa-/);await fs.rm(directory,{recursive:true,force:true});});
 const dummy={enabled:true,autoSync:false,username:'qa@example.invalid',password:'test-only-páss-中文🙂',folder:'Legacy-QA'};
 const legacy=await helperCall('--protect',Buffer.from(JSON.stringify(dummy),'utf16le'));assert.equal(legacy.code,0);
 await fs.writeFile(path.join(directory,'sync-config.enc'),legacy.output);
 let sync=await createSyncStore(directory,{credentialHelper:helper});const redacted=await sync({op:'config-get'});assert.equal(redacted.username,dummy.username);assert.equal(redacted.password,undefined);assert.equal(redacted.configured,true);
 await sync({op:'config-save',config:{...dummy,password:''}});const disk=await fs.readFile(path.join(directory,'sync-config.enc'),'utf8');assert.match(disk,/^gx-dpapi-v1:/);assert.ok(!disk.includes(dummy.password));
 sync=await createSyncStore(directory,{credentialHelper:helper});assert.deepEqual(await sync({op:'config-get'}),redacted);
 const unicode=Buffer.from('中文🙂páss'.repeat(10000),'utf8'),encrypted=await helperCall('--protect',unicode);assert.equal(encrypted.code,0);const decoded=await helperCall('--unprotect',encrypted.output);assert.equal(decoded.code,0);assert.deepEqual(decoded.output,unicode);
 for(const malformed of [Buffer.from([0,1,2]),Buffer.from([0,0xd8])]){const protectedValue=await helperCall('--protect',malformed);assert.equal(protectedValue.code,0);assert.notEqual((await helperCall('--unprotect-legacy',protectedValue.output)).code,0);}
 assert.notEqual((await helperCall('--unprotect',Buffer.from('not-hex'))).code,0);
});
