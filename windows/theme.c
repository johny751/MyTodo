
#include "ui.h"
#include "d409-ui.h"
App app;
static COLORREF accents[]={RGB(231,118,85),RGB(216,180,81),RGB(99,179,202),RGB(158,186,104)};
static COLORREF pale[]={RGB(255,238,232),RGB(255,241,206),RGB(217,243,251),RGB(240,255,218)};
COLORREF ui_quadrant_color(int q){return accents[max(0,min(3,q))];}
/* Apply the same child clipping to real paints and offscreen diagnostics. */
int ui_paint_begin(HWND h,HDC dc){
 int saved=SaveDC(dc);
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT)){
  if(!(GetWindowLongPtrW(c,GWL_STYLE)&WS_VISIBLE))continue;
  RECT r;GetWindowRect(c,&r);MapWindowPoints(0,h,(POINT*)&r,2);
  ExcludeClipRect(dc,r.left,r.top,r.right,r.bottom);
 }
 return saved;
}

/* Hold native redraws while controls change size, text and visibility.
   WM_SETREDRAW removes WS_VISIBLE: keep the intended visibility separately,
   restore descendants while the root is still suspended, then queue one paint. */
static int updateDepth;static HWND updateRoot;
static void suspend_tree(HWND h){
 int visible=(GetWindowLongPtrW(h,GWL_STYLE)&WS_VISIBLE)!=0;
 SetPropW(h,L"GxUpdateVisible",(HANDLE)(INT_PTR)(visible?6:1));
 if(visible)SendMessageW(h,WM_SETREDRAW,FALSE,0);
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT))suspend_tree(c);
}
static void resume_tree(HWND h){
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT))resume_tree(c);
 INT_PTR state=(INT_PTR)GetPropW(h,L"GxUpdateVisible");if(!state)return;
 int wanted=state&2,disabled=state&4;
 RemovePropW(h,L"GxUpdateVisible");
 if(disabled)SendMessageW(h,WM_SETREDRAW,TRUE,0);
 int visible=(GetWindowLongPtrW(h,GWL_STYLE)&WS_VISIBLE)!=0;
 if(visible!=!!wanted)ShowWindow(h,wanted?SW_SHOWNA:SW_HIDE);
}
void ui_update_begin(HWND root){
 if(updateDepth++){return;}updateRoot=root;
 if(updateRoot&&IsWindow(updateRoot)){suspend_tree(updateRoot);}
}
void ui_update_end(void){
 if(!updateDepth)return;if(updateDepth>1){updateDepth--;return;}
 HWND h=updateRoot;if(h&&IsWindow(h))resume_tree(h);updateRoot=0;updateDepth=0;
 if(h&&IsWindow(h))RedrawWindow(h,0,0,RDW_INVALIDATE|RDW_ERASE|RDW_FRAME|RDW_ALLCHILDREN);
}
void ui_show(HWND h,int show){
 if(!h)return;INT_PTR state=(INT_PTR)GetPropW(h,L"GxUpdateVisible");
 if(state){INT_PTR wanted=(state&4)|(show!=SW_HIDE?2:1);if(wanted!=state)SetPropW(h,L"GxUpdateVisible",(HANDLE)wanted);return;}
 ShowWindow(h,show);
}

/* Native move messages still run layout callbacks when geometry is unchanged. */
void ui_move(HWND h,int x,int y,int width,int height){RECT rect;GetWindowRect(h,&rect);MapWindowPoints(0,GetParent(h),(POINT*)&rect,2);if(rect.left!=x||rect.top!=y||rect.right-rect.left!=width||rect.bottom-rect.top!=height)MoveWindow(h,x,y,width,height,FALSE);}
int U(int n){return MulDiv(n,app.dpi?app.dpi:96,96);}
void ui_set(HWND h,const char*s){wchar_t*w=wide(s);SetWindowTextW(h,w);free(w);}
char*ui_text(HWND h){int n=GetWindowTextLengthW(h);wchar_t*w=calloc(n+1,2);GetWindowTextW(h,w,n+1);char*s=utf8(w);free(w);return s;}
static void fill(HDC dc,RECT r,COLORREF c){HBRUSH b=CreateSolidBrush(c);FillRect(dc,&r,b);DeleteObject(b);}
static void text_rect(HDC dc,const wchar_t*s,RECT r,HFONT font,COLORREF color,UINT flags){HGDIOBJ old=SelectObject(dc,font);SetTextColor(dc,color);SetBkMode(dc,TRANSPARENT);DrawTextW(dc,s,-1,&r,flags);SelectObject(dc,old);}
void ui_round(HDC dc,RECT r,COLORREF bg,COLORREF border,int radius){
 HBRUSH b=CreateSolidBrush(bg);HPEN p=CreatePen(PS_SOLID,1,border);HGDIOBJ ob=SelectObject(dc,b),op=SelectObject(dc,p);
 RoundRect(dc,r.left,r.top,r.right,r.bottom,U(radius),U(radius));SelectObject(dc,ob);SelectObject(dc,op);DeleteObject(b);DeleteObject(p);
}
void ui_icon(HDC dc,int icon,int x,int y,int size,COLORREF color){
 HPEN p=CreatePen(PS_SOLID,max(1,U(1)),color);HGDIOBJ op=SelectObject(dc,p),ob=SelectObject(dc,GetStockObject(HOLLOW_BRUSH));
 int s=size,a=s/5,z=s-a;
 #define LINE(x1,y1,x2,y2) MoveToEx(dc,x+(x1),y+(y1),0);LineTo(dc,x+(x2),y+(y2))
 if(icon==0){Rectangle(dc,x+a,y+1,x+z,y+s-1);for(int k=1;k<=3;k++){int yy=k*s/4;Rectangle(dc,x+a+2,y+yy-1,x+a+4,y+yy+1);LINE(a+7,yy,z-2,yy);}}
 else if(icon==1){Rectangle(dc,x+a,y+1,x+z,y+s-1);LINE(a+4,s/3,z-3,s/3);LINE(a+4,s/2,z-3,s/2);LINE(a+4,s*2/3,z-5,s*2/3);}
 else if(icon==2){POINT pts[]={{x+1,y+s/3},{x+1,y+a},{x+s/3,y+a},{x+s/2,y+s/3},{x+s-1,y+s/3},{x+s-1,y+s-a},{x+1,y+s-a},{x+1,y+s/3}};Polyline(dc,pts,8);}
 else if(icon==3){Ellipse(dc,x+a,y+1,x+z,y+z);Ellipse(dc,x+s/2-a/2,y+s/3-a/2,x+s/2+a/2,y+s/3+a/2);LINE(a+1,s/2,s/2,s-1);LINE(s/2,s-1,z-1,s/2);}
 else if(icon==4){POINT pts[]={{x+a,y+1},{x+z,y+1},{x+z,y+s-1},{x+s/2,y+s*3/4},{x+a,y+s-1},{x+a,y+1}};Polyline(dc,pts,6);}
 else if(icon==5){Ellipse(dc,x+1,y+1,x+s*3/4,y+s*3/4);LINE(s*2/3,s*2/3,s-1,s-1);}
 else if(icon==6){LINE(2,s-2,s-1,s-2);LINE(4,s-2,4,s/2);LINE(s/2,s-2,s/2,s/4);LINE(s-4,s-2,s-4,2);}
 else if(icon==7){Arc(dc,x+2,y+2,x+s-2,y+s-2,x+s/2,y+1,x+s/2,y+s-1);LINE(s-3,3,s-3,s/3);LINE(s-3,s/3,s*2/3,s/3);Arc(dc,x+2,y+2,x+s-2,y+s-2,x+s/2,y+s-1,x+s/2,y+1);LINE(3,s-3,3,s*2/3);LINE(3,s*2/3,s/3,s*2/3);}
 else if(icon==8){Ellipse(dc,x+a,y+a,x+z,y+z);Ellipse(dc,x+s/2-a/2,y+s/2-a/2,x+s/2+a/2,y+s/2+a/2);for(int k=0;k<8;k++){double angle=k*3.14159265/4;LINE((int)(s/2+cos(angle)*s*.37),(int)(s/2+sin(angle)*s*.37),(int)(s/2+cos(angle)*s*.49),(int)(s/2+sin(angle)*s*.49));}}
 else if(icon==10){LINE(s/2,a,s/2,z);LINE(a,s/2,z,s/2);}
 else if(icon==11){LINE(a,a,z,z);LINE(z,a,a,z);}
 else if(icon==12){LINE(z,a,a,s/2);LINE(a,s/2,z,z);}
 else if(icon==13){LINE(a,a,z,s/2);LINE(z,s/2,a,z);}
 else if(icon==14){LINE(a,s/3,s/2,s*2/3);LINE(s/2,s*2/3,z,s/3);}
 else if(icon==15){for(int k=0;k<3;k++)Ellipse(dc,x+a+k*s/4,y+s/2-1,x+a+k*s/4+2,y+s/2+1);}
 #undef LINE
 SelectObject(dc,op);SelectObject(dc,ob);DeleteObject(p);
}
static void combo_paint(HWND h,HDC dc){
 RECT r;GetClientRect(h,&r);int focus=GetFocus()==h||IsChild(h,GetFocus()),hover=GetPropW(h,L"GxHover")!=0;
 ui_round(dc,r,RGB(255,255,255),focus?RGB(53,184,217):hover?RGB(163,197,209):RGB(219,227,231),4);
 wchar_t label[1000]=L"";int sel=(int)SendMessageW(h,CB_GETCURSEL,0,0);if(sel>=0){LRESULT len=SendMessageW(h,CB_GETLBTEXTLEN,sel,0);if(len<999)SendMessageW(h,CB_GETLBTEXT,sel,(LPARAM)label);}
 if(!*label)GetWindowTextW(h,label,1000);
 COMBOBOXINFO ci={sizeof(ci)};GetComboBoxInfo(h,&ci);if((GetWindowLongPtrW(h,GWL_STYLE)&3)==CBS_DROPDOWNLIST||GetPropW(h,L"GxPrinting")){RECT tr=r;tr.left+=U(9);tr.right-=U(25);text_rect(dc,label,tr,app.font,RGB(81,95,103),DT_VCENTER|DT_SINGLELINE|DT_END_ELLIPSIS);}
 RECT arrow={r.right-U(24),2,r.right-2,r.bottom-2};fill(dc,arrow,RGB(255,255,255));ui_icon(dc,14,r.right-U(21),(r.bottom-U(14))/2,U(14),RGB(141,157,164));
}
static void check_paint(HWND h,HDC dc){RECT r;GetClientRect(h,&r);int checked=SendMessageW(h,BM_GETCHECK,0,0)==BST_CHECKED,hover=GetPropW(h,L"GxHover")!=0;fill(dc,r,RGB(255,255,255));RECT circle={U(2),(r.bottom-U(17))/2,U(19),(r.bottom+U(17))/2};ui_round(dc,circle,checked?RGB(53,184,217):RGB(255,255,255),checked?RGB(53,184,217):hover?RGB(139,197,216):RGB(190,207,216),5);if(checked){HPEN p=CreatePen(PS_SOLID,U(2),RGB(255,255,255));HGDIOBJ old=SelectObject(dc,p);MoveToEx(dc,circle.left+U(4),circle.top+U(8),0);LineTo(dc,circle.left+U(7),circle.top+U(11));LineTo(dc,circle.left+U(13),circle.top+U(5));SelectObject(dc,old);DeleteObject(p);}wchar_t text[200];GetWindowTextW(h,text,200);RECT tr=r;tr.left=U(27);text_rect(dc,text,tr,app.font,RGB(121,145,159),DT_SINGLELINE|DT_VCENTER);if(GetFocus()==h){RECT f=r;InflateRect(&f,-1,-1);DrawFocusRect(dc,&f);}}
static LRESULT CALLBACK control_proc(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 wchar_t cls[30];GetClassNameW(h,cls,30);int combo=!wcscmp(cls,L"ComboBox"),check=!wcscmp(cls,L"Button")&&((GetWindowLongPtrW(h,GWL_STYLE)&BS_TYPEMASK)==BS_AUTOCHECKBOX);
#ifdef GX_D409_UI
 if(!wcscmp(cls,L"Edit")&&!GetPropW(h,L"GxComposing")&&!(GetKeyState(VK_MENU)&0x8000)){
  if(m==WM_KEYDOWN&&w=='A'&&(GetKeyState(VK_CONTROL)&0x8000)){SendMessageW(h,EM_SETSEL,0,-1);return 0;}
  if(m==WM_CHAR&&w==1)return 0;
 }
#endif
 if(m==WM_MOUSEMOVE&&!GetPropW(h,L"GxHover")){SetPropW(h,L"GxHover",(HANDLE)1);TRACKMOUSEEVENT tr={sizeof(tr),TME_LEAVE,h,0};TrackMouseEvent(&tr);InvalidateRect(h,0,FALSE);}
 if(m==WM_MOUSELEAVE){RemovePropW(h,L"GxHover");InvalidateRect(h,0,FALSE);}
 if(m==WM_SETFOCUS||m==WM_KILLFOCUS){InvalidateRect(h,0,FALSE);InvalidateRect(GetParent(h),0,FALSE);}
 if(check&&(m==WM_PAINT||m==WM_PRINTCLIENT)){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;check_paint(h,dc);if(m==WM_PAINT)EndPaint(h,&ps);return 0;}
 if(!wcscmp(cls,L"Edit")&&m==WM_PRINTCLIENT){RECT r;GetClientRect(h,&r);COLORREF bg=RGB(255,255,255);if(GetDlgCtrlID(h)==600&&app.editor){int q=(int)SendMessageW(app.editor->fields[4],CB_GETCURSEL,0,0);bg=app.editor->note?RGB(255,250,228):pale[max(0,min(3,q))];}fill((HDC)w,r,bg);r.left+=U(8);r.right-=U(8);wchar_t text[50001];GetWindowTextW(h,text,50001);DWORD style=(DWORD)GetWindowLongPtrW(h,GWL_STYLE);if(style&ES_PASSWORD)for(wchar_t*p=text;*p;p++)*p=L'●';if(!*text)SendMessageW(h,EM_GETCUEBANNER,(WPARAM)text,50001);text_rect((HDC)w,text,r,app.font,RGB(76,94,104),style&ES_MULTILINE?DT_WORDBREAK:DT_SINGLELINE|DT_VCENTER);return 0;}
 if(combo&&(m==WM_PAINT||m==WM_PRINTCLIENT)){PAINTSTRUCT ps;HDC dc=m==WM_PAINT?BeginPaint(h,&ps):(HDC)w;if(m==WM_PRINTCLIENT)SetPropW(h,L"GxPrinting",(HANDLE)1);combo_paint(h,dc);RemovePropW(h,L"GxPrinting");if(m==WM_PAINT)EndPaint(h,&ps);return 0;}
 if(m==WM_NCDESTROY){RemovePropW(h,L"GxHover");RemoveWindowSubclass(h,control_proc,id);}
 return DefSubclassProc(h,m,w,l);
}
HWND ui_control(HWND parent,const wchar_t*cls,const wchar_t*title,DWORD style,int id,int x,int y,int w,int h){
 int isbutton=!wcscmp(cls,L"BUTTON")&&!(style&BS_AUTOCHECKBOX)&&!(style&BS_AUTORADIOBUTTON);
 if(isbutton)style=(style&~BS_TYPEMASK)|BS_OWNERDRAW;
 if(!wcscmp(cls,L"COMBOBOX"))style|=WS_CLIPCHILDREN;
 HWND c=CreateWindowExW(0,cls,title,WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|style,U(x),U(y),U(w),U(h),parent,(HMENU)(INT_PTR)id,app.instance,0);
 SendMessageW(c,WM_SETFONT,(WPARAM)app.font,TRUE);
 if(!wcscmp(cls,L"EDIT")){SendMessageW(c,EM_SETLIMITTEXT,50000,0);SendMessageW(c,EM_SETMARGINS,EC_LEFTMARGIN|EC_RIGHTMARGIN,MAKELPARAM(U(8),U(8)));}
 if(isbutton||(!wcscmp(cls,L"BUTTON")&&(style&BS_TYPEMASK)==BS_AUTOCHECKBOX)||!wcscmp(cls,L"EDIT")||!wcscmp(cls,L"COMBOBOX"))SetWindowSubclass(c,control_proc,99,0);
 return c;
}
void ui_notice(const char*s){ui_set(app.status,s);}
void ui_fields_paint(HWND h,HDC dc){
 for(HWND c=GetWindow(h,GW_CHILD);c;c=GetWindow(c,GW_HWNDNEXT)){
  wchar_t cls[32];GetClassNameW(c,cls,32);if(!(GetWindowLongPtrW(c,GWL_STYLE)&WS_VISIBLE)||wcscmp(cls,L"Edit"))continue;
  RECT r;GetWindowRect(c,&r);MapWindowPoints(0,h,(POINT*)&r,2);InflateRect(&r,U(1),U(2));
  int focus=GetFocus()==c||IsChild(c,GetFocus());COLORREF bg=RGB(255,255,255),border=focus?RGB(53,184,217):RGB(218,228,233);
  if(GetDlgCtrlID(c)==600&&app.editor){int q=max(0,min(3,(int)SendMessageW(app.editor->fields[4],CB_GETCURSEL,0,0)));bg=app.editor->note?RGB(255,250,228):pale[q];border=focus?accents[q]:bg;}
  ui_round(dc,r,bg,border,5);
 }
}
void ui_theme_draw_button(DRAWITEMSTRUCT*d){
#ifdef GX_D409_UI
 if(d409_button(d))return;
#endif

 int id=d->CtlID;RECT r=d->rcItem;HDC dc=d->hDC;int nav=id>=700&&id<710,header=id>=2000&&id<2004,hover=GetPropW(d->hwndItem,L"GxHover")!=0,pressed=d->itemState&ODS_SELECTED;
 wchar_t label[500];GetWindowTextW(d->hwndItem,label,500);
 COLORREF bg=RGB(255,255,255),fg=RGB(104,119,127);
 if(nav){
  int page=id-700;bg=RGB(52,61,64);fg=RGB(166,176,179);if(page==app.page){bg=RGB(41,49,53);fg=RGB(43,183,217);}else if(hover)bg=RGB(45,55,59);fill(dc,r,bg);
  if(page==9){int cx=(r.right-r.left)/2,cy=U(32);POINT hex[7];for(int i=0;i<7;i++){double angle=(i*60-90)*3.14159265/180;hex[i].x=cx+(int)(cos(angle)*U(24));hex[i].y=cy+(int)(sin(angle)*U(24));}HBRUSH b=CreateSolidBrush(RGB(184,191,194));HGDIOBJ ob=SelectObject(dc,b),op=SelectObject(dc,GetStockObject(NULL_PEN));Polygon(dc,hex,7);SelectObject(dc,ob);SelectObject(dc,op);DeleteObject(b);b=CreateSolidBrush(RGB(250,250,250));ob=SelectObject(dc,b);op=SelectObject(dc,GetStockObject(NULL_PEN));Ellipse(dc,cx-U(8),cy-U(16),cx+U(8),cy+U(3));RoundRect(dc,cx-U(15),cy-U(1),cx+U(15),cy+U(18),U(15),U(15));SelectObject(dc,ob);SelectObject(dc,op);DeleteObject(b);RECT tr=r;tr.top=U(59);tr.bottom=r.bottom-U(3);text_rect(dc,label,tr,app.smallFont,fg,DT_SINGLELINE|DT_CENTER|DT_END_ELLIPSIS);
  }else if(page<5){ui_icon(dc,page,U(16),(r.bottom-U(20))/2,U(20),fg);RECT tr=r;tr.left=U(45);text_rect(dc,label,tr,app.font,fg,DT_SINGLELINE|DT_VCENTER|DT_LEFT);RECT line={r.left,r.bottom-1,r.right,r.bottom};fill(dc,line,RGB(61,72,75));}
  else{ui_icon(dc,page,(r.right-U(20))/2,U(8),U(20),fg);RECT tr=r;tr.top=U(31);tr.bottom=r.bottom;text_rect(dc,label,tr,app.smallFont,fg,DT_CENTER|DT_SINGLELINE);}
 }else if(id>=580&&id<584){int q=id-580,current=app.editor?(int)SendMessageW(app.editor->fields[4],CB_GETCURSEL,0,0):-1;fill(dc,r,hover?pale[q]:RGB(255,255,255));int yy=(r.bottom-U(22))/2;HPEN p=CreatePen(PS_SOLID,U(2),accents[q]);HGDIOBJ op=SelectObject(dc,p),ob=SelectObject(dc,GetStockObject(HOLLOW_BRUSH));Ellipse(dc,U(4),yy,U(26),yy+U(22));if(q==current){HBRUSH b=CreateSolidBrush(accents[q]);SelectObject(dc,b);Ellipse(dc,U(9),yy+U(5),U(21),yy+U(17));SelectObject(dc,ob);DeleteObject(b);RECT tr=r;tr.left=U(34);text_rect(dc,label,tr,app.smallFont,accents[q],DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);}SelectObject(dc,op);SelectObject(dc,ob);DeleteObject(p);
 }else if(header){
  int q=id-2000;bg=app.page==0&&!SendMessageW(app.mode,CB_GETCURSEL,0,0)?pale[q]:RGB(247,250,251);fg=app.page==0?accents[q]:RGB(108,125,134);
  fill(dc,r,bg);if(GetPropW(d->hwndItem,L"GxDropTarget")){ui_round(dc,r,bg,fg,3);}if(hover){RECT edge={0,r.bottom-U(2),r.right,r.bottom};fill(dc,edge,fg);}
  RECT tr=r;tr.left+=U(10);tr.right-=U(54);if(app.page==0&&app.zoom==q){ui_icon(dc,12,U(9),(r.bottom-U(16))/2,U(16),fg);tr.left+=U(23);}
  if(r.right<U(120)){tr.right=r.right-U(3);text_rect(dc,label,tr,app.smallFont,fg,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);}
  else{text_rect(dc,label,tr,app.title,fg,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);wchar_t n[30];swprintf(n,30,L"%d",app.views[q].count);RECT count={r.right-U(66),0,r.right-U(29),r.bottom};text_rect(dc,n,count,app.smallFont,fg,DT_CENTER|DT_SINGLELINE|DT_VCENTER);ui_icon(dc,10,r.right-U(28),(r.bottom-U(18))/2,U(18),RGB(153,160,161));}
 }else{
  int primary=id==IDOK||id==109||id==555||id==150;
  int segment=id>=140&&id<144;
  if(segment){int selected=(app.page==2?app.archive:SendMessageW(app.period,CB_GETCURSEL,0,0))==id-140;bg=selected?RGB(53,186,222):hover?RGB(238,248,251):RGB(255,255,255);fg=selected?RGB(255,255,255):RGB(99,112,120);ui_round(dc,r,bg,selected?bg:RGB(219,225,228),0);}
  else if(id==124){bg=RGB(52,75,85);fg=RGB(255,255,255);ui_round(dc,r,bg,bg,8);}
  else if(primary){bg=pressed?RGB(33,160,192):hover?RGB(40,174,207):RGB(53,186,222);fg=RGB(255,255,255);ui_round(dc,r,bg,bg,5);}
  else{bg=pressed?RGB(230,243,248):hover?RGB(243,248,250):RGB(255,255,255);if(id==551)fg=RGB(210,111,100);if(id==100||id==554||id==560||id==561||id==562||id==563||id==144)fg=RGB(43,172,204);ui_round(dc,r,bg,bg,5);}
  if(id==100)ui_icon(dc,10,(r.right-U(22))/2,(r.bottom-U(22))/2,U(22),RGB(43,183,217));
  else if(id==123||id==125)ui_icon(dc,15,(r.right-U(22))/2,(r.bottom-U(22))/2,U(22),fg);
  else if(id==107||id==108)ui_icon(dc,id==107?12:13,(r.right-U(17))/2,(r.bottom-U(17))/2,U(17),fg);
  else{text_rect(dc,label,r,app.font,fg,DT_CENTER|DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);}
 }
 if(d->itemState&ODS_DISABLED){fill(dc,r,RGB(249,251,252));text_rect(dc,label,r,app.font,RGB(185,197,203),DT_CENTER|DT_SINGLELINE|DT_VCENTER);}
 if(d->itemState&ODS_FOCUS){RECT f=r;InflateRect(&f,-U(2),-U(2));HBRUSH ob=SelectObject(dc,GetStockObject(HOLLOW_BRUSH));HPEN p=CreatePen(PS_SOLID,1,nav?RGB(43,183,217):RGB(133,200,219));HGDIOBJ op=SelectObject(dc,p);RoundRect(dc,f.left,f.top,f.right,f.bottom,U(5),U(5));SelectObject(dc,op);SelectObject(dc,ob);DeleteObject(p);}
}
void ui_view_clear(View*v){for(int i=0;i<v->used;i++){free(v->cache[i].key);cJSON_Delete(v->cache[i].data);}v->used=0;}
void ui_view_bind(View*v,const Filter*f){int top=v->hwnd?ListView_GetTopIndex(v->hwnd):0;ui_view_clear(v);v->filter=*f;v->count=query_count(&app.db,f);if(v->hwnd){RemovePropW(v->hwnd,L"GxHotRow");ListView_SetItemCountEx(v->hwnd,v->count,LVSICF_NOINVALIDATEALL|LVSICF_NOSCROLL);if(top>=v->count)top=max(0,v->count-1);if(top>0)ListView_EnsureVisible(v->hwnd,top,FALSE);InvalidateRect(v->hwnd,0,FALSE);}}
Cached*ui_view_get(View*v,int index){if(index<0||index>=v->count)return 0;for(int i=0;i<v->used;i++)if(v->cache[i].index==index)return &v->cache[i];ui_view_clear(v);int first=max(0,index-8);J*a=query_rows(&app.db,&v->filter,first,GX_CACHE),*row;int n=first;cJSON_ArrayForEach(row,a){Cached*c=&v->cache[v->used++];c->index=n++;c->key=_strdup(str(row,"key"));c->data=dup(get(row,"data"));}cJSON_Delete(a);for(int i=0;i<v->used;i++)if(v->cache[i].index==index)return &v->cache[i];return 0;}
void ui_draw_row(NMLVCUSTOMDRAW*d,View*v){Cached*c=ui_view_get(v,(int)d->nmcd.dwItemSpec);if(!c)return;RECT r;
 /* Owner-data report lists can provide an empty NMCUSTOMDRAW.rc. Read the
    actual item bounds so every task is drawn at its own hit-test position. */
 if(!ListView_GetItemRect(v->hwnd,(int)d->nmcd.dwItemSpec,&r,LVIR_BOUNDS))return;RECT client;GetClientRect(v->hwnd,&client);r.right=client.right;int saved=SaveDC(d->nmcd.hdc);IntersectClipRect(d->nmcd.hdc,r.left,r.top,r.right,r.bottom);int selected=ListView_GetItemState(v->hwnd,(int)d->nmcd.dwItemSpec,LVIS_SELECTED)&LVIS_SELECTED;int hot=(int)(INT_PTR)GetPropW(v->hwnd,L"GxHotRow")-1==(int)d->nmcd.dwItemSpec;int moving=app.dragging&&(int)(INT_PTR)GetPropW(v->hwnd,L"GxDraggingRow")-1==(int)d->nmcd.dwItemSpec;fill(d->nmcd.hdc,r,moving?RGB(223,242,249):selected?RGB(234,247,252):hot?RGB(248,251,252):RGB(255,255,255));J*t=c->data;int task=!strcmp(v->filter.kind,"tasks")||cJSON_IsNumber(get(t,"quadrant"));int q=cJSON_IsNumber(get(t,"quadrant"))?(int)num(t,"quadrant"):v->quadrant;q=max(0,min(3,q));int x=r.left+U(15),y=r.top+U(10);if(task){for(int dot=0;dot<6;dot++){int px=r.left+U(3+(dot%2)*5),py=r.top+U(15+(dot/2)*5);RECT spot={px,py,px+max(1,U(2)),py+U(1)};fill(d->nmcd.hdc,spot,RGB(178,190,195));}HBRUSH b=CreateSolidBrush(truth(t,"done")?accents[q]:RGB(255,255,255));HPEN p=CreatePen(PS_SOLID,U(2),accents[q]);HGDIOBJ ob=SelectObject(d->nmcd.hdc,b),op=SelectObject(d->nmcd.hdc,p);Ellipse(d->nmcd.hdc,x,y,x+U(20),y+U(20));if(truth(t,"done")){HPEN check=CreatePen(PS_SOLID,U(2),RGB(255,255,255));SelectObject(d->nmcd.hdc,check);MoveToEx(d->nmcd.hdc,x+U(4),y+U(10),0);LineTo(d->nmcd.hdc,x+U(9),y+U(15));LineTo(d->nmcd.hdc,x+U(17),y+U(5));SelectObject(d->nmcd.hdc,p);DeleteObject(check);}SelectObject(d->nmcd.hdc,ob);SelectObject(d->nmcd.hdc,op);DeleteObject(p);DeleteObject(b);x+=U(32);}else{x+=U(4);}const char*title=*str(t,"title")?str(t,"title"):*str(t,"name")?str(t,"name"):str(t,"body");wchar_t*w=wide(title);for(wchar_t*p=w;*p;p++)if(*p=='\n'||*p=='\r')*p=' ';RECT tr={x,r.top+U(5),r.right-U(task?146:12),r.top+U(28)};text_rect(d->nmcd.hdc,w,tr,app.font,truth(t,"done")?RGB(165,174,177):RGB(69,75,78),DT_SINGLELINE|DT_END_ELLIPSIS|DT_VCENTER);free(w);char meta[2048]="";if(*str(t,"parentId"))strcat(meta,"↳ 子任务  ");if(*str(t,"project")){strncat(meta,str(t,"project"),300);strcat(meta,"  ");}J*tag;cJSON_ArrayForEach(tag,get(t,"tags"))if(cJSON_IsString(tag)&&strlen(meta)+strlen(tag->valuestring)<1500){strcat(meta,"#");strcat(meta,tag->valuestring);strcat(meta,"  ");}if(cJSON_IsObject(get(t,"repeat")))strcat(meta,"↻ ");if(cJSON_IsObject(get(t,"reminder")))strcat(meta,"提醒 ");if(!task){if(get(t,"_nativeTotal")){snprintf(meta,sizeof(meta),"%.0f 项任务 · %.0f 已完成 · %.1f%%",num(t,"_nativeTotal"),num(t,"_nativeDone"),num(t,"_nativeTotal")?num(t,"_nativeDone")*100/num(t,"_nativeTotal"):0);}else if(*str(t,"createdAt"))snprintf(meta,sizeof(meta),"%.10s",str(t,"createdAt"));else if(*str(t,"description"))snprintf(meta,sizeof(meta),"%.200s",str(t,"description"));}w=wide(meta);tr.top=r.top+U(27);tr.bottom=r.bottom-U(2);text_rect(d->nmcd.hdc,w,tr,app.smallFont,RGB(139,157,167),DT_SINGLELINE|DT_END_ELLIPSIS);free(w);if(task&&*str(t,"start")){w=wide(str(t,"start")+5);for(wchar_t*p=w;*p;p++)if(*p=='T')*p=' ';RECT due={r.right-U(138),r.top+U(10),r.right-U(42),r.top+U(30)};text_rect(d->nmcd.hdc,w,due,app.smallFont,time_ms(str(t,"start"))<wall_ms()&&!truth(t,"done")?RGB(242,74,104):RGB(157,167,172),DT_RIGHT|DT_SINGLELINE);free(w);}if(task){int mx=r.right-U(18),my=r.top+U(22);COLORREF menuColor=hot?RGB(92,117,130):RGB(137,154,164);for(int dot=0;dot<3;dot++){RECT spot={mx+U(dot*5),my,mx+U(dot*5+2),my+U(2)};fill(d->nmcd.hdc,spot,menuColor);}}if(selected){HPEN p=CreatePen(PS_SOLID,1,RGB(234,242,246));HGDIOBJ old=SelectObject(d->nmcd.hdc,p);MoveToEx(d->nmcd.hdc,r.left,r.bottom-1,0);LineTo(d->nmcd.hdc,r.right,r.bottom-1);SelectObject(d->nmcd.hdc,old);DeleteObject(p);}RestoreDC(d->nmcd.hdc,saved);}

int ui_row_menu_hit(View*v,int item,POINT p){RECT row,client;if(!v||item<0)return 0;Cached*c=ui_view_get(v,item);if(!c||(!cJSON_IsNumber(get(c->data,"quadrant"))&&strcmp(v->filter.kind,"tasks")))return 0;if(!ListView_GetItemRect(v->hwnd,item,&row,LVIR_BOUNDS))return 0;GetClientRect(v->hwnd,&client);return p.x>=max(U(GX_TASK_TEXT_LEFT),client.right-U(GX_MENU_WIDTH))&&p.x<client.right&&p.y>=row.top&&p.y<row.bottom;}

HICON ui_app_icon(int size){return (HICON)LoadImageW(app.instance,MAKEINTRESOURCEW(IDI_GXTODO),IMAGE_ICON,size,size,LR_SHARED);}
