package local.gxtodo.replica;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.androidshared.feedback.FeedbackKit;
import org.json.JSONObject;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Narrow native boundary; no generic account, database or sync command is exposed. */
public final class D405Bridge {
    static final ThreadPoolExecutor IO = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<Runnable>(32), new ThreadPoolExecutor.AbortPolicy());
    final D405Activity activity;
    D405Bridge(D405Activity activity) { this.activity = activity; }
    @JavascriptInterface public String profile() { return "d405-synthetic-native-services"; }
    @JavascriptInterface public void openFeedback() {
        activity.runOnUiThread(() -> {
            if (!activity.isDestroyed() && ((FeedbackApplication)activity.getApplication()).canOpenFeedback())
                activity.startActivity(new Intent(activity, FeedbackToolsActivity.class));
        });
    }
    @JavascriptInterface public void newFeedbackIdea() {
        activity.runOnUiThread(() -> {
            if (!activity.isDestroyed() && ((FeedbackApplication)activity.getApplication()).canOpenFeedback())
                FeedbackKit.newIdea(activity, "MyTodo D4-05 原生集成");
        });
    }
    @JavascriptInterface public void requestNotifications() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 405);
        });
    }
    @JavascriptInterface public void requestExactAlarms() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 31 && !((AlarmManager)activity.getSystemService(android.content.Context.ALARM_SERVICE)).canScheduleExactAlarms())
                activity.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + activity.getPackageName())));
        });
    }
    @JavascriptInterface public void notificationStatus(String id) {
        submit(id, () -> new JSONObject().put("text", ReminderScheduler.status(activity)));
    }
    @JavascriptInterface public void saveReminderState(String id, String json) {
        if (json == null || json.length() > 5 * 1024 * 1024) { reply(id, null, "reminder-payload-too-large"); return; }
        submit(id, () -> {
            if (!NativeIntegration.enabled(activity)) throw new SecurityException("isolated-identity-required");
            JSONObject state = new JSONObject(json);
            if (state.getInt("version") != 2) throw new IllegalArgumentException("existing-v2-model-required");
            for (String field : new String[]{"tasks", "notes", "projects", "tags", "places"}) state.getJSONArray(field);
            // Existing AccountStore validation + AtomicFile, only inside this separate application's sandbox.
            AccountStore accounts = AccountStore.get(activity);
            accounts.write(accounts.active(), state.toString());
            ReminderScheduler.refresh(activity);
            return new JSONObject().put("saved", true).put("storage", "isolated-existing-v2-account-store");
        });
    }
    interface Read { JSONObject run() throws Exception; }
    private void submit(String id, Read operation) {
        if (id == null || !id.matches("[A-Za-z0-9._:-]{1,100}")) return;
        try { IO.execute(() -> {
            try { reply(id, operation.run(), null); }
            catch (Exception failure) { reply(id, null, failure.getClass().getSimpleName() + ": " + failure.getMessage()); }
        }); } catch (java.util.concurrent.RejectedExecutionException full) { reply(id, null, "native-queue-full"); }
    }
    private void reply(String id, JSONObject value, String error) {
        try {
            JSONObject response = new JSONObject().put("id", id);
            if (error == null) response.put("value", value); else response.put("error", error);
            String js = "document.dispatchEvent(new CustomEvent('gx-d405-native',{detail:" + response + "}))";
            activity.runOnUiThread(() -> {
                WebView web = activity.previewWebView();
                if (!activity.isDestroyed() && web != null) web.evaluateJavascript(js, null);
            });
        } catch (Exception ignored) {}
    }
}
