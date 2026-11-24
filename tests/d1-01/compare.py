"""Compare authenticated same-run native artifacts, including raw bytes and projections."""
import json, os, pathlib, shutil, sys, traceback
from isolation import root_path, safe_file, sha, write_json, open_db, json_bytes, logical_dump
from suite import equal, json_equal
from migration import snapshot, verify_backup, original_dump

def main(desktop,android,output):
    out=root_path(output,create=True);d=root_path(desktop);a=root_path(android)
    report={'sourceSha':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],'status':'running','cases':[],'nativeGenerators':{},'limitations':['Migrations use the independent Python SQLite reference against real generated native databases; production C/Node/Android storage wrappers are not loaded.','No real device power-loss, user-data, live LAN/WebDAV or production protocol behavior is validated.']}
    def record(id,name,fn):
        case={'id':id,'name':name,'status':'failed'}
        try:case['evidence']=fn();case['status']='passed'
        except BaseException as error:case['error']=str(error);case['traceback']=traceback.format_exc()
        report['cases'].append(case);write_json(out/'comparison-report.json',report)
    folders={'windows':d/'windows','node':d/'node','android':a/'android'}
    exports={}
    for profile,folder in folders.items():
        folder=root_path(folder)
        def load(profile=profile,folder=folder):
            receipt=json.loads((folder/'case-report-'+profile+'.json').read_text(encoding='utf-8'))
            equal(receipt['sourceSha'],os.environ['GITHUB_SHA']);equal(receipt['runId'],os.environ['GITHUB_RUN_ID']);equal(receipt['runAttempt'],os.environ['GITHUB_RUN_ATTEMPT'])
            if receipt['status']!='passed' or receipt['failed'] or not receipt['cases']:raise AssertionError('native profile cases not passed')
            ids=[case['id'] for case in receipt['cases']]
            equal(len(ids),len(set(ids)));equal(receipt['namedCases'],len(ids))
            equal(receipt['passed'],sum(case['status']=='passed' for case in receipt['cases']))
            equal(receipt['failed'],sum(case['status']!='passed' for case in receipt['cases']))
            if receipt['failed']:raise AssertionError('case-list differs from reported pass totals')
            payload=json.loads((folder/'payload-sha256.json').read_text(encoding='utf-8'))
            required={'fixture.json','expected-input.json','canonical-export.json','canonical.sqlite',profile+'-source.sqlite','case-report-'+profile+'.json',('native' if profile=='windows' else profile)+'-generator-receipt.json'}
            if profile=='android':required.update({'android-runner-receipt.json','android-build-receipt.json','feedback-source.sqlite','feedback-validation.sqlite','feedback-original.png'})
            if not required.issubset({entry['path'] for entry in payload if 'sha256' in entry}):raise AssertionError('required source/receipt missing from seal')
            for entry in payload:
                if entry.get('type')=='rejected-test-symlink':continue
                path=safe_file(folder,entry['path'])
                equal(path.stat().st_size,entry['bytes']);equal(sha(path.read_bytes()),entry['sha256'])
            value=json.loads((folder/'canonical-export.json').read_text(encoding='utf-8'))
            equal(value['profile'],profile);equal(value['fixtureId'],'synthetic-fixed-v1')
            equal([v[0] for v in value['sourceColumnObservations']],[v[0] for v in value['rawFields']])
            exports[profile]=value
            generator=json.loads((folder/('native' if profile=='windows' else profile)+'-generator-receipt.json').read_text(encoding='utf-8'))
            report['nativeGenerators'][profile]=generator
            equal(generator['guard'],'MYTODO_D1_SYNTHETIC_ONLY');equal(generator['candidate'],'d1-01-candidate.1')
            equal(generator['fixtureId'],'synthetic-fixed-v1');equal(generator['runId'],os.environ['GITHUB_RUN_ID'])
            equal(generator['status'],'passed' if profile=='android' else 'created')
            if profile=='android' and generator.get('actualFramework') is not True:raise AssertionError('not real Android framework')
            if profile=='android':
                equal(generator['fixtureSha256'],sha((folder/'fixture.json').read_bytes()))
                build=generator['buildMetadata']
                for key,expected in [('sourceSha',os.environ['GITHUB_SHA']),('runId',os.environ['GITHUB_RUN_ID']),('runAttempt',os.environ['GITHUB_RUN_ATTEMPT'])]:equal(build[key],expected)
                runner=json.loads((folder/'android-runner-receipt.json').read_text(encoding='utf-8'))
                for key,expected in [('status','passed'),('sourceSha',os.environ['GITHUB_SHA']),('runId',os.environ['GITHUB_RUN_ID']),('runAttempt',os.environ['GITHUB_RUN_ATTEMPT']),('fixtureSha256',sha((folder/'fixture.json').read_bytes()))]:equal(runner[key],expected)
            return {'namedCases':receipt['namedCases'],'passed':receipt['passed'],'failed':receipt['failed'],'sealedFiles':len(payload),'sqliteVersion':generator.get('sqliteVersion')}
        record('C-'+profile,'Same source/run native profile and file seal',load)
    for source in folders:
        for target in folders:
            def compare(source=source,target=target):
                left=exports[source];right=exports[target]
                for field in ['projections','rawFields','meta','outbox']:equal(left[field],right[field])
                differences=[{'key':a[0],'from':a[1:],'to':b[1:]} for a,b in zip(left['sourceColumnObservations'],right['sourceColumnObservations']) if not json_equal(a,b)]
                write_json(out/('column-differences-'+source+'-'+target+'.json'),differences)
                return {'from':source,'to':target,'projectionRows':len(left['projections']),'rawByteEquivalent':True,'nativeSourceColumnDifferences':len(differences),'differenceFile':'column-differences-'+source+'-'+target+'.json'}
            record('X-'+source+'-'+target,'Directed candidate and original-byte comparison',compare)
    if 'android' in exports:
        folder=folders['android']
        def feedback_domain():
            db=open_db(folder,'feedback-source.sqlite');validation=open_db(folder,'feedback-validation.sqlite')
            try:
                equal(set(logical_dump(db)),{'records','assets','links','settings','d1_synthetic_guard'})
                equal(set(logical_dump(validation)),{'records','assets','links','settings','archive_entries','d1_synthetic_guard'})
                return {'persistentTables':4,'restoreTemporaryArchiveEntries':True,'distinctFromTaskLedger':True}
            finally:db.close();validation.close()
        record('F01','Android independent feedback and restore-only table domains',feedback_domain)
        def feedback_restore():
            evidence=root_path(out/'feedback-restore',create=True)
            for name in ['feedback-source.sqlite','feedback-original.png']:
                original=safe_file(folder,name);target=safe_file(evidence,name,must_exist=False);target.write_bytes(original.read_bytes());equal(sha(target.read_bytes()),sha(original.read_bytes()))
            m=snapshot(evidence,'feedback-source.sqlite','feedback-backup.sqlite',assets=['feedback-original.png'])
            mp=evidence/'feedback-backup.sqlite.manifest.json';trusted=sha(mp.read_bytes());equal(verify_backup(evidence,mp,trusted),m)
            source=open_db(evidence,'feedback-source.sqlite');backup=open_db(evidence,'feedback-backup.sqlite')
            try:equal(logical_dump(source),logical_dump(backup))
            finally:source.close();backup.close()
            copied=safe_file(evidence,m['assets'][0]['path']);equal(copied.read_bytes(),(evidence/'feedback-original.png').read_bytes())
            return {'completeFeedbackTablesRestored':True,'originalImageBytesRestored':True,'sha256':sha(copied.read_bytes()),'scope':'independent fixture domain; production AAR restoration not invoked'}
        record('F02','Feedback all rows and exact original image bytes restored',feedback_restore)
    report['passed']=sum(v['status']=='passed' for v in report['cases']);report['failed']=len(report['cases'])-report['passed'];report['status']='passed' if not report['failed'] else 'failed'
    write_json(out/'comparison-report.json',report)
    payload=[]
    for path in sorted(out.rglob('*')):
        if path.is_symlink():raise RuntimeError('BLOCKER: comparison output symlink')
        if path.is_file() and path.name!='payload-sha256.json':payload.append({'path':str(path.relative_to(out)),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())})
    write_json(out/'payload-sha256.json',payload)
    if report['failed']:raise RuntimeError('comparison failed; original errors retained')

if __name__=='__main__':main(sys.argv[1],sys.argv[2],sys.argv[3])
