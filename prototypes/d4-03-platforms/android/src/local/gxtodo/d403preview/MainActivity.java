package local.gxtodo.d403preview;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Synthetic-only WebView. No production GxNative, accounts, SQLite or sync bridge. */
public final class MainActivity extends Activity {
    private static final String HOST = "d403-preview.local";
    private WebView web;
    private boolean destroyed;
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
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR)
                    android.util.Log.e("D403PreviewWeb", message.message() + " at " + message.sourceId() + ":" + message.lineNumber());
                return true;
            }
        });
        web.addJavascriptInterface(new PreviewBridge(), "GxD4Preview");
        web.setWebViewClient(new WebViewClient() {
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
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }
    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }
    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    public WebView previewWebView() { return web; }
    public final class PreviewBridge {
        @JavascriptInterface public boolean isPreview() { return true; }
        @JavascriptInterface public String versionInfo() {
            try { return new JSONObject().put("versionName", BuildInfo.VERSION_NAME).put("versionCode", BuildInfo.VERSION_CODE)
                .put("sourceSha", BuildInfo.SOURCE_SHA).put("buildTimeUtc", BuildInfo.BUILD_TIME_UTC).put("timezone", "UTC")
                .put("runId", BuildInfo.RUN_ID).put("runAttempt", BuildInfo.RUN_ATTEMPT).put("htmlSha256", BuildInfo.HTML_SHA256)
                .put("apkBuild", true).put("historyText", BuildInfo.HISTORY_TEXT).toString(); }
            catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void openNativeTimer() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, NativeTimerActivity.class)));
        }
        @JavascriptInterface public void openVersionInfo() { runOnUiThread(() -> showVersion()); }
        @JavascriptInterface public void timerCall(String id, String json) {
            if (id == null || id.length() > 100 || json == null || json.length() > 65536) return;
            NativeTimerStore.request(MainActivity.this, json, (value, error) -> runOnUiThread(() -> {
                if (destroyed || web == null) return;
                try {
                    JSONObject response = new JSONObject().put("id", id);
                    if (error == null) response.put("value", value); else response.put("error", error);
                    web.evaluateJavascript("document.dispatchEvent(new CustomEvent('gx-d4-native-timer',{detail:" +
                        response.toString() + "}))", null);
                } catch (Exception ignored) {}
            }));
        }
    }
    private void showVersion() {
        final String text = BuildInfo.VERSION_NAME + " / versionCode " + BuildInfo.VERSION_CODE +
            "\nby codex · " + BuildInfo.SOURCE_SHA.substring(0, 5) +
            "\nAPK 编译时间：" + BuildInfo.BUILD_TIME_UTC + " (UTC)" +
            "\n独立合成体验；无生产数据库/远端同步";
        new AlertDialog.Builder(this).setTitle("MyTodo D4-03 版本信息").setMessage(text)
            .setPositiveButton("复制版本信息", (d, w) -> ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("MyTodo D4-03", text)))
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
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        destroyed = true;
        if (web != null) { web.removeJavascriptInterface("GxD4Preview"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
