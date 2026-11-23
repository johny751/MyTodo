#ifndef GX_NATIVE_H
#define GX_NATIVE_H
#define UNICODE
#define _UNICODE
#define _WIN32_WINNT 0x0601
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shlobj.h>
#include <winhttp.h>
#include <wincrypt.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <math.h>
#include <time.h>
#include "vendor/sqlite3.h"
#include "vendor/cJSON.h"
#include "vendor/zlib/zlib.h"
typedef cJSON J;
typedef struct { sqlite3 *sql; wchar_t dir[32768]; char error[1024]; } DB;
J *get(J *j,const char *k); const char *str(J *j,const char *k); double num(J *j,const char *k); int truth(J *j,const char *k); void set(J *j,const char *k,J *v); void ss(J *j,const char *k,const char *s); void sn(J *j,const char *k,double n); J *dup(J *j); char *json(J *j); int eq(J *a,J *b); wchar_t *wide(const char *s); char *utf8(const wchar_t *s); void uuid(char *s); void now(char *s); int64_t time_ms(const char *s); void format_ms(int64_t n,char *s); char *read_file(const wchar_t *p); int write_file(const wchar_t *p,const char *s); void join(wchar_t *out,const wchar_t *dir,const wchar_t *name); int ensure_dir(const wchar_t *p); void sha256(const char *s,char *out);
#define PROTOCOL_MAX_COUNTER INT64_C(9007199254740991)
int protocol_actor_valid(const char *actor); int protocol_counter_valid(double value,int positive); int protocol_counter_map_valid(J *map,int limit); int protocol_text_valid(const char *text); int protocol_json_without_nul(const char *json_text); int protocol_event_valid(J *event);
int db_open(DB *d,const wchar_t *dir); void db_close(DB *d); J *db_meta(DB *d); J *db_row(DB *d,const char *key); J *record_apply(DB *d,J *r,J *e); J *record_row(J *r); int db_local(DB *d,J *changes,J *context); int db_remote(DB *d,J *events,const char *device,double index); int db_meta_save(DB *d,J *m,int data); int db_put(DB *d,J *row); J *db_page(DB *d,const char *after,int limit); J *db_outbox(DB *d,int limit); int db_begin(DB *d); int db_end(DB *d,int ok); J *task_default(DB *d,int q,const char *parent); int db_edit_data(DB *d,const char *key,J *before,J *after,J *context); J *db_export(DB *d); int db_import(DB *d,J *state); void stable_id(const char*s,char*out);
int task_complete(DB *d,const char *key,int done); int task_delete(DB *d,const char *key); int db_check(DB *d); int db_count(DB *d,const char *kind); 
J *config_read(DB *d); int config_save(DB *d,J *c); int sync_run(DB *d,int *up,int *down,int *more);
int profile_process(DWORD pid,int seconds);
int gui_main(HINSTANCE h,int argc,wchar_t **argv); int selftest(const wchar_t *dir); int cli_main(int argc,wchar_t **argv);
#endif
