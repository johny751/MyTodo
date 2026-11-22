#include "ui.h"
static int checks,failures;static const wchar_t*renderDir;
static void render_stage(const wchar_t*name){if(!renderDir)return;int ok=ui_visual_snap(renderDir,name);printf("DRAG RENDER %ls %s\n",name,ok?"PASS":"FAIL");if(!ok)failures++;}
static void verify(int ok,const char*name){checks++;printf("%s %s\n",ok?"PASS":"FAIL",name);if(!ok){failures++;printf("ERROR %s\n",app.db.error);}}
static char*fixture(const char*title,int q,const char*parent,double order){J*t=task_default(&app.db,q,parent);ss(t,"title",title);sn(t,"order",order);char*k=make_key("tasks",str(t,"id"));int ok=db_edit_data(&app.db,k,0,t,0);cJSON_Delete(t);if(!ok){free(k);return 0;}return k;}
static int rank(View*v,const char*key){J*a=query_rows(&app.db,&v->filter,0,200),*r;int i=0,found=-1;cJSON_ArrayForEach(r,a){if(!strcmp(str(r,"key"),key))found=i;i++;}cJSON_Delete(a);return found;}
static J*data(const char*key){J*r=db_row(&app.db,key),*t=dup(get(r,"data"));cJSON_Delete(r);return t;}
static POINT row_point(View*v,int row,int fraction,int handle){RECT r={0};ListView_EnsureVisible(v->hwnd,row,FALSE);ListView_GetItemRect(v->hwnd,row,&r,LVIR_BOUNDS);POINT p={handle?U(4):U(50),r.top+(r.bottom-r.top)*fraction/4};return p;}
static POINT screen_point(HWND h,POINT p){ClientToScreen(h,&p);return p;}
static void test_foreground(void){SetWindowPos(app.window,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW);SetForegroundWindow(app.window);}
static void press(View*v,int row,int handle){test_foreground();POINT p=row_point(v,row,2,handle);SendMessageW(v->hwnd,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(p.x,p.y));}
static void motion(View*from,POINT screen){ScreenToClient(from->hwnd,&screen);SendMessageW(from->hwnd,WM_MOUSEMOVE,MK_LBUTTON,MAKELPARAM(screen.x,screen.y));}
static void release(View*from,POINT screen){ScreenToClient(from->hwnd,&screen);SendMessageW(from->hwnd,WM_LBUTTONUP,0,MAKELPARAM(screen.x,screen.y));}
static void drop(View*from,int row,View*to,int dest,int fraction){press(from,row,1);POINT p=screen_point(to->hwnd,row_point(to,dest,fraction,0));motion(from,p);release(from,p);}
static void reset_board(void){test_foreground();if(app.editor)detail_save(1);app.page=0;app.zoom=-1;SendMessageW(app.period,CB_SETCURSEL,3,0);SendMessageW(app.statusFilter,CB_SETCURSEL,2,0);SendMessageW(app.mode,CB_SETCURSEL,0,0);SendMessageW(app.sort,CB_SETCURSEL,1,0);ui_refresh(1);UpdateWindow(app.window);}
static void undo_latest(void){for(int i=app.undoCount-1;i>=0;i--)if(app.undo[i].expires>GetTickCount64()){undo_apply(&app.db,app.undo[i].id);break;}}

/* Observe the real list's NM_CUSTOMDRAW path, not the preview renderer. */
static int drawCount,missingTitleRows;static HWND paintList;
static LRESULT CALLBACK inspect_draw(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 if(m==WM_NOTIFY){NMHDR*n=(NMHDR*)l;if(n->hwndFrom==paintList&&n->code==NM_CUSTOMDRAW){
  NMLVCUSTOMDRAW*d=(NMLVCUSTOMDRAW*)l;if(d->nmcd.dwDrawStage==CDDS_ITEMPREPAINT){
   RECT row,client,visible;GetClientRect(paintList,&client);int item=(int)d->nmcd.dwItemSpec;
   int present=ListView_GetItemRect(paintList,item,&row,LVIR_BOUNDS);
   LRESULT result=DefSubclassProc(h,m,w,l);GdiFlush();
   RECT title={row.left+U(GX_TASK_TEXT_LEFT),row.top+U(5),min(row.right-U(146),row.left+U(220)),row.top+U(28)};
   if(present&&IntersectRect(&visible,&title,&client)&&visible.bottom-visible.top>=U(12)){
    int ink=0;for(int y=visible.top;y<visible.bottom;y++)for(int x=visible.left;x<visible.right;x++){
     COLORREF pixel=GetPixel(d->nmcd.hdc,x,y);if(pixel!=CLR_INVALID&&GetRValue(pixel)<128&&GetGValue(pixel)<140&&GetBValue(pixel)<150)ink++;}
    drawCount++;if(!ink){missingTitleRows++;printf("NATIVE TITLE MISSING item=%d row=%ld,%ld,%ld,%ld\n",item,row.left,row.top,row.right,row.bottom);}
   }
   return result;
  }
 }}return DefSubclassProc(h,m,w,l);
}
static void native_paint_probe(View*v,int expected,const char*name){
 test_foreground();MSG message;int paints=0;while(paints++<1024&&PeekMessageW(&message,0,WM_PAINT,WM_PAINT,PM_REMOVE))DispatchMessageW(&message);paintList=v->hwnd;drawCount=missingTitleRows=0;HWND parent=GetParent(paintList);SetWindowSubclass(parent,inspect_draw,82,0);
 RedrawWindow(paintList,0,0,RDW_INVALIDATE|RDW_ERASE|RDW_UPDATENOW);RemoveWindowSubclass(parent,inspect_draw,82);
 printf("NATIVE PAINT %s rows=%d missing=%d\n",name,drawCount,missingTitleRows);verify(drawCount>=expected&&!missingTitleRows,name);paintList=0;
}

static void empty_list_probe(View*v,const char*phase){
 MSG m;int count=0;while(count++<1024&&PeekMessageW(&m,0,WM_PAINT,WM_PAINT,PM_REMOVE))DispatchMessageW(&m);GdiFlush();
 HDC dc=GetDC(v->hwnd);RECT r;GetClientRect(v->hwnd,&r);int ink=0,valid=0;
 for(int y=U(4);y<min(r.bottom,U(100));y++)for(int x=U(40);x<min(r.right,U(240));x++){COLORREF p=GetPixel(dc,x,y);if(p!=CLR_INVALID){valid++;if(GetRValue(p)<128&&GetGValue(p)<140&&GetBValue(p)<150)ink++;}}
 ReleaseDC(v->hwnd,dc);printf("EMPTY NATIVE %s count=%d ink=%d valid=%d update=%d\n",phase,v->count,ink,valid,GetUpdateRect(v->hwnd,0,FALSE));verify(v->count==0&&valid>0&&ink==0,phase);
}


static int popupOpened,popupItems,popupChoice,popupQuadrant,popupSnapshotOk;static UINT popupFirst,popupToggle;static HWND popupWindow;static wchar_t popupToggleLabel[100];static const wchar_t*popupRenderName;
static HWND owned_window(const wchar_t*name){HWND h=0;while((h=FindWindowExW(0,h,name,0))!=0)if(GetWindow(h,GW_OWNER)==app.window)return h;return 0;}
static LRESULT CALLBACK menu_probe(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 if(m==GX_TASK_MENU_READY){popupWindow=(HWND)w;popupOpened++;popupItems=0;for(HWND b=GetWindow(popupWindow,GW_CHILD);b;b=GetWindow(b,GW_HWNDNEXT)){wchar_t cls[40];GetClassNameW(b,cls,40);if(!wcscmp(cls,L"Button"))popupItems++;}popupFirst=GetDlgCtrlID(GetDlgItem(popupWindow,GX_MENU_ACTION_BASE+1))-GX_MENU_ACTION_BASE;popupToggle=GetDlgCtrlID(GetDlgItem(popupWindow,GX_MENU_ACTION_BASE+2))-GX_MENU_ACTION_BASE;GetWindowTextW(GetDlgItem(popupWindow,GX_MENU_ACTION_BASE+2),popupToggleLabel,100);popupQuadrant=(int)(INT_PTR)GetPropW(popupWindow,L"GxMenuCurrentQuadrant")-1;if(renderDir&&popupRenderName)popupSnapshotOk=ui_visual_window_snap(popupWindow,renderDir,popupRenderName);SetTimer(h,901,80,0);return 0;}
 if(m==WM_TIMER&&w==901){KillTimer(h,901);int action=popupChoice;popupChoice=0;
  if(action==-1)PostMessageW(popupWindow,WM_KEYDOWN,VK_ESCAPE,0);
  else if(action==-2){HWND shade=owned_window(L"GxTaskMenuShade");if(shade)SendMessageW(shade,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(U(5),U(5)));else SendMessageW(popupWindow,WM_CLOSE,0,0);}
  else if(action>0){if(action==3)SetTimer(h,902,80,0);HWND button=GetDlgItem(popupWindow,GX_MENU_ACTION_BASE+action);SendMessageW(button,BM_CLICK,0,0);}
  else SendMessageW(popupWindow,WM_CLOSE,0,0);return 0;}
 if(m==WM_TIMER&&w==902){HWND confirm=owned_window(L"#32770");if(confirm){KillTimer(h,902);SendMessageW(confirm,WM_COMMAND,IDCANCEL,0);}return 0;}
 return DefSubclassProc(h,m,w,l);
}
static void tap_at(View*v,POINT p,int twice){
 test_foreground();SendMessageW(v->hwnd,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(p.x,p.y));release(v,screen_point(v->hwnd,p));
 if(twice){SendMessageW(v->hwnd,WM_LBUTTONDBLCLK,MK_LBUTTON,MAKELPARAM(p.x,p.y));release(v,screen_point(v->hwnd,p));}
}
static void icon_checks(void){
 verify(SendMessageW(app.window,WM_GETICON,ICON_BIG,0)!=0&&SendMessageW(app.window,WM_GETICON,ICON_SMALL,0)!=0,"taskbar and window use application icons");
 HRSRC group=FindResourceW(app.instance,MAKEINTRESOURCEW(IDI_GXTODO),RT_GROUP_ICON);WORD*info=group?(WORD*)LockResource(LoadResource(app.instance,group)):0;
 verify(info&&info[0]==0&&info[1]==1&&info[2]==10,"EXE embeds ten 32-bit icon sizes");
 wchar_t exe[32768];GetModuleFileNameW(0,exe,32768);int sizes[]={16,20,24,32,40,48,64,96,128,256};
 for(int i=0;i<10;i++){HICON iconLarge=0,iconSmall=0;HRESULT result=SHDefExtractIconW(exe,0,0,&iconLarge,&iconSmall,MAKELONG(sizes[i],sizes[i]));ICONINFO icon={0};BITMAP bitmap={0};int ok=SUCCEEDED(result)&&iconLarge&&GetIconInfo(iconLarge,&icon)&&icon.hbmColor&&GetObjectW(icon.hbmColor,sizeof(bitmap),&bitmap)&&bitmap.bmWidth==sizes[i]&&bitmap.bmHeight==sizes[i];char label[120];snprintf(label,sizeof(label),"Explorer shell extracts application icon at %d pixels",sizes[i]);verify(ok,label);if(icon.hbmColor)DeleteObject(icon.hbmColor);if(icon.hbmMask)DeleteObject(icon.hbmMask);if(iconLarge)DestroyIcon(iconLarge);if(iconSmall)DestroyIcon(iconSmall);}
}
static void row_action_checks(View*v,const char*key){
 int beforeCount=v->count,undos=app.undoCount;J*before=data(key);POINT blank={U(80),U(230)};
 tap_at(v,blank,0);verify(!app.editor&&v->count==beforeCount&&app.undoCount==undos,"blank quadrant click does not create a task");
 tap_at(v,blank,1);verify(!app.editor&&!IsIconic(app.window)&&v->count==beforeCount&&app.undoCount==undos,"blank quadrant double click does not create or minimize");
 View*empty=&app.views[3];POINT p={U(80),U(80)};tap_at(empty,p,1);verify(!app.editor&&!IsIconic(app.window)&&empty->count==0,"empty quadrant single and double clicks remain empty");
 SendMessageW(app.window,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(U(94),U(48)));SendMessageW(app.window,WM_LBUTTONUP,0,MAKELPARAM(U(94),U(48)));SendMessageW(app.window,WM_LBUTTONDBLCLK,MK_LBUTTON,MAKELPARAM(U(94),U(48)));
 verify(!IsIconic(app.window)&&!app.editor,"client whitespace double click leaves the window open");
 int row=rank(v,key);p=row_point(v,row,2,1);p.x=U(12);SendMessageW(v->hwnd,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(p.x,p.y));POINT moved=p;moved.x+=U(7);motion(v,screen_point(v->hwnd,moved));verify(app.dragging,"expanded handle hit area starts drag at 12 logical pixels");SendMessageW(v->hwnd,WM_KEYDOWN,VK_ESCAPE,0);release(v,screen_point(v->hwnd,moved));
 RECT client;GetClientRect(v->hwnd,&client);p=row_point(v,row,2,0);p.x=client.right-U(15);popupOpened=popupItems=0;popupRenderName=L"task-menu";SetWindowSubclass(app.window,menu_probe,93,0);
 SendMessageW(v->hwnd,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(p.x,p.y));SendMessageW(v->hwnd,WM_TIMER,7,0);verify(!app.dragging,"holding task menu does not arm long-press dragging");release(v,screen_point(v->hwnd,p));KillTimer(app.window,901);RemoveWindowSubclass(app.window,menu_probe,93);
 verify(popupOpened==1&&popupItems==10&&popupFirst==1&&popupToggle==2,"trailing three-dot click opens the styled task action card");J*after=data(key);verify(eq(before,after)&&!app.editor&&app.undoCount==undos,"cancelling task menu preserves task and detail state");cJSON_Delete(after);cJSON_Delete(before);
 render_stage(L"row-actions");if(renderDir){J*original=data(key),*preview=dup(original);ss(preview,"title","长标题与开始时间、三点按钮同时显示：确认文字截断后仍有清晰间距，任务菜单始终可见");ss(preview,"start","2026-10-24T09:00");ss(preview,"project","ISO27001");J*tags=cJSON_CreateArray();cJSON_AddItemToArray(tags,cJSON_CreateString("认证"));set(preview,"tags",tags);if(db_edit_data(&app.db,key,0,preview,0)){ui_refresh(0);render_stage(L"row-actions-long-title");db_edit_data(&app.db,key,0,original,0);ui_refresh(0);}else failures++;cJSON_Delete(preview);cJSON_Delete(original);}icon_checks();
}


static void child_menu_check(View*v,const char*key){
 J*before=data(key);Detail*editor=app.editor;int undos=app.undoCount;RECT client;GetClientRect(v->hwnd,&client);POINT p=row_point(v,rank(v,key),2,0);p.x=client.right-U(15);popupOpened=popupItems=0;SetWindowSubclass(app.window,menu_probe,93,0);tap_at(v,p,0);KillTimer(app.window,901);RemoveWindowSubclass(app.window,menu_probe,93);J*after=data(key);verify(popupOpened==1&&popupItems==10,"child three-dot click opens its styled task action card");verify(eq(before,after)&&app.editor==editor&&app.undoCount==undos,"cancelled child menu preserves parent detail and task");cJSON_Delete(before);cJSON_Delete(after);
}


static void action_card(const char*key,int choice,const wchar_t*frame){popupOpened=popupItems=popupSnapshotOk=0;popupChoice=choice;popupRenderName=frame;SetWindowSubclass(app.window,menu_probe,93,0);POINT p={0};ui_menu(key,p);KillTimer(app.window,901);KillTimer(app.window,902);RemoveWindowSubclass(app.window,menu_probe,93);popupRenderName=0;}
static int detail_panes(void){int count=0;for(HWND h=GetWindow(app.window,GW_CHILD);h;h=GetWindow(h,GW_HWNDNEXT)){wchar_t cls[40];GetClassNameW(h,cls,40);if(!wcscmp(cls,L"GxDetailPane"))count++;}return count;}
static void selection_checks(const char*a,const char*c,const char*child){
 ui_close_detail();reset_board();View*v=&app.views[0];int count=query_count(&app.db,&v->filter);
 for(int q=0;q<4;q++){SendMessageW(GetDlgItem(app.window,2000+q),BM_CLICK,0,0);char name[100];snprintf(name,sizeof(name),"quadrant %d whole header activation creates correct-priority draft",q);verify(app.editor&&app.editor->newRecord&&(int)num(app.editor->data,"quadrant")==q,name);ui_close_detail();}
 verify(query_count(&app.db,&v->filter)==count,"closing empty header drafts does not create stored tasks");
 POINT p=row_point(v,rank(v,a),2,1);SendMessageW(v->hwnd,WM_MOUSEMOVE,0,MAKELPARAM(p.x,p.y));verify(GetCursor()==LoadCursorW(0,IDC_HAND),"hovering task drag handle uses hand cursor");p.x=U(50);SendMessageW(v->hwnd,WM_MOUSEMOVE,0,MAKELPARAM(p.x,p.y));verify(GetCursor()==LoadCursorW(0,IDC_ARROW),"task title restores normal cursor");SendMessageW(v->hwnd,WM_MOUSELEAVE,0,0);verify(GetCursor()==LoadCursorW(0,IDC_ARROW),"leaving drag handle restores normal cursor");
 p=row_point(v,rank(v,a),2,0);tap_at(v,p,0);verify(app.editor&&!strcmp(app.editor->key,a),"first task click opens its detail directly");HWND old=app.editor?app.editor->hwnd:0;if(app.editor){ui_set(app.editor->fields[0],"");p=row_point(v,rank(v,c),2,0);tap_at(v,p,0);verify(app.editor&&!strcmp(app.editor->key,a)&&IsWindow(old)&&detail_panes()==1,"invalid prior edits keep the current detail instead of discarding it");ui_set(app.editor->fields[0],"切换任务时自动保存");}p=row_point(v,rank(v,c),2,0);tap_at(v,p,0);J*saved=data(a);verify(saved&&!strcmp(str(saved,"title"),"切换任务时自动保存"),"switching tasks saves the prior valid edits");cJSON_Delete(saved);
 verify(app.editor&&!strcmp(app.editor->key,c)&&!IsWindow(old)&&detail_panes()==1&&app.depth==0,"another task replaces the old pane without stacking unrelated details");if(app.editor)SendMessageW(GetDlgItem(app.editor->hwnd,552),BM_CLICK,0,0);verify(!app.editor&&!app.depth&&!app.forwardDepth&&detail_panes()==0,"one Close click dismisses task details without reopening prior tasks");undo_latest();
 SetWindowPos(app.window,0,0,0,U(760),U(680),SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);ui_refresh(0);p=row_point(v,rank(v,a),2,0);tap_at(v,p,0);verify(app.editor&&!strcmp(app.editor->key,a)&&app.zoom==-1,"compact task click opens detail without an extra zoom click");ui_close_detail();SetWindowPos(app.window,0,0,0,U(1280),U(860),SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);reset_board();
 ui_open(a,0,0,0);ui_open(child,0,0,0);verify(app.editor&&!strcmp(app.editor->key,child)&&app.depth==1&&detail_panes()==1,"child detail replaces parent while preserving a parent return path");if(app.editor)SendMessageW(GetDlgItem(app.editor->hwnd,550),BM_CLICK,0,0);verify(app.editor&&!strcmp(app.editor->key,a)&&app.depth==0,"explicit Back returns from child to parent");ui_open(child,0,0,0);if(app.editor)SendMessageW(GetDlgItem(app.editor->hwnd,552),BM_CLICK,0,0);verify(!app.editor&&!app.depth&&detail_panes()==0,"Close dismisses child and parent return path in one click");reset_board();
}
static void styled_menu_checks(const char*a){
 ui_close_detail();reset_board();J*before=data(a);int q=(int)num(before,"quadrant"),undos=app.undoCount;action_card(a,0,L"task-menu-card");verify(popupOpened==1&&popupItems==10&&popupQuadrant==q&&IsWindowEnabled(app.window),"styled card has all actions, current quadrant and restores owner input");if(renderDir)verify(popupSnapshotOk,"styled task card renders successfully");
 action_card(a,-1,0);J*after=data(a);verify(eq(before,after)&&app.undoCount==undos&&IsWindowEnabled(app.window),"Escape closes task card without writing");cJSON_Delete(after);
 action_card(a,-2,0);after=data(a);verify(eq(before,after)&&!owned_window(L"GxTaskMenuShade")&&IsWindowEnabled(app.window),"outside backdrop click closes card and removes shade");cJSON_Delete(after);
 action_card(a,10+q,0);after=data(a);verify(eq(before,after)&&app.undoCount==undos,"current quadrant action does not reorder or write");cJSON_Delete(after);
 int originalRank=rank(&app.views[q],a);action_card(a,5,0);verify(rank(&app.views[q],a)==originalRank+1,"styled Down button moves one sibling position");action_card(a,4,0);verify(rank(&app.views[q],a)==originalRank,"styled Up button moves one sibling position");undo_latest();undo_latest();after=data(a);verify(eq(before,after),"styled order actions undo without changing task fields");cJSON_Delete(after);
 action_card(a,2,0);after=data(a);verify(truth(after,"done")!=truth(before,"done"),"styled completion button updates task state");cJSON_Delete(after);action_card(a,0,L"task-menu-completed");verify(!wcscmp(popupToggleLabel,L"重新打开任务"),"completed task card offers reopening");undo_latest();
 int target=(q+1)%4;action_card(a,10+target,L"task-menu-move");after=data(a);verify((int)num(after,"quadrant")==target,"styled quadrant button moves task to selected quadrant");cJSON_Delete(after);undo_latest();after=data(a);verify(eq(before,after),"styled action undo restores full task data");cJSON_Delete(after);
 action_card(a,1,0);verify(app.editor&&!strcmp(app.editor->key,a)&&detail_panes()==1,"styled edit button opens only the selected task detail");ui_close_detail();
 action_card(a,3,0);after=data(a);verify(eq(before,after)&&IsWindowEnabled(app.window),"styled delete action retains confirmation and cancel preserves task");cJSON_Delete(after);cJSON_Delete(before);reset_board();
}
int drag_regression(const wchar_t*dir){
 renderDir=dir;if(dir)ensure_dir(dir);
 setvbuf(stdout,0,_IONBF,0);checks=failures=0;
 /* Keep this isolated test's hit points inside the work area and above other
    windows. Real drop resolution must continue rejecting foreign windows. */
 RECT work;SystemParametersInfoW(SPI_GETWORKAREA,0,&work,0);int width=min(U(1280),work.right-work.left),height=min(U(860),work.bottom-work.top);
 SetWindowPos(app.window,HWND_TOPMOST,work.left,work.top,width,height,SWP_SHOWWINDOW);SetForegroundWindow(app.window);reset_board();sn(app.settings,"longPressMs",3000);sn(app.settings,"undoMs",30000);
 char*a=fixture("拖拽 A",0,0,0),*b=fixture("拖拽 B",0,0,1024),*c=fixture("拖拽 C",0,0,2048),*d=fixture("目标 D",1,0,0),*e=fixture("目标 E",1,0,1024),*z=fixture("空象限任务",2,0,0);
 verify(a&&b&&c&&d&&e&&z,"drag fixtures created");if(!a||!b||!c||!d||!e||!z)return 1;ui_refresh(1);
 View*v=&app.views[0],*target=&app.views[1];row_action_checks(v,a);native_paint_probe(v,3,"initial tasks have separate visible native title rows");J*before=data(a);int undos=app.undoCount;POINT p=screen_point(v->hwnd,row_point(v,0,2,1));
 press(v,0,1);verify(!app.dragging&&GetCapture()==v->hwnd,"handle press captures without starting a drag");release(v,p);J*after=data(a);
 verify(eq(before,after)&&!app.editor&&app.undoCount==undos,"handle tap leaves task, completion and order unchanged");cJSON_Delete(before);cJSON_Delete(after);
 before=data(a);undos=app.undoCount;press(v,rank(v,a),1);POINT handlePoint=row_point(v,rank(v,a),2,1);SendMessageW(v->hwnd,WM_LBUTTONDBLCLK,MK_LBUTTON,MAKELPARAM(handlePoint.x,handlePoint.y));release(v,screen_point(v->hwnd,handlePoint));after=data(a);verify(eq(before,after)&&!app.editor&&app.undoCount==undos&&!app.dragging,"double tapping handle does not complete or reorder");cJSON_Delete(before);cJSON_Delete(after);
 before=data(a);undos=app.undoCount;p=row_point(v,rank(v,a),2,0);p.x=U(20);POINT checkPoint=screen_point(v->hwnd,p);SendMessageW(v->hwnd,WM_LBUTTONDOWN,MK_LBUTTON,MAKELPARAM(p.x,p.y));release(v,checkPoint);after=data(a);verify(truth(after,"done")!=truth(before,"done")&&app.undoCount==undos+1&&!app.editor,"ordinary checkbox tap toggles completion exactly once");cJSON_Delete(after);undo_latest();after=data(a);verify(eq(before,after),"checkbox tap remains undoable after drag changes");cJSON_Delete(before);cJSON_Delete(after);
 before=data(a);undos=app.undoCount;press(v,0,0);verify(GetCapture()==v->hwnd,"body press owns capture before long press");SendMessageW(v->hwnd,WM_TIMER,7,0);
 verify(app.dragging,"stationary long press starts drag without mouse movement");motion(v,screen_point(target->hwnd,row_point(target,0,1,0)));render_stage(L"cross-quadrant-before");release(v,screen_point(target->hwnd,row_point(target,0,1,0)));after=data(a);
 verify((int)num(after,"quadrant")==1&&rank(target,a)==0,"long press crosses quadrant and inserts before upper half");verify(GetCapture()!=v->hwnd&&!app.dragging&&!GetPropW(target->hwnd,L"GxDropIndex"),"drop releases capture, timers and markers");verify(!strcmp(str(after,"title"),str(before,"title"))&&truth(after,"done")==truth(before,"done"),"drag preserves title and completion");cJSON_Delete(after);
 undo_latest();after=data(a);verify(eq(before,after),"undo restores priority and order together");cJSON_Delete(after);cJSON_Delete(before);
 press(v,rank(v,a),1);p=screen_point(v->hwnd,row_point(v,rank(v,c),3,0));motion(v,p);render_stage(L"insert-after-last");release(v,p);verify(rank(v,a)==2,"lower half drops after last row");undo_latest();
 drop(v,rank(v,c),v,rank(v,b),1);verify(rank(v,c)==1,"upper half inserts before middle row");undo_latest();
 drop(v,rank(v,a),v,rank(v,b),3);verify(rank(v,a)==1&&rank(v,b)==0,"lower half inserts after middle row");undo_latest();

 /* Reproduce two tasks in one initially empty quadrant, then split them. */
 View*merge=&app.views[3];press(v,rank(v,a),1);POINT empty={U(45),U(40)};p=screen_point(merge->hwnd,empty);motion(v,p);release(v,p);
 drop(v,rank(v,b),merge,rank(merge,a),3);verify(merge->count==2&&rank(merge,a)>=0&&rank(merge,b)>=0,"both tasks persist when dragged into one empty quadrant");
 native_paint_probe(merge,2,"merged tasks both have visible titles in native paint");render_stage(L"merged-two-tasks");
 drop(merge,rank(merge,a),target,rank(target,d),1);native_paint_probe(merge,1,"splitting merged tasks renders the remaining native title");native_paint_probe(target,3,"splitting merged tasks renders every destination native title");render_stage(L"split-two-tasks");
 drop(merge,rank(merge,b),target,rank(target,a),3);empty_list_probe(merge,"source quadrant clears after its last task is dragged away");render_stage(L"emptied-quadrant");undo_latest();undo_latest();undo_latest();undo_latest();
 before=data(b);undos=app.undoCount;drop(v,rank(v,b),v,rank(v,b),3);after=data(b);verify(eq(before,after)&&app.undoCount==undos,"dropping on own row is a no-op");cJSON_Delete(before);cJSON_Delete(after);
 press(v,rank(v,a),1);POINT blank={U(45),app.views[3].count?U(90):U(40)};p=screen_point(app.views[3].hwnd,blank);motion(v,p);verify(GetPropW(app.views[3].hwnd,L"GxDropIndex")!=0,"empty quadrant shows insertion marker");render_stage(L"empty-quadrant");release(v,p);after=data(a);verify((int)num(after,"quadrant")==3&&rank(&app.views[3],a)==0,"empty quadrant accepts task");cJSON_Delete(after);undo_latest();
 app.zoom=0;ui_layout();press(v,rank(v,a),1);RECT cell=app.boardCells[3];p.x=(cell.left+cell.right)/2;p.y=(cell.top+cell.bottom)/2;ClientToScreen(app.window,&p);motion(v,p);verify(GetPropW(GetDlgItem(app.window,2003),L"GxDropTarget")!=0,"collapsed quadrant shows drop target");render_stage(L"collapsed-quadrant");release(v,p);after=data(a);verify((int)num(after,"quadrant")==3,"collapsed quadrant accepts task without expanding");cJSON_Delete(after);undo_latest();reset_board();
 before=data(a);undos=app.undoCount;press(v,rank(v,a),1);p=screen_point(target->hwnd,row_point(target,0,1,0));motion(v,p);SendMessageW(v->hwnd,WM_KEYDOWN,VK_ESCAPE,0);release(v,p);after=data(a);verify(eq(before,after)&&app.undoCount==undos&&!app.editor&&!app.dragging&&GetCapture()!=v->hwnd,"Escape cancels drag without navigating or writing");render_stage(L"cancelled-drag");cJSON_Delete(after);
 press(v,rank(v,a),1);motion(v,p);SendMessageW(v->hwnd,WM_CANCELMODE,0,0);release(v,p);after=data(a);verify(eq(before,after)&&app.undoCount==undos&&!app.dragging,"cancel mode leaves task unchanged");cJSON_Delete(after);
 press(v,rank(v,a),1);motion(v,p);ReleaseCapture();release(v,p);after=data(a);verify(eq(before,after)&&app.undoCount==undos&&!app.dragging,"lost capture cancels safely");cJSON_Delete(after);
 press(v,rank(v,a),1);motion(v,p);RECT root;GetWindowRect(app.window,&root);p.x=root.right+20;p.y=root.bottom+20;motion(v,p);verify(!GetPropW(target->hwnd,L"GxDropIndex"),"leaving a target clears its marker");release(v,p);after=data(a);verify(eq(before,after)&&app.undoCount==undos,"outside-window drop does not write");cJSON_Delete(after);
 press(v,rank(v,a),0);p=screen_point(target->hwnd,row_point(target,0,1,0));motion(v,p);SendMessageW(v->hwnd,WM_TIMER,7,0);verify(!app.dragging,"movement before timeout cancels long press");SendMessageW(v->hwnd,WM_CANCELMODE,0,0);SendMessageW(v->hwnd,WM_MOUSEMOVE,0,0);after=data(a);verify(eq(before,after),"cancelled early movement does not reorder");cJSON_Delete(after);cJSON_Delete(before);
 before=data(a);undos=app.undoCount;press(v,rank(v,a),0);POINT tapPoint=screen_point(v->hwnd,row_point(v,rank(v,a),2,0));SendMessageW(v->hwnd,WM_KEYDOWN,VK_ESCAPE,0);release(v,tapPoint);after=data(a);verify(eq(before,after)&&!app.editor&&app.undoCount==undos&&GetCapture()!=v->hwnd,"Escape during armed long press cancels without opening detail");cJSON_Delete(before);cJSON_Delete(after);
 /* The normal title click must still open details after cancelled drags. */
 p=screen_point(v->hwnd,row_point(v,rank(v,a),2,0));press(v,rank(v,a),0);release(v,p);verify(app.editor&&!strcmp(app.editor->key,a),"ordinary title click still opens detail");if(app.editor)detail_save(1);reset_board();
 char*parentId;after=data(a);parentId=_strdup(str(after,"id"));cJSON_Delete(after);
 char*ch1=fixture("子任务一",0,parentId,0),*ch2=fixture("子任务二",3,parentId,1024),*ch3=fixture("子任务三",1,parentId,2048);ui_open(a,0,0,0);
 if(app.editor){SendMessageW(app.editor->hwnd,WM_VSCROLL,SB_BOTTOM,0);View*children=&app.editor->children;verify(IsWindowVisible(children->hwnd)&&children->count==3,"child drag fixture visible");child_menu_check(children,ch1);native_paint_probe(children,3,"child tasks render at separate native title positions");RECT firstRow,secondRow;ListView_GetItemRect(children->hwnd,0,&firstRow,LVIR_BOUNDS);ListView_GetItemRect(children->hwnd,1,&secondRow,LVIR_BOUNDS);verify(firstRow.bottom-firstRow.top>=U(GX_ROW_HEIGHT)&&secondRow.top>=firstRow.bottom,"reopened child list preserves matching drawing and hit row heights");verify(ImageList_GetImageCount(ListView_GetImageList(children->hwnd,LVSIL_SMALL))==1,"closing detail preserves the shared row image list");
  press(children,rank(children,ch1),1);p=screen_point(children->hwnd,row_point(children,rank(children,ch3),3,0));motion(children,p);render_stage(L"child-reorder");release(children,p);verify(rank(children,ch1)==2,"child drag reorders siblings across their priorities");after=data(ch1);verify(!strcmp(str(after,"parentId"),parentId)&&(int)num(after,"quadrant")==0,"child reorder preserves parent and own priority");cJSON_Delete(after);undo_latest();detail_reload_children();
  before=data(ch1);undos=app.undoCount;press(children,rank(children,ch1),1);p=screen_point(target->hwnd,row_point(target,0,1,0));motion(children,p);release(children,p);after=data(ch1);verify(eq(before,after)&&app.undoCount==undos,"child cannot drop into main task board");cJSON_Delete(after);cJSON_Delete(before);detail_save(1);
 }else verify(0,"parent detail opens for child drag");reset_board();
 SendMessageW(app.mode,CB_SETCURSEL,1,0);ui_refresh(1);v=&app.views[0];before=data(a);undos=app.undoCount;drop(v,rank(v,a),v,rank(v,d),1);after=data(a);verify(eq(before,after)&&app.undoCount==undos,"timeline rejects cross-priority anchor");cJSON_Delete(after);cJSON_Delete(before);reset_board();v=&app.views[0];
 char*longKeys[36];for(int i=0;i<36;i++){char title[80];snprintf(title,sizeof(title),"滚动任务 %02d",i);longKeys[i]=fixture(title,0,0,(i+4)*1024.);}ui_refresh(1);ListView_EnsureVisible(v->hwnd,0,FALSE);press(v,rank(v,a),1);RECT client;GetClientRect(v->hwnd,&client);POINT edge={U(50),client.bottom-U(6)};p=screen_point(v->hwnd,edge);motion(v,p);int top=ListView_GetTopIndex(v->hwnd);for(int i=0;i<5;i++)SendMessageW(v->hwnd,WM_TIMER,8,0);verify(ListView_GetTopIndex(v->hwnd)>top,"stationary edge drag auto-scrolls on timer");render_stage(L"edge-auto-scroll");SendMessageW(v->hwnd,WM_KEYDOWN,VK_ESCAPE,0);top=ListView_GetTopIndex(v->hwnd);SendMessageW(v->hwnd,WM_TIMER,8,0);verify(ListView_GetTopIndex(v->hwnd)==top&&!GetPropW(v->hwnd,L"GxDropIndex"),"cancel stops auto-scroll and removes insertion line");
 ListView_EnsureVisible(v->hwnd,rank(v,b),FALSE);drop(v,rank(v,b),target,rank(target,d),3);after=data(b);int savedQ=(int)num(after,"quadrant");double savedOrder=num(after,"order");cJSON_Delete(after);
 DB reopened;verify(db_open(&reopened,app.db.dir),"reopen independent database handle");if(reopened.sql){J*r=db_row(&reopened,b);verify((int)num(get(r,"data"),"quadrant")==savedQ&&num(get(r,"data"),"order")==savedOrder&&savedQ==1,"drop persists priority and order across reopen");cJSON_Delete(r);db_close(&reopened);render_stage(L"saved-drop");native_paint_probe(target,3,"drop renders all destination tasks through native custom draw");}
 selection_checks(a,c,ch1);styled_menu_checks(a);
 for(int i=0;i<36;i++)free(longKeys[i]);free(a);free(b);free(c);free(d);free(e);free(z);free(parentId);free(ch1);free(ch2);free(ch3);printf("DRAG REGRESSION %d checks, %d failures\n",checks,failures);return failures?1:0;
}
