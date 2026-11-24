"""Codespaces Git/file-only publication. No project import, SQLite, build or test execution."""
import hashlib,json,os,pathlib,subprocess,zipfile,sys
assert os.environ.get('CODESPACES')=='true'
root=pathlib.Path('/workspaces/mytodo-d2-candidate-v2').resolve(strict=True)
assert pathlib.Path.cwd().resolve()==root
base='d4c5af4cbbb9192c19276dd371bd142c2b835534'
branch='d2/implementation-candidate-1'
folder=root/'docs/upgrade/d2-transfer'
sha=lambda b:hashlib.sha256(b).hexdigest()
def command(*args):return subprocess.check_output(args,cwd=root,text=True).strip()
def git(*args):return command('git',*args)
def run(*args):subprocess.check_call(['git',*args],cwd=root)
manifest=json.loads((folder/'d2-transfer-manifest.json').read_bytes())
assert manifest['base']==base and manifest['branch']==branch
assert sha(pathlib.Path(__file__).read_bytes())==manifest['publisherSha256']
bundle=folder/'d2-candidate-input.zip';assert sha(bundle.read_bytes())==manifest['zipSha256']
assert git('branch','--show-current')==branch
assert git('remote','get-url','--push','origin') in {'https://github.com/johny751/MyTodo','https://github.com/johny751/MyTodo.git','git@github.com:johny751/MyTodo.git'}
assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
assert git('merge-base',base,'HEAD')==base
assert not git('status','--porcelain'),'refuse unrelated working/index changes'
before=git('rev-parse','HEAD')
assert git('ls-remote','--exit-code','origin','refs/heads/'+branch).split()[0]==before
for path,expected in manifest['baseline'].items():
    data=subprocess.check_output(['git','show',base+':'+path],cwd=root)
    assert sha(data)==expected,'frozen baseline byte drift '+path
production=set(manifest['allowedProductionPaths'])
def allowed(path):return path in production or path.startswith('tests/d2/') or path.startswith('docs/upgrade/d2/') or path=='.github/workflows/d2-migration-validation.yml'
expected={e['path']:e for e in manifest['files']};assert len(expected)==len(manifest['files']) and all(allowed(n) for n in expected)
prepared={}
with zipfile.ZipFile(bundle) as z:
    assert len(z.infolist())==len(expected) and {i.filename for i in z.infolist()}==set(expected)
    for item in z.infolist():
        name=item.filename;assert not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts
        assert (item.external_attr>>16)&0o170000!=0o120000
        data=z.read(item);e=expected[name];assert len(data)==e['bytes'] and sha(data)==e['sha256']
        assert b'\r\n' not in data,'candidate text must be LF'
        target=root/name
        for p in (target,*target.parents):
            assert not p.is_symlink()
            if p==root:break
        assert target.resolve().is_relative_to(root)
        prepared[name]=data
for name,data in prepared.items():
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
run('diff','--check')
changed=git('diff','--name-only').splitlines()+git('ls-files','--others','--exclude-standard').splitlines()
assert changed and set(changed).issubset(expected)
run('add','--',*expected.keys())
run('diff','--cached','--check')
assert set(git('diff','--cached','--name-only').splitlines())==set(changed)
run('commit','-m','D2: prepare manual production migration adapters and isolated real-API validation')
head=git('rev-parse','HEAD');assert git('rev-parse','HEAD^')==before
for name,data in prepared.items():assert subprocess.check_output(['git','show',head+':'+name],cwd=root)==data
run('push','origin','HEAD:refs/heads/'+branch)
assert git('ls-remote','--exit-code','origin','refs/heads/'+branch).split()[0]==head
assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
comparison=json.loads(command('gh','api','repos/johny751/MyTodo/compare/'+base+'...'+head))
changed_all=git('diff','--name-only',base,head).splitlines()
assert all(allowed(p) or p.startswith('docs/upgrade/d2-transfer/') for p in changed_all)
receipt={'status':'published-candidate-only','base':base,'branch':branch,'head':head,'parent':before,'tree':git('rev-parse','HEAD^{tree}'),'clean':not git('status','--porcelain'),'masterUnchanged':True,'sourceFiles':manifest['files'],'productionChanged':[p for p in changed_all if p in production],'compare':{k:comparison[k] for k in ('status','ahead_by','behind_by','total_commits','html_url')},'compareChangedFiles':len(changed_all),'scope':'Git/files only; no project execution, SQLite or user data','actions':json.loads(command('gh','run','list','--branch',branch,'--limit','10','--json','databaseId,headSha,status,conclusion,url,workflowName'))}
path=pathlib.Path('/workspaces/d2-publication-receipt.json');path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
brief={k:v for k,v in receipt.items() if k!='sourceFiles'};pathlib.Path('/workspaces/d2-publication-summary.json').write_text(json.dumps(brief,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(brief,ensure_ascii=False))
