import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {cloudOnly,confined,startMigrationServer,sha} from './fixture-server.mjs';
cloudOnly();
const argv=process.argv.slice(2),option=name=>{const index=argv.indexOf(name);return index<0?null:argv[index+1];};
const root=process.cwd(),output=confined(option('--output')),apk=option('--apk'),serial=option('--serial');
const exact=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(exact!==process.env.EXPECTED_SOURCE_SHA||!/^[0-9a-f]{40}$/.test(exact)||!apk||!/^emulator-[0-9]+$/.test(serial||''))throw Error('Exact source, test APK and cloud emulator are required');
execFileSync('git',['diff','--exit-code','HEAD','--','src','windows','android']);
const environmentFile=option('--environment');
if(!environmentFile)throw Error('Exact-run Android environment receipt is required');
const environment=JSON.parse(await fs.readFile(environmentFile,'utf8'));
if(environment.status!=='ready'||environment.serial!==serial||environment.sourceSha!==exact||environment.runId!==process.env.GITHUB_RUN_ID||environment.runAttempt!==process.env.GITHUB_RUN_ATTEMPT)throw Error('Android runtime evidence belongs to another run or is not ready');
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'android-environment.json'),JSON.stringify(environment,null,2)+'\n');
const run=path.join(root,'tests/protocol-harness/android/run-android.mjs'),cases=[];
const empty={version:1,tasks:[],notes:[],projects:[],tags:[],places:[]};
const legacy={...empty,notes:[{id:'legacy-note',body:'迁移 🧭',createdAt:'2026-01-01T00:00:00Z'}]},text=JSON.stringify({format:'gxtodo-sync',version:1,state:legacy}),backup='v2/legacy-android.json.gz';
const local={...empty,notes:[{id:'local-note',body:'local',createdAt:'2026-01-02T00:00:00Z'}]};
const must=(value,message)=>{if(!value)throw Error(message);};
async function operation(context,operation,extra={}){
 const n=context.operations.length+1,input=path.join(context.directory,'input-'+n+'.json'),out=path.join(context.directory,'output-'+n+'.json');
 const dbCase=extra.dbCase||context.id;
 const request={caseId:context.id,mode:'migration',operation,fixtureUrl:context.server.origin,folder:context.server.folder,...extra};delete request.dbCase;
 await fs.writeFile(input,JSON.stringify(request,null,2)+'\n');
 const execution=await new Promise(resolve=>{
  const child=spawn(process.execPath,[run,'--apk',apk,'--input',input,'--output',out,'--serial',serial,'--db-case',dbCase],{cwd:root,env:process.env,windowsHide:true});
  let stdout='',stderr='',error=null,timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},300000);
  child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',e=>error=String(e));child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,error,timedOut,stdout,stderr});});
 });
 const result=await fs.readFile(out,'utf8').then(JSON.parse).catch(()=>null),receipt=await fs.readFile(out+'.receipt.json','utf8').then(JSON.parse).catch(()=>null);
 context.operations.push({input,out,dbCase,execution,receipt});
 await fs.writeFile(path.join(context.directory,'process-'+n+'.json'),JSON.stringify(context.operations.at(-1),null,2)+'\n');
 must(execution.code===0&&execution.signal===null&&!execution.error&&!execution.timedOut,'Real Android execution failed/crashed/timed out');
 must(receipt?.dbCase===dbCase,'Android execution switched the selected database');
 must(typeof result?.rawSQL?.databaseFile==='string'&&result.rawSQL.databaseFile.endsWith('/protocol-cases/'+dbCase+'/tasks.sqlite'),'Android result does not identify the selected database');
 must(result?.status==='passed'&&receipt?.restartComparison?.status==='passed','Android acceptance or same-DB restart comparison failed');
 must(result.provenance?.sourceSha===exact,'APK source SHA mismatch');
 must(result.operationAccepted===(request.expectedAccepted!==false),'Android production outcome mismatch');
 return result;
}
async function test(id,{files,faults=[]},body){
 const directory=path.join(output,id);await fs.mkdir(directory,{recursive:true});
 const server=await startMigrationServer({directory:path.join(directory,'cloud'),folder:id,initialFiles:files,faults}),context={id,directory,server,operations:[]};
 let status='passed',error=null;try{await body(context);}catch(e){status='failed';error=String(e?.stack||e);}finally{await server.close();await fs.writeFile(path.join(directory,'cloud-final.json'),JSON.stringify(await server.readFiles(),null,2)+'\n');}
 const result={id,platform:'android',sourceSha:exact,status,error,operations:context.operations,faults:server.faults()};cases.push(result);await fs.writeFile(path.join(directory,'case.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify({id,status,error})+'\n');
}
async function initialize(c,state=local,dbCase){return operation(c,'initialize',{state,dbCase});}
async function sync(c,extra={}){const result=await operation(c,'sync',extra);if(extra.expectedAccepted!==false)must(!result.sync.more&&result.raw.outbox.length===0&&!result.raw.meta.pending,'Android outbox did not drain');return result;}
async function observer(c){const dbCase=c.id+'-observer';await initialize(c,empty,dbCase);const result=await sync(c,{dbCase});must(result.raw.rows.some(r=>!r.deleted&&JSON.parse(r.key)[1]==='legacy-note'),'Fresh Android observer missing legacy note');return result;}
await test('C006-A02-legacy',{files:[{path:'state.json',body:text}]},async c=>{await initialize(c);await sync(c);await observer(c);const files=await c.server.readFiles();must(files.some(f=>f.path.startsWith('v2/legacy-')&&f.plainSha256===sha(Buffer.from(text))),'Android backup bytes were not preserved');});
for(const [id,faultPath,phase,effect] of [['C006-A06-fence-drop','state.json','after-write',{disconnect:true}],['C006-A27-manifest-fail','v2/manifest.json','before-write',{status:500}],['C006-A28-manifest-drop','v2/manifest.json','after-write',{disconnect:true}]])await test(id,{files:[{path:'state.json',body:text}],faults:[{id,method:'PUT',path:faultPath,phase,effect}]},async c=>{
 await initialize(c);const failed=await sync(c,{expectedAccepted:false}),retried=await sync(c);must(failed.raw.meta.actor===retried.raw.meta.actor&&failed.rawSQL.databaseFile===retried.rawSQL.databaseFile,'Android failure retry switched databases');await observer(c);must(c.server.faults()[0].used===1,'Android fault was not exercised');
});
await test('C006-A19-missing-backup',{files:[{path:'state.json',body:JSON.stringify({format:'gxtodo-sync',version:2})}]},async c=>{await initialize(c);await sync(c,{expectedAccepted:false});must(!c.server.entries.some(e=>e.method==='PUT'),'Malformed Android guard caused a write');});
await test('C006-A35-tombstone',{files:[{path:'state.json',body:JSON.stringify({format:'gxtodo-sync',version:2,backup})},{path:backup,body:text}]},async c=>{
 await initialize(c,legacy);await operation(c,'edit',{changes:[{key:JSON.stringify(['notes','legacy-note']),values:{_deleted:true}}]});const result=await sync(c);must(result.raw.rows.find(r=>JSON.parse(r.key)[1]==='legacy-note')?.deleted,'Android migration resurrected a tombstone');
});
const summary={sourceSha:exact,executed:cases.length,passed:cases.filter(c=>c.status==='passed').length,failed:cases.filter(c=>c.status==='failed').length,
 scope:'real Android production syncDelta and SQLite; every operation force-stops and reopens same dbCase; no abrupt migration-boundary Android kill case claimed',cases:cases.map(({id,status,error})=>({id,status,error}))};
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');process.exitCode=summary.failed?1:0;
