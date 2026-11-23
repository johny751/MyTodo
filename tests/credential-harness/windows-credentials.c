/* Credential-only console adapter. Links the actual windows/sync.c functions.
 * Never writes plaintext credentials to stdout, stderr, command lines or files. */
#include "../../windows/native.h"
#include <io.h>
#include <fcntl.h>
#define INPUT_LIMIT (256*1024)
static int cloud(void){wchar_t v[16];return GetEnvironmentVariableW(L"GITHUB_ACTIONS",v,16)&&!wcscmp(v,L"true");}
int wmain(int argc,wchar_t**argv){
 if(!cloud()||argc!=3){fputs("Cloud-only credential adapter: operation and directory required\n",stderr);return 2;}
 const wchar_t*operation=argv[1];if(wcscmp(operation,L"write")&&wcscmp(operation,L"verify")&&wcscmp(operation,L"read-fails")){fputs("Invalid operation\n",stderr);return 2;}
 wchar_t runner[32768],root[32768],dir[32768];DWORD r=GetEnvironmentVariableW(L"RUNNER_TEMP",runner,32768);
 if(!r||r>=32768||!GetFullPathNameW(runner,32768,root,0)||!GetFullPathNameW(argv[2],32768,dir,0)){fputs("Runner temporary path required\n",stderr);return 2;}
 size_t len=wcslen(root);while(len&&root[len-1]=='\\')root[--len]=0;
 if(_wcsnicmp(root,dir,len)||dir[len]!='\\'||!dir[len+1]){fputs("Path outside runner temporary directory\n",stderr);return 2;}
 _setmode(_fileno(stdin),_O_BINARY);char*input=calloc(INPUT_LIMIT+2,1);if(!input)return 2;size_t n=fread(input,1,INPUT_LIMIT+1,stdin);J*expected=0;int ok=0;
 if(ferror(stdin)||n>INPUT_LIMIT)goto done;
 DB*d=calloc(1,sizeof(DB));if(!d)goto done;wcscpy(d->dir,dir);
 if(!wcscmp(operation,L"read-fails")){J*value=config_read(d);ok=!value;cJSON_Delete(value);}
 else{expected=cJSON_ParseWithOpts(input,0,1);if(cJSON_IsObject(expected)){if(!wcscmp(operation,L"write"))ok=config_save(d,expected);else{J*value=config_read(d);ok=cJSON_Compare(value,expected,1);cJSON_Delete(value);}}}
 SecureZeroMemory(d,sizeof(DB));free(d);
done:
 cJSON_Delete(expected);SecureZeroMemory(input,INPUT_LIMIT+2);free(input);puts(ok?"{\"ok\":true}":"{\"ok\":false}");return ok?0:1;
}
