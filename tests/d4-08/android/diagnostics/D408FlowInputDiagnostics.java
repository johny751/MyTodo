package local.gxtodo.d403preview.tests;

import android.os.SystemClock;
import android.graphics.Rect;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.webkit.WebView;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;

/** Candidate test observer only. Never injects, retries, edits DOM/state, or changes original assertions. */
final class D408FlowInputDiagnostics {
    private static final String INSTALL_SCRIPT = __D408_FLOW_OBSERVER_SCRIPT__;
    private final NativeWorkLifecycleChecks.Host h;
    private final JSONArray segments = new JSONArray(), nativeSamples = new JSONArray(), errors = new JSONArray();
    private int sampleDropped, errorDropped;
    private boolean active;
    D408FlowInputDiagnostics(NativeWorkLifecycleChecks.Host host) { h = host; }

    void begin() {
        active = true;
        try { h.js(INSTALL_SCRIPT); sample("segment-begin", null); }
        catch (Exception | Error error) { recordError("begin", error); }
    }

    void sample(String phase, String selector) {
        if (!active) return;
        try {
            final JSONObject row = new JSONObject().put("phase", phase).put("wallMillis", System.currentTimeMillis())
                .put("uptimeMillis", SystemClock.uptimeMillis()).put("elapsedRealtimeNanos", SystemClock.elapsedRealtimeNanos());
            final Throwable[] observationError = new Throwable[1];
            h.instrumentation().runOnMainSync(() -> {
                try {
                    WebView web = h.main().previewWebView(); int[] location = new int[2]; web.getLocationOnScreen(location);
                    WindowInsets insets = web.getRootWindowInsets();
                    row.put("nativeObservationWallMillis", System.currentTimeMillis()).put("nativeObservationUptimeMillis", SystemClock.uptimeMillis())
                        .put("activityHasWindowFocus", h.main().hasWindowFocus()).put("webHasWindowFocus", web.hasWindowFocus())
                        .put("webHasFocus", web.hasFocus()).put("webShown", web.isShown())
                        .put("webView", new JSONObject().put("screenX", location[0]).put("screenY", location[1])
                            .put("widthPixels", web.getWidth()).put("heightPixels", web.getHeight()))
                        .put("insetsKnown", insets != null).put("imeVisible", insets != null && insets.isVisible(WindowInsets.Type.ime()));
                } catch (Exception | Error error) { observationError[0] = error; }
            });
            if (observationError[0] != null) row.put("nativeObservationError", observationError[0].toString());
            observeWindows(row);
            Object observed = h.js("(function(){var p=window.__d408PassiveFlowInput;return p?p.sample("
                + JSONObject.quote(phase) + "," + (selector == null ? "null" : JSONObject.quote(selector)) + "):null;})()");
            row.put("jsSample", observed).put("finishedWallMillis", System.currentTimeMillis()).put("finishedUptimeMillis", SystemClock.uptimeMillis());
            if (nativeSamples.length() < 128) nativeSamples.put(row); else sampleDropped++;
        } catch (Exception | Error error) { recordError("sample:" + phase, error); }
    }

    void flush() {
        if (active) {
            try {
                Object observed = h.js("(function(){var p=window.__d408PassiveFlowInput;return p?p.finish():null;})()");
                if (segments.length() < 4) segments.put(new JSONObject().put("segment", segments.length()).put("trace", observed));
                else recordError("flush", new IllegalStateException("Segment bound exceeded"));
            } catch (Exception | Error error) { recordError("flush", error); }
            finally { active = false; }
        }
        try {
            h.write("d408-flow-passive-input.json", new JSONObject().put("kind", "d408-original-flow-passive-input")
                .put("sourceSha", BuildInfo.SOURCE_SHA).put("runId", BuildInfo.RUN_ID).put("runAttempt", BuildInfo.RUN_ATTEMPT)
                .put("syntheticOnly", true).put("observerOnly", true).put("originalAssertionsUnchanged", true)
                .put("segments", segments).put("nativeSamples", nativeSamples).put("nativeSamplesDropped", sampleDropped)
                .put("observerErrors", errors).put("observerErrorsDropped", errorDropped)
                .put("limitations", new JSONArray().put("Observation adds runtime overhead; original sleep durations and input count are unchanged")
                    .put("Native snapshots bracket the original h.tap; exact injected DOWN/UP uptime and system input routing are not intercepted")
                    .put("Accessibility window lists may be empty or omit overlays with unchanged service flags; missing roots are unknown, not absence")
                    .put("DOM event timestamps describe events received by the WebView; absence cannot identify an external overlay owner")
                    .put("Diagnostic failure is recorded separately and never substitutes for the original test outcome"))
                .toString(2));
        } catch (Exception | Error error) { recordError("write", error); android.util.Log.e("D408FlowPassive", "Unable to persist diagnostic receipt", error); }
    }

    private void observeWindows(JSONObject row) throws Exception {
        JSONObject observed = new JSONObject().put("wallMillis", System.currentTimeMillis()).put("uptimeMillis", SystemClock.uptimeMillis())
            .put("serviceFlagsChanged", false).put("limit", 16).put("emptyOrMissingMeansUnknown", true);
        row.put("accessibilityWindows", observed);
        try {
            List<AccessibilityWindowInfo> windows = h.instrumentation().getUiAutomation().getWindows();
            JSONArray records = new JSONArray(); observed.put("returnedCount", windows == null ? JSONObject.NULL : windows.size()).put("windows", records);
            if (windows != null) {
                try {
                    for (int i = 0; i < Math.min(16, windows.size()); i++) {
                        AccessibilityWindowInfo window = windows.get(i); Rect bounds = new Rect(); window.getBoundsInScreen(bounds);
                        JSONObject entry = new JSONObject().put("id", window.getId()).put("type", window.getType()).put("layer", window.getLayer())
                            .put("active", window.isActive()).put("focused", window.isFocused()).put("accessibilityFocused", window.isAccessibilityFocused())
                            .put("bounds", new JSONObject().put("left", bounds.left).put("top", bounds.top).put("right", bounds.right).put("bottom", bounds.bottom));
                        AccessibilityNodeInfo root = null;
                        try { root = window.getRoot(); entry.put("rootAvailable", root != null).put("rootPackage", root == null || root.getPackageName() == null ? JSONObject.NULL : root.getPackageName().toString()); }
                        catch (Exception error) { entry.put("rootError", error.toString()); }
                        finally { if (root != null) root.recycle(); }
                        records.put(entry);
                    }
                    observed.put("omittedCount", Math.max(0, windows.size() - 16));
                } finally { for (AccessibilityWindowInfo window : windows) window.recycle(); }
            }
        } catch (Exception error) { observed.put("windowsError", error.toString()); }
        AccessibilityNodeInfo activeRoot = null;
        try {
            activeRoot = h.instrumentation().getUiAutomation().getRootInActiveWindow();
            observed.put("activeRootAvailable", activeRoot != null).put("activeRootPackage", activeRoot == null || activeRoot.getPackageName() == null ? JSONObject.NULL : activeRoot.getPackageName().toString());
        } catch (Exception error) { observed.put("activeRootError", error.toString()); }
        finally { if (activeRoot != null) activeRoot.recycle(); }
        observed.put("finishedWallMillis", System.currentTimeMillis()).put("finishedUptimeMillis", SystemClock.uptimeMillis());
    }

    private void recordError(String stage, Throwable error) {
        if (errors.length() >= 16) { errorDropped++; return; }
        try { errors.put(new JSONObject().put("stage", stage).put("error", error.toString()).put("wallMillis", System.currentTimeMillis())); }
        catch (Exception ignored) { errorDropped++; }
    }
}
