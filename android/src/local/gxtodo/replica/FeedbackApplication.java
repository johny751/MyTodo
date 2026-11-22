package local.gxtodo.replica;

import android.app.Activity;
import android.app.Application;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.androidshared.feedback.DefaultFeedbackStorage;
import java.lang.ref.WeakReference;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** App-scoped feedback backup worker. Task/account databases are outside its namespace. */
public final class FeedbackApplication extends Application implements Application.ActivityLifecycleCallbacks {
    interface Listener { void onFeedbackBackupChanged(); }
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor(task -> new Thread(task, "gxtodo-feedback-io"));
    private final Set<Activity> feedbackPages = new HashSet<>();
    private WeakReference<Listener> listener = new WeakReference<>(null);
    // Accessed only on the main thread, including all JS bridge entry points.
    private boolean busy;
    private String message = "意见保存在本机；复制或分享由你主动选择。";

    @Override public void onCreate() { super.onCreate(); registerActivityLifecycleCallbacks(this); }
    boolean isBusy() { return busy; }
    String message() { return message; }
    void observe(Listener value) { listener = new WeakReference<>(value); value.onFeedbackBackupChanged(); }
    void stopObserving(Listener value) { if (listener.get() == value) listener.clear(); }
    void showMessage(String value) { if (!busy) { message = value; notifyListener(); } }
    boolean canOpenFeedback() { return !busy; }

    void backup(Uri uri, boolean restore) {
        if (busy) return;
        if (!feedbackPages.isEmpty()) {
            showMessage("请先关闭已打开的优化意见页面，再导出或恢复。");
            return;
        }
        busy = true;
        message = restore ? "正在检查并恢复优化意见…" : "正在导出意见、草稿和截图…";
        notifyListener();
        worker.execute(() -> {
            String result;
            try {
                // Match the default namespace used by FeedbackKit.openList/newIdea.
                DefaultFeedbackStorage storage = new DefaultFeedbackStorage(this);
                if (restore) storage.restoreBackup(uri); else storage.exportBackup(uri);
                result = restore ? "恢复完成，重新打开优化意见即可查看。" : "意见备份已保存。";
            } catch (Exception error) {
                String detail = error.getMessage();
                if (detail == null || detail.trim().isEmpty()) detail = "请检查文件权限和可用空间后重试。";
                if (detail.length() > 240) detail = detail.substring(0, 240) + "…";
                result = (restore ? "恢复失败，当前意见未替换。" : "导出失败，所选文件可能不完整，请重新导出。") + "\n" + detail;
            }
            final String finished = result;
            main.post(() -> { busy = false; message = finished; notifyListener(); });
        });
    }
    private void notifyListener() { Listener value = listener.get(); if (value != null) value.onFeedbackBackupChanged(); }
    private static boolean feedbackPage(Activity activity) { return "com.androidshared.feedback.FeedbackActivity".equals(activity.getClass().getName()); }
    @Override public void onActivityCreated(Activity activity, Bundle state) {
        if (feedbackPage(activity)) { feedbackPages.add(activity); if (busy) activity.finish(); }
    }
    @Override public void onActivityResumed(Activity activity) { if (feedbackPage(activity) && busy) activity.finish(); }
    @Override public void onActivityDestroyed(Activity activity) { feedbackPages.remove(activity); }
    @Override public void onActivityStarted(Activity activity) {}
    @Override public void onActivityPaused(Activity activity) {}
    @Override public void onActivityStopped(Activity activity) {}
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
}
