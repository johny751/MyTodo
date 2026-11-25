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
    private final JSONArray inputBoundaries = new JSONArray();
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
                // Top-level manual order is stored in task.order, not container-array positions.
                String manualIds="JSON.stringify(D4Prototype.repo.listTasks({allDates:true,status:'all',sort:'manual'}).filter(t=>t.quadrant===0).map(t=>t.id))";
                Object ids=js(manualIds);
                JSONObject orderBefore=heldOrderObservation(list);
                double scrollBefore=((Number)js("document.querySelector("+JSONObject.quote(list)+").scrollTop")).doubleValue();
                JSONObject observed=new JSONObject().put("source","real Android MotionEvent").put("scrollBefore",scrollBefore);
                beginHeldTouchTrace();
                try (NativeDragTouch touch=new NativeDragTouch("held-drag-autoscroll")) {
                    try {
                        touch.down(start); SystemClock.sleep(longHold());
                        require(Boolean.TRUE.equals(js("!!document.querySelector('.dragging')&&!!document.querySelector('.drag-ghost')")),"Real long hold activates drag before movement");
                        // A reminder reconciliation can resize the live list
                        // during the hold without replacing its rows. Retain
                        // the original target and then hit its current edge.
                        observed.put("edgeBeforeHold",new JSONObject().put("x",edge[0]).put("y",edge[1]));
                        edge=dragDropPoint(list,false);
                        observed.put("edgeAfterActivation",new JSONObject().put("x",edge[0]).put("y",edge[1]));
                        write("native-held-drag-observation.json",observed.toString(2));
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
                } finally {
                    finishHeldTouchTrace();
                }
                settle();
                JSONObject orderAfter=heldOrderObservation(list);
                write("native-held-order-commit.json",new JSONObject().put("before",orderBefore).put("after",orderAfter).toString(2));
                require(raw.equals(dragFixtureRaw()),"Released long-list drag preserves every ID and every non-order task field");
                require(((Number)js("D4Prototype.repo.state.tasks.length")).intValue()==50,"Every synthetic long-list task remains present");
                require(!ids.equals(js(manualIds)),"Dropping after held auto-scroll actually changes the order");
                require(orderAfter.getJSONArray("manualIds").toString().equals(orderAfter.getJSONArray("domIds").toString()),"Released manual order agrees with every displayed long-list row");
                require("localStorage".equals(orderAfter.getString("persistenceMode"))&&"mytodo-d4-03-synthetic-demo".equals(orderAfter.getString("storedKind"))&&orderAfter.getJSONArray("manualIds").toString().equals(orderAfter.getJSONArray("persistedIds").toString()),"Released manual order is persisted exactly in the isolated demo storage");
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
                JSONObject subtaskTrace=beginSubtaskDragTrace(handle,start);
                long subtaskDownUptime=-1,subtaskAssertionReadUptime=-1;
                try (NativeDragTouch touch=new NativeDragTouch("subtask-order")) {
                    try {
                        subtaskDownUptime=touch.down(start);SystemClock.sleep(100);
                        subtaskAssertionReadUptime=SystemClock.uptimeMillis();
                        require(Boolean.TRUE.equals(js("!!document.querySelector('[data-task-id=d403-native-child-a].dragging')")),"Real handle touch activates the child drag");
                        touch.move(after,300);touch.up(after);
                    } catch(Exception|Error error) {
                        try { shot("failure-native-subtask-drag-before-cancel"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
                        throw error;
                    }
                } finally {
                    finishSubtaskDragTrace(subtaskTrace,subtaskDownUptime,subtaskAssertionReadUptime);
                }
                waitForIdleSync();
                require(Boolean.TRUE.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>t.id))===JSON.stringify(['d403-native-child-b','d403-native-child-a'])")),"Real drag moves the first child after its sibling");
                require(Boolean.TRUE.equals(js("JSON.stringify(Array.from(document.querySelectorAll('[data-subtask-list] .task-row')).map(r=>r.dataset.taskId))===JSON.stringify(['d403-native-child-b','d403-native-child-a'])")),"Visible sibling DOM order updates immediately");
                require(beforeChildren.equals(js("JSON.stringify(D4Prototype.repo.getTask('d403-native-parent').subtasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))")),"Sorting preserves every child non-order field");
                require("Original parent notes".equals(js("D4Prototype.repo.getTask('d403-native-parent').notes"))&&draft.equals(js("document.querySelector('[data-form=task-edit] [name=notes]').value")),"Sorting retains the unsaved parent notes without saving them");
                require(Boolean.TRUE.equals(js("D4Prototype.repo.state.tasks.length===1&&!D4Prototype.repo.state.tasks.some(t=>t.id==='d403-native-child-a'||t.id==='d403-native-child-b')")),"Children remain children and are not promoted");
                // Prepare both hit-tested coordinates before the suppression window starts.
                float[] handlePoint=point(handle,false),closePoint=point("[data-action=close-modal]",false);
                js("(function(){var p={batches:0,events:[],dropped:0};p.types=[\"pointerdown\",\"pointerup\",\"pointercancel\",\"touchstart\",\"touchend\",\"touchcancel\",\"mousedown\",\"mouseup\",\"click\",\"selectionchange\"];p.describe=e=>e&&e.nodeType===1?{tag:e.tagName,action:e.closest(\"[data-action]\")?.dataset.action||null,taskId:e.closest(\".task-row\")?.dataset.taskId||null,field:e.getAttribute(\"name\")}:null;p.selection=()=>{var s=getSelection(),a=document.activeElement;return {type:s?.type||null,rangeCount:s?.rangeCount||0,isCollapsed:s?.isCollapsed!==false,text:s?.toString().slice(0,200)||\"\",active:p.describe(a),selectionStart:typeof a?.selectionStart===\"number\"?a.selectionStart:null,selectionEnd:typeof a?.selectionEnd===\"number\"?a.selectionEnd:null,focus:document.hasFocus()};};p.trace=e=>{if(p.events.length>=96){p.dropped++;return;}var c=e.changedTouches?.[0]||e,x=Number.isFinite(c.clientX)?c.clientX:null,y=Number.isFinite(c.clientY)?c.clientY:null;p.events.push({type:e.type,observedAt:performance.now(),eventTimeStamp:e.timeStamp,trusted:e.isTrusted,defaultPrevented:e.defaultPrevented,pointerType:e.pointerType||null,target:p.describe(e.target),x:x,y:y,hit:x===null?null:p.describe(document.elementFromPoint(x,y)),modalStillOpen:!!document.querySelector(\"[data-form=task-edit]\"),dirty:!!document.querySelector(\".dragging,.drag-ghost,.drop-target,.swiping\"),selection:p.selection()});};p.initialSelection=p.selection();p.stop=D4Prototype.repo.subscribe((s,d)=>{if(d.type==='batch')p.batches++;});p.end=e=>{if(e.target.closest('[data-task-id=d403-native-child-a] .drag-handle')){p.handleEnd=performance.now();p.handleTrusted=e.isTrusted;p.batchesAtHandleEnd=p.batches;}};p.click=e=>{if(e.target.closest('[data-action=close-modal]')){p.closeClick=performance.now();p.closeTrusted=e.isTrusted;}};p.observer=new MutationObserver(()=>{if(p.closeClick&&!document.querySelector('[data-form=task-edit]')&&!p.closedAt)p.closedAt=performance.now();});p.observer.observe(document.querySelector('#modal-root'),{childList:true,subtree:true});p.types.forEach(type=>window.addEventListener(type,p.trace,true));document.addEventListener('touchend',p.end);document.addEventListener('click',p.click,true);window.__d403NativeCloseProbe=p;return true;})()");
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
                // The Android UI queue becoming idle does not prove that the
                // WebView renderer has processed the injected input sequence.
                // Preserve the first observation and only await evidence. The
                // original <500ms native injection and renderer event-time
                // assertions below remain unchanged; late closure still fails.
                JSONObject firstProbe=readNativeCloseProbe(),probe=firstProbe;
                long firstObservationUptime=SystemClock.uptimeMillis(),observationDeadline=released+1000L;
                int observationReads=1;
                while(!probe.has("closedAt")&&SystemClock.uptimeMillis()<observationDeadline) {
                    SystemClock.sleep(20);
                    probe=readNativeCloseProbe();observationReads++;
                }
                probe.put("firstObservation",new JSONObject(firstProbe.toString()))
                    .put("firstObservationUptimeMs",firstObservationUptime)
                    .put("lastObservationUptimeMs",SystemClock.uptimeMillis())
                    .put("observationReadCount",observationReads)
                    .put("observationDeadlineUptimeMs",observationDeadline);
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


            check("android-unified-timer-web-navigation-native-pause-web-resume", () -> withUnifiedTimerCase("shared-navigation", () -> {
                JSONObject configured=prepareUnifiedTimer(5,1);
                openPageByTouch("pomodoro"); awaitUnifiedWeb(configured.getLong("revision"),"","idle");
                beginUnifiedTouchTrace();markUnifiedTouchTrace("web-start-before-touch");
                tap("[data-action=personal-timer-start]");
                JSONObject running=awaitUnifiedWeb(configured.getLong("revision")+1,null,"running");
                String id=running.getString("sessionId"); require(!id.isEmpty()&&"focus".equals(running.getString("phase")),"Actual Web start creates a native focus session");
                SystemClock.sleep(1200); openPageByTouch("notes"); openPageByTouch("pomodoro");
                JSONObject returned=awaitUnifiedWeb(running.getLong("revision"),id,"running");
                require(returned.getLong("elapsedMillis")>running.getLong("elapsedMillis"),"The same native session advances while the Web page is changed");
                markUnifiedTouchTrace("open-native-before-touch");
                NativeTimerActivity activity=openUnifiedNative();
                awaitNativeUnifiedText(activity,id);
                nativeUnifiedTap(activity,40304);
                JSONObject paused=unifiedSnapshot();require("paused".equals(paused.getString("status"))&&id.equals(paused.getString("sessionId")),"Real native Pause pauses the original Web-started session");
                SystemClock.sleep(1200);require(unifiedSnapshot().getLong("elapsedMillis")==paused.getLong("elapsedMillis"),"Shared native paused elapsed time stays fixed");
                markUnifiedTouchTrace("native-paused-before-back");
                back();unifiedForegroundActivity=null;
                awaitUnifiedWeb(paused.getLong("revision"),id,"paused");
                markUnifiedTouchTrace("web-resume-before-touch");
                tap("[data-action=personal-timer-resume]");
                markUnifiedTouchTrace("web-resume-after-touch");
                JSONObject resumed=awaitUnifiedWeb(paused.getLong("revision")+1,id,"running");
                markUnifiedTouchTrace("web-resume-confirmed");
                SystemClock.sleep(1200);
                JSONObject later=unifiedSnapshot();
                require(id.equals(later.getString("sessionId"))&&later.getLong("elapsedMillis")>resumed.getLong("elapsedMillis"),"Actual Web Resume continues the native-paused session without replacing its identity");
                require(historyCount(later,id)==0,"Navigation and pause/resume do not invent terminal history");
                write("unified-timer-shared-navigation.json",new JSONObject().put("started",running).put("paused",paused).put("resumed",resumed).put("later",later).toString(2));
                shot("android-unified-timer-shared-navigation");
            }));
            check("android-unified-timer-early-end-single-history", () -> withUnifiedTimerCase("early-end-history", () -> {
                JSONObject configured=prepareUnifiedTimer(5,1);
                long completedBefore=timerMapTotal(configured,"completedSessionsByDay");
                openPageByTouch("pomodoro");awaitUnifiedWeb(configured.getLong("revision"),"","idle");
                tap("[data-action=personal-timer-start]");
                JSONObject running=awaitUnifiedWeb(configured.getLong("revision")+1,null,"running");String id=running.getString("sessionId");
                SystemClock.sleep(1300);tap("[data-action=personal-timer-end]");
                JSONObject ended=awaitUnifiedWeb(running.getLong("revision")+1,id,"ended");
                require(historyCount(ended,id)==1,"Actual Web End records exactly one terminal history row");
                JSONObject row=historyRow(ended,id);
                require("focus".equals(row.getString("phase"))&&"ended".equals(row.getString("outcome"))&&row.getLong("elapsedMillis")>0,"Early end preserves measured focus elapsed time with the ended outcome");
                require(timerMapTotal(ended,"completedSessionsByDay")==completedBefore,"Early ending does not count as a completed countdown");
                requireWebHistoryRow(id,"提前结束");
                NativeTimerActivity activity=openUnifiedNative();awaitNativeUnifiedText(activity,id);
                require(nativeUnifiedText(activity,40301).contains("提前结束"),"Native reader shows the Web-ended session");
                nativeUnifiedTap(activity,40306);JSONObject reset=unifiedSnapshot();
                require("idle".equals(reset.getString("status"))&&historyCount(reset,id)==1,"Real native reset retains exactly the existing ended history");
                JSONObject noSecondEnd=unifiedCommand("end",new JSONObject());
                require(historyCount(noSecondEnd,id)==1&&canonicalTimerJson(row).equals(canonicalTimerJson(historyRow(noSecondEnd,id))),"Ending an already reset session does not duplicate or rewrite its prior history");
                back();unifiedForegroundActivity=null;awaitUnifiedWeb(noSecondEnd.getLong("revision"),"","idle");requireWebHistoryRow(id,"提前结束");
                write("unified-timer-early-end-history.json",new JSONObject().put("ended",ended).put("afterNativeReset",reset).put("afterRepeatedEnd",noSecondEnd).toString(2));
            }));
            check("android-unified-timer-real-minute-background-two-readers-once", () -> withUnifiedTimerCase("focus-minute", () -> {
                JSONObject configured=prepareUnifiedTimer(1,1);
                long focusBefore=timerMapTotal(configured,"focusedMillisByDay"),completedBefore=timerMapTotal(configured,"completedSessionsByDay");
                openPageByTouch("pomodoro");awaitUnifiedWeb(configured.getLong("revision"),"","idle");
                tap("[data-action=personal-timer-start]");
                JSONObject running=awaitUnifiedWeb(configured.getLong("revision")+1,null,"running");String id=running.getString("sessionId");
                runOnMainSync(()->main.moveTaskToBack(true));waitRealTimerMinute();
                JSONObject completed=unifiedSnapshot();
                require("completed".equals(completed.getString("status"))&&id.equals(completed.getString("sessionId")),"A real minute completes the same Web-started native session in background");
                require(historyCount(completed,id)==1&&"completed".equals(historyRow(completed,id).getString("outcome"))&&historyRow(completed,id).getLong("elapsedMillis")==60000L,"Actual countdown completion creates one exact one-minute history");
                require(timerMapTotal(completed,"focusedMillisByDay")==focusBefore+60000L&&timerMapTotal(completed,"completedSessionsByDay")==completedBefore+1,"Native focus statistics add exactly one minute and one completed round across all recorded days");
                JSONObject reopened=timer("reopen-for-isolated-test");requireSameTerminalTimer(completed,reopened,id);
                launch();openPageByTouch("pomodoro");
                JSONObject web=awaitUnifiedWeb(reopened.getLong("revision"),id,"completed");requireSameTerminalTimer(completed,web,id);requireWebHistoryRow(id,"已完成");
                NativeTimerActivity activity=openUnifiedNative();awaitNativeUnifiedText(activity,id);
                require(nativeUnifiedText(activity,40301).contains("已完成"),"Native UI independently displays the same completed session");
                JSONObject nativeRead=unifiedSnapshot();requireSameTerminalTimer(completed,nativeRead,id);
                back();unifiedForegroundActivity=null;
                JSONObject webAgain=awaitUnifiedWeb(nativeRead.getLong("revision"),id,"completed");requireSameTerminalTimer(completed,webAgain,id);requireWebHistoryRow(id,"已完成");
                write("unified-timer-focus-minute-two-readers.json",new JSONObject().put("before",configured).put("completed",completed).put("reopened",reopened).put("web",web).put("nativeRead",nativeRead).put("webAgain",webAgain).toString(2));
                shot("android-unified-timer-focus-minute");
            }));
            check("android-unified-timer-real-break-excludes-focus-statistics", () -> withUnifiedTimerCase("break-minute", () -> {
                JSONObject configured=prepareUnifiedTimer(5,1);
                long focusBefore=timerMapTotal(configured,"focusedMillisByDay"),completedBefore=timerMapTotal(configured,"completedSessionsByDay");
                openPageByTouch("pomodoro");awaitUnifiedWeb(configured.getLong("revision"),"","idle");
                tap("[data-action=personal-timer-break]");
                JSONObject running=awaitUnifiedWeb(configured.getLong("revision")+1,null,"running");String id=running.getString("sessionId");
                require("break".equals(running.getString("phase"))&&"countdown".equals(running.getString("mode")),"Actual Web rest button starts the native break phase");
                runOnMainSync(()->main.moveTaskToBack(true));waitRealTimerMinute();
                JSONObject completed=unifiedSnapshot();JSONObject row=historyRow(completed,id);
                require("completed".equals(completed.getString("status"))&&"break".equals(completed.getString("phase"))&&historyCount(completed,id)==1,"Real break completion creates one break history");
                require("break".equals(row.getString("phase"))&&"completed".equals(row.getString("outcome"))&&row.getLong("elapsedMillis")==60000L,"Break history contains its own actual minute");
                require(timerMapTotal(completed,"focusedMillisByDay")==focusBefore&&timerMapTotal(completed,"completedSessionsByDay")==completedBefore,"A complete break contributes no focus milliseconds or completed focus round");
                launch();openPageByTouch("pomodoro");
                JSONObject web=awaitUnifiedWeb(completed.getLong("revision"),id,"completed");requireSameTerminalTimer(completed,web,id);requireWebHistoryRow(id,"休息");
                NativeTimerActivity activity=openUnifiedNative();awaitNativeUnifiedText(activity,id);
                require(nativeUnifiedText(activity,40301).contains("休息")&&nativeUnifiedText(activity,40301).contains("已完成"),"Native UI shows this same completed break");
                JSONObject nativeRead=unifiedSnapshot();requireSameTerminalTimer(completed,nativeRead,id);
                back();unifiedForegroundActivity=null;awaitUnifiedWeb(nativeRead.getLong("revision"),id,"completed");
                write("unified-timer-break-minute-no-focus.json",new JSONObject().put("before",configured).put("completed",completed).put("web",web).put("nativeRead",nativeRead).toString(2));
            }));
            check("android-unified-timer-dirty-config-survives-polls-navigation", () -> withUnifiedTimerCase("dirty-configuration", () -> {
                JSONObject configured=prepareUnifiedTimer(5,1);
                openPageByTouch("pomodoro");awaitUnifiedWeb(configured.getLong("revision"),"","idle");
                beginDirtyNavigationTrace();markDirtyNavigationTrace("before-native-text-entry");
                typeText("[data-form=personal-timer-config] [name=durationMinutes]","7");
                markDirtyNavigationTrace("after-duration-entry");
                typeText("[data-form=personal-timer-config] [name=breakMinutes]","3");
                markDirtyNavigationTrace("after-break-entry");
                SystemClock.sleep(2200);
                requireUnifiedDraft("7","3");
                JSONObject untouched=unifiedSnapshot();
                require(untouched.getInt("durationMinutes")==5&&untouched.getInt("breakMinutes")==1,"Typing a dirty Web configuration does not silently write the native authority");
                openPageByTouch("notes");openPageByTouch("pomodoro");
                awaitUnifiedWeb(untouched.getLong("revision"),"","idle");requireUnifiedDraft("7","3");
                NativeTimerActivity activity=openUnifiedNative();awaitNativeUnifiedText(activity,"已暂停 / 待开始");
                JSONObject nativeRead=unifiedSnapshot();
                require(nativeRead.getInt("durationMinutes")==5&&nativeRead.getInt("breakMinutes")==1,"Native reader still sees only the saved settings while Web fields are dirty");
                back();unifiedForegroundActivity=null;awaitUnifiedWeb(nativeRead.getLong("revision"),"","idle");requireUnifiedDraft("7","3");
                tap("[data-form=personal-timer-config] button[type=submit]");
                JSONObject saved=awaitUnifiedWeb(nativeRead.getLong("revision")+1,"","idle");
                require(saved.getInt("durationMinutes")==7&&saved.getInt("breakMinutes")==3,"Actual Web settings submit writes the retained draft to the shared native authority");
                requireUnifiedDraft("7","3");
                require(unifiedSnapshot().getInt("durationMinutes")==7&&unifiedSnapshot().getInt("breakMinutes")==3,"Both readers agree on the exact saved configuration");
                write("unified-timer-dirty-configuration.json",new JSONObject().put("before",configured).put("whileDirty",untouched).put("nativeRead",nativeRead).put("saved",saved).toString(2));
                shot("android-unified-timer-dirty-config-saved");
            }));
            check("android-unified-timer-idempotency-reopen-and-stale-refusal", () -> withUnifiedTimerCase("command-contract", () -> {
                JSONObject configured=prepareUnifiedTimer(5,1);
                JSONObject request=new JSONObject().put("op","command").put("action","start").put("values",new JSONObject()).put("commandId","test:"+java.util.UUID.randomUUID()).put("expectedRevision",configured.getLong("revision"));
                JSONObject accepted=unifiedRequest(request),duplicate;String id=accepted.getString("sessionId");
                SystemClock.sleep(350);duplicate=unifiedRequest(request);
                require(canonicalTimerJson(accepted).equals(canonicalTimerJson(duplicate)),"Repeating exactly the same command ID, payload and expectedRevision returns the exact original receipt");
                JSONObject progressed=unifiedSnapshot();require(id.equals(progressed.getString("sessionId"))&&progressed.getLong("elapsedMillis")>=accepted.getLong("elapsedMillis"),"Retry does not restart the accepted session");
                timer("reopen-for-isolated-test");
                JSONObject reopenedDuplicate=unifiedRequest(request);
                require(canonicalTimerJson(accepted).equals(canonicalTimerJson(reopenedDuplicate)),"Idempotent receipt survives real AtomicFile store reopen");
                JSONObject reused=new JSONObject(request.toString()).put("action","end");
                JSONObject reuseError=unifiedRawResult(reused);
                require(reuseError.optString("error").contains("command-id-reused"),"Same ID with a different action is explicitly rejected");
                JSONObject stale=new JSONObject().put("op","command").put("action","end").put("values",new JSONObject()).put("commandId","test:"+java.util.UUID.randomUUID()).put("expectedRevision",configured.getLong("revision"));
                JSONObject staleError=unifiedRawResult(stale);
                require(staleError.optString("error").contains("stale-revision"),"A new command with the old revision is explicitly rejected");
                JSONObject unchanged=unifiedSnapshot();
                require(id.equals(unchanged.getString("sessionId"))&&"running".equals(unchanged.getString("status"))&&unchanged.getLong("revision")==accepted.getLong("revision")&&historyCount(unchanged,id)==0,"Rejected commands do not end, replace or duplicate the active session");
                require(timerMapTotal(unchanged,"completedSessionsByDay")==timerMapTotal(configured,"completedSessionsByDay"),"Rejected commands do not add completion statistics");
                write("unified-timer-command-contract.json",new JSONObject().put("request",request).put("accepted",accepted).put("duplicate",duplicate).put("reopenedDuplicate",reopenedDuplicate).put("reuseError",reuseError).put("staleError",staleError).put("current",unchanged).toString(2));
            }));

            check("android-unified-session-shorten-completion-once", () -> {
                write("unified-session-shorten-completion.json", NativeTimerSessionChecks.shortenCompletionOnce().toString(2));
            });
            check("android-unified-session-refuses-unconverted-state", () -> {
                write("unified-session-refused-state.json", NativeTimerSessionChecks.refusesUnconvertedState().toString(2));
            });
            check("android-unified-session-durable-receipt-replay", () -> {
                write("unified-session-durable-receipt-replay.json", NativeTimerSessionChecks.durableReceiptReplay().toString(2));
            });

            check("android-native-documentsui-cancel-preserves-draft", () -> NativeDocumentChooserChecks.cancelPreservesDraft(documentChooserHost()));
            check("android-native-documentsui-feedback-original-reload", () -> NativeDocumentChooserChecks.feedbackOriginalAndReload(documentChooserHost()));
            check("android-native-documentsui-attachment-original-reload", () -> NativeDocumentChooserChecks.attachmentOriginalAndReload(documentChooserHost()));
            check("android-native-floating-selection-lifecycle-copy-paste", () -> NativeSelectionLifecycleChecks.copyPasteAfterReturn(documentChooserHost()));
            check("android-native-work-project-item-lifecycle", () -> NativeWorkLifecycleChecks.projectAndWorkLifecycle(workLifecycleHost()));
            check("android-native-work-time-preservation-recreation", () -> NativeWorkLifecycleChecks.exactTimePreservation(workLifecycleHost()));
            check("android-system-bars-content-and-edge-insets", () -> {
                home();
                for (String route : new String[]{"tasks", "notes", "feedback"}) {
                    openPageByTouch(route);
                    assertNativeInsets(route, false);
                    shot("android-insets-" + route);
                    edgeOpen(); back();
                    require(route.equals(js("D4Prototype.getRoute()")), "Real edge navigation and Back preserve the inset page " + route);
                }
                openPageByTouch("notes");
                tap("[data-form=personal-filter] [name=query]");
                assertNativeInsets("notes-ime", true);
                back();
                assertNativeInsets("notes-ime-dismissed", false);
                home();
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
                js("(function(){var p=window.__d403NativeCloseProbe;if(p){p.stop();p.observer.disconnect();document.removeEventListener('touchend',p.end);document.removeEventListener('click',p.click,true);if(p.types&&p.trace)p.types.forEach(type=>window.removeEventListener(type,p.trace,true));delete window.__d403NativeCloseProbe;}DemoMobileControls.cancel();return true;})()");
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
    /** Read only: no synthetic input, selection cleanup, retries, or DOM changes. */
    private JSONObject readNativeCloseProbe() throws Exception {
        return (JSONObject)js("(function(){var p=window.__d403NativeCloseProbe;return {observedAt:performance.now(),handleEnd:p.handleEnd,handleTrusted:p.handleTrusted,batchesAtHandleEnd:p.batchesAtHandleEnd,closeClick:p.closeClick,closeTrusted:p.closeTrusted,closedAt:p.closedAt,modalStillOpen:!!document.querySelector('[data-form=task-edit]'),dirty:!!document.querySelector('.dragging,.drag-ghost,.drop-target,.swiping'),batches:p.batches,events:p.events,dropped:p.dropped,initialSelection:p.initialSelection,selection:p.selection()};})()");
    }
    private Object dragFixtureRaw() throws Exception {
        return js("JSON.stringify(D4Prototype.repo.state.tasks.map(t=>{var x=structuredClone(t);delete x.order;return x;}).sort((a,b)=>a.id.localeCompare(b.id)))");
    }
    /** Read the public manual-order contract, rendered rows and isolated saved bytes. */
    private JSONObject heldOrderObservation(String list) throws Exception {
        return (JSONObject)js("(function(){var state=D4Prototype.repo.state,saved=JSON.parse(localStorage.getItem(DemoDomain.STORAGE_KEY)||'null'),options={allDates:true,status:'all',sort:'manual'},ordered=tasks=>DemoDomain.helpers.visibleTasks(tasks,options).filter(t=>t.quadrant===0).map(t=>t.id);return {wallMillis:Date.now(),containerIds:state.tasks.map(t=>t.id),orderValues:state.tasks.map(t=>({id:t.id,order:t.order})),manualIds:D4Prototype.repo.listTasks(options).filter(t=>t.quadrant===0).map(t=>t.id),domIds:Array.from(document.querySelectorAll("+JSONObject.quote(list+" .task-row")+")).map(r=>r.dataset.taskId),storageKey:DemoDomain.STORAGE_KEY,persistenceMode:D4Prototype.repo.persistence().mode,storedKind:saved?.kind||null,persistedIds:saved?.state?.tasks?ordered(saved.state.tasks):null};})()");
    }
    /** Observe clipping and real hit testing; no scrolling is performed by this helper. */
    private float[] dragDropPoint(String selector,boolean afterRow) throws Exception {
        JSONObject r=(JSONObject)js("(function(){var e=document.querySelector("+JSONObject.quote(selector)+");if(!e)throw Error('Missing drag target');var r=e.getBoundingClientRect(),v=visualViewport,l=Math.max(0,r.left),t=Math.max(0,r.top),b=Math.min(innerHeight,v.height,r.bottom),right=Math.min(innerWidth,r.right);for(var p=e.parentElement;p;p=p.parentElement){var c=getComputedStyle(p),q=p.getBoundingClientRect();if(/^(auto|scroll|hidden|clip)$/.test(c.overflowX)){l=Math.max(l,q.left+p.clientLeft);right=Math.min(right,q.left+p.clientLeft+p.clientWidth);}if(/^(auto|scroll|hidden|clip)$/.test(c.overflowY)){t=Math.max(t,q.top+p.clientTop);b=Math.min(b,q.top+p.clientTop+p.clientHeight);}}var x=(l+right)/2,y=b-12,hit=document.elementFromPoint(x,y);return {x:x,y:y,visible:right-l>4&&b-t>24,hitMatches:!!hit&&(hit===e||e.contains(hit)),belowRowCenter:y>r.top+r.height/2,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},clip:{left:l,top:t,right:right,bottom:b},scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,reminderDockSpace:getComputedStyle(document.documentElement).getPropertyValue('--reminder-dock-space'),wallMillis:Date.now(),innerWidth:innerWidth,innerHeight:innerHeight,visualViewport:{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}};})()");
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


    private NativeTimerActivity unifiedForegroundActivity;
    private boolean dirtyNavigationTracing;
    private final JSONArray dirtyNavigationNativeEvents=new JSONArray();
    private void withUnifiedTimerCase(String name,Check body) throws Exception {
        Throwable failure=null;
        try { home();body.run(); }
        catch(Exception|Error error) {
            failure=error;
            try { shot("failure-unified-timer-"+name+"-before-cleanup"); } catch(Exception|Error capture) { error.addSuppressed(capture); }
            throw error;
        } finally {
            try {
                if("shared-navigation".equals(name))finishUnifiedTouchTrace();
                if("dirty-configuration".equals(name))finishDirtyNavigationTrace();
                if(unifiedForegroundActivity!=null){NativeTimerActivity activity=unifiedForegroundActivity;runOnMainSync(activity::finish);unifiedForegroundActivity=null;}
                timer("reset");launch();home();
            } catch(Exception|Error cleanup) { if(failure!=null)failure.addSuppressed(cleanup);else throw cleanup; }
        }
    }
    private JSONObject unifiedRawResult(JSONObject request) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        AtomicReference<JSONObject> result=new AtomicReference<>();
        AtomicReference<String> serializationError=new AtomicReference<>();
        NativeTimerStore.request(getTargetContext(),request.toString(),(value,error)->{
            try {result.set(new JSONObject().put("value",value==null?JSONObject.NULL:value).put("error",error==null?JSONObject.NULL:error));}
            catch(Exception invalid){serializationError.set(invalid.toString());}
            finally{done.countDown();}
        });
        require(done.await(10,TimeUnit.SECONDS),"Unified native timer callback completes");
        require(serializationError.get()==null&&result.get()!=null,"Unified timer callback retains its result: "+serializationError.get());
        return result.get();
    }
    private JSONObject unifiedRequest(JSONObject request) throws Exception {
        JSONObject result=unifiedRawResult(request);
        require(result.isNull("error"),"Unified timer request accepted: "+result.optString("error"));
        return result.getJSONObject("value");
    }
    private JSONObject unifiedSnapshot() throws Exception {return unifiedRequest(new JSONObject().put("op","snapshot"));}
    private JSONObject unifiedCommand(String action,JSONObject values) throws Exception {
        JSONObject current=unifiedSnapshot();
        return unifiedRequest(new JSONObject().put("op","command").put("action",action).put("values",values)
            .put("commandId","test:"+java.util.UUID.randomUUID()).put("expectedRevision",current.getLong("revision")));
    }
    /** Explicit synthetic fixture setup; real page commands remain real MotionEvent taps. */
    private JSONObject prepareUnifiedTimer(int focusMinutes,int restMinutes) throws Exception {
        require(((Number)js("GxD4Preview.nativeTimerProtocol()")).intValue()==1,"Native unified protocol is advertised by this APK");
        timer("reset");
        return unifiedCommand("configure",new JSONObject().put("mode","countdown").put("durationMinutes",focusMinutes).put("breakMinutes",restMinutes).put("taskId",""));
    }
    private JSONObject awaitUnifiedWeb(long revision,String sessionId,String status) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+12000L;
        JSONObject last=null;
        while(SystemClock.elapsedRealtime()<deadline){
            last=(JSONObject)js("(function(){var info=window.D4NativeTimer?.info(),p=document.querySelector('#personal-timer');return {info:info||null,dom:p?{provider:p.dataset.provider,sessionId:p.dataset.sessionId,revision:p.dataset.revision,phase:p.dataset.phase,status:p.dataset.status}:null};})()");
            JSONObject info=last.optJSONObject("info"),dom=last.optJSONObject("dom"),state=info==null?null:info.optJSONObject("state");
            if(info!=null&&info.optBoolean("ready")&&"android-native".equals(info.optString("provider"))&&info.optInt("protocol")==1&&state!=null&&dom!=null
                &&state.optLong("revision",-1)>=revision&&(sessionId==null||sessionId.equals(state.optString("sessionId")))&&status.equals(state.optString("status"))
                &&"android-native".equals(dom.optString("provider"))&&state.optString("sessionId").equals(dom.optString("sessionId"))
                &&Long.toString(state.optLong("revision")).equals(dom.optString("revision"))&&state.optString("phase").equals(dom.optString("phase"))
                &&status.equals(dom.optString("status"))&&!info.optBoolean("busy")&&info.optString("error","").isEmpty()) return state;
            SystemClock.sleep(120);
        }
        throw new AssertionError("Web getter and visible timer did not confirm shared native identity/status by deadline: "+last);
    }
    /** Read-only input evidence. Does not clear selection, focus a view or replay a command. */
    private void beginUnifiedTouchTrace() throws Exception {
        js("(function(){var rows=[],dropped=0,ids=new WeakMap(),serial=0;"+
            "function describe(node){var e=node&&node.nodeType===1?node:node&&node.parentElement;if(!e)return null;if(!ids.has(e))ids.set(e,++serial);return {node:ids.get(e),tag:e.tagName,id:e.id||'',name:e.getAttribute('name'),action:e.getAttribute('data-action'),connected:e.isConnected,disabled:!!e.disabled};}"+
            "function state(){var info=window.D4NativeTimer?.info(),s=info?.state;return {ready:!!info?.ready,busy:!!info?.busy,error:info?.error||'',revision:s?.revision,status:s?.status,sessionId:s?.sessionId};}"+
            "function sample(stage,event,extra){if(rows.length>=384){dropped++;return;}var selection=getSelection(),button=document.querySelector('[data-action=personal-timer-resume]'),rect=button?.getBoundingClientRect(),point=event?.changedTouches?.[0]||event,hit=point&&Number.isFinite(point.clientX)?document.elementFromPoint(point.clientX,point.clientY):null;rows.push({stage:stage,wallMillis:Date.now(),performanceMillis:performance.now(),documentHasFocus:document.hasFocus(),visibility:document.visibilityState,active:describe(document.activeElement),selection:selection?{type:selection.type,ranges:selection.rangeCount,collapsed:selection.isCollapsed,textLength:selection.toString().length,anchor:describe(selection.anchorNode),focus:describe(selection.focusNode)}:null,timer:state(),globalBusy:{personal:window.DemoPersonalPages?.isBusy?.(),work:window.DemoWorkPages?.isBusy?.()},resume:button?{element:describe(button),rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}}:null,event:event?{type:event.type,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented,pointerType:event.pointerType||'',key:event.key||'',code:event.code||'',ctrlKey:!!event.ctrlKey,metaKey:!!event.metaKey,shiftKey:!!event.shiftKey,clientX:point?.clientX,clientY:point?.clientY,target:describe(event.target),hit:describe(hit)}:null,extra:extra||null});}"+
            "var types=['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','click','keydown','keyup','selectionchange','focusin','focusout','visibilitychange'];var capture=e=>sample('window-capture',e),bubble=e=>sample('window-bubble',e);types.forEach(t=>{window.addEventListener(t,capture,true);window.addEventListener(t,bubble,false);});"+
            "var focus=e=>sample('window-focus',e),blur=e=>sample('window-blur',e),response=e=>{var d=e.detail,v=d?.value;sample('native-response',null,{requestId:d?.id,error:d?.error||'',revision:v?.revision,status:v?.status,sessionId:v?.sessionId});};window.addEventListener('focus',focus);window.addEventListener('blur',blur);document.addEventListener('gx-d4-native-timer',response,true);"+
            "var observer=new MutationObserver(records=>{var relevant=records.filter(r=>r.target.nodeType===1&&r.target.closest('#personal-timer-content'));if(relevant.length)sample('timer-mutations',null,{count:relevant.length,changes:relevant.slice(0,12).map(r=>({type:r.type,attribute:r.attributeName,target:describe(r.target),added:r.addedNodes.length,removed:r.removedNodes.length}))});});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','data-status','data-revision','class']});"+
            "window.__d403UnifiedTouchDebug={sample:sample,read:()=>({events:rows,dropped:dropped}),dispose:()=>{observer.disconnect();types.forEach(t=>{window.removeEventListener(t,capture,true);window.removeEventListener(t,bubble,false);});window.removeEventListener('focus',focus);window.removeEventListener('blur',blur);document.removeEventListener('gx-d4-native-timer',response,true);}};sample('trace-start',null);return true;})()");
    }
    private void markUnifiedTouchTrace(String stage) throws Exception {
        final boolean[] flags=new boolean[7];
        runOnMainSync(()->{WebView view=main.previewWebView();flags[0]=main.hasWindowFocus();flags[1]=view.hasWindowFocus();flags[2]=view.hasFocus();flags[3]=view.isShown();flags[4]=main.isFinishing();flags[5]=main.isDestroyed();flags[6]=view.getWindowVisibility()==View.VISIBLE;});
        JSONObject nativeState=new JSONObject().put("activityWindowFocus",flags[0]).put("webViewWindowFocus",flags[1]).put("webViewFocus",flags[2]).put("webViewShown",flags[3]).put("activityFinishing",flags[4]).put("activityDestroyed",flags[5]).put("windowVisible",flags[6]).put("uptimeMillis",SystemClock.uptimeMillis());
        JSONArray windows=new JSONArray();
        try {
            for(android.view.accessibility.AccessibilityWindowInfo window:getUiAutomation().getWindows()) {
                Rect bounds=new Rect();window.getBoundsInScreen(bounds);
                windows.put(new JSONObject().put("id",window.getId()).put("type",window.getType()).put("layer",window.getLayer()).put("active",window.isActive()).put("focused",window.isFocused()).put("accessibilityFocused",window.isAccessibilityFocused()).put("title",String.valueOf(window.getTitle())).put("bounds",bounds.toShortString()));
                window.recycle();
            }
            nativeState.put("windows",windows).put("windowCount",windows.length());
        } catch(Exception unavailable) { nativeState.put("windowsObservationError",unavailable.toString()); }
        js("(function(){var trace=window.__d403UnifiedTouchDebug;if(trace)trace.sample("+JSONObject.quote(stage)+",null,"+nativeState.toString()+");return true;})()");
    }
    private void finishUnifiedTouchTrace() {
        try {
            markUnifiedTouchTrace("before-case-cleanup");
            JSONObject trace=(JSONObject)js("(function(){var d=window.__d403UnifiedTouchDebug;if(!d)return {missing:true};var result=d.read();d.dispose();delete window.__d403UnifiedTouchDebug;return result;})()");
            write("unified-timer-touch-trace.json",trace.toString(2));
        } catch(Throwable failure) {try{write("unified-timer-touch-trace-error.log",failure.toString());}catch(Exception ignored){}}
    }
    private void requireWebHistoryRow(String id,String text) throws Exception {
        require(Boolean.TRUE.equals(js("(function(){var rows=Array.from(document.querySelectorAll('.timer-history-list [data-session-id]')).filter(e=>e.dataset.sessionId==="+JSONObject.quote(id)+");return rows.length===1&&rows[0].textContent.includes("+JSONObject.quote(text)+");})()")),"Visible Web history has exactly one matching session row and expected outcome/phase");
    }
    private void requireUnifiedDraft(String focus,String rest) throws Exception {
        require(Boolean.TRUE.equals(js("(function(){var f=document.querySelector('[data-form=personal-timer-config]');return !!f&&f.querySelector('[name=durationMinutes]').value==="+JSONObject.quote(focus)+"&&f.querySelector('[name=breakMinutes]').value==="+JSONObject.quote(rest)+";})()")),"Dirty timer configuration fields retain their exact native keyboard input");
    }
    private NativeTimerActivity openUnifiedNative() throws Exception {
        Instrumentation.ActivityMonitor monitor=addMonitor(NativeTimerActivity.class.getName(),null,false);
        Activity opened;
        try {tap("[data-action=personal-native-timer]");opened=monitor.waitForActivityWithTimeout(20000);}
        finally {removeMonitor(monitor);}
        require(opened instanceof NativeTimerActivity,"Actual Web button opens the shared native timer screen");
        unifiedForegroundActivity=(NativeTimerActivity)opened;return unifiedForegroundActivity;
    }
    private String nativeUnifiedText(Activity activity,int id) throws Exception {
        AtomicReference<String> text=new AtomicReference<>();
        runOnMainSync(()->{View view=activity.findViewById(id);require(view instanceof android.widget.TextView,"Observed native text view exists: "+id);text.set(((android.widget.TextView)view).getText().toString());});
        return text.get();
    }
    private void awaitNativeUnifiedText(Activity activity,String expected) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+10000L;String last="";
        while(SystemClock.elapsedRealtime()<deadline){last=nativeUnifiedText(activity,40301)+"\n"+nativeUnifiedText(activity,40314);if(last.contains(expected)&&!last.contains("读取计时状态")&&!last.contains("未确认计时状态"))return;SystemClock.sleep(120);}
        throw new AssertionError("Native timer text did not show expected shared state "+expected+": "+last);
    }
    /** Real native scroll locates the control; the activation itself is a touchscreen tap. */
    private void nativeUnifiedTap(Activity activity,int id) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+12000L;
        while(SystemClock.elapsedRealtime()<deadline){
            final android.graphics.Rect visible=new android.graphics.Rect();
            final int[] location=new int[2],decorLocation=new int[2],decorSize=new int[2];
            final boolean[] shown=new boolean[1],enabled=new boolean[1];
            runOnMainSync(()->{View v=activity.findViewById(id);require(v!=null,"Native timer button exists: "+id);enabled[0]=v.isEnabled();shown[0]=v.getGlobalVisibleRect(visible);v.getLocationOnScreen(location);View decor=activity.getWindow().getDecorView();decor.getLocationOnScreen(decorLocation);decorSize[0]=decor.getWidth();decorSize[1]=decor.getHeight();});
            if(shown[0]&&visible.width()>8&&visible.height()>24&&enabled[0]){
                float x=visible.exactCenterX(),y=visible.exactCenterY();
                long now=SystemClock.uptimeMillis();boolean held=true;Throwable failure=null;
                try {input(now,now,MotionEvent.ACTION_DOWN,x,y);input(now,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y);held=false;}
                catch(Exception|Error error){failure=error;throw error;}
                finally {if(held)try{input(now,SystemClock.uptimeMillis(),MotionEvent.ACTION_CANCEL,x,y);}catch(Exception|Error cancel){if(failure!=null)failure.addSuppressed(cancel);else throw cancel;}}
                settle();return;
            }
            if(!shown[0]||visible.height()<=24){
                boolean targetBelow=location[1]>decorLocation[1]+decorSize[1]/2;
                float x=decorLocation[0]+decorSize[0]*.6f;
                float from=decorLocation[1]+decorSize[1]*(targetBelow?.78f:.28f),to=decorLocation[1]+decorSize[1]*(targetBelow?.28f:.78f);
                long down=SystemClock.uptimeMillis();boolean held=true;float y=from;Throwable failure=null;
                try {
                    input(down,down,MotionEvent.ACTION_DOWN,x,y);
                    for(int i=1;i<=12;i++){SystemClock.sleep(25);y=from+(to-from)*i/12;input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,x,y);}
                    input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y);held=false;
                } catch(Exception|Error error){failure=error;throw error;}
                finally {if(held)try{input(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_CANCEL,x,y);}catch(Exception|Error cancel){if(failure!=null)failure.addSuppressed(cancel);else throw cancel;}}
                settle();
            } else SystemClock.sleep(120);
        }
        throw new AssertionError("Native timer button did not become visibly enabled for real touch: "+id);
    }
    private void waitRealTimerMinute() {
        long deadline=SystemClock.elapsedRealtime()+61000L;
        while(SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(Math.max(1L,Math.min(1000L,deadline-SystemClock.elapsedRealtime())));
    }
    private static long timerMapTotal(JSONObject value,String field) throws Exception {
        long total=0;JSONObject map=value.getJSONObject(field);
        for(java.util.Iterator<String> it=map.keys();it.hasNext();)total+=map.getLong(it.next());
        return total;
    }
    private static int historyCount(JSONObject value,String id) throws Exception {
        int count=0;JSONArray rows=value.getJSONArray("history");
        for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).getString("id")))count++;
        return count;
    }
    private static JSONObject historyRow(JSONObject value,String id) throws Exception {
        JSONArray rows=value.getJSONArray("history");
        for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).getString("id")))return rows.getJSONObject(i);
        throw new AssertionError("Missing terminal history for shared session "+id);
    }
    private static void requireSameTerminalTimer(JSONObject expected,JSONObject actual,String id) throws Exception {
        require(id.equals(actual.getString("sessionId"))&&expected.getString("status").equals(actual.getString("status"))&&expected.getString("phase").equals(actual.getString("phase"))
            &&expected.getLong("elapsedMillis")==actual.getLong("elapsedMillis")&&expected.getLong("remainingMillis")==actual.getLong("remainingMillis"),"Both readers retain the same terminal timer identity, phase, status and time");
        require(historyCount(actual,id)==1&&canonicalTimerJson(expected.getJSONArray("history")).equals(canonicalTimerJson(actual.getJSONArray("history"))),"Reading or claiming completion never duplicates or rewrites terminal history");
        require(canonicalTimerJson(expected.getJSONObject("focusedMillisByDay")).equals(canonicalTimerJson(actual.getJSONObject("focusedMillisByDay")))
            &&canonicalTimerJson(expected.getJSONObject("completedSessionsByDay")).equals(canonicalTimerJson(actual.getJSONObject("completedSessionsByDay"))),"Both readers retain exactly the same focus statistics");
    }
    private static String canonicalTimerJson(Object value) throws Exception {
        if(value instanceof JSONObject){
            JSONObject object=(JSONObject)value;java.util.List<String> keys=new java.util.ArrayList<>();
            for(java.util.Iterator<String> it=object.keys();it.hasNext();)keys.add(it.next());java.util.Collections.sort(keys);
            StringBuilder text=new StringBuilder("{");for(String key:keys){if(text.length()>1)text.append(',');text.append(JSONObject.quote(key)).append(':').append(canonicalTimerJson(object.get(key)));}return text.append('}').toString();
        }
        if(value instanceof JSONArray){JSONArray rows=(JSONArray)value;StringBuilder text=new StringBuilder("[");for(int i=0;i<rows.length();i++){if(i>0)text.append(',');text.append(canonicalTimerJson(rows.get(i)));}return text.append(']').toString();}
        return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);
    }

    private NativeWorkLifecycleChecks.Host workLifecycleHost() {
        return new NativeWorkLifecycleChecks.Host() {
            public Instrumentation instrumentation() { return PreviewInstrumentation.this; }
            public MainActivity main() { return PreviewInstrumentation.this.main; }
            public Object js(String expression) throws Exception { return PreviewInstrumentation.this.js(expression); }
            public void tap(String selector) throws Exception { PreviewInstrumentation.this.tap(selector); }
            public void typeText(String selector,String text) throws Exception { PreviewInstrumentation.this.typeText(selector,text); }
            public void openPage(String route) throws Exception { PreviewInstrumentation.this.openPageByTouch(route); }
            public void home() throws Exception { PreviewInstrumentation.this.home(); }
            public void launch() throws Exception { PreviewInstrumentation.this.launch(); }
            public void back() { PreviewInstrumentation.this.back(); }
            public void settle() { PreviewInstrumentation.this.settle(); }
            public void shot(String name) throws Exception { PreviewInstrumentation.this.shot(name); }
            public void write(String name,String text) throws Exception { PreviewInstrumentation.this.write(name,text); }
            public void recreate() throws Exception {
                Instrumentation.ActivityMonitor monitor=addMonitor(MainActivity.class.getName(),null,false);
                Activity recreated;
                try { runOnMainSync(() -> main.recreate());recreated=monitor.waitForActivityWithTimeout(20000); }
                finally { removeMonitor(monitor); }
                require(recreated instanceof MainActivity,"Actual Activity recreation returns the isolated MainActivity");
                main=(MainActivity)recreated;waitLoaded();
            }
        };
    }
    private NativeDocumentChooserChecks.Host documentChooserHost() {
        return new NativeDocumentChooserChecks.Host() {
            public Instrumentation instrumentation() { return PreviewInstrumentation.this; }
            public MainActivity main() { return PreviewInstrumentation.this.main; }
            public Object js(String expression) throws Exception { return PreviewInstrumentation.this.js(expression); }
            public void tap(String selector) throws Exception { PreviewInstrumentation.this.tap(selector); }
            public void typeText(String selector,String text) throws Exception { PreviewInstrumentation.this.typeText(selector,text); }
            public void openPage(String route) throws Exception { PreviewInstrumentation.this.openPageByTouch(route); }
            public void home() throws Exception { PreviewInstrumentation.this.home(); }
            public void launch() throws Exception { PreviewInstrumentation.this.launch(); }
            public void back() { PreviewInstrumentation.this.back(); }
            public void settle() { PreviewInstrumentation.this.settle(); }
            public void shot(String name) throws Exception { PreviewInstrumentation.this.shot(name); }
            public void write(String name,String text) throws Exception { PreviewInstrumentation.this.write(name,text); }
        };
    }


    private void assertNativeInsets(String stage, boolean expectIme) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 5000L;
        JSONObject nativeBounds = null, dom = null;
        AssertionError last = null;
        while (SystemClock.elapsedRealtime() < deadline) {
            nativeBounds = NativeInsetsChecks.observe(this, main);
            dom = (JSONObject)js("(function(){var toolbar=document.querySelector('.topbar'),toggle=document.querySelector('[data-action=nav-toggle]'),v=visualViewport,r=e=>{if(!e)return null;var b=e.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};},t=r(toggle);if(t){var hit=document.elementFromPoint(t.left+t.width/2,t.top+t.height/2);t.hit=hit===toggle||!!toggle?.contains(hit);}return {width:innerWidth,height:innerHeight,visualViewport:v?{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale}:null,toolbar:r(toolbar),navigationToggle:t};})()");
            try { NativeInsetsChecks.verify(nativeBounds, dom, expectIme); last = null; break; }
            catch (AssertionError pending) { last = pending; SystemClock.sleep(50); }
        }
        write("native-insets-" + stage + ".json", new JSONObject().put("native", nativeBounds).put("dom", dom).put("expectIme", expectIme).toString(2));
        if (last != null) throw last;
        require(nativeBounds != null && dom != null, "Inset geometry was actually observed");
    }

    private void check(String name,Check check) { long started=SystemClock.elapsedRealtime();observeInputBoundary(name,"before");try{check.run();record(name,null,SystemClock.elapsedRealtime()-started);}catch(Throwable e){record(name,e,SystemClock.elapsedRealtime()-started);try{shot("failure-"+name);}catch(Exception ignored){}}finally{observeInputBoundary(name,"after");} }
    /** Read-only diagnosis; never clears selection, focus or a native popup. */
    private void observeInputBoundary(String name,String stage) {
        try {
            JSONObject row=new JSONObject().put("case",name).put("stage",stage).put("uptimeMillis",SystemClock.uptimeMillis()).put("wallMillis",System.currentTimeMillis());
            row.put("web",js("(function(){var s=getSelection(),a=document.activeElement;return {route:window.D4Prototype?.getRoute(),focused:document.hasFocus(),active:a?{tag:a.tagName,name:a.getAttribute('name'),action:a.getAttribute('data-action')}:null,selection:s?{collapsed:s.isCollapsed,ranges:s.rangeCount,text:s.toString().slice(0,200),anchor:s.anchorNode?.parentElement?.tagName,focus:s.focusNode?.parentElement?.tagName}:null};})()"));
            final boolean[] nativeFocus=new boolean[2];runOnMainSync(()->{nativeFocus[0]=main.previewWebView().hasFocus();nativeFocus[1]=main.previewWebView().hasWindowFocus();});
            row.put("webViewHasFocus",nativeFocus[0]).put("webViewHasWindowFocus",nativeFocus[1]);
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            try{if(root!=null)row.put("activeWindow",new JSONObject().put("class",String.valueOf(root.getClassName())).put("package",String.valueOf(root.getPackageName())).put("windowId",root.getWindowId()));}finally{if(root!=null)root.recycle();}
            inputBoundaries.put(row);write("native-input-boundaries.json",inputBoundaries.toString(2));
        } catch(Throwable error) { try{write("native-input-boundary-error.log",name+" / "+stage+" / "+error);}catch(Exception ignored){} }
    }
    /** Read-only first-down diagnosis. Keeps captured node identity across renderer updates. */
    private JSONObject beginSubtaskDragTrace(String selector,float[] point) {
        JSONObject proof=new JSONObject();
        try {
            proof.put("kind","mytodo-d403-native-subtask-first-down-trace")
                .put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT)
                .put("nativeBefore",subtaskTraceNativeWindows()).put("selector",selector)
                .put("cssX",point[0]).put("cssY",point[1]);
            js("(function(selector, point) {\n  var old = window.__d403SubtaskDragTrace;\n  if (old) old.stop();\n  var rows = [], dropped = 0, ids = new WeakMap(), nextId = 1;\n  var capturedHandle = document.querySelector(selector);\n  var capturedRow = capturedHandle?.closest('.task-row');\n  var rowSelector = '[data-subtask-list] [data-task-id=\"d403-native-child-a\"]';\n  var currentHandle = () => document.querySelector(selector);\n  var currentRow = () => document.querySelector(rowSelector);\n  function describe(node) {\n    if (!node) return null;\n    if (!ids.has(node)) ids.set(node, nextId++);\n    var el = node.nodeType === 1 ? node : node.parentElement;\n    return {nodeId: ids.get(node), nodeType: node.nodeType, tag: el?.tagName || null,\n      connected: node.isConnected, taskId: el?.closest?.('.task-row')?.dataset.taskId || null,\n      action: el?.closest?.('[data-action]')?.dataset.action || null,\n      name: el?.getAttribute?.('name') || null,\n      classes: typeof el?.className === 'string' ? el.className.slice(0, 240) : null};\n  }\n  function selection() {\n    var s = getSelection(), a = document.activeElement;\n    return {type: s?.type || null, ranges: s?.rangeCount || 0, collapsed: s?.isCollapsed !== false,\n      length: s?.toString().length || 0, text: s?.toString().slice(0, 80) || '',\n      anchor: describe(s?.anchorNode), focus: describe(s?.focusNode), active: describe(a),\n      selectionStart: typeof a?.selectionStart === 'number' ? a.selectionStart : null,\n      selectionEnd: typeof a?.selectionEnd === 'number' ? a.selectionEnd : null};\n  }\n  function read(stage, event, detail) {\n    if (rows.length >= 192) { dropped++; return; }\n    var p = event?.changedTouches?.[0] || event;\n    var x = Number.isFinite(p?.clientX) ? p.clientX : point[0];\n    var y = Number.isFinite(p?.clientY) ? p.clientY : point[1];\n    var handle = currentHandle(), row = currentRow();\n    rows.push({stage: stage, now: performance.now(), wallMillis: Date.now(),\n      eventTimeStamp: event?.timeStamp ?? null, type: event?.type || null,\n      trusted: event?.isTrusted ?? null, defaultPrevented: event?.defaultPrevented ?? null,\n      pointerType: event?.pointerType || null, touches: event?.touches?.length ?? null,\n      target: describe(event?.target), path: event?.composedPath?.().slice(0, 8).map(describe) || [],\n      x: x, y: y, hit: describe(document.elementFromPoint(x, y)),\n      capturedHandle: describe(capturedHandle), capturedRow: describe(capturedRow),\n      currentHandle: describe(handle), currentRow: describe(row),\n      sameHandle: handle === capturedHandle, sameRow: row === capturedRow,\n      dragging: Array.from(document.querySelectorAll('.dragging')).slice(0, 4).map(describe),\n      ghost: describe(document.querySelector('.drag-ghost')),\n      modalOpen: !!document.querySelector('[data-form=task-edit]'),\n      focused: document.hasFocus(), visibility: document.visibilityState,\n      selection: selection(), detail: detail || null});\n  }\n  var types = ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel',\n    'click','contextmenu','selectionchange','focus','blur'];\n  var capture = e => read('window-capture', e);\n  var bubble = e => read('window-bubble', e);\n  types.forEach(type => { window.addEventListener(type, capture, true); window.addEventListener(type, bubble, false); });\n  function relevant(node) {\n    if (!node || node.nodeType !== 1) return false;\n    return node === capturedHandle || node === capturedRow || node.contains(capturedRow) ||\n      node.matches('.task-row,.drag-handle,.drag-ghost,[data-subtask-list],#modal-root') ||\n      !!node.querySelector(rowSelector + ',.drag-ghost,[data-subtask-list]');\n  }\n  var observer = new MutationObserver(mutations => {\n    var changes = [];\n    for (var mutation of mutations) {\n      if (mutation.type === 'attributes') {\n        if (!mutation.target.matches('.task-row,.drag-handle,.drag-ghost,[data-subtask-list],#modal-root')) continue;\n        changes.push({kind: 'attribute', target: describe(mutation.target), attribute: mutation.attributeName,\n          oldValue: mutation.oldValue, currentValue: mutation.target.getAttribute(mutation.attributeName)});\n      } else {\n        var added = Array.from(mutation.addedNodes).filter(relevant);\n        var removed = Array.from(mutation.removedNodes).filter(relevant);\n        if (!added.length && !removed.length) continue;\n        changes.push({kind: 'childList', target: describe(mutation.target),\n          added: added.slice(0, 8).map(describe), removed: removed.slice(0, 8).map(describe),\n          addedCount: added.length, removedCount: removed.length});\n      }\n      if (changes.length >= 12) break;\n    }\n    if (changes.length) read('dom-mutation', null, {changes: changes, mutationCount: mutations.length});\n  });\n  observer.observe(document.body, {childList: true, subtree: true, attributes: true,\n    attributeFilter: ['class'], attributeOldValue: true});\n  var stopRepo = D4Prototype.repo.subscribe((state, change) => read('repo-publish', null,\n    {changeType: change?.type || null}));\n  var timer = setInterval(() => read('sample'), 100);\n  var stopped = false;\n  function stop() {\n    if (stopped) return;\n    stopped = true; clearInterval(timer); observer.disconnect(); stopRepo();\n    types.forEach(type => { window.removeEventListener(type, capture, true); window.removeEventListener(type, bubble, false); });\n  }\n  window.__d403SubtaskDragTrace = {read: () => ({rows: rows, dropped: dropped, maxRows: 192}),\n    mark: stage => read(stage), stop: stop};\n  read('before-native-down');\n  return true;\n})(" + JSONObject.quote(selector) + ", " + new JSONArray().put(point[0]).put(point[1]).toString() + ")\n");
            proof.put("installed",true);
        } catch(Throwable error) { try{proof.put("installError",error.toString());}catch(Exception ignored){} }
        return proof;
    }
    private void finishSubtaskDragTrace(JSONObject proof,long downUptime,long assertionReadUptime) {
        try {
            proof.put("nativeDownUptimeMillis",downUptime).put("activationAssertionReadRequestedUptimeMillis",assertionReadUptime)
                .put("requestedReadAfterDownMs",assertionReadUptime>=0&&downUptime>=0?assertionReadUptime-downUptime:JSONObject.NULL);
            proof.put("web",js("(function(){var p=window.__d403SubtaskDragTrace;if(!p)return {absent:true};p.mark('after-native-touch-close');var result=p.read();p.stop();delete window.__d403SubtaskDragTrace;return result;})()"));
            proof.put("nativeAfter",subtaskTraceNativeWindows());
            write("native-subtask-drag-event-trace.json",proof.toString(2));
        } catch(Throwable error) { try{write("native-subtask-drag-event-trace-error.log",error.toString());}catch(Exception ignored){} }
    }
    /** Enumeration is observational; empty/limited results cannot establish that a popup is absent. */
    private JSONObject subtaskTraceNativeWindows() throws Exception {
        JSONObject result=new JSONObject().put("uptimeMillis",SystemClock.uptimeMillis()).put("wallMillis",System.currentTimeMillis());
        android.accessibilityservice.AccessibilityServiceInfo info=getUiAutomation().getServiceInfo();
        int flags=info==null?0:info.flags;
        result.put("serviceFlags",flags).put("retrieveInteractiveWindowsEnabled",(flags&android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS)!=0)
            .put("interpretation","Read-only accessibility inventory; missing or empty windows are not proof that no native popup exists");
        JSONArray windows=new JSONArray();
        java.util.List<android.view.accessibility.AccessibilityWindowInfo> inventory=getUiAutomation().getWindows();
        if(inventory!=null)for(android.view.accessibility.AccessibilityWindowInfo window:inventory){
            try {
                Rect bounds=new Rect();window.getBoundsInScreen(bounds);
                JSONObject row=new JSONObject().put("id",window.getId()).put("type",window.getType()).put("layer",window.getLayer())
                    .put("active",window.isActive()).put("focused",window.isFocused()).put("accessibilityFocused",window.isAccessibilityFocused())
                    .put("bounds",bounds.toShortString()).put("title",window.getTitle()==null?JSONObject.NULL:String.valueOf(window.getTitle()));
                AccessibilityNodeInfo root=window.getRoot();
                try{if(root!=null)row.put("rootClass",String.valueOf(root.getClassName())).put("rootPackage",String.valueOf(root.getPackageName()));}
                finally{if(root!=null)root.recycle();}
                windows.put(row);
            } finally { window.recycle(); }
        }
        return result.put("windows",windows);
    }


    private void beginHeldTouchTrace() throws Exception {
        js("(function() {\n  var rows = [], dropped = 0, ids = new WeakMap(), nextId = 1;\n  var capturedTitle = document.querySelector('.single-quadrant [data-quadrant=\"0\"] .quadrant-list .task-row:first-child .task-title');\n  var capturedRow = capturedTitle?.closest('.task-row'), sourceId = capturedRow?.dataset.taskId || '';\n  var currentRow = () => Array.from(document.querySelectorAll('.single-quadrant .task-row')).find(r => r.dataset.taskId === sourceId) || null;\n  function node(n) {\n    if (!n) return null;\n    if (!ids.has(n)) ids.set(n, nextId++);\n    var el = n.nodeType === 1 ? n : n.parentElement;\n    return {nodeId: ids.get(n), nodeType: n.nodeType, tag: el?.tagName || null,\n      taskId: el?.closest?.('.task-row')?.dataset.taskId || null, connected: n.isConnected,\n      classes: typeof el?.className === 'string' ? el.className.slice(0, 240) : null};\n  }\n  function read(stage, e, detail) {\n    if (rows.length >= 128) { dropped++; return; }\n    var s = getSelection(), t = e?.target, p = e?.changedTouches?.[0], current = currentRow();\n    rows.push({stage: stage, now: performance.now(), wallMillis: Date.now(), eventTime: e?.timeStamp,\n      type: e?.type, trusted: e?.isTrusted, prevented: e?.defaultPrevented, ctrl: e?.ctrlKey,\n      target: t?.tagName, task: t?.closest?.('[data-task-id]')?.dataset.taskId, x: p?.clientX, y: p?.clientY,\n      focused: document.hasFocus(), selection: s ? {collapsed: s.isCollapsed, text: s.toString().slice(0, 200)} : null,\n      dragging: !!document.querySelector('.dragging'), ghost: !!document.querySelector('.drag-ghost'),\n      eventTarget: node(t), capturedTitle: node(capturedTitle), capturedRow: node(capturedRow),\n      currentRow: node(current), sameRow: current === capturedRow,\n      sameTitle: current?.querySelector('.task-title') === capturedTitle, sourceId: sourceId, detail: detail || null});\n  }\n  var types = ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointercancel','contextmenu','selectionchange','blur','focus'];\n  var listener = e => read('event', e);\n  types.forEach(type => window.addEventListener(type, listener, true));\n  function relevant(n) {\n    if (!n || n.nodeType !== 1) return false;\n    return n === capturedTitle || n === capturedRow || n.contains(capturedRow) ||\n      n.matches('.drag-ghost') || !!n.querySelector('.single-quadrant .task-row,.drag-ghost') ||\n      (n.matches('.task-row') && n.dataset.taskId === sourceId);\n  }\n  var observer = new MutationObserver(mutations => {\n    var changes = [];\n    for (var m of mutations) {\n      if (m.type === 'attributes') {\n        if (m.target !== capturedRow && (!m.target.matches('.task-row') || m.target.dataset.taskId !== sourceId)) continue;\n        changes.push({kind: 'attribute', target: node(m.target), attribute: m.attributeName,\n          oldValue: m.oldValue, currentValue: m.target.getAttribute(m.attributeName)});\n      } else {\n        var added = Array.from(m.addedNodes).filter(relevant), removed = Array.from(m.removedNodes).filter(relevant);\n        if (!added.length && !removed.length) continue;\n        changes.push({kind: 'childList', target: node(m.target), added: added.slice(0, 6).map(node),\n          removed: removed.slice(0, 6).map(node), addedCount: added.length, removedCount: removed.length});\n      }\n      if (changes.length >= 8) break;\n    }\n    if (changes.length) read('dom-mutation', null, {changes: changes, mutationCount: mutations.length});\n  });\n  observer.observe(document.body, {childList: true, subtree: true, attributes: true,\n    attributeFilter: ['class'], attributeOldValue: true});\n  var stopRepo = D4Prototype.repo.subscribe((state, detail) => read('repo-publish', null,\n    {changeType: detail?.type || null, detailKeys: detail ? Object.keys(detail).slice(0, 12) : []}));\n  var timer = setInterval(() => read('sample'), 100), stopped = false;\n  window.__d403HeldTrace = {\n    read: () => rows.concat([{stage: 'trace-summary', dropped: dropped, maxMeasurementRows: 128}]),\n    stop: () => {\n      if (stopped) return;\n      stopped = true; clearInterval(timer); observer.disconnect(); stopRepo();\n      types.forEach(type => window.removeEventListener(type, listener, true));\n    }\n  };\n  read('before-down');\n  return true;\n})()\n");
    }
    private void finishHeldTouchTrace() {
        try{Object trace=js("(function(){var p=window.__d403HeldTrace;if(!p)return null;var rows=p.read();p.stop();delete window.__d403HeldTrace;return rows;})()");write("native-held-event-trace.json",String.valueOf(trace));}
        catch(Throwable error){try{write("native-held-event-trace-error.log",error.toString());}catch(Exception ignored){}}
    }
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
        markDirtyNavigationTrace("before-edge-"+route);
        edgeOpen();markDirtyNavigationTrace("after-edge-before-single-tap-"+route);
        tap(".side-nav [data-action=go][data-id='"+route+"']");
        markDirtyNavigationTrace("after-single-tap-"+route);
        require(route.equals(js("D4Prototype.getRoute()")),"Real drawer item opens "+route);
        require(Boolean.TRUE.equals(js("!document.querySelector('.app-shell.nav-open')")),"Real page selection closes the drawer");
    }
    /** Observational only: no retry, focus/selection changes, or navigation commands. */
    private void beginDirtyNavigationTrace() {
        try {
            js("(function(){var rows=[],dropped=0,ids=new WeakMap(),serial=0;"+
                "function node(n){var e=n&&n.nodeType===1?n:n?.parentElement;if(!e)return null;if(!ids.has(e))ids.set(e,++serial);var action=e.closest('[data-action]');return {node:ids.get(e),tag:e.tagName,action:action?.dataset.action||null,id:action?.dataset.id||null,name:e.getAttribute('name'),connected:e.isConnected};}"+
                "function sample(stage,event,extra){if(rows.length>=512){dropped++;return;}var a=document.activeElement,s=getSelection(),nav=document.querySelector('.side-nav'),r=nav?.getBoundingClientRect(),p=event?.changedTouches?.[0]||event,x=Number.isFinite(p?.clientX)?p.clientX:null,y=Number.isFinite(p?.clientY)?p.clientY:null,v=visualViewport,f=document.querySelector('[data-form=personal-timer-config]');rows.push({stage:stage,wallMillis:Date.now(),performanceMillis:performance.now(),route:D4Prototype.getRoute(),focused:document.hasFocus(),visibility:document.visibilityState,active:node(a),selection:{type:s?.type||null,collapsed:s?.isCollapsed!==false,ranges:s?.rangeCount||0,textLength:s?.toString().length||0,selectionStart:typeof a?.selectionStart==='number'?a.selectionStart:null,selectionEnd:typeof a?.selectionEnd==='number'?a.selectionEnd:null},draft:f?{duration:f.querySelector('[name=durationMinutes]')?.value,rest:f.querySelector('[name=breakMinutes]')?.value}:null,nav:{open:!!document.querySelector('.app-shell.nav-open'),node:node(nav),rect:r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom}:null,transform:nav?getComputedStyle(nav).transform:null,animations:nav?nav.getAnimations({subtree:true}).map(a=>({playState:a.playState,currentTime:a.currentTime})):[]},viewport:{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,scale:v.scale},event:event?{type:event.type,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented,pointerType:event.pointerType||null,key:event.key||null,eventTime:event.timeStamp,x:x,y:y,target:node(event.target),hit:x===null?null:node(document.elementFromPoint(x,y))}:null,extra:extra||null});}"+
                "var types=['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','click','keydown','keyup','selectionchange','focusin','focusout'],capture=e=>sample('window-capture',e),bubble=e=>sample('window-bubble',e);types.forEach(t=>{window.addEventListener(t,capture,true);window.addEventListener(t,bubble,false);});"+
                "var observer=new MutationObserver(records=>{var relevant=records.filter(r=>r.type==='attributes'?r.target.matches('.app-shell,.side-nav'):Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).some(n=>n.nodeType===1&&(n.matches('.app-shell,.side-nav')||n.querySelector('.side-nav'))));if(relevant.length)sample('navigation-mutation',null,{records:relevant.slice(0,8).map(r=>({type:r.type,attribute:r.attributeName,target:node(r.target),added:r.addedNodes.length,removed:r.removedNodes.length}))});});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});"+
                "window.__d403DirtyNavigationTrace={sample:sample,read:()=>({events:rows,dropped:dropped,maxRows:512}),dispose:()=>{observer.disconnect();types.forEach(t=>{window.removeEventListener(t,capture,true);window.removeEventListener(t,bubble,false);});}};sample('trace-start');return true;})()");
            dirtyNavigationTracing=true;
        } catch(Throwable failure) {try{write("dirty-navigation-trace-install-error.log",failure.toString());}catch(Exception ignored){}}
    }
    private void markDirtyNavigationTrace(String stage) {
        if(!dirtyNavigationTracing)return;
        try {
            JSONObject nativeState=subtaskTraceNativeWindows();
            js("(function(){var trace=window.__d403DirtyNavigationTrace;if(trace)trace.sample("+JSONObject.quote(stage)+",null,"+nativeState.toString()+");return true;})()");
        } catch(Throwable failure) {try{write("dirty-navigation-trace-mark-error.log",stage+" / "+failure);}catch(Exception ignored){}}
    }
    private void recordDirtyNavigationInput(String stage,long down,long eventTime,float x,float y) {
        if(!dirtyNavigationTracing)return;
        try {
            long wall=System.currentTimeMillis();
            dirtyNavigationNativeEvents.put(new JSONObject().put("stage",stage).put("wallMillis",wall).put("downTime",down).put("eventTime",eventTime).put("screenX",x).put("screenY",y));
            android.util.Log.i("D403DirtyNavInput",stage+" wallMillis="+wall+" downTime="+down+" eventTime="+eventTime+" screenX="+x+" screenY="+y);
        } catch(Exception ignored){}
    }
    private void finishDirtyNavigationTrace() {
        if(!dirtyNavigationTracing)return;
        try {
            markDirtyNavigationTrace("before-case-cleanup");
            JSONObject trace=(JSONObject)js("(function(){var p=window.__d403DirtyNavigationTrace;if(!p)return {missing:true};var result=p.read();p.dispose();delete window.__d403DirtyNavigationTrace;return result;})()");
            trace.put("nativeInput",dirtyNavigationNativeEvents).put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT)
                .put("interpretation","Read-only trace; no retry, selection clearing, injected DOM click, or root-cause claim. Missing accessibility windows are not proof of absent menus.");
            write("unified-timer-dirty-navigation-trace.json",trace.toString(2));
        } catch(Throwable failure) {try{write("dirty-navigation-trace-finish-error.log",failure.toString());}catch(Exception ignored){}}
        finally{dirtyNavigationTracing=false;}
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
    private void input(long down,long now,int action,float x,float y) { MotionEvent event=MotionEvent.obtain(down,now,action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{if(action==MotionEvent.ACTION_DOWN||action==MotionEvent.ACTION_UP)recordDirtyNavigationInput(action==MotionEvent.ACTION_DOWN?"native-down":"native-up",down,now,x,y);require(getUiAutomation().injectInputEvent(event,true),"Native MotionEvent injection");}finally{event.recycle();} }
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
