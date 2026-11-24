"""Codespaces-only Git/file evidence publication. No project code, SQLite, tests or builds."""
import hashlib,io,json,os,pathlib,subprocess,zipfile
assert os.environ.get('CODESPACES')=='true'
root=pathlib.Path('/workspaces/mytodo-d2-candidate-v2').resolve(strict=True);assert pathlib.Path.cwd().resolve()==root
base='d4c5af4cbbb9192c19276dd371bd142c2b835534';tested='d86aecd56a1c0dfa4d66a982703b3c93bdc5e9d7';branch='d2/implementation-candidate-1'
folder=root/'docs/upgrade/d2';transfer=root/'docs/upgrade/d2-transfer'
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*a):return subprocess.check_output(['git',*a],cwd=root,text=True).strip()
def gh(*a):return subprocess.check_output(['gh',*a],cwd=root)
def run(*a):subprocess.check_call(['git',*a],cwd=root)
assert git('branch','--show-current')==branch
assert not git('diff','--name-only') and not git('diff','--cached','--name-only')
assert all(n.startswith('docs/upgrade/d2/evidence/') for n in git('ls-files','--others','--exclude-standard').splitlines())
assert git('merge-base',tested,'HEAD')==tested
assert all(n.startswith('docs/upgrade/d2-transfer/') for n in git('diff','--name-only',tested,'HEAD').splitlines())
assert git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
manifest=json.loads((transfer/'d2-final-manifest.json').read_bytes())
assert manifest['validatedSource']==tested and sha(pathlib.Path(__file__).read_bytes())==manifest['publisherSha256']
bundle=transfer/'d2-final-docs.zip';assert sha(bundle.read_bytes())==manifest['zipSha256']
expected={e['path']:e for e in manifest['files']};assert len(expected)==len(manifest['files'])
prepared={}
with zipfile.ZipFile(bundle) as z:
 assert len(z.infolist())==len(expected) and {i.filename for i in z.infolist()}==set(expected)
 for i in z.infolist():
  name=i.filename;assert name.startswith('docs/upgrade/d2/') and '..' not in pathlib.PurePosixPath(name).parts and (i.external_attr>>16)&0o170000!=0o120000
  data=z.read(i);e=expected[name];assert len(data)==e['bytes'] and sha(data)==e['sha256'] and b'\r\n' not in data
  target=root/name;assert target.resolve().is_relative_to(folder)
  for p in (target,*target.parents):
   assert not p.is_symlink()
   if p==root:break
  prepared[name]=data
for name,data in prepared.items():(root/name).write_bytes(data)

history=[('45407366991','843e1ee91af1bdcad3919771803919a15fc46f6e','failure'),('45410409313','7ac7d7c08c63d53b010b772974272c222cddbcc8','failure'),('45414368180','d57963c35c5a6d06fce3664b5789acb7e6ac2e35','failure'),('45425446577',tested,'success')]
evidence=[];exports={}
for rid,source,conclusion in history:
 ef=folder/'evidence'/('run-'+rid);summary=json.loads((ef/'evidence-summary.json').read_bytes());meta=json.loads((ef/'run.json').read_bytes())
 assert meta['status']=='completed' and meta['head_sha']==source and meta['conclusion']==conclusion and str(meta['run_attempt'])=='1'
 assert summary['runId']==rid and summary['sourceSha']==source and summary['conclusion']==conclusion
 artifacts=json.loads((ef/'artifacts.json').read_bytes());official={a['id']:a for a in artifacts['artifacts']}
 for a in summary['archives']:
  data=(ef/a['name']).read_bytes();assert len(data)==a['bytes'] and sha(data)==a['sha256'] and official[a['artifactId']]['digest']=='sha256:'+sha(data)
 assert sha((ef/'official-job-logs.zip').read_bytes())==summary['officialLogs']['sha256']
 evidence.append({k:summary[k] for k in ('runId','attempt','sourceSha','conclusion','url','jobs','archives','officialLogs')})
 for name in ('run.json','jobs.json','artifacts.json','evidence-summary.json'):exports['evidence/run-'+rid+'/'+name]=(ef/name).read_bytes()
 for receipt in summary['receipts']:
  filename=receipt['artifact']+'--'+receipt['entry'].replace('/','__');raw=(ef/filename).read_bytes();assert len(raw)==receipt['bytes'] and sha(raw)==receipt['sha256'];exports['evidence/run-'+rid+'/'+filename]=raw

latest=folder/'evidence/run-45425446577'
def receipt(artifact,name):return json.loads((latest/(artifact+'-45425446577-1--'+name)).read_bytes())
c=receipt('d2-windows','results.json');n=receipt('d2-node','node-report.json');a=receipt('d2-android','android-storage-receipt.json');b=receipt('d2-backup','backup-results.json');compare=receipt('d2-comparison','comparison-results.json');scope=receipt('d2-scope','source-scope-receipt.json')
for r,total in ((c,30),(n,16),(a,11),(b,25),(compare,7)):
 assert r['sourceSha']==tested and r['runId']=='45425446577' and r['status']=='passed' and r['passed']==total and r['failed']==0 and len(r['cases'])==total
 assert all(case.get('passed') is True or case.get('status')=='passed' for case in r['cases'])
assert a['actualProductionStorageApi'] and a['actualFramework'] and not a['productionAppEntryLoaded']
assert n['actualProductionEntry'] and not n['startupMigration'] and scope['status']=='passed'
issue=json.loads(gh('api','repos/johny751/MyTodo/issues/1'));assert issue['state']=='open'
proof={'classification':'FACT: official isolated validation; no production migration approval','validatedSource':tested,'base':base,'branch':branch,'runId':'45425446577','runAttempt':'1','url':evidence[-1]['url'],'conclusion':'success','counts':{'windows':{'passed':30,'failed':0},'node':{'passed':16,'failed':0},'android':{'passed':11,'failed':0},'backup':{'passed':25,'failed':0},'comparison':{'passed':7,'failed':0}},'history':evidence,'androidIssue1':'open','runtimeAlgorithm':'mytodo-storage-fingerprint-v2','backupValueEncoding':'mytodo-complete-state-v2','scope':'No real user databases, production merge, sync/ACK semantics change, LAN/WebDAV tests or dual channel','limitations':['Fixture-controlled backup fence and synthetic remote evidence','Full release GUI/lifecycle and true power loss remain unverified','Backup cleanup supplemental errors and independent attempt gate coverage are limited']}
proofbytes=(json.dumps(proof,ensure_ascii=False,indent=2)+'\n').encode();(folder/'cloud-evidence-summary.json').write_bytes(proofbytes);exports['cloud-evidence-summary.json']=proofbytes

production=manifest['productionPaths'];source_paths=production+git('ls-tree','-r','--name-only',tested,'tests/d2','.github/workflows/d2-migration-validation.yml').splitlines()
source_paths=sorted(set(source_paths));sources=[]
for name in source_paths:
 data=subprocess.check_output(['git','show',tested+':'+name],cwd=root);assert (root/name).read_bytes()==data,'tested code drift '+name;sources.append({'path':name,'bytes':len(data),'sha256':sha(data)})
sourcebytes=(json.dumps({'validatedSource':tested,'files':sources},indent=2)+'\n').encode();(folder/'validated-source-sha256.json').write_bytes(sourcebytes);exports['validated-source-sha256.json']=sourcebytes
(folder/'SOURCE-SHA256SUMS.txt').write_text(''.join(s['sha256']+'  '+s['path']+'\n' for s in sources),encoding='utf8')
with zipfile.ZipFile(folder/'receipt-export.zip','x',zipfile.ZIP_DEFLATED) as z:
 for name,data in sorted(exports.items()):z.writestr(name,data)
entries=[]
for file in sorted(folder.rglob('*')):
 if file.is_file() and file.name!='EVIDENCE-SHA256SUMS.txt':entries.append((sha(file.read_bytes()),file.relative_to(root).as_posix()))
(folder/'EVIDENCE-SHA256SUMS.txt').write_text(''.join(h+'  '+p+'\n' for h,p in entries),encoding='utf8')
run('diff','--check');run('add','--',str(folder.relative_to(root)));run('diff','--cached','--check')
assert all(p.startswith('docs/upgrade/d2/') for p in git('diff','--cached','--name-only').splitlines())
run('commit','-m','D2: publish isolated v2 validation evidence and unified review; stop for owner review')
head=git('rev-parse','HEAD');assert not git('status','--porcelain')
assert not git('diff','--name-only',tested,head,'--','src','windows','android','scripts','tests/d2','.github/workflows/d2-migration-validation.yml')
run('push','origin','HEAD:refs/heads/'+branch)
assert git('ls-remote','--exit-code','origin','refs/heads/'+branch).split()[0]==head and git('ls-remote','--exit-code','origin','refs/heads/master').split()[0]==base
comparison=json.loads(gh('api','repos/johny751/MyTodo/compare/'+base+'...'+head));changed=git('diff','--name-only',base,head).splitlines()
published={'classification':'FACT: candidate branch publication only','base':base,'validatedSource':tested,'publicationSha':head,'parent':git('rev-parse','HEAD^'),'tree':git('rev-parse','HEAD^{tree}'),'branch':branch,'masterUnchanged':True,'clean':True,'testedImplementationDiff':[],'productionChangedFiles':[p for p in changed if p in production],'compare':{k:comparison[k] for k in ('status','ahead_by','behind_by','total_commits','html_url')},'changedFileCount':len(changed),'actions':{'runId':'45425446577','attempt':'1','url':proof['url'],'conclusion':'success'},'counts':proof['counts'],'receiptExport':{'path':'docs/upgrade/d2/receipt-export.zip','bytes':(folder/'receipt-export.zip').stat().st_size,'sha256':sha((folder/'receipt-export.zip').read_bytes())},'proofSha256':sha(proofbytes),'androidIssue1':'open','stop':'Await unified owner review; no production migration or sync activation'}
pathlib.Path('/workspaces/d2-final-publication.json').write_text(json.dumps(published,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
pathlib.Path('/workspaces/d2-final-publication-compact.json').write_text(json.dumps(published,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print(json.dumps(published,ensure_ascii=False,separators=(',',':')))
