"""Fixed synthetic inputs; production databases and paths are never accepted."""
import json, pathlib
from isolation import CANDIDATE, GUARD, root_path, write_json

SCHEMA = '''PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL);
CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT);
CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start);
CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at);
CREATE INDEX task_parent ON entities(parent_id);
CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL);'''

def raw(value): return json.dumps(value,ensure_ascii=False,separators=(',',':'))

def fixture(run_id):
    rows=[]
    def row(kind,id,data,deleted=0,conflicts='[]'):
        data={'id':id,**data}
        text=raw(data)
        key=raw([kind,id])
        event={'actor':'Synthetic-History','seq':len(rows)+1,'clock':len(rows)+1,
               'context':{},'key':key,'values':{**data,'_deleted':bool(deleted)}}
        rows.append({'key':raw([kind,id]),'kind':kind,'id':id,'data':text,
                     'record':raw({'key':key,'events':[{k:v for k,v in event.items() if k!='key'}]}),
                     'deleted':deleted,'conflicts':conflicts})
    for i,value in enumerate(['MISSING',None,'',0,'parent',False,[],{}]):
        data={'title':'parent presence '+str(i),'quadrant':1,'done':False,'start':'2026-11-24T09:00'}
        if value!='MISSING': data['parentId']=value
        row('tasks','parent-case-'+str(i),data)
    for i,value in enumerate(['MISSING',None,'',0,3,4,-1,1.5,'2',True,[],{}]):
        data={'title':'quadrant '+str(i)}
        if value!='MISSING': data['quadrant']=value
        row('tasks','quadrant-case-'+str(i),data)
    for i,value in enumerate(['MISSING',None,'',0,1,-1,1.5,'1',False,9007199254740992]):
        data={'title':'reminder '+str(i),'reminder':{'mode':'custom','at':'2026-11-24T09:00'}}
        if value!='MISSING':data['reminderAt']=value
        row('tasks','reminder-case-'+str(i),data)
    row('tasks','parent',{'title':'root','parentId':None,'project':'Unique','quadrant':0,'done':False,
                         'notes':'任务备注','tags':['标签','标签'],'place':'地点','start':'2026-01-31T09:00',
                         'repeat':{'frequency':'monthly','interval':1,'weekdays':[],'until':'','anchor':'2026-01-31T09:00'},
                         'extension':{'future':[]}})
    row('tasks','child',{'title':'child','parentId':'parent','project':'Duplicate','quadrant':2,'done':False})
    row('tasks','orphan',{'title':'orphan','parentId':'missing','project':'Absent'})
    row('tasks','cycle-a',{'parentId':'cycle-b'}); row('tasks','cycle-b',{'parentId':'cycle-a'})
    row('tasks','self',{'parentId':'self'}); row('tasks','deleted-task',{'title':'deleted'},1)
    row('tasks','generated',{'seriesId':'series','generatedFrom':'deleted-task','parentId':'parent'})
    row('tasks','unknown-field',{'title':'extension','extra':{'big':9007199254740993,'empty':None,'text':'e\u0301😀'}})
    row('tasks','conflict',{'project':'Unique'},0,'[{"field":"project","candidate":"Duplicate"}]')
    row('projects','p-unique',{'name':'Unique','archived':True})
    row('projects','p-dup-1',{'name':'Duplicate','archived':False})
    row('projects','p-dup-2',{'name':'Duplicate','archived':True})
    row('projects','p-deleted',{'name':'Deleted'},1)
    row('projects','p-composed',{'name':'é'});row('projects','p-decomposed',{'name':'e\u0301'})
    row('notes','note-1',{'body':'独立便签','createdAt':0});row('tags','标签',{'name':'标签'});row('places','地点',{'name':'地点'})
    events=[{'actor':'Synthetic-A','seq':4,'clock':99,'context':{'Synthetic-History':len(rows),'Synthetic-A':3},'key':raw(['tasks','parent']),'values':{'title':'queued title'}},
            {'actor':'Synthetic-A','seq':5,'clock':100,'context':{'Synthetic-History':len(rows),'Synthetic-A':4},'key':raw(['tasks','deleted-task']),'values':{'_deleted':True}}]
    for event in events:
        item=next(r for r in rows if r['key']==event['key'])
        record=json.loads(item['record']);record['events'].append({k:v for k,v in event.items() if k!='key'});item['record']=raw(record)
        data=json.loads(item['data']);data.update({k:v for k,v in event['values'].items() if k!='_deleted'});item['data']=raw(data)
    body=json.dumps({'format':'gxtodo-batch','epoch':'synthetic-epoch','device':'Synthetic-A','index':3,'events':events},ensure_ascii=False,indent=1)
    meta={'version':2,'revision':9,'dataRevision':6,'actor':'Synthetic-A','seq':5,'clock':100,'queue':42,
          'vector':{'Synthetic-A':5,'Synthetic-B':3,'Synthetic-History':len(rows)},'cursors':{'Synthetic-B':2},'scope':'synthetic-scope',
          'epoch':'synthetic-epoch','pending':{'body':body,'through':42,'index':3,'device':'Synthetic-A','path':'v2/b-Synthetic-A-3.json.gz'},
          'settings':{'reminderReceipts':{'local-only':True}},'initialized':True}
    return {'synthetic':True,'candidate':CANDIDATE,'guard':GUARD,'fixtureId':'synthetic-fixed-v1',
            'runId':run_id,'schema':SCHEMA,'meta':raw(meta),'rows':rows,
            'outbox':[{'id':41+i,'event':json.dumps(e,ensure_ascii=False,indent=2)} for i,e in enumerate(events)]}

def create(root):
    r=root_path(root,create=True)
    import os
    data=fixture(os.environ['GITHUB_RUN_ID']);write_json(r/'fixture.json',data)
    (r/'attachment-original.bin').write_bytes(b'D1-SYNTHETIC-IMAGE\x00\xff\x01'+bytes(range(256)))
    write_json(r/'expected-input.json',data)
    return r

if __name__=='__main__':
    import sys
    create(sys.argv[1])
