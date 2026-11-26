import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const e=process.env,base='04c525c55fc136ad1b960b5d727dab3c5e3165fd',run='45743320346';
if(e.GITHUB_ACTIONS!=='true'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('Exact Actions harness source required');
const [kind,input]=process.argv.slice(2),root=await fs.realpath(input),temp=await fs.realpath(e.RUNNER_TEMP),rel=path.relative(temp,root);
if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Input must be inside RUNNER_TEMP');
async function walk(dir){const out=[];for(const ent of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isSymbolicLink())throw Error('Linked input rejected');if(ent.isDirectory())out.push(...await walk(p));else if(ent.isFile())out.push(p);}return out;}
const files=await walk(root);
function unique(name){const found=files.filter(p=>path.basename(p)===name);if(found.length!==1)throw Error('Expected one '+name+', found '+found.length);return found[0];}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const response=await fetch(`https://api.github.com/repos/${e.GITHUB_REPOSITORY}/actions/runs/${run}`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+e.GH_TOKEN,'User-Agent':'MyTodo-D408-baseline'}});
if(!response.ok)throw Error('Baseline run API '+response.status);
const metadata=await response.json();
if(metadata.head_sha!==base||String(metadata.run_attempt)!=='1'||metadata.conclusion!=='success'||metadata.status!=='completed')throw Error('Frozen run identity differs');
let artifact,receipt;
if(kind==='windows'){
 artifact=unique('MyTodo-Native-Candidate.exe');receipt=JSON.parse(await fs.readFile(unique('native-build-identity.json'),'utf8'));
 if(receipt.sourceSHA!==base||receipt.runId!==run||receipt.runAttempt!=='1'||receipt.executable.sha256!=='4e4d49e652ecfa60b96e959226ac69033f4722587abea384f2c47bac3e6e8890')throw Error('Frozen native receipt differs');
 if(hash(await fs.readFile(artifact))!==receipt.executable.sha256)throw Error('Frozen EXE hash differs');
}else if(kind==='web'){
 artifact=unique('mytodo-d4-01-demo.html');receipt=JSON.parse(await fs.readFile(unique('build-receipt.json'),'utf8'));
 if(receipt.sourceSha!==base||receipt.runId!==run||receipt.runAttempt!=='1'||hash(await fs.readFile(artifact))!==receipt.artifact.sha256)throw Error('Frozen HTML identity/hash differs');
}else throw Error('Unknown platform');
await fs.writeFile(path.join(root,'D408-FROZEN-INPUT.json'),JSON.stringify({harnessSourceSHA:e.GITHUB_SHA,harnessRun:e.GITHUB_RUN_ID,harnessAttempt:e.GITHUB_RUN_ATTEMPT,productSourceSHA:base,productRun:run,productAttempt:1,artifact,artifactSha256:hash(await fs.readFile(artifact)),receipt,originalRun:metadata},null,2)+'\n');
await fs.appendFile(e.GITHUB_ENV,`D408_BASELINE_ARTIFACT=${artifact}\n`);
console.log(JSON.stringify({kind,artifact,source:base,run,attempt:1}));
