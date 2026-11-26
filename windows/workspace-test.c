#include "ui.h"
#include "workspace.h"

/* This suite is invoked by GitHub Actions in a fresh, synthetic --data-dir.
 * It operates real HWND controls and reopens the same native SQLite file. */
static int checks,failures,dialogSeen;
static J *results;
static const wchar_t *render;
static HWND host;
static void check(int ok,const char *name){
 checks++;failures+=!ok;printf("%s %s\n",ok?"PASS":"FAIL",name);
 J *result=cJSON_CreateObject();ss(result,"name",name);set(result,"passed",cJSON_CreateBool(ok));cJSON_AddItemToArray(results,result);
}
static HWND item(int id){return GetDlgItem(host,id);}
static void click(int id){SendMessageW(item(id),BM_CLICK,0,0);}
static void page(int number){click(GX_WORK_NAV+number);}
static void refresh(void){SendMessageW(host,GX_WORK_REFRESH,0,0);}
static int rows(void){return (int)SendMessageW(item(GX_WORK_LIST),LB_GETCOUNT,0,0);}
static int select_title(const wchar_t *value){
 LRESULT index=SendMessageW(item(GX_WORK_LIST),LB_FINDSTRINGEXACT,(WPARAM)-1,(LPARAM)value);
 if(index==LB_ERR)return 0;SendMessageW(item(GX_WORK_LIST),LB_SETCURSEL,index,0);
 SendMessageW(host,WM_COMMAND,MAKEWPARAM(GX_WORK_LIST,LBN_SELCHANGE),(LPARAM)item(GX_WORK_LIST));return 1;
}
static void search(const char *value){ui_set(item(GX_WORK_SEARCH),value);SendMessageW(host,WM_TIMER,1,0);}
static char *task(const char *title,int q,const char *parent,const char *project,int done){
 J *t=task_default(&app.db,q,parent);ss(t,"title",title);ss(t,"project",project?project:"");ss(t,"start","");
 char *key=make_key("tasks",str(t,"id"));int ok=db_edit_data(&app.db,key,0,t,0);if(ok&&done)ok=task_complete(&app.db,key,1);
 check(ok,"persist synthetic native task fixture");cJSON_Delete(t);return key;
}
static J *select_rows(DB *db,const char *sql){
 sqlite3_stmt *s=0;J *all=cJSON_CreateArray();if(sqlite3_prepare_v2(db->sql,sql,-1,&s,0)!=SQLITE_OK){cJSON_Delete(all);return 0;}
 int code;while((code=sqlite3_step(s))==SQLITE_ROW){J *row=cJSON_CreateArray();for(int i=0;i<sqlite3_column_count(s);i++){
   const char *value=(const char*)sqlite3_column_text(s,i);cJSON_AddItemToArray(row,value?cJSON_CreateString(value):cJSON_CreateNull());}cJSON_AddItemToArray(all,row);}
 sqlite3_finalize(s);if(code!=SQLITE_DONE){cJSON_Delete(all);return 0;}return all;
}
static J *snapshot(void){
 J *s=cJSON_CreateObject();set(s,"schema",select_rows(&app.db,"SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name"));
 set(s,"entities",select_rows(&app.db,"SELECT * FROM entities ORDER BY key"));set(s,"meta",db_meta(&app.db));set(s,"outbox",db_outbox(&app.db,10000));return s;
}
static void snap(const wchar_t *name){if(render)check(ui_visual_window_snap(host,render,name),"capture real native workspace HWND");}
static void geometry(void){
 RECT client;GetClientRect(host,&client);int ok=1;int controls[]={GX_WORK_NAV,GX_WORK_SEARCH,GX_WORK_LIST,GX_WORK_NEW,GX_WORK_OPEN,GX_WORK_NEXT,GX_WORK_BACK,GX_WORK_NOTICE};
 for(int i=0;i<(int)(sizeof(controls)/sizeof(controls[0]));i++){HWND h=item(controls[i]);if(!IsWindowVisible(h))continue;RECT r;GetWindowRect(h,&r);MapWindowPoints(0,host,(POINT*)&r,2);
   if(r.left<0||r.top<0||r.right>client.right||r.bottom>client.bottom||r.right<=r.left||r.bottom<=r.top)ok=0;}
 check(ok,"visible native controls stay inside resizable client area");
}
static BOOL CALLBACK category_dialog(HWND h,LPARAM parameter){
 wchar_t cls[80];GetClassNameW(h,cls,80);if(wcscmp(cls,L"GxDialogModern")||GetWindow(h,GW_OWNER)!=app.window)return TRUE;
 if(!GetDlgItem(h,800)||!GetDlgItem(h,801))return TRUE;dialogSeen=1;KillTimer(app.window,480);
 SetWindowTextW(GetDlgItem(h,800),L"原生按钮创建项目");SetWindowTextW(GetDlgItem(h,801),L"原编辑对话框与原SQLite路径");SendMessageW(GetDlgItem(h,IDOK),BM_CLICK,0,0);return FALSE;
}
static VOID CALLBACK category_timer(HWND h,UINT msg,UINT_PTR id,DWORD time){EnumThreadWindows(GetCurrentThreadId(),category_dialog,0);}
#ifdef GX_D404_CANDIDATE
static BOOL CALLBACK feedback_dialog(HWND h,LPARAM parameter){
 wchar_t cls[80];GetClassNameW(h,cls,80);if(wcscmp(cls,L"GxFeedbackIdeas"))return TRUE;
 dialogSeen=1;KillTimer(app.window,481);SetWindowTextW(GetDlgItem(h,9102),L"隔离原生意见");SetWindowTextW(GetDlgItem(h,9103),L"只保存到本候选目录");
 SendMessageW(GetDlgItem(h,9111),BM_CLICK,0,0);SendMessageW(GetDlgItem(h,9116),BM_CLICK,0,0);return FALSE;
}
static VOID CALLBACK feedback_timer(HWND h,UINT msg,UINT_PTR id,DWORD time){EnumThreadWindows(GetCurrentThreadId(),feedback_dialog,0);}
#endif
static int open_readonly(DB *db,const wchar_t *directory){
 wchar_t *path=calloc(32768,sizeof(wchar_t));join(path,directory,L"tasks.sqlite");char *p=utf8(path);free(path);memset(db,0,sizeof(*db));
 int ok=sqlite3_open_v2(p,&db->sql,SQLITE_OPEN_READONLY|SQLITE_OPEN_FULLMUTEX,0)==SQLITE_OK;free(p);return ok;
}
int ui_work_regression(const wchar_t *renderDir){
 setvbuf(stdout,0,_IONBF,0);results=cJSON_CreateArray();render=renderDir;checks=failures=0;
 wchar_t environment[16];int ci=GetEnvironmentVariableW(L"GITHUB_ACTIONS",environment,16)&&!wcscmp(environment,L"true");
 check(ci&&app.dataDirOverride,"workspace regression requires Actions and explicit isolated data directory");
 int empty=db_count(&app.db,"tasks")==0&&db_count(&app.db,"projects")==0&&db_count(&app.db,"notes")==0;
 check(empty&&!app.syncEnabled,"workspace fixture directory is empty and remote sync is disabled");
 if(!ci||!app.dataDirOverride||!empty||app.syncEnabled){cJSON_Delete(results);return 1;}
 KillTimer(app.window,3);app.autoSync=0;if(render)ensure_dir(render);
 J *project=cJSON_CreateObject();ss(project,"id","d4-native-project");ss(project,"name","原生集成项目");ss(project,"description","真实项目关系与已有归档操作");set(project,"archived",cJSON_CreateFalse());
 check(op_category(&app.db,0,"projects",project),"create project with existing native business operation");char *projectKey=make_key("projects",str(project,"id"));
 J *archived=dup(project);ss(archived,"id","d4-native-archive");ss(archived,"name","已归档验收项目");set(archived,"archived",cJSON_CreateTrue());
 check(op_category(&app.db,0,"projects",archived),"create archived synthetic project");cJSON_Delete(archived);
 char *parent=task("中文任务 Alpha",0,0,"原生集成项目",0);J *parentRow=db_row(&app.db,parent);char *parentId=_strdup(str(get(parentRow,"data"),"id"));cJSON_Delete(parentRow);
 char *child=task("子任务 Beta",1,parentId,"原生集成项目",0);char *done=task("完成任务 Gamma",2,0,0,1);
 J *note=cJSON_CreateObject();ss(note,"id","d4-native-note");ss(note,"body","独立便签第一行\n第二行与中文");ss(note,"createdAt","2026-11-26T08:00:00Z");char *noteKey=make_key("notes",str(note,"id"));
 check(db_edit_data(&app.db,noteKey,0,note,0),"create independent existing notes entity");cJSON_Delete(note);
 for(int i=0;i<51;i++){char label[100];snprintf(label,sizeof(label),"分页任务 %02d",i);char *key=task(label,i%4,0,0,0);free(key);}
 ui_refresh(1);J *before=snapshot();int writes=sqlite3_total_changes(app.db.sql);
 ui_work_open();host=FindWindowW(GX_WORK_CLASS,0);check(host&&GetWindow(host,GW_OWNER)==app.window,"workspace is an owned native HWND in the original app");
 if(!host){cJSON_Delete(before);cJSON_Delete(results);free(parent);free(parentId);free(child);free(done);free(projectKey);free(noteKey);cJSON_Delete(project);return 1;}
 wchar_t cls[80];GetClassNameW(item(GX_WORK_LIST),cls,80);check(!wcscmp(cls,L"ListBox"),"workspace records use a real native list control");
 check(rows()==50&&IsWindowEnabled(item(GX_WORK_NEXT)),"dashboard paginates actual pending SQLite tasks");geometry();snap(L"workspace-dashboard");
 click(GX_WORK_NEXT);check(rows()==3&&IsWindowEnabled(item(GX_WORK_PREV))&&!IsWindowEnabled(item(GX_WORK_NEXT)),"native next page covers remaining records");
 click(GX_WORK_PREV);check(rows()==50,"native previous page restores first records");
 for(int i=0;i<WORK_PAGES;i++){
   page(i);check(IsWindowVisible(item(GX_WORK_NAV+i)),"all approved native navigation pages remain reachable");
   if(i==WORK_PROJECTS)check(rows()==1&&select_title(L"原生集成项目"),"projects read only active existing project data");
   if(i==WORK_ARCHIVE)check(rows()==1&&select_title(L"已归档验收项目"),"archive reads only archived projects");
   if(i==WORK_NOTES)check(rows()==1,"notes read independent existing note data");
   if(i==WORK_PROCESS||i==WORK_CONTACTS)check(!IsWindowVisible(item(GX_WORK_NEW))&&!IsWindowVisible(item(GX_WORK_LIST)),"unapproved models expose no synthetic CRUD or persistence");
   wchar_t image[80];swprintf(image,80,L"workspace-page-%d",i);snap(image);
 }
 page(WORK_TASKS);SendMessageW(item(GX_WORK_STATUS),CB_SETCURSEL,1,0);SendMessageW(host,WM_COMMAND,MAKEWPARAM(GX_WORK_STATUS,CBN_SELCHANGE),(LPARAM)item(GX_WORK_STATUS));
 check(rows()==1&&select_title(L"完成任务 Gamma"),"status filter uses original completed task flag");
 SendMessageW(item(GX_WORK_STATUS),CB_SETCURSEL,2,0);SendMessageW(host,WM_COMMAND,MAKEWPARAM(GX_WORK_STATUS,CBN_SELCHANGE),(LPARAM)item(GX_WORK_STATUS));
 search("ALPHA");check(rows()==1&&select_title(L"中文任务 Alpha"),"bound native workspace search finds case-insensitive ASCII and Chinese title");
 search("' OR 1=1 --");check(rows()==0,"search parameters cannot become SQL");search("");
 J *after=snapshot();check(eq(before,after)&&writes==sqlite3_total_changes(app.db.sql),"workspace navigation/search/render do not change schema/entities/meta/outbox or any SQLite rows");cJSON_Delete(after);cJSON_Delete(before);
 SetWindowPos(host,0,0,0,U(960),U(700),SWP_NOMOVE|SWP_NOZORDER);geometry();snap(L"workspace-minimum");
 page(WORK_STATS);SCROLLINFO statsScroll={sizeof(statsScroll),SIF_ALL};GetScrollInfo(item(GX_WORK_STATS),SB_VERT,&statsScroll);
 check(IsWindowVisible(item(GX_WORK_STATS))&&statsScroll.nMax+1==U(GX_WORK_STATS_CONTENT)&&statsScroll.nPage<(UINT)U(GX_WORK_STATS_CONTENT),"minimum window exposes full fixed-height native statistics through a scroll viewport");
 SendMessageW(item(GX_WORK_STATS),WM_VSCROLL,SB_BOTTOM,0);GetScrollInfo(item(GX_WORK_STATS),SB_VERT,&statsScroll);
 check(statsScroll.nPos>0&&statsScroll.nPos+(int)statsScroll.nPage>=U(16+613),"scrolling to the end makes original final quadrant statistics reachable");snap(L"workspace-statistics-scrolled-minimum");page(WORK_TASKS);
 SetWindowPos(host,0,0,0,U(1180),U(790),SWP_NOMOVE|SWP_NOZORDER);
 search("Alpha");check(select_title(L"中文任务 Alpha"),"select native task by real control text");click(GX_WORK_OPEN);
 check(app.editor&&!strcmp(app.editor->key,parent)&&!IsWindowVisible(host),"workspace task opens original native detail editor");
 if(app.editor){ui_set(app.editor->fields[0],"原生工作区已编辑 Alpha");check(detail_save(1),"original detail save persists workspace edit");}
 J *row=db_row(&app.db,parent);check(row&&!strcmp(str(get(row,"data"),"title"),"原生工作区已编辑 Alpha")&&!strcmp(str(get(row,"data"),"project"),"原生集成项目"),"native task edit retains project relation");cJSON_Delete(row);
 ui_work_open();page(WORK_NOTES);check(select_title(L"独立便签第一行 第二行与中文"),"select independent note in native list");click(GX_WORK_OPEN);
 check(app.editor&&app.editor->note&&!strcmp(app.editor->key,noteKey),"workspace note opens existing separate note editor");
 if(app.editor){ui_set(app.editor->fields[0],"原生便签更新\r\n换行保留");check(detail_save(1),"note update saves via original editor");}
 ui_work_open();page(WORK_TASKS);click(GX_WORK_NEW);check(app.editor&&!app.editor->note&&app.editor->newRecord,"new task uses established native creation entry");
 char *newKey=app.editor?_strdup(app.editor->key):0;
 if(app.editor){ui_set(app.editor->fields[0],"原生按钮新建任务");check(detail_save(1),"new task persists through existing editor");}
 ui_work_open();page(WORK_PROJECTS);dialogSeen=0;SetTimer(app.window,480,10,category_timer);click(GX_WORK_NEW);KillTimer(app.window,480);
 check(dialogSeen,"new project button opens established native project dialog");ui_work_open();page(WORK_PROJECTS);check(rows()==2&&select_title(L"原生按钮创建项目"),"native dialog project is visible in workspace after save");
 check(select_title(L"原生集成项目"),"select existing project in native workspace");click(GX_WORK_OPEN);
 check(app.page==0&&!strcmp(app.group,"原生集成项目")&&!strcmp(app.groupKind,"project"),"project route uses existing name-based task membership");
 ui_work_open();page(WORK_TASKS);search("Alpha");select_title(L"原生工作区已编辑 Alpha");click(GX_WORK_OPEN);
 if(app.editor){ui_set(app.editor->fields[0],"");ui_work_open();check(app.editor&&!IsWindowVisible(host),"invalid editor draft blocks workspace entry without discarding it");ui_set(app.editor->fields[0],"原生工作区已编辑 Alpha");check(detail_save(1),"valid draft can save after barrier rejection");}
 ui_work_open();page(WORK_TASKS);search("Alpha");check(select_title(L"原生工作区已编辑 Alpha"),"prepare stale native row selection");
 check(task_delete(&app.db,parent),"delete synthetic parent with existing operation");click(GX_WORK_OPEN);
 check(!app.editor&&IsWindowVisible(host)&&rows()==0,"deleted row is revalidated before opening and stale list refreshes");search("");
 /* A new active account may replace app.db while the modeless window survives.
  * A cached key must never cross that boundary even if both DBs contain it. */
 DB *original=malloc(sizeof(DB)),*other=calloc(1,sizeof(DB)),*reader=calloc(1,sizeof(DB));
 wchar_t *otherDir=calloc(32768,sizeof(wchar_t));swprintf(otherDir,32768,L"%s\\workspace-other-account",app.baseDir);
 *original=app.db;int otherOpen=db_open(other,otherDir)&&ui_query_init(other);check(otherOpen,"open isolated second native account for identity boundary");
 if(otherOpen){page(WORK_TASKS);search("Gamma");select_title(L"完成任务 Gamma");J *source=db_row(&app.db,done);check(db_edit_data(other,done,0,get(source,"data"),0),"seed matching key in separate synthetic account");cJSON_Delete(source);
   char *active=_strdup(str(app.registry,"activeId"));app.db=*other;ss(app.registry,"activeId","workspace-other");click(GX_WORK_OPEN);
   check(!app.editor&&IsWindowVisible(host)&&SendMessageW(item(GX_WORK_LIST),LB_GETCURSEL,0,0)==LB_ERR,"account identity change clears selection before a cached key can open");
   app.db=*original;ss(app.registry,"activeId",active);free(active);refresh();db_close(other);
 }
 check(open_readonly(reader,app.db.dir),"reopen native SQLite file read-only while app is active");
 if(reader->sql){row=db_row(reader,noteKey);check(row&&!strcmp(str(get(row,"data"),"body"),"原生便签更新\n换行保留"),"independent note edit survives SQLite reopen");cJSON_Delete(row);
   row=newKey?db_row(reader,newKey):0;check(row&&!strcmp(str(get(row,"data"),"title"),"原生按钮新建任务"),"new native task survives SQLite reopen");cJSON_Delete(row);db_close(reader);}
 free(original);free(other);free(reader);free(otherDir);
 click(GX_WORK_BACK);check(!IsWindowVisible(host)&&app.page==0&&!app.editor,"workspace returns to original task shell");
 check(app.nav[0]&&app.nav[1]&&app.nav[2]&&app.nav[3]&&app.nav[4]&&app.nav[5]&&app.nav[6]&&app.nav[7]&&app.nav[8]&&app.nav[9],"all ten original navigation controls remain available");
#ifdef GX_D404_CANDIDATE
 wchar_t *feedbackPath=calloc(32768,sizeof(wchar_t)),*globalPath=calloc(32768,sizeof(wchar_t));SHGetFolderPathW(0,CSIDL_LOCAL_APPDATA,0,SHGFP_TYPE_CURRENT,globalPath);wcscat(globalPath,L"\\GxTodoLocal\\feedback\\ideas.json");
 char *oldFeedback=read_file(globalPath);DWORD globalBefore=GetFileAttributesW(globalPath);
 ui_work_open();dialogSeen=0;SetTimer(app.window,481,10,feedback_timer);click(GX_WORK_FEEDBACK);KillTimer(app.window,481);
 swprintf(feedbackPath,32768,L"%s\\feedback\\ideas.json",app.baseDir);char *isolatedFeedback=read_file(feedbackPath),*afterFeedback=read_file(globalPath);
 check(dialogSeen&&isolatedFeedback&&strstr(isolatedFeedback,"隔离原生意见"),"candidate native feedback UI persists inside explicit candidate data root");
 check(globalBefore==GetFileAttributesW(globalPath)&&((!oldFeedback&&!afterFeedback)||(oldFeedback&&afterFeedback&&!strcmp(oldFeedback,afterFeedback))),"candidate feedback leaves original global feedback store unchanged");
 free(oldFeedback);free(isolatedFeedback);free(afterFeedback);free(feedbackPath);free(globalPath);
 J *networkBefore=snapshot();ui_start_sync(1);ui_sync_config();J *networkAfter=snapshot();
 check(!app.sync&&eq(networkBefore,networkAfter),"candidate preserves sync entry but does not configure or start real remote synchronization");cJSON_Delete(networkBefore);cJSON_Delete(networkAfter);
#endif
 check(db_check(&app.db),"native SQLite integrity after integrated control actions");
 J *kindRows=select_rows(&app.db,"SELECT DISTINCT kind FROM entities WHERE kind NOT IN('tasks','notes','projects','tags','places')");check(kindRows&&cJSON_GetArraySize(kindRows)==0,"integration writes no unapproved production entities");cJSON_Delete(kindRows);
 J *report=cJSON_CreateObject();ss(report,"suite","D4-04-native-workspace");ss(report,"execution","GitHub Actions synthetic isolated data only");sn(report,"checks",checks);sn(report,"failures",failures);sn(report,"dpi",app.dpi);set(report,"results",results);
 J *limits=cJSON_CreateArray();cJSON_AddItemToArray(limits,cJSON_CreateString("Independent work items, processes and contacts require production model admission."));cJSON_AddItemToArray(limits,cJSON_CreateString("Native Win32 pomodoro is absent in the accepted baseline; no timer implementation is claimed."));cJSON_AddItemToArray(limits,cJSON_CreateString("Real remote sync, true-user storage migration, and production admission were not tested."));set(report,"limitations",limits);
 char *reportText=json(report);if(render){wchar_t *path=calloc(32768,sizeof(wchar_t));join(path,render,L"workspace-report.json");if(!write_file(path,reportText))failures++;free(path);}printf("%s\n",reportText);free(reportText);cJSON_Delete(report);
 free(parent);free(parentId);free(child);free(done);free(projectKey);free(noteKey);free(newKey);cJSON_Delete(project);ui_work_close();return failures?1:0;
}
