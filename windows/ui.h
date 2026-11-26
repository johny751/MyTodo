#ifndef GX_UI_H
#define GX_UI_H
#include "native.h"
#include "workspace.h"
#include <windowsx.h>
#include <uxtheme.h>
#define GX_CACHE 96
#define GX_RESULT  (WM_APP+30)
#define GX_CHANGED (WM_APP+31)
#define GX_OPEN (WM_APP+32)
#define GX_BACK (WM_APP+33)
#define GX_PANE_SAVE (WM_APP+34)
#define GX_GESTURE (WM_APP+35)
#define GX_TASK_MENU_READY (WM_APP+36)
#define GX_SETTINGS_READY (WM_APP+37)
#define GX_MENU_ACTION_BASE 3200
#define GX_ROW_HEIGHT 46
#define GX_HANDLE_WIDTH 14
#define GX_CHECKBOX_END 39
#define GX_TASK_TEXT_LEFT 47
#define GX_MENU_WIDTH 30
#define IDI_GXTODO 101
#define GX_SIDE 90
#define GX_DRAWER 410
#define GX_TOP 45
#define GX_FOOT 34
typedef struct {char kind[20],status;int quadrant,period,manual,archive;char date[11],groupKind[20],group[512],query[2048],parent[801];} Filter;
typedef struct {int index;char*key;J*data;} Cached;
typedef struct {HWND hwnd;Filter filter;int count,top;Cached cache[GX_CACHE];int used;sqlite3_stmt*page;int quadrant;} View;
typedef struct {J*changes;uint64_t expires;char label[160];int id;} Undo;
typedef struct {DB db;wchar_t dir[32768];char error[1024];int ok,up,down,more;HANDLE thread;HWND host;} SyncJob;
typedef struct {char*key;J*base,*data,*context;HWND hwnd,scroll,fields[32],childList,quick,advanced;View children;int sections[8];int note,dirty,reminderSelection,newRecord,offset,contentHeight,saving,closed,expanded;} Detail;
typedef struct {DB db;HINSTANCE instance;HWND window,sidebar,topbar,status,drawer,catalog;HWND nav[10],buttons[20],search,period,statusFilter,mode,sort,filter;HFONT font,smallFont,title;HBRUSH white,background,side;UINT dpi;View views[4];Filter filterSpec;RECT boardCells[4];int archive,page,zoom,drawerWidth,sidebarOpen,ready;char groupKind[20],group[512];wchar_t baseDir[32768],locationFile[32768];HANDLE storageLock;int dataDirOverride,storageIsolated;J*registry,*settings;Detail*editor;char*editorStack[65],*forwardStack[65];int depth,forwardDepth;SyncJob*sync;int syncEnabled,autoSync,failures;uint64_t changedAt,undoNext;Undo undo[64];int undoCount;J*ledger;char*reminderKey;NOTIFYICONDATAW tray;char*dragKey;HWND dragSource;POINT dragStart;uint64_t dragAt;int dragging;int64_t refreshUs,searchUs,detailUs;} App;
extern App app;
void storage_set_window_root(HWND window,const wchar_t*dir);void storage_location_file(wchar_t*out);int storage_load_location(const wchar_t*file,wchar_t*out,char*error,size_t n);int storage_save_location(const wchar_t*file,const wchar_t*dir,char*error,size_t n);HANDLE storage_guard(const wchar_t*dir,int exclusive);int storage_validate_target(const wchar_t*base,const wchar_t*target,wchar_t*out,char*error,size_t n);int storage_migrate(DB*active,J*registry,const wchar_t*base,const wchar_t*target,const wchar_t*locationFile,DB*next,HANDLE*nextGuard,char*error,size_t n);int ui_storage_change(const wchar_t*target);int storage_regression(const wchar_t*renderDir);
HICON ui_app_icon(int size);
COLORREF ui_quadrant_color(int q);
void ui_move(HWND h,int x,int y,int width,int height);void ui_update_begin(HWND root);void ui_update_end(void);void ui_show(HWND h,int show);
int ui_paint_begin(HWND h,HDC dc);void ui_round(HDC dc,RECT r,COLORREF bg,COLORREF border,int radius);void ui_icon(HDC dc,int icon,int x,int y,int size,COLORREF color);void ui_fields_paint(HWND h,HDC dc);
void ui_catalog_init(void);void ui_catalog_layout(int x,int y,int w,int h);void ui_catalog_refresh(void);void ui_catalog_clear(void);int ui_catalog_regression(void);int ui_catalog_commit(void);void ui_entity_open(const char*key);void ui_list_render(HWND h,HDC dc);
int ui_drag_cancel(void);void ui_drag_paint(HWND h,HDC dc);int drag_regression(const wchar_t*renderDir);int ui_visual_snap(const wchar_t*dir,const wchar_t*name);int ui_visual_window_snap(HWND h,const wchar_t*dir,const wchar_t*name);
int visual_test(const wchar_t*dir);int repaint_regression(void);void ui_paint_performance(void);
int U(int n);void ui_notice(const char*s);HWND ui_control(HWND parent,const wchar_t*cls,const wchar_t*title,DWORD style,int id,int x,int y,int w,int h);char*ui_text(HWND h);void ui_set(HWND h,const char*s);void ui_layout(void);void ui_undo_update(void);void ui_attach_list(View*v);void ui_reminders_reset(void);void ui_refresh(int reset);void ui_changed(const char*label);int ui_navigate(int page);void ui_back(void);int ui_close_detail(void);void ui_open(const char*key,int q,const char*parent,int note);int detail_translate_message(MSG*message);int detail_save(int close);HWND detail_create(Detail*d);void detail_layout(void);void detail_destroy(void);void detail_reload_children(void);void ui_start_sync(int manual);void ui_sync_config(void);void ui_settings(void);void ui_account_dialog(void);void ui_category_edit(const char*key,const char*kind);void ui_file(int importing);void ui_calendar(HWND edit,int range);void ui_stats_paint(HDC dc,RECT r);void ui_reminders_schedule(void);void ui_reminders_show(void);int ui_task_menu(const char*key,J*task);void ui_menu(const char*key,POINT p);int ui_row_menu_hit(View*v,int item,POINT p);void ui_row_menu_open(View*v,int item);
void ui_theme_draw_button(DRAWITEMSTRUCT*d);void ui_draw_row(NMLVCUSTOMDRAW*d,View*v);void ui_view_clear(View*v);void ui_view_bind(View*v,const Filter*f);Cached*ui_view_get(View*v,int index);int ui_query_init(DB*d);int query_count(DB*d,const Filter*f);J*query_rows(DB*d,const Filter*f,int first,int limit);int op_move(DB*d,const char*key,int q,const char*before);int op_step(DB*d,const char*key,int direction);int op_category(DB*d,const char*key,const char*kind,J*next);int op_delete_entity(DB*d,const char*key);int op_account(App*a,const char*name,const char*folder,int rename);int op_settings(DB*d,J*settings);int undo_apply(DB*d,int id);void undo_begin(const char*label);void undo_finish(void);void undo_capture(DB*d,J*changes);int navigation_regression(void);int detail_regression(void);int ui_benchmark(const wchar_t*dir,int count);int advanced_selftest(const wchar_t*dir);int validate_task(J*t,char*error,size_t n);void reminder_recalc(J*t);char*make_key(const char*kind,const char*id);int64_t clock_us(void);int64_t wall_ms(void);
void ui_feedback(void);int feedback_regression(const wchar_t*dir);int feedback_cli(const wchar_t*dir,int importing,const wchar_t*file);
#endif
