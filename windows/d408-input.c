#include "d408.h"
#ifdef GX_D408_CANDIDATE
typedef struct {HWND combo,edit;J *catalog;int busy,tags;} Suggestions;
static void suggest(Suggestions *s){
 if(s->busy||GetPropW(s->edit,L"GxComposing"))return;s->busy=1;
 int length=GetWindowTextLengthW(s->edit);wchar_t *text=calloc(length+1,sizeof(wchar_t));GetWindowTextW(s->edit,text,length+1);
 DWORD begin=0,end=0;SendMessageW(s->edit,EM_GETSEL,(WPARAM)&begin,(LPARAM)&end);wchar_t *token=text;
 if(s->tags)for(wchar_t *p=text;*p;p++)if(wcschr(L",，;；\r\n",*p))token=p+1;while(*token==L' ')token++;
 size_t prefix=(size_t)(token-text);SendMessageW(s->combo,CB_RESETCONTENT,0,0);int count=0;J *item;
 cJSON_ArrayForEach(item,s->catalog){wchar_t *name=wide(item->valuestring);int match=!*token||FindNLSStringEx(LOCALE_NAME_INVARIANT,FIND_FROMSTART|NORM_IGNORECASE,name,-1,token,-1,0,0,0,0)>=0;
   if(match){size_t n=prefix+wcslen(name)+1;wchar_t *label=calloc(n,sizeof(wchar_t));wcsncpy(label,text,prefix);wcscpy(label+prefix,name);SendMessageW(s->combo,CB_ADDSTRING,0,(LPARAM)label);free(label);count++;}free(name);}
 SetWindowTextW(s->edit,text);SendMessageW(s->edit,EM_SETSEL,begin,end);
 if(*token){SendMessageW(s->combo,CB_SHOWDROPDOWN,count>0,0);ui_notice(count?"自动补全：方向键或鼠标选择，Enter确认；Ctrl+Enter保存任务。":"没有匹配项，可保留输入并保存为新项目或标签。");}
 else SendMessageW(s->combo,CB_SHOWDROPDOWN,FALSE,0);
 free(text);s->busy=0;
}
static LRESULT CALLBACK suggestion_proc(HWND h,UINT m,WPARAM w,LPARAM l,UINT_PTR id,DWORD_PTR ref){
 Suggestions *s=(Suggestions*)ref;
 if(m==WM_NCDESTROY){RemovePropW(h,L"D408Suggestions");RemoveWindowSubclass(h,suggestion_proc,id);cJSON_Delete(s->catalog);free(s);return DefSubclassProc(h,m,w,l);}
 LRESULT result=DefSubclassProc(h,m,w,l);
 if(m==WM_CHAR&&w!=VK_RETURN&&w!=L'\n'||m==WM_PASTE||m==WM_CUT||m==WM_IME_ENDCOMPOSITION)suggest(s);
 return result;
}
static void attach_suggestions(HWND combo,int tags){
 COMBOBOXINFO info={sizeof(info)};if(!combo||!GetComboBoxInfo(combo,&info)||GetPropW(info.hwndItem,L"D408Suggestions"))return;
 Suggestions *s=calloc(1,sizeof(*s));s->combo=combo;s->edit=info.hwndItem;s->tags=tags;s->catalog=cJSON_CreateArray();
 int count=(int)SendMessageW(combo,CB_GETCOUNT,0,0);for(int i=0;i<count;i++){int length=(int)SendMessageW(combo,CB_GETLBTEXTLEN,i,0);if(length<0||length>8192)continue;wchar_t *label=calloc(length+1,sizeof(wchar_t));SendMessageW(combo,CB_GETLBTEXT,i,(LPARAM)label);char *name=utf8(label);if(*name)cJSON_AddItemToArray(s->catalog,cJSON_CreateString(name));free(name);free(label);}
 SetPropW(info.hwndItem,L"D408Suggestions",s);SetWindowSubclass(info.hwndItem,suggestion_proc,408,(DWORD_PTR)s);
}
int d408_input_message(MSG *message){
 Detail *d=app.editor;if(!d)return 0;
 if(!d->note){attach_suggestions(d->fields[5],0);attach_suggestions(d->fields[7],1);}
 if(message->message!=WM_KEYDOWN||message->wParam!=VK_RETURN||!(GetKeyState(VK_CONTROL)&0x8000)||(GetKeyState(VK_SHIFT)&0x8000))return 0;
 HWND focus=GetFocus();if(!focus||!IsChild(d->hwnd,focus)||GetPropW(focus,L"GxComposing")||(GetKeyState(VK_PROCESSKEY)&0x8000))return 0;
 wchar_t cls[32];GetClassNameW(focus,cls,32);if(_wcsicmp(cls,L"EDIT")&&_wcsicmp(cls,L"COMBOBOX"))return 0;
 if(!d->note&&focus==d->quick){SendMessageW(GetDlgItem(d->scroll,572),BM_CLICK,0,0);ui_notice("Ctrl+Enter：添加一个子任务；Enter / Shift+Enter：换行。");return 1;}
 detail_save(0);ui_notice("Ctrl+Enter：保存任务或便签；Enter / Shift+Enter：在多行字段换行。");return 1;
}
#endif
