package local.gxtodo.replica;

import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import org.json.*;
import java.io.File;
import java.lang.reflect.Field;

public final class FocusInstrumentedTest extends Instrumentation {
    private int assertions;
    private void check(boolean value,String message) { assertions++; if(!value)throw new AssertionError(message); }
    private void resetSingleton(Class<?> type) throws Exception { Field field=type.getDeclaredField("instance");field.setAccessible(true);field.set(null,null); }
    private JSONObject task(String id,String title,boolean done) throws Exception {
        return new JSONObject().put("id",id).put("title",title).put("done",done).put("subtasks",new JSONArray());
    }
    private JSONObject row(JSONObject task,boolean deleted) throws Exception {
        return new JSONObject().put("key",new JSONArray().put("tasks").put(task.getString("id")).toString())
            .put("data",task).put("record",new JSONObject()).put("deleted",deleted).put("conflicts",new JSONArray());
    }
    private void commit(ReplicaDatabase db,JSONArray rows) throws Exception {
        JSONObject meta=((JSONObject)db.invoke(new JSONObject().put("action","inspect"))).getJSONObject("meta");
        long expected=meta.getLong("revision");meta.put("initialized",true);
        check(((JSONObject)db.invoke(new JSONObject().put("action","commit").put("expected",expected).put("meta",meta).put("rows",rows))).getBoolean("ok"),"fixture commit");
    }
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments);start(); }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            final Context base=getTargetContext();
            final String prefix="focus091-test-"+System.currentTimeMillis()+"-";
            final File dir=new File(base.getCacheDir(),prefix);check(dir.mkdirs(),"isolated fixture directory");
            Context isolated=new ContextWrapper(base) {
                @Override public Context getApplicationContext(){return this;}
                @Override public File getFilesDir(){return dir;}
                @Override public SharedPreferences getSharedPreferences(String name,int mode){return base.getSharedPreferences(prefix+name,mode);}
            };
            resetSingleton(AccountStore.class);resetSingleton(PomodoroTimer.class);
            AccountStore store=AccountStore.get(isolated);
            JSONObject parent=task("parent","Plan Root",false).put("parentId",JSONObject.NULL),child=task("child","中文 Focus 100% 'quote'",false),done=task("done","Completed",true),deleted=task("deleted","Hidden",false).put("deleted",true);
            parent.getJSONArray("subtasks").put(child);
            JSONObject legacy=new JSONObject().put("version",2).put("settings",new JSONObject()).put("tasks",new JSONArray().put(parent).put(done).put(deleted));
            for(String name:new String[]{"notes","projects","tags","places"})legacy.put(name,new JSONArray());
            store.write("default",legacy.toString());
            JSONObject found=PomodoroTasks.search(isolated,"",100);
            check(found.getJSONArray("tasks").length()==3,"legacy deleted excluded");
            check(found.getString("accountId").equals("default"),"captured account");
            check(PomodoroTasks.search(isolated,"focus 100% 'QUOTE'",100).getJSONArray("tasks").getJSONObject(0).getString("id").equals("child"),"case and literal query");
            check(PomodoroTasks.search(isolated,"",1).optBoolean("hasMore"),"legacy lookahead");
            JSONObject link=PomodoroTasks.resolve(isolated,"default","child");
            check(link.getString("parentId").equals("parent"),"legacy nested task");
            check(PomodoroTasks.resolve(isolated,"default","parent").isNull("parentId"),"root parent null");
            check(PomodoroTasks.resolve(isolated,"default","deleted")==null,"deleted cannot resolve");
            PomodoroTimer.setTaskFromSelection(isolated,"default","child");
            PomodoroTimer timer=PomodoroTimer.get(isolated);
            check(timer.snapshot().getJSONObject("task").getString("id").equals("child"),"selected link");
            timer.startCountup();timer.pause();
            check(timer.hasActiveSession(),"immediate pause retains session");
            check(!timer.snapshot().getBoolean("running"),"paused");
            JSONObject copy=timer.snapshot().getJSONObject("task");copy.put("title","Mutated");
            check(!timer.snapshot().getJSONObject("task").getString("title").equals("Mutated"),"snapshot cannot mutate association");
            long paused=timer.snapshot().getLong("elapsedMillis");
            resetSingleton(PomodoroTimer.class);timer=PomodoroTimer.get(isolated);
            check(timer.hasActiveSession(),"paused restored");
            check(timer.snapshot().getLong("elapsedMillis")==paused,"paused time restored");
            check(timer.snapshot().getJSONObject("task").getString("id").equals("child"),"association restored");
            timer.resume();check(timer.snapshot().getBoolean("running"),"resume");
            timer.pause();timer.reset();check(!timer.hasActiveSession(),"reset session");
            check(timer.snapshot().getJSONObject("task").getString("id").equals("child"),"reset retains selection");
            PomodoroTimer.setTaskFromSelection(isolated,"default",null);check(timer.snapshot().isNull("task"),"clear association");
            SharedPreferences prefs=isolated.getSharedPreferences("android-tools",0);
            JSONObject old=new JSONObject(prefs.getString("timer.state","{}")).put("version",1).put("elapsedMillis",1234);
            old.remove("task");old.remove("sessionActive");prefs.edit().putString("timer.state",old.toString()).commit();
            resetSingleton(PomodoroTimer.class);timer=PomodoroTimer.get(isolated);
            check(timer.hasActiveSession(),"0.9.0 paused upgrade");
            check(timer.snapshot().getLong("elapsedMillis")==1234,"upgrade elapsed");
            check(timer.snapshot().isNull("task"),"upgrade independent timer");
            timer.reset();
            ReplicaDatabase db=store.database("default");JSONArray rows=new JSONArray();
            for(int i=0;i<205;i++)rows.put(row(task(String.format("batch-%03d",i),"Batch "+i,false),false));
            child.put("parentId","parent");
            rows.put(row(parent,false)).put(row(child,false)).put(row(done,false)).put(row(deleted,true));
            commit(db,rows);
            found=PomodoroTasks.search(isolated,"",500);
            check(found.getJSONArray("tasks").length()==100,"SQLite limit clamp");
            check(found.getBoolean("hasMore"),"SQLite lookahead");
            check(PomodoroTasks.search(isolated,"",0).getJSONArray("tasks").length()==1,"minimum limit");
            check(PomodoroTasks.search(isolated,"focus 100% 'QUOTE'",100).getJSONArray("tasks").getJSONObject(0).getString("id").equals("child"),"SQLite literal query");
            check(PomodoroTasks.search(isolated,"unknown",100).getJSONArray("tasks").length()==0,"SQLite unmatched");
            check(PomodoroTasks.resolve(isolated,"default","child").getString("parentId").equals("parent"),"SQLite nested task");
            check(PomodoroTasks.resolve(isolated,"default","parent").isNull("parentId"),"SQLite root null");
            check(PomodoroTasks.resolve(isolated,"default","deleted")==null,"SQLite deletion");
            check(PomodoroTasks.resolve(isolated,"default","child' OR 1=1 --")==null,"ID parameterized");
            PomodoroTimer.setTaskFromSelection(isolated,"default","done");
            check(timer.snapshot().getJSONObject("task").getBoolean("done"),"completed task selectable");
            timer.startCountup();timer.pause();
            check(PomodoroTasks.resolve(isolated,"default","done").getBoolean("done"),"timer does not change task completion");
            PomodoroTimer.setTaskFromSelection(isolated,"default","child");
            commit(db,new JSONArray().put(row(child,true)));
            boolean rejected=false;try{PomodoroTimer.setTaskFromSelection(isolated,"default","child");}catch(IllegalStateException expected){rejected=true;}
            check(rejected,"deleted selection rejected");
            check(timer.hasActiveSession(),"deleted association does not stop timer");
            check(timer.snapshot().getJSONObject("task").getString("title").equals(child.getString("title")),"historical label retained");
            store.manage(new JSONObject().put("op","activate").put("id","account-b"));
            rejected=false;try{PomodoroTimer.setTaskFromSelection(isolated,"default","done");}catch(IllegalStateException expected){rejected=true;}
            check(rejected,"old account picker rejected");
            check(PomodoroTasks.search(isolated,"",100).getString("accountId").equals("account-b"),"new account search");
            check(timer.snapshot().getJSONObject("task").getString("accountId").equals("default"),"timer keeps source account");
            check(PomodoroTasks.resolve(isolated,"default","done").getString("accountId").equals("default"),"resolve original account after switch");
            PomodoroTimer.setTaskFromSelection(isolated,"account-b",null);check(timer.snapshot().isNull("task"),"clear after switch");
            timer.reset();
            check(NotificationTimerControls.command(true,false,false).equals("timer-resume"),"paused notification continues");
            result.putString("stream","Focus instrumentation: "+assertions+" assertions passed; fixtures isolated under cache");
            finish(-1,result);
        } catch(Throwable error) {
            result.putString("stream","FAILED after "+assertions+" assertions: "+android.util.Log.getStackTraceString(error));
            finish(0,result);
        }
    }
}
