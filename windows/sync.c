#include "native.h"
static double n0(J*j,const char*k){double n=num(j,k);return isfinite(n)?n:0;}
static int64_t epoch_ms(void){FILETIME f;ULARGE_INTEGER u;GetSystemTimeAsFileTime(&f);u.LowPart=f.dwLowDateTime;u.HighPart=f.dwHighDateTime;return u.QuadPart/10000-11644473600000LL;}
static int valid_folder(const char*s){if(!*s||strlen(s)>60)return 0;for(;*s;s++)if(!((*s>='a'&&*s<='z')||(*s>='A'&&*s<='Z')||(*s>='0'&&*s<='9')||*s=='-'||*s=='_'))return 0;return 1;}
J *config_read(DB*d){wchar_t p[32768];join(p,d->dir,L"sync-config.enc");char*t=read_file(p);if(!t){J*j=cJSON_CreateObject();ss(j,"folder","GxTodo");set(j,"autoSync",cJSON_CreateTrue());return j;}size_t n=strlen(t);BYTE*b=malloc(n/2+1);for(size_t i=0;i<n/2;i++){unsigned v;if(sscanf(t+i*2,"%2x",&v)!=1){free(b);free(t);return 0;}b[i]=(BYTE)v;}DATA_BLOB in={(DWORD)n/2,b},out={0};J*j=0;if(CryptUnprotectData(&in,0,0,0,0,CRYPTPROTECT_UI_FORBIDDEN,&out)){wchar_t*w=calloc(out.cbData/2+1,2);memcpy(w,out.pbData,out.cbData);char*s=utf8(w);j=cJSON_Parse(s);SecureZeroMemory(s,strlen(s));free(s);SecureZeroMemory(w,out.cbData);free(w);SecureZeroMemory(out.pbData,out.cbData);LocalFree(out.pbData);}free(b);free(t);if(!j)strcpy(d->error,"Cannot decrypt WebDAV configuration");return j;}
int config_save(DB*d,J*c){if(!valid_folder(str(c,"folder"))||truth(c,"enabled")&&(!*str(c,"username")||!*str(c,"password"))){strcpy(d->error,"Invalid sync folder or credentials");return 0;}char*t=json(c);wchar_t*w=wide(t);DATA_BLOB in={(DWORD)(wcslen(w)*2),(BYTE*)w},out={0};int ok=CryptProtectData(&in,0,0,0,0,CRYPTPROTECT_UI_FORBIDDEN,&out);if(ok){char*s=malloc(out.cbData*2+1);for(DWORD i=0;i<out.cbData;i++)sprintf(s+i*2,"%02x",out.pbData[i]);wchar_t p[32768];join(p,d->dir,L"sync-config.enc");ok=write_file(p,s);free(s);LocalFree(out.pbData);}SecureZeroMemory(t,strlen(t));free(t);SecureZeroMemory(w,wcslen(w)*2);free(w);return ok;}
typedef struct {int status;char *body,*etag;} Response;
typedef struct {DB*d;J*config;HINTERNET session,connect;char token[80];int ok;} Sync;
static void response_free(Response*r){free(r->body);free(r->etag);memset(r,0,sizeof(*r));}
static int good(int s){return s==200||s==201||s==204;}
static int fail(Sync*s,const char*msg){if(msg!=s->d->error)snprintf(s->d->error,sizeof(s->d->error),"%s",msg);s->ok=0;return 0;}
static char *compress_data(const char*text,DWORD*length){z_stream z={0};if(deflateInit2(&z,6,Z_DEFLATED,31,8,Z_DEFAULT_STRATEGY)!=Z_OK)return 0;size_t n=strlen(text),cap=compressBound((uLong)n)+64;char*out=malloc(cap);z.next_in=(Bytef*)text;z.avail_in=(uInt)n;z.next_out=(Bytef*)out;z.avail_out=(uInt)cap;int r=deflate(&z,Z_FINISH);*length=(DWORD)z.total_out;deflateEnd(&z);if(r!=Z_STREAM_END){free(out);return 0;}return out;}
static char *decompress_data(char*b,DWORD n){z_stream z={0};if(inflateInit2(&z,31)!=Z_OK)return 0;size_t cap=8*1024*1024;char*out=malloc(cap+1);z.next_in=(Bytef*)b;z.avail_in=n;z.next_out=(Bytef*)out;z.avail_out=(uInt)cap;int r=inflate(&z,Z_FINISH);size_t count=z.total_out;inflateEnd(&z);if(r!=Z_STREAM_END){free(out);return 0;}out[count]=0;return out;}
static int renew(Sync*s){if(!db_begin(s->d))return fail(s,s->d->error);J*m=db_meta(s->d),*lease=get(m,"lease");int ok=m&&!strcmp(str(lease,"token"),s->token);if(ok&&num(lease,"until")-epoch_ms()<45000){sn(lease,"until",(double)epoch_ms()+120000);ok=db_meta_save(s->d,m,0);}cJSON_Delete(m);db_end(s->d,ok);return ok?1:fail(s,"Sync session expired; pending edits retained");}
static Response request(Sync*s,const char*method,const char*relative,const char*body,const char*etag){Response r={0};if(!s->ok||!renew(s))return r;int valid=!*relative||!strcmp(relative,"state.json")||!strcmp(relative,"v2/");if(!valid&&!strncmp(relative,"v2/",3)){valid=1;for(const char*p=relative+3;*p;p++)if(!((*p>='A'&&*p<='Z')||(*p>='a'&&*p<='z')||(*p>='0'&&*p<='9')||*p=='-'||*p=='_'||*p=='.'))valid=0;}if(!valid){fail(s,"Invalid cloud relative path");return r;}char target[256];snprintf(target,sizeof(target),"/dav/%s/%s",str(s->config,"folder"),relative);wchar_t *url=wide(target),*verb=wide(method);HINTERNET h=WinHttpOpenRequest(s->connect,verb,url,0,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);free(url);free(verb);if(!h){fail(s,"Cannot create WebDAV request");return r;}DWORD policy=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(h,WINHTTP_OPTION_REDIRECT_POLICY,&policy,sizeof(policy));char auth[4096];snprintf(auth,sizeof(auth),"%s:%s",str(s->config,"username"),str(s->config,"password"));DWORD n=0;CryptBinaryToStringA((BYTE*)auth,(DWORD)strlen(auth),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,0,&n);char*b64=malloc(n);CryptBinaryToStringA((BYTE*)auth,(DWORD)strlen(auth),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,b64,&n);char headers[8192];snprintf(headers,sizeof(headers),"Authorization: Basic %s\r\n",b64);SecureZeroMemory(auth,sizeof(auth));SecureZeroMemory(b64,n);free(b64);int gz=strlen(relative)>3&&!strcmp(relative+strlen(relative)-3,".gz");if(!strcmp(method,"PUT")){strcat(headers,gz?"Content-Type: application/gzip\r\n":"Content-Type: application/json; charset=utf-8\r\n");strcat(headers,etag?"If-Match: ":"If-None-Match: ");strcat(headers,etag?etag:"*");strcat(headers,"\r\n");}else if(etag){strcat(headers,"If-None-Match: ");strcat(headers,etag);strcat(headers,"\r\n");}wchar_t*hw=wide(headers);WinHttpAddRequestHeaders(h,hw,(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD);free(hw);SecureZeroMemory(headers,sizeof(headers));char*packed=0;DWORD bodyLen=body?(DWORD)strlen(body):0;if(body&&bodyLen>8*1024*1024){WinHttpCloseHandle(h);fail(s,"Sync batch too large");return r;}if(body&&gz){packed=compress_data(body,&bodyLen);if(!packed){WinHttpCloseHandle(h);fail(s,"Compression failed");return r;}}BOOL ok=WinHttpSendRequest(h,WINHTTP_NO_ADDITIONAL_HEADERS,0,body?(packed?packed:(void*)body):WINHTTP_NO_REQUEST_DATA,bodyLen,bodyLen,0)&&WinHttpReceiveResponse(h,0);free(packed);if(!ok){char msg[128];snprintf(msg,sizeof(msg),"WebDAV network error %lu",GetLastError());WinHttpCloseHandle(h);fail(s,msg);return r;}DWORD size=sizeof(DWORD),status=0;WinHttpQueryHeaders(h,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,0,&status,&size,0);r.status=(int)status;DWORD en=0;WinHttpQueryHeaders(h,WINHTTP_QUERY_ETAG,0,0,&en,0);if(en&&en<4096){wchar_t*e=calloc(en+2,1);if(WinHttpQueryHeaders(h,WINHTTP_QUERY_ETAG,0,e,&en,0))r.etag=utf8(e);free(e);}if(!strcmp(method,"GET")&&r.status==200){size_t used=0,cap=16384;char*bytes=malloc(cap+1);DWORD got=0;for(;;){if(cap-used<8192){cap*=2;if(cap>8*1024*1024)cap=8*1024*1024;if(cap<=used){free(bytes);bytes=0;fail(s,"Compressed cloud file exceeds limit");break;}bytes=realloc(bytes,cap+1);}if(!WinHttpReadData(h,bytes+used,(DWORD)(cap-used),&got)){free(bytes);bytes=0;fail(s,"Incomplete WebDAV response");break;}if(!got)break;used+=got;}if(bytes){bytes[used]=0;r.body=gz?decompress_data(bytes,(DWORD)used):bytes;if(gz)free(bytes);if(!r.body)fail(s,"Corrupt gzip or expanded file exceeds 8 MiB");}}else r.body=_strdup("");WinHttpCloseHandle(h);return r;}
static int snapshot_path(const char *path) {
    size_t length = strlen(path);
    if (length < 14 || length >= 160 || strncmp(path,"v2/s-",5) ||
        strcmp(path+length-8,".json.gz")) return 0;
    for (const char *p = path+5; p < path+length-8; p++) {
        char c = *p;
        if (!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||
              (c>='0'&&c<='9')||c=='-'||c=='_')) return 0;
    }
    return 1;
}

static int manifest_valid(J *m) {
    J *heads = get(m,"heads"), *snap = get(m,"snapshot");
    if (!cJSON_IsObject(m) || strcmp(str(m,"format"),"gxtodo-delta") ||
        num(m,"version") != 2 || !protocol_text_valid(str(m,"epoch")) ||
        !protocol_counter_map_valid(heads,256)) return 0;
    if (!snap || cJSON_IsNull(snap)) return 1;
    J *parts = get(snap,"parts"), *cursors = get(snap,"cursors"), *item;
    if (!cJSON_IsObject(snap) || !protocol_text_valid(str(snap,"id")) ||
        !protocol_counter_map_valid(cursors,0) || !cJSON_IsArray(parts) ||
        cJSON_GetArraySize(parts) > 10000) return 0;
    cJSON_ArrayForEach(item,cursors) {
        if (item->valuedouble > n0(heads,item->string)) return 0;
    }
    cJSON_ArrayForEach(item,parts) {
        const char *digest = str(item,"sha256");
        if (!cJSON_IsObject(item) || !snapshot_path(str(item,"path")) ||
            strlen(digest) != 64 || strspn(digest,"0123456789abcdef") != 64) return 0;
    }
    return 1;
}

static J *manifest(Sync *s,Response *r) {
    if (r->status != 200 || !r->body || !r->etag || !*r->etag || !strncmp(r->etag,"W/",2)) {
        char msg[128];
        snprintf(msg,sizeof(msg),"WebDAV manifest unavailable (HTTP %d or missing strong ETag)",r->status);
        fail(s,msg);
        return 0;
    }
    J *m = protocol_json_without_nul(r->body) ? cJSON_ParseWithOpts(r->body,0,1) : 0;
    if (!manifest_valid(m)) {
        cJSON_Delete(m);
        fail(s,"Invalid manifest or snapshot progress");
        return 0;
    }
    return m;
}

static void batch_path(char *path,size_t size,const char *actor,int64_t index) {
    snprintf(path,size,"v2/b-%s-%lld.json.gz",actor,(long long)index);
}

static int batch_valid(J *batch,const char *epoch,const char *device,int64_t index) {
    J *events = get(batch,"events");
    return cJSON_IsObject(batch) && !strcmp(str(batch,"format"),"gxtodo-batch") &&
        !strcmp(str(batch,"epoch"),epoch) && !strcmp(str(batch,"device"),device) &&
        num(batch,"index") == (double)index && cJSON_IsArray(events) &&
        cJSON_GetArraySize(events) <= 500;
}

static int pending_valid(J *pending,const char *actor,const char *epoch) {
    double index = num(pending,"index");
    const char *device = str(pending,"device"), *body = str(pending,"body");
    char path[200];
    if (!cJSON_IsObject(pending) || !protocol_actor_valid(device) || strcmp(device,actor) ||
        !protocol_counter_valid(index,1) || !protocol_counter_valid(num(pending,"through"),1) ||
        strlen(body) > 1024*1024 || !protocol_json_without_nul(body)) return 0;
    batch_path(path,sizeof(path),device,(int64_t)index);
    if (strcmp(str(pending,"path"),path)) return 0;
    J *batch = cJSON_ParseWithOpts(body,0,1), *events = get(batch,"events"), *event;
    int valid = batch_valid(batch,epoch,device,(int64_t)index) && cJSON_GetArraySize(events) > 0;
    cJSON_ArrayForEach(event,events) {
        if (!valid || !protocol_event_valid(event)) {
            valid = 0;
            break;
        }
    }
    cJSON_Delete(batch);
    return valid;
}

static int progress_gap(J *heads,J *cursors,int threshold) {
    int gap = 0;
    J *head;
    cJSON_ArrayForEach(head,heads) {
        double delta = head->valuedouble-n0(cursors,head->string);
        if (delta >= threshold-gap) return threshold;
        if (delta > 0) gap += (int)delta;
    }
    return gap;
}

static int immutable(Sync*s,const char*p,const char*body){Response r=request(s,"PUT",p,body,0);int ok=good(r.status);if(r.status==412){Response old=request(s,"GET",p,0,0);ok=old.status==200&&old.body&&!strcmp(old.body,body);response_free(&old);}response_free(&r);return ok?1:fail(s,"Immutable upload failed or same-name batch changed");}
static int bind(Sync*s,J*manifestValue){J*a=cJSON_CreateArray();cJSON_AddItemToArray(a,cJSON_CreateString(str(s->config,"username")));cJSON_AddItemToArray(a,cJSON_CreateString(str(s->config,"folder")));char*scope=json(a);cJSON_Delete(a);if(!db_begin(s->d)){free(scope);return fail(s,s->d->error);}J*m=db_meta(s->d);int changed=strcmp(str(m,"scope"),scope)||strcmp(str(m,"epoch"),str(manifestValue,"epoch")),ok=1;if(changed){if(cJSON_IsString(get(m,"scope"))){sqlite3_exec(s->d->sql,"DELETE FROM outbox",0,0,0);char after[4900]="";for(;;){J*page=db_page(s->d,after,100),*row;cJSON_ArrayForEach(row,page){J*ev;cJSON_ArrayForEach(ev,get(get(row,"record"),"events")){J*event=dup(ev);ss(event,"key",str(row,"key"));char*t=json(event);sqlite3_stmt*q;sn(m,"queue",n0(m,"queue")+1);sqlite3_prepare_v2(s->d->sql,"INSERT INTO outbox VALUES(?,?)",-1,&q,0);sqlite3_bind_int64(q,1,(sqlite3_int64)num(m,"queue"));sqlite3_bind_text(q,2,t,-1,SQLITE_TRANSIENT);ok=ok&&sqlite3_step(q)==SQLITE_DONE;sqlite3_finalize(q);free(t);cJSON_Delete(event);}snprintf(after,sizeof(after),"%s",str(row,"key"));}int n=cJSON_GetArraySize(page);cJSON_Delete(page);if(n<100)break;}}ss(m,"scope",scope);ss(m,"epoch",str(manifestValue,"epoch"));set(m,"cursors",cJSON_CreateObject());set(m,"pending",cJSON_CreateNull());set(m,"cachedManifest",cJSON_CreateNull());ok=ok&&db_meta_save(s->d,m,0);}cJSON_Delete(m);free(scope);return db_end(s->d,ok);}
static int checkpoint(Sync*s,J*m){if(!manifest_valid(m))return fail(s,"Invalid snapshot or manifest progress");
 J*snap=get(m,"snapshot");if(!cJSON_IsObject(snap))return 1;
 J*meta=db_meta(s->d),*v;
 if(!protocol_counter_map_valid(get(meta,"cursors"),0)){cJSON_Delete(meta);return fail(s,"Invalid local sync progress");}
 int skip=progress_gap(get(m,"heads"),get(meta,"cursors"),16)<16&&cJSON_GetArraySize(get(meta,"cursors"));
 cJSON_Delete(meta);if(skip)return 1;J*part;cJSON_ArrayForEach(part,get(snap,"parts")){Response r=request(s,"GET",str(part,"path"),0,0);char hash[65];sha256(r.body?r.body:"",hash);J*chunk=r.status==200&&protocol_json_without_nul(r.body)?cJSON_ParseWithOpts(r.body,0,1):0;if(!chunk||strcmp(hash,str(part,"sha256"))||strcmp(str(chunk,"epoch"),str(m,"epoch"))||strcmp(str(chunk,"id"),str(snap,"id"))||!cJSON_IsArray(get(chunk,"records"))){cJSON_Delete(chunk);response_free(&r);return fail(s,"Snapshot integrity check failed; cursor retained");}J*events=cJSON_CreateArray(),*rec,*ev;int valid=1;
 cJSON_ArrayForEach(rec,get(chunk,"records")){
  if(!cJSON_IsObject(rec)||!cJSON_IsString(get(rec,"key"))||!cJSON_IsArray(get(rec,"events"))){valid=0;break;}
  cJSON_ArrayForEach(ev,get(rec,"events")){
   if(!cJSON_IsObject(ev)||get(ev,"key")){valid=0;break;}
   J*e=dup(ev);ss(e,"key",str(rec,"key"));cJSON_AddItemToArray(events,e);
  }
  if(!valid)break;
 }
 if(!valid)fail(s,"Invalid snapshot record or event");
 int ok=valid&&db_remote(s->d,events,0,0);cJSON_Delete(events);cJSON_Delete(chunk);response_free(&r);if(!ok)return fail(s,s->d->error);}
 if(!db_begin(s->d))return 0;meta=db_meta(s->d);if(!protocol_counter_map_valid(get(meta,"cursors"),0)){cJSON_Delete(meta);db_end(s->d,0);return fail(s,"Invalid local sync progress");}cJSON_ArrayForEach(v,get(snap,"cursors"))sn(get(meta,"cursors"),v->string,fmax(n0(get(meta,"cursors"),v->string),v->valuedouble));int ok=db_meta_save(s->d,meta,0);cJSON_Delete(meta);return db_end(s->d,ok);}
static int pull(Sync*s,J*m,int*count,int*more){if(!checkpoint(s,m))return 0;J*v;cJSON_ArrayForEach(v,get(m,"heads")){J*meta=db_meta(s->d);if(!protocol_counter_map_valid(get(meta,"cursors"),0)){cJSON_Delete(meta);return fail(s,"Invalid local sync progress");}
 int64_t cursor=(int64_t)n0(get(meta,"cursors"),v->string);cJSON_Delete(meta);while(cursor<v->valuedouble){if(*count>=12){*more=1;return 1;}char p[200];batch_path(p,sizeof(p),v->string,cursor+1);Response r=request(s,"GET",p,0,0);J*b=r.status==200&&protocol_json_without_nul(r.body)?cJSON_ParseWithOpts(r.body,0,1):0;if(!batch_valid(b,str(m,"epoch"),v->string,cursor+1)){cJSON_Delete(b);response_free(&r);return fail(s,"Missing or invalid sync batch; no cursor skipped");}int ok=db_remote(s->d,get(b,"events"),v->string,++cursor);cJSON_Delete(b);response_free(&r);if(!ok)return fail(s,s->d->error);(*count)++;}}return 1;}
static J *prepare(Sync*s,J*manifestValue){if(!db_begin(s->d))return 0;J*m=db_meta(s->d);J*old=get(m,"pending");
 if(old&&!cJSON_IsNull(old)){
  int valid=pending_valid(old,str(m,"actor"),str(manifestValue,"epoch"));
  J*p=valid?dup(old):0;cJSON_Delete(m);db_end(s->d,valid);
  if(!valid)fail(s,"Invalid pending batch; outbox retained");
  return p;
 }if(!m||!manifest_valid(manifestValue)){cJSON_Delete(m);db_end(s->d,0);fail(s,"Invalid manifest or local metadata");return 0;}
 J*entries=db_outbox(s->d,500);if(!cJSON_GetArraySize(entries)){cJSON_Delete(entries);cJSON_Delete(m);db_end(s->d,1);return 0;}double head=n0(get(manifestValue,"heads"),str(m,"actor"));
 if(!protocol_actor_valid(str(m,"actor"))||head>=(double)PROTOCOL_MAX_COUNTER){
  cJSON_Delete(entries);cJSON_Delete(m);db_end(s->d,0);
  fail(s,"Batch sequence limit reached; outbox retained");return 0;
 }
 J*events=cJSON_CreateArray(),*item;double through=0;size_t size=2;cJSON_ArrayForEach(item,entries){char*t=json(get(item,"event"));size_t n=strlen(t)+1;free(t);if(cJSON_GetArraySize(events)&&size+n>384*1024)break;if(!protocol_counter_valid(num(item,"id"),1)||!protocol_event_valid(get(item,"event"))){
  cJSON_Delete(events);cJSON_Delete(entries);cJSON_Delete(m);db_end(s->d,0);
  fail(s,"Invalid outbox event; outbox retained");return 0;
 }cJSON_AddItemToArray(events,dup(get(item,"event")));through=num(item,"id");size+=n;}J*b=cJSON_CreateObject();ss(b,"format","gxtodo-batch");ss(b,"epoch",str(manifestValue,"epoch"));ss(b,"device",str(m,"actor"));int64_t index=(int64_t)head+1;sn(b,"index",(double)index);set(b,"events",events);char*body=json(b),p[200];batch_path(p,sizeof(p),str(m,"actor"),index);J*pending=cJSON_CreateObject();ss(pending,"device",str(m,"actor"));sn(pending,"index",(double)index);sn(pending,"through",through);ss(pending,"body",body);ss(pending,"path",p);int ok=strlen(body)<=1024*1024;set(m,"pending",dup(pending));if(ok)ok=db_meta_save(s->d,m,0);ok=db_end(s->d,ok);free(body);cJSON_Delete(b);cJSON_Delete(entries);cJSON_Delete(m);if(!ok){cJSON_Delete(pending);fail(s,"Cannot persist upload batch");return 0;}return pending;}
static int ack(Sync*s,J*p){if(!db_begin(s->d))return 0;J*m=db_meta(s->d);sn(get(m,"cursors"),str(p,"device"),fmax(n0(get(m,"cursors"),str(p,"device")),num(p,"index")));set(m,"pending",cJSON_CreateNull());sqlite3_stmt*q;sqlite3_prepare_v2(s->d->sql,"DELETE FROM outbox WHERE id<=?",-1,&q,0);sqlite3_bind_int64(q,1,(sqlite3_int64)num(p,"through"));int ok=sqlite3_step(q)==SQLITE_DONE;sqlite3_finalize(q);ok=ok&&db_meta_save(s->d,m,0);cJSON_Delete(m);return db_end(s->d,ok);}
static int publish(Sync*s,J**m,char**etag,J*p){if(!immutable(s,str(p,"path"),str(p,"body")))return 0;J*b=cJSON_Parse(str(p,"body"));for(int attempt=0;attempt<10;attempt++){if(strcmp(str(*m,"epoch"),str(b,"epoch"))){cJSON_Delete(b);return fail(s,"Cloud epoch changed; upload retained");}double head=n0(get(*m,"heads"),str(p,"device"));if(head>=num(p,"index")){cJSON_Delete(b);return ack(s,p);}if(head!=num(p,"index")-1){cJSON_Delete(b);return fail(s,"Device batch gap");}J*next=dup(*m);sn(get(next,"heads"),str(p,"device"),num(p,"index"));
 if(!manifest_valid(next)){cJSON_Delete(next);cJSON_Delete(b);return fail(s,"Invalid next manifest; outbox retained");}
 char*t=json(next);Response r=request(s,"PUT","v2/manifest.json",t,*etag);free(t);cJSON_Delete(next);int status=r.status;response_free(&r);if(!good(status)&&status!=412){cJSON_Delete(b);return fail(s,"Manifest upload failed; outbox retained");}if(good(status)&&!ack(s,p)){cJSON_Delete(b);return 0;}Response read=request(s,"GET","v2/manifest.json",0,0);J*latest=manifest(s,&read);if(!latest){response_free(&read);cJSON_Delete(b);return 0;}cJSON_Delete(*m);*m=latest;free(*etag);*etag=read.etag;read.etag=0;response_free(&read);if(good(status)){cJSON_Delete(b);return 1;}}cJSON_Delete(b);return fail(s,"Manifest contention; retry later");}
static int create_manifest(Sync*s){Response parent=request(s,"MKCOL","",0,0);int ps=parent.status;response_free(&parent);if(!good(ps)&&ps!=405)return fail(s,"Cannot create configured WebDAV folder");Response r=request(s,"MKCOL","v2/",0,0);int status=r.status;response_free(&r);if(!good(status)&&status!=405)return fail(s,"Create the configured WebDAV folder first");Response old=request(s,"GET","state.json",0,0);if(old.status==200){J*guard=cJSON_Parse(old.body);int ok=guard&&!strcmp(str(guard,"format"),"gxtodo-sync")&&num(guard,"version")==2;cJSON_Delete(guard);if(!ok){response_free(&old);return fail(s,"Legacy cloud data requires one synchronization with version 0.8.1 before native migration");}}else if(old.status==404){J*g=cJSON_CreateObject();ss(g,"format","gxtodo-sync");sn(g,"version",2);set(g,"backup",cJSON_CreateNull());ss(g,"message","Upgrade all clients to 0.8.0 or later");char*t=json(g);r=request(s,"PUT","state.json",t,0);int ok=good(r.status)||r.status==412;response_free(&r);free(t);cJSON_Delete(g);if(!ok){response_free(&old);return fail(s,"Cannot fence legacy sync protocol");}}else{response_free(&old);return fail(s,"Cannot inspect legacy cloud state");}response_free(&old);J*m=cJSON_CreateObject();char id[80];uuid(id);ss(m,"format","gxtodo-delta");sn(m,"version",2);ss(m,"epoch",id);set(m,"heads",cJSON_CreateObject());set(m,"snapshot",cJSON_CreateNull());set(m,"legacy",cJSON_CreateNull());char*t=json(m);r=request(s,"PUT","v2/manifest.json",t,0);int ok=good(r.status)||r.status==412;response_free(&r);free(t);cJSON_Delete(m);return ok?1:fail(s,"Cannot initialize manifest");}

static int snapshot_part(Sync*s,const char*id,const char*epoch,J*records,J*parts){if(!cJSON_GetArraySize(records))return 1;J*chunk=cJSON_CreateObject();ss(chunk,"id",id);ss(chunk,"epoch",epoch);set(chunk,"records",dup(records));char*body=json(chunk),file[200],hash[65];snprintf(file,sizeof(file),"v2/s-%s-%d.json.gz",id,cJSON_GetArraySize(parts));sha256(body,hash);int ok=immutable(s,file,body);if(ok){J*part=cJSON_CreateObject();ss(part,"path",file);ss(part,"sha256",hash);cJSON_AddItemToArray(parts,part);}free(body);cJSON_Delete(chunk);return ok;}
static int make_snapshot(Sync*s,J*m){J*meta=db_meta(s->d),*out=db_outbox(s->d,1);int skip=cJSON_GetArraySize(out)||cJSON_IsObject(get(meta,"pending"));cJSON_Delete(out);J*v;cJSON_ArrayForEach(v,get(m,"heads"))if(n0(get(meta,"cursors"),v->string)<v->valuedouble)skip=1;J*prior=get(m,"snapshot");if(cJSON_IsObject(prior)&&progress_gap(get(meta,"cursors"),get(prior,"cursors"),64)<64)skip=1;if(skip){cJSON_Delete(meta);return 1;}char id[80],after[4900]="";uuid(id);J*parts=cJSON_CreateArray(),*records=cJSON_CreateArray();size_t size=0;int ok=1,changed=0;for(;;){J*current=db_meta(s->d);changed=n0(current,"dataRevision")!=n0(meta,"dataRevision");cJSON_Delete(current);if(changed)break;J*page=db_page(s->d,after,100),*row;cJSON_ArrayForEach(row,page){char*text=json(get(row,"record"));size_t len=strlen(text);free(text);if(size+len>384*1024&&cJSON_GetArraySize(records)){ok=snapshot_part(s,id,str(m,"epoch"),records,parts);cJSON_Delete(records);records=cJSON_CreateArray();size=0;}if(!ok)break;cJSON_AddItemToArray(records,dup(get(row,"record")));size+=len;snprintf(after,sizeof(after),"%s",str(row,"key"));}int n=cJSON_GetArraySize(page);cJSON_Delete(page);if(!ok||n<100)break;}if(ok&&!changed)ok=snapshot_part(s,id,str(m,"epoch"),records,parts);cJSON_Delete(records);J*current=db_meta(s->d);changed=changed||n0(current,"dataRevision")!=n0(meta,"dataRevision");cJSON_Delete(current);if(ok&&!changed){Response r=request(s,"GET","v2/manifest.json",0,0);J*latest=manifest(s,&r);if(!latest)ok=0;else{if(strcmp(str(latest,"epoch"),str(m,"epoch")))changed=1;
 cJSON_ArrayForEach(v,get(meta,"cursors"))if(v->valuedouble>n0(get(latest,"heads"),v->string))changed=1;
 cJSON_ArrayForEach(v,get(get(latest,"snapshot"),"cursors"))if(v->valuedouble>n0(get(meta,"cursors"),v->string))changed=1;if(!changed){J*snap=cJSON_CreateObject();ss(snap,"id",id);set(snap,"parts",dup(parts));set(snap,"cursors",dup(get(meta,"cursors")));char created[40];now(created);ss(snap,"createdAt",created);set(latest,"snapshot",snap);char*body=json(latest);Response put=request(s,"PUT","v2/manifest.json",body,r.etag);ok=good(put.status)||put.status==412;response_free(&put);free(body);}}cJSON_Delete(latest);response_free(&r);}cJSON_Delete(parts);cJSON_Delete(meta);return ok?1:fail(s,"Snapshot publication failed; retry later");}

int sync_run(DB*d,int*up,int*down,int*more){*up=*down=*more=0;Sync s={0};s.d=d;s.ok=1;uuid(s.token);s.config=config_read(d);if(!s.config||!truth(s.config,"enabled")||!valid_folder(str(s.config,"folder"))){cJSON_Delete(s.config);strcpy(d->error,"Enable and save WebDAV settings first");return 0;}if(!db_begin(d)){cJSON_Delete(s.config);return 0;}J*meta=db_meta(d),*old=get(meta,"pending");
 if(!protocol_counter_map_valid(get(meta,"cursors"),0)||(old&&!cJSON_IsNull(old)&&!pending_valid(old,str(meta,"actor"),str(meta,"epoch")))){
  cJSON_Delete(meta);db_end(d,0);cJSON_Delete(s.config);
  strcpy(d->error,"Invalid local sync progress or pending batch; outbox retained");return 0;
 }
 if(cJSON_IsObject(get(meta,"lease"))&&num(get(meta,"lease"),"until")>epoch_ms()){cJSON_Delete(meta);db_end(d,0);cJSON_Delete(s.config);strcpy(d->error,"Another window is synchronizing");return 0;}J*lease=cJSON_CreateObject();ss(lease,"token",s.token);sn(lease,"until",(double)epoch_ms()+120000);set(meta,"lease",lease);int ok=db_meta_save(d,meta,0);cJSON_Delete(meta);if(!db_end(d,ok)){cJSON_Delete(s.config);return 0;}s.session=WinHttpOpen(L"GxTodoNative/0.9.0",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);if(s.session){WinHttpSetTimeouts(s.session,20000,20000,20000,20000);s.connect=WinHttpConnect(s.session,L"dav.jianguoyun.com",INTERNET_DEFAULT_HTTPS_PORT,0);}if(!s.connect)fail(&s,"Cannot initialize WinHTTP");Response r={0};J*m=0;char*etag=0;if(s.ok){meta=db_meta(d);J*cached=get(meta,"cachedManifest");J*scopeArray=cJSON_CreateArray();cJSON_AddItemToArray(scopeArray,cJSON_CreateString(str(s.config,"username")));cJSON_AddItemToArray(scopeArray,cJSON_CreateString(str(s.config,"folder")));char*scopeText=json(scopeArray);if(strcmp(str(meta,"scope"),scopeText))cached=0;free(scopeText);cJSON_Delete(scopeArray);r=request(&s,"GET","v2/manifest.json",0,*str(cached,"etag")?str(cached,"etag"):0);if(r.status==304&&manifest_valid(get(cached,"value"))&&*str(cached,"etag")&&strncmp(str(cached,"etag"),"W/",2)){m=dup(get(cached,"value"));etag=_strdup(str(cached,"etag"));}cJSON_Delete(meta);if(r.status==404||r.status==409){response_free(&r);if(create_manifest(&s))r=request(&s,"GET","v2/manifest.json",0,0);}if(!m&&s.ok){m=manifest(&s,&r);etag=r.etag;r.etag=0;}response_free(&r);}if(m&&s.ok){if(!bind(&s,m))fail(&s,d->error);if(s.ok&&!pull(&s,m,down,more))s.ok=0;while(s.ok&&*up<12){J*p=prepare(&s,m);if(!p)break;int done=publish(&s,&m,&etag,p);cJSON_Delete(p);if(!done){s.ok=0;break;}(*up)++;}if(s.ok&&*up){int n=0;if(!pull(&s,m,&n,more))s.ok=0;*down+=n;}J*out=db_outbox(d,1);if(cJSON_GetArraySize(out))*more=1;cJSON_Delete(out);if(s.ok&&!*more&&!make_snapshot(&s,m))s.ok=0;if(s.ok&&db_begin(d)){meta=db_meta(d);J*cache=cJSON_CreateObject();set(cache,"value",dup(m));ss(cache,"etag",etag?etag:"");set(meta,"cachedManifest",cache);db_end(d,db_meta_save(d,meta,0));cJSON_Delete(meta);}}
 if(db_begin(d)){meta=db_meta(d);if(!strcmp(str(get(meta,"lease"),"token"),s.token)){set(meta,"lease",cJSON_CreateNull());db_end(d,db_meta_save(d,meta,0));}else db_end(d,1);cJSON_Delete(meta);}if(s.connect)WinHttpCloseHandle(s.connect);if(s.session)WinHttpCloseHandle(s.session);cJSON_Delete(m);free(etag);cJSON_Delete(s.config);return s.ok;}
