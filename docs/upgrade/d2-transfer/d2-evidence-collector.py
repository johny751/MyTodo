"""Codespaces GitHub evidence files only; never executes project code, SQLite or builds."""
import hashlib,io,json,os,pathlib,subprocess,sys,zipfile
assert os.environ.get('CODESPACES')=='true'
repo=pathlib.Path('/workspaces/mytodo-d2-candidate').resolve(strict=True)
assert pathlib.Path.cwd().resolve()==repo
run,expected_sha=sys.argv[1:];assert run.isdigit() and len(expected_sha)==40 and all(c in '0123456789abcdef' for c in expected_sha)
root=repo/'docs/upgrade/d2/evidence'/('run-'+run);root.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
gh=lambda *args:subprocess.check_output(['gh',*args],cwd=repo)
def save(name,data):
    target=root/name;assert target.parent==root and not target.is_symlink()
    if target.exists():assert target.read_bytes()==data,'immutable evidence collision'
    else:target.write_bytes(data)
metadata=gh('api','repos/johny751/MyTodo/actions/runs/'+run);r=json.loads(metadata)
assert r['head_sha']==expected_sha and r['status']=='completed' and r['head_branch']=='d2/implementation-candidate-1'
save('run.json',metadata)
jobs=gh('api','repos/johny751/MyTodo/actions/runs/'+run+'/jobs?per_page=100');save('jobs.json',jobs)
artifacts=gh('api','repos/johny751/MyTodo/actions/runs/'+run+'/artifacts?per_page=100');save('artifacts.json',artifacts);items=json.loads(artifacts);assert items['total_count']==len(items['artifacts'])
archives=[];receipts=[]
selected={'source-scope-receipt.json','results.json','native-build-receipt.json','production-source-identity.json','node-report.json','android-build-receipt.json','android-storage-receipt.json','android-runner-receipt.json','backup-results.json','comparison-results.json','native-first-error.json'}
for item in items['artifacts']:
    name=item['name'];assert name.startswith('d2-') and name.endswith('-'+run+'-'+str(r['run_attempt'])) and '/' not in name and not item['expired']
    data=gh('api','repos/johny751/MyTodo/actions/artifacts/'+str(item['id'])+'/zip');digest=sha(data);assert item['digest']=='sha256:'+digest
    save(name+'.zip',data);archives.append({'name':name+'.zip','artifactId':item['id'],'bytes':len(data),'sha256':digest,'officialDigest':item['digest']})
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos=z.infolist();assert len(infos)<10000 and sum(i.file_size for i in infos)<800*1024*1024
        assert len({i.filename for i in infos})==len(infos)
        for info in infos:
            p=pathlib.PurePosixPath(info.filename);assert not p.is_absolute() and '..' not in p.parts and (info.external_attr>>16)&0o170000!=0o120000
            if p.name in selected:
                raw=z.read(info);v=json.loads(raw);save(name+'--'+info.filename.replace('/','__'),raw)
                brief={k:v[k] for k in ('schema','status','sourceSha','runId','runAttempt','passed','failed','total','actualProductionEntry','startupMigration','actualProductionStorageApi','actualFramework','productionAppEntryLoaded','implementationChecksum','firstError','primaryError') if k in v}
                if 'cases' in v:brief['cases']=[{k:c[k] for k in ('id','name','status','passed','error','primaryError') if k in c} for c in v['cases']]
                receipts.append({'artifact':name,'entry':info.filename,'bytes':len(raw),'sha256':sha(raw),'receipt':brief})
logs=gh('api','repos/johny751/MyTodo/actions/runs/'+run+'/logs');save('official-job-logs.zip',logs)
summary={'runId':run,'attempt':str(r['run_attempt']),'sourceSha':expected_sha,'conclusion':r['conclusion'],'url':r['html_url'],'jobs':[{k:j[k] for k in ('id','name','conclusion','html_url')} for j in json.loads(jobs)['jobs']],'archives':archives,'officialLogs':{'bytes':len(logs),'sha256':sha(logs)},'receipts':receipts,'scope':'Original artifact ZIPs/API JSON/logs; GitHub file evidence only, no project execution'}
save('evidence-summary.json',(json.dumps(summary,ensure_ascii=False,indent=2)+'\n').encode())
brief={k:v for k,v in summary.items() if k!='receipts'};brief['receipts']=[{**{k:v for k,v in e.items() if k!='receipt'},'receipt':{k:v for k,v in e['receipt'].items() if k!='cases'}} for e in receipts]
pathlib.Path('/workspaces/d2-run-'+run+'-summary.json').write_text(json.dumps(brief,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
failures=[]
for e in receipts:
    cases=e['receipt'].get('cases',[])
    for c in cases:
        if c.get('status')=='failed' or c.get('passed') is False:failures.append({'artifact':e['artifact'],**c})
failure={'runId':run,'sourceSha':expected_sha,'conclusion':r['conclusion'],'jobs':summary['jobs'],'failures':failures,'firstErrors':[{e['artifact']:e['receipt'].get('primaryError',e['receipt'].get('firstError'))} for e in receipts if e['receipt'].get('primaryError') or e['receipt'].get('firstError')]}
pathlib.Path('/workspaces/d2-run-'+run+'-failures.json').write_text(json.dumps(failure,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'runId':run,'sourceSha':expected_sha,'conclusion':r['conclusion'],'archives':len(archives),'receipts':len(receipts),'failures':len(failures)}))
