"""Codespaces evidence reads only. Never builds, tests, opens a DB or edits Git."""
import hashlib,json,pathlib,subprocess,sys

repo='johny751/MyTodo'
root=pathlib.Path(sys.argv[1]).resolve()
assert str(root).startswith('/workspaces/d403-evidence-') and not root.exists()
root.mkdir()
def api(endpoint):
    return subprocess.check_output(['gh','api',endpoint],text=True)
def save(name,contents):
    target=root/name;target.write_text(contents,encoding='utf-8')
    return json.loads(contents)
records=[]
for run_id in ('45533988173','45533988196'):
    run=save('run-'+run_id+'.json',api('repos/'+repo+'/actions/runs/'+run_id))
    jobs=save('jobs-'+run_id+'.json',api('repos/'+repo+'/actions/runs/'+run_id+'/jobs?per_page=100'))
    artifacts=save('artifacts-'+run_id+'.json',api('repos/'+repo+'/actions/runs/'+run_id+'/artifacts?per_page=100'))
    annotations=[]
    for job in jobs['jobs']:
        check_id=job['check_run_url'].rsplit('/',1)[1]
        items=save('annotations-'+run_id+'-'+str(job['id'])+'.json',api('repos/'+repo+'/check-runs/'+check_id+'/annotations?per_page=100'))
        annotations.extend(items)
    messages=[item.get('message','') for item in annotations]
    blocked=any('recent account payments have failed or your spending limit needs to be increased' in message for message in messages)
    assert run['head_sha']=='288b0b97d9974e3797a5099c97d5aeb1c3e26dc9'
    assert blocked and artifacts['total_count']==0
    logs=subprocess.run(['gh','run','view',run_id,'-R',repo,'--log-failed'],capture_output=True,text=True)
    (root/('log-failed-'+run_id+'.txt')).write_text(logs.stdout,encoding='utf-8')
    (root/('log-failed-'+run_id+'-stderr.txt')).write_text(logs.stderr,encoding='utf-8')
    records.append({'runId':run_id,'runAttempt':run['run_attempt'],'sourceSHA':run['head_sha'],
        'url':run['html_url'],'status':run['status'],'conclusion':run['conclusion'],
        'executionStatus':'BLOCKER — GitHub refused runner start because of billing/spending limit',
        'testExecuted':0,'testPassed':0,'testFailed':0,'artifactCount':0,
        'failedJobCount':sum(job['conclusion']=='failure' for job in jobs['jobs']),
        'skippedJobCount':sum(job['conclusion']=='skipped' for job in jobs['jobs']),
        'annotationMessages':sorted(set(messages)),
        'rawFailedLogExitCode':logs.returncode,
        'logNote':'No execution log exists for jobs rejected before runner start; original annotations are the failure evidence.'})
save('execution-blocker.json',json.dumps({'kind':'D4-03 blocked Actions evidence','runs':records,
    'stageStatus':'NOT CLOSED; candidate implementation is unverified',
    'nextStep':'Owner restores GitHub Actions availability; rerun the exact candidate workflows in hosted Actions.',
    'localBuildOrTestFallback':False,'productionDataAccess':False,'productionSyncChanged':False},indent=2)+'\n')
files=[]
for file in sorted(root.iterdir()):
    if file.is_file():
        data=file.read_bytes();files.append({'path':file.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(root/'sha256-manifest.json').write_text(json.dumps({'files':files},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'directory':str(root),'files':len(files),'runs':records},indent=2))
