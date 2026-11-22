
#include "ui.h"
/* Capture only this application's own HWNDs. Used by the isolated layout regression. */

static void render_client(HWND h,HDC dc){
 RECT r;GetClientRect(h,&r);int saved=SaveDC(dc);IntersectClipRect(dc,0,0,r.right,r.bottom);
 wchar_t cls[40];GetClassNameW(h,cls,40);if(!wcscmp(cls,WC_LISTVIEWW))ui_list_render(h,dc);else SendMessageW(h,!wcsncmp(cls,L"Gx",2)||!wcscmp(cls,L"Edit")||!wcscmp(cls,L"ComboBox")?WM_PRINTCLIENT:WM_PRINT,(WPARAM)dc,PRF_CLIENT|PRF_ERASEBKGND);RestoreDC(dc,saved);
 if(!wcscmp(cls,L"ComboBox"))return;
 HWND last=GetWindow(h,GW_CHILD);if(last)last=GetWindow(last,GW_HWNDLAST);
 for(HWND c=last;c;c=GetWindow(c,GW_HWNDPREV)){
  if(!(GetWindowLongPtrW(c,GWL_STYLE)&WS_VISIBLE))continue;RECT cr;GetClientRect(c,&cr);if(cr.right<1||cr.bottom<1)continue;POINT p={0,0};MapWindowPoints(c,h,&p,1);
  HDC child=CreateCompatibleDC(dc);HBITMAP bmp=CreateCompatibleBitmap(dc,cr.right,cr.bottom);HGDIOBJ old=SelectObject(child,bmp);FillRect(child,&cr,app.white);render_client(c,child);
  BitBlt(dc,p.x,p.y,cr.right,cr.bottom,child,0,0,SRCCOPY);SelectObject(child,old);DeleteObject(bmp);DeleteDC(child);
 }
}
static int capture(HWND h,const wchar_t*file){

 RECT r;GetClientRect(h,&r);int w=r.right,hg=r.bottom;if(w<1||hg<1)return 0;
 HDC src=GetDC(h),dc=CreateCompatibleDC(src);HBITMAP bmp=CreateCompatibleBitmap(src,w,hg);HGDIOBJ old=SelectObject(dc,bmp);
 RECT bg={0,0,w,hg};FillRect(dc,&bg,app.white);RedrawWindow(h,0,0,RDW_INVALIDATE|RDW_ALLCHILDREN|RDW_UPDATENOW);
 render_client(h,dc);
 BITMAPINFO info={0};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=w;info.bmiHeader.biHeight=hg;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
 DWORD size=w*hg*4;void*bits=malloc(size);SelectObject(dc,old);int ok=GetDIBits(src,bmp,0,hg,bits,&info,DIB_RGB_COLORS);
 BITMAPFILEHEADER head={0};head.bfType=0x4d42;head.bfOffBits=sizeof(head)+sizeof(BITMAPINFOHEADER);head.bfSize=head.bfOffBits+size;
 FILE*f=_wfopen(file,L"wb");if(f&&ok){fwrite(&head,sizeof(head),1,f);fwrite(&info.bmiHeader,sizeof(info.bmiHeader),1,f);fwrite(bits,size,1,f);}if(f)fclose(f);
 free(bits);DeleteObject(bmp);DeleteDC(dc);ReleaseDC(h,src);return ok&&f!=0;
}
int ui_visual_window_snap(HWND h,const wchar_t*dir,const wchar_t*name){wchar_t p[32768];swprintf(p,32768,L"%s\\%s.bmp",dir,name);return capture(h,p);}
int ui_visual_snap(const wchar_t*dir,const wchar_t*name){return ui_visual_window_snap(app.window,dir,name);}
int visual_test(const wchar_t*dir){
 ensure_dir(dir);int failures=0;SendMessageW(app.mode,CB_SETCURSEL,0,0);SendMessageW(app.period,CB_SETCURSEL,0,0);SendMessageW(app.statusFilter,CB_SETCURSEL,0,0);for(int i=0;i<app.undoCount;i++)cJSON_Delete(app.undo[i].changes);app.undoCount=0;ui_refresh(1);failures+=!ui_visual_snap(dir,L"board");
 Filter f={0};strcpy(f.kind,"tasks");f.quadrant=-1;f.status=2;f.period=3;f.manual=1;
 J*rows=query_rows(&app.db,&f,0,1);J*first=cJSON_GetArrayItem(rows,0);char*k=first?_strdup(str(first,"key")):0;cJSON_Delete(rows);
 if(k){ui_open(k,0,0,0);failures+=!ui_visual_snap(dir,L"detail");if(app.editor){SendMessageW(app.editor->hwnd,WM_COMMAND,554,0);failures+=!ui_visual_snap(dir,L"detail-expanded");SendMessageW(app.editor->hwnd,WM_VSCROLL,SB_BOTTOM,0);for(int i=0;i<20;i++)SendMessageW(app.editor->hwnd,WM_VSCROLL,SB_LINEDOWN,0);failures+=!ui_visual_snap(dir,L"detail-advanced-bottom");}detail_save(1);free(k);}
 for(int q=1;q<4;q++){f.quadrant=q;rows=query_rows(&app.db,&f,0,1);first=cJSON_GetArrayItem(rows,0);k=first?_strdup(str(first,"key")):0;cJSON_Delete(rows);if(k){ui_open(k,q,0,0);wchar_t name[40];swprintf(name,40,L"detail-q%d",q);failures+=!ui_visual_snap(dir,name);detail_save(1);free(k);}}
 for(int p=1;p<=6;p++){ui_navigate(p);wchar_t name[40];swprintf(name,40,L"page-%d",p);failures+=!ui_visual_snap(dir,name);}
 ui_navigate(0);app.zoom=2;ui_layout();failures+=!ui_visual_snap(dir,L"quadrant-zoom");app.zoom=-1;
 ui_navigate(0);SetWindowPos(app.window,0,0,0,U(760),U(680),SWP_NOMOVE|SWP_NOZORDER);ui_layout();failures+=!ui_visual_snap(dir,L"compact");
 f.quadrant=-1;rows=query_rows(&app.db,&f,0,1);first=cJSON_GetArrayItem(rows,0);k=first?_strdup(str(first,"key")):0;cJSON_Delete(rows);if(k){ui_open(k,0,0,0);failures+=!ui_visual_snap(dir,L"compact-detail");detail_save(1);free(k);}
 printf("VISUAL %d failures\n",failures);return failures;
}
