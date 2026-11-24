# GitHub metadata/archive file processing only. No project tests or SQLite opens.
import hashlib,json,pathlib,re,subprocess,sys,zipfile,io
repository='johny751/MyTodo'
root=pathlib.Path(sys.argv[1]).resolve();kind=sys.argv[2];runs=json.loads(sys.argv[3])
if kind not in ('d4','d4-font','a'):raise RuntimeError('Unknown evidence domain')
is_ui=kind.startswith('d4')
directory=root/('docs/upgrade/d4-01/evidence-font' if kind=='d4-font' else 'docs/upgrade/d4-01/evidence' if is_ui else 'docs/a-admission/evidence')
directory.mkdir(parents=True,exist_ok=False)
def api(endpoint,binary=False):
    data=subprocess.check_output(['gh','api','repos/'+repository+'/'+endpoint])
    return data if binary else json.loads(data)
def write(name,data):
    file=directory/name;file.parent.mkdir(parents=True,exist_ok=True)
    if file.exists():raise RuntimeError('Evidence overwrite refused: '+name)
    file.write_bytes(data if isinstance(data,bytes) else (json.dumps(data,indent=2)+'\n').encode())
    return {'path':str(file.relative_to(root)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
manifest=[];summary=[]
for run in runs:
    runid=str(run['id']);meta=api('actions/runs/'+runid)
    if meta['head_sha']!=run['sha'] or meta['head_branch']!=('d4/ui-candidate-1' if is_ui else 'a/admission-candidate-1') or meta['status']!='completed':raise RuntimeError('Run/source/branch/completion mismatch')
    attempt=meta['run_attempt'];prefix='run-'+runid+'-attempt-'+str(attempt)
    manifest.append(write(prefix+'/run.json',meta))
    jobs=api('actions/runs/'+runid+'/attempts/'+str(attempt)+'/jobs?per_page=100');manifest.append(write(prefix+'/jobs.json',jobs))
    logs=api('actions/runs/'+runid+'/attempts/'+str(attempt)+'/logs',True);manifest.append(write(prefix+'/official-logs.zip',logs))
    artifacts=api('actions/runs/'+runid+'/artifacts?per_page=100');manifest.append(write(prefix+'/artifacts.json',artifacts))
    for artifact in artifacts['artifacts']:
        if artifact.get('expired'):raise RuntimeError('Expired artifact '+artifact['name'])
        name=str(artifact['id'])+'-'+re.sub('[^A-Za-z0-9_.-]','_',artifact['name'])
        raw=api('actions/artifacts/'+str(artifact['id'])+'/zip',True)
        digest='sha256:'+hashlib.sha256(raw).hexdigest()
        if artifact.get('digest')!=digest:raise RuntimeError('Official artifact digest mismatch: '+name)
        manifest.append(write(prefix+'/'+name+'.zip',raw))
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(x.file_size for x in z.infolist())>100_000_000:raise RuntimeError('Artifact expansion limit')
            for item in z.infolist():
                p=pathlib.PurePosixPath(item.filename)
                if p.is_absolute() or '..' in p.parts or '\\' in item.filename or (item.external_attr>>16)&0o170000==0o120000:raise RuntimeError('Unsafe artifact member')
                if item.is_dir():continue
                manifest.append(write(prefix+'/extracted/'+name+'/'+str(p),z.read(item)))
    summary.append({'runId':runid,'attempt':attempt,'sourceSHA':meta['head_sha'],'conclusion':meta['conclusion'],'url':meta['html_url'],'artifacts':artifacts['total_count'],'jobs':[{'name':j['name'],'conclusion':j['conclusion']} for j in jobs['jobs']]})
write('sha256-manifest.json',{'kind':kind,'files':manifest,'runs':summary})
write('run-summary.json',summary)
archive=root/('docs/upgrade/d4-01/d4-font-receipt-export.zip' if kind=='d4-font' else 'docs/upgrade/d4-01/d4-receipt-export.zip' if is_ui else 'docs/a-admission/a-receipt-export.zip')
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED) as z:
    for file in sorted(directory.rglob('*')):
        if file.is_file():z.write(file,str(file.relative_to(directory)))
print(json.dumps({'status':'collected','kind':kind,'files':len(manifest),'export':str(archive.relative_to(root)),'exportSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),'exportBytes':archive.stat().st_size,'runs':summary},indent=2))
