package local.gxtodo.replica;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import java.util.concurrent.TimeUnit;

/** Isolated test shell using unchanged AccountStore and ReplicaDatabase classes. */
public final class ProtocolHarnessActivity extends Activity {
    private static final String HOST = "c003.gxtodo.local";
    private static CountDownLatch completed;
    private static JSONObject completedResult;
    private final ExecutorService storage = new ThreadPoolExecutor(1, 1, 0L,
        TimeUnit.MILLISECONDS, new ArrayBlockingQueue<Runnable>(128),
        new ThreadPoolExecutor.AbortPolicy());
    private WebView web;
    private Context sandbox;
    private AccountStore accounts;
    private String input;
    private File output;
    private volatile boolean destroyed;

    static synchronized void prepareResult() {
        completed = new CountDownLatch(1);
        completedResult = null;
    }

    static JSONObject awaitResult(long timeoutMillis) throws Exception {
        CountDownLatch latch;
        synchronized (ProtocolHarnessActivity.class) { latch = completed; }
        if (latch == null || !latch.await(timeoutMillis, TimeUnit.MILLISECONDS)) {
            throw new IOException("Android real-storage vector timed out; no pass is inferred");
        }
        synchronized (ProtocolHarnessActivity.class) { return completedResult; }
    }

    String resultFile() { return output.getAbsolutePath(); }

    private static String fileName(String value, String fallback) {
        String result = value == null ? fallback : value;
        if (!result.matches("[A-Za-z0-9_.-]{1,80}") || result.equals(".") || result.equals("..")) {
            throw new IllegalArgumentException("Unsafe test file name");
        }
        return result;
    }

    /** Only the app-private files location differs; all Android/SQLite APIs remain real. */
    private static final class SandboxContext extends ContextWrapper {
        private final File directory;
        SandboxContext(Context base, File directory) { super(base); this.directory = directory; }
        @Override public File getFilesDir() { return directory; }
        @Override public Context getApplicationContext() { return this; }
    }

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        if (!"local.gxtodo.protocolharness".equals(getPackageName())) {
            throw new IllegalStateException("Protocol tests must never open production app files");
        }
        String caseId = fileName(getIntent().getStringExtra("caseId"), "default-case");
        String requestName = fileName(getIntent().getStringExtra("requestName"), "request.json");
        String resultName = fileName(getIntent().getStringExtra("resultName"), "result.json");
        output = new File(getFilesDir(), resultName);
        File cases = new File(getFilesDir(), "protocol-cases");
        File caseDirectory = new File(cases, caseId);
        sandbox = new SandboxContext(getApplicationContext(), caseDirectory);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new NativeStorage(), "GxNative");
        web.addJavascriptInterface(new Control(), "ProtocolNative");
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                android.util.Log.i("C003Web", message.message() + " at " + message.sourceId() + ":" + message.lineNumber());
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !local(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!local(uri) || !"GET".equals(request.getMethod())) return denied();
                String name = uri.getPath();
                name = name == null || name.equals("/") ? "index.html" : name.substring(1);
                if (name.contains("..") || name.startsWith("/") || name.contains("\\")
                        || !(name.equals("index.html") || name.equals("harness-entry.mjs")
                        || name.equals("build-metadata.json") || name.startsWith("src/")
                        || name.startsWith("tests/protocol-harness/"))) return denied();
                String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".json") ? "application/json" : "text/javascript";
                try {
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), getAssets().open(name));
                } catch (IOException error) { return denied(); }
            }
        });
        setContentView(web);
        storage.execute(() -> {
            try {
                if (!caseDirectory.isDirectory() && !caseDirectory.mkdirs()) throw new IOException("Cannot create isolated case directory");
                if (!caseDirectory.getCanonicalPath().startsWith(cases.getCanonicalPath() + File.separator)) throw new IOException("Case escaped test directory");
                accounts = AccountStore.get(sandbox);
                File request = new File(getFilesDir(), requestName);
                if (request.length() > 8 * 1024 * 1024) throw new IOException("Test request exceeds bounded fixture transport");
                input = new String(Files.readAllBytes(request.toPath()), StandardCharsets.UTF_8);
                new JSONObject(input);
                runOnUiThread(() -> web.loadUrl("https://" + HOST + "/"));
            } catch (Exception error) { completeFailure(error); }
        });
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }
    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private void reply(String event, JSONObject result) {
        runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript("document.dispatchEvent(new CustomEvent('" + event
                + "',{detail:" + result.toString() + "}))", null);
        });
    }

    public final class NativeStorage {
        @JavascriptInterface public int replicaVersion() { return 2; }
        @JavascriptInterface public void syncCall(String id, String json) {
            if (json == null || json.length() > 64 * 1024 * 1024) return;
            storage.execute(() -> {
                JSONObject result = new JSONObject();
                try {
                    result.put("id", id);
                    JSONObject request = new JSONObject(json);
                    if (!"replica".equals(request.getString("op"))) throw new IOException("C0-03 never contacts a real WebDAV account");
                    result.put("value", accounts.sync(request.getString("accountId"), request));
                } catch (Exception error) {
                    try { result.put("error", error.getClass().getName() + ": " + error.getMessage()); } catch (Exception ignored) {}
                }
                reply("gx-sync-result", result);
            });
        }
        @JavascriptInterface public String accountCall(String json) {
            JSONObject result = new JSONObject();
            try { result.put("value", accounts.manage(new JSONObject(json))); }
            catch (Exception error) { try { result.put("error", error.getClass().getName() + ": " + error.getMessage()); } catch (Exception ignored) {} }
            return result.toString();
        }
    }

    /** Test-control reflection never replaces event validation, merge or SQL commit. */
    private SQLiteDatabase physicalDatabase() throws Exception {
        Field field = ReplicaDatabase.class.getDeclaredField("db");
        field.setAccessible(true);
        return (SQLiteDatabase)field.get(accounts.database("default"));
    }
    private void closeAndResetStore() throws Exception {
        if (accounts != null) {
            Field field = AccountStore.class.getDeclaredField("databases");
            field.setAccessible(true);
            Map<?,?> databases = (Map<?,?>)field.get(accounts);
            for (Object database : databases.values()) {
                Field connection = ReplicaDatabase.class.getDeclaredField("db");
                connection.setAccessible(true);
                ((SQLiteDatabase)connection.get(database)).close();
            }
        }
        Field singleton = AccountStore.class.getDeclaredField("instance");
        singleton.setAccessible(true);
        singleton.set(null, null);
        accounts = null;
    }
    private JSONObject audit() throws Exception {
        SQLiteDatabase database = physicalDatabase();
        JSONObject meta;
        String metaJSON;
        try (Cursor cursor = database.rawQuery("SELECT value FROM meta WHERE id=1", null)) {
            if (!cursor.moveToFirst()) throw new IOException("Real SQLite metadata missing");
            metaJSON = cursor.getString(0);
            meta = new JSONObject(metaJSON);
        }
        JSONArray rows = new JSONArray(), outbox = new JSONArray();
        try (Cursor cursor = database.rawQuery("SELECT key,kind,id,data,record,deleted,conflicts FROM entities ORDER BY key", null)) {
            while (cursor.moveToNext()) rows.put(new JSONObject().put("key", cursor.getString(0))
                .put("kind", cursor.getString(1)).put("id", cursor.getString(2))
                .put("data", new JSONObject(cursor.getString(3))).put("record", new JSONObject(cursor.getString(4)))
                .put("deleted", cursor.getInt(5) != 0).put("conflicts", new JSONArray(cursor.getString(6))));
        }
        try (Cursor cursor = database.rawQuery("SELECT id,event FROM outbox ORDER BY id", null)) {
            while (cursor.moveToNext()) outbox.put(new JSONObject().put("id", cursor.getLong(0)).put("event", new JSONObject(cursor.getString(1))));
        }
        return new JSONObject().put("meta", meta).put("metaJSON", metaJSON).put("rows", rows).put("outbox", outbox)
            .put("accountRegistry", accounts.manage(new JSONObject().put("op", "list")))
            .put("databaseFile", new File(accounts.directory("default"), "tasks.sqlite").getCanonicalPath());
    }
    private void seed(String actor) throws Exception {
        if (!actor.matches("[a-zA-Z0-9-]{1,80}")) throw new IllegalArgumentException("Seed requires a valid fixture actor");
        JSONObject before = audit(), meta = before.getJSONObject("meta");
        if (meta.optBoolean("initialized") || meta.getLong("seq") != 0 || meta.getLong("queue") != 0
                || before.getJSONArray("rows").length() != 0 || before.getJSONArray("outbox").length() != 0) {
            throw new IllegalStateException("Refusing actor changes in an initialized fixture database");
        }
        meta.put("actor", actor);
        physicalDatabase().execSQL("UPDATE meta SET value=? WHERE id=1", new Object[]{meta.toString()});
    }
    private void fault(String mode, String id) throws Exception {
        SQLiteDatabase database = physicalDatabase();
        database.execSQL("DROP TRIGGER IF EXISTS temp.c003_fail_meta");
        database.execSQL("DROP TRIGGER IF EXISTS temp.c003_fail_entity");
        if ("none".equals(mode)) return;
        if ("commit-meta".equals(mode)) {
            database.execSQL("CREATE TEMP TRIGGER c003_fail_meta BEFORE UPDATE ON meta BEGIN SELECT RAISE(ABORT,'C003_SQL_FAILURE'); END");
        } else if ("entity-insert".equals(mode)) {
            String when = "";
            if (id != null) {
                if (!id.matches("[A-Za-z0-9_.-]{1,80}")) throw new IllegalArgumentException("Unsafe fixture fault entity id");
                when = " WHEN NEW.id='" + id + "'";
            }
            database.execSQL("CREATE TEMP TRIGGER c003_fail_entity BEFORE INSERT ON entities" + when + " BEGIN SELECT RAISE(ABORT,'C003_SQL_FAILURE'); END");
        } else throw new IllegalArgumentException("Unknown fixture fault");
    }

    /** Real TCP/HTTP fixture I/O, limited to adb-reversed emulator loopback. */
    private JSONObject request(JSONObject request) throws Exception {
        String base = new JSONObject(input).getString("fixtureUrl");
        Uri uri = Uri.parse(base);
        if (!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost()) || uri.getPort() < 1
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IOException("Only the isolated loopback fixture server is allowed");
        }
        String path = request.getString("path");
        if (!(path.equals("state.json") || path.equals("v2/") || path.matches("v2/[A-Za-z0-9_.-]+"))) {
            throw new IOException("Fixture path is outside the existing WebDAV v2 contract");
        }
        String method = request.getString("method");
        if (!method.equals("GET") && !method.equals("PUT")) {
            throw new IOException("Fixture collections must be prepared by the cloud runner before this test");
        }
        HttpURLConnection connection = (HttpURLConnection)new URL(base.replaceAll("/$", "") + "/dav/C003/" + path).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        String etag = request.isNull("etag") ? null : request.optString("etag", null);
        if (etag != null && (etag.contains("\r") || etag.contains("\n"))) throw new IOException("Invalid fixture HTTP header");
        if (method.equals("GET") && etag != null) connection.setRequestProperty("If-None-Match", etag);
        try {
            if (method.equals("PUT")) {
                byte[] bytes = request.getString("body").getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 8 * 1024 * 1024) throw new IOException("Fixture PUT exceeds existing decoded file bound");
                if (path.endsWith(".gz")) {
                    ByteArrayOutputStream compressed = new ByteArrayOutputStream();
                    try (GZIPOutputStream gzip = new GZIPOutputStream(compressed)) { gzip.write(bytes); }
                    bytes = compressed.toByteArray();
                }
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", path.endsWith(".gz") ? "application/gzip" : "application/json; charset=utf-8");
                connection.setRequestProperty(etag == null ? "If-None-Match" : "If-Match", etag == null ? "*" : etag);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            String body = "";
            if (method.equals("GET") && status == 200) {
                try (InputStream stream = path.endsWith(".gz") ? new GZIPInputStream(connection.getInputStream()) : connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int length;
                    while ((length = stream.read(buffer)) != -1) {
                        if (bytes.size() + length > 8 * 1024 * 1024) throw new IOException("Fixture response exceeds existing decoded file bound");
                        bytes.write(buffer, 0, length);
                    }
                    body = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
                }
            }
            String responseEtag = connection.getHeaderField("ETag");
            return new JSONObject().put("status", status).put("body", body)
                .put("etag", responseEtag == null ? JSONObject.NULL : responseEtag);
        } finally { connection.disconnect(); }
    }

    public final class Control {
        @JavascriptInterface public void call(String id, String json) { control(id, json); }
        @JavascriptInterface public void control(String id, String json) {
            storage.execute(() -> {
                JSONObject reply = new JSONObject();
                try {
                    reply.put("id", id);
                    JSONObject request = new JSONObject(json);
                    String operation = request.getString("op");
                    Object value;
                    if ("input".equals(operation)) value = new JSONObject(input);
                    else if ("audit".equals(operation)) value = audit();
                    else if ("seed".equals(operation)) { seed(request.getString("actor")); value = audit(); }
                    else if ("reopen".equals(operation)) { closeAndResetStore(); accounts = AccountStore.get(sandbox); value = audit(); }
                    else if ("fault".equals(operation)) { fault(request.getString("mode"), request.isNull("id") ? null : request.optString("id", null)); value = new JSONObject().put("installed", request.getString("mode")); }
                    else if ("request".equals(operation)) value = request(request.getJSONObject("request"));
                    else if ("describe".equals(operation)) {
                        try (Cursor cursor = physicalDatabase().rawQuery("SELECT sqlite_version()", null)) {
                            cursor.moveToFirst();
                            android.content.pm.PackageInfo webview = WebView.getCurrentWebViewPackage();
                            value = new JSONObject().put("platform", "android").put("sdkInt", android.os.Build.VERSION.SDK_INT)
                                .put("sqliteVersion", cursor.getString(0)).put("webViewPackage", webview == null ? JSONObject.NULL : webview.packageName)
                                .put("webViewVersion", webview == null ? JSONObject.NULL : webview.versionName)
                                .put("storeClasses", new JSONArray().put(ReplicaDatabase.class.getName()).put(AccountStore.class.getName()));
                        }
                    } else if ("complete".equals(operation)) {
                        complete(request.getJSONObject("result"));
                        value = new JSONObject().put("saved", true).put("file", output.getAbsolutePath());
                    } else throw new IllegalArgumentException("Unknown test-control operation");
                    reply.put("value", value);
                } catch (Exception error) { try { reply.put("error", error.getClass().getName() + ": " + error.getMessage()); } catch (Exception ignored) {} }
                ProtocolHarnessActivity.this.reply("c003-control-result", reply);
            });
        }
    }

    private void complete(JSONObject result) throws Exception {
        AtomicFile file = new AtomicFile(output);
        FileOutputStream stream = null;
        try {
            stream = file.startWrite();
            stream.write(result.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(stream);
        } catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
        closeAndResetStore();
        synchronized (ProtocolHarnessActivity.class) {
            completedResult = result;
            if (completed != null) completed.countDown();
        }
    }
    private void completeFailure(Exception error) {
        try { complete(new JSONObject().put("platform", "android").put("status", "failed")
            .put("error", error.getClass().getName() + ": " + error.getMessage())); }
        catch (Exception secondary) {
            synchronized (ProtocolHarnessActivity.class) {
                try { completedResult = new JSONObject().put("platform", "android").put("status", "failed").put("error", secondary.toString()); }
                catch (Exception ignored) {}
                if (completed != null) completed.countDown();
            }
        }
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (web != null) { web.removeJavascriptInterface("GxNative"); web.removeJavascriptInterface("ProtocolNative"); web.destroy(); }
        storage.shutdown();
        super.onDestroy();
    }
}
