"""Codespaces Git/file/evidence operations only. No project build, test or DB access."""
import hashlib,json,pathlib,re,shutil,subprocess

root=pathlib.Path('/workspaces/mytodo-d4-03').resolve()
source='899ae75643875e923c480a421b1f0413e622cbc9'
baseline='d4c5af4cbbb9192c19276dd371bd142c2b835534'
branch='d4/mobile-integrated-candidate-1'
repo='johny751/MyTodo'
evidence=root/'docs/upgrade/d4-03/evidence-billing-01'

def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
def api(endpoint):return subprocess.check_output(['gh','api',endpoint],cwd=root,text=True)
def save(name,data):
    target=evidence/name
    if target.exists():return json.loads(target.read_text(encoding='utf-8'))
    target.write_text(data,encoding='utf-8')
    return json.loads(data)

assert git('branch','--show-current')==branch
status=git('status','--porcelain')
assert not status or all(line.startswith('?? docs/upgrade/d4-03/evidence-billing-01/') for line in status.splitlines()),'Preserve unrelated dirty worktree'
assert not (evidence/'publication-receipt.json').exists(),'Never overwrite completed receipt'
guard=['src','windows','android','package.json','server.mjs','tests/protocol-harness','tests/protocol-vectors','.github/workflows/c0-04-protocol.yml']
assert not git('diff','--name-only',baseline,source,'--',*guard),'Production/protocol changed'
assert not git('diff','--name-only',source,'HEAD','--','prototypes','tests','.github','src','windows','android'),'Code changed after frozen candidate source'
allowed=re.compile(r'^(prototypes/(d4-01|d4-03-platforms)/|tests/(d4-ui|d4-03-platforms)/|docs/upgrade/(d4-01|d4-03)/|\.github/workflows/d4-(ui-candidate|03-candidate|03-c0-regression)\.yml$)')
changed=git('diff','--name-only',baseline+'...'+source).splitlines()
assert all(allowed.match(path) for path in changed),'Unauthorized branch changes'
if not evidence.exists():shutil.copytree('/workspaces/d403-evidence-billing-01',evidence)
preserved={'/workspaces/d403-intake.log':'source04-original-whitespace-failure.log',
 '/workspaces/d403-intake-dirty.patch':'source04-preserved-dirty.patch',
 '/workspaces/d403-preserve.txt':'source04-whitespace-repair.txt',
 '/workspaces/d403-preserve-push.txt':'source04-whitespace-repair-push.txt',
 '/workspaces/d403-publish06.txt':'source06-publication.txt'}
for path,name in preserved.items():
    if not (evidence/name).exists():shutil.copyfile(path,evidence/name)
first_failure=pathlib.Path('/workspaces/d403-final-publication-first-failure.txt')
if first_failure.exists():shutil.copyfile(first_failure,evidence/'publication-collector-first-failure.txt')
master=save('master-ref.json',api('repos/'+repo+'/git/ref/heads/master'))
issue=save('android-issue-1.json',api('repos/'+repo+'/issues/1'))
assert issue['state']=='open','Issue #1 must remain open'
compare=save('compare-candidate-source.json',api('repos/'+repo+'/compare/'+baseline+'...'+source))
assert compare['base_commit']['sha']==baseline and compare['commits'][-1]['sha']==source
receipt={'kind':'D4-03 blocked candidate publication','stageStatus':'NOT CLOSED',
 'branch':branch,'baseline':baseline,'d4Baseline':'03a72afca3f538cd0903624c89cb0d8bb068e470',
 'candidateSourceSHA':source,'attemptedSourceSHA':'288b0b97d9974e3797a5099c97d5aeb1c3e26dc9',
 'liveMasterSHA':master['object']['sha'],'productionDiff':0,'changedPaths':changed,
 'compareUrl':compare['html_url'],'compareStatus':compare['status'],
 'aheadBy':compare['ahead_by'],'behindBy':compare['behind_by'],
 'issue1':{'url':issue['html_url'],'state':issue['state'],'title':issue['title']},
 'archive':{'path':'docs/upgrade/d4-03/d403-source-06.zip','bytes':241263,
 'sha256':'5d514f81aa7f2fa57361b1e4d851989cc7bd5ebfe0e26a4cbcaaa2d5e43443c0'},
 'candidateTestsExecuted':0,'candidateTestsPassed':0,'candidateTestFailures':0,
 'newCandidateActionsTriggered':False,'candidateBuildArtifacts':0,
 'guardPaths':guard,'safety':'No real data/database/sync access; no production merge; no D2 merge.',
 'nextStep':'Restore Actions availability and run both workflows at the latest approved candidate SHA.'}
save('publication-receipt.json',json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
files=[]
for file in sorted(evidence.iterdir()):
    if file.is_file() and file.name!='sha256-manifest.json':
        data=file.read_bytes();files.append({'path':file.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(evidence/'sha256-manifest.json').write_text(json.dumps({'files':files},indent=2)+'\n',encoding='utf-8')
subprocess.run(['git','diff','--check'],cwd=root,check=True)
subprocess.run(['git','add','--','docs/upgrade/d4-03/evidence-billing-01'],cwd=root,check=True)
subprocess.run(['git','commit','-m','D4-03 preserve original Actions refusal and candidate review evidence [skip ci]'],cwd=root,check=True)
subprocess.run(['git','push','origin','HEAD'],cwd=root,check=True)
release=git('rev-parse','HEAD')
assert not git('diff','--name-only',source,release,'--','prototypes','tests','.github','src','windows','android')
summary={**receipt,'evidenceReleaseSHA':release,'evidenceFiles':len(files)+1,
 'releaseUrl':'https://github.com/'+repo+'/commit/'+release}
pathlib.Path('/workspaces/d403-final-receipt.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({key:summary[key] for key in ['candidateSourceSHA','evidenceReleaseSHA','productionDiff','liveMasterSHA','compareStatus','aheadBy','behindBy','evidenceFiles','issue1']},ensure_ascii=False))
