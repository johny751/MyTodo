package local.gxtodo.d403preview;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Both this screen and the WebView use the same isolated, durable native session. */
public final class NativeTimerActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Button> commandButtons = new ArrayList<>();
    private TextView status, history;
    private EditText focusMinutes, restMinutes;
    private Button modeChoice;
    private JSONObject confirmed;
    private boolean resumed, busy, reading, uncertain = true, configDirty, binding;
    private String draftMode = "countdown", lastCompletionShown = "";
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (resumed) { refresh(); handler.postDelayed(this, 1000); } }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(24, 24, 24, 24); scroll.addView(root);
        TextView title = new TextView(this); title.setText("原生番茄钟 · 统一隔离会话"); title.setTextSize(22); root.addView(title);
        TextView note = new TextView(this);
        note.setText("与网页番茄钟共享设置、计时和历史。\n未接入生产通知、任务数据库或同步。"); root.addView(note);
        status = new TextView(this); status.setId(40301); status.setTextSize(20); status.setText("读取计时状态…"); root.addView(status);
        button(root, 40302, "按已保存设置开始", () -> send("start", new JSONObject(), false, null));
        button(root, 40303, "开始 1 分钟验证", this::startOneMinuteValidation);
        button(root, 40304, "暂停", () -> send("pause", new JSONObject(), false, null));
        button(root, 40305, "继续", () -> send("resume", new JSONObject(), false, null));
        button(root, 40306, "提前结束 / 重置", () -> send("reset", new JSONObject(), false, null));
        button(root, 40307, "提前结束（保留耗时）", () -> send("end", new JSONObject(), false, null));
        button(root, 40308, "完成正计时", () -> send("finish", new JSONObject(), false, null));
        button(root, 40309, "开始休息", () -> send("break", new JSONObject(), false, null));
        TextView configTitle = new TextView(this); configTitle.setText("共享计时设置"); configTitle.setTextSize(20); root.addView(configTitle);
        modeChoice = new Button(this); modeChoice.setId(40311); modeChoice.setText("专注模式：倒计时");
        modeChoice.setOnClickListener(v -> { if (!busy) { draftMode = "countup".equals(draftMode) ? "countdown" : "countup"; configDirty = true; showDraftMode(); } }); root.addView(modeChoice);
        focusMinutes = minutesField(root, "专注分钟（1–180）");
        restMinutes = minutesField(root, "休息分钟（1–180）");
        focusMinutes.setId(40312); restMinutes.setId(40313);
        TextWatcher dirty = new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { if (!binding) configDirty = true; }
            @Override public void afterTextChanged(Editable value) {}
        };
        focusMinutes.addTextChangedListener(dirty); restMinutes.addTextChangedListener(dirty);
        button(root, 40310, "保存共享设置", this::saveConfiguration);
        TextView taskNote = new TextView(this); taskNote.setText("任务关联沿用网页中的选择，已结束历史保留当时的关联。"); root.addView(taskNote);
        history = new TextView(this); history.setId(40314); history.setTextSize(15); root.addView(history);
        Button back = new Button(this); back.setId(40315); back.setText("返回网页番茄钟"); back.setOnClickListener(v -> finish()); root.addView(back);
        setContentView(scroll);
        if (saved != null) {
            lastCompletionShown = saved.getString("lastCompletionShown", "");
            configDirty = saved.getBoolean("configDirty", false);
            if (configDirty) {
                binding = true;
                focusMinutes.setText(saved.getString("focusMinutes", "")); restMinutes.setText(saved.getString("restMinutes", ""));
                draftMode = saved.getString("draftMode", "countdown"); showDraftMode(); binding = false;
            }
        }
        controls();
    }

    private EditText minutesField(LinearLayout root, String label) {
        TextView title = new TextView(this); title.setText(label); root.addView(title);
        EditText field = new EditText(this); field.setInputType(InputType.TYPE_CLASS_NUMBER); field.setSingleLine(true); root.addView(field); return field;
    }
    private void button(LinearLayout root, int id, String label, Runnable action) {
        Button button = new Button(this); button.setId(id); button.setText(label);
        button.setOnClickListener(v -> { if (!busy && !uncertain && confirmed != null) action.run(); });
        commandButtons.add(button); root.addView(button);
    }
    private void refresh() {
        if (busy || reading) return;
        reading = true; controls();
        NativeTimerStore.request(this, "{\"op\":\"snapshot\"}", (value, error) -> runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            reading = false;
            if (error != null) { uncertain = true; status.setText("未确认计时状态：" + error); controls(); return; }
            accept(value); controls();
            if (resumed && value.optBoolean("completionPending"))
                send("claim-completion", new JSONObject(), false, null);
        }));
    }
    private void send(String action, JSONObject values, boolean clearDraft, Runnable afterSuccess) {
        if (busy || uncertain || confirmed == null) return;
        final JSONObject request;
        try {
            request = new JSONObject().put("op", "command").put("action", action).put("values", values)
                .put("commandId", "native:" + UUID.randomUUID()).put("expectedRevision", confirmed.getLong("revision"));
        } catch (Exception error) { status.setText("未发送：" + error.getMessage()); return; }
        busy = true; controls();
        NativeTimerStore.request(this, request.toString(), (value, error) -> runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            busy = false;
            if (error != null) {
                uncertain = true; status.setText("未保存：" + error); controls();
                // Read the result of the queue; never retry a mutation with a new command id.
                refresh(); return;
            }
            if (clearDraft) configDirty = false;
            accept(value); controls();
            String completion = value.optString("completionId");
            if (resumed && value.optBoolean("completionDelivered") && !completion.isEmpty() && !completion.equals(lastCompletionShown)) {
                lastCompletionShown = completion;
                Toast.makeText(this, "break".equals(value.optString("phase")) ? "休息计时完成" : "专注计时完成", Toast.LENGTH_LONG).show();
            }
            if (afterSuccess != null) afterSuccess.run();
        }));
    }
    private void saveConfiguration() {
        try {
            JSONObject values = new JSONObject().put("mode", draftMode)
                .put("durationMinutes", Integer.parseInt(focusMinutes.getText().toString()))
                .put("breakMinutes", Integer.parseInt(restMinutes.getText().toString())).put("taskId", confirmed.getString("taskId"));
            send("configure", values, true, null);
        } catch (Exception error) { status.setText("设置未保存：分钟请输入 1–180 的整数"); }
    }
    private void startOneMinuteValidation() {
        try {
            JSONObject values = new JSONObject().put("mode", "countdown").put("durationMinutes", 1)
                .put("breakMinutes", confirmed.getInt("breakMinutes")).put("taskId", confirmed.getString("taskId"));
            // Explicit validation changes the saved duration, then starts only after its successful receipt.
            send("configure", values, true, () -> send("start", new JSONObject(), false, null));
        } catch (Exception error) { status.setText("验证未发送：" + error.getMessage()); }
    }
    private void accept(JSONObject value) {
        if (confirmed != null && value.optLong("revision") < confirmed.optLong("revision")) { uncertain = true; return; }
        confirmed = value; uncertain = false;
        long millis = "countup".equals(value.optString("mode")) ? value.optLong("elapsedMillis") : value.optLong("remainingMillis");
        long seconds = millis / 1000;
        String state = value.optString("status"), label = "idle".equals(state) ? "已暂停 / 待开始" :
            "running".equals(state) ? "计时中" : "paused".equals(state) ? "已暂停" : "completed".equals(state) ? "已完成" : "提前结束";
        status.setText(String.format(Locale.ROOT, "%02d:%02d · %s\n%s · %s\n今日专注 %.1f 分钟 · 完成 %d 轮",
            seconds / 60, seconds % 60, label, "break".equals(value.optString("phase")) ? "休息" : "专注",
            "countup".equals(value.optString("mode")) ? "正计时" : "倒计时",
            value.optLong("focusedMillisToday") / 60000.0, value.optInt("completedSessionsToday")));
        if (!configDirty) {
            binding = true; draftMode = value.optString("focusMode", "countdown"); showDraftMode();
            focusMinutes.setText(Integer.toString(value.optInt("durationMinutes")));
            restMinutes.setText(Integer.toString(value.optInt("breakMinutes"))); binding = false;
        }
        JSONArray rows = value.optJSONArray("history");
        StringBuilder text = new StringBuilder("当前会话：").append(value.optString("sessionId", "")).append("\n最近计时记录（北京时间）\n");
        if (rows == null || rows.length() == 0) text.append("尚无已结束记录");
        else for (int i = 0; i < Math.min(rows.length(), 10); i++) {
            JSONObject row = rows.optJSONObject(i); if (row == null) continue;
            String finished;
            try { finished = java.time.Instant.parse(row.getString("finishedAt")).atZone(java.time.ZoneId.of("Asia/Shanghai")).toLocalDateTime().toString(); }
            catch (Exception invalid) { finished = row.optString("finishedAt"); }
            text.append("break".equals(row.optString("phase")) ? "休息" : "专注").append(" · ")
                .append("completed".equals(row.optString("outcome")) ? "已完成" : "提前结束").append(" · ")
                .append(row.optLong("elapsedMillis") / 1000).append(" 秒\n").append(finished).append("\n");
        }
        if (rows != null && rows.length() > 10) text.append("共 ").append(rows.length()).append(" 条；网页可查看完整记录。\n");
        if (!value.optString("taskId").isEmpty()) text.append("当前关联任务：").append(value.optString("taskId"));
        history.setText(text);
    }
    private void showDraftMode() { modeChoice.setText("专注模式：" + ("countup".equals(draftMode) ? "正计时" : "倒计时")); }
    private void controls() {
        boolean ready = confirmed != null && !busy && !uncertain;
        String state = confirmed == null ? "idle" : confirmed.optString("status");
        boolean active = "running".equals(state) || "paused".equals(state);
        for (Button button : commandButtons) {
            boolean allowed = true;
            switch (button.getId()) {
                case 40302: case 40303: case 40309: allowed = !active; break;
                case 40304: allowed = "running".equals(state); break;
                case 40305: allowed = "paused".equals(state); break;
                case 40307: allowed = active; break;
                case 40308: allowed = active && confirmed != null && "countup".equals(confirmed.optString("mode")); break;
                default: break;
            }
            button.setEnabled(ready && allowed);
        }
        if (modeChoice != null) modeChoice.setEnabled(!busy);
        if (focusMinutes != null) focusMinutes.setEnabled(!busy);
        if (restMinutes != null) restMinutes.setEnabled(!busy);
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        out.putString("lastCompletionShown", lastCompletionShown); out.putBoolean("configDirty", configDirty);
        out.putString("focusMinutes", focusMinutes.getText().toString()); out.putString("restMinutes", restMinutes.getText().toString());
        out.putString("draftMode", draftMode); super.onSaveInstanceState(out);
    }
    @Override protected void onResume() { super.onResume(); resumed = true; handler.post(poll); }
    @Override protected void onPause() { resumed = false; handler.removeCallbacks(poll); super.onPause(); }
}
