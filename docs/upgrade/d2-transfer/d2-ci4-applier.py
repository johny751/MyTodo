"""Codespaces Git and sealed file application only; no project code/SQLite/test execution."""
import hashlib,json,os,pathlib,subprocess,zipfile
assert os.environ.get('CODESPACES')=='true'
root=pathlib.Path('/workspaces/mytodo-d2-candidate-v2').resolve(strict=True);assert pathlib.Path.cwd().resolve()==root
folder=root/'docs/upgrade/d2-transfer';manifest=json.loads((folder/'d2-ci4-manifest.json').read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(pathlib.Path(__file__).read_bytes())==manifest['applierSha256']
def git(*a):return subprocess.check_output(['git',*a],cwd=root,text=True).strip()
def run(*a):subprocess.check_call(['git',*a],cwd=root)
assert git('branch','--show-current')=='d2/implementation-candidate-1'
assert not git('diff','--name-only') and not git('diff','--cached','--name-only')
assert all(p.startswith('docs/upgrade/d2/evidence/') for p in git('ls-files','--others','--exclude-standard').splitlines())
assert git('merge-base',manifest['sourceSha'],'HEAD')==manifest['sourceSha']
assert all(p.startswith('docs/upgrade/d2-transfer/') for p in git('diff','--name-only',manifest['sourceSha'],'HEAD').splitlines())
base='d4c5af4cbbb9192c19276dd371bd142c2b835534';assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
expected={e['path']:e for e in manifest['files']};assert len(expected)==len(manifest['files'])
approved_production=set(manifest['approvedProductionPaths'])
assert all(n in approved_production or n.startswith('tests/d2/') or n.startswith('docs/upgrade/d2/') or n=='.github/workflows/d2-migration-validation.yml' for n in expected)
archive=folder/'d2-ci4-patch.zip';assert sha(archive.read_bytes())==manifest['zipSha256']
with zipfile.ZipFile(archive) as z:
 assert {i.filename for i in z.infolist()}==set(expected) and len(z.infolist())==len(expected)
 prepared={}
 for i in z.infolist():
  assert not pathlib.PurePosixPath(i.filename).is_absolute() and '..' not in pathlib.PurePosixPath(i.filename).parts and (i.external_attr>>16)&0o170000!=0o120000
  data=z.read(i);e=expected[i.filename];assert len(data)==e['bytes'] and sha(data)==e['sha256'] and b'\r\n' not in data
  target=root/i.filename;assert target.resolve().is_relative_to(root)
  for p in (target,*target.parents):
   assert not p.is_symlink()
   if p==root:break
  prepared[i.filename]=data
for name,data in prepared.items():(root/name).write_bytes(data)
run('diff','--check');run('add','--',*expected.keys());run('diff','--cached','--check')
assert set(git('diff','--cached','--name-only').splitlines())==set(expected)
run('commit','-m','D2: unify portable v2 fingerprints and complete real native storage closure')
head=git('rev-parse','HEAD')
for name,data in prepared.items():assert subprocess.check_output(['git','show',head+':'+name],cwd=root)==data
run('push','origin','HEAD:refs/heads/d2/implementation-candidate-1')
assert git('ls-remote','--exit-code','origin','refs/heads/d2/implementation-candidate-1').split()[0]==head
assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
receipt={'sourceSha':head,'previousCandidateSource':manifest['sourceSha'],'base':base,'productionChangesSinceCI3':git('diff','--name-only',manifest['sourceSha'],head,'--','src','windows','android','scripts').splitlines(),'files':manifest['files'],'masterUnchanged':True}
assert set(receipt['productionChangesSinceCI3']).issubset(approved_production)
pathlib.Path('/workspaces/d2-ci4-publication.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in receipt.items() if k!='files'}))
