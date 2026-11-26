package local.gxtodo.replica;

import android.app.*;
import android.content.*;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.os.*;
import android.os.Process;
import android.service.notification.StatusBarNotification;
import android.view.*;
import android.webkit.WebView;
import android.widget.*;
import com.androidshared.feedback.*;
import local.gxtodo.d403preview.NativeTimerStore;
import local.gxtodo.d403preview.NativeTimerActivity;
import local.gxtodo.d403preview.BuildInfo;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Real Android lifecycle/notification/AAR execution. No timer clock or Android services are mocked. */
public final class NativeIntegrationInstrumentation extends Instrumentation {
    Context target; Bundle arguments;
    final JSONArray cases = new JSONArray();
    File evidence;
    Activity current;
    interface Check { JSONObject run() throws Exception; }
    interface Condition { boolean ready() throws Exception; }
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args == null ? new Bundle() : args; start(); }
    @Override public void onStart() {
        int failures = 0;
        target = getTargetContext(); evidence = new File(target.getFilesDir(), "d405-evidence"); evidence.mkdirs();
        String phase = arguments.getString("phase", "main");
        try {
            if (!"local.gxtodo.d405candidate".equals(target.getPackageName())) throw new AssertionError("synthetic package identity required");
            if ("process-prepare".equals(phase)) prepareDeath();
            else if ("process-recover".equals(phase)) recoverDeath();
            else if (phase.startsWith("visual-")) visualCase(Integer.parseInt(phase.substring(7)));
            else mainCases();
        } catch (Throwable error) { recordFailure("phase-abort", error); }
        for (int i = 0; i < cases.length(); i++) if (!cases.optJSONObject(i).optBoolean("passed")) failures++;
        try {
            JSONObject report = new JSONObject().put("phase", phase).put("sourceSHA", BuildInfo.SOURCE_SHA)
                .put("runId", BuildInfo.RUN_ID).put("runAttempt", BuildInfo.RUN_ATTEMPT).put("versionName", BuildInfo.VERSION_NAME)
                .put("versionCode", BuildInfo.VERSION_CODE).put("deviceSdk", Build.VERSION.SDK_INT)
                .put("deviceFingerprint", Build.FINGERPRINT).put("pid", Process.myPid()).put("syntheticOnly", true)
                .put("emulatorEvidence", true).put("passed", failures == 0).put("caseCount", cases.length()).put("failureCount", failures).put("cases", cases);
            write(new File(evidence, "result-" + phase + ".json"), report.toString(2));
            Bundle output = new Bundle(); output.putString("d405_result", report.toString());
            finish(failures == 0 ? 0 : 1, output);
        } catch (Exception error) { Bundle output = new Bundle(); output.putString("d405_report_error", error.toString()); finish(2, output); }
    }
    void test(String name, Check check) {
        long start = SystemClock.elapsedRealtime();
        try { JSONObject result=check.run(); cases.put(new JSONObject().put("name", name).put("passed", true).put("durationMs", SystemClock.elapsedRealtime()-start).put("evidence", result)); }
        catch (Throwable error) { recordFailure(name, error); }
    }
    void recordFailure(String name, Throwable error) {
        try { StringWriter stack = new StringWriter(); error.printStackTrace(new PrintWriter(stack));
            cases.put(new JSONObject().put("name", name).put("passed", false).put("error", error.toString()).put("stack", stack.toString()));
        } catch (Exception ignored) {}
    }
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    void until(String label, long timeout, Condition condition) throws Exception {
        long end = SystemClock.elapsedRealtime()+timeout;
        while (SystemClock.elapsedRealtime()<end) { if (condition.ready()) return; SystemClock.sleep(100); }
        throw new AssertionError("timeout: " + label);
    }
    JSONObject request(JSONObject input) throws Exception {
        CountDownLatch done = new CountDownLatch(1); JSONObject[] value = new JSONObject[1]; String[] error = new String[1];
        NativeTimerStore.request(target, input.toString(), (v,e) -> { value[0]=v; error[0]=e; done.countDown(); });
        check(done.await(15, TimeUnit.SECONDS), "timer request timeout");
        if (error[0]!=null) throw new IllegalStateException(error[0]);
        return value[0];
    }
    JSONObject state() throws Exception { return request(new JSONObject().put("op", "snapshot")); }
    JSONObject command(String action, JSONObject values) throws Exception {
        return request(new JSONObject().put("op","command").put("action",action).put("values",values)
            .put("commandId","qa:"+UUID.randomUUID()).put("expectedRevision",state().getLong("revision")));
    }
    JSONObject configure(String mode, int minutes) throws Exception {
        command("reset",new JSONObject());
        return command("configure",new JSONObject().put("mode",mode).put("durationMinutes",minutes).put("breakMinutes",1).put("taskId",""));
    }
    Activity launch(Class<?> cls) {
        current = startActivitySync(new Intent(target, cls).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK)); waitForIdleSync(); return current;
    }
    void foreground() { launch(D405Activity.class); }
    StatusBarNotification notice(int id) {
        for (StatusBarNotification n : ((NotificationManager)target.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications()) if(n.getId()==id) return n;
        return null;
    }
    String shell(String command) throws Exception {
        try (ParcelFileDescriptor fd=getUiAutomation().executeShellCommand(command); InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(fd); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096]; int n; while((n=in.read(buffer))!=-1)out.write(buffer,0,n); return out.toString("UTF-8");
        }
    }
    String js(WebView web,String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1); String[] value=new String[1];
        runOnMainSync(()->web.evaluateJavascript(script,v->{value[0]=v;done.countDown();}));
        check(done.await(15,TimeUnit.SECONDS),"WebView callback"); return value[0];
    }
    void shot(String name) throws Exception {
        Bitmap bitmap=getUiAutomation().takeScreenshot(); check(bitmap!=null,"screenshot available");
        try(FileOutputStream out=new FileOutputStream(new File(evidence,name+".png"))){check(bitmap.compress(Bitmap.CompressFormat.PNG,100,out),"screenshot saved");} finally{bitmap.recycle();}
    }
    void mainCases() throws Exception {
        foreground();
        test("D405-01 exact-permission-and-component-policy",()->{
            PackageInfo info=target.getPackageManager().getPackageInfo(target.getPackageName(), android.content.pm.PackageManager.GET_PERMISSIONS|android.content.pm.PackageManager.GET_SERVICES);
            Set<String> actual=new TreeSet<>(Arrays.asList(info.requestedPermissions));
            Set<String> expected=new TreeSet<>(Arrays.asList("android.permission.POST_NOTIFICATIONS","android.permission.FOREGROUND_SERVICE","android.permission.FOREGROUND_SERVICE_SPECIAL_USE","android.permission.SCHEDULE_EXACT_ALARM"));
            check(actual.equals(expected),"exact service permission whitelist"); check(info.services.length==1,"one formal companion service");
            check(info.services[0].name.equals(AndroidCompanionService.class.getName()),"formal service reused");
            return new JSONObject().put("permissions",new JSONArray(actual)).put("service",info.services[0].name);
        });
        test("D405-02 accepted-page-native-bridge-and-feedback-entry",()->{
            D405Activity app=(D405Activity)current;
            until("native page ready",20000,()->"true".equals(js(app.previewWebView(),"!!window.D4Prototype&&!!window.GxD405Native&&!!window.D405SelectionTrace")));
            js(app.previewWebView(),"D4Prototype.navigate('feedback')");
            until("native feedback control",5000,()->"true".equals(js(app.previewWebView(),"!!document.querySelector('[data-d405-feedback]')")));
            js(app.previewWebView(),"D4Prototype.repo.updateDemo(d=>d)");SystemClock.sleep(600);
            check("true".equals(js(app.previewWebView(),"!!document.querySelector('[data-d405-feedback]')")),"native feedback entry survives same-route repository redraw");
            shot("native-feedback-entry");
            return new JSONObject().put("selectionTrace",new JSONTokener(js(app.previewWebView(),"D405SelectionTrace()" )).nextValue());
        });
        test("D405-03 single-authority-foreground-service",()->{
            configure("countup",25); JSONObject start=command("start",new JSONObject());
            until("foreground timer notice",10000,()->notice(8501)!=null);
            check(!target.getSharedPreferences("android-tools",Context.MODE_PRIVATE).contains("timer.state"),"legacy timer state never initialized");
            return new JSONObject().put("sessionId",start.getString("sessionId")).put("noticeId",notice(8501).getId());
        });
        test("D405-04-native-notification-pause-resume",()->{
            StatusBarNotification n=notice(8501);check(n!=null&&n.getNotification().actions.length==1,"pause control");
            n.getNotification().actions[0].actionIntent.send();
            until("paused",5000,()->"paused".equals(state().optString("status")));
            long paused=state().getLong("elapsedMillis");SystemClock.sleep(1300);check(state().getLong("elapsedMillis")==paused,"pause stops earned time");
            until("resume action",5000,()->notice(8501)!=null&&notice(8501).getNotification().actions[0].title.toString().contains("继续"));
            notice(8501).getNotification().actions[0].actionIntent.send();until("running",5000,()->state().optBoolean("running"));
            return new JSONObject().put("pausedMillis",paused).put("resumeRunning",true);
        });
        test("D405-05-background-keeps-session",()->{
            JSONObject before=state();runOnMainSync(()->current.moveTaskToBack(true));SystemClock.sleep(2500);JSONObject after=state();
            check(before.getString("sessionId").equals(after.getString("sessionId")),"same session in background");
            check(after.getLong("elapsedMillis")>=before.getLong("elapsedMillis")+2000,"background elapsed time");
            check(notice(8501)!=null,"foreground notice remains");foreground();return new JSONObject().put("before",before).put("after",after);
        });
        test("D405-06-lockscreen-keeps-private-timer-notification",()->{
            JSONObject before=state();shell("input keyevent 223");SystemClock.sleep(1800);
            boolean interactive=((PowerManager)target.getSystemService(Context.POWER_SERVICE)).isInteractive();
            boolean locked=((KeyguardManager)target.getSystemService(Context.KEYGUARD_SERVICE)).isKeyguardLocked();
            try{check(!interactive,"device screen is off");check(locked,"keyguard is locked");check(notice(8501)!=null,"lockscreen timer notice exists");
                check(notice(8501).getNotification().visibility==Notification.VISIBILITY_PRIVATE,"private lockscreen content");
                JSONObject after=state();check(after.getLong("elapsedMillis")>before.getLong("elapsedMillis"),"time advanced locked");
                shell("input keyevent 224");SystemClock.sleep(300);shot("native-lockscreen");return new JSONObject().put("interactive",interactive).put("keyguardLocked",locked).put("sessionId",after.getString("sessionId"));
            }finally{shell("input keyevent 224");shell("wm dismiss-keyguard");foreground();}
        });
        test("D405-07-activity-recreation-preserves-timer-and-draft",()->{
            Activity nativePage=launch(NativeTimerActivity.class);until("native timer configured",8000,()->{TextView v=nativePage.findViewById(40301);return v!=null&&!v.getText().toString().contains("读取");});
            runOnMainSync(()->((EditText)nativePage.findViewById(40312)).setText("37"));
            JSONObject before=state();ActivityMonitor monitor=addMonitor(NativeTimerActivity.class.getName(),null,false);
            runOnMainSync(nativePage::recreate);Activity restored=waitForMonitorWithTimeout(monitor,10000);removeMonitor(monitor);check(restored!=null,"recreated Activity");current=restored;
            waitForIdleSync();check("37".equals(((EditText)restored.findViewById(40312)).getText().toString()),"dirty config draft restored");
            check(state().getString("sessionId").equals(before.getString("sessionId")),"recreation keeps session");shot("native-activity-recreated");
            runOnMainSync(restored::finish);foreground();return new JSONObject().put("sessionId",before.getString("sessionId")).put("draftMinutes",37);
        });
        test("D405-08-real-deadline-completion-once",()->{
            foreground();configure("countdown",1);JSONObject start=command("start",new JSONObject());
            runOnMainSync(()->current.moveTaskToBack(true));
            until("actual one-minute completion",75000,()->notice(8502)!=null&&start.getString("sessionId").equals(notice(8502).getTag()));
            until("completion durable claim",10000,()->!state().optBoolean("completionPending"));
            JSONObject after=state();check(after.getJSONArray("history").getJSONObject(0).getString("id").equals(start.getString("sessionId")),"one completed history");
            long postTime=notice(8502).getPostTime(),revision=after.getLong("revision");CountDownLatch woke=new CountDownLatch(1);
            D405TimerCompanion.wake(target,woke::countDown);check(woke.await(10,TimeUnit.SECONDS),"repeated wake completes");
            int count=0,histories=0;for(StatusBarNotification n:((NotificationManager)target.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications())if(n.getId()==8502&&start.getString("sessionId").equals(n.getTag()))count++;
            JSONObject repeated=state();JSONArray rows=repeated.getJSONArray("history");for(int i=0;i<rows.length();i++)if(start.getString("sessionId").equals(rows.getJSONObject(i).getString("id")))histories++;
            check(count==1&&histories==1,"one notice and completed history");check(notice(8502).getPostTime()==postTime,"repeat wake does not repost notification");check(repeated.getLong("revision")==revision,"repeat wake does not claim twice");
            foreground();return new JSONObject().put("state",after).put("matchingNotices",count).put("matchingHistory",histories).put("noticePostTime",postTime).put("repeatWakeRevision",repeated.getLong("revision"));
        });
        test("D405-09-formal-reminder-alarm-delivery-and-snooze",()->{
            AccountStore accounts=AccountStore.get(target);JSONObject original=new JSONObject(accounts.read(accounts.active()));
            JSONObject task=new JSONObject().put("id","d405-qa-reminder").put("title","D405_SYNTHETIC_NATIVE_REMINDER").put("done",false).put("quadrant",0).put("reminderAt",System.currentTimeMillis()+2000).put("subtasks",new JSONArray());
            JSONObject saved=new JSONObject(original.toString());saved.getJSONArray("tasks").put(task);accounts.write(accounts.active(),saved.toString());ReminderScheduler.refresh(target);
            until("OS reminder alarm",20000,()->{for(StatusBarNotification n:((NotificationManager)target.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications())if("d405-qa-reminder".equals(n.getTag()))return true;return false;});
            StatusBarNotification found=null;for(StatusBarNotification n:((NotificationManager)target.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications())if("d405-qa-reminder".equals(n.getTag()))found=n;
            check(found!=null&&found.getNotification().visibility==Notification.VISIBILITY_PRIVATE,"private formal reminder");
            found.getNotification().actions[0].actionIntent.send();String key=ReminderScheduler.key(task);
            until("native snooze receipt",5000,()->target.getSharedPreferences(AccountStore.reminderPrefs(target),Context.MODE_PRIVATE).getLong(key,0)>System.currentTimeMillis());
            long snoozed=target.getSharedPreferences(AccountStore.reminderPrefs(target),Context.MODE_PRIVATE).getLong(key,0);
            accounts.write(accounts.active(),original.toString());ReminderScheduler.refresh(target);
            return new JSONObject().put("snoozedAt",snoozed).put("formalScheduler",ReminderScheduler.class.getName());
        });
        test("D405-10-native-feedbackkit-real-editor-save",()->{
            foreground();ActivityMonitor monitor=addMonitor("com.androidshared.feedback.FeedbackActivity",null,false);
            runOnMainSync(()->FeedbackKit.newIdea(current,"D405 CI"));Activity feedback=waitForMonitorWithTimeout(monitor,10000);removeMonitor(monitor);check(feedback!=null,"real AAR Activity");
            until("native feedback editor",10000,()->find(feedback.getWindow().getDecorView(),EditText.class,null)!=null);
            View editor=find(feedback.getWindow().getDecorView(),EditText.class,null);tap(editor);sendStringSync("D405_NATIVE_FEEDBACK_"+BuildInfo.RUN_ID);waitForIdleSync();
            View save=find(feedback.getWindow().getDecorView(),TextView.class,"保存意见");check(save!=null,"real save control");
            runOnMainSync(()->save.requestRectangleOnScreen(new android.graphics.Rect(0,0,save.getWidth(),save.getHeight()),true));SystemClock.sleep(300);tap(save);
            DefaultFeedbackStorage storage=new DefaultFeedbackStorage(target);
            until("native feedback saved",10000,()->{for(JSONObject row:storage.all(FeedbackStorage.NOTES))if(("D405_NATIVE_FEEDBACK_"+BuildInfo.RUN_ID).equals(row.optString("body")))return true;return false;});
            shot("native-feedback-saved");runOnMainSync(feedback::finish);foreground();return new JSONObject().put("aarVersion",FeedbackKit.VERSION).put("storedBody","D405_NATIVE_FEEDBACK_"+BuildInfo.RUN_ID);
        });
        test("D405-11-accepted-work-page-selection-readonly-trace",()->{
            D405Activity app=(D405Activity)current;until("web restored",15000,()->"true".equals(js(app.previewWebView(),"!!window.D405SelectionTrace")));
            js(app.previewWebView(),"D4Prototype.navigate('work-items')");waitForIdleSync();shot("native-work-page");
            return new JSONObject().put("readOnlyTrace",new JSONTokener(js(app.previewWebView(),"D405SelectionTrace()" )).nextValue());
        });
        command("reset",new JSONObject());
    }
    void prepareDeath() throws Exception {
        foreground();
        test("D405-12-process-death-preparation",()->{
            configure("countup",25);JSONObject saved=command("start",new JSONObject());
            until("service started before kill",10000,()->notice(8501)!=null);SystemClock.sleep(1500);saved=state();
            JSONObject fixture=new JSONObject().put("pid",Process.myPid()).put("state",saved).put("preparedWall",System.currentTimeMillis());
            write(new File(evidence,"process-death-fixture.json"),fixture.toString(2));
            return fixture;
        });
    }
    void recoverDeath() throws Exception {
        foreground();
        test("D405-13-real-process-death-recovery",()->{
            JSONObject fixture=new JSONObject(read(new File(evidence,"process-death-fixture.json")));
            check(fixture.getInt("pid")!=Process.myPid(),"actual different application process");
            JSONObject saved=fixture.getJSONObject("state"),restored=state();
            check(saved.getString("sessionId").equals(restored.getString("sessionId")),"durable session identity restored");
            check(restored.optBoolean("running"),"running state restored");check(restored.getLong("elapsedMillis")>=saved.getLong("elapsedMillis"),"monotonic elapsed restored");
            until("foreground service restored",10000,()->notice(8501)!=null);
            check(!target.getSharedPreferences("android-tools",Context.MODE_PRIVATE).contains("timer.state"),"legacy authority absent after recovery");
            shot("native-process-recovered");command("reset",new JSONObject());
            return new JSONObject().put("priorPid",fixture.getInt("pid")).put("currentPid",Process.myPid()).put("prior",saved).put("restored",restored);
        });
    }
    void visualCase(int width) throws Exception {
        foreground();
        test("D405-visual-"+width+"-work-notes-real-edit-and-readonly-selection",()->{
            D405Activity app=(D405Activity)current;WebView web=app.previewWebView();
            until("visual page ready",20000,()->"true".equals(js(web,"!!window.D405SelectionTrace")));
            int actualWidth=Integer.parseInt(js(web,"innerWidth"));check(actualWidth==width,"exact CSS width expected "+width+" got "+actualWidth);
            js(web,"D4Prototype.navigate('work-items')");SystemClock.sleep(400);
            webTap(web,"[data-action=work-new-work-item]");
            String form="[data-form=work-work-item]",title="D405 visual "+width+" "+BuildInfo.RUN_ID;
            webType(web,form+" [name=title]",title);webType(web,form+" [name=notes]","Native notes before edit");
            webTap(web,form+" button[type=submit]");until("create saved",8000,()->"false".equals(js(web,"!!document.querySelector('[data-form=work-work-item]')")));
            String id=(String)new JSONTokener(js(web,"D4Prototype.repo.demo.workItems.find(w=>w.title==="+JSONObject.quote(title)+").id")).nextValue();
            String detail="[data-action=work-work-detail][data-id='"+id+"']";
            webTap(web,detail);webTap(web,".modal-body > footer [data-action=work-edit-work-item][data-id='"+id+"']");
            String note="Native notes after edit "+width+" "+String.join("",Collections.nCopies(14,"LONG_REMARK_2032-05-07T04:34:56.789+05:30_"));
            webType(web,form+" [name=notes]",note);
            Object before=new JSONTokener(js(web,"D405SelectionTrace()")).nextValue();
            webTap(web,form+" button[type=submit]");until("edit saved",8000,()->"false".equals(js(web,"!!document.querySelector('[data-form=work-work-item]')")));
            Object afterSave=new JSONTokener(js(web,"D405SelectionTrace()")).nextValue();
            webTap(web,detail);
            String raw=js(web,"(function(){var p=document.querySelector('.modal .work-note-content')||document.querySelector('.modal pre'),r=p.getBoundingClientRect();return {text:p.textContent,width:p.clientWidth,scrollWidth:p.scrollWidth,left:r.left,right:r.right,viewport:innerWidth,selection:D405SelectionTrace()};})()");
            JSONObject shown=new JSONObject(raw);check(note.equals(shown.getString("text")),"full note preserved in detail");
            check(shown.getInt("scrollWidth")<=shown.getInt("width")+1,"note wraps without internal horizontal clipping");
            check(shown.getDouble("right")<=width+1&&shown.getDouble("left")>=-1,"note lies inside phone viewport");
            js(web,"(document.querySelector('.modal .work-note-content')||document.querySelector('.modal pre')).scrollIntoView({block:'center'})");SystemClock.sleep(300);
            shot("native-work-edited-"+width);
            JSONObject trace=new JSONObject().put("beforeSave",before).put("afterSave",afterSave).put("detail",shown)
                .put("interpretation","Read-only focus/selection observation. Native Ctrl+A/typing unchanged; no selection clearing and no inferred root cause.");
            write(new File(evidence,"work-notes-selection-"+width+".json"),trace.toString(2));return trace;
        });
    }
    void webType(WebView web,String selector,String text)throws Exception {
        dismissKeyboard(web);webTap(web,selector);check("true".equals(js(web,"document.activeElement===document.querySelector("+JSONObject.quote(selector)+")")),"actual field focus");
        long now=SystemClock.uptimeMillis();sendKeySync(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,KeyEvent.META_CTRL_ON));
        sendKeySync(new KeyEvent(now,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_A,0,KeyEvent.META_CTRL_ON));
        sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DEL));sendKeySync(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DEL));
        sendStringSync(text);waitForIdleSync();SystemClock.sleep(200);
        check(text.equals(new JSONTokener(js(web,"document.querySelector("+JSONObject.quote(selector)+").value")).nextValue()),"actual key text matches");dismissKeyboard(web);
    }
    void dismissKeyboard(WebView web) {
        boolean[] visible=new boolean[1];runOnMainSync(()->{WindowInsets insets=web.getRootWindowInsets();check(insets!=null,"observed IME insets");visible[0]=insets.isVisible(WindowInsets.Type.ime());});
        if(visible[0]){sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK));sendKeySync(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK));waitForIdleSync();SystemClock.sleep(200);}
    }
    void webTap(WebView web,String selector)throws Exception {
        js(web,"document.querySelector("+JSONObject.quote(selector)+").scrollIntoView({block:'center',inline:'nearest'})");SystemClock.sleep(200);
        JSONObject p=new JSONObject(js(web,"(function(){var e=document.querySelector("+JSONObject.quote(selector)+"),r=e.getBoundingClientRect(),v=visualViewport,x=Math.max(0,r.left)+Math.min(r.width,innerWidth-Math.max(0,r.left))/2,y=Math.max(0,r.top)+Math.min(r.height,v.height-Math.max(0,r.top))/2,h=document.elementFromPoint(x,y);return {x:x,y:y,width:innerWidth,scale:v.scale,offsetX:v.offsetLeft,offsetY:v.offsetTop,hit:!!h&&(h===e||e.contains(h))};})()"));
        check(p.getBoolean("hit")&&Math.abs(p.getDouble("scale")-1)<.001&&Math.abs(p.getDouble("offsetX"))<.5&&Math.abs(p.getDouble("offsetY"))<.5,"verified native touch target");
        int[] location=new int[2],size=new int[1];runOnMainSync(()->{web.getLocationOnScreen(location);size[0]=web.getWidth();});
        float scale=(float)(size[0]/p.getDouble("width")),x=location[0]+(float)p.getDouble("x")*scale,y=location[1]+(float)p.getDouble("y")*scale;
        long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,x,y,0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);sendPointerSync(down);sendPointerSync(up);down.recycle();up.recycle();waitForIdleSync();SystemClock.sleep(400);
    }
    View find(View root,Class<?> type,String text) {
        if(type.isInstance(root)&&root.isShown()&&(text==null||(root instanceof TextView&&text.equals(((TextView)root).getText().toString()))))return root;
        if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){View v=find(((ViewGroup)root).getChildAt(i),type,text);if(v!=null)return v;}return null;
    }
    void tap(View view) {
        int[] point=new int[2];runOnMainSync(()->view.getLocationOnScreen(point));long now=SystemClock.uptimeMillis();float x=point[0]+view.getWidth()/2f,y=point[1]+view.getHeight()/2f;
        MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,x,y,0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        sendPointerSync(down);sendPointerSync(up);down.recycle();up.recycle();waitForIdleSync();
    }
    static void write(File file,String text)throws Exception{try(FileOutputStream out=new FileOutputStream(file)){out.write(text.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}}
    static String read(File file)throws Exception{try(FileInputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
}
