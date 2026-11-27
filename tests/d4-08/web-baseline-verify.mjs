import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const env=process.env,base='04c525c55fc136ad1b960b5d727dab3c5e3165fd';
assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.EXPECTED_SOURCE_SHA,env.GITHUB_SHA);
assert.equal(env.D408_APP_SOURCE_SHA,base);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),env.GITHUB_SHA);
assert.match(env.GITHUB_SHA,/^[a-f0-9]{40}$/);assert.match(env.GITHUB_RUN_ID,/^\d+$/);assert.match(env.GITHUB_RUN_ATTEMPT,/^\d+$/);
assert.equal(process.argv.slice(2).length,4);
const [html,features,work,out]=process.argv.slice(2).map(p=>path.resolve(p)),temp=path.resolve(env.RUNNER_TEMP);
for(const file of [html,features,work,out]){const relative=path.relative(temp,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Use isolated runner paths');}
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const htmlHash=hash(fs.readFileSync(html)),build=read(path.join(path.dirname(html),'build-receipt.json'));
assert.equal(build.sourceSha,base);assert.equal(build.artifact.sha256,htmlHash);
const suites=[];
for(const [file,kind,ids] of [
 [features,'d408-web-independent-real-browser',['T1','T2','T3','T4','F1','F2','F3','F4','F5','F6','F7','F8','F9','N1','N2','N3','N4','N5','K1','K2','K3']],
 [work,'d408-work-preservation-independent-browser',['W01','W02']]
]){
 const report=read(file);
 assert.equal(report.kind,kind);assert.equal(report.suiteSourceSHA,env.GITHUB_SHA);assert.equal(report.appSourceSHA,base);
 assert.equal(report.runId,env.GITHUB_RUN_ID);assert.equal(String(report.attempt),env.GITHUB_RUN_ATTEMPT);assert.equal(report.htmlSha256,htmlHash);
 assert.deepEqual(report.infrastructureErrors,[]);assert.deepEqual(report.cases.map(c=>c.id).sort(),ids.slice().sort());
 assert.ok(report.cases.every(c=>['passed','failed'].includes(c.status)));
 const passed=report.cases.filter(c=>c.status==='passed').length,failed=ids.length-passed;
 assert.deepEqual(report.counts,{planned:ids.length,executed:ids.length,passed,failed,notExecuted:0});
 assert.equal(report.status,failed?'failed':'passed');
 for(const c of report.cases.filter(c=>c.status==='failed'))assert.equal(typeof c.failure?.message,'string');
 suites.push({kind,reportPath:path.relative(temp,file),sha256:hash(fs.readFileSync(file)),counts:report.counts,productStatus:report.status});
}
const receipt={kind:'d408-frozen-web-collection-completeness',status:'collected-complete',suiteSourceSHA:env.GITHUB_SHA,appSourceSHA:base,runId:env.GITHUB_RUN_ID,attempt:Number(env.GITHUB_RUN_ATTEMPT),htmlSha256:htmlHash,suites,productAcceptance:false,productionAdmission:false};
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
