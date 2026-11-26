#include "d408.h"
#ifdef GX_D408_CANDIDATE

int d408_test_write_failure;
static int plain_path(const wchar_t *path){
 wchar_t *copy=_wcsdup(path);if(!copy)return 0;int ok=1;
 for(wchar_t *p=copy;*p;p++){if((*p==L'\\'||*p==L'/')&&p>copy+2){wchar_t c=*p;*p=0;DWORD flags=GetFileAttributesW(copy);if(flags!=INVALID_FILE_ATTRIBUTES&&(flags&FILE_ATTRIBUTE_REPARSE_POINT))ok=0;*p=c;}}
 DWORD flags=GetFileAttributesW(path);if(flags!=INVALID_FILE_ATTRIBUTES&&(flags&FILE_ATTRIBUTE_REPARSE_POINT))ok=0;free(copy);if(!ok)SetLastError(ERROR_REPARSE_TAG_INVALID);return ok;
}

void d408_hash(const BYTE *bytes,DWORD size,char hash[65]){
 HCRYPTPROV provider=0;HCRYPTHASH digest=0;BYTE value[32];DWORD length=32;hash[0]=0;
 if(CryptAcquireContextW(&provider,0,0,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)&&
    CryptCreateHash(provider,CALG_SHA_256,0,0,&digest)&&CryptHashData(digest,bytes,size,0)&&
    CryptGetHashParam(digest,HP_HASHVAL,value,&length,0))
   for(int i=0;i<32;i++)sprintf(hash+i*2,"%02x",value[i]);
 if(digest)CryptDestroyHash(digest);if(provider)CryptReleaseContext(provider,0);
}

int d408_file_read(const wchar_t *path,BYTE **bytes,DWORD *size,DWORD limit){
 *bytes=0;*size=0;if(!plain_path(path))return 0;HANDLE file=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ,0,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,0);
 if(file==INVALID_HANDLE_VALUE)return 0;LARGE_INTEGER length;DWORD read=0;
 int ok=GetFileSizeEx(file,&length)&&length.QuadPart>=0&&length.QuadPart<=limit;
 BYTE *buffer=ok?malloc((size_t)length.QuadPart+1):0;
 if(!buffer)ok=0;
 if(ok)ok=ReadFile(file,buffer,(DWORD)length.QuadPart,&read,0)&&read==(DWORD)length.QuadPart;
 CloseHandle(file);if(!ok){free(buffer);return 0;}
 buffer[read]=0;*bytes=buffer;*size=read;return 1;
}

int d408_file_write(const wchar_t *path,const BYTE *bytes,DWORD size){
 if(d408_test_write_failure){SetLastError(ERROR_WRITE_FAULT);return 0;}
 if(!plain_path(path))return 0;
 wchar_t *temporary=calloc(32768,sizeof(wchar_t));if(!temporary)return 0;
 char id[80];uuid(id);wchar_t *uid=wide(id);swprintf(temporary,32768,L"%s.tmp-%s",path,uid);free(uid);
 HANDLE file=CreateFileW(temporary,GENERIC_WRITE,0,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);DWORD wrote=0;
 int ok=file!=INVALID_HANDLE_VALUE;
 if(ok){ok=WriteFile(file,bytes,size,&wrote,0)&&wrote==size&&FlushFileBuffers(file);CloseHandle(file);}
 BYTE *verify=0;DWORD verified=0;
 if(ok)ok=d408_file_read(temporary,&verify,&verified,64*1024*1024)&&verified==size&&!memcmp(verify,bytes,size);
 free(verify);
 if(ok)ok=MoveFileExW(temporary,path,MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH);
 if(!ok)DeleteFileW(temporary);free(temporary);return ok;
}

static J *load(D408Store *store,const wchar_t *path,int *generation){
 BYTE *bytes=0;DWORD size=0;if(!d408_file_read(path,&bytes,&size,64*1024*1024))return 0;
 const char *end=0;J *envelope=cJSON_ParseWithOpts((char*)bytes,&end,1);free(bytes);
 if(!envelope)return 0;J *payload=get(envelope,"payload");char *encoded=payload?json(payload):0,hash[65];
 if(encoded)d408_hash((BYTE*)encoded,(DWORD)strlen(encoded),hash);else hash[0]=0;
 int ok=!strcmp(str(envelope,"format"),store->format)&&num(envelope,"version")==1&&
   num(envelope,"generation")>=1&&num(envelope,"generation")<=2147483646&&
   num(envelope,"generation")==floor(num(envelope,"generation"))&&cJSON_IsObject(payload)&&
   strlen(hash)==64&&!strcmp(hash,str(envelope,"sha256"));
 free(encoded);J *result=ok?dup(payload):0;if(ok)*generation=(int)num(envelope,"generation");cJSON_Delete(envelope);return result;
}

int d408_store_commit(D408Store *store,J *next){
 store->error[0]=0;
 if(!store->lock||store->lock==INVALID_HANDLE_VALUE||store->uncertain||!cJSON_IsObject(next)){
   strcpy(store->error,"候选数据尚未就绪或写入结果未确认，请重新打开后恢复。");return 0;
 }
 if(store->generation>=2147483646){strcpy(store->error,"候选数据版本已到上限，原数据保持不变。");return 0;}
 char *payload=json(next),hash[65];if(!payload){strcpy(store->error,"无法序列化候选数据。");return 0;}
 d408_hash((BYTE*)payload,(DWORD)strlen(payload),hash);free(payload);
 if(strlen(hash)!=64){strcpy(store->error,"无法校验候选数据，未写入。");return 0;}
 J *envelope=cJSON_CreateObject();ss(envelope,"format",store->format);sn(envelope,"version",1);
 sn(envelope,"generation",store->generation+1);ss(envelope,"sha256",hash);set(envelope,"payload",dup(next));char *encoded=json(envelope);cJSON_Delete(envelope);
 if(!encoded||strlen(encoded)>64*1024*1024){free(encoded);strcpy(store->error,"候选数据超过64MiB容量，未截断历史或覆盖原文件。");return 0;}
 int ok=1;
 if(GetFileAttributesW(store->file)!=INVALID_FILE_ATTRIBUTES){
   if(store->recovered){
     wchar_t *bad=calloc(32768,sizeof(wchar_t));swprintf(bad,32768,L"%s.corrupt-%llu",store->file,GetTickCount64());
     ok=CopyFileW(store->file,bad,TRUE);free(bad);
   }else{
     BYTE *old=0;DWORD length=0;ok=d408_file_read(store->file,&old,&length,64*1024*1024)&&d408_file_write(store->previous,old,length);free(old);
   }
 }
 if(ok)ok=d408_file_write(store->file,(BYTE*)encoded,(DWORD)strlen(encoded));
 if(!ok){snprintf(store->error,sizeof(store->error),"候选数据写入失败（Windows %lu），原状态和草稿仍保留，可重试。",GetLastError());free(encoded);return 0;}
 int generation=0;J *confirmed=load(store,store->file,&generation);free(encoded);
 if(!confirmed||generation!=store->generation+1||!eq(confirmed,next)){
   cJSON_Delete(confirmed);store->uncertain=1;strcpy(store->error,"写入后的校验未确认。已停止继续写入，请重启并检查恢复提示。");return 0;
 }
 cJSON_Delete(store->data);store->data=confirmed;store->generation=generation;store->recovered=0;return 1;
}

int d408_store_open(D408Store *store,const char *name,J *initial){
 memset(store,0,sizeof(*store));store->lock=INVALID_HANDLE_VALUE;
 if(!app.dataDirOverride||!name||strspn(name,"abcdefghijklmnopqrstuvwxyz-")!=strlen(name)){
   strcpy(store->error,"D408模块仅允许显式隔离候选目录。");cJSON_Delete(initial);return 0;
 }
 join(store->directory,app.baseDir,L"d408");DWORD flags=GetFileAttributesW(store->directory);
 if((flags!=INVALID_FILE_ATTRIBUTES&&(flags&FILE_ATTRIBUTE_REPARSE_POINT))||!ensure_dir(store->directory)){
   strcpy(store->error,"候选模块目录不可用或为链接目录。");cJSON_Delete(initial);return 0;
 }
 wchar_t file[100],*wname=wide(name);swprintf(file,100,L"%s.json",wname);join(store->file,store->directory,file);
 swprintf(store->previous,32768,L"%s.previous",store->file);
 wchar_t *lock=calloc(32768,sizeof(wchar_t));swprintf(lock,32768,L"%s\\%s.lock",store->directory,wname);free(wname);
 store->lock=plain_path(lock)&&plain_path(store->file)&&plain_path(store->previous)?CreateFileW(lock,GENERIC_READ|GENERIC_WRITE,0,0,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,0):INVALID_HANDLE_VALUE;free(lock);
 if(store->lock==INVALID_HANDLE_VALUE){strcpy(store->error,"另一窗口正在使用该候选模块，请关闭另一窗口再重试。");cJSON_Delete(initial);return 0;}
 snprintf(store->format,sizeof(store->format),"mytodo.d408.%s",name);
 int primaryExists=GetFileAttributesW(store->file)!=INVALID_FILE_ATTRIBUTES;
 int previousExists=GetFileAttributesW(store->previous)!=INVALID_FILE_ATTRIBUTES;
 store->data=load(store,store->file,&store->generation);
 if(!store->data&&previousExists){store->data=load(store,store->previous,&store->generation);store->recovered=store->data!=0;}
 if(!store->data&&(primaryExists||previousExists)){
   strcpy(store->error,"候选数据及前代备份无法通过校验；原文件已保留，未初始化空数据。");cJSON_Delete(initial);return 0;
 }
 if(!store->data){int ok=d408_store_commit(store,initial);cJSON_Delete(initial);return ok;}
 cJSON_Delete(initial);return 1;
}

void d408_store_close(D408Store *store){
 if(store->lock&&store->lock!=INVALID_HANDLE_VALUE)CloseHandle(store->lock);
 cJSON_Delete(store->data);store->data=0;store->lock=INVALID_HANDLE_VALUE;
}
J *d408_find(J *array,const char *id){J *item;cJSON_ArrayForEach(item,array)if(!strcmp(str(item,"id"),id))return item;return 0;}
int d408_remove(J *array,const char *id){int index=0;J *item;cJSON_ArrayForEach(item,array){if(!strcmp(str(item,"id"),id)){cJSON_DeleteItemFromArray(array,index);return 1;}index++;}return 0;}
void d408_event(J *record,const char *action,const char *description){
 J *history=get(record,"history");if(!cJSON_IsArray(history)){history=cJSON_CreateArray();set(record,"history",history);}
 J *event=cJSON_CreateObject();char id[80],stamp[40];uuid(id);now(stamp);ss(event,"id",id);ss(event,"at",stamp);ss(event,"action",action);ss(event,"description",description?description:"");cJSON_AddItemToArray(history,event);ss(record,"updatedAt",stamp);
}
int d408_choice(const char *value,const char *choices){
 const char *part=choices;size_t n=strlen(value);while(*part){const char *end=strchr(part,'|');size_t length=end?(size_t)(end-part):strlen(part);if(length==n&&!memcmp(part,value,n))return 1;if(!end)break;part=end+1;}return 0;
}
void d408_error(HWND owner,const char *message){wchar_t *w=wide(message);MessageBoxW(owner?owner:app.window,w,L"MyTodo · 候选数据",MB_OK|MB_ICONWARNING);free(w);}

#endif
