"""Executable reference candidate for isolated samples, not a production adapter."""
import calendar, datetime as dt, json, math, re

MAX=9007199254740991
MISSING=object()
FIXED=dt.timezone(dt.timedelta(hours=8))
EPOCH=dt.datetime(1970,1,1,tzinfo=dt.timezone.utc)

def parse_raw(text):
    def pairs(items):
        result={}
        for k,v in items:
            if k in result: raise ValueError('BLOCKER: duplicate JSON member')
            result[k]=v
        return result
    def bad_constant(value): raise ValueError('invalid JSON number '+value)
    return json.loads(text,object_pairs_hook=pairs,parse_constant=bad_constant)

def valid_id(value):
    return isinstance(value,str) and bool(value) and '\x00' not in value and not any(0xD800<=ord(c)<=0xDFFF for c in value) and len(value.encode('utf-8'))<=800

def integer(value,lo=0,hi=MAX):
    if type(value) is int:return lo<=value<=hi
    return type(value) is float and math.isfinite(value) and value.is_integer() and lo<=value<=hi

def date(value):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value):raise ValueError('invalid-date')
    return dt.date.fromisoformat(value)

def civil(value):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}',value):raise ValueError('invalid-civil')
    d=dt.datetime.fromisoformat(value)
    delta=d-dt.datetime(1970,1,1)-dt.timedelta(hours=8)
    ms=delta.days*86400000+delta.seconds*1000+delta.microseconds//1000
    return {'type':'civil-minute','sourceSemantics':'legacy-shanghai-fixed-offset-v1','civil':value,
            'offset':'+08:00','epochMs':ms,'interpretable':True,'canSchedule':ms>=0 and d.year<=9998}

def instant(value):
    if type(value) in {int,float}:
        if not integer(value,-MAX,MAX):raise ValueError('out-of-range-or-fraction')
        return {'type':'epoch-millis','sourceType':'epoch-millis','epochMs':int(value),'sourceSemantics':'explicit-unix-ms','interpretable':True}
    if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:Z|[+-][0-9]{2}:[0-9]{2})',value):raise ValueError('unknown-source-or-format')
    if value.endswith('-00:00'):raise ValueError('unknown-offset')
    if not value.endswith('Z'):
        hour=int(value[-5:-3]);minute=int(value[-2:])
        if hour>14 or minute>59 or hour==14 and minute:raise ValueError('invalid-offset')
    parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    delta=parsed.replace(tzinfo=None)-dt.datetime(1970,1,1)-parsed.utcoffset()
    ms=delta.days*86400000+delta.seconds*1000+delta.microseconds//1000
    if abs(ms)>MAX:raise ValueError('out-of-range')
    return {'type':'epoch-millis','sourceType':'offset-instant-text','epochMs':ms,'sourceSemantics':'explicit-offset-rfc3339','interpretable':True}

def weekday_map(values):
    if not isinstance(values,list) or any(not integer(v,0,6) for v in values):raise ValueError('invalid-weekday')
    return [7 if v==0 else int(v) for v in values]

def field(data,name):
    value=data.get(name,MISSING)
    result={'presence':'missing' if value is MISSING else 'json-null' if value is None else 'value',
            'interpretable':False,'diagnostics':[]}
    if value is MISSING or value is None:return result
    try:
        if name in {'parentId','seriesId','generatedFrom'}:
            if value=='':result['value']='';result['interpretable']=True;return result
            if not valid_id(value):raise ValueError('invalid-reference')
        elif name=='quadrant':
            if not integer(value,0,3):raise ValueError('invalid-type-or-range')
        elif name=='reminderAt':
            if not integer(value,-MAX,MAX):raise ValueError('invalid-type-or-range')
            result['canSchedule']=value>=0 and value<=civil('9998-12-31T23:59')['epochMs']
        elif name in {'done','allDay','archived'}:
            if type(value) is not bool:raise ValueError('invalid-boolean')
        elif name in {'start','end'}:
            if value=='':result['value']='';result['interpretable']=True;result['canSchedule']=False;return result
            result.update(civil(value));return result
        elif name in {'createdAt','completedAt'}:
            if value=='':result['value']='';result['interpretable']=True;return result
            result.update(instant(value));return result
        elif name in {'weight','order'}:
            if type(value) not in {int,float} or not math.isfinite(value) or name=='weight' and not 0<=value<=100:raise ValueError('invalid-number')
        elif name=='tags':
            if not isinstance(value,list) or any(not isinstance(v,str) or not valid_id(v) for v in value):raise ValueError('invalid-array')
        elif name=='repeat':
            result['value']=repeat(value);result['interpretable']=True;return result
        elif name=='reminder':
            if not isinstance(value,dict) or value.get('mode') not in {'offset','day','custom'}:raise ValueError('invalid-reminder')
            mode=value['mode']
            if mode=='offset' and not integer(value.get('minutes'),0,525600):raise ValueError('invalid-minutes')
            if mode=='day' and not integer(value.get('days'),0,365):raise ValueError('invalid-days')
            if mode=='custom':civil(value.get('at'))
        else:
            if not isinstance(value,str):raise ValueError('invalid-text')
        result['value']=value;result['interpretable']=True
    except (ValueError,TypeError,OverflowError) as e:result['diagnostics'].append(str(e))
    return result

def repeat(value):
    if not isinstance(value,dict) or value.get('frequency') not in {'daily','weekdays','weekly','monthly','yearly'}:raise ValueError('invalid-frequency')
    if not integer(value.get('interval'),1,365):raise ValueError('invalid-interval')
    if value['frequency']=='weekdays' and value['interval']!=1:raise ValueError('BLOCKER: weekdays interval ambiguity')
    anchor=civil(value.get('anchor'))
    if 'weekdays' not in value:raise ValueError('missing-weekdays')
    days=weekday_map(value['weekdays'])
    until=value.get('until',MISSING)
    if until is MISSING:raise ValueError('missing-until')
    if until!='':date(until)
    return {'frequency':value['frequency'],'interval':int(value['interval']),'isoWeekdays':days,
            'anchor':anchor['civil'],'until':until,'sourceSemantics':'legacy-shanghai-fixed-offset-v1'}

def next_occurrence(current,rule):
    c=civil(current);a=civil(rule['anchor']);r=rule
    if a['epochMs']>c['epochMs']:raise ValueError('BLOCKER: anchor after current')
    if not integer(r['interval'],1,365):raise ValueError('invalid-interval')
    d=dt.datetime.fromisoformat(current);origin=dt.datetime.fromisoformat(r['anchor'])
    f=r['frequency'];step=int(r['interval']);result=None
    if f in {'monthly','yearly'}:
        step*=12 if f=='yearly' else 1
        base=origin.year*12+origin.month-1;cm=d.year*12+d.month-1
        month=base+(max(1,(cm-base)//step+1))*step;y,m=divmod(month,12);m+=1
        if y>9999:return None
        result=d.replace(year=y,month=m,day=min(origin.day,calendar.monthrange(y,m)[1]))
    elif f=='daily':
        try:result=d+dt.timedelta(days=step)
        except OverflowError:return None
    elif f in {'weekly','weekdays'}:
        if f=='weekdays' and step!=1:raise ValueError('BLOCKER: weekdays interval ambiguity')
        days=[1,2,3,4,5] if f=='weekdays' else r['isoWeekdays'] or [origin.isoweekday()]
        if any(not integer(v,1,7) for v in days):raise ValueError('invalid-weekday')
        monday=origin.date()-dt.timedelta(days=origin.weekday())
        for n in range(1,7*366+1):
            try:candidate=d+dt.timedelta(days=n)
            except OverflowError:return None
            candidate_monday=candidate.date()-dt.timedelta(days=candidate.weekday())
            if candidate.isoweekday() in days and (f=='weekdays' or (candidate_monday-monday).days//7%step==0):result=candidate;break
    else:raise ValueError('invalid-frequency')
    if result is None:return None
    text=result.isoformat(timespec='minutes')
    if r['until'] and result.date()>date(r['until']):return None
    projected=civil(text)
    return {'civil':text,'epochMs':projected['epochMs'],'interpretable':True,
            'canSchedule':c['canSchedule'] and a['canSchedule'] and projected['canSchedule']}

def reminder(data):
    if data.get('done') is True or data.get('reminder') is None:return {'state':'not-scheduled'}
    rule=data.get('reminder');validated=field({'reminder':rule},'reminder')
    if not validated['interpretable']:return {'state':'blocked','diagnostics':validated['diagnostics']}
    mode=rule['mode']
    try:
        input_time=civil(rule['at']) if mode=='custom' else civil(data['start'])
        ms=civil(rule['at'])['epochMs'] if mode=='custom' else civil(data['start'][:10]+'T09:00')['epochMs']-rule['days']*86400000 if mode=='day' else civil(data['start'])['epochMs']-rule['minutes']*60000
        return {'state':'derived','epochMs':ms,'interpretable':True,
                'canSchedule':data.get('done',MISSING) is False and input_time['canSchedule'] and ms>=0 and ms<=civil('9998-12-31T23:59')['epochMs'],
                'diagnostics':[] if data.get('done',MISSING) is False else ['unknown-or-invalid-done-control'],
                'mismatch':'reminderAt' in data and data['reminderAt']!=ms}
    except (ValueError,KeyError,TypeError) as e:return {'state':'blocked','diagnostics':[str(e)]}

def relationship(raw_name,rows,kind='projects',complete=True,conflict=False):
    result={'status':'unknown','candidates':[]}
    if not complete:return result
    if conflict:result['status']='conflict';return result
    if raw_name is MISSING or raw_name is None or raw_name=='':result['status']='unset';return result
    if not isinstance(raw_name,str):result['status']='invalid';return result
    candidates=[r['id'] for r in rows if r['kind']==kind and not r['deleted'] and parse_raw(r['data']).get('name')==raw_name]
    if any(not valid_id(v) for v in candidates):result['status']='invalid';return result
    result['candidates']=sorted(candidates)
    result['status']='resolved' if len(candidates)==1 else 'ambiguous' if candidates else 'missing'
    if len(candidates)==1:result['targetId']=candidates[0]
    return result

def parent_relation(value,rows,self_id):
    if value is MISSING or value is None or value=='':return {'status':'unset'}
    if not valid_id(value):return {'status':'invalid'}
    tasks={r['id']:r for r in rows if r['kind']=='tasks'}
    cursor=value;seen={self_id}
    for depth in range(64):
        if cursor in seen:return {'status':'cycle'}
        seen.add(cursor)
        if cursor not in tasks:return {'status':'missing'}
        if tasks[cursor]['deleted']:return {'status':'deletedTarget','targetId':cursor}
        next_value=parse_raw(tasks[cursor]['data']).get('parentId',MISSING)
        if next_value is MISSING or next_value=='':return {'status':'unknown'}
        if next_value is None:return {'status':'resolved','targetId':value}
        if not valid_id(next_value):return {'status':'invalid'}
        cursor=next_value
    return {'status':'depthExceeded'}

def project(row,rows):
    data=parse_raw(row['data'])
    if not isinstance(data,dict):return {'status':'invalid-source'}
    names=['title','notes','review','body','name','description','quadrant','done','allDay','archived','weight','order','start','end','createdAt','completedAt','parentId','project','place','tags','seriesId','generatedFrom','repeat','reminder','reminderAt']
    fields={name:field(data,name) for name in names}
    relations={}
    if row['kind']=='tasks':
        relations['project']=relationship(data.get('project',MISSING),rows,conflict=parse_raw(row['conflicts'])!=[])
        relations['parent']=parent_relation(data.get('parentId',MISSING),rows,row['id'])
        relations['place']=relationship(data.get('place',MISSING),rows,kind='places')
        generated=data.get('generatedFrom',MISSING)
        if generated is MISSING or generated is None or generated=='':relations['generatedFrom']={'status':'unset'}
        elif not valid_id(generated):relations['generatedFrom']={'status':'invalid'}
        else:
            target=next((r for r in rows if r['kind']=='tasks' and r['id']==generated),None)
            relations['generatedFrom']={'status':'missing'} if target is None else {'status':'deletedTarget' if target['deleted'] else 'resolved','targetId':generated}
    return {'key':['synthetic-ledger',row['kind'],row['id']],'deleted':bool(row['deleted']),
            'fields':fields,'relations':relations,'reminder':reminder(data) if row['kind']=='tasks' else None}
