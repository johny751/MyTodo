# File/hash/Git publisher only. Never executes application/build/test/SQLite code.
import hashlib,json,pathlib,re,subprocess,sys,zipfile
root=pathlib.Path(sys.argv[1]).resolve()
manifest_path=pathlib.Path(sys.argv[2]).resolve()
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
def git(*args):
    return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
branch=manifest['branch'];base=manifest['base']
if git('branch','--show-current')!=branch: raise RuntimeError('Wrong candidate branch')
if git('status','--porcelain'): raise RuntimeError('Preserve existing changes; publisher requires clean worktree')
git('merge-base','--is-ancestor',base,'HEAD')
archive=manifest_path.parent/manifest['archive']
if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['sha256']: raise RuntimeError('Source archive SHA mismatch')
pattern=re.compile(manifest['allowed'])
expected={x['path']:x for x in manifest['files']}
validated=[]
with zipfile.ZipFile(archive) as z:
    if len(z.infolist())!=len(expected) or len({x.filename for x in z.infolist()})!=len(expected): raise RuntimeError('Duplicate/count archive failure')
    for item in z.infolist():
        name=item.filename
        if name not in expected or not pattern.fullmatch(name) or '\\' in name or '..' in pathlib.PurePosixPath(name).parts or name.startswith('/'): raise RuntimeError('Unauthorized file '+name)
        if item.file_size>2_000_000 and not (name=='prototypes/d4-01/fonts/NotoSansSC-VF.ttf' and item.file_size==17_773_244 and expected[name]['sha256']=='763146584cf0710223441356b4395e279021b0806c196614377a7a0174ae074a'): raise RuntimeError('Oversized source')
        data=z.read(item)
        if hashlib.sha256(data).hexdigest()!=expected[name]['sha256'] or len(data)!=expected[name]['bytes']: raise RuntimeError('Source bytes mismatch '+name)
        target=root/name
        if target.is_symlink() or any(p.is_symlink() for p in target.parents if p!=root and root in p.parents): raise RuntimeError('Linked target')
        validated.append((target,data))
for target,data in validated:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
git('diff','--check')
changed=git('status','--porcelain').splitlines()
git('add','--',*sorted(expected))
staged=git('diff','--cached','--name-only').splitlines()
if any(name not in expected for name in staged): raise RuntimeError('Unexpected staging')
git('commit','-m',manifest['message'])
head=git('rev-parse','HEAD')
git('push','origin',branch)
result={'status':'published','branch':branch,'base':base,'sourceSHA':head,'sourceArchiveSHA256':manifest['sha256'],'sourceFiles':len(expected),'staged':staged,'productionDiff':git('diff','--name-only',base+'...HEAD','--','src','windows','android'),'workingTree':git('status','--porcelain')}
print(json.dumps(result,indent=2))
