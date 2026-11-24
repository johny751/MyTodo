/* Actions-only synthetic harness. Links the actual Windows storage adapter,
   migration engine, util and undo_capture implementation. No storage mocks. */
/* Keep underscored CRT APIs (_commit/_fileno), but suppress its optional POSIX
   dup declaration in this test translation unit. Production dup(J *) stays. */
#ifdef _CRT_DECLARE_NONSTDC_NAMES
#undef _CRT_DECLARE_NONSTDC_NAMES
#endif
#define _CRT_DECLARE_NONSTDC_NAMES 0
#include "../../windows/ui.h"
#include "../../windows/migration.h"
#include <string.h>
#include <wchar.h>
#include <io.h>
#include <float.h>

App app; /* Actual headless App state; undo_capture's existing readiness guard. */
static wchar_t ROOT[32768];
static J *CASES;
static char FIRST[2048];
static const char *META="{\"version\":2,\"actor\":\"synthetic-actor\",\"seq\":0,\"clock\":0,\"queue\":0,\"vector\":{},\"cursors\":{},\"settings\":{},\"scope\":null,\"epoch\":null,\"pending\":null,\"initialized\":true,\"revision\":0,\"dataRevision\":0}";
static const char *CORE=
 "CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);"
 "CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT);"
 "CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL);";
static const char *REVERSE=
 "CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1));"
 "CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY);"
 "CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY);";
static const char *INDEXES="CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start);CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at);CREATE INDEX task_parent ON entities(parent_id);";
#ifndef MYTODO_D2_FIXTURE_SHA256
#define MYTODO_D2_FIXTURE_SHA256 ""
#endif

static int fail(const char *text){if(!*FIRST)snprintf(FIRST,sizeof(FIRST),"%s",text);fprintf(stderr,"BLOCKER: %s\n",text);fflush(stderr);return 0;}
static int must(int ok,const char *text){return ok?1:fail(text);}
static int sql(DB *db,const char *text){char *error=0;int code=sqlite3_exec(db->sql,text,0,0,&error);if(code!=SQLITE_OK){char message[1600];snprintf(message,sizeof(message),"SQL (%d): %s",code,error?error:sqlite3_errmsg(db->sql));sqlite3_free(error);return fail(message);}sqlite3_free(error);return 1;}
static int ancestor_guard(const wchar_t *path,int file){
 wchar_t cursor[32768];wcscpy(cursor,path);int first=1;
 for(;;){DWORD attrs=GetFileAttributesW(cursor);if(!must(attrs!=INVALID_FILE_ATTRIBUTES,"missing guarded ancestor"))return 0;if(!must(!(attrs&FILE_ATTRIBUTE_REPARSE_POINT),"reparse ancestor refused"))return 0;
  if(!must(first&&file?!(attrs&FILE_ATTRIBUTE_DIRECTORY):(attrs&FILE_ATTRIBUTE_DIRECTORY)!=0,"guarded path type"))return 0;
  if(wcslen(cursor)<=3)break;wchar_t *slash=wcsrchr(cursor,L'\\');if(!must(slash!=0,"invalid ancestor"))return 0;if(slash==cursor+2)cursor[3]=0;else *slash=0;first=0;
 }return 1;
}
static int normalize_path(const wchar_t *path,wchar_t *out){
 if(!must(path&&wcslen(path)>3&&path[1]==L':'&&(path[2]==L'\\'||path[2]==L'/'),"absolute local drive required"))return 0;
 for(size_t i=2;path[i];i++)if(!must(path[i]!=L':',"alternate stream refused"))return 0;
 DWORD length=GetFullPathNameW(path,32768,out,0);if(!must(length>0&&length<32768,"path resolution"))return 0;
 for(size_t i=0;out[i];i++)if(out[i]==L'/')out[i]=L'\\';size_t n=wcslen(out);while(n>3&&out[n-1]==L'\\')out[--n]=0;return 1;
}
static int regular(const wchar_t *file){if(!ancestor_guard(file,1))return 0;HANDLE h=CreateFileW(file,GENERIC_READ,FILE_SHARE_READ,0,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,0);if(!must(h!=INVALID_HANDLE_VALUE,"guard file open"))return 0;BY_HANDLE_FILE_INFORMATION info;int ok=GetFileInformationByHandle(h,&info)&&!(info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)&&info.nNumberOfLinks==1;CloseHandle(h);return must(ok,"regular unlinked file required");}
static int guard(const wchar_t *supplied){
 wchar_t temp[32768],resolved[32768],sha[100],expected[100],run[80],environment[80],os[40],actions[20];
 if(!must(GetEnvironmentVariableW(L"GITHUB_ACTIONS",actions,20)&&!wcscmp(actions,L"true"),"Actions-only execution"))return 0;
 if(!must(GetEnvironmentVariableW(L"RUNNER_ENVIRONMENT",environment,80)&&!wcscmp(environment,L"github-hosted")&&GetEnvironmentVariableW(L"RUNNER_OS",os,40)&&!wcscmp(os,L"Windows"),"hosted Windows-only execution"))return 0;
 if(!must(GetEnvironmentVariableW(L"GITHUB_SHA",sha,100)&&GetEnvironmentVariableW(L"EXPECTED_SOURCE_SHA",expected,100)&&!wcscmp(sha,expected)&&wcslen(sha)==40,"exact checked source required"))return 0;
 if(!must(GetEnvironmentVariableW(L"GITHUB_RUN_ID",run,80)&&wcslen(run)>0,"run identity required"))return 0;for(const wchar_t *p=run;*p;p++)if(!must(*p>=L'0'&&*p<=L'9',"numeric run identity"))return 0;
 if(!must(GetEnvironmentVariableW(L"RUNNER_TEMP",temp,32768)>0,"RUNNER_TEMP required"))return 0;
 if(!normalize_path(temp,resolved)||!normalize_path(supplied,ROOT))return 0;size_t n=wcslen(resolved);
 if(!must(!_wcsnicmp(ROOT,resolved,n)&&ROOT[n]==L'\\'&&wcslen(ROOT)>n+1,"dedicated RUNNER_TEMP child required"))return 0;
 wchar_t basename[160];swprintf(basename,160,L"d2-%s-win32",run);if(!must(!_wcsicmp(ROOT+n+1,basename),"fixed per-run Windows root required"))return 0;
 if(!ancestor_guard(ROOT,0))return 0;wchar_t marker[32768];join(marker,ROOT,L".d2-synthetic-only.json");if(!regular(marker))return 0;
 char *raw=read_file(marker);J *j=raw?cJSON_ParseWithOpts(raw,0,1):0;free(raw);char *runUtf8=utf8(run);
 int ok=j&&cJSON_GetArraySize(j)==4&&truth(j,"syntheticOnly")&&!strcmp(str(j,"contractId"),STORAGE_CONTRACT_ID)&&!strcmp(str(j,"runId"),runUtf8)&&!strcmp(str(j,"framework"),"d2-real-storage-api-v1");free(runUtf8);cJSON_Delete(j);return must(ok,"D2 marker mismatch");
}
static int save(const wchar_t *directory,const wchar_t *name,J *data){wchar_t file[32768];join(file,directory,name);if(!must(GetFileAttributesW(file)==INVALID_FILE_ATTRIBUTES,"fresh evidence file required"))return 0;char *text=json(data);FILE *f=_wfopen(file,L"wbx");if(!must(f!=0,"create external evidence")){free(text);return 0;}size_t n=strlen(text);int ok=fwrite(text,1,n,f)==n&&fwrite("\n",1,1,f)==1&&fflush(f)==0&&_commit(_fileno(f))==0;fclose(f);free(text);return must(ok,"external evidence write/flush");}
static int factory(DB *db,const wchar_t *directory,int reverse,int typed){
 if(!must(CreateDirectoryW(directory,0),"fresh synthetic case directory"))return 0;wchar_t file[32768];join(file,directory,L"tasks.sqlite");char *path=utf8(file);
 int code=sqlite3_open_v2(path,&db->sql,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,0);free(path);if(!must(code==SQLITE_OK,"fixture actual SQLite open"))return 0;
 if(!sql(db,"PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;")||!sql(db,reverse?REVERSE:CORE)||!sql(db,INDEXES))return 0;
 sqlite3_stmt *stmt=0;code=sqlite3_prepare_v2(db->sql,"INSERT INTO meta(id,value) VALUES(1,?)",-1,&stmt,0);if(code==SQLITE_OK)code=sqlite3_bind_text(stmt,1,META,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_step(stmt);int done=sqlite3_finalize(stmt);if(!must(code==SQLITE_DONE&&done==SQLITE_OK,"fixture meta bytes"))return 0;
 if(!db_close_checked(db)||!db_open(db,directory))return fail(db->error);
 J *row=cJSON_Parse("{\"key\":\"[\\\"tasks\\\",\\\"synthetic-1\\\"]\",\"data\":{\"title\":\"synthetic task\",\"quadrant\":2,\"done\":false,\"start\":\"\"},\"record\":{\"key\":\"[\\\"tasks\\\",\\\"synthetic-1\\\"]\",\"events\":[]},\"conflicts\":[],\"deleted\":false}");
 int ok=row&&db_begin(db)&&db_put(db,row)&&db_end(db,1);cJSON_Delete(row);if(!ok)return fail(db->error);
 if(!sql(db,"INSERT INTO outbox(id,event) VALUES(7,' {\"synthetic\":true,\"id\":7} ');"))return 0;
 if(typed){
  if(!sql(db,"INSERT INTO entities(key,kind,id,data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start) VALUES('typed','tasks','typed','  {\"title\":\"保留原字节\"}  ',x'7B7D',0,x'5B5D',NULL,9007199254740993,1.0000000000000002,-9223372036854775808,'🙂');"))return 0;
  stmt=0;code=sqlite3_prepare_v2(db->sql,"UPDATE entities SET parent_id=? WHERE key='typed'",-1,&stmt,0);const unsigned char embedded[]={0x61,0,0x62,0xff};if(code==SQLITE_OK)code=sqlite3_bind_blob(stmt,1,embedded,sizeof(embedded),SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_step(stmt);done=sqlite3_finalize(stmt);if(!must(code==SQLITE_DONE&&done==SQLITE_OK,"typed BLOB fixture"))return 0;
 }return 1;
}
typedef struct {const char *fault;FILE *stages;} Observation;
static int deny_rollback(void *p,int action,const char *a,const char *b,const char *c,const char *d);
static int observer(DB *db,const char *stage,void *opaque){
 Observation *o=opaque;fprintf(o->stages,"{\"stage\":\"%s\",\"autocommit\":%s}\n",stage,sqlite3_get_autocommit(db->sql)?"true":"false");if(fflush(o->stages)||_commit(_fileno(o->stages)))return 1;
 if(o->fault&&!strcmp(o->fault,"mutate")&&!strcmp(stage,"afterSnapshot")){sqlite3_exec(db->sql,"UPDATE meta SET value=value||' '",0,0,0);return 0;}
 if(o->fault&&!strcmp(o->fault,"crashBefore")&&!strcmp(stage,"beforeCommit"))ExitProcess(90);
 if(o->fault&&!strcmp(o->fault,"crashAfter")&&!strcmp(stage,"afterCommit"))ExitProcess(91);
 if(o->fault&&!strcmp(o->fault,"rollbackFailure")&&!strcmp(stage,"afterSchema")){sqlite3_set_authorizer(db->sql,deny_rollback,0);strcpy(db->error,"synthetic first observer failure before real rollback rejection");return 1;}
 if(o->fault&&!strcmp(o->fault,stage)){snprintf(db->error,sizeof(db->error),"synthetic observer fault at %s",stage);return 1;}return 0;
}
static int deny_create(void *p,int action,const char *a,const char *b,const char *c,const char *d){(void)p;(void)a;(void)b;(void)c;(void)d;return action==SQLITE_CREATE_TABLE?SQLITE_DENY:SQLITE_OK;}
static int deny_rollback(void *p,int action,const char *a,const char *b,const char *c,const char *d){(void)p;(void)b;(void)c;(void)d;return action==SQLITE_TRANSACTION&&a&&!strcmp(a,"ROLLBACK")?SQLITE_DENY:SQLITE_OK;}
static int reject_commit(void *p){(void)p;return 1;}
static int equal(const StorageSnapshot *a,const StorageSnapshot *b){return a->userVersion==b->userVersion&&!strcmp(a->schemaFingerprint,b->schemaFingerprint)&&!strcmp(a->rawFingerprint,b->rawFingerprint);}
static const char *NAMES[]={"baseline-migration","reordered-explicit-columns","typed-byte-preservation","empty-original-tables","fixed-window-reentry","data-advanced-reentry","unknown-extra-column","unknown-extra-index","unknown-trigger","unknown-view","unknown-version","gui-layout-refused","missing-build-identity","source-snapshot-race","real-authorizer-failure","real-commit-hook-failure","before-commit-failure","after-commit-unknown","unknown-data-advanced","partial-registry-refused","real-rollback-failure","actual-close-busy","actual-api-rollback","actual-api-lock-contention","snapshot-tamper-refused","real-binary64-fingerprint","shared-cross-source-target","original-raw-mutation-rollback"};
static int sealed_backup(DB *db,const wchar_t *name){
 wchar_t target[32768];join(target,ROOT,name);if(!must(GetFileAttributesW(target)==INVALID_FILE_ATTRIBUTES,"fresh sealed cross database"))return 0;
 char *path=utf8(target);sqlite3 *copy=0;int code=sqlite3_open_v2(path,&copy,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,0);free(path);if(!must(code==SQLITE_OK,"sealed destination open")){if(copy)sqlite3_close(copy);return 0;}
 sqlite3_backup *backup=sqlite3_backup_init(copy,"main",db->sql,"main");int ok=backup!=0;if(ok){code=sqlite3_backup_step(backup,-1);int done=sqlite3_backup_finish(backup);ok=code==SQLITE_DONE&&done==SQLITE_OK;}int close=sqlite3_close(copy);return must(ok&&close==SQLITE_OK,"actual SQLite consistent backup");
}
static int shared_fixture(DB *db){
 wchar_t file[32768];join(file,ROOT,L"shared-fixture.json");if(!regular(file))return 0;char *raw=read_file(file);if(!must(raw!=0,"shared fixture read"))return 0;char fingerprint[65];sha256(raw,fingerprint);int ok=!strcmp(fingerprint,MYTODO_D2_FIXTURE_SHA256)&&strlen(fingerprint)==64;J *fixture=cJSON_ParseWithOpts(raw,0,1);free(raw);
 ok=ok&&fixture&&truth(fixture,"syntheticOnly")&&!strcmp(str(fixture,"fixtureId"),"d2-core-raw-boundaries-v1")&&!strcmp(str(fixture,"crossSourceFile"),"cross-source.sqlite")&&!strcmp(str(fixture,"crossTargetFile"),"cross-target.sqlite");J *statements=get(fixture,"sql");ok=ok&&cJSON_IsArray(statements)&&cJSON_GetArraySize(statements)==8;
 if(ok){J *item;cJSON_ArrayForEach(item,statements){if(!cJSON_IsString(item)||!sql(db,item->valuestring)){ok=0;break;}}}cJSON_Delete(fixture);return must(ok,"build-bound shared raw fixture");
}
#define REQUIRE(condition,reason) do{if(!must((condition),(reason))){ok=0;goto cleanup;}}while(0)
static int run_case(int index){
 FIRST[0]=0;int ok=1,call=0;DB db={0},other={0};StorageSnapshot source={0},after={0};StorageMigrationResult result={0},recovery={0};sqlite3_stmt *held=0;FILE *stages=0;J *caseResult=cJSON_CreateObject();wchar_t directory[32768],name[100],stageFile[32768];
 swprintf(name,100,L"native-%02d",index+1);join(directory,ROOT,name);REQUIRE(factory(&db,directory,index==1,index==2||index==25),"real storage factory");
 if(index==1){REQUIRE(sql(&db,"DELETE FROM meta"),"reordered initializer fixture");REQUIRE(db_close_checked(&db)&&db_open(&db,directory),"real db_open explicit-column initialization");J *changes=cJSON_Parse("[{\"key\":\"[\\\"tasks\\\",\\\"synthetic-local\\\"]\",\"values\":{\"title\":\"synthetic local\",\"done\":false}}]");int wrote=changes&&db_local(&db,changes,0);cJSON_Delete(changes);REQUIRE(wrote,"actual db_local explicit outbox and metadata write");}
 if(index==26){REQUIRE(shared_fixture(&db),"shared raw history after actual API write");REQUIRE(sealed_backup(&db,L"cross-source.sqlite"),"sealed common original database");}
 if(index==3)REQUIRE(sql(&db,"DELETE FROM entities;DELETE FROM outbox;DELETE FROM meta;"),"empty fixture");
 if(index>=6&&index<=11){const char *changes[]={"ALTER TABLE meta ADD COLUMN synthetic_extra TEXT","CREATE INDEX synthetic_extra ON entities(id)","CREATE TRIGGER synthetic_extra AFTER UPDATE ON meta BEGIN SELECT 1; END","CREATE VIEW synthetic_extra AS SELECT id FROM meta","PRAGMA user_version=42","CREATE TABLE native_search(key TEXT PRIMARY KEY,text TEXT NOT NULL)"};REQUIRE(sql(&db,changes[index-6]),"unknown schema injection");REQUIRE(!db_migration_capture(&db,&source),"unknown schema/version must be rejected");ss(caseResult,"diagnostic",db.error);goto cleanup;}
 REQUIRE(db_migration_capture(&db,&source),"source capture");J *snapshot=db_migration_snapshot_json(&source);REQUIRE(save(directory,L"source.json",snapshot),"external original snapshot");cJSON_Delete(snapshot);
 StorageMigrationRequest request={STORAGE_MIGRATION_ID,STORAGE_CONTRACT_ID,STORAGE_ALGORITHM_ID,db_migration_build_identity(),&source};
 if(index==21){REQUIRE(sqlite3_prepare_v2(db.sql,"SELECT value FROM meta",-1,&held,0)==SQLITE_OK,"prepare outstanding actual statement");strcpy(db.error,"synthetic primary operation error");REQUIRE(!db_close_checked(&db)&&db.sql!=0,"busy close preserves real handle");REQUIRE(strstr(db.error,"synthetic primary")&&strstr(db.error,"close"),"busy close preserves both errors");ss(caseResult,"diagnostic",db.error);sqlite3_finalize(held);held=0;REQUIRE(db_close_checked(&db)&&db.sql==0,"checked close succeeds after cleanup");goto cleanup;}
 if(index==22){REQUIRE(db_begin(&db),"actual begin");REQUIRE(sql(&db,"UPDATE meta SET value=value||' '"),"actual update");strcpy(db.error,"synthetic primary statement error");REQUIRE(!db_end(&db,0)&&strstr(db.error,"primary"),"actual db_end rollback primary preservation");REQUIRE(db_migration_capture(&db,&after)&&equal(&source,&after),"actual rollback raw/schema unchanged");db_close(&db);REQUIRE(db.sql==0,"actual legacy db_close delegates successfully");goto cleanup;}
 if(index==23){REQUIRE(db_migration_reopen(&other,&source)&&db_begin(&other),"second actual handle lock");sqlite3_busy_timeout(db.sql,1);REQUIRE(!db_begin(&db)&&*db.error,"actual BEGIN IMMEDIATE reports busy");ss(caseResult,"diagnostic",db.error);db_end(&other,0);REQUIRE(db_migration_capture(&db,&after)&&equal(&source,&after),"lock failure preserves original");goto cleanup;}
 if(index==25){REQUIRE(sql(&db,"UPDATE entities SET quadrant=1.0000000000000004 WHERE key='typed'"),"binary64 mutation");REQUIRE(db_migration_capture(&db,&after)&&strcmp(source.rawFingerprint,after.rawFingerprint),"REAL actual binary64 bits affect fingerprint");goto cleanup;}
 if(index==12)request.implementationChecksum="";
 if(index==13)REQUIRE(sql(&db,"UPDATE meta SET value=value||' '"),"source race injection");
 if(index==24){source.rawPayload[0]='X';}
 join(stageFile,directory,L"stages.jsonl");stages=_wfopen(stageFile,L"wbx");REQUIRE(stages!=0,"fresh external stage audit");Observation observation={0,stages};
 if(index==14)sqlite3_set_authorizer(db.sql,deny_create,0);
 if(index==15)sqlite3_commit_hook(db.sql,reject_commit,0);
 if(index==16)observation.fault="beforeCommit";
 if(index==17)observation.fault="afterCommit";
 if(index==27)observation.fault="mutate";
 if(index==20)observation.fault="rollbackFailure";
 call=db_migration_apply(&db,&request,observer,&observation,&result);
 set(caseResult,"attempt",db_migration_result_json(&result));REQUIRE(save(directory,L"attempt.json",get(caseResult,"attempt")),"durable external attempt audit");
 sqlite3_set_authorizer(db.sql,0,0);sqlite3_commit_hook(db.sql,0,0);
 if(index==12||index==13||index==24){REQUIRE(!call,"identity/source tamper/race refuses migration");if(index==24)source.rawPayload[0]='S';goto cleanup;}
 if(index==14||index==15||index==16||index==17||index==20||index==27){
  REQUIRE(!call&&*result.firstError,"fault returns first error");if(index==20){REQUIRE(*result.rollbackError&&!sqlite3_get_autocommit(db.sql),"real rollback authorizer failure retained");db_end(&db,0);}
  REQUIRE(db_close_checked(&db)&&db_migration_reopen(&other,&source),"same-file new actual handle");
  REQUIRE(db_migration_resolve(&other,&request,&recovery),"same-file fault resolution");REQUIRE(!strcmp(recovery.status,index==17?"committed":"notCommitted"),"exact recovery classification");set(caseResult,"recovery",db_migration_result_json(&recovery));REQUIRE(save(directory,L"recovery.json",get(caseResult,"recovery")),"external second attempt audit");goto cleanup;
 }
 REQUIRE(call&&!strcmp(result.status,"committed"),"actual migration committed");REQUIRE(db_migration_capture(&db,&after)&&after.userVersion==1&&!strcmp(after.rawFingerprint,source.rawFingerprint)&&strcmp(after.schemaFingerprint,source.schemaFingerprint),"only fixed infrastructure/version changed");
 snapshot=db_migration_snapshot_json(&after);REQUIRE(save(directory,L"after.json",snapshot),"target snapshot evidence");cJSON_Delete(snapshot);
 if(index==26){REQUIRE(sealed_backup(&db,L"cross-target.sqlite"),"sealed common target database");J *cross=cJSON_CreateObject();set(cross,"source",db_migration_snapshot_json(&source));set(cross,"target",db_migration_snapshot_json(&after));REQUIRE(save(ROOT,L"cross-fingerprints.json",cross),"common byte fingerprint evidence");cJSON_Delete(cross);}
 if(index==4){REQUIRE(db_migration_apply(&db,&request,0,0,&recovery)&&!strcmp(recovery.status,"alreadyCommitted"),"fixed-window idempotent reentry");StorageSnapshot again={0};REQUIRE(db_migration_capture(&db,&again)&&equal(&again,&after),"reentry does not alter stored bytes");db_migration_snapshot_free(&again);set(caseResult,"reentry",db_migration_result_json(&recovery));}
 if(index==5){REQUIRE(sql(&db,"UPDATE meta SET value=value||' '"),"later edit injection");REQUIRE(!db_migration_apply(&db,&request,0,0,&recovery)&&!strcmp(recovery.status,"blockedDataAdvanced"),"later edit blocks reentry");set(caseResult,"reentry",db_migration_result_json(&recovery));}
 if(index==18||index==19){REQUIRE(sql(&db,index==18?"UPDATE outbox SET event=event||' '":"UPDATE storage_migration_registry SET checksum='tampered'"),"later ACK/data or partial registry injection");REQUIRE(db_close_checked(&db)&&db_migration_reopen(&other,&source),"fresh same-file resolution handle");REQUIRE(!db_migration_resolve(&other,&request,&recovery)&&!strcmp(recovery.status,index==18?"blockedDataAdvanced":"blockedUnknown"),"ambiguous/advanced recovery blocks without restore");set(caseResult,"recovery",db_migration_result_json(&recovery));}
 if(index==0||index==1||index==2||index==3){REQUIRE(db_close_checked(&db)&&db_migration_reopen(&other,&source)&&db_migration_resolve(&other,&request,&recovery)&&!strcmp(recovery.status,"committed"),"committed target verified on actual reopen");set(caseResult,"recovery",db_migration_result_json(&recovery));}
cleanup:
 if(held)sqlite3_finalize(held);if(stages)fclose(stages);if(db.sql){sqlite3_set_authorizer(db.sql,0,0);sqlite3_commit_hook(db.sql,0,0);if(!sqlite3_get_autocommit(db.sql))db_end(&db,0);if(!db_close_checked(&db))ok=fail(db.error);}if(other.sql){if(!sqlite3_get_autocommit(other.sql))db_end(&other,0);if(!db_close_checked(&other))ok=fail(other.error);}
 db_migration_snapshot_free(&source);db_migration_snapshot_free(&after);ss(caseResult,"name",NAMES[index]);set(caseResult,"passed",cJSON_CreateBool(ok));ss(caseResult,"firstError",FIRST);char *where=utf8(directory);ss(caseResult,"directory",where);free(where);cJSON_AddItemToArray(CASES,caseResult);return ok;
}
static int crash_child(int after){
 DB db={0};StorageSnapshot source={0};StorageMigrationResult result={0};wchar_t directory[32768],file[32768];join(directory,ROOT,after?L"native-crash-after":L"native-crash-before");if(!ancestor_guard(directory,0)||!db_open(&db,directory)||!db_migration_capture(&db,&source)){fail(db.error);return 2;}
 join(file,directory,L"child-stages.jsonl");FILE *stages=_wfopen(file,L"wbx");if(!stages)return 2;Observation observation={after?"crashAfter":"crashBefore",stages};StorageMigrationRequest request={STORAGE_MIGRATION_ID,STORAGE_CONTRACT_ID,STORAGE_ALGORITHM_ID,db_migration_build_identity(),&source};
 db_migration_apply(&db,&request,observer,&observation,&result);J *audit=db_migration_result_json(&result);save(directory,L"unexpected-child-return.json",audit);cJSON_Delete(audit);fclose(stages);db_migration_snapshot_free(&source);db_close_checked(&db);return 2;
}
static int process_case(int after){
 FIRST[0]=0;DB db={0},reopened={0};StorageSnapshot source={0};StorageMigrationResult recovery={0};int ok=1;J *record=cJSON_CreateObject();wchar_t directory[32768],executable[32768],command[65536],out[32768],err[32768];PROCESS_INFORMATION process={0};HANDLE stdoutFile=INVALID_HANDLE_VALUE,stderrFile=INVALID_HANDLE_VALUE,stdinFile=INVALID_HANDLE_VALUE;
 join(directory,ROOT,after?L"native-crash-after":L"native-crash-before");REQUIRE(factory(&db,directory,0,0)&&db_migration_capture(&db,&source),"fresh actual process-crash fixture");J *snapshot=db_migration_snapshot_json(&source);REQUIRE(save(directory,L"source.json",snapshot),"external pre-crash immutable source");cJSON_Delete(snapshot);REQUIRE(db_close_checked(&db),"parent closes source before child owns it");
 REQUIRE(GetModuleFileNameW(0,executable,32768)>0,"current runner path");swprintf(command,65536,L"\"%s\" \"%s\" %s",executable,ROOT,after?L"--crash-after":L"--crash-before");join(out,directory,L"child.stdout.log");join(err,directory,L"child.stderr.log");SECURITY_ATTRIBUTES attributes={sizeof(attributes),0,TRUE};
 stdoutFile=CreateFileW(out,GENERIC_WRITE,FILE_SHARE_READ,&attributes,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);stderrFile=CreateFileW(err,GENERIC_WRITE,FILE_SHARE_READ,&attributes,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);REQUIRE(stdoutFile!=INVALID_HANDLE_VALUE&&stderrFile!=INVALID_HANDLE_VALUE,"fresh retained child output streams");STARTUPINFOW startup={0};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESTDHANDLES;startup.hStdOutput=stdoutFile;startup.hStdError=stderrFile;stdinFile=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&attributes,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,0);REQUIRE(stdinFile!=INVALID_HANDLE_VALUE,"child NUL input handle");startup.hStdInput=stdinFile;
 REQUIRE(CreateProcessW(executable,command,0,0,TRUE,CREATE_NO_WINDOW,0,directory,&startup,&process),"spawn actual isolated crash process");REQUIRE(WaitForSingleObject(process.hProcess,60000)==WAIT_OBJECT_0,"bounded child process completion");DWORD code=0;REQUIRE(GetExitCodeProcess(process.hProcess,&code)&&code==(after?91:90),"real process exited at fixed transaction boundary");sn(record,"childExitCode",code);ss(record,"firstAttempt","process exited at diagnostic boundary; COMMIT outcome requires same-file reopen");
 StorageMigrationRequest request={STORAGE_MIGRATION_ID,STORAGE_CONTRACT_ID,STORAGE_ALGORITHM_ID,db_migration_build_identity(),&source};REQUIRE(db_migration_reopen(&reopened,&source)&&db_migration_resolve(&reopened,&request,&recovery),"new actual handle process-exit recovery");REQUIRE(!strcmp(recovery.status,after?"committed":"notCommitted"),"process-exit same-file classification");set(record,"recovery",db_migration_result_json(&recovery));REQUIRE(save(directory,L"recovery.json",get(record,"recovery")),"second external recovery audit");
cleanup:
 if(stdinFile!=INVALID_HANDLE_VALUE)CloseHandle(stdinFile);if(process.hThread)CloseHandle(process.hThread);if(process.hProcess)CloseHandle(process.hProcess);if(stdoutFile!=INVALID_HANDLE_VALUE){FlushFileBuffers(stdoutFile);CloseHandle(stdoutFile);}if(stderrFile!=INVALID_HANDLE_VALUE){FlushFileBuffers(stderrFile);CloseHandle(stderrFile);}if(db.sql)db_close_checked(&db);if(reopened.sql)db_close_checked(&reopened);db_migration_snapshot_free(&source);
 ss(record,"name",after?"process-crash-after-commit":"process-crash-before-commit");set(record,"passed",cJSON_CreateBool(ok));ss(record,"firstError",FIRST);cJSON_AddItemToArray(CASES,record);return ok;
}
int wmain(int argc,wchar_t **argv){
 if((argc!=2&&argc!=3)||!guard(argv[1]))return 2;if(argc==3){if(!wcscmp(argv[2],L"--crash-before"))return crash_child(0);if(!wcscmp(argv[2],L"--crash-after"))return crash_child(1);return 2;}CASES=cJSON_CreateArray();int passed=0,regularTotal=(int)(sizeof(NAMES)/sizeof(NAMES[0])),total=regularTotal+2;for(int i=0;i<regularTotal;i++)if(run_case(i))passed++;for(int i=0;i<2;i++)if(process_case(i))passed++;
 J *receipt=cJSON_CreateObject();ss(receipt,"schema","d2-native-results-v1");ss(receipt,"framework","d2-real-storage-api-v1");ss(receipt,"platform","windows-c");ss(receipt,"status",passed==total?"passed":"failed");ss(receipt,"contractId",STORAGE_CONTRACT_ID);ss(receipt,"implementationChecksum",db_migration_build_identity());sn(receipt,"total",total);sn(receipt,"passed",passed);sn(receipt,"failed",total-passed);set(receipt,"cases",CASES);
 const char *apis[]={"db_open","db_put","db_local","db_begin","db_end","db_close","db_close_checked","db_migration_capture","db_migration_apply","db_migration_reopen","db_migration_resolve"};const char *sources[]={"windows/database.c","windows/migration.c","windows/util.c","windows/operations.c"};J *apiList=cJSON_CreateArray(),*sourceList=cJSON_CreateArray();for(size_t i=0;i<sizeof(apis)/sizeof(apis[0]);i++)cJSON_AddItemToArray(apiList,cJSON_CreateString(apis[i]));for(size_t i=0;i<sizeof(sources)/sizeof(sources[0]);i++)cJSON_AddItemToArray(sourceList,cJSON_CreateString(sources[i]));set(receipt,"actualProductionApis",apiList);set(receipt,"actualProductionSources",sourceList);
 wchar_t sha[100],run[80],attempt[80];GetEnvironmentVariableW(L"GITHUB_SHA",sha,100);GetEnvironmentVariableW(L"GITHUB_RUN_ID",run,80);GetEnvironmentVariableW(L"GITHUB_RUN_ATTEMPT",attempt,80);char *s=utf8(sha),*r=utf8(run),*a=utf8(attempt);ss(receipt,"sourceSha",s);ss(receipt,"runId",r);ss(receipt,"runAttempt",a);free(s);free(r);free(a);
 int saved=save(ROOT,L"results.json",receipt);char *output=json(receipt);puts(output);free(output);cJSON_Delete(receipt);return saved&&passed==total?0:2;
}
