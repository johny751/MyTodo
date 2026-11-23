import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cloudOnly,confined} from './fixture-server.mjs';

// Hash complete artifact roots after their last writer finishes. This is evidence
// packaging only; it never executes tests and never labels missing tests as passed.
cloudOnly();
const directory=confined(process.argv[2]),sourceSha=process.env.EXPECTED_SOURCE_SHA;
if(!/^[0-9a-f]{40}$/.test(sourceSha||''))throw Error('Exact source SHA is required for evidence sealing');
await fs.mkdir(directory,{recursive:true});
const actual=await fs.realpath(directory),temporary=await fs.realpath(process.env.RUNNER_TEMP);
const relative=path.relative(temporary,actual);
if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Evidence root escapes RUNNER_TEMP');
await fs.writeFile(path.join(directory,'evidence-seal.json'),JSON.stringify({schema:'mytodo-c006-evidence-seal',version:1,sourceSha,
 runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,createdAt:new Date().toISOString(),
 scope:'Complete recursive artifact inventory, excluding only its root sha256.json; does not certify runtime success'},null,2)+'\n');
const files=[];
async function walk(current,prefix=''){
 for(const entry of await fs.readdir(current,{withFileTypes:true})){
  const name=prefix+entry.name,absolute=path.join(current,entry.name);
  if(entry.isSymbolicLink())throw Error('Evidence contains a symbolic link: '+name);
  if(entry.isDirectory()){await walk(absolute,name+'/');continue;}
  if(!entry.isFile())throw Error('Unsupported evidence file type: '+name);
  if(name==='sha256.json')continue;
  const before=await fs.stat(absolute),hash=createHash('sha256');
  for await(const chunk of createReadStream(absolute))hash.update(chunk);
  const after=await fs.stat(absolute);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Evidence changed while sealing: '+name);
  files.push({path:name,bytes:after.size,sha256:hash.digest('hex')});
 }
}
await walk(directory);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
await fs.writeFile(path.join(directory,'sha256.json'),JSON.stringify(files,null,2)+'\n');
process.stdout.write(JSON.stringify({sealed:directory,sourceSha,files:files.length})+'\n');
