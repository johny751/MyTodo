#include "ui.h"

#define STORAGE_LIMIT 32000
static int storage_error(char*error,size_t n,const char*message){snprintf(error,n,"%s",message);return 0;}
static int storage_join(wchar_t*out,const wchar_t*dir,const wchar_t*name){if(wcslen(dir)+wcslen(name)+2>=STORAGE_LIMIT)return 0;join(out,dir,name);return 1;}
static int path_contains(const wchar_t*root,const wchar_t*p){size_t n=wcslen(root);return !_wcsnicmp(root,p,n)&&(p[n]==0||p[n]==L'\\'||root[n-1]==L'\\');}
static int canonical_dir(const wchar_t*dir,wchar_t*out,char*error,size_t n){
 if(!dir||!*dir||wcslen(dir)>=STORAGE_LIMIT)return storage_error(error,n,"请选择有效的数据库目录");
 HANDLE h=CreateFileW(dir,0,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,0,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS,0);
 if(h==INVALID_HANDLE_VALUE)return storage_error(error,n,"目录不存在或无法访问，请先创建文件夹");
 BY_HANDLE_FILE_INFORMATION info;DWORD length=GetFinalPathNameByHandleW(h,out,32768,FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);int ok=GetFileInformationByHandle(h,&info);CloseHandle(h);
 if(!length||length>=STORAGE_LIMIT||!ok||!(info.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY))return storage_error(error,n,"请选择文件夹而不是文件");
 if(!wcsncmp(out,L"\\\\?\\",4))memmove(out,out+4,(wcslen(out+4)+1)*sizeof(wchar_t));
 size_t count=wcslen(out);while(count>3&&out[count-1]==L'\\')out[--count]=0;
 if(count<3||out[1]!=L':'||out[2]!=L'\\')return storage_error(error,n,"数据库目录需要位于本机磁盘");
 wchar_t drive[4]={out[0],L':',L'\\',0};if(GetDriveTypeW(drive)==DRIVE_REMOTE)return storage_error(error,n,"数据库目录需要位于本机磁盘");return 1;
}
static int directory_empty(const wchar_t*dir){wchar_t*pattern=malloc(65536);if(!pattern)return 0;if(!storage_join(pattern,dir,L"*")){free(pattern);return 0;}WIN32_FIND_DATAW f;HANDLE find=FindFirstFileW(pattern,&f);free(pattern);if(find==INVALID_HANDLE_VALUE)return GetLastError()==ERROR_FILE_NOT_FOUND;int empty=1;do{if(wcscmp(f.cFileName,L".")&&wcscmp(f.cFileName,L"..")){empty=0;break;}}while(FindNextFileW(find,&f));if(empty&&GetLastError()!=ERROR_NO_MORE_FILES)empty=0;FindClose(find);return empty;}
void storage_set_window_root(HWND window,const wchar_t*dir){wchar_t*p=calloc(32768,sizeof(wchar_t));if(!p)return;GetFullPathNameW(dir,32768,p,0);CharLowerBuffW(p,(DWORD)wcslen(p));char*s=utf8(p),hash[65];sha256(s,hash);hash[16]=0;uint64_t tag=_strtoui64(hash,0,16);SetPropW(window,L"GxDataRoot",(HANDLE)(uintptr_t)(tag?tag:1));free(s);free(p);}
void storage_location_file(wchar_t*out){wchar_t local[MAX_PATH];SHGetFolderPathW(0,CSIDL_LOCAL_APPDATA,0,SHGFP_TYPE_CURRENT,local);swprintf(out,32768,L"%s\\GxTodoLocal\\location.json",local);}
int storage_load_location(const wchar_t*file,wchar_t*out,char*error,size_t n){
 DWORD attr=GetFileAttributesW(file);if(attr==INVALID_FILE_ATTRIBUTES){DWORD e=GetLastError();if(e==ERROR_FILE_NOT_FOUND||e==ERROR_PATH_NOT_FOUND)return 0;storage_error(error,n,"无法读取数据库位置设置");return -1;}
 char*t=read_file(file);J*j=t?cJSON_Parse(t):0;free(t);wchar_t*p=wide(str(j,"dataDir"));int ok=j&&num(j,"version")==1&&canonical_dir(p,out,error,n);free(p);cJSON_Delete(j);if(!ok){storage_error(error,n,"已保存的数据库目录不可用，请恢复该目录或用 --data-dir 指定目录");return -1;}
 wchar_t*db=malloc(65536);storage_join(db,out,L"tasks.sqlite");int exists=GetFileAttributesW(db)!=INVALID_FILE_ATTRIBUTES;storage_join(db,out,L"accounts.json");exists=exists||GetFileAttributesW(db)!=INVALID_FILE_ATTRIBUTES;free(db);if(!exists){storage_error(error,n,"已保存目录中找不到数据库，已停止启动以避免创建空数据");return -1;}return 1;
}
int storage_save_location(const wchar_t*file,const wchar_t*dir,char*error,size_t n){
 wchar_t*parent=_wcsdup(file),*slash=wcsrchr(parent,L'\\');if(!slash)slash=wcsrchr(parent,L'/');if(!slash){free(parent);return storage_error(error,n,"数据库位置设置文件路径无效");}*slash=0;int ok=ensure_dir(parent);free(parent);if(!ok)return storage_error(error,n,"无法创建数据库位置设置目录");
 J*j=cJSON_CreateObject();sn(j,"version",1);char*p=utf8(dir);ss(j,"dataDir",p);free(p);char*t=json(j);ok=write_file(file,t);free(t);cJSON_Delete(j);return ok?1:storage_error(error,n,"数据库位置设置保存失败，继续使用原目录");
}
HANDLE storage_guard(const wchar_t*dir,int exclusive){wchar_t*file=malloc(65536);if(!file)return INVALID_HANDLE_VALUE;storage_join(file,dir,L".gxtodo-root.lock");HANDLE h=CreateFileW(file,exclusive?GENERIC_READ|GENERIC_WRITE:GENERIC_READ,exclusive?0:FILE_SHARE_READ,0,OPEN_ALWAYS,FILE_ATTRIBUTE_HIDDEN,0);free(file);return h;}
int storage_validate_target(const wchar_t*base,const wchar_t*target,wchar_t*out,char*error,size_t n){
 wchar_t*source=malloc(65536);int ok=source&&canonical_dir(base,source,error,n)&&canonical_dir(target,out,error,n);if(ok&&(!_wcsicmp(source,out)||path_contains(source,out)||path_contains(out,source)))ok=storage_error(error,n,"新目录不能是当前目录、它的子目录或上级目录");if(ok&&!directory_empty(out))ok=storage_error(error,n,"请选择空文件夹，现有文件不会被覆盖");free(source);return ok;
}
static int backup_database(const wchar_t*source,const wchar_t*target,char*error,size_t n){
 sqlite3*src=0,*dst=0;char*a=utf8(source),*b=utf8(target);int ok=sqlite3_open_v2(a,&src,SQLITE_OPEN_READONLY|SQLITE_OPEN_FULLMUTEX,0)==SQLITE_OK;free(a);if(ok)ok=sqlite3_open_v2(b,&dst,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,0)==SQLITE_OK;free(b);
 sqlite3_backup*backup=ok?sqlite3_backup_init(dst,"main",src,"main"):0;int rc=SQLITE_ERROR;if(backup){uint64_t until=GetTickCount64()+5000;do{rc=sqlite3_backup_step(backup,256);if(rc==SQLITE_BUSY||rc==SQLITE_LOCKED)Sleep(10);}while((rc==SQLITE_OK||rc==SQLITE_BUSY||rc==SQLITE_LOCKED)&&GetTickCount64()<until);int finish=sqlite3_backup_finish(backup);ok=rc==SQLITE_DONE&&finish==SQLITE_OK;}else ok=0;
 if(ok){DB check={0};check.sql=dst;ok=db_check(&check);}if(!ok)storage_error(error,n,"数据库快照或完整性校验失败，继续使用原目录");if(dst)sqlite3_close(dst);if(src)sqlite3_close(src);return ok;
}
static int ends_with(const wchar_t*name,const wchar_t*suffix){size_t a=wcslen(name),b=wcslen(suffix);return a>=b&&!_wcsicmp(name+a-b,suffix);}
static int copy_tree(const wchar_t*source,const wchar_t*target,int depth,char*error,size_t n){
 if(depth>32)return storage_error(error,n,"数据目录层级过深");wchar_t*paths=malloc(3*65536);if(!paths)return storage_error(error,n,"内存不足");wchar_t*pattern=paths,*from=paths+32768,*to=paths+65536;
 if(!storage_join(pattern,source,L"*")){free(paths);return storage_error(error,n,"数据路径过长");}WIN32_FIND_DATAW f;HANDLE find=FindFirstFileW(pattern,&f);if(find==INVALID_HANDLE_VALUE){free(paths);return GetLastError()==ERROR_FILE_NOT_FOUND?1:storage_error(error,n,"无法读取原数据目录");}int ok=1;
 do{const wchar_t*name=f.cFileName;if(!wcscmp(name,L".")||!wcscmp(name,L"..")||!wcscmp(name,L".gxtodo-root.lock"))continue;if(!storage_join(from,source,name)||!storage_join(to,target,name)){ok=storage_error(error,n,"数据路径过长");break;}if(f.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){ok=storage_error(error,n,"数据目录含有链接，请先改用普通文件夹");break;}
 if(f.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY){ok=CreateDirectoryW(to,0)&&copy_tree(from,to,depth+1,error,n);if(!ok&&!*error)storage_error(error,n,"无法复制数据子目录");}
 else if(ends_with(name,L".sqlite-wal")||ends_with(name,L".sqlite-shm")||ends_with(name,L".sqlite-journal"))continue;
 else if(ends_with(name,L".sqlite"))ok=backup_database(from,to,error,n);
 else{ok=CopyFileW(from,to,TRUE);if(!ok)storage_error(error,n,"数据文件复制失败，继续使用原目录");}if(!ok)break;
 }while(FindNextFileW(find,&f));if(ok&&GetLastError()!=ERROR_NO_MORE_FILES)ok=storage_error(error,n,"数据目录读取不完整");FindClose(find);free(paths);return ok;
}
/* Only called for this operation's freshly created staging directory. Never traverses links. */
static void remove_staging(const wchar_t*dir,int depth){if(depth>32)return;wchar_t*paths=malloc(2*65536);if(!paths)return;wchar_t*pattern=paths,*child=paths+32768;storage_join(pattern,dir,L"*");WIN32_FIND_DATAW f;HANDLE find=FindFirstFileW(pattern,&f);if(find!=INVALID_HANDLE_VALUE){do{if(!wcscmp(f.cFileName,L".")||!wcscmp(f.cFileName,L".."))continue;storage_join(child,dir,f.cFileName);if((f.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)&&!(f.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))remove_staging(child,depth+1);else{SetFileAttributesW(child,FILE_ATTRIBUTE_NORMAL);if(f.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)RemoveDirectoryW(child);else DeleteFileW(child);}}while(FindNextFileW(find,&f));FindClose(find);}free(paths);RemoveDirectoryW(dir);}
int storage_migrate(DB*active,J*registry,const wchar_t*base,const wchar_t*target,const wchar_t*locationFile,DB*next,HANDLE*nextGuard,char*error,size_t n){
 memset(next,0,sizeof(*next));*nextGuard=INVALID_HANDLE_VALUE;*error=0;wchar_t*paths=calloc(5,65536);if(!paths)return storage_error(error,n,"内存不足");wchar_t*destination=paths,*stage=paths+32768,*activeDir=paths+65536,*file=paths+98304,*source=paths+131072;
 int ok=storage_validate_target(base,target,destination,error,n),owned=0,committed=0;if(!ok)goto done;if(!canonical_dir(base,source,error,n)){ok=0;goto done;}
 char id[80];uuid(id);wchar_t*wid=wide(id);swprintf(stage,32768,L"%s.gxtodo-migrate-%s",destination,wid);free(wid);
 if(wcslen(stage)>=STORAGE_LIMIT||path_contains(source,stage)||!CreateDirectoryW(stage,0)){ok=storage_error(error,n,"无法创建迁移临时目录");goto done;}owned=1;
 ok=copy_tree(source,stage,0,error,n);if(!ok)goto done;storage_join(file,stage,L"accounts.json");char*registryText=json(registry);ok=write_file(file,registryText);free(registryText);if(!ok){storage_error(error,n,"账号清单保存失败");goto done;}
 const char*account=str(registry,"activeId");if(!strcmp(account,"default"))wcscpy(activeDir,stage);else{if(strncmp(account,"account-",8)||strspn(account,"abcdefghijklmnopqrstuvwxyz0123456789-")!=strlen(account)){ok=storage_error(error,n,"当前账号标识无效");goto done;}wchar_t*w=wide(account);swprintf(activeDir,32768,L"%s\\accounts\\%s",stage,w);free(w);}
 storage_join(file,activeDir,L"tasks.sqlite");if(GetFileAttributesW(file)==INVALID_FILE_ATTRIBUTES){ok=storage_error(error,n,"迁移数据缺少当前账号数据库");goto done;}
 if(!directory_empty(destination)||!RemoveDirectoryW(destination)||!MoveFileExW(stage,destination,MOVEFILE_WRITE_THROUGH)){ok=storage_error(error,n,"无法启用新目录，继续使用原目录");goto done;}committed=1;owned=0;
 if(!strcmp(account,"default"))wcscpy(activeDir,destination);else{wchar_t*w=wide(account);swprintf(activeDir,32768,L"%s\\accounts\\%s",destination,w);free(w);}
 ok=db_open(next,activeDir)&&ui_query_init(next)&&db_check(next);if(!ok){storage_error(error,n,"无法打开或校验新数据库，继续使用原目录");db_close(next);goto done;}
 if(path_contains(destination,locationFile)){ok=storage_error(error,n,"位置设置文件不能位于迁移目标内");db_close(next);goto done;}
 *nextGuard=storage_guard(destination,0);if(*nextGuard==INVALID_HANDLE_VALUE){ok=storage_error(error,n,"新目录正在被其他程序操作，继续使用原目录");db_close(next);goto done;}
 ok=storage_save_location(locationFile,destination,error,n);if(!ok){CloseHandle(*nextGuard);*nextGuard=INVALID_HANDLE_VALUE;db_close(next);}
 done:if(owned)remove_staging(stage,0);if(!ok&&committed){/* Preserve the verified copy for recovery; the original remains authoritative. */}free(paths);(void)active;return ok;
}
