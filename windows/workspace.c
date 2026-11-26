#include "ui.h"
#include "workspace.h"

/* The workspace is an owned, modeless Win32 window. It never opens another
 * database, adds a model/column, or writes an entity itself. Every edit returns
 * through the established native editor/menu, including its undo and outbox. */
#define WORK_LIMIT 50
typedef struct {
 HWND window,nav[WORK_PAGES],search,status,list,add,open,edit,menu,reload,prev,next;
 HWND back,feedback,sync,notice,pageLabel,stats;
 int statsOffset;
 int page,offset,total,loading,ok,counts[4];
 J *rows;
 wchar_t directory[32768];
 char account[128];
} Workspace;
static Workspace work;
static const wchar_t *names[WORK_PAGES]={L"工作台",L"项目",L"工作事项",L"流程",L"往来",L"便签",L"归档",L"统计"};
static const wchar_t *descriptions[WORK_PAGES]={
 L"今日关注 · 当前账号的待办任务与项目概况",
 L"活动项目 · 打开查看原生任务，编辑管理项目资料",
 L"现有任务视图 · 完整任务详情与原生操作菜单",
 L"流程模板与实例 · 等待独立模型准入",
 L"联系人与往来记录 · 等待独立模型准入",
 L"独立便签 · 原生编辑与本地保存",
 L"已归档项目 · 编辑项目可恢复到活动项目",
 L"任务统计 · 沿用原生统计口径"};

static void layout(void);
static void refresh(int reset);
static int has_rows(void){return work.page!=WORK_PROCESS&&work.page!=WORK_CONTACTS&&work.page!=WORK_STATS;}
static int task_page(void){return work.page==WORK_HOME||work.page==WORK_TASKS;}
static const char *row_kind(void){return task_page()?"tasks":work.page==WORK_NOTES?"notes":"projects";}
static int identity_current(void){return !_wcsicmp(work.directory,app.db.dir)&&!strcmp(work.account,str(app.registry,"activeId"));}
static J *selected(void){int i=(int)SendMessageW(work.list,LB_GETCURSEL,0,0);return i>=0?cJSON_GetArrayItem(work.rows,i):0;}
static void fill(HDC dc,RECT r,COLORREF c){HBRUSH b=CreateSolidBrush(c);FillRect(dc,&r,b);DeleteObject(b);}
static void text(HDC dc,const wchar_t *s,RECT r,HFONT f,COLORREF color,UINT flags){HGDIOBJ old=SelectObject(dc,f);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,color);DrawTextW(dc,s,-1,&r,flags|DT_NOPREFIX);SelectObject(dc,old);}
static HWND control(const wchar_t *cls,const wchar_t *title,DWORD style,int id){
 HWND h=CreateWindowExW(!wcscmp(cls,L"EDIT")?WS_EX_CLIENTEDGE:0,cls,title,
   WS_CHILD|WS_VISIBLE|WS_TABSTOP|WS_CLIPSIBLINGS|style,0,0,0,0,work.window,(HMENU)(INT_PTR)id,app.instance,0);
 SendMessageW(h,WM_SETFONT,(WPARAM)app.font,TRUE);return h;
}
static HWND button(const wchar_t *title,int id){return control(L"BUTTON",title,BS_OWNERDRAW,id);}
static void update_actions(void){
 int any=work.ok&&selected()!=0;
 EnableWindow(work.open,any);EnableWindow(work.edit,any);EnableWindow(work.menu,any);
 EnableWindow(work.prev,work.ok&&work.offset>0);EnableWindow(work.next,work.ok&&work.offset+WORK_LIMIT<work.total);
}
static const char *title(J *row){J *d=get(row,"data");return task_page()?str(d,"title"):work.page==WORK_NOTES?str(d,"body"):str(d,"name");}

/* Read-only SELECTs are intentional. Workspace search does not populate or
 * mutate the existing native search cache. Project membership remains the
 * existing task.project name relationship; no implicit ID migration. */
static sqlite3_stmt *query(int count,const char *search){
 const char *filter=" WHERE deleted=0 AND kind=?1"
   " AND (?2<0 OR coalesce(json_extract(data,'$.archived'),0)=?2)"
   " AND (?3=2 OR coalesce(done,0)=?3)"
   " AND (?4='' OR instr(lower(coalesce(json_extract(data,'$.title'),'')||' '||"
   "coalesce(json_extract(data,'$.name'),'')||' '||coalesce(json_extract(data,'$.body'),'')||' '||"
   "coalesce(json_extract(data,'$.description'),'')||' '||coalesce(json_extract(data,'$.notes'),'')||' '||"
   "coalesce(json_extract(data,'$.project'),'')),lower(?4))>0)";
 char sql[2600];snprintf(sql,sizeof(sql),"%s%s%s",count?"SELECT count(*) FROM entities":"SELECT key,data FROM entities",filter,
   count?"":" ORDER BY coalesce(done,0),CASE WHEN start='' THEN '9999' ELSE start END,"
   "CASE WHEN kind='notes' THEN json_extract(data,'$.createdAt') END DESC,"
   "json_extract(data,'$.name'),key LIMIT ?5 OFFSET ?6");
 sqlite3_stmt *s=0;if(sqlite3_prepare_v2(app.db.sql,sql,-1,&s,0)!=SQLITE_OK)return 0;
 if(!sqlite3_stmt_readonly(s)){sqlite3_finalize(s);return 0;}
 sqlite3_bind_text(s,1,row_kind(),-1,SQLITE_STATIC);
 sqlite3_bind_int(s,2,work.page==WORK_PROJECTS?0:work.page==WORK_ARCHIVE?1:-1);
 int status=work.page==WORK_HOME?0:work.page==WORK_TASKS?(int)SendMessageW(work.status,CB_GETCURSEL,0,0):2;
 sqlite3_bind_int(s,3,status);sqlite3_bind_text(s,4,search,-1,SQLITE_TRANSIENT);
 if(!count){sqlite3_bind_int(s,5,WORK_LIMIT);sqlite3_bind_int(s,6,work.offset);}return s;
}
static int read_counts(void){
 sqlite3_stmt *s=0;const char *sql="SELECT "
 "coalesce(sum(CASE WHEN kind='tasks' AND coalesce(done,0)=0 THEN 1 ELSE 0 END),0),"
 "coalesce(sum(CASE WHEN kind='tasks' AND done=1 THEN 1 ELSE 0 END),0),"
 "coalesce(sum(CASE WHEN kind='projects' AND coalesce(json_extract(data,'$.archived'),0)=0 THEN 1 ELSE 0 END),0),"
 "coalesce(sum(CASE WHEN kind='notes' THEN 1 ELSE 0 END),0) FROM entities WHERE deleted=0";
 int ok=sqlite3_prepare_v2(app.db.sql,sql,-1,&s,0)==SQLITE_OK;
 if(ok&&sqlite3_step(s)==SQLITE_ROW){for(int i=0;i<4;i++)work.counts[i]=sqlite3_column_int(s,i);}else ok=0;
 sqlite3_finalize(s);return ok;
}
static void page_notice(void){
 const wchar_t *message=L"双击打开。F5 刷新，Ctrl+F 搜索，Esc 返回四象限。";
 if(work.page==WORK_TASKS)message=L"当前读取已有任务；独立工作事项尚待模型批准，不会写入演示事项。";
 if(work.page==WORK_PROCESS)message=L"流程功能待接入\r\n模板、步骤和实例需要独立数据模型批准。当前不会创建、运行或保存流程。";
 if(work.page==WORK_CONTACTS)message=L"往来功能待接入\r\n联系人及关联往来需要独立数据模型批准。当前不会创建或保存联系人。";
 if(work.page==WORK_ARCHIVE)message=L"这里仅显示已归档项目。任务完成与项目归档沿用各自原有行为。";
 if(work.page==WORK_STATS)message=L"统计包含当前账号的现有任务；流程和独立工作事项尚未计入。";
 SetWindowTextW(work.notice,message);
}
static void refresh(int reset){
 if(!work.window||work.loading||!app.db.sql)return;
 work.loading=1;KillTimer(work.window,1);
 int identity=identity_current();char *key=identity&&!reset&&selected()?_strdup(str(selected(),"key")):0;
 if(reset||!identity)work.offset=0;
 if(!identity){wcscpy(work.directory,app.db.dir);snprintf(work.account,sizeof(work.account),"%s",str(app.registry,"activeId"));
   SetWindowTextW(work.search,L"");SendMessageW(work.status,CB_SETCURSEL,2,0);}
 SendMessageW(work.list,WM_SETREDRAW,FALSE,0);SendMessageW(work.list,LB_RESETCONTENT,0,0);
 cJSON_Delete(work.rows);work.rows=cJSON_CreateArray();work.total=0;work.ok=read_counts();page_notice();
 char *search=ui_text(work.search);
 if(has_rows()&&work.ok){
   sqlite3_stmt *s=query(1,search);
   if(s&&sqlite3_step(s)==SQLITE_ROW)work.total=sqlite3_column_int(s,0);else work.ok=0;
   sqlite3_finalize(s);if(work.offset>=work.total)work.offset=work.total?((work.total-1)/WORK_LIMIT)*WORK_LIMIT:0;
   if(work.ok){s=query(0,search);int code=SQLITE_ERROR;
     if(s)while((code=sqlite3_step(s))==SQLITE_ROW){
       const char *raw=(const char*)sqlite3_column_text(s,1);J *data=raw?cJSON_Parse(raw):0;
       if(!cJSON_IsObject(data)){cJSON_Delete(data);work.ok=0;break;}
       J *row=cJSON_CreateObject();ss(row,"key",(const char*)sqlite3_column_text(s,0));set(row,"data",data);cJSON_AddItemToArray(work.rows,row);
     }
     if(code!=SQLITE_DONE)work.ok=0;sqlite3_finalize(s);
   }
 }
 free(search);
 if(!work.ok){cJSON_Delete(work.rows);work.rows=cJSON_CreateArray();work.total=0;SetWindowTextW(work.notice,L"读取当前账号数据失败。请返回原界面检查数据库，再按 F5 重试。");}
 int select=-1,index=0;J *row;cJSON_ArrayForEach(row,work.rows){
   wchar_t *w=wide(title(row));for(wchar_t *p=w;*p;p++)if(*p==L'\n'||*p==L'\r'||*p==L'\t')*p=L' ';
   SendMessageW(work.list,LB_ADDSTRING,0,(LPARAM)w);free(w);
   if(key&&!strcmp(key,str(row,"key")))select=index;index++;
 }
 free(key);if(select>=0)SendMessageW(work.list,LB_SETCURSEL,select,0);
 SendMessageW(work.list,WM_SETREDRAW,TRUE,0);InvalidateRect(work.list,0,TRUE);
 wchar_t label[160];swprintf(label,160,L"共 %d 条  ·  第 %d / %d 页",work.total,work.total?work.offset/WORK_LIMIT+1:0,(work.total+WORK_LIMIT-1)/WORK_LIMIT);
 SetWindowTextW(work.pageLabel,label);work.loading=0;update_actions();layout();InvalidateRect(work.window,0,TRUE);InvalidateRect(work.stats,0,TRUE);
}
void ui_work_changed(void){if(work.window)PostMessageW(work.window,GX_WORK_REFRESH,0,0);}

static void show_main(void){ShowWindow(work.window,SW_HIDE);ShowWindow(app.window,SW_RESTORE);SetForegroundWindow(app.window);}
static int save_barrier(void){return ui_catalog_commit()&&detail_save(1);}
static int action_ready(void){if(!identity_current()){refresh(1);return 0;}return save_barrier();}
static void open_selected(int edit,int menu){
 if(!action_ready())return;J *r=selected();if(!r)return;
 char *key=_strdup(str(r,"key"));J *current=db_row(&app.db,key);
 if(!current||truth(current,"deleted")){cJSON_Delete(current);free(key);refresh(0);return;}cJSON_Delete(current);
 int task=task_page(),note=work.page==WORK_NOTES;show_main();
 if(menu){POINT point;GetCursorPos(&point);ui_menu(key,point);}
 else if(task||note){if(ui_navigate(note?1:0))ui_open(key,0,0,note);}
 else if(edit)ui_category_edit(key,"projects");
 else {if(ui_navigate(2))ui_entity_open(key);}
 free(key);
}
static void add_record(void){
 if(!has_rows()||!action_ready())return;
 int page=work.page;show_main();
 if(page==WORK_PROJECTS||page==WORK_ARCHIVE){if(ui_navigate(2))ui_category_edit(0,"projects");}
 else if(ui_navigate(page==WORK_NOTES?1:0))ui_open(0,0,0,page==WORK_NOTES);
}
static void change_page(int page){
 if(page<0||page>=WORK_PAGES)return;work.page=page;work.loading=1;
 SetWindowTextW(work.search,L"");SendMessageW(work.status,CB_SETCURSEL,2,0);work.loading=0;refresh(1);
 for(int i=0;i<WORK_PAGES;i++)InvalidateRect(work.nav[i],0,TRUE);
}
static void draw_button(DRAWITEMSTRUCT *d){
 RECT r=d->rcItem;int nav=d->CtlID>=GX_WORK_NAV&&d->CtlID<GX_WORK_NAV+WORK_PAGES;
 int active=nav&&d->CtlID-GX_WORK_NAV==work.page,pressed=(d->itemState&ODS_SELECTED)!=0;
 COLORREF bg=nav?(active?RGB(221,243,236):RGB(244,248,247)):RGB(255,255,255);
 if(pressed)bg=RGB(210,234,225);
 fill(d->hDC,r,bg);if(active){RECT mark=r;mark.right=mark.left+U(3);fill(d->hDC,mark,RGB(25,113,86));}
 wchar_t label[160];GetWindowTextW(d->hwndItem,label,160);
 r.left+=U(nav?18:8);r.right-=U(8);
 text(d->hDC,label,r,app.font,(d->itemState&ODS_DISABLED)?RGB(165,177,172):active?RGB(20,93,71):RGB(65,83,76),DT_SINGLELINE|DT_VCENTER|(nav?DT_LEFT:DT_CENTER));
 if(d->itemState&ODS_FOCUS){InflateRect(&r,-U(2),-U(5));DrawFocusRect(d->hDC,&r);}
}
static void draw_row(DRAWITEMSTRUCT *d){
 RECT r=d->rcItem;fill(d->hDC,r,(d->itemState&ODS_SELECTED)?RGB(222,243,235):RGB(255,255,255));
 if(d->itemID==(UINT)-1)return;J *row=cJSON_GetArrayItem(work.rows,(int)d->itemID);if(!row)return;J *data=get(row,"data");
 RECT line={r.left+U(16),r.top+U(10),r.right-U(18),r.top+U(34)};wchar_t *w=wide(title(row));
 for(wchar_t *p=w;*p;p++)if(*p==L'\n'||*p==L'\r'||*p==L'\t')*p=L' ';
 text(d->hDC,*w?w:L"（空白内容）",line,app.font,RGB(41,62,53),DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);free(w);
 char description[1800];
 if(task_page())snprintf(description,sizeof(description),"%s · 象限 %d · %s%s%s%s",truth(data,"done")?"已完成":"待完成",(int)num(data,"quadrant")+1,
   *str(data,"start")?str(data,"start"):"未安排时间",*str(data,"project")?" · ":"",str(data,"project"),*str(data,"parentId")?" · 子任务":"");
 else if(work.page==WORK_NOTES)snprintf(description,sizeof(description),"%s · 独立便签",str(data,"createdAt"));
 else snprintf(description,sizeof(description),"%s · %s",truth(data,"archived")?"已归档":"活动项目",*str(data,"description")?str(data,"description"):"打开查看项目任务");
 w=wide(description);line.top=r.top+U(38);line.bottom=r.top+U(61);text(d->hDC,w,line,app.smallFont,RGB(107,126,116),DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);free(w);
 RECT edge={r.left+U(16),r.bottom-1,r.right-U(16),r.bottom};fill(d->hDC,edge,RGB(232,239,235));
 if(d->itemState&ODS_FOCUS){RECT focus=r;InflateRect(&focus,-2,-2);DrawFocusRect(d->hDC,&focus);}
}
static void paint(HWND h,HDC dc){
 RECT r;GetClientRect(h,&r);fill(dc,r,RGB(250,252,250));RECT side={0,0,U(176),r.bottom};fill(dc,side,RGB(244,248,247));
 RECT brand={U(20),U(25),U(158),U(54)};text(dc,L"MyTodo",brand,app.title,RGB(20,93,71),DT_SINGLELINE|DT_VCENTER);
 brand.top=U(55);brand.bottom=U(76);text(dc,L"原生工作区",brand,app.smallFont,RGB(116,137,125),DT_SINGLELINE);
 RECT heading={U(204),U(24),r.right-U(28),U(56)};text(dc,names[work.page],heading,app.title,RGB(31,61,47),DT_SINGLELINE|DT_VCENTER);
 heading.top=U(64);heading.bottom=U(90);text(dc,descriptions[work.page],heading,app.font,RGB(100,123,110),DT_SINGLELINE|DT_END_ELLIPSIS);
 if(work.page==WORK_HOME){const wchar_t *metric[]={L"待完成任务",L"已完成任务",L"活动项目",L"独立便签"};int width=(r.right-U(232+36))/4;
   for(int i=0;i<4;i++){RECT card={U(204)+i*(width+U(12)),U(108),U(204)+i*(width+U(12))+width,U(196)};
     ui_round(dc,card,RGB(255,255,255),RGB(220,232,224),8);wchar_t value[40];swprintf(value,40,L"%d",work.counts[i]);
     RECT at={card.left+U(16),card.top+U(12),card.right-U(10),card.top+U(47)};text(dc,work.ok?value:L"—",at,app.title,RGB(26,106,78),DT_SINGLELINE);
     at.top=card.top+U(52);at.bottom=card.bottom-U(8);text(dc,metric[i],at,app.smallFont,RGB(101,124,110),DT_SINGLELINE|DT_END_ELLIPSIS);
   }
 }
 if(has_rows()&&work.ok&&!work.total){RECT empty={U(220),U(work.page==WORK_HOME?350:274),r.right-U(48),U(work.page==WORK_HOME?392:316)};
   text(dc,L"没有符合条件的记录",empty,app.font,RGB(134,150,141),DT_CENTER|DT_SINGLELINE|DT_VCENTER);}
 RECT footer={U(204),r.bottom-U(27),r.right-U(28),r.bottom-U(6)};
 wchar_t *account=wide(work.account),label[220];swprintf(label,220,L"当前账号：%.70s  ·  原生 SQLite  ·  Ctrl+Shift+W 打开工作区",account);free(account);
 text(dc,label,footer,app.smallFont,RGB(118,139,126),DT_SINGLELINE|DT_END_ELLIPSIS);
}
static LRESULT CALLBACK stats_proc(HWND h,UINT m,WPARAM w,LPARAM l){
 if(m==WM_SIZE){RECT r;GetClientRect(h,&r);work.statsOffset=max(0,min(work.statsOffset,U(GX_WORK_STATS_CONTENT)-r.bottom));
   SCROLLINFO s={sizeof(s),SIF_RANGE|SIF_PAGE|SIF_POS};s.nMin=0;s.nMax=U(GX_WORK_STATS_CONTENT)-1;s.nPage=r.bottom;s.nPos=work.statsOffset;SetScrollInfo(h,SB_VERT,&s,TRUE);InvalidateRect(h,0,TRUE);return 0;}
 if(m==WM_VSCROLL||m==WM_MOUSEWHEEL||m==WM_KEYDOWN){SCROLLINFO s={sizeof(s),SIF_ALL};GetScrollInfo(h,SB_VERT,&s);int next=work.statsOffset;
   if(m==WM_MOUSEWHEEL)next-=GET_WHEEL_DELTA_WPARAM(w)/WHEEL_DELTA*U(70);
   else if(m==WM_KEYDOWN){if(w==VK_DOWN)next+=U(30);else if(w==VK_UP)next-=U(30);else if(w==VK_NEXT)next+=s.nPage;else if(w==VK_PRIOR)next-=s.nPage;else if(w==VK_HOME)next=0;else if(w==VK_END)next=s.nMax;else return DefWindowProcW(h,m,w,l);}
   else switch(LOWORD(w)){case SB_LINEUP:next-=U(30);break;case SB_LINEDOWN:next+=U(30);break;case SB_PAGEUP:next-=s.nPage;break;case SB_PAGEDOWN:next+=s.nPage;break;case SB_THUMBTRACK:case SB_THUMBPOSITION:next=s.nTrackPos;break;case SB_TOP:next=0;break;case SB_BOTTOM:next=s.nMax;break;}
   work.statsOffset=max(0,min(next,max(0,s.nMax-(int)s.nPage+1)));SetScrollPos(h,SB_VERT,work.statsOffset,TRUE);InvalidateRect(h,0,TRUE);return 0;}
 if(m==WM_LBUTTONDOWN){SetFocus(h);return 0;}
 if(m==WM_GETDLGCODE)return DLGC_WANTARROWS;
 if(m==WM_ERASEBKGND)return 1;
 if(m==WM_PAINT||m==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;RECT r;GetClientRect(h,&r);fill(dc,r,RGB(250,252,250));int saved=SaveDC(dc);IntersectClipRect(dc,0,0,r.right,r.bottom);
   RECT content={U(16),U(16)-work.statsOffset,r.right-U(16),U(GX_WORK_STATS_CONTENT)-work.statsOffset};ui_stats_paint(dc,content);RestoreDC(dc,saved);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}
 return DefWindowProcW(h,m,w,l);
}
static void layout(void){
 if(!work.window)return;RECT r;GetClientRect(work.window,&r);int left=U(204),width=max(U(100),r.right-left-U(28));
 for(int i=0;i<WORK_PAGES;i++)ui_move(work.nav[i],U(10),U(100+i*43),U(156),U(38));
 ui_move(work.back,U(10),r.bottom-U(145),U(156),U(34));ui_move(work.feedback,U(10),r.bottom-U(102),U(156),U(34));ui_move(work.sync,U(10),r.bottom-U(59),U(156),U(34));
 int home=work.page==WORK_HOME,rows=has_rows(),toolbar=U(home?240:168),listTop=toolbar+U(46);
 ui_move(work.notice,left,U(home?208:108),width,U(rows?40:48));
 ui_move(work.search,left,toolbar,max(U(100),width-U(work.page==WORK_TASKS?355:239)),U(31));
 ui_move(work.status,left+width-U(347),toolbar,U(102),U(130));
 ui_move(work.reload,left+width-U(231),toolbar,U(70),U(31));ui_move(work.add,left+width-U(153),toolbar,U(153),U(31));
 ui_move(work.list,left,listTop,width,max(U(60),r.bottom-listTop-U(92)));
 int bottom=r.bottom-U(77);ui_move(work.open,left,bottom,U(88),U(32));ui_move(work.edit,left+U(96),bottom,U(88),U(32));ui_move(work.menu,left+U(192),bottom,U(98),U(32));
 ui_move(work.pageLabel,left+U(302),bottom,max(U(50),width-U(478)),U(32));ui_move(work.prev,left+width-U(166),bottom,U(78),U(32));ui_move(work.next,left+width-U(78),bottom,U(78),U(32));
 HWND controls[]={work.search,work.list,work.add,work.reload,work.open,work.edit,work.menu,work.pageLabel,work.prev,work.next};
 for(int i=0;i<10;i++)ShowWindow(controls[i],rows?SW_SHOW:SW_HIDE);
 ShowWindow(work.list,rows&&work.total?SW_SHOW:SW_HIDE);ShowWindow(work.status,work.page==WORK_TASKS?SW_SHOW:SW_HIDE);
 ui_move(work.stats,left,U(164),width,max(U(80),r.bottom-U(202)));ShowWindow(work.stats,work.page==WORK_STATS?SW_SHOW:SW_HIDE);
 SetWindowTextW(work.add,work.page==WORK_NOTES?L"＋ 新建便签":task_page()?L"＋ 新建任务":L"＋ 新建项目");
 update_actions();
}
static LRESULT CALLBACK list_proc(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR data){
 if(m==WM_GETDLGCODE&&w==VK_RETURN)return DLGC_WANTALLKEYS;
 if(m==WM_KEYDOWN&&w==VK_RETURN){open_selected(0,0);return 0;}
 if(m==WM_CONTEXTMENU){
   POINT p={GET_X_LPARAM(l),GET_Y_LPARAM(l)};if(p.x!=-1||p.y!=-1){ScreenToClient(h,&p);DWORD hit=(DWORD)SendMessageW(h,LB_ITEMFROMPOINT,0,MAKELPARAM(p.x,p.y));if(HIWORD(hit))return 0;SendMessageW(h,LB_SETCURSEL,LOWORD(hit),0);}
   update_actions();open_selected(0,1);return 0;
 }
 if(m==WM_NCDESTROY)RemoveWindowSubclass(h,list_proc,id);return DefSubclassProc(h,m,w,l);
}
static LRESULT CALLBACK procedure(HWND h,UINT m,WPARAM w,LPARAM l){
 if(m==WM_CREATE){work.window=h;
   for(int i=0;i<WORK_PAGES;i++)work.nav[i]=button(names[i],GX_WORK_NAV+i);
   work.back=button(L"返回四象限",GX_WORK_BACK);work.feedback=button(L"优化意见",GX_WORK_FEEDBACK);work.sync=button(L"同步设置",GX_WORK_SYNC);
   work.search=control(L"EDIT",L"",ES_AUTOHSCROLL,GX_WORK_SEARCH);SendMessageW(work.search,EM_SETLIMITTEXT,512,0);SendMessageW(work.search,EM_SETCUEBANNER,TRUE,(LPARAM)L"搜索当前页面内容");
   work.status=control(L"COMBOBOX",L"任务状态",CBS_DROPDOWNLIST,GX_WORK_STATUS);const wchar_t *states[]={L"待完成",L"已完成",L"全部状态"};
   for(int i=0;i<3;i++)SendMessageW(work.status,CB_ADDSTRING,0,(LPARAM)states[i]);SendMessageW(work.status,CB_SETCURSEL,2,0);
   work.list=control(L"LISTBOX",L"工作区记录",LBS_NOTIFY|LBS_OWNERDRAWFIXED|LBS_HASSTRINGS|LBS_NOINTEGRALHEIGHT|WS_VSCROLL,GX_WORK_LIST);SendMessageW(work.list,LB_SETITEMHEIGHT,0,U(72));SetWindowSubclass(work.list,list_proc,1,0);
   work.add=button(L"新建",GX_WORK_NEW);work.open=button(L"打开",GX_WORK_OPEN);work.edit=button(L"编辑",GX_WORK_EDIT);work.menu=button(L"操作菜单",GX_WORK_MENU);
   work.reload=button(L"刷新",GX_WORK_RELOAD);work.prev=button(L"上一页",GX_WORK_PREV);work.next=button(L"下一页",GX_WORK_NEXT);
   work.notice=control(L"STATIC",L"",SS_LEFT|SS_NOPREFIX,GX_WORK_NOTICE);work.pageLabel=control(L"STATIC",L"",SS_LEFT|SS_CENTERIMAGE|SS_NOPREFIX,GX_WORK_PAGE_LABEL);
   WNDCLASSW statsClass={0};statsClass.lpfnWndProc=stats_proc;statsClass.hInstance=app.instance;statsClass.hCursor=LoadCursorW(0,IDC_ARROW);statsClass.lpszClassName=L"GxWorkspaceStats";RegisterClassW(&statsClass);
   work.stats=control(statsClass.lpszClassName,L"可滚动任务统计",WS_VSCROLL,GX_WORK_STATS);
   SetWindowLongPtrW(work.notice,GWL_STYLE,GetWindowLongPtrW(work.notice,GWL_STYLE)&~WS_TABSTOP);SetWindowLongPtrW(work.pageLabel,GWL_STYLE,GetWindowLongPtrW(work.pageLabel,GWL_STYLE)&~WS_TABSTOP);
   SendMessageW(work.notice,WM_SETFONT,(WPARAM)app.smallFont,TRUE);SendMessageW(work.pageLabel,WM_SETFONT,(WPARAM)app.smallFont,TRUE);
   refresh(1);return 0;
 }
 if(m==WM_COMMAND){int id=LOWORD(w),event=HIWORD(w);
   if(id>=GX_WORK_NAV&&id<GX_WORK_NAV+WORK_PAGES){change_page(id-GX_WORK_NAV);return 0;}
   if(id==GX_WORK_SEARCH&&event==EN_CHANGE&&!work.loading){SetTimer(h,1,200,0);return 0;}
   if(id==GX_WORK_STATUS&&event==CBN_SELCHANGE){refresh(1);return 0;}
   if(id==GX_WORK_LIST){update_actions();if(event==LBN_DBLCLK)open_selected(0,0);return 0;}
   if(id==GX_WORK_RELOAD){refresh(0);return 0;}if(id==GX_WORK_NEW){add_record();return 0;}
   if(id==GX_WORK_OPEN||id==GX_WORK_EDIT||id==GX_WORK_MENU){open_selected(id==GX_WORK_EDIT,id==GX_WORK_MENU);return 0;}
   if(id==GX_WORK_PREV&&work.offset>0){work.offset-=WORK_LIMIT;refresh(0);return 0;}
   if(id==GX_WORK_NEXT&&work.offset+WORK_LIMIT<work.total){work.offset+=WORK_LIMIT;refresh(0);return 0;}
   if(id==GX_WORK_BACK){if(action_ready()){show_main();ui_navigate(0);}return 0;}
   if(id==GX_WORK_FEEDBACK||id==GX_WORK_SYNC){if(action_ready()){show_main();if(id==GX_WORK_FEEDBACK)ui_feedback();else ui_navigate(7);}return 0;}
 }
 if(m==WM_MEASUREITEM){MEASUREITEMSTRUCT *item=(MEASUREITEMSTRUCT*)l;if(item->CtlID==GX_WORK_LIST){item->itemHeight=U(72);return TRUE;}}
 if(m==WM_DRAWITEM){DRAWITEMSTRUCT *item=(DRAWITEMSTRUCT*)l;if(item->CtlID==GX_WORK_LIST)draw_row(item);else draw_button(item);return TRUE;}
 if(m==WM_CTLCOLORSTATIC){SetTextColor((HDC)w,RGB(100,123,110));SetBkColor((HDC)w,RGB(250,252,250));return (LRESULT)GetStockObject(NULL_BRUSH);}
 if(m==WM_CTLCOLORLISTBOX||m==WM_CTLCOLOREDIT){SetTextColor((HDC)w,RGB(41,62,53));SetBkColor((HDC)w,RGB(255,255,255));return (LRESULT)app.white;}
 if(m==WM_ERASEBKGND)return 1;
 if(m==WM_PAINT||m==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;paint(h,dc);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}
 if(m==WM_SIZE){layout();InvalidateRect(h,0,TRUE);return 0;}
 if(m==WM_GETMINMAXINFO){((MINMAXINFO*)l)->ptMinTrackSize.x=U(960);((MINMAXINFO*)l)->ptMinTrackSize.y=U(700);return 0;}
 if(m==WM_ACTIVATE&&LOWORD(w)!=WA_INACTIVE){refresh(0);return 0;}
 if(m==WM_TIMER&&w==1){refresh(1);return 0;}
 if(m==GX_WORK_REFRESH){refresh(0);return 0;}
 if(m==WM_CLOSE){show_main();return 0;}
 if(m==WM_DESTROY){KillTimer(h,1);cJSON_Delete(work.rows);memset(&work,0,sizeof(work));return 0;}
 return DefWindowProcW(h,m,w,l);
}
void ui_work_open(void){
 if(!app.window||!save_barrier())return;
 if(!work.window){WNDCLASSW cls={0};cls.lpfnWndProc=procedure;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.hIcon=ui_app_icon(U(32));cls.lpszClassName=GX_WORK_CLASS;RegisterClassW(&cls);
   RECT r;GetWindowRect(app.window,&r);HWND h=CreateWindowExW(WS_EX_CONTROLPARENT,GX_WORK_CLASS,L"MyTodo · 原生工作区",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,r.left+U(25),r.top+U(25),U(1180),U(790),app.window,0,app.instance,0);
   if(!h){ui_notice("无法创建原生工作区窗口");return;}
 }
 refresh(0);ShowWindow(work.window,SW_RESTORE);SetForegroundWindow(work.window);SetFocus(work.nav[work.page]);
}
void ui_work_close(void){if(work.window)DestroyWindow(work.window);}
int ui_work_translate_message(MSG *msg){
 if(!work.window||!IsWindowVisible(work.window)||(msg->hwnd!=work.window&&!IsChild(work.window,msg->hwnd)))return 0;
 if(msg->message==WM_KEYDOWN){
   if(msg->wParam==VK_ESCAPE){show_main();return 1;}
   if(msg->wParam==VK_F5){refresh(0);return 1;}
   if(msg->wParam=='F'&&(GetKeyState(VK_CONTROL)&0x8000)){if(has_rows())SetFocus(work.search);return 1;}
   if(msg->wParam=='N'&&(GetKeyState(VK_CONTROL)&0x8000)){add_record();return 1;}
 }
 if(IsDialogMessageW(work.window,msg))return 1;TranslateMessage(msg);DispatchMessageW(msg);return 1;
}
