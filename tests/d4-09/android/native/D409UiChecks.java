package local.gxtodo.replica;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import android.graphics.Point;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebView;
import android.widget.EditText;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Independent real-input checks for the documented native candidate UI contract. */
final class D409UiChecks {
    final D409UiInstrumentation t;
    D409UiChecks(D409UiInstrumentation test) { t = test; }
    static void run(D409UiInstrumentation t) {
        D409UiChecks s = new D409UiChecks(t);
        t.test("U01-native-timer-controls-and-layout", s::timer);
        t.test("U02-activity-draft-and-background-recovery", s::recovery);
        t.test("U03-task-hierarchy-duplicate-search-and-collapse", s::picker);
        t.test("U04-thirteen-routes-through-real-menu", s::routes);
        t.test("U05-keyboard-drawer-modal-priority", s::priority);
        t.test("U06-physical-system-back-picker-and-activity", s::systemBack);
        t.test("U07-edge-input-and-physical-back-arbitration", s::edge);
        t.test("U08-bottom-system-home-and-outside-exclusion", s::homeAndOutside);
    }
    void check(boolean value, String message) { D409UiInstrumentation.check(value, message); }
    Activity timerReady() throws Exception {
        Activity activity = t.launch(D408TimerActivity.class);
        t.until("native timer ready", 10000, () -> t.findId(40310) != null && t.findId(40310).isEnabled()); return activity;
    }
    JSONObject timer() throws Exception {
        t.configure(); Activity page = timerReady(); JSONArray targets = new JSONArray();
        for (int id : new int[]{40302,40304,40305,40307,40308,40309,40306,40810,40811,40310,40821,40822,40831}) {
            View view = t.findId(id); check(view != null, "original control remains in native layout: " + id);
            int[] size = new int[2]; t.runOnMainSync(() -> { size[0] = view.getWidth(); size[1] = view.getHeight(); });
            float density = t.target.getResources().getDisplayMetrics().density;
            check(size[0] / density >= 48 && size[1] / density >= 48, "48dp touch target: " + id);
            t.nativeReveal(id); Rect visible = new Rect(); boolean[] shown = {false};
            t.runOnMainSync(() -> shown[0] = view.getLocalVisibleRect(visible));
            check(shown[0] && visible.left == 0 && visible.top == 0 && visible.right == size[0] && visible.bottom == size[1], "entire native control visible after reveal: " + id);
            check(visible.height() / density >= 48, "visible 48dp target, including lower border: " + id);
            targets.put(new JSONObject().put("id", id).put("widthDp", size[0] / density).put("heightDp", size[1] / density).put("localVisible", visible.toShortString()));
        }
        t.nativeTap(40302); t.until("actual start", 5000, () -> t.state().optBoolean("running")); JSONObject started = t.state();
        t.nativeReveal(40301); t.shot("timer-running"); t.nativeTap(40304); t.until("actual pause", 5000, () -> "paused".equals(t.state().optString("status")));
        long paused = t.state().getLong("elapsedMillis"); SystemClock.sleep(1150); check(paused == t.state().getLong("elapsedMillis"), "paused durable elapsed unchanged");
        t.nativeReveal(40301); t.shot("timer-paused"); t.nativeTap(40305); t.until("actual resume", 5000, () -> t.state().optBoolean("running"));
        t.nativeTap(40308); t.until("actual countup finish", 5000, () -> "completed".equals(t.state().optString("status")));
        JSONObject history = t.state().getJSONArray("history").getJSONObject(0); check(started.getString("sessionId").equals(history.getString("id")), "same completed session");
        t.nativeReveal(40301); t.shot("timer-completed"); return new JSONObject().put("targets", targets).put("session", started.getString("sessionId")).put("history", history);
    }
    JSONObject recovery() throws Exception {
        t.configure(); Activity page = timerReady(); t.nativeTap(40302); t.until("started", 5000, () -> t.state().optBoolean("running"));
        t.replaceText((EditText)t.findId(40312), "37"); t.dismissIme(); JSONObject before = t.state();
        Instrumentation.ActivityMonitor monitor = t.addMonitor(D408TimerActivity.class.getName(), null, false);
        t.runOnMainSync(page::recreate); Activity recreated = t.waitForMonitorWithTimeout(monitor, 12000); t.removeMonitor(monitor);
        check(recreated != null, "real Activity recreation"); t.current = recreated; t.awaitForeground(recreated);
        t.until("restored dirty minutes", 8000, () -> t.findId(40312) != null && "37".equals(t.text(t.findId(40312))));
        check(before.getString("sessionId").equals(t.state().getString("sessionId")), "recreation preserves session"); t.shot("timer-recreated-draft");
        t.runOnMainSync(() -> recreated.moveTaskToBack(true)); SystemClock.sleep(1300); JSONObject background = t.state();
        check(background.getLong("elapsedMillis") > before.getLong("elapsedMillis"), "native time advances while Activity is backgrounded");
        t.runOnMainSync(() -> recreated.startActivity(new Intent(recreated,D408TimerActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))); t.awaitForeground(recreated);
        check("37".equals(t.text(t.findId(40312))), "same resumed Activity retains unsaved draft");
        check(before.getString("sessionId").equals(t.state().getString("sessionId")), "background return preserves session"); t.shot("timer-background-return");
        t.command("reset", new JSONObject()); return new JSONObject().put("before", before).put("background", background).put("restoredDraft", "37");
    }
    JSONObject picker() throws Exception {
        t.configure(); WebView web = t.host(); String stem = "d409-" + t.phase, match = "D409_PICKER_" + t.phase;
        String a = stem + "-parent-a", b = stem + "-parent-b", c = stem + "-child-a", d = stem + "-child-b", g = stem + "-grandchild";
        JSONArray fixtures = new JSONArray().put(new JSONObject().put("id", a).put("title", match + " Parent A"))
            .put(new JSONObject().put("id", b).put("title", match + " Parent B"))
            .put(new JSONObject().put("id", c).put("title", match + " Duplicate").put("parent", a))
            .put(new JSONObject().put("id", d).put("title", match + " Duplicate").put("parent", b))
            .put(new JSONObject().put("id", g).put("title", match + " Grandchild").put("parent", c));
        t.js(web, "D4Prototype.repo.batch(()=>{for(const f of " + fixtures + "){if(!D4Prototype.repo.getTask(f.id))D4Prototype.repo.createTask({id:f.id,title:f.title},f.parent||null);}})");
        t.until("five fixture tasks mirrored", 10000, () -> PomodoroTasks.search(t.target, match, 100).getJSONArray("tasks").length() == 5);
        Activity page = timerReady(); t.nativeTap(40810); t.until("native search", 5000, () -> t.findId(40812) instanceof EditText);
        t.until("root row A", 8000, () -> t.findTag("d409-task-select:" + a) != null);
        check(t.findTag("d409-task-select:" + c) == null, "child initially collapsed");
        t.tagTap("d409-task-toggle:" + a); t.until("expanded child", 5000, () -> t.findTag("d409-task-select:" + c) != null);
        t.tagTap("d409-task-toggle:" + c); t.until("third level", 5000, () -> t.findTag("d409-task-select:" + g) != null);
        t.shot("picker-expanded-third-level"); t.tagTap("d409-task-toggle:" + c); check(t.findTag("d409-task-select:" + g) == null, "collapse hides child without selection");
        t.replaceText((EditText)t.findId(40812), match + " Duplicate"); t.dismissIme();
        t.until("duplicate results", 8000, () -> t.findTag("d409-task-select:" + c) != null && t.findTag("d409-task-select:" + d) != null);
        t.until("duplicate ancestor enrichment",8000,()->t.findTag("d409-task-context:"+c)!=null&&t.findTag("d409-task-context:"+d)!=null&&t.text(t.findTag("d409-task-context:"+c)).contains("Parent A")&&t.text(t.findTag("d409-task-context:"+d)).contains("Parent B"));
        t.shot("picker-duplicate-context"); t.replaceText((EditText)t.findId(40812), ""); t.dismissIme();
        t.until("clear query restores expansion", 8000, () -> t.findTag("d409-task-select:" + c) != null);
        check(t.findTag("d409-task-select:" + g) == null, "clear query restores explicit collapsed grandchild");
        t.replaceText((EditText)t.findId(40812), match + " Duplicate"); t.dismissIme();
        t.until("select intended duplicate", 8000, () -> t.findTag("d409-task-select:" + d) != null); t.tagTap("d409-task-select:" + d);
        check(!d.equals(t.state().optString("taskId")), "selecting task only changes unsaved draft");
        t.nativeTap(40310); t.until("chosen ID saved", 8000, () -> d.equals(t.state().optString("taskId"))); t.shot("picker-saved-association");
        return new JSONObject().put("fixtures", fixtures).put("savedTaskId", d).put("selectionViaRealNativeTouch", true).put("fixtureSetup", "existing isolated repository API; no raw DB mutation");
    }
    JSONObject routes() throws Exception {
        WebView web = t.host(); JSONArray rows = new JSONArray();
        for (String route : new String[]{"tasks","notes","pomodoro","feedback","analytics","dashboard","work-items","projects","templates","processes","contacts","archive","settings"}) {
            t.webTap(web, "[data-action=nav-toggle]"); check("true".equals(t.js(web, "document.querySelector('.app-shell').classList.contains('nav-open')")), "menu opens");
            t.webTap(web, ".side-nav [data-action=go][data-id='" + route + "']");
            t.until("actual menu route " + route, 5000, () -> JSONObject.quote(route).equals(t.js(web, "D4Prototype.getRoute()")));
            check("false".equals(t.js(web, "document.querySelector('.app-shell').classList.contains('nav-open')")), "choosing route closes drawer");
            t.shot("route-" + route);
            rows.put(route);
        }
        return new JSONObject().put("routes", rows).put("method", "real native touches on menu and route controls; no JS navigation for the assertions");
    }
    JSONObject priority() throws Exception {
        WebView web = t.host(); t.route(web, "tasks"); t.webTap(web, "[data-action=task-new]");
        t.webTap(web, "[data-form=task-edit] [name=title]"); String draft = "D409_BACK_PRIORITY_" + t.phase; t.sendStringSync(draft); t.waitForIdleSync();
        t.until("real keyboard visible", 5000, t::imeVisible); t.physicalBack();
        t.until("system Back closes keyboard first", 5000, () -> !t.imeVisible());
        check(JSONObject.quote(draft).equals(t.js(web, "document.querySelector('[data-form=task-edit] [name=title]').value")), "keyboard dismissal preserves full draft");
        check("true".equals(t.js(web, "!!document.querySelector('#modal-root .modal')")), "editor remains after first Back"); t.shot("back-keyboard-priority");
        // Existing task editor saves a valid draft on Back. This is not the prototype's discard dialog.
        t.physicalBack(); t.until("second Back closes editor", 8000, () -> "false".equals(t.js(web, "!!document.querySelector('#modal-root .modal')")));
        check("true".equals(t.js(web, "D4Prototype.repo.search(" + JSONObject.quote(draft) + ").tasks.some(t=>t.title===" + JSONObject.quote(draft) + ")")), "existing save-on-leave contract preserved");
        String before = t.js(web, "JSON.stringify(D4Prototype.repo.state)"); t.webTap(web, "[data-action=nav-toggle]"); t.physicalBack();
        t.until("Back closes drawer", 5000, () -> "false".equals(t.js(web, "document.querySelector('.app-shell').classList.contains('nav-open')")));
        check(before.equals(t.js(web, "JSON.stringify(D4Prototype.repo.state)")), "drawer Back leaves data unchanged");
        return new JSONObject().put("draft", draft).put("order", new JSONArray().put("IME").put("task editor saves according to existing contract").put("drawer"));
    }
    JSONObject systemBack() throws Exception {
        t.configure(); WebView web = t.host(); t.route(web, "pomodoro");
        Instrumentation.ActivityMonitor monitor = t.addMonitor(D408TimerActivity.class.getName(), null, false);
        t.webTap(web, "[data-action=personal-native-timer]"); Activity page = t.waitForMonitorWithTimeout(monitor, 10000); t.removeMonitor(monitor);
        check(page != null, "actual workspace entry opens native Activity"); t.current = page; t.awaitForeground(page);
        t.until("timer ready", 8000, () -> t.findId(40302) != null && t.findId(40302).isEnabled()); t.nativeTap(40302);
        t.until("native running", 5000, () -> t.state().optBoolean("running")); String session = t.state().getString("sessionId");
        t.nativeTap(40810); t.until("picker visible", 5000, () -> t.findId(40812) != null); t.dismissIme(); t.physicalBack();
        t.until("physical Back closes picker only", 5000, () -> t.findId(40812) == null); t.awaitForeground(page); t.shot("system-back-picker-closed");
        t.physicalBack(); t.until("physical Back finishes timer Activity", 8000, page::isFinishing);
        check(session.equals(t.state().getString("sessionId")) && t.state().optBoolean("running"), "Back does not pause/end/reset native timer");
        t.until("workspace visible again", 8000, () -> "true".equals(t.js(web, "document.hasFocus()"))); t.shot("system-back-workspace");
        t.command("reset", new JSONObject()); return new JSONObject().put("sessionId", session).put("input", t.mode.equals("gestural") ? "right physical edge MotionEvents" : "observed SystemUI Back button MotionEvents").put("keyeventFallback", false);
    }
    JSONObject edge() throws Exception {
        WebView web = t.host(); t.route(web, "notes");
        check("64".equals(t.js(web,"DemoMobileControls.navigationContract.edgeCssPixels")),"expanded 64 CSS pixel application content band");
        t.js(web, "window.__d409Touch=[];for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>{const p=e.touches[0]||e.changedTouches[0];window.__d409Touch.push({type:e.type,trusted:e.isTrusted,timeStamp:e.timeStamp,x:p?.clientX,y:p?.clientY});},{passive:true,capture:true})");
        String before = t.js(web, "JSON.stringify(D4Prototype.repo.state)");JSONArray starts=new JSONArray();
        for(int start:new int[]{32,56,63}){
            JSONArray point = new JSONArray(t.js(web, "(()=>{for(let y=90;y<=260;y+=10){const e=document.elementFromPoint("+start+",y);if(e?.closest('main')&&!e.closest('button,a,input,textarea,select,summary,.task-row,.table-wrap'))return ["+start+",y];}throw Error('No actual edge content');})()"));
            t.webGesture(web,start,point.getDouble(1),110,2,300,"content-edge-"+start);
            check("true".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"actual content edge opens drawer at x"+start);starts.put(point);
            t.shot("edge-drawer-x"+start);t.physicalBack();
            t.until("physical system Back closes app drawer",5000,()->"false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")));
        }
        double y=starts.getJSONArray(1).getDouble(1);
        t.webGesture(web,56,y,8,130,300,"expanded-edge-vertical-scroll");
        check("false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"vertical motion retains content priority");
        t.webGesture(web,100,y,100,0,300,"non-edge-rejected");
        check("false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"x100 still belongs to content");
        t.route(web,"tasks");t.webTap(web,"[data-action=task-new]");t.dismissIme();
        JSONArray modalPoint=new JSONArray(t.js(web,"(()=>{for(let y=80;y<innerHeight-100;y+=8){const e=document.elementFromPoint(56,y);if(e?.closest('#modal-root .modal')&&!e.closest('button,a,input,textarea,select,summary,[contenteditable=true],.task-row'))return [56,y];}throw Error('No actual modal content');})()"));
        check(modalPoint.getDouble(0)>48&&modalPoint.getDouble(0)<=64,"modal priority is observed in the added content band; original edge navigation remains available");
        t.webGesture(web,56,modalPoint.getDouble(1),110,1,300,"expanded-edge-modal-priority");
        check("true".equals(t.js(web,"!!document.querySelector('#modal-root .modal')")),"modal remains after content edge swipe");
        check("false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"modal prevents expanded content band from taking over the drawer");t.shot("edge-modal-priority");
        t.physicalBack();t.until("blank editor dismissed",5000,()->"false".equals(t.js(web,"!!document.querySelector('#modal-root .modal')")));
        JSONArray trusted = new JSONArray(t.js(web, "window.__d409Touch")); check(trusted.length() > 0, "observed DOM touch events");
        for (int i = 0; i < trusted.length(); i++) check(trusted.getJSONObject(i).getBoolean("trusted"), "all observed events are trusted");
        check(before.equals(t.js(web,"JSON.stringify(D4Prototype.repo.state)")),"edge, modal arbitration and Back preserve repository");
        return new JSONObject().put("acceptedStartsCss",starts).put("contentBandCss",64).put("nativeExclusionUnchangedDp",48).put("modalStartCss",modalPoint).put("verticalRejected",true).put("trustedDomEvents", trusted).put("physicalBackMode", t.mode).put("repositoryUnchanged", true);
    }
    JSONObject homeAndOutside()throws Exception{
        WebView web=t.host();t.route(web,"notes");Point screen=t.screenSize();final Rect[] exclusion={null};final int[] location=new int[2],mandatory={0};
        t.runOnMainSync(()->{web.getLocationOnScreen(location);java.util.List<Rect> rectangles=web.getSystemGestureExclusionRects();check(rectangles.size()==1,"single original exclusion segment");exclusion[0]=new Rect(rectangles.get(0));android.view.WindowInsets insets=t.current.getWindow().getDecorView().getRootWindowInsets();check(insets!=null,"actual root insets");mandatory[0]=insets.getInsets(android.view.WindowInsets.Type.mandatorySystemGestures()).bottom;});
        check(exclusion[0].left==0&&exclusion[0].width()<=48&&exclusion[0].height()<=200,"original 48dp/200dp exclusion bound at density160");
        check(location[1]+exclusion[0].bottom<screen.y-mandatory[0],"exclusion stays outside mandatory bottom area");
        String before=t.js(web,"JSON.stringify(D4Prototype.repo.state)");t.webTap(web,"[data-action=nav-toggle]");
        if(t.mode.equals("gestural")){
            float outsideY=Math.min(screen.y-mandatory[0]-60,location[1]+exclusion[0].bottom+110);check(outsideY>location[1]+exclusion[0].bottom,"outside left exclusion test coordinate");
            t.gesture(2,outsideY,132,outsideY+1,320,"system-left-back-outside-exclusion");
        }else t.physicalBack();
        t.until("outside system Back closes drawer",5000,()->"false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")));
        check(before.equals(t.js(web,"JSON.stringify(D4Prototype.repo.state)")),"outside system Back leaves data unchanged");t.physicalHome();
        t.until("actual system Home removes app focus",8000,()->{boolean[] focused={true};t.runOnMainSync(()->focused[0]=t.current.hasWindowFocus());return !focused[0];});
        android.view.accessibility.AccessibilityNodeInfo active=t.getUiAutomation().getRootInActiveWindow();check(active!=null&&active.getPackageName()!=null&&!t.target.getPackageName().contentEquals(active.getPackageName()),"Home shows another system window");
        t.shot("system-home-bottom");JSONObject observed=new JSONObject().put("navigationMode",t.mode).put("mandatoryBottomPixels",mandatory[0]).put("exclusion",exclusion[0].toShortString()).put("systemHomeForegroundPackage",String.valueOf(active.getPackageName())).put("physicalInput",true);
        t.host();return observed;
    }
}
