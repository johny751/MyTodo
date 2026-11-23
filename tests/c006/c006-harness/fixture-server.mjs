import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function cloudOnly(){if(process.env.GITHUB_ACTIONS!=='true')throw Error('C006 execution is GitHub Actions only');}
export function confined(directory){
 const root=path.resolve(process.env.RUNNER_TEMP||''),resolved=path.resolve(directory),relative=path.relative(root,resolved);
 if(!process.env.RUNNER_TEMP||!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('C006 data must be below RUNNER_TEMP');
 return resolved;
}
const safeRelative=value=>typeof value==='string'&&/^(state\.json|v2(?:\/|\/[a-zA-Z0-9_.-]+)?)$/.test(value);
const describe=(relative,wire)=>{
 let plain=null;try{plain=relative.endsWith('.gz')?gunzipSync(wire):wire;}catch{}
 return {path:relative,wireBytes:wire.length,wireSha256:sha(wire),plainBytes:plain?.length??null,plainSha256:plain?sha(plain):null,
  text:plain?plain.toString('utf8'):null};
};

/** Real disk fixture. Effects only select HTTP/file failure boundaries; no replica/recovery algorithm. */
export async function startMigrationServer({directory,folder='C006',initialFiles=[],faults=[]}){
 cloudOnly();directory=confined(directory);
 if(!/^[a-zA-Z0-9_-]{1,60}$/.test(folder))throw Error('Invalid synthetic folder');
 const cloudRoot=path.join(directory,'dav',folder),logPath=path.join(directory,'http-requests.jsonl');
 await fs.mkdir(cloudRoot,{recursive:true});
 let sequence=0,queue=Promise.resolve(),writeTail=Promise.resolve();
 const lockWrites=async()=>{const prior=writeTail;let release;writeTail=new Promise(resolve=>release=resolve);await prior;return release;};
 const entries=[],plans=faults.map(f=>({...structuredClone(f),seen:0,used:0}));
 const persist=entry=>{entries.push(entry);queue=queue.then(()=>fs.appendFile(logPath,JSON.stringify(entry)+'\n'));};
 const filePath=relative=>{if(!safeRelative(relative))throw Error('Unsafe fixture relative path');return path.join(cloudRoot,...relative.split('/'));};
 const putFile=async file=>{
  const selected=filePath(file.path);
  if(file.remove){await fs.rm(selected,{force:true});return;}
  let wire=file.wireBase64!=null?Buffer.from(file.wireBase64,'base64'):Buffer.from(file.body??'','utf8');
  if(file.wireBase64==null&&file.path.endsWith('.gz'))wire=gzipSync(wire);
  await fs.mkdir(path.dirname(selected),{recursive:true});
  const temporary=selected+'.fixture-'+randomUUID();await fs.writeFile(temporary,wire);await fs.rename(temporary,selected);
 };
 for(const file of initialFiles)await putFile(file);
 const readFiles=async()=>{
  const files=[];
  async function walk(current,relative=''){
   for(const entry of await fs.readdir(current,{withFileTypes:true})){
    const rel=relative+entry.name,target=path.join(current,entry.name);
    if(entry.isDirectory())await walk(target,rel+'/');
    else files.push(describe(rel,await fs.readFile(target)));
   }
  }
  await walk(cloudRoot);return files.sort((a,b)=>a.path.localeCompare(b.path));
 };
 const server=http.createServer(async(req,res)=>{
  const entry={id:++sequence,started:new Date().toISOString(),method:req.method,path:req.url,
   ifMatch:req.headers['if-match']??null,ifNoneMatch:req.headers['if-none-match']??null,
   status:null,writeCommitted:false,disconnected:false,faults:[]};
  let requestWire=null,responseWire=null,relative=null,releaseWrite=null;
  const send=(status,body=Buffer.alloc(0),headers={})=>{entry.status=status;entry.responseEtag=headers.ETag??null;responseWire=body;res.writeHead(status,headers);res.end(body);};
  const effect=async phase=>{
   for(const fault of plans){
    if(fault.phase!==phase||fault.method&&fault.method!==req.method||fault.path&&fault.path!==relative||fault.pathPrefix&&!relative.startsWith(fault.pathPrefix))continue;
    fault.seen++;
    if(fault.seen<(fault.at??1)||fault.used>=(fault.times??1))continue;
    fault.used++;entry.faults.push({id:fault.id,phase,effect:fault.effect});
    for(const replacement of fault.effect.replace||[])await putFile(replacement);
    if(fault.effect.etag!==undefined)entry.etagOverride=fault.effect.etag;
    if(fault.effect.status!==undefined){send(fault.effect.status);return true;}
    if(fault.effect.disconnect){entry.disconnected=true;res.destroy();return true;}
   }
   return false;
  };
  try{
   const uri=new URL(req.url,'http://127.0.0.1'),decoded=decodeURIComponent(uri.pathname),prefix='/dav/'+folder+'/';
   if(uri.search||!decoded.startsWith(prefix)){send(403);return;}
   relative=decoded.slice(prefix.length);entry.relative=relative;
   if(relative!==''&&!safeRelative(relative)){send(403);return;}
   if(await effect('before'))return;
   const selected=relative?filePath(relative):cloudRoot;
   if(req.method==='MKCOL'){
    try{await fs.mkdir(selected);send(201);}catch(error){send(error.code==='EEXIST'?405:error.code==='ENOENT'?409:500);}return;
   }
   if(req.method==='PUT'){
    const chunks=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>8*1024*1024){send(413);return;}chunks.push(chunk);}
    requestWire=Buffer.concat(chunks);
    releaseWrite=await lockWrites();
    if(await effect('before-conditions'))return;
   }
   let current=null;try{current=await fs.readFile(selected);}catch(error){if(!['ENOENT','EISDIR'].includes(error.code))throw error;}
   const etag=current?'"'+sha(current)+'"':null;entry.beforeEtag=etag;
   if(req.method==='GET'){
    if(!current){send(404);return;}
    if(req.headers['if-none-match']===etag){send(304,Buffer.alloc(0),{ETag:etag});return;}
    const chosen=Object.hasOwn(entry,'etagOverride')?entry.etagOverride:etag,headers={'Content-Length':current.length};
    if(chosen!=null)headers.ETag=chosen==='weak'?'W/'+etag:chosen;
    entry.responseEtag=headers.ETag??null;
    send(200,current,headers);return;
   }
   if(req.method!=='PUT'){send(405);return;}
   if((req.headers['if-none-match']==='*'&&current)||(req.headers['if-match']&&req.headers['if-match']!==etag)){
    send(412,Buffer.alloc(0),etag?{ETag:etag}:{});return;
   }
   if(await effect('before-write'))return;
   try{await fs.stat(path.dirname(selected));}catch(error){if(error.code==='ENOENT'){send(409);return;}throw error;}
   const temporary=selected+'.upload-'+randomUUID();await fs.writeFile(temporary,requestWire);await fs.rename(temporary,selected);
   entry.writeCommitted=true;entry.afterEtag='"'+sha(requestWire)+'"';
   if(await effect('after-write'))return;
   send(current?204:201,Buffer.alloc(0),{ETag:entry.afterEtag});
  }catch(error){entry.error=String(error?.stack||error);if(!res.headersSent&&!res.destroyed)send(500);else if(!res.destroyed)res.destroy();}
  finally{
   releaseWrite?.();
   if(requestWire)entry.request=describe(relative||'',requestWire);
   if(responseWire?.length)entry.response=describe(relative||'',responseWire);
   persist(entry);
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 return {origin:'http://127.0.0.1:'+port,port,folder,cloudRoot,logPath,entries,putFile,readFiles,
  faults:()=>plans.map(({id,seen,used})=>({id,seen,used})),
  flush:()=>queue,close:async()=>{server.closeIdleConnections?.();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await queue;}};
}
