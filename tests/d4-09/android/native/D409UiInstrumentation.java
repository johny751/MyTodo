package local.gxtodo.replica;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.inspector.WindowInspector;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.TextView;
import local.gxtodo.d403preview.BuildInfo;
import local.gxtodo.d403preview.NativeTimerStore;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Independent APK: never extends, embeds, or changes the frozen D408 test suite. */
public final class D409UiInstrumentation extends Instrumentation {
    interface Checked { JSONObject run() throws Exception; }
    interface Condition { boolean ready() throws Exception; }
    Context target;
    Bundle args;
    Activity current;
    File evidence;
    String phase, mode, caseId = "setup";
    int width, inputSequence;
    final JSONArray cases = new JSONArray(), screenshots = new JSONArray();

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); args = arguments == null ? new Bundle() : arguments; start(); }
    @Override public void onStart() {
        target = getTargetContext();
        phase = args.getString("phase", "invalid");
        evidence = new File(target.getFilesDir(), "d409-evidence");
        evidence.mkdirs();
        try {
            check("local.gxtodo.d408candidate".equals(target.getPackageName()), "isolated target package");
            check(phase.matches("ui-(360|412)-(gestural|threebutton)"), "explicit matrix phase required");
            check(BuildInfo.SOURCE_SHA.equals(args.getString("sourceSHA")), "same source as runner");
            check(BuildInfo.RUN_ID.equals(args.getString("runId")), "same Actions run");
            check(BuildInfo.RUN_ATTEMPT.equals(args.getString("runAttempt")), "same Actions attempt");
            width = Integer.parseInt(phase.split("-")[1]); mode = phase.split("-")[2];
            check("1".equals(shell("getprop ro.kernel.qemu").trim()), "official isolated emulator required");
            int actualMode = Settings.Secure.getInt(target.getContentResolver(), "navigation_mode", -1);
            check(actualMode == (mode.equals("gestural") ? 2 : 0), "observed navigation_mode matches phase");
            check(target.getResources().getDisplayMetrics().densityDpi == 160, "matrix density 160");
            AccessibilityServiceInfo service = getUiAutomation().getServiceInfo();
            service.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            getUiAutomation().setServiceInfo(service);
            shell("input keyevent 224"); shell("wm dismiss-keyguard");
            D409UiChecks.run(this);
        } catch (Throwable failure) { fail("phase-abort", failure); }
        int failures = 0;
        for (int i = 0; i < cases.length(); i++) if (!cases.optJSONObject(i).optBoolean("passed")) failures++;
        try {
            JSONObject report = identity().put("phase", phase).put("width", width).put("navigationMode", mode)
                .put("deviceSdk", android.os.Build.VERSION.SDK_INT).put("deviceFingerprint", android.os.Build.FINGERPRINT)
                .put("caseCount", cases.length()).put("failureCount", failures).put("passed", failures == 0)
                .put("cases", cases).put("screenshots", screenshots);
            write(new File(evidence, "result-" + phase + ".json"), report.toString(2));
            Bundle result = new Bundle(); result.putString("d409_result", report.toString()); finish(failures == 0 ? 0 : 1, result);
        } catch (Throwable failure) { Bundle result = new Bundle(); result.putString("d409_report_error", failure.toString()); finish(2, result); }
    }
    JSONObject identity() throws Exception {
        return new JSONObject().put("packageName", target.getPackageName()).put("sourceSHA", BuildInfo.SOURCE_SHA)
            .put("runId", BuildInfo.RUN_ID).put("runAttempt", BuildInfo.RUN_ATTEMPT)
            .put("versionName", BuildInfo.VERSION_NAME).put("versionCode", BuildInfo.VERSION_CODE)
            .put("syntheticOnly", true).put("emulatorEvidence", true).put("suite", "d409-native-ui");
    }
    void test(String id, Checked body) {
        caseId = id; long started = SystemClock.elapsedRealtime();
        try { JSONObject result=body.run();cases.put(new JSONObject().put("name", "D409-" + phase + "-" + id).put("passed", true)
            .put("durationMs", SystemClock.elapsedRealtime() - started).put("evidence", result)); }
        catch (Throwable failure) { fail(id, failure); }
    }
    void fail(String id, Throwable failure) {
        try {
            StringWriter stack = new StringWriter(); failure.printStackTrace(new PrintWriter(stack));
            JSONObject row = new JSONObject().put("name", "D409-" + phase + "-" + id).put("passed", false)
                .put("error", failure.toString()).put("stack", stack.toString()); cases.put(row);
            try { shot("failure-" + id); write(new File(evidence, phase + "-" + id + "-window.txt"), shell("dumpsys window")); }
            catch (Throwable diagnostic) { row.put("diagnosticError", diagnostic.toString()); }
        } catch (Exception ignored) { }
    }
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    void until(String label, long timeout, Condition condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        while (SystemClock.elapsedRealtime() < deadline) { if (condition.ready()) return; SystemClock.sleep(100); }
        throw new AssertionError("timeout: " + label);
    }
    Activity launch(Class<?> type) throws Exception {
        current = startActivitySync(new Intent(target, type).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        awaitForeground(current); return current;
    }
    void awaitForeground(Activity activity) throws Exception {
        until("focused " + activity.getClass().getSimpleName(), 15000, () -> {
            boolean[] result = {false}; runOnMainSync(() -> result[0] = !activity.isDestroyed() && activity.hasWindowFocus() && activity.getWindow().getDecorView().isShown()); return result[0];
        });
    }
    WebView host() throws Exception {
        D408Activity page = (D408Activity) launch(D408Activity.class); WebView web = page.previewWebView();
        until("candidate workspace ready", 20000, () -> "true".equals(js(web, "!!window.D4Prototype&&!!window.DemoMobileControls&&document.documentElement.dataset.nativeReminders==='saved'")));
        check(Integer.parseInt(js(web, "innerWidth")) == width, "observed CSS viewport width"); return web;
    }
    void route(WebView web, String route) throws Exception { js(web, "D4Prototype.navigate(" + JSONObject.quote(route) + ");DemoMobileControls.nav(false)"); waitForIdleSync(); SystemClock.sleep(200); }
    String js(WebView web, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); String[] output = {null};
        runOnMainSync(() -> web.evaluateJavascript(script, value -> { output[0] = value; done.countDown(); }));
        check(done.await(15, TimeUnit.SECONDS), "WebView callback"); return output[0];
    }
    JSONObject request(JSONObject input) throws Exception {
        CountDownLatch done = new CountDownLatch(1); JSONObject[] value = {null}; String[] error = {null};
        NativeTimerStore.request(target, input.toString(), (result, failure) -> { value[0] = result; error[0] = failure; done.countDown(); });
        check(done.await(15, TimeUnit.SECONDS), "native timer request"); check(error[0] == null, "timer error: " + error[0]); return value[0];
    }
    JSONObject state() throws Exception { return request(new JSONObject().put("op", "snapshot")); }
    JSONObject command(String action, JSONObject values) throws Exception {
        return request(new JSONObject().put("op", "command").put("action", action).put("values", values)
            .put("commandId", "d409-test:" + UUID.randomUUID()).put("expectedRevision", state().getLong("revision")));
    }
    void configure() throws Exception { command("reset", new JSONObject()); command("configure", new JSONObject().put("mode", "countup").put("durationMinutes", 25).put("breakMinutes", 5).put("taskId", "")); }
    View findId(int id) { return find(view -> view.getId() == id); }
    View findTag(String tag) { return find(view -> tag.equals(view.getTag())); }
    interface ViewMatch { boolean matches(View view); }
    View find(ViewMatch match) {
        View[] found = {null}; runOnMainSync(() -> {
            List<View> roots = WindowInspector.getGlobalWindowViews();
            for (int i = roots.size() - 1; i >= 0 && found[0] == null; i--) found[0] = descend(roots.get(i), match);
        }); return found[0];
    }
    View descend(View root, ViewMatch match) {
        if (!root.isShown()) return null;
        if (match.matches(root)) return root;
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { View found = descend(((ViewGroup) root).getChildAt(i), match); if (found != null) return found; }
        return null;
    }
    String text(View view) { check(view instanceof TextView, "TextView required"); String[] value = {null}; runOnMainSync(() -> value[0] = ((TextView) view).getText().toString()); return value[0]; }
    void nativeTap(int id) throws Exception { View view = findId(id); check(view != null, "native id " + id); tap(view); }
    void tagTap(String tag) throws Exception { View view = findTag(tag); check(view != null, "native tag " + tag); tap(view); }
    void nativeReveal(int id) throws Exception { View view=findId(id);check(view!=null,"native screenshot target "+id);runOnMainSync(()->view.requestRectangleOnScreen(new Rect(0,0,view.getWidth(),view.getHeight()),true));waitForIdleSync();SystemClock.sleep(160); }
    void tap(View view) throws Exception {
        runOnMainSync(() -> { check(view.isEnabled(), "enabled target"); view.requestRectangleOnScreen(new Rect(0, 0, view.getWidth(), view.getHeight()), true); });
        waitForIdleSync(); SystemClock.sleep(160); Rect box = new Rect(); runOnMainSync(() -> check(view.getGlobalVisibleRect(box), "visible native touch target"));
        gesture(box.exactCenterX(), box.exactCenterY(), box.exactCenterX(), box.exactCenterY(), 60, "native-tap");
    }
    void replaceText(EditText field, String value) throws Exception {
        tap(field); long now = SystemClock.uptimeMillis();
        sendKeySync(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON));
        sendKeySync(new KeyEvent(now, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON));
        sendKeyDownUpSync(KeyEvent.KEYCODE_DEL); if (!value.isEmpty()) sendStringSync(value); waitForIdleSync(); check(value.equals(text(field)), "real native key input");
    }
    boolean imeVisible() {
        boolean[] value = {false}; runOnMainSync(() -> { for (View root : WindowInspector.getGlobalWindowViews()) { WindowInsets insets = root.getRootWindowInsets(); if (root.isShown() && insets != null && insets.isVisible(WindowInsets.Type.ime())) value[0] = true; } }); return value[0];
    }
    void dismissIme() throws Exception { if (imeVisible()) { sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); waitForIdleSync(); until("IME hidden", 5000, () -> !imeVisible()); } }
    void webTap(WebView web, String selector) throws Exception {
        js(web, "document.querySelector(" + JSONObject.quote(selector) + ").scrollIntoView({block:'center',inline:'nearest'})"); SystemClock.sleep(150);
        JSONObject point = new JSONObject(js(web, "(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + "),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {x,y,width:innerWidth,hit:!!h&&(h===e||e.contains(h))};})()"));
        check(point.getBoolean("hit"), "unobscured web target " + selector); webGesture(web, point.getDouble("x"), point.getDouble("y"), 0, 0, 60, "web-tap");
    }
    void webGesture(WebView web, double x, double y, double dx, double dy, long duration, String label) throws Exception {
        int[] location = new int[2]; int[] size = new int[1]; runOnMainSync(() -> { web.getLocationOnScreen(location); size[0] = web.getWidth(); });
        float scale = size[0] / (float) Double.parseDouble(js(web, "innerWidth"));
        gesture(location[0] + (float) x * scale, location[1] + (float) y * scale, location[0] + (float) (x + dx) * scale, location[1] + (float) (y + dy) * scale, duration, label);
    }
    void gesture(float x, float y, float endX, float endY, long duration, String label) throws Exception {
        JSONArray events = new JSONArray(); long down = SystemClock.uptimeMillis(); inject(down, MotionEvent.ACTION_DOWN, x, y, events);
        int steps = x == endX && y == endY ? 1 : 12;
        for (int i = 1; i <= steps; i++) { long remaining = down + duration * i / steps - SystemClock.uptimeMillis(); if (remaining > 0) SystemClock.sleep(remaining); if (steps > 1) inject(down, MotionEvent.ACTION_MOVE, x + (endX - x) * i / steps, y + (endY - y) * i / steps, events); }
        inject(down, MotionEvent.ACTION_UP, endX, endY, events); waitForIdleSync(); SystemClock.sleep(220);
        write(new File(evidence, String.format(Locale.ROOT, "%s-input-%04d.json", phase, ++inputSequence)), identity().put("phase", phase).put("case", caseId).put("label", label).put("requestedDurationMs", duration).put("events", events).toString(2));
    }
    void inject(long down, int action, float x, float y, JSONArray events) throws Exception {
        long at = SystemClock.uptimeMillis(); MotionEvent event = MotionEvent.obtain(down, at, action, x, y, 0); event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        boolean accepted; try { accepted = getUiAutomation().injectInputEvent(event, false); } finally { event.recycle(); }
        events.put(new JSONObject().put("action", action).put("downTime", down).put("eventTime", at).put("dispatchReturnedAt", SystemClock.uptimeMillis()).put("x", x).put("y", y).put("accepted", accepted)); check(accepted, "device input accepted");
    }
    void physicalBack() throws Exception {
        if (mode.equals("gestural")) {
            Point screen=screenSize();gesture(screen.x - 2, screen.y * .62f, screen.x - 132, screen.y * .62f + 2, 320, "system-right-edge-back");
        } else {
            systemButton("back");
        }
    }
    Point screenSize(){Point result=new Point();((WindowManager)target.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealSize(result);return result;}
    void physicalHome()throws Exception{Point screen=screenSize();if(mode.equals("gestural"))gesture(screen.x*.5f,screen.y-2,screen.x*.5f,screen.y*.50f,260,"system-bottom-home");else systemButton("home");}
    void systemButton(String control)throws Exception{Rect bounds=new Rect();boolean found=false;for(AccessibilityWindowInfo window:getUiAutomation().getWindows()){AccessibilityNodeInfo node=systemButtonNode(window.getRoot(),control);if(node!=null){node.getBoundsInScreen(bounds);found=true;break;}}check(found&&!bounds.isEmpty(),"observed SystemUI "+control+" button; no keyevent fallback");gesture(bounds.exactCenterX(),bounds.exactCenterY(),bounds.exactCenterX(),bounds.exactCenterY(),60,"system-threebutton-"+control);}
    AccessibilityNodeInfo systemButtonNode(AccessibilityNodeInfo node,String control) {
        if (node == null) return null;
        String pkg = String.valueOf(node.getPackageName()), id = String.valueOf(node.getViewIdResourceName()), description = String.valueOf(node.getContentDescription());
        boolean label=control.equals("back")?(description.equals("Back")||description.equals("返回")):(description.equals("Home")||description.equals("主屏幕"));
        if (node.isVisibleToUser() && pkg.equals("com.android.systemui") && (id.equals("com.android.systemui:id/"+control)||label)) return node;
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo found = systemButtonNode(node.getChild(i),control); if (found != null) return found; } return null;
    }
    void shot(String label) throws Exception {
        check(label.matches("[A-Za-z0-9_-]+"), "safe screenshot name"); Bitmap bitmap = getUiAutomation().takeScreenshot(); check(bitmap != null, "actual emulator screenshot");
        String name = phase + "-" + label + ".png"; File file = new File(evidence, name); int w = bitmap.getWidth(), h = bitmap.getHeight();
        try (FileOutputStream output = new FileOutputStream(file)) { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output), "PNG saved"); } finally { bitmap.recycle(); }
        screenshots.put(new JSONObject().put("file", name).put("width", w).put("height", h).put("bytes", file.length()).put("sha256", hash(file)).put("case", caseId));
    }
    String shell(String command) throws Exception {
        try (ParcelFileDescriptor fd = getUiAutomation().executeShellCommand(command); InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(fd); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int size; while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size); return output.toString("UTF-8");
        }
    }
    static String hash(File file) throws Exception { MessageDigest digest = MessageDigest.getInstance("SHA-256"); try (InputStream input = new FileInputStream(file)) { byte[] b = new byte[32768]; int n; while ((n = input.read(b)) != -1) digest.update(b, 0, n); } StringBuilder text = new StringBuilder(); for (byte b : digest.digest()) text.append(String.format(Locale.ROOT, "%02x", b & 255)); return text.toString(); }
    static void write(File file, String value) throws Exception { try (FileOutputStream output = new FileOutputStream(file)) { output.write(value.getBytes(StandardCharsets.UTF_8)); output.getFD().sync(); } }
}
