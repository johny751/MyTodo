// Test-only guard. Never imported by production. Execution is restricted to fresh Actions fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const CONTRACT='d1-01-candidate.1',FRAMEWORK='d2-real-storage-api-v1';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export const json=b=>JSON.stringify(b,null,2)+'\n';
export async function rootPath(input,{create=false}={}){
 if(process.env.GITHUB_ACTIONS!=='true'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||process.env.GITHUB_SHA!==process.env.EXPECTED_SOURCE_SHA)throw Error('BLOCKER: exact GitHub Actions source and run required');
 const temp=await fs.realpath(process.env.RUNNER_TEMP),root=path.resolve(input),rel=path.relative(temp,root);
 if(!path.isAbsolute(input)||!rel||rel.startsWith('..')||path.isAbsolute(rel)||!path.basename(root).startsWith('d2-'))throw Error('BLOCKER: dedicated RUNNER_TEMP/d2 root required');
 for(let p=root;p!==temp;p=path.dirname(p)){const st=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink())throw Error('BLOCKER: symlink');if(path.dirname(p)===p)throw Error('BLOCKER: root ancestor');}
 const marker={syntheticOnly:true,contractId:CONTRACT,runId:process.env.GITHUB_RUN_ID,framework:FRAMEWORK};
 if(create){await fs.mkdir(root);await fs.writeFile(path.join(root,'.d2-synthetic-only.json'),json(marker),{flag:'wx'});}
 const mpath=path.join(root,'.d2-synthetic-only.json');if((await fs.lstat(mpath)).isSymbolicLink())throw Error('BLOCKER: marker symlink');
 const read=JSON.parse(await fs.readFile(mpath,'utf8'));if(JSON.stringify(read)!==JSON.stringify(marker))throw Error('BLOCKER: wrong fixture marker');return await fs.realpath(root);
}
export async function safeFile(root,name,{exists=true}={}){
 const r=await rootPath(root),p=path.resolve(r,name),rel=path.relative(r,p);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('BLOCKER: outside marked root');
 for(let c=p;c!==r;c=path.dirname(c)){const st=await fs.lstat(c).catch(e=>{if(!exists&&e.code==='ENOENT')return null;throw e;});if(st?.isSymbolicLink())throw Error('BLOCKER: symlink');}
 return p;
}
export async function writeFresh(root,name,bytes){const p=await safeFile(root,name,{exists:false});await fs.writeFile(p,bytes,{flag:'wx'});return p;}
