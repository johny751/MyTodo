#ifndef GX_D404_CANDIDATE_GUARD_H
#define GX_D404_CANDIDATE_GUARD_H
#ifdef GX_D404_CANDIDATE
/* Candidate boundary only. Normal builds do not compile this code. The marker
 * is not business storage: it binds this preview to its own explicit directory. */
static wchar_t candidateDirectory[32768];
static int candidate_refuse(const wchar_t *reason){
 fwprintf(stderr,L"D4-04 candidate refused: %ls\nUse --data-dir with a new empty candidate directory.\n",reason);
 wchar_t ci[16];if(!GetEnvironmentVariableW(L"GITHUB_ACTIONS",ci,16)||wcscmp(ci,L"true")){
   wchar_t message[1400];swprintf(message,1400,L"此文件是 MyTodo D4-04 隔离候选版。\n\n%s\n\n请使用 Start-Native-Candidate.cmd，或指定新的空目录：\nMyTodo-Native-Candidate.exe --data-dir C:\\MyTodo-Candidate-Data\n\n不会打开原应用默认数据库。",reason);
   MessageBoxW(0,message,L"MyTodo · 隔离启动要求",MB_OK|MB_ICONINFORMATION);
 }return 0;
}
static int candidate_plain_path(wchar_t *path){
 /* Reject junction/symlink ancestors, remote paths, ADS and drive roots. */
 size_t n=wcslen(path);if(n<4||path[1]!=L':'||path[2]!=L'\\'||wcschr(path+2,L':'))return 0;
 for(size_t i=3;i<=n;i++)if(path[i]==L'\\'||!path[i]){
   wchar_t saved=path[i];path[i]=0;DWORD flags=GetFileAttributesW(path);path[i]=saved;
   if(flags!=INVALID_FILE_ATTRIBUTES&&(flags&FILE_ATTRIBUTE_REPARSE_POINT))return 0;
 }return 1;
}
static int candidate_guard(int argc,wchar_t **argv){
 int index=0;for(int i=1;i<argc;i++){
   if(!wcscmp(argv[i],L"--data-dir")){if(index||i+1>=argc||!*argv[i+1]||!wcsncmp(argv[i+1],L"--",2))return candidate_refuse(L"必须且只能指定一个有效的 --data-dir。");index=++i;}
   else if(!wcscmp(argv[i],L"--use-config")||!wcscmp(argv[i],L"--sync")||!wcscmp(argv[i],L"--config")||!wcscmp(argv[i],L"--import")||!wcscmp(argv[i],L"--feedback-import")||!wcscmp(argv[i],L"--storage-regression"))
     return candidate_refuse(L"隔离候选版不启用远端配置、外部数据导入或数据库迁移。");
 }
 if(!index)return candidate_refuse(L"未指定隔离数据目录；已在数据库初始化前停止。");
 DWORD size=GetFullPathNameW(argv[index],32768,candidateDirectory,0);
 if(!size||size>=32000)return candidate_refuse(L"隔离目录路径无效或过长。");
 while(size>3&&candidateDirectory[size-1]==L'\\')candidateDirectory[--size]=0;
 if(!candidate_plain_path(candidateDirectory))return candidate_refuse(L"隔离目录必须是普通本地子目录，不能是盘符根、网络路径或链接目录。");
 DWORD flags=GetFileAttributesW(candidateDirectory);
 if(flags!=INVALID_FILE_ATTRIBUTES&&!(flags&FILE_ATTRIBUTE_DIRECTORY))return candidate_refuse(L"指定路径不是文件夹。");
 if(flags==INVALID_FILE_ATTRIBUTES&&!ensure_dir(candidateDirectory))return candidate_refuse(L"无法创建隔离目录。");
 if(!candidate_plain_path(candidateDirectory))return candidate_refuse(L"创建后的隔离路径未通过检查。");
 wchar_t *marker=calloc(32768,sizeof(wchar_t)),*scan=calloc(32768,sizeof(wchar_t));
 if(!marker||!scan){free(marker);free(scan);return candidate_refuse(L"无法分配隔离路径检查内存。");}
 join(marker,candidateDirectory,L".mytodo-d404-candidate-v1");join(scan,candidateDirectory,L"*");
 wchar_t *lower=_wcsdup(candidateDirectory);if(!lower){free(marker);free(scan);return candidate_refuse(L"隔离检查内存不足。");}CharLowerBuffW(lower,(DWORD)wcslen(lower));char *path=utf8(lower);free(lower);
 if(!path){free(marker);free(scan);return candidate_refuse(L"隔离路径编码无效。");}size_t length=strlen(path)+100;char *expected=calloc(length,1);
 if(!expected){free(path);free(marker);free(scan);return candidate_refuse(L"隔离检查内存不足。");}snprintf(expected,length,"MyTodo D4-04 isolated native candidate v1\nroot=%s\n",path);free(path);
 DWORD bytes=(DWORD)strlen(expected);int ok=0;flags=GetFileAttributesW(marker);
 if(flags!=INVALID_FILE_ATTRIBUTES){
   if(!(flags&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))){HANDLE file=CreateFileW(marker,GENERIC_READ,FILE_SHARE_READ,0,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,0);
     if(file!=INVALID_HANDLE_VALUE){BY_HANDLE_FILE_INFORMATION info;DWORD got=0;char *actual=calloc(bytes+2,1);
       if(actual&&GetFileInformationByHandle(file,&info)&&info.nNumberOfLinks==1&&!info.nFileSizeHigh&&info.nFileSizeLow==bytes&&ReadFile(file,actual,bytes+1,&got,0))ok=got==bytes&&!memcmp(actual,expected,bytes);
       free(actual);CloseHandle(file);}
   }
 }else{
   WIN32_FIND_DATAW data;HANDLE found=FindFirstFileW(scan,&data);int empty=1;
   if(found!=INVALID_HANDLE_VALUE){do{if(wcscmp(data.cFileName,L".")&&wcscmp(data.cFileName,L"..")){empty=0;break;}}while(FindNextFileW(found,&data));FindClose(found);}else empty=GetLastError()==ERROR_FILE_NOT_FOUND;
   if(empty){HANDLE file=CreateFileW(marker,GENERIC_WRITE,0,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_WRITE_THROUGH,0);
     if(file!=INVALID_HANDLE_VALUE){DWORD wrote=0;ok=WriteFile(file,expected,bytes,&wrote,0)&&wrote==bytes&&FlushFileBuffers(file);CloseHandle(file);if(!ok)DeleteFileW(marker);}}
 }
 free(expected);free(marker);free(scan);
 if(!ok)return candidate_refuse(L"目录已有内容但没有匹配的候选标记，或标记损坏。已有数据库保持原样。");
 argv[index]=candidateDirectory;return 1;
}
#else
static int candidate_guard(int argc,wchar_t **argv){(void)argc;(void)argv;return 1;}
#endif
#endif
