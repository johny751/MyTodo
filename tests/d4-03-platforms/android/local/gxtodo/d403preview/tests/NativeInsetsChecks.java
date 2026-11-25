package local.gxtodo.d403preview.tests;

import android.app.Instrumentation;
import android.graphics.Insets;
import android.graphics.Rect;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import local.gxtodo.d403preview.MainActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/** Read-only real-window geometry. Invoke only from Actions instrumentation. */
public final class NativeInsetsChecks {
    private NativeInsetsChecks() {}

    public static JSONObject observe(Instrumentation host, MainActivity activity) throws Exception {
        require(Build.VERSION.SDK_INT >= 35, "Insets regression requires the actual target-35 Actions emulator");
        AtomicReference<JSONObject> value = new AtomicReference<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        host.runOnMainSync(() -> {
            try {
                View decor = activity.getWindow().getDecorView();
                WebView web = activity.previewWebView();
                require(web != null && web.getParent() instanceof View, "Attached preview WebView is observable");
                View parent = (View) web.getParent();
                WindowInsets insets = decor.getRootWindowInsets();
                require(insets != null, "Real root WindowInsets are available");
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                Insets status = insets.getInsets(WindowInsets.Type.statusBars());
                JSONArray exclusion = new JSONArray();
                List<Rect> rectangles = web.getSystemGestureExclusionRects();
                for (Rect rectangle : rectangles) exclusion.put(rect(rectangle));
                value.set(new JSONObject().put("api", Build.VERSION.SDK_INT)
                    .put("density", activity.getResources().getDisplayMetrics().density)
                    .put("decor", bounds(decor)).put("container", bounds(parent)).put("web", bounds(web))
                    .put("safe", edges(safe.left, safe.top, safe.right, safe.bottom))
                    .put("ime", edges(ime.left, ime.top, ime.right, ime.bottom))
                    .put("status", edges(status.left, status.top, status.right, status.bottom))
                    .put("statusVisible", insets.isVisible(WindowInsets.Type.statusBars()))
                    .put("imeVisible", insets.isVisible(WindowInsets.Type.ime()))
                    .put("containerPadding", edges(parent.getPaddingLeft(), parent.getPaddingTop(), parent.getPaddingRight(), parent.getPaddingBottom()))
                    .put("gestureExclusionsInWebPixels", exclusion));
            } catch (Throwable error) { failure.set(error); }
        });
        if (failure.get() != null) throw new AssertionError("Unable to observe real native insets", failure.get());
        require(value.get() != null, "Native inset observation returned data");
        return value.get();
    }

    public static void verify(JSONObject nativeBounds, JSONObject dom, boolean expectIme) throws Exception {
        JSONObject decor = nativeBounds.getJSONObject("decor"), container = nativeBounds.getJSONObject("container"), web = nativeBounds.getJSONObject("web");
        JSONObject safe = nativeBounds.getJSONObject("safe"), ime = nativeBounds.getJSONObject("ime"), padding = nativeBounds.getJSONObject("containerPadding");
        int bottom = Math.max(safe.getInt("bottom"), ime.getInt("bottom"));
        require(nativeBounds.getBoolean("imeVisible") == expectIme, "Observed keyboard visibility matches this explicit test stage");
        require(nativeBounds.getBoolean("statusVisible") && nativeBounds.getJSONObject("status").getInt("top") > 0,
            "The emulator's visible top status bar has a nonzero observed inset; the check is not vacuous");
        require(web.getBoolean("globallyVisible") && web.getInt("width") > 0 && web.getInt("height") > 0, "WebView has a real positive visible viewport");
        JSONObject visible = web.getJSONObject("globalVisibleRect");
        require(visible.getInt("left") == web.getInt("x") && visible.getInt("top") == web.getInt("y")
            && visible.getInt("right") == web.getInt("right") && visible.getInt("bottom") == web.getInt("bottom"),
            "The entire WebView bounds are visible, with no additional parent clipping");
        require(container.getInt("x") == decor.getInt("x") && container.getInt("y") == decor.getInt("y")
            && container.getInt("width") == decor.getInt("width") && container.getInt("height") == decor.getInt("height"),
            "The inset owner occupies the observed decor, with no second platform resize");
        require(padding.getInt("left") == safe.getInt("left") && padding.getInt("top") == safe.getInt("top")
            && padding.getInt("right") == safe.getInt("right") && padding.getInt("bottom") == bottom,
            "The native container applies one system-bar/cutout/keyboard inset on each edge");
        require(web.getInt("x") == decor.getInt("x") + safe.getInt("left") && web.getInt("y") == decor.getInt("y") + safe.getInt("top")
            && web.getInt("right") == decor.getInt("right") - safe.getInt("right") && web.getInt("bottom") == decor.getInt("bottom") - bottom,
            "Actual WebView bounds avoid system bars/cutout/keyboard exactly once");
        require(dom.getDouble("width") > 0 && dom.getDouble("height") > 0, "Real DOM viewport has positive dimensions");
        double scale = web.getDouble("width") / dom.getDouble("width");
        require(Math.abs(dom.getDouble("height") - web.getDouble("height") / scale) <= 1d,
            "DOM viewport height matches the physically inset WebView within one CSS-pixel rounding");
        JSONObject visual = dom.getJSONObject("visualViewport");
        require(Math.abs(visual.getDouble("offsetLeft")) < .5d && Math.abs(visual.getDouble("offsetTop")) < .5d
            && Math.abs(visual.getDouble("scale") - 1d) < .001d && Math.abs(visual.getDouble("width") - dom.getDouble("width")) < 1d
            && Math.abs(visual.getDouble("height") - dom.getDouble("height")) < 1d,
            "Inset geometry uses an observed unzoomed, unoffset visual viewport");
        JSONObject toolbar = dom.getJSONObject("toolbar"), toggle = dom.getJSONObject("navigationToggle");
        require(toolbar.getDouble("height") > 0 && toolbar.getDouble("top") >= 0,
            "The visible toolbar exists inside the Web viewport");
        double toolbarTop = web.getDouble("y") + toolbar.getDouble("top") * scale;
        double toolbarBottom = web.getDouble("y") + toolbar.getDouble("bottom") * scale;
        require(toolbarTop >= decor.getDouble("y") + safe.getDouble("top") && toolbarBottom <= web.getDouble("bottom") + 1,
            "The actual DOM toolbar maps wholly below the observed status bar and within usable content");
        require(toggle.getDouble("width") > 0 && toggle.getDouble("height") > 0 && toggle.getBoolean("hit"),
            "The visible navigation control wins the current DOM hit test");
        JSONArray exclusions = nativeBounds.getJSONArray("gestureExclusionsInWebPixels");
        require(exclusions.length() == 1, "Only the existing bounded left-edge navigation segment is reserved");
        JSONObject segment = exclusions.getJSONObject(0);
        double density = nativeBounds.getDouble("density");
        require(segment.getInt("left") == 0 && segment.getInt("right") > 0 && segment.getInt("right") <= Math.round(22d * density)
            && segment.getInt("top") >= Math.min(web.getInt("height"), Math.round(80d * density))
            && segment.getInt("bottom") > segment.getInt("top") && segment.getInt("bottom") <= web.getInt("height")
            && segment.getInt("bottom") - segment.getInt("top") <= Math.round(200d * density),
            "Gesture exclusion stays inside the inset WebView and within the unchanged 22dp/200dp left-edge budget");
    }

    private static JSONObject bounds(View view) throws Exception {
        int[] position = new int[2]; view.getLocationOnScreen(position);
        Rect visible = new Rect(); boolean shown = view.getGlobalVisibleRect(visible);
        return new JSONObject().put("x", position[0]).put("y", position[1]).put("width", view.getWidth()).put("height", view.getHeight())
            .put("right", position[0] + view.getWidth()).put("bottom", position[1] + view.getHeight())
            .put("globallyVisible", shown).put("globalVisibleRect", rect(visible));
    }
    private static JSONObject edges(int left, int top, int right, int bottom) throws Exception {
        return new JSONObject().put("left", left).put("top", top).put("right", right).put("bottom", bottom);
    }
    private static JSONObject rect(Rect value) throws Exception { return edges(value.left, value.top, value.right, value.bottom); }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
