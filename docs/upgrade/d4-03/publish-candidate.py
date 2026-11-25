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
c0path='.github/workflows/c0-04-protocol.yml'
c0original=subprocess.check_output(['git','show','HEAD:'+c0path],cwd=root)
assert c0original==subprocess.check_output(['git','show','d4c5af4cbbb9192c19276dd371bd142c2b835534:'+c0path],cwd=root), 'Frozen C0 workflow changed'
c0text=c0original.decode('utf-8')
oldbranches="      - master\n      - 'c0-04/**'"
assert oldbranches in c0text
c0candidate=c0text.replace('name: MyTodo C0-04 three-platform production protocol matrix','name: MyTodo D4-03 frozen C0-04 isolated regression',1).replace(oldbranches,'      - d4/mobile-integrated-candidate-1',1).replace("      - '.github/workflows/c0-04-protocol.yml'","      - '.github/workflows/d4-03-c0-regression.yml'",1)
assert c0candidate.split('permissions:',1)[1]==c0text.split('permissions:',1)[1], 'C0 jobs, permissions, environments and assertions must remain exact'
c0new='.github/workflows/d4-03-c0-regression.yml'
(root/c0new).write_text(c0candidate,encoding='utf-8');files.append(c0new)
c0receipt='docs/upgrade/d4-03/c0-workflow-preservation.json'
(root/c0receipt).write_text(json.dumps({'baseline':'d4c5af4cbbb9192c19276dd371bd142c2b835534','original':c0path,'originalSha256':hashlib.sha256(c0original).hexdigest(),'candidate':c0new,'candidateSha256':hashlib.sha256(c0candidate.encode()).hexdigest(),'changed':'workflow name, isolated branch and self-trigger path only','jobsAndPermissionsExact':True,'runtimeStatus':'UNVERIFIED pending GitHub Actions'},indent=2)+'\n',encoding='utf-8');files.append(c0receipt)
subprocess.run(['git','add','--',*files],cwd=root,check=True)
subprocess.run(['git','commit','-m','D4-03 restore mobile personal features and isolated integrations'],cwd=root,check=True)
subprocess.run(['git','push','origin','HEAD'],cwd=root,check=True)
print(json.dumps({'branch':git('branch','--show-current'),'sourceSHA':git('rev-parse','HEAD'),'files':len(files),'archiveSHA256':expected}))
