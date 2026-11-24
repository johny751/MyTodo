"""Codespaces-only validated byte publication. Does not import or execute project tests/SQLite."""
import hashlib,json,os,pathlib,subprocess,zipfile,sys,re
assert os.environ.get('CODESPACES')=='true'
root=pathlib.Path('/tmp/d1-closeout-ready-v2').resolve(strict=True)
assert pathlib.Path.cwd().resolve()==root and (root/'.git').is_file()
base='1a55ea6da9f2012d7ba82d5756ae8f61d87bae47'
validated=sys.argv[1];assert len(validated)==40 and all(c in '0123456789abcdef' for c in validated)
folder=root/'docs/upgrade/d1-01'
def safe_target(path):
    path=pathlib.Path(path)
    assert path.is_relative_to(folder) and path.resolve().is_relative_to(folder.resolve())
    for ancestor in (path,*path.parents):
        assert not ancestor.is_symlink(), 'publication path contains a symlink'
        if ancestor==root:break
    return path
assert folder.resolve()==folder and not folder.is_symlink()
safe_target(folder/'d1-final-transfer.json');safe_target(folder/'d1-final-docs.zip')
manifest=json.loads((folder/'d1-final-transfer.json').read_bytes())
bundle=folder/'d1-final-docs.zip'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert manifest['validatedSource']==validated and manifest['base']==base
assert sha(pathlib.Path(__file__).read_bytes())==manifest['publisherSha256']
assert sha(bundle.read_bytes())==manifest['zipSha256']
expected={e['path']:e for e in manifest['files']};assert len(expected)==len(manifest['files'])
def git(*args,cwd=root):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
def run(*args,cwd=root):subprocess.check_call(['git',*args],cwd=cwd)
assert git('remote','get-url','--push','origin') in {'https://github.com/johny751/MyTodo','https://github.com/johny751/MyTodo.git','git@github.com:johny751/MyTodo.git'}
assert not git('diff','--name-only') and not git('diff','--cached','--name-only'), 'unreviewed tracked/index changes before extraction'
initial_untracked=set(git('ls-files','--others','--exclude-standard').splitlines())
assert not git('diff',validated,'HEAD','--','tests/d1-01','.github/workflows/d1-01-contract-validation.yml'), 'unvalidated tool tree'
assert all(n.startswith('docs/upgrade/d1-01/') or n.startswith('tests/d1-01/') or n=='.github/workflows/d1-01-contract-validation.yml' for n in git('diff','--name-only',base,'HEAD').splitlines())
assert git('rev-parse','origin/master')==base
assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
assert git('merge-base',base,'HEAD')==base
for name in git('ls-tree','-r','--name-only',validated,'tests/d1-01','.github/workflows/d1-01-contract-validation.yml').splitlines():
    data=subprocess.check_output(['git','show',validated+':'+name],cwd=root)
    assert (root/name).read_bytes()==data, 'validated source drift: '+name
transfer_bytes={}
with zipfile.ZipFile(bundle) as z:
    assert len(z.infolist())==len(expected) and {i.filename for i in z.infolist()}==set(expected)
    for i in z.infolist():
        name=i.filename;assert name.startswith('docs/upgrade/d1-01/') and '..' not in pathlib.PurePosixPath(name).parts
        assert (i.external_attr>>16)&0o170000!=0o120000
        data=z.read(i);e=expected[name];assert len(data)==e['bytes'] and sha(data)==e['sha256']
        safe_target(root/name);transfer_bytes[name]=data
evidence=folder/'evidence'
runs=sorted(evidence.glob('run-*/evidence-summary.json'))
assert len(runs)==len(manifest['runs']) and {p.parent.name for p in runs}=={'run-'+r for r in manifest['runs']}
run_summaries=[]
evidence_allowed=set()
for p in runs:
    safe_target(p)
    r=json.loads(p.read_bytes());run_summaries.append(r)
    for name in ('run.json','jobs.json','artifacts.json','evidence-summary.json'):
        target=safe_target(p.parent/name);assert target.is_file();evidence_allowed.add(str(target.relative_to(root)))
    for a in r['archives']:
        target=safe_target(p.parent/a['name']);data=target.read_bytes();assert len(data)==a['bytes'] and sha(data)==a['sha256'] and a['officialDigest']=='sha256:'+a['sha256']
        evidence_allowed.add(str(target.relative_to(root)))
    for entry in r['receipts']:
        name=entry['artifact']+'--'+entry['entry'].replace('/','__')
        target=safe_target(p.parent/name);data=target.read_bytes();assert len(data)==entry['bytes'] and sha(data)==entry['sha256']
        evidence_allowed.add(str(target.relative_to(root)))
assert {str(p.relative_to(root)) for p in evidence.rglob('*') if p.is_file()}==evidence_allowed
assert initial_untracked<=evidence_allowed, 'unexpected untracked publication files before extraction'
assert any(r['sourceSha']==validated and r['conclusion']=='success' for r in run_summaries)
final_run=next(r for r in run_summaries if r['sourceSha']==validated and r['conclusion']=='success')
assert all(j['conclusion']=='success' for j in final_run['jobs'])
audit={'sourceSha':validated,'runId':final_run['runId'],'runAttempt':str(final_run['attempt']),
       'scope':'file-only independent ZIP/JSON/hash audit; no SQLite or project execution',
       'profiles':{},'payloads':[],'comparison':{},'negativeInputQualification':'Nested S51 forged/cloned receipt files are test inputs; only exact primary profile paths are producers.'}
case_ids=[]
for artifact in final_run['archives']:
    with zipfile.ZipFile(evidence/('run-'+final_run['runId'])/artifact['name']) as z:
        names=set(z.namelist())
        for name in sorted(names):
            if name=='payload-sha256.json' or name in {p+'/payload-sha256.json' for p in ('windows','node','android')}:
                payload=json.loads(z.read(name));prefix=name[:-len('payload-sha256.json')]
                checked=excluded=0
                for item in payload:
                    if item.get('type')=='rejected-test-symlink':
                        assert item['path'] in {'S36-linked-source.sqlite','windows/S36-linked-source.sqlite','node/S36-linked-source.sqlite','android/S36-linked-source.sqlite'};excluded+=1;continue
                    if artifact['name'].startswith('d1-emulator-'):
                        assert set(item)=={'file','bytes','sha256'};entry_path=item['file']
                    else:entry_path=item['path']
                    assert not pathlib.PurePosixPath(entry_path).is_absolute() and '..' not in pathlib.PurePosixPath(entry_path).parts
                    raw=z.read(prefix+entry_path)
                    assert len(raw)==item['bytes'] and sha(raw)==item['sha256'];checked+=1
                audit['payloads'].append({'artifact':artifact['name'],'manifest':name,'filesVerified':checked,'declaredRejectedSymlinks':excluded})
        for profile in ('windows','node','android'):
            name=profile+'/case-report-'+profile+'.json'
            if name not in names:continue
            value=json.loads(z.read(name))
            for key,expected_value in [('sourceSha',validated),('runId',final_run['runId']),('runAttempt',str(final_run['attempt'])),('status','passed')]:assert value[key]==expected_value
            ids=[c['id'] for c in value['cases']]
            assert len(ids)==len(set(ids))==value['namedCases']==value['passed']==97 and value['failed']==0
            assert all(c['status']=='passed' for c in value['cases'])
            case_ids.append(set(ids));audit['profiles'][profile]={'namedCases':97,'passed':97,'failed':0,'caseIds':ids,'receiptSha256':sha(z.read(name))}
        if 'comparison-report.json' in names:
            value=json.loads(z.read('comparison-report.json'))
            for key,expected_value in [('sourceSha',validated),('runId',final_run['runId']),('runAttempt',str(final_run['attempt'])),('status','passed')]:assert value[key]==expected_value
            ids=[c['id'] for c in value['cases']]
            assert len(ids)==len(set(ids))==value['passed']==14 and value['failed']==0 and all(c['status']=='passed' for c in value['cases'])
            assert set(ids)=={'C-windows','C-node','C-android','F01','F02'}|{'X-'+a+'-'+b for a in ('windows','node','android') for b in ('windows','node','android')}
            audit['comparison']={'passed':14,'failed':0,'caseIds':ids,'receiptSha256':sha(z.read('comparison-report.json'))}
        if 'android/android-runner-receipt.json' in names:
            value=json.loads(z.read('android/android-runner-receipt.json'));assert value['status']=='passed' and value['exitCode']==0 and value['actualFramework'] is True and value['actualProductionEntryLoaded'] is False
            unit=next(c for c in value['commands'] if c['label']=='sidecar-probe-unit-tests')
            raw=z.read('android/android-run-logs/'+unit['stdoutFile']);err=z.read('android/android-run-logs/'+unit['stderrFile'])
            assert unit['exitCode']==0 and len(err)==0 and sha(raw)==unit['stdoutSha256'] and sha(err)==unit['stderrSha256']
            for key,number in [('tests',16),('pass',16),('fail',0),('cancelled',0),('skipped',0)]:assert re.search(r'^# '+key+' '+str(number)+r'$',raw.decode(),re.M)
            probes=value['sidecarProbes'];assert len(probes)==9 and len({p['fileName'] for p in probes})==9 and all(p['allowed'] is True for p in probes)
            audit['androidCapture']={'status':'passed','framework':True,'productionEntryLoaded':False,'sidecarProbes':9,'unitTests':16,'unitPassed':16,'unitFailed':0,'unitStdoutSha256':sha(raw)}
assert len(case_ids)==3 and all(ids==case_ids[0] for ids in case_ids)
assert set(audit['profiles'])=={'windows','node','android'} and len(audit['payloads'])==7
assert not git('diff','--name-only') and not git('diff','--cached','--name-only')
assert set(git('ls-files','--others','--exclude-standard').splitlines())==initial_untracked
for name,data in transfer_bytes.items():
    target=safe_target(root/name);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
(folder/'cloud-evidence-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
pathlib.Path('/tmp/d1-final-audit-brief.json').write_text(json.dumps({k:v for k,v in audit.items() if k!='profiles'}|{'profiles':{k:{a:b for a,b in v.items() if a!='caseIds'} for k,v in audit['profiles'].items()}},ensure_ascii=False,indent=2)+'\n')
transfers=['d1-evidence-collector.py','d1-final-docs.zip','d1-final-transfer.json','d1-final-publisher.py']
run('add','--','docs/upgrade/d1-01')
run('rm','--',*[str(pathlib.PurePosixPath('docs/upgrade/d1-01')/n) for n in transfers])
allowed_staged=set(expected)|evidence_allowed|{'docs/upgrade/d1-01/cloud-evidence-audit.json'}|{str(pathlib.PurePosixPath('docs/upgrade/d1-01')/n) for n in transfers}
assert set(git('diff','--cached','--name-only').splitlines())<=allowed_staged
assert not git('diff','--cached',validated,'--','tests/d1-01','.github/workflows/d1-01-contract-validation.yml')
run('diff','--cached','--check')
run('commit','-m','docs: seal D1-01 candidate and all cloud evidence [skip ci]')
candidate=git('rev-parse','HEAD')
run('push','origin','HEAD:refs/heads/d1-01/closeout-candidate-1')
assert git('ls-remote','--exit-code','origin','refs/heads/d1-01/closeout-candidate-1').split()[0]==candidate
assert not git('status','--porcelain=v1','--untracked-files=all')
publish=pathlib.Path('/tmp/d1-closeout-final-master');assert not publish.exists()
run('worktree','add','--detach',str(publish),base)
run('restore','--source='+candidate,'--','docs/upgrade/d1-01','tests/d1-01','.github/workflows/d1-01-contract-validation.yml',cwd=publish)
run('add','--','docs/upgrade/d1-01','tests/d1-01','.github/workflows/d1-01-contract-validation.yml',cwd=publish)
changed=git('diff','--cached','--name-only',cwd=publish).splitlines()
assert all(n.startswith('docs/upgrade/d1-01/') or n.startswith('tests/d1-01/') or n=='.github/workflows/d1-01-contract-validation.yml' for n in changed)
run('diff','--cached','--check',cwd=publish)
run('commit','-m','docs and test: complete D1-01 candidate closeout [skip ci]',cwd=publish)
head=git('rev-parse','HEAD',cwd=publish);tree=git('rev-parse','HEAD^{tree}',cwd=publish)
assert git('rev-parse','HEAD^',cwd=publish)==base
assert not git('diff',candidate,head,'--','docs/upgrade/d1-01','tests/d1-01','.github/workflows/d1-01-contract-validation.yml',cwd=publish)
assert not git('diff',validated,head,'--','tests/d1-01','.github/workflows/d1-01-contract-validation.yml',cwd=publish)
entries=[]
for n in changed:
    data=subprocess.check_output(['git','show',head+':'+n],cwd=publish);entries.append({'path':n,'bytes':len(data),'sha256':sha(data)})
    assert data==(publish/n).read_bytes()
assert git('ls-remote','--exit-code','origin','refs/heads/master',cwd=publish).split()[0]==base
run('push','origin','HEAD:refs/heads/master',cwd=publish)
assert git('ls-remote','--exit-code','origin','refs/heads/master',cwd=publish).split()[0]==head
assert not git('status','--porcelain=v1','--untracked-files=all',cwd=publish)
issue=json.loads(subprocess.check_output(['gh','api','repos/johny751/MyTodo/issues/1'],cwd=publish));assert issue['state']=='open'
comparison_bytes=subprocess.check_output(['gh','api','repos/johny751/MyTodo/compare/'+base+'...'+head],cwd=publish)
comparison=json.loads(comparison_bytes)
assert comparison['status']=='ahead' and comparison['ahead_by']==1 and comparison['behind_by']==0 and comparison['total_commits']==1
assert {f['filename'] for f in comparison['files']}==set(changed)
pathlib.Path('/tmp/d1-final-compare.json').write_bytes(comparison_bytes)
compare_brief={k:comparison[k] for k in ('status','ahead_by','behind_by','total_commits','html_url')}
compare_brief['files']=len(comparison['files'])
receipt={'base':base,'validatedSource':validated,'candidatePublication':candidate,'masterPublication':head,'parent':base,'tree':tree,'remoteMasterVerified':True,'clean':True,'productionChanges':0,'changedFiles':len(changed),'changed':entries,'validatedToolDiff':[],'candidatePublicationDiff':[],'androidIssue1':'open','githubCompare':compare_brief,'compareRawSha256':sha(comparison_bytes),'compareUrl':'https://github.com/johny751/MyTodo/compare/'+base+'...'+head,'scope':'byte/Git/evidence processing only; no project execution or user database access'}
pathlib.Path('/tmp/d1-final-publication.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
brief={k:v for k,v in receipt.items() if k!='changed'}
brief['manifestSha256']=sha(pathlib.Path('/tmp/d1-final-publication.json').read_bytes())
pathlib.Path('/tmp/d1-final-publication-brief.json').write_text(json.dumps(brief,ensure_ascii=False,indent=2)+'\n')
