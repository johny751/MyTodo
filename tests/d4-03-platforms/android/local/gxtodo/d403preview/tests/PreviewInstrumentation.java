package local.gxtodo.d403preview.tests;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import local.gxtodo.d403preview.BuildInfo;
import local.gxtodo.d403preview.MainActivity;
import local.gxtodo.d403preview.NativeTimerActivity;
import local.gxtodo.d403preview.NativeTimerStore;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real emulator input and native elapsedRealtime evidence. Never a production test runner. */
public final class PreviewInstrumentation extends Instrumentation {
    private MainActivity main;
    private File evidence;
    private final JSONArray rows = new JSONArray();
    private int passed, failed;
    private interface Check { void run() throws Exception; }
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        try {
            if (!"local.gxtodo.d403preview".equals(getTargetContext().getPackageName()))
                throw new SecurityException("Independent preview target required");
            evidence = new File(getTargetContext().getFilesDir(), "d403-evidence");
            if (!evidence.mkdir()) throw new IllegalStateException("Fresh isolated evidence directory required");
            launch();
            check("android-independent-package-and-bridge", () -> {
                PackageInfo p = getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(), 4096);
                if (p.requestedPermissions != null) for (String permission : p.requestedPermissions)
                    require(!permission.contains("INTERNET") && !permission.contains("STORAGE") && !permission.contains("ACCOUNTS"), permission);
                require(Boolean.TRUE.equals(js("typeof GxNative==='undefined'&&GxD4Preview.isPreview()")), "Only preview bridge available");
                require(BuildInfo.SOURCE_SHA.matches("[a-f0-9]{40}"), "Injected full Git identity");
                require(BuildInfo.VERSION_NAME.equals(js("JSON.parse(GxD4Preview.versionInfo()).versionName")),"Version name comes from APK build");
                require(((Number)js("JSON.parse(GxD4Preview.versionInfo()).versionCode")).intValue()==BuildInfo.VERSION_CODE,"VersionCode matches manifest-injected APK constants");
                require(BuildInfo.BUILD_TIME_UTC.equals(js("JSON.parse(GxD4Preview.versionInfo()).buildTimeUtc")),"APK UTC build time is injected, not runtime now");
            });
            check("android-starts-mobile-four-quadrants", () -> {
                require("tasks".equals(js("D4Prototype.getRoute()")), "Startup tasks route");
                require(Boolean.TRUE.equals(js("innerWidth<=650&&document.querySelectorAll('.board [data-quadrant]').length===4")), "Actual mobile viewport with four quadrants");
                shot("android-quadrants");
            });
            check("android-apk-version-info-native-dialog", () -> {
                js("D4Prototype.navigate('about')"); settle();
                require(Boolean.TRUE.equals(js("document.querySelector('.version-info').textContent.includes(JSON.parse(GxD4Preview.versionInfo()).versionName)&&document.querySelector('.version-info').textContent.includes(String(JSON.parse(GxD4Preview.versionInfo()).versionCode))")),"About page displays actual APK identity");
                tap("[data-action=personal-apk-version]");
                AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
                require(root!=null&&nativeTextContains(root,BuildInfo.VERSION_NAME)&&nativeTextContains(root,BuildInfo.BUILD_TIME_UTC),"Real Android version dialog contains injected APK name and UTC build time");
                shot("android-apk-version"); back();home();
            });
            check("android-touch-zoom-and-back", () -> {
                home(); tap("[data-action='quadrant-focus'][data-id='0']");
                require(Boolean.TRUE.equals(js("!!document.querySelector('.single-quadrant')")), "Touch zoom opened");
                shot("android-single-quadrant"); back();
                require(Boolean.TRUE.equals(js("document.querySelectorAll('.board [data-quadrant]').length===4")), "Android back restored board");
            });
            check("android-touch-full-task-menu-and-back", () -> {
                home(); tap("[data-action='task-menu'][data-id='d4-task-0']");
                require(Boolean.TRUE.equals(js("['task-open','task-toggle','task-up','task-down','task-subtask','task-notes','task-reminder','task-review','task-delete'].every(a=>document.querySelector('.task-menu-actions [data-action='+a+']'))&&document.querySelectorAll('.task-menu-actions [data-action=task-move]').length===4")), "Complete original menu plus requested shortcuts");
                shot("android-task-menu"); back();
                require(Boolean.TRUE.equals(js("!document.querySelector('.modal')")), "Android back closed only menu");
            });
            for (String route : new String[]{"tasks","notes","pomodoro","projects","work-items","templates","processes","analytics","settings","sync","feedback"}) {
                final String page = route;
                check("android-touch-edge-drawer-" + page, () -> {
                    home(); js("D4Prototype.navigate(" + JSONObject.quote(page) + ")"); settle(); edgeOpen();
                    require(Boolean.TRUE.equals(js("document.querySelector('.app-shell').classList.contains('nav-open')")), "Real left-edge swipe opens on " + page);
                    if ("notes".equals(page)) shot("android-notes-drawer");
                    if ("projects".equals(page)) shot("android-projects-drawer");
                    back(); require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell').classList.contains('nav-open')&&D4Prototype.getRoute()===" + JSONObject.quote(page))), "Back closes drawer without navigating");
                });
            }
            check("android-touch-drawer-item-overlay-and-left-swipe", () -> {
                home(); edgeOpen(); tap(".side-nav [data-action='go'][data-id='notes']");
                require("notes".equals(js("D4Prototype.getRoute()")), "Real menu item switched page");
                // Opening is idempotent; clear any inherited open state before testing each closure.
                js("DemoMobileControls.nav(false)"); edgeOpen();
                gesture(320, 150, 320, 150, 0, 0);
                require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')")), "Real overlay tap closes");
                edgeOpen(); gesture(180, 150, 35, 150, 0, 260);
                require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')")), "Actual left swipe closes");
            });
            check("android-vertical-scroll-does-not-open-drawer", () -> {
                home(); gesture(5, 250, 8, 410, 0, 260);
                require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')")), "Vertical edge motion cancelled navigation");
                gesture(170, 450, 175, 230, 0, 260);
                require(Boolean.TRUE.equals(js("!document.querySelector('.dragging,.drag-ghost')")), "Ordinary content scroll cancelled long press");
            });
            check("android-touch-longpress-reorder", () -> {
                home(); manualSort(); js("D4Prototype.repo.moveTask('d4-task-0',0,'d4-task-1')"); settle();
                require(((Number)js("D4Prototype.repo.state.settings.longPressMs")).intValue()==3000, "Frozen default long press is 3000ms");
                float[] from = point("[data-task-id='d4-task-1'] .task-title", false);
                float[] target = point("[data-task-id='d4-task-0'] .task-title", false);
                gesture(from[0], from[1], target[0], target[1]-20, longHold(), 320); settle();
                require(Boolean.TRUE.equals(js("Array.from(document.querySelectorAll('[data-quadrant=\"0\"] .task-row')).findIndex(x=>x.dataset.taskId==='d4-task-1')<Array.from(document.querySelectorAll('[data-quadrant=\"0\"] .task-row')).findIndex(x=>x.dataset.taskId==='d4-task-0')")), "Real longpress reordered task");
                require(Boolean.TRUE.equals(js("!D4Prototype.repo.getTask('d4-task-1').done")), "Drag did not complete task");
            });
            check("android-touch-cross-quadrant-preserves-raw-fields", () -> {
                home(); manualSort(); Object before = rawMovedTask();
                float[] from = point("[data-task-id='d4-task-0'] .task-title", false);
                float[] target = point("[data-quadrant='1'] .quadrant-list", false);
                gesture(from[0], from[1], target[0], target[1], longHold(), 320); settle();
                require(((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue()==1, "Cross-quadrant actual drag");
                require(before.equals(rawMovedTask()), "All raw properties including nested reminders, repeat and subtasks preserved");
                shot("android-after-task-move");
            });
            check("android-touch-and-keyboard-autocomplete", () -> {
                home(); tap("[data-task-id='d4-task-0'] .task-title");
                for (String kind : new String[]{"tags","projects","places"}) {
                    String host = "[data-catalog='"+kind+"']";
                    tap(host+" [role=combobox]");
                    js("(function(){var x=document.querySelector("+JSONObject.quote(host+" [role=combobox]")+");x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
                    require(Boolean.TRUE.equals(js("document.querySelector("+JSONObject.quote(host+" .catalog-list")+").children.length>0")), "Existing " + kind + " candidates");
                    if ("tags".equals(kind)) { sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_DOWN)); sendKeySync(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_DOWN)); sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)); sendKeySync(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER)); }
                    else tap(host+" [data-action=catalog-pick]");
                    require(Boolean.TRUE.equals(js("document.querySelector("+JSONObject.quote(host+" [role=combobox]")+").getAttribute('aria-expanded')==='false'")), "Candidate selection closed " + kind);
                    if ("projects".equals(kind)) require(((String)js("document.querySelector('[name=projectId]').value")).startsWith("project-"), "Project identity selected, not name");
                }
                shot("android-task-autocomplete"); back();
            });
            check("android-page-switch-restores-task-draft", () -> {
                home(); tap("[data-task-id='d4-task-0'] .task-title");
                js("document.querySelector('[data-form=task-edit] [name=title]').value='隔离未保存草稿'");
                edgeOpen(); tap(".side-nav [data-action=go][data-id=notes]");
                js("DemoMobileControls.nav(false)"); edgeOpen(); tap(".side-nav [data-action=go][data-id=tasks]");
                require("隔离未保存草稿".equals(js("document.querySelector('[data-form=task-edit] [name=title]').value")), "Draft restored across actual navigation taps");
                js("DemoMobileControls.nav(false)"); back();
            });
            check("android-activity-recreation-retains-synthetic-task", () -> {
                home(); int q = ((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue();
                Object raw=rawMovedTask(), order=js("D4Prototype.repo.getTask('d4-task-0').order");
                Object domOrder=js("JSON.stringify(Array.from(document.querySelectorAll('.board .task-row')).map(x=>x.dataset.taskId))");
                Instrumentation.ActivityMonitor monitor = addMonitor(MainActivity.class.getName(), null, false);
                runOnMainSync(() -> main.recreate()); Activity next = monitor.waitForActivityWithTimeout(20000); removeMonitor(monitor);
                require(next instanceof MainActivity, "Activity recreated"); main=(MainActivity)next; waitLoaded();
                require(((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue()==q, "Independent WebView localStorage survives recreation");
                require(order.equals(js("D4Prototype.repo.getTask('d4-task-0').order"))&&raw.equals(rawMovedTask()),"Raw task fields and order persist across recreation");
                require(domOrder.equals(js("JSON.stringify(Array.from(document.querySelectorAll('.board .task-row')).map(x=>x.dataset.taskId))")),"Visible task ordering persists after reopen");
            });
            check("android-native-timer-real-buttons-pause-resume", () -> {
                NativeTimerActivity timer=(NativeTimerActivity)startActivitySync(new Intent(getTargetContext(),NativeTimerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                nativeTap(timer,40302); JSONObject running=timer("snapshot"); require(running.getBoolean("running"),"Native start button");
                SystemClock.sleep(1200); nativeTap(timer,40304); JSONObject paused=timer("snapshot"); SystemClock.sleep(650);
                require(!paused.getBoolean("running")&&timer("snapshot").getLong("elapsedMillis")==paused.getLong("elapsedMillis"),"Native pause holds elapsed time");
                nativeTap(timer,40305); require(timer("snapshot").getBoolean("running"),"Native resume button"); shot("android-native-pomodoro");
                runOnMainSync(timer::finish); SystemClock.sleep(1200);
                JSONObject later=timer("reopen-for-isolated-test"); require(later.getBoolean("running")&&later.getLong("elapsedMillis")>paused.getLong("elapsedMillis"),"ElapsedRealtime advances without timer Activity; AtomicFile reopen restores");
                timer("reset"); require(!timer("snapshot").getBoolean("running"),"Early-end reset persists");
            });
            check("android-native-one-minute-completion-after-background-once", () -> {
                JSONObject baseline=timer("snapshot"); timer("start",1);
                runOnMainSync(() -> main.moveTaskToBack(true));
                long deadline=SystemClock.elapsedRealtime()+61000L;
                while(SystemClock.elapsedRealtime()<deadline) SystemClock.sleep(Math.max(1L,Math.min(1000L,deadline-SystemClock.elapsedRealtime())));
                JSONObject completed=timer("snapshot"); require(completed.getBoolean("completed")&&!completed.getBoolean("running"),"Actual minute elapsed while Activity backgrounded");
                timer("reopen-for-isolated-test"); require(timer("poll").getBoolean("completionDelivered"),"Persisted pending completion delivered");
                require(!timer("poll").getBoolean("completionDelivered"),"Repeated poll does not duplicate completion");
                require(timer("snapshot").getInt("completedSessionsToday")==baseline.getInt("completedSessionsToday")+1,"Single completion statistic");
                launch(); shot("android-after-background");
            });
        } catch (Throwable fatal) { record("instrumentation-setup-or-fatal", fatal, 0); }
        try {
            JSONObject report=new JSONObject().put("kind","mytodo-d403-native-isolated-evidence").put("sourceSha",BuildInfo.SOURCE_SHA)
                .put("versionName",BuildInfo.VERSION_NAME).put("versionCode",BuildInfo.VERSION_CODE).put("buildTimeUTC",BuildInfo.BUILD_TIME_UTC)
                .put("platform","Android emulator: actual WebView MotionEvent and native elapsedRealtime")
                .put("packageName",getTargetContext().getPackageName()).put("total",passed+failed).put("passed",passed).put("failed",failed).put("tests",rows)
                .put("productionDatabase",false).put("productionSync",false)
                .put("unverified",new JSONArray().put("Physical handset touch and accessibility").put("Original production notification service, process-death and lockscreen regression").put("Original Win32 native task regression"));
            write("report.json",report.toString(2));
            Bundle status=new Bundle(); status.putString("stream",report.toString()); status.putInt("passed",passed);status.putInt("failed",failed);
            finish(failed==0?Activity.RESULT_OK:Activity.RESULT_CANCELED,status);
        } catch(Exception reportFailure) { Bundle b=new Bundle();b.putString("stream",reportFailure.toString());finish(Activity.RESULT_CANCELED,b); }
    }
    private void check(String name,Check check) { long started=SystemClock.elapsedRealtime();try{check.run();record(name,null,SystemClock.elapsedRealtime()-started);}catch(Throwable e){record(name,e,SystemClock.elapsedRealtime()-started);try{shot("failure-"+name);}catch(Exception ignored){}} }
    private void record(String name,Throwable error,long duration) {
        try { JSONObject row=new JSONObject().put("name",name).put("status",error==null?"passed":"failed").put("durationMs",duration);
            if(error==null)passed++;else{failed++;StringWriter raw=new StringWriter();error.printStackTrace(new PrintWriter(raw));row.put("error",raw.toString());if(evidence!=null)write(name+".failure.log",raw.toString());}
            rows.put(row);Bundle event=new Bundle();event.putString("stream",row.toString());sendStatus(error==null?0:-1,event);
        } catch(Exception ignored){failed++;}
    }
    private static void require(boolean condition,String message) { if(!condition)throw new AssertionError(message); }
    private static boolean nativeTextContains(AccessibilityNodeInfo node,String text) { if(node.getText()!=null&&node.getText().toString().contains(text))return true;for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null){boolean found=nativeTextContains(child,text);child.recycle();if(found)return true;}}return false; }
    private void launch() throws Exception { main=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));waitLoaded(); }
    private void waitLoaded() throws Exception { long end=SystemClock.elapsedRealtime()+30000;while(SystemClock.elapsedRealtime()<end){try{if(Boolean.TRUE.equals(js("!!window.D4Prototype")))return;}catch(Exception ignored){}SystemClock.sleep(250);}throw new AssertionError("Preview WebView did not load"); }
    private Object js(String expression) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> raw=new AtomicReference<>();
        runOnMainSync(() -> main.previewWebView().evaluateJavascript("(function(){try{return JSON.stringify({value:("+expression+")});}catch(e){return JSON.stringify({error:String(e)});}})()",value->{raw.set(value);done.countDown();}));
        require(done.await(10,TimeUnit.SECONDS),"JS assertion timed out");String decoded=new JSONArray("["+raw.get()+"]").getString(0);
        JSONObject result=new JSONObject(decoded);if(result.has("error"))throw new AssertionError(result.getString("error"));return result.opt("value");
    }
    private void home() throws Exception { js("(function(){DemoMobileControls.nav(false);for(var i=0;i<3;i++)D4Prototype.back();D4Prototype.navigate('tasks');return true;})()");settle(); }
    private void manualSort() throws Exception { js("(function(){var f=document.querySelector('[data-form=task-filter]');f.querySelector('[name=sort]').value='manual';f.querySelector('[name=allDates]').checked=false;f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;})()");settle();require("manual".equals(js("D4Prototype.getView().sort")),"Fixture explicitly selects manual ordering"); }
    private long longHold() throws Exception { return ((Number)js("D4Prototype.repo.state.settings.longPressMs")).longValue()+200L; }
    private Object rawMovedTask() throws Exception { return js("(function(){var t=D4Prototype.repo.getTask('d4-task-0');delete t.quadrant;delete t.order;return JSON.stringify(t);})()"); }
    private void back() { sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK));sendKeySync(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK));settle(); }
    private void settle() { waitForIdleSync();SystemClock.sleep(650); }
    private float[] point(String selector,boolean scroll) throws Exception {
        JSONObject rect=(JSONObject)js("(function(){var e=document.querySelector("+JSONObject.quote(selector)+");if(!e)throw Error('Missing '+"+JSONObject.quote(selector)+");"+(scroll?"e.scrollIntoView({block:'center'});":"")+"var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:innerWidth,h:innerHeight};})()");
        return new float[]{(float)rect.getDouble("x"),(float)rect.getDouble("y")};
    }
    private void tap(String selector) throws Exception { point(selector,true);SystemClock.sleep(200);float[] p=point(selector,false);gesture(p[0],p[1],p[0],p[1],0,0);settle(); }
    private void edgeOpen() throws Exception { gesture(3,150,140,152,0,300);settle(); }
    private void gesture(float sx,float sy,float ex,float ey,long hold,long duration) throws Exception {
        double cssWidth=((Number)js("innerWidth")).doubleValue();final int[] origin=new int[2];final int[] size=new int[1];runOnMainSync(()->{WebView w=main.previewWebView();w.getLocationOnScreen(origin);size[0]=w.getWidth();});
        float scale=(float)(size[0]/cssWidth);long down=SystemClock.uptimeMillis();input(down,down,MotionEvent.ACTION_DOWN,origin[0]+sx*scale,origin[1]+sy*scale);SystemClock.sleep(hold);
        int steps=duration==0?0:12;for(int i=1;i<=steps;i++){SystemClock.sleep(duration/steps);input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,origin[0]+(sx+(ex-sx)*i/steps)*scale,origin[1]+(sy+(ey-sy)*i/steps)*scale);}
        input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,origin[0]+ex*scale,origin[1]+ey*scale);
    }
    private void input(long down,long now,int action,float x,float y) { MotionEvent event=MotionEvent.obtain(down,now,action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{require(getUiAutomation().injectInputEvent(event,true),"Native MotionEvent injection");}finally{event.recycle();} }
    private void nativeTap(Activity activity,int id) { final int[] xy=new int[2];final int[] size=new int[2];runOnMainSync(()->{View v=activity.findViewById(id);require(v!=null,"Native button exists");v.getLocationOnScreen(xy);size[0]=v.getWidth();size[1]=v.getHeight();});long down=SystemClock.uptimeMillis();input(down,down,MotionEvent.ACTION_DOWN,xy[0]+size[0]/2f,xy[1]+size[1]/2f);input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,xy[0]+size[0]/2f,xy[1]+size[1]/2f);settle(); }
    private JSONObject timer(String op) throws Exception { return timer(op,0); }
    private JSONObject timer(String op,int minutes) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<JSONObject> value=new AtomicReference<>();AtomicReference<String> error=new AtomicReference<>();
        JSONObject command=new JSONObject().put("op",op);if(minutes>0)command.put("minutes",minutes);
        NativeTimerStore.request(getTargetContext(),command.toString(),(result,failure)->{value.set(result);error.set(failure);done.countDown();});
        require(done.await(10,TimeUnit.SECONDS),"Native timer worker timed out");if(error.get()!=null)throw new AssertionError(error.get());return value.get();
    }
    private void shot(String name) throws Exception { Bitmap original=getUiAutomation().takeScreenshot();require(original!=null,"Native screenshot available");try(FileOutputStream out=new FileOutputStream(new File(evidence,name+".png"))){original.compress(Bitmap.CompressFormat.PNG,100,out);}float scale=Math.min(1f,960f/Math.max(original.getWidth(),original.getHeight()));Bitmap small=Bitmap.createScaledBitmap(original,Math.max(1,Math.round(original.getWidth()*scale)),Math.max(1,Math.round(original.getHeight()*scale)),true);try(FileOutputStream out=new FileOutputStream(new File(evidence,name+"-preview.jpg"))){small.compress(Bitmap.CompressFormat.JPEG,82,out);}if(small!=original)small.recycle();original.recycle(); }
    private void write(String name,String text) throws Exception { try(FileOutputStream out=new FileOutputStream(new File(evidence,name))){out.write(text.getBytes(StandardCharsets.UTF_8));} }
}
