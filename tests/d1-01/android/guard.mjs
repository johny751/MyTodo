import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const GUARD='MYTODO_D1_SYNTHETIC_ONLY';
export const CANDIDATE='d1-01-candidate.1';
export const FIXTURE='synthetic-fixed-v1';
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export async function cloudRoot(input,platform='linux') {
  if(!['linux','win32'].includes(platform))throw new Error('BLOCKER: unsupported synthetic host');
  if(process.env.GITHUB_ACTIONS!=='true'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||
      !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')||process.env.RUNNER_OS!==(platform==='win32'?'Windows':'Linux')||process.platform!==platform||
      process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw new Error('BLOCKER: authorized GitHub-hosted synthetic execution required');
  if(!path.isAbsolute(input||'')||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw new Error('BLOCKER: absolute synthetic root and RUNNER_TEMP required');
  const supplied=path.normalize(input),temp=await fs.realpath(process.env.RUNNER_TEMP);
  const relative=path.relative(temp,supplied);
  if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('BLOCKER: root outside dedicated RUNNER_TEMP child');
  for(let cursor=supplied;cursor!==temp;cursor=path.dirname(cursor)) {
    if(cursor===path.dirname(cursor))throw new Error('BLOCKER: wrong root ancestry');
    if((await fs.lstat(cursor)).isSymbolicLink())throw new Error('BLOCKER: symlink root or ancestor');
  }
  const root=await fs.realpath(supplied);if(root!==supplied)throw new Error('BLOCKER: root resolution changed');
  const markerFile=path.join(root,'D1-SYNTHETIC.json');await regular(markerFile);
  const marker=JSON.parse(await fs.readFile(markerFile,'utf8'));
  if(Object.keys(marker).sort().join(',')!=='candidate,guard,runId'||marker.guard!==GUARD||marker.candidate!==CANDIDATE||marker.runId!==process.env.GITHUB_RUN_ID)
    throw new Error('BLOCKER: wrong synthetic marker/run');
  const fixtureFile=path.join(root,'fixture.json');await regular(fixtureFile);const bytes=await fs.readFile(fixtureFile);
  if(bytes.length>8*1024*1024)throw new Error('BLOCKER: fixture too large');
  const fixture=JSON.parse(bytes.toString('utf8'));
  if(fixture.synthetic!==true||fixture.guard!==GUARD||fixture.candidate!==CANDIDATE||fixture.fixtureId!==FIXTURE||fixture.runId!==marker.runId)
    throw new Error('BLOCKER: fixture/run identity mismatch');
  if(!Array.isArray(fixture.rows)||fixture.rows.length>1000||!Array.isArray(fixture.outbox)||typeof fixture.meta!=='string')throw new Error('BLOCKER: invalid fixture structure');
  const columns='CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)';
  const expected=['PRAGMA journal_mode=WAL','PRAGMA synchronous=FULL','CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL)',
    'CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)',columns,
    'CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)','CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)',
    'CREATE INDEX task_parent ON entities(parent_id)','CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)'];
  const normalize=sql=>sql.replace(/\s+/g,' ').trim();
  if(typeof fixture.schema!=='string'||JSON.stringify(fixture.schema.split(';').map(normalize).filter(Boolean))!==JSON.stringify(expected.map(normalize)))
    throw new Error('BLOCKER: fixture schema differs from sealed static DDL');
  for(const row of fixture.rows)for(const key of ['key','kind','id','data','record','conflicts'])if(typeof row[key]!=='string')throw new Error('BLOCKER: raw TEXT required');
  for(const row of fixture.outbox)if(!Number.isSafeInteger(row.id)||typeof row.event!=='string')throw new Error('BLOCKER: outbox identity/raw TEXT required');
  return {root,fixture,fixtureBytes:bytes,fixtureSha256:hash(bytes)};
}
export async function regular(file) {
  const item=await fs.lstat(file);if(!item.isFile()||item.isSymbolicLink()||item.nlink!==1)throw new Error('BLOCKER: nonregular or linked input/output '+path.basename(file));return item;
}
export async function freshDirectory(root,name) {
  if(!/^[a-z0-9-]+$/.test(name))throw new Error('BLOCKER: fixed output directory required');
  const directory=path.join(root,name);await fs.mkdir(directory);if(await fs.realpath(directory)!==directory)throw new Error('BLOCKER: output directory resolution changed');return directory;
}
export async function writeFresh(file,bytes) {await fs.writeFile(file,bytes,{flag:'wx'});}
