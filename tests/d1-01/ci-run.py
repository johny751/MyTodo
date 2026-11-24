"""Cloud-only orchestrator. Builds and executes independent test programs only."""
import json, os, pathlib, shutil, subprocess, sys, traceback
from isolation import root_path, safe_file, sha, write_json, open_db, json_bytes
from factory import create
from migration import migrate, rows, verify_original_bytes, original_dump
from suite import run

HERE=pathlib.Path(__file__).resolve().parent

def execute(root,label,args):
    try:result=subprocess.run(args,capture_output=True,timeout=1800)
    except subprocess.TimeoutExpired as error:
        stdout=error.stdout or b'';stderr=error.stderr or b''
        (root/(label+'.stdout')).write_bytes(stdout);(root/(label+'.stderr')).write_bytes(stderr)
        write_json(root/(label+'.command.json'),{'argv':[str(a) for a in args],'timedOut':True,'timeoutSeconds':1800,'exitCode':None,'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),'error':str(error)})
        raise
    (root/(label+'.stdout')).write_bytes(result.stdout);(root/(label+'.stderr')).write_bytes(result.stderr)
    receipt={'argv':[str(a) for a in args],'exitCode':result.returncode,'stdoutSha256':sha(result.stdout),'stderrSha256':sha(result.stderr)}
    write_json(root/(label+'.command.json'),receipt)
    if result.returncode:raise RuntimeError(label+' failed: '+result.stderr.decode('utf-8','replace')[-2000:])
    return result

def canonical(root,source,profile):
    target=safe_file(root,'canonical.sqlite',must_exist=False)
    if any(pathlib.Path(str(target)+suffix).exists() for suffix in ('','-wal','-shm','-journal')):raise RuntimeError('BLOCKER: candidate output already exists')
    db=open_db(root,source);out=__import__('sqlite3').connect(target)
    try:db.backup(out)
    finally:out.close();db.close()
    migrate(root,target)
    db=open_db(root,target)
    try:
        fixture=json.loads((root/'fixture.json').read_text(encoding='utf-8'));verify_original_bytes(db,fixture)
        projections=[list(v) for v in db.execute('SELECT source_key,projection FROM d1_projection ORDER BY source_key')]
        raw_columns=[list(v) for v in db.execute('SELECT key,typeof(parent_id),parent_id,typeof(quadrant),quadrant,typeof(reminder_at),reminder_at FROM entities ORDER BY key')]
        value={'profile':profile,'fixtureId':'synthetic-fixed-v1','projections':projections,'rawFields':[(r['key'],r['data'],r['record'],r['deleted'],r['conflicts']) for r in rows(db)],'meta':db.execute('SELECT value FROM meta').fetchone()[0],'outbox':[(v[0],v[1]) for v in db.execute('SELECT id,event FROM outbox ORDER BY id')],'sourceColumnObservations':raw_columns}
        write_json(root/'canonical-export.json',value);return value
    finally:db.close()

def seal(root):
    payload=[]
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            payload.append({'path':str(path.relative_to(root)).replace('\\','/'),'type':'rejected-test-symlink','target':os.readlink(path)})
        elif path.is_file() and path.name!='payload-sha256.json':payload.append({'path':str(path.relative_to(root)).replace('\\','/'),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())})
    write_json(root/'payload-sha256.json',payload)

def main(mode,path):
    report={'sourceSha':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],'mode':mode,'status':'started','profiles':[],'errors':[],'productionTouched':False}
    root=root_path(path,create=True)
    try:
        if mode=='desktop':
            for profile in ['windows','node']:
                sub=create(root/profile)
                try:
                    if profile=='windows':
                        execute(sub,'build-native',['node',str(HERE/'build-desktop.mjs'),str(sub)])
                        execute(sub,'generate-native',[str(sub/'native-build/d1-native-generator.exe'),str(sub)])
                    else:execute(sub,'generate-node',['node',str(HERE/'node-generator.mjs'),str(sub)])
                    source=sub/(profile+'-source.sqlite');tested=run(sub,source,profile);canonical(sub,source,profile)
                    report['profiles'].append({'profile':profile,'status':tested['status'],'passed':tested['passed'],'failed':tested['failed'],'cases':tested['namedCases']})
                except BaseException as error:report['errors'].append({'profile':profile,'error':str(error),'traceback':traceback.format_exc()})
                finally:seal(sub)
        elif mode=='android':
            sub=create(root/'android')
            try:
                execute(sub,'generate-android',['node',str(HERE/'android-runner.mjs'),str(sub)])
                tested=run(sub,sub/'android-source.sqlite','android');canonical(sub,sub/'android-source.sqlite','android')
                report['profiles'].append({'profile':'android','status':tested['status'],'passed':tested['passed'],'failed':tested['failed'],'cases':tested['namedCases']})
            except BaseException as error:report['errors'].append({'profile':'android','error':str(error),'traceback':traceback.format_exc()})
            finally:seal(sub)
        else:raise ValueError('Unknown cloud job mode')
    finally:
        expected=2 if mode=='desktop' else 1
        report['status']='passed' if not report['errors'] and len(report['profiles'])==expected and all(p['status']=='passed' for p in report['profiles']) else 'failed'
        write_json(root/'job-receipt.json',report);seal(root)
    if report['status']!='passed':raise RuntimeError('See retained job receipt and original errors')

if __name__=='__main__':main(sys.argv[1],sys.argv[2])
