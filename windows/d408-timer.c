#include "d408.h"
#ifdef GX_D408_CANDIDATE

enum {T_MODE=4600,T_FOCUS,T_BREAK,T_TASK,T_SAVE,T_START,T_PAUSE,T_RESUME,T_END,T_FINISH,T_REST,T_RESET,T_ACK,T_HISTORY,T_SUMMARY,T_CLOCK,T_STATUS,T_CLOSE};
static D408Store timerStore;
static int timerReady,timerTried,timerLoading;
static HWND timerWindow,timerControls[20];
static J *taskChoices;
static int fakeClock;
static int64_t fakeWall;
static uint64_t fakeMono;
static char timerError[1024];
static int timerClockTrusted;
static int64_t clock_wall(void){return fakeClock?fakeWall:wall_ms();}
static uint64_t clock_mono(void){return fakeClock?fakeMono:GetTickCount64();}
void d408_timer_test_clock(int enabled,int64_t wall,uint64_t monotonic){fakeClock=enabled;fakeWall=wall;fakeMono=monotonic;}
static void stamp(int64_t value,char out[40]){
 ULARGE_INTEGER raw;raw.QuadPart=(value+11644473600000LL)*10000;FILETIME file={raw.LowPart,raw.HighPart};SYSTEMTIME t;FileTimeToSystemTime(&file,&t);
 sprintf(out,"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond,t.wMilliseconds);
}
static J *initial(void){
 J *state=cJSON_CreateObject();sn(state,"schemaVersion",1);sn(state,"revision",0);ss(state,"status","idle");ss(state,"phase","focus");ss(state,"mode","countdown");
 J *config=cJSON_CreateObject();ss(config,"mode","countdown");sn(config,"durationMinutes",25);sn(config,"breakMinutes",5);ss(config,"taskId","");ss(config,"taskTitle","");ss(config,"accountId","default");set(state,"configuration",config);
 ss(state,"sessionId","");ss(state,"accountId","");ss(state,"taskId","");ss(state,"taskTitle","");ss(state,"startedAt","");sn(state,"elapsedMillis",0);sn(state,"targetMillis",1500000);sn(state,"lastWallMillis",0);sn(state,"lastMonotonicMillis",0);sn(state,"bootEpochMillis",0);set(state,"completionPending",cJSON_CreateFalse());set(state,"history",cJSON_CreateArray());set(state,"commandReceipts",cJSON_CreateArray());set(state,"segments",cJSON_CreateArray());ss(state,"recoveryNotice","");return state;
}
static int valid(J *state){
 if(num(state,"schemaVersion")!=1||!d408_choice(str(state,"status"),"idle|running|paused|completed|ended")||
    !d408_choice(str(state,"phase"),"focus|break")||!d408_choice(str(state,"mode"),"countdown|countup")||
    num(state,"elapsedMillis")<0||num(state,"revision")<0||num(state,"revision")!=floor(num(state,"revision"))||!cJSON_IsArray(get(state,"history"))||!cJSON_IsArray(get(state,"commandReceipts"))||!cJSON_IsArray(get(state,"segments")))return 0;
 J *config=get(state,"configuration");return cJSON_IsObject(config)&&d408_choice(str(config,"mode"),"countdown|countup")&&num(config,"durationMinutes")>=1&&num(config,"durationMinutes")<=180&&num(config,"durationMinutes")==floor(num(config,"durationMinutes"))&&num(config,"breakMinutes")>=1&&num(config,"breakMinutes")<=180&&num(config,"breakMinutes")==floor(num(config,"breakMinutes"));
}
static int ready(void){
 if(timerReady)return 1;if(timerTried)return 0;timerTried=1;
 if(!d408_store_open(&timerStore,"timer",initial())){snprintf(timerError,sizeof(timerError),"%s",timerStore.error);return 0;}
 if(!valid(timerStore.data)){strcpy(timerError,"番茄钟状态结构无效，原文件保留且没有重置。");return 0;}
 if(timerStore.recovered)strcpy(timerError,"主文件未通过校验，已读取前代备份；下一次成功保存前保留损坏原件。");
 timerClockTrusted=(int64_t)clock_mono()>=(int64_t)num(timerStore.data,"lastMonotonicMillis")&&llabs(clock_wall()-(int64_t)clock_mono()-(int64_t)num(timerStore.data,"bootEpochMillis"))<=5000;
 timerReady=1;return 1;
}
static int active(J *state){return !strcmp(str(state,"status"),"running")||!strcmp(str(state,"status"),"paused");}
static void checkpoint(J *state){sn(state,"lastWallMillis",(double)clock_wall());sn(state,"lastMonotonicMillis",(double)clock_mono());sn(state,"bootEpochMillis",(double)(clock_wall()-(int64_t)clock_mono()));}
static void record_history(J *state,const char *outcome,int64_t ended){
 const char *id=str(state,"sessionId");if(!*id||d408_find(get(state,"history"),id))return;
 J *entry=cJSON_CreateObject();const char *names[]={"accountId","taskId","taskTitle","phase","mode","startedAt"};ss(entry,"id",id);
 for(int i=0;i<6;i++)ss(entry,names[i],str(state,names[i]));char end[40];stamp(ended,end);ss(entry,"endedAt",end);ss(entry,"status",outcome);
 sn(entry,"elapsedMillis",num(state,"elapsedMillis"));sn(entry,"targetMillis",num(state,"targetMillis"));set(entry,"segments",dup(get(state,"segments")));cJSON_AddItemToArray(get(state,"history"),entry);
}
static int advance(J *state){
 if(strcmp(str(state,"status"),"running"))return 0;
 int64_t wall=clock_wall(),lastWall=(int64_t)num(state,"lastWallMillis"),mono=(int64_t)clock_mono(),lastMono=(int64_t)num(state,"lastMonotonicMillis");
 int64_t delta;
 if(timerClockTrusted&&mono>=lastMono)delta=mono-lastMono;
 else {ss(state,"status","paused");ss(state,"recoveryNotice","检测到重启或无法确认的时钟变化，已暂停并保留上次持久化的时长。核对后点击继续。");checkpoint(state);return 1;}
 if(delta<0)delta=0;double elapsed=num(state,"elapsedMillis"),earned=(double)delta;
 if(!strcmp(str(state,"mode"),"countdown"))earned=fmin(earned,fmax(0,num(state,"targetMillis")-elapsed));
 if(earned>0){
   J *segments=get(state,"segments"),*last=cJSON_GetArrayItem(segments,cJSON_GetArraySize(segments)-1);
   if(last&&num(last,"endMillis")==lastWall&&llabs((wall-lastWall)-delta)<2000){sn(last,"endMillis",lastWall+earned);sn(last,"elapsedMillis",num(last,"elapsedMillis")+earned);}
   else {J *segment=cJSON_CreateObject();sn(segment,"startMillis",lastWall);sn(segment,"endMillis",lastWall+earned);sn(segment,"elapsedMillis",earned);cJSON_AddItemToArray(segments,segment);}
   sn(state,"elapsedMillis",elapsed+earned);
 }
 checkpoint(state);
 if(!strcmp(str(state,"mode"),"countdown")&&num(state,"elapsedMillis")>=num(state,"targetMillis")){
   ss(state,"status","completed");set(state,"completionPending",cJSON_CreateTrue());record_history(state,"completed",lastWall+(int64_t)earned);
 }
 return 1;
}
static int commit(J *state){
 sn(state,"revision",num(timerStore.data,"revision")+1);
 int ok=d408_store_commit(&timerStore,state);if(!ok)snprintf(timerError,sizeof(timerError),"%s",timerStore.error);else timerError[0]=0;return ok;
}
void d408_timer_tick(void){
 if(!ready())return;J *next=dup(timerStore.data);if(advance(next)){
   int terminal=strcmp(str(next,"status"),str(timerStore.data,"status"));
   int64_t since=clock_wall()-(int64_t)num(timerStore.data,"lastWallMillis");
   if(terminal||since>=15000||since<0){int completed=!strcmp(str(next,"status"),"completed")&&strcmp(str(timerStore.data,"status"),"completed");
     if(commit(next)&&completed)MessageBeep(MB_ICONINFORMATION);}
 }cJSON_Delete(next);
}
J *d408_timer_snapshot(void){if(!ready())return 0;J *value=dup(timerStore.data);advance(value);sn(value,"remainingMillis",!strcmp(str(value,"mode"),"countdown")?fmax(0,num(value,"targetMillis")-num(value,"elapsedMillis")):0);return value;}

int d408_timer_command(const char *action,J *values,const char *commandId,int expectedRevision){
 if(!ready())return 0;timerError[0]=0;
 J *receipt=d408_find(get(timerStore.data,"commandReceipts"),commandId?commandId:"");if(receipt){int same=!strcmp(str(receipt,"action"),action);if(!same)strcpy(timerError,"同一操作标识不能用于不同命令。");return same;}
 if(expectedRevision>=0&&expectedRevision!=(int)num(timerStore.data,"revision")){strcpy(timerError,"计时状态已更新，请刷新后重试操作。");return 0;}
 J *next=dup(timerStore.data);advance(next);J *config=get(next,"configuration");int ok=1;
 if(!strcmp(action,"configure")){
   double focus=num(values,"durationMinutes"),rest=num(values,"breakMinutes");const char *mode=str(values,"mode");
   if(!d408_choice(mode,"countdown|countup")||focus<1||focus>180||rest<1||rest>180||focus!=floor(focus)||rest!=floor(rest)){strcpy(timerError,"专注和休息时长请输入1–180整数分钟。");ok=0;}
   else if(active(next)&&strcmp(mode,str(config,"mode"))){strcpy(timerError,"计时中不能更换模式，请先结束当前阶段。");ok=0;}
   else if(active(next)&&strcmp(str(values,"accountId"),str(next,"accountId"))){strcpy(timerError,"计时中不能更换账号，请先结束当前阶段；同账号可修改本轮关联任务。");ok=0;}
   else {set(next,"configuration",dup(values));if(active(next)){ss(next,"taskId",str(values,"taskId"));ss(next,"taskTitle",str(values,"taskTitle"));sn(next,"targetMillis",(!strcmp(str(next,"phase"),"break")?rest:focus)*60000);advance(next);}}
 }else if(!strcmp(action,"start")||!strcmp(action,"break")){
   if(active(next)||truth(next,"completionPending")){strcpy(timerError,"请先结束当前阶段并确认完成提示，避免覆盖计时记录。");ok=0;}
   else {char id[80],time[40];uuid(id);stamp(clock_wall(),time);ss(next,"sessionId",id);ss(next,"startedAt",time);ss(next,"status","running");ss(next,"phase",!strcmp(action,"break")?"break":"focus");ss(next,"mode",!strcmp(action,"break")?"countdown":str(config,"mode"));
     const char *names[]={"accountId","taskId","taskTitle"};for(int i=0;i<3;i++)ss(next,names[i],str(config,names[i]));
     sn(next,"targetMillis",num(config,!strcmp(action,"break")?"breakMinutes":"durationMinutes")*60000);sn(next,"elapsedMillis",0);set(next,"segments",cJSON_CreateArray());set(next,"completionPending",cJSON_CreateFalse());ss(next,"recoveryNotice","");checkpoint(next);timerClockTrusted=1;}
 }else if(!strcmp(action,"pause")){if(!strcmp(str(next,"status"),"running"))ss(next,"status","paused");}
 else if(!strcmp(action,"resume")){if(!strcmp(str(next,"status"),"paused")){ss(next,"status","running");ss(next,"recoveryNotice","");checkpoint(next);timerClockTrusted=1;}}
 else if(!strcmp(action,"end")){if(active(next)){ss(next,"status","ended");set(next,"completionPending",cJSON_CreateFalse());record_history(next,"ended",clock_wall());}}
 else if(!strcmp(action,"finish")){
   if(!active(next)||strcmp(str(next,"mode"),"countup")){strcpy(timerError,"倒计时只能在到达目标时正常完成；提前结束会单独记录。");ok=0;}
   else {ss(next,"status","completed");set(next,"completionPending",cJSON_CreateTrue());record_history(next,"completed",clock_wall());}
 }else if(!strcmp(action,"claim-completion")){set(next,"completionPending",cJSON_CreateFalse());}
 else if(!strcmp(action,"reset")){
   if(active(next))record_history(next,"ended",clock_wall());ss(next,"status","idle");ss(next,"phase","focus");ss(next,"mode",str(config,"mode"));ss(next,"sessionId","");ss(next,"startedAt","");ss(next,"recoveryNotice","");sn(next,"elapsedMillis",0);sn(next,"targetMillis",num(config,"durationMinutes")*60000);set(next,"segments",cJSON_CreateArray());set(next,"completionPending",cJSON_CreateFalse());checkpoint(next);
 }else{strcpy(timerError,"不支持的番茄钟操作。");ok=0;}
 if(ok){if(commandId&&*commandId){J *event=cJSON_CreateObject();ss(event,"id",commandId);ss(event,"action",action);cJSON_AddItemToArray(get(next,"commandReceipts"),event);}ok=commit(next);}cJSON_Delete(next);return ok;
}

static HWND control(int id){return timerControls[id-T_MODE];}
static double day_elapsed(J *history,int64_t start,int64_t end){double total=0;J *entry,*segment;cJSON_ArrayForEach(entry,history)if(!strcmp(str(entry,"phase"),"focus"))cJSON_ArrayForEach(segment,get(entry,"segments")){double a=num(segment,"startMillis"),b=num(segment,"endMillis");if(b>a){double overlap=fmax(0,fmin((double)end,b)-fmax((double)start,a));total+=num(segment,"elapsedMillis")*overlap/(b-a);}}return total;}
static int focus_round(J *entry){return !strcmp(str(entry,"phase"),"focus")&&!strcmp(str(entry,"mode"),"countdown")&&!strcmp(str(entry,"status"),"completed");}
static int day_rounds(J *history,int64_t start,int64_t end){char from[40],until[40];stamp(start,from);stamp(end,until);int rounds=0;J *entry;cJSON_ArrayForEach(entry,history)if(focus_round(entry)&&strcmp(str(entry,"endedAt"),from)>=0&&strcmp(str(entry,"endedAt"),until)<0)rounds++;return rounds;}
static J *statistics_history(J *state){J *rows=dup(get(state,"history"));if(active(state)&&*str(state,"sessionId")&&!d408_find(rows,str(state,"sessionId"))){J *entry=cJSON_CreateObject();ss(entry,"id",str(state,"sessionId"));ss(entry,"phase",str(state,"phase"));ss(entry,"mode",str(state,"mode"));ss(entry,"status",str(state,"status"));sn(entry,"elapsedMillis",num(state,"elapsedMillis"));set(entry,"segments",dup(get(state,"segments")));cJSON_AddItemToArray(rows,entry);}return rows;}
static void refresh_timer(int configuration){
 if(!timerWindow)return;J *state=d408_timer_snapshot();if(!state){ui_set(control(T_STATUS),timerError);return;}
 timerLoading=1;J *config=get(timerStore.data,"configuration");
 if(configuration){char n[40];sprintf(n,"%.0f",num(config,"durationMinutes"));ui_set(control(T_FOCUS),n);sprintf(n,"%.0f",num(config,"breakMinutes"));ui_set(control(T_BREAK),n);SendMessageW(control(T_MODE),CB_SETCURSEL,!strcmp(str(config,"mode"),"countup"),0);
   cJSON_Delete(taskChoices);taskChoices=cJSON_CreateArray();SendMessageW(control(T_TASK),CB_RESETCONTENT,0,0);SendMessageW(control(T_TASK),CB_ADDSTRING,0,(LPARAM)L"不关联任务");
   J *none=cJSON_CreateObject();ss(none,"id","");ss(none,"title","");cJSON_AddItemToArray(taskChoices,none);int selected=0;
   Filter filter={0};strcpy(filter.kind,"tasks");filter.quadrant=-1;filter.status=2;filter.period=3;strcpy(filter.date,app.filterSpec.date);J *rows=query_rows(&app.db,&filter,0,10000),*row;
   cJSON_ArrayForEach(row,rows){J *task=get(row,"data");if(truth(task,"_deleted"))continue;J *choice=cJSON_CreateObject();ss(choice,"id",str(task,"id"));ss(choice,"title",str(task,"title"));cJSON_AddItemToArray(taskChoices,choice);wchar_t *label=wide(str(task,"title"));SendMessageW(control(T_TASK),CB_ADDSTRING,0,(LPARAM)label);free(label);if(!strcmp(str(config,"accountId"),str(app.registry,"activeId"))&&!strcmp(str(config,"taskId"),str(task,"id")))selected=cJSON_GetArraySize(taskChoices)-1;}
   cJSON_Delete(rows);SendMessageW(control(T_TASK),CB_SETCURSEL,selected,0);
 }
 double display=!strcmp(str(state,"mode"),"countup")?num(state,"elapsedMillis"):num(state,"remainingMillis");int64_t seconds=(int64_t)(display/1000);char text[1200];snprintf(text,sizeof(text),"%02lld:%02lld:%02lld",seconds/3600,seconds/60%60,seconds%60);ui_set(control(T_CLOCK),text);
 const char *status=str(state,"status");const char *translated=!strcmp(status,"running")?"进行中":!strcmp(status,"paused")?"已暂停":!strcmp(status,"completed")?"已完成":!strcmp(status,"ended")?"提前结束":"待开始";
 snprintf(text,sizeof(text),"%s · %s · %s\r\n关联账号：%s  任务：%s\r\n%s%s",!strcmp(str(state,"phase"),"break")?"休息":"专注",!strcmp(str(state,"mode"),"countup")?"正计时":"倒计时",translated,*str(state,"accountId")?str(state,"accountId"):str(config,"accountId"),*str(state,"taskTitle")?str(state,"taskTitle"):"未关联",*timerError?timerError:str(state,"recoveryNotice"),truth(state,"completionPending")?"\r\n本次已记入历史，请点击「确认完成」。":"");ui_set(control(T_STATUS),text);
 int running=!strcmp(status,"running"),paused=!strcmp(status,"paused"),busy=running||paused;
 EnableWindow(control(T_START),!busy&&!truth(state,"completionPending"));EnableWindow(control(T_REST),!busy&&!truth(state,"completionPending"));EnableWindow(control(T_PAUSE),running);EnableWindow(control(T_RESUME),paused);EnableWindow(control(T_END),busy);EnableWindow(control(T_FINISH),busy&&!strcmp(str(state,"mode"),"countup"));EnableWindow(control(T_ACK),truth(state,"completionPending"));
 SendMessageW(control(T_HISTORY),LB_RESETCONTENT,0,0);J *history=get(state,"history"),*statistics=statistics_history(state);double total=0;int completed=0,ended=0,rounds=0;
 for(int i=cJSON_GetArraySize(history)-1;i>=0;i--){J *entry=cJSON_GetArrayItem(history,i);if(!strcmp(str(entry,"phase"),"focus"))total+=num(entry,"elapsedMillis");completed+=!strcmp(str(entry,"status"),"completed");ended+=!strcmp(str(entry,"status"),"ended");
   snprintf(text,sizeof(text),"%.19s · %s · %s · %.1f分钟 · %s [%s]",str(entry,"endedAt"),!strcmp(str(entry,"phase"),"break")?"休息":"专注",!strcmp(str(entry,"status"),"completed")?"完成":"提前结束",num(entry,"elapsedMillis")/60000.,str(entry,"taskTitle"),str(entry,"accountId"));wchar_t *w=wide(text);SendMessageW(control(T_HISTORY),LB_ADDSTRING,0,(LPARAM)w);free(w);}
 J *entry;cJSON_ArrayForEach(entry,history)rounds+=focus_round(entry);if(active(state)&&!strcmp(str(state,"phase"),"focus"))total+=num(state,"elapsedMillis");
 int64_t today=(clock_wall()+28800000LL)/86400000LL*86400000LL-28800000LL;
 snprintf(text,sizeof(text),"历史（UTC）%d条 · 已完成阶段%d次 · 提前结束%d次\r\n专注累计%.1f分钟 · 完成番茄%d轮（仅专注倒计时）\r\n北京时间：今日%.1f分钟 / %d轮 · 近7天%.1f分钟 / %d轮",cJSON_GetArraySize(history),completed,ended,total/60000.,rounds,day_elapsed(statistics,today,today+86400000LL)/60000.,day_rounds(history,today,today+86400000LL),day_elapsed(statistics,today-6*86400000LL,today+86400000LL)/60000.,day_rounds(history,today-6*86400000LL,today+86400000LL));ui_set(control(T_SUMMARY),text);timerLoading=0;cJSON_Delete(statistics);cJSON_Delete(state);
}
static void timer_layout(void){
 RECT r;GetClientRect(timerWindow,&r);int width=r.right-U(36);
 ui_move(control(T_CLOCK),U(18),U(18),width,U(52));ui_move(control(T_STATUS),U(18),U(78),width,U(95));
 ui_move(GetDlgItem(timerWindow,4596),U(18),U(184),U(148),U(20));ui_move(GetDlgItem(timerWindow,4597),U(184),U(184),U(86),U(20));ui_move(GetDlgItem(timerWindow,4598),U(286),U(184),U(86),U(20));
 ui_move(control(T_MODE),U(18),U(208),U(148),U(180));ui_move(control(T_FOCUS),U(184),U(208),U(86),U(30));ui_move(control(T_BREAK),U(286),U(208),U(86),U(30));ui_move(control(T_SAVE),U(390),U(208),width-U(372),U(30));
 ui_move(GetDlgItem(timerWindow,4599),U(18),U(250),width,U(20));ui_move(control(T_TASK),U(18),U(274),width,U(260));
 int ids[]={T_START,T_PAUSE,T_RESUME,T_END,T_FINISH,T_REST,T_RESET,T_ACK};
 for(int i=0;i<8;i++)ui_move(control(ids[i]),U(18)+(i%4)*(width/4),U(320+(i/4)*42),width/4-U(8),U(34));
 ui_move(control(T_SUMMARY),U(18),U(412),width,U(68));ui_move(control(T_HISTORY),U(18),U(488),width,max(U(90),r.bottom-U(554)));ui_move(control(T_CLOSE),r.right-U(120),r.bottom-U(48),U(102),U(30));
}
static LRESULT CALLBACK timer_proc(HWND h,UINT message,WPARAM w,LPARAM l){
 if(message==WM_CREATE){timerWindow=h;
   const wchar_t *labels[]={L"倒计时",L"25",L"5",L"",L"保存设置",L"开始",L"暂停",L"继续",L"提前结束",L"完成正计时",L"开始休息",L"重置",L"确认完成",L"历史记录",L"历史与统计",L"25:00",L"",L"关闭窗口"};
   for(int i=T_MODE;i<=T_CLOSE;i++){const wchar_t *cls=i==T_MODE||i==T_TASK?L"COMBOBOX":i==T_FOCUS||i==T_BREAK?L"EDIT":i==T_HISTORY?L"LISTBOX":i==T_SUMMARY||i==T_CLOCK||i==T_STATUS?L"STATIC":L"BUTTON";
     DWORD style=i==T_MODE||i==T_TASK?CBS_DROPDOWNLIST:i==T_FOCUS||i==T_BREAK?ES_NUMBER|ES_AUTOHSCROLL|WS_BORDER:i==T_HISTORY?WS_VSCROLL|LBS_NOINTEGRALHEIGHT:0;
     timerControls[i-T_MODE]=ui_control(h,cls,labels[i-T_MODE],style|WS_TABSTOP,i,0,0,0,0);}
   SendMessageW(control(T_MODE),CB_ADDSTRING,0,(LPARAM)L"倒计时");SendMessageW(control(T_MODE),CB_ADDSTRING,0,(LPARAM)L"正计时");
   SendMessageW(control(T_CLOCK),WM_SETFONT,(WPARAM)app.title,TRUE);
   ui_control(h,L"STATIC",L"专注模式",0,4596,0,0,0,0);ui_control(h,L"STATIC",L"专注分钟",0,4597,0,0,0,0);ui_control(h,L"STATIC",L"休息分钟",0,4598,0,0,0,0);
   ui_control(h,L"STATIC",L"关联任务（保存将修改本轮归属） · 分钟范围1–180",0,4599,0,0,0,0);
   refresh_timer(1);SetTimer(h,1,500,0);return 0;
 }
 if(message==WM_COMMAND){int id=LOWORD(w);const char *action=id==T_START?"start":id==T_PAUSE?"pause":id==T_RESUME?"resume":id==T_END?"end":id==T_FINISH?"finish":id==T_REST?"break":id==T_RESET?"reset":id==T_ACK?"claim-completion":0;
   if(id==T_CLOSE){ShowWindow(h,SW_HIDE);return 0;}
   if(id==T_SAVE){J *config=dup(get(timerStore.data,"configuration"));char *focus=ui_text(control(T_FOCUS)),*rest=ui_text(control(T_BREAK));sn(config,"durationMinutes",atof(focus));sn(config,"breakMinutes",atof(rest));free(focus);free(rest);ss(config,"mode",SendMessageW(control(T_MODE),CB_GETCURSEL,0,0)==1?"countup":"countdown");int selected=(int)SendMessageW(control(T_TASK),CB_GETCURSEL,0,0);J *choice=cJSON_GetArrayItem(taskChoices,selected);ss(config,"accountId",str(app.registry,"activeId"));ss(config,"taskId",str(choice,"id"));ss(config,"taskTitle",str(choice,"title"));char command[80];uuid(command);if(!d408_timer_command("configure",config,command,-1))d408_error(h,timerError);cJSON_Delete(config);refresh_timer(0);return 0;}
   if(action){if((id==T_END||id==T_RESET)&&active(timerStore.data)&&MessageBoxW(h,L"结束当前阶段并保留已计时时长？",L"番茄钟",MB_OKCANCEL|MB_ICONQUESTION)!=IDOK)return 0;char command[80];uuid(command);if(!d408_timer_command(action,0,command,-1))d408_error(h,timerError);refresh_timer(0);return 0;}
 }
 if(message==WM_TIMER){d408_timer_tick();refresh_timer(0);return 0;}
 if(message==WM_SIZE){timer_layout();return 0;}
 if(message==WM_GETMINMAXINFO){((MINMAXINFO*)l)->ptMinTrackSize.x=U(650);((MINMAXINFO*)l)->ptMinTrackSize.y=U(720);return 0;}
 if(message==WM_CLOSE){ShowWindow(h,SW_HIDE);return 0;}
 if(message==WM_DESTROY){KillTimer(h,1);timerWindow=0;return 0;}
 if(message==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}
 if(message==WM_CTLCOLORSTATIC||message==WM_CTLCOLOREDIT||message==WM_CTLCOLORLISTBOX){SetTextColor((HDC)w,RGB(35,62,51));SetBkColor((HDC)w,RGB(250,252,250));return (LRESULT)app.white;}
 return DefWindowProcW(h,message,w,l);
}
void d408_timer_open(void){
 if(!timerReady&&timerTried){d408_store_close(&timerStore);timerTried=0;}
 if(!ready()){d408_error(app.window,timerError);return;}if(!ui_catalog_commit()||!detail_save(0))return;
 if(!timerWindow){WNDCLASSW cls={0};cls.lpfnWndProc=timer_proc;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.hbrBackground=app.white;cls.lpszClassName=L"GxD408PomodoroTimer";RegisterClassW(&cls);
   timerWindow=CreateWindowExW(WS_EX_CONTROLPARENT,cls.lpszClassName,L"MyTodo · 番茄钟（隔离候选）",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,CW_USEDEFAULT,CW_USEDEFAULT,U(760),U(820),app.window,0,app.instance,0);}
 refresh_timer(1);ShowWindow(timerWindow,SW_RESTORE);SetForegroundWindow(timerWindow);
}
int d408_timer_shutdown(void){
 if(timerReady){J *next=dup(timerStore.data);advance(next);int ok=commit(next);cJSON_Delete(next);if(!ok)return 0;}
 if(timerWindow)DestroyWindow(timerWindow);cJSON_Delete(taskChoices);taskChoices=0;d408_store_close(&timerStore);timerReady=timerTried=0;return 1;
}

int d408_timer_regression(void){
 d408_timer_test_clock(1,1795651200000LL,100000);if(!ready())return 0;J *config=dup(get(timerStore.data,"configuration"));ss(config,"mode","countdown");sn(config,"durationMinutes",1);sn(config,"breakMinutes",1);ss(config,"accountId","test-account");ss(config,"taskId","task-one");ss(config,"taskTitle","D408 timer association");
 J *daily=cJSON_CreateArray(),*entry=cJSON_CreateObject(),*segments=cJSON_CreateArray(),*segment=cJSON_CreateObject();ss(entry,"phase","focus");sn(segment,"startMillis",500);sn(segment,"endMillis",1500);sn(segment,"elapsedMillis",1000);cJSON_AddItemToArray(segments,segment);set(entry,"segments",segments);cJSON_AddItemToArray(daily,entry);d408_check("timer",day_elapsed(daily,0,1000)==500&&day_elapsed(daily,1000,2000)==500,"daily statistics split a focus segment across midnight boundaries");cJSON_Delete(daily);
 daily=cJSON_CreateArray();for(int i=0;i<4;i++){entry=cJSON_CreateObject();ss(entry,"phase",i==1?"break":"focus");ss(entry,"mode",i==2?"countup":"countdown");ss(entry,"status",i==3?"ended":"completed");char ended[40];stamp(500,ended);ss(entry,"endedAt",ended);cJSON_AddItemToArray(daily,entry);}d408_check("timer",day_rounds(daily,0,1000)==1,"completed focus rounds exclude rest countup and early-end history");char boundary[40];stamp(1000,boundary);ss(cJSON_GetArrayItem(daily,0),"endedAt",boundary);d408_check("timer",day_rounds(daily,0,1000)==0&&day_rounds(daily,1000,2000)==1,"completed focus round belongs to exact ending-day interval");cJSON_Delete(daily);
 d408_check("timer",d408_timer_command("configure",config,"configure-1",-1),"duration and task/account configuration persists");
 d408_check("timer",d408_timer_command("start",0,"start-1",-1),"countdown starts");J *s=d408_timer_snapshot();char session[80];strcpy(session,str(s,"sessionId"));int revision=(int)num(s,"revision");cJSON_Delete(s);
 d408_check("timer",d408_timer_command("start",0,"start-1",-1)&&!d408_timer_command("start",0,"start-another",-1),"same command id is idempotent and second active timer rejected");
 J *changed=dup(config);ss(changed,"taskId","task-two");ss(changed,"taskTitle","Updated current-session task");int reassigned=d408_timer_command("configure",changed,"reassign-active",-1);s=d408_timer_snapshot();d408_check("timer",reassigned&&!strcmp(str(s,"sessionId"),session)&&!strcmp(str(s,"taskId"),"task-two")&&!strcmp(str(s,"taskTitle"),"Updated current-session task")&&!strcmp(str(s,"accountId"),"test-account"),"active same-account configuration updates current session task without restarting");cJSON_Delete(s);ss(changed,"accountId","another-account");d408_check("timer",!d408_timer_command("configure",changed,"reject-account-change",-1),"active session rejects cross-account reassignment");cJSON_Delete(changed);d408_check("timer",d408_timer_command("configure",config,"restore-active-task",-1),"active task association can be restored within same account");
 d408_timer_test_clock(1,1795651210000LL,110000);d408_check("timer",d408_timer_command("pause",0,"pause-1",-1),"pause stores elapsed time");s=d408_timer_snapshot();d408_check("timer",num(s,"elapsedMillis")==10000&&!strcmp(str(s,"accountId"),"test-account"),"paused elapsed and account identity preserved");cJSON_Delete(s);
 s=d408_timer_snapshot();daily=statistics_history(s);d408_check("timer",day_elapsed(daily,1795651200000LL,1795651300000LL)==10000&&cJSON_GetArraySize(get(s,"history"))==0,"daily statistics include active paused focus without creating history");cJSON_Delete(daily);cJSON_Delete(s);
 d408_timer_test_clock(1,1795651240000LL,140000);s=d408_timer_snapshot();d408_check("timer",num(s,"elapsedMillis")==10000,"paused wall time does not accrue");cJSON_Delete(s);
 d408_check("timer",d408_timer_command("resume",0,"resume-1",-1)&&!d408_timer_command("pause",0,"stale-revision",revision),"resume succeeds and stale revision rejected");
 d408_timer_test_clock(1,1795654840000LL,150000);s=d408_timer_snapshot();d408_check("timer",num(s,"elapsedMillis")==20000,"forward wall clock jump accrues monotonic ten seconds only");cJSON_Delete(s);
 d408_timer_test_clock(1,1795651000000LL,160000);s=d408_timer_snapshot();d408_check("timer",num(s,"elapsedMillis")==30000,"backward wall clock jump does not subtract or add elapsed time");cJSON_Delete(s);
 d408_timer_test_clock(1,1795651030000LL,190000);d408_timer_tick();s=d408_timer_snapshot();d408_check("timer",!strcmp(str(s,"status"),"completed")&&num(s,"elapsedMillis")==60000&&truth(s,"completionPending"),"countdown normal completion persisted at exact target");int historyCount=cJSON_GetArraySize(get(s,"history"));cJSON_Delete(s);d408_timer_tick();s=d408_timer_snapshot();d408_check("timer",historyCount==1&&cJSON_GetArraySize(get(s,"history"))==1&&d408_find(get(s,"history"),session)!=0,"repeated ticks create exactly one history row");cJSON_Delete(s);
 d408_check("timer",d408_timer_command("claim-completion",0,"claim-1",-1),"completion acknowledgment persists");ss(config,"mode","countup");d408_check("timer",d408_timer_command("configure",config,"configure-2",-1)&&d408_timer_command("start",0,"start-2",-1),"countup starts with same task association");
 d408_timer_test_clock(1,1795651045000LL,205000);d408_check("timer",d408_timer_command("finish",0,"finish-2",-1),"countup explicit completion records actual duration");s=d408_timer_snapshot();d408_check("timer",num(s,"elapsedMillis")==15000&&cJSON_GetArraySize(get(s,"history"))==2,"countup actual fifteen seconds retained");cJSON_Delete(s);
 d408_timer_command("claim-completion",0,"claim-2",-1);d408_check("timer",d408_timer_command("break",0,"break-1",-1),"rest phase starts separately");d408_timer_test_clock(1,1795651050000LL,210000);d408_check("timer",d408_timer_command("end",0,"end-break",-1),"early end is distinct from normal completion");
 J *before=dup(timerStore.data);d408_test_write_failure=1;d408_check("timer",!d408_timer_command("reset",0,"write-fault",-1)&&eq(before,timerStore.data),"failed timer write retains prior durable state and permits retry");d408_test_write_failure=0;cJSON_Delete(before);d408_check("timer",d408_timer_command("reset",0,"write-fault",-1),"failed command can be retried with same id");
 d408_timer_command("start",0,"restart-session",-1);d408_timer_test_clock(1,1795651060000LL,220000);d408_check("timer",d408_timer_shutdown(),"shutdown checkpoints running timer");d408_timer_test_clock(1,1795651070000LL,230000);s=d408_timer_snapshot();d408_check("timer",s&&!strcmp(str(s,"status"),"running")&&num(s,"elapsedMillis")==20000,"same boot process reopen recovers elapsed from monotonic clock");cJSON_Delete(s);
 d408_timer_test_clock(1,1795651080000LL,1000);s=d408_timer_snapshot();d408_check("timer",s&&!strcmp(str(s,"status"),"paused")&&num(s,"elapsedMillis")==10000&&*str(s,"recoveryNotice"),"reboot uncertainty pauses at saved checkpoint without invented elapsed");cJSON_Delete(s);d408_timer_command("reset",0,"last-reset",-1);s=d408_timer_snapshot();d408_check("timer",s&&!strcmp(str(s,"status"),"idle")&&!*str(s,"recoveryNotice"),"explicit reset clears stale recovery notice");cJSON_Delete(s);d408_timer_shutdown();d408_timer_test_clock(0,0,0);cJSON_Delete(config);
 d408_timer_open();RECT label={0},edit={0},taskLabel={0},task={0},buttons={0},summary={0},history={0};int measured=GetWindowRect(GetDlgItem(timerWindow,4597),&label)&&GetWindowRect(control(T_FOCUS),&edit)&&GetWindowRect(GetDlgItem(timerWindow,4599),&taskLabel)&&GetWindowRect(control(T_TASK),&task)&&GetWindowRect(control(T_START),&buttons)&&GetWindowRect(control(T_SUMMARY),&summary)&&GetWindowRect(control(T_HISTORY),&history);d408_check("timer",measured&&label.bottom>label.top&&edit.bottom>edit.top&&taskLabel.bottom>taskLabel.top&&task.bottom>task.top&&buttons.bottom>buttons.top&&summary.bottom>summary.top&&history.bottom>history.top&&label.bottom<=edit.top&&edit.bottom<=taskLabel.top&&taskLabel.bottom<=task.top&&task.bottom<=buttons.top&&summary.bottom<=history.top&&(GetWindowLongPtrW(control(T_FOCUS),GWL_STYLE)&WS_BORDER),"native timer labels fields task selector and statistics occupy separate visible rows");return 1;
}

#endif
