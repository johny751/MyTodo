#include "d408.h"
#ifdef GX_D408_CANDIDATE

typedef struct {UINT version;void *callback;BOOL suppressThread,suppressCodecs;} GpStartup;
__declspec(dllimport) int WINAPI GdiplusStartup(ULONG_PTR*,const GpStartup*,void*);
__declspec(dllimport) void WINAPI GdiplusShutdown(ULONG_PTR);
__declspec(dllimport) int WINAPI GdipCreateBitmapFromFile(const WCHAR*,void**);
__declspec(dllimport) int WINAPI GdipCreateHBITMAPFromBitmap(void*,HBITMAP*,DWORD);
__declspec(dllimport) int WINAPI GdipDisposeImage(void*);

enum {F_LIST=4700,F_QUERY,F_TITLE,F_CATEGORY,F_BODY,F_STATUS,F_IMAGES,F_NEW,F_DRAFT,F_SUBMIT,F_DELETE,F_UNDO,F_ADDIMAGE,F_PREVIEW,F_REMOVEIMAGE,F_EXPORT,F_IMPORT,F_CLOSE,F_NOTICE,F_HISTORY,F_COPY};
static D408Store feedbackStore;
static HWND feedbackWindow,feedbackControls[24];
static J *feedbackEditing,*feedbackRows;
static int feedbackReady,feedbackLoading,feedbackDirty;
static int feedbackTestConfirm;
static wchar_t feedbackImages[32768];
static HWND fc(int id){return feedbackControls[id-F_LIST];}
static J *empty_feedback(void){J *s=cJSON_CreateObject();sn(s,"schemaVersion",1);sn(s,"restoreGeneration",0);set(s,"ideas",cJSON_CreateArray());set(s,"drafts",cJSON_CreateArray());set(s,"deleted",cJSON_CreateArray());return s;}
static int open_feedback(void){
 if(feedbackReady)return 1;if(feedbackStore.lock&&feedbackStore.lock!=INVALID_HANDLE_VALUE)d408_store_close(&feedbackStore);
 if(!d408_store_open(&feedbackStore,"feedback",empty_feedback())){d408_error(app.window,feedbackStore.error);return 0;}
 J *s=feedbackStore.data;if(num(s,"schemaVersion")!=1||!cJSON_IsArray(get(s,"ideas"))||!cJSON_IsArray(get(s,"drafts"))||!cJSON_IsArray(get(s,"deleted"))){d408_error(app.window,"反馈数据结构无效，原文件保持不变。");return 0;}
 join(feedbackImages,feedbackStore.directory,L"feedback-images");DWORD flags=GetFileAttributesW(feedbackImages);
 if((flags!=INVALID_FILE_ATTRIBUTES&&(flags&FILE_ATTRIBUTE_REPARSE_POINT))||!ensure_dir(feedbackImages)){d408_error(app.window,"反馈图片目录不可用。");return 0;}feedbackReady=1;return 1;
}
static void image_path(wchar_t *path,J *image){wchar_t name[120],*id=wide(str(image,"id"));swprintf(name,120,L"%s.image",id);free(id);join(path,feedbackImages,name);}
static int image_valid(J *image){
 const char *id=str(image,"id"),*hash=str(image,"sha256");return *id&&strlen(id)<90&&strspn(id,"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")==strlen(id)&&strlen(hash)==64&&strspn(hash,"0123456789abcdef")==64&&num(image,"size")>0&&num(image,"size")<=10*1024*1024;
}
static int read_image(J *image,BYTE **bytes,DWORD *size){
 if(!image_valid(image))return 0;wchar_t *path=calloc(32768,sizeof(wchar_t));image_path(path,image);int ok=d408_file_read(path,bytes,size,10*1024*1024);free(path);char hash[65];if(ok){d408_hash(*bytes,*size,hash);ok=*size==(DWORD)num(image,"size")&&!strcmp(hash,str(image,"sha256"));}if(!ok){free(*bytes);*bytes=0;}return ok;
}
static J *new_idea(void){J *idea=cJSON_CreateObject();char id[80],time[40];uuid(id);now(time);ss(idea,"id",id);ss(idea,"title","");ss(idea,"body","");ss(idea,"category","功能建议");ss(idea,"status","pending");ss(idea,"createdAt",time);ss(idea,"updatedAt",time);set(idea,"attachments",cJSON_CreateArray());set(idea,"history",cJSON_CreateArray());return idea;}
static J *collect_feedback(void){
 J *idea=feedbackEditing?dup(feedbackEditing):new_idea();char *text=ui_text(fc(F_TITLE));ss(idea,"title",text);free(text);text=ui_text(fc(F_BODY));ss(idea,"body",text);free(text);text=ui_text(fc(F_CATEGORY));ss(idea,"category",text);free(text);ss(idea,"status",SendMessageW(fc(F_STATUS),CB_GETCURSEL,0,0)==1?"resolved":"pending");return idea;
}
static void feedback_list(void){
 if(!feedbackWindow)return;feedbackLoading=1;SendMessageW(fc(F_LIST),LB_RESETCONTENT,0,0);cJSON_Delete(feedbackRows);feedbackRows=cJSON_CreateArray();char *query=ui_text(fc(F_QUERY));
 const char *kinds[]={"drafts","ideas"};for(int kind=0;kind<2;kind++){J *rows=get(feedbackStore.data,kinds[kind]);for(int i=cJSON_GetArraySize(rows)-1;i>=0;i--){J *idea=cJSON_GetArrayItem(rows,i);if(*query&&!strstr(str(idea,"title"),query)&&!strstr(str(idea,"body"),query))continue;
   J *row=cJSON_CreateObject();ss(row,"id",str(idea,"id"));ss(row,"kind",kinds[kind]);cJSON_AddItemToArray(feedbackRows,row);char text[600];snprintf(text,sizeof(text),"%s [%s] %.160s",kind?(!strcmp(str(idea,"status"),"resolved")?"已处理":"待处理"):"草稿",str(idea,"category"),*str(idea,"title")?str(idea,"title"):str(idea,"body"));wchar_t *w=wide(text);SendMessageW(fc(F_LIST),LB_ADDSTRING,0,(LPARAM)w);free(w);}}
 free(query);feedbackLoading=0;
}
static void fill_feedback(J *idea){
 feedbackLoading=1;cJSON_Delete(feedbackEditing);feedbackEditing=idea?dup(idea):new_idea();ui_set(fc(F_TITLE),str(feedbackEditing,"title"));ui_set(fc(F_BODY),str(feedbackEditing,"body"));
 const char *categories[]={"功能建议","问题反馈","体验优化","其他"};int category=3;for(int i=0;i<4;i++)if(!strcmp(str(feedbackEditing,"category"),categories[i]))category=i;SendMessageW(fc(F_CATEGORY),CB_SETCURSEL,category,0);SendMessageW(fc(F_STATUS),CB_SETCURSEL,!strcmp(str(feedbackEditing,"status"),"resolved"),0);
 SendMessageW(fc(F_IMAGES),LB_RESETCONTENT,0,0);J *attachment;cJSON_ArrayForEach(attachment,get(feedbackEditing,"attachments")){char label[700];snprintf(label,sizeof(label),"%s · %.1f KiB · %.12s",str(attachment,"name"),num(attachment,"size")/1024.,str(attachment,"sha256"));wchar_t *w=wide(label);SendMessageW(fc(F_IMAGES),LB_ADDSTRING,0,(LPARAM)w);free(w);}
 char notice[1200];snprintf(notice,sizeof(notice),"本机反馈 · %s · 历史操作%d条 · 实际图片%d张\r\n草稿自动保存；本地提交不连接远端服务。反馈与任务附件分开保存。",str(feedbackEditing,"updatedAt"),cJSON_GetArraySize(get(feedbackEditing,"history")),cJSON_GetArraySize(get(feedbackEditing,"attachments")));ui_set(fc(F_NOTICE),notice);feedbackDirty=0;feedbackLoading=0;
}
static int save_feedback(int submit){
 if(!feedbackWindow||feedbackLoading||!submit&&!feedbackDirty)return 1;J *idea=collect_feedback();if(submit&&!*str(idea,"body")&&!*str(idea,"title")){cJSON_Delete(idea);ui_set(fc(F_NOTICE),"请填写标题或反馈内容后再提交。");return 0;}
 if(!submit&&!*str(idea,"body")&&!*str(idea,"title")&&cJSON_GetArraySize(get(idea,"attachments"))==0&&!d408_find(get(feedbackStore.data,"drafts"),str(idea,"id"))){cJSON_Delete(idea);return 1;}
 J *next=dup(feedbackStore.data);const char *id=str(idea,"id");d408_remove(get(next,"drafts"),id);
 if(submit){d408_remove(get(next,"ideas"),id);d408_event(idea,"local-submit","保存为本机反馈记录，未发送远程服务。");cJSON_AddItemToArray(get(next,"ideas"),dup(idea));}
 else {char time[40];now(time);ss(idea,"updatedAt",time);cJSON_AddItemToArray(get(next,"drafts"),dup(idea));}
 int ok=d408_store_commit(&feedbackStore,next);cJSON_Delete(next);
 if(ok){cJSON_Delete(feedbackEditing);feedbackEditing=idea;feedbackDirty=0;feedback_list();ui_set(fc(F_NOTICE),submit?"本地提交成功。可在历史中编辑、处理、导出或删除；未连接远程服务。":"草稿已保存。关闭窗口或重启后可从草稿列表恢复。");}
 else {cJSON_Delete(idea);ui_set(fc(F_NOTICE),feedbackStore.error);feedbackDirty=1;}
 return ok;
}
static void add_image(void){
 if(cJSON_GetArraySize(get(feedbackEditing,"attachments"))>=20){d408_error(feedbackWindow,"本候选每条反馈最多20张图片；现有图片不会删除。");return;}
 wchar_t *path=calloc(32768,sizeof(wchar_t));OPENFILENAMEW chooser={sizeof(chooser)};chooser.hwndOwner=feedbackWindow;chooser.lpstrFile=path;chooser.nMaxFile=32768;chooser.lpstrFilter=L"图片\0*.png;*.jpg;*.jpeg;*.gif;*.bmp\0\0";chooser.Flags=OFN_FILEMUSTEXIST|OFN_EXPLORER|OFN_NOCHANGEDIR;
 if(!GetOpenFileNameW(&chooser)){free(path);return;}BYTE *bytes=0;DWORD size=0;
 if(!d408_file_read(path,&bytes,&size,10*1024*1024)||!size){free(bytes);free(path);d408_error(feedbackWindow,"无法读取图片，或图片超过本候选每张10MiB的限制。");return;}
 const char *mime=size>=8&&!memcmp(bytes,"\x89PNG\r\n\x1a\n",8)?"image/png":size>=3&&bytes[0]==255&&bytes[1]==216&&bytes[2]==255?"image/jpeg":size>=6&&(!memcmp(bytes,"GIF87a",6)||!memcmp(bytes,"GIF89a",6))?"image/gif":size>=2&&!memcmp(bytes,"BM",2)?"image/bmp":0;
 if(!mime){free(bytes);free(path);d408_error(feedbackWindow,"文件不是受支持的PNG、JPEG、GIF或BMP图片。");return;}
 J *idea=collect_feedback(),*image=cJSON_CreateObject();char id[80],hash[65];uuid(id);d408_hash(bytes,size,hash);ss(image,"id",id);ss(image,"sha256",hash);ss(image,"mime",mime);sn(image,"size",size);const wchar_t *filename=wcsrchr(path,L'\\');char *name=utf8(filename?filename+1:path);ss(image,"name",name);free(name);image_path(path,image);
 int ok=d408_file_write(path,bytes,size);free(bytes);free(path);
 if(!ok){cJSON_Delete(image);cJSON_Delete(idea);d408_error(feedbackWindow,"图片保存失败，原反馈与草稿保留，请重试。");return;}
 cJSON_AddItemToArray(get(idea,"attachments"),image);fill_feedback(idea);cJSON_Delete(idea);feedbackDirty=1;save_feedback(0);
}
static LRESULT CALLBACK preview_proc(HWND h,UINT m,WPARAM w,LPARAM l){
 HBITMAP bitmap=(HBITMAP)GetWindowLongPtrW(h,GWLP_USERDATA);
 if(m==WM_CREATE){bitmap=((CREATESTRUCTW*)l)->lpCreateParams;SetWindowLongPtrW(h,GWLP_USERDATA,(LONG_PTR)bitmap);return 0;}
 if(m==WM_PAINT&&bitmap){PAINTSTRUCT ps;HDC dc=BeginPaint(h,&ps),source=CreateCompatibleDC(dc);HGDIOBJ old=SelectObject(source,bitmap);BITMAP size;GetObjectW(bitmap,sizeof(size),&size);RECT r;GetClientRect(h,&r);FillRect(dc,&r,app.white);double scale=fmin((double)r.right/size.bmWidth,(double)r.bottom/size.bmHeight);int width=(int)(size.bmWidth*scale),height=(int)(size.bmHeight*scale);SetStretchBltMode(dc,HALFTONE);StretchBlt(dc,(r.right-width)/2,(r.bottom-height)/2,width,height,source,0,0,size.bmWidth,size.bmHeight,SRCCOPY);SelectObject(source,old);DeleteDC(source);EndPaint(h,&ps);return 0;}
 if(m==WM_SIZE){InvalidateRect(h,0,TRUE);return 0;}if(m==WM_DESTROY){DeleteObject(bitmap);return 0;}return DefWindowProcW(h,m,w,l);
}
static void preview_image(void){
 int selected=(int)SendMessageW(fc(F_IMAGES),LB_GETCURSEL,0,0);J *image=cJSON_GetArrayItem(get(feedbackEditing,"attachments"),selected);BYTE *bytes=0;DWORD size=0;if(!image)return;
 if(!read_image(image,&bytes,&size)){d408_error(feedbackWindow,"图片缺失或SHA256不匹配，原记录保持不变。");return;}free(bytes);
 GpStartup startup={1,0,FALSE,FALSE};ULONG_PTR token=0;void *picture=0;HBITMAP bitmap=0;wchar_t *path=calloc(32768,sizeof(wchar_t));image_path(path,image);
 int ok=GdiplusStartup(&token,&startup,0)==0&&GdipCreateBitmapFromFile(path,&picture)==0&&GdipCreateHBITMAPFromBitmap(picture,&bitmap,0xffffffff)==0;
 free(path);if(picture)GdipDisposeImage(picture);if(token)GdiplusShutdown(token);if(!ok){d408_error(feedbackWindow,"图片内容不能解码，文件仍完整保留。");return;}
 WNDCLASSW cls={0};cls.lpfnWndProc=preview_proc;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.lpszClassName=L"GxD408FeedbackImage";RegisterClassW(&cls);HWND h=CreateWindowExW(0,cls.lpszClassName,L"反馈图片预览",WS_OVERLAPPEDWINDOW|WS_VISIBLE,CW_USEDEFAULT,CW_USEDEFAULT,U(780),U(620),feedbackWindow,0,app.instance,bitmap);if(!h)DeleteObject(bitmap);
}
static void delete_feedback(void){
 if(!feedbackEditing||!feedbackTestConfirm&&MessageBoxW(feedbackWindow,L"删除这条反馈及其草稿？图片保留在删除批次中，可点击撤销删除恢复。",L"删除反馈",MB_OKCANCEL|MB_ICONQUESTION)!=IDOK)return;
 J *next=dup(feedbackStore.data),*idea=collect_feedback(),*batch=cJSON_CreateObject();char id[80],time[40];uuid(id);now(time);ss(batch,"id",str(idea,"id"));ss(batch,"batchId",id);ss(batch,"deletedAt",time);sn(batch,"restoreGeneration",num(next,"restoreGeneration"));set(batch,"record",idea);
 d408_remove(get(next,"ideas"),str(feedbackEditing,"id"));d408_remove(get(next,"drafts"),str(feedbackEditing,"id"));d408_remove(get(next,"deleted"),str(feedbackEditing,"id"));cJSON_AddItemToArray(get(next,"deleted"),batch);
 if(d408_store_commit(&feedbackStore,next)){fill_feedback(0);feedback_list();}else d408_error(feedbackWindow,feedbackStore.error);cJSON_Delete(next);
}
static void undo_delete(void){
 J *deleted=get(feedbackStore.data,"deleted");int count=cJSON_GetArraySize(deleted);if(!count){ui_set(fc(F_NOTICE),"没有可恢复的删除批次。");return;}J *next=dup(feedbackStore.data),*batch=cJSON_GetArrayItem(get(next,"deleted"),count-1),*idea=dup(get(batch,"record"));
 d408_event(idea,"restore-delete","用户明确撤销最后一次反馈删除。");sn(idea,"restoredGeneration",num(next,"restoreGeneration")+1);ss(idea,"restoredFromBatchId",str(batch,"batchId"));d408_remove(get(next,"ideas"),str(idea,"id"));cJSON_AddItemToArray(get(next,"ideas"),dup(idea));cJSON_DeleteItemFromArray(get(next,"deleted"),count-1);sn(next,"restoreGeneration",num(next,"restoreGeneration")+1);
 if(d408_store_commit(&feedbackStore,next)){fill_feedback(idea);feedback_list();}else d408_error(feedbackWindow,feedbackStore.error);cJSON_Delete(idea);cJSON_Delete(next);
}
static char *base64(BYTE *bytes,DWORD size){DWORD length=0;if(!CryptBinaryToStringA(bytes,size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,0,&length))return 0;char *text=malloc(length);if(!text)return 0;if(!CryptBinaryToStringA(bytes,size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,text,&length)){free(text);return 0;}return text;}
static J *feedback_backup(void){
 J *backup=cJSON_CreateObject(),*images=cJSON_CreateObject();ss(backup,"format","mytodo.d408.feedback-backup");sn(backup,"version",1);set(backup,"state",dup(feedbackStore.data));set(backup,"images",images);
 const char *kinds[]={"ideas","drafts","deleted"};for(int k=0;k<3;k++){J *row;cJSON_ArrayForEach(row,get(feedbackStore.data,kinds[k])){J *idea=k==2?get(row,"record"):row,*attachment;cJSON_ArrayForEach(attachment,get(idea,"attachments")){const char *id=str(attachment,"id");if(get(images,id))continue;BYTE *bytes=0;DWORD size=0;if(!read_image(attachment,&bytes,&size)){cJSON_Delete(backup);return 0;}char *encoded=base64(bytes,size);free(bytes);if(!encoded){cJSON_Delete(backup);return 0;}ss(images,id,encoded);free(encoded);}}}return backup;
}
static int import_images(J *incoming,J *images){
 const char *kinds[]={"ideas","drafts","deleted"};for(int k=0;k<3;k++){J *row;cJSON_ArrayForEach(row,get(incoming,kinds[k])){J *idea=k==2?get(row,"record"):row,*image;
   if(!*str(idea,"id")||!cJSON_IsArray(get(idea,"attachments")))return 0;
   cJSON_ArrayForEach(image,get(idea,"attachments")){if(!image_valid(image))return 0;const char *encoded=str(images,str(image,"id"));DWORD length=0;if(!*encoded||!CryptStringToBinaryA(encoded,0,CRYPT_STRING_BASE64,0,&length,0,0)||length!=(DWORD)num(image,"size"))return 0;BYTE *bytes=malloc(length);if(!bytes)return 0;int ok=CryptStringToBinaryA(encoded,0,CRYPT_STRING_BASE64,bytes,&length,0,0);char hash[65];if(ok){d408_hash(bytes,length,hash);ok=!strcmp(hash,str(image,"sha256"));}
     wchar_t *path=calloc(32768,sizeof(wchar_t));image_path(path,image);if(ok&&GetFileAttributesW(path)!=INVALID_FILE_ATTRIBUTES){BYTE *old=0;DWORD size=0;ok=d408_file_read(path,&old,&size,10*1024*1024)&&size==length&&!memcmp(old,bytes,length);free(old);}else if(ok)ok=d408_file_write(path,bytes,length);free(path);free(bytes);if(!ok)return 0;
   }} }return 1;
}
static int restored_after(J *current,J *tomb){return current&&(num(current,"restoredGeneration")>num(tomb,"restoreGeneration")||!strcmp(str(current,"restoredFromBatchId"),str(tomb,"batchId")));}
static void merge_feedback(J *next,J *incoming){
 J *tomb;cJSON_ArrayForEach(tomb,get(incoming,"deleted")){const char *id=str(tomb,"id");J *existing=d408_find(get(next,"ideas"),id),*draft=d408_find(get(next,"drafts"),id);if(restored_after(existing,tomb)||restored_after(draft,tomb))continue;if(!d408_find(get(next,"deleted"),id))cJSON_AddItemToArray(get(next,"deleted"),dup(tomb));d408_remove(get(next,"ideas"),id);d408_remove(get(next,"drafts"),id);}
 const char *kinds[]={"ideas","drafts"};for(int k=0;k<2;k++){J *idea;cJSON_ArrayForEach(idea,get(incoming,kinds[k])){if(d408_find(get(next,"deleted"),str(idea,"id")))continue;J *old=d408_find(get(next,kinds[k]),str(idea,"id"));if(!old||strcmp(str(idea,"updatedAt"),str(old,"updatedAt"))>0){d408_remove(get(next,kinds[k]),str(idea,"id"));cJSON_AddItemToArray(get(next,kinds[k]),dup(idea));}else if(!strcmp(str(idea,"updatedAt"),str(old,"updatedAt"))&&!eq(old,idea)){J *copy=dup(idea);char id[80];uuid(id);ss(copy,"id",id);d408_event(copy,"restore-conflict","同时间不同内容保留为独立副本。");cJSON_AddItemToArray(get(next,kinds[k]),copy);}}}
 sn(next,"restoreGeneration",fmax(num(next,"restoreGeneration"),num(incoming,"restoreGeneration"))+1);
}
static int feedback_valid(J *state){
 if(num(state,"schemaVersion")!=1||num(state,"restoreGeneration")<0||num(state,"restoreGeneration")!=floor(num(state,"restoreGeneration")))return 0;
 const char *kinds[]={"ideas","drafts","deleted"};for(int k=0;k<3;k++){J *rows=get(state,kinds[k]),*row;if(!cJSON_IsArray(rows))return 0;int index=0;cJSON_ArrayForEach(row,rows){J *idea=k==2?get(row,"record"):row;const char *id=str(idea,"id");if(!*id||strlen(id)>80||strspn(id,"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-")!=strlen(id)||!d408_choice(str(idea,"status"),"pending|resolved")||!cJSON_IsArray(get(idea,"history"))||!cJSON_IsArray(get(idea,"attachments"))||cJSON_GetArraySize(get(idea,"attachments"))>20||strlen(str(idea,"createdAt"))<20||strlen(str(idea,"updatedAt"))<20)return 0;for(int i=0;i<index;i++)if(!strcmp(str(cJSON_GetArrayItem(rows,i),"id"),str(row,"id")))return 0;if(k==2&&(!*str(row,"batchId")||strcmp(str(row,"id"),id)||strlen(str(row,"deletedAt"))<20))return 0;J *image;cJSON_ArrayForEach(image,get(idea,"attachments"))if(!image_valid(image))return 0;index++;}}return 1;
}
static void backup_file(int importing){
 if(!save_feedback(0))return;wchar_t *path=calloc(32768,sizeof(wchar_t));wcscpy(path,L"MyTodo-feedback-d408.json");OPENFILENAMEW chooser={sizeof(chooser)};chooser.hwndOwner=feedbackWindow;chooser.lpstrFile=path;chooser.nMaxFile=32768;chooser.lpstrFilter=L"反馈备份 JSON\0*.json\0\0";chooser.lpstrDefExt=L"json";chooser.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|(importing?OFN_FILEMUSTEXIST:OFN_OVERWRITEPROMPT);
 if(!(importing?GetOpenFileNameW(&chooser):GetSaveFileNameW(&chooser))){free(path);return;}
 if(!importing){J *backup=feedback_backup();char *encoded=backup?json(backup):0;int ok=encoded&&d408_file_write(path,(BYTE*)encoded,(DWORD)strlen(encoded));free(encoded);cJSON_Delete(backup);free(path);if(!ok)d408_error(feedbackWindow,"反馈导出失败：图片可能缺失或输出不可写；原数据保留。");else ui_set(fc(F_NOTICE),"反馈、草稿、删除批次及实际图片已完整导出。");return;}
 BYTE *bytes=0;DWORD length=0;int loaded=d408_file_read(path,&bytes,&length,64*1024*1024);free(path);J *backup=loaded?cJSON_Parse((char*)bytes):0;free(bytes);J *incoming=get(backup,"state");
 if(!backup||strcmp(str(backup,"format"),"mytodo.d408.feedback-backup")||num(backup,"version")!=1||!feedback_valid(incoming)){cJSON_Delete(backup);d408_error(feedbackWindow,"请选择有效D408完整反馈备份。旧版六字段JSON仍由原「优化意见」入口导入，避免丢失附件和分类。");return;}
 if(MessageBoxW(feedbackWindow,L"合并完整反馈备份？当前数据会先保存完整恢复前备份；已删除的反馈不会被旧备份自动复活。",L"恢复反馈",MB_OKCANCEL|MB_ICONQUESTION)!=IDOK){cJSON_Delete(backup);return;}
 J *before=feedback_backup();char *encoded=before?json(before):0;wchar_t *safety=calloc(32768,sizeof(wchar_t));swprintf(safety,32768,L"%s\\feedback-before-restore-%llu.json",feedbackStore.directory,GetTickCount64());int ok=encoded&&d408_file_write(safety,(BYTE*)encoded,(DWORD)strlen(encoded));free(safety);free(encoded);cJSON_Delete(before);
 if(ok)ok=import_images(incoming,get(backup,"images"));J *next=dup(feedbackStore.data);
 if(ok){merge_feedback(next,incoming);ok=d408_store_commit(&feedbackStore,next);}
 cJSON_Delete(next);cJSON_Delete(backup);if(ok){fill_feedback(0);feedback_list();ui_set(fc(F_NOTICE),"恢复完成，已保留恢复前备份和删除批次；没有连接任何远程服务。");}else d408_error(feedbackWindow,"反馈恢复未完成。原状态、恢复前备份和图片均保留，请检查文件后重试。");
}
static void layout_feedback(void){
 RECT r;GetClientRect(feedbackWindow,&r);int left=U(18),listWidth=U(268),right=U(306),width=r.right-right-U(18);
 ui_move(fc(F_QUERY),left,U(18),listWidth,U(30));ui_move(fc(F_LIST),left,U(60),listWidth,max(U(180),r.bottom-U(235)));ui_move(fc(F_HISTORY),left,r.bottom-U(215),listWidth/2-U(3),U(30));ui_move(fc(F_COPY),left+listWidth/2+U(3),r.bottom-U(215),listWidth/2-U(3),U(30));
 ui_move(fc(F_TITLE),right,U(18),width,U(32));ui_move(fc(F_CATEGORY),right,U(62),width/2-U(6),U(170));ui_move(fc(F_STATUS),right+width/2+U(6),U(62),width/2-U(6),U(170));
 ui_move(fc(F_BODY),right,U(108),width,max(U(120),r.bottom-U(440)));ui_move(fc(F_IMAGES),right,r.bottom-U(314),width,U(100));
 int ids[]={F_ADDIMAGE,F_PREVIEW,F_REMOVEIMAGE};for(int i=0;i<3;i++)ui_move(fc(ids[i]),right+i*(width/3),r.bottom-U(204),width/3-U(6),U(32));
 int bottom=r.bottom-U(156);int buttons[]={F_NEW,F_DRAFT,F_SUBMIT,F_DELETE,F_UNDO,F_EXPORT,F_IMPORT,F_CLOSE};for(int i=0;i<8;i++)ui_move(fc(buttons[i]),U(18)+(i%4)*((r.right-U(36))/4),bottom+(i/4)*U(40),(r.right-U(36))/4-U(6),U(32));
 ui_move(fc(F_NOTICE),U(18),r.bottom-U(65),r.right-U(36),U(58));
}
static LRESULT CALLBACK feedback_proc(HWND h,UINT message,WPARAM w,LPARAM l){
 if(message==WM_CREATE){feedbackWindow=h;
   const wchar_t *labels[]={L"历史反馈与草稿",L"",L"",L"分类",L"",L"状态",L"图片附件",L"新建",L"保存草稿",L"本地提交 / 更新",L"删除",L"撤销删除",L"选择图片",L"预览图片",L"移除图片",L"导出完整备份",L"恢复完整备份",L"关闭",L""};
   for(int id=F_LIST;id<=F_NOTICE;id++){const wchar_t *cls=id==F_LIST||id==F_IMAGES?L"LISTBOX":id==F_QUERY||id==F_TITLE||id==F_BODY?L"EDIT":id==F_CATEGORY||id==F_STATUS?L"COMBOBOX":id==F_NOTICE?L"STATIC":L"BUTTON";
     DWORD style=id==F_LIST||id==F_IMAGES?LBS_NOTIFY|WS_VSCROLL|LBS_NOINTEGRALHEIGHT:id==F_BODY?ES_MULTILINE|ES_WANTRETURN|ES_AUTOVSCROLL|WS_VSCROLL:id==F_QUERY||id==F_TITLE?ES_AUTOHSCROLL:id==F_CATEGORY||id==F_STATUS?CBS_DROPDOWNLIST:0;feedbackControls[id-F_LIST]=ui_control(h,cls,labels[id-F_LIST],style|WS_TABSTOP,id,0,0,0,0);}
   feedbackControls[F_HISTORY-F_LIST]=ui_control(h,L"BUTTON",L"操作历史",WS_TABSTOP,F_HISTORY,0,0,0,0);feedbackControls[F_COPY-F_LIST]=ui_control(h,L"BUTTON",L"复制内容",WS_TABSTOP,F_COPY,0,0,0,0);
   const wchar_t *categories[]={L"功能建议",L"问题反馈",L"体验优化",L"其他"};for(int i=0;i<4;i++)SendMessageW(fc(F_CATEGORY),CB_ADDSTRING,0,(LPARAM)categories[i]);SendMessageW(fc(F_STATUS),CB_ADDSTRING,0,(LPARAM)L"待处理");SendMessageW(fc(F_STATUS),CB_ADDSTRING,0,(LPARAM)L"已处理");SendMessageW(fc(F_QUERY),EM_SETCUEBANNER,TRUE,(LPARAM)L"搜索历史和草稿");SendMessageW(fc(F_TITLE),EM_SETCUEBANNER,TRUE,(LPARAM)L"反馈标题");
   fill_feedback(0);feedback_list();return 0;
 }
 if(message==WM_COMMAND){int id=LOWORD(w),event=HIWORD(w);if(feedbackLoading)return 0;
   if((id==F_TITLE||id==F_BODY)&&event==EN_CHANGE||(id==F_CATEGORY||id==F_STATUS)&&event==CBN_SELCHANGE){feedbackDirty=1;SetTimer(h,1,650,0);return 0;}
   if(id==F_QUERY&&event==EN_CHANGE){feedback_list();return 0;}
   if(id==F_HISTORY){char *text=cJSON_Print(get(feedbackEditing,"history"));wchar_t *wideText=wide(text?text:"[]");MessageBoxW(h,wideText,L"反馈操作历史（UTC）",MB_OK);free(wideText);free(text);return 0;}
   if(id==F_COPY){J *idea=collect_feedback();char *body=json(idea);wchar_t *text=wide(body);size_t size=(wcslen(text)+1)*sizeof(wchar_t);HGLOBAL memory=GlobalAlloc(GMEM_MOVEABLE,size);if(memory){void *p=GlobalLock(memory);memcpy(p,text,size);GlobalUnlock(memory);if(OpenClipboard(h)){EmptyClipboard();if(!SetClipboardData(CF_UNICODETEXT,memory))GlobalFree(memory);CloseClipboard();}else GlobalFree(memory);}free(text);free(body);cJSON_Delete(idea);return 0;}
   if(id==F_LIST&&event==LBN_SELCHANGE){int selected=(int)SendMessageW(fc(F_LIST),LB_GETCURSEL,0,0);J *row=dup(cJSON_GetArrayItem(feedbackRows,selected));if(row&&save_feedback(0)){J *idea=d408_find(get(feedbackStore.data,str(row,"kind")),str(row,"id"));if(idea)fill_feedback(idea);}cJSON_Delete(row);return 0;}
   if(id==F_NEW){if(save_feedback(0))fill_feedback(0);return 0;}if(id==F_DRAFT){save_feedback(0);return 0;}if(id==F_SUBMIT){save_feedback(1);return 0;}if(id==F_DELETE){delete_feedback();return 0;}if(id==F_UNDO){undo_delete();return 0;}
   if(id==F_ADDIMAGE){add_image();return 0;}if(id==F_PREVIEW||id==F_IMAGES&&event==LBN_DBLCLK){preview_image();return 0;}
   if(id==F_REMOVEIMAGE){int selected=(int)SendMessageW(fc(F_IMAGES),LB_GETCURSEL,0,0);if(selected>=0&&MessageBoxW(h,L"从当前反馈移除选中的图片？已导出的备份和历史文件保留。",L"移除图片",MB_OKCANCEL)==IDOK){J *idea=collect_feedback();cJSON_DeleteItemFromArray(get(idea,"attachments"),selected);fill_feedback(idea);cJSON_Delete(idea);feedbackDirty=1;save_feedback(0);}return 0;}
   if(id==F_EXPORT||id==F_IMPORT){backup_file(id==F_IMPORT);return 0;}if(id==F_CLOSE){SendMessageW(h,WM_CLOSE,0,0);return 0;}
 }
 if(message==WM_TIMER&&w==1){KillTimer(h,1);if(feedbackDirty)save_feedback(0);return 0;}if(message==WM_SIZE){layout_feedback();return 0;}
 if(message==WM_CLOSE){if(save_feedback(0))ShowWindow(h,SW_HIDE);return 0;}if(message==WM_GETMINMAXINFO){((MINMAXINFO*)l)->ptMinTrackSize.x=U(980);((MINMAXINFO*)l)->ptMinTrackSize.y=U(750);return 0;}
 if(message==WM_DESTROY){KillTimer(h,1);feedbackWindow=0;return 0;}if(message==WM_DRAWITEM){ui_theme_draw_button((DRAWITEMSTRUCT*)l);return TRUE;}
 return DefWindowProcW(h,message,w,l);
}
void d408_feedback_open(void){if(!open_feedback())return;if(!feedbackWindow){WNDCLASSW cls={0};cls.lpfnWndProc=feedback_proc;cls.hInstance=app.instance;cls.hCursor=LoadCursorW(0,IDC_ARROW);cls.hbrBackground=app.white;cls.lpszClassName=L"GxD408Feedback";RegisterClassW(&cls);feedbackWindow=CreateWindowExW(WS_EX_CONTROLPARENT,cls.lpszClassName,L"MyTodo · 优化反馈（本机隔离候选）",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,CW_USEDEFAULT,CW_USEDEFAULT,U(1080),U(820),app.window,0,app.instance,0);}ShowWindow(feedbackWindow,SW_RESTORE);SetForegroundWindow(feedbackWindow);}
void d408_feedback_close(void){if(feedbackWindow){save_feedback(0);DestroyWindow(feedbackWindow);}cJSON_Delete(feedbackEditing);feedbackEditing=0;cJSON_Delete(feedbackRows);feedbackRows=0;d408_store_close(&feedbackStore);feedbackReady=0;}
int d408_feedback_flush(void){if(save_feedback(0))return 1;d408_error(feedbackWindow,"反馈草稿尚未保存，请重试后退出。");return 0;}

int d408_feedback_regression(const wchar_t *render){
 d408_feedback_open();d408_check("feedback",feedbackReady&&feedbackWindow,"native feedback entry opens editable persistent form");if(!feedbackReady)return 0;
 ui_set(fc(F_TITLE),"D408 feedback draft");ui_set(fc(F_BODY),"Original feedback body with multiline\r\nSecond line");feedbackDirty=1;d408_check("feedback",save_feedback(0)&&cJSON_GetArraySize(get(feedbackStore.data,"drafts"))==1,"draft persists original fields and multiline body");char id[80];strcpy(id,str(feedbackEditing,"id"));
 d408_feedback_close();d408_feedback_open();J *draft=d408_find(get(feedbackStore.data,"drafts"),id);d408_check("feedback",draft&&!strcmp(str(draft,"title"),"D408 feedback draft"),"draft survives close and store reopen");fill_feedback(draft);
 const char *png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";DWORD size=0;CryptStringToBinaryA(png,0,CRYPT_STRING_BASE64,0,&size,0,0);BYTE *bytes=malloc(size);CryptStringToBinaryA(png,0,CRYPT_STRING_BASE64,bytes,&size,0,0);char hash[65],imageId[80];d408_hash(bytes,size,hash);uuid(imageId);J *image=cJSON_CreateObject();ss(image,"id",imageId);ss(image,"name","regression.png");ss(image,"mime","image/png");ss(image,"sha256",hash);sn(image,"size",size);wchar_t *path=calloc(32768,sizeof(wchar_t));image_path(path,image);int wrote=d408_file_write(path,bytes,size);J *idea=collect_feedback();cJSON_AddItemToArray(get(idea,"attachments"),image);fill_feedback(idea);cJSON_Delete(idea);feedbackDirty=1;d408_check("feedback",wrote&&save_feedback(0),"attachment saves actual PNG bytes with draft");BYTE *read=0;DWORD readSize=0;d408_check("feedback",read_image(cJSON_GetArrayItem(get(feedbackEditing,"attachments"),0),&read,&readSize)&&readSize==size&&!memcmp(read,bytes,size),"attachment readback exactly matches original bytes");free(read);
 d408_check("feedback",save_feedback(1)&&cJSON_GetArraySize(get(feedbackStore.data,"ideas"))==1&&cJSON_GetArraySize(get(feedbackStore.data,"drafts"))==0,"local submit preserves fields and moves draft to history");d408_check("feedback",save_feedback(0)&&cJSON_GetArraySize(get(feedbackStore.data,"drafts"))==0,"closing clean submitted feedback does not duplicate draft");
 J *backup=feedback_backup();d408_check("feedback",backup&&feedback_valid(get(backup,"state"))&&*str(get(backup,"images"),imageId),"full backup includes feedback history and actual attachment base64");
 feedbackTestConfirm=1;delete_feedback();feedbackTestConfirm=0;d408_check("feedback",cJSON_GetArraySize(get(feedbackStore.data,"ideas"))==0&&cJSON_GetArraySize(get(feedbackStore.data,"deleted"))==1,"confirmed deletion retains complete deletion batch");J *deletedState=dup(feedbackStore.data),*next=dup(feedbackStore.data);merge_feedback(next,get(backup,"state"));d408_check("feedback",cJSON_GetArraySize(get(next,"ideas"))==0,"old backup cannot resurrect deleted feedback");cJSON_Delete(next);undo_delete();d408_check("feedback",cJSON_GetArraySize(get(feedbackStore.data,"ideas"))==1&&num(feedbackStore.data,"restoreGeneration")==1,"explicit undo restores feedback and increments generation");next=dup(feedbackStore.data);merge_feedback(next,deletedState);d408_check("feedback",d408_find(get(next,"ideas"),id)&&cJSON_GetArraySize(get(next,"deleted"))==0,"stale deletion batch cannot remove explicitly restored feedback");cJSON_Delete(next);cJSON_Delete(deletedState);
 ui_set(fc(F_BODY),"Retry content");feedbackDirty=1;J *before=dup(feedbackStore.data);d408_test_write_failure=1;d408_check("feedback",!save_feedback(0)&&feedbackDirty&&eq(before,feedbackStore.data),"write failure keeps dirty draft and prior durable state");d408_test_write_failure=0;d408_check("feedback",save_feedback(0)&&!feedbackDirty,"retry persists previously failed draft");cJSON_Delete(before);
 BYTE bad[]={1,2,3};d408_file_write(path,bad,sizeof(bad));read=0;readSize=0;d408_check("feedback",!read_image(cJSON_GetArrayItem(get(feedbackEditing,"attachments"),0),&read,&readSize)&&!feedback_backup(),"corrupted attachment blocks silent incomplete backup");d408_file_write(path,bytes,size);free(bytes);free(path);cJSON_Delete(backup);
 if(render)ui_visual_window_snap(feedbackWindow,render,L"feedback-rich-history");d408_feedback_close();d408_feedback_open();d408_check("feedback",d408_find(get(feedbackStore.data,"drafts"),id)!=0&&d408_find(get(feedbackStore.data,"ideas"),id)!=0,"reopen preserves submitted record and newer editable draft");return 1;
}

#endif
