#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <io.h>
#include <fcntl.h>
#define MAX_BLOB (256*1024)
#define MAX_INPUT (MAX_BLOB*2+1024)
static int digit(char c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;}
int main(int argc,char**argv){
 if(argc!=2||(strcmp(argv[1],"--protect")&&strcmp(argv[1],"--unprotect")&&strcmp(argv[1],"--unprotect-legacy"))){fputs("Invalid operation\n",stderr);return 2;}
 _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
 BYTE*input=calloc(MAX_INPUT+1,1);if(!input)return 1;
 size_t used=fread(input,1,MAX_INPUT+1,stdin);
 int decrypt=strcmp(argv[1],"--protect")!=0,legacy=!strcmp(argv[1],"--unprotect-legacy");
 if(ferror(stdin)||used>MAX_INPUT||(!decrypt&&used>MAX_BLOB)){SecureZeroMemory(input,MAX_INPUT+1);free(input);fputs("Input exceeds limit\n",stderr);return 2;}
 if(decrypt){
  if(!used||used%2){SecureZeroMemory(input,MAX_INPUT+1);free(input);return 2;}
  for(size_t i=0;i<used/2;i++){int a=digit(input[i*2]),b=digit(input[i*2+1]);if(a<0||b<0){SecureZeroMemory(input,MAX_INPUT+1);free(input);return 2;}input[i]=(BYTE)(a*16+b);}used/=2;
 }
 DATA_BLOB in={(DWORD)used,input},out={0};
 int ok=decrypt?CryptUnprotectData(&in,0,0,0,0,CRYPTPROTECT_UI_FORBIDDEN,&out):CryptProtectData(&in,L"GxTodo Web sync settings",0,0,0,CRYPTPROTECT_UI_FORBIDDEN,&out);
 SecureZeroMemory(input,MAX_INPUT+1);free(input);
 if(!ok){fputs("Windows credential protection failed\n",stderr);return 1;}
 if(legacy){
  if(!out.cbData||out.cbData%sizeof(WCHAR)||out.cbData>MAX_BLOB)ok=0;
  else{
   int count=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,(WCHAR*)out.pbData,(int)(out.cbData/sizeof(WCHAR)),0,0,0,0);
   char*utf8=count?malloc((size_t)count):0;
   if(!utf8)ok=0;
   else{ok=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,(WCHAR*)out.pbData,(int)(out.cbData/sizeof(WCHAR)),utf8,count,0,0)==count&&fwrite(utf8,1,count,stdout)==(size_t)count;SecureZeroMemory(utf8,count);free(utf8);}
  }
 }else if(decrypt)ok=out.cbData<=MAX_BLOB&&fwrite(out.pbData,1,out.cbData,stdout)==out.cbData;
 else{
  char*hex=malloc(out.cbData*2+1);if(!hex)ok=0;
  else{for(DWORD i=0;i<out.cbData;i++)sprintf(hex+i*2,"%02x",out.pbData[i]);ok=fwrite(hex,1,out.cbData*2,stdout)==out.cbData*2;SecureZeroMemory(hex,out.cbData*2+1);free(hex);}
 }
 SecureZeroMemory(out.pbData,out.cbData);LocalFree(out.pbData);return ok&&fflush(stdout)==0?0:1;
}
