#include "d408.h"
#ifdef GX_D408_CANDIDATE
static HWND workEntry,timerEntry,feedbackEntry;
static int closing;

void d408_layout(void){
 if(!app.window||!workEntry)return;RECT r;GetClientRect(app.window,&r);
 /* Keep the established ten navigation buttons and task toolbar intact.
  * The additional primary entries occupy one reserved row above the footer. */
 int side=r.right<U(750)&&!app.sidebarOpen?0:U(GX_SIDE),y=r.bottom-U(38);
 ui_move(workEntry,side+U(12),y,U(104),U(30));ui_move(timerEntry,side+U(124),y,U(94),U(30));ui_move(feedbackEntry,side+U(226),y,U(94),U(30));
 SetWindowPos(workEntry,HWND_TOP,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
 SetWindowPos(timerEntry,HWND_TOP,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
 SetWindowPos(feedbackEntry,HWND_TOP,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE);
}
static LRESULT CALLBACK shell_proc(HWND h,UINT message,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR reference){
 if(message==WM_COMMAND){int command=LOWORD(w);
   if(command==4500){d408_work_open();return 0;}
   if(command==4501){d408_timer_open();return 0;}
   if(command==4502){d408_feedback_open();return 0;}
 }
 if(message==WM_TIMER&&w==4508){d408_timer_tick();return 0;}
 if(message==WM_CLOSE&&!closing){
   if(!ui_catalog_commit()||!detail_save(0))return 0;
   if(!d408_feedback_flush())return 0;
   if(!d408_timer_shutdown()){d408_error(h,"番茄钟尚未成功保存，请保留窗口并重试退出。");return 0;}
   closing=1;
 }
 if(message==WM_DESTROY){d408_shutdown();}
 LRESULT result=DefSubclassProc(h,message,w,l);
 if(message==WM_SIZE)d408_layout();
 if(message==WM_NCDESTROY)RemoveWindowSubclass(h,shell_proc,id);
 return result;
}
void d408_attach(void){
 SetWindowSubclass(app.window,shell_proc,408,0);
 workEntry=ui_control(app.window,L"BUTTON",L"工作管理",WS_TABSTOP,4500,0,0,0,0);
 timerEntry=ui_control(app.window,L"BUTTON",L"番茄钟",WS_TABSTOP,4501,0,0,0,0);
 feedbackEntry=ui_control(app.window,L"BUTTON",L"优化反馈",WS_TABSTOP,4502,0,0,0,0);
 SetWindowTextW(app.window,L"MyTodo D4-08 · 原生隔离候选");SetTimer(app.window,4508,1000,0);d408_layout();
}
void d408_shutdown(void){KillTimer(app.window,4508);d408_work_close();d408_feedback_close();if(!closing)d408_timer_shutdown();}
int d408_translate_message(MSG *message){
 if(d408_input_message(message))return 1;
 if(message->message==WM_KEYDOWN&&(GetKeyState(VK_CONTROL)&0x8000)&&(GetKeyState(VK_SHIFT)&0x8000)&&message->wParam=='W'){d408_work_open();return 1;}
 return 0;
}
int d408_try_regression(int argc,wchar_t **argv,int *result){
 int run=0;const wchar_t *render=0;for(int i=1;i<argc;i++){if(!wcscmp(argv[i],L"--d408-regression"))run=1;if(!wcscmp(argv[i],L"--d408-render")&&i+1<argc)render=argv[++i];}
 if(!run)return 0;*result=d408_regression(render);return 1;
}
#endif
