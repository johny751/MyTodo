"""Codespaces file/archive/Git evidence operations only; never runs project code."""
import hashlib,json,pathlib,shutil,subprocess,zipfile

root=pathlib.Path('/workspaces/mytodo-d4-03').resolve()
docs=root/'docs/upgrade/d4-03'
source='899ae75643875e923c480a421b1f0413e622cbc9'
evidence_release='af9abcb0b1978f3d0e4868a46606f5f1832c30de'
branch='d4/mobile-integrated-candidate-1'
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
assert git('branch','--show-current')==branch
assert not git('status','--porcelain'),'Preserve dirty worktree'
assert not git('diff','--name-only',source,'HEAD','--','prototypes','tests','.github','src','windows','android')
receipt=json.loads(pathlib.Path('/workspaces/d403-final-receipt.json').read_text())
assert receipt['evidenceReleaseSHA']==evidence_release
assert receipt['candidateSourceSHA']==source and receipt['productionDiff']==0
archive=docs/'d403-evidence-final.zip'
assert not archive.exists(),'Never replace frozen evidence archive'
inputs=[]
for file in sorted((docs/'evidence-billing-01').iterdir()):
    assert file.is_file()
    inputs.append((file,'evidence-billing-01/'+file.name))
inputs.extend([(docs/'c0-workflow-preservation.json','c0-workflow-preservation.json'),
 (root/'.github/workflows/d4-03-c0-regression.yml','d4-03-c0-regression.yml'),
 (pathlib.Path('/workspaces/d403-final-receipt.json'),'source-and-evidence-release-receipt.json'),
 (docs/'PUBLICATION_ADDENDUM.md','PUBLICATION_ADDENDUM.md')])
manifest=[]
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as bundle:
    for file,name in inputs:
        data=file.read_bytes()
        manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        bundle.writestr(name,data)
    bundle.writestr('bundle-sha256-manifest.json',json.dumps({'files':manifest},indent=2)+'\n')
archive_hash=hashlib.sha256(archive.read_bytes()).hexdigest()
subprocess.run(['git','diff','--check'],cwd=root,check=True)
subprocess.run(['git','add','--',str(archive.relative_to(root))],cwd=root,check=True)
subprocess.run(['git','commit','-m','D4-03 archive complete candidate and blocked execution evidence [skip ci]'],cwd=root,check=True)
subprocess.run(['git','push','origin','HEAD'],cwd=root,check=True)
release=git('rev-parse','HEAD')
assert not git('diff','--name-only',source,release,'--','prototypes','tests','.github','src','windows','android')
delivery={'candidateSourceSHA':source,'evidenceReleaseSHA':evidence_release,'deliveryArchiveCommitSHA':release,
 'archivePath':str(archive.relative_to(root)),'archiveBytes':archive.stat().st_size,'archiveSHA256':archive_hash,
 'bundleFiles':len(inputs)+1,'stageStatus':'NOT CLOSED','productionDiff':0,
 'executed':0,'passed':0,'testFailed':0,'buildArtifacts':0,
 'compareUrl':'https://github.com/johny751/MyTodo/compare/d4c5af4cbbb9192c19276dd371bd142c2b835534...'+source}
pathlib.Path('/workspaces/d403-delivery-receipt.json').write_text(json.dumps(delivery,indent=2)+'\n')
print(json.dumps(delivery))
