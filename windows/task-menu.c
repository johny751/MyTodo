#include "ui.h"
/* Task actions use a focused modal card. Dispatch the selected action only
   after the card and its backdrop have closed and the owner is enabled. */
typedef struct {HWND window,shade;HFONT heading;J*task;int action,quadrant;} TaskMenu;
static void menu_text(HDC dc,const wchar_t*text,RECT rect,HFONT font,COLORREF color,UINT flags){
 HGDIOBJ old=SelectObject(dc,font);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,color);DrawTextW(dc,text,-1,&rect,flags);SelectObject(dc,old);
}
static void menu_fill(HDC dc,RECT rect,COLORREF color){HBRUSH brush=CreateSolidBrush(color);FillRect(dc,&rect,brush);DeleteObject(brush);}
static void menu_draw_button(DRAWITEMSTRUCT*d){
 HWND h=d->hwndItem;int id=(int)d->CtlID,action=id-GX_MENU_ACTION_BASE,hover=GetPropW(h,L"GxHover")!=0,pressed=d->itemState&ODS_SELECTED;
 RECT r=d->rcItem;wchar_t label[200];GetWindowTextW(h,label,200);COLORREF bg=RGB(255,255,255),fg=RGB(104,133,149),border=RGB(219,227,231);
 if(id==IDCANCEL){menu_fill(d->hDC,r,hover?RGB(243,248,250):bg);ui_icon(d->hDC,11,(r.right-U(14))/2,(r.bottom-U(14))/2,U(14),hover?RGB(91,114,126):RGB(160,174,181));}
 else if(action>=10&&action<14){int q=action-10;COLORREF pale[]={RGB(255,238,232),RGB(255,241,206),RGB(217,243,251),RGB(240,255,218)};bg=pale[q];fg=ui_quadrant_color(q);if(hover||pressed)ui_round(d->hDC,r,bg,fg,3);else menu_fill(d->hDC,r,bg);menu_text(d->hDC,label,r,app.font,fg,DT_CENTER|DT_VCENTER|DT_SINGLELINE);}
 else if(action==3){fg=RGB(237,100,105);menu_fill(d->hDC,r,hover?RGB(255,242,241):bg);r.left+=U(5);menu_text(d->hDC,label,r,app.font,fg,DT_LEFT|DT_VCENTER|DT_SINGLELINE);}
 else{if(hover)bg=RGB(244,250,252);if(pressed)bg=RGB(230,243,248);ui_round(d->hDC,r,bg,hover?RGB(157,192,206):border,3);menu_text(d->hDC,label,r,app.font,fg,DT_CENTER|DT_VCENTER|DT_SINGLELINE);}
 if((d->itemState&ODS_FOCUS)&&!(d->itemState&ODS_NOFOCUSRECT)){RECT focus=d->rcItem;HPEN pen=CreatePen(PS_SOLID,1,RGB(143,190,207));HGDIOBJ oldPen=SelectObject(d->hDC,pen),oldBrush=SelectObject(d->hDC,GetStockObject(HOLLOW_BRUSH));RoundRect(d->hDC,focus.left,focus.top,focus.right,focus.bottom,U(3),U(3));SelectObject(d->hDC,oldPen);SelectObject(d->hDC,oldBrush);DeleteObject(pen);}
}
static void menu_paint(HWND h,HDC dc,TaskMenu*d){
 RECT r;GetClientRect(h,&r);FillRect(dc,&r,app.white);RECT heading={U(26),U(22),r.right-U(58),U(55)};
 menu_text(dc,L"任务菜单",heading,d->heading,RGB(73,83,89),DT_SINGLELINE|DT_VCENTER);
 wchar_t*title=wide(str(d->task,"title"));for(wchar_t*p=title;*p;p++)if(*p=='\n'||*p=='\r')*p=' ';
 RECT subtitle={U(26),U(74),r.right-U(26),U(99)};menu_text(dc,title,subtitle,app.font,RGB(110,133,150),DT_SINGLELINE|DT_END_ELLIPSIS|DT_VCENTER);free(title);
 RECT move={U(26),U(224),r.right-U(26),U(246)};menu_text(dc,L"移动到象限",move,app.smallFont,RGB(142,161,174),DT_SINGLELINE|DT_VCENTER);
}
static HWND menu_button(HWND h,int action,const wchar_t*label,int x,int y,int width,int height){return ui_control(h,L"BUTTON",label,WS_TABSTOP,GX_MENU_ACTION_BASE+action,x,y,width,height);}
static LRESULT CALLBACK menu_proc(HWND h,UINT m,WPARAM w,LPARAM l){
 TaskMenu*d=(TaskMenu*)GetWindowLongPtrW(h,GWLP_USERDATA);
 if(m==WM_CREATE){d=((CREATESTRUCTW*)l)->lpCreateParams;SetWindowLongPtrW(h,GWLP_USERDATA,(LONG_PTR)d);d->window=h;SetPropW(h,L"GxTaskMenu",(HANDLE)1);SetPropW(h,L"GxMenuCurrentQuadrant",(HANDLE)(INT_PTR)(d->quadrant+1));
  ui_control(h,L"BUTTON",L"关闭任务菜单",WS_TABSTOP,IDCANCEL,392,17,32,32);
  menu_button(h,1,L"编辑详情",26,114,194,40);menu_button(h,2,truth(d->task,"done")?L"重新打开任务":L"完成任务",230,114,194,40);
  menu_button(h,4,L"上移一位",26,164,194,40);menu_button(h,5,L"下移一位",230,164,194,40);
  const wchar_t*names[]={L"很重要-很紧急",L"重要-不紧急",L"不重要-紧急",L"不重要-不紧急"};
  for(int q=0;q<4;q++){wchar_t label[80];swprintf(label,80,L"%s%s",names[q],q==d->quadrant?L"  ✓":L"");HWND b=menu_button(h,10+q,label,q%2?230:26,q/2?306:255,194,43);if(q==d->quadrant)SetPropW(b,L"GxMenuCurrent",(HANDLE)1);}
  menu_button(h,3,L"删除任务",26,370,110,28);return 0;
 }
 if(m==WM_COMMAND&&d){int id=LOWORD(w);if(id==IDCANCEL){DestroyWindow(h);return 0;}int action=id-GX_MENU_ACTION_BASE;
  if(action==1||action==2||action==3||action==4||action==5||action>=10&&action<14){d->action=action>=10&&action-10==d->quadrant?0:action;DestroyWindow(h);return 0;}
 }
 if(m==WM_ERASEBKGND)return 1;
 if((m==WM_PAINT||m==WM_PRINTCLIENT)&&d){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;int saved=ui_paint_begin(h,dc);menu_paint(h,dc,d);RestoreDC(dc,saved);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}
 if(m==WM_DRAWITEM){menu_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}
 if(m==WM_CLOSE){DestroyWindow(h);return 0;}
 if(m==WM_NCDESTROY){RemovePropW(h,L"GxTaskMenu");RemovePropW(h,L"GxMenuCurrentQuadrant");}
 return DefWindowProcW(h,m,w,l);
}
static LRESULT CALLBACK shade_proc(HWND h,UINT m,WPARAM w,LPARAM l){
 TaskMenu*d=(TaskMenu*)GetWindowLongPtrW(h,GWLP_USERDATA);
 if(m==WM_CREATE){d=((CREATESTRUCTW*)l)->lpCreateParams;SetWindowLongPtrW(h,GWLP_USERDATA,(LONG_PTR)d);return 0;}
 if((m==WM_LBUTTONDOWN||m==WM_CLOSE)&&d){if(IsWindow(d->window))SendMessageW(d->window,WM_CLOSE,0,0);return 0;}
 if(m==WM_PAINT){PAINTSTRUCT ps;HDC dc=BeginPaint(h,&ps);RECT r;GetClientRect(h,&r);menu_fill(dc,r,RGB(0,0,0));EndPaint(h,&ps);return 0;}
 return DefWindowProcW(h,m,w,l);
}
int ui_task_menu(const char*key,J*task){
 (void)key;TaskMenu d={0};d.task=task;d.quadrant=max(0,min(3,(int)num(task,"quadrant")));
 d.heading=CreateFontW(-U(20),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,0,0,CLEARTYPE_QUALITY,0,L"Microsoft YaHei UI");
 WNDCLASSW shade={0};shade.lpfnWndProc=shade_proc;shade.hInstance=app.instance;shade.hCursor=LoadCursorW(0,IDC_ARROW);shade.lpszClassName=L"GxTaskMenuShade";RegisterClassW(&shade);
 WNDCLASSW card={0};card.lpfnWndProc=menu_proc;card.hInstance=app.instance;card.hCursor=shade.hCursor;card.hbrBackground=app.white;card.lpszClassName=L"GxTaskMenuCard";card.style=CS_DROPSHADOW;RegisterClassW(&card);
 HWND oldFocus=GetFocus();int enabled=IsWindowEnabled(app.window);EnableWindow(app.window,FALSE);
 RECT owner;GetClientRect(app.window,&owner);MapWindowPoints(app.window,0,(POINT*)&owner,2);
 d.shade=CreateWindowExW(WS_EX_LAYERED|WS_EX_TOOLWINDOW,shade.lpszClassName,L"",WS_POPUP,owner.left,owner.top,owner.right-owner.left,owner.bottom-owner.top,app.window,0,app.instance,&d);
 if(d.shade){SetLayeredWindowAttributes(d.shade,0,64,LWA_ALPHA);ShowWindow(d.shade,SW_SHOWNOACTIVATE);}
 DWORD style=WS_POPUP|WS_BORDER,ex=WS_EX_CONTROLPARENT;RECT rect={0,0,U(450),U(414)};AdjustWindowRectEx(&rect,style,FALSE,ex);int width=rect.right-rect.left,height=rect.bottom-rect.top;
 int x=owner.left+(owner.right-owner.left-width)/2,y=owner.top+(owner.bottom-owner.top-height)/2;
 d.window=CreateWindowExW(ex,card.lpszClassName,L"任务菜单",style,x,y,width,height,app.window,0,app.instance,&d);
 if(d.window){ShowWindow(d.window,SW_SHOW);UpdateWindow(d.window);SetFocus(GetDlgItem(d.window,GX_MENU_ACTION_BASE+1));SendMessageW(app.window,GX_TASK_MENU_READY,(WPARAM)d.window,0);
  MSG message;while(IsWindow(d.window)){int received=GetMessageW(&message,0,0,0);if(received<=0){if(received==0)PostQuitMessage((int)message.wParam);break;}
   if(message.message==WM_KEYDOWN&&message.wParam==VK_ESCAPE){SendMessageW(d.window,WM_CLOSE,0,0);continue;}
   if(message.message==WM_KEYDOWN&&message.wParam==VK_RETURN){HWND focus=GetFocus();if(GetParent(focus)==d.window)SendMessageW(d.window,WM_COMMAND,MAKEWPARAM(GetDlgCtrlID(focus),BN_CLICKED),(LPARAM)focus);continue;}
   if(!IsDialogMessageW(d.window,&message)){TranslateMessage(&message);DispatchMessageW(&message);}
  }
  if(IsWindow(d.window))DestroyWindow(d.window);
 }
 if(IsWindow(d.shade))DestroyWindow(d.shade);if(enabled)EnableWindow(app.window,TRUE);SetActiveWindow(app.window);if(IsWindow(oldFocus))SetFocus(oldFocus);DeleteObject(d.heading);return d.action;
}
