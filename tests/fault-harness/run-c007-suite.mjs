import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 suite is GitHub-only');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
const platform=args.platform,root=path.resolve(process.env.RUNNER_TEMP||''),output=path.resolve(args.output||''),rel=path.relative(root,output);
if(!['windows-c','javascript','android'].includes(platform)||!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Explicit platform and RUNNER_TEMP output required');
await fs.mkdir(output,{recursive:false});const sha=b=>createHash('sha256').update(b).digest('hex');
const summary={schema:'mytodo-c007-suite',sourceSha:process.env.EXPECTED_SOURCE_SHA||process.env.GITHUB_SHA,platform,status:'failed',cases:[],commands:[]};
async function invoke(label,argv){
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,argv,{windowsHide:true,env:process.env});let stdout='',stderr='',error=null;child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.once('error',e=>error=String(e));child.once('close',(code,signal)=>resolve({code,signal,error,stdout,stderr}));});
 await fs.writeFile(path.join(output,label+'.stdout.log'),result.stdout,{flag:'wx'});await fs.writeFile(path.join(output,label+'.stderr.log'),result.stderr,{flag:'wx'});
 summary.commands.push({label,argv,code:result.code,signal:result.signal,error:result.error,stdoutSha256:sha(result.stdout),stderrSha256:sha(result.stderr)});return result;
}
try{
 const scenarios=path.join(output,'network-scenarios'),sql=path.join(output,'sql.json');
 if((await invoke('materialize-network',['tests/fault-harness/make-c007-network-scenarios.mjs',platform,scenarios])).code!==0)throw Error('Network scenario generation failed');
 if((await invoke('materialize-sql',['tests/fault-harness/make-c007-scenario.mjs',platform,sql])).code!==0)throw Error('SQL scenario generation failed');
 const cases=[{caseId:'sql-atomicity',file:sql},...JSON.parse(await fs.readFile(path.join(scenarios,'cases.json'),'utf8'))];
 const extra=platform==='windows-c'?['--windows-exe',args['windows-exe']]:platform==='android'?['--apk',args.apk,'--prepared',args.prepared,'--serial',args.serial]:[];
 for(const test of cases){const dir=path.join(output,test.caseId),run=await invoke(test.caseId,['tests/fault-harness/c007-same-db-controller.mjs','--scenario',test.file,'--output',dir,...extra]);const report=await fs.readFile(path.join(dir,'summary.json'),'utf8').then(JSON.parse).catch(()=>null);summary.cases.push({caseId:test.caseId,exitCode:run.code,status:run.code===0&&report?.status==='passed'?'passed':'failed',summaryPath:path.join(dir,'summary.json'),error:report?.error||run.error});}
 summary.status=summary.cases.length===10&&summary.cases.every(c=>c.status==='passed')?'passed':'failed';
}catch(error){summary.error=String(error.stack||error);}
finally{summary.exitCode=summary.status==='passed'?0:1;await fs.writeFile(path.join(output,'suite.json'),JSON.stringify(summary,null,2),{flag:'wx'});process.exitCode=summary.exitCode;}
