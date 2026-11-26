#ifndef GX_D408_H
#define GX_D408_H
#include "ui.h"
#ifdef GX_D408_CANDIDATE

typedef struct {
 wchar_t directory[32768],file[32768],previous[32768];
 HANDLE lock;
 J *data;
 char format[96],error[1024];
 int generation,recovered,uncertain;
} D408Store;

int d408_store_open(D408Store *store,const char *name,J *initial);
int d408_store_commit(D408Store *store,J *next);
void d408_store_close(D408Store *store);
int d408_file_read(const wchar_t *path,BYTE **bytes,DWORD *size,DWORD limit);
int d408_file_write(const wchar_t *path,const BYTE *bytes,DWORD size);
void d408_hash(const BYTE *bytes,DWORD size,char hash[65]);
J *d408_find(J *array,const char *id);
int d408_remove(J *array,const char *id);
void d408_event(J *record,const char *action,const char *description);
int d408_choice(const char *value,const char *choices);
void d408_error(HWND owner,const char *message);
extern int d408_test_write_failure;

void d408_attach(void);
void d408_layout(void);
void d408_shutdown(void);
int d408_translate_message(MSG *message);
void d408_timer_open(void);
void d408_timer_tick(void);
int d408_timer_shutdown(void);
J *d408_timer_snapshot(void);
int d408_timer_command(const char *action,J *values,const char *commandId,int expectedRevision);
void d408_timer_test_clock(int enabled,int64_t wall,uint64_t monotonic);
int d408_timer_regression(void);
int d408_regression(const wchar_t *render);
void d408_work_open(void);
void d408_work_close(void);
void d408_feedback_open(void);
void d408_feedback_close(void);
int d408_feedback_flush(void);
int d408_feedback_regression(const wchar_t *render);
int d408_work_regression(const wchar_t *render);
void d408_check(const char *suite,int passed,const char *name);
int d408_input_message(MSG *message);
int d408_try_regression(int argc,wchar_t **argv,int *result);
typedef struct {const wchar_t *label;const char *key;int multiline;int lines;const char *options;} D408Field;
J *d408_form(HWND owner,const wchar_t *title,J *record,const D408Field *fields,int count);

#endif
#endif
