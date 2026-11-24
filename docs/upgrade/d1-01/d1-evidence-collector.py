"""Codespaces-only GitHub receipt/ZIP preservation. File operations only; no SQLite or project execution."""
import hashlib,json,os,pathlib,subprocess,sys,zipfile

assert os.environ.get('CODESPACES')=='true', 'Codespaces file-publication scope only'
repo=pathlib.Path('/tmp/d1-closeout-ready').resolve(strict=True)
assert pathlib.Path.cwd().resolve()==repo and (repo/'.git').is_file()
run,expected_sha=sys.argv[1:]
assert run.isdigit() and len(expected_sha)==40 and all(c in '0123456789abcdef' for c in expected_sha)
root=repo/'docs/upgrade/d1-01/evidence'/('run-'+run)
root.mkdir(parents=True,exist_ok=True)
def gh(*args):return subprocess.check_output(['gh',*args])
def sha(data):return hashlib.sha256(data).hexdigest()
def save(name,data):
    target=root/name
    if target.exists():assert target.read_bytes()==data, 'immutable evidence collision'
    else:target.write_bytes(data)
metadata=gh('api','repos/johny751/MyTodo/actions/runs/'+run)
r=json.loads(metadata);assert r['head_sha']==expected_sha and r['status']=='completed'
save('run.json',metadata)
jobs=gh('api','repos/johny751/MyTodo/actions/runs/'+run+'/jobs?per_page=100');save('jobs.json',jobs)
artifacts=gh('api','repos/johny751/MyTodo/actions/runs/'+run+'/artifacts?per_page=100')
save('artifacts.json',artifacts);a=json.loads(artifacts)
assert a['total_count']==len(a['artifacts'])==4
receipts=[];archives=[]
for item in a['artifacts']:
    name=item['name'];assert name.startswith('d1-') and name.endswith('-'+run+'-'+str(r['run_attempt'])) and '/' not in name
    assert not item['expired']
    data=gh('api','repos/johny751/MyTodo/actions/artifacts/'+str(item['id'])+'/zip')
    digest=sha(data);assert item['digest']=='sha256:'+digest
    save(name+'.zip',data)
    archives.append({'name':name+'.zip','artifactId':item['id'],'bytes':len(data),'sha256':digest,'officialDigest':item['digest']})
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos=archive.infolist();assert len(infos)<10000 and sum(i.file_size for i in infos)<500*1024*1024
        names=[i.filename for i in infos];assert len(names)==len(set(names))
        for info in infos:
            p=pathlib.PurePosixPath(info.filename)
            assert not p.is_absolute() and '..' not in p.parts and (info.external_attr>>16)&0o170000!=0o120000
            assert info.file_size<100*1024*1024
            if p.name in {'job-receipt.json','comparison-report.json','case-report-windows.json','case-report-node.json','case-report-android.json','android-runner-receipt.json','android-generator-receipt.json','native-generator-receipt.json','node-generator-receipt.json','android-build-receipt.json'}:
                raw=archive.read(info);value=json.loads(raw)
                save(name+'--'+info.filename.replace('/','__'),raw)
                brief={k:value[k] for k in ['schema','status','sourceSha','runId','runAttempt','namedCases','passed','failed','actualFramework','actualProductionEntryLoaded','exitCode','firstError','sqliteVersion','fixtureSha256','sidecarProbeUnitTests'] if k in value}
                if 'cases' in value:brief['cases']=[{k:c[k] for k in ['id','name','status','error'] if k in c} for c in value['cases']]
                receipts.append({'artifact':name,'entry':info.filename,'bytes':len(raw),'sha256':sha(raw),'receipt':brief})
summary={'runId':run,'attempt':r['run_attempt'],'sourceSha':expected_sha,'conclusion':r['conclusion'],'url':r['html_url'],'jobs':[{k:j[k] for k in ['id','name','conclusion','html_url']} for j in json.loads(jobs)['jobs']],'archives':archives,'receipts':receipts,'scope':'original GitHub artifact ZIPs and JSON receipts; file handling only; no project tests or SQLite executed in Codespaces'}
save('evidence-summary.json',(json.dumps(summary,ensure_ascii=False,indent=2)+'\n').encode())
brief={k:summary[k] for k in ['runId','attempt','sourceSha','conclusion','url','jobs','archives']}
brief['receipts']=[{**{k:v for k,v in entry.items() if k!='receipt'},'receipt':{k:v for k,v in entry['receipt'].items() if k!='cases'}} for entry in receipts]
pathlib.Path('/tmp/d1-run-'+run+'-summary.json').write_text(json.dumps(brief,ensure_ascii=False,indent=2)+'\n')
