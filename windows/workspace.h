#ifndef GX_WORKSPACE_H
#define GX_WORKSPACE_H
/* Native controls shared with the isolated Actions regression, never persisted. */
#define GX_WORK_CLASS L"GxNativeWorkspace"
#define GX_WORK_REFRESH (WM_APP+80)
#define GX_WORK_NAV 4100
#define GX_WORK_SEARCH 4120
#define GX_WORK_STATUS 4121
#define GX_WORK_LIST 4122
#define GX_WORK_NEW 4123
#define GX_WORK_OPEN 4124
#define GX_WORK_EDIT 4125
#define GX_WORK_MENU 4126
#define GX_WORK_RELOAD 4127
#define GX_WORK_PREV 4128
#define GX_WORK_NEXT 4129
#define GX_WORK_BACK 4130
#define GX_WORK_FEEDBACK 4131
#define GX_WORK_SYNC 4132
#define GX_WORK_NOTICE 4133
#define GX_WORK_PAGE_LABEL 4134
#define GX_WORK_STATS 4135
#define GX_WORK_STATS_CONTENT 650
enum { WORK_HOME, WORK_PROJECTS, WORK_TASKS, WORK_PROCESS, WORK_CONTACTS,
       WORK_NOTES, WORK_ARCHIVE, WORK_STATS, WORK_PAGES };
void ui_work_open(void);
void ui_work_changed(void);
void ui_work_close(void);
int ui_work_translate_message(MSG *message);
int ui_work_regression(const wchar_t *renderDir);
#endif
