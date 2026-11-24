import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {requireContext,hash,json,writeFresh} from '../../admission/guard.mjs';
export async function validateSourceScope(context){
 requireContext(context);const base=process.env.BASE_SOURCE_SHA;if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('Recorded full accepted D2 base SHA required');
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
 const receipt={framework:'a-admission-source-scope-v1',sourceSha:context.sourceSha,baseSourceSha:base,runId:context.runId,runAttempt:context.runAttempt,status:'failed',changedFiles:[]};
 try{if(git('rev-parse','HEAD')!==context.sourceSha)throw Error('Checkout SHA mismatch');git('merge-base','--is-ancestor',base,context.sourceSha);
  const files=git('diff','--name-only',base,context.sourceSha).split('\n').filter(Boolean);
  for(const file of files){if(!file.startsWith('admission/')&&!file.startsWith('tests/admission/')&&!file.startsWith('docs/a-admission/')&&file!=='tests/run-admission.mjs'&&file!=='.github/workflows/a-admission-validation.yml')throw Error('A source scope exceeded: '+file);const bytes=await fs.readFile(file);receipt.changedFiles.push({file,bytes:bytes.length,sha256:hash(bytes)});if(file.startsWith('admission/')&&/(?:from|import)\s*['"][^'"]*tests\//.test(bytes.toString('utf8')))throw Error('Admission module imports tests');}
  git('diff','--check',base,context.sourceSha);receipt.status='passed';return receipt;
 }catch(error){receipt.primaryError=String(error);throw error;}finally{await writeFresh(context,'source-scope-receipt.json',json(receipt));}
}
