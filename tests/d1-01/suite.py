"""Named, independently expected contract cases; all databases are synthetic."""
import copy, datetime as dt, json, os, pathlib, traceback
import candidate as c
from isolation import json_bytes, logical_dump, open_db, root_path, sha, write_json
from migration import migrate, rows, verify_original_bytes

def json_equal(a,b):
    if isinstance(a,dict) and isinstance(b,dict):return set(a)==set(b) and all(json_equal(a[k],b[k]) for k in a)
    if isinstance(a,(list,tuple)) and isinstance(b,(list,tuple)):return len(a)==len(b) and all(json_equal(x,y) for x,y in zip(a,b))
    if type(a) is bool or type(b) is bool:return type(a) is type(b) and a==b
    if type(a) in {int,float} and type(b) in {int,float}:return a==b
    return type(a) is type(b) and a==b
def equal(actual,expected):
    if not json_equal(actual,expected):raise AssertionError('expected '+repr(expected)+', got '+repr(actual))
    return {'expected':expected,'actual':actual}
def rejected(fn):
    try:fn()
    except (ValueError,RuntimeError,OverflowError,TypeError,KeyError) as error:return {'rejection':str(error)}
    raise AssertionError('invalid input was accepted')

def run(root,source,profile):
    r=root_path(root);fixture=json.loads((r/'fixture.json').read_text(encoding='utf-8'))
    report={'candidate':'d1-01-candidate.1','profile':profile,'sourceSha':os.environ['GITHUB_SHA'],
            'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],
            'status':'running','cases':[],'productionEntryUsed':False,'productionValidation':False}
    target=r/('case-report-'+profile+'.json')
    def record(id,name,fn):
        item={'id':id,'name':name,'status':'failed'}
        try:item['evidence']=fn();item['status']='passed'
        except BaseException as error:item['error']=str(error);item['traceback']=traceback.format_exc()
        report['cases'].append(item);write_json(target,report)
    before=open_db(r,source)
    try:original=logical_dump(before);items=rows(before)
    finally:before.close()
    record('T01','Presence is independent of validity',lambda:equal([c.field(d,'parentId')['presence'] for d in [{},{'parentId':None},{'parentId':''},{'parentId':0},{'parentId':False}]],['missing','json-null','value','value','value']))
    record('T02','Invalid scalar parents never become roots',lambda:equal([c.field({'parentId':v},'parentId')['interpretable'] for v in [0,False,[],{},'parent']], [False,False,False,False,True]))
    record('T03','Quadrant boundaries reject coercion',lambda:equal([c.field({'quadrant':v},'quadrant')['interpretable'] for v in [0,3,4,-1,1.5,'2',True,None]], [True,True,False,False,False,False,False,False]))
    record('T04','Mathematical JSON integers accepted without fractional coercion',lambda:equal([c.field({'quadrant':v},'quadrant')['interpretable'] for v in [1.0,1e0,1.5]], [True,True,False]))
    record('T05','Boolean fields reject truthiness',lambda:equal([c.field({'done':v},'done')['interpretable'] for v in [True,False,0,1,'false',None]], [True,True,False,False,False,False]))
    record('T06','Reminder zero negative and unsafe integer distinct',lambda:equal([(c.field({'reminderAt':v},'reminderAt')['interpretable'],c.field({'reminderAt':v},'reminderAt').get('canSchedule')) for v in [0,-1,9007199254740992,'0',1.5]],[(True,True),(True,False),(False,None),(False,None),(False,None)]))
    record('T07','UTF8 identity byte boundaries',lambda:equal([c.valid_id(v) for v in ['a'*800,'a'*801,'😀'*200,'😀'*201,'','x\x00','\ud800','e\u0301']], [True,False,True,False,False,False,False,True]))
    record('T08','Duplicate JSON keys are preserved as a blocked raw source',lambda:rejected(lambda:c.parse_raw('{"title":"a","title":"b"}')))
    record('T09','Array order duplicates and empty are retained',lambda:equal(c.field({'tags':['标签','标签','e\u0301']},'tags')['value'],['标签','标签','e\u0301']))
    record('T10','Unknown nested big integer remains exact',lambda:equal(c.parse_raw('{"future":{"number":9007199254740993,"null":null,"empty":[]}}')['future'],{'number':9007199254740993,'null':None,'empty':[]}))
    record('T11','Gregorian leap centuries',lambda:equal([_valid_date(v) for v in ['2024-02-29','2023-02-29','2000-02-29','2100-02-29']], [True,False,True,False]))
    record('T12','Fixed offset epoch zero and negative civil',lambda:equal([(c.civil(v)['epochMs'],c.civil(v)['canSchedule']) for v in ['1970-01-01T08:00','1970-01-01T00:00']],[(0,True),(-28800000,False)]))
    record('T13','Year one and 9999 interpretable but not schedulable',lambda:equal([(c.civil(v)['interpretable'],c.civil(v)['canSchedule']) for v in ['0001-01-01T00:00','9999-01-01T09:00']],[(True,False),(True,False)]))
    record('T14','Invalid civil dates and platform offsets rejected',lambda:equal([_valid_civil(v) for v in ['2026-02-30T09:00','2026-11-24T24:00','2026-11-24 09:00','2026-11-24T09:00Z','2026-11-24T09:00']], [False,False,False,False,True]))
    record('T15','Explicit absolute offsets identify one instant',lambda:equal([c.instant(v)['epochMs'] for v in ['2026-11-24T01:00:00Z','2026-11-24T09:00:00+08:00']], [1795482000000,1795482000000]))
    record('T16','Unspecified offsets and excessive precision blocked',lambda:equal([_valid_instant(v) for v in ['2026-11-24T09:00:00','2026-11-24T09:00:00-00:00','2026-11-24T09:00:00.0001Z','2026-11-24T09:00:00+14:01']], [False,False,False,False]))
    record('T17','Far calendar millisecond precision exact',lambda:equal(c.instant('9998-12-31T23:59:59.999Z')['epochMs']-c.instant('9998-12-31T23:59:59.998Z')['epochMs'],1))
    record('T18','ISO weekdays invertible with duplicates retained',lambda:equal(c.weekday_map([0,1,6,0]),[7,1,6,7]))
    record('T19','Calendar reference: Sunday belongs to Monday-based week',lambda:equal((dt.date(2026,11,29)-dt.timedelta(days=dt.date(2026,11,29).weekday())).isoformat(),'2026-11-23'))
    monthly={'frequency':'monthly','interval':1.0,'isoWeekdays':[],'until':'','anchor':'2024-01-31T09:00'}
    record('T20','Month end clamp returns to original anchor',lambda:equal([c.next_occurrence(v,monthly)['civil'] for v in ['2024-01-31T09:00','2024-02-29T09:00']], ['2024-02-29T09:00','2024-03-31T09:00']))
    yearly={'frequency':'yearly','interval':1,'isoWeekdays':[],'until':'','anchor':'2024-02-29T09:00'}
    record('T21','Yearly leap anchor retained',lambda:equal([c.next_occurrence(v,yearly)['civil'] for v in ['2024-02-29T09:00','2027-02-28T09:00']], ['2025-02-28T09:00','2028-02-29T09:00']))
    weekly={'frequency':'weekly','interval':2,'isoWeekdays':[7],'until':'','anchor':'2026-11-23T09:00'}
    record('T22','Weekly interval is anchored to Monday',lambda:equal(c.next_occurrence('2026-11-29T09:00',weekly)['civil'],'2026-12-13T09:00'))
    record('T23','Weekdays interval ambiguity is blocked',lambda:rejected(lambda:c.repeat({'frequency':'weekdays','interval':2,'weekdays':[],'until':'','anchor':'2026-11-24T09:00'})))
    daily={'frequency':'daily','interval':1,'isoWeekdays':[],'until':'2026-11-25','anchor':'2026-11-24T09:00'}
    record('T24','Until is inclusive on calendar day',lambda:equal([c.next_occurrence('2026-11-24T09:00',daily)['civil'],c.next_occurrence('2026-11-25T09:00',daily)],['2026-11-25T09:00',None]))
    record('T25','Invalid repeat types are not clamped',lambda:equal([c.field({'repeat':{'frequency':'daily','interval':v,'weekdays':[],'until':'','anchor':'2026-11-24T09:00'}},'repeat')['interpretable'] for v in [1.0,1.5,'1',False,0,366]],[True,False,False,False,False,False]))
    record('T26','Next calculation cannot authorize old schedule domain',lambda:equal(c.next_occurrence('1969-12-31T09:00',{'frequency':'daily','interval':2,'isoWeekdays':[],'until':'','anchor':'1969-12-31T09:00'})['canSchedule'],False))
    record('T27','Calendar overflow ends without normalization',lambda:equal(c.next_occurrence('9999-12-31T09:00',{'frequency':'daily','interval':1,'isoWeekdays':[],'until':'','anchor':'9999-12-31T09:00'}),None))
    record('T28','Reminder day validates entire civil start',lambda:equal(c.reminder({'start':'2026-11-24T99:00','reminder':{'mode':'day','days':0}})['state'],'blocked'))
    record('T29','Stored reminder mismatch is a diagnostic only',lambda:equal(c.reminder({'start':'2026-11-24T09:00','reminder':{'mode':'offset','minutes':5},'reminderAt':0})['mismatch'],True))
    record('T30','Completed and absent rules never backfill notifications',lambda:equal([c.reminder({'done':True,'reminder':{'mode':'offset','minutes':0}})['state'],c.reminder({})['state']],['not-scheduled','not-scheduled']))
    record('T31','Instant math integer and enormous range rejection',lambda:equal([c.instant(1.0)['epochMs'],c.integer(10**400),c.instant('1970-01-01T00:00:00.001Z')['type']],[1,False,'epoch-millis']))
    record('T32','Unknown completion controls cannot authorize reminders',lambda:equal([c.reminder({'start':'2026-11-24T09:00','done':v,'reminder':{'mode':'offset','minutes':0}})['canSchedule'] for v in [False,0,'false',None]],[True,False,False,False]))
    record('R01','Archived uniquely named project is eligible',lambda:equal(c.relationship('Unique',items)['targetId'],'p-unique'))
    record('R02','Repeated project names remain ambiguous',lambda:equal(c.relationship('Duplicate',items)['status'],'ambiguous'))
    record('R03','Missing project remains missing',lambda:equal(c.relationship('Absent',items)['status'],'missing'))
    record('R04','No trimming case folding or Unicode normalization',lambda:equal([c.relationship(v,items).get('targetId') for v in [' Unique','unique','é','e\u0301']],[None,None,'p-composed','p-decomposed']))
    record('R05','Conflicts and incomplete snapshots do not resolve',lambda:equal([c.relationship('Unique',items,conflict=True)['status'],c.relationship('Unique',items,complete=False)['status']],['conflict','unknown']))
    record('R06','Parent cycle and true missing are preserved',lambda:equal([c.parent_relation(v,items,s)['status'] for v,s in [('cycle-b','cycle-a'),('missing','orphan'),('self','self')]],['cycle','missing','cycle']))
    record('R07','Deleted target remains a tombstone reference',lambda:equal(c.parent_relation('deleted-task',items,'child')['status'],'deletedTarget'))
    record('R08','Missing ancestor root provenance remains unknown',lambda:equal(c.parent_relation('quadrant-case-0',items,'child')['status'],'unknown'))
    def depth_boundary():
        def chain(n):return [{'kind':'tasks','id':'depth-'+str(i),'deleted':0,'data':json.dumps({'parentId':'depth-'+str(i+1) if i<n-1 else None})} for i in range(n)]
        return equal([c.parent_relation('depth-0',chain(n),'external')['status'] for n in [64,65]],['resolved','depthExceeded'])
    record('R09','Reference max 64 ancestor boundary is explicit',depth_boundary)
    def raw_preserved():
        db=open_db(r,source)
        try:verify_original_bytes(db,fixture);return {'rows':len(items),'outbox':len(fixture['outbox']),'method':'CAST AS BLOB exact UTF-8 bytes'}
        finally:db.close()
    record('P01','Native source retains all raw TEXT and tombstones',raw_preserved)
    def pending_proof():
        meta=c.parse_raw(fixture['meta']);pending=meta['pending'];body=c.parse_raw(pending['body'])
        events=[c.parse_raw(e['event']) for e in fixture['outbox'] if e['id']<=pending['through']]
        equal(body['events'],events);equal(pending['through'],42);equal([e['seq'] for e in events],[4,5]);equal(pending['path'],'v2/b-Synthetic-A-3.json.gz')
        if pending['body']==json.dumps(body,separators=(',',':')):raise AssertionError('fixture does not exercise raw formatting preservation')
        return {'pendingBodySha256':sha(pending['body'].encode('utf-8')),'outboxEventSha256':[sha(e['event'].encode('utf-8')) for e in fixture['outbox']],'eventCorrespondence':True}
    record('P02','Pending body bytes and event semantic correspondence separate',pending_proof)
    record('P04','JSON event equality never conflates boolean and number',lambda:equal([json_equal({'deleted':False},{'deleted':0}),json_equal({'deleted':True},{'deleted':1}),json_equal({'seq':1.0},{'seq':1})],[False,False,True]))
    from storage_cases import run_storage_cases
    run_storage_cases(r,source,record)
    record('P03','Frozen native source unchanged by entire test suite',lambda:_source_same(r,source,original))
    report['passed']=sum(v['status']=='passed' for v in report['cases']);report['failed']=len(report['cases'])-report['passed'];report['namedCases']=len(report['cases']);report['status']='passed' if report['failed']==0 else 'failed'
    write_json(target,report);return report

def _valid_date(value):
    try:c.date(value);return True
    except ValueError:return False
def _valid_civil(value):
    try:c.civil(value);return True
    except (ValueError,OverflowError):return False
def _valid_instant(value):
    try:c.instant(value);return True
    except (ValueError,OverflowError):return False
def _source_same(root,source,expected):
    db=open_db(root,source)
    try:return equal(logical_dump(db),expected)
    finally:db.close()
