/* Cloud-only, external debugger for the unchanged native legacy drag suite.
   No injection, exception recovery, product source instrumentation or retries. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dbghelp.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
#include <stdint.h>
#include <io.h>
#include <fcntl.h>

static FILE *events;
static HANDLE target;
static DWORD targetId;
static DWORD64 productImageBase;
static wchar_t output[32768];
static unsigned exceptionCount, captureCount;
static int symbolReady, captureErrors;

static void quoted(const char *text) {
    fputc('"', events);
    for (const unsigned char *p=(const unsigned char *)(text?text:""); *p; ++p) {
        if (*p=='"'||*p=='\\') { fputc('\\',events); fputc(*p,events); }
        else if (*p<32) fprintf(events,"\\u%04x",*p);
        else fputc(*p,events);
    }
    fputc('"',events);
}
static void quoted_wide(const wchar_t *text) {
    int n=WideCharToMultiByte(CP_UTF8,0,text,-1,0,0,0,0);
    char *utf=calloc(n?n:1,1);
    if (n) WideCharToMultiByte(CP_UTF8,0,text,-1,utf,n,0,0);
    quoted(utf);free(utf);
}
static void finish_event(void) { fputs("}\n",events);fflush(events); }
static void error_event(const char *operation,DWORD error) {
    fputs("{\"type\":\"diagnostic-error\",\"operation\":",events);quoted(operation);
    fprintf(events,",\"win32Error\":%lu",error);finish_event();
}
static void load_module(HANDLE file,LPVOID base) {
    wchar_t name[32768]=L"";
    if (file) GetFinalPathNameByHandleW(file,name,32768,FILE_NAME_NORMALIZED);
    DWORD64 loaded=symbolReady?SymLoadModuleExW(target,file,*name?name:0,0,(DWORD64)(uintptr_t)base,0,0,0):0;
    fprintf(events,"{\"type\":\"module\",\"base\":\"0x%llx\",\"path\":",(unsigned long long)(uintptr_t)base);
    quoted_wide(name);fprintf(events,",\"symbolsLoadedBase\":\"0x%llx\"",(unsigned long long)loaded);finish_event();
    if (file) CloseHandle(file);
}
static void frame_event(unsigned index,DWORD64 address) {
    IMAGEHLP_MODULE64 module={0};module.SizeOfStruct=sizeof(module);
    union { SYMBOL_INFO aligned; unsigned char bytes[sizeof(SYMBOL_INFO)+MAX_SYM_NAME]; } storage={0};
    SYMBOL_INFO *symbol=&storage.aligned;symbol->SizeOfStruct=sizeof(*symbol);symbol->MaxNameLen=MAX_SYM_NAME;
    DWORD64 displacement=0;int hasSymbol=symbolReady&&SymFromAddr(target,address,&displacement,symbol);
    /* Query after SymFromAddr has forced any deferred PDB load. */
    int hasModule=symbolReady&&SymGetModuleInfo64(target,address,&module);
    IMAGEHLP_LINE64 line={0};line.SizeOfStruct=sizeof(line);DWORD lineOffset=0;
    int hasLine=symbolReady&&SymGetLineFromAddr64(target,address,&lineOffset,&line);
    fprintf(events,"{\"type\":\"frame\",\"capture\":%u,\"index\":%u,\"pc\":\"0x%llx\",\"module\":",captureCount,index,(unsigned long long)address);
    if(hasModule)quoted(module.ImageName);else fputs("null",events);
    fprintf(events,",\"moduleBase\":\"0x%llx\",\"rva\":\"0x%llx\",\"pdbUnmatched\":%s,\"symbolType\":%d,\"symbol\":",hasModule?(unsigned long long)module.BaseOfImage:0,hasModule?(unsigned long long)(address-module.BaseOfImage):0,hasModule&&module.PdbUnmatched?"true":"false",hasModule?(int)module.SymType:0);
    if(hasSymbol)quoted(symbol->Name);else fputs("null",events);
    fprintf(events,",\"symbolDisplacement\":%llu,\"sourceFile\":",(unsigned long long)displacement);
    if(hasLine)quoted(line.FileName);else fputs("null",events);
    fprintf(events,",\"sourceLine\":%lu",hasLine?line.LineNumber:0);finish_event();
}
static void observe_product_symbols(void) {
    IMAGE_DOS_HEADER dos={0};IMAGE_NT_HEADERS64 nt={0};SIZE_T got=0;
    DWORD64 entry=productImageBase;
    if(ReadProcessMemory(target,(void *)(uintptr_t)productImageBase,&dos,sizeof(dos),&got)&&got==sizeof(dos)&&dos.e_magic==IMAGE_DOS_SIGNATURE&&dos.e_lfanew>0&&dos.e_lfanew<1048576&&
       ReadProcessMemory(target,(void *)(uintptr_t)(productImageBase+dos.e_lfanew),&nt,sizeof(nt),&got)&&got==sizeof(nt)&&nt.Signature==IMAGE_NT_SIGNATURE&&nt.FileHeader.Machine==IMAGE_FILE_MACHINE_AMD64)entry+=nt.OptionalHeader.AddressOfEntryPoint;
    union {SYMBOL_INFO aligned;unsigned char bytes[sizeof(SYMBOL_INFO)+MAX_SYM_NAME];} buffer={0};
    buffer.aligned.SizeOfStruct=sizeof(SYMBOL_INFO);buffer.aligned.MaxNameLen=MAX_SYM_NAME;DWORD64 displacement=0;
    if(symbolReady)SymFromAddr(target,entry,&displacement,&buffer.aligned);
    IMAGEHLP_MODULE64 module={0};module.SizeOfStruct=sizeof(module);
    int available=symbolReady&&SymGetModuleInfo64(target,productImageBase,&module);
    int matched=available&&module.SymType==SymPdb&&!module.PdbUnmatched&&*module.LoadedPdbName;
    if(!matched)++captureErrors;
    fprintf(events,"{\"type\":\"product-symbols\",\"imageBase\":\"0x%llx\",\"entry\":\"0x%llx\",\"matchedPdbLoaded\":%s,\"symbolType\":%d,\"pdbUnmatched\":%s,\"lineNumbers\":%s,\"loadedPdb\":",(unsigned long long)productImageBase,(unsigned long long)entry,matched?"true":"false",available?(int)module.SymType:0,available&&module.PdbUnmatched?"true":"false",available&&module.LineNumbers?"true":"false");
    if(available)quoted(module.LoadedPdbName);else fputs("null",events);
    fprintf(events,",\"pdbAge\":%lu,\"pdbGuid\":\"%08lx-%04x-%04x-",module.PdbAge,module.PdbSig70.Data1,module.PdbSig70.Data2,module.PdbSig70.Data3);
    for(int i=0;i<8;i++)fprintf(events,"%02x",module.PdbSig70.Data4[i]);fputc('"',events);finish_event();
}
static void capture_exception(const DEBUG_EVENT *event) {
    const EXCEPTION_DEBUG_INFO *info=&event->u.Exception;
    ++captureCount;
    HANDLE thread=OpenThread(THREAD_GET_CONTEXT|THREAD_QUERY_INFORMATION,FALSE,event->dwThreadId);
    CONTEXT context={0};context.ContextFlags=CONTEXT_ALL;
    if(!thread||!GetThreadContext(thread,&context)) {
        ++captureErrors;error_event("GetThreadContext",GetLastError());if(thread)CloseHandle(thread);return;
    }
    fprintf(events,"{\"type\":\"context\",\"capture\":%u,\"threadId\":%lu,\"rip\":\"0x%llx\",\"rsp\":\"0x%llx\",\"rbp\":\"0x%llx\",\"rcx\":\"0x%llx\",\"rdx\":\"0x%llx\",\"r8\":\"0x%llx\",\"r9\":\"0x%llx\"",captureCount,event->dwThreadId,context.Rip,context.Rsp,context.Rbp,context.Rcx,context.Rdx,context.R8,context.R9);finish_event();
    wchar_t dumpPath[32768];swprintf_s(dumpPath,32768,L"%ls\\exception-%03u-%ls.dmp",output,captureCount,info->dwFirstChance?L"first":L"second");
    HANDLE dump=CreateFileW(dumpPath,GENERIC_WRITE,FILE_SHARE_READ,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);
    BOOL dumpOk=FALSE;DWORD dumpError=0;
    EXCEPTION_RECORD record=info->ExceptionRecord;
    EXCEPTION_POINTERS pointers={&record,&context};
    MINIDUMP_EXCEPTION_INFORMATION exception={event->dwThreadId,&pointers,FALSE};
    if(dump!=INVALID_HANDLE_VALUE) {
        dumpOk=MiniDumpWriteDump(target,targetId,dump,(MINIDUMP_TYPE)(MiniDumpWithThreadInfo|MiniDumpWithUnloadedModules|MiniDumpWithIndirectlyReferencedMemory|MiniDumpWithFullMemoryInfo),&exception,0,0);
        if(!dumpOk)dumpError=GetLastError();CloseHandle(dump);
    } else dumpError=GetLastError();
    if(!dumpOk)++captureErrors;
    fprintf(events,"{\"type\":\"dump\",\"capture\":%u,\"written\":%s,\"win32Error\":%lu,\"path\":",captureCount,dumpOk?"true":"false",dumpError);quoted_wide(dumpPath);finish_event();
    CONTEXT unwind=context;STACKFRAME64 frame={0};
    frame.AddrPC.Offset=unwind.Rip;frame.AddrPC.Mode=AddrModeFlat;
    frame.AddrStack.Offset=unwind.Rsp;frame.AddrStack.Mode=AddrModeFlat;
    frame.AddrFrame.Offset=unwind.Rbp;frame.AddrFrame.Mode=AddrModeFlat;
    DWORD64 previous=0;unsigned frames=0;
    frame_event(frames++,frame.AddrPC.Offset);
    while(symbolReady&&frames<64&&StackWalk64(IMAGE_FILE_MACHINE_AMD64,target,thread,&frame,&unwind,0,SymFunctionTableAccess64,SymGetModuleBase64,0)) {
        if(!frame.AddrPC.Offset||frame.AddrPC.Offset==previous)break;
        previous=frame.AddrPC.Offset;frame_event(frames++,frame.AddrPC.Offset);
    }
    fprintf(events,"{\"type\":\"stack-end\",\"capture\":%u,\"frames\":%u,\"maximumFrames\":64",captureCount,frames);finish_event();
    CloseHandle(thread);
}
static int admitted_environment(void) {
    wchar_t actions[16]=L"",sha[64]=L"",expected[64]=L"";
    GetEnvironmentVariableW(L"GITHUB_ACTIONS",actions,16);GetEnvironmentVariableW(L"GITHUB_SHA",sha,64);GetEnvironmentVariableW(L"EXPECTED_SOURCE_SHA",expected,64);
    return !wcscmp(actions,L"true")&&wcslen(sha)==40&&!wcscmp(sha,expected);
}
static int inside_temp(const wchar_t *path) {
    wchar_t temp[32768]=L"",full[32768]=L"",root[32768]=L"";
    GetEnvironmentVariableW(L"RUNNER_TEMP",temp,32768);
    if(!*temp||!GetFullPathNameW(temp,32768,root,0)||!GetFullPathNameW(path,32768,full,0))return 0;
    size_t n=wcslen(root);while(n&&(root[n-1]=='\\'||root[n-1]=='/'))root[--n]=0;
    return !_wcsnicmp(root,full,n)&&(full[n]=='\\'||full[n]=='/')&&!wcschr(path,L'"');
}
int wmain(int argc,wchar_t **argv) {
    if(argc!=3||!admitted_environment()||!inside_temp(argv[1])||!inside_temp(argv[2]))return 64;
    wcscpy_s(output,32768,argv[2]);
    wchar_t path[32768],command[32768],symbols[32768];
    swprintf_s(path,32768,L"%ls\\debug-events.jsonl",output);
    HANDLE eventFile=CreateFileW(path,GENERIC_WRITE,FILE_SHARE_READ,0,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);
    if(eventFile==INVALID_HANDLE_VALUE)return 65;
    int eventFd=_open_osfhandle((intptr_t)eventFile,_O_WRONLY|_O_BINARY);
    if(eventFd<0){CloseHandle(eventFile);return 65;}
    events=_fdopen(eventFd,"wb");if(!events){_close(eventFd);return 65;}
    setvbuf(events,0,_IONBF,0);
    SECURITY_ATTRIBUTES security={sizeof(security),0,TRUE};
    swprintf_s(path,32768,L"%ls\\stdout.log",output);
    HANDLE out=CreateFileW(path,GENERIC_WRITE,FILE_SHARE_READ,&security,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);
    swprintf_s(path,32768,L"%ls\\stderr.log",output);
    HANDLE err=CreateFileW(path,GENERIC_WRITE,FILE_SHARE_READ,&security,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,0);
    HANDLE input=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&security,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,0);
    if(out==INVALID_HANDLE_VALUE||err==INVALID_HANDLE_VALUE||input==INVALID_HANDLE_VALUE){error_event("open-stdio",GetLastError());return 65;}
    swprintf_s(command,32768,L"\"%ls\" --data-dir \"%ls\\synthetic-data\" --drag-regression --drag-render \"%ls\\render\"",argv[1],output,output);
    STARTUPINFOW startup={0};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESTDHANDLES;
    startup.hStdInput=input;startup.hStdOutput=out;startup.hStdError=err;
    PROCESS_INFORMATION process={0};
    HANDLE job=CreateJobObjectW(0,0);JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits={0};limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if(!job||!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits))){error_event("create-job",GetLastError());return 65;}
    if(!CreateProcessW(argv[1],command,0,0,TRUE,DEBUG_ONLY_THIS_PROCESS|CREATE_UNICODE_ENVIRONMENT,0,0,&startup,&process)){error_event("CreateProcess",GetLastError());return 65;}
    target=process.hProcess;targetId=process.dwProcessId;
    CloseHandle(out);CloseHandle(err);CloseHandle(input);CloseHandle(process.hThread);
    int fatal=0,timedOut=0,exited=0,initialBreakpoint=0,terminationRequested=0;
    DWORD exitCode=STILL_ACTIVE;
    if(!AssignProcessToJobObject(job,target)){error_event("assign-job",GetLastError());fatal=1;TerminateProcess(target,70);terminationRequested=1;}
    fprintf(events,"{\"type\":\"start\",\"pid\":%lu,\"command\":",targetId);quoted_wide(command);fprintf(events,",\"timeoutMs\":180000,\"debugOnlyThisProcess\":true,\"jobAssigned\":%s",fatal?"false":"true");finish_event();
    wcscpy_s(symbols,32768,argv[1]);wchar_t *slash=wcsrchr(symbols,L'\\');if(!slash)slash=wcsrchr(symbols,L'/');if(slash)*slash=0;
    SymSetOptions(SYMOPT_DEFERRED_LOADS|SYMOPT_LOAD_LINES|SYMOPT_EXACT_SYMBOLS|SYMOPT_FAIL_CRITICAL_ERRORS|SYMOPT_NO_PROMPTS|SYMOPT_IGNORE_NT_SYMPATH|SYMOPT_NO_IMAGE_SEARCH);
    symbolReady=SymInitializeW(target,symbols,FALSE);
    if(!symbolReady){++captureErrors;error_event("SymInitialize",GetLastError());}
    ULONGLONG start=GetTickCount64(),terminatedAt=terminationRequested?start:0;
    while(!exited) {
        if(!terminationRequested&&GetTickCount64()-start>=180000){timedOut=1;terminationRequested=1;terminatedAt=GetTickCount64();if(!TerminateProcess(target,1460)){fatal=1;error_event("TerminateProcess-timeout",GetLastError());}}
        if(terminationRequested&&GetTickCount64()-terminatedAt>=10000){fatal=1;error_event("exit-event-timeout",ERROR_TIMEOUT);break;}
        DEBUG_EVENT event={0};
        if(!WaitForDebugEvent(&event,250)) {
            if(GetLastError()==ERROR_SEM_TIMEOUT)continue;
            error_event("WaitForDebugEvent",GetLastError());fatal=1;break;
        }
        DWORD next=DBG_CONTINUE;
        if(event.dwProcessId!=targetId){error_event("unexpected-process",event.dwProcessId);fatal=1;next=DBG_EXCEPTION_NOT_HANDLED;}
        else if(event.dwDebugEventCode==CREATE_PROCESS_DEBUG_EVENT){productImageBase=(DWORD64)(uintptr_t)event.u.CreateProcessInfo.lpBaseOfImage;load_module(event.u.CreateProcessInfo.hFile,event.u.CreateProcessInfo.lpBaseOfImage);}
        else if(event.dwDebugEventCode==LOAD_DLL_DEBUG_EVENT)load_module(event.u.LoadDll.hFile,event.u.LoadDll.lpBaseOfDll);
        else if(event.dwDebugEventCode==UNLOAD_DLL_DEBUG_EVENT&&symbolReady)SymUnloadModule64(target,(DWORD64)(uintptr_t)event.u.UnloadDll.lpBaseOfDll);
        else if(event.dwDebugEventCode==EXCEPTION_DEBUG_EVENT) {
            EXCEPTION_DEBUG_INFO *info=&event.u.Exception;DWORD code=info->ExceptionRecord.ExceptionCode;
            ++exceptionCount;
            fprintf(events,"{\"type\":\"exception\",\"number\":%u,\"threadId\":%lu,\"code\":\"0x%08lx\",\"firstChance\":%s,\"address\":\"0x%llx\",\"parameters\":[",exceptionCount,event.dwThreadId,code,info->dwFirstChance?"true":"false",(unsigned long long)(uintptr_t)info->ExceptionRecord.ExceptionAddress);
            for(DWORD i=0;i<info->ExceptionRecord.NumberParameters&&i<EXCEPTION_MAXIMUM_PARAMETERS;i++)fprintf(events,"%s\"0x%llx\"",i?",":"",(unsigned long long)info->ExceptionRecord.ExceptionInformation[i]);fputs("]",events);finish_event();
            if(code==EXCEPTION_BREAKPOINT&&!initialBreakpoint&&info->dwFirstChance){initialBreakpoint=1;observe_product_symbols();next=DBG_CONTINUE;}
            else {
                /* Never consume the target's faults. Preserve its exception/exit behavior. */
                next=DBG_EXCEPTION_NOT_HANDLED;
                if(!info->dwFirstChance||code==EXCEPTION_ACCESS_VIOLATION||code==EXCEPTION_IN_PAGE_ERROR||code==EXCEPTION_STACK_OVERFLOW) {
                    if(captureCount<8)capture_exception(&event);
                    else {++captureErrors;error_event("capture-limit",ERROR_BUFFER_OVERFLOW);}
                }
            }
        } else if(event.dwDebugEventCode==EXIT_PROCESS_DEBUG_EVENT){exitCode=event.u.ExitProcess.dwExitCode;exited=1;}
        if(!ContinueDebugEvent(event.dwProcessId,event.dwThreadId,next)){error_event("ContinueDebugEvent",GetLastError());fatal=1;break;}
    }
    if(!exited){TerminateProcess(target,70);CloseHandle(job);job=0;WaitForSingleObject(target,5000);GetExitCodeProcess(target,&exitCode);}
    int stillRunning=WaitForSingleObject(target,5000)!=WAIT_OBJECT_0;
    if(stillRunning)fatal=1;
    if(symbolReady)SymCleanup(target);
    fprintf(events,"{\"type\":\"exit\",\"pid\":%lu,\"childExitCode\":%lu,\"childExitHex\":\"0x%08lx\",\"exitEventObserved\":%s,\"timedOut\":%s,\"diagnosticFatal\":%s,\"captureErrors\":%d,\"captures\":%u,\"processStillRunning\":%s",targetId,exitCode,exitCode,exited?"true":"false",timedOut?"true":"false",fatal?"true":"false",captureErrors,captureCount,stillRunning?"true":"false");finish_event();
    if(job)CloseHandle(job);CloseHandle(target);fclose(events);
    if(exitCode!=0&&exitCode!=STILL_ACTIVE)ExitProcess(exitCode);
    return fatal||timedOut||captureErrors||stillRunning?70:0;
}
