#include "d408.h"
#ifdef GX_D408_CANDIDATE
typedef struct {HWND window,owner,inputs[24],labels[24],save,cancel;const D408Field *fields;int count,accepted,height,offset;J *record,*result;} Form;
static void layout(Form *f){RECT r;GetClientRect(f->window,&r);int y=U(18)-f->offset,width=max(U(160),r.right-U(54));for(int i=0;i<f->count;i++){const D408Field *field=&f->fields[i];ui_move(f->labels[i],U(18),y,width,U(20));y+=U(24);int height=field->multiline?max(52,field->lines*22):30;ui_move(f->inputs[i],U(18),y,width,U(field->options?220:height));y+=U(height+16);}ui_move(f->save,max(U(18),r.right-U(238)),y,U(102),U(34));ui_move(f->cancel,max(U(130),r.right-U(126)),y,U(100),U(34));f->height=y+f->offset+U(54);SCROLLINFO info={sizeof(info),SIF_RANGE|SIF_PAGE|SIF_POS,0,max(0,f->height-1),(UINT)r.bottom,f->offset};SetScrollInfo(f->window,SB_VERT,&info,TRUE);}
static void scroll(Form *f,int position){RECT r;GetClientRect(f->window,&r);f->offset=max(0,min(position,max(0,f->height-r.bottom)));layout(f);InvalidateRect(f->window,0,TRUE);}
static LRESULT CALLBACK procedure(HWND h,UINT message,WPARAM w,LPARAM l){
 Form *form=(Form*)GetWindowLongPtrW(h,GWLP_USERDATA);
 if(message==WM_CREATE){form=((CREATESTRUCTW*)l)->lpCreateParams;form->window=h;SetWindowLongPtrW(h,GWLP_USERDATA,(LONG_PTR)form);
   for(int i=0;i<form->count;i++){const D408Field *f=&form->fields[i];form->labels[i]=ui_control(h,L"STATIC",f->label,0,0,0,0,0,0);
     form->inputs[i]=ui_control(h,f->options?L"COMBOBOX":L"EDIT",L"",WS_TABSTOP|(f->options?CBS_DROPDOWNLIST:f->multiline?ES_MULTILINE|ES_WANTRETURN|ES_AUTOVSCROLL|WS_VSCROLL:ES_AUTOHSCROLL),4800+i,0,0,0,0);
     if(f->options){char *options=_strdup(f->options),*context=0,*token=strtok_s(options,"|",&context);int index=0,selected=0;while(token){wchar_t *label=wide(token);SendMessageW(form->inputs[i],CB_ADDSTRING,0,(LPARAM)label);free(label);if(!strcmp(token,str(form->record,f->key)))selected=index;index++;token=strtok_s(0,"|",&context);}free(options);SendMessageW(form->inputs[i],CB_SETCURSEL,selected,0);}else ui_set(form->inputs[i],str(form->record,f->key));}
   form->save=ui_control(h,L"BUTTON",L"保存",WS_TABSTOP,IDOK,0,0,0,0);form->cancel=ui_control(h,L"BUTTON",L"取消",WS_TABSTOP,IDCANCEL,0,0,0,0);layout(form);return 0;
 }
 if(!form)return DefWindowProcW(h,message,w,l);
 if(message==WM_SIZE){layout(form);return 0;}
 if(message==WM_VSCROLL){SCROLLINFO info={sizeof(info),SIF_ALL};GetScrollInfo(h,SB_VERT,&info);int position=form->offset;switch(LOWORD(w)){case SB_LINEUP:position-=U(32);break;case SB_LINEDOWN:position+=U(32);break;case SB_PAGEUP:position-=(int)info.nPage;break;case SB_PAGEDOWN:position+=(int)info.nPage;break;case SB_THUMBTRACK:position=info.nTrackPos;break;}scroll(form,position);return 0;}
 if(message==WM_MOUSEWHEEL){scroll(form,form->offset-GET_WHEEL_DELTA_WPARAM(w)/WHEEL_DELTA*U(64));return 0;}
 if(message==WM_COMMAND){int event=HIWORD(w);if(event==EN_SETFOCUS||event==CBN_SETFOCUS||event==BN_SETFOCUS){RECT r,client;GetWindowRect((HWND)l,&r);MapWindowPoints(0,h,(POINT*)&r,2);GetClientRect(h,&client);if(r.top<U(12))scroll(form,form->offset+r.top-U(12));else if(r.bottom>client.bottom-U(12))scroll(form,form->offset+r.bottom-client.bottom+U(12));}
   if(LOWORD(w)==IDOK&&event==BN_CLICKED){form->result=dup(form->record);for(int i=0;i<form->count;i++){char *value=ui_text(form->inputs[i]);ss(form->result,form->fields[i].key,value);free(value);}form->accepted=1;DestroyWindow(h);return 0;}if(LOWORD(w)==IDCANCEL&&event==BN_CLICKED){DestroyWindow(h);return 0;}}
 if(message==WM_CLOSE){DestroyWindow(h);return 0;}if(message==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}return DefWindowProcW(h,message,w,l);
}
J *d408_form(HWND owner,const wchar_t *title,J *record,const D408Field *fields,int count){
 if(count<1||count>24)return 0;Form form={0};form.owner=owner;form.record=record;form.fields=fields;form.count=count;
 WNDCLASSW cls={0};cls.lpfnWndProc=procedure;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.hbrBackground=app.white;cls.lpszClassName=L"GxD408Form";RegisterClassW(&cls);RECT r;GetWindowRect(owner,&r);
 int enabled=IsWindowEnabled(owner);EnableWindow(owner,FALSE);HWND h=CreateWindowExW(WS_EX_DLGMODALFRAME|WS_EX_CONTROLPARENT,cls.lpszClassName,title,WS_CAPTION|WS_SYSMENU|WS_POPUP|WS_CLIPCHILDREN|WS_VSCROLL,r.left+U(32),U(20),U(640),U(600),owner,0,app.instance,&form);
 if(h){int height=min(form.height+U(42),GetSystemMetrics(SM_CYSCREEN)-U(80));SetWindowPos(h,0,0,0,U(640),height,SWP_NOMOVE|SWP_NOZORDER);ShowWindow(h,SW_SHOW);SetFocus(form.inputs[0]);MSG message;while(IsWindow(h)&&GetMessageW(&message,0,0,0)){if(!IsDialogMessageW(h,&message)){TranslateMessage(&message);DispatchMessageW(&message);}}}
 if(enabled)EnableWindow(owner,TRUE);SetActiveWindow(owner);return form.accepted?form.result:0;
}
#endif
