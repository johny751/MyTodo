import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=value=>structuredClone(value);
function cloudOnly() {
  if(process.env.GITHUB_ACTIONS!=='true') throw new Error('Protocol fixture execution is restricted to GitHub Actions');
}
function confined(directory) {
  const root=path.resolve(process.env.RUNNER_TEMP || ''),resolved=path.resolve(directory),relative=path.relative(root,resolved);
  if(!process.env.RUNNER_TEMP || !relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('Fixture files must be isolated below RUNNER_TEMP');
  return resolved;
}
async function physicalWrite(directory,relative,body,files) {
  const plain=Buffer.from(body,'utf8'),wire=relative.endsWith('.gz')?gzipSync(plain):plain;
  const destination=path.join(directory,...relative.split('/'));
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,wire);
  files.push({path:relative,bytes:wire.length,sha256:sha(wire),plainBytes:plain.length,plainSha256:sha(plain)});
}

/** Resolves only fixture envelopes, hashes, physical wire files and deliberate
 * missing/corrupt files. Records/events come from the actual producer export.
 * No validation, causal merge, receipt or snapshot recovery is implemented. */
export async function materializeFixture({suite,caseId,sample,directory}) {
  cloudOnly();directory=confined(directory);
  await fs.mkdir(directory,{recursive:true});
  const selected=suite.cases.find(item=>item.id===caseId);
  if(!selected) throw new Error('Unknown shared fixture case');
  const resolved=copy(suite),one=resolved.cases.find(item=>item.id===caseId),plan=selected.fixturePlan,files=[];
  const prefix='dav/'+suite.defaults.folder+'/';
  let manifest={format:'gxtodo-delta',version:2,epoch:suite.defaults.epoch,heads:{},snapshot:null};
  if(plan) {
    if(!sample?.wire || sample.status!=='passed') throw new Error('Physical fixture requires a completed actual producer sample');
    const producer=sample.raw?.meta?.actor || sample.reopened?.meta?.actor || suite.defaults.producerActor;
    if(plan.kind==='batches') {
      let events=copy(sample.wire.events);
      if(!Array.isArray(events) || !events.length) throw new Error('Actual producer outbox sample is empty');
      if(plan.repeatEvents) events=Array.from({length:plan.repeatEvents},(_,index)=>copy(events[index%events.length]));
      const groups=[];
      if(plan.eventsPerBatch) for(let offset=0;offset<events.length;offset+=plan.eventsPerBatch) groups.push(events.slice(offset,offset+plan.eventsPerBatch));
      else groups.push(events);
      manifest.heads[producer]=groups.length;
      for(let offset=0;offset<groups.length;offset++) {
        const index=offset+1;
        if(plan.omit?.includes(index))continue;
        const body=JSON.stringify({format:'gxtodo-batch',epoch:manifest.epoch,device:producer,index,events:groups[offset]});
        await physicalWrite(directory,prefix+'v2/b-'+producer+'-'+index+'.json.gz',body,files);
      }
    } else if(plan.kind==='snapshot') {
      const records=copy(sample.wire.records);
      if(!Array.isArray(records) || !records.length) throw new Error('Actual producer retained field-version records are empty');
      const id='c003-'+caseId,cursors=copy(plan.snapshotCursors || {[producer]:records.length}),parts=[];
      const perPart=plan.recordsPerPart || 1;
      for(let offset=0;offset<records.length;offset+=perPart) {
        const index=parts.length,relative='v2/s-'+id+'-'+index+'.json.gz';
        const body=JSON.stringify({id,epoch:index===plan.wrongEpochPart?'wrong-epoch':manifest.epoch,records:records.slice(offset,offset+perPart)});
        parts.push({path:relative,sha256:index===plan.badHashPart?'0'.repeat(64):sha(Buffer.from(body,'utf8'))});
        if(!plan.omitParts?.includes(index)) await physicalWrite(directory,prefix+relative,body,files);
      }
      manifest.heads={[producer]:records.length};
      manifest.snapshot={id,parts,cursors,createdAt:'2026-01-01T00:00:00Z'};
    } else throw new Error('Unknown fixture materialization plan');
    for(const operation of one.receive)if(['pull','checkpoint'].includes(operation.op))operation.manifest=copy(manifest);
  }
  await physicalWrite(directory,prefix+'v2/manifest.json',JSON.stringify(manifest),files);
  resolved.cases=[one];
  resolved.fixtureResolved=true;
  resolved.fixtureProvenance={producerPlatform:sample?.platform || null,producerCaseId:sample?.caseId || null,
    producerSourceSha:sample?.provenance?.sourceSha || null,plan:plan || null,files,
    note:'actual producer records/events serialized as existing v2 envelopes; real loopback files; no merge/recovery algorithm in fixture'};
  const suiteFile=path.join(directory,'resolved-suite.json');
  await fs.writeFile(suiteFile,JSON.stringify(resolved,null,2)+'\n');
  return {suite:resolved,files,manifest,suiteFile,directory};
}
export async function startFixtureServer({directory,port=0}) {
  cloudOnly();directory=confined(directory);
  await fs.mkdir(directory,{recursive:true});
  const logPath=path.join(directory,'http-requests.jsonl');
  let sequence=0,logQueue=Promise.resolve();
  const log=entry=>{logQueue=logQueue.then(()=>fs.appendFile(logPath,JSON.stringify(entry)+'\n'));};
  const server=http.createServer(async(req,res)=>{
    const id=++sequence,started=new Date().toISOString();
    let selected=null,wire=null,status=500,etag=null;
    const send=(code,body=Buffer.alloc(0),headers={})=>{
      status=code;res.writeHead(code,headers);res.end(body);
    };
    try {
      const uri=new URL(req.url,'http://127.0.0.1');
      const decoded=decodeURIComponent(uri.pathname);
      const segments=decoded.split('/').filter(Boolean);
      if(uri.search || segments[0]!=='dav' || segments.some(part=>part==='..' || part==='.' || part.includes('\\') || part.includes('\0'))) {send(403);return;}
      selected=path.join(directory,...segments);
      const relative=path.relative(directory,selected);
      if(relative.startsWith('..') || path.isAbsolute(relative)){send(403);return;}
      if(req.method==='MKCOL') {
        try { await fs.mkdir(selected);send(201); }
        catch(error){send(error.code==='EEXIST'?405:error.code==='ENOENT'?409:500);}
        return;
      }
      let current=null;
      try {current=await fs.readFile(selected);}catch(error){if(error.code!=='ENOENT' && error.code!=='EISDIR')throw error;}
      if(current)etag='"'+sha(current)+'"';
      if(req.method==='GET') {
        if(!current){send(404);return;}
        if(req.headers['if-none-match']===etag){send(304,Buffer.alloc(0),{ETag:etag});return;}
        wire=current;
        send(200,current,{ETag:etag,'Content-Type':decoded.endsWith('.gz')?'application/gzip':'application/json; charset=utf-8','Content-Length':current.length});
        return;
      }
      if(req.method==='PUT') {
        const chunks=[];let length=0;
        for await (const chunk of req) {
          length+=chunk.length;if(length>2*1024*1024){send(413);return;}chunks.push(chunk);
        }
        wire=Buffer.concat(chunks);
        if((req.headers['if-none-match']==='*' && current) || (req.headers['if-match'] && req.headers['if-match']!==etag)){send(412,Buffer.alloc(0),etag?{ETag:etag}:{});return;}
        try {await fs.stat(path.dirname(selected));}catch(error){if(error.code==='ENOENT'){send(409);return;}throw error;}
        const temporary=selected+'.upload-'+randomUUID();
        await fs.writeFile(temporary,wire);
        await fs.rename(temporary,selected);
        etag='"'+sha(wire)+'"';
        send(current?204:201,Buffer.alloc(0),{ETag:etag});return;
      }
      send(405);
    } catch(error) { if(!res.headersSent)send(500,Buffer.from(String(error.message),'utf8')); }
    finally {
      let plainSha256=null;
      if(wire)try {plainSha256=sha(selected?.endsWith('.gz')?gunzipSync(wire):wire);}catch{}
      log({id,started,method:req.method,path:req.url,status,etag,bytes:wire?.length || 0,wireSha256:wire?sha(wire):null,plainSha256});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const assigned=server.address().port;
  return {origin:'http://127.0.0.1:'+assigned,port:assigned,logPath,
    close:async()=>{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await logQueue;}};
}
async function main() {
  cloudOnly();
  const args={};for(let index=2;index<process.argv.length;index+=2)args[process.argv[index].replace(/^--/,'')]=process.argv[index+1];
  if(!args.directory)throw new Error('Usage: fixture-server.mjs --directory RUNNER_TEMP/path [--port 0]');
  const server=await startFixtureServer({directory:args.directory,port:Number(args.port || 0)});
  process.stdout.write(JSON.stringify({origin:server.origin,port:server.port,logPath:server.logPath})+'\n');
  process.on('SIGTERM',async()=>{await server.close();process.exit(0);});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {await main();}catch(error){process.stderr.write(String(error?.stack || error)+'\n');process.exitCode=1;}
}
