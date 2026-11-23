/* Draft C007 observer; only the test executable includes this file.
 * Reuse actual C0-03 helpers and the original C production translation units.
 * The builder records its loopback transport flag and ACK-return observation wrapper. */
#define wWinMain c007_unused_c003_entry
#include "../protocol-harness/windows-protocol.c"
#undef wWinMain

static int c007_hits,c007_commit_reject,c007_commit_exit,c007_exit_after_ack,c007_observe_errors,c007_defer_commit_gate;
static sqlite3*c007_current_sql;
static J*c007_native_errors;
static J*c007_current_receipt;
static wchar_t c007_output[32768];
static char c007_denied_table[24];
static int c007_denied_action;
static int c007_commit_denied,c007_phase_armed;
static char c007_commit_phase[32];
static char c007_sync_token[80];
static INTERNET_PORT c007_loopback_port;
static unsigned short c007_fixture_port(void){return c007_loopback_port;}
static void c007_phase(sqlite3_context*context,int argc,sqlite3_value**argv){
    (void)argc;
    J*old=cJSON_Parse((const char*)sqlite3_value_text(argv[0])),*next=cJSON_Parse((const char*)sqlite3_value_text(argv[1]));
    if(!cJSON_IsObject(get(old,"lease"))&&cJSON_IsObject(get(next,"lease"))){snprintf(c007_sync_token,sizeof(c007_sync_token),"%s",str(get(next,"lease"),"token"));ss(c007_current_receipt,"syncTokenObserved",c007_sync_token);}
    int owns=*c007_sync_token&&!strcmp(str(get(old,"lease"),"token"),c007_sync_token);
    int cache=owns&&!strcmp(c007_commit_phase,"cache")&&!cJSON_IsObject(get(old,"cachedManifest"))&&cJSON_IsObject(get(next,"cachedManifest"));
    int release=owns&&!strcmp(c007_commit_phase,"release")&&cJSON_IsNull(get(next,"lease"));
    if(cache||release){c007_phase_armed=1;ss(c007_current_receipt,"commitPhaseObserved",c007_commit_phase);ss(c007_current_receipt,"commitPhaseToken",str(get(old,"lease"),"token"));}
    cJSON_Delete(old);cJSON_Delete(next);sqlite3_result_int(context,0);
}
static void c007_sql_log(void*unused,int code,const char*message){
    (void)unused;
    if(!c007_observe_errors||!c007_native_errors)return;
    J*entry=cJSON_CreateObject();sn(entry,"extendedCode",code);sn(entry,"primaryCode",code&255);ss(entry,"message",message?message:"");
    cJSON_AddItemToArray(c007_native_errors,entry);
}

static int c007_write_new(const wchar_t*file,J*value){
    char*text=json(value);if(!text)return 0;
    HANDLE h=CreateFileW(file,GENERIC_WRITE,0,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);
    if(h==INVALID_HANDLE_VALUE){free(text);return 0;}
    DWORD wrote=0,length=(DWORD)strlen(text);
    int ok=WriteFile(h,text,length,&wrote,0)&&wrote==length&&FlushFileBuffers(h);
    CloseHandle(h);free(text);return ok;
}
static int c007_marker(const wchar_t*suffix,const char*boundary){
    wchar_t file[32768];if(wcslen(c007_output)+wcslen(suffix)+1>=32768)return 0;
    wcscpy(file,c007_output);wcscat(file,suffix);
    J*j=c007_current_receipt?dup(c007_current_receipt):cJSON_CreateObject();ss(j,"boundary",boundary);sn(j,"processId",GetCurrentProcessId());sn(j,"faultHits",c007_hits);
    int ok=c007_write_new(file,j);cJSON_Delete(j);return ok;
}
static void c007_after_ack_commit(void){
    if(!c007_exit_after_ack)return;
    if(!c007_marker(L".after-ack-commit.json","after-real-ack-return"))TerminateProcess(GetCurrentProcess(),87);
    TerminateProcess(GetCurrentProcess(),86);
}
static void c007_hit(sqlite3_context*context,int argc,sqlite3_value**argv){
    (void)argc;(void)argv;c007_hits++;sqlite3_result_int(context,0);
}
static int c007_authorizer(void*unused,int action,const char*table,const char*column,const char*database,const char*trigger){
    (void)unused;(void)column;(void)database;(void)trigger;
    if(action==SQLITE_TRANSACTION&&table&&!strcmp(table,"COMMIT")&&c007_phase_armed&&!c007_commit_denied){
        c007_commit_denied=1;c007_hits++;ss(c007_current_receipt,"commitDeniedPhase",*c007_commit_phase?c007_commit_phase:"direct");return SQLITE_DENY;
    }
    if(action==c007_denied_action&&table&&!strcmp(table,c007_denied_table)){c007_hits++;return SQLITE_DENY;}
    return SQLITE_OK;
}
static int c007_commit_hook(void*unused){
    (void)unused;c007_hits++;
    if(c007_commit_exit){
        if(!c007_marker(L".before-commit.json","before-real-sqlite-commit"))TerminateProcess(GetCurrentProcess(),87);
        TerminateProcess(GetCurrentProcess(),86);
    }
    return c007_commit_reject;
}
static void c007_before_ack_commit(void){
    // Publish's HTTP request helper renews its lease in separate transactions.
    // Commit faults must target the actual ACK transaction after remote publication.
    if(c007_defer_commit_gate&&(c007_commit_reject||c007_commit_exit))sqlite3_commit_hook(c007_current_sql,c007_commit_hook,0);
}
static int c007_clear(DB*d){
    sqlite3_set_authorizer(d->sql,0,0);sqlite3_commit_hook(d->sql,0,0);
    c007_commit_reject=c007_commit_exit=c007_phase_armed=0;
    return harness_execute_sql(d,"DROP TRIGGER IF EXISTS temp.c007_abort; DROP TRIGGER IF EXISTS temp.c007_phase; DROP VIEW IF EXISTS temp.meta; DROP VIEW IF EXISTS temp.entities; DROP VIEW IF EXISTS temp.outbox;");
}
static int c007_fault(DB*d,J*spec){
    const char*kind=str(spec,"kind"),*table=str(spec,"table");if(!*table)table="meta";
    c007_hits=0;if(!*kind||!strcmp(kind,"none"))return 1;
    if(!harness_table(table))return harness_error(d,"C007 table outside fixture allowlist");
    if(!strcmp(kind,"commit-deny")||!strcmp(kind,"commit-phase-deny")){
        c007_commit_denied=0;c007_phase_armed=!strcmp(kind,"commit-deny");snprintf(c007_commit_phase,sizeof(c007_commit_phase),"%s",str(spec,"phase"));
        if(!c007_phase_armed){
            if(strcmp(c007_commit_phase,"cache")&&strcmp(c007_commit_phase,"release"))return harness_error(d,"Unsupported COMMIT phase");
            if(!harness_execute_sql(d,"CREATE TEMP TRIGGER c007_phase AFTER UPDATE ON main.meta BEGIN SELECT c007_phase(OLD.value,NEW.value); END"))return 0;
        }
        return sqlite3_set_authorizer(d->sql,c007_authorizer,0)==SQLITE_OK;
    }
    if(!strcmp(kind,"prepare-deny")){
        snprintf(c007_denied_table,sizeof(c007_denied_table),"%s",table);
        c007_denied_action=!strcmp(str(spec,"action"),"delete")?SQLITE_DELETE:SQLITE_READ;
        return sqlite3_set_authorizer(d->sql,c007_authorizer,0)==SQLITE_OK;
    }
    if(!strcmp(kind,"commit-reject")||!strcmp(kind,"exit-before-commit")){
        c007_commit_reject=!strcmp(kind,"commit-reject");c007_commit_exit=!strcmp(kind,"exit-before-commit");
        if(!c007_defer_commit_gate)sqlite3_commit_hook(d->sql,c007_commit_hook,0);return 1;
    }
    if(!strcmp(kind,"read-overflow")||!strcmp(kind,"read-invalid-json")){
        char*sql=0;
        const char*expression=!strcmp(kind,"read-invalid-json")?"'{'":"abs(-9223372036854775808)";
        if(!strcmp(table,"meta"))sql=sqlite3_mprintf("CREATE TEMP VIEW meta AS SELECT id,CASE WHEN id=1 THEN %s ELSE value END AS value FROM main.meta",expression);
        else if(!strcmp(table,"outbox"))sql=sqlite3_mprintf("CREATE TEMP VIEW outbox AS SELECT id,CASE WHEN id=1 THEN %s ELSE event END AS event FROM main.outbox",expression);
        else if(*str(spec,"id"))sql=sqlite3_mprintf("CREATE TEMP VIEW entities AS SELECT key,kind,id,CASE WHEN id='%q' THEN %s ELSE data END AS data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start FROM main.entities",str(spec,"id"),expression);
        if(!sql)return harness_error(d,"Entity read-overflow requires fixture id");
        int ok=harness_execute_sql(d,sql);sqlite3_free(sql);return ok;
    }
    const char*verb=!strcmp(kind,"insert-abort")?"INSERT":!strcmp(kind,"update-abort")?"UPDATE":!strcmp(kind,"delete-abort")?"DELETE":0;
    if(!verb)return harness_error(d,"Unknown C007 real SQLite fault");
    char*predicate=*str(spec,"id")&&!strcmp(table,"entities")&&strcmp(verb,"DELETE")?sqlite3_mprintf(" WHEN NEW.id='%q'",str(spec,"id")):sqlite3_mprintf("");
    char*sql=sqlite3_mprintf("CREATE TEMP TRIGGER c007_abort BEFORE %s ON main.%s%s BEGIN SELECT c007_fault_hit(); SELECT RAISE(ABORT,'C007_SQL_STEP_ABORT'); END",verb,table,predicate);
    sqlite3_free(predicate);int ok=sql&&harness_execute_sql(d,sql);sqlite3_free(sql);return ok;
}
static int c007_operation(DB*d,Sync*s,J*op,const char*origin,J*receipt){
    const char*name=str(op,"op");s->ok=1;d->error[0]=0;
    if(!strcmp(name,"local"))return db_local(d,get(op,"changes"),0);
    if(!strcmp(name,"remote"))return db_remote(d,get(op,"events"),*str(op,"device")?str(op,"device"):0,num(op,"index"));
    if(!strcmp(name,"inspect")){set(receipt,"returned",db_row(d,str(op,"key")));return get(receipt,"returned")!=0;}
    if(!strcmp(name,"page")){J*value=db_page(d,str(op,"after"),100);int ok=value!=0;set(receipt,"returned",value);return ok;}
    if(!strcmp(name,"outbox")){J*value=db_outbox(d,500);int ok=value!=0;set(receipt,"returned",value);return ok;}
    if(!strcmp(name,"meta")){J*value=db_meta(d);int ok=value!=0;set(receipt,"returned",value);return ok;}
    if(!strcmp(name,"prepare")){J*p=prepare(s,get(op,"manifest"));set(receipt,"returned",p);return p!=0;}
    if(!strcmp(name,"prepare-empty")){J*p=prepare(s,get(op,"manifest"));int ok=!p&&s->ok;set(receipt,"returned",p);return ok;}
    if(!strcmp(name,"renew-request")){
        if(!harness_connect(s,origin))return 0;
        Response read=request(s,"GET","v2/manifest.json",0,0);J*m=manifest(s,&read);int ok=m!=0;set(receipt,"returned",m);response_free(&read);return ok;
    }
    if(!strcmp(name,"full-sync")){int up=0,down=0,more=0;int ok=sync_run(d,&up,&down,&more);sn(receipt,"uploaded",up);sn(receipt,"downloaded",down);sn(receipt,"more",more);return ok;}
    if(!strcmp(name,"ack")){
        J*m=db_meta(d),*p=dup(get(m,"pending"));cJSON_Delete(m);
        if(!cJSON_IsObject(p)){cJSON_Delete(p);return harness_error(d,"ACK needs a durable pending batch");}
        int ok=ack(s,p);cJSON_Delete(p);return ok;
    }
    if(!strcmp(name,"publish")){
        if(!harness_connect(s,origin))return 0;
        // Reading the current remote value/ETag is actual WinHTTP, never a fabricated response.
        Response read=request(s,"GET","v2/manifest.json",0,0);J*m=manifest(s,&read);char*etag=read.etag;read.etag=0;response_free(&read);
        if(!m){free(etag);return 0;}
        J*meta=db_meta(d),*p=dup(get(meta,"pending"));cJSON_Delete(meta);
        if(!cJSON_IsObject(p)){cJSON_Delete(p);cJSON_Delete(m);free(etag);return harness_error(d,"Publish needs a durable pending batch");}
        int ok=publish(s,&m,&etag,p);set(receipt,"remoteManifest",m);ss(receipt,"remoteETag",etag?etag:"");free(etag);cJSON_Delete(p);return ok;
    }
    if(!strcmp(name,"audit")){set(receipt,"returned",harness_raw(d));return 1;}
    return harness_error(d,"Unsupported C007 operation");
}
static int c007_run(int argc,wchar_t**argv){
    const wchar_t*input=0,*dbarg=0,*output=0;
    for(int i=1;i+1<argc;i+=2){if(!wcscmp(argv[i],L"--request"))input=argv[i+1];else if(!wcscmp(argv[i],L"--db-dir"))dbarg=argv[i+1];else if(!wcscmp(argv[i],L"--output"))output=argv[i+1];else return 1;}
    wchar_t dbdir[32768],checkedInput[32768];
    if(!harness_cloud()||!input||!dbarg||!output||!harness_temp_path(dbarg,dbdir)||!harness_temp_path(output,c007_output)||!harness_temp_path(input,checkedInput))return 1;
    char*text=read_file(input);J*spec=text?cJSON_Parse(text):0;free(text);if(!spec)return 1;
    char expected[80]={0};GetEnvironmentVariableA("EXPECTED_SOURCE_SHA",expected,sizeof(expected));if(!*expected)GetEnvironmentVariableA("GITHUB_SHA",expected,sizeof(expected));
    if(strlen(expected)!=40||strcmp(expected,str(spec,"sourceSha"))){cJSON_Delete(spec);return 1;}
    wchar_t dbfile[32768];join(dbfile,dbdir,L"tasks.sqlite");int exists=GetFileAttributesW(dbfile)!=INVALID_FILE_ATTRIBUTES,init=!strcmp(str(spec,"mode"),"init");
    if((init&&exists)||(!init&&!exists)){cJSON_Delete(spec);return 1;}
    if(sqlite3_config(SQLITE_CONFIG_LOG,c007_sql_log,0)!=SQLITE_OK){cJSON_Delete(spec);return 1;}
    c007_native_errors=cJSON_CreateArray();
    DB database;DB*d=&database;if(!db_open(d,dbdir)){cJSON_Delete(spec);cJSON_Delete(c007_native_errors);return 1;}
    c007_current_sql=d->sql;c007_defer_commit_gate=!strcmp(str(get(spec,"operation"),"op"),"publish");
    Sync s={0};s.d=d;s.ok=1;snprintf(s.token,sizeof(s.token),"%s",harness_lease_token);
    s.config=cJSON_CreateObject();ss(s.config,"folder",str(spec,"folder"));ss(s.config,"username","fixture-user");ss(s.config,"password","synthetic-test-only");
    J*result=cJSON_CreateObject();ss(result,"schema","mytodo-c007-attempt");sn(result,"version",1);ss(result,"platform","windows-c");ss(result,"sourceSha",expected);ss(result,"caseId",str(spec,"caseId"));ss(result,"attemptId",str(spec,"attemptId"));ss(result,"sqliteVersion",sqlite3_libversion());set(result,"operation",dup(get(spec,"operation")));set(result,"fault",dup(get(spec,"fault")));
    char*directory=utf8(dbdir);ss(result,"dbDir",directory);free(directory);
    c007_current_receipt=result;
    int observer=1;
    if(init){J*defaults=cJSON_CreateObject();ss(defaults,"producerActor",str(spec,"actor"));ss(defaults,"scope",str(spec,"scope"));ss(defaults,"epoch",str(spec,"epoch"));int ok=harness_seed(d,defaults,"generate");cJSON_Delete(defaults);if(!ok)goto done;}
    // Harness lease renewal belongs before the fault/baseline. Audit mode must never alter protocol metadata.
    if(!init&&strcmp(str(get(spec,"operation"),"op"),"audit")){
        J*m=db_meta(d);if(!m)goto done;J*lease=cJSON_CreateObject();ss(lease,"token",s.token);sn(lease,"until",(double)epoch_ms()+120000);set(m,"lease",lease);
        if(!strcmp(str(get(spec,"operation"),"op"),"full-sync")){set(m,"lease",cJSON_CreateNull());set(m,"cachedManifest",cJSON_CreateNull());}
        int ok=db_begin(d)&&db_meta_save(d,m,0);cJSON_Delete(m);if(!db_end(d,ok))goto done;
    }
    if(!strcmp(str(get(spec,"operation"),"op"),"full-sync")){
        if(!harness_connect(&s,str(spec,"fixtureUrl")))goto done;
        wchar_t*url=wide(str(spec,"fixtureUrl"));URL_COMPONENTS parts={0};parts.dwStructSize=sizeof(parts);if(!WinHttpCrackUrl(url,0,0,&parts)){free(url);goto done;}c007_loopback_port=parts.nPort;free(url);
        set(s.config,"enabled",cJSON_CreateTrue());if(!config_save(d,s.config))goto done;
    }
    set(result,"before",harness_raw(d));
    if(!c007_marker(L".before.json","before-operation"))goto done;
    if(sqlite3_create_function(d->sql,"c007_fault_hit",0,SQLITE_UTF8,0,c007_hit,0,0)!=SQLITE_OK)goto done;
    if(sqlite3_create_function(d->sql,"c007_phase",2,SQLITE_UTF8,0,c007_phase,0,0)!=SQLITE_OK)goto done;
    if(!c007_fault(d,get(spec,"fault")))goto done;
    if(!strcmp(str(spec,"exitAt"),"before-commit")){c007_commit_exit=1;if(!c007_defer_commit_gate)sqlite3_commit_hook(d->sql,c007_commit_hook,0);}
    c007_exit_after_ack=!strcmp(str(spec,"exitAt"),"after-ack-commit");
    c007_observe_errors=1;
    {
        int accepted=c007_operation(d,&s,get(spec,"operation"),str(spec,"fixtureUrl"),result);
        c007_observe_errors=0;set(result,"nativeSqlErrors",dup(c007_native_errors));
        // Capture native diagnostics immediately; all later SQL is evidence cleanup/audit.
        int primary=sqlite3_errcode(d->sql),extended=sqlite3_extended_errcode(d->sql),autocommit=sqlite3_get_autocommit(d->sql);
        char message[1024];snprintf(message,sizeof(message),"%s",sqlite3_errmsg(d->sql));
        set(result,"operationAccepted",cJSON_CreateBool(accepted));sn(result,"sqliteCode",primary);sn(result,"sqliteExtendedCode",extended);ss(result,"sqliteMessage",message);ss(result,"operationError",d->error);sn(result,"faultHits",c007_hits);set(result,"autocommitAfterOperation",cJSON_CreateBool(autocommit));
        if(accepted&&!strcmp(str(get(spec,"operation"),"op"),"ack")&&!strcmp(str(spec,"exitAt"),"after-ack-commit")){
            if(!c007_marker(L".after-ack-commit.json","after-real-ack-return"))TerminateProcess(GetCurrentProcess(),87);
            TerminateProcess(GetCurrentProcess(),86);
        }
        if(!c007_clear(d))goto done;
        set(result,"after",harness_raw(d));observer=0;
    }
done:
    ss(result,"status",observer?"observer-failed":"observed");sn(result,"observerExitCode",observer);
    if(observer)ss(result,"observerError",d->error);
    c007_observe_errors=0;c007_clear(d);if(s.connect)WinHttpCloseHandle(s.connect);if(s.session)WinHttpCloseHandle(s.session);cJSON_Delete(s.config);db_close(d);cJSON_Delete(c007_native_errors);c007_native_errors=0;
    int written=c007_write_new(c007_output,result);c007_current_receipt=0;cJSON_Delete(result);cJSON_Delete(spec);return written?observer:1;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR command,int show){
    (void)instance;(void)previous;(void)command;(void)show;
    int argc=0;wchar_t**argv=CommandLineToArgvW(GetCommandLineW(),&argc);if(!argv)return 1;
    CoInitializeEx(0,COINIT_APARTMENTTHREADED);int status=c007_run(argc,argv);CoUninitialize();LocalFree(argv);return status;
}
