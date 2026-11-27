import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const e=process.env,base='04c525c55fc136ad1b960b5d727dab3c5e3165fd',master='d4c5af4cbbb9192c19276dd371bd142c2b835534';
const git=args=>execFileSync('git',args,{maxBuffer:128*1024*1024,windowsHide:true});
const list=args=>git(args).toString('utf8').split('\0').filter(Boolean),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(e.GITHUB_REF,'refs/heads/d4/d4-08-candidate-1');assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA);assert.equal(git(['rev-parse','HEAD']).toString().trim(),e.GITHUB_SHA);
git(['merge-base','--is-ancestor',base,'HEAD']);assert.equal(git(['rev-parse','origin/master']).toString().trim(),master);
assert.equal(git(['rev-parse','origin/d4/native-integration-candidate-1']).toString().trim(),base,'Old candidate remains frozen');
assert.equal(git(['rev-parse','origin/d4/mobile-integrated-candidate-1']).toString().trim(),'9fe8824754af4e8b541f3550e677564183fa7c1f','Accepted mobile candidate remains frozen');
const manifestPath='docs/upgrade/d4-08/source-admission.json',manifest=JSON.parse(fs.readFileSync(manifestPath));
assert.equal(manifest.baseline,base);assert.equal(manifest.productionAdmission,false);assert.equal(manifest.realDataAccess,false);
const reviewed=new Map(manifest.files.map(r=>[r.path,r]));assert.equal(reviewed.size,manifest.files.length);
const original=list(['ls-tree','-r','--name-only','-z',base]);
// Only existing candidate UI seams may change. Native business/storage/protocol code stays exact.
const editable=new Set(['scripts/build-windows.mjs','windows/main.c','windows/gui.c','windows/ui.h','windows/detail.c','windows/dialogs.c','windows/feedback.c','windows/workspace.c','windows/workspace.h','windows/GxTodo.rc',
 'prototypes/d4-01/app.js','prototypes/d4-01/domain.mjs','prototypes/d4-01/personal-pages.js','prototypes/d4-01/mobile-controls.js','prototypes/d4-01/work-pages.js','prototypes/d4-01/styles.css','prototypes/d4-01/index.html','prototypes/d4-01/native-timer-adapter.js','prototypes/d4-01/legacy-pages.js']);
let frozen=0;
for(const file of original){assert.ok(fs.existsSync(file),'No original file deleted: '+file);if(!editable.has(file)){assert.equal(sha(fs.readFileSync(file)),sha(git(['show',base+':'+file])),'Frozen '+file);frozen++;}}
const changed=list(['diff','--name-only','-z',base+'...HEAD']);
assert.deepEqual(changed.filter(p=>p!==manifestPath).sort(),[...reviewed.keys()].sort(),'Every change has a precise reviewed hash');
const permittedNew=p=>p.startsWith('docs/upgrade/d4-08/')||p.startsWith('tests/d4-08/')||p.startsWith('android/d408/')||p.startsWith('prototypes/d4-08/')||/^windows\/d408[-.][\w.-]+$/.test(p)||/^\.github\/workflows\/d4-08-[\w-]+\.yml$/.test(p);
for(const file of changed){if(file===manifestPath)continue;assert.ok(original.includes(file)?editable.has(file):permittedNew(file),'Explicit candidate-only change '+file);const r=reviewed.get(file),bytes=fs.readFileSync(file);assert.equal(r.bytes,bytes.length,file);assert.equal(r.sha256,sha(bytes),file);assert.ok(r.reason&&r.reason.length>=10,file+' review reason');}
git(['diff','--check',base+'...HEAD']);
const c0='.github/workflows/d4-08-c0.yml';if(fs.existsSync(c0)){const before=git(['show',base+':.github/workflows/d4-native-c0.yml']).toString(),after=fs.readFileSync(c0,'utf8');assert.equal(after.slice(after.indexOf('permissions:')),before.slice(before.indexOf('permissions:')),'Original C0 body remains byte-identical');}
const result={status:'passed',baseline:base,sourceSHA:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,frozenOriginalFiles:frozen,unchangedOriginalTests:original.filter(p=>p.startsWith('tests/')).length,changedFiles:changed,productionAdmission:false,realDataAccess:false,productionSync:false};
fs.writeFileSync(path.join(e.RUNNER_TEMP,'d408-scope.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
