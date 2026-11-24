"""Source byte/Git publication only. Does not import or execute project tools."""
import hashlib,json,pathlib,subprocess,zipfile

root=pathlib.Path('/tmp/d1-closeout-ready').resolve(strict=True)
assert root==pathlib.Path.cwd().resolve() and (root/'.git').is_file()
folder=root/'docs/upgrade/d1-01'
manifest=json.loads((folder/'d1-source-transfer-manifest.json').read_bytes())
bundle=folder/'d1-closeout-input-v4.zip'
assert hashlib.sha256(bundle.read_bytes()).hexdigest()==manifest['zipSha256']
expected={v['path']:v for v in manifest['files']}
assert len(expected)==len(manifest['files'])
with zipfile.ZipFile(bundle) as archive:
    assert len(archive.infolist())==len(expected) and {i.filename for i in archive.infolist()}==set(expected)
    for info in archive.infolist():
        name=info.filename
        assert name.startswith('docs/upgrade/d1-01/') or name.startswith('tests/d1-01/') or name=='.github/workflows/d1-01-contract-validation.yml'
        assert '..' not in pathlib.PurePosixPath(name).parts and not name.startswith('/')
        assert (info.external_attr>>16)&0o170000 != 0o120000
        target=(root/name).resolve()
        assert target.is_relative_to(root) and not target.is_symlink()
        data=archive.read(info);entry=expected[name]
        assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
transfers=['docs/upgrade/d1-01/d1-closeout-input-v4.zip','docs/upgrade/d1-01/d1-source-transfer-manifest.json','docs/upgrade/d1-01/d1-transfer-publisher.py']
parent=git('rev-parse','HEAD')
assert git('merge-base',manifest['base'],'HEAD')==manifest['base']
subprocess.check_call(['git','add','--','docs/upgrade/d1-01','tests/d1-01','.github/workflows/d1-01-contract-validation.yml'])
subprocess.check_call(['git','rm','--',*transfers])
assert set(git('diff','--cached','--name-only').splitlines())==set(expected)|set(transfers)
subprocess.check_call(['git','diff','--cached','--check'])
subprocess.check_call(['git','commit','-m','docs and test: close D1-01 candidate in isolation'])
head=git('rev-parse','HEAD')
assert git('rev-parse','HEAD^')==parent
subprocess.check_call(['git','push','origin','HEAD:refs/heads/d1-01/closeout-candidate-1'])
assert git('ls-remote','--exit-code','origin','refs/heads/d1-01/closeout-candidate-1').split()[0]==head
assert not git('status','--porcelain=v1','--untracked-files=all')
for entry in manifest['files']:
    data=subprocess.check_output(['git','show',head+':'+entry['path']])
    assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
changes=git('diff','--name-only',manifest['base'],head).splitlines()
assert set(changes)==set(expected)
result={'commit':head,'parent':parent,'base':manifest['base'],'files':len(expected),'hashesVerified':len(expected),'worktreeClean':True,'productionChanges':0}
pathlib.Path('/tmp/d1-ready-publication.json').write_text(json.dumps(result,indent=2)+'\n')
