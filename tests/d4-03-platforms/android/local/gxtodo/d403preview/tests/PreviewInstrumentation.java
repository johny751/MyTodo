package local.gxtodo.d403preview.tests;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityEvent;
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
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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
                try {
                js("D4Prototype.navigate('about')"); settle();
                require(Boolean.TRUE.equals(js("document.querySelector('.version-info').textContent.includes(JSON.parse(GxD4Preview.versionInfo()).versionName)&&document.querySelector('.version-info').textContent.includes(String(JSON.parse(GxD4Preview.versionInfo()).versionCode))")),"About page displays actual APK identity");
                tap("[data-action=personal-apk-version]");
                AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
                require(root!=null&&nativeTextContains(root,BuildInfo.VERSION_NAME)&&nativeTextContains(root,BuildInfo.BUILD_TIME_UTC),"Real Android version dialog contains injected APK name and UTC build time");
                shot("android-apk-version"); verifyNativeVersionButtons();home();
                } catch(Throwable failure) {
                    try { shot("failure-native-version-before-cleanup"); }
                    catch(Throwable evidenceError) { failure.addSuppressed(evidenceError); }
                    try { cleanupNativeVersionDialogs(); }
                    catch(Throwable cleanupError) { failure.addSuppressed(cleanupError); }
                    throw failure;
                }
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

            check("android-touch-held-drag-autoscroll", () -> withDragFixture("native-held-drag", () -> {
                js("(function(){var s=D4Prototype.repo.state;s.tasks=[];D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(s);for(var i=0;i<50;i++)D4Prototype.repo.createTask({id:'d403-native-long-'+i,title:'Native long list '+i,quadrant:0,start:DemoDomain.helpers.dayKey()+'T12:00',notes:'Retained notes '+i,tags:['native-drag-fixture']});});return true;})()");
                settle(); manualSort(); tap("[data-action=quadrant-focus][data-id='0']");
                String list=".single-quadrant [data-quadrant='0'] .quadrant-list";
                String source=list+" .task-row:first-child .task-title";
                float[] start=point(source,true),edge=dragDropPoint(list,false);
                Object before=js("JSON.stringify(D4Prototype.repo.state.tasks)"), raw=dragFixtureRaw();
                Object ids=js("JSON.stringify(D4Prototype.repo.state.tasks.map(t=>t.id))");
                double scrollBefore=((Number)js("document.querySelector("+JSONObject.quote(list)+").scrollTop")).doubleValue();
                JSONObject observed=new JSONObject().put("source","real Android MotionEvent").put("scrollBefore",scrollBefore);
                try (NativeDragTouch touch=new NativeDragTouch("held-drag-autoscroll")) {
                    try {
                        touch.down(start); SystemClock.sleep(longHold());
                        require(Boolean.TRUE.equals(js("!!document.querySelector('.dragging')&&!!document.querySelector('.drag-ghost')")),"Real long hold activates drag before movement");
                        touch.move(edge,450); SystemClock.sleep(800);
                        double scrollHeld=((Number)js("document.querySelector("+JSONObject.quote(list)+").scrollTop")).doubleValue();
                        boolean active=Boolean.TRUE.equals(js("!!document.querySelector('.dragging')&&!!document.querySelector('.drag-ghost')"));
                        observed.put("heldBeforeActionUp",true).put("scrollHeld",scrollHeld).put("dragActive",active);
                        write("native-held-drag-observation.json",observed.toString(2));
                        require(active&&scrollHeld>scrollBefore+30,"List scrollTop increases while the real finger remains down");
                        require(before.equals(js("JSON.stringify(D4Prototype.repo.state.tasks)")),"Held drag does not commit task mutations before ACTION_UP");
                        shot("android-native-held-drag-autoscroll");
                        touch.up(edge);
                    } catch(Exception|Error error) {
                        try { shot("failure-native-held-drag-before-cancel"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
                        throw error;
                    }
                }
                settle();
                require(raw.equals(dragFixtureRaw()),"Released long-list drag preserves every ID and every non-order task field");
                require(((Number)js("D4Prototype.repo.state.tasks.length")).intValue()==50,"Every synthetic long-list task remains present");
                require(!ids.equals(js("JSON.stringify(D4Prototype.repo.state.tasks.map(t=>t.id))")),"Dropping after held auto-scroll actually changes the order");
                require(Boolean.TRUE.equals(js("!document.querySelector('.dragging,.drag-ghost,.drop-target,.swiping,.app-shell.nav-open,#modal-root .modal-shade')")),"Released drag clears gesture decorations and does not open another surface");
            }));
            check("android-touch-subtask-order-immediate-close", () -> withDragFixture("native-subtask-close", () -> {
                js("(function(){var s=D4Prototype.repo.state;s.tasks=[];D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(s);D4Prototype.repo.createTask({id:'d403-native-parent',title:'Native parent fixture',notes:'Original parent notes',quadrant:0,start:DemoDomain.helpers.dayKey()+'T12:00'});D4Prototype.repo.createTask({id:'d403-native-child-a',title:'Native first child',notes:'Raw A',tags:['A,comma'],place:'Room A'},'d403-native-parent');D4Prototype.repo.createTask({id:'d403-native-child-b',title:'Native second child',notes:'Raw B',tags:['B'],place:'Room B'},'d403-native-parent');});return true;})()");
                settle(); manualSort(); tap("[data-task-id='d403-native-parent'] [data-action=task-open]");
                String draft="Native parent draft retained through child order";
                Object beforeChildren=js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))");
                typeText("[data-form=task-edit] [name=notes]",draft);
                require("Original parent notes".equals(js("D4Prototype.repo.getTask('d403-native-parent').notes")),"Native text input remains an unsaved parent draft");
                String handle="[data-subtask-list] [data-task-id='d403-native-child-a'] .drag-handle";
                String other="[data-subtask-list] [data-task-id='d403-native-child-b']";
                float[] start=point(handle,true),after=dragDropPoint(other,true);
                try (NativeDragTouch touch=new NativeDragTouch("subtask-order")) {
                    try {
                        touch.down(start);SystemClock.sleep(100);
                        require(Boolean.TRUE.equals(js("!!document.querySelector('[data-task-id=d403-native-child-a].dragging')")),"Real handle touch activates the child drag");
                        touch.move(after,300);touch.up(after);
                    } catch(Exception|Error error) {
                        try { shot("failure-native-subtask-drag-before-cancel"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
                        throw error;
                    }
                }
                waitForIdleSync();
                require(Boolean.TRUE.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>t.id))===JSON.stringify(['d403-native-child-b','d403-native-child-a'])")),"Real drag moves the first child after its sibling");
                require(Boolean.TRUE.equals(js("JSON.stringify(Array.from(document.querySelectorAll('[data-subtask-list] .task-row')).map(r=>r.dataset.taskId))===JSON.stringify(['d403-native-child-b','d403-native-child-a'])")),"Visible sibling DOM order updates immediately");
                require(beforeChildren.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))")),"Sorting preserves every child non-order field");
                require("Original parent notes".equals(js("D4Prototype.repo.getTask('d403-native-parent').notes"))&&draft.equals(js("document.querySelector('[data-form=task-edit] [name=notes]').value")),"Sorting retains the unsaved parent notes without saving them");
                require(Boolean.TRUE.equals(js("D4Prototype.repo.state.tasks.length===1&&!D4Prototype.repo.state.tasks.some(t=>t.id==='d403-native-child-a'||t.id==='d403-native-child-b')")),"Children remain children and are not promoted");
                // Prepare both hit-tested coordinates before the suppression window starts.
                float[] handlePoint=point(handle,false),closePoint=point("[data-action=close-modal]",false);
                js("(function(){var p={batches:0,events:[]};p.stop=D4Prototype.repo.subscribe((s,d)=>{if(d.type==='batch')p.batches++;});p.end=e=>{if(e.target.closest('[data-task-id=d403-native-child-a] .drag-handle')){p.handleEnd=performance.now();p.handleTrusted=e.isTrusted;p.batchesAtHandleEnd=p.batches;}};p.click=e=>{if(e.target.closest('[data-action=close-modal]')){p.closeClick=performance.now();p.closeTrusted=e.isTrusted;}};p.observer=new MutationObserver(()=>{if(p.closeClick&&!document.querySelector('[data-form=task-edit]')&&!p.closedAt)p.closedAt=performance.now();});p.observer.observe(document.querySelector('#modal-root'),{childList:true,subtree:true});document.addEventListener('touchend',p.end);document.addEventListener('click',p.click,true);window.__d403NativeCloseProbe=p;return true;})()");
                long released,closeDown,closeUp;
                try (NativeDragTouch touch=new NativeDragTouch("subtask-immediate-close")) {
                    try {
                        touch.down(handlePoint);SystemClock.sleep(60);released=touch.up(handlePoint);
                        closeDown=touch.down(closePoint);closeUp=touch.up(closePoint);
                    } catch(Exception|Error error) {
                        try { shot("failure-native-subtask-close-before-cancel"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
                        throw error;
                    }
                }
                waitForIdleSync();
                JSONObject probe=(JSONObject)js("(function(){var p=window.__d403NativeCloseProbe;return {handleEnd:p.handleEnd,handleTrusted:p.handleTrusted,batchesAtHandleEnd:p.batchesAtHandleEnd,closeClick:p.closeClick,closeTrusted:p.closeTrusted,closedAt:p.closedAt,modalStillOpen:!!document.querySelector('[data-form=task-edit]'),dirty:!!document.querySelector('.dragging,.drag-ghost,.drop-target,.swiping')};})()");
                probe.put("nativeHandleReleaseUptimeMs",released).put("nativeCloseDownUptimeMs",closeDown).put("nativeCloseUpUptimeMs",closeUp).put("nativeCloseAfterReleaseMs",closeUp-released);
                write("native-subtask-immediate-close.json",probe.toString(2));
                require(closeUp-released<500,"Actual Close touch finishes within 500ms of the real handle release");
                require(probe.optBoolean("handleTrusted")&&probe.optBoolean("closeTrusted"),"Observed handle touchend and Close click are trusted browser events");
                require(probe.optInt("batchesAtHandleEnd",-1)==1,"One real handle touch commits exactly one repository batch");
                require(probe.has("closedAt")&&probe.has("handleEnd")&&probe.getDouble("closedAt")>=probe.getDouble("handleEnd")&&probe.getDouble("closedAt")-probe.getDouble("handleEnd")<500,"The modal is actually removed inside the original 500ms click-suppression window");
                require(!probe.getBoolean("modalStillOpen")&&!probe.getBoolean("dirty"),"Immediate Close dismisses the editor and leaves no active gesture");
                require(draft.equals(js("D4Prototype.repo.getTask('d403-native-parent').notes")),"Explicit Close saves the preserved parent draft");
                require(Boolean.TRUE.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>t.id))===JSON.stringify(['d403-native-child-b','d403-native-child-a'])")),"Immediate Close retains the new sibling order");
                tap("[data-task-id='d403-native-parent'] [data-action=task-open]");
                require(draft.equals(js("document.querySelector('[data-form=task-edit] [name=notes]').value")),"Reopening shows the exact saved parent draft");
                require(beforeChildren.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))")),"Close and reopen preserve child identities and raw fields");
                shot("android-native-subtask-draft-reopened");
            }));

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

    /** Fixtures are synthetic only and are restored after each added case, including failures. */
    private void withDragFixture(String name,Check body) throws Exception {
        home();
        String state=(String)js("JSON.stringify(D4Prototype.repo.state)"),demo=(String)js("JSON.stringify(D4Prototype.repo.demo)");
        Throwable failure=null;
        try { body.run(); }
        catch(Exception|Error error) {
            failure=error;
            try { shot("failure-"+name+"-before-cleanup"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
            throw error;
        } finally {
            try {
                js("(function(){var p=window.__d403NativeCloseProbe;if(p){p.stop();p.observer.disconnect();document.removeEventListener('touchend',p.end);document.removeEventListener('click',p.click,true);delete window.__d403NativeCloseProbe;}DemoMobileControls.cancel();return true;})()");
                home();
                js("(function(){D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(JSON.parse("+JSONObject.quote(state)+"));D4Prototype.repo.updateDemo(()=>JSON.parse("+JSONObject.quote(demo)+"));});return true;})()");
                settle();
                require(state.equals(js("JSON.stringify(D4Prototype.repo.state)")),"Synthetic drag fixture restores the entire previous core state");
                require(demo.equals(js("JSON.stringify(D4Prototype.repo.demo)")),"Synthetic drag fixture restores the entire previous demo state without leftover keys");
            } catch(Exception|Error cleanup) {
                if(failure!=null)failure.addSuppressed(cleanup);else throw cleanup;
            }
        }
    }
    private Object dragFixtureRaw() throws Exception {
        return js("JSON.stringify(D4Prototype.repo.state.tasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))");
    }
    /** Observe clipping and real hit testing; no scrolling is performed by this helper. */
    private float[] dragDropPoint(String selector,boolean afterRow) throws Exception {
        JSONObject r=(JSONObject)js("(function(){var e=document.querySelector("+JSONObject.quote(selector)+");if(!e)throw Error('Missing drag target');var r=e.getBoundingClientRect(),v=visualViewport,l=Math.max(0,r.left),t=Math.max(0,r.top),b=Math.min(innerHeight,v.height,r.bottom),right=Math.min(innerWidth,r.right);for(var p=e.parentElement;p;p=p.parentElement){var c=getComputedStyle(p),q=p.getBoundingClientRect();if(/^(auto|scroll|hidden|clip)$/.test(c.overflowX)){l=Math.max(l,q.left+p.clientLeft);right=Math.min(right,q.left+p.clientLeft+p.clientWidth);}if(/^(auto|scroll|hidden|clip)$/.test(c.overflowY)){t=Math.max(t,q.top+p.clientTop);b=Math.min(b,q.top+p.clientTop+p.clientHeight);}}var x=(l+right)/2,y=b-12,hit=document.elementFromPoint(x,y);return {x:x,y:y,visible:right-l>4&&b-t>24,hitMatches:!!hit&&(hit===e||e.contains(hit)),belowRowCenter:y>r.top+r.height/2,innerWidth:innerWidth,innerHeight:innerHeight,visualViewport:{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}};})()");
        touchTargets.put(new JSONObject().put("selector",selector).put("purpose",afterRow?"drop-after-row":"held-bottom-edge").put("observation",r));
        write("touch-targets.json",touchTargets.toString(2));
        requireSimpleViewport(r,"Native held/drop target");
        require(r.getBoolean("visible")&&r.getBoolean("hitMatches")&&(!afterRow||r.getBoolean("belowRowCenter")),"Visible drag drop target wins hit testing and is below the target row midpoint when required: "+r);
        return new float[]{(float)r.getDouble("x"),(float)r.getDouble("y")};
    }
    /** One native geometry mapping, with explicit cancellation of any unfinished real touch. */
    private final class NativeDragTouch implements AutoCloseable {
        private final float scale;
        private final int[] origin=new int[2];
        private long down;
        private float lastX,lastY;
        private boolean active;
        NativeDragTouch(String purpose) throws Exception {
            JSONObject geometry=(JSONObject)js("(function(){var v=visualViewport;return {innerWidth:innerWidth,innerHeight:innerHeight,devicePixelRatio:devicePixelRatio,visualViewport:{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}};})()");
            final int[] size=new int[2];
            runOnMainSync(()->{WebView w=main.previewWebView();w.getLocationOnScreen(origin);size[0]=w.getWidth();size[1]=w.getHeight();});
            requireSimpleViewport(geometry,"Native drag sequence "+purpose);
            require(size[0]>0&&size[1]>0&&geometry.getDouble("innerWidth")>0,"Positive native drag geometry");
            scale=(float)(size[0]/geometry.getDouble("innerWidth"));
            geometry.put("purpose",purpose).put("webView",new JSONObject().put("screenX",origin[0]).put("screenY",origin[1]).put("widthPixels",size[0]).put("heightPixels",size[1]));
            touchGeometries.put(geometry);write("touch-geometries.json",touchGeometries.toString(2));
        }
        long down(float[] css) {
            require(!active,"Previous native touch must be released");
            lastX=origin[0]+css[0]*scale;lastY=origin[1]+css[1]*scale;
            down=SystemClock.uptimeMillis();active=true;input(down,down,MotionEvent.ACTION_DOWN,lastX,lastY);return down;
        }
        void move(float[] css,long duration) {
            require(active,"Native move requires a held touch");
            float sx=lastX,sy=lastY,ex=origin[0]+css[0]*scale,ey=origin[1]+css[1]*scale;
            for(int i=1;i<=12;i++){SystemClock.sleep(duration/12);lastX=sx+(ex-sx)*i/12;lastY=sy+(ey-sy)*i/12;input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,lastX,lastY);}
        }
        long up(float[] css) {
            require(active,"Native release requires a held touch");
            lastX=origin[0]+css[0]*scale;lastY=origin[1]+css[1]*scale;long now=SystemClock.uptimeMillis();
            input(down,now,MotionEvent.ACTION_UP,lastX,lastY);active=false;return now;
        }
        @Override public void close() {
            if(active){try{input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_CANCEL,lastX,lastY);}finally{active=false;}}
        }
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
    private void verifyNativeVersionButtons() throws Exception {
        JSONObject proof=new JSONObject().put("kind","mytodo-d403-native-version-button-evidence")
            .put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT)
            .put("htmlSha256",BuildInfo.HTML_SHA256).put("versionName",BuildInfo.VERSION_NAME)
            .put("versionCode",BuildInfo.VERSION_CODE).put("buildTimeUTC",BuildInfo.BUILD_TIME_UTC)
            .put("productionDatabase",false).put("productionSync",false);
        JSONArray actions=new JSONArray();proof.put("nativeActions",actions);
        final ClipboardManager clipboard=(ClipboardManager)main.getSystemService(Context.CLIPBOARD_SERVICE);
        final ClipData[] originalClip=new ClipData[1];final boolean[] clipboardOwned=new boolean[1];
        Throwable originalFailure=null;
        try {
            require(BuildInfo.BUILD_TIME_UTC.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"),"APK build time is the injected UTC instant");
            String versionText=BuildInfo.VERSION_NAME+" / versionCode "+BuildInfo.VERSION_CODE+
                "\nby codex · "+BuildInfo.SOURCE_SHA.substring(0,5)+"\nAPK 编译时间："+BuildInfo.BUILD_TIME_UTC+
                " (UTC)\n独立合成体验；无生产数据库/远端同步";
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            try { require(root!=null&&nativeTextContains(root,"MyTodo D4-03 版本信息")&&nativeTextContains(root,versionText),"Native version dialog exposes the complete current name, code, source prefix and UTC build time"); }
            finally { if(root!=null)root.recycle(); }
            proof.put("expectedCurrentText",versionText);
            final String sentinel="d403-version-copy-before-"+BuildInfo.RUN_ID+"-"+BuildInfo.RUN_ATTEMPT;
            runOnMainSync(()->{originalClip[0]=clipboard.getPrimaryClip();clipboard.setPrimaryClip(ClipData.newPlainText("D403 isolated verification",sentinel));clipboardOwned[0]=true;});
            nativeDialogButton("复制版本信息",actions);
            final String[] copied=new String[1];final int[] copiedItems=new int[1];
            runOnMainSync(()->{ClipData clip=clipboard.getPrimaryClip();copiedItems[0]=clip==null?0:clip.getItemCount();copied[0]=clip!=null&&clip.getItemCount()==1&&clip.getItemAt(0).getText()!=null?clip.getItemAt(0).getText().toString():null;});
            proof.put("copiedItems",copiedItems[0]).put("copiedText",copied[0]==null?JSONObject.NULL:copied[0]);
            require(copiedItems[0]==1&&versionText.equals(copied[0]),"Actual native copy button replaces the sentinel with the exact displayed version information");
            tap("[data-action=personal-apk-version]");nativeDialogButton("版本历史",actions);
            JSONArray history;
            try(InputStream in=getTargetContext().getAssets().open("version-history.json");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);
                history=new JSONArray(bytes.toString(StandardCharsets.UTF_8.name()));
            }
            proof.put("packagedHistory",history);
            require(history.length()>=6,"Packaged offline history includes the current build and five verified earlier builds");
            JSONObject current=history.getJSONObject(0);
            require(BuildInfo.VERSION_NAME.equals(current.getString("versionName"))&&BuildInfo.VERSION_CODE==current.getInt("versionCode")&&
                BuildInfo.SOURCE_SHA.equals(current.getString("sourceSHA"))&&BuildInfo.BUILD_TIME_UTC.equals(current.getString("buildTimeUTC"))&&
                BuildInfo.RUN_ID.equals(current.getString("runId"))&&BuildInfo.RUN_ATTEMPT.equals(current.getString("runAttempt")),"First offline record has the exact current APK source/run/build identity");
            String[][] known={
                {"0.3.11","403011","e5dc4dd1fd23d6db7fb384d24269153d068feb8c","45563979340","1","2026-11-25T06:54:33.086Z"},
                {"0.3.10","403010","5b537d523c06ef6e50891d4ac214a9ac48c0e58a","45559378554","1","2026-11-25T06:17:15.241Z"},
                {"0.3.9","403009","c5c4c83880382354cbf28afdcf6660cab4bafa84","45558130766","1","2026-11-25T06:07:03.820Z"},
                {"0.3.8","403008","85d5896320e72253f6aa86a372ef17faa1e8f5d3","45549250863","1","2026-11-25T04:49:05.106Z"},
                {"0.3.7","403007","e91f4cc89cfd94312f24d749ddd7a12dc8390e85","45547914158","1","2026-11-25T04:37:02.716Z"}
            };
            for(String[] expected:known){int count=0;for(int i=1;i<history.length();i++){JSONObject row=history.getJSONObject(i);if(expected[0].equals(row.getString("versionName"))){count++;require(Integer.parseInt(expected[1])==row.getInt("versionCode")&&expected[2].equals(row.getString("sourceSHA"))&&expected[3].equals(row.getString("runId"))&&expected[4].equals(row.getString("runAttempt"))&&expected[5].equals(row.getString("buildTimeUTC")),"Historical record retains its independently archived identity: "+expected[0]);}}require(count==1,"Each known historical build occurs exactly once: "+expected[0]);}
            StringBuilder text=new StringBuilder("已核实构建记录；未记录的更早版本不补造。\n独立 CI 体验签名，不保证跨运行覆盖安装。\n\n");
            int previousCode=Integer.MAX_VALUE;
            for(int i=0;i<history.length();i++){
                JSONObject row=history.getJSONObject(i);int code=row.getInt("versionCode");String sha=row.getString("sourceSHA"),built=row.getString("buildTimeUTC");
                require(code<previousCode&&sha.matches("[a-f0-9]{40}")&&built.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"),"Offline history uses unique descending codes and explicit source/UTC build identity");previousCode=code;
                if(i>0)text.append("\n\n");text.append(row.getString("versionName")).append(" / versionCode ").append(code)
                    .append("\nby codex · ").append(sha.substring(0,5)).append("\nAPK 编译时间：").append(built).append(" (UTC)\nActions ")
                    .append(row.getString("runId")).append(" / attempt ").append(row.getString("runAttempt"));
                JSONArray changes=row.getJSONArray("changes");require(changes.length()>0,"Every historical build has offline change details");
                for(int j=0;j<changes.length();j++){String change=changes.getString(j);require(!change.trim().isEmpty(),"Offline history change is non-empty");text.append("\n• ").append(change);}
            }
            String expectedHistory=text.toString();require(expectedHistory.equals(BuildInfo.HISTORY_TEXT),"APK history text and structured asset agree on every identity and change");
            root=getUiAutomation().getRootInActiveWindow();
            try { require(root!=null&&nativeTextContains(root,"版本历史（离线）")&&nativeTextContains(root,expectedHistory),"Actual native history dialog contains all packaged entries, changes and UTC identity in order"); }
            finally { if(root!=null)root.recycle(); }
            proof.put("nativeHistoryTextMatched",true);shot("android-apk-version-history-top");
            scrollNativeHistory(actions);shot("android-apk-version-history-end");nativeDialogButton("关闭",actions);
            root=getUiAutomation().getRootInActiveWindow();
            try { require(root!=null&&!nativeTextContains(root,"版本历史（离线）"),"Real native close button dismisses the history dialog"); }
            finally { if(root!=null)root.recycle(); }
            require("about".equals(js("D4Prototype.getRoute()")),"Native version actions return to the same About page");
            proof.put("passed",true);
        } catch(Throwable failure) {
            originalFailure=failure;
            try { shot("failure-native-version-buttons-original"); }
            catch(Throwable evidenceError) { failure.addSuppressed(evidenceError); }
            throw failure;
        } finally {
            Throwable finalizationFailure=null;
            try { if(clipboardOwned[0])runOnMainSync(()->{if(originalClip[0]!=null)clipboard.setPrimaryClip(originalClip[0]);else if(Build.VERSION.SDK_INT>=28)clipboard.clearPrimaryClip();}); }
            catch(Throwable error) { finalizationFailure=error; }
            try { write("native-version-buttons.json",proof.toString(2)); }
            catch(Throwable error) { if(finalizationFailure==null)finalizationFailure=error;else finalizationFailure.addSuppressed(error); }
            if(finalizationFailure!=null){if(originalFailure!=null)originalFailure.addSuppressed(finalizationFailure);else if(finalizationFailure instanceof Exception)throw (Exception)finalizationFailure;else if(finalizationFailure instanceof Error)throw (Error)finalizationFailure;else throw new RuntimeException(finalizationFailure);}
        }
    }
    private void cleanupNativeVersionDialogs() throws Exception {
        JSONArray steps=new JSONArray();Throwable originalFailure=null;
        try {
            for(int i=0;i<2;i++){
                AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();boolean visible;
                try { require(root!=null,"Failure cleanup requires an observed active window");visible=isNativeVersionDialog(root); }
                finally { if(root!=null)root.recycle(); }
                steps.put(new JSONObject().put("step",i).put("knownDialogVisible",visible));
                if(!visible)return;
                back();steps.put(new JSONObject().put("action","real-android-back").put("step",i));
            }
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            try { require(root!=null&&!isNativeVersionDialog(root),"Failed version case cleanup dismisses only its known native dialog"); }
            finally { if(root!=null)root.recycle(); }
        } catch(Throwable failure) { originalFailure=failure;throw failure; }
        finally { try { write("native-version-failure-cleanup.json",new JSONObject().put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT).put("steps",steps).toString(2)); }catch(Throwable error){if(originalFailure!=null)originalFailure.addSuppressed(error);else if(error instanceof Exception)throw (Exception)error;else if(error instanceof Error)throw (Error)error;else throw new RuntimeException(error);} }
    }
    private boolean isNativeVersionDialog(AccessibilityNodeInfo node) {
        boolean ownPackage=node.getPackageName()!=null&&getTargetContext().getPackageName().contentEquals(node.getPackageName());
        if(ownPackage&&node.isVisibleToUser()&&"android.widget.TextView".equals(String.valueOf(node.getClassName()))&&node.getText()!=null&&
            ("MyTodo D4-03 版本信息".contentEquals(node.getText())||"版本历史（离线）".contentEquals(node.getText())))return true;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{if(isNativeVersionDialog(child))return true;}finally{child.recycle();}}
        return false;
    }
    private void nativeDialogButton(String label,JSONArray actions) throws Exception {
        AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();require(root!=null,"Native dialog accessibility root exists");
        JSONArray matches=new JSONArray();Rect window=new Rect();
        try { root.getBoundsInScreen(window);nativeTargets(root,label,false,matches); }
        finally { root.recycle(); }
        require(matches.length()==1,"Exactly one visible enabled native dialog button: "+label+" "+matches);
        JSONObject target=matches.getJSONObject(0);Rect bounds=new Rect(target.getInt("left"),target.getInt("top"),target.getInt("right"),target.getInt("bottom"));
        require(bounds.intersect(window)&&bounds.width()>2&&bounds.height()>2,"Native button has visible screen bounds: "+label);
        float x=bounds.exactCenterX(),y=bounds.exactCenterY();actions.put(new JSONObject().put("action","native-button-tap").put("label",label).put("target",target).put("x",x).put("y",y));
        long now=SystemClock.uptimeMillis();input(now,now,MotionEvent.ACTION_DOWN,x,y);input(now,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y);settle();
    }
    private void nativeTargets(AccessibilityNodeInfo node,String label,boolean scrolling,JSONArray found) throws Exception {
        boolean ownPackage=node.getPackageName()!=null&&getTargetContext().getPackageName().contentEquals(node.getPackageName());
        String className=String.valueOf(node.getClassName());
        boolean wanted=scrolling?node.isScrollable()&&"android.widget.ScrollView".equals(className):node.isClickable()&&"android.widget.Button".equals(className)&&node.getText()!=null&&label.contentEquals(node.getText());
        if(ownPackage&&wanted&&node.isVisibleToUser()&&node.isEnabled()){Rect r=new Rect();node.getBoundsInScreen(r);found.put(new JSONObject().put("left",r.left).put("top",r.top).put("right",r.right).put("bottom",r.bottom).put("class",String.valueOf(node.getClassName())));}
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{nativeTargets(child,label,scrolling,found);}finally{child.recycle();}}
    }
    private void scrollNativeHistory(JSONArray actions) throws Exception {
        AtomicReference<int[]> latest=new AtomicReference<>();final String pkg=getTargetContext().getPackageName();
        getUiAutomation().setOnAccessibilityEventListener(event->{if(event.getEventType()==AccessibilityEvent.TYPE_VIEW_SCROLLED&&event.getPackageName()!=null&&pkg.contentEquals(event.getPackageName())&&"android.widget.ScrollView".equals(String.valueOf(event.getClassName())))latest.set(new int[]{event.getScrollY(),event.getMaxScrollY()});});
        int prior=-1;boolean reachedEnd=false;
        try {
            for(int i=0;i<20&&!reachedEnd;i++){
                AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();require(root!=null,"History remains the active native window");JSONArray scrolls=new JSONArray();Rect window=new Rect();
                try{root.getBoundsInScreen(window);nativeTargets(root,"",true,scrolls);}finally{root.recycle();}
                require(scrolls.length()==1,"Exactly one visible native history ScrollView");JSONObject target=scrolls.getJSONObject(0);
                Rect bounds=new Rect(target.getInt("left"),target.getInt("top"),target.getInt("right"),target.getInt("bottom"));require(bounds.intersect(window)&&bounds.height()>80,"History has a reachable native scrolling area");
                latest.set(null);float x=bounds.exactCenterX(),start=bounds.top+bounds.height()*.8f,end=bounds.top+bounds.height()*.2f;long down=SystemClock.uptimeMillis();
                input(down,down,MotionEvent.ACTION_DOWN,x,start);for(int step=1;step<=12;step++){SystemClock.sleep(25);input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,x,start+(end-start)*step/12f);}input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,end);settle();
                int[] observed=latest.get();require(observed!=null&&observed[1]>0&&observed[0]>prior,"Real swipe emits native scroll progress toward older history");prior=observed[0];reachedEnd=observed[0]>=observed[1];
                actions.put(new JSONObject().put("action","native-history-swipe").put("target",target).put("x",x).put("startY",start).put("endY",end).put("scrollY",observed[0]).put("maxScrollY",observed[1]));
            }
            require(reachedEnd,"Actual native history swipes reach the oldest record without leaving the dialog");
        } finally { getUiAutomation().setOnAccessibilityEventListener(null); }
    }
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
