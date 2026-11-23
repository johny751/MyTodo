/* C006 cloud-only adapter: execute actual sync_run/create_manifest and SQLite.
 * API wrappers change only transport endpoint/proxy/TLS for loopback fixtures. */
#include "../../../windows/native.h"
#include <limits.h>
#ifndef GX_C006_SYNC_SOURCE
#error The cloud builder must select the actual production sync.c.
#endif
static INTERNET_PORT fixture_port;
static int audit_failed;
static int transport_guard_failed;
static HINTERNET WINAPI fixture_open(LPCWSTR agent,DWORD access,LPCWSTR proxy,LPCWSTR bypass,DWORD flags){
 (void)access;(void)proxy;(void)bypass;
 return WinHttpOpen(agent,WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,flags);
}
static HINTERNET WINAPI fixture_connect(HINTERNET session,LPCWSTR host,INTERNET_PORT port,DWORD reserved){
 if(!fixture_port||wcscmp(host,L"dav.jianguoyun.com")||port!=INTERNET_DEFAULT_HTTPS_PORT){transport_guard_failed=1;SetLastError(ERROR_ACCESS_DENIED);return 0;}
 return WinHttpConnect(session,L"127.0.0.1",fixture_port,reserved);
}
static HINTERNET WINAPI fixture_open_request(HINTERNET connect,LPCWSTR verb,LPCWSTR name,LPCWSTR version,LPCWSTR referer,LPCWSTR const*accept,DWORD flags){
 if(!fixture_port||flags!=WINHTTP_FLAG_SECURE){transport_guard_failed=1;SetLastError(ERROR_ACCESS_DENIED);return 0;}
 return WinHttpOpenRequest(connect,verb,name,version,referer,accept,0);
}
#define WinHttpOpen fixture_open
#define WinHttpConnect fixture_connect
#define WinHttpOpenRequest fixture_open_request
#include GX_C006_SYNC_SOURCE
#undef WinHttpOpen
#undef WinHttpConnect
#undef WinHttpOpenRequest

static int temp_path(const wchar_t*value,wchar_t*resolved){
 wchar_t base[32768],root[32768];DWORD n=GetEnvironmentVariableW(L"RUNNER_TEMP",base,32768);
 if(!n||n>=32768||!GetFullPathNameW(base,32768,root,0)||!GetFullPathNameW(value,32768,resolved,0))return 0;
 size_t length=wcslen(root);while(length>3&&root[length-1]==L'\\')root[--length]=0;
 return !_wcsnicmp(root,resolved,length)&&resolved[length]==L'\\'&&resolved[length+1];
}
static int endpoint(const char*url){
 wchar_t*w=wide(url);if(!w)return 0;URL_COMPONENTS p={0};p.dwStructSize=sizeof(p);p.dwHostNameLength=(DWORD)-1;p.dwUrlPathLength=(DWORD)-1;p.dwExtraInfoLength=(DWORD)-1;
 int ok=WinHttpCrackUrl(w,0,0,&p)&&p.nScheme==INTERNET_SCHEME_HTTP&&p.dwHostNameLength==9&&!wcsncmp(p.lpszHostName,L"127.0.0.1",9)&&p.nPort>0&&(p.dwUrlPathLength==0||(p.dwUrlPathLength==1&&p.lpszUrlPath[0]==L'/'))&&!p.dwExtraInfoLength;
 if(ok)fixture_port=p.nPort;free(w);return ok;
}
static J*sql_table(DB*d,const char*query,J*errors,const char*label){
 J*rows=cJSON_CreateArray();sqlite3_stmt*statement=0;int code=sqlite3_prepare_v2(d->sql,query,-1,&statement,0);
 if(code==SQLITE_OK){while((code=sqlite3_step(statement))==SQLITE_ROW){J*row=cJSON_CreateObject();for(int i=0;i<sqlite3_column_count(statement);i++){const char*name=sqlite3_column_name(statement,i);int type=sqlite3_column_type(statement,i);if(type==SQLITE_NULL)set(row,name,cJSON_CreateNull());else if(type==SQLITE_INTEGER||type==SQLITE_FLOAT)sn(row,name,sqlite3_column_double(statement,i));else if(type==SQLITE_TEXT){const char*text=(const char*)sqlite3_column_text(statement,i);ss(row,name,text?text:"");}else{ss(row,name,"<unexpected-blob>");}}cJSON_AddItemToArray(rows,row);}}
 if(code!=SQLITE_DONE){J*error=cJSON_CreateObject();ss(error,"operation",label);sn(error,"sqliteCode",code);ss(error,"message",sqlite3_errmsg(d->sql));cJSON_AddItemToArray(errors,error);}int final=sqlite3_finalize(statement);if(final!=SQLITE_OK){J*error=cJSON_CreateObject();ss(error,"operation","finalize");sn(error,"sqliteCode",final);cJSON_AddItemToArray(errors,error);}return rows;
}
static J*audit(DB*d){
 J*result=cJSON_CreateObject(),*errors=cJSON_CreateArray();
 set(result,"sqlMeta",sql_table(d,"SELECT id,value FROM meta ORDER BY id",errors,"meta"));
 set(result,"sqlEntities",sql_table(d,"SELECT * FROM entities ORDER BY key",errors,"entities"));
 set(result,"sqlOutbox",sql_table(d,"SELECT id,event FROM outbox ORDER BY id",errors,"outbox"));
 set(result,"meta",db_meta(d));set(result,"rows",db_page(d,"",100000));set(result,"outbox",db_outbox(d,INT_MAX));
 set(result,"readErrors",errors);set(result,"autocommit",cJSON_CreateBool(sqlite3_get_autocommit(d->sql)));ss(result,"sqliteVersion",sqlite3_libversion());
 int integrity=db_check(d);set(result,"integrity",cJSON_CreateBool(integrity));if(!integrity||cJSON_GetArraySize(errors))audit_failed=1;return result;
}
static int focused_create(DB*d,J*config){
 Sync s={0};s.d=d;s.config=dup(config);s.ok=1;uuid(s.token);
 if(!db_begin(d)){cJSON_Delete(s.config);return 0;}J*m=db_meta(d);if(!m){db_end(d,0);cJSON_Delete(s.config);return 0;}
 if(cJSON_IsObject(get(m,"lease"))&&num(get(m,"lease"),"until")>epoch_ms()){cJSON_Delete(m);db_end(d,0);cJSON_Delete(s.config);strcpy(d->error,"Existing production lease prevents focused operation");return 0;}
 J*lease=cJSON_CreateObject();ss(lease,"token",s.token);sn(lease,"until",(double)epoch_ms()+120000);set(m,"lease",lease);int ok=db_meta_save(d,m,0);cJSON_Delete(m);if(!db_end(d,ok)){cJSON_Delete(s.config);return 0;}
 s.session=fixture_open(L"MyTodo-C006-Focused",0,0,0,0);if(s.session){WinHttpSetTimeouts(s.session,20000,20000,20000,20000);s.connect=fixture_connect(s.session,L"dav.jianguoyun.com",INTERNET_DEFAULT_HTTPS_PORT,0);}
 ok=s.connect&&create_manifest(&s)&&s.ok;
 if(db_begin(d)){m=db_meta(d);if(m&&!strcmp(str(get(m,"lease"),"token"),s.token)){set(m,"lease",cJSON_CreateNull());if(!db_end(d,db_meta_save(d,m,0)))ok=0;}else{db_end(d,0);ok=0;}cJSON_Delete(m);}else ok=0;
 if(s.connect)WinHttpCloseHandle(s.connect);if(s.session)WinHttpCloseHandle(s.session);cJSON_Delete(s.config);return ok;
}
int wmain(int argc,wchar_t**argv){
 wchar_t cloud[16],spec_path[32768],result_path[32768],dir[32768];
 if(!GetEnvironmentVariableW(L"GITHUB_ACTIONS",cloud,16)||wcscmp(cloud,L"true")||argc!=3||!temp_path(argv[1],spec_path)||!temp_path(argv[2],result_path)){fputs("C006 requires GitHub Actions and explicit runner temporary paths\n",stderr);return 2;}
 char expected[64]={0};if(!GetEnvironmentVariableA("EXPECTED_SOURCE_SHA",expected,sizeof(expected)))GetEnvironmentVariableA("GITHUB_SHA",expected,sizeof(expected));if(strcmp(expected,GX_C006_SOURCE_SHA)){fputs("Frozen native source SHA mismatch\n",stderr);return 2;}
 char*input=read_file(spec_path);J*spec=input?cJSON_ParseWithOpts(input,0,1):0;free(input);if(!cJSON_IsObject(spec)){cJSON_Delete(spec);return 2;}
 wchar_t*requested=wide(str(spec,"directory"));int path_ok=requested&&temp_path(requested,dir);free(requested);const char*op=str(spec,"operation");
 int needs_cloud=!strcmp(op,"sync")||!strcmp(op,"create-manifest");
 if(!path_ok||(!needs_cloud&&strcmp(op,"init")&&strcmp(op,"local")&&strcmp(op,"audit"))||(needs_cloud&&!endpoint(str(spec,"endpoint")))||!valid_folder(str(spec,"folder"))){cJSON_Delete(spec);fputs("Invalid isolated C006 specification\n",stderr);return 2;}
 CoInitializeEx(0,COINIT_APARTMENTTHREADED);DB*d=calloc(1,sizeof(DB));J*result=cJSON_CreateObject();int opened=d&&db_open(d,dir),accepted=0,written=0;char error[1024]="";int up=0,down=0,more=0;
 ss(result,"operation",op);ss(result,"caseId",str(spec,"caseId"));sn(result,"pid",GetCurrentProcessId());ss(result,"directory",str(spec,"directory"));ss(result,"sourceSha",GX_C006_SOURCE_SHA);ss(result,"productionSyncSha256",GX_C006_SYNC_SHA256);ss(result,"productionDatabaseSha256",GX_C006_DATABASE_SHA256);ss(result,"endpoint",needs_cloud?str(spec,"endpoint"):"");ss(result,"testSeam","actual production source included unchanged; WinHTTP wrappers restrict origin to loopback, disable proxy and TLS only");
 if(opened){set(result,"before",audit(d));J*config=cJSON_CreateObject();set(config,"enabled",cJSON_CreateTrue());set(config,"autoSync",cJSON_CreateFalse());ss(config,"folder",str(spec,"folder"));ss(config,"username","c006-fixture@example.invalid");ss(config,"password","c006-synthetic-password");
  if(!strcmp(op,"init"))accepted=config_save(d,config);
  else if(!strcmp(op,"local"))accepted=cJSON_IsArray(get(spec,"changes"))&&db_local(d,get(spec,"changes"),get(spec,"context"));
  else if(!strcmp(op,"audit"))accepted=1;
  else if(!strcmp(op,"sync"))accepted=sync_run(d,&up,&down,&more);
  else{ss(result,"executionScope","focused create_manifest, test-owned lease setup and cleanup; not a sync_run claim");accepted=focused_create(d,config);}
  snprintf(error,sizeof(error),"%s",d->error);set(result,"after",audit(d));sn(result,"uploaded",up);sn(result,"downloaded",down);set(result,"more",cJSON_CreateBool(more));cJSON_Delete(config);db_close(d);
  if(db_open(d,dir)){set(result,"reopened",audit(d));db_close(d);}else{accepted=0;ss(result,"reopenError",d->error);}
 }else{snprintf(error,sizeof(error),"%s",d?d->error:"Allocation failed");if(d)db_close(d);}
 if(transport_guard_failed||audit_failed)accepted=0;set(result,"auditFailed",cJSON_CreateBool(audit_failed));set(result,"transportGuardFailed",cJSON_CreateBool(transport_guard_failed));set(result,"accepted",cJSON_CreateBool(accepted));ss(result,"error",error);sn(result,"exitCode",accepted?0:1);char*output=json(result);if(output){written=write_file(result_path,output);free(output);}printf("{\"accepted\":%s,\"resultWritten\":%s}\n",accepted?"true":"false",written?"true":"false");
 cJSON_Delete(result);cJSON_Delete(spec);free(d);CoUninitialize();return !written?2:accepted?0:1;
}
