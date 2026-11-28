// Preserve old builders byte-for-byte while assigning honest versions in the new workflow.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareFlowDiagnostics} from '../d4-08/android/diagnostics/prepare-flow-diagnostics.mjs';
const e=process.env,root=process.cwd(),[kind,input,output]=process.argv.slice(2);
if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REF!=='refs/heads/d4/d4-09-design-candidate-1'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('D409 exact Actions identity required');
if(!['d403','d405'].includes(kind)||!input||!output)throw Error('Usage: legacy-android-build.mjs d403|d405 HTML OUTPUT');
const temp=await fs.realpath(e.RUNNER_TEMP),work=path.join(temp,'d409-'+kind+'-build-adapter');await fs.mkdir(work);
const originalPrepare=kind==='d403'?'prototypes/d4-03-platforms/prepare.mjs':'android/d405/prepare.mjs';
const originalBuild=kind==='d403'?'prototypes/d4-03-platforms/build-android.sh':'android/d405/build-android-d405.sh';
const originalHistory=kind==='d403'?'prototypes/d4-03-platforms/version-history.json':'android/d405/version-history.json';
const read=p=>fs.readFile(path.join(root,p),'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
let prepare=await read(originalPrepare),build=await read(originalBuild),history=JSON.parse(await read(originalHistory));
const prior={sourceSHA:'04c525c55fc136ad1b960b5d727dab3c5e3165fd',runId:'45743320346',runAttempt:'1',buildTimeUTC:kind==='d403'?'2026-11-26T02:36:02.285Z':'2026-11-26T02:36:03.559Z',versionName:kind==='d403'?'0.3.30':'0.5.3',versionCode:kind==='d403'?403030:405003,changes:['冻结04c525c已交付的隔离候选；原测试及原始失败证据保留；未批准生产使用。']};
if(kind==='d405')Object.assign(prior,{packageName:'local.gxtodo.d405candidate',syntheticOnly:true,stableSigning:false,productionSync:false,released:false,accepted:false,status:'CANDIDATE_TESTED',statusText:'隔离模拟器15项通过；人工指出功能缺口，进入D408整改。'});
const entries=kind==='d403'?history.versions:history;
if(entries.some(x=>x.versionCode===prior.versionCode))throw Error('Adapter previous-version entry already exists; review offset/history');
entries.unshift(prior);
const acceptedPrior={sourceSHA:'7c217d8779ccf21e13733b28868e015e9cfd693a',runId:'46018074859',runAttempt:'1',
  buildTimeUTC:kind==='d403'?'2026-11-27T14:42:24.358Z':'2026-11-27T14:42:15.669Z',
  versionName:kind==='d403'?'0.3.39':'0.5.12',versionCode:kind==='d403'?403039:405012,
  changes:['D408最终隔离回归辅助APK，原套件58/58或15/15；原始运行与失败历史保留，未获得生产准入。']};
if(kind==='d405')Object.assign(acceptedPrior,{packageName:'local.gxtodo.d405candidate',syntheticOnly:true,stableSigning:false,productionSync:false,released:false,accepted:false,status:'CANDIDATE_TESTED',statusText:'最终D408源码的辅助隔离原生服务回归通过；不是本轮新UI验收。'});
if(entries.some(x=>x.versionCode===acceptedPrior.versionCode))throw Error('Verified D408 final history already exists; review ordinal');
entries.unshift(acceptedPrior);
const historyFile=path.join(work,'known-history.json');await fs.writeFile(historyFile,JSON.stringify(history,null,2)+'\n');
const edits=[];
function replaceOnce(oldValue,newValue,reason){if(prepare.split(oldValue).length!==2)throw Error('Frozen builder seam changed: '+reason);prepare=prepare.replace(oldValue,newValue);edits.push({old:oldValue,replacement:newValue,reason});}
if(kind==='d403'){
 replaceOnce("const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),e=process.env;",'const root='+JSON.stringify(root)+',e=process.env;','Generated preparation stays bound to source checkout');
 replaceOnce("const versionOffset=e.GITHUB_REF==='refs/heads/d4/native-integration-candidate-1'?27:0;",'const versionOffset=39;','New workflow counter adds to actual prior 403039; real GITHUB_RUN_NUMBER remains unchanged');
 replaceOnce("path.join(root,'prototypes/d4-03-platforms/version-history.json')",JSON.stringify(historyFile),'Retain all old history plus verified final frozen build');
}else{
 replaceOnce("const versionCode = 405000 + Number(e.GITHUB_RUN_NUMBER), versionName = '0.5.' + e.GITHUB_RUN_NUMBER;","const d409LegacyOrdinal=12+Number(e.GITHUB_RUN_NUMBER),versionCode=405000+d409LegacyOrdinal,versionName='0.5.'+d409LegacyOrdinal;",'New workflow counter adds to actual prior 405012; real GITHUB_RUN_NUMBER remains unchanged');
 replaceOnce("'android/d405/version-history.json'",JSON.stringify(historyFile),'Retain all old history plus verified final frozen build');
}
const generated=path.join(work,'prepare.mjs');await fs.writeFile(generated,prepare);
const call='node '+originalPrepare+' "$demo" "$out"';if(build.split(call).length!==2)throw Error('Frozen build invocation changed');
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
build=build.replace(call,'node '+quote(generated)+' "$demo" "$out"');
if(kind==='d403')({build}=await prepareFlowDiagnostics(root,work,build));
const shell=path.join(work,'build.sh');await fs.writeFile(shell,build);
await fs.writeFile(path.join(work,'adapter-receipt.json'),JSON.stringify({sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,actualRunNumber:e.GITHUB_RUN_NUMBER,regressionOnly:true,kind,edits,originalPrepare:{path:originalPrepare,sha256:hash(await fs.readFile(originalPrepare))},originalBuild:{path:originalBuild,sha256:hash(await fs.readFile(originalBuild))},generatedPrepareSHA256:hash(prepare),generatedBuildSHA256:hash(build),priorVerifiedBuilds:[acceptedPrior,prior],productionSigning:false,originalFilesModified:false},null,2)+'\n');
const code=await new Promise((resolve,reject)=>{const child=spawn('bash',[shell,input,output],{cwd:root,env:e,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
if(code!==0)process.exitCode=code||1;
