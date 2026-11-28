#ifndef GX_D409_TIMER_HISTORY_H
#define GX_D409_TIMER_HISTORY_H
#ifdef GX_D409_UI
/* View-only adapter around the frozen history refresh. Never writes timerStore. */
static HWND d409HistoryWindow;
static char *d409HistorySelectedId;
static int d409HistoryTop,d409HistoryHorizontal,d409HistoryExtent;

static J *d409_history_row(int index){
 J *history=get(timerStore.data,"history");int count=cJSON_GetArraySize(history);
 return index>=0&&index<count?cJSON_GetArrayItem(history,count-index-1):0;
}
static void d409_history_remember(void){
 J *entry=d409_history_row((int)SendMessageW(control(T_HISTORY),LB_GETCURSEL,0,0));
 if(!entry)return;char *id=_strdup(str(entry,"id"));if(!id)return;
 free(d409HistorySelectedId);d409HistorySelectedId=id;
}
static void d409_history_restore(HWND list){
 int count=(int)SendMessageW(list,LB_GETCOUNT,0,0),selected=0;
 for(int i=0;i<count;i++)if(d409HistorySelectedId&&!strcmp(d409HistorySelectedId,str(d409_history_row(i),"id"))){selected=i;break;}
 if(count>0){
  SendMessageW(list,LB_SETCURSEL,selected,0);SendMessageW(list,LB_SETTOPINDEX,min(d409HistoryTop,count-1),0);
  SendMessageW(list,WM_HSCROLL,MAKEWPARAM(SB_THUMBPOSITION,min(d409HistoryHorizontal,65535)),0);d409_history_remember();
 }
 EnableWindow(GetDlgItem(timerWindow,5226),count>0);
}
static void d409_history_detail_layout(HWND h){
 RECT r;GetClientRect(h,&r);int pad=U(18),width=max(U(100),r.right-pad*2);
 ui_move(GetDlgItem(h,5230),pad,U(14),width,U(28));
 ui_move(GetDlgItem(h,5231),pad,U(54),width,max(U(80),r.bottom-U(116)));
 ui_move(GetDlgItem(h,5232),r.right-U(126),r.bottom-U(46),U(108),U(32));
}
static LRESULT CALLBACK d409_history_detail_proc(HWND h,UINT message,WPARAM w,LPARAM l){
 if(message==WM_CREATE){
  d409_visual_init(h);d409_label(h,5230,L"历史记录详情 · 可选择并复制全文",0);
  HWND text=ui_control(h,L"EDIT",L"",ES_MULTILINE|ES_AUTOVSCROLL|ES_READONLY|WS_VSCROLL|WS_TABSTOP,5231,0,0,0,0);
  SendMessageW(text,EM_SETLIMITTEXT,0x7ffffffe,0);
  d409_role(ui_control(h,L"BUTTON",L"关闭",WS_TABSTOP,5232,0,0,0,0),4);return 0;
 }
 if(message==WM_SIZE){d409_history_detail_layout(h);return 0;}
 if(message==WM_GETMINMAXINFO){((MINMAXINFO*)l)->ptMinTrackSize.x=U(460);((MINMAXINFO*)l)->ptMinTrackSize.y=U(360);return 0;}
 if(message==WM_CLOSE||message==WM_COMMAND&&(LOWORD(w)==5232||LOWORD(w)==IDCANCEL)){DestroyWindow(h);return 0;}
 if(message==WM_DESTROY){d409_visual_free(h);d409HistoryWindow=0;return 0;}
 if(message==WM_PAINT||message==WM_PRINTCLIENT){PAINTSTRUCT ps;HDC dc=message==WM_PAINT?BeginPaint(h,&ps):(HDC)w;d409_surface(h,dc,0);if(message==WM_PAINT)EndPaint(h,&ps);return 0;}
 if(message==WM_CTLCOLORSTATIC||message==WM_CTLCOLOREDIT)return d409_control_color(h,message,w,l);
 if(message==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}
 return DefWindowProcW(h,message,w,l);
}
static void d409_history_open(void){
 if(d409HistoryWindow&&IsWindow(d409HistoryWindow)){SetForegroundWindow(d409HistoryWindow);return;}
 int index=(int)SendMessageW(control(T_HISTORY),LB_GETCURSEL,0,0);if(index<0)index=0;
 J *row=d409_history_row(index);if(!row)return;J *entry=dup(row);if(!entry)return;
 char *text=0,duration[96];
 d409_append(&text,"开始时间（UTC）：",str(entry,"startedAt"));
 d409_append(&text,"结束时间（UTC）：",str(entry,"endedAt"));
 d409_append(&text,"阶段：",!strcmp(str(entry,"phase"),"break")?"休息":"专注");
 d409_append(&text,"计时方式：",!strcmp(str(entry,"mode"),"countup")?"正计时":"倒计时");
 d409_append(&text,"结果：",!strcmp(str(entry,"status"),"completed")?"已完成":"提前结束");
 snprintf(duration,sizeof(duration),"%.1f 分钟（%.0f 毫秒）",num(entry,"elapsedMillis")/60000.,num(entry,"elapsedMillis"));d409_append(&text,"时长：",duration);
 d409_append(&text,"任务：",*str(entry,"taskTitle")?str(entry,"taskTitle"):"未关联任务");
 d409_append(&text,"账号：",*str(entry,"accountId")?str(entry,"accountId"):"未记录");cJSON_Delete(entry);
 if(!text)return;
 WNDCLASSW cls={0};cls.lpfnWndProc=d409_history_detail_proc;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.hbrBackground=app.white;cls.lpszClassName=L"GxD409TimerHistory";RegisterClassW(&cls);
 HWND owner=timerWindow;d409HistoryWindow=CreateWindowExW(WS_EX_CONTROLPARENT,cls.lpszClassName,L"MyTodo · 完整历史记录",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,CW_USEDEFAULT,CW_USEDEFAULT,U(760),U(640),owner,0,app.instance,0);
 HWND dialog=d409HistoryWindow;if(!dialog){free(text);return;}
 ui_set(GetDlgItem(dialog,5231),text);free(text);d409_fit_window(dialog);d409_history_detail_layout(dialog);
 EnableWindow(owner,FALSE);ShowWindow(dialog,SW_SHOW);SetForegroundWindow(dialog);SetFocus(GetDlgItem(dialog,5231));
 /* Own dialog keyboard routing, so Escape/Tab cannot reach task-navigation shortcuts. */
 MSG message;int status=1;while(IsWindow(dialog)&&(status=GetMessageW(&message,0,0,0))>0){
  int inside=message.hwnd==dialog||IsChild(dialog,message.hwnd);
  if(inside&&message.message==WM_KEYDOWN&&message.wParam==VK_ESCAPE){DestroyWindow(dialog);continue;}
  if(!inside||!IsDialogMessageW(dialog,&message)){TranslateMessage(&message);DispatchMessageW(&message);}
 }
 if(status<=0){if(IsWindow(dialog))DestroyWindow(dialog);if(status==0)PostQuitMessage((int)message.wParam);}
 if(IsWindow(owner)){EnableWindow(owner,TRUE);SetForegroundWindow(owner);SetFocus(control(T_HISTORY));}
}
static LRESULT CALLBACK d409_history_list_proc(HWND h,UINT message,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR reference){
 if(message==WM_NCDESTROY){RemoveWindowSubclass(h,d409_history_list_proc,id);return DefSubclassProc(h,message,w,l);}
 if(message==WM_KEYDOWN&&w==VK_RETURN){d409_history_open();return 0;}
 if(message==LB_RESETCONTENT){
  if(SendMessageW(h,LB_GETCOUNT,0,0)>0){d409HistoryTop=max(0,(int)SendMessageW(h,LB_GETTOPINDEX,0,0));d409HistoryHorizontal=max(0,GetScrollPos(h,SB_HORZ));}
  d409HistoryExtent=0;LRESULT result=DefSubclassProc(h,message,w,l);SendMessageW(h,LB_SETHORIZONTALEXTENT,0,0);EnableWindow(GetDlgItem(timerWindow,5226),FALSE);return result;
 }
 if(message==LB_ADDSTRING){
  LRESULT result=DefSubclassProc(h,message,w,l);if(result==LB_ERR||result==LB_ERRSPACE)return result;
  HDC dc=GetDC(h);if(dc){HFONT font=(HFONT)SendMessageW(h,WM_GETFONT,0,0);HGDIOBJ old=font?SelectObject(dc,font):0;SIZE size={0};
   if(GetTextExtentPoint32W(dc,(const wchar_t*)l,(int)wcslen((const wchar_t*)l),&size))d409HistoryExtent=max(d409HistoryExtent,size.cx+U(16));
   if(old)SelectObject(dc,old);ReleaseDC(h,dc);}
  SendMessageW(h,LB_SETHORIZONTALEXTENT,d409HistoryExtent,0);
  if(SendMessageW(h,LB_GETCOUNT,0,0)==cJSON_GetArraySize(get(timerStore.data,"history")))d409_history_restore(h);return result;
 }
 return DefSubclassProc(h,message,w,l);
}
static void d409_history_attach(void){
 d409HistoryTop=d409HistoryHorizontal=d409HistoryExtent=0;
 SetWindowSubclass(control(T_HISTORY),d409_history_list_proc,40913,0);
 EnableWindow(GetDlgItem(timerWindow,5226),FALSE);
}
static void d409_history_shutdown(void){
 if(d409HistoryWindow&&IsWindow(d409HistoryWindow))DestroyWindow(d409HistoryWindow);
 free(d409HistorySelectedId);d409HistorySelectedId=0;
}
#endif
#endif
