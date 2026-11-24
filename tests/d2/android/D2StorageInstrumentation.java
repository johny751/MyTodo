package local.gxtodo.replica;

import android.app.Instrumentation;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/** Actual branch production ReplicaDatabase APIs, never a fake storage class. */
public final class D2StorageInstrumentation extends Instrumentation {
    private Bundle arguments;private Context context;private File root,exports;private JSONObject metadata,report;private JSONArray cases;
    interface Case {void run()throws Exception;}
    @Override public void onCreate(Bundle input){super.onCreate(input);arguments=input;start();}
    static byte[] bytes(InputStream in)throws Exception{try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=source.read(buffer))!=-1)out.write(buffer,0,n);return out.toByteArray();}}
    JSONObject asset(String name)throws Exception{return new JSONObject(new String(bytes(context.getAssets().open(name)),StandardCharsets.UTF_8));}
    static void check(boolean condition,String message){if(!condition)throw new IllegalStateException(message);}
    static String sha(byte[] data)throws Exception{return MigrationRegistry.hex(MessageDigest.getInstance("SHA-256").digest(data));}
    static void write(File file,byte[] data)throws Exception{try(FileOutputStream out=new FileOutputStream(file)){out.write(data);out.getFD().sync();}}
    static void copy(File source,File dest)throws Exception{check(!dest.exists(),"Refuse existing export");write(dest,bytes(new FileInputStream(source)));}
    File directory(String id)throws Exception{File dir=new File(root,id);check(!dir.exists()&&dir.mkdir(),"Refuse existing case "+id);return dir;}
    ReplicaDatabase opened(String id)throws Exception{return new ReplicaDatabase(directory(id));}
    JSONObject request(ReplicaDatabase db)throws Exception{return new JSONObject().put("migrationId",MigrationRegistry.STEP).put("contractId",MigrationRegistry.CONTRACT).put("algorithmId",MigrationRegistry.ALGORITHM).put("implementationChecksum",D2CompiledIdentity.CHECKSUM).put("sourceSnapshot",db.captureD2Snapshot());}
    SQLiteDatabase rawDb(ReplicaDatabase db){return SQLiteDatabase.openDatabase(db.databasePath(),null,SQLiteDatabase.OPEN_READWRITE);}
    int version(ReplicaDatabase db){try(SQLiteDatabase raw=rawDb(db)){return raw.getVersion();}}
    int count(ReplicaDatabase db,String table){try(SQLiteDatabase raw=rawDb(db);Cursor c=raw.rawQuery("SELECT COUNT(*) FROM "+MigrationRegistry.quoted(table),null)){check(c.moveToFirst(),"count missing");return c.getInt(0);}}
    JSONObject commit(ReplicaDatabase db,String id)throws Exception {
        JSONObject current=(JSONObject)db.invoke(new JSONObject().put("action","state"));JSONObject meta=new JSONObject(current.getJSONObject("meta").toString());
        JSONObject data=new JSONObject().put("id",id).put("title","真实API合成任务 "+id).put("quadrant",2).put("done",false).put("parentId",JSONObject.NULL).put("reminderAt",JSONObject.NULL).put("start","");
        JSONObject row=new JSONObject().put("key",new JSONArray().put("tasks").put(id).toString()).put("data",data).put("record",new JSONObject().put("events",new JSONArray())).put("deleted",false).put("conflicts",new JSONArray());
        JSONObject event=new JSONObject().put("id",id).put("synthetic",true);long queue=meta.getLong("queue")+1;meta.put("queue",queue);
        return (JSONObject)db.invoke(new JSONObject().put("action","commit").put("expected",meta.getLong("revision")).put("meta",meta).put("rows",new JSONArray().put(row)).put("outbox",new JSONArray().put(new JSONObject().put("id",queue).put("event",event)));
    }
    void record(String id,Case action)throws Exception {
        JSONObject entry=new JSONObject().put("id",id).put("status","failed");cases.put(entry);
        try{action.run();entry.put("status","passed");}catch(Exception error){entry.put("primaryError",error.toString());JSONArray extra=new JSONArray();for(Throwable t:error.getSuppressed())extra.put(t.toString());entry.put("suppressedErrors",extra);}
        persist();
    }
    void persist()throws Exception{write(new File(exports,"android-storage-receipt.json"),report.toString(2).getBytes(StandardCharsets.UTF_8));}
    MigrationRegistry.Observer audit(final File file,final String failStage){return (stage,evidence)->{try(FileOutputStream out=new FileOutputStream(file,true)){out.write((evidence.put("stage",stage).toString()+"\n").getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(stage.equals(failStage))throw new IllegalStateException("synthetic-observer-"+stage);};}
    void sealFile(String name)throws Exception {
        File file=new File(exports,name);JSONObject seal=new JSONObject().put("writersClosed",true).put("bytes",file.length()).put("sha256",sha(bytes(new FileInputStream(file))));JSONArray sides=new JSONArray();
        for(String suffix:new String[]{"-wal","-shm","-journal"}){File side=new File(exports,name+suffix);sides.put(new JSONObject().put("suffix",suffix).put("exists",side.exists()).put("bytes",side.exists()?side.length():0));check(!side.exists()||side.length()==0,"Unsealed sidecar "+name+suffix);}seal.put("sidecars",sides);report.getJSONObject("files").put(name,seal);
    }
    @Override public void onStart(){
        try{
            context=getTargetContext();metadata=asset("build-metadata.json");
            check("local.mytodo.d2storage".equals(context.getPackageName()),"Wrong independent package");check("MYTODO_D2_SYNTHETIC_ONLY".equals(arguments.getString("guard")),"Wrong guard");
            check(metadata.getString("runId").equals(arguments.getString("runId"))&&metadata.getString("sourceSha").equals(arguments.getString("sourceSha")),"Build/run identity mismatch");
            check(D2CompiledIdentity.CHECKSUM.equals(metadata.getString("implementationChecksum")),"Compiled/source checksum mismatch");
            check(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"),"Refuse real device");
            root=new File(context.getFilesDir(),"d2-storage-cases");check(!root.exists()&&root.mkdir(),"Refuse existing test root");exports=new File(context.getFilesDir(),"d1-fixtures");check(!exports.exists()&&exports.mkdir(),"Refuse existing export root");
            cases=new JSONArray();report=new JSONObject().put("status","failed").put("syntheticOnly",true).put("framework","d2-real-storage-api-v1").put("contractId",MigrationRegistry.CONTRACT).put("runId",metadata.getString("runId")).put("runAttempt",metadata.getString("runAttempt")).put("sourceSha",metadata.getString("sourceSha")).put("implementationChecksum",D2CompiledIdentity.CHECKSUM).put("actualProductionStorageApi",true).put("productionAppEntryLoaded",false).put("actualFramework",true).put("cases",cases).put("files",new JSONObject());
            record("A01-no-startup-migration",()->{try(ReplicaDatabase db=opened("no-startup")){check(version(db)==0,"Constructor migrated");db.captureD2Snapshot();try(SQLiteDatabase raw=rawDb(db);Cursor c=raw.rawQuery("SELECT name FROM sqlite_master WHERE name=?",new String[]{MigrationRegistry.REGISTRY})){check(!c.moveToFirst(),"Registry created at startup");}}});
            record("A02-real-invoke-CAS",()->{try(ReplicaDatabase db=opened("invoke")){check(commit(db,"first").getBoolean("ok"),"Actual API write failed");JSONObject current=(JSONObject)db.invoke(new JSONObject().put("action","state"));JSONObject stale=(JSONObject)db.invoke(new JSONObject().put("action","commit").put("expected",0).put("meta",current.getJSONObject("meta")));check(!stale.getBoolean("ok"),"CAS behavior changed");check(count(db,"entities")==1&&count(db,"outbox")==1,"Storage write missing");}});
            record("A03-infrastructure-atomic-repeat",()->{try(ReplicaDatabase db=opened("migration")){commit(db,"before");JSONObject plan=request(db);String original=plan.getJSONObject("sourceSnapshot").getString("rawFingerprint");check("committed".equals(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,audit(new File(root,"migration-audit.json"),"")).getString("outcome")),"Migration not committed");check(version(db)==1&&count(db,MigrationRegistry.REGISTRY)==1&&count(db,MigrationRegistry.SNAPSHOTS)==1&&count(db,MigrationRegistry.AUDIT)==1,"Atomic infrastructure missing");try(SQLiteDatabase raw=rawDb(db)){check(original.equals(MigrationRegistry.sha(MigrationRegistry.raw(raw))),"Original data changed");}check(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null).getBoolean("repeatExecution"),"Repeat not recognized");check(count(db,MigrationRegistry.AUDIT)==1,"Repeat mutated audit");}});
            record("A04-before-commit-real-rollback",()->{try(ReplicaDatabase db=opened("rollback")){commit(db,"before");JSONObject plan=request(db);boolean rejected=false;try{db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,audit(new File(root,"rollback-first-error.json"),"snapshotStored"));}catch(Exception e){rejected=e.toString().contains("synthetic-observer");}check(rejected&&version(db)==0,"First error/rollback lost");check(plan.getJSONObject("sourceSnapshot").getString("snapshotId").equals(db.captureD2Snapshot().getString("snapshotId")),"Rollback changed source");}});
            record("A05-unknown-commit-new-handle",()->{try(ReplicaDatabase db=opened("unknown")){commit(db,"before");JSONObject plan=request(db);JSONObject uncertain=db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,audit(new File(root,"unknown-first-error.json"),"afterCommit"));check("unknownCommit".equals(uncertain.getString("outcome")),"Uncertainty not retained");check("blockedUnknown".equals(db.confirmD2Commit(plan,D2CompiledIdentity.CHECKSUM,uncertain).getString("outcome")),"Same handle accepted");db.close();db.reopen();check("committed".equals(db.confirmD2Commit(plan,D2CompiledIdentity.CHECKSUM,uncertain).getString("outcome")),"New handle did not confirm exact commit");}});
            record("A06-raw-advance-preserved",()->{try(ReplicaDatabase db=opened("advanced")){commit(db,"before");JSONObject plan=request(db);db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null);commit(db,"later");check("blockedDataAdvanced".equals(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null).getString("outcome")),"Later data not blocked");check(count(db,"entities")==2,"Later data rolled back");}});
            record("A07-target-DDL-drift",()->{try(ReplicaDatabase db=opened("drift")){JSONObject plan=request(db);db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null);try(SQLiteDatabase raw=rawDb(db)){raw.execSQL("CREATE INDEX unexpected_d2_index ON entities(id)");}check("blockedUnknown".equals(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null).getString("outcome")),"Target drift not blocked");}});
            record("A08-build-identity-refusal",()->{try(ReplicaDatabase db=opened("identity")){JSONObject plan=request(db);boolean rejected=false;try{db.migrateD2(plan,"",null);}catch(Exception expected){rejected=true;}check(rejected&&version(db)==0,"Missing identity accepted");}});
            record("A09-shared-cross-raw",()->{
                JSONObject fixture=asset("shared-fixture.json");check(sha(bytes(context.getAssets().open("shared-fixture.json"))).equals(metadata.getString("sharedFixtureSha256")),"Shared fixture build identity mismatch");check(fixture.getBoolean("syntheticOnly")&&"d2-core-raw-boundaries-v1".equals(fixture.getString("fixtureId")),"Wrong shared fixture");
                ReplicaDatabase db=opened("cross");try{check(commit(db,"api-proof").getBoolean("ok"),"Actual API proof missing");try(SQLiteDatabase raw=rawDb(db)){for(int i=0;i<fixture.getJSONArray("sql").length();i++)raw.execSQL(fixture.getJSONArray("sql").getString(i));}
                    JSONObject plan=request(db);db.close();copy(new File(db.databasePath()),new File(exports,"cross-source.sqlite"));db.reopen();check("committed".equals(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null).getString("outcome")),"Cross migration failed");db.close();copy(new File(db.databasePath()),new File(exports,"cross-target.sqlite"));write(new File(exports,"cross-source-snapshot.json"),plan.getJSONObject("sourceSnapshot").toString(2).getBytes(StandardCharsets.UTF_8));
                    report.put("sharedFixtureSha256",metadata.getString("sharedFixtureSha256"));sealFile("cross-source.sqlite");sealFile("cross-target.sqlite");
                }finally{db.close();}
            });
            record("A10-reordered-real-api",()->{File dir=directory("reordered");try(SQLiteDatabase raw=SQLiteDatabase.openOrCreateDatabase(new File(dir,"tasks.sqlite"),null)){raw.execSQL("CREATE TABLE meta(value TEXT NOT NULL,id INTEGER PRIMARY KEY CHECK(id=1))");raw.execSQL("CREATE TABLE entities(start TEXT,reminder_at INTEGER,quadrant INTEGER,done INTEGER,parent_id TEXT,conflicts TEXT NOT NULL,deleted INTEGER NOT NULL,record TEXT NOT NULL,data TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,key TEXT PRIMARY KEY)");raw.execSQL("CREATE TABLE outbox(event TEXT NOT NULL,id INTEGER PRIMARY KEY)");}try(ReplicaDatabase db=new ReplicaDatabase(dir)){check(commit(db,"reordered").getBoolean("ok"),"Explicit column write failed");JSONObject plan=request(db);check("committed".equals(db.migrateD2(plan,D2CompiledIdentity.CHECKSUM,null).getString("outcome")),"Enumerated reordered schema rejected");}});
            record("A11-real-SQL-primary-preserved",()->{try(ReplicaDatabase db=opened("sql-primary")){String before;try(SQLiteDatabase raw=rawDb(db)){before=MigrationRegistry.sha(MigrationRegistry.raw(raw));raw.execSQL("CREATE TRIGGER d2_primary_failure BEFORE INSERT ON entities BEGIN SELECT RAISE(ABORT,'d2-primary-sql-error'); END");}boolean rejected=false;try{commit(db,"rejected");}catch(Exception primary){report.put("realSqlPrimaryObservation",primary.toString());JSONArray suppressed=new JSONArray();for(Throwable ending:primary.getSuppressed())suppressed.put(ending.toString());report.put("realSqlSuppressedObservations",suppressed);rejected=primary.toString().contains("d2-primary-sql-error")||primary.toString().contains("保存任务行失败");}try(SQLiteDatabase raw=rawDb(db)){raw.execSQL("DROP TRIGGER d2_primary_failure");check(rejected&&before.equals(MigrationRegistry.sha(MigrationRegistry.raw(raw))),"Primary SQL rejection/rollback not preserved");}}});
            JSONObject audits=new JSONObject();for(String name:new String[]{"migration-audit.json","rollback-first-error.json","unknown-first-error.json"}){File original=new File(root,name);if(original.isFile()){String exported=name+"l";copy(original,new File(exports,exported));byte[] body=bytes(new FileInputStream(new File(exports,exported)));audits.put(exported,new JSONObject().put("bytes",body.length).put("sha256",sha(body)));}}report.put("externalAttemptAudits",audits);
            int passed=0;for(int i=0;i<cases.length();i++)if("passed".equals(cases.getJSONObject(i).getString("status")))passed++;
            report.put("passed",passed).put("failed",cases.length()-passed).put("status",passed==cases.length()?"passed":"failed");try(SQLiteDatabase raw=SQLiteDatabase.create(null);Cursor c=raw.rawQuery("SELECT sqlite_version()",null)){c.moveToFirst();report.put("sqliteVersion",c.getString(0));}persist();
        }catch(Exception error){try{if(report!=null){report.put("status","failed").put("firstError",error.toString());persist();}}catch(Exception writeError){error.addSuppressed(writeError);} }
        Bundle result=new Bundle();result.putString("d2Result",report==null?"guard-failed":report.toString());finish(report!=null&&"passed".equals(report.optString("status"))?-1:0,result);
    }
}
