#ifndef GX_D409_UI_H
#define GX_D409_UI_H
#include "ui.h"
#ifdef GX_D409_UI
/* Presentation only. No model, persistence or command implementation lives here. */
#define D409_INK RGB(32,52,65)
#define D409_MUTED RGB(96,116,129)
#define D409_ACCENT RGB(23,107,135)
#define D409_CANVAS RGB(242,246,248)
#define D409_LINE RGB(216,226,232)
#define D409_SELECTED RGB(228,241,245)
typedef struct {HFONT title,number;HBRUSH canvas,surface,nav;} D409Visual;
static D409Visual *d409_visual(HWND h){return (D409Visual*)GetPropW(h,L"D409Visual");}
static void d409_visual_init(HWND h){
 if(d409_visual(h))return;D409Visual *v=calloc(1,sizeof(*v));if(!v)return;
 v->title=CreateFontW(-U(25),0,0,0,FW_SEMIBOLD,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Segoe UI");
 v->number=CreateFontW(-U(64),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Bahnschrift");
 v->canvas=CreateSolidBrush(D409_CANVAS);v->surface=CreateSolidBrush(RGB(255,255,255));v->nav=CreateSolidBrush(RGB(234,240,243));SetPropW(h,L"D409Visual",v);
}
static void d409_visual_free(HWND h){D409Visual *v=d409_visual(h);if(!v)return;DeleteObject(v->title);DeleteObject(v->number);DeleteObject(v->canvas);DeleteObject(v->surface);DeleteObject(v->nav);RemovePropW(h,L"D409Visual");free(v);}
static void d409_role(HWND h,int role){SetPropW(h,L"D409Role",(HANDLE)(INT_PTR)role);InvalidateRect(h,0,TRUE);}
static void d409_selected(HWND h,int selected){SetPropW(h,L"D409Selected",(HANDLE)(INT_PTR)(selected?1:0));InvalidateRect(h,0,TRUE);}
static void d409_text(HDC dc,const wchar_t *text,RECT r,HFONT font,COLORREF color,UINT flags){HGDIOBJ old=SelectObject(dc,font);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,color);DrawTextW(dc,text,-1,&r,flags);SelectObject(dc,old);}
static int d409_button(DRAWITEMSTRUCT *d){
 if(d->CtlType!=ODT_BUTTON)return 0;int role=(int)(INT_PTR)GetPropW(d->hwndItem,L"D409Role");if(!role)return 0;
 int saved=SaveDC(d->hDC),disabled=(d->itemState&ODS_DISABLED)!=0,selected=(INT_PTR)GetPropW(d->hwndItem,L"D409Selected")!=0;
 int id=GetDlgCtrlID(d->hwndItem);if(role==2&&id>=700&&id<=709)selected=app.page==id-700;
 int hover=(INT_PTR)GetPropW(d->hwndItem,L"GxHover")!=0,pressed=(d->itemState&ODS_SELECTED)!=0;
 COLORREF bg=role==1?D409_ACCENT:selected?D409_SELECTED:role==2?RGB(234,240,243):RGB(255,255,255);
 COLORREF fg=role==1?RGB(255,255,255):role==3?RGB(182,67,67):selected?D409_ACCENT:D409_INK;
 if(hover||pressed){bg=role==1?RGB(17,86,110):RGB(217,234,241);}if(disabled){bg=RGB(239,243,245);fg=RGB(143,157,167);}
 RECT r=d->rcItem;ui_round(d->hDC,r,bg,role==2?bg:D409_LINE,6);
 if(selected&&role==2){RECT edge=r;edge.right=edge.left+U(3);HBRUSH b=CreateSolidBrush(D409_ACCENT);FillRect(d->hDC,&edge,b);DeleteObject(b);}
 wchar_t label[400];GetWindowTextW(d->hwndItem,label,400);RECT t=r;t.left+=U(12);t.right-=U(10);d409_text(d->hDC,label,t,app.font,fg,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS|(role==2?DT_LEFT:DT_CENTER));
 if(d->itemState&ODS_FOCUS){RECT focus=r;InflateRect(&focus,-U(3),-U(3));DrawFocusRect(d->hDC,&focus);}RestoreDC(d->hDC,saved);return 1;
}
static void d409_surface(HWND h,HDC dc,int sidebar){D409Visual *v=d409_visual(h);if(!v)return;RECT r;GetClientRect(h,&r);FillRect(dc,&r,v->canvas);if(sidebar){RECT nav=r;nav.right=sidebar;FillRect(dc,&nav,v->nav);HBRUSH b=CreateSolidBrush(D409_LINE);RECT line={sidebar-1,0,sidebar,r.bottom};FillRect(dc,&line,b);DeleteObject(b);}}
static LRESULT d409_control_color(HWND owner,UINT message,WPARAM w,LPARAM l){
 D409Visual *v=d409_visual(owner);if(!v)return (LRESULT)app.white;HDC dc=(HDC)w;SetTextColor(dc,D409_INK);
 int surface=message==WM_CTLCOLOREDIT||message==WM_CTLCOLORLISTBOX;wchar_t cls[40];GetClassNameW((HWND)l,cls,40);if(!_wcsicmp(cls,L"EDIT"))surface=1;
 SetBkColor(dc,surface?RGB(255,255,255):D409_CANVAS);return (LRESULT)(surface?v->surface:v->canvas);
}
static HWND d409_label(HWND owner,int id,const wchar_t *text,int title){HWND h=ui_control(owner,L"STATIC",text,0,id,0,0,0,0);D409Visual *v=d409_visual(owner);if(title&&v)SendMessageW(h,WM_SETFONT,(WPARAM)v->title,TRUE);return h;}
static void d409_append(char **target,const char *label,const char *value){if(!value||!*value)return;size_t a=*target?strlen(*target):0,b=strlen(label),c=strlen(value);char *next=realloc(*target,a+b+c+6);if(!next)return;*target=next;memcpy(next+a,label,b);memcpy(next+a+b,value,c);memcpy(next+a+b+c,"\r\n\r\n",5);}
static const char *d409_status(const char *s){return !strcmp(s,"pending")?"待处理":!strcmp(s,"running")?"进行中":!strcmp(s,"paused")?"已暂停":!strcmp(s,"waiting")?"等待中":!strcmp(s,"completed")?"已完成":!strcmp(s,"cancelled")?"已取消":s;}
static void d409_clip_control(HWND h,HWND parent,int top,int bottom){RECT r;GetWindowRect(h,&r);MapWindowPoints(0,parent,(POINT*)&r,2);int height=r.bottom-r.top,width=r.right-r.left,visibleTop=max(0,top-r.top),visibleBottom=min(height,bottom-r.top);if(visibleTop==0&&visibleBottom>=height){SetWindowRgn(h,0,TRUE);return;}HRGN region=CreateRectRgn(0,visibleTop,width,max(visibleTop,visibleBottom));if(!SetWindowRgn(h,region,TRUE))DeleteObject(region);}
static void d409_fit_window(HWND h){
 if(!h)return;MONITORINFO monitor={sizeof(monitor)};if(!GetMonitorInfoW(MonitorFromWindow(h,MONITOR_DEFAULTTONEAREST),&monitor))return;
 RECT r,work=monitor.rcWork;GetWindowRect(h,&r);int width=min(r.right-r.left,work.right-work.left),height=min(r.bottom-r.top,work.bottom-work.top);
 int x=max(work.left,min(r.left,work.right-width)),y=max(work.top,min(r.top,work.bottom-height));SetWindowPos(h,0,x,y,width,height,SWP_NOZORDER|SWP_NOACTIVATE);
}
#endif
#endif
