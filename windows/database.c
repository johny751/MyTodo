#include "native.h"
static int exec(DB*d,const char*s){char*e=0;int r=sqlite3_exec(d->sql,s,0,0,&e);if(r!=SQLITE_OK){snprintf(d->error,sizeof(d->error),"%s",e?e:sqlite3_errmsg(d->sql));sqlite3_free(e);return 0;}return 1;}
int db_begin(DB*d){return exec(d,"BEGIN IMMEDIATE");} int db_end(DB*d,int ok){if(ok){if(exec(d,"COMMIT"))return 1;}exec(d,"ROLLBACK");return 0;}
J *db_meta(DB*d){sqlite3_stmt*s=0;J*j=0;if(sqlite3_prepare_v2(d->sql,"SELECT value FROM meta WHERE id=1",-1,&s,0)==SQLITE_OK&&sqlite3_step(s)==SQLITE_ROW)j=cJSON_Parse((char*)sqlite3_column_text(s,0));sqlite3_finalize(s);return j;}
int db_meta_save(DB*d,J*m,int data){sn(m,"revision",num(m,"revision")+1);if(data)sn(m,"dataRevision",num(m,"dataRevision")+1);char*t=json(m);sqlite3_stmt*s=0;int ok=sqlite3_prepare_v2(d->sql,"UPDATE meta SET value=? WHERE id=1",-1,&s,0)==SQLITE_OK;if(ok){sqlite3_bind_text(s,1,t,-1,SQLITE_TRANSIENT);ok=sqlite3_step(s)==SQLITE_DONE;}if(!ok)snprintf(d->error,sizeof(d->error),"%s",sqlite3_errmsg(d->sql));sqlite3_finalize(s);free(t);return ok;}
static J *decode(sqlite3_stmt*s){J*r=cJSON_CreateObject();ss(r,"key",(char*)sqlite3_column_text(s,0));set(r,"data",cJSON_Parse((char*)sqlite3_column_text(s,1)));set(r,"record",cJSON_Parse((char*)sqlite3_column_text(s,2)));set(r,"deleted",cJSON_CreateBool(sqlite3_column_int(s,3)));set(r,"conflicts",cJSON_Parse((char*)sqlite3_column_text(s,4)));return r;}
J *db_row(DB*d,const char*k){sqlite3_stmt*s=0;J*r=0;if(sqlite3_prepare_v2(d->sql,"SELECT key,data,record,deleted,conflicts FROM entities WHERE key=?",-1,&s,0)==SQLITE_OK){sqlite3_bind_text(s,1,k,-1,SQLITE_TRANSIENT);if(sqlite3_step(s)==SQLITE_ROW)r=decode(s);}sqlite3_finalize(s);return r;}
J *db_page(DB*d,const char*after,int limit){J*a=cJSON_CreateArray();sqlite3_stmt*s=0;if(sqlite3_prepare_v2(d->sql,"SELECT key,data,record,deleted,conflicts FROM entities WHERE key>? ORDER BY key LIMIT ?",-1,&s,0)==SQLITE_OK){sqlite3_bind_text(s,1,after,-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,2,limit);while(sqlite3_step(s)==SQLITE_ROW)cJSON_AddItemToArray(a,decode(s));}sqlite3_finalize(s);return a;}
J *db_outbox(DB*d,int limit){J*a=cJSON_CreateArray();sqlite3_stmt*s=0;if(sqlite3_prepare_v2(d->sql,"SELECT id,event FROM outbox ORDER BY id LIMIT ?",-1,&s,0)==SQLITE_OK){sqlite3_bind_int(s,1,limit);while(sqlite3_step(s)==SQLITE_ROW){J*j=cJSON_CreateObject();sn(j,"id",(double)sqlite3_column_int64(s,0));set(j,"event",cJSON_Parse((char*)sqlite3_column_text(s,1)));cJSON_AddItemToArray(a,j);}}sqlite3_finalize(s);return a;}
int db_put(DB*d,J*r){J*k=cJSON_Parse(str(r,"key")),*v=get(r,"data");const char*q="INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,id=excluded.id,data=excluded.data,record=excluded.record,deleted=excluded.deleted,conflicts=excluded.conflicts,parent_id=excluded.parent_id,done=excluded.done,quadrant=excluded.quadrant,reminder_at=excluded.reminder_at,start=excluded.start";sqlite3_stmt*s=0;int ok=sqlite3_prepare_v2(d->sql,q,-1,&s,0)==SQLITE_OK;char*t=json(v),*rec=json(get(r,"record")),*cf=json(get(r,"conflicts"));if(ok){sqlite3_bind_text(s,1,str(r,"key"),-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,2,cJSON_GetArrayItem(k,0)->valuestring,-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,3,cJSON_GetArrayItem(k,1)->valuestring,-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,4,t,-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,5,rec,-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,6,truth(r,"deleted"));sqlite3_bind_text(s,7,cf,-1,SQLITE_TRANSIENT);if(*str(v,"parentId"))sqlite3_bind_text(s,8,str(v,"parentId"),-1,SQLITE_TRANSIENT);else sqlite3_bind_null(s,8);sqlite3_bind_int(s,9,truth(v,"done"));if(cJSON_IsNumber(get(v,"quadrant")))sqlite3_bind_int(s,10,(int)num(v,"quadrant"));else sqlite3_bind_null(s,10);if(cJSON_IsNumber(get(v,"reminderAt")))sqlite3_bind_int64(s,11,(sqlite3_int64)num(v,"reminderAt"));else sqlite3_bind_null(s,11);sqlite3_bind_text(s,12,str(v,"start"),-1,SQLITE_TRANSIENT);ok=sqlite3_step(s)==SQLITE_DONE;}if(!ok)snprintf(d->error,sizeof(d->error),"%s",sqlite3_errmsg(d->sql));sqlite3_finalize(s);cJSON_Delete(k);free(t);free(rec);free(cf);return ok;}
static double n0(J *object, const char *key) {
    double value = num(object,key);
    return isfinite(value) ? value : 0;
}

int protocol_actor_valid(const char *actor) {
    if (!actor || !*actor || strlen(actor) > 80) return 0;
    for (; *actor; actor++) {
        char ch = *actor;
        if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
              (ch >= '0' && ch <= '9') || ch == '-')) return 0;
    }
    return 1;
}

int protocol_counter_valid(double value, int positive) {
    return value >= positive && value <= (double)PROTOCOL_MAX_COUNTER && value == floor(value);
}

int protocol_counter_map_valid(J *map, int limit) {
    if (!cJSON_IsObject(map) || (limit && cJSON_GetArraySize(map) > limit)) return 0;
    J *item;
    cJSON_ArrayForEach(item,map) {
        if (!protocol_actor_valid(item->string) || !cJSON_IsNumber(item) ||
            !protocol_counter_valid(item->valuedouble,0) || get(map,item->string) != item) return 0;
    }
    return 1;
}

int protocol_text_valid(const char *text) {
    return text && *text && MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text,-1,0,0) > 0;
}

/* cJSON strings are NUL-terminated. Detect a JSON NUL escape before decoding. */
int protocol_json_without_nul(const char *json_text) {
    if (!json_text) return 0;
    for (const char *p = json_text; *p; p++) {
        if (*p != '\\') continue;
        if (!p[1] || !strncmp(p+1,"u0000",5)) return 0;
        p++;
    }
    return 1;
}

int protocol_event_valid(J *event) {
    if (!cJSON_IsObject(event)) return 0;
    const char *text = str(event,"key");
    J *key = protocol_json_without_nul(text) ? cJSON_ParseWithOpts(text,0,1) : 0;
    J *kind = cJSON_GetArrayItem(key,0), *id = cJSON_GetArrayItem(key,1);
    int valid = cJSON_IsArray(key) && cJSON_GetArraySize(key) == 2 &&
        cJSON_IsString(kind) && cJSON_IsString(id) && protocol_text_valid(id->valuestring) &&
        strlen(id->valuestring) <= 800;
    if (valid) {
        const char *name=kind->valuestring;
        valid = !strcmp(name,"tasks") || !strcmp(name,"notes") || !strcmp(name,"projects") ||
                !strcmp(name,"tags") || !strcmp(name,"places");
    }
    cJSON_Delete(key);
    if (!valid || !protocol_actor_valid(str(event,"actor")) ||
        !protocol_counter_valid(num(event,"seq"),1) || !protocol_counter_valid(num(event,"clock"),1) ||
        !protocol_counter_map_valid(get(event,"context"),256) || !cJSON_IsObject(get(event,"values"))) return 0;
    J *field;
    cJSON_ArrayForEach(field,get(event,"values")) {
        const char *name = field->string;
        if (get(get(event,"values"),name) != field || !strcmp(name,"__proto__") || !strcmp(name,"constructor") ||
            !strcmp(name,"prototype") || !strcmp(name,"subtasks")) return 0;
    }
    return 1;
}

static int covered(J *context,J *event) {
    return n0(context,str(event,"actor")) >= n0(event,"seq");
}

static int compare_events(J *left,J *right) {
    double a = num(left,"clock"), b = num(right,"clock");
    if (a != b) return a < b ? -1 : 1;
    int actor = strcmp(str(left,"actor"),str(right,"actor"));
    if (actor) return actor;
    a = num(left,"seq");
    b = num(right,"seq");
    return a < b ? -1 : a > b;
}

static int compare_event_items(const void *left,const void *right) {
    return compare_events(*(J *const *)left,*(J *const *)right);
}

static int compare_field_items(const void *left,const void *right) {
    return strcmp((*(J *const *)left)->string,(*(J *const *)right)->string);
}

static J **ordered_items(J *collection,int count,int (*compare)(const void *,const void *)) {
    if (!count) return 0;
    J **items = malloc((size_t)count*sizeof(*items));
    if (!items) return 0;
    J *item;
    int index = 0;
    cJSON_ArrayForEach(item,collection) items[index++] = item;
    qsort(items,count,sizeof(*items),compare);
    return items;
}

static int sort_record_events(J *record) {
    J *events = get(record,"events");
    int count = cJSON_GetArraySize(events);
    if (count < 2) return 1;
    J **items = ordered_items(events,count,compare_event_items);
    J *sorted = cJSON_CreateArray();
    if (!items || !sorted) {
        free(items);
        cJSON_Delete(sorted);
        return 0;
    }
    for (int i=0;i<count;i++) cJSON_AddItemToArray(sorted,cJSON_DetachItemViaPointer(events,items[i]));
    free(items);
    set(record,"events",sorted);
    return 1;
}

static int equal_field(J *left,J *right) {
    if (!left || !right) return left == right;
    if (cJSON_IsNumber(left) && cJSON_IsNumber(right)) return left->valuedouble == right->valuedouble;
    if (cJSON_IsObject(left) && cJSON_IsObject(right)) {
        if (cJSON_GetArraySize(left) != cJSON_GetArraySize(right)) return 0;
        J *field;
        cJSON_ArrayForEach(field,left) {
            if (!equal_field(field,get(right,field->string))) return 0;
        }
        return 1;
    }
    if (cJSON_IsArray(left) && cJSON_IsArray(right)) {
        J *a=left->child, *b=right->child;
        for (;a && b;a=a->next,b=b->next) if (!equal_field(a,b)) return 0;
        return !a && !b;
    }
    return eq(left,right);
}

J *record_apply(DB *db,J *record,J *event) {
    if (!protocol_event_valid(event) || (record && strcmp(str(record,"key"),str(event,"key")))) {
        strcpy(db->error,"Invalid sync event");
        return 0;
    }
    J *out = record ? dup(record) : cJSON_CreateObject();
    if (!record) {
        ss(out,"key",str(event,"key"));
        set(out,"events",cJSON_CreateArray());
    }
    J *events = get(out,"events");
    J *old;
    cJSON_ArrayForEach(old,events) {
        if (strcmp(str(old,"actor"),str(event,"actor")) || num(old,"seq") != num(event,"seq")) continue;
        J *field;
        cJSON_ArrayForEach(field,get(old,"values")) {
            J *incoming_field = get(get(event,"values"),field->string);
            if (incoming_field && !equal_field(field,incoming_field)) {
                cJSON_Delete(out);
                strcpy(db->error,"Duplicate device event changed");
                return 0;
            }
        }
        goto sort;
    }
    J *incoming = dup(event);
    cJSON_DeleteItemFromObjectCaseSensitive(incoming,"key");
    cJSON_ArrayForEach(old,events) {
        J *field = get(incoming,"values")->child;
        while (field) {
            J *next = field->next;
            if (get(get(old,"values"),field->string)) {
                if (covered(get(old,"context"),incoming))
                    cJSON_DeleteItemFromObjectCaseSensitive(get(incoming,"values"),field->string);
                else if (covered(get(incoming,"context"),old))
                    cJSON_DeleteItemFromObjectCaseSensitive(get(old,"values"),field->string);
            }
            field = next;
        }
    }
    old = events->child;
    while (old) {
        J *next = old->next;
        if (!cJSON_GetArraySize(get(old,"values"))) cJSON_Delete(cJSON_DetachItemViaPointer(events,old));
        old = next;
    }
    if (cJSON_GetArraySize(get(incoming,"values"))) cJSON_AddItemToArray(events,incoming);
    else cJSON_Delete(incoming);
sort:
    if (sort_record_events(out)) return out;
    cJSON_Delete(out);
    strcpy(db->error,"Cannot sort sync record");
    return 0;
}

J *record_row(J *record) {
    J *fields = cJSON_CreateObject(), *events = get(record,"events"), *row = 0;
    int event_count=cJSON_GetArraySize(events);
    J **ordered=ordered_items(events,event_count,compare_event_items), **ordered_fields=0;
    if (event_count && !ordered) goto done;
    for (int i=0;i<event_count;i++) {
        J *event=ordered[i], *value;
        cJSON_ArrayForEach(value,get(event,"values")) {
            J *values = get(fields,value->string);
            if (!values) {
                values = cJSON_CreateArray();
                set(fields,value->string,values);
            }
            J *choice = cJSON_CreateObject();
            set(choice,"value",dup(value));
            ss(choice,"device",str(event,"actor"));
            cJSON_AddItemToArray(values,choice);
        }
    }
    int field_count=cJSON_GetArraySize(fields);
    ordered_fields=ordered_items(fields,field_count,compare_field_items);
    if (field_count && !ordered_fields) goto done;
    J *data=cJSON_CreateObject(), *conflicts=cJSON_CreateArray();
    int deleted=0;
    for (int i=0;i<field_count;i++) {
        J *field=ordered_fields[i], *choices=cJSON_CreateArray(), *choice, *winner=0;
        int deletion=!strcmp(field->string,"_deleted");
        cJSON_ArrayForEach(choice,field) {
            J *value=get(choice,"value"), *prior;
            winner=value;
            if (deletion && cJSON_IsTrue(value)) deleted=1;
            cJSON_ArrayForEach(prior,choices) if (equal_field(value,get(prior,"value"))) break;
            if (!prior) cJSON_AddItemToArray(choices,dup(choice));
        }
        if (!deletion) set(data,field->string,dup(winner));
        if (cJSON_GetArraySize(choices)>1) {
            J *conflict=cJSON_CreateObject();
            ss(conflict,"key",str(record,"key"));
            ss(conflict,"field",field->string);
            set(conflict,"values",choices);
            cJSON_AddItemToArray(conflicts,conflict);
        } else cJSON_Delete(choices);
    }
    J *key=cJSON_Parse(str(record,"key"));
    const char *id=cJSON_GetStringValue(cJSON_GetArrayItem(key,1));
    ss(data,"id",id);
    const char *title=str(data,"title");
    if (!*title) title=str(data,"name");
    if (!*title) title=str(data,"body");
    if (!*title) title=id;
    J *conflict;
    cJSON_ArrayForEach(conflict,conflicts) ss(conflict,"title",title);
    row=cJSON_CreateObject();
    ss(row,"key",str(record,"key"));
    set(row,"data",data);
    set(row,"record",dup(record));
    set(row,"deleted",cJSON_CreateBool(deleted));
    set(row,"conflicts",conflicts);
    cJSON_Delete(key);
done:
    free(ordered);
    free(ordered_fields);
    cJSON_Delete(fields);
    return row;
}
static int queue(DB*d,J*m,J*e){sqlite3_stmt*s=0;double id=num(m,"queue");if(!protocol_counter_valid(id,0)||id>=(double)PROTOCOL_MAX_COUNTER){strcpy(d->error,"Outbox sequence limit reached");return 0;}sn(m,"queue",id+1);char*t=json(e);int ok=sqlite3_prepare_v2(d->sql,"INSERT INTO outbox VALUES(?,?)",-1,&s,0)==SQLITE_OK;if(ok){sqlite3_bind_int64(s,1,(sqlite3_int64)num(m,"queue"));sqlite3_bind_text(s,2,t,-1,SQLITE_TRANSIENT);ok=sqlite3_step(s)==SQLITE_DONE;}free(t);sqlite3_finalize(s);return ok;}
extern void undo_capture(DB*d,J*changes);
int db_local(DB*d,J*changes,J*context){if(context&&!cJSON_IsNull(context)&&!protocol_counter_map_valid(context,256)){strcpy(d->error,"Invalid sync context");return 0;}if(cJSON_IsNull(context))context=0;undo_capture(d,changes);if(!cJSON_GetArraySize(changes))return 1;if(!db_begin(d))return 0;J*m=db_meta(d),*c;int ok=m!=0;cJSON_ArrayForEach(c,changes){if(!ok)break;if(!protocol_counter_valid(num(m,"seq"),0)||!protocol_counter_valid(num(m,"clock"),0)||num(m,"seq")>=(double)PROTOCOL_MAX_COUNTER||num(m,"clock")>=(double)PROTOCOL_MAX_COUNTER){strcpy(d->error,"Local event sequence limit reached");ok=0;break;}J*e=dup(c);double seq=n0(m,"seq")+1;sn(m,"seq",seq);sn(m,"clock",n0(m,"clock")+1);ss(e,"actor",str(m,"actor"));sn(e,"seq",seq);sn(e,"clock",num(m,"clock"));J*ctx=dup(context?context:get(m,"vector"));sn(ctx,str(m,"actor"),seq-1);set(e,"context",ctx);sn(get(m,"vector"),str(m,"actor"),seq);J*row=db_row(d,str(e,"key")),*r=record_apply(d,get(row,"record"),e),*next=r?record_row(r):0;ok=next&&db_put(d,next)&&queue(d,m,e);cJSON_Delete(row);cJSON_Delete(r);cJSON_Delete(next);cJSON_Delete(e);}if(ok)ok=db_meta_save(d,m,1);cJSON_Delete(m);return db_end(d,ok);}
int db_remote(DB*d,J*events,const char*device,double index){if(!cJSON_IsArray(events)||(device&&(!protocol_actor_valid(device)||!protocol_counter_valid(index,1)))){strcpy(d->error,"Invalid sync cursor or events");return 0;}if(!db_begin(d))return 0;J*m=db_meta(d),*e;int ok=m&&protocol_counter_map_valid(get(m,"vector"),0)&&protocol_counter_map_valid(get(m,"cursors"),0)&&protocol_counter_valid(num(m,"clock"),0);if(!ok)strcpy(d->error,"Invalid local sync progress; outbox retained");cJSON_ArrayForEach(e,events){if(!ok)break;J*old=db_row(d,str(e,"key")),*r=record_apply(d,get(old,"record"),e),*row=r?record_row(r):0;ok=row&&db_put(d,row);if(ok){sn(get(m,"vector"),str(e,"actor"),fmax(n0(get(m,"vector"),str(e,"actor")),num(e,"seq")));J*v;cJSON_ArrayForEach(v,get(e,"context"))sn(get(m,"vector"),v->string,fmax(n0(get(m,"vector"),v->string),v->valuedouble));sn(m,"clock",fmax(n0(m,"clock"),num(e,"clock")));}cJSON_Delete(old);cJSON_Delete(r);cJSON_Delete(row);}if(ok&&device)sn(get(m,"cursors"),device,fmax(n0(get(m,"cursors"),device),index));if(ok)ok=db_meta_save(d,m,cJSON_GetArraySize(events)>0);cJSON_Delete(m);return db_end(d,ok);}
static char *key_for(const char*kind,const char*id){J*a=cJSON_CreateArray();cJSON_AddItemToArray(a,cJSON_CreateString(kind));cJSON_AddItemToArray(a,cJSON_CreateString(id));char*s=json(a);cJSON_Delete(a);return s;}
int db_edit_data(DB*d,const char*key,J*before,J*after,J*context){J*values=cJSON_CreateObject(),*v;cJSON_ArrayForEach(v,after)if(!eq(v,get(before,v->string)))set(values,v->string,dup(v));if(!before)set(values,"_deleted",cJSON_CreateFalse());J*c=cJSON_CreateObject(),*a=cJSON_CreateArray();ss(c,"key",key);set(c,"values",values);if(cJSON_GetArraySize(values))cJSON_AddItemToArray(a,c);else cJSON_Delete(c);int ok=db_local(d,a,context);cJSON_Delete(a);return ok;}
int db_count(DB*d,const char*kind){sqlite3_stmt*s=0;int n=0;if(sqlite3_prepare_v2(d->sql,"SELECT count(*) FROM entities WHERE kind=? AND deleted=0",-1,&s,0)==SQLITE_OK){sqlite3_bind_text(s,1,kind,-1,SQLITE_TRANSIENT);if(sqlite3_step(s)==SQLITE_ROW)n=sqlite3_column_int(s,0);}sqlite3_finalize(s);return n;}
J *task_default(DB*d,int q,const char*parent){J*j=cJSON_CreateObject();char id[80],stamp[40];uuid(id);now(stamp);ss(j,"id",id);ss(j,"title","");sn(j,"quadrant",q);sn(j,"order",(double)time(0));set(j,"done",cJSON_CreateFalse());const char*fields[]={"start","end","seriesId","generatedFrom","review","project","place","notes","completedAt"};for(int i=0;i<9;i++)ss(j,fields[i],"");ss(j,"createdAt",stamp);set(j,"allDay",cJSON_CreateFalse());set(j,"repeat",cJSON_CreateNull());set(j,"reminder",cJSON_CreateNull());set(j,"reminderAt",cJSON_CreateNull());sn(j,"weight",0);set(j,"tags",cJSON_CreateArray());set(j,"parentId",parent&&*parent?cJSON_CreateString(parent):cJSON_CreateNull());return j;}
static int import_task(DB*d,J*t,const char*parent,J*changes,int depth){if(depth>64||!cJSON_IsObject(t)||!cJSON_IsString(get(t,"id"))||!*str(t,"id")||strlen(str(t,"id"))>800||!cJSON_IsString(get(t,"title"))||!cJSON_IsArray(get(t,"subtasks"))||cJSON_GetArraySize(get(t,"subtasks"))>100)return 0;J*data=dup(t);cJSON_DeleteItemFromObjectCaseSensitive(data,"subtasks");set(data,"parentId",parent?cJSON_CreateString(parent):cJSON_CreateNull());char*k=key_for("tasks",str(t,"id"));if(!*str(t,"id")){free(k);cJSON_Delete(data);return 0;}J*old=db_row(d,k);if(old&&!eq(get(old,"data"),data)){char id[80];uuid(id);ss(data,"id",id);free(k);k=key_for("tasks",id);cJSON_Delete(old);old=0;}if(!old){J*c=cJSON_CreateObject();ss(c,"key",k);set(data,"_deleted",cJSON_CreateFalse());set(c,"values",dup(data));cJSON_AddItemToArray(changes,c);}J*child;int ok=1;cJSON_ArrayForEach(child,get(t,"subtasks"))if(!import_task(d,child,str(data,"id"),changes,depth+1))ok=0;cJSON_Delete(data);cJSON_Delete(old);free(k);return ok;}
int db_import(DB*d,J*state){if(!cJSON_IsObject(state)||!cJSON_IsArray(get(state,"tasks"))||!cJSON_IsArray(get(state,"notes"))||!cJSON_IsArray(get(state,"projects"))||!cJSON_IsArray(get(state,"tags"))||!cJSON_IsArray(get(state,"places"))||!(num(state,"version")==1||num(state,"version")==2)){strcpy(d->error,"Invalid business backup");return 0;}J*a=cJSON_CreateArray(),*t;int ok=1;cJSON_ArrayForEach(t,get(state,"tasks"))if(!import_task(d,t,0,a,0))ok=0;const char*kinds[]={"notes","projects","tags","places"};for(int i=0;i<4;i++){cJSON_ArrayForEach(t,get(state,kinds[i])){if((i<2&&!cJSON_IsObject(t))||(i>=2&&!cJSON_IsString(t))){ok=0;break;}J*data=i<2?dup(t):cJSON_CreateObject();if(i>=2){ss(data,"id",t->valuestring);ss(data,"name",t->valuestring);}if(!*str(data,"id")){ok=0;cJSON_Delete(data);break;}char*k=key_for(kinds[i],str(data,"id"));J*r=db_row(d,k);if(!r){J*c=cJSON_CreateObject();ss(c,"key",k);set(data,"_deleted",cJSON_CreateFalse());set(c,"values",data);cJSON_AddItemToArray(a,c);}else cJSON_Delete(data);cJSON_Delete(r);free(k);}}if(cJSON_GetArraySize(a)+db_count(d,"tasks")>100000)ok=0;if(ok)ok=db_local(d,a,0);else strcpy(d->error,"Invalid or excessive backup records");cJSON_Delete(a);return ok;}
J *db_export(DB*d){J*s=cJSON_CreateObject(),*m=db_meta(d);sn(s,"version",2);set(s,"settings",dup(get(m,"settings")));cJSON_Delete(m);const char*kinds[]={"tasks","notes","projects","tags","places"};for(int i=0;i<5;i++)set(s,kinds[i],cJSON_CreateArray());J*map=cJSON_CreateObject();sqlite3_stmt*q=0;if(sqlite3_prepare_v2(d->sql,"SELECT kind,data FROM entities WHERE deleted=0 ORDER BY start,key",-1,&q,0)==SQLITE_OK)while(sqlite3_step(q)==SQLITE_ROW){const char*kind=(char*)sqlite3_column_text(q,0);J*data=cJSON_Parse((char*)sqlite3_column_text(q,1));if(!strcmp(kind,"tasks")){set(data,"subtasks",cJSON_CreateArray());set(map,str(data,"id"),data);}else if(!strcmp(kind,"tags")||!strcmp(kind,"places")){cJSON_AddItemToArray(get(s,kind),cJSON_CreateString(str(data,"name")));cJSON_Delete(data);}else cJSON_AddItemToArray(get(s,kind),data);}sqlite3_finalize(q);J*t;cJSON_ArrayForEach(t,map){J*p=get(map,str(t,"parentId")),*cursor=p;int depth=0;while(cursor){if(cursor==t||++depth>64){p=0;break;}cursor=get(map,str(cursor,"parentId"));}cJSON_AddItemReferenceToArray(p?get(p,"subtasks"):get(s,"tasks"),t);}cJSON_ArrayForEach(t,map)cJSON_DeleteItemFromObjectCaseSensitive(t,"parentId");J*result=dup(s);/* remove parentId in duplicate recursively below */cJSON_Delete(s);cJSON_Delete(map);return result;}
int db_check(DB*d){sqlite3_stmt*s=0;int ok=sqlite3_prepare_v2(d->sql,"PRAGMA integrity_check",-1,&s,0)==SQLITE_OK&&sqlite3_step(s)==SQLITE_ROW&&!strcmp((char*)sqlite3_column_text(s,0),"ok");sqlite3_finalize(s);return ok;}
int db_open(DB*d,const wchar_t*dir){memset(d,0,sizeof(*d));wcscpy(d->dir,dir);if(!ensure_dir(dir)){strcpy(d->error,"Cannot create data directory");return 0;}wchar_t file[32768];join(file,dir,L"tasks.sqlite");char*p=utf8(file);int r=sqlite3_open_v2(p,&d->sql,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,0);free(p);if(r!=SQLITE_OK){snprintf(d->error,sizeof(d->error),"%s",sqlite3_errmsg(d->sql));return 0;}sqlite3_busy_timeout(d->sql,5000);if(!exec(d,"PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT); CREATE INDEX IF NOT EXISTS task_filter ON entities(kind,deleted,done,quadrant,start); CREATE INDEX IF NOT EXISTS task_reminders ON entities(kind,deleted,done,reminder_at); CREATE INDEX IF NOT EXISTS task_parent ON entities(parent_id); CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL);"))return 0;J*m=db_meta(d);if(!m){m=cJSON_CreateObject();char id[80];uuid(id);sn(m,"version",2);sn(m,"revision",0);sn(m,"dataRevision",0);ss(m,"actor",id);const char*n[]={"seq","clock","queue"};for(int i=0;i<3;i++)sn(m,n[i],0);const char*o[]={"vector","cursors","settings"};for(int i=0;i<3;i++)set(m,o[i],cJSON_CreateObject());set(m,"scope",cJSON_CreateNull());set(m,"epoch",cJSON_CreateNull());set(m,"pending",cJSON_CreateNull());set(m,"initialized",cJSON_CreateTrue());J*settings=get(m,"settings");set(settings,"swipeMenu",cJSON_CreateTrue());set(settings,"swipeComplete",cJSON_CreateTrue());sn(settings,"longPressMs",3000);sn(settings,"undoMs",8000);char*t=json(m);sqlite3_stmt*s;sqlite3_prepare_v2(d->sql,"INSERT INTO meta VALUES(1,?)",-1,&s,0);sqlite3_bind_text(s,1,t,-1,SQLITE_TRANSIENT);r=sqlite3_step(s);sqlite3_finalize(s);free(t);if(r!=SQLITE_DONE){cJSON_Delete(m);return 0;}}else if(num(m,"version")!=2||!protocol_actor_valid(str(m,"actor"))){strcpy(d->error,"Unsupported database metadata");cJSON_Delete(m);return 0;}cJSON_Delete(m);return 1;}
void db_close(DB*d){if(d->sql)sqlite3_close(d->sql);d->sql=0;}
