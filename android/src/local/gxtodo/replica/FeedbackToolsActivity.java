package local.gxtodo.replica;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import com.androidshared.feedback.FeedbackKit;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/** An independent host: no FeedbackHost adapter or Xingji business classes are required. */
public final class FeedbackToolsActivity extends Activity implements FeedbackApplication.Listener {
    private static final int EXPORT = 41, RESTORE = 42;
    private final ArrayList<Button> buttons = new ArrayList<>();
    private FeedbackApplication application;
    private TextView status;
    private int pendingPicker;
    private Uri pendingRestore;
    private AlertDialog restoreDialog;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        application = (FeedbackApplication) getApplication();
        if (saved != null) {
            pendingPicker = saved.getInt("pendingPicker", 0);
            String uri = saved.getString("pendingRestore");
            if (uri != null) pendingRestore = Uri.parse(uri);
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(247, 248, 250));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(32), dp(24), dp(32));
        scroll.addView(content);
        text(content, "优化意见", 28, true);
        text(content, "随时记下一句话，之后再分类、找回和整理。", 16, false);
        text(content, "Feedback Kit " + FeedbackKit.VERSION, 13, false);
        action(content, "查看优化意见", view -> FeedbackKit.openList(this));
        action(content, "记个想法", view -> FeedbackKit.newIdea(this, "四象限待办 · 优化意见"));

        text(content, "备份与恢复", 21, true);
        text(content, "备份包含本应用的意见、草稿和截图。恢复会完整替换这些内容。", 16, false);
        action(content, "导出意见备份", view -> chooseDocument(EXPORT));
        action(content, "从备份恢复", view -> chooseDocument(RESTORE));
        status = text(content, application.message(), 15, false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        setContentView(scroll);
        refresh();
    }

    @Override protected void onStart() {
        super.onStart();
        application.observe(this);
    }

    @Override protected void onPostResume() {
        super.onPostResume();
        if (pendingRestore != null && !application.isBusy()) confirmRestore();
    }

    @Override protected void onStop() {
        application.stopObserving(this);
        super.onStop();
    }

    @Override protected void onDestroy() {
        if (restoreDialog != null) restoreDialog.dismiss();
        super.onDestroy();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putInt("pendingPicker", pendingPicker);
        if (pendingRestore != null) state.putString("pendingRestore", pendingRestore.toString());
        super.onSaveInstanceState(state);
    }

    @Override public void onFeedbackBackupChanged() { refresh(); }

    @Override public void onBackPressed() {
        if (application.isBusy()) {
            Toast.makeText(this, "备份操作进行中，请稍候", Toast.LENGTH_SHORT).show();
            return;
        }
        super.onBackPressed();
    }

    private void chooseDocument(int request) {
        if (application.isBusy() || pendingPicker != 0) return;
        Intent intent = new Intent(request == EXPORT ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if (request == EXPORT) {
            intent.setType("application/zip");
            String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
            intent.putExtra(Intent.EXTRA_TITLE, "feedback-" + stamp + ".zip");
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } else {
            // Providers may report ZIP archives as application/octet-stream; the library validates contents.
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "application/zip", "application/x-zip-compressed", "application/octet-stream"});
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        pendingPicker = request;
        refresh();
        try {
            startActivityForResult(intent, request);
        } catch (ActivityNotFoundException error) {
            pendingPicker = 0;
            application.showMessage("当前设备没有可用的系统文件选择器。");
            refresh();
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT && request != RESTORE) return;
        pendingPicker = 0;
        if (result != RESULT_OK || data == null || data.getData() == null) {
            application.showMessage("已取消选择文件。");
            refresh();
            return;
        }
        Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())
                || (getPackageName() + ".feedback.files").equals(uri.getAuthority())) {
            application.showMessage("请选择系统文件界面中的备份文件。");
            refresh();
            return;
        }
        if (application.isBusy()) { refresh(); return; }
        // The temporary document grant lasts while this task remains. This sample does not
        // schedule work after process death or take/revoke the user's persisted URI grants.
        if (request == EXPORT) application.backup(uri, false);
        else {
            pendingRestore = uri;
            confirmRestore();
        }
        refresh();
    }

    private void confirmRestore() {
        if (restoreDialog != null || pendingRestore == null || isFinishing()) return;
        restoreDialog = new AlertDialog.Builder(this)
                .setTitle("替换当前优化意见？")
                .setMessage("恢复会替换本应用现有的全部意见、草稿和截图。建议先导出当前意见；任务、账号和坚果云数据不受影响。\n\n"
                        + "备份会先完整检查；检查失败时保留当前数据。")
                .setNegativeButton("取消", (dialog, which) -> cancelRestore())
                .setPositiveButton("检查并恢复", (dialog, which) -> {
                    Uri selected = pendingRestore;
                    pendingRestore = null;
                    if (selected != null) application.backup(selected, true);
                    refresh();
                })
                .setOnCancelListener(dialog -> cancelRestore())
                .create();
        restoreDialog.setOnDismissListener(dialog -> restoreDialog = null);
        restoreDialog.show();
    }

    private void cancelRestore() {
        pendingRestore = null;
        application.showMessage("已取消恢复，当前意见保持不变。");
        refresh();
    }

    private void refresh() {
        boolean enabled = !application.isBusy() && pendingPicker == 0 && pendingRestore == null;
        for (Button button : buttons) button.setEnabled(enabled);
        if (status != null) status.setText(application.message());
    }

    private TextView text(LinearLayout parent, String value, int size, boolean heading) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(heading ? Color.rgb(28, 39, 48) : Color.rgb(75, 88, 97));
        if (heading) view.setTypeface(null, android.graphics.Typeface.BOLD);
        view.setPadding(0, dp(heading ? 16 : 10), 0, dp(12));
        parent.addView(view, new LinearLayout.LayoutParams(-1, -2));
        return view;
    }

    private void action(LinearLayout parent, String title, View.OnClickListener click) {
        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setMinHeight(dp(52));
        button.setOnClickListener(click);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(8);
        parent.addView(button, params);
        buttons.add(button);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
