#include "ui.h"
#include "d408.h"
#include "d409-ui.h"
static HWND headers[4];static HIMAGELIST rowImages;static int closing;static uint64_t lastSync;static char*pendingDrag;static POINT pointerDown;static int pointerIndex=-1,pointerQ=-1;
static const wchar_t*navNames[]={L"任务",L"便签",L"项目",L"地点",L"标签",L"搜索",L"统计",L"同步",L"设置",L"账号"};static const char*kinds[]={"tasks","notes","projects","places","tags","search"};
static int enabled_undo(void){int n=0;for(int i=0;i<app.undoCount;i++)if(app.undo[i].expires>GetTickCount64())n++;return n;}
static void date_shift(int step){char s[32];sprintf(s,"%sT12:00",app.filterSpec.date);int64_t n=time_ms(s);if(app.filterSpec.period==2){int y,m,d;sscanf(s,"%d-%d-%d",&y,&m,&d);m+=step;if(m<1){m=12;y--;}if(m>12){m=1;y++;}int days[]={31,28,31,30,31,30,31,31,30,31,30,31};d=min(d,days[m-1]+(m==2&&!(y%4)&&(y%100||!(y%400))));sprintf(s,"%04d-%02d-%02dT12:00",y,m,d);n=time_ms(s);}else n+=step*(app.filterSpec.period==1?7:1)*86400000LL;format_ms(n,s);memcpy(app.filterSpec.date,s,10);app.filterSpec.date[10]=0;ui_refresh(1);}
static void date_label(wchar_t*out){char s[32];sprintf(s,"%sT12:00",app.filterSpec.date);int64_t n=time_ms(s);if(app.filterSpec.period==3){wcscpy(out,L"全部日期");return;}if(app.filterSpec.period==2){swprintf(out,80,L"%.7S",app.filterSpec.date);return;}if(app.filterSpec.period==1){ULARGE_INTEGER u;u.QuadPart=(n+11644473600000LL+28800000)*10000;FILETIME f={u.LowPart,u.HighPart};SYSTEMTIME t;FileTimeToSystemTime(&f,&t);char a[32],b[32];int shift=(t.wDayOfWeek+6)%7;format_ms(n-shift*86400000LL,a);format_ms(n+(6-shift)*86400000LL,b);swprintf(out,80,L"%.10S — %.10S",a,b);}else swprintf(out,80,L"%S",app.filterSpec.date);}

void ui_layout(void){
 if(!app.ready||!app.window)return;ui_drag_cancel();ui_update_begin(app.window);RECT r;GetClientRect(app.window,&r);int width=r.right,height=r.bottom;
#ifdef GX_D408_CANDIDATE
 height-=U(42);
#endif
 int overlay=app.editor&&width<U(1080),side=width<U(750)&&!app.sidebarOpen?0:U(GX_SIDE),right=app.editor&&!overlay?U(GX_DRAWER):0;
 ui_move(app.sidebar,0,0,side,height);ui_show(app.sidebar,side?SW_SHOW:SW_HIDE);
#ifdef GX_D409_UI
 ui_move(app.nav[9],U(12),U(18),max(0,side-U(24)),U(40));for(int i=0;i<9;i++)ui_move(app.nav[i],U(12),U(76+i*35),max(0,side-U(24)),U(32));
#else
 ui_move(app.nav[9],0,0,side,U(88));for(int i=0;i<5;i++)ui_move(app.nav[i],0,U(88+i*51),side,U(51));
 for(int i=5;i<9;i++)ui_move(app.nav[i],0,height-U(220)+(i-5)*U(50),side,U(48));
#endif
 int tw=max(0,width-side-right);ui_move(app.topbar,side,0,tw,U(GX_TOP));
 int task=app.page==0;for(int i=0;i<4;i++)ui_show(app.buttons[i],task?SW_SHOW:SW_HIDE);
 ui_show(app.period,SW_HIDE);ui_show(app.sort,SW_HIDE);ui_show(app.mode,task?SW_SHOW:SW_HIDE);ui_show(app.statusFilter,task?SW_SHOW:SW_HIDE);
 int x=U(side?20:48),y=U(8),dateW=app.filterSpec.period==1?205:112;
 if(task){
  ui_move(app.buttons[0],x,y,U(dateW),U(28));x+=U(dateW+6);
  for(int i=1;i<3;i++){ui_move(app.buttons[i],x,y,U(22),U(28));x+=U(25);}
  ui_move(app.buttons[3],x+U(6),y,U(52),U(28));ui_show(app.buttons[3],tw>U(570)?SW_SHOW:SW_HIDE);x+=U(72);
  for(int i=0;i<3;i++){ui_show(app.buttons[8+i],tw>U(690)?SW_SHOW:SW_HIDE);SetWindowTextW(app.buttons[8+i],i==0?L"日":i==1?L"周":L"月");ui_move(app.buttons[8+i],x+U(i*38),y,U(38),U(28));}
  int end=tw-U(85);ui_move(app.statusFilter,end-U(86),y,U(80),U(180));ui_move(app.mode,end-U(180),y,U(88),U(180));
  if(tw<U(600))ui_show(app.mode,SW_HIDE);
 }else{
  for(int i=0;i<3;i++)ui_show(app.buttons[8+i],app.page==2&&i<2?SW_SHOW:SW_HIDE);
  if(app.page==2){SetWindowTextW(app.buttons[8],L"活动项目");SetWindowTextW(app.buttons[9],L"已归档");ui_move(app.buttons[8],U(138),y,U(95),U(28));ui_move(app.buttons[9],U(235),y,U(85),U(28));}
 }
 ui_show(app.buttons[13],task?SW_HIDE:SW_SHOW);ui_move(app.buttons[13],x,y,U(110),U(28));SetWindowTextW(app.buttons[13],navNames[app.page]);
 ui_show(app.search,app.page==5?SW_SHOW:SW_HIDE);if(app.page==5)ui_move(app.search,U(145),y,min(U(520),max(U(90),tw-U(235))),U(28));
 ui_move(app.buttons[4],tw-U(75),y,U(30),U(28));ui_move(app.buttons[5],tw-U(39),y,U(28),U(28));
 ui_move(app.buttons[14],U(10),y,U(30),U(28));ui_show(app.buttons[14],side?SW_HIDE:SW_SHOW);
 int groupHeight=*app.group?U(34):0;ui_show(app.buttons[12],groupHeight?SW_SHOW:SW_HIDE);
 if(groupHeight){wchar_t*w=wide(app.group);wchar_t title[600];swprintf(title,600,L"‹  %s  ·  全部任务",w);free(w);SetWindowTextW(app.buttons[12],title);ui_move(app.buttons[12],side+U(20),U(GX_TOP+3),min(U(500),tw-U(40)),U(28));}
 ui_move(app.status,side+U(20),height-U(GX_FOOT),max(0,width-side-U(340)),U(GX_FOOT));
 ui_move(app.buttons[6],width-U(320),height-U(GX_FOOT)+U(2),U(260),U(28));ui_move(app.buttons[7],width-U(54),height-U(GX_FOOT)+U(2),U(38),U(28));ui_undo_update();
 int bx=side,top=U(GX_TOP)+groupHeight,bw=width-side-right,bh=height-top-U(GX_FOOT);
 int board=app.page==0&&!SendMessageW(app.mode,CB_GETCURSEL,0,0);
 int narrow=max(U(48),min(U(96),min(bw,bh)*16/100));
 int splitX=app.zoom>=0?(app.zoom%2? narrow:bw-narrow):bw/2,splitY=app.zoom>=0?(app.zoom/2?narrow:bh-narrow):bh/2;
 for(int q=0;q<4;q++){
  RECT cell={bx,top,bx+bw,top+bh};
  if(board){cell.left=bx+(q%2?splitX:0);cell.right=bx+(q%2?bw:splitX);cell.top=top+(q/2?splitY:0);cell.bottom=top+(q/2?bh:splitY);}
  app.boardCells[q]=cell;int visible=(app.page==0||app.page==5)&&!overlay&&(board||q==0);
  ui_show(headers[q],visible?SW_SHOW:SW_HIDE);int collapsed=board&&app.zoom>=0&&q!=app.zoom;ui_show(app.views[q].hwnd,visible&&!collapsed?SW_SHOW:SW_HIDE);if(!visible)continue;
  int margin=collapsed?U(5):U(board?20:30),hm=collapsed?U(5):U(10);
  ui_move(headers[q],cell.left+margin,cell.top+hm,max(0,cell.right-cell.left-2*margin),collapsed?max(U(28),cell.bottom-cell.top-2*hm):U(43));
  if(!collapsed){ui_move(app.views[q].hwnd,cell.left+margin,cell.top+U(56),max(0,cell.right-cell.left-2*margin),max(0,cell.bottom-cell.top-U(66)));RECT lr;GetClientRect(app.views[q].hwnd,&lr);ListView_SetColumnWidth(app.views[q].hwnd,0,max(0,lr.right-1));}
 }
 ui_catalog_layout(side,U(GX_TOP),bw,height-U(GX_TOP+GX_FOOT));if(overlay)ui_show(app.catalog,SW_HIDE);detail_layout();InvalidateRect(app.window,0,FALSE);InvalidateRect(app.topbar,0,FALSE);ui_update_end();
}
static void shell_paint(HWND h,HDC dc){
 RECT r;GetClientRect(h,&r);FillRect(dc,&r,app.page==6?app.background:app.white);
 int side=(GetWindowLongPtrW(app.sidebar,GWL_STYLE)&WS_VISIBLE)?U(GX_SIDE):0;
 HPEN pen=CreatePen(PS_SOLID,1,RGB(220,225,228));HGDIOBJ old=SelectObject(dc,pen);
 MoveToEx(dc,side,r.bottom-U(GX_FOOT),0);LineTo(dc,r.right,r.bottom-U(GX_FOOT));
 if(app.page==0&&!SendMessageW(app.mode,CB_GETCURSEL,0,0)&&!(app.editor&&r.right<U(1080))){
  MoveToEx(dc,app.boardCells[0].right,app.boardCells[0].top,0);LineTo(dc,app.boardCells[0].right,app.boardCells[2].bottom);
  MoveToEx(dc,side,app.boardCells[0].bottom,0);LineTo(dc,app.boardCells[1].right,app.boardCells[0].bottom);
 }
 SelectObject(dc,old);DeleteObject(pen);
 if(app.editor){RECT pane;GetWindowRect(app.editor->hwnd,&pane);MapWindowPoints(0,h,(POINT*)&pane,2);for(int i=0;i<5;i++){int shade=238+i*3;RECT s={pane.left-5+i,pane.top,pane.left-4+i,pane.bottom};HBRUSH b=CreateSolidBrush(RGB(shade,shade,shade));FillRect(dc,&s,b);DeleteObject(b);}}
 if(app.page==6){r.left=side+U(28);r.top=U(GX_TOP+25);r.right-=app.editor?U(GX_DRAWER):U(28);r.bottom-=U(GX_FOOT+25);ui_stats_paint(dc,r);}
}
void ui_undo_update(void){if(!app.buttons[6])return;Undo*u=0;int count=0;uint64_t tick=GetTickCount64();for(int i=0;i<app.undoCount;i++)if(app.undo[i].expires>tick){u=&app.undo[i];count++;}ui_show(app.buttons[6],u?SW_SHOW:SW_HIDE);ui_show(app.buttons[7],count>1?SW_SHOW:SW_HIDE);if(u){wchar_t*w=wide(u->label),s[220];swprintf(s,220,L"撤销 · %.55s  %d秒",w,(int)((u->expires-tick+999)/1000));free(w);SetWindowTextW(app.buttons[6],s);}}
static void undo_menu(void){HMENU menu=CreatePopupMenu();for(int i=app.undoCount-1;i>=0;i--)if(app.undo[i].expires>GetTickCount64()){wchar_t*w=wide(app.undo[i].label);AppendMenuW(menu,MF_STRING,1+i,w);free(w);}RECT r;GetWindowRect(app.buttons[7],&r);int choice=TrackPopupMenu(menu,TPM_RETURNCMD,r.left,r.top,0,app.window,0);DestroyMenu(menu);if(choice>0&&choice<=app.undoCount)undo_apply(&app.db,app.undo[choice-1].id);}
static void toolbar_menu(void){HMENU menu=CreatePopupMenu();const wchar_t*periods[]={L"日视图",L"周视图",L"月视图",L"全部日期"},*statuses[]={L"未完成",L"已完成",L"全部状态"};for(int i=0;i<4;i++)AppendMenuW(menu,MF_STRING|(SendMessageW(app.period,CB_GETCURSEL,0,0)==i?MF_CHECKED:0),10+i,periods[i]);AppendMenuW(menu,MF_SEPARATOR,0,0);for(int i=0;i<3;i++)AppendMenuW(menu,MF_STRING|(SendMessageW(app.statusFilter,CB_GETCURSEL,0,0)==i?MF_CHECKED:0),20+i,statuses[i]);AppendMenuW(menu,MF_SEPARATOR,0,0);AppendMenuW(menu,MF_STRING,30,L"四象限");AppendMenuW(menu,MF_STRING,31,L"时间轴");AppendMenuW(menu,MF_STRING,40,L"按时间排序");AppendMenuW(menu,MF_STRING,41,L"手动排序");AppendMenuW(menu,MF_STRING,51,L"返回上层 · Alt+←");AppendMenuW(menu,MF_STRING|(app.forwardDepth?0:MF_GRAYED),52,L"前进详情 · Alt+→");AppendMenuW(menu,MF_STRING,50,app.zoom>=0?L"返回四象限总览":L"放大当前象限");if(app.page==2){AppendMenuW(menu,MF_SEPARATOR,0,0);AppendMenuW(menu,MF_STRING|(app.archive==0?MF_CHECKED:0),70,L"活动项目");AppendMenuW(menu,MF_STRING|(app.archive==1?MF_CHECKED:0),71,L"已归档项目");}AppendMenuW(menu,MF_SEPARATOR,0,0);AppendMenuW(menu,MF_STRING,63,L"原生工作区 · Ctrl+Shift+W");AppendMenuW(menu,MF_STRING,60,L"立即同步");AppendMenuW(menu,MF_STRING,61,L"导出 JSON 备份");AppendMenuW(menu,MF_STRING,62,L"导入 JSON 备份");RECT r;GetWindowRect(app.buttons[5],&r);int a=TrackPopupMenu(menu,TPM_RETURNCMD,r.right,r.bottom,0,app.window,0);DestroyMenu(menu);if(a>=10&&a<14)SendMessageW(app.period,CB_SETCURSEL,a-10,0);else if(a>=20&&a<23)SendMessageW(app.statusFilter,CB_SETCURSEL,a-20,0);else if(a==30||a==31){SendMessageW(app.mode,CB_SETCURSEL,a-30,0);app.zoom=-1;}else if(a==40||a==41)SendMessageW(app.sort,CB_SETCURSEL,a-40,0);else if(a==51)ui_back();else if(a==52&&app.forwardDepth){char*k=app.forwardStack[--app.forwardDepth];ui_open(k,0,0,0);free(k);}else if(a==50)app.zoom=app.zoom>=0?-1:0;else if(a==70||a==71)app.archive=a-70;else if(a==63)ui_work_open();else if(a==60)ui_start_sync(1);else if(a==61||a==62)ui_file(a==62);if(a)ui_refresh(0);}
void ui_refresh(int reset){ui_work_changed();if(!app.ready)return;ui_drag_cancel();ui_update_begin(app.window);int64_t start=clock_us();char*query=ui_text(app.search);snprintf(app.filterSpec.query,sizeof(app.filterSpec.query),"%s",query);free(query);app.filterSpec.period=(int)SendMessageW(app.period,CB_GETCURSEL,0,0);app.filterSpec.status=(char)SendMessageW(app.statusFilter,CB_GETCURSEL,0,0);app.filterSpec.manual=(int)SendMessageW(app.sort,CB_GETCURSEL,0,0)==1;int board=app.page==0&&!SendMessageW(app.mode,CB_GETCURSEL,0,0);for(int q=0;q<4;q++){if(app.page>=6)continue;if(!board&&q)continue;Filter f=app.filterSpec;strcpy(f.kind,kinds[app.page]);f.quadrant=board?q:-1;f.archive=app.page==2?app.archive:-1;strcpy(f.groupKind,app.groupKind);strcpy(f.group,app.group);if(app.page==5){f.status=2;f.period=3;}if(app.page>0){f.period=3;f.status=2;}ui_view_bind(&app.views[q],&f);if(reset&&app.views[q].count)ListView_EnsureVisible(app.views[q].hwnd,0,FALSE);wchar_t title[700];if(board){const wchar_t*names[]={L"很重要 - 很紧急",L"重要 - 不紧急",L"不重要 - 紧急",L"不重要 - 不紧急"};swprintf(title,700,L"%s",names[q]);}else{wchar_t*group=wide(app.group);swprintf(title,700,L"%s%s%s",app.page==0?L"任务时间轴":navNames[app.page],*app.group?L" · ":L"",group);free(group);}SetWindowTextW(headers[q],title);}wchar_t label[80];date_label(label);SetWindowTextW(app.buttons[0],label);for(int i=0;i<10;i++)InvalidateRect(app.nav[i],0,FALSE);ui_catalog_refresh();ui_layout();app.refreshUs=clock_us()-start;if(*app.filterSpec.query)app.searchUs=app.refreshUs;ui_update_end();}
void ui_changed(const char*label){app.changedAt=GetTickCount64();ui_notice(label);if(app.syncEnabled&&app.autoSync)SetTimer(app.window,3,max(15000,(int)num(app.settings,"undoMs")),0);ui_refresh(0);ui_reminders_schedule();InvalidateRect(app.status,0,FALSE);}
static void free_forward(void){for(int i=0;i<app.forwardDepth;i++)free(app.forwardStack[i]);app.forwardDepth=0;}
static void free_stack(void){free_forward();for(int i=0;i<app.depth;i++)free(app.editorStack[i]);app.depth=0;}
int ui_navigate(int page){if(page!=1&&!ui_catalog_commit())return 0;if(page>=7){if(!detail_save(0))return 0;if(page==7)ui_sync_config();else if(page==8)ui_settings();else ui_account_dialog();return 1;}if(!detail_save(1))return 0;free_stack();app.page=page;app.zoom=-1;app.group[0]=app.groupKind[0]=0;app.sidebarOpen=0;ui_set(app.search,"");ui_refresh(1);return 1;}
void ui_open(const char*key,int q,const char*parent,int note){if(!ui_catalog_commit())return;char*next=key?_strdup(key):0;char*previous=app.editor?_strdup(app.editor->key):0;if(app.editor){J*target=next?db_row(&app.db,next):0;int child=!app.editor->note&&((target&&*str(get(target,"data"),"parentId")&&!strcmp(str(get(target,"data"),"parentId"),str(app.editor->data,"id")))||(parent&&*parent&&!strcmp(parent,str(app.editor->data,"id"))));int same=previous&&next&&!strcmp(previous,next);cJSON_Delete(target);if(!detail_save(1)){free(next);free(previous);return;}if(child&&previous&&next&&strcmp(previous,next)&&app.depth<64){free_forward();app.editorStack[app.depth++]=previous;}else{free(previous);if(!same)free_stack();}}int64_t start=clock_us();Detail*d=calloc(1,sizeof(*d));d->note=note;if(next){J*parts=cJSON_Parse(next);J*kind=cJSON_GetArrayItem(parts,0);d->note=cJSON_IsString(kind)&&!strcmp(kind->valuestring,"notes");cJSON_Delete(parts);J*r=db_row(&app.db,next);if(!r||truth(r,"deleted")){cJSON_Delete(r);free(next);free(d);ui_notice("记录已删除或不存在");return;}d->key=next;d->base=dup(get(r,"data"));d->data=dup(d->base);cJSON_Delete(r);}else{d->data=task_default(&app.db,q,parent);char start[32];snprintf(start,sizeof(start),"%sT09:00",app.filterSpec.date);ss(d->data,"start",start);if(parent&&*parent){char*k=make_key("tasks",parent);J*r=db_row(&app.db,k),*p=get(r,"data");if(p){ss(d->data,"start",str(p,"start"));ss(d->data,"project",str(p,"project"));ss(d->data,"place",str(p,"place"));set(d->data,"tags",dup(get(p,"tags")));set(d->data,"allDay",dup(get(p,"allDay")));sn(d->data,"quadrant",num(p,"quadrant"));}cJSON_Delete(r);free(k);}else if(!strcmp(app.groupKind,"project"))ss(d->data,"project",app.group);else if(!strcmp(app.groupKind,"place"))ss(d->data,"place",app.group);else if(!strcmp(app.groupKind,"tag"))cJSON_AddItemToArray(get(d->data,"tags"),cJSON_CreateString(app.group));if(note){J*j=cJSON_CreateObject();ss(j,"id",str(d->data,"id"));ss(j,"createdAt",str(d->data,"createdAt"));ss(j,"body","");cJSON_Delete(d->data);d->data=j;}d->key=make_key(note?"notes":"tasks",str(d->data,"id"));d->newRecord=1;}J*m=db_meta(&app.db);d->context=dup(get(m,"vector"));cJSON_Delete(m);ui_update_begin(app.window);app.editor=d;app.drawerWidth=GX_DRAWER;detail_create(d);ui_layout();ui_update_end();SetFocus(d->fields[0]);app.detailUs=clock_us()-start;}
int ui_close_detail(void){if(!detail_save(1))return 0;free_stack();return 1;}
void ui_back(void){if(app.editor){char*previous=_strdup(app.editor->key);if(!detail_save(1)){free(previous);return;}if(app.forwardDepth<64)app.forwardStack[app.forwardDepth++]=previous;else free(previous);if(app.depth){char*k=app.editorStack[--app.depth];ui_open(k,0,0,0);free(k);}return;}if(*app.group){int page=!strcmp(app.groupKind,"project")?2:!strcmp(app.groupKind,"place")?3:4;app.group[0]=app.groupKind[0]=0;app.page=page;ui_refresh(1);return;}if(app.zoom>=0){app.zoom=-1;ui_layout();return;}if(app.sidebarOpen){app.sidebarOpen=0;ui_layout();return;}if(app.page)ui_navigate(0);}
static void operate(const char*key,int action){char*k=_strdup(key);J*r=db_row(&app.db,k);if(!r){free(k);return;}J*parts=cJSON_Parse(k);int task=cJSON_IsString(cJSON_GetArrayItem(parts,0))&&!strcmp(cJSON_GetArrayItem(parts,0)->valuestring,"tasks");cJSON_Delete(parts);if(!task&&(action==2||action==4||action==5||action>=10&&action<14)){cJSON_Delete(r);free(k);return;}if(action==1)ui_open(k,(int)num(get(r,"data"),"quadrant"),0,!strcmp(app.views[0].filter.kind,"notes"));else if(action==2){undo_begin(truth(get(r,"data"),"done")?"恢复任务":"完成任务");int ok=task_complete(&app.db,k,!truth(get(r,"data"),"done"));undo_finish();if(ok)ui_changed("任务状态已保存");else ui_notice(app.db.error);}else if(action==3){if(MessageBoxW(app.window,L"删除此记录？任务会连同子任务删除。",L"删除",MB_OKCANCEL)==IDOK){undo_begin("删除记录");int ok=op_delete_entity(&app.db,k);undo_finish();if(ok){if(app.editor){J*current=db_row(&app.db,app.editor->key);if(!current||truth(current,"deleted"))detail_destroy();cJSON_Delete(current);}ui_changed("记录已删除");}}}else if(action==4||action==5){undo_begin("任务顺序");int ok=op_step(&app.db,k,action==4?-1:1);undo_finish();if(ok){SendMessageW(app.sort,CB_SETCURSEL,1,0);ui_changed("任务顺序已保存");}}else if(action>=10&&action<14){undo_begin("移动象限");int ok=op_move(&app.db,k,action-10,0);undo_finish();if(ok){SendMessageW(app.sort,CB_SETCURSEL,1,0);ui_changed("任务位置已保存");}}cJSON_Delete(r);free(k);}
void ui_menu(const char*key,POINT p){J*parts=cJSON_Parse(key);int isTask=cJSON_IsString(cJSON_GetArrayItem(parts,0))&&!strcmp(cJSON_GetArrayItem(parts,0)->valuestring,"tasks");cJSON_Delete(parts);if(isTask){if(app.editor&&!detail_save(0))return;J*row=db_row(&app.db,key);if(!row||truth(row,"deleted")){cJSON_Delete(row);return;}int action=ui_task_menu(key,get(row,"data"));cJSON_Delete(row);if(action)operate(key,action);return;}J*r=db_row(&app.db,key),*v=get(r,"data");J*kind=cJSON_Parse(key);const char*k=cJSON_GetArrayItem(kind,0)->valuestring;HMENU menu=CreatePopupMenu();int task=!strcmp(k,"tasks"),category=!strcmp(k,"projects")||!strcmp(k,"tags")||!strcmp(k,"places");AppendMenuW(menu,MF_STRING,1,category?L"编辑分类":L"编辑详情");if(task){AppendMenuW(menu,MF_STRING,2,truth(v,"done")?L"重新打开任务":L"完成任务");AppendMenuW(menu,MF_SEPARATOR,0,0);AppendMenuW(menu,MF_STRING,4,L"上移一位");AppendMenuW(menu,MF_STRING,5,L"下移一位");const wchar_t*n[]={L"移到 很重要-很紧急",L"移到 重要-不紧急",L"移到 不重要-紧急",L"移到 不重要-不紧急"};for(int i=0;i<4;i++)AppendMenuW(menu,MF_STRING,10+i,n[i]);}if(!strcmp(k,"projects"))AppendMenuW(menu,MF_STRING,20,truth(v,"archived")?L"取消归档":L"归档项目");AppendMenuW(menu,MF_STRING,3,L"删除");int action=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_RIGHTBUTTON,p.x,p.y,0,app.window,0);DestroyMenu(menu);if(action==1&&category)ui_category_edit(key,k);else if(action==20){J*t=dup(v);set(t,"archived",cJSON_CreateBool(!truth(t,"archived")));undo_begin("项目归档");op_category(&app.db,key,k,t);undo_finish();cJSON_Delete(t);ui_changed("项目已更新");}else if(action)operate(key,action);cJSON_Delete(r);cJSON_Delete(kind);}
static DWORD WINAPI sync_thread(LPVOID p){SyncJob*j=p;if(db_open(&j->db,j->dir)){j->ok=sync_run(&j->db,&j->up,&j->down,&j->more);snprintf(j->error,sizeof(j->error),"%s",j->db.error);db_close(&j->db);}else snprintf(j->error,sizeof(j->error),"%s",j->db.error);PostMessageW(j->host,GX_RESULT,0,(LPARAM)j);return 0;}
void ui_start_sync(int manual){
#ifdef GX_D404_CANDIDATE
KillTimer(app.window,3);if(manual)ui_notice("隔离候选版未开放真实远端同步。");return;
#endif
KillTimer(app.window,3);if(app.sync)return;if(!app.syncEnabled){if(manual)ui_sync_config();return;}if(!manual&&(IsIconic(app.window)||!IsWindowVisible(app.window)))return;SyncJob*j=calloc(1,sizeof(*j));wcscpy(j->dir,app.db.dir);j->host=app.window;app.sync=j;ui_notice("正在同步…  可以继续编辑");j->thread=CreateThread(0,0,sync_thread,j,0,0);if(!j->thread){free(j);app.sync=0;ui_notice("无法启动同步");}}
void ui_row_menu_open(View*v,int item){Cached*c=ui_view_get(v,item);if(!c)return;char*key=_strdup(c->key);int child=app.editor&&v==&app.editor->children;if(child&&!detail_save(0)){free(key);return;}RECT r;ListView_GetItemRect(v->hwnd,item,&r,LVIR_BOUNDS);RECT client;GetClientRect(v->hwnd,&client);POINT p={client.right-U(GX_MENU_WIDTH),r.bottom};ClientToScreen(v->hwnd,&p);ui_menu(key,p);free(key);if(child&&app.editor)detail_reload_children();}
static void row_click(View*v,int index,int x,int doubleClick){RECT row;if(ListView_GetItemRect(v->hwnd,index,&row,LVIR_BOUNDS)){POINT p={x,(row.top+row.bottom)/2};if(ui_row_menu_hit(v,index,p)){ui_row_menu_open(v,index);return;}}Cached*c=ui_view_get(v,index);if(!c)return;char*k=_strdup(c->key);J*t=dup(c->data);J*parts=cJSON_Parse(k);const char*kind=cJSON_GetArrayItem(parts,0)->valuestring;if(!strcmp(kind,"tasks")){if(x<U(GX_CHECKBOX_END))operate(k,2);else ui_open(k,(int)num(t,"quadrant"),0,0);}else if(!strcmp(kind,"notes"))ui_open(k,0,0,1);else{snprintf(app.group,sizeof(app.group),"%s",str(t,"name"));snprintf(app.groupKind,sizeof(app.groupKind),"%s",!strcmp(kind,"projects")?"project":!strcmp(kind,"places")?"place":"tag");if(!detail_save(1)){free(k);cJSON_Delete(t);cJSON_Delete(parts);return;}app.page=0;SendMessageW(app.mode,CB_SETCURSEL,1,0);SendMessageW(app.period,CB_SETCURSEL,3,0);SendMessageW(app.statusFilter,CB_SETCURSEL,2,0);ui_refresh(1);}free(k);cJSON_Delete(t);cJSON_Delete(parts);}
void ui_entity_open(const char*key){J*parts=cJSON_Parse(key);const char*kind=cJSON_GetArrayItem(parts,0)->valuestring;if(!strcmp(kind,"notes"))ui_open(key,0,0,1);else{J*r=db_row(&app.db,key);if(r&&!truth(r,"deleted")&&detail_save(1)){snprintf(app.group,sizeof(app.group),"%s",str(get(r,"data"),"name"));snprintf(app.groupKind,sizeof(app.groupKind),"%s",!strcmp(kind,"projects")?"project":!strcmp(kind,"places")?"place":"tag");app.page=0;SendMessageW(app.mode,CB_SETCURSEL,1,0);SendMessageW(app.period,CB_SETCURSEL,3,0);SendMessageW(app.statusFilter,CB_SETCURSEL,2,0);ui_refresh(1);}cJSON_Delete(r);}cJSON_Delete(parts);}
static View*view_from(HWND hwnd){for(int i=0;i<4;i++)if(app.views[i].hwnd==hwnd)return &app.views[i];if(app.editor&&app.editor->children.hwnd==hwnd)return &app.editor->children;return 0;}
void ui_list_render(HWND h,HDC dc){View*v=view_from(h);if(!v)return;RECT client;GetClientRect(h,&client);FillRect(dc,&client,app.white);int first=ListView_GetTopIndex(h),last=min(v->count,first+ListView_GetCountPerPage(h)+2);for(int i=first;i<last;i++){NMLVCUSTOMDRAW d={0};d.nmcd.hdc=dc;d.nmcd.dwItemSpec=i;if(!ListView_GetItemRect(h,i,&d.nmcd.rc,LVIR_BOUNDS))continue;ui_draw_row(&d,v);}ui_drag_paint(h,dc);}
/* A task press owns capture until release. Long-press and auto-scroll timers
   only run while a press/drag is active. All drops use the same resolver. */
static int suppressClick,dragHandle,dragMenu,dragMoved,startTop,cancelledPress;
static View*dragTarget;static int dragBefore=-1,dragQuadrant=-1,sourceQuadrant;
static char sourceParent[801];static POINT dragPoint;
int suppress_child_click(void){int n=suppressClick;suppressClick=0;return n;}
static int point_in_window(HWND h,POINT p){
 if(!h||!IsWindowVisible(h))return 0;
 for(HWND c=h;c&&c!=app.window;c=GetParent(c)){
  RECT r;GetClientRect(c,&r);MapWindowPoints(c,0,(POINT*)&r,2);
  if(!PtInRect(&r,p))return 0;
 }
 return 1;
}
static void drag_marker(View*v,int index,int q){
 if(dragTarget==v&&dragBefore==index&&dragQuadrant==q)return;
 if(dragTarget){RemovePropW(dragTarget->hwnd,L"GxDropIndex");InvalidateRect(dragTarget->hwnd,0,FALSE);}
 for(int i=0;i<4;i++){RemovePropW(headers[i],L"GxDropTarget");InvalidateRect(headers[i],0,FALSE);}
 dragTarget=v;dragBefore=index;dragQuadrant=q;
 if(v){SetPropW(v->hwnd,L"GxDropIndex",(HANDLE)(INT_PTR)(index+1));InvalidateRect(v->hwnd,0,FALSE);
  if(q>=0&&q<4&&v==&app.views[q]){SetPropW(headers[q],L"GxDropTarget",(HANDLE)1);InvalidateRect(headers[q],0,FALSE);}}
}
int ui_drag_cancel(void){
 int had=pendingDrag!=0||app.dragging;HWND source=app.dragSource;
 if(source){KillTimer(source,7);KillTimer(source,8);RemovePropW(source,L"GxDraggingRow");InvalidateRect(source,0,FALSE);}
 if(had)cancelledPress=1;if(app.dragging)suppressClick=1;
 app.dragging=0;app.dragSource=0;free(pendingDrag);pendingDrag=0;dragHandle=dragMenu=dragMoved=0;
 drag_marker(0,-1,-1);if(source&&GetCapture()==source)ReleaseCapture();if(had)SetCursor(LoadCursorW(0,IDC_ARROW));return had;
}
static View*drop_view(POINT p){
 RECT root;GetClientRect(app.window,&root);MapWindowPoints(app.window,0,(POINT*)&root,2);
 if(!PtInRect(&root,p))return 0;
 HWND under=WindowFromPoint(p);if(under&&GetAncestor(under,GA_ROOT)!=app.window)return 0;
 if(app.editor&&point_in_window(app.editor->children.hwnd,p))return &app.editor->children;
 for(int i=0;i<4;i++)if(point_in_window(app.views[i].hwnd,p))return &app.views[i];
 int board=app.page==0&&!SendMessageW(app.mode,CB_GETCURSEL,0,0);
 if(board){POINT client=p;ScreenToClient(app.window,&client);
  for(int i=0;i<4;i++)if(IsWindowVisible(headers[i])&&PtInRect(&app.boardCells[i],client))return &app.views[i];}
 else if(IsWindowVisible(headers[0])&&point_in_window(headers[0],p))return &app.views[0];
 return 0;
}
static int drop_resolve(POINT screen,View**out,int*position,int*quadrant){
 View*v=drop_view(screen);if(!v||strcmp(v->filter.kind,"tasks"))return 0;
 if(*v->filter.parent){if(strcmp(v->filter.parent,sourceParent))return 0;}
 else if(*sourceParent&&v->hwnd!=app.dragSource)return 0;
 int q=v->filter.quadrant>=0?v->filter.quadrant:sourceQuadrant;
 POINT p=screen;ScreenToClient(v->hwnd,&p);RECT r;GetClientRect(v->hwnd,&r);int index=v->count;
 if(!IsWindowVisible(v->hwnd)||p.y<0)index=0;
 else if(p.y<r.bottom){LVHITTESTINFO hit={0};hit.pt=p;int row=ListView_HitTest(v->hwnd,&hit);
  if(row>=0){RECT item;ListView_GetItemRect(v->hwnd,row,&item,LVIR_BOUNDS);index=row+(p.y>=(item.top+item.bottom)/2);}
  else if(p.y<U(8))index=ListView_GetTopIndex(v->hwnd);}
 /* Skip the source row. Reject anchors from another level or, in a timeline,
    another priority; changing priority requires a quadrant drop. */
 while(index<v->count){Cached*c=ui_view_get(v,index);if(!c)return 0;if(!strcmp(c->key,pendingDrag)){index++;continue;}
  if(strcmp(str(c->data,"parentId"),sourceParent)||(!*sourceParent&&(int)num(c->data,"quadrant")!=q))return 0;break;}
 *out=v;*position=index;*quadrant=q;return 1;
}
static void drag_update(int scroll){
 View*v=0;int index=-1,q=-1;
 if(!drop_resolve(dragPoint,&v,&index,&q)){drag_marker(0,-1,-1);SetCursor(LoadCursorW(0,IDC_NO));return;}
 if(scroll&&point_in_window(v->hwnd,dragPoint)){
  POINT p=dragPoint;ScreenToClient(v->hwnd,&p);RECT r;GetClientRect(v->hwnd,&r);
  int direction=p.y<U(24)?-1:p.y>=r.bottom-U(24)?1:0;
  if(direction&&v->count>ListView_GetCountPerPage(v->hwnd)){
   ListView_Scroll(v->hwnd,0,direction*U(GX_ROW_HEIGHT));drop_resolve(dragPoint,&v,&index,&q);
  }
 }
 drag_marker(v,index,q);SetCursor(LoadCursorW(0,IDC_SIZEALL));
}
static void drag_begin(void){
 if(!pendingDrag||app.dragging)return;app.dragging=1;suppressClick=1;
 KillTimer(app.dragSource,7);SetPropW(app.dragSource,L"GxDraggingRow",(HANDLE)(INT_PTR)(pointerIndex+1));
 InvalidateRect(app.dragSource,0,FALSE);SetTimer(app.dragSource,8,150,0);drag_update(0);
}
static void finish_drag(POINT p){
 View*v=0;int index=-1,q=-1;int valid=app.dragging&&drop_resolve(p,&v,&index,&q);
 char*key=pendingDrag?_strdup(pendingDrag):0,*before=0;
 if(valid){Cached*c=ui_view_get(v,index);if(c)before=_strdup(c->key);}
 ui_drag_cancel();suppressClick=1;
 if(valid&&key){undo_begin("拖动任务");int ok=op_move(&app.db,key,q,before);undo_finish();
  if(ok){SendMessageW(app.sort,CB_SETCURSEL,1,0);ui_changed("任务位置已保存");if(app.editor)detail_reload_children();}
  else ui_notice(app.db.error);}
 free(key);free(before);
}
void ui_drag_paint(HWND h,HDC dc){
 if(!GetPropW(h,L"GxDropIndex"))return;View*v=view_from(h);if(!v)return;
 int index=(int)(INT_PTR)GetPropW(h,L"GxDropIndex")-1;RECT r;GetClientRect(h,&r);int y=U(6);
 if(v->count){RECT item;if(index<v->count){if(!ListView_GetItemRect(h,index,&item,LVIR_BOUNDS))return;y=item.top;}
  else{if(!ListView_GetItemRect(h,v->count-1,&item,LVIR_BOUNDS))return;y=item.bottom;}}
 y=max(1,min(r.bottom-U(3),y));
 HBRUSH b=CreateSolidBrush(ui_quadrant_color(dragQuadrant));RECT line={U(2),y,r.right-U(2),y+U(3)};FillRect(dc,&line,b);DeleteObject(b);
}
static void invalidate_row(HWND h,int index){RECT row,client;if(index>=0&&ListView_GetItemRect(h,index,&row,LVIR_BOUNDS)){GetClientRect(h,&client);row.right=client.right;InvalidateRect(h,&row,FALSE);}}
static void list_cursor(View*v,POINT p){
 if(app.dragging){SetCursor(LoadCursorW(0,IDC_SIZEALL));return;}
 LVHITTESTINFO hit={0};hit.pt=p;int index=ListView_HitTest(v->hwnd,&hit);int hand=0;
 if(index>=0&&p.x>=0&&p.x<U(GX_HANDLE_WIDTH)){Cached*c=ui_view_get(v,index);hand=c&&cJSON_IsNumber(get(c->data,"quadrant"));}
 SetCursor(LoadCursorW(0,hand?IDC_HAND:IDC_ARROW));
}
static LRESULT CALLBACK list_proc(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 View*v=(View*)ref;int child=app.editor&&v==&app.editor->children;
 if(m==WM_SETCURSOR&&LOWORD(l)==HTCLIENT){POINT p;GetCursorPos(&p);ScreenToClient(h,&p);list_cursor(v,p);return TRUE;}
 if(m==WM_MOUSEMOVE&&!(w&MK_LBUTTON)){
  if(pendingDrag&&app.dragSource==h)ui_drag_cancel();
  LVHITTESTINFO hit={0};hit.pt.x=GET_X_LPARAM(l);hit.pt.y=GET_Y_LPARAM(l);int row=ListView_HitTest(h,&hit);list_cursor(v,hit.pt);
  int oldRow=(int)(INT_PTR)GetPropW(h,L"GxHotRow")-1;if(oldRow!=row){SetPropW(h,L"GxHotRow",(HANDLE)(INT_PTR)(row+1));invalidate_row(h,oldRow);invalidate_row(h,row);}
  TRACKMOUSEEVENT t={sizeof(t),TME_LEAVE,h,0};TrackMouseEvent(&t);
 }
 if(m==WM_MOUSELEAVE){int row=(int)(INT_PTR)GetPropW(h,L"GxHotRow")-1;RemovePropW(h,L"GxHotRow");invalidate_row(h,row);if(!app.dragging)SetCursor(LoadCursorW(0,IDC_ARROW));}
 if(m==WM_LBUTTONDOWN||m==WM_LBUTTONDBLCLK){
  ui_drag_cancel();suppressClick=cancelledPress=0;LVHITTESTINFO hit={0};hit.pt.x=GET_X_LPARAM(l);hit.pt.y=GET_Y_LPARAM(l);
  pointerIndex=ListView_HitTest(h,&hit);pointerQ=v->quadrant;pointerDown=hit.pt;dragPoint=hit.pt;ClientToScreen(h,&dragPoint);
  startTop=ListView_GetTopIndex(h);app.dragAt=GetTickCount64();Cached*c=ui_view_get(v,pointerIndex);
  if(c&&cJSON_IsNumber(get(c->data,"quadrant"))){pendingDrag=_strdup(c->key);app.dragSource=h;
   sourceQuadrant=(int)num(c->data,"quadrant");snprintf(sourceParent,sizeof(sourceParent),"%s",str(c->data,"parentId"));dragHandle=hit.pt.x<U(GX_HANDLE_WIDTH);dragMenu=ui_row_menu_hit(v,pointerIndex,hit.pt);}
  if(pendingDrag&&app.dragSource==h){
   /* The native report list tracks WM_LBUTTONDOWN in a nested loop. Own task
      presses here so capture, long-press and release share one event path. */
   SetFocus(h);ListView_SetItemState(h,pointerIndex,LVIS_SELECTED|LVIS_FOCUSED,LVIS_SELECTED|LVIS_FOCUSED);SetCapture(h);
   if(!dragHandle&&!dragMenu&&hit.pt.x>=U(GX_CHECKBOX_END)){double setting=num(app.settings,"longPressMs");int wait=isfinite(setting)?max(300,min(10000,(int)setting)):3000;SetTimer(h,7,wait,0);}return 0;}
  if(pointerIndex<0)return 0;return DefSubclassProc(h,m,w,l);
 }
 if(m==WM_MOUSEMOVE&&pendingDrag&&app.dragSource==h&&(w&MK_LBUTTON)){
  int dx=GET_X_LPARAM(l)-pointerDown.x,dy=GET_Y_LPARAM(l)-pointerDown.y;
  dragPoint.x=GET_X_LPARAM(l);dragPoint.y=GET_Y_LPARAM(l);ClientToScreen(h,&dragPoint);
  if(!dragMenu&&dragHandle&&(abs(dx)>U(4)||abs(dy)>U(4)))drag_begin();
  if(app.dragging){drag_update(0);return 0;}
  if(abs(dx)>U(10)||abs(dy)>U(10)){dragMoved=1;KillTimer(h,7);}return 0;
 }
 if(m==WM_TIMER&&app.dragSource==h){
  if(w==7){KillTimer(h,7);if(pendingDrag&&!dragMenu&&!dragMoved&&GetCapture()==h)drag_begin();return 0;}
  if(w==8){if(app.dragging)drag_update(1);else KillTimer(h,8);return 0;}
 }
 if(m==WM_LBUTTONUP){
  POINT p={GET_X_LPARAM(l),GET_Y_LPARAM(l)};ClientToScreen(h,&p);
  int dx=GET_X_LPARAM(l)-pointerDown.x,dy=GET_Y_LPARAM(l)-pointerDown.y;
  if(app.dragSource==h&&app.dragging&&pendingDrag){finish_drag(p);cancelledPress=0;return 0;}
  if(cancelledPress){cancelledPress=0;return 0;}
  if(!child&&!app.editor&&app.page==0&&abs(dy)>U(90)&&abs(dx)<U(45)){
   int at=ListView_GetTopIndex(h),visible=ListView_GetCountPerPage(h);
   if(dy>0&&startTop==0&&at==0||dy<0&&startTop+visible>=v->count&&at+visible>=v->count){ui_drag_cancel();suppressClick=1;date_shift(dy<0?1:-1);return 0;}}
  if(pendingDrag&&!dragMenu&&abs(dx)>U(75)&&abs(dy)<U(40)&&!child){char*k=_strdup(pendingDrag);ui_drag_cancel();suppressClick=1;
   if(dx<0&&truth(app.settings,"swipeMenu"))ui_menu(k,p);else if(dx>0&&truth(app.settings,"swipeComplete"))operate(k,2);free(k);return 0;}
  if(pendingDrag&&app.dragSource==h){
   int handle=dragHandle,menu=dragMenu,index=pointerIndex;LVHITTESTINFO hit={0};hit.pt.x=GET_X_LPARAM(l);hit.pt.y=GET_Y_LPARAM(l);
   int tap=!dragMoved&&ListView_HitTest(h,&hit)==index&&(!menu||ui_row_menu_hit(v,index,hit.pt));ui_drag_cancel();cancelledPress=0;
   if(!handle&&tap){suppressClick=0;NMITEMACTIVATE click={0};click.hdr.hwndFrom=h;click.hdr.idFrom=GetDlgCtrlID(h);click.hdr.code=NM_CLICK;click.iItem=index;click.ptAction=hit.pt;SendMessageW(GetParent(h),WM_NOTIFY,click.hdr.idFrom,(LPARAM)&click);}
   else suppressClick=1;return 0;}
  if(pointerIndex<0)return 0;return DefSubclassProc(h,m,w,l);
 }
 if((m==WM_CAPTURECHANGED||m==WM_CANCELMODE)&&app.dragSource==h)ui_drag_cancel();
 if(m==WM_KEYDOWN){
  if(w==VK_ESCAPE&&ui_drag_cancel())return 0;
  int index=ListView_GetNextItem(h,-1,LVNI_SELECTED);Cached*c=ui_view_get(v,index);
  if(c){char*k=_strdup(c->key);if(w==VK_RETURN){row_click(v,index,U(45),1);free(k);return 0;}
   if(w==VK_SPACE){operate(k,2);if(child)detail_reload_children();free(k);return 0;}
   if(w==VK_DELETE){operate(k,3);free(k);return 0;}
   if((w==VK_UP||w==VK_DOWN)&&(GetKeyState(VK_CONTROL)&0x8000)){operate(k,w==VK_UP?4:5);if(child)detail_reload_children();free(k);return 0;}free(k);}
  if(w==VK_ESCAPE){ui_back();return 0;}
 }
 if(m==WM_PAINT){LRESULT result=DefSubclassProc(h,m,w,l);if(GetPropW(h,L"GxDropIndex")){HDC dc=GetDC(h);ui_drag_paint(h,dc);ReleaseDC(h,dc);}return result;}
 if(m==WM_NCDESTROY){if(app.dragSource==h)ui_drag_cancel();RemoveWindowSubclass(h,list_proc,id);}
 return DefSubclassProc(h,m,w,l);
}
void ui_attach_list(View*v){SetWindowLongPtrW(v->hwnd,GWL_STYLE,GetWindowLongPtrW(v->hwnd,GWL_STYLE)|LVS_SHAREIMAGELISTS);ListView_SetImageList(v->hwnd,rowImages,LVSIL_SMALL);SetWindowSubclass(v->hwnd,list_proc,1,(DWORD_PTR)v);}
static LRESULT CALLBACK top_proc(HWND h,UINT m,WPARAM w,LPARAM l){if(m==WM_ERASEBKGND)return 1;if(m==WM_PAINT||m==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;int saved=ui_paint_begin(h,dc);RECT r;GetClientRect(h,&r);FillRect(dc,&r,app.white);RECT line={0,r.bottom-1,r.right,r.bottom};HBRUSH b=CreateSolidBrush(RGB(221,226,229));FillRect(dc,&line,b);DeleteObject(b);ui_fields_paint(h,dc);RestoreDC(dc,saved);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}if(m==WM_COMMAND){SendMessageW(app.window,m,w,l);return 0;}if(m==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}if(m==WM_CTLCOLOREDIT||m==WM_CTLCOLORSTATIC){SetTextColor((HDC)w,RGB(91,104,111));SetBkColor((HDC)w,RGB(255,255,255));return (LRESULT)app.white;}return DefWindowProcW(h,m,w,l);}
static LRESULT CALLBACK side_proc(HWND h,UINT m,WPARAM w,LPARAM l){if(m==WM_ERASEBKGND)return 1;if(m==WM_PAINT||m==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;int saved=ui_paint_begin(h,dc);RECT r;GetClientRect(h,&r);FillRect(dc,&r,app.side);RestoreDC(dc,saved);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}if(m==WM_COMMAND){SendMessageW(app.window,m,w,l);return 0;}if(m==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}return DefWindowProcW(h,m,w,l);}
static void create(HWND h){app.window=h;storage_set_window_root(h,app.baseDir);WNDCLASSW wc={0};wc.hInstance=app.instance;wc.lpfnWndProc=side_proc;wc.hbrBackground=app.side;wc.lpszClassName=L"GxSide";RegisterClassW(&wc);wc.lpfnWndProc=top_proc;wc.hbrBackground=app.white;wc.lpszClassName=L"GxTop";RegisterClassW(&wc);app.sidebar=CreateWindowW(L"GxSide",L"",WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN|WS_CLIPSIBLINGS,0,0,0,0,h,0,app.instance,0);app.topbar=CreateWindowW(L"GxTop",L"",WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN|WS_CLIPSIBLINGS,0,0,0,0,h,0,app.instance,0);for(int i=0;i<10;i++)app.nav[i]=ui_control(app.sidebar,L"BUTTON",navNames[i],0,700+i,0,0,92,48);J*a;cJSON_ArrayForEach(a,get(app.registry,"accounts"))if(!strcmp(str(a,"id"),str(app.registry,"activeId")))ui_set(app.nav[9],str(a,"name"));app.buttons[0]=ui_control(app.topbar,L"BUTTON",L"",0,106,10,10,158,30);app.buttons[1]=ui_control(app.topbar,L"BUTTON",L"‹",0,107,174,10,27,30);app.buttons[2]=ui_control(app.topbar,L"BUTTON",L"›",0,108,207,10,27,30);app.buttons[3]=ui_control(app.topbar,L"BUTTON",L"今天",0,109,245,10,55,30);app.period=ui_control(app.topbar,L"COMBOBOX",L"",CBS_DROPDOWNLIST|WS_TABSTOP,105,310,10,68,180);const wchar_t*periods[]={L"日",L"周",L"月",L"全部"};for(int i=0;i<4;i++)SendMessageW(app.period,CB_ADDSTRING,0,(LPARAM)periods[i]);SendMessageW(app.period,CB_SETCURSEL,0,0);app.mode=ui_control(app.topbar,L"COMBOBOX",L"",CBS_DROPDOWNLIST|WS_TABSTOP,120,391,10,83,150);SendMessageW(app.mode,CB_ADDSTRING,0,(LPARAM)L"四象限");SendMessageW(app.mode,CB_ADDSTRING,0,(LPARAM)L"时间轴");SendMessageW(app.mode,CB_SETCURSEL,0,0);app.statusFilter=ui_control(app.topbar,L"COMBOBOX",L"",CBS_DROPDOWNLIST|WS_TABSTOP,104,484,10,80,150);const wchar_t*statuses[]={L"未完成",L"已完成",L"全部"};for(int i=0;i<3;i++)SendMessageW(app.statusFilter,CB_ADDSTRING,0,(LPARAM)statuses[i]);SendMessageW(app.statusFilter,CB_SETCURSEL,0,0);app.sort=ui_control(app.topbar,L"COMBOBOX",L"",CBS_DROPDOWNLIST|WS_TABSTOP,121,574,10,80,150);SendMessageW(app.sort,CB_ADDSTRING,0,(LPARAM)L"按时间");SendMessageW(app.sort,CB_ADDSTRING,0,(LPARAM)L"手动排序");SendMessageW(app.sort,CB_SETCURSEL,1,0);app.search=ui_control(app.topbar,L"EDIT",L"",ES_AUTOHSCROLL|WS_TABSTOP,103,670,10,185,30);SendMessageW(app.search,EM_SETCUEBANNER,TRUE,(LPARAM)L"搜索关键词，空格分隔");app.buttons[4]=ui_control(app.topbar,L"BUTTON",L"＋",0,100,866,10,30,30);app.buttons[5]=ui_control(app.topbar,L"BUTTON",L"⋯",0,123,0,0,32,30);app.buttons[6]=ui_control(h,L"BUTTON",L"撤销",0,124,0,0,0,0);app.buttons[7]=ui_control(h,L"BUTTON",L"⋯",0,125,0,0,0,0);for(int i=0;i<3;i++)app.buttons[8+i]=ui_control(app.topbar,L"BUTTON",L"",WS_TABSTOP,140+i,0,0,38,28);app.buttons[12]=ui_control(h,L"BUTTON",L"",0,144,0,0,0,0);app.buttons[13]=ui_control(app.topbar,L"BUTTON",L"",0,145,0,0,110,28);app.buttons[14]=ui_control(app.topbar,L"BUTTON",L"☰",0,122,0,0,30,30);for(int q=0;q<4;q++){headers[q]=ui_control(h,L"BUTTON",L"",0,2000+q,0,0,0,0);View*v=&app.views[q];v->quadrant=q;v->hwnd=CreateWindowExW(0,WC_LISTVIEWW,L"",WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|WS_TABSTOP|LVS_REPORT|LVS_OWNERDATA|LVS_SINGLESEL|LVS_NOCOLUMNHEADER|LVS_SHOWSELALWAYS|LVS_SHAREIMAGELISTS,0,0,0,0,h,(HMENU)(INT_PTR)(1000+q),app.instance,0);ListView_SetExtendedListViewStyle(v->hwnd,LVS_EX_DOUBLEBUFFER|LVS_EX_FULLROWSELECT);SetWindowTheme(v->hwnd,L"Explorer",0);SendMessageW(v->hwnd,WM_SETFONT,(WPARAM)app.font,TRUE);LVCOLUMNW column={LVCF_WIDTH};column.cx=400;ListView_InsertColumn(v->hwnd,0,&column);ListView_SetImageList(v->hwnd,rowImages,LVSIL_SMALL);SetWindowSubclass(v->hwnd,list_proc,1,(DWORD_PTR)v);}app.status=ui_control(h,L"STATIC",L"本地已保存",SS_LEFT,130,0,0,0,0);ui_catalog_init();app.ready=1;ui_refresh(1);ui_reminders_schedule();if(app.autoSync&&app.syncEnabled)SetTimer(h,3,2000,0);}
static LRESULT CALLBACK main_proc(HWND h,UINT m,WPARAM w,LPARAM l){if(m==WM_ERASEBKGND)return 1;if(m==WM_LBUTTONDBLCLK)return 0;if(m==WM_CREATE){create(h);return 0;}if(m==WM_SIZE){ui_layout();return 0;}if(m==WM_LBUTTONDOWN){pointerDown.x=GET_X_LPARAM(l);pointerDown.y=GET_Y_LPARAM(l);return 0;}if(m==WM_LBUTTONUP){int dx=GET_X_LPARAM(l)-pointerDown.x,dy=GET_Y_LPARAM(l)-pointerDown.y;if(abs(dx)>U(80)&&abs(dy)<U(45)){if(app.editor&&dx>0)ui_back();else if(dx>0){app.sidebarOpen=1;ui_layout();}else if(app.sidebarOpen){app.sidebarOpen=0;ui_layout();}}return 0;}if(m==WM_GETMINMAXINFO){((MINMAXINFO*)l)->ptMinTrackSize.x=U(680);((MINMAXINFO*)l)->ptMinTrackSize.y=U(500);return 0;}if(m==WM_COMMAND){int id=LOWORD(w),code=HIWORD(w);if(id>=700&&id<710){ui_navigate(id-700);return 0;}if(id>=2000&&id<2004){int q=id-2000;POINT click={GET_X_LPARAM(GetMessagePos()),GET_Y_LPARAM(GetMessagePos())};ScreenToClient(headers[q],&click);if(app.page==0&&app.zoom==q&&click.x<U(45)){app.zoom=-1;ui_refresh(0);}else if(app.page==0&&app.zoom>=0&&q!=app.zoom){app.zoom=q;ui_refresh(0);}else if(app.page==0)ui_open(0,q,0,0);else if(app.page==1)ui_open(0,0,0,1);else if(app.page>=2&&app.page<=4)ui_category_edit(0,kinds[app.page]);return 0;}if(id>=140&&id<=142){if(app.page==2){app.archive=id-140;}else{SendMessageW(app.period,CB_SETCURSEL,id-140,0);}ui_refresh(1);return 0;}if(id==144){ui_back();return 0;}if(id==123){toolbar_menu();return 0;}if(id==125){undo_menu();return 0;}if(id==124){for(int i=app.undoCount-1;i>=0;i--)if(app.undo[i].expires>GetTickCount64()){undo_apply(&app.db,app.undo[i].id);break;}return 0;}if(id==100){if(app.page>=2&&app.page<=4)ui_category_edit(0,kinds[app.page]);else ui_open(0,0,0,app.page==1);return 0;}if(id==103&&code==EN_CHANGE){SetTimer(h,2,180,0);return 0;}if((id==104||id==105||id==120||id==121)&&code==CBN_SELCHANGE){ui_refresh(1);return 0;}if(id==107||id==108){date_shift(id==107?-1:1);return 0;}if(id==109){char s[32];format_ms(wall_ms(),s);memcpy(app.filterSpec.date,s,10);ui_refresh(1);return 0;}if(id==106){HWND temp=CreateWindowW(L"EDIT",L"",WS_CHILD,0,0,0,0,h,0,app.instance,0);ui_set(temp,app.filterSpec.date);ui_calendar(temp,1);char*s=ui_text(temp);if(strlen(s)==10)snprintf(app.filterSpec.date,11,"%s",s);free(s);DestroyWindow(temp);ui_refresh(1);return 0;}if(id==122){app.sidebarOpen=!app.sidebarOpen;ui_layout();return 0;}if(id>=6000&&id<6100){undo_apply(&app.db,id-6000);return 0;}}if(m==WM_NOTIFY){NMHDR*n=(NMHDR*)l;View*v=view_from(n->hwndFrom);if(v){if(n->code==LVN_GETDISPINFOW){NMLVDISPINFOW*d=(NMLVDISPINFOW*)l;Cached*c=ui_view_get(v,d->item.iItem);if(c&&d->item.mask&LVIF_TEXT){const char*s=*str(c->data,"title")?str(c->data,"title"):*str(c->data,"name")?str(c->data,"name"):str(c->data,"body");wchar_t*w=wide(s);wcsncpy(d->item.pszText,w,max(0,d->item.cchTextMax-1));free(w);}return 0;}if(n->code==NM_CUSTOMDRAW){NMLVCUSTOMDRAW*d=(NMLVCUSTOMDRAW*)l;if(d->nmcd.dwDrawStage==CDDS_PREPAINT){RECT r;GetClientRect(v->hwnd,&r);FillRect(d->nmcd.hdc,&r,app.white);return CDRF_NOTIFYITEMDRAW;}if(d->nmcd.dwDrawStage==CDDS_ITEMPREPAINT){ui_draw_row(d,v);return CDRF_SKIPDEFAULT;}}if(n->code==NM_CLICK){if(suppressClick){suppressClick=0;return 0;}NMITEMACTIVATE*a=(NMITEMACTIVATE*)l;if(a->iItem>=0)row_click(v,a->iItem,a->ptAction.x,0);return 0;}if(n->code==NM_RCLICK){NMITEMACTIVATE*a=(NMITEMACTIVATE*)l;Cached*c=ui_view_get(v,a->iItem);if(c){char*k=_strdup(c->key);POINT p;GetCursorPos(&p);ui_menu(k,p);free(k);}return 0;}}}if(m==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}if(m==WM_CTLCOLOREDIT||m==WM_CTLCOLORSTATIC){SetBkColor((HDC)w,RGB(255,255,255));SetTextColor((HDC)w,RGB(133,148,155));return (LRESULT)app.white;}if(m==WM_TIMER){if(w==2){KillTimer(h,2);ui_refresh(1);}if(w==3){KillTimer(h,3);ui_start_sync(0);}if(w==4){KillTimer(h,4);ui_reminders_show();}if(w==6){if(!enabled_undo())KillTimer(h,6);ui_undo_update();}return 0;}if(m==GX_RESULT){SyncJob*j=(SyncJob*)l;app.sync=0;CloseHandle(j->thread);if(j->ok){app.failures=0;lastSync=GetTickCount64();char s[250];snprintf(s,sizeof(s),"同步完成 · 上传%d批 / 下载%d批%s",j->up,j->down,j->more?" · 正在补齐":"");ui_notice(s);ui_refresh(0);}else{app.failures++;ui_notice(j->error);}if(app.autoSync&&app.syncEnabled){int delay=j->ok?(j->more?10000:300000):min(1800000,30000*(1<<min(6,app.failures-1)));SetTimer(h,3,delay,0);}free(j);ui_reminders_schedule();if(closing)DestroyWindow(h);return 0;}if(m==WM_ACTIVATE){if(LOWORD(w)==WA_INACTIVE)ui_drag_cancel();if(LOWORD(w)!=WA_INACTIVE&&!IsIconic(h)&&app.autoSync&&app.syncEnabled&&!app.sync)SetTimer(h,3,2000,0);else KillTimer(h,3);return 0;}if(m==WM_PAINT||m==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;int saved=ui_paint_begin(h,dc);shell_paint(h,dc);RestoreDC(dc,saved);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}if(m==WM_CONTEXTMENU&&(HWND)w==app.status){HMENU menu=CreatePopupMenu();for(int i=app.undoCount-1;i>=0;i--)if(app.undo[i].expires>GetTickCount64()){wchar_t*label=wide(app.undo[i].label);AppendMenuW(menu,MF_STRING,6000+app.undo[i].id,label);free(label);}AppendMenuW(menu,MF_SEPARATOR,0,0);AppendMenuW(menu,MF_STRING,6200,L"导出备份");AppendMenuW(menu,MF_STRING,6201,L"导入备份");int action=TrackPopupMenu(menu,TPM_RETURNCMD,GET_X_LPARAM(l),GET_Y_LPARAM(l),0,h,0);DestroyMenu(menu);if(action>=6000&&action<6200)undo_apply(&app.db,action-6000);else if(action==6200||action==6201)ui_file(action==6201);return 0;}if(m==WM_APP+2){if(l==NIN_BALLOONUSERCLICK&&app.reminderKey)ui_open(app.reminderKey,0,0,0);return 0;}if(m==WM_CLOSE){if(!ui_catalog_commit())return 0;if(!detail_save(0))return 0;if(app.sync){closing=1;ShowWindow(h,SW_MINIMIZE);return 0;}DestroyWindow(h);return 0;}if(m==WM_DESTROY){ui_work_close();app.ready=0;detail_destroy();ui_catalog_clear();for(int q=0;q<4;q++)ui_view_clear(&app.views[q]);for(int i=0;i<app.undoCount;i++)cJSON_Delete(app.undo[i].changes);free_stack();Shell_NotifyIconW(NIM_DELETE,&app.tray);cJSON_Delete(app.ledger);free(app.reminderKey);db_close(&app.db);if(app.storageLock&&app.storageLock!=INVALID_HANDLE_VALUE)CloseHandle(app.storageLock);RemovePropW(h,L"GxDataRoot");cJSON_Delete(app.settings);cJSON_Delete(app.registry);DeleteObject(app.font);DeleteObject(app.smallFont);DeleteObject(app.title);DeleteObject(app.white);DeleteObject(app.background);DeleteObject(app.side);ImageList_Destroy(rowImages);PostQuitMessage(0);return 0;}return DefWindowProcW(h,m,w,l);}
static int default_dir(wchar_t*out){DWORD env=GetEnvironmentVariableW(L"GXTODO_DATA_DIR",out,32768);if(env){if(env>=32768)return -1;app.dataDirOverride=1;return 1;}char error[1024]={0};int saved=storage_load_location(app.locationFile,out,error,sizeof(error));if(saved<0){wchar_t*w=wide(error);MessageBoxW(0,w,L"数据库保存位置不可用",MB_OK|MB_ICONERROR);free(w);return -1;}if(saved)return 2;
#ifndef GX_PUBLIC_RELEASE
if(GetFileAttributesW(L"M:\\dev\\gxtodo-local\\data\\tasks.sqlite")!=INVALID_FILE_ATTRIBUTES){wcscpy(out,L"M:\\dev\\gxtodo-local\\data");return 1;}
#endif
wchar_t local[MAX_PATH];SHGetFolderPathW(0,CSIDL_LOCAL_APPDATA,0,SHGFP_TYPE_CURRENT,local);swprintf(out,32768,L"%s\\GxTodoLocal\\data",local);return 1;}
int gui_main(HINSTANCE h,int argc,wchar_t**argv){int repaint=0,dragtest=0,performance=0,storageTest=0,detailtest=0,worktest=0,isolated=0;for(int i=1;i<argc;i++){if(!wcscmp(argv[i],L"--work-regression"))worktest=1;if(!wcscmp(argv[i],L"--repaint-regression"))repaint=1;if(!wcscmp(argv[i],L"--drag-regression"))dragtest=1;if(!wcscmp(argv[i],L"--ui-performance"))performance=1;if(!wcscmp(argv[i],L"--storage-regression"))storageTest=1;if(!wcscmp(argv[i],L"--detail-regression"))detailtest=1;if(!wcscmp(argv[i],L"--data-dir")&&i+1<argc&&*argv[i+1])isolated=1;}if((repaint||dragtest||performance||storageTest||detailtest||worktest)&&!isolated){fprintf(stderr,"UI regression requires an explicit --data-dir\n");return 1;}memset(&app,0,sizeof(app));app.instance=h;SetCurrentProcessExplicitAppUserModelID(L"GxTodoLocal.Native");app.zoom=-1;app.dpi=96;SetProcessDPIAware();HDC dc=GetDC(0);app.dpi=GetDeviceCaps(dc,LOGPIXELSX);ReleaseDC(0,dc);for(int i=1;i+1<argc;i++)if(!wcscmp(argv[i],L"--visual-dpi"))app.dpi=max(96,min(192,_wtoi(argv[i+1])));app.font=CreateFontW(-U(14),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Microsoft YaHei UI");app.smallFont=CreateFontW(-U(11),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Microsoft YaHei UI");app.title=CreateFontW(-U(16),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Microsoft YaHei UI");app.white=CreateSolidBrush(RGB(255,255,255));app.background=CreateSolidBrush(RGB(247,250,252));app.side=CreateSolidBrush(
#ifdef GX_D409_UI
RGB(234,240,243)
#else
RGB(52,61,64)
#endif
);storage_location_file(app.locationFile);for(int i=1;i<argc-1;i++)if(!wcscmp(argv[i],L"--data-dir")){wcscpy(app.baseDir,argv[++i]);app.dataDirOverride=1;}int savedLocation=*app.baseDir?1:default_dir(app.baseDir);if(savedLocation<0)return 1;app.storageIsolated=storageTest;if(!ensure_dir(app.baseDir))return 1;app.storageLock=storage_guard(app.baseDir,0);if(app.storageLock==INVALID_HANDLE_VALUE){MessageBoxW(0,L"数据目录正在迁移，请稍后重新打开程序。",L"高效 ToDo",MB_OK|MB_ICONINFORMATION);return 1;}wchar_t p[32768];join(p,app.baseDir,L"accounts.json");char*t=read_file(p);app.registry=t?cJSON_Parse(t):0;free(t);if(!app.registry){app.registry=cJSON_CreateObject();sn(app.registry,"version",1);ss(app.registry,"activeId","default");J*a=cJSON_CreateArray(),*entry=cJSON_CreateObject();ss(entry,"id","default");ss(entry,"name","账号 A");ss(entry,"defaultFolder","GxTodo");cJSON_AddItemToArray(a,entry);set(app.registry,"accounts",a);}const char*active=str(app.registry,"activeId");wchar_t dir[32768];wcscpy(dir,app.baseDir);if(strcmp(active,"default")){if(strncmp(active,"account-",8)||strspn(active,"abcdefghijklmnopqrstuvwxyz0123456789-")!=strlen(active))return 1;wchar_t*w=wide(active);swprintf(dir,32768,L"%s\\accounts\\%s",app.baseDir,w);free(w);}if(savedLocation==2){wchar_t*savedDb=malloc(65536);join(savedDb,dir,L"tasks.sqlite");int present=GetFileAttributesW(savedDb)!=INVALID_FILE_ATTRIBUTES;free(savedDb);if(!present){MessageBoxW(0,L"保存目录中找不到当前账号数据库，已停止启动。",L"数据库保存位置不可用",MB_OK|MB_ICONERROR);return 1;}}if(!db_open(&app.db,dir)||!ui_query_init(&app.db)){wchar_t*w=wide(app.db.error);MessageBoxW(0,w,L"高效 ToDo",MB_OK);free(w);return 1;}J*m=db_meta(&app.db);app.settings=dup(get(m,"settings"));cJSON_Delete(m);J*c=config_read(&app.db);app.syncEnabled=truth(c,"enabled");app.autoSync=!cJSON_IsFalse(get(c,"autoSync"));cJSON_Delete(c);char today[32];format_ms(wall_ms(),today);memcpy(app.filterSpec.date,today,10);INITCOMMONCONTROLSEX ic={sizeof(ic),ICC_LISTVIEW_CLASSES|ICC_DATE_CLASSES|ICC_STANDARD_CLASSES};InitCommonControlsEx(&ic);rowImages=ImageList_Create(1,U(GX_ROW_HEIGHT),ILC_COLOR32,1,1);HDC screen=GetDC(0);HBITMAP bitmap=CreateCompatibleBitmap(screen,1,U(GX_ROW_HEIGHT));ReleaseDC(0,screen);ImageList_Add(rowImages,bitmap,0);DeleteObject(bitmap);WNDCLASSW wc={0};wc.hInstance=h;wc.hCursor=LoadCursorW(0,IDC_ARROW);wc.hbrBackground=app.background;wc.hIcon=ui_app_icon(U(32));wc.lpszClassName=L"GxNativeModern";wc.lpfnWndProc=main_proc;RegisterClassW(&wc);HWND window=CreateWindowW(wc.lpszClassName,L"高效 ToDo",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,CW_USEDEFAULT,CW_USEDEFAULT,U(1280),U(860),0,0,h,0);if(!window){fprintf(stderr,"CreateWindow failed: %lu\n",GetLastError());return 1;}SendMessageW(window,WM_SETICON,ICON_BIG,(LPARAM)ui_app_icon(U(32)));SendMessageW(window,WM_SETICON,ICON_SMALL,(LPARAM)ui_app_icon(U(16)));ShowWindow(window,SW_SHOW);UpdateWindow(window);
#ifdef GX_D408_CANDIDATE
d408_attach();int d408result=0;if(d408_try_regression(argc,argv,&d408result)){DestroyWindow(window);return d408result;}
#endif
if(worktest){const wchar_t*render=0;for(int i=1;i+1<argc;i++)if(!wcscmp(argv[i],L"--work-render"))render=argv[i+1];int code=ui_work_regression(render);DestroyWindow(window);return code;}if(detailtest){int code=detail_regression();printf("DETAIL REGRESSION %d failures\n",code);DestroyWindow(window);return code;}if(storageTest){const wchar_t*render=0;for(int i=1;i+1<argc;i++)if(!wcscmp(argv[i],L"--storage-render"))render=argv[i+1];int code=storage_regression(render);DestroyWindow(window);return code;}if(performance){SendMessageW(app.period,CB_SETCURSEL,3,0);ui_refresh(1);SetWindowPos(window,HWND_TOPMOST,0,0,U(1280),U(720),SWP_NOACTIVATE);ui_paint_performance();DestroyWindow(window);return 0;}if(dragtest){const wchar_t*renderDir=0;for(int i=1;i+1<argc;i++)if(!wcscmp(argv[i],L"--drag-render"))renderDir=argv[i+1];int code=drag_regression(renderDir);DestroyWindow(window);return code;}if(repaint){int code=repaint_regression();DestroyWindow(window);return code;}for(int i=1;i<argc;i++)if(!wcscmp(argv[i],L"--ui-regression")){int code=ui_catalog_regression();printf("UI REGRESSION %d failures\n",code);DestroyWindow(window);return code;}for(int i=1;i+1<argc;i++)if(!wcscmp(argv[i],L"--visual-test")){int code=visual_test(argv[i+1]);DestroyWindow(window);return code;}MSG msg;while(GetMessageW(&msg,0,0,0)){
#ifdef GX_D408_CANDIDATE
if(d408_translate_message(&msg))continue;
#endif
if(ui_work_translate_message(&msg))continue;if(msg.message==WM_KEYDOWN){if(msg.wParam=='W'&&(GetKeyState(VK_CONTROL)&0x8000)&&(GetKeyState(VK_SHIFT)&0x8000)){ui_work_open();continue;}if((GetKeyState(VK_MENU)&0x8000)&&msg.wParam==VK_LEFT){ui_back();continue;}if((GetKeyState(VK_MENU)&0x8000)&&msg.wParam==VK_RIGHT){if(app.forwardDepth){char*k=app.forwardStack[--app.forwardDepth];ui_open(k,0,0,0);free(k);}continue;}if(msg.wParam==VK_ESCAPE){if(!ui_drag_cancel())ui_back();continue;}if(msg.wParam==VK_F5){ui_refresh(0);continue;}if(msg.wParam=='Z'&&(GetKeyState(VK_CONTROL)&0x8000)&&GetFocus()!=app.search&&!app.editor){for(int i=app.undoCount-1;i>=0;i--)if(app.undo[i].expires>GetTickCount64()){undo_apply(&app.db,app.undo[i].id);break;}continue;}if(msg.wParam=='N'&&(GetKeyState(VK_CONTROL)&0x8000)){ui_open(0,0,0,app.page==1);continue;}if(msg.wParam=='F'&&(GetKeyState(VK_CONTROL)&0x8000)){if(app.page!=5)ui_navigate(5);SetFocus(app.search);continue;}}if(detail_translate_message(&msg))continue;if(!IsDialogMessageW(app.editor?app.editor->hwnd:app.window,&msg)){TranslateMessage(&msg);DispatchMessageW(&msg);}}return 0;}

int navigation_regression(void){int failures=0;char*k=make_key("tasks","navigation-fixture");J*t=task_default(&app.db,0,0);ss(t,"id","navigation-fixture");ss(t,"title","返回路径验收");if(!db_edit_data(&app.db,k,0,t,0))failures++;ui_open(k,0,0,0);if(!app.editor||strcmp(app.editor->key,k))failures++;ui_back();if(app.editor||!app.forwardDepth)failures++;if(app.forwardDepth){char*forward=app.forwardStack[--app.forwardDepth];ui_open(forward,0,0,0);free(forward);if(!app.editor||strcmp(app.editor->key,k))failures++;ui_back();}strcpy(app.groupKind,"project");strcpy(app.group,"新建继承项目");ui_open(0,1,0,0);if(!app.editor||strcmp(str(app.editor->data,"start"),"2026-10-21T09:00")||strcmp(str(app.editor->data,"project"),app.group))failures++;detail_destroy();strcpy(app.group,"项目乙");strcpy(app.groupKind,"project");app.page=0;ui_back();if(app.page!=2||*app.group)failures++;app.page=0;app.zoom=2;ui_back();if(app.zoom!=-1)failures++;ui_open(k,0,0,0);task_delete(&app.db,k);ui_back();if(app.editor)failures++;free(k);cJSON_Delete(t);return failures;}
