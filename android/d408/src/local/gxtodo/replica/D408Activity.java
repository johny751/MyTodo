package local.gxtodo.replica;
import local.gxtodo.d403preview.BuildInfo;
import local.gxtodo.d403preview.NativeTimerStore;
import local.gxtodo.d403preview.NativeTimerSession;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;

/** Synthetic-only WebView. No production GxNative, accounts, SQLite or sync bridge. */
public final class D408Activity extends Activity {
    private static final String HOST = "d408-native.local";
    private static final int OPEN_LOCAL_DOCUMENT = 0xD403;
    private WebView web;
    private boolean destroyed;
    private android.view.ActionMode floatingTextMode;
    private boolean resumeAfterPause, restoringTextMode, restoreFrameRequested, logNextResumedInput;
    private long textRestoreEpoch;
    private ValueCallback<Uri[]> pendingFiles;
    private boolean pendingFilesMultiple;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setUseWideViewPort(true);
        // This package's WebView origin owns a separate synthetic localStorage namespace.
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setSupportZoom(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return chooseLocalDocuments(view, callback, params);
            }
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR)
                    android.util.Log.e("D403PreviewWeb", message.message() + " at " + message.sourceId() + ":" + message.lineNumber());
                return true;
            }
        });
        web.addJavascriptInterface(new PreviewBridge(), "GxD4Preview");
        web.addJavascriptInterface(new D408Bridge(this), "GxD408Native");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) { dispatchNativeIntent(); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !local(req.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                String name = req.getUrl().getPath();
                if (!local(req.getUrl()) || !"GET".equals(req.getMethod()) ||
                    !("/index.html".equals(name) || "/version-history.json".equals(name))) return denied();
                try {
                    return new WebResourceResponse(name.endsWith(".html") ? "text/html" : "application/json",
                        "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"),
                        getAssets().open(name.substring(1)));
                } catch (Exception e) { return denied(); }
            }
        });
        if (Build.VERSION.SDK_INT >= 29) {
            // Reserve one bounded left-edge navigation segment, within Android's
            // 200dp per-edge budget. All other system Back areas remain available.
            web.addOnLayoutChangeListener((view, left, top, right, bottom,
                oldLeft, oldTop, oldRight, oldBottom) -> updateNavigationGestureSegment());
            web.post(this::updateNavigationGestureSegment);
        }
        installPreviewContent();
        web.loadUrl("https://" + HOST + "/index.html");
    }
    private void installPreviewContent() {
        if (Build.VERSION.SDK_INT < 35) {
            // Earlier versions keep their existing platform-fitted content bounds.
            setContentView(web);
            return;
        }
        getWindow().setDecorFitsSystemWindows(false);
        android.widget.FrameLayout content = new android.widget.FrameLayout(this);
        content.setBackgroundColor(0xfff4f7f5);
        content.addView(web, new android.widget.FrameLayout.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
            android.graphics.Insets keyboard = insets.getInsets(android.view.WindowInsets.Type.ime());
            int bottom = Math.max(safe.bottom, keyboard.bottom);
            // Resize the WebView's actual viewport, so DOM and touch coordinates
            // share the same inset origin instead of compensating with CSS.
            if (view.getPaddingLeft() != safe.left || view.getPaddingTop() != safe.top ||
                view.getPaddingRight() != safe.right || view.getPaddingBottom() != bottom)
                view.setPadding(safe.left, safe.top, safe.right, bottom);
            // This container has applied the insets; descendants must not apply them twice.
            return android.view.WindowInsets.CONSUMED;
        });
        setContentView(content);
        content.requestApplyInsets();
    }
    private void updateNavigationGestureSegment() {
        if (Build.VERSION.SDK_INT < 29 || web == null) return;
        float density = getResources().getDisplayMetrics().density;
        int width = Math.min(web.getWidth(), Math.round(48f * density));
        int top = Math.min(web.getHeight(), Math.round(80f * density));
        int bottom = Math.min(web.getHeight(), top + Math.round(200f * density));
        web.setSystemGestureExclusionRects(width > 0 && bottom > top
            ? Collections.singletonList(new Rect(0, top, width, bottom))
            : Collections.emptyList());
    }
    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }
    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    /** Selected local documents are read by the input element; no broad storage permission. */
    private boolean chooseLocalDocuments(WebView view, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (callback == null) return false;
        if (destroyed || view != web || view.getUrl() == null || !local(Uri.parse(view.getUrl())) || params == null ||
            (params.getMode() != WebChromeClient.FileChooserParams.MODE_OPEN && params.getMode() != WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)) {
            callback.onReceiveValue(null);return true;
        }
        // Do not replace the first callback: its result may already be on its way.
        if (pendingFiles != null) { callback.onReceiveValue(null);return true; }
        LinkedHashSet<String> mimeTypes = new LinkedHashSet<>();
        String[] accepted = params.getAcceptTypes();
        if (accepted != null) for (String group : accepted) {
            if (group == null) continue;
            for (String item : group.split(",")) {
                String type = item.trim().toLowerCase(Locale.ROOT);
                if (type.startsWith(".")) type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                if (type != null && type.matches("(?:[a-z0-9!#$&^_.+-]+|\\*)/(?:[a-z0-9!#$&^_.+-]+|\\*)")) mimeTypes.add(type);
            }
        }
        Intent request = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeTypes.size() == 1 ? mimeTypes.iterator().next() : "*/*")
            .putExtra(Intent.EXTRA_LOCAL_ONLY, true)
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (mimeTypes.size() > 1) request.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
        pendingFiles = callback;
        pendingFilesMultiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        try { startActivityForResult(request, OPEN_LOCAL_DOCUMENT); }
        catch (ActivityNotFoundException | SecurityException unavailable) {
            completeFileSelection(null);
            android.widget.Toast.makeText(this, "无法打开本机文件选择器；当前表单仍保留", android.widget.Toast.LENGTH_LONG).show();
        }
        return true;
    }
    private void completeFileSelection(Uri[] selected) {
        ValueCallback<Uri[]> callback = pendingFiles;
        pendingFiles = null;pendingFilesMultiple = false;
        if (callback != null) callback.onReceiveValue(selected);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != OPEN_LOCAL_DOCUMENT || pendingFiles == null) return;
        LinkedHashSet<Uri> selected = new LinkedHashSet<>();
        if (!destroyed && resultCode == RESULT_OK && data != null) {
            ClipData clips = data.getClipData();
            if (clips != null) for (int i = 0; i < clips.getItemCount(); i++) {
                Uri uri = clips.getItemAt(i).getUri();
                if (uri != null && "content".equals(uri.getScheme())) selected.add(uri);
                if (!pendingFilesMultiple && !selected.isEmpty()) break;
            }
            if (selected.isEmpty()) {
                Uri uri = data.getData();
                if (uri != null && "content".equals(uri.getScheme())) selected.add(uri);
            }
        }
        completeFileSelection(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
    }
    public WebView previewWebView() { return web; }
    public final class PreviewBridge {
        @JavascriptInterface public boolean isPreview() { return true; }
        @JavascriptInterface public int nativeTimerProtocol() { return NativeTimerSession.PROTOCOL; }
        @JavascriptInterface public String versionInfo() {
            try { return new JSONObject().put("versionName", BuildInfo.VERSION_NAME).put("versionCode", BuildInfo.VERSION_CODE)
                .put("sourceSha", BuildInfo.SOURCE_SHA).put("buildTimeUtc", BuildInfo.BUILD_TIME_UTC).put("timezone", "UTC")
                .put("runId", BuildInfo.RUN_ID).put("runAttempt", BuildInfo.RUN_ATTEMPT).put("htmlSha256", BuildInfo.HTML_SHA256)
                .put("apkBuild", true).put("historyText", BuildInfo.HISTORY_TEXT).toString(); }
            catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void openNativeTimer() {
            runOnUiThread(() -> startActivity(new Intent(D408Activity.this, D408TimerActivity.class)));
        }
        @JavascriptInterface public void openVersionInfo() { runOnUiThread(() -> showVersion()); }
        @JavascriptInterface public void navigationDrawerOpened() {
            runOnUiThread(() -> {
                if (destroyed || web == null) return;
                // A page's floating edit toolbar must not remain above the
                // global drawer and consume its next navigation touch.
                // Do not inject focus changes or writes to DOM selection/dirty fields.
                android.util.Log.i("D403PreviewInput", "navigation-drawer-open mode="
                    + (floatingTextMode == null ? "none" : System.identityHashCode(floatingTextMode)));
                finishFloatingTextMode();
            });
        }
        @JavascriptInterface public void timerCall(String id, String json) {
            if (id == null || id.length() > 100 || json == null || json.length() > 65536) return;
            NativeTimerStore.request(D408Activity.this, json, (value, error) -> {
                final String script;
                try {
                    JSONObject response = new JSONObject().put("id", id);
                    if (error == null) response.put("value", value); else response.put("error", error);
                    script = "document.dispatchEvent(new CustomEvent('gx-d4-native-timer',{detail:" + response.toString() + "}))";
                } catch (Exception ignored) { return; }
                runOnUiThread(() -> {
                    if (destroyed || web == null) return;
                    try { web.evaluateJavascript(script, null); }
                    catch (Exception ignored) {}
                });
            });
        }
    }
    private void showVersion() {
        final String text = BuildInfo.VERSION_NAME + " / versionCode " + BuildInfo.VERSION_CODE +
            "\nby codex · " + BuildInfo.SOURCE_SHA.substring(0, 5) +
            "\nAPK 编译时间：" + BuildInfo.BUILD_TIME_UTC + " (UTC)" +
            "\n原生服务集成候选；合成应用空间，无生产同步";
        new AlertDialog.Builder(this).setTitle("MyTodo D4-08 版本信息").setMessage(text)
            .setPositiveButton("复制版本信息", (d, w) -> ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("MyTodo D4-08", text)))
            .setNeutralButton("版本历史", (d, w) -> new AlertDialog.Builder(this)
                .setTitle("版本历史（离线）").setMessage(BuildInfo.HISTORY_TEXT).setPositiveButton("关闭", null).show())
            .setNegativeButton("关闭", null).show();
    }
    @Override public void onBackPressed() {
        // Exactly one unified UI back. Never both call back() and dispatch gx-back.
        if (web != null) web.evaluateJavascript(
            "(function(){if(window.D4PreviewBack)return window.D4PreviewBack();" +
            "if(window.D4Prototype&&D4Prototype.back){D4Prototype.back();return true;}return false;})()",
            value -> { if (!destroyed && "false".equals(value)) moveTaskToBack(true); });
    }
    @Override public void onActionModeStarted(android.view.ActionMode mode) {
        super.onActionModeStarted(mode);
        if (mode.getType() == android.view.ActionMode.TYPE_FLOATING) {
            floatingTextMode = mode;
            android.util.Log.i("D403PreviewInput", "floating-text-started id=" + System.identityHashCode(mode)
                + " restoreEpoch=" + textRestoreEpoch + " restoring=" + restoringTextMode);
            // WebView can rebuild a stale selection toolbar while its window is
            // returning, even when no ActionMode remained at onPause. Limit this
            // cleanup to the restored visual-state boundary; fresh input ends it earlier.
            if (restoringTextMode) {
                android.util.Log.i("D403PreviewInput", "floating-text-restored-before-input id="
                    + System.identityHashCode(mode) + " epoch=" + textRestoreEpoch);
                mode.finish();
            }
        }
    }
    @Override public void onActionModeFinished(android.view.ActionMode mode) {
        if (floatingTextMode == mode) floatingTextMode = null;
        if (mode.getType() == android.view.ActionMode.TYPE_FLOATING)
            android.util.Log.i("D403PreviewInput", "floating-text-finished id=" + System.identityHashCode(mode));
        super.onActionModeFinished(mode);
    }
    private void finishFloatingTextMode() {
        android.view.ActionMode mode = floatingTextMode;
        floatingTextMode = null;
        android.util.Log.i("D403PreviewInput", "floating-text-lifecycle-end id=" + (mode == null ? "none" : System.identityHashCode(mode)));
        if (mode != null) mode.finish();
    }
    private void endTextRestore(String reason) {
        if (!restoringTextMode) return;
        restoringTextMode = false;
        android.util.Log.i("D403PreviewInput", "text-restore-end epoch=" + textRestoreEpoch + " reason=" + reason);
    }
    private void observeResumedInput(String kind, long eventTime) {
        if (logNextResumedInput) {
            logNextResumedInput = false;
            android.util.Log.i("D403PreviewInput", "text-restore-first-input epoch=" + textRestoreEpoch
                + " kind=" + kind + " eventTime=" + eventTime + " restoring=" + restoringTextMode
                + " mode=" + (floatingTextMode == null ? "none" : System.identityHashCode(floatingTextMode)));
        }
        endTextRestore(kind);
    }
    @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
        if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN)
            observeResumedInput("touch-down", event.getEventTime());
        return super.dispatchTouchEvent(event);
    }
    @Override public boolean dispatchKeyEvent(android.view.KeyEvent event) {
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN)
            observeResumedInput("key-down", event.getEventTime());
        return super.dispatchKeyEvent(event);
    }
    private void endTextRestoreAfterFrame() {
        if (!restoringTextMode || restoreFrameRequested || web == null || !hasWindowFocus()) return;
        restoreFrameRequested = true;
        final long epoch = textRestoreEpoch;
        android.util.Log.i("D403PreviewInput", "text-restore-frame-request epoch=" + epoch);
        web.postVisualStateCallback(epoch, new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                if (!destroyed && epoch == textRestoreEpoch && requestId == epoch)
                    endTextRestore("restored-visual-state-ready");
            }
        });
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) endTextRestoreAfterFrame();
    }
    @Override protected void onPause() {
        // A text-selection toolbar belongs to this foreground WebView. Finish it
        // before pausing, so returning from a native screen cannot revive an old
        // popup over an unrelated control and consume its first real touch.
        resumeAfterPause = true;
        restoringTextMode = false;
        restoreFrameRequested = false;
        logNextResumedInput = false;
        textRestoreEpoch++;
        finishFloatingTextMode();
        if (web != null) web.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        // The initial launch has no restored selection to clean up. Subsequent
        // resumes end at a WebView visual-state callback, not an input timeout.
        restoringTextMode = resumeAfterPause;
        resumeAfterPause = false;
        restoreFrameRequested = false;
        logNextResumedInput = restoringTextMode;
        if (restoringTextMode) {
            textRestoreEpoch++;
            android.util.Log.i("D403PreviewInput", "text-restore-begin epoch=" + textRestoreEpoch);
        }
        super.onResume();
        AndroidCompanionService.refresh(this);
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("document.dispatchEvent(new Event('gx-d4-native-timer-resume'))", null);
            endTextRestoreAfterFrame();
        }
    }
    @Override protected void onDestroy() {
        destroyed = true;
        restoringTextMode = false;
        textRestoreEpoch++;
        finishFloatingTextMode();
        completeFileSelection(null);
        if (web != null) { web.removeJavascriptInterface("GxD4Preview"); web.removeJavascriptInterface("GxD408Native"); web.destroy(); web = null; }
        super.onDestroy();
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); dispatchNativeIntent(); }
    private void dispatchNativeIntent() {
        if (web == null || getIntent() == null) return;
        String task = getIntent().getStringExtra("taskId"), route = getIntent().getStringExtra("nativeRoute");
        if (task != null) web.evaluateJavascript("window.D4Prototype&&D4Prototype.navigate('task-detail',{selected:" + JSONObject.quote(task) + "})", null);
        else if ("pomodoro".equals(route)) web.evaluateJavascript("window.D4Prototype&&D4Prototype.navigate('pomodoro')", null);
        else if ("settings".equals(route)) web.evaluateJavascript("window.D4Prototype&&D4Prototype.navigate('settings')", null);
        getIntent().removeExtra("taskId"); getIntent().removeExtra("nativeRoute");
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] result) {
        super.onRequestPermissionsResult(code, permissions, result);
        if (code == 405) { D408Bridge.IO.execute(() -> ReminderScheduler.refresh(this)); AndroidCompanionService.refresh(this); }
    }
}
