#include "migration.h"
#include <string.h>
#include <limits.h>
#ifndef MYTODO_STORAGE_BUILD_IDENTITY
#define MYTODO_STORAGE_BUILD_IDENTITY ""
#endif

static const char *DDL[3]={
 "CREATE TABLE storage_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,contract_id TEXT NOT NULL,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,target_schema_fingerprint TEXT NOT NULL,target_raw_fingerprint TEXT NOT NULL,target_user_version INTEGER NOT NULL,source_snapshot_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'))",
 "CREATE TABLE storage_migration_snapshots(snapshot_id TEXT PRIMARY KEY,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,schema_payload TEXT NOT NULL,raw_payload TEXT NOT NULL)",
 "CREATE TABLE storage_migration_audit(attempt_id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,result TEXT NOT NULL CHECK(result='committed'),implementation_checksum TEXT NOT NULL)"
};
static const char *INFRA[3]={"storage_migration_registry","storage_migration_snapshots","storage_migration_audit"};
typedef struct {char *p;size_t n,cap;} Buffer;
typedef struct {char *v[4];size_t len[4];} SchemaRecord;
typedef struct {SchemaRecord *records;size_t n;} Schema;
typedef struct {Buffer *rows;size_t n;} Rows;

static int failure(DB *db,const char *operation,int code){
 snprintf(db->error,sizeof(db->error),"SQLite migration %s failed (%d): %s",operation,code,db->sql?sqlite3_errmsg(db->sql):"no handle");return 0;
}
static int message(DB *db,const char *text){snprintf(db->error,sizeof(db->error),"%s",text);return 0;}
static int append(Buffer *b,const void *bytes,size_t n){
 if(n>SIZE_MAX-b->n-1)return 0;
 size_t need=b->n+n+1;
 if(need>b->cap){size_t cap=b->cap?b->cap:256;while(cap<need){if(cap>SIZE_MAX/2){cap=need;break;}cap*=2;}char *p=realloc(b->p,cap);if(!p)return 0;b->p=p;b->cap=cap;}
 if(n)memcpy(b->p+b->n,bytes,n);b->n+=n;b->p[b->n]=0;return 1;
}
static int field(Buffer *b,const char *p,size_t n){
 if(!p)return append(b,"N;",2);
 char length[48];int count=snprintf(length,sizeof(length),"S%zu:",n);
 return count>0&&append(b,length,(size_t)count)&&append(b,p,n);
}
static int text_field(Buffer *b,const char *p){return field(b,p,p?strlen(p):0);}
static int count_field(Buffer *b,size_t n){char s[48];snprintf(s,sizeof(s),"%zu",n);return text_field(b,s);}
static int header(Buffer *b,const char *role){return text_field(b,STORAGE_ALGORITHM_ID)&&text_field(b,role);}
static void buffer_free(Buffer *b){free(b->p);memset(b,0,sizeof(*b));}
static int digest(const void *bytes,size_t n,char out[65]){
 HCRYPTPROV provider=0;HCRYPTHASH hash=0;BYTE value[32];DWORD size=32;int ok=0;out[0]=0;
 if(!CryptAcquireContextW(&provider,0,0,PROV_RSA_AES,CRYPT_VERIFYCONTEXT)||!CryptCreateHash(provider,CALG_SHA_256,0,0,&hash))goto done;
 const BYTE *p=bytes;while(n){DWORD take=n>UINT_MAX?UINT_MAX:(DWORD)n;if(!CryptHashData(hash,p,take,0))goto done;p+=take;n-=take;}
 if(!CryptGetHashParam(hash,HP_HASHVAL,value,&size,0)||size!=32)goto done;
 for(int i=0;i<32;i++)snprintf(out+i*2,3,"%02x",value[i]);ok=1;
done:if(hash)CryptDestroyHash(hash);if(provider)CryptReleaseContext(provider,0);return ok;
}
static int hash_valid(const char *s){if(!s||strlen(s)!=64)return 0;for(int i=0;i<64;i++)if(!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f')))return 0;return 1;}
const char *db_migration_build_identity(void){return MYTODO_STORAGE_BUILD_IDENTITY;}
static int execute(DB *db,const char *sql){char *error=0;int code=sqlite3_exec(db->sql,sql,0,0,&error);if(code!=SQLITE_OK)snprintf(db->error,sizeof(db->error),"SQLite migration statement failed (%d): %s",code,error?error:sqlite3_errmsg(db->sql));sqlite3_free(error);return code==SQLITE_OK;}
static int finish(DB *db,sqlite3_stmt *stmt,int ok,const char *operation){int code=sqlite3_finalize(stmt);return ok?(code==SQLITE_OK?1:failure(db,operation,code)):0;}
static char *copy_bytes(const char *p,size_t n){if(!p)return 0;char *r=malloc(n+1);if(r){memcpy(r,p,n);r[n]=0;}return r;}
static void schema_free(Schema *s){for(size_t i=0;i<s->n;i++)for(int j=0;j<4;j++)free(s->records[i].v[j]);free(s->records);memset(s,0,sizeof(*s));}
static int compare_record(const void *a,const void *b){const SchemaRecord *l=a,*r=b;for(int i=0;i<3;i++){int c=strcmp(l->v[i],r->v[i]);if(c)return c;}return 0;}
static int schema_add(Schema *s,const char *type,const char *name,const char *table,const char *sql){
 SchemaRecord *p=realloc(s->records,(s->n+1)*sizeof(*p));if(!p)return 0;s->records=p;SchemaRecord *r=&p[s->n++];memset(r,0,sizeof(*r));const char *v[4]={type,name,table,sql};
 for(int i=0;i<4;i++)if(v[i]){r->len[i]=strlen(v[i]);r->v[i]=copy_bytes(v[i],r->len[i]);if(!r->v[i])return 0;}return 1;
}
static int schema_read(DB *db,Schema *schema){
 sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY",-1,&stmt,0);int ok=code==SQLITE_OK;if(!ok)failure(db,"read schema",code);
 while(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW){
  const char *v[4];size_t lengths[4];for(int i=0;i<4;i++){v[i]=sqlite3_column_type(stmt,i)==SQLITE_NULL?0:(const char*)sqlite3_column_text(stmt,i);lengths[i]=v[i]?(size_t)sqlite3_column_bytes(stmt,i):0;}
  if(!v[0]||!v[1]||!v[2]){ok=message(db,"Missing schema identity bytes");break;}SchemaRecord *records=realloc(schema->records,(schema->n+1)*sizeof(*records));if(!records){ok=message(db,"Cannot allocate schema snapshot");break;}schema->records=records;SchemaRecord *record=&records[schema->n++];memset(record,0,sizeof(*record));
  for(int i=0;i<4;i++)if(v[i]){record->len[i]=lengths[i];record->v[i]=copy_bytes(v[i],lengths[i]);if(!record->v[i])ok=message(db,"Cannot allocate schema field bytes");}
 }
 if(ok&&code!=SQLITE_DONE)ok=failure(db,"step schema",code);return finish(db,stmt,ok,"finish schema");
}
static int schema_encode(const Schema *schema,Buffer *payload){
 if(!header(payload,"schema")||!count_field(payload,schema->n))return 0;
 for(size_t i=0;i<schema->n;i++)for(int j=0;j<4;j++)if(!field(payload,schema->records[i].v[j],schema->records[i].len[j]))return 0;return 1;
}
static int parse_field(const char *p,size_t n,size_t *at,char **out,size_t *length){
 *out=0;*length=0;if(*at>=n)return 0;
 if(p[*at]=='N'){if(n-*at<2||p[*at+1]!=';')return 0;*at+=2;return 1;}
 if(p[(*at)++]!='S')return 0;size_t bytes=0,start=*at;
 while(*at<n&&p[*at]>='0'&&p[*at]<='9'){unsigned d=(unsigned)(p[(*at)++]-'0');if(bytes>(SIZE_MAX-d)/10)return 0;bytes=bytes*10+d;}
 if(*at==start||(*at-start>1&&p[start]=='0')||*at>=n||p[(*at)++]!=':'||bytes>n-*at)return 0;
 *out=copy_bytes(p+*at,bytes);if(!*out)return 0;*length=bytes;*at+=bytes;return 1;
}
static int schema_decode(const char *p,size_t n,Schema *schema){
 size_t at=0,len=0;char *value=0;const char *expected[2]={STORAGE_ALGORITHM_ID,"schema"};
 for(int i=0;i<2;i++){if(!parse_field(p,n,&at,&value,&len)||!value||strcmp(value,expected[i])){free(value);return 0;}free(value);}
 if(!parse_field(p,n,&at,&value,&len)||!value||!len||len>3){free(value);return 0;}size_t count=0;for(size_t i=0;i<len;i++){if(value[i]<'0'||value[i]>'9'){free(value);return 0;}count=count*10+(value[i]-'0');}free(value);if(count>100)return 0;
 for(size_t i=0;i<count;i++){
  SchemaRecord r={0};for(int j=0;j<4;j++)if(!parse_field(p,n,&at,&r.v[j],&r.len[j])||(j<3&&!r.v[j])){for(int k=0;k<4;k++)free(r.v[k]);return 0;}
  SchemaRecord *records=realloc(schema->records,(schema->n+1)*sizeof(*records));if(!records){for(int k=0;k<4;k++)free(r.v[k]);return 0;}schema->records=records;records[schema->n++]=r;
 }
 return at==n;
}
static int same_payload(const Buffer *a,const char *p,size_t n){return a->n==n&&(!n||!memcmp(a->p,p,n));}
static int schema_expected(const StorageSnapshot *source,Buffer *payload){
 Schema schema={0};int ok=schema_decode(source->schemaPayload,source->schemaLength,&schema);
 for(int i=0;i<3&&ok;i++){char automatic[100];snprintf(automatic,sizeof(automatic),"sqlite_autoindex_%s_1",INFRA[i]);ok=schema_add(&schema,"table",INFRA[i],INFRA[i],DDL[i])&&schema_add(&schema,"index",automatic,INFRA[i],0);}
 if(ok){qsort(schema.records,schema.n,sizeof(*schema.records),compare_record);ok=schema_encode(&schema,payload);}schema_free(&schema);return ok;
}

/* Fixed source contract. An object name alone never grants acceptance. Core
   column identity, affinity, nullability, key and index projection are checked.
   GUI search objects are outside this candidate and are rejected unchanged. */
typedef struct {const char *name,*type;int notnull,pk;} Column;
static const Column ENTITY_COLUMNS[]={
 {"key","TEXT",0,1},{"kind","TEXT",1,0},{"id","TEXT",1,0},{"data","TEXT",1,0},{"record","TEXT",1,0},{"deleted","INTEGER",1,0},{"conflicts","TEXT",1,0},{"parent_id","TEXT",0,0},{"done","INTEGER",0,0},{"quadrant","INTEGER",0,0},{"reminder_at","INTEGER",0,0},{"start","TEXT",0,0}};
static const Column META_COLUMNS[]={{"id","INTEGER",0,1},{"value","TEXT",1,0}};
static const Column OUTBOX_COLUMNS[]={{"id","INTEGER",0,1},{"event","TEXT",1,0}};
static int columns_check(DB *db,const char *table,const Column *expected,size_t count){
 char sql[160];snprintf(sql,sizeof(sql),"PRAGMA table_info(\"%s\")",table);sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,sql,-1,&stmt,0),ok=code==SQLITE_OK;size_t seen=0;unsigned mask=0;if(!ok)failure(db,"validate columns",code);
 while(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW){const char *name=(const char*)sqlite3_column_text(stmt,1),*type=(const char*)sqlite3_column_text(stmt,2);size_t i=0;for(;i<count;i++)if(!strcmp(name,expected[i].name))break;
  if(i==count||(mask&(1u<<i))||strcmp(type,expected[i].type)||sqlite3_column_int(stmt,3)!=expected[i].notnull||sqlite3_column_type(stmt,4)!=SQLITE_NULL||sqlite3_column_int(stmt,5)!=expected[i].pk)ok=message(db,"blockedSchema: unknown core column definition");
  else{mask|=1u<<i;seen++;}
 }
 if(ok&&(code!=SQLITE_DONE||seen!=count))ok=message(db,"blockedSchema: incomplete core columns");return finish(db,stmt,ok,"finish column validation");
}
static int normalize_matches(const char *actual,const char *expected){
 if(!actual||!expected)return actual==expected;
 Buffer values[2]={{0},{0}};const char *inputs[2]={actual,expected};int ok=1;
 for(int i=0;i<2&&ok;i++){
  int space=0;for(const char *p=inputs[i];*p&&ok;p++){
   if(*p==' '||*p=='\r'||*p=='\n'||*p=='\t'){space=values[i].n>0;continue;}
   int punctuation=strchr("(),=",*p)!=0;
   if(space&&!punctuation&&values[i].n&&!strchr("(),=",values[i].p[values[i].n-1]))ok=append(&values[i]," ",1);
   space=0;if(ok)ok=append(&values[i],p,1);
  }
  if(ok){const char *prefixes[2]={"CREATE TABLE IF NOT EXISTS ","CREATE INDEX IF NOT EXISTS "};const char *replacements[2]={"CREATE TABLE ","CREATE INDEX "};
   for(int j=0;j<2;j++){size_t prefix=strlen(prefixes[j]),replacement=strlen(replacements[j]);if(values[i].n>=prefix&&!memcmp(values[i].p,prefixes[j],prefix)){memmove(values[i].p+replacement,values[i].p+prefix,values[i].n-prefix+1);memcpy(values[i].p,replacements[j],replacement);values[i].n-=prefix-replacement;break;}}
  }
 }
 ok=ok&&same_payload(&values[0],values[1].p,values[1].n);buffer_free(&values[0]);buffer_free(&values[1]);return ok;
}
static int known_schema(DB *db,const Schema *schema,int target){
 const char *names[]={"entities","meta","outbox","task_filter","task_parent","task_reminders","sqlite_autoindex_entities_1"};
 const char *types[]={"table","table","table","index","index","index","index"};
 const char *tables[]={"entities","meta","outbox","entities","entities","entities","entities"};
 const char *sql[]={"CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)","CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)","CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)",
 "CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)","CREATE INDEX task_parent ON entities(parent_id)","CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)",0};
 const char *reordered[]={"CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)","CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))","CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)"};
 unsigned seen=0,infraSeen=0;if(schema->n!=(target?13:7))return message(db,"blockedSchema: unknown schema object count");
 for(size_t i=0;i<schema->n;i++){const SchemaRecord *r=&schema->records[i];for(int j=0;j<4;j++)if(r->v[j]&&strlen(r->v[j])!=r->len[j])return message(db,"blockedSchema: embedded NUL in schema object");int k=0;for(;k<7;k++)if(!strcmp(r->v[1],names[k]))break;
  if(k<7){int ddlOk=k==6?r->v[3]==0:normalize_matches(r->v[3],sql[k])||(k<3&&normalize_matches(r->v[3],reordered[k]));if((seen&(1u<<k))||strcmp(r->v[0],types[k])||strcmp(r->v[2],tables[k])||!ddlOk)return message(db,"blockedSchema: unknown core object definition");seen|=1u<<k;}
  else{int found=0;for(int j=0;j<3;j++){char automatic[100];snprintf(automatic,sizeof(automatic),"sqlite_autoindex_%s_1",INFRA[j]);int bit=-1;
    if(!strcmp(r->v[1],INFRA[j])&&!strcmp(r->v[0],"table")&&!strcmp(r->v[2],INFRA[j])&&r->v[3]&&!strcmp(r->v[3],DDL[j]))bit=j*2;
    else if(!strcmp(r->v[1],automatic)&&!strcmp(r->v[0],"index")&&!strcmp(r->v[2],INFRA[j])&&!r->v[3])bit=j*2+1;
    if(bit>=0&&!(infraSeen&(1u<<bit))){infraSeen|=1u<<bit;found=1;break;}}
   if(!target||!found)return message(db,"blockedSchema: unrecognized schema object");}
 }
 if(seen!=127||(target&&infraSeen!=63))return message(db,"blockedSchema: missing fixed objects");
 return columns_check(db,"entities",ENTITY_COLUMNS,12)&&columns_check(db,"meta",META_COLUMNS,2)&&columns_check(db,"outbox",OUTBOX_COLUMNS,2);
}
static int version_read(DB *db,int *version){sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"PRAGMA user_version",-1,&stmt,0);int ok=code==SQLITE_OK;if(!ok)failure(db,"read version",code);if(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW)*version=sqlite3_column_int(stmt,0);else if(ok)ok=failure(db,"step version",code);return finish(db,stmt,ok,"finish version");}
static int compare_row(const void *a,const void *b){const Buffer *l=a,*r=b;size_t n=l->n<r->n?l->n:r->n;int c=memcmp(l->p,r->p,n);return c?c:l->n<r->n?-1:l->n>r->n;}
static void rows_free(Rows *rows){for(size_t i=0;i<rows->n;i++)buffer_free(&rows->rows[i]);free(rows->rows);}
static int raw_table(DB *db,Buffer *payload,const char *table){
 Buffer sql={0};char **columns=0;size_t count=0;Rows rows={0};sqlite3_stmt *stmt=0;char pragma[160];snprintf(pragma,sizeof(pragma),"PRAGMA table_info(\"%s\")",table);
 int code=sqlite3_prepare_v2(db->sql,pragma,-1,&stmt,0),ok=code==SQLITE_OK;if(!ok)failure(db,"read raw columns",code);
 while(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW){const char *name=(const char*)sqlite3_column_text(stmt,1);char **p=realloc(columns,(count+1)*sizeof(*p));if(!p){ok=message(db,"Cannot allocate raw columns");break;}columns=p;columns[count]=copy_bytes(name,strlen(name));if(!columns[count]){ok=message(db,"Cannot allocate raw column");break;}count++;}
 if(ok&&code!=SQLITE_DONE)ok=failure(db,"step raw columns",code);ok=finish(db,stmt,ok,"finish raw columns");stmt=0;
 if(ok)ok=text_field(payload,table)&&count_field(payload,count);
 for(size_t i=0;i<count&&ok;i++)ok=text_field(payload,columns[i]);
 if(ok)ok=append(&sql,"SELECT ",7);
 for(size_t i=0;i<count&&ok;i++){
  char *part=sqlite3_mprintf("%stypeof(\"%w\"),CASE WHEN typeof(\"%w\")='null' THEN NULL ELSE hex(CAST(\"%w\" AS BLOB)) END,\"%w\"",i?",":"",columns[i],columns[i],columns[i],columns[i]);
  ok=part&&append(&sql,part,strlen(part));sqlite3_free(part);
 }
 if(ok){char *part=sqlite3_mprintf(" FROM \"%w\"",table);ok=part&&append(&sql,part,strlen(part));sqlite3_free(part);}
 if(ok){code=sqlite3_prepare_v2(db->sql,sql.p,-1,&stmt,0);if(code!=SQLITE_OK)ok=failure(db,"prepare raw rows",code);}
 while(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW){Buffer row={0};
  for(size_t i=0;i<count&&ok;i++){
   int at=(int)(i*3);const char *type=(const char*)sqlite3_column_text(stmt,at),*hex=sqlite3_column_type(stmt,at+1)==SQLITE_NULL?0:(const char*)sqlite3_column_text(stmt,at+1);char bits[17];const char *real=0;
   if(!strcmp(type,"real")){double value=sqlite3_column_double(stmt,at+2);uint64_t u=0;memcpy(&u,&value,sizeof(u));snprintf(bits,sizeof(bits),"%016llx",(unsigned long long)u);real=bits;}
   ok=text_field(&row,type)&&field(&row,hex,hex?(size_t)sqlite3_column_bytes(stmt,at+1):0)&&text_field(&row,real);
  }
  if(ok){Buffer *p=realloc(rows.rows,(rows.n+1)*sizeof(*p));if(!p)ok=0;else{rows.rows=p;rows.rows[rows.n++]=row;memset(&row,0,sizeof(row));}}buffer_free(&row);
 }
 if(ok&&code!=SQLITE_DONE)ok=failure(db,"step raw rows",code);ok=finish(db,stmt,ok,"finish raw rows");stmt=0;
 if(ok){if(rows.n>1)qsort(rows.rows,rows.n,sizeof(*rows.rows),compare_row);ok=count_field(payload,rows.n);for(size_t i=0;i<rows.n&&ok;i++)ok=append(payload,rows.rows[i].p,rows.rows[i].n);}
 for(size_t i=0;i<count;i++)free(columns[i]);free(columns);buffer_free(&sql);rows_free(&rows);if(!ok&&!*db->error)message(db,"Cannot allocate raw payload");return ok;
}
static int raw_read(DB *db,Buffer *payload){return header(payload,"raw")&&count_field(payload,3)&&raw_table(db,payload,"entities")&&raw_table(db,payload,"meta")&&raw_table(db,payload,"outbox");}
static int snapshot_id(StorageSnapshot *snapshot){Buffer payload={0};char version[32];snprintf(version,sizeof(version),"%d",snapshot->userVersion);int ok=header(&payload,"snapshot")&&text_field(&payload,snapshot->schemaFingerprint)&&text_field(&payload,snapshot->rawFingerprint)&&text_field(&payload,version)&&digest(payload.p,payload.n,snapshot->snapshotId);buffer_free(&payload);return ok;}
void db_migration_snapshot_free(StorageSnapshot *s){if(!s)return;free(s->schemaPayload);free(s->rawPayload);free(s->databasePath);memset(s,0,sizeof(*s));}
int db_migration_capture(DB *db,StorageSnapshot *snapshot){
 memset(snapshot,0,sizeof(*snapshot));if(!db->sql)return message(db,"Migration capture requires an open handle");db->error[0]=0;Schema schema={0};Buffer schemaBytes={0},raw={0};int version=0;
 int ownsRead=sqlite3_get_autocommit(db->sql);int ok=!ownsRead||execute(db,"BEGIN");if(ok)ok=version_read(db,&version)&&(version==0||version==1);if(!ok&&!*db->error)message(db,"blockedVersion: only candidate user_version 0 or 1 is recognized");
 if(ok)ok=schema_read(db,&schema)&&known_schema(db,&schema,version==1)&&schema_encode(&schema,&schemaBytes)&&raw_read(db,&raw);
 if(ok){snapshot->userVersion=version;snapshot->schemaPayload=schemaBytes.p;snapshot->schemaLength=schemaBytes.n;snapshot->rawPayload=raw.p;snapshot->rawLength=raw.n;memset(&schemaBytes,0,sizeof(schemaBytes));memset(&raw,0,sizeof(raw));const char *path=sqlite3_db_filename(db->sql,"main");snapshot->databasePath=path?copy_bytes(path,strlen(path)):0;
  ok=snapshot->databasePath&&digest(snapshot->schemaPayload,snapshot->schemaLength,snapshot->schemaFingerprint)&&digest(snapshot->rawPayload,snapshot->rawLength,snapshot->rawFingerprint)&&snapshot_id(snapshot);}
 if(ownsRead&&!sqlite3_get_autocommit(db->sql)){char primary[sizeof(db->error)];snprintf(primary,sizeof(primary),"%s",db->error);int closed=execute(db,"ROLLBACK");if(*primary)snprintf(db->error,sizeof(db->error),"%s",primary);if(!closed)ok=0;}
 schema_free(&schema);buffer_free(&schemaBytes);buffer_free(&raw);if(!ok){db_migration_snapshot_free(snapshot);if(!*db->error)message(db,"Cannot capture storage snapshot");}return ok;
}
J *db_migration_snapshot_json(const StorageSnapshot *s){J *j=cJSON_CreateObject();ss(j,"schemaFingerprint",s->schemaFingerprint);ss(j,"rawFingerprint",s->rawFingerprint);sn(j,"userVersion",s->userVersion);ss(j,"snapshotId",s->snapshotId);ss(j,"schemaPayload",s->schemaPayload);ss(j,"rawPayload",s->rawPayload);return j;}
J *db_migration_result_json(const StorageMigrationResult *r){J *j=cJSON_CreateObject();ss(j,"status",r->status);ss(j,"attemptId",r->attemptId);ss(j,"firstError",r->firstError);ss(j,"rollbackError",r->rollbackError);sn(j,"sqliteCode",r->sqliteCode);set(j,"commitAttempted",cJSON_CreateBool(r->commitAttempted));set(j,"commitReported",cJSON_CreateBool(r->commitReported));return j;}
static void result_begin(StorageMigrationResult *r){memset(r,0,sizeof(*r));uuid(r->attemptId);strcpy(r->status,"failed");}
static void result_error(DB *db,StorageMigrationResult *r,const char *status){snprintf(r->status,sizeof(r->status),"%s",status);if(!*r->firstError)snprintf(r->firstError,sizeof(r->firstError),"%s",*db->error?db->error:"Migration operation refused");r->sqliteCode=db->sql?sqlite3_extended_errcode(db->sql):SQLITE_MISUSE;}
static int request_valid(DB *db,const StorageMigrationRequest *r){
 if(!r||!r->sourceSnapshot||!r->migrationId||!r->contractId||!r->algorithmId||!r->implementationChecksum||strcmp(r->migrationId,STORAGE_MIGRATION_ID)||strcmp(r->contractId,STORAGE_CONTRACT_ID)||strcmp(r->algorithmId,STORAGE_ALGORITHM_ID))return message(db,"blockedIdentity: unrecognized migration request");
 if(!hash_valid(db_migration_build_identity())||strcmp(r->implementationChecksum,db_migration_build_identity()))return message(db,"blockedIdentity: missing or mismatched build-bound production checksum");
 const StorageSnapshot *s=r->sourceSnapshot;if(s->userVersion!=0||!s->schemaPayload||!s->rawPayload||!s->databasePath||!hash_valid(s->schemaFingerprint)||!hash_valid(s->rawFingerprint)||!hash_valid(s->snapshotId))return message(db,"blockedSnapshot: invalid original snapshot");
 char schema[65],raw[65];StorageSnapshot copy=*s;
 if(!digest(s->schemaPayload,s->schemaLength,schema)||strcmp(schema,s->schemaFingerprint)||!digest(s->rawPayload,s->rawLength,raw)||strcmp(raw,s->rawFingerprint)||!snapshot_id(&copy)||strcmp(copy.snapshotId,s->snapshotId))return message(db,"blockedSnapshot: original snapshot payload/hash mismatch");
 const char *path=db->sql?sqlite3_db_filename(db->sql,"main"):0;if(!path||strcmp(path,s->databasePath))return message(db,"blockedSnapshot: handle is not the original database path");return 1;
}
static int observe(DB *db,StorageMigrationObserver observer,void *context,const char *stage){if(!observer||!observer(db,stage,context))return 1;if(!*db->error)snprintf(db->error,sizeof(db->error),"Diagnostic observer rejected stage %s",stage);return 0;}
static int identical_source(const StorageSnapshot *a,const StorageSnapshot *b){return a->userVersion==b->userVersion&&!strcmp(a->schemaFingerprint,b->schemaFingerprint)&&!strcmp(a->rawFingerprint,b->rawFingerprint)&&!strcmp(a->snapshotId,b->snapshotId);}
static int bind_text(sqlite3_stmt *stmt,int position,const char *p,size_t n){return n<=INT_MAX?sqlite3_bind_text(stmt,position,p,(int)n,SQLITE_TRANSIENT):SQLITE_TOOBIG;}
static int insert_snapshot(DB *db,const StorageSnapshot *s){
 sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"INSERT INTO storage_migration_snapshots(snapshot_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,schema_payload,raw_payload) VALUES(?,?,?,?,?,?)",-1,&stmt,0);
 if(code==SQLITE_OK)code=sqlite3_bind_text(stmt,1,s->snapshotId,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_text(stmt,2,s->schemaFingerprint,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_text(stmt,3,s->rawFingerprint,-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_bind_int(stmt,4,s->userVersion);if(code==SQLITE_OK)code=bind_text(stmt,5,s->schemaPayload,s->schemaLength);if(code==SQLITE_OK)code=bind_text(stmt,6,s->rawPayload,s->rawLength);if(code==SQLITE_OK)code=sqlite3_step(stmt);int ok=code==SQLITE_DONE;if(!ok)failure(db,"insert immutable snapshot",code);return finish(db,stmt,ok,"finish snapshot insert");
}
static int insert_registry(DB *db,const StorageMigrationRequest *r,const char *targetSchema){
 const StorageSnapshot *s=r->sourceSnapshot;sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"INSERT INTO storage_migration_registry(migration_id,checksum,contract_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,target_schema_fingerprint,target_raw_fingerprint,target_user_version,source_snapshot_id,status) VALUES(?,?,?,?,?,0,?,?,1,?,'committed')",-1,&stmt,0);
 const char *values[]={r->migrationId,r->implementationChecksum,r->contractId,s->schemaFingerprint,s->rawFingerprint,targetSchema,s->rawFingerprint,s->snapshotId};for(int i=0;i<8&&code==SQLITE_OK;i++)code=sqlite3_bind_text(stmt,i+1,values[i],-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_step(stmt);int ok=code==SQLITE_DONE;if(!ok)failure(db,"insert registry",code);return finish(db,stmt,ok,"finish registry insert");
}
static int insert_audit(DB *db,const StorageMigrationRequest *r,const StorageMigrationResult *result){
 sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"INSERT INTO storage_migration_audit(attempt_id,migration_id,source_snapshot_id,result,implementation_checksum) VALUES(?,?,?,'committed',?)",-1,&stmt,0);const char *values[]={result->attemptId,r->migrationId,r->sourceSnapshot->snapshotId,r->implementationChecksum};for(int i=0;i<4&&code==SQLITE_OK;i++)code=sqlite3_bind_text(stmt,i+1,values[i],-1,SQLITE_TRANSIENT);if(code==SQLITE_OK)code=sqlite3_step(stmt);int ok=code==SQLITE_DONE;if(!ok)failure(db,"insert audit",code);return finish(db,stmt,ok,"finish audit insert");
}
static int column_same(sqlite3_stmt *stmt,int col,const char *value,size_t length){return sqlite3_column_type(stmt,col)==SQLITE_TEXT&&(size_t)sqlite3_column_bytes(stmt,col)==length&&!memcmp(sqlite3_column_text(stmt,col),value,length);}
static int row_count(DB *db,const char *table,int *count){char sql[200];snprintf(sql,sizeof(sql),"SELECT count(*) FROM %s",table);sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,sql,-1,&stmt,0),ok=code==SQLITE_OK;if(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW)*count=sqlite3_column_int(stmt,0);else ok=failure(db,"read infrastructure count",code);return finish(db,stmt,ok,"finish infrastructure count");}
static int committed_check_data(DB *db,const StorageMigrationRequest *r,const StorageSnapshot *current,const Buffer *expected){
 const StorageSnapshot *s=r->sourceSnapshot;char targetHash[65];if(!digest(expected->p,expected->n,targetHash)||current->userVersion!=1||strcmp(current->schemaFingerprint,targetHash)||!same_payload(expected,current->schemaPayload,current->schemaLength))return message(db,"blockedUnknown: target schema/version mismatch");
 int count=0;if(!row_count(db,INFRA[0],&count)||count!=1||!row_count(db,INFRA[1],&count)||count!=1||!row_count(db,INFRA[2],&count)||count!=1)return message(db,"blockedUnknown: infrastructure row count differs");
 sqlite3_stmt *stmt=0;int code=sqlite3_prepare_v2(db->sql,"SELECT migration_id,checksum,contract_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,target_schema_fingerprint,target_raw_fingerprint,target_user_version,source_snapshot_id,status FROM storage_migration_registry",-1,&stmt,0),ok=code==SQLITE_OK;
 if(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW){const char *values[]={r->migrationId,r->implementationChecksum,r->contractId,s->schemaFingerprint,s->rawFingerprint};for(int i=0;i<5&&ok;i++)ok=column_same(stmt,i,values[i],strlen(values[i]));
  ok=ok&&sqlite3_column_type(stmt,5)==SQLITE_INTEGER&&sqlite3_column_int64(stmt,5)==0&&column_same(stmt,6,targetHash,64)&&column_same(stmt,7,s->rawFingerprint,64)&&sqlite3_column_type(stmt,8)==SQLITE_INTEGER&&sqlite3_column_int64(stmt,8)==1&&column_same(stmt,9,s->snapshotId,64)&&column_same(stmt,10,"committed",9);
 }else ok=0;if(!ok)message(db,"blockedUnknown: registry identity mismatch");ok=finish(db,stmt,ok,"finish registry check");stmt=0;if(!ok)return 0;
 code=sqlite3_prepare_v2(db->sql,"SELECT snapshot_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,schema_payload,raw_payload FROM storage_migration_snapshots",-1,&stmt,0);ok=code==SQLITE_OK;
 if(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW)ok=column_same(stmt,0,s->snapshotId,64)&&column_same(stmt,1,s->schemaFingerprint,64)&&column_same(stmt,2,s->rawFingerprint,64)&&sqlite3_column_type(stmt,3)==SQLITE_INTEGER&&sqlite3_column_int64(stmt,3)==0&&column_same(stmt,4,s->schemaPayload,s->schemaLength)&&column_same(stmt,5,s->rawPayload,s->rawLength);else ok=0;
 if(!ok)message(db,"blockedUnknown: immutable snapshot mismatch");ok=finish(db,stmt,ok,"finish immutable snapshot check");stmt=0;if(!ok)return 0;
 code=sqlite3_prepare_v2(db->sql,"SELECT attempt_id,migration_id,source_snapshot_id,result,implementation_checksum FROM storage_migration_audit",-1,&stmt,0);ok=code==SQLITE_OK;
 if(ok&&(code=sqlite3_step(stmt))==SQLITE_ROW)ok=sqlite3_column_type(stmt,0)==SQLITE_TEXT&&sqlite3_column_bytes(stmt,0)>0&&column_same(stmt,1,r->migrationId,strlen(r->migrationId))&&column_same(stmt,2,s->snapshotId,64)&&column_same(stmt,3,"committed",9)&&column_same(stmt,4,r->implementationChecksum,64);else ok=0;
 if(!ok)message(db,"blockedUnknown: audit identity mismatch");ok=finish(db,stmt,ok,"finish audit check");if(!ok)return 0;
 if(strcmp(current->rawFingerprint,s->rawFingerprint))return message(db,"blockedDataAdvanced: original business data changed after migration");return 1;
}
static int committed_check(DB *db,const StorageMigrationRequest *r,const StorageSnapshot *ignored,const Buffer *expected){
 (void)ignored;int ownsRead=sqlite3_get_autocommit(db->sql);StorageSnapshot current={0};int ok=!ownsRead||execute(db,"BEGIN");
 if(ok)ok=db_migration_capture(db,&current)&&committed_check_data(db,r,&current,expected);
 if(ownsRead&&!sqlite3_get_autocommit(db->sql)){char primary[sizeof(db->error)];snprintf(primary,sizeof(primary),"%s",db->error);int closed=execute(db,"ROLLBACK");if(*primary)snprintf(db->error,sizeof(db->error),"%s",primary);if(!closed)ok=0;}
 db_migration_snapshot_free(&current);return ok;
}
int db_migration_apply(DB *db,const StorageMigrationRequest *request,StorageMigrationObserver observer,void *context,StorageMigrationResult *result){
 result_begin(result);db->error[0]=0;if(!request_valid(db,request)){result_error(db,result,"blockedIdentity");return 0;}if(!sqlite3_get_autocommit(db->sql)){message(db,"Migration requires exclusive transaction ownership");result_error(db,result,"blockedTransaction");return 0;}
 Buffer expected={0};StorageSnapshot current={0};int ok=schema_expected(request->sourceSnapshot,&expected)&&db_migration_capture(db,&current);
 if(!ok){result_error(db,result,"blockedSchema");goto done;}
 if(current.userVersion==1){ok=committed_check(db,request,&current,&expected);if(ok)strcpy(result->status,"alreadyCommitted");else result_error(db,result,strstr(db->error,"blockedDataAdvanced")?"blockedDataAdvanced":"blockedUnknown");goto done;}
 if(!identical_source(&current,request->sourceSnapshot)){message(db,"blockedSnapshot: source changed before transaction");result_error(db,result,"blockedSnapshot");ok=0;goto done;}
 db_migration_snapshot_free(&current);if(!db_begin(db)){result_error(db,result,"failed");ok=0;goto done;}
 ok=db_migration_capture(db,&current)&&identical_source(&current,request->sourceSnapshot);if(!ok&&!*db->error)message(db,"Source changed while acquiring migration transaction");
 if(ok)ok=observe(db,observer,context,"afterBegin");for(int i=0;i<3&&ok;i++)ok=execute(db,DDL[i]);
 if(ok)ok=observe(db,observer,context,"afterSchema")&&insert_snapshot(db,request->sourceSnapshot)&&observe(db,observer,context,"afterSnapshot");
 if(ok){Schema target={0};Buffer payload={0},raw={0};ok=schema_read(db,&target)&&known_schema(db,&target,1)&&schema_encode(&target,&payload)&&same_payload(&expected,payload.p,payload.n)&&raw_read(db,&raw);
  char rawHash[65];if(ok)ok=digest(raw.p,raw.n,rawHash)&&!strcmp(rawHash,request->sourceSnapshot->rawFingerprint);if(!ok&&!*db->error)message(db,"Target schema or original raw data changed inside migration");schema_free(&target);buffer_free(&payload);buffer_free(&raw);}
 char targetHash[65];if(ok)ok=digest(expected.p,expected.n,targetHash)&&observe(db,observer,context,"beforeRegistry")&&insert_registry(db,request,targetHash)&&insert_audit(db,request,result)&&execute(db,"PRAGMA user_version=1")&&observe(db,observer,context,"beforeCommit");
 if(ok){result->commitAttempted=1;ok=execute(db,"COMMIT");if(ok){result->commitReported=1;strcpy(result->status,"committed");if(!observe(db,observer,context,"afterCommit")){result_error(db,result,"unknownCommit");ok=0;}}else result_error(db,result,"unknownCommit");}
 else result_error(db,result,"failed");
 if(!ok&&!sqlite3_get_autocommit(db->sql)){
  char primary[sizeof(db->error)];snprintf(primary,sizeof(primary),"%s",db->error);
  if(!execute(db,"ROLLBACK"))snprintf(result->rollbackError,sizeof(result->rollbackError),"%s",db->error);
  snprintf(db->error,sizeof(db->error),"%s",primary);
 }
done:db_migration_snapshot_free(&current);buffer_free(&expected);return ok;
}
int db_migration_reopen(DB *db,const StorageSnapshot *source){
 if(db->sql)return message(db,"Reopen requires a new or successfully closed handle");if(!source||!source->databasePath)return message(db,"Reopen requires original same-file identity");
 int code=sqlite3_open_v2(source->databasePath,&db->sql,SQLITE_OPEN_READWRITE|SQLITE_OPEN_FULLMUTEX,0);if(code!=SQLITE_OK)return failure(db,"reopen existing database",code);sqlite3_busy_timeout(db->sql,5000);return 1;
}
int db_migration_resolve(DB *db,const StorageMigrationRequest *request,StorageMigrationResult *result){
 result_begin(result);db->error[0]=0;if(!request_valid(db,request)){result_error(db,result,"blockedIdentity");return 0;}if(!sqlite3_get_autocommit(db->sql)){message(db,"Unknown COMMIT resolution requires a fresh transaction-free handle");result_error(db,result,"blockedUnknown");return 0;}
 StorageSnapshot current={0};Buffer expected={0};int ok=db_migration_capture(db,&current)&&schema_expected(request->sourceSnapshot,&expected);if(!ok){result_error(db,result,"blockedUnknown");goto done;}
 if(current.userVersion==0){if(identical_source(&current,request->sourceSnapshot)){strcpy(result->status,"notCommitted");ok=1;}else{message(db,"blockedUnknown: source is neither the original nor committed snapshot");result_error(db,result,"blockedUnknown");ok=0;}}
 else{ok=committed_check(db,request,&current,&expected);if(ok)strcpy(result->status,"committed");else result_error(db,result,strstr(db->error,"blockedDataAdvanced")?"blockedDataAdvanced":"blockedUnknown");}
done:db_migration_snapshot_free(&current);buffer_free(&expected);return ok;
}
