#include "ui.h"
#include <psapi.h>
/* Exercise the application's parent paint paths on an isolated memory surface.
   Child areas start with a sentinel; a parent repaint must preserve them. */
static int checks,failures;
static void verify(int ok,const char*phase,const char*what){
 checks++;if(!ok){failures++;printf("FAIL %s: %s\n",phase,what);}
}
static int descendants_clean(HWND h){
 if(!(GetWindowLongPtrW(h,GWL_STYLE)&WS_VISIBLE))return 1;
 if(GetUpdateRect(h,0,FALSE))return 0;
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT))if(!descendants_clean(c))return 0;
 return 1;
}

/* Observe native draws during an action. The expected complete layout is
   recorded first, so intermediate geometry cannot pass via a forced repaint. */
typedef struct {HWND hwnd;RECT rect;int visible;} TransitionWindow;
static TransitionWindow transitionWindows[512];static int transitionCount,transitionWatching,transitionDraws,transitionPartial;
static int own_visible(HWND h){return (GetWindowLongPtrW(h,GWL_STYLE)&WS_VISIBLE)!=0;}
static int transition_complete(void){
 for(int i=0;i<transitionCount;i++){TransitionWindow*t=&transitionWindows[i];
  if(!IsWindow(t->hwnd)||own_visible(t->hwnd)!=t->visible)return 0;
  if(IsWindowVisible(t->hwnd)){RECT r;GetWindowRect(t->hwnd,&r);if(!EqualRect(&r,&t->rect))return 0;}
 }return 1;
}
static void observe_draw(HWND h){
 if(!transitionWatching||!IsWindowVisible(h))return;
 transitionDraws++;if(!transition_complete())transitionPartial++;
}
static LRESULT CALLBACK transition_proc(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 if(m==WM_PAINT&&GetUpdateRect(h,0,FALSE))observe_draw(h);
 if(m==WM_DRAWITEM)observe_draw(((DRAWITEMSTRUCT*)l)->hwndItem);
 if(m==WM_NOTIFY){NMHDR*n=(NMHDR*)l;if(n->code==NM_CUSTOMDRAW)observe_draw(n->hwndFrom);}
 if(m==WM_NCDESTROY)RemoveWindowSubclass(h,transition_proc,id);
 return DefSubclassProc(h,m,w,l);
}
static void transition_snapshot(HWND h){
 if(transitionCount>=512)return;
 TransitionWindow*t=&transitionWindows[transitionCount++];t->hwnd=h;t->visible=own_visible(h);GetWindowRect(h,&t->rect);
 SetWindowSubclass(h,transition_proc,92,0);
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT))transition_snapshot(c);
}
static void normal_paints(void){MSG m;int n=0;while(n++<2048&&PeekMessageW(&m,0,WM_PAINT,WM_PAINT,PM_REMOVE))DispatchMessageW(&m);}

void ui_paint_performance(void){
 double samples[20];ui_refresh(0);normal_paints();GdiFlush();
 for(int i=0;i<20;i++){int64_t started=clock_us();ui_refresh(0);normal_paints();GdiFlush();samples[i]=(clock_us()-started)/1000.;}
 for(int i=0;i<20;i++)for(int j=i+1;j<20;j++)if(samples[j]<samples[i]){double value=samples[i];samples[i]=samples[j];samples[j]=value;}
 PROCESS_MEMORY_COUNTERS_EX memory={sizeof(memory)};GetProcessMemoryInfo(GetCurrentProcess(),(PROCESS_MEMORY_COUNTERS*)&memory,sizeof(memory));
 printf("UI PERFORMANCE tasks=%d refreshAndPaintP50Ms=%.3f refreshAndPaintP95Ms=%.3f workingSetMiB=%.3f privateMiB=%.3f\n",app.views[0].count+app.views[1].count+app.views[2].count+app.views[3].count,samples[10],samples[18],memory.WorkingSetSize/1048576.,memory.PrivateUsage/1048576.);
}

static void transition_action(int kind,int target){
 if(kind==0){app.zoom=target?0:-1;ui_layout();}
 if(kind==1){app.page=target?2:0;ui_refresh(1);}
 if(kind==2){SetWindowPos(app.window,0,0,0,U(target?760:1280),U(720),SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);}
 if(kind==3&&app.editor&&app.editor->expanded!=target)SendMessageW(app.editor->hwnd,WM_COMMAND,MAKEWPARAM(554,BN_CLICKED),(LPARAM)GetDlgItem(app.editor->scroll,554));
 if(kind==4&&app.editor)SendMessageW(app.editor->hwnd,WM_VSCROLL,target?SB_BOTTOM:SB_TOP,0);
}
static void check_transition(int kind,const char*phase){
 transitionWatching=0;transition_action(kind,1);normal_paints();transitionCount=0;transition_snapshot(app.window);
 transition_action(kind,0);normal_paints();transitionDraws=transitionPartial=0;transitionWatching=1;
 transition_action(kind,1);normal_paints();transitionWatching=0;
 printf("TRANSITION %s draws=%d partial=%d windows=%d\n",phase,transitionDraws,transitionPartial,transitionCount);
 verify(transitionDraws>0,phase,"native transition draw observed");
 verify(!transitionPartial,phase,"all native draws use the completed layout");
 verify(transition_complete(),phase,"completed layout matches expected controls and visibility");
 verify(descendants_clean(app.window),phase,"transition drains without an extra forced repaint");
 for(int i=0;i<transitionCount;i++)if(IsWindow(transitionWindows[i].hwnd))RemoveWindowSubclass(transitionWindows[i].hwnd,transition_proc,92);
 transitionCount=0;transition_action(kind,0);normal_paints();
}

static void check_parent(HWND h,const char*phase){
 if(!h||!(GetWindowLongPtrW(h,GWL_STYLE)&WS_VISIBLE))return;
 RECT r;GetClientRect(h,&r);if(r.right<1||r.bottom<1)return;
 BITMAPINFO info={0};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
 info.bmiHeader.biWidth=r.right;info.bmiHeader.biHeight=-r.bottom;
 info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
 HDC screen=GetDC(h),dc=CreateCompatibleDC(screen);DWORD*bits=0;
 HBITMAP bitmap=CreateDIBSection(screen,&info,DIB_RGB_COLORS,(void**)&bits,0,0);
 ReleaseDC(h,screen);verify(bitmap&&dc&&bits,phase,"allocate paint surface");
 if(!bitmap||!dc||!bits){if(bitmap)DeleteObject(bitmap);if(dc)DeleteDC(dc);return;}
 HGDIOBJ old=SelectObject(dc,bitmap);const DWORD marker=0x00ec19b7;
 size_t count=(size_t)r.right*r.bottom;
 for(size_t i=0;i<count;i++)bits[i]=marker;
 LRESULT erased=SendMessageW(h,WM_ERASEBKGND,(WPARAM)dc,0);GdiFlush();
 int preserved=1;for(size_t i=0;i<count;i++)if((bits[i]&0xffffff)!=marker){preserved=0;break;}
 verify(erased&&preserved,phase,"background erase leaves child content intact");
 for(size_t i=0;i<count;i++)bits[i]=marker;
 SendMessageW(h,WM_PRINTCLIENT,(WPARAM)dc,PRF_CLIENT);GdiFlush();
 RECT clip;GetClipBox(dc,&clip);verify(EqualRect(&clip,&r),phase,"parent restores the caller's clip region");
 int painted=0;for(size_t i=0;i<count;i++)if((bits[i]&0xffffff)!=marker){painted=1;break;}
 verify(painted,phase,"parent paints its exposed background");
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT)){
  if(!(GetWindowLongPtrW(c,GWL_STYLE)&WS_VISIBLE))continue;
  RECT child,visible;GetWindowRect(c,&child);MapWindowPoints(0,h,(POINT*)&child,2);
  if(!IntersectRect(&visible,&r,&child))continue;
  int x=(visible.left+visible.right-1)/2,y=(visible.top+visible.bottom-1)/2;
  int ok=(bits[(size_t)y*r.right+x]&0xffffff)==marker;
  if(!ok){wchar_t cls[40];GetClassNameW(c,cls,40);char*s=utf8(cls);char what[160];snprintf(what,sizeof(what),"parent overwrote %s control %d",s,GetDlgCtrlID(c));free(s);verify(0,phase,what);}else verify(1,phase,"child content survives parent repaint");
 }
 SelectObject(dc,old);DeleteObject(bitmap);DeleteDC(dc);
}
static void check_tree(const char*phase){
 MSG message;int n=0;while(n++<1024&&PeekMessageW(&message,0,WM_PAINT,WM_PAINT,PM_REMOVE))DispatchMessageW(&message);
 verify(descendants_clean(app.window),phase,"normal paint queue drains after the action");
 RedrawWindow(app.window,0,0,RDW_INVALIDATE|RDW_ERASE|RDW_ALLCHILDREN|RDW_UPDATENOW);
 verify(descendants_clean(app.window),phase,"native paint queue drains without hover input");
 check_parent(app.window,phase);check_parent(app.topbar,phase);check_parent(app.sidebar,phase);
 if(app.page>=1&&app.page<=4)check_parent(app.catalog,phase);
 if(app.editor){check_parent(app.editor->hwnd,phase);check_parent(app.editor->scroll,phase);}
}
int repaint_regression(void){
 checks=failures=0;verify(IsWindowVisible(app.window),"startup","main window is visible before repaint actions");
 SendMessageW(app.period,CB_SETCURSEL,3,0);ui_refresh(1);normal_paints();
 SetWindowPos(app.window,HWND_TOPMOST,0,0,U(1280),U(720),SWP_NOACTIVATE);normal_paints();
 ui_paint_performance();check_transition(0,"zoom transition");check_transition(1,"page transition");check_transition(2,"resize transition");check_tree("initial board");
 for(int i=0;i<3;i++){SendMessageW(app.buttons[2],BM_CLICK,0,0);check_tree("date button");}
 SendMessageW(app.buttons[3],BM_CLICK,0,0);check_tree("today button");
 SendMessageW(app.mode,CB_SETCURSEL,1,0);SendMessageW(app.window,WM_COMMAND,MAKEWPARAM(120,CBN_SELCHANGE),(LPARAM)app.mode);check_tree("timeline");
 SendMessageW(app.mode,CB_SETCURSEL,0,0);ui_refresh(1);
 for(int p=1;p<=6;p++){SendMessageW(app.nav[p],BM_CLICK,0,0);char phase[40];snprintf(phase,sizeof(phase),"navigation page %d",p);check_tree(phase);}
 SendMessageW(app.nav[0],BM_CLICK,0,0);
 Filter filter={0};strcpy(filter.kind,"tasks");filter.quadrant=-1;filter.status=2;filter.period=3;
 J*rows=query_rows(&app.db,&filter,0,1);J*first=cJSON_GetArrayItem(rows,0);char*key=first?_strdup(str(first,"key")):0;cJSON_Delete(rows);
 verify(key!=0,"fixture","task available for detail repaint");
 if(key){
  ui_open(key,0,0,0);verify(app.editor!=0,"detail","detail opens");check_tree("open detail");
  if(app.editor){
   check_transition(3,"advanced transition");check_transition(4,"scroll transition");check_transition(2,"overlay transition");
   SendMessageW(GetDlgItem(app.editor->scroll,581),BM_CLICK,0,0);check_tree("change priority");
   SendMessageW(GetDlgItem(app.editor->scroll,554),BM_CLICK,0,0);verify(app.editor&&app.editor->expanded,"expand advanced","advanced fields expand");check_tree("expand advanced");
   SendMessageW(app.editor->hwnd,WM_VSCROLL,SB_BOTTOM,0);verify(app.editor&&app.editor->offset>0,"scroll detail","body scrolls independently");check_tree("scroll detail");
   SetFocus(app.editor->fields[22]);check_tree("focus detail field");
   SendMessageW(GetDlgItem(app.editor->hwnd,555),BM_CLICK,0,0);check_tree("save detail");
   SendMessageW(GetDlgItem(app.editor->hwnd,552),BM_CLICK,0,0);check_tree("close detail");
  }
  SetWindowPos(app.window,0,0,0,U(760),U(680),SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);
  ui_open(key,0,0,0);check_tree("compact overlay");detail_save(1);check_tree("close compact overlay");free(key);
 }
 printf("REPAINT REGRESSION %d checks, %d failures\n",checks,failures);return failures?1:0;
}
