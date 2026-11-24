package local.gxtodo.replica;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Branch-only first infrastructure migration. No constructor or startup caller. */
public final class MigrationRegistry {
    public static final String STEP="mytodo-storage-infrastructure-0001";
    public static final String CONTRACT="d1-01-candidate.1";
    public static final String ALGORITHM="mytodo-storage-fingerprint-v2";
    public static final String REGISTRY="storage_migration_registry";
    public static final String SNAPSHOTS="storage_migration_snapshots";
    public static final String AUDIT="storage_migration_audit";
    public static final String[] DDL={
        "CREATE TABLE storage_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,contract_id TEXT NOT NULL,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,target_schema_fingerprint TEXT NOT NULL,target_raw_fingerprint TEXT NOT NULL,target_user_version INTEGER NOT NULL,source_snapshot_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'))",
        "CREATE TABLE storage_migration_snapshots(snapshot_id TEXT PRIMARY KEY,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,schema_payload TEXT NOT NULL,raw_payload TEXT NOT NULL)",
        "CREATE TABLE storage_migration_audit(attempt_id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,result TEXT NOT NULL CHECK(result='committed'),implementation_checksum TEXT NOT NULL)"
    };

    /** Caller-owned durable attempt logs/fault observation; never imports a test. */
    public interface Observer { void stage(String stage,JSONObject evidence) throws Exception; }
    private MigrationRegistry() {}

    static final class ObjectRow {
        final String type,name,table,sql;
        ObjectRow(String type,String name,String table,String sql){this.type=type;this.name=name;this.table=table;this.sql=sql;}
    }
    static final Comparator<ObjectRow> OBJECT_ORDER=(a,b)->{
        int n=compareBytes(utf8(a.type),utf8(b.type));if(n!=0)return n;
        n=compareBytes(utf8(a.name),utf8(b.name));return n!=0?n:compareBytes(utf8(a.table),utf8(b.table));
    };
    static byte[] utf8(String value){return value.getBytes(StandardCharsets.UTF_8);}
    static int compareBytes(byte[] a,byte[] b){for(int i=0;i<Math.min(a.length,b.length);i++){int n=(a[i]&255)-(b[i]&255);if(n!=0)return n;}return a.length-b.length;}
    static String hex(byte[] value){StringBuilder out=new StringBuilder(value.length*2);for(byte b:value)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    static String sha(String value)throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(utf8(value)));}
    static void field(ByteArrayOutputStream out,String value)throws Exception {
        if(value==null){out.write(utf8("N;"));return;}
        byte[] bytes=utf8(value);out.write(utf8("S"+bytes.length+":"));out.write(bytes);
    }
    static ByteArrayOutputStream header(String role)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();field(out,ALGORITHM);field(out,role);return out;}
    static String text(ByteArrayOutputStream out){return new String(out.toByteArray(),StandardCharsets.UTF_8);}
    static String quoted(String name){if(!name.matches("[A-Za-z0-9_]+"))throw new IllegalArgumentException("Unknown SQL identifier");return "\""+name+"\"";}
    static void require(boolean value,String message){if(!value)throw new IllegalStateException("BLOCKER: "+message);}
    static boolean infrastructure(String name){return name.equals(REGISTRY)||name.equals(SNAPSHOTS)||name.equals(AUDIT)||name.startsWith("sqlite_autoindex_storage_migration_");}
    static List<ObjectRow> objects(SQLiteDatabase db){
        List<ObjectRow> rows=new ArrayList<>();
        try(Cursor c=db.rawQuery("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY",null)){
            while(c.moveToNext())rows.add(new ObjectRow(c.getString(0),c.getString(1),c.getString(2),c.isNull(3)?null:c.getString(3)));
        }return rows;
    }
    static String schemaPayload(List<ObjectRow> rows)throws Exception {
        List<ObjectRow> sorted=new ArrayList<>(rows);Collections.sort(sorted,OBJECT_ORDER);ByteArrayOutputStream out=header("schema");field(out,String.valueOf(sorted.size()));
        for(ObjectRow row:sorted){field(out,row.type);field(out,row.name);field(out,row.table);field(out,row.sql);}return text(out);
    }
    static String schema(SQLiteDatabase db)throws Exception{return schemaPayload(objects(db));}
    static List<ObjectRow> sourceObjects(SQLiteDatabase db){List<ObjectRow> out=new ArrayList<>();for(ObjectRow r:objects(db))if(!infrastructure(r.name)&&!infrastructure(r.table))out.add(r);return out;}
    static final class Decoder {
        final byte[] input;int cursor;
        Decoder(String value){input=utf8(value);}
        String read(){
            require(cursor<input.length,"short fingerprint payload");
            if(input[cursor]=='N'){require(cursor+1<input.length&&input[cursor+1]==';',"invalid NULL field");cursor+=2;return null;}
            require(input[cursor++]=='S',"invalid field prefix");int length=0,digits=0;
            while(cursor<input.length&&input[cursor]!=':'){int n=input[cursor++]-'0';require(n>=0&&n<=9&&length<100000000,"invalid byte length");length=length*10+n;digits++;}
            require(digits>0&&cursor<input.length&&input[cursor++]==':'&&length<=input.length-cursor,"short string field");
            String result=new String(input,cursor,length,StandardCharsets.UTF_8);require(Arrays.equals(utf8(result),Arrays.copyOfRange(input,cursor,cursor+length)),"invalid UTF-8 payload");cursor+=length;return result;
        }
    }
    static String expectedTarget(String source)throws Exception {
        Decoder d=new Decoder(source);require(ALGORITHM.equals(d.read())&&"schema".equals(d.read()),"wrong schema algorithm/role");
        String count=d.read();require(count!=null&&count.matches("[0-9]+"),"invalid object count");int n=Integer.parseInt(count);require(n<=1000,"object count bound");
        List<ObjectRow> rows=new ArrayList<>();for(int i=0;i<n;i++){ObjectRow row=new ObjectRow(d.read(),d.read(),d.read(),d.read());require(row.type!=null&&row.name!=null&&row.table!=null&&!infrastructure(row.name)&&!infrastructure(row.table),"source includes infrastructure");rows.add(row);}require(d.cursor==d.input.length,"trailing schema fields");
        String[] names={REGISTRY,SNAPSHOTS,AUDIT};for(int i=0;i<names.length;i++){rows.add(new ObjectRow("table",names[i],names[i],DDL[i]));rows.add(new ObjectRow("index","sqlite_autoindex_"+names[i]+"_1",names[i],null));}return schemaPayload(rows);
    }
    static List<String> columns(SQLiteDatabase db,String table){List<String> out=new ArrayList<>();try(Cursor c=db.rawQuery("PRAGMA table_info("+quoted(table)+")",null)){while(c.moveToNext())out.add(c.getString(1));}return out;}
    static String raw(SQLiteDatabase db)throws Exception {
        List<String> tables=new ArrayList<>(Arrays.asList("entities","meta","outbox"));
        try(Cursor c=db.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='android_metadata'",null)){if(c.moveToFirst())tables.add("android_metadata");}
        Collections.sort(tables);ByteArrayOutputStream out=header("raw");field(out,String.valueOf(tables.size()));
        for(String table:tables){
            List<String> names=columns(db,table);field(out,table);field(out,String.valueOf(names.size()));for(String name:names)field(out,name);
            StringBuilder sql=new StringBuilder("SELECT ");for(int i=0;i<names.size();i++){if(i!=0)sql.append(',');String name=quoted(names.get(i));sql.append("typeof(").append(name).append("),CASE WHEN ").append(name).append(" IS NULL OR typeof(").append(name).append(")=\'real\' THEN NULL ELSE hex(CAST(").append(name).append(" AS BLOB)) END,").append(name);}sql.append(" FROM ").append(quoted(table));
            List<byte[]> rows=new ArrayList<>();try(Cursor c=db.rawQuery(sql.toString(),null)){while(c.moveToNext()){ByteArrayOutputStream encoded=new ByteArrayOutputStream();for(int i=0;i<names.size();i++){String type=c.getString(i*3);field(encoded,type);field(encoded,"real".equals(type)||"null".equals(type)?null:c.isNull(i*3+1)?null:c.getString(i*3+1));String real=null;if("real".equals(type))real=String.format(Locale.ROOT,"%016x",Double.doubleToRawLongBits(c.getDouble(i*3+2)));field(encoded,real);}rows.add(encoded.toByteArray());}}
            Collections.sort(rows,MigrationRegistry::compareBytes);field(out,String.valueOf(rows.size()));for(byte[] row:rows)out.write(row);
        }return text(out);
    }
    static void knownLayout(SQLiteDatabase db,boolean allowInfrastructure){
        String[] tableSql={
            "CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)",
            "CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)",
            "CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)"};
        String[] indexSql={"CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)","CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)","CREATE INDEX task_parent ON entities(parent_id)"};
        String[] reorderedSql={"CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))","CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)","CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)"};
        String[] tables={"meta","entities","outbox"};
        String[][] definitions={
            {"id|INTEGER|0|1","value|TEXT|1|0"},
            {"key|TEXT|0|1","kind|TEXT|1|0","id|TEXT|1|0","data|TEXT|1|0","record|TEXT|1|0","deleted|INTEGER|1|0","conflicts|TEXT|1|0","parent_id|TEXT|0|0","done|INTEGER|0|0","quadrant|INTEGER|0|0","reminder_at|INTEGER|0|0","start|TEXT|0|0"},
            {"id|INTEGER|0|1","event|TEXT|1|0"}
        };
        for(int t=0;t<tables.length;t++){List<String> actual=new ArrayList<>();try(Cursor c=db.rawQuery("PRAGMA table_info("+quoted(tables[t])+")",null)){while(c.moveToNext()){require(c.isNull(4),"unexpected column default");actual.add(c.getString(1)+"|"+c.getString(2)+"|"+c.getInt(3)+"|"+c.getInt(5));}}List<String> expected=new ArrayList<>(Arrays.asList(definitions[t]));Collections.sort(actual);Collections.sort(expected);require(actual.equals(expected),"unknown core columns "+tables[t]);}
        String[] indexes={"task_filter","task_reminders","task_parent"};String[][] indexColumns={{"kind","deleted","done","quadrant","start"},{"kind","deleted","done","reminder_at"},{"parent_id"}};
        for(int i=0;i<indexes.length;i++){List<String> actual=new ArrayList<>();try(Cursor c=db.rawQuery("PRAGMA index_info("+quoted(indexes[i])+")",null)){while(c.moveToNext())actual.add(c.getString(2));}require(actual.equals(Arrays.asList(indexColumns[i])),"unknown core index "+indexes[i]);}
        List<String> allowed=Arrays.asList("meta","entities","outbox","sqlite_autoindex_entities_1","task_filter","task_reminders","task_parent");
        for(ObjectRow row:objects(db)){
            if(allowInfrastructure&&infrastructure(row.name))continue;
            if(row.name.equals("android_metadata")){
                require(row.type.equals("table")&&row.table.equals("android_metadata")&&"CREATE TABLE android_metadata (locale TEXT)".equals(row.sql),"unknown Android metadata DDL");
                try(Cursor c=db.rawQuery("PRAGMA table_info(android_metadata)",null)){require(c.moveToFirst()&&c.getInt(0)==0&&c.getString(1).equals("locale")&&c.getString(2).equals("TEXT")&&c.getInt(3)==0&&c.isNull(4)&&c.getInt(5)==0&&!c.moveToNext(),"unknown locale column");}
                try(Cursor c=db.rawQuery("SELECT typeof(locale),locale FROM android_metadata",null)){require(c.moveToFirst()&&c.getString(0).equals("text")&&c.getString(1)!=null&&!c.getString(1).isEmpty()&&!c.moveToNext(),"unknown typed locale row");}continue;
            }
            require(allowed.contains(row.name),"unknown source object "+row.name);
            if(row.name.startsWith("task_")){
                require(row.type.equals("index")&&row.table.equals("entities"),"unknown index domain");
                int index=Arrays.asList(indexes).indexOf(row.name);require(index>=0&&normalizedSql(indexSql[index]).equals(normalizedSql(row.sql)),"unknown index constraint/order");
            }
            else if(row.name.equals("sqlite_autoindex_entities_1"))require(row.type.equals("index")&&row.table.equals("entities")&&row.sql==null,"unknown primary-key autoindex");
            else {require(row.type.equals("table")&&row.table.equals(row.name),"unknown source table");int index=Arrays.asList(tables).indexOf(row.name);require(index>=0&&(normalizedSql(tableSql[index]).equals(normalizedSql(row.sql))||normalizedSql(reorderedSql[index]).equals(normalizedSql(row.sql))),"unknown source constraint/layout");}
        }
    }
    static String normalizedSql(String value){if(value==null)return "";return value.trim().replaceAll("(?i)^(CREATE\\s+(?:TABLE|INDEX)\\s+)IF\\s+NOT\\s+EXISTS\\s+","$1").replaceAll("\\s+"," ").replaceAll("\\s*([(),=])\\s*","$1").toLowerCase(Locale.ROOT);}
    public static JSONObject sourceSnapshot(SQLiteDatabase db)throws Exception {
        knownLayout(db,false);require(db.getVersion()==0,"first source version must be 0");String schema=schema(db),raw=raw(db);String schemaHash=sha(schema),rawHash=sha(raw);ByteArrayOutputStream snapshot=header("snapshot");field(snapshot,schemaHash);field(snapshot,rawHash);field(snapshot,"0");
        return new JSONObject().put("schemaFingerprint",schemaHash).put("rawFingerprint",rawHash).put("userVersion",0).put("snapshotId",sha(text(snapshot))).put("schemaPayload",schema).put("rawPayload",raw);
    }
    static JSONObject checkedSnapshot(JSONObject request,String buildChecksum)throws Exception {
        require(STEP.equals(request.getString("migrationId"))&&CONTRACT.equals(request.getString("contractId"))&&ALGORITHM.equals(request.getString("algorithmId")),"unsupported fixed plan");
        require(buildChecksum!=null&&buildChecksum.matches("[0-9a-f]{64}")&&buildChecksum.equals(request.getString("implementationChecksum")),"missing/mismatched build-bound implementation identity");
        JSONObject source=request.getJSONObject("sourceSnapshot");require(source.getInt("userVersion")==0,"wrong source version");
        require(sha(source.getString("schemaPayload")).equals(source.getString("schemaFingerprint"))&&sha(source.getString("rawPayload")).equals(source.getString("rawFingerprint")),"snapshot payload/hash mismatch");
        ByteArrayOutputStream encoded=header("snapshot");field(encoded,source.getString("schemaFingerprint"));field(encoded,source.getString("rawFingerprint"));field(encoded,"0");require(sha(text(encoded)).equals(source.getString("snapshotId")),"snapshot identity mismatch");return source;
    }
    static JSONObject result(String outcome,JSONObject source,String attempt)throws Exception{return new JSONObject().put("outcome",outcome).put("status",outcome).put("migrationId",STEP).put("sourceSnapshotId",source.getString("snapshotId")).put("attemptId",attempt).put("automaticActivation",false).put("actorResumption",false);}
    static void observe(Observer observer,String stage,JSONObject source,String attempt)throws Exception{if(observer!=null)observer.stage(stage,result(stage,source,attempt));}
    static boolean hasRegistry(SQLiteDatabase db){try(Cursor c=db.rawQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",new String[]{REGISTRY})){return c.moveToFirst();}}
    static JSONObject inspectCommitted(SQLiteDatabase db,JSONObject request,JSONObject source,String attempt)throws Exception {
        if(!sha(raw(db)).equals(source.getString("rawFingerprint")))return result("blockedDataAdvanced",source,attempt);
        if(db.getVersion()!=1||!schema(db).equals(expectedTarget(source.getString("schemaPayload"))))return result("blockedUnknown",source,attempt);
        knownLayout(db,true);
        try(Cursor c=db.rawQuery("SELECT migration_id,checksum,contract_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,target_schema_fingerprint,target_raw_fingerprint,target_user_version,source_snapshot_id,status FROM storage_migration_registry WHERE migration_id=?",new String[]{STEP})){
            if(!c.moveToFirst())return result("blockedUnknown",source,attempt);
            String[] expected={STEP,request.getString("implementationChecksum"),CONTRACT,source.getString("schemaFingerprint"),source.getString("rawFingerprint"),"0",sha(expectedTarget(source.getString("schemaPayload"))),source.getString("rawFingerprint"),"1",source.getString("snapshotId"),"committed"};
            for(int i=0;i<expected.length;i++)if(!expected[i].equals(c.getString(i)))return result("blockedUnknown",source,attempt);
            if(c.moveToNext())return result("blockedUnknown",source,attempt);
        }
        try(Cursor c=db.rawQuery("SELECT source_schema_fingerprint,source_raw_fingerprint,source_user_version,schema_payload,raw_payload FROM storage_migration_snapshots WHERE snapshot_id=?",new String[]{source.getString("snapshotId")})){
            if(!c.moveToFirst())return result("blockedUnknown",source,attempt);String[] expected={source.getString("schemaFingerprint"),source.getString("rawFingerprint"),"0",source.getString("schemaPayload"),source.getString("rawPayload")};for(int i=0;i<expected.length;i++)if(!expected[i].equals(c.getString(i)))return result("blockedUnknown",source,attempt);if(c.moveToNext())return result("blockedUnknown",source,attempt);
        }
        try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM storage_migration_registry",null)){require(c.moveToFirst()&&c.getInt(0)==1,"unexpected registry records");}
        try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM storage_migration_snapshots",null)){require(c.moveToFirst()&&c.getInt(0)==1,"unexpected snapshots");}
        try(Cursor c=db.rawQuery("SELECT migration_id,source_snapshot_id,result,implementation_checksum FROM storage_migration_audit",null)){if(!c.moveToFirst()||!STEP.equals(c.getString(0))||!source.getString("snapshotId").equals(c.getString(1))||!"committed".equals(c.getString(2))||!request.getString("implementationChecksum").equals(c.getString(3))||c.moveToNext())return result("blockedUnknown",source,attempt);}
        return result("committed",source,attempt);
    }
    public static JSONObject migrate(SQLiteDatabase db,File file,JSONObject request,String buildChecksum,Observer observer)throws Exception {
        JSONObject source=checkedSnapshot(request,buildChecksum);String attempt=UUID.randomUUID().toString();observe(observer,"attemptStarted",source,attempt);
        if(hasRegistry(db)){
            db.beginTransaction();Exception first=null;
            try{return inspectCommitted(db,request,source,attempt).put("repeatExecution",true);}
            catch(Exception failure){first=failure;throw failure;}
            finally{try{db.endTransaction();}catch(Exception ending){if(first!=null)first.addSuppressed(ending);else throw ending;}}
        }
        require(db.getVersion()==0,"unknown source user_version");boolean begun=false,marked=false,ended=false;
        try {
            db.beginTransaction();begun=true;JSONObject current=sourceSnapshot(db);
            if(!current.getString("snapshotId").equals(source.getString("snapshotId"))){db.endTransaction();ended=true;return result(current.getString("rawFingerprint").equals(source.getString("rawFingerprint"))?"blockedUnknown":"blockedDataAdvanced",source,attempt);}
            observe(observer,"sourceRechecked",source,attempt);
            for(String ddl:DDL)db.execSQL(ddl);observe(observer,"infrastructureCreated",source,attempt);
            db.execSQL("INSERT INTO storage_migration_snapshots(snapshot_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,schema_payload,raw_payload) VALUES(?,?,?,?,?,?)",new Object[]{source.getString("snapshotId"),source.getString("schemaFingerprint"),source.getString("rawFingerprint"),0,source.getString("schemaPayload"),source.getString("rawPayload")});
            observe(observer,"snapshotStored",source,attempt);
            require(sha(raw(db)).equals(source.getString("rawFingerprint")),"original raw data changed");String target=expectedTarget(source.getString("schemaPayload"));require(schema(db).equals(target),"unexpected independently expected target schema");
            db.execSQL("INSERT INTO storage_migration_registry(migration_id,checksum,contract_id,source_schema_fingerprint,source_raw_fingerprint,source_user_version,target_schema_fingerprint,target_raw_fingerprint,target_user_version,source_snapshot_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",new Object[]{STEP,buildChecksum,CONTRACT,source.getString("schemaFingerprint"),source.getString("rawFingerprint"),0,sha(target),source.getString("rawFingerprint"),1,source.getString("snapshotId"),"committed"});
            db.execSQL("INSERT INTO storage_migration_audit(attempt_id,migration_id,source_snapshot_id,result,implementation_checksum) VALUES(?,?,?,?,?)",new Object[]{attempt,STEP,source.getString("snapshotId"),"committed",buildChecksum});
            db.setVersion(1);require(db.getVersion()==1,"user_version not set");observe(observer,"beforeCommit",source,attempt);
            db.setTransactionSuccessful();marked=true;db.endTransaction();ended=true;
            observe(observer,"afterCommit",source,attempt);return result("committed",source,attempt).put("database",file.getCanonicalPath());
        } catch(Exception primary){
            if(begun&&!ended)try{db.endTransaction();ended=true;}catch(Exception cleanup){primary.addSuppressed(cleanup);}
            JSONObject failure=result(marked?"unknownCommit":"failed",source,attempt).put("database",file.getCanonicalPath()).put("primaryError",primary.toString());
            JSONArray cleanup=new JSONArray();for(Throwable error:primary.getSuppressed())cleanup.put(error.toString());failure.put("suppressedErrors",cleanup);
            if(observer!=null)try{observer.stage(marked?"unknownCommit":"attemptFailed",failure);}catch(Exception auditError){primary.addSuppressed(auditError);cleanup.put(auditError.toString());}
            if(marked)return failure.put("requiresNewHandle",true);
            throw primary;
        }
    }
    /** Caller must close/reopen the same path; never retry a possibly committed TX. */
    public static JSONObject confirm(SQLiteDatabase db,JSONObject request,String buildChecksum)throws Exception {
        JSONObject source=checkedSnapshot(request,buildChecksum);String attempt=UUID.randomUUID().toString();
        db.beginTransaction();Exception first=null;
        try{
            if(!sha(raw(db)).equals(source.getString("rawFingerprint")))return result("blockedDataAdvanced",source,attempt);
            if(hasRegistry(db))return inspectCommitted(db,request,source,attempt);
            if(db.getVersion()==0&&schema(db).equals(source.getString("schemaPayload")))return result("notCommitted",source,attempt);
            return result("blockedUnknown",source,attempt);
        }catch(Exception failure){first=failure;throw failure;}
        finally{try{db.endTransaction();}catch(Exception ending){if(first!=null)first.addSuppressed(ending);else throw ending;}}
    }
}
