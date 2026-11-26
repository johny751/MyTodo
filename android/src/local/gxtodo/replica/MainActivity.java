package local.gxtodo.replica;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Offline shell. Only bundled assets are allowed to access the native bridge. */
public final class MainActivity extends Activity {
    private static final String HOST = "gxtodo.local";
    private static final int EXPORT_REQUEST = 41, IMPORT_REQUEST = 42;
    private volatile String pendingTaskId = "";
    private volatile String pendingToolAction = "";
    private boolean nativeReady;
    private WebView web;
    private AccountStore accounts;
    private String exportData="";
    private volatile boolean destroyed;
    private final java.util.concurrent.ExecutorService syncExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final Object stateLock = new Object();
    private static final Set<String> ASSETS = new HashSet<>(Arrays.asList(
        "index.html", "styles.css", "interaction.css", "src/app.mjs", "src/view-history.mjs", "src/model.mjs", "src/task-tree.mjs", "src/task-editor.mjs",
        "src/accounts.mjs", "src/storage.mjs", "src/gestures.mjs", "src/compat.mjs", "src/undo.mjs", "src/sync-core.mjs", "src/replica.mjs", "src/delta-sync.mjs", "src/sync-client.mjs", "src/schedule.mjs", "src/personal-ui.mjs", "src/reminders.mjs", "src/feedback.mjs", "src/feedback-ui.mjs"));

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (NativeIntegration.enabled(this)) { NativeIntegration.adapter(this).open(this); return; }
        pendingTaskId = getIntent().getStringExtra("taskId");
        pendingToolAction = getIntent().getStringExtra("toolAction");
        try { accounts=AccountStore.get(this); } catch(Exception e){ android.widget.TextView error=new android.widget.TextView(this);error.setText("无法读取账号："+e.getMessage());setContentView(error);return;}
        if(getIntent().hasExtra("accountId")&&!accounts.active().equals(getIntent().getStringExtra("accountId")))pendingTaskId="";
        ReminderScheduler.refresh(this);
        web = new WebView(this);
        WebSettings config = web.getSettings();
        config.setJavaScriptEnabled(true);
        config.setDomStorageEnabled(false);
        config.setUseWideViewPort(true);
        config.setAllowFileAccess(false);
        config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        config.setSupportZoom(false);
        config.setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) android.util.Log.e("GxTodoWeb", message.message() + " at " + message.sourceId() + ":" + message.lineNumber());
                return true;
            }
        });
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new NativeStorage(), "GxNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !isLocal(uri);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isLocal(uri) || !"GET".equals(request.getMethod())) return denied();
                String name = uri.getPath();
                name = name == null || name.equals("/") ? "index.html" : name.substring(1);
                if (!ASSETS.contains(name)) return denied();
                String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
                Map<String,String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
                try { return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open(name)); }
                catch (IOException error) { return denied(); }
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/#/task");
    }
    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }
    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private void message(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }
    private String readSaved(String account)throws Exception {return accounts.read(account);}
    private volatile boolean nativeForeground=false;
    private final android.os.Handler refreshHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable refreshSaved=()->{if(!destroyed){ReminderScheduler.refresh(this);TodoWidget.refresh(this);AndroidCompanionService.refresh(this);}};
    public final class NativeStorage {
        @JavascriptInterface public String pendingToolAction() { String action = pendingToolAction; pendingToolAction = ""; return action == null ? "" : action; }
        @JavascriptInterface public void uiReady() { runOnUiThread(() -> { nativeReady = true; dispatchPendingTools(); }); }
        @JavascriptInterface public void openAndroidTools(String section) {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, AndroidToolsActivity.class).putExtra("section", "timer".equals(section) ? "timer" : "settings")));
        }

        @JavascriptInterface public void openFeedback() {
            runOnUiThread(() -> {
                if (((FeedbackApplication) getApplication()).canOpenFeedback())
                    startActivity(new Intent(MainActivity.this, FeedbackToolsActivity.class));
                else message("优化意见备份操作进行中，请稍候");
            });
        }
        @JavascriptInterface public void newFeedbackIdea(String source) {
            runOnUiThread(() -> {
                if (((FeedbackApplication) getApplication()).canOpenFeedback())
                    com.androidshared.feedback.FeedbackKit.newIdea(MainActivity.this, source);
                else message("优化意见备份操作进行中，请稍候");
            });
        }

        @JavascriptInterface public int replicaVersion(){return 2;}
        @JavascriptInterface public boolean isForeground(){return nativeForeground;}
        @JavascriptInterface public String notificationStatus() { return ReminderScheduler.status(MainActivity.this); }
        @JavascriptInterface public String pendingTask() { String id=pendingTaskId;pendingTaskId="";return id==null?"":id; }
        @JavascriptInterface public void requestNotifications() { runOnUiThread(() -> { if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},43); else if(!ReminderScheduler.manager(MainActivity.this).areNotificationsEnabled())startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName()));else ReminderScheduler.refresh(MainActivity.this); }); }
        @JavascriptInterface public void requestExactAlarms() { runOnUiThread(() -> {if(android.os.Build.VERSION.SDK_INT>=31&&!((android.app.AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms())startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));else message("准时提醒权限已开启");}); }
        @JavascriptInterface public void importState() {runOnUiThread(() -> {Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");try{startActivityForResult(intent,IMPORT_REQUEST);}catch(Exception e){message("未找到文件选择工具");}});}

        @JavascriptInterface public void syncCall(String id, String json) {
            if (json == null || json.length() > 64 * 1024 * 1024) return;
            syncExecutor.execute(() -> {
                JSONObject result = new JSONObject();
                try { result.put("id", id); JSONObject input=new JSONObject(json);result.put("value", accounts.sync(input.getString("accountId"),input)); if(input.optString("op").equals("replica")&&input.optString("action").equals("commit")&&input.optJSONArray("rows")!=null&&input.getJSONArray("rows").length()>0&&input.getString("accountId").equals(accounts.active())){refreshHandler.removeCallbacks(refreshSaved);refreshHandler.postDelayed(refreshSaved,750);} }
                catch (Exception error) { try { result.put("error", error instanceof IOException ? "无法连接坚果云或保存同步数据，请检查网络与可用空间" : "同步失败：" + error.getMessage()); } catch (Exception ignored) {} }
                runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript("document.dispatchEvent(new CustomEvent('gx-sync-result',{detail:" + result.toString() + "}))", null); });
            });
        }
        @JavascriptInterface public String accountCall(String json){JSONObject out=new JSONObject();try{JSONObject input=new JSONObject(json);out.put("value",accounts.manage(input));if(input.optString("op").equals("activate")){ReminderScheduler.manager(MainActivity.this).cancelAll();ReminderScheduler.refresh(MainActivity.this);TodoWidget.refresh(MainActivity.this);AndroidCompanionService.refresh(MainActivity.this);}}catch(Exception e){try{out.put("error",e.getMessage());}catch(Exception ignored){}}return out.toString();}
        @JavascriptInterface public String readStateFor(String account){try{return readSaved(account);}catch(Exception e){throw new IllegalStateException("本地账号数据读取失败，原数据已保留",e);}}
        @JavascriptInterface public String writeStateFor(String account,String json){try{accounts.write(account,json);if(account.equals(accounts.active())){ReminderScheduler.refresh(MainActivity.this);TodoWidget.refresh(MainActivity.this);AndroidCompanionService.refresh(MainActivity.this);}return "ok";}catch(Exception e){return "保存失败："+e.getMessage();}}
        @JavascriptInterface public void exportStateFor(String account) {
            try{exportData=readSaved(account);}catch(Exception e){message("无法读取账号备份");return;}
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, "gxtodo-backup.json");
                try { startActivityForResult(intent, EXPORT_REQUEST); }
                catch (Exception error) { message("未找到系统文件保存工具"); }
            });
        }
        @JavascriptInterface public void backgroundApp() {
            runOnUiThread(() -> moveTaskToBack(true));
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if(request==IMPORT_REQUEST && result==RESULT_OK && data!=null && data.getData()!=null){
            try(InputStream in=getContentResolver().openInputStream(data.getData());ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>64*1024*1024)throw new IOException("备份超过 64 MB");out.write(buffer,0,n);}String json=out.toString("UTF-8");web.evaluateJavascript("document.dispatchEvent(new CustomEvent('gx-import',{detail:"+JSONObject.quote(json)+"}))",null);}catch(Exception e){message("导入失败，请选择有效的 JSON 备份（不超过 64 MB）");}return;
        }
        if (request != EXPORT_REQUEST || result != RESULT_OK || data == null || data.getData() == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
            String saved = exportData;
            if (saved.isEmpty() || out == null) { message("请先保存任务，再导出备份"); return; }
            out.write(saved.getBytes(StandardCharsets.UTF_8));
            message("备份已导出");
        } catch (IOException error) { message("导出失败，请重新选择保存位置"); }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String account = intent.getStringExtra("accountId");
        if (accounts == null || account != null && !account.equals(accounts.active())) return;
        pendingTaskId = intent.getStringExtra("taskId");
        pendingToolAction = intent.getStringExtra("toolAction");
        dispatchPendingTools();
    }
    private void dispatchPendingTools() {
        if (!nativeReady || web == null || destroyed) return;
        if (pendingToolAction != null && !pendingToolAction.isEmpty()) {
            String action = pendingToolAction;
            pendingToolAction = "";
            web.evaluateJavascript("document.dispatchEvent(new CustomEvent('gx-tool-action',{detail:" + JSONObject.quote(action) + "}))", null);
        }
        if (pendingTaskId != null && !pendingTaskId.isEmpty()) {
            String task = pendingTaskId;
            pendingTaskId = "";
            web.evaluateJavascript("document.dispatchEvent(new CustomEvent('gx-open-task',{detail:" + JSONObject.quote(task) + "}))", null);
        }
    }
    @Override protected void onResume(){super.onResume();if(NativeIntegration.enabled(this))return;nativeForeground=true;ReminderScheduler.refresh(this);if(accounts!=null){AndroidCompanionService.refresh(this);android.content.SharedPreferences prefs=getSharedPreferences("android-tools",MODE_PRIVATE);if(android.os.Build.VERSION.SDK_INT>=33&&prefs.getBoolean("statusEnabled",true)&&!prefs.getBoolean("notificationAsked",false)&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){prefs.edit().putBoolean("notificationAsked",true).apply();requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},43);}}if(web!=null){web.onResume();web.evaluateJavascript("document.dispatchEvent(new Event('gx-app-foreground'));document.dispatchEvent(new Event('gx-reminder-status'))",null);dispatchPendingTools();}}
    @Override protected void onPause(){nativeForeground=false;if(web!=null){web.evaluateJavascript("document.dispatchEvent(new Event('gx-app-background'))",null);web.onPause();}super.onPause();}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);ReminderScheduler.refresh(this);AndroidCompanionService.refresh(this);if(web!=null)web.evaluateJavascript("document.dispatchEvent(new Event('gx-reminder-status'))",null);}
    @Override public void onBackPressed() {
        web.evaluateJavascript("document.dispatchEvent(new Event('gx-back'))", null);
    }
    @Override protected void onDestroy() {
        destroyed = true;
        refreshHandler.removeCallbacks(refreshSaved);
        syncExecutor.shutdownNow();
        if(web==null){super.onDestroy();return;}
        web.removeJavascriptInterface("GxNative");
        web.destroy();
        super.onDestroy();
    }
}
