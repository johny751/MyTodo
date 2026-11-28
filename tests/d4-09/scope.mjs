// Run only on the authorized candidate in GitHub Actions. Old test sources stay frozen.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const e=process.env,base='7c217d8779ccf21e13733b28868e015e9cfd693a';
const git=(...args)=>execFileSync('git',args,{maxBuffer:128*1024*1024,windowsHide:true});
const list=(...args)=>git(...args).toString('utf8').split('\0').filter(Boolean);
const hash=b=>createHash('sha256').update(b).digest('hex');
const reportPath=path.join(e.RUNNER_TEMP||'.','d409-scope.json');
try {
  assert.equal(e.GITHUB_ACTIONS,'true');
  assert.equal(e.GITHUB_REF,'refs/heads/d4/d4-09-design-candidate-1');
  assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA);
  assert.equal(git('rev-parse','HEAD').toString().trim(),e.GITHUB_SHA);
  git('merge-base','--is-ancestor',base,'HEAD');
  const protectedRefs={master:'d4c5af4cbbb9192c19276dd371bd142c2b835534',
    'd4/mobile-integrated-candidate-1':'9fe8824754af4e8b541f3550e677564183fa7c1f',
    'd4/native-integration-candidate-1':'04c525c55fc136ad1b960b5d727dab3c5e3165fd',
    'd4/d4-08-candidate-1':base};
  for(const [ref,sha] of Object.entries(protectedRefs))
    assert.equal(git('rev-parse','origin/'+ref).toString().trim(),sha,'Protected branch '+ref);
  const manifestPath='docs/upgrade/d4-09/source-admission.json';
  const manifest=JSON.parse(fs.readFileSync(manifestPath));
  assert.equal(manifest.baseline,base);
  for(const key of ['productionAdmission','realDataAccess','productionSync','schemaChanges','signingIdentityChanges']) assert.equal(manifest[key],false,key);
  assert.equal(manifest.ownerAuthorizedImplementation,true);
  const reviewed=new Map(manifest.files.map(row=>[row.path,row]));
  assert.equal(reviewed.size,manifest.files.length);
  const original=list('ls-tree','-r','--name-only','-z',base);
  const editable=new Set([
    'scripts/build-windows.mjs','windows/gui.c','windows/ui.h','windows/theme.c',
    'windows/d408-work.c','windows/d408-timer.c','windows/d408-shell.c',
    'windows/d408-form.c','windows/d408-feedback.c',
    'android/d408/prepare.mjs','android/d408/version-history.json',
    'android/d408/src/local/gxtodo/replica/D408TimerActivity.java',
    'android/d408/src/local/gxtodo/replica/D408Activity.java',
    'prototypes/d4-01/styles.css','prototypes/d4-01/work-pages.js',
    'prototypes/d4-01/personal-pages.js','prototypes/d4-01/app.js',
    'prototypes/d4-01/index.html','prototypes/d4-01/legacy-pages.js',
    'prototypes/d4-01/mobile-controls.js','prototypes/d4-08/v2-candidate-app.js'
  ]);
  let frozen=0;
  for(const file of original){
    assert.ok(fs.existsSync(file),'No baseline file deleted: '+file);
    if(!editable.has(file)){
      assert.equal(hash(fs.readFileSync(file)),hash(git('show',base+':'+file)),'Frozen baseline '+file);frozen++;
    }
  }
  const changes=list('diff','--name-only','-z',base,'HEAD');
  assert.deepEqual(changes.filter(p=>p!==manifestPath).sort(),[...reviewed.keys()].sort(),'Exact reviewed change set');
  const permittedNew=p=>p.startsWith('docs/upgrade/d4-09/')||p.startsWith('prototypes/d4-09/')||p.startsWith('tests/d4-09/')||
    /^windows\/d409-[a-z0-9-]+\.(?:h|inc)$/.test(p)||
    /^android\/d408\/src\/local\/gxtodo\/replica\/D409[A-Za-z]+\.java$/.test(p)||
    /^\.github\/workflows\/d4-09-(?:[a-z-]+|c0)\.yml$/.test(p);
  for(const file of changes){
    if(file===manifestPath)continue;
    assert.ok(original.includes(file)?editable.has(file):permittedNew(file),'Authorized UI scope '+file);
    const record=reviewed.get(file),bytes=fs.readFileSync(file);
    assert.equal(record.bytes,bytes.length,file);assert.equal(record.sha256,hash(bytes),file);
    assert.ok(record.reason?.length>=12,'Review reason '+file);
  }
  // Baseline-defined protected source spans include native timer business operations
  // and embedded regression bodies. Anchors and hashes are independently baseline-bound.
  for(const item of manifest.protectedSpans){
    const before=git('show',base+':'+item.path).toString('utf8');
    const after=fs.readFileSync(item.path,'utf8');
    const slice=text=>{
      assert.equal(text.split(item.start).length,2,item.path+' unique start');
      const start=text.indexOf(item.start);
      if(item.end===null)return text.slice(start);
      assert.equal(text.split(item.end).length,2,item.path+' unique end');
      const end=text.indexOf(item.end,start+item.start.length);
      assert.ok(end>start,item.path+' ordered protected span');return text.slice(start,end);
    };
    assert.equal(hash(slice(before)),item.sha256,'Baseline-proven protection '+item.path);
    assert.equal(slice(after),slice(before),'Unchanged business/test span '+item.path+' '+item.start);
  }
  assert.ok(manifest.protectedSpans.length>=5,'Explicit native business and embedded regression protection required');
  // Reverse only the reviewed presentation edits, then compare all remaining bytes
  // to the baseline. No project code or dynamic expressions are evaluated here.
  for(const item of manifest.preservedRemainders||[]){
    let before=git('show',base+':'+item.path).toString('utf8'),after=fs.readFileSync(item.path,'utf8');
    const bounds=(text,start,end)=>{
      assert.equal(text.split(start).length,2,item.path+' unique remainder start');
      const a=text.indexOf(start);if(end===null)return [a,text.length];
      assert.equal(text.split(end).length,2,item.path+' unique remainder end');
      const b=text.indexOf(end,a+start.length);assert.ok(b>a,item.path+' ordered remainder');return [a,b];
    };
    if(item.start!==undefined){const a=bounds(before,item.start,item.end),b=bounds(after,item.start,item.end);before=before.slice(...a);after=after.slice(...b);}
    assert.equal(hash(before),item.baselineSha256,item.path+' baseline remainder hash');
    assert.equal(Buffer.byteLength(before),item.baselineBytes,item.path+' baseline remainder bytes');
    for(const operation of item.operations){
      if(operation.op==='replaceRangeFromBaseline'){
        const a=bounds(before,operation.start,operation.end),b=bounds(after,operation.start,operation.end);
        after=after.slice(0,b[0])+before.slice(...a)+after.slice(b[1]);
      }else if(operation.op==='removeExact'){
        assert.equal(after.split(operation.text).length,2,item.path+' unique insertion');
        const at=after.indexOf(operation.text);assert.ok(after.slice(at+operation.text.length).startsWith(operation.before),item.path+' insertion seam');
        after=after.slice(0,at)+after.slice(at+operation.text.length);
      }else if(operation.op==='replaceExact'){
        assert.equal(after.split(operation.text).length,2,item.path+' unique exact replacement');
        after=after.replace(operation.text,operation.replacement);
      }else if(operation.op==='retainBaselinePrefix'){
        assert.ok(after.startsWith(before),item.path+' full original stylesheet prefix');
        assert.ok(after.slice(before.length).replace(/^(?:\r?\n)*/, '').startsWith(operation.marker),item.path+' explicit appended theme');after=before;
      }else throw Error('Unsupported static protection operation '+operation.op);
    }
    assert.equal(after,before,item.path+' entire protected remainder');assert.equal(hash(after),item.reconstructedSha256);
    assert.equal(item.exact,true);
  }
  const oldC0=git('show',base+':.github/workflows/d4-08-c0.yml').toString('utf8');
  const newC0=fs.readFileSync('.github/workflows/d4-09-c0.yml','utf8');
  assert.equal(newC0.slice(newC0.indexOf('permissions:')),oldC0.slice(oldC0.indexOf('permissions:')),'Frozen C0 job body');
  git('diff','--check',base,'HEAD');
  const report={status:'passed',baseline:base,sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,
    frozenBaselineFiles:frozen,unchangedBaselineTests:original.filter(p=>p.startsWith('tests/')).length,
    protectedRefs,changedFiles:changes,protectedSpans:manifest.protectedSpans,
    preservedRemainders:(manifest.preservedRemainders||[]).map(({path,start,end,baselineSha256,baselineBytes,exact})=>({path,start,end,baselineSha256,baselineBytes,exact})),
    productionAdmission:false,realDataAccess:false,productionSync:false,schemaChanges:false};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){
  fs.writeFileSync(reportPath,JSON.stringify({status:'failed',sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,
    error:String(error.stack||error),stdout:error.stdout?.toString(),stderr:error.stderr?.toString(),productionAdmission:false},null,2)+'\n');
  throw error;
}
