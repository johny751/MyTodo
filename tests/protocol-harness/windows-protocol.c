/* C0-03 CLI: production SQLite/merge and production sync bodies.
 * Compile only with the reviewed cloud builder's single-flag loopback copy.
 */
#include "../../windows/native.h"
#include <limits.h>
#ifndef GXTODO_PROTOCOL_SYNC_SOURCE
#error The cloud builder must select the reviewed fixture copy of sync.c.
#endif
#include GXTODO_PROTOCOL_SYNC_SOURCE

static int harness_blocked;
static int harness_failed;
static char harness_last_error[1024];
static int harness_fault_active;
static char harness_fault_table[24];
static const char *harness_lease_token="c003-fixture-lease";

static int harness_cloud(void){
    wchar_t value[32]={0};
    return GetEnvironmentVariableW(L"GITHUB_ACTIONS",value,32)&&!wcscmp(value,L"true");
}
static int harness_error(DB*d,const char *message){
    snprintf(d->error,sizeof(d->error),"%s",message);
    return 0;
}
static int harness_temp_path(const wchar_t *value,wchar_t *resolved){
    wchar_t temporary[32768],root[32768];
    DWORD n=GetEnvironmentVariableW(L"RUNNER_TEMP",temporary,32768);
    if(!n||n>=32768||!GetFullPathNameW(temporary,32768,root,0)||!GetFullPathNameW(value,32768,resolved,0))return 0;
    size_t length=wcslen(root);
    while(length>3&&root[length-1]==L'\\')root[--length]=0;
    return !_wcsnicmp(root,resolved,length)&&resolved[length]==L'\\'&&resolved[length+1]!=0;
}
static int harness_execute_sql(DB*d,const char *sql){
    char *error=0;
    int code=sqlite3_exec(d->sql,sql,0,0,&error);
    if(code!=SQLITE_OK)snprintf(d->error,sizeof(d->error),"%s",error?error:sqlite3_errmsg(d->sql));
    sqlite3_free(error);
    return code==SQLITE_OK;
}
static int harness_identifier(const char *value){
    size_t n=strlen(value);
    return n>0&&n<=80&&strspn(value,"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")==n;
}
static int harness_table(const char *value){return !strcmp(value,"meta")||!strcmp(value,"entities")||!strcmp(value,"outbox");}
static int harness_authorizer(void *unused,int action,const char *first,const char *second,const char *database,const char *trigger){
    (void)unused;(void)second;(void)database;(void)trigger;
    if(harness_fault_active&&action==SQLITE_READ&&first&&!strcmp(first,harness_fault_table))return SQLITE_DENY;
    return SQLITE_OK;
}
static int harness_fault(DB*d,J*operation){
    const char *table=str(operation,"table"),*name=str(operation,"name"),*kind=str(operation,"kind");
    if(!harness_table(table))return harness_error(d,"Fixture SQL fault table must be meta, entities, or outbox.");
    if(!*name)name="c003_fault";
    if(!harness_identifier(name))return harness_error(d,"Fixture SQL fault identifier is invalid.");
    if(!strcmp(kind,"read-deny")){
        harness_fault_active=truth(operation,"enabled");
        snprintf(harness_fault_table,sizeof(harness_fault_table),"%s",table);
        return sqlite3_set_authorizer(d->sql,harness_fault_active?harness_authorizer:0,0)==SQLITE_OK;
    }
    if(strcmp(kind,"update-abort")&&strcmp(kind,"insert-abort")&&strcmp(kind,"insert-id-abort")&&strcmp(kind,"delete-abort"))return harness_error(d,"Unsupported fixture SQL fault kind.");
    char sql[500];
    if(truth(operation,"enabled")){
        if(!strcmp(kind,"insert-id-abort")){
            if(strcmp(table,"entities")||!*str(operation,"id"))return harness_error(d,"The id-specific INSERT fault requires entities and a nonempty fixture id.");
            char *specific=sqlite3_mprintf("CREATE TEMP TRIGGER %s BEFORE INSERT ON entities WHEN NEW.id='%q' BEGIN SELECT RAISE(ABORT,'C003 injected SQL failure'); END",name,str(operation,"id"));
            if(!specific)return harness_error(d,"Cannot allocate the fixture SQL trigger.");
            int ok=harness_execute_sql(d,specific);sqlite3_free(specific);return ok;
        }
        const char *verb=!strcmp(kind,"insert-abort")?"INSERT":!strcmp(kind,"delete-abort")?"DELETE":"UPDATE";
        snprintf(sql,sizeof(sql),"CREATE TEMP TRIGGER %s BEFORE %s ON %s BEGIN SELECT RAISE(ABORT,'C003 injected SQL failure'); END",name,verb,table);
    }else snprintf(sql,sizeof(sql),"DROP TRIGGER IF EXISTS temp.%s",name);
    return harness_execute_sql(d,sql);
}

/* Snapshot observers use the real public database read APIs. Their returned
 * arrays and any SQLite error are both retained, so an empty-on-error result
 * cannot be silently upgraded to a correctly rejected production operation. */
static J *harness_raw(DB*d){
    J *result=cJSON_CreateObject(),*errors=cJSON_CreateArray();
    J *meta=db_meta(d);
    int code=sqlite3_errcode(d->sql);
    if(!meta||code!=SQLITE_OK){J*error=cJSON_CreateObject();ss(error,"operation","db_meta");sn(error,"sqliteCode",code);ss(error,"message",sqlite3_errmsg(d->sql));cJSON_AddItemToArray(errors,error);}
    set(result,"meta",meta);
    J *rows=cJSON_CreateArray();char *after=_strdup("");
    for(;;){
        J *page=db_page(d,after,500),*row;
        code=sqlite3_errcode(d->sql);
        if(code!=SQLITE_OK){J*error=cJSON_CreateObject();ss(error,"operation","db_page");sn(error,"sqliteCode",code);ss(error,"message",sqlite3_errmsg(d->sql));set(error,"returned",dup(page));cJSON_AddItemToArray(errors,error);}
        int count=cJSON_GetArraySize(page);
        cJSON_ArrayForEach(row,page){cJSON_AddItemToArray(rows,dup(row));free(after);after=_strdup(str(row,"key"));}
        cJSON_Delete(page);
        if(code!=SQLITE_OK||count<500)break;
    }
    free(after);
    set(result,"rows",rows);
    J*outbox=db_outbox(d,INT_MAX);
    code=sqlite3_errcode(d->sql);
    if(code!=SQLITE_OK){J*error=cJSON_CreateObject();ss(error,"operation","db_outbox");sn(error,"sqliteCode",code);ss(error,"message",sqlite3_errmsg(d->sql));set(error,"returned",dup(outbox));cJSON_AddItemToArray(errors,error);}
    set(result,"outbox",outbox);
    set(result,"readErrors",errors);
    return result;
}
static J *harness_wire(J*raw){
    J*wire=cJSON_CreateObject(),*events=cJSON_CreateArray(),*records=cJSON_CreateArray(),*item;
    cJSON_ArrayForEach(item,get(raw,"outbox"))cJSON_AddItemToArray(events,dup(get(item,"event")));
    cJSON_ArrayForEach(item,get(raw,"rows"))cJSON_AddItemToArray(records,dup(get(item,"record")));
    set(wire,"events",events);set(wire,"records",records);
    const char *body=str(get(get(raw,"meta"),"pending"),"body");
    set(wire,"batch",*body?cJSON_Parse(body):cJSON_CreateNull());
    set(wire,"batchBody",*body?cJSON_CreateString(body):cJSON_CreateNull());
    return wire;
}
static int harness_seed(DB*d,J*defaults,const char *mode){
    J*meta=db_meta(d);
    if(!meta)return harness_error(d,"Fixture bootstrap could not read production metadata.");
    if(num(meta,"seq")!=0||num(meta,"queue")!=0||db_count(d,"notes")||db_count(d,"tasks")){cJSON_Delete(meta);return harness_error(d,"Fixture bootstrap requires an empty new production store.");}
    ss(meta,"actor",str(defaults,!strcmp(mode,"generate")?"producerActor":"receiverActor"));
    ss(meta,"scope",str(defaults,"scope"));ss(meta,"epoch",str(defaults,"epoch"));
    sn(meta,"seq",0);sn(meta,"clock",0);sn(meta,"queue",0);
    set(meta,"vector",cJSON_CreateObject());set(meta,"cursors",cJSON_CreateObject());
    set(meta,"pending",cJSON_CreateNull());set(meta,"initialized",cJSON_CreateTrue());
    J*lease=cJSON_CreateObject();ss(lease,"token",harness_lease_token);sn(lease,"until",(double)epoch_ms()+120000);set(meta,"lease",lease);
    int ok=db_begin(d)&&db_meta_save(d,meta,0);
    cJSON_Delete(meta);return db_end(d,ok);
}
static int harness_connect(Sync*s,const char *url){
    if(s->connect)return 1;
    if(!*url){harness_blocked++;return harness_error(s->d,"A real loopback HTTP fixture URL is required for this production sync operation.");}
    wchar_t*wide_url=wide(url);URL_COMPONENTS parts={0};parts.dwStructSize=sizeof(parts);parts.dwHostNameLength=(DWORD)-1;parts.dwUrlPathLength=(DWORD)-1;parts.dwExtraInfoLength=(DWORD)-1;
    int valid=WinHttpCrackUrl(wide_url,0,0,&parts)&&parts.nScheme==INTERNET_SCHEME_HTTP&&parts.dwHostNameLength==9&&!wcsncmp(parts.lpszHostName,L"127.0.0.1",9)&&parts.nPort>0&&(parts.dwUrlPathLength==0||parts.dwUrlPathLength==1&&parts.lpszUrlPath[0]==L'/')&&parts.dwExtraInfoLength==0;
    INTERNET_PORT port=parts.nPort;free(wide_url);
    if(!valid){harness_blocked++;return harness_error(s->d,"Only an origin-only http://127.0.0.1:PORT fixture URL is supported; no path prefix or external host is contacted.");}
    s->session=WinHttpOpen(L"MyTodo-C003-ProtocolHarness",WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(!s->session)return harness_error(s->d,"Cannot initialize the native WinHTTP fixture session.");
    WinHttpSetTimeouts(s->session,5000,5000,5000,5000);
    s->connect=WinHttpConnect(s->session,L"127.0.0.1",port,0);
    return s->connect?1:harness_error(s->d,"Cannot connect native WinHTTP to the authorized loopback fixture.");
}
static J *harness_manifest(Sync*s,J*operation,int raw_response){
    Response response={0};J*input=raw_response?get(operation,"response"):0;
    response.status=raw_response?(int)num(input,"status"):200;
    response.body=raw_response?_strdup(str(input,"body")):json(get(operation,"manifest"));
    response.etag=raw_response?(cJSON_IsString(get(input,"etag"))?_strdup(str(input,"etag")):0):_strdup("\"c003-fixture\"");
    J*parsed=manifest(s,&response);response_free(&response);return parsed;
}
static J *harness_events(J*operation,J*sample){
    const char*source=str(operation,"fromSample");
    J*events=0;
    if(!*source)events=dup(get(operation,"events"));
    else if(!sample)return 0;
    else if(!strcmp(source,"events"))events=dup(get(get(sample,"wire"),"events"));
    else if(!strcmp(source,"records")){
        events=cJSON_CreateArray();J*record,*event;
        cJSON_ArrayForEach(record,get(get(sample,"wire"),"records")){
            cJSON_ArrayForEach(event,get(record,"events")){J*with_key=dup(event);ss(with_key,"key",str(record,"key"));cJSON_AddItemToArray(events,with_key);}
        }
    }else return 0;
    if(cJSON_IsArray(events)&&truth(operation,"reverse")){
        J*reversed=cJSON_CreateArray();
        for(int i=cJSON_GetArraySize(events)-1;i>=0;i--)cJSON_AddItemToArray(reversed,dup(cJSON_GetArrayItem(events,i)));
        cJSON_Delete(events);events=reversed;
    }
    if(cJSON_IsArray(events)&&truth(operation,"duplicate")){
        int count=cJSON_GetArraySize(events);
        for(int i=0;i<count;i++)cJSON_AddItemToArray(events,dup(cJSON_GetArrayItem(events,i)));
    }
    return events;
}
static int harness_operation(DB*d,Sync*s,J*operation,J*sample,const wchar_t*db_dir,const char*fixture_url,J*stage){
    const char*op=str(operation,"op");s->ok=1;d->error[0]=0;
    if(!strcmp(op,"local"))return db_local(d,get(operation,"changes"),get(operation,"context"));
    if(!strcmp(op,"remote")){
        J*events=harness_events(operation,sample);
        if(!cJSON_IsArray(events)){cJSON_Delete(events);return harness_error(d,"Fixture remote events or producer sample are absent.");}
        J*index=get(operation,"index");
        double n=cJSON_IsNumber(index)?num(operation,"index"):0;
        if(n<INT_MIN||n>INT_MAX||n!=floor(n)){
            ss(stage,"unsupportedApi","db_remote has an int cursor index; no truncating adapter conversion was performed");
            harness_blocked++;cJSON_Delete(events);return harness_error(d,"The production C direct db_remote index API cannot represent this fixture integer.");
        }
        const char*device=str(operation,"device");
        int ok=db_remote(d,events,*device?device:0,(int)n);cJSON_Delete(events);return ok;
    }
    if(!strcmp(op,"manifest")){
        J*parsed=harness_manifest(s,operation,1);int ok=parsed!=0;set(stage,"manifest",parsed);return ok;
    }
    if(!strcmp(op,"prepare")){
        /* Directly exercise the production function, retaining its own int
         * conversion behavior and pending body, including boundary failures. */
        J*pending=prepare(s,get(operation,"manifest"));int ok=pending!=0;
        set(stage,"pending",pending);return ok;
    }
    if(!strcmp(op,"pull")||!strcmp(op,"checkpoint")){
        if(cJSON_IsNumber(get(operation,"budget"))&&num(operation,"budget")!=12){harness_blocked++;return harness_error(d,"Production C pull has the existing fixed budget 12; adapter does not replace it.");}
        if(!harness_connect(s,fixture_url))return 0;
        J*parsed=harness_manifest(s,operation,0);
        if(!parsed)return 0;
        int ok=bind(s,parsed);
        if(ok){if(!strcmp(op,"checkpoint"))ok=checkpoint(s,parsed);else{int count=0,more=0;ok=pull(s,parsed,&count,&more);sn(stage,"downloaded",count);set(stage,"more",cJSON_CreateBool(more));}}
        cJSON_Delete(parsed);return ok;
    }
    if(!strcmp(op,"sqlFault"))return harness_fault(d,operation);
    if(!strcmp(op,"reopen")){db_close(d);harness_fault_active=0;return db_open(d,db_dir);}
    if(!strcmp(op,"export")){set(stage,"raw",harness_raw(d));return 1;}
    harness_blocked++;return harness_error(d,"The shared operation is not yet supported by this real C adapter.");
}
static int harness_write(const wchar_t*path,J*document){
    wchar_t directory[32768];wcscpy(directory,path);wchar_t*last=wcsrchr(directory,L'\\');if(last){*last=0;if(!ensure_dir(directory))return 0;}
    char*text=json(document);int ok=text&&write_file(path,text);free(text);return ok;
}
static int harness_run(int argc,wchar_t**argv){
    const wchar_t *suite_path=0,*db_arg=0,*output_arg=0,*input_path=0;char *case_id=0,*mode=0,*fixture_url=0;
    if(argc>1)mode=utf8(argv[1]);
    for(int i=2;i<argc;i++){
        if(i+1>=argc)break;
        if(!wcscmp(argv[i],L"--suite"))suite_path=argv[++i];
        else if(!wcscmp(argv[i],L"--case"))case_id=utf8(argv[++i]);
        else if(!wcscmp(argv[i],L"--db-dir"))db_arg=argv[++i];
        else if(!wcscmp(argv[i],L"--output"))output_arg=argv[++i];
        else if(!wcscmp(argv[i],L"--input"))input_path=argv[++i];
        else if(!wcscmp(argv[i],L"--fixture-url"))fixture_url=utf8(argv[++i]);
    }
    if(!harness_cloud()||!mode||strcmp(mode,"generate")&&strcmp(mode,"receive")&&strcmp(mode,"report")||!suite_path||!db_arg||!output_arg||!case_id){fprintf(stderr,"Cloud-only usage: windows-protocol.exe generate|receive|report --suite file --case id --db-dir RUNNER_TEMP/path --output RUNNER_TEMP/file [--input sample] [--fixture-url http://127.0.0.1:PORT]\n");return 1;}
    wchar_t db_dir[32768],output_path[32768];
    if(!harness_temp_path(db_arg,db_dir)||!harness_temp_path(output_arg,output_path)){fprintf(stderr,"Refusing database or output outside GitHub RUNNER_TEMP.\n");return 1;}
    char*suite_text=read_file(suite_path),*sample_text=input_path?read_file(input_path):0;
    J*suite=suite_text?cJSON_Parse(suite_text):0,*sample=sample_text?cJSON_Parse(sample_text):0;free(suite_text);free(sample_text);
    if(!suite||strcmp(str(suite,"schema"),"mytodo-protocol-vectors")||num(suite,"version")!=1){fprintf(stderr,"Shared suite schema is absent or unsupported.\n");return 1;}
    J*selected=0,*candidate;cJSON_ArrayForEach(candidate,get(suite,"cases"))if(!strcmp(str(candidate,"id"),case_id))selected=candidate;
    if(!selected){fprintf(stderr,"Shared case does not exist.\n");return 1;}
    wchar_t database_path[32768];join(database_path,db_dir,L"tasks.sqlite");
    int report=!strcmp(mode,"report");
    if(!report&&GetFileAttributesW(database_path)!=INVALID_FILE_ATTRIBUTES){fprintf(stderr,"Refusing to seed or reset a pre-existing fixture database.\n");return 1;}
    if(report&&GetFileAttributesW(database_path)==INVALID_FILE_ATTRIBUTES){fprintf(stderr,"Cannot report a missing production fixture database.\n");return 1;}
    DB database;DB*d=&database;
    if(!db_open(d,db_dir)){fprintf(stderr,"Production db_open failed: %s\n",d->error);return 1;}
    J*defaults=get(suite,"defaults");
    if(!report&&!harness_seed(d,defaults,mode)){fprintf(stderr,"Production metadata bootstrap failed: %s\n",d->error);db_close(d);return 1;}
    Sync sync={0};sync.d=d;sync.ok=1;snprintf(sync.token,sizeof(sync.token),"%s",harness_lease_token);
    sync.config=cJSON_CreateObject();ss(sync.config,"folder",str(defaults,"folder"));ss(sync.config,"username","fixture-user");ss(sync.config,"password","synthetic-test-only");
    J*result=cJSON_CreateObject(),*stages=cJSON_CreateArray();ss(result,"schema","mytodo-protocol-harness-result");sn(result,"version",1);ss(result,"platform","Windows C");ss(result,"caseId",case_id);ss(result,"mode",mode);
    harness_failed=harness_blocked=0;harness_last_error[0]=0;
    J*operations=report?0:get(selected,!strcmp(mode,"generate")?"generate":"receive"),*operation;
    int number=0;
    cJSON_ArrayForEach(operation,operations){
        J*stage=cJSON_CreateObject();sn(stage,"index",number++);ss(stage,"op",str(operation,"op"));ss(stage,"expect",*str(operation,"expect")?str(operation,"expect"):"observe");
        set(stage,"before",harness_raw(d));int was_blocked=harness_blocked;
        int accepted=harness_operation(d,&sync,operation,sample,db_dir,fixture_url?fixture_url:"",stage);
        int sqlite_code=d->sql?sqlite3_errcode(d->sql):SQLITE_ERROR;
        set(stage,"accepted",cJSON_CreateBool(accepted));ss(stage,"error",d->error);sn(stage,"sqliteErrorCode",sqlite_code);
        int stage_blocked=harness_blocked>was_blocked;
        const char*expect=str(stage,"expect");int matches=!strcmp(expect,"observe")||!strcmp(expect,"accept")&&accepted||!strcmp(expect,"reject")&&!accepted;
        if(stage_blocked)snprintf(harness_last_error,sizeof(harness_last_error),"%s: blocked (%s)",str(operation,"op"),d->error);
        else if(!matches){harness_failed=1;snprintf(harness_last_error,sizeof(harness_last_error),"%s: expected %s, actual %s (%s)",str(operation,"op"),expect,accepted?"accepted":"rejected",d->error);}
        ss(stage,"status",stage_blocked?"blocked":matches?"passed":"failed");
        if(d->sql)set(stage,"after",harness_raw(d));else set(stage,"after",cJSON_CreateNull());
        cJSON_AddItemToArray(stages,stage);
    }
    set(result,"stages",stages);
    J*raw=d->sql?harness_raw(d):cJSON_CreateNull();set(result,"wire",harness_wire(raw));set(result,"raw",raw);
    db_close(d);harness_fault_active=0;
    int reopened=db_open(d,db_dir);set(result,"reopened",reopened?harness_raw(d):cJSON_CreateNull());
    int integrity=reopened&&db_check(d);set(result,"integrity",cJSON_CreateBool(integrity));
    if(!reopened||!integrity){harness_failed=1;snprintf(harness_last_error,sizeof(harness_last_error),"Production close/reopen/integrity failed: %s",d->error);}
    J*provenance=cJSON_CreateObject();
    ss(provenance,"storage","windows/database.c + actual vendor SQLite; production db_local/db_remote/reads/close/reopen");
    ss(provenance,"sync","original sync.c bodies through an approved single-flag fixture copy; actual WinHTTP loopback TCP/gzip/ETag, never real Nutstore or LAN");
#ifdef GXTODO_PROTOCOL_SYNC_ORIGINAL_SHA
    ss(provenance,"productionSyncSha256",GXTODO_PROTOCOL_SYNC_ORIGINAL_SHA);
#endif
#ifdef GXTODO_PROTOCOL_SYNC_FIXTURE_SHA
    ss(provenance,"fixtureSyncSha256",GXTODO_PROTOCOL_SYNC_FIXTURE_SHA);
#endif
    sn(provenance,"fixtureTransportReplacementCount",1);set(provenance,"productionProtocolModified",cJSON_CreateFalse());set(provenance,"realSQLite",cJSON_CreateTrue());
    char expected_sha[100]={0};GetEnvironmentVariableA("EXPECTED_SOURCE_SHA",expected_sha,sizeof(expected_sha));if(!*expected_sha)GetEnvironmentVariableA("GXTODO_PROTOCOL_SOURCE_SHA",expected_sha,sizeof(expected_sha));if(!*expected_sha)GetEnvironmentVariableA("GITHUB_SHA",expected_sha,sizeof(expected_sha));ss(provenance,"sourceSha",*expected_sha?expected_sha:"unrecorded");
    set(result,"provenance",provenance);ss(result,"status",harness_blocked?"blocked":harness_failed?"failed":"passed");ss(result,"error",harness_last_error);
    int written=harness_write(output_path,result);
    if(sync.connect)WinHttpCloseHandle(sync.connect);if(sync.session)WinHttpCloseHandle(sync.session);cJSON_Delete(sync.config);db_close(d);
    printf("{\"caseId\":\"%s\",\"mode\":\"%s\",\"status\":\"%s\",\"outputWritten\":%s}\n",case_id,mode,str(result,"status"),written?"true":"false");
    cJSON_Delete(result);cJSON_Delete(sample);cJSON_Delete(suite);free(case_id);free(mode);free(fixture_url);
    return !written?1:harness_blocked?2:harness_failed?1:0;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR command,int show){
    (void)instance;(void)previous;(void)command;(void)show;
    int argc=0;wchar_t**argv=CommandLineToArgvW(GetCommandLineW(),&argc);
    if(!argv)return 1;
    CoInitializeEx(0,COINIT_APARTMENTTHREADED);int status=harness_run(argc,argv);CoUninitialize();LocalFree(argv);return status;
}
