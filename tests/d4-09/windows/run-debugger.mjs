// Supplementary fixed repetitions of the exact original --drag-regression command.
// The debugger observes exceptions; it never turns an exception into success.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const e=process.env,root=process.cwd();
const [exeArg,debuggerArg,originalArg,outputArg]=process.argv.slice(2);
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(process.platform,'win32');
assert.equal(e.GITHUB_WORKFLOW,'D4-09 candidate UI crash diagnostics');
assert.equal(e.GITHUB_REF,'refs/heads/d4/d4-09-design-candidate-1');
assert.equal(e.GITHUB_SHA,e.EXPECTED_SOURCE_SHA);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),e.GITHUB_SHA);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'');
const temp=fs.realpathSync(e.RUNNER_TEMP);
function existing(p){const full=fs.realpathSync(p);assert.ok(full.toLowerCase().startsWith(temp.toLowerCase()+path.sep));let cur=full;while(cur.toLowerCase()!==temp.toLowerCase()){assert.equal(fs.lstatSync(cur).isSymbolicLink(),false);cur=path.dirname(cur);}return full;}
const exe=existing(exeArg),debuggerExe=existing(debuggerArg),originalPath=existing(originalArg);
const output=path.resolve(outputArg);assert.equal(path.dirname(output).toLowerCase(),temp.toLowerCase());
assert.match(path.basename(output),/^d409-debugger-evidence-[0-9]+-[0-9]+$/);
assert.equal(fs.existsSync(output),false);fs.mkdirSync(output);
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const original=JSON.parse(fs.readFileSync(originalPath));
assert.equal(original.sourceSha,e.GITHUB_SHA);assert.equal(String(original.runId),e.GITHUB_RUN_ID);assert.equal(String(original.runAttempt),e.GITHUB_RUN_ATTEMPT);
assert.equal(original.executable.sha256,hash(exe));
assert.equal(original.suites.length,9);assert.ok(original.startupGuards.length>0&&original.startupGuards.every(row=>row.passed===true));
const pdb=existing(exe.replace(/\.exe$/i,'.pdb'));
const buildPath=existing(exe+'.build.json'),build=JSON.parse(fs.readFileSync(buildPath));
assert.equal(build.sourceSha,e.GITHUB_SHA);assert.equal(String(build.runId),e.GITHUB_RUN_ID);assert.equal(String(build.runAttempt),e.GITHUB_RUN_ATTEMPT);
assert.equal(build.executable.sha256,hash(exe));assert.equal(build.debugSymbols?.sha256,hash(pdb));
assert.equal(build.debugSymbols?.externalDebuggerOnly,true);
const report={schemaVersion:1,kind:'external-debugger-original-legacy-drag',sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,
  startedAtUtc:new Date().toISOString(),completedAtUtc:null,requestedIterations:20,executedIterations:0,
  executable:{path:exe,bytes:fs.statSync(exe).size,sha256:hash(exe)},pdb:{path:pdb,bytes:fs.statSync(pdb).size,sha256:hash(pdb)},
  debugger:{path:debuggerExe,sha256:hash(debuggerExe)},productBuild:{path:buildPath,sha256:hash(buildPath)},originalReport:{path:originalPath,sha256:hash(originalPath),passed:original.passed},
  frozenDragSourceSha256:hash(path.join(root,'windows/drag-test.c')),productInstrumentation:false,productionAdmission:false,
  originalFailureResolved:false,notPhysicalOwnerAcceptance:true,runResults:[],fatalError:null,passed:false,
  limitations:['A debugger can change timing; zero reproductions do not prove a fix.','PDB symbols resolve only the exact product build; OS symbols are not downloaded.','Every original suite result remains authoritative and is separately uploaded.','Exception captures are bounded to eight per process; any overflow fails diagnostic integrity.']};
const reportFile=path.join(output,'debugger-report.json');
const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');save();
try {
  for(let iteration=1;iteration<=report.requestedIterations;iteration++) {
    assert.equal(hash(exe),report.executable.sha256);assert.equal(hash(debuggerExe),report.debugger.sha256);
    const dir=path.join(output,`iteration-${String(iteration).padStart(2,'0')}`);fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'synthetic-data'));fs.mkdirSync(path.join(dir,'render'));
    const start=Date.now();
    const execution=spawnSync(debuggerExe,[exe,dir],{cwd:root,windowsHide:false,encoding:'utf8',maxBuffer:4*1024*1024,timeout:205000});
    fs.writeFileSync(path.join(dir,'wrapper-stdout.log'),execution.stdout||'');fs.writeFileSync(path.join(dir,'wrapper-stderr.log'),execution.stderr||'');
    const eventFile=path.join(dir,'debug-events.jsonl');
    let events=[],parseError=null;try{events=fs.readFileSync(eventFile,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}catch(error){parseError=String(error);}
    const exits=events.filter(row=>row.type==='exit'),exit=exits.length===1?exits[0]:null;
    const stdoutFile=path.join(dir,'stdout.log'),stdout=fs.existsSync(stdoutFile)?fs.readFileSync(stdoutFile,'utf8'):'';
    const failLines=stdout.split(/\r?\n/).filter(line=>/^FAIL\b/.test(line));
    const passes=stdout.split(/\r?\n/).filter(line=>/^PASS\b/.test(line));
    const checksComplete=/DRAG REGRESSION 101 checks, 0 failures\s*$/.test(stdout.trim())&&passes.length===101&&failLines.length===0;
    const productSymbols=events.filter(row=>row.type==='product-symbols');
    const symbolsMatched=productSymbols.length===1&&productSymbols[0].matchedPdbLoaded===true&&productSymbols[0].pdbUnmatched===false;
    const integrity=parseError===null&&exit!==null&&exit.exitEventObserved&&!exit.diagnosticFatal&&!exit.processStillRunning&&!exit.timedOut&&exit.captureErrors===0&&execution.error===undefined&&symbolsMatched;
    const observedPass=integrity&&execution.status===0&&exit.childExitCode===0&&checksComplete;
    const files=[];function inventory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);if(entry.isDirectory())inventory(file);else files.push({path:path.relative(dir,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:hash(file)});}}inventory(dir);
    report.runResults.push({iteration,durationMs:Date.now()-start,wrapperExitCode:execution.status,wrapperSignal:execution.signal,error:execution.error?String(execution.error):null,
      childExit:exit,parseError,checksComplete,passLines:passes.length,failLines,productSymbols,symbolsMatched,integrity,observedPass,
      exceptions:events.filter(row=>row.type==='exception'),captures:events.filter(row=>row.type==='dump'),files});
    report.executedIterations=iteration;save();console.log(`${observedPass?'PASS':'FAIL'} debugger iteration ${iteration}: child ${exit?.childExitHex??'unknown'}, ${passes.length} PASS lines`);
    // Never continue after an unknown/live process or broken debugger ownership boundary.
    if(!exit||exit.processStillRunning||exit.diagnosticFatal||execution.error)throw Error('Debugger ownership/integrity failed; remaining fixed iterations were not executed.');
  }
}catch(error){report.fatalError=String(error);}
report.completedAtUtc=new Date().toISOString();
report.passed=report.fatalError===null&&report.executedIterations===report.requestedIterations&&report.runResults.every(row=>row.observedPass);
save();if(!report.passed)process.exitCode=1;
