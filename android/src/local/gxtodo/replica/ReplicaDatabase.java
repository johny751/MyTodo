package local.gxtodo.replica;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.content.ContentValues;
import org.json.*;
import java.io.File;
import java.util.*;

/** Each account owns one SQLite database. Row changes, outbox and receive cursors commit together. */
final class ReplicaDatabase {
 private final SQLiteDatabase db;
 ReplicaDatabase(File dir)throws Exception {
  db=SQLiteDatabase.openOrCreateDatabase(new File(dir,"tasks.sqlite"),null);db.enableWriteAheadLogging();db.execSQL("PRAGMA synchronous=FULL");
  db.execSQL("CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)");
  db.execSQL("CREATE TABLE IF NOT EXISTS entities(key TEXT PRIMARY KEY,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,record TEXT NOT NULL,deleted INTEGER NOT NULL,conflicts TEXT NOT NULL,parent_id TEXT,done INTEGER,quadrant INTEGER,reminder_at INTEGER,start TEXT)");
  db.execSQL("CREATE INDEX IF NOT EXISTS task_filter ON entities(kind,deleted,done,quadrant,start)");db.execSQL("CREATE INDEX IF NOT EXISTS task_reminders ON entities(kind,deleted,done,reminder_at)");db.execSQL("CREATE INDEX IF NOT EXISTS task_parent ON entities(parent_id)");db.execSQL("CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,event TEXT NOT NULL)");
  JSONObject initial=new JSONObject().put("version",2).put("revision",0).put("dataRevision",0).put("actor",UUID.randomUUID().toString()).put("seq",0).put("clock",0).put("queue",0).put("vector",new JSONObject()).put("cursors",new JSONObject()).put("initialized",false).put("scope",JSONObject.NULL).put("epoch",JSONObject.NULL).put("pending",JSONObject.NULL).put("settings",new JSONObject());
  db.execSQL("INSERT OR IGNORE INTO meta VALUES(1,?)",new Object[]{initial.toString()});
 }
 private JSONObject meta()throws Exception {try(Cursor c=db.rawQuery("SELECT value FROM meta WHERE id=1",null)){if(!c.moveToFirst())throw new Exception("数据库缺少元信息");return new JSONObject(c.getString(0));}}
 synchronized boolean initialized()throws Exception{return meta().optBoolean("initialized");}
 private JSONObject row(Cursor c)throws Exception{return new JSONObject().put("key",c.getString(c.getColumnIndexOrThrow("key"))).put("data",new JSONObject(c.getString(c.getColumnIndexOrThrow("data")))).put("record",new JSONObject(c.getString(c.getColumnIndexOrThrow("record")))).put("deleted",c.getInt(c.getColumnIndexOrThrow("deleted"))!=0).put("conflicts",new JSONArray(c.getString(c.getColumnIndexOrThrow("conflicts"))));}
 synchronized Object invoke(JSONObject input)throws Exception {
  String action=input.getString("action");JSONObject current=meta();
  if(action.equals("inspect")){JSONArray rows=new JSONArray(),keys=input.optJSONArray("keys");if(keys!=null)for(int i=0;i<keys.length();i++)try(Cursor c=db.rawQuery("SELECT * FROM entities WHERE key=?",new String[]{keys.getString(i)})){if(c.moveToFirst())rows.put(row(c));}return new JSONObject().put("meta",current).put("rows",rows);}
  if(action.equals("state")){JSONArray rows=new JSONArray();try(Cursor c=db.rawQuery("SELECT key,data FROM entities WHERE deleted=0",null)){while(c.moveToNext())rows.put(new JSONObject().put("key",c.getString(0)).put("data",new JSONObject(c.getString(1))).put("deleted",false));}return new JSONObject().put("meta",current).put("rows",rows);}
  if(action.equals("page")){JSONArray rows=new JSONArray();try(Cursor c=db.rawQuery("SELECT * FROM entities WHERE key>? ORDER BY key LIMIT ?",new String[]{input.optString("after"),String.valueOf(Math.min(500,input.optInt("limit",100)))})){while(c.moveToNext())rows.put(row(c));}return new JSONObject().put("meta",current).put("rows",rows);}
  if(action.equals("conflicts")){JSONArray out=new JSONArray();try(Cursor c=db.rawQuery("SELECT conflicts FROM entities WHERE conflicts!='[]' ORDER BY key LIMIT 200",null)){while(c.moveToNext()){JSONArray a=new JSONArray(c.getString(0));for(int i=0;i<a.length();i++)out.put(a.get(i));}}return out;}
  if(action.equals("outbox")){JSONArray entries=new JSONArray();try(Cursor c=db.rawQuery("SELECT id,event FROM outbox ORDER BY id LIMIT ?",new String[]{String.valueOf(Math.min(500,input.optInt("limit",100)))})){while(c.moveToNext())entries.put(new JSONObject().put("id",c.getLong(0)).put("event",new JSONObject(c.getString(1))));}return new JSONObject().put("meta",current).put("entries",entries);}
  if(!action.equals("commit"))throw new Exception("不支持的数据库操作");
  db.beginTransaction();try{
   current=meta();if(current.getLong("revision")!=input.getLong("expected"))return new JSONObject().put("ok",false);JSONObject next=input.getJSONObject("meta");if(next.getInt("version")!=2||!next.getString("actor").equals(current.getString("actor")))throw new Exception("数据库设备标识不匹配");
   JSONArray rows=input.optJSONArray("rows");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i),data=r.getJSONObject("data");JSONArray key=new JSONArray(r.getString("key"));ContentValues v=new ContentValues();v.put("key",r.getString("key"));v.put("kind",key.getString(0));v.put("id",key.getString(1));v.put("data",data.toString());v.put("record",r.getJSONObject("record").toString());v.put("deleted",r.optBoolean("deleted")?1:0);v.put("conflicts",r.optJSONArray("conflicts")==null?"[]":r.getJSONArray("conflicts").toString());v.put("parent_id",data.isNull("parentId")?null:data.optString("parentId",null));v.put("done",data.optBoolean("done")?1:0);v.put("quadrant",data.optInt("quadrant",0));v.put("reminder_at",data.isNull("reminderAt")?null:data.optLong("reminderAt"));v.put("start",data.optString("start"));if(db.insertWithOnConflict("entities",null,v,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new Exception("保存任务行失败");}
   if(input.optBoolean("clearOutbox"))db.delete("outbox",null,null);if(input.has("ack"))db.delete("outbox","id<=?",new String[]{String.valueOf(input.getLong("ack"))});JSONArray outbox=input.optJSONArray("outbox");if(outbox!=null)for(int i=0;i<outbox.length();i++){JSONObject e=outbox.getJSONObject(i);db.execSQL("INSERT INTO outbox VALUES(?,?)",new Object[]{e.getLong("id"),e.getJSONObject("event").toString()});}
   long revision=current.getLong("revision")+1;next.put("revision",revision).put("dataRevision",current.optLong("dataRevision",0)+(rows!=null&&rows.length()>0?1:0));db.execSQL("UPDATE meta SET value=? WHERE id=1",new Object[]{next.toString()});db.setTransactionSuccessful();return new JSONObject().put("ok",true).put("revision",revision);
  }finally{db.endTransaction();}
 }
 synchronized JSONArray tasks(boolean remindersOnly)throws Exception {JSONArray out=new JSONArray();String where=remindersOnly?" AND done=0 AND reminder_at>0":"";try(Cursor c=db.rawQuery("SELECT data FROM entities WHERE kind='tasks' AND deleted=0"+where,null)){while(c.moveToNext())out.put(new JSONObject(c.getString(0)));}return out;}


 /** Stream task candidates and stop after one lookahead row; SQLite 8 has no JSON extraction. */
 synchronized JSONObject searchPomodoroTasks(String query,int limit)throws Exception {
  int maximum=Math.max(1,Math.min(100,limit));String needle=(query==null?"":query.trim()).toLowerCase(Locale.ROOT);
  JSONArray selected=new JSONArray();
  try(Cursor cursor=db.rawQuery("SELECT data FROM entities WHERE kind='tasks' AND deleted=0 ORDER BY done,start,id",null)){
   while(cursor.moveToNext()&&selected.length()<=maximum){
    JSONObject task=new JSONObject(cursor.getString(0));
    if(!task.optString("title","").toLowerCase(Locale.ROOT).contains(needle))continue;
    selected.put(PomodoroTasks.taskRecord(task,""));
   }
  }
  boolean more=selected.length()>maximum;if(more)selected.remove(selected.length()-1);
  return new JSONObject().put("tasks",selected).put("hasMore",more);
 }
 synchronized JSONObject resolvePomodoroTask(String taskId)throws Exception {
  try(Cursor cursor=db.rawQuery("SELECT data FROM entities WHERE kind='tasks' AND id=? AND deleted=0 LIMIT 1",new String[]{taskId})){
   return cursor.moveToFirst()?PomodoroTasks.taskRecord(new JSONObject(cursor.getString(0)),""):null;
  }
 }

 /** Daily candidates are streamed; Android 8 SQLite need not support JSON functions. */
 synchronized JSONObject dailySummary(String today)throws Exception {
  DailyTaskPolicy policy=new DailyTaskPolicy(today);DailyTaskPolicy.Counts counts=new DailyTaskPolicy.Counts();
  try(Cursor cursor=db.rawQuery("SELECT done,start,data FROM entities WHERE kind='tasks' AND deleted=0 AND (done=1 OR start IS NULL OR start='' OR start<?)",new String[]{policy.tomorrow()})){
   while(cursor.moveToNext()){
    JSONObject task=new JSONObject(cursor.getString(2)),repeat=task.optJSONObject("repeat");
    counts.add(policy.evaluate(cursor.getInt(0)!=0,false,cursor.getString(1),repeat==null?"":repeat.optString("until",""),task.optString("completedAt","")));
   }
  }
  return new JSONObject().put("pending",counts.pending).put("completed",counts.completed).put("overdue",counts.overdue);
 }
 synchronized JSONObject widgetData()throws Exception {JSONArray counts=new JSONArray(),items=new JSONArray();for(int q=0;q<4;q++){try(Cursor c=db.rawQuery("SELECT COUNT(*) FROM entities WHERE kind='tasks' AND deleted=0 AND done=0 AND quadrant=?",new String[]{String.valueOf(q)})){c.moveToFirst();counts.put(c.getInt(0));}try(Cursor c=db.rawQuery("SELECT data FROM entities WHERE kind='tasks' AND deleted=0 AND done=0 AND quadrant=? ORDER BY start,id LIMIT 3",new String[]{String.valueOf(q)})){while(c.moveToNext())items.put(new JSONObject(c.getString(0)));}}return new JSONObject().put("counts",counts).put("items",items);}
 synchronized String stateJSON()throws Exception {
  JSONObject result=new JSONObject().put("version",2).put("settings",meta().getJSONObject("settings"));for(String kind:Arrays.asList("tasks","notes","projects","tags","places"))result.put(kind,new JSONArray());
  Map<String,JSONObject> tasks=new LinkedHashMap<>();try(Cursor c=db.rawQuery("SELECT kind,data FROM entities WHERE deleted=0 ORDER BY key",null)){while(c.moveToNext()){String kind=c.getString(0);JSONObject data=new JSONObject(c.getString(1));if(kind.equals("tasks")){data.put("subtasks",new JSONArray());tasks.put(data.getString("id"),data);}else result.getJSONArray(kind).put(kind.equals("tags")||kind.equals("places")?data.getString("name"):data);}}
  for(JSONObject task:tasks.values()){JSONObject parent=tasks.get(task.optString("parentId")),cursor=parent;Set<String> seen=new HashSet<>();seen.add(task.getString("id"));int depth=0;while(cursor!=null){if(!seen.add(cursor.getString("id"))||++depth>64){parent=null;break;}cursor=tasks.get(cursor.optString("parentId"));}if(parent==null)result.getJSONArray("tasks").put(task);else parent.getJSONArray("subtasks").put(task);}
  for(JSONObject task:tasks.values())task.remove("parentId");return result.toString();
 }
}
