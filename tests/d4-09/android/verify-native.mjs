import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const env=process.env, action=process.argv[2], out=fs.realpathSync(process.argv[3]);
assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.EXPECTED_SOURCE_SHA,env.GITHUB_SHA);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),env.GITHUB_SHA);
const temp=fs.realpathSync(env.RUNNER_TEMP);
assert.equal(path.dirname(out),temp);assert.match(path.basename(out),/^d408-native-/);
const contract=JSON.parse(fs.readFileSync('tests/d4-09/android/native/suite-contract.json','utf8'));
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const sha=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const identity=read('d408-build-identity.json');
for(const [key,value] of Object.entries({sourceSHA:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,runNumber:env.GITHUB_RUN_NUMBER,workflowName:env.GITHUB_WORKFLOW,packageName:contract.targetPackage,syntheticOnly:true,stableSigning:false,productionSync:false}))assert.equal(identity[key],value,`identity.${key}`);
const originalSums=fs.readFileSync(path.join(out,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/);
for(const file of ['mytodo-d4-08-native-candidate.apk','mytodo-d4-08-native-tests.apk','d408-build-identity.json']){
 const rows=originalSums.filter(line=>line.slice(66)===file);assert.equal(rows.length,1,file);assert.equal(rows[0].slice(0,64),sha(path.join(out,file)),file);
}
const base={sourceSHA:identity.sourceSHA,runId:identity.runId,runAttempt:identity.runAttempt,packageName:identity.packageName,versionName:identity.versionName,versionCode:identity.versionCode,syntheticOnly:true,emulatorEvidence:true};
const evidence='d409-native-ui-evidence',evidenceDir=path.join(out,evidence);
function testReceipt(){const receipt=read('d409-ui-test-build.json');for(const key of ['sourceSHA','runId','runAttempt','packageName','versionName','versionCode'])assert.equal(receipt[key],base[key],key);for(const row of receipt.files)assert.equal(sha(path.join(out,row.file)),row.sha256,row.file);assert.equal(receipt.testPackage,contract.testPackage);return receipt;}
if(action==='build-input'){
 assert.ok(!fs.existsSync(path.join(out,'d409-ui-test-build')),'Fresh UI test build');
}else if(action==='test-built'){
 const signature=fs.readFileSync(path.join(out,'d409-ui-test-signature.txt'),'utf8');
 const originalSignature=fs.readFileSync(path.join(out,'apk-signature.txt'),'utf8');
 const certificate=text=>{const found=text.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i);assert.ok(found,'verified signer digest');return found[1].toLowerCase();};
 assert.equal(certificate(signature),certificate(originalSignature),'same ephemeral signer as app');
 const badging=fs.readFileSync(path.join(out,'d409-ui-test-badging.txt'),'utf8');assert.ok(badging.includes(`package: name='${contract.testPackage}'`));
 const files=['mytodo-d4-09-native-ui-tests.apk','d409-ui-test-signature.txt','d409-ui-test-badging.txt'].map(file=>({file,bytes:fs.statSync(path.join(out,file)).size,sha256:sha(path.join(out,file))}));
 const sources=fs.readdirSync('tests/d4-09/android/native').filter(file=>/\.(java|xml|json)$/.test(file)).sort().map(file=>({file:'tests/d4-09/android/native/'+file,sha256:sha('tests/d4-09/android/native/'+file)}));
 write('d409-ui-test-build.json',{...base,testPackage:contract.testPackage,signerSHA256:certificate(signature),signingScope:'same-run ephemeral candidate key; not stable release identity',files,sources});
}else if(action==='run-input'){
 testReceipt();const legacy=read('native-evidence/aggregate.json');assert.equal(legacy.sourceSHA,env.GITHUB_SHA);assert.equal(legacy.runId,env.GITHUB_RUN_ID);assert.equal(legacy.runAttempt,env.GITHUB_RUN_ATTEMPT);
 assert.ok(!fs.existsSync(evidenceDir),'fresh independent evidence');
}else if(action==='start'){
 write(evidence+'/aggregate.json',{...base,coverageComplete:false,allCasesPassed:false,coverageErrors:['Runner has not completed all four actual emulator phases.'],legacySuitePassed:false});
}else if(action==='installed'){
 const actual=fs.readFileSync(path.join(evidenceDir,'installed-app-sha256.txt'),'utf8').trim().split(/\s+/)[0];assert.equal(actual,sha(path.join(out,'mytodo-d4-08-native-candidate.apk')),'Installed app is the same run APK');
}else if(action==='aggregate'){
 testReceipt();const errors=[],reports=[],expectedNames=phase=>contract.cases.map(id=>'D409-'+phase+'-'+id).sort();
 for(const phase of contract.phases){
  try{
   const report=read(evidence+'/files/d409-evidence/result-'+phase+'.json');reports.push(report);
   for(const [key,value] of Object.entries(base))assert.equal(report[key],value,phase+' '+key);
   assert.equal(report.suite,'d409-native-ui');assert.equal(report.phase,phase);assert.equal(report.width,Number(phase.split('-')[1]));assert.equal(report.navigationMode,phase.split('-')[2]);
   assert.deepEqual(report.cases.map(row=>row.name).sort(),expectedNames(phase),'exact IDs');assert.equal(new Set(report.cases.map(row=>row.name)).size,contract.caseCountPerPhase);
   assert.equal(report.caseCount,contract.caseCountPerPhase);assert.equal(report.failureCount,report.cases.filter(row=>row.passed!==true).length);assert.equal(report.passed,report.failureCount===0);
   assert.ok(report.cases.every(row=>typeof row.passed==='boolean'));assert.ok(report.screenshots.length>0,'native screenshots required');
   for(const shot of report.screenshots){assert.match(shot.file,/^[A-Za-z0-9_-]+\.png$/);const filename=path.join(evidenceDir,'files/d409-evidence',shot.file);assert.equal(sha(filename),shot.sha256);assert.equal(fs.statSync(filename).size,shot.bytes);assert.equal(shot.width,report.width);assert.equal(shot.height,900);}
   const modeText=fs.readFileSync(path.join(evidenceDir,'navigation-mode-'+phase+'.txt'),'utf8').trim();assert.equal(modeText,report.navigationMode==='gestural'?'2':'0');
   const sizeText=fs.readFileSync(path.join(evidenceDir,'wm-size-'+phase+'.txt'),'utf8');assert.ok(sizeText.includes(`${report.width}x900`),'actual requested device size recorded');
  }catch(error){errors.push(phase+': '+error.message);}
 }
 const legacy=read('native-evidence/aggregate.json'),legacyErrors=[];
 for(const [group,count]of Object.entries(contract.legacyGroups)){if(legacy.groups?.[group]?.caseCount!==count)legacyErrors.push(group+': retained count differs');}
 if(legacy.sourceSHA!==base.sourceSHA||legacy.runId!==base.runId||legacy.runAttempt!==base.runAttempt)legacyErrors.push('retained suite identity mismatch');
 if(!legacy.coverageComplete||!legacy.allGroupsPassed)legacyErrors.push('retained suite did not pass with complete coverage');
 const rows=reports.flatMap(report=>report.cases||[]),failed=rows.filter(row=>row.passed!==true).length;
 if(rows.length!==contract.totalCaseCount)errors.push('expected '+contract.totalCaseCount+' cases, observed '+rows.length);
 const coverageComplete=errors.length===0,allCasesPassed=coverageComplete&&failed===0;
 write(evidence+'/aggregate.json',{...base,planned:contract.totalCaseCount,executed:rows.length,passed:rows.length-failed,failed,reports,coverageComplete,coverageErrors:errors,allCasesPassed,legacySuitePassed:legacyErrors.length===0,legacyErrors,combinedPassed:allCasesPassed&&legacyErrors.length===0,scope:contract.scope});
 assert.ok(allCasesPassed&&legacyErrors.length===0,'D409 or retained suite failed/incomplete; preserve raw evidence');
}else throw Error('Unknown verifier action '+action);
