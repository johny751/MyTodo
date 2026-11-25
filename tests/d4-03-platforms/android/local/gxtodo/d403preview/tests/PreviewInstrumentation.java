package local.gxtodo.d403preview.tests;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
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
    private final JSONArray touchTargets = new JSONArray();
    private final JSONArray touchGeometries = new JSONArray();
    private final JSONArray autocompleteNativeKeys = new JSONArray();
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
                require(BuildInfo.VERSION_NAME.equals(p.versionName)&&BuildInfo.VERSION_CODE==p.versionCode,"Actual installed package manifest matches build identity");
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
            for (String route : new String[]{"tasks","notes","pomodoro","projects","work-items","templates","processes","analytics","settings","sync","feedback","dashboard","contacts","archive","devices","data-system","about","catalogs","timeline"}) {
                final String page = route;
                check("android-touch-edge-drawer-" + page, () -> {
                    home(); js("D4Prototype.navigate(" + JSONObject.quote(page) + ")"); settle(); edgeOpen();
                    require(page.equals(js("D4Prototype.getRoute()")), "Edge gesture preserves page " + page);
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
                beginAutocompleteTrace();
                try {
                home(); tap("[data-task-id='d4-task-0'] .task-title");
                for (String kind : new String[]{"tags","projects","places"}) {
                    String host = "[data-catalog='"+kind+"']";
                    tap(host+" [role=combobox]");
                    js("(function(){var x=document.querySelector("+JSONObject.quote(host+" [role=combobox]")+");x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
                    require(Boolean.TRUE.equals(js("document.querySelector("+JSONObject.quote(host+" .catalog-list")+").children.length>0")), "Existing " + kind + " candidates");
                    String candidateId="projects".equals(kind)
                        ? (String)js("document.querySelector("+JSONObject.quote(host+" [data-action=catalog-pick]")+").dataset.id") : null;
                    if ("tags".equals(kind)) { markAutocompleteKeys("before-arrowdown-enter"); sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_DOWN)); sendKeySync(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_DOWN)); sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)); sendKeySync(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER)); markAutocompleteKeys("after-arrowdown-enter"); }
                    else tap(host+" [data-action=catalog-pick]");
                    require(Boolean.TRUE.equals(js("(function(){var closed=document.querySelector("+JSONObject.quote(host+" [role=combobox]")+").getAttribute('aria-expanded')==='false';window.__d403AutocompleteDebug.sample('selection-assertion',null,{kind:"+JSONObject.quote(kind)+",closed:closed});return closed;})()")), "Candidate selection closed " + kind);
                    if ("projects".equals(kind)) {
                        require(candidateId.equals(js("document.querySelector('[data-form=task-edit] [data-catalog=projects] [name=projectId]').value")), "Exact tapped project identity selected, not name or underlying filter");
                        require(Boolean.TRUE.equals(js("(function(){var h=document.querySelector('[data-form=task-edit] [data-catalog=projects]');var p=D4Prototype.repo.state.projects.find(p=>p.id===h.querySelector('[name=projectId]').value);return !!p&&!p.archived&&p.name===h.querySelector('[role=combobox]').value;})()")), "Selected project ID resolves to the active entity and visible name");
                    }
                }
                shot("android-task-autocomplete"); back();
                } finally { finishAutocompleteTrace(); }
            });
            check("android-page-switch-restores-task-draft", () -> {
                home(); tap("[data-task-id='d4-task-0'] .task-title");
                js("document.querySelector('[data-form=task-edit] [name=title]').value='隔离未保存草稿'");
                edgeOpen(); tap(".side-nav [data-action=go][data-id=notes]");
                require("notes".equals(js("D4Prototype.getRoute()")), "Actual drawer tap navigated to notes with draft held");
                js("DemoMobileControls.nav(false)"); edgeOpen(); tap(".side-nav [data-action=go][data-id=tasks]");
                require("tasks".equals(js("D4Prototype.getRoute()")), "Actual drawer tap returned to tasks");
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
                home(); js("D4Prototype.navigate('pomodoro')"); settle();
                Instrumentation.ActivityMonitor monitor=addMonitor(NativeTimerActivity.class.getName(),null,false);
                Activity opened;
                try {
                    tap("[data-action=personal-native-timer]");
                    opened=monitor.waitForActivityWithTimeout(20000);
                } finally { removeMonitor(monitor); }
                require(opened instanceof NativeTimerActivity,"Actual page button and preview bridge open native timer Activity");
                NativeTimerActivity timer=(NativeTimerActivity)opened;
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
            check("android-touch-single-quadrant-edge-navigation", () -> {
                home(); int quadrant=((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue();
                tap("[data-action=quadrant-focus][data-id='"+quadrant+"']");
                require(Boolean.TRUE.equals(js("!!document.querySelector('.single-quadrant [data-quadrant=\""+quadrant+"\"]')")),"Single quadrant opened through real touch");
                edgeOpen(); shot("android-single-quadrant-drawer"); back();
                require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')&&!!document.querySelector('.single-quadrant [data-quadrant=\""+quadrant+"\"]')")),"Back closes drawer while retaining the same single quadrant");
                tap("[data-action=quadrant-back]");
                require(Boolean.TRUE.equals(js("!document.querySelector('.single-quadrant')&&document.querySelectorAll('.board [data-quadrant]').length===4")),"Visible return button restores overview");
            });
            check("android-touch-single-quadrant-cross-move", () -> {
                home(); manualSort(); int source=((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue(), destination=(source+1)%4;
                Object raw=rawMovedTask(); int total=((Number)js("D4Prototype.repo.state.tasks.length")).intValue();
                tap("[data-action=quadrant-focus][data-id='"+source+"']");
                require(((Number)js("document.querySelectorAll('.quadrant-peek').length")).intValue()==3,"Single quadrant exposes all three other targets");
                String target=".quadrant-peek[data-quadrant='"+destination+"']";
                point(target,true); settle();
                float[] from=point(".single-quadrant [data-task-id='d4-task-0'] .task-title",false), to=point(target,false);
                gesture(from[0],from[1],to[0],to[1],longHold(),360); settle();
                require(((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue()==destination,"Actual single-quadrant drag commits destination");
                require(raw.equals(rawMovedTask())&&((Number)js("D4Prototype.repo.state.tasks.length")).intValue()==total,"Cross move preserves task identity, all other raw fields and task count");
                require(Boolean.TRUE.equals(js("!document.querySelector('.single-quadrant [data-task-id=\"d4-task-0\"]')")),"Source list removes the moved task");
                shot("android-single-quadrant-cross-move"); tap("[data-action=quadrant-back]");
                tap("[data-action=task-menu][data-id='d4-task-0']");
                tap("[data-action=task-move][data-id='d4-task-0|"+source+"']");
                require(((Number)js("D4Prototype.repo.getTask('d4-task-0').quadrant")).intValue()==source&&raw.equals(rawMovedTask()),"Real task menu moves the original entity back without changing other fields");
            });
            check("android-touch-note-create-edit-delete", () -> {
                home(); Object tasks=js("JSON.stringify(D4Prototype.repo.state.tasks)"), notes=js("JSON.stringify(D4Prototype.repo.state.notes)");
                int count=((Number)js("D4Prototype.repo.state.notes.length")).intValue();
                openPageByTouch("notes"); tap("[data-action=personal-note-new]");
                typeText("[data-form=personal-note] [name=body]","Native note created");
                tap("[data-form=personal-note] button[type=submit]");
                require(((Number)js("D4Prototype.repo.state.notes.length")).intValue()==count+1,"Real note save creates exactly one independent entity");
                JSONObject note=(JSONObject)js("D4Prototype.repo.state.notes.find(n=>n.body==='Native note created')");
                String id=note.getString("id"), createdAt=note.getString("createdAt");
                require(Boolean.TRUE.equals(js("document.querySelector('[data-note-id=\""+id+"\"] .note-body').textContent==='Native note created'")),"Created note appears in the visible list");
                tap("[data-action=personal-note-edit][data-id='"+id+"']");
                typeText("[data-form=personal-note] [name=body]","Native note edited");
                tap("[data-form=personal-note] button[type=submit]");
                note=(JSONObject)js("D4Prototype.repo.state.notes.find(n=>n.id==="+JSONObject.quote(id)+")");
                require("Native note edited".equals(note.getString("body"))&&createdAt.equals(note.getString("createdAt")),"Real edit retains ID and original creation time");
                openPageByTouch("tasks"); openPageByTouch("notes");
                require(Boolean.TRUE.equals(js("document.querySelector('[data-note-id=\""+id+"\"] .note-body').textContent==='Native note edited'")),"Edited note survives actual page navigation");
                shot("android-note-edited"); tap("[data-action=personal-note-delete][data-id='"+id+"']");
                require(((Number)js("D4Prototype.repo.state.notes.length")).intValue()==count+1,"Delete prompt does not delete before confirmation");
                tap("[data-action=personal-note-delete-confirm][data-id='"+id+"']");
                require(notes.equals(js("JSON.stringify(D4Prototype.repo.state.notes)"))&&tasks.equals(js("JSON.stringify(D4Prototype.repo.state.tasks)")),"Confirmed deletion removes only the new note, preserving original notes and every task");
                require(Boolean.TRUE.equals(js("!document.querySelector('[data-note-id=\""+id+"\"]')")),"Deleted note leaves the visible list");
            });
            check("android-touch-feedback-local-text-submit", () -> {
                home(); Object tasks=js("JSON.stringify(D4Prototype.repo.state.tasks)"); openPageByTouch("feedback");
                int count=((Number)js("(D4Prototype.repo.demo.personal?.feedback?.ideas||[]).length")).intValue();
                tap("[data-action=personal-feedback-new]");
                typeText("[data-form=personal-feedback] [name=title]","Native local feedback");
                typeText("[data-form=personal-feedback] [name=body]","Text submitted through Android touch and keyboard");
                tap("[data-form=personal-feedback] button[type=submit]");
                require(((Number)js("D4Prototype.repo.demo.personal.feedback.ideas.length")).intValue()==count+1,"Real feedback submit saves exactly one local idea");
                JSONObject idea=(JSONObject)js("D4Prototype.repo.demo.personal.feedback.ideas.find(i=>i.title==='Native local feedback')");
                String id=idea.getString("id");
                require("Text submitted through Android touch and keyboard".equals(idea.getString("body"))&&"pending".equals(idea.getString("status"))&&idea.getJSONArray("images").length()==0,"Submitted text and pending status match the form, without fabricated attachments");
                openPageByTouch("tasks"); openPageByTouch("feedback");
                require(Boolean.TRUE.equals(js("document.querySelector('[data-feedback-id=\""+id+"\"] .note-body').textContent==='Text submitted through Android touch and keyboard'")),"Saved feedback is visible after navigation");
                require(tasks.equals(js("JSON.stringify(D4Prototype.repo.state.tasks)")),"Feedback remains in its independent synthetic domain");
                shot("android-feedback-local-submitted");
            });
            check("android-touch-sync-state-and-devices", () -> {
                home(); Object tasks=js("JSON.stringify(D4Prototype.repo.state.tasks)"); openPageByTouch("sync");
                require(Boolean.TRUE.equals(js("(function(){var p=document.querySelector('[data-provider=synthetic]'),labels=Array.from(p.querySelectorAll('dt')).map(x=>x.textContent);return ['状态','上次模拟时间','合成待同步数量','当前设备','错误原因'].every(x=>labels.includes(x))&&Array.from(p.querySelectorAll('dd')).every(x=>x.textContent.trim().length>0);})()")),"Sync state, timestamp, pending count, current device and error fields are visible");
                int pending=((Number)js("D4Prototype.repo.demo.personal?.sync?.pending??3")).intValue();
                tap("[data-action=personal-sync-error]");
                require(Boolean.TRUE.equals(js("document.querySelector('[data-sync-status=error]').textContent==='模拟失败'&&document.querySelector('[data-provider=synthetic]').textContent.includes(D4Prototype.repo.demo.personal.sync.error)&&D4Prototype.repo.demo.personal.sync.error.length>0")),"Actual simulated-error button exposes exact error state");
                require(((Number)js("D4Prototype.repo.demo.personal.sync.pending")).intValue()==pending,"Error preserves the pending synthetic count");
                tap("[data-action=personal-sync-success]");
                JSONObject sync=(JSONObject)js("D4Prototype.repo.demo.personal.sync");
                require("success".equals(sync.getString("status"))&&sync.getInt("pending")==0&&!sync.getString("lastSync").isEmpty()&&sync.getString("error").isEmpty(),"Actual simulated-success button updates local fields and clears the error");
                require(Boolean.TRUE.equals(js("document.querySelector('[data-sync-status=success]').textContent==='模拟成功'&&document.querySelector('[data-sync-pending]').textContent==='0'&&document.querySelector('[data-provider=synthetic]').textContent.includes(D4Prototype.repo.demo.personal.sync.lastSync)&&document.querySelectorAll('.activity-list li').length>=2")),"Visible status, pending count, timestamp and history follow the saved synthetic state");
                shot("android-sync-local-state"); openPageByTouch("devices");
                require(Boolean.TRUE.equals(js("(function(){var ds=D4Prototype.repo.demo.personal.devices,cards=document.querySelectorAll('[data-device-id]');return ds.length>0&&cards.length===ds.length&&ds.every(d=>{var e=Array.from(cards).find(x=>x.dataset.deviceId===d.id);return !!e&&e.querySelector('h2').textContent===d.name&&e.textContent.includes(d.type)&&e.textContent.includes(d.id)&&e.textContent.includes(d.connected?'模拟已连接':'模拟未连接')&&e.textContent.includes(d.lastSync||'尚无');});})()")),"Device name, identity, type, connection and last-sync fields match each synthetic device");
                require(Boolean.TRUE.equals(js("D4Prototype.repo.demo.personal.devices.some(d=>d.current&&d.connected&&d.lastSync===D4Prototype.repo.demo.personal.sync.lastSync)")),"Current synthetic device reflects the actual simulated success");
                require(tasks.equals(js("JSON.stringify(D4Prototype.repo.state.tasks)")),"Simulated synchronization does not mutate task data");
                shot("android-synthetic-devices");
            });
            check("android-native-timer-real-early-end-button", () -> {
                home(); openPageByTouch("pomodoro");
                Instrumentation.ActivityMonitor monitor=addMonitor(NativeTimerActivity.class.getName(),null,false); Activity opened;
                try { tap("[data-action=personal-native-timer]"); opened=monitor.waitForActivityWithTimeout(20000); }
                finally { removeMonitor(monitor); }
                require(opened instanceof NativeTimerActivity,"Actual page button opens native timer for early end");
                NativeTimerActivity activity=(NativeTimerActivity)opened; int completed=timer("snapshot").getInt("completedSessionsToday");
                nativeTap(activity,40302); SystemClock.sleep(1200);
                require(timer("snapshot").getBoolean("running")&&timer("snapshot").getLong("elapsedMillis")>0,"Actual start button begins an advancing session");
                nativeTap(activity,40306); JSONObject stopped=timer("snapshot");
                require(!stopped.getBoolean("running")&&!stopped.getBoolean("completed")&&stopped.getLong("elapsedMillis")==0&&stopped.getInt("completedSessionsToday")==completed,"Actual early-end button resets active time without recording a completed session");
                AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
                require(root!=null&&nativeTextContains(root,"已暂停 / 待开始"),"Native status visibly reflects early end");
                shot("android-native-early-end"); back();
                require("pomodoro".equals(js("D4Prototype.getRoute()")),"Android Back returns from native timer to its page");
                stopped=timer("reopen-for-isolated-test");
                require(!stopped.getBoolean("running")&&!stopped.getBoolean("completed")&&stopped.getLong("elapsedMillis")==0,"Actual early-end state persists across store reopen");
            });
        } catch (Throwable fatal) { record("instrumentation-setup-or-fatal", fatal, 0); }
        try {
            JSONObject report=new JSONObject().put("kind","mytodo-d403-native-isolated-evidence").put("sourceSha",BuildInfo.SOURCE_SHA)
                .put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT).put("htmlSha256",BuildInfo.HTML_SHA256)
                .put("versionName",BuildInfo.VERSION_NAME).put("versionCode",BuildInfo.VERSION_CODE).put("buildTimeUTC",BuildInfo.BUILD_TIME_UTC)
                .put("platform","Android emulator: actual WebView MotionEvent and native elapsedRealtime")
                .put("packageName",getTargetContext().getPackageName()).put("total",passed+failed).put("passed",passed).put("failed",failed).put("tests",rows)
                .put("productionDatabase",false).put("productionSync",false)
                .put("unverified",new JSONArray().put("Physical handset touch and accessibility").put("Original production notification service, process-death and lockscreen regression").put("Original Win32 native task regression"));
            write("report.json",report.toString(2));
            write("touch-targets.json",touchTargets.toString(2));
            write("touch-geometries.json",touchGeometries.toString(2));
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
    private void launch() throws Exception { main=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));waitLoaded(); }
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
        JSONObject rect=(JSONObject)js("(function(){var e=document.querySelector("+JSONObject.quote(selector)+");if(!e)throw Error('Missing '+"+JSONObject.quote(selector)+");"+(scroll?"e.scrollIntoView({block:'center',inline:'nearest'});":"")+
            "var r=e.getBoundingClientRect(),v=window.visualViewport,l=Math.max(0,r.left),t=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,v?v.height:innerHeight,r.bottom);"+
            "for(var p=e.parentElement;p;p=p.parentElement){var c=getComputedStyle(p),b=p.getBoundingClientRect();if(/^(auto|scroll|hidden|clip)$/.test(c.overflowX)){l=Math.max(l,b.left+p.clientLeft);right=Math.min(right,b.left+p.clientLeft+p.clientWidth);}if(/^(auto|scroll|hidden|clip)$/.test(c.overflowY)){t=Math.max(t,b.top+p.clientTop);bottom=Math.min(bottom,b.top+p.clientTop+p.clientHeight);}}"+
            "var x=(l+right)/2,y=(t+bottom)/2,hit=document.elementFromPoint(x,y);return {x:x,y:y,visible:right-l>2&&bottom-t>2,hitMatches:!!hit&&(hit===e||e.contains(hit)),hit:hit?hit.tagName+':'+hit.className:null,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},clip:{left:l,top:t,right:right,bottom:bottom},innerWidth:innerWidth,innerHeight:innerHeight,devicePixelRatio:devicePixelRatio,visualViewport:v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}:null};})()");
        touchTargets.put(new JSONObject().put("selector",selector).put("scroll",scroll).put("observation",rect));
        write("touch-targets.json",touchTargets.toString(2));
        requireSimpleViewport(rect,"DOM point "+selector);
        require(rect.getBoolean("visible")&&rect.getBoolean("hitMatches"), "Actual visible touch target must win elementFromPoint: "+selector+" "+rect);
        return new float[]{(float)rect.getDouble("x"),(float)rect.getDouble("y")};
    }
    private void tap(String selector) throws Exception { point(selector,true);SystemClock.sleep(200);float[] p=point(selector,false);gesture(p[0],p[1],p[0],p[1],0,0);settle(); }
    private void beginAutocompleteTrace() throws Exception {
        js("(function(){var rows=[],dropped=0;function describe(e){return e&&e.nodeType===1?{tag:e.tagName,name:e.getAttribute('name'),action:e.getAttribute('data-action'),catalog:e.closest('[data-catalog]')?.dataset.catalog||null}:null;}"+
            "function sample(stage,event,extra){if(rows.length>=512){dropped++;return;}var active=document.activeElement,v=window.visualViewport;rows.push({wallMillis:Date.now(),performanceMillis:performance.now(),stage:stage,event:event?{type:event.type,key:event.key||null,code:event.code||null,keyCode:event.keyCode||0,isComposing:!!event.isComposing,defaultPrevented:event.defaultPrevented,isTrusted:event.isTrusted,target:describe(event.target)}:null,active:describe(active),documentHasFocus:document.hasFocus(),viewport:v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}:null,catalogs:Array.from(document.querySelectorAll('[data-form=task-edit] [data-catalog]')).map(h=>{var i=h.querySelector('[role=combobox]'),hidden=h.querySelector('[name=tags],[name=projectId]');return {kind:h.dataset.catalog,value:i?.value||'',expanded:i?.getAttribute('aria-expanded'),focused:active===i,hiddenValue:hidden?.value||null,candidates:Array.from(h.querySelectorAll('.catalog-list button')).map(b=>({id:b.dataset.id,selected:b.classList.contains('selected')}))};}),extra:extra||null});}"+
            "var types=['pointerdown','pointerup','click','focusin','focusout','keydown','keyup','beforeinput','input','compositionstart','compositionend'];var capture=e=>sample('capture',e),bubble=e=>sample('bubble',e);types.forEach(t=>{document.addEventListener(t,capture,true);document.addEventListener(t,bubble,false);});"+
            "var observer=new MutationObserver(records=>{var relevant=records.filter(r=>r.target.nodeType===1&&r.target.closest('[data-catalog]'));if(relevant.length)sample('catalog-mutations',null,{records:relevant.map(r=>({type:r.type,attribute:r.attributeName,oldValue:r.oldValue,target:describe(r.target)}))});});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['aria-expanded','class']});"+
            "window.__d403AutocompleteDebug={sample:sample,read:()=>({events:rows,dropped:dropped}),dispose:()=>{observer.disconnect();types.forEach(t=>{document.removeEventListener(t,capture,true);document.removeEventListener(t,bubble,false);});}};sample('trace-start',null);return true;})()");
    }
    private void markAutocompleteKeys(String stage) throws Exception {
        autocompleteNativeKeys.put(new JSONObject().put("stage",stage).put("wallMillis",System.currentTimeMillis())
            .put("uptimeMillis",SystemClock.uptimeMillis()).put("elapsedRealtimeMillis",SystemClock.elapsedRealtime()));
    }
    private void finishAutocompleteTrace() {
        try {
            JSONObject trace=(JSONObject)js("(function(){var d=window.__d403AutocompleteDebug;if(!d)return {missing:true};d.sample('final-read',null);var result=d.read();d.dispose();delete window.__d403AutocompleteDebug;return result;})()");
            trace.put("nativeKeyDispatch",autocompleteNativeKeys);
            if(Build.VERSION.SDK_INT>=30){final boolean[] known=new boolean[1],visible=new boolean[1];runOnMainSync(()->{WindowInsets i=main.previewWebView().getRootWindowInsets();known[0]=i!=null;visible[0]=i!=null&&i.isVisible(WindowInsets.Type.ime());});trace.put("finalImeObservation",new JSONObject().put("known",known[0]).put("visible",visible[0]));}
            write("autocomplete-event-trace.json",trace.toString(2));
        } catch(Throwable error) { try { write("autocomplete-trace-error.log",error.toString()); } catch(Exception ignored) {} }
    }
    private void openPageByTouch(String route) throws Exception {
        edgeOpen(); tap(".side-nav [data-action=go][data-id='"+route+"']");
        require(route.equals(js("D4Prototype.getRoute()")),"Real drawer item opens "+route);
        require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')")),"Real page selection closes the drawer");
    }
    private void typeText(String selector,String text) throws Exception {
        require(text.matches("[ -~]*"),"Native keyboard helper accepts deterministic ASCII text only");
        dismissImeIfVisible(); tap(selector);
        require(Boolean.TRUE.equals(js("document.activeElement===document.querySelector("+JSONObject.quote(selector)+")")),"Actual tap focuses the requested text field");
        long now=SystemClock.uptimeMillis();
        sendKeySync(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A,0,KeyEvent.META_CTRL_ON));
        sendKeySync(new KeyEvent(now,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_A,0,KeyEvent.META_CTRL_ON));
        sendKeySync(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DEL));
        sendKeySync(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DEL));
        sendStringSync(text); settle();
        require(text.equals(js("document.querySelector("+JSONObject.quote(selector)+").value")),"Native key events replace the field with the exact expected text");
        dismissImeIfVisible();
        require(text.equals(js("document.querySelector("+JSONObject.quote(selector)+").value")),"Dismissing the observed IME retains the form and text");
    }
    private void dismissImeIfVisible() throws Exception {
        require(Build.VERSION.SDK_INT>=30,"Native text evidence requires observed API30+ IME visibility");
        final boolean[] visible=new boolean[1],known=new boolean[1];
        runOnMainSync(()->{WindowInsets insets=main.previewWebView().getRootWindowInsets();known[0]=insets!=null;if(insets!=null)visible[0]=insets.isVisible(WindowInsets.Type.ime());});
        require(known[0],"IME visibility must be observed before sending Back");
        if(visible[0]) {
            back();
            runOnMainSync(()->{WindowInsets insets=main.previewWebView().getRootWindowInsets();known[0]=insets!=null;visible[0]=insets!=null&&insets.isVisible(WindowInsets.Type.ime());});
            require(known[0]&&!visible[0],"Real Android Back dismisses the visible keyboard");
        }
    }
    private void edgeOpen() throws Exception { gesture(3,150,140,152,0,300);settle();require(Boolean.TRUE.equals(js("!!document.querySelector('.app-shell.nav-open')")),"Actual left-edge touch opened drawer before a menu interaction"); }
    private void gesture(float sx,float sy,float ex,float ey,long hold,long duration) throws Exception {
        JSONObject geometry=(JSONObject)js("(function(){var v=window.visualViewport;return {innerWidth:innerWidth,innerHeight:innerHeight,devicePixelRatio:devicePixelRatio,visualViewport:v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}:null};})()");
        double cssWidth=geometry.getDouble("innerWidth");final int[] origin=new int[2];final int[] size=new int[2];runOnMainSync(()->{WebView w=main.previewWebView();w.getLocationOnScreen(origin);size[0]=w.getWidth();size[1]=w.getHeight();});
        geometry.put("webView",new JSONObject().put("screenX",origin[0]).put("screenY",origin[1]).put("widthPixels",size[0]).put("heightPixels",size[1]));
        geometry.put("cssGesture",new JSONObject().put("startX",sx).put("startY",sy).put("endX",ex).put("endY",ey).put("holdMs",hold).put("durationMs",duration));
        touchGeometries.put(geometry);write("touch-geometries.json",touchGeometries.toString(2));
        requireSimpleViewport(geometry,"Native CSS-to-pixel gesture");
        require(cssWidth>0&&size[0]>0&&size[1]>0,"Actual CSS and native WebView bounds must be positive: "+geometry);
        float scale=(float)(size[0]/cssWidth);long down=SystemClock.uptimeMillis();input(down,down,MotionEvent.ACTION_DOWN,origin[0]+sx*scale,origin[1]+sy*scale);SystemClock.sleep(hold);
        int steps=duration==0?0:12;for(int i=1;i<=steps;i++){SystemClock.sleep(duration/steps);input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,origin[0]+(sx+(ex-sx)*i/steps)*scale,origin[1]+(sy+(ey-sy)*i/steps)*scale);}
        input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,origin[0]+ex*scale,origin[1]+ey*scale);
    }
    private static void requireSimpleViewport(JSONObject geometry,String context) throws Exception {
        JSONObject viewport=geometry.optJSONObject("visualViewport");
        require(viewport!=null,"Observed visualViewport is required before native touch mapping: "+context+" "+geometry);
        require(Math.abs(viewport.getDouble("offsetLeft"))<.5&&Math.abs(viewport.getDouble("offsetTop"))<.5
            &&Math.abs(viewport.getDouble("scale")-1d)<.001
            &&Math.abs(viewport.getDouble("width")-geometry.getDouble("innerWidth"))<.5,
            "Unsupported visualViewport offset/zoom/width; native coordinate conversion is unverified: "+context+" "+geometry);
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
