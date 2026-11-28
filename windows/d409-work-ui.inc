#ifdef GX_D409_UI
/* Read-only presentation and transient navigation state. Original rows/strings remain authoritative. */
enum {D409_W_TITLE=5200,D409_W_SUBTITLE,D409_W_DETAIL_TITLE,D409_W_DETAIL,D409_W_BRAND,D409_W_HOME,D409_W_TIMER,D409_W_FEEDBACK,D409_W_CAPTION};
typedef struct {char *query,*project,*kind,*id;int status,top,valid;} D409WorkView;
static D409WorkView d409WorkViews[10];static char *d409WorkAccount;static int d409WorkSwitching;
static void d409_work_view_clear(D409WorkView *v){free(v->query);free(v->project);free(v->kind);free(v->id);memset(v,0,sizeof(*v));}
static void d409_work_reset_views(void){for(int i=0;i<10;i++)d409_work_view_clear(&d409WorkViews[i]);free(d409WorkAccount);d409WorkAccount=_strdup(account());}
static int d409_work_account_valid(void){if(!d409WorkAccount||strcmp(d409WorkAccount,account())){d409_work_reset_views();return 0;}return 1;}
static void d409_work_selection(void){
 if(!d409_work_account_valid()||d409WorkSwitching||workPage<0||workPage>9)return;D409WorkView *v=&d409WorkViews[workPage];J *row=selected_row();
 free(v->id);free(v->kind);v->id=_strdup(str(row,"id"));v->kind=_strdup(str(row,"kind"));v->top=(int)SendMessageW(wc(W_LIST),LB_GETTOPINDEX,0,0);
}
static void d409_work_capture(void){
 d409_work_account_valid();D409WorkView *v=&d409WorkViews[workPage];free(v->query);free(v->project);v->query=ui_text(wc(W_SEARCH));v->status=(int)SendMessageW(wc(W_STATUS),CB_GETCURSEL,0,0);const char *p=work_project_filter();v->project=_strdup(p?p:"");v->valid=1;d409_work_selection();
}
static void d409_work_switch(int page){
 d409_work_capture();workPage=page;D409WorkView *v=&d409WorkViews[page];workLoading=1;ui_set(wc(W_SEARCH),v->valid&&v->query?v->query:"");SendMessageW(wc(W_STATUS),CB_SETCURSEL,v->valid?max(0,v->status):0,0);int selected=0;
 if(v->valid&&v->project)for(int i=1;i<cJSON_GetArraySize(workProjectIds);i++){J *id=cJSON_GetArrayItem(workProjectIds,i);if(cJSON_IsString(id)&&!strcmp(id->valuestring,v->project))selected=i;}
 SendMessageW(wc(W_PROJECT),CB_SETCURSEL,selected,0);workLoading=0;d409WorkSwitching=1;
}
static void d409_work_detail(void){
 const char *kind;J *r=selected_record(&kind);HWND detail=GetDlgItem(workWindow,D409_W_DETAIL);if(!detail)return;
 if(!r){SetWindowTextW(GetDlgItem(workWindow,D409_W_DETAIL_TITLE),L"记录详情");SetWindowTextW(detail,L"选择左侧记录查看完整内容。\r\n\r\n双击记录或点击「编辑」修改。\r\n\r\n项目、负责人、时间与备注会显示在这里。");return;}
 ui_set(GetDlgItem(workWindow,D409_W_DETAIL_TITLE),str(r,"name"));char *text=0;d409_append(&text,"名称\r\n",str(r,"name"));d409_append(&text,"状态  ",d409_status(str(r,"status")));
 if(!strcmp(kind,"templates")){d409_append(&text,"模板  ",cJSON_IsFalse(get(r,"enabled"))?"已停用":"已启用");char revision[40];snprintf(revision,sizeof(revision),"%.0f",num(r,"revision"));d409_append(&text,"修订  ",revision);}
 if(!strcmp(kind,"instances")){char revision[40];snprintf(revision,sizeof(revision),"%.0f",num(r,"templateRevision"));d409_append(&text,"模板快照修订  ",revision);}
 J *project=d408_find(get(workStore.data,"projects"),str(r,"projectId"));if(project&&own(project))d409_append(&text,"项目  ",str(project,"name"));
 const char *keys[]={"owner","members","organization","role","email","phone","contact","plannedStart","dueDate","occurredOn","priority","color","description","notes"};
 const char *labels[]={"负责人  ","成员  ","单位 / 组织  ","角色 / 职务  ","邮箱  ","电话  ","其他联系方式  ","计划开始  ","到期时间  ","实际跟进  ","优先级  ","项目颜色  ","说明\r\n","备注\r\n"};
 for(int i=0;i<14;i++){J *value=get(r,keys[i]);if(!value)continue;if(cJSON_IsString(value))d409_append(&text,labels[i],value->valuestring);else{char *encoded=json(value);d409_append(&text,labels[i],encoded);free(encoded);}}
 const char *relationKeys[]={"contactId","workItemId","processId"},*relationKinds[]={"contacts","items","instances"},*relationLabels[]={"往来对象  ","关联事项  ","流程实例  "};
 for(int i=0;i<3;i++){J *linked=d408_find(get(workStore.data,relationKinds[i]),str(r,relationKeys[i]));if(linked&&own(linked))d409_append(&text,relationLabels[i],str(linked,"name"));}
 if(cJSON_IsArray(get(r,"steps"))){d409_append(&text,"","流程步骤");J *step;int index=0;cJSON_ArrayForEach(step,get(r,"steps")){char label[80];index++;snprintf(label,sizeof(label),"%d%s  ",index,!strcmp(kind,"instances")&&index==(int)num(r,"currentStep")+1?" · 当前":"");d409_append(&text,label,str(step,"name"));}}
 d409_append(&text,"创建时间  ",str(r,"createdAt"));d409_append(&text,"更新时间  ",str(r,"updatedAt"));d409_append(&text,"完成时间  ",str(r,"completedAt"));d409_append(&text,"归档时间  ",str(r,"archivedAt"));
 d409_append(&text,"记录 ID  ",str(r,"id"));ui_set(detail,text?text:"");free(text);SendMessageW(detail,EM_SETSEL,0,0);
}
static void d409_work_after_refresh(void){
 d409_work_account_valid();D409WorkView *v=&d409WorkViews[workPage];int selected=-1;
 if(v->id&&*v->id)for(int i=0;i<cJSON_GetArraySize(workRows);i++){J *row=cJSON_GetArrayItem(workRows,i);if(!strcmp(str(row,"id"),v->id)&&v->kind&&!strcmp(str(row,"kind"),v->kind)){selected=i;break;}}
 SendMessageW(wc(W_LIST),LB_SETCURSEL,selected,0);int count=(int)SendMessageW(wc(W_LIST),LB_GETCOUNT,0,0);if(count>0)SendMessageW(wc(W_LIST),LB_SETTOPINDEX,max(0,min(v->top,count-1)),0);
 if(selected<0){free(v->id);v->id=0;free(v->kind);v->kind=0;}d409WorkSwitching=0;
 SetWindowTextW(GetDlgItem(workWindow,D409_W_TITLE),pages[workPage]);for(int i=0;i<10;i++)d409_selected(wc(W_NAV+i),workPage==i);d409_work_detail();
 const wchar_t *subtitles[]={L"当前账号的工作、项目与流程，放在同一个视野里。",L"选择事项阅读完整内容，明确接下来要推进的工作。",L"负责人、成员与项目颜色，让工作归属清楚可见。",L"复用稳定步骤，建立保留模板修订的流程实例。",L"查看当前步骤，随时推进、暂停或继续流程。",L"集中阅读联系信息，保留往来与跟进关系。",L"跟进时间、联系人和关联事项共同呈现。",L"已归档记录保留原始关系，可明确恢复。",L"查看模块总览，按项目和日期了解事项进度。",L"本机隔离候选的存储、备份与原系统设置。"};
 SetWindowTextW(GetDlgItem(workWindow,D409_W_SUBTITLE),subtitles[workPage]);
}
static void d409_work_init(void){
 d409_visual_init(workWindow);d409_work_account_valid();
 d409_label(workWindow,D409_W_BRAND,L"MyTodo",1);d409_label(workWindow,D409_W_TITLE,L"工作台",1);d409_label(workWindow,D409_W_SUBTITLE,L"",0);d409_label(workWindow,D409_W_CAPTION,L"工作队列  ·  选择记录查看详情",0);d409_label(workWindow,D409_W_DETAIL_TITLE,L"记录详情",0);
 ui_control(workWindow,L"EDIT",L"",ES_MULTILINE|ES_READONLY|ES_AUTOVSCROLL|WS_VSCROLL|WS_TABSTOP,D409_W_DETAIL,0,0,0,0);
 ui_control(workWindow,L"BUTTON",L"返回四象限",WS_TABSTOP,D409_W_HOME,0,0,0,0);ui_control(workWindow,L"BUTTON",L"番茄专注",WS_TABSTOP,D409_W_TIMER,0,0,0,0);ui_control(workWindow,L"BUTTON",L"优化反馈",WS_TABSTOP,D409_W_FEEDBACK,0,0,0,0);
 for(int i=0;i<10;i++)d409_role(wc(W_NAV+i),2);for(int i=W_NEW;i<=W_IMPORT;i++)d409_role(wc(i),i==W_NEW?1:i==W_DELETE?3:4);for(int i=D409_W_HOME;i<=D409_W_FEEDBACK;i++)d409_role(GetDlgItem(workWindow,i),2);
 SendMessageW(wc(W_LIST),LB_SETITEMHEIGHT,0,U(60));
}
static void d409_work_layout(void){
 RECT r;GetClientRect(workWindow,&r);int side=U(196),x=side+U(24),width=r.right-x-U(24);ui_move(GetDlgItem(workWindow,D409_W_BRAND),U(22),U(22),side-U(32),U(40));
 for(int i=0;i<10;i++)ui_move(wc(W_NAV+i),U(12),U(82+i*39),side-U(24),U(34));
 ui_move(GetDlgItem(workWindow,D409_W_HOME),U(12),U(490),side-U(24),U(34));ui_move(GetDlgItem(workWindow,D409_W_TIMER),U(12),U(530),side-U(24),U(34));ui_move(GetDlgItem(workWindow,D409_W_FEEDBACK),U(12),U(570),side-U(24),U(34));
 ui_move(GetDlgItem(workWindow,D409_W_TITLE),x,U(22),width-U(215),U(38));ui_move(wc(W_NEW),r.right-U(220),U(24),U(196),U(36));ui_move(GetDlgItem(workWindow,D409_W_SUBTITLE),x,U(64),width,U(24));
 int filterWidth=(width-U(24))/3;ui_move(wc(W_SEARCH),x,U(98),filterWidth,U(34));ui_move(wc(W_STATUS),x+filterWidth+U(12),U(98),filterWidth,U(210));ui_move(wc(W_PROJECT),x+2*(filterWidth+U(12)),U(98),filterWidth,U(240));
 int top=U(170);ui_move(wc(W_OVERVIEW),x,U(145),width,U(83));if(workPage==0)top=U(256);
 if(workPage==8){int dw=(width-U(300))/2;ui_move(wc(W_DATE_FROM),x,U(145),dw,U(32));ui_move(wc(W_DATE_TO),x+dw+U(12),U(145),dw,U(32));ui_move(wc(W_DATE_APPLY),x+2*dw+U(24),U(145),U(128),U(32));ui_move(wc(W_DATE_RESET),x+2*dw+U(164),U(145),U(128),U(32));ui_move(wc(W_DATE_NOTE),x,U(185),width,U(48));top=U(264);}
 int bottom=r.bottom-U(186),detailWidth=U(300),hasDetail=workPage<8,listWidth=hasDetail?width-detailWidth-U(16):width;
 ui_move(GetDlgItem(workWindow,D409_W_CAPTION),x,top-U(27),listWidth,U(21));ui_move(wc(W_LIST),x,top,listWidth,max(U(110),bottom-top));ui_move(wc(W_EMPTY),x+U(14),top+U(16),listWidth-U(28),max(U(100),bottom-top-U(25)));
 ShowWindow(GetDlgItem(workWindow,D409_W_DETAIL_TITLE),hasDetail?SW_SHOW:SW_HIDE);ShowWindow(GetDlgItem(workWindow,D409_W_DETAIL),hasDetail?SW_SHOW:SW_HIDE);
 int dx=x+listWidth+U(16);ui_move(GetDlgItem(workWindow,D409_W_DETAIL_TITLE),dx,top-U(27),detailWidth,U(21));ui_move(GetDlgItem(workWindow,D409_W_DETAIL),dx,top,detailWidth,max(U(110),bottom-top));
 int ids[]={W_EDIT,W_ACTION,W_ARCHIVE,W_DELETE,W_RELATED,W_ATTACH,W_FILES,W_HISTORY};for(int i=0;i<8;i++)ui_move(wc(ids[i]),x+(i%4)*((width+U(8))/4),r.bottom-U(172)+(i/4)*U(40),(width-U(24))/4,U(34));
 ui_move(wc(W_EXPORT),x,r.bottom-U(87),U(190),U(30));ui_move(wc(W_IMPORT),x+U(202),r.bottom-U(87),U(190),U(30));ui_move(wc(W_NOTICE),x,r.bottom-U(48),width,U(45));
 RedrawWindow(workWindow,0,0,RDW_INVALIDATE|RDW_ERASE|RDW_ALLCHILDREN);
}
static void d409_work_draw(DRAWITEMSTRUCT *d){
 if(d->itemID==(UINT)-1)return;HDC dc=d->hDC;int saved=SaveDC(dc);RECT r=d->rcItem;HBRUSH bg=CreateSolidBrush(d->itemState&ODS_SELECTED?D409_SELECTED:RGB(255,255,255));FillRect(dc,&r,bg);DeleteObject(bg);
 J *row=cJSON_GetArrayItem(workRows,(int)d->itemID),*record=row?d408_find(get(workStore.data,str(row,"kind")),str(row,"id")):0;if(record&&!own(record))record=0;
 RECT title=r;title.left+=U(14);title.right-=U(14);title.top+=U(8);title.bottom=title.top+U(22);
 if(record){wchar_t *name=wide(str(record,"name"));d409_text(dc,name,title,app.font,D409_INK,DT_SINGLELINE|DT_END_ELLIPSIS);free(name);RECT meta=title;meta.top+=U(25);meta.bottom=r.bottom-U(5);char *line=0;const char *type="记录";for(int i=0;i<6;i++)if(!strcmp(str(row,"kind"),kinds[i])){static const char *names[]={"工作事项","项目","模板","实例","往来","跟进"};type=names[i];break;}
 size_t length=strlen(type)+strlen(d409_status(str(record,"status")))+strlen(str(record,"owner"))+strlen(str(record,"dueDate"))+40;line=malloc(length);if(line){snprintf(line,length,"%s  ·  %s  %s  %s",type,d409_status(str(record,"status")),str(record,"owner"),str(record,"dueDate"));wchar_t *text=wide(line);d409_text(dc,text,meta,app.smallFont,D409_MUTED,DT_SINGLELINE|DT_END_ELLIPSIS);free(text);free(line);}
 J *project=!strcmp(str(row,"kind"),"projects")?record:d408_find(get(workStore.data,"projects"),str(record,"projectId"));unsigned rr,gg,bb;COLORREF accent=D409_ACCENT;if(project&&own(project)&&strlen(str(project,"color"))==7&&sscanf(str(project,"color"),"#%2x%2x%2x",&rr,&gg,&bb)==3)accent=RGB(rr,gg,bb);RECT mark=r;mark.right=mark.left+U(d->itemState&ODS_SELECTED?4:2);HBRUSH b=CreateSolidBrush(accent);FillRect(dc,&mark,b);DeleteObject(b);
 }else{LRESULT length=SendMessageW(d->hwndItem,LB_GETTEXTLEN,d->itemID,0);if(length>=0&&length<100000){wchar_t *text=calloc((size_t)length+1,sizeof(wchar_t));if(text){SendMessageW(d->hwndItem,LB_GETTEXT,d->itemID,(LPARAM)text);RECT full=r;InflateRect(&full,-U(12),-U(7));d409_text(dc,text,full,app.font,D409_INK,DT_WORDBREAK|DT_NOPREFIX);free(text);}}}
 RECT line={r.left,r.bottom-1,r.right,r.bottom};HBRUSH edge=CreateSolidBrush(D409_LINE);FillRect(dc,&line,edge);DeleteObject(edge);if(d->itemState&ODS_FOCUS){RECT focus=r;InflateRect(&focus,-U(3),-U(3));DrawFocusRect(dc,&focus);}RestoreDC(dc,saved);
}
#endif
