/* Independent Windows C / SQLite synthetic source generator.
 * Build with the repository's vendor sqlite3.c and cJSON.c, never database.c.
 * This program cannot accept production paths or execute input-provided SQL.
 */
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <math.h>
#include <float.h>
#include <limits.h>
#include "sqlite3.h"
#include "cJSON.h"

#define GUARD "MYTODO_D1_SYNTHETIC_ONLY"
#define CANDIDATE "d1-01-candidate.1"
#define FIXTURE "synthetic-fixed-v1"
#define PATH_CAP 32768
#define SAFE_INTEGER 9007199254740991.0
static sqlite3 *database;
static const char *SCHEMA=
"PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;\n"
"CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL);\n"
"CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);\n"
"CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT);\n"
"CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start);\n"
"CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at);\n"
"CREATE INDEX task_parent ON entities(parent_id);\n"
"CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL);";

static void blocker(const char *message){
    fprintf(stderr,"BLOCKER: %s\n",message);
    if(database){
        char *rollback=0;
        if(sqlite3_exec(database,"ROLLBACK",0,0,&rollback)!=SQLITE_OK)
            fprintf(stderr,"cleanup observation: %s\n",rollback?rollback:"rollback unavailable");
        sqlite3_free(rollback);sqlite3_close_v2(database);database=0;
    }
    exit(2); /* Preserve first failure and partial synthetic artifacts. */
}
static void require(int ok,const char *message){if(!ok)blocker(message);}
static int finite_number(double n){return _finite(n)!=0;}
static cJSON *item(cJSON *o,const char *name){return cJSON_GetObjectItemCaseSensitive(o,name);}
static const char *string(cJSON *o,const char *name){cJSON *v=item(o,name);require(cJSON_IsString(v),"fixture required TEXT field missing");return v->valuestring;}
static char *utf8(const wchar_t *value){
    int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value,-1,0,0,0,0);
    require(n>0,"invalid Unicode path/environment");char *s=(char*)malloc((size_t)n);require(s!=0,"allocation failed");
    require(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value,-1,s,n,0,0)==n,"UTF-8 conversion failed");return s;
}
static void full_path(const wchar_t *value,wchar_t *out){
    require(value&&wcslen(value)<PATH_CAP-1,"path missing/too long");
    require(wcslen(value)>=3&&value[1]==L':'&&(value[2]==L'\\'||value[2]==L'/'),"absolute local drive path required; UNC rejected");
    for(size_t i=2;value[i];++i)require(value[i]!=L':',"alternate data stream path rejected");
    DWORD n=GetFullPathNameW(value,PATH_CAP,out,0);require(n>0&&n<PATH_CAP,"full path resolution failed");
    for(size_t i=0;out[i];++i)if(out[i]==L'/')out[i]=L'\\';
    size_t len=wcslen(out);while(len>3&&out[len-1]==L'\\')out[--len]=0;
}
static void path_guard(const wchar_t *value,int directory){
    wchar_t cursor[PATH_CAP];wcscpy_s(cursor,PATH_CAP,value);int first=1;
    for(;;){
        DWORD attrs=GetFileAttributesW(cursor);require(attrs!=INVALID_FILE_ATTRIBUTES,"path/ancestor missing");
        require(!(attrs&FILE_ATTRIBUTE_REPARSE_POINT),"reparse/symlink/junction ancestor rejected");
        if(!first||directory)require((attrs&FILE_ATTRIBUTE_DIRECTORY)!=0,"non-directory ancestor");
        else require(!(attrs&FILE_ATTRIBUTE_DIRECTORY),"regular file required");
        if(wcslen(cursor)<=3)break;
        wchar_t *slash=wcsrchr(cursor,L'\\');require(slash!=0,"invalid ancestor path");
        if(slash==cursor+2)cursor[3]=0;else *slash=0;first=0;
    }
}
static void child_path(const wchar_t *root,const wchar_t *name,wchar_t *out){
    require(wcslen(root)+wcslen(name)+2<PATH_CAP,"child path too long");wcscpy_s(out,PATH_CAP,root);wcscat_s(out,PATH_CAP,L"\\");wcscat_s(out,PATH_CAP,name);
}
static cJSON *read_json(const wchar_t *file){
    path_guard(file,0);
    HANDLE h=CreateFileW(file,GENERIC_READ,0,0,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,0);
    require(h!=INVALID_HANDLE_VALUE,"input file open failed");
    BY_HANDLE_FILE_INFORMATION info;require(GetFileInformationByHandle(h,&info),"input file identity unavailable");
    require(!(info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)&&info.nNumberOfLinks==1,"reparse/hardlinked input file rejected");
    LARGE_INTEGER size;require(GetFileSizeEx(h,&size)&&size.QuadPart>0&&size.QuadPart<=8*1024*1024,"input size outside synthetic bound");
    DWORD length=(DWORD)size.QuadPart,read=0;char *bytes=(char*)malloc((size_t)length+1);require(bytes!=0,"allocation failed");
    require(ReadFile(h,bytes,length,&read,0)&&read==length,"input read incomplete");CloseHandle(h);bytes[length]=0;
    require(memchr(bytes,0,length)==0,"NUL JSON input rejected");
    require(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,bytes,(int)length,0,0)>0,"invalid UTF-8 input");
    cJSON *json=cJSON_ParseWithLengthOpts(bytes,(size_t)length+1,0,1);free(bytes);require(json!=0,"JSON input parse failed");return json;
}
static void identity(cJSON *o,const char *run,int marker){
    require(cJSON_IsObject(o),"identity object required");
    require(!strcmp(string(o,"guard"),GUARD)&&!strcmp(string(o,"runId"),run)&&!strcmp(string(o,"candidate"),CANDIDATE),"marker/fixture identity mismatch");
    if(marker)require(cJSON_GetArraySize(o)==3,"run marker must contain exact three fields");
    else require(cJSON_IsTrue(item(o,"synthetic"))&&!strcmp(string(o,"fixtureId"),FIXTURE)&&cJSON_GetArraySize(o)==9,"fixed synthetic fixture identity required");
}
static void sql_exec(const char *sql){
    char *error=0;int rc=sqlite3_exec(database,sql,0,0,&error);
    if(rc!=SQLITE_OK){char copy[2048];snprintf(copy,sizeof(copy),"SQLite operation: %s",error?error:sqlite3_errmsg(database));sqlite3_free(error);blocker(copy);}sqlite3_free(error);
}
static void sql_ok(int rc){if(rc!=SQLITE_OK)blocker(sqlite3_errmsg(database));}
static sqlite3_stmt *prepare(const char *sql){sqlite3_stmt *s=0;sql_ok(sqlite3_prepare_v2(database,sql,-1,&s,0));return s;}
static void bind_text(sqlite3_stmt *s,int index,const char *value){sql_ok(sqlite3_bind_text(s,index,value,-1,SQLITE_TRANSIENT));}
static void inserted(sqlite3_stmt *s){if(sqlite3_step(s)!=SQLITE_DONE)blocker(sqlite3_errmsg(database));sql_ok(sqlite3_reset(s));sql_ok(sqlite3_clear_bindings(s));}
static int count(const char *sql){sqlite3_stmt *s=prepare(sql);require(sqlite3_step(s)==SQLITE_ROW,"count query failed");int n=sqlite3_column_int(s,0);sql_ok(sqlite3_finalize(s));return n;}
static int authorizer(void *unused,int action,const char *a,const char *b,const char *db,const char *trigger){
    (void)unused;(void)a;(void)db;(void)trigger;
    if(action==SQLITE_ATTACH||action==SQLITE_DETACH)return SQLITE_DENY;
    if(action==SQLITE_FUNCTION&&b&&!_stricmp(b,"load_extension"))return SQLITE_DENY;
    return SQLITE_OK;
}
static void diagnostic(cJSON *all,const char *key,const char *field,const char *reason){
    cJSON *d=cJSON_CreateObject();cJSON_AddStringToObject(d,"key",key);cJSON_AddStringToObject(d,"field",field);cJSON_AddStringToObject(d,"reason",reason);
    cJSON_AddStringToObject(d,"storageMode","syntheticQuarantineStorage");cJSON_AddStringToObject(d,"sourceCell","SQL NULL");
    cJSON_AddStringToObject(d,"claim","safe independent generator limit; current C conversion not observed");cJSON_AddTrueToObject(d,"rawTokenPreservedInData");cJSON_AddItemToArray(all,d);
}
static void original_text_check(sqlite3_stmt *s,int column,const char *expected){
    require(sqlite3_column_type(s,column)==SQLITE_TEXT,"original cell is not SQL TEXT");
    const unsigned char *actual=sqlite3_column_text(s,column);int bytes=sqlite3_column_bytes(s,column);
    require(actual&&bytes==(int)strlen(expected)&&!memcmp(actual,expected,(size_t)bytes),"original TEXT cell changed");
}
static void fresh_file(const wchar_t *file){
    HANDLE h=CreateFileW(file,GENERIC_READ|GENERIC_WRITE,0,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,0);
    require(h!=INVALID_HANDLE_VALUE,"refuse existing output / exclusive create failed");CloseHandle(h);path_guard(file,0);
}

int wmain(int argc,wchar_t **argv){
    require(argc==2,"usage: native-generator.exe <syntheticRoot>");
    const wchar_t *actions=_wgetenv(L"GITHUB_ACTIONS"),*runWide=_wgetenv(L"GITHUB_RUN_ID"),*tempWide=_wgetenv(L"RUNNER_TEMP");
    require(actions&&!wcscmp(actions,L"true")&&runWide&&*runWide&&tempWide,"GitHub Actions/runId/RUNNER_TEMP required");
    for(const wchar_t *p=runWide;*p;++p)require(*p>=L'0'&&*p<=L'9',"numeric runId required");
    wchar_t root[PATH_CAP],temp[PATH_CAP],file[PATH_CAP],dbWide[PATH_CAP],receiptWide[PATH_CAP];
    full_path(argv[1],root);full_path(tempWide,temp);path_guard(root,1);path_guard(temp,1);
    size_t n=wcslen(temp);require(wcslen(root)>n&& !_wcsnicmp(root,temp,n)&&root[n]==L'\\',"dedicated root must be strictly beneath RUNNER_TEMP");
    char *run=utf8(runWide);child_path(root,L"D1-SYNTHETIC.json",file);cJSON *marker=read_json(file);identity(marker,run,1);cJSON_Delete(marker);
    child_path(root,L"fixture.json",file);cJSON *fixture=read_json(file);identity(fixture,run,0);
    require(!strcmp(string(fixture,"schema"),SCHEMA),"input schema differs from fixed synthetic schema");
    cJSON *rows=item(fixture,"rows"),*outbox=item(fixture,"outbox");require(cJSON_IsArray(rows)&&cJSON_IsArray(outbox),"fixture arrays required");
    const char *meta=string(fixture,"meta");
    child_path(root,L"windows-source.sqlite",dbWide);child_path(root,L"native-generator-receipt.json",receiptWide);
    require(GetFileAttributesW(receiptWide)==INVALID_FILE_ATTRIBUTES,"refuse existing receipt");
    child_path(root,L"windows-source.sqlite-wal",file);require(GetFileAttributesW(file)==INVALID_FILE_ATTRIBUTES,"refuse existing WAL");
    child_path(root,L"windows-source.sqlite-shm",file);require(GetFileAttributesW(file)==INVALID_FILE_ATTRIBUTES,"refuse existing SHM");
    fresh_file(dbWide);char *dbPath=utf8(dbWide);
    int flags=SQLITE_OPEN_READWRITE;
#ifdef SQLITE_OPEN_NOFOLLOW
    flags|=SQLITE_OPEN_NOFOLLOW;
#endif
    require(sqlite3_open_v2(dbPath,&database,flags,0)==SQLITE_OK,"fresh SQLite open failed");free(dbPath);
#ifndef SQLITE_OMIT_LOAD_EXTENSION
    sqlite3_enable_load_extension(database,0);
#endif
    sql_ok(sqlite3_set_authorizer(database,authorizer,0));
    sql_exec("PRAGMA trusted_schema=OFF;");sql_exec(SCHEMA);sql_exec("BEGIN IMMEDIATE;");
    sqlite3_stmt *s=prepare("INSERT INTO d1_synthetic_guard(token,fixture_id) VALUES(?,?)");bind_text(s,1,GUARD);bind_text(s,2,FIXTURE);inserted(s);sql_ok(sqlite3_finalize(s));
    s=prepare("INSERT INTO meta(id,value) VALUES(1,?)");bind_text(s,1,meta);inserted(s);sql_ok(sqlite3_finalize(s));
    s=prepare("INSERT INTO entities(key,kind,id,data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    cJSON *diagnostics=cJSON_CreateArray(),*row;
    cJSON_ArrayForEach(row,rows){
        require(cJSON_IsObject(row)&&cJSON_GetArraySize(row)==7,"exact fixture row required");
        const char *key=string(row,"key"),*kind=string(row,"kind"),*id=string(row,"id"),*data=string(row,"data"),*record=string(row,"record"),*conflicts=string(row,"conflicts");
        cJSON *deleted=item(row,"deleted");require(cJSON_IsNumber(deleted)&&(deleted->valuedouble==0||deleted->valuedouble==1),"deleted flag must be integer 0/1");
        cJSON *keyParts=cJSON_Parse(key);require(cJSON_IsArray(keyParts)&&cJSON_GetArraySize(keyParts)==2,"row key pair required");
        cJSON *k0=cJSON_GetArrayItem(keyParts,0),*k1=cJSON_GetArrayItem(keyParts,1);
        require(cJSON_IsString(k0)&&cJSON_IsString(k1)&&!strcmp(k0->valuestring,kind)&&!strcmp(k1->valuestring,id),"row identity mismatch");cJSON_Delete(keyParts);
        cJSON *payload=cJSON_ParseWithLengthOpts(data,strlen(data)+1,0,1);require(cJSON_IsObject(payload),"object payload required for legacy projections");
        bind_text(s,1,key);bind_text(s,2,kind);bind_text(s,3,id);bind_text(s,4,data);bind_text(s,5,record);sql_ok(sqlite3_bind_int(s,6,(int)deleted->valuedouble));bind_text(s,7,conflicts);
        cJSON *p=item(payload,"parentId");if(cJSON_IsString(p)&&*p->valuestring)bind_text(s,8,p->valuestring);else sql_ok(sqlite3_bind_null(s,8));
        sql_ok(sqlite3_bind_int(s,9,cJSON_IsTrue(item(payload,"done"))?1:0));
        cJSON *q=item(payload,"quadrant");
        if(cJSON_IsNumber(q)&&finite_number(q->valuedouble)&&q->valuedouble>=(double)INT_MIN&&q->valuedouble<=(double)INT_MAX)sql_ok(sqlite3_bind_int(s,10,(int)q->valuedouble));
        else {sql_ok(sqlite3_bind_null(s,10));if(cJSON_IsNumber(q))diagnostic(diagnostics,key,"quadrant","outside safe int32 conversion domain");}
        cJSON *r=item(payload,"reminderAt");
        if(cJSON_IsNumber(r)&&finite_number(r->valuedouble)&&fabs(r->valuedouble)<=SAFE_INTEGER)sql_ok(sqlite3_bind_int64(s,11,(sqlite3_int64)r->valuedouble));
        else {sql_ok(sqlite3_bind_null(s,11));if(cJSON_IsNumber(r))diagnostic(diagnostics,key,"reminder_at","unsafe-number: original token may exceed exact cJSON double domain");}
        cJSON *start=item(payload,"start");bind_text(s,12,cJSON_IsString(start)?start->valuestring:"");inserted(s);cJSON_Delete(payload);
    }
    sql_ok(sqlite3_finalize(s));s=prepare("INSERT INTO outbox(id,event) VALUES(?,?)");
    cJSON *entry;cJSON_ArrayForEach(entry,outbox){
        require(cJSON_IsObject(entry)&&cJSON_GetArraySize(entry)==2,"exact outbox entry required");cJSON *id=item(entry,"id");
        require(cJSON_IsNumber(id)&&finite_number(id->valuedouble)&&id->valuedouble>=1&&id->valuedouble<=SAFE_INTEGER&&floor(id->valuedouble)==id->valuedouble,"safe positive outbox id required");
        sql_ok(sqlite3_bind_int64(s,1,(sqlite3_int64)id->valuedouble));bind_text(s,2,string(entry,"event"));inserted(s);
    }sql_ok(sqlite3_finalize(s));
    s=prepare("SELECT kind,id,data,record,deleted,conflicts FROM entities WHERE key=?");
    cJSON_ArrayForEach(row,rows){
        bind_text(s,1,string(row,"key"));require(sqlite3_step(s)==SQLITE_ROW,"source verification row missing");
        original_text_check(s,0,string(row,"kind"));original_text_check(s,1,string(row,"id"));original_text_check(s,2,string(row,"data"));original_text_check(s,3,string(row,"record"));
        require(sqlite3_column_type(s,4)==SQLITE_INTEGER&&sqlite3_column_int(s,4)==(int)item(row,"deleted")->valuedouble,"deleted flag changed");original_text_check(s,5,string(row,"conflicts"));
        sql_ok(sqlite3_reset(s));sql_ok(sqlite3_clear_bindings(s));
    }sql_ok(sqlite3_finalize(s));s=prepare("SELECT value FROM meta WHERE id=1");require(sqlite3_step(s)==SQLITE_ROW,"meta missing");original_text_check(s,0,meta);sql_ok(sqlite3_finalize(s));
    s=prepare("SELECT event FROM outbox WHERE id=?");cJSON_ArrayForEach(entry,outbox){sql_ok(sqlite3_bind_int64(s,1,(sqlite3_int64)item(entry,"id")->valuedouble));require(sqlite3_step(s)==SQLITE_ROW,"event missing");original_text_check(s,0,string(entry,"event"));sql_ok(sqlite3_reset(s));sql_ok(sqlite3_clear_bindings(s));}sql_ok(sqlite3_finalize(s));
    int rowCount=count("SELECT count(*) FROM entities"),outCount=count("SELECT count(*) FROM outbox");
    require(rowCount==cJSON_GetArraySize(rows)&&outCount==cJSON_GetArraySize(outbox)&&count("SELECT count(*) FROM d1_synthetic_guard")==1,"source counts changed");
    sql_exec("COMMIT;");sql_exec("PRAGMA wal_checkpoint(TRUNCATE);");sql_ok(sqlite3_close(database));database=0;
    cJSON *receipt=cJSON_CreateObject();cJSON_AddStringToObject(receipt,"status","created");cJSON_AddTrueToObject(receipt,"synthetic");cJSON_AddStringToObject(receipt,"guard",GUARD);cJSON_AddStringToObject(receipt,"fixtureId",FIXTURE);cJSON_AddStringToObject(receipt,"runId",run);cJSON_AddStringToObject(receipt,"candidate",CANDIDATE);
    cJSON_AddStringToObject(receipt,"generator","independent-windows-c-sqlite");cJSON_AddStringToObject(receipt,"sqliteVersion",sqlite3_libversion());cJSON_AddNumberToObject(receipt,"rows",rowCount);cJSON_AddNumberToObject(receipt,"outboxCount",outCount);cJSON_AddStringToObject(receipt,"sourceFile","windows-source.sqlite");cJSON_AddTrueToObject(receipt,"rawTextPreserved");cJSON_AddItemToObject(receipt,"projectionDiagnostics",diagnostics);
    cJSON_AddStringToObject(receipt,"limitations","Synthetic source only; unsafe numeric SQL projections quarantined without claiming current C conversion; original data/record/meta/event/conflicts TEXT preserved; no production wrapper or compatibility claim.");
    char *body=cJSON_Print(receipt);require(body!=0,"receipt serialization failed");path_guard(root,1);
    HANDLE h=CreateFileW(receiptWide,GENERIC_WRITE,0,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,0);require(h!=INVALID_HANDLE_VALUE,"receipt exclusive create failed");
    DWORD written=0,length=(DWORD)strlen(body);require(WriteFile(h,body,length,&written,0)&&written==length,"receipt write incomplete");require(WriteFile(h,"\n",1,&written,0)&&written==1&&FlushFileBuffers(h),"receipt flush incomplete");CloseHandle(h);
    printf("{\"status\":\"created\",\"generator\":\"independent-windows-c-sqlite\",\"rows\":%d,\"outboxCount\":%d}\n",rowCount,outCount);
    cJSON_free(body);cJSON_Delete(receipt);cJSON_Delete(fixture);free(run);return 0;
}
