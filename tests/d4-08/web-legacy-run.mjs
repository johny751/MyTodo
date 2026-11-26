// Add an exact artifact binding around the byte-frozen legacy browser runner.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const e=process.env,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.resolve(process.argv[2]||''),temp=path.resolve(e.RUNNER_TEMP||'');
if(e.GITHUB_ACTIONS!=='true'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA||! /^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()!==e.GITHUB_SHA||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ATTEMPT||''))throw Error('Exact hosted source/run/attempt required');
if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('d4-'))throw Error('Direct RUNNER_TEMP/d4-* build required');
const sha=b=>createHash('sha256').update(b).digest('hex'),html=path.join(dir,'mytodo-d4-01-demo.html'),bindingFile=path.join(dir,'d408-legacy-artifact-binding.json');
if(fs.existsSync(bindingFile)||fs.existsSync(path.join(dir,'browser-results.json')))throw Error('Legacy output must be fresh');
const build=JSON.parse(fs.readFileSync(path.join(dir,'build-receipt.json'))),before=sha(fs.readFileSync(html));
if(build.sourceSha!==e.GITHUB_SHA||build.runId!==e.GITHUB_RUN_ID||build.runAttempt!==e.GITHUB_RUN_ATTEMPT||build.artifact.sha256!==before||!build.d408Composition)throw Error('Exact composed build required');
const startedAt=new Date().toISOString(),child=spawnSync(process.execPath,['tests/d4-ui/run-browser.mjs',dir],{cwd:root,env:e,stdio:'inherit',windowsHide:true});
const reportFile=path.join(dir,'browser-results.json'),bytes=fs.existsSync(reportFile)?fs.readFileSync(reportFile):null,report=bytes?JSON.parse(bytes):null,after=sha(fs.readFileSync(html));
const passed=child.status===0&&!child.error&&before===after&&report?.status==='passed'&&report.sourceSHA===e.GITHUB_SHA&&report.runId===e.GITHUB_RUN_ID&&report.runAttempt===e.GITHUB_RUN_ATTEMPT;
const binding={kind:'d408-unchanged-legacy-runner-artifact-binding',status:passed?'passed':'failed',sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,startedAt,finishedAt:new Date().toISOString(),htmlSha256Before:before,htmlSha256After:after,reportSha256:bytes?sha(bytes):null,runnerPath:'tests/d4-ui/run-browser.mjs',runnerSha256:sha(fs.readFileSync(path.join(root,'tests/d4-ui/run-browser.mjs'))),exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null};
fs.writeFileSync(bindingFile,JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
if(!passed)process.exitCode=1;
