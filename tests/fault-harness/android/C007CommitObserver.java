package local.gxtodo.replica;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Test-copy observation point only. Original production commit SQL/order stay intact. */
final class C007CommitObserver {
    private static JSONObject active;
    private static File output;
    static void arm(JSONObject spec, File result) { active=spec;output=result; }
    static void disarm() { active=null;output=null; }
    static void beforeCommit(JSONObject transaction, SQLiteDatabase db) throws Exception {
        if(active==null || !active.optString("exitAt").equals("before-commit"))return;
        if(!db.inTransaction())throw new IllegalStateException("C007 marker requires the real transaction to remain open");
        JSONObject uncommitted=new JSONObject();
        try(Cursor cursor=db.rawQuery("SELECT value FROM meta WHERE id=1",null)) {
            if(!cursor.moveToFirst())throw new IOException("Missing real metadata before commit");
            uncommitted.put("meta",new JSONObject(cursor.getString(0)));
        }
        JSONArray rows=new JSONArray(),outbox=new JSONArray();
        try(Cursor cursor=db.rawQuery("SELECT key,data,record,deleted,conflicts FROM entities ORDER BY key",null)) {
            while(cursor.moveToNext())rows.put(new JSONObject().put("key",cursor.getString(0))
                .put("data",new JSONObject(cursor.getString(1))).put("record",new JSONObject(cursor.getString(2)))
                .put("deleted",cursor.getInt(3)!=0).put("conflicts",new JSONArray(cursor.getString(4))));
        }
        try(Cursor cursor=db.rawQuery("SELECT id,event FROM outbox ORDER BY id",null)) {
            while(cursor.moveToNext())outbox.put(new JSONObject().put("id",cursor.getLong(0)).put("event",new JSONObject(cursor.getString(1))));
        }
        uncommitted.put("rows",rows).put("outbox",outbox);
        JSONObject marker=new JSONObject().put("boundary","before-real-sqlite-commit")
            .put("processId",android.os.Process.myPid()).put("sourceSha",active.getString("sourceSha"))
            .put("caseId",active.getString("caseId")).put("attemptId",active.getString("attemptId"))
            .put("dbCase",active.getString("dbCase")).put("databaseFile",new File(db.getPath()).getCanonicalPath())
            .put("transactionSuccessfulMarked",true).put("inTransaction",true)
            .put("ackThrough",transaction.has("ack")?transaction.getLong("ack"):JSONObject.NULL)
            .put("uncommitted",uncommitted);
        File target=new File(output.getParentFile(),output.getName()+".before-commit.json");
        if(!target.createNewFile())throw new IOException("Refusing to overwrite C007 commit marker");
        try(FileOutputStream stream=new FileOutputStream(target,false)) {
            stream.write(marker.toString().getBytes(StandardCharsets.UTF_8));stream.getFD().sync();
        }
        // Executed in finally after setTransactionSuccessful returned, before endTransaction.
        // No Java finally block can subsequently commit because this process is terminated.
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(86);
    }
}
