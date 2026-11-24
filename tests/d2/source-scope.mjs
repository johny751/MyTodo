// Actions-only static scope receipt before any project compilation or SQLite execution.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {rootPath,hash,json,writeFresh} from './isolation.mjs';
const root=await rootPath(process.argv[2],{create:true}),base='d4c5af4cbbb9192c19276dd371bd142c2b835534',sha=process.env.GITHUB_SHA;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
if(git('rev-parse','HEAD')!==sha||!process.env.GITHUB_REF.startsWith('refs/heads/d2/implementation-candidate-1'))throw Error('BLOCKER: exact candidate branch checkout required');
git('merge-base','--is-ancestor',base,sha);
const baseline={
 'src/sqlite-store.mjs':'0f398ec44f2d3ded1c3a1db9adcc7235e150558cf7f58e9a3853770d0f713344',
 'windows/database.c':'17c980cca5c5f3a8ff7f02eebd73a29719ea00c1576323eb0b5b1a39348e5840',
 'windows/native.h':'cf06ccd5ac6c9c60698f5981330b431686c372fa7c96e90d49e8967b6c11d381',
 'android/src/local/gxtodo/replica/ReplicaDatabase.java':'efac2d464c612506debc2aea04a992352bba6ce8a816d96f6a1f07ee9b614663',
 'windows/operations.c':'61f02a521236d09786d1dbe2f4305c96d0f1be62cdee1cb833e9944b60afc483',
 'scripts/build-windows.mjs':'a9199dc51822c2a12d6823f23417286c82525c36243d94d00130a94044d93693'
};
const report={status:'failed',sourceSha:sha,base,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,baseline:[],changedFiles:[],productionChanges:[],limitations:['Source scope is a static gate; semantic preservation requires the actual platform tests and human source review.']};
try{
 for(const [file,expected] of Object.entries(baseline)){const bytes=execFileSync('git',['show',base+':'+file]);report.baseline.push({file,expected,observed:hash(bytes)});if(hash(bytes)!==expected)throw Error('BLOCKER: frozen production baseline drift '+file);}
 const changed=git('diff','--name-only',base,sha).split('\n').filter(Boolean),allowed=new Set(['src/sqlite-store.mjs','src/migration-runtime.mjs','windows/database.c','windows/native.h','windows/migration.c','windows/migration.h','windows/operations.c','windows/undo-capture.c','windows/undo-internal.h','scripts/build-windows.mjs','android/src/local/gxtodo/replica/ReplicaDatabase.java','android/src/local/gxtodo/replica/MigrationRegistry.java','android/src/local/gxtodo/replica/ReplicaTaskRecord.java','android/src/local/gxtodo/replica/PomodoroTasks.java']);
 for(const file of changed){if(!file.startsWith('docs/upgrade/d2/')&&!file.startsWith('docs/upgrade/d2-transfer/')&&!file.startsWith('tests/d2/')&&file!=='.github/workflows/d2-migration-validation.yml'&&!allowed.has(file))throw Error('BLOCKER: unauthorized candidate path '+file);
  const bytes=await fs.readFile(file);report.changedFiles.push({file,bytes:bytes.length,sha256:hash(bytes)});
  if(allowed.has(file)){const text=bytes.toString('utf8');if(/(?:from|import|require)\s*\(?["'][^"']*tests\//.test(text)||/#include\s*["'][^"']*tests\//.test(text))throw Error('BLOCKER: production imports test tools '+file);report.productionChanges.push(file);}
 }
 git('diff','--check',base,sha);report.status='passed';
}catch(e){report.primaryError=String(e);throw e;}finally{await writeFresh(root,'source-scope-receipt.json',json(report));}
console.log(JSON.stringify({status:report.status,sourceSha:sha,productionChanges:report.productionChanges}));
