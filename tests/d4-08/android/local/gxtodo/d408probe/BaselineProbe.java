package local.gxtodo.d408probe;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/** Self-targeted driver: observes and touches the original delivered APK without loading its classes. */
public final class BaselineProbe extends Instrumentation {
    private Bundle args;
    private UiAutomation ui;
    private File evidence;
    private String pkg, phase, currentCase = "setup";
    private int screenWidth, screenHeight;
    private final JSONArray cases = new JSONArray(), events = new JSONArray();
    private interface Case { JSONObject run() throws Exception; }
    private static final class HarnessFailure extends Exception { HarnessFailure(String message) { super(message); } }

    @Override public void onCreate(Bundle input) { super.onCreate(input); args = input == null ? new Bundle() : input; start(); }
    @Override public void onStart() {
        int infrastructureFailures = 0;
        try {
            pkg = args.getString("targetPkg", "");
            if (!pkg.equals("local.gxtodo.d405candidate") && !pkg.equals("local.gxtodo.d408candidate")) throw new HarnessFailure("Only isolated candidate packages allowed");
            if (!getTargetContext().getPackageName().equals("local.gxtodo.d408probe")) throw new HarnessFailure("Self-target driver required");
            phase = args.getString("phase", "360-gestural");
            if (!phase.matches("[a-zA-Z0-9-]+")) throw new HarnessFailure("Invalid evidence phase");
            evidence = new File(getTargetContext().getFilesDir(), "d408-probe-evidence/" + phase);
            if (!evidence.mkdirs() && !evidence.isDirectory()) throw new HarnessFailure("Evidence directory unavailable");
            ui = getUiAutomation();
            AccessibilityServiceInfo info = ui.getServiceInfo();
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            ui.setServiceInfo(info);
            Bitmap size = ui.takeScreenshot();
            if (size == null) throw new HarnessFailure("No screenshot surface");
            screenWidth = size.getWidth(); screenHeight = size.getHeight(); size.recycle();
            write("device.txt", shell("getprop ro.build.fingerprint") + "\n" + shell("wm size") + "\n" + shell("wm density") + "\n" + shell("settings get secure navigation_mode"));
            launch(); snapshot("initial");
            if (!args.getString("suite", "baseline-gaps").equals("baseline-gaps")) throw new HarnessFailure("Unknown suite");

            test("B01-native-task-selection", () -> {
                openTimer();
                List<String> texts = collectScrolledText("timer-task", 7);
                boolean available = texts.stream().anyMatch(t -> t.equals("选择关联任务") || t.equals("选择任务"));
                return result(available, "原生番茄钟中显示任务选择入口", texts.toString()).put("coverage","entry reachability; task mutation in separate full native suite");
            });
            test("B02-native-history-statistics-entry", () -> {
                openTimer();
                List<String> texts = collectScrolledText("timer-history", 7);
                boolean history = texts.stream().anyMatch(t -> t.equals("全部计时记录") || t.equals("计时历史"));
                boolean stats = texts.stream().anyMatch(t -> t.equals("专注统计") || t.equals("查看专注统计"));
                return result(history && stats, "原生全历史和日期统计入口可达", texts.toString()).put("historyEntry",history).put("statisticsEntry",stats);
            });
            for (int startX : new int[]{3, 24, 48}) {
                final int x = startX;
                test("B03-edge-x" + x + "-y150", () -> edgeCase(x,150));
            }
            for (int startY : new int[]{40, 380, 650}) {
                final int y = startY;
                test("B04-edge-x3-y" + y, () -> edgeCase(3,y));
            }
            test("B05-feedback-primary-flow", () -> {
                fresh(); navigate("优化意见"); snapshot("feedback-primary");
                boolean originalEntry = nodeText("打开原生优化意见") != null || nodeText("查看优化意见") != null;
                List<String> text = visibleText();
                // This observation does not pretend to test image bytes or backup/restore.
                return result(originalEntry, "保留原 FeedbackKit 可操作入口", text.toString()).put("coverage","entry only; attachment and restore suite separate");
            });
            test("B06-feedback-tools-list-editor-save", () -> {
                fresh(); navigate("优化意见");
                if (nodeText("打开原生优化意见") != null) tapText("打开原生优化意见");
                requireText("查看优化意见",10000); snapshot("feedback-tools");
                tapText("查看优化意见"); settle(); snapshot("feedback-list-before"); back();
                requireText("记个想法",8000); tapText("记个想法");
                AccessibilityNodeInfo editor = awaitNode(n -> n.isEditable() && visible(n),10000);
                if (editor == null) throw new HarnessFailure("Original feedback editor did not expose editable field");
                tapNode(editor); String body = "D408_BASELINE_" + args.getString("evidenceRunId", "unknown") + "_" + phase;
                shell("input text " + body); settle(); snapshot("feedback-editor-filled");
                if(ui.getWindows().stream().anyMatch(w->w.getType()==AccessibilityWindowInfo.TYPE_INPUT_METHOD))back();
                tapTextScrolling("保存意见", 8); settle(); snapshot("feedback-after-save");
                // newIdea is quick compose: a successful save returns to the tools
                // Activity, so the saved body must be checked in its actual list.
                requireText("查看优化意见",10000);tapText("查看优化意见");settle();snapshot("feedback-saved-list");
                AccessibilityNodeInfo saved = awaitNode(n -> visible(n) && !n.isEditable() && string(n.getText()).contains(body),8000);
                return result(saved != null, "真实入口→列表→编辑→保存→可见历史内容", body).put("savedBodyVisible",saved != null);
            });
        } catch (Throwable failure) { infrastructureFailures++; failure("setup-or-suite-abort", failure, true); }
        try {
            int productPassed = 0, productFailed = 0, harnessErrors = infrastructureFailures;
            for (int i=0;i<cases.length();i++) {
                JSONObject row=cases.getJSONObject(i);
                if (row.optBoolean("harnessError")) { if (!row.optString("id").equals("setup-or-suite-abort")) harnessErrors++; }
                else if (row.optBoolean("productPassed")) productPassed++; else productFailed++;
            }
            JSONObject report = new JSONObject().put("suite","D408-frozen-apk-blackbox").put("phase",phase)
                .put("targetPackage",pkg).put("targetSourceSHA",args.getString("targetSourceSha",""))
                .put("targetBuildRunId",args.getString("targetBuildRunId",""))
                .put("probeSourceSHA",args.getString("probeSourceSha",""))
                .put("evidenceRunId",args.getString("evidenceRunId",""))
                .put("evidenceAttempt",args.getString("evidenceAttempt",""))
                .put("syntheticEmulatorOnly",true).put("targetRebuilt",false)
                .put("screenWidth",screenWidth).put("screenHeight",screenHeight)
                .put("caseCount",cases.length()).put("productPassed",productPassed).put("productFailed",productFailed)
                .put("harnessErrors",harnessErrors).put("cases",cases);
            write("result.json",report.toString(2)); write("input-events.json",events.toString(2));
            Bundle output = new Bundle(); output.putString("d408_probe_result",report.toString());
            // A reproduced product gap remains false in JSON; the collector gates infrastructure separately.
            finish(harnessErrors == 0 ? 0 : 2,output);
        } catch (Throwable failure) { Bundle output=new Bundle();output.putString("d408_report_error",failure.toString());finish(3,output); }
    }

    private void test(String id, Case body) {
        currentCase=id; long start=SystemClock.elapsedRealtime();
        try { JSONObject row=body.run();row.put("id",id).put("durationMillis",SystemClock.elapsedRealtime()-start).put("harnessError",false);cases.put(row); }
        catch (Throwable failure) { failure(id,failure,true); }
    }
    private JSONObject result(boolean passed,String expected,String observed) throws Exception {
        return new JSONObject().put("productPassed",passed).put("expected",expected).put("observed",observed);
    }
    private void failure(String id,Throwable failure,boolean harness) {
        try { cases.put(new JSONObject().put("id",id).put("productPassed",false).put("harnessError",harness).put("error",failure.toString()));snapshot(id+"-failure");write(id+"-window.txt",shell("dumpsys window")); }
        catch (Throwable ignored) { }
    }
    private void launch() throws Exception {
        shell("input keyevent 224");shell("wm dismiss-keyguard");
        write(currentCase+"-launch.txt",shell("am start -W -n "+pkg+"/local.gxtodo.replica.MainActivity"));
        if(awaitNode(n->pkg.equals(string(n.getPackageName()))&&visible(n),15000)==null) throw new HarnessFailure("Target never reached foreground");
        // The native WebView window appears before its local page and accessibility
        // tree. Observe the rendered header instead of treating an empty window as ready.
        requireText("打开导航",30000);settle();
    }
    private void fresh() throws Exception { shell("am force-stop "+pkg);launch(); }
    private void navigate(String label) throws Exception {
        tapText("打开导航");
        if(awaitNode(n->visible(n)&&string(n.getText()).equals("全局导航"),10000)==null)throw new HarnessFailure("Navigation panel never opened");
        AccessibilityNodeInfo chosen=awaitNavigationButton(label,5000);
        for(int i=0;chosen==null&&i<7;i++){swipe(screenWidth*.48f,screenHeight*.70f,screenWidth*.48f,screenHeight*.30f,350);settle();chosen=awaitNavigationButton(label,1500);}
        if(chosen==null)throw new HarnessFailure("Navigation button not found: "+label);
        tapNode(chosen);settle();
        long end=SystemClock.elapsedRealtime()+8000;while(SystemClock.elapsedRealtime()<end){if(!drawerOpen()){settle();if(!drawerOpen())return;}SystemClock.sleep(200);}
        throw new HarnessFailure("Navigation selection did not close drawer: "+label);
    }
    private AccessibilityNodeInfo awaitNavigationButton(String label,long timeout){
        long end=SystemClock.elapsedRealtime()+timeout;do{AccessibilityNodeInfo nav=node(n->visible(n)&&string(n.getText()).equals("全局导航"));
            AccessibilityNodeInfo match=walk(nav,n->{String text=string(n.getText());return visible(n)&&n.isClickable()&&string(n.getClassName()).equals("android.widget.Button")&&(text.equals(label)||text.startsWith(label+" "));},0);
            if(match!=null)return match;SystemClock.sleep(200);
        }while(SystemClock.elapsedRealtime()<end);return null;
    }
    private boolean drawerOpen(){return node(n->visible(n)&&string(n.getText()).equals("全局导航"))!=null;}
    private void openTimer() throws Exception {
        fresh();navigate("番茄钟");
        tapAnyScrolling(new String[]{"打开原生计时控制","打开原生番茄钟"},8);
        if(awaitNode(n->visible(n)&&string(n.getClassName()).equals("android.widget.ScrollView"),10000)==null)throw new HarnessFailure("Native timer scroll surface missing");
        snapshot("timer-opened");
    }
    private JSONObject edgeCase(int x,int y) throws Exception {
        fresh();navigate("四象限");
        AccessibilityNodeInfo web = awaitNode(n->visible(n)&&string(n.getClassName()).equals("android.webkit.WebView"),5000);
        if(web==null)throw new HarnessFailure("WebView bounds unavailable");Rect r=new Rect();web.getBoundsInScreen(r);
        if(r.width()!=screenWidth)throw new HarnessFailure("Expected 1:1 CSS viewport width from configured density; observed "+r);
        if(y+20>=r.height())throw new HarnessFailure("Gesture y outside measured WebView");
        snapshot("edge-before");swipe(r.left+x,r.top+y,r.left+x+137,r.top+y+2,300);settle();
        boolean opened=drawerOpen();snapshot("edge-after");
        return result(opened,"左侧合理起始区右滑打开导航","drawer="+opened).put("startCssX",x).put("startCssY",y).put("webBounds",r.toShortString());
    }
    private List<String> collectScrolledText(String prefix,int count) throws Exception {
        List<String> result=new ArrayList<>();
        for(int i=0;i<count;i++){for(String text:visibleText())if(!result.contains(text))result.add(text);snapshot(prefix+"-"+i);swipe(screenWidth*.72f,screenHeight*.78f,screenWidth*.72f,screenHeight*.28f,350);settle();}
        return result;
    }
    private List<String> visibleText(){List<String> texts=new ArrayList<>();walk(ui.getRootInActiveWindow(),n->{if(visible(n)){String t=label(n);if(!t.isEmpty())texts.add(t);}return false;},0);return texts;}
    private AccessibilityNodeInfo nodeText(String text){return node(n->visible(n)&&(string(n.getText()).equals(text)||string(n.getContentDescription()).equals(text)));}
    private AccessibilityNodeInfo node(Predicate<AccessibilityNodeInfo> predicate){AccessibilityNodeInfo root=ui.getRootInActiveWindow();if(root!=null)root.refresh();return walk(root,predicate,0);}
    private AccessibilityNodeInfo walk(AccessibilityNodeInfo n,Predicate<AccessibilityNodeInfo> predicate,int depth){
        if(n==null||depth>60)return null;if(predicate.test(n))return n;
        for(int i=0;i<n.getChildCount();i++){AccessibilityNodeInfo found=walk(n.getChild(i),predicate,depth+1);if(found!=null)return found;}return null;
    }
    private AccessibilityNodeInfo awaitNode(Predicate<AccessibilityNodeInfo> predicate,long timeout){
        long until=SystemClock.elapsedRealtime()+timeout;do{AccessibilityNodeInfo n=node(predicate);if(n!=null)return n;SystemClock.sleep(200);}while(SystemClock.elapsedRealtime()<until);return null;
    }
    private void requireText(String text,long timeout)throws Exception{if(awaitNode(n->visible(n)&&(string(n.getText()).equals(text)||string(n.getContentDescription()).equals(text)),timeout)==null)throw new HarnessFailure("Missing visible control: "+text);}
    private void tapText(String text)throws Exception{AccessibilityNodeInfo n=awaitNode(x->visible(x)&&(string(x.getText()).equals(text)||string(x.getContentDescription()).equals(text)),10000);if(n==null)throw new HarnessFailure("Missing visible control: "+text);tapNode(n);settle();}
    private void tapTextScrolling(String text,int attempts)throws Exception{
        tapAnyScrolling(new String[]{text},attempts);
    }
    private void tapAnyScrolling(String[] labels,int attempts)throws Exception{
        for(int i=0;i<attempts;i++){AccessibilityNodeInfo n=awaitNode(x->{if(!visible(x))return false;for(String text:labels)if(string(x.getText()).equals(text)||string(x.getContentDescription()).equals(text))return true;return false;},1500);if(n!=null){tapNode(n);settle();return;}swipe(screenWidth*.63f,screenHeight*.77f,screenWidth*.63f,screenHeight*.30f,350);settle();}
        throw new HarnessFailure("Control not found after bounded scroll: "+java.util.Arrays.toString(labels));
    }
    private void tapNode(AccessibilityNodeInfo n)throws Exception{if(n==null)throw new HarnessFailure("Null touch target");Rect r=new Rect();n.getBoundsInScreen(r);if(!visible(n))throw new HarnessFailure("Offscreen touch target: "+r);swipe(r.exactCenterX(),r.exactCenterY(),r.exactCenterX(),r.exactCenterY(),0);}
    private void swipe(float sx,float sy,float ex,float ey,long duration)throws Exception{
        long down=SystemClock.uptimeMillis();events.put(new JSONObject().put("case",currentCase).put("kind",duration==0?"tap":"swipe").put("startX",sx).put("startY",sy).put("endX",ex).put("endY",ey).put("durationMillis",duration).put("uptimeMillis",down));
        inject(down,down,MotionEvent.ACTION_DOWN,sx,sy);
        int steps=duration==0?0:Math.max(2,(int)(duration/16));
        for(int i=1;i<=steps;i++){long time=down+duration*i/steps;long wait=time-SystemClock.uptimeMillis();if(wait>0)SystemClock.sleep(wait);inject(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,sx+(ex-sx)*i/steps,sy+(ey-sy)*i/steps);}
        inject(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,ex,ey);
    }
    private void inject(long down,long now,int action,float x,float y)throws Exception{MotionEvent event=MotionEvent.obtain(down,now,action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{if(!ui.injectInputEvent(event,true))throw new HarnessFailure("MotionEvent injection rejected");}finally{event.recycle();}}
    private void back()throws Exception{long now=SystemClock.uptimeMillis();ui.injectInputEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_BACK,0),true);ui.injectInputEvent(new KeyEvent(now,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_BACK,0),true);events.put(new JSONObject().put("case",currentCase).put("kind","back"));settle();}
    private boolean visible(AccessibilityNodeInfo n){if(!n.isVisibleToUser())return false;Rect r=new Rect();n.getBoundsInScreen(r);return r.width()>0&&r.height()>0&&r.centerX()>=0&&r.centerX()<screenWidth&&r.centerY()>=0&&r.centerY()<screenHeight;}
    private static String string(CharSequence value){return value==null?"":value.toString();}
    private static String label(AccessibilityNodeInfo n){String text=string(n.getText());return text.isEmpty()?string(n.getContentDescription()):text;}
    private void settle(){SystemClock.sleep(400);try{ui.waitForIdle(100,1500);}catch(Exception ignored){}}
    private void snapshot(String name)throws Exception{
        if(evidence==null||ui==null)return;String base=currentCase+"-"+name;
        Bitmap bitmap=ui.takeScreenshot();if(bitmap!=null){try(FileOutputStream stream=new FileOutputStream(new File(evidence,base+".png"))){if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,stream))throw new HarnessFailure("Screenshot encoding failed");}finally{bitmap.recycle();}}
        JSONArray nodes=new JSONArray();capture(ui.getRootInActiveWindow(),nodes,0);write(base+".tree.json",nodes.toString(2));
    }
    private void capture(AccessibilityNodeInfo n,JSONArray rows,int depth)throws Exception{
        if(n==null||depth>60||rows.length()>=3000)return;Rect r=new Rect();n.getBoundsInScreen(r);
        rows.put(new JSONObject().put("depth",depth).put("package",string(n.getPackageName())).put("class",string(n.getClassName())).put("text",string(n.getText())).put("description",string(n.getContentDescription())).put("id",n.getViewIdResourceName()).put("bounds",r.toShortString()).put("visible",visible(n)).put("editable",n.isEditable()).put("clickable",n.isClickable()));
        for(int i=0;i<n.getChildCount();i++)capture(n.getChild(i),rows,depth+1);
    }
    private String shell(String command)throws Exception{try(InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand(command))){return new String(input.readAllBytes(),StandardCharsets.UTF_8);}}
    private void write(String name,String text)throws Exception{try(FileOutputStream stream=new FileOutputStream(new File(evidence,name))){stream.write(text.getBytes(StandardCharsets.UTF_8));}}
}
