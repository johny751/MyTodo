import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const env=process.env;
if(env.GITHUB_ACTIONS!=='true'||env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==env.GITHUB_SHA)throw Error('Exact Actions source required');
const [outArg,role]=process.argv.slice(2),out=await fs.realpath(outArg),temp=await fs.realpath(env.RUNNER_TEMP);
if(path.dirname(out)!==temp||!path.basename(out).startsWith('d408-baseline-evidence-'))throw Error('Confined probe evidence required');
const input=JSON.parse(await fs.readFile(out+'/verified-input.json','utf8'));
if(role!==input.role||!['frozen-baseline','fixed-candidate'].includes(role))throw Error('Probe role mismatch');
const ids=['B01-native-task-selection','B02-native-history-statistics-entry','B03-edge-x3-y150','B03-edge-x24-y150','B03-edge-x48-y150','B04-edge-x3-y40','B04-edge-x3-y380','B04-edge-x3-y650','B05-feedback-primary-flow','B06-feedback-tools-list-editor-save'];
const phases=['360-gestural','412-gestural','360-threebutton','412-threebutton'];
const reports=[],phaseCoverage=[],coverageErrors=[];
let productPassed=0,productFailed=0,harnessErrors=0,executed=0;
for(const phase of phases){
  let report;
  try{report=JSON.parse(await fs.readFile(`${out}/files/d408-probe-evidence/${phase}/result.json`,'utf8'));}
  catch(error){coverageErrors.push(`${phase}: missing or invalid report: ${error.message}`);}
  if(!report||typeof report!=='object'||Array.isArray(report)){
    phaseCoverage.push({phase,planned:10,executed:0,notExecuted:10,missingIds:ids,reportAvailable:false,setupAborted:false});
    continue;
  }
  reports.push(report);
  if(report.probeSourceSHA!==env.GITHUB_SHA||report.evidenceRunId!==env.GITHUB_RUN_ID||report.evidenceAttempt!==env.GITHUB_RUN_ATTEMPT||report.phase!==phase||report.suite!=='D408-frozen-apk-blackbox'||report.targetPackage!==input.packageName||report.targetSourceSHA!==input.targetSourceSHA||report.targetBuildRunId!==input.targetBuildRunId||report.syntheticEmulatorOnly!==true||report.targetRebuilt!==false)coverageErrors.push(`${phase}: identity or scope mismatch`);
  const cases=Array.isArray(report.cases)?report.cases:[];
  if(!Array.isArray(report.cases))coverageErrors.push(`${phase}: cases not an array`);
  const observed=cases.map(c=>c?.id),validCases=cases.filter(c=>ids.includes(c?.id)),uniqueIds=new Set(validCases.map(c=>c.id));
  const missingIds=ids.filter(id=>!uniqueIds.has(id)),unexpectedIds=observed.filter(id=>!ids.includes(id)&&id!=='setup-or-suite-abort');
  const duplicateIds=observed.filter((id,index)=>observed.indexOf(id)!==index);
  const setupAborted=observed.includes('setup-or-suite-abort');
  const failures=cases.filter(c=>c?.harnessError===true).length;
  const passed=validCases.filter(c=>c?.harnessError===false&&c?.productPassed===true).length;
  const gaps=validCases.filter(c=>c?.harnessError===false&&c?.productPassed===false).length;
  if(missingIds.length||unexpectedIds.length||duplicateIds.length||setupAborted)coverageErrors.push(`${phase}: missing, duplicated, unexpected IDs or setup abort`);
  if(report.caseCount!==cases.length||report.productPassed!==passed||report.productFailed!==gaps||report.harnessErrors!==failures||cases.some(c=>typeof c?.harnessError!=='boolean'||typeof c?.productPassed!=='boolean'))coverageErrors.push(`${phase}: inconsistent counters or flags`);
  executed+=uniqueIds.size;productPassed+=passed;productFailed+=gaps;harnessErrors+=failures;
  phaseCoverage.push({phase,planned:10,executed:uniqueIds.size,notExecuted:missingIds.length,missingIds,unexpectedIds,duplicateIds,reportAvailable:true,setupAborted,harnessErrors:failures,productPassed:passed,productFailed:gaps});
}
const coverageComplete=coverageErrors.length===0&&executed===40;
const collectorPassed=coverageComplete&&harnessErrors===0;
const report={role,probeSourceSHA:env.GITHUB_SHA,evidenceRunId:env.GITHUB_RUN_ID,evidenceAttempt:env.GITHUB_RUN_ATTEMPT,
  suite:'D408-frozen-apk-blackbox',planned:40,executed,notExecuted:40-executed,phaseCount:reports.length,plannedPhaseCount:4,
  caseCount:reports.reduce((n,r)=>n+(Array.isArray(r.cases)?r.cases.length:0),0),productPassed,productFailed,harnessErrors,
  phaseCoverage,coverageComplete,coverageErrors,collectorPassed,allProductCasesPassed:collectorPassed&&productFailed===0,reports,
  notes:'Executed counts unique planned IDs attempted, including reported harness errors; setup abort records are not product executions. Frozen product gaps remain false. Collector success requires all forty IDs and no harness errors.'};
await fs.writeFile(out+'/aggregate.json',JSON.stringify(report,null,2)+'\n');
if(!collectorPassed)throw Error(`Incomplete blackbox evidence: ${executed}/40 planned cases; ${harnessErrors} harness errors; ${coverageErrors.join('; ')}`);
if(role!=='frozen-baseline'&&productFailed)throw Error('Fixed candidate still fails required capability');
