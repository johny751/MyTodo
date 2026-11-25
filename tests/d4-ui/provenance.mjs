import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA)throw Error('Actions identity required');
const manifest=JSON.parse(readFileSync('docs/upgrade/d4-03/audited-source-manifest.json'));
const mismatches=[];
for(const file of manifest.files){const bytes=execFileSync('git',['show',manifest.baseline+':'+file.path],{maxBuffer:16*1024*1024,windowsHide:true});if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)mismatches.push(file.path);}
const report={sourceSHA:process.env.GITHUB_SHA,baseline:manifest.baseline,files:manifest.files.length,mismatches,status:mismatches.length?'failed':'passed'};
writeFileSync(process.env.RUNNER_TEMP+'/d403-source-provenance.json',JSON.stringify(report,null,2));
if(mismatches.length)throw Error('Audited source not equal to frozen baseline: '+mismatches.join(','));
console.log(JSON.stringify(report));
