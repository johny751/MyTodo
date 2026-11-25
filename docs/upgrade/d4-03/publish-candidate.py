"""Codespaces Git/text intake only. No tests, build, database or application execution."""
import hashlib,json,pathlib,subprocess,sys,zipfile
root=pathlib.Path('/workspaces/mytodo-d4-03').resolve()
archive=pathlib.Path(sys.argv[1]); expected=sys.argv[2]
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
assert git('branch','--show-current')=='d4/mobile-integrated-candidate-1'
assert not git('status','--porcelain'), 'Preserve dirty tree; no automatic reset'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
allowed=('prototypes/d4-01/','prototypes/d4-03-platforms/','tests/d4-ui/','tests/d4-03-platforms/','docs/upgrade/d4-03/')
files=[]
with zipfile.ZipFile(archive) as z:
 for entry in z.infolist():
  name=entry.filename
  assert name.startswith(allowed) or name=='.github/workflows/d4-03-candidate.yml',name
  target=(root/name).resolve();assert root in target.parents and entry.file_size<32*1024*1024
  data=z.read(entry);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);files.append(name)
subprocess.run(['git','diff','--check'],cwd=root,check=True)
subprocess.run(['git','add','--',*files],cwd=root,check=True)
subprocess.run(['git','commit','-m','D4-03 restore mobile personal features and isolated integrations'],cwd=root,check=True)
subprocess.run(['git','push','origin','HEAD'],cwd=root,check=True)
print(json.dumps({'branch':git('branch','--show-current'),'sourceSHA':git('rev-parse','HEAD'),'files':len(files),'archiveSHA256':expected}))
