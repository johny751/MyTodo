import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const accepted='9fe8824754af4e8b541f3550e677564183fa7c1f';
const frozenMaster='d4c5af4cbbb9192c19276dd371bd142c2b835534';
const e=process.env;
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}).trim();
const paths=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}).split('\0').filter(Boolean);
const blob=(ref,path)=>execFileSync('git',['show',ref+':'+path],{maxBuffer:128*1024*1024,windowsHide:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(e.GITHUB_ACTIONS,'true');assert.equal(e.GITHUB_REF,'refs/heads/d4/native-integration-candidate-1');
assert.equal(e.EXPECTED_SOURCE_SHA,e.GITHUB_SHA);assert.equal(git(['rev-parse','HEAD']),e.GITHUB_SHA);
assert.equal(git(['rev-parse','origin/master']),frozenMaster);
git(['merge-base','--is-ancestor',accepted,'HEAD']);
const admission=JSON.parse(readFileSync('docs/upgrade/d4-native/source-admission.json'));
assert.equal(admission.acceptedSource,accepted);
const permitted=new Set(admission.files.map(f=>f.path));
const self='docs/upgrade/d4-native/source-admission.json';permitted.add(self);
const changed=paths(['diff','--name-only','-z',accepted+'...HEAD']);
assert.deepEqual(changed.filter(p=>!permitted.has(p)),[],'Every changed path needs an exact review manifest entry');
for(const record of admission.files){assert.ok(existsSync(record.path),record.path);const bytes=readFileSync(record.path);assert.equal(bytes.length,record.bytes,record.path);assert.equal(hash(bytes),record.sha256,record.path);}
git(['diff','--check',accepted+'...HEAD']);
const originalFiles=paths(['ls-tree','-r','--name-only','-z',accepted]);
const priorTests=originalFiles.filter(p=>p.startsWith('tests/')&&p!=='tests/d4-ui/run-browser.mjs');
const history=originalFiles.filter(p=>p.startsWith('docs/'));
const productionCore=originalFiles.filter(p=>p.startsWith('src/')||p.startsWith('windows/vendor/')||[
 'windows/database.c','windows/sync.c','windows/storage.c','windows/native.h','windows/tasks.c','windows/operations.c',
 'android/src/local/gxtodo/replica/AccountStore.java','android/src/local/gxtodo/replica/SqliteStore.java',
 'package.json','android/AndroidManifest.xml'
].includes(p));
for(const p of new Set([...priorTests,...history,...productionCore]))assert.equal(hash(readFileSync(p)),hash(blob(accepted,p)),'Immutable accepted file '+p);
const oldRunner=blob(accepted,'tests/d4-ui/run-browser.mjs').toString('utf8');
const newRunner=readFileSync('tests/d4-ui/run-browser.mjs','utf8');
const oldLines=oldRunner.trimEnd().split('\n');let cursor=0;
for(const line of newRunner.trimEnd().split('\n'))if(line===oldLines[cursor])cursor++;
assert.equal(cursor,oldLines.length,'The complete old browser runner remains an ordered subsequence');
const oldHistory=JSON.parse(blob(accepted,'prototypes/d4-03-platforms/version-history.json'));
const newHistory=JSON.parse(readFileSync('prototypes/d4-03-platforms/version-history.json'));
assert.deepEqual(newHistory.versions.slice(-oldHistory.versions.length),oldHistory.versions,'All old version entries unchanged');
const originalC0=blob(accepted,'.github/workflows/d4-03-c0-regression.yml').toString('utf8');
const currentC0=readFileSync('.github/workflows/d4-native-c0.yml','utf8');
assert.equal(currentC0.slice(currentC0.indexOf('permissions:')),originalC0.slice(originalC0.indexOf('permissions:')),'Frozen C0 permissions/env/jobs/assertions retained');
const report={status:'passed',acceptedSource:accepted,sourceSHA:e.GITHUB_SHA,changedFiles:changed,
 immutablePriorTestFiles:priorTests.length,immutableHistoricalDocuments:history.length,
 immutableProductionCoreFiles:productionCore.length,productionAdmission:false,realDataAccess:false,
 scope:'Candidate UI/native seams only; no schema, production model or sync semantic changes. Original D4-03 scope file is retained; this new scope explicitly admits native UI changes.'};
writeFileSync(e.RUNNER_TEMP+'/d4-native-scope.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
