import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createSQLiteStore} from '../../src/sqlite-store.mjs';
import {executeCase} from './shared-executor.mjs';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const deltaExportAppend='\nexport const __c003Internals={manifestValue,bind,checkpoint,pull,prepare,publish,makeSnapshot};\n';
export async function ensureDeltaAdapter({sourceRoot=process.cwd()}={}) {
  const originalPath=path.join(sourceRoot,'src','delta-sync.mjs');
  const adapterPath=path.join(sourceRoot,'src','.c003-delta-adapter.mjs');
  const original=await fs.readFile(originalPath),adapted=Buffer.concat([original,Buffer.from(deltaExportAppend,'utf8')]);
  await fs.writeFile(adapterPath,adapted);
  const module=await import(pathToFileURL(adapterPath).href+'?sha='+digest(adapted));
  return {delta:module.__c003Internals,provenance:{originalPath:'src/delta-sync.mjs',originalSha256:digest(original),
    adapterPath:'src/.c003-delta-adapter.mjs',adapterSha256:digest(adapted),adaptation:'original bytes plus private-function export only; production file unchanged'}};
}
function confinedToRunner(directory) {
  const base=path.resolve(process.env.RUNNER_TEMP || ''),target=path.resolve(directory),relative=path.relative(base,target);
  if (!process.env.RUNNER_TEMP || !relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) throw new Error('Fixture database must be isolated below RUNNER_TEMP');
  return target;
}
function validOrigin(input) {
  if (!input) return null;
  const url=new URL(input);
  if (url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw new Error('Only an origin-only loopback fixture URL is allowed');
  return url.origin;
}
export async function createJSAdapter({dbDir,fixtureUrl=null,folder='C003',sourceRoot=process.cwd()}) {
  const directory=confinedToRunner(dbDir);
  await fs.mkdir(directory,{recursive:true});
  let store=createSQLiteStore(directory);
  const origin=validOrigin(fixtureUrl);
  const {delta,provenance:deltaProvenance}=await ensureDeltaAdapter({sourceRoot});
  const coreFiles=['src/model.mjs','src/replica.mjs','src/sqlite-store.mjs','src/delta-sync.mjs'];
  const coreHashes=Object.fromEntries(await Promise.all(coreFiles.map(async file=>[file,digest(await fs.readFile(path.join(sourceRoot,file)))])));
  const audit=async()=>{
    const initial=store.call({action:'inspect',keys:[]}),rows=[];
    let after='';
    for (;;) {
      const page=store.call({action:'page',after,limit:500});
      rows.push(...page.rows);
      if(page.rows.length<500)break;
      after=page.rows.at(-1).key;
    }
    const exported=store.call({action:'outbox',limit:500});
    // Count with a real second connection so the API's 500 cap cannot hide data.
    const check=new DatabaseSync(path.join(directory,'tasks.sqlite'));
    let count,integrity;
    try {count=Number(check.prepare('SELECT COUNT(*) AS count FROM outbox').get().count);integrity=check.prepare('PRAGMA integrity_check').all();}
    finally {check.close();}
    if (count>exported.entries.length) throw new Error('Production outbox export would truncate '+count+' entries at its 500-row API cap');
    if (!integrity.length || integrity.some(row => row.integrity_check !== 'ok')) throw new Error('Actual SQLite integrity_check failed: '+JSON.stringify(integrity));
    return {meta:initial.meta,rows,outbox:exported.entries,outboxCount:count,integrity,databaseFile:path.join(directory,'tasks.sqlite')};
  };
  const seed=async({actor})=>{
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(actor)) throw new Error('Invalid fixture actor');
    const before=await audit();
    if(before.meta.initialized || before.meta.seq!==0 || before.meta.queue!==0 || before.rows.length || before.outbox.length) throw new Error('Refusing actor changes in initialized or nonempty fixture database');
    const seedDb=new DatabaseSync(path.join(directory,'tasks.sqlite'));
    try { seedDb.prepare('UPDATE meta SET value=? WHERE id=1').run(JSON.stringify({...before.meta,actor})); }
    finally { seedDb.close(); }
  };
  const fault=async spec=>{
    if (!['meta','entities'].includes(spec.table) || !/^[a-zA-Z0-9_]{1,80}$/.test(spec.name || '')) throw new Error('Unsafe fixture SQL trigger target');
    if (!['update-abort','insert-id-abort'].includes(spec.kind)) throw new Error('Unsupported actual SQLite fault kind');
    const sql=new DatabaseSync(path.join(directory,'tasks.sqlite'));
    try {
      sql.exec('DROP TRIGGER IF EXISTS '+spec.name);
      if (!spec.enabled) return {installed:false,name:spec.name};
      let trigger;
      if(spec.kind==='update-abort') trigger='CREATE TRIGGER '+spec.name+" BEFORE UPDATE ON meta BEGIN SELECT RAISE(ABORT,'C003_SQL_FAILURE'); END";
      else {
        if(spec.table!=='entities' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(spec.id || '')) throw new Error('Unsafe fixture entity fault id');
        trigger='CREATE TRIGGER '+spec.name+" BEFORE INSERT ON entities WHEN NEW.id='"+spec.id+"' BEGIN SELECT RAISE(ABORT,'C003_SQL_FAILURE'); END";
      }
      // Persistent trigger is intentional: TEMP triggers on a second connection
      // would not intercept the production store's connection.
      sql.exec(trigger);return {installed:true,name:spec.name,connection:'actual second SQLite connection; trigger visible to production handle'};
    } finally {sql.close();}
  };
  const reopen=async()=>{store.close();store=createSQLiteStore(directory);};
  const request=origin?async input=>{
    if (!['GET','PUT','MKCOL'].includes(input.method) || !/^(state\.json|v2\/|v2\/[a-zA-Z0-9_.-]+)$/.test(input.path)) throw new Error('Fixture transport request is outside existing v2 paths');
    const encoded='/dav/'+encodeURIComponent(folder)+'/'+input.path;
    const headers={};
    if(input.etag) headers[input.method==='GET'?'If-None-Match':'If-Match']=input.etag;
    else if(input.method==='PUT') headers['If-None-Match']='*';
    let body;
    if(input.body!=null) {
      body=Buffer.from(input.body,'utf8');
      if(input.path.endsWith('.gz'))body=gzipSync(body);
      headers['Content-Type']=input.path.endsWith('.gz')?'application/gzip':'application/json; charset=utf-8';
    }
    const response=await fetch(origin+encoded,{method:input.method,headers,body,signal:AbortSignal.timeout(10000)});
    const wire=Buffer.from(await response.arrayBuffer());
    const plain=input.path.endsWith('.gz') && wire.length && response.status===200?gunzipSync(wire):wire;
    return {status:response.status,etag:response.headers.get('etag'),body:plain.toString('utf8')};
  }:null;
  return {platform:'javascript',call:input=>store.call(input),seed,reopen,audit,fault,request,delta,
    provenance:{storage:'production createSQLiteStore; real node:sqlite tasks.sqlite WAL/FULL',sourceSha:process.env.EXPECTED_SOURCE_SHA || process.env.GITHUB_SHA || 'unrecorded',
      node:process.version,sqlite:process.versions.sqlite,coreHashes,deltaAccess:deltaProvenance},
    close:()=>store.close()};
}
function parseArguments(argv) {
  const mode=argv.shift(),args={mode};
  for(let index=0;index<argv.length;index+=2) {
    if(!argv[index].startsWith('--') || argv[index+1]==null) throw new Error('Invalid harness arguments');
    args[argv[index].slice(2)]=argv[index+1];
  }
  if(!['generate','receive','report'].includes(mode) || !args.suite || !args.case || !args['db-dir'] || !args.output) throw new Error('Usage: js-harness.mjs generate|receive|report --suite FILE --case ID --db-dir RUNNER_TEMP/path --output FILE [--input SAMPLE --fixture-url http://127.0.0.1:PORT]');
  return args;
}
export async function main(argv=process.argv.slice(2)) {
  if(process.env.GITHUB_ACTIONS!=='true') throw new Error('C0-03 project execution is cloud-only; no local fallback');
  const args=parseArguments(argv),suite=JSON.parse(await fs.readFile(args.suite,'utf8'));
  const sample=args.input?JSON.parse(await fs.readFile(args.input,'utf8')):null;
  const adapter=await createJSAdapter({dbDir:args['db-dir'],fixtureUrl:args['fixture-url'],folder:suite.defaults.folder,sourceRoot:process.cwd()});
  let result;
  try { result=await executeCase({suite,caseId:args.case,mode:args.mode,sample,...adapter}); }
  finally {adapter.close();}
  await fs.mkdir(path.dirname(path.resolve(args.output)),{recursive:true});
  await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({platform:result.platform,caseId:result.caseId,mode:result.mode,status:result.status,error:result.error || null})+'\n');
  return result.status==='passed'?0:1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.exitCode=await main();}catch(error){process.stderr.write(String(error?.stack || error)+'\n');process.exitCode=1;}
}
