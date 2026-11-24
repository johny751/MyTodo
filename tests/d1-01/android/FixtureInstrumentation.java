package local.mytodo.d1fixture;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** No production classes, assets, AAR, WebView, Activity, credentials or network. */
public final class FixtureInstrumentation extends Instrumentation {
  private static final String GUARD="MYTODO_D1_SYNTHETIC_ONLY";
  private static final String CANDIDATE="d1-01-candidate.1";
  private static final String FIXTURE="synthetic-fixed-v1";
  private static final String[] CORE_DDL={
    "CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL)",
    "CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)",
    "CREATE TABLE entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)",
    "CREATE INDEX task_filter ON entities(kind,deleted,done,quadrant,start)",
    "CREATE INDEX task_reminders ON entities(kind,deleted,done,reminder_at)",
    "CREATE INDEX task_parent ON entities(parent_id)",
    "CREATE TABLE outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)"
  };
  private Bundle args;
  private File namespace;
  private final JSONObject receipt=new JSONObject();

  @Override public void onCreate(Bundle arguments) {super.onCreate(arguments);args=arguments;start();}

  private static byte[] bytes(InputStream stream)throws Exception {
    try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()) {
      byte[] block=new byte[8192];int n;int total=0;
      while((n=in.read(block))!=-1){total+=n;if(total>8*1024*1024)throw new Exception("BLOCKER: input size limit");out.write(block,0,n);}
      return out.toByteArray();
    }
  }
  private static String digest(byte[] data)throws Exception {
    StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();
  }
  private static Object nullable(Object value){return value==null?JSONObject.NULL:value;}
  private static void freshWrite(File file,byte[] content)throws Exception {
    if(!file.createNewFile())throw new Exception("BLOCKER: refuse existing file "+file.getName());
    try(FileOutputStream out=new FileOutputStream(file)){out.write(content);out.getFD().sync();}
  }
  private File file(String name)throws Exception {
    if(namespace==null||!name.matches("[a-z0-9.-]+"))throw new Exception("BLOCKER: bad private fixture path");
    File candidate=new File(namespace,name);
    if(!candidate.getCanonicalFile().getParentFile().equals(namespace.getCanonicalFile()))throw new Exception("BLOCKER: private path escape");
    if(candidate.exists())throw new Exception("BLOCKER: refuse pre-existing candidate "+name);
    return candidate;
  }
  private SQLiteDatabase open(File target)throws Exception {
    if(target.exists())throw new Exception("BLOCKER: database must be fresh");
    SQLiteDatabase db=SQLiteDatabase.openOrCreateDatabase(target,null);
    db.enableWriteAheadLogging();db.execSQL("PRAGMA synchronous=FULL");return db;
  }
  private static long count(SQLiteDatabase db,String table) {
    try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM "+table,null)){c.moveToFirst();return c.getLong(0);}
  }
  private static JSONObject describeDb(SQLiteDatabase db)throws Exception {
    JSONObject value=new JSONObject();
    try(Cursor c=db.rawQuery("SELECT sqlite_version()",null)){c.moveToFirst();value.put("sqliteVersion",c.getString(0));}
    try(Cursor c=db.rawQuery("PRAGMA integrity_check",null)){JSONArray errors=new JSONArray();while(c.moveToNext())errors.put(c.getString(0));value.put("integrityCheck",errors);if(errors.length()!=1||!"ok".equals(errors.getString(0)))throw new Exception("BLOCKER: SQLite integrity failure");}
    try(Cursor c=db.rawQuery("PRAGMA user_version",null)){c.moveToFirst();value.put("userVersion",c.getInt(0));}
    return value;
  }
  private JSONObject observe(JSONObject data,String field)throws Exception {
    Object value=data.opt(field);String type;
    if(!data.has(field))type="missing";
    else if(value==JSONObject.NULL)type="json-null";
    else if(value instanceof String)type="string";
    else if(value instanceof Boolean)type="boolean";
    else if(value instanceof Number)type="number";
    else if(value instanceof JSONArray)type="array";
    else if(value instanceof JSONObject)type="object";
    else type="unknown";
    return new JSONObject().put("presence",data.has(field)).put("isNull",data.isNull(field))
      .put("jsonType",type).put("javaClass",value==null?JSONObject.NULL:value.getClass().getName())
      .put("optStringNullDefault",nullable(data.optString(field,null)))
      .put("optIntDefault0",data.optInt(field,0)).put("optLongDefault0",data.optLong(field,0L))
      .put("optBooleanDefaultFalse",data.optBoolean(field,false));
  }
  private void core(JSONObject input)throws Exception {
    File target=file("android-source.sqlite");JSONArray observations=new JSONArray();SQLiteDatabase db=open(target);
    try {
      for(String sql:CORE_DDL)db.execSQL(sql);
      db.beginTransaction();try {
        db.execSQL("INSERT INTO d1_synthetic_guard(token,fixture_id) VALUES(?,?)",new Object[]{GUARD,FIXTURE});
        // The original TEXT payloads are bound directly, never parsed and reserialized.
        db.execSQL("INSERT INTO meta(id,value) VALUES(1,?)",new Object[]{input.getString("meta")});
        JSONArray rows=input.getJSONArray("rows");if(rows.length()>1000)throw new Exception("BLOCKER: row limit");
        for(int i=0;i<rows.length();i++) {
          JSONObject row=rows.getJSONObject(i);String original=row.getString("data");JSONObject data=new JSONObject(original);
          ContentValues values=new ContentValues();
          values.put("key",row.getString("key"));values.put("kind",row.getString("kind"));values.put("id",row.getString("id"));
          values.put("data",original);values.put("record",row.getString("record"));values.put("deleted",row.getInt("deleted"));values.put("conflicts",row.getString("conflicts"));
          // Reproduce only the observed current Android framework projection calls from A.
          // This independent fixture does not load or exercise ReplicaDatabase itself.
          values.put("parent_id",data.isNull("parentId")?null:data.optString("parentId",null));
          values.put("done",data.optBoolean("done")?1:0);values.put("quadrant",data.optInt("quadrant",0));
          if(data.isNull("reminderAt"))values.putNull("reminder_at");else values.put("reminder_at",data.optLong("reminderAt"));
          values.put("start",data.optString("start"));
          if(db.insertOrThrow("entities",null,values)<0)throw new Exception("BLOCKER: failed insert");
          JSONObject item=new JSONObject().put("key",row.getString("key")).put("originalDataSha256",digest(original.getBytes(StandardCharsets.UTF_8)));
          for(String field:new String[]{"parentId","quadrant","reminderAt","done","start"})item.put(field,observe(data,field));
          observations.put(item);
        }
        JSONArray outbox=input.getJSONArray("outbox");
        for(int i=0;i<outbox.length();i++){JSONObject row=outbox.getJSONObject(i);db.execSQL("INSERT INTO outbox(id,event) VALUES(?,?)",new Object[]{row.getLong("id"),row.getString("event")});}
        db.setTransactionSuccessful();
      } finally {db.endTransaction();}
      JSONObject result=describeDb(db).put("rowsCount",count(db,"entities")).put("outboxCount",count(db,"outbox"))
        .put("observations",observations).put("originalMetaSha256",digest(input.getString("meta").getBytes(StandardCharsets.UTF_8)))
        .put("path",target.getCanonicalPath()).put("rawTextPreserved",true);
      receipt.put("core",result).put("sqliteVersion",result.getString("sqliteVersion"))
        .put("rowsCount",result.getLong("rowsCount")).put("outboxCount",result.getLong("outboxCount"));
    } finally {db.close();}
    seal(target);
  }
  private static final String[] FEEDBACK_DDL={
    "CREATE TABLE d1_synthetic_guard(token TEXT NOT NULL,fixture_id TEXT NOT NULL)",
    "CREATE TABLE records(bucket TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,state TEXT NOT NULL,search TEXT NOT NULL,deleted INTEGER NOT NULL,number INTEGER,PRIMARY KEY(bucket,id))",
    "CREATE TABLE assets(id TEXT PRIMARY KEY NOT NULL,file_name TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL)",
    "CREATE TABLE links(bucket TEXT NOT NULL,record_id TEXT NOT NULL,asset_id TEXT NOT NULL,PRIMARY KEY(bucket,record_id,asset_id),FOREIGN KEY(bucket,record_id) REFERENCES records(bucket,id) ON DELETE CASCADE,FOREIGN KEY(asset_id) REFERENCES assets(id))",
    "CREATE TABLE settings(key TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL)",
    "CREATE INDEX feedback_order ON records(bucket,deleted,updated_at DESC,id)",
    "CREATE INDEX feedback_status_order ON records(bucket,deleted,state,updated_at DESC,id)",
    "CREATE UNIQUE INDEX feedback_note_numbers ON records(number) WHERE bucket='notes'",
    "CREATE INDEX feedback_asset_refs ON links(asset_id)"
  };
  private void feedback(boolean validation,byte[] image)throws Exception {
    File target=file(validation?"feedback-validation.sqlite":"feedback-source.sqlite");SQLiteDatabase db=open(target);
    String note="{\"id\":\"synthetic-note\",\"number\":1,\"createdAt\":0,\"updatedAt\":1,\"revision\":1,\"body\":\"synthetic feedback\",\"category\":null,\"status\":\"pending\",\"assetIds\":[\"synthetic-image\"],\"deletedAt\":null,\"deleteToken\":null}";
    String draft="{\"id\":\"synthetic-draft\",\"targetId\":\"synthetic-note\",\"baseRevision\":1,\"isNew\":false,\"createdAt\":0,\"updatedAt\":1,\"revision\":1,\"note\":"+note+",\"assetIds\":[\"synthetic-image\"],\"inheritedAssetIds\":[\"synthetic-image\"]}";
    String meta="{\"id\":\"feedback_sequence\",\"nextNumber\":2,\"createdAt\":0,\"updatedAt\":1,\"revision\":1}";
    try {
      db.execSQL("PRAGMA foreign_keys=ON");for(String sql:FEEDBACK_DDL)db.execSQL(sql);
      if(validation)db.execSQL("CREATE TABLE archive_entries(name TEXT PRIMARY KEY NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL)");
      db.beginTransaction();try {
        db.execSQL("INSERT INTO d1_synthetic_guard(token,fixture_id) VALUES(?,?)",new Object[]{GUARD,FIXTURE});
        db.execSQL("INSERT INTO settings(key,value) VALUES('restore_generation',0)");
        db.execSQL("INSERT INTO assets(id,file_name,mime,size,sha256,width,height) VALUES(?,?,?,?,?,?,?)",new Object[]{"synthetic-image","feedback-original.png","image/png",image.length,digest(image),1,1});
        db.execSQL("INSERT INTO records(bucket,id,payload,updated_at,state,search,deleted,number) VALUES(?,?,?,?,?,?,?,?)",new Object[]{"notes","synthetic-note",note,1,"pending","synthetic feedback",0,1});
        db.execSQL("INSERT INTO records(bucket,id,payload,updated_at,state,search,deleted,number) VALUES(?,?,?,?,?,?,?,?)",new Object[]{"drafts","synthetic-draft",draft,1,"","",0,null});
        db.execSQL("INSERT INTO records(bucket,id,payload,updated_at,state,search,deleted,number) VALUES(?,?,?,?,?,?,?,?)",new Object[]{"meta","feedback_sequence",meta,1,"","",0,null});
        for(String bucket:new String[]{"notes","drafts"})db.execSQL("INSERT INTO links(bucket,record_id,asset_id) VALUES(?,?,?)",new Object[]{bucket,bucket.equals("notes")?"synthetic-note":"synthetic-draft","synthetic-image"});
        if(validation)db.execSQL("INSERT INTO archive_entries(name,size,sha256) VALUES(?,?,?)",new Object[]{"images/feedback-original.png",image.length,digest(image)});
        db.setTransactionSuccessful();
      } finally {db.endTransaction();}
      try(Cursor c=db.rawQuery("PRAGMA foreign_key_check",null)){if(c.moveToFirst())throw new Exception("BLOCKER: feedback foreign key failure");}
      receipt.put(validation?"feedbackValidation":"feedbackSource",describeDb(db).put("recordsCount",count(db,"records"))
        .put("assetsCount",count(db,"assets")).put("restoreGeneration",0).put("actualFeedbackAarLoaded",false)
        .put("role",validation?"independent synthetic validation-store DDL fixture":"independent synthetic persistent-store DDL fixture")
        .put("rawPayloads",new JSONObject().put("note",note).put("draft",draft).put("metaBucket",meta)));
    } finally {db.close();}
    seal(target);
  }
  private void seal(File target)throws Exception {
    JSONArray sidecars=new JSONArray();
    for(String suffix:new String[]{"-wal","-shm","-journal"}) {
      File sidecar=new File(target.getPath()+suffix);sidecars.put(new JSONObject().put("name",sidecar.getName()).put("exists",sidecar.exists()).put("bytes",sidecar.exists()?sidecar.length():0));
      if(sidecar.exists()&&sidecar.length()!=0)throw new Exception("BLOCKER: nonempty sidecar after all writers closed");
    }
    byte[] data=bytes(new FileInputStream(target));
    if(data.length<100||!new String(data,0,16,StandardCharsets.US_ASCII).equals("SQLite format 3\u0000"))throw new Exception("BLOCKER: invalid SQLite header");
    JSONObject output=new JSONObject().put("path",target.getCanonicalPath()).put("bytes",data.length).put("sha256",digest(data))
      .put("writersClosed",true).put("sidecars",sidecars).put("snapshotMethod","fresh independent fixture; all SQLite handles closed before capture");
    JSONObject files=receipt.optJSONObject("files");if(files==null){files=new JSONObject();receipt.put("files",files);}files.put(target.getName(),output);
  }
  @Override public void onStart() {
    int result=Activity.RESULT_CANCELED;Bundle status=new Bundle();
    try {
      receipt.put("schema","mytodo-d1-android-generator").put("version",1).put("candidate",CANDIDATE).put("guard",GUARD)
        .put("synthetic",true).put("actualFramework",true).put("actualProductionEntryLoaded",false)
        .put("pid",android.os.Process.myPid()).put("androidApi",Build.VERSION.SDK_INT).put("fingerprint",Build.FINGERPRINT);
      Context context=getTargetContext();
      if(!"local.mytodo.d1fixture".equals(context.getPackageName()))throw new Exception("BLOCKER: wrong isolated package");
      byte[] asset=bytes(context.getAssets().open("fixture.json"));JSONObject input=new JSONObject(new String(asset,StandardCharsets.UTF_8));
      JSONObject metadata=new JSONObject(new String(bytes(context.getAssets().open("build-metadata.json")),StandardCharsets.UTF_8));
      String run=args==null?null:args.getString("runId");
      if(run==null||!run.matches("[0-9]+")||!run.equals(input.getString("runId"))||!run.equals(metadata.getString("runId"))
          ||!GUARD.equals(args.getString("guard"))||!input.getBoolean("synthetic")||!GUARD.equals(input.getString("guard"))
          ||!CANDIDATE.equals(input.getString("candidate"))||!FIXTURE.equals(input.getString("fixtureId"))
          ||!GUARD.equals(metadata.getString("guard"))||!"independent-synthetic".equals(metadata.getString("purpose"))
          ||!CANDIDATE.equals(metadata.getString("candidate"))||!digest(asset).equals(metadata.getString("fixtureSha256")))
        throw new Exception("BLOCKER: asset/run/guard identity mismatch");
      receipt.put("runId",run).put("fixtureId",FIXTURE).put("fixtureSha256",digest(asset)).put("buildMetadata",metadata);
      File files=context.getFilesDir().getCanonicalFile();File fresh=new File(files,"d1-fixtures");
      if(fresh.exists()||!fresh.mkdir()||!fresh.getCanonicalFile().getParentFile().equals(files))throw new Exception("BLOCKER: fixture namespace must be fresh and private");
      namespace=fresh.getCanonicalFile();
      freshWrite(file("d1-synthetic.json"),new JSONObject().put("guard",GUARD).put("runId",run).put("candidate",CANDIDATE).put("fixtureId",FIXTURE).toString().getBytes(StandardCharsets.UTF_8));
      core(input);
      // A fixed generated original, never a screenshot/thumbnail or user's image.
      byte[] image=android.util.Base64.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cP9sAAAAASUVORK5CYII=",android.util.Base64.DEFAULT);
      freshWrite(file("feedback-original.png"),image);
      receipt.put("feedbackOriginal",new JSONObject().put("name","feedback-original.png").put("bytes",image.length).put("sha256",digest(image)).put("synthetic",true));
      feedback(false,image);feedback(true,image);
      receipt.put("status","passed");result=Activity.RESULT_OK;
    } catch(Throwable error) {
      try{receipt.put("status","failed").put("firstError",error.toString());java.io.StringWriter s=new java.io.StringWriter();error.printStackTrace(new java.io.PrintWriter(s));receipt.put("stack",s.toString());}catch(Exception ignored){}
    } finally {
      try {
        receipt.put("completedAtUtc",java.time.Instant.now().toString());
        if(namespace!=null)freshWrite(new File(namespace,"android-generator-receipt.json"),(receipt.toString(2)+"\n").getBytes(StandardCharsets.UTF_8));
        status.putString("status",receipt.optString("status","failed"));status.putString("receipt",receipt.toString());
      } catch(Throwable error){status.putString("collectionError",error.toString());result=Activity.RESULT_CANCELED;}
      finish(result,status);
    }
  }
}
