import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const contexts=new WeakSet();
export const FRAMEWORK='mytodo-a-admission-v1',ALGORITHM='mytodo-storage-fingerprint-v2',CONTRACT='d1-01-candidate.1';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export const json=o=>JSON.stringify(o,null,2)+'\n';
export function requireContext(context){if(!contexts.has(context))throw Error('Unverified Actions context');}
export async function openRoot(input,{create=false}={}){
 const e=process.env;
 if(e.GITHUB_ACTIONS!=='true'||e.RUNNER_ENVIRONMENT!=='github-hosted'||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ATTEMPT||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||e.GITHUB_SHA!==e.EXPECTED_SOURCE_SHA||e.GITHUB_REF!=='refs/heads/a/admission-candidate-1')throw Error('Exact hosted Actions source/branch/run/attempt required');
 if(!path.isAbsolute(input||'')||!path.isAbsolute(e.RUNNER_TEMP||''))throw Error('Absolute RUNNER_TEMP root required');
 const temp=await fs.realpath(e.RUNNER_TEMP),root=path.resolve(input);
 if(path.dirname(root)!==temp||path.basename(root)!=='a-admission-'+e.GITHUB_RUN_ID)throw Error('Dedicated exact per-run synthetic root required');
 for(let p=root;;p=path.dirname(p)){const st=await fs.lstat(p).catch(x=>{if(create&&p===root&&x.code==='ENOENT')return null;throw x;});if(st?.isSymbolicLink())throw Error('Symlink ancestor refused');if(p===temp)break;}
 const marker={framework:FRAMEWORK,syntheticOnly:true,sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT};
 if(create){await fs.mkdir(root);await fs.writeFile(path.join(root,'.a-admission.json'),json(marker),{flag:'wx'});}
 const context=Object.freeze({root,sourceSha:e.GITHUB_SHA,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT});contexts.add(context);
 const file=await safeFile(context,'.a-admission.json'),read=JSON.parse(await fs.readFile(file,'utf8'));
 if(JSON.stringify(read)!==JSON.stringify(marker))throw Error('Synthetic marker mismatch');return context;
}
export async function safeFile(context,relative,{missing=false}={}){
 requireContext(context);const file=path.resolve(context.root,relative),rel=path.relative(context.root,file);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Path outside marked root');
 for(let p=file;p!==context.root;p=path.dirname(p)){
  const st=await fs.lstat(p).catch(e=>{if(missing&&e.code==='ENOENT')return null;throw e;});
  if(st?.isSymbolicLink()||st?.isFile()&&st.nlink!==1)throw Error('Linked file or ancestor refused');
 }
 return file;
}
export async function writeFresh(context,relative,bytes){const file=await safeFile(context,relative,{missing:true});await fs.writeFile(file,bytes,{flag:'wx'});return file;}
export async function directory(context,name){if(!/^[a-z0-9-]+$/.test(name))throw Error('Fixed directory name required');const d=await safeFile(context,name,{missing:true});await fs.mkdir(d);return d;}
export async function fixtureMarker(context,directoryName){
 const file=await safeFile(context,path.join(directoryName,'.synthetic-source.json'));
 const m=JSON.parse(await fs.readFile(file,'utf8'));
 if(m.framework!==FRAMEWORK||m.syntheticOnly!==true||m.sourceSha!==context.sourceSha||m.runId!==context.runId||m.runAttempt!==context.runAttempt||m.database!=='source.sqlite')throw Error('Synthetic source marker mismatch');return m;
}
