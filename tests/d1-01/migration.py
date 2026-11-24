"""Synthetic-only SQL migration registry, interruption, backup and restore prototype."""
import json, os, pathlib, sqlite3, sys, re, uuid
from isolation import CANDIDATE, GUARD, json_bytes, logical_dump, open_db, root_path, safe_file, sha, write_json
from candidate import parse_raw, project

MIGRATION='synthetic-candidate-projection-v1'
SQL='''CREATE TABLE d1_raw_sources(ledger_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,source_key TEXT UNIQUE NOT NULL,raw_data TEXT NOT NULL,raw_sha256 TEXT NOT NULL,PRIMARY KEY(ledger_id,kind,entity_id));
CREATE TABLE d1_projection(source_key TEXT PRIMARY KEY REFERENCES d1_raw_sources(source_key),projection TEXT NOT NULL);
CREATE TABLE d1_relations(ledger_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,role TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(ledger_id,source_kind,source_id,role),FOREIGN KEY(ledger_id,source_kind,source_id) REFERENCES d1_raw_sources(ledger_id,kind,entity_id),FOREIGN KEY(ledger_id,target_kind,target_id) REFERENCES d1_raw_sources(ledger_id,kind,entity_id));
CREATE TABLE d1_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,source_hash TEXT NOT NULL,target_hash TEXT NOT NULL,candidate TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'))'''

def checksum():
    here=pathlib.Path(__file__).parent
    return sha(b''.join(name.encode('utf-8')+b'\0'+(here/name).read_bytes() for name in ('migration.py','candidate.py','isolation.py','factory.py')))
def original_dump(db):return {k:v for k,v in logical_dump(db).items() if not k.startswith('d1_') or k=='d1_synthetic_guard'}
def rows(db):return [dict(r) for r in db.execute('SELECT * FROM entities ORDER BY key')]
def target_hash(db):return sha(json_bytes({k:v for k,v in logical_dump(db).items() if k in {'d1_raw_sources','d1_projection','d1_relations'}}))
def source_schema_check(db):
    from factory import SCHEMA
    core={'meta','entities','outbox','d1_synthetic_guard'}
    def signature(c):
        return sorted((r[0],r[1],r[2],re.sub(r'\s+',' ',r[3]).strip() if r[3] else None)
                      for r in c.execute('SELECT type,name,tbl_name,sql FROM sqlite_master') if r[2] in core)
    reference=sqlite3.connect(':memory:')
    try:
        reference.executescript(SCHEMA)
        if signature(db)!=signature(reference):raise RuntimeError('BLOCKER: unknown source schema fingerprint')
    finally:reference.close()

def migrate(root,file,fault=None,expected_checksum=None):
    r=root_path(root);p=safe_file(r,file);db=open_db(r,p,write=True)
    attempt={'pid':os.getpid(),'database':str(p),'fixtureId':'synthetic-fixed-v1','fault':fault,'migrationId':MIGRATION,'status':'started'}
    attempt['attemptId']=uuid.uuid4().hex
    audit=r/(p.name+'.attempt-'+str(os.getpid())+'-'+attempt['attemptId']+'.json')
    actual=checksum();expected_checksum=expected_checksum or actual
    def stage(name):
        attempt['stage']=name;write_json(audit,attempt)
        print(json.dumps({'stage':name,'pid':os.getpid(),'database':str(p)}),flush=True)
        if fault=='kill:'+name:os._exit(91)
        if fault=='error:'+name:raise RuntimeError('injected-primary-'+name)
    try:
        if expected_checksum!=actual:raise RuntimeError('BLOCKER: implementation checksum mismatch')
        source_schema_check(db)
        source_hash=sha(json_bytes(original_dump(db)))
        existing=db.execute("SELECT name FROM sqlite_master WHERE name='d1_migration_registry'").fetchone()
        if existing:
            prior=db.execute('SELECT * FROM d1_migration_registry WHERE migration_id=?',(MIGRATION,)).fetchone()
            if prior is None or prior['checksum']!=actual or prior['source_hash']!=source_hash or prior['target_hash']!=target_hash(db) or prior['candidate']!=CANDIDATE or db.execute('PRAGMA user_version').fetchone()[0]!=1001 or db.execute('PRAGMA foreign_key_check').fetchall() or db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise RuntimeError('BLOCKER: registry or source fingerprint drift')
            attempt['status']='idempotent';write_json(audit,attempt);return attempt
        if db.execute('PRAGMA user_version').fetchone()[0]!=0:raise RuntimeError('BLOCKER: unknown source schema version')
        names={v[0] for v in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if names!={'meta','entities','outbox','d1_synthetic_guard'}:raise RuntimeError('BLOCKER: unknown source schema')
        stage('before_begin');db.execute('PRAGMA foreign_keys=ON');db.execute('BEGIN IMMEDIATE')
        # execute statements individually: sqlite3.executescript would implicitly commit.
        for statement in SQL.split(';'):
            if statement.strip():db.execute(statement)
        stage('after_schema');items=rows(db)
        for row in items:
            db.execute('INSERT INTO d1_raw_sources VALUES(?,?,?,?,?,?)',('synthetic-ledger',row['kind'],row['id'],row['key'],row['data'],sha(row['data'].encode('utf-8'))))
        for row in items:
            value=project(row,items);db.execute('INSERT INTO d1_projection VALUES(?,?)',(row['key'],json_bytes(value).decode('utf-8')))
            for role,rel in value.get('relations',{}).items():
                if rel['status']=='resolved':
                    target_kind='projects' if role=='project' else 'places' if role=='place' else 'tasks'
                    db.execute('INSERT INTO d1_relations VALUES(?,?,?,?,?,?)',('synthetic-ledger',row['kind'],row['id'],role,target_kind,rel['targetId']))
        stage('after_rows')
        if sha(json_bytes(original_dump(db)))!=source_hash:raise RuntimeError('source changed during candidate projection')
        if len(items)!=db.execute('SELECT count(*) FROM d1_raw_sources').fetchone()[0] or db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('post-validation failure')
        stage('after_validation');stage('before_registry')
        db.execute('INSERT INTO d1_migration_registry VALUES(?,?,?,?,?,?)',(MIGRATION,actual,source_hash,target_hash(db),CANDIDATE,'committed'))
        db.execute('PRAGMA user_version=1001');stage('before_commit');db.execute('COMMIT');stage('after_commit')
        attempt['status']='committed';write_json(audit,attempt);return attempt
    except BaseException as error:
        attempt['status']='failed';attempt['primaryError']=str(error)
        if db.in_transaction:
            try:db.execute('ROLLBACK')
            except BaseException as secondary:attempt['rollbackError']=str(secondary)
        write_json(audit,attempt);raise
    finally:db.close()

def verify_original_bytes(db,fixture):
    if db.execute('SELECT CAST(value AS BLOB) FROM meta WHERE id=1').fetchone()[0]!=fixture['meta'].encode('utf-8'):raise RuntimeError('meta bytes changed')
    for row in fixture['rows']:
        actual=db.execute('SELECT CAST(data AS BLOB),CAST(record AS BLOB),CAST(conflicts AS BLOB),deleted FROM entities WHERE key=?',(row['key'],)).fetchone()
        if actual is None or list(actual[:3])!=[row[k].encode('utf-8') for k in ('data','record','conflicts')] or actual[3]!=row['deleted']:raise RuntimeError('raw row bytes changed '+row['id'])
    actual=db.execute('SELECT id,CAST(event AS BLOB) FROM outbox ORDER BY id').fetchall()
    if [(v[0],v[1]) for v in actual]!=[(v['id'],v['event'].encode('utf-8')) for v in fixture['outbox']]:raise RuntimeError('outbox bytes changed')

def snapshot(root,file,target,assets=()):
    r=root_path(root);source=safe_file(r,file);dest=safe_file(r,target,must_exist=False)
    if dest.exists():raise RuntimeError('BLOCKER: refusing existing backup')
    db=open_db(r,source);out=sqlite3.connect(dest)
    try:db.backup(out)
    finally:out.close();db.close()
    copied=open_db(r,dest)
    try:
        if copied.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('bad SQLite backup')
        state=original_dump(copied)
    finally:copied.close()
    manifest={'guard':GUARD,'candidate':CANDIDATE,'database':dest.name,'bytes':dest.stat().st_size,
              'sha256':sha(dest.read_bytes()),'sourceLogicalHash':sha(json_bytes(state)),
              'assets':[],'complete':True}
    asset_directory=r/(dest.name+'.assets')
    if assets:
        if asset_directory.exists():raise RuntimeError('BLOCKER: refusing existing asset directory')
        asset_directory.mkdir()
    for asset in assets:
        path=safe_file(r,asset)
        data=path.read_bytes();copied=safe_file(r,asset_directory/path.name,must_exist=False)
        if copied.exists():raise RuntimeError('BLOCKER: duplicate asset output')
        copied.write_bytes(data)
        if sha(path.read_bytes())!=sha(data) or copied.read_bytes()!=data:raise RuntimeError('BLOCKER: mutable asset during snapshot')
        manifest['assets'].append({'path':str(copied.relative_to(r)),'originalPath':str(path.relative_to(r)),
                                   'bytes':len(data),'sha256':sha(data)})
    write_json(r/(dest.name+'.manifest.json'),manifest);return manifest

def verify_backup(root,manifest,trusted_sha):
    r=root_path(root);mp=safe_file(r,manifest)
    if sha(mp.read_bytes())!=trusted_sha:raise RuntimeError('BLOCKER: untrusted/tampered manifest')
    m=parse_raw(mp.read_text(encoding='utf-8'))
    if m['guard']!=GUARD or m['candidate']!=CANDIDATE or not m['complete']:raise RuntimeError('BLOCKER: incomplete or wrong package')
    for entry in [{'path':m['database'],'bytes':m['bytes'],'sha256':m['sha256']},*m['assets']]:
        p=safe_file(r,entry['path'])
        if p.stat().st_size!=entry['bytes'] or sha(p.read_bytes())!=entry['sha256']:raise RuntimeError('BLOCKER: backup/asset bytes mismatch')
    db=open_db(r,m['database'])
    try:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or sha(json_bytes(original_dump(db)))!=m['sourceLogicalHash']:raise RuntimeError('BLOCKER: backup logical mismatch')
    finally:db.close()
    return m

def restore_gate(root,current,backup,remote_before,remote_now):
    """A conservative refusal, not a numeric max/remote synchronization implementation."""
    r=root_path(root);a=open_db(r,current);b=open_db(r,backup)
    try:
        if not isinstance(remote_before,dict) or not isinstance(remote_now,dict) or not remote_before or not remote_now:
            raise RuntimeError('BLOCKER: unknown remote evidence')
        if original_dump(a)!=original_dump(b) or remote_before!=remote_now:
            raise RuntimeError('BLOCKER: newer or unknown local/remote progress; forward reconciliation required')
        return {'eligibleForOfflineCandidate':True,'automaticActivation':False}
    finally:a.close();b.close()

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('root');parser.add_argument('file');parser.add_argument('--fault')
    args=parser.parse_args();migrate(args.root,args.file,args.fault)
