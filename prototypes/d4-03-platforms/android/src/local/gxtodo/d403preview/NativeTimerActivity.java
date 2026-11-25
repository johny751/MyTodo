package local.gxtodo.d403preview;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;

/** Actual native controls, with an independent timer state; not the production service. */
public final class NativeTimerActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView status;
    private boolean resumed;
    private final Runnable poll = new Runnable() {
        @Override public void run() { if (resumed) { command("{\"op\":\"poll\"}"); handler.postDelayed(this, 1000); } }
    };
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(28, 32, 28, 20);
        TextView title = new TextView(this); title.setText("原生番茄钟 · 隔离体验"); title.setTextSize(24); root.addView(title);
        TextView note = new TextView(this);
        note.setText("复用原 PomodoroClock；Android elapsedRealtime 计时。\n此状态独立于网页番茄钟。未接入生产后台通知、任务数据库或同步。");
        root.addView(note);
        status = new TextView(this); status.setId(40301); status.setTextSize(28); root.addView(status);
        button(root, 40302, "开始 25 分钟", "{\"op\":\"start\",\"minutes\":25}");
        button(root, 40303, "开始 1 分钟验证", "{\"op\":\"start\",\"minutes\":1}");
        button(root, 40304, "暂停", "{\"op\":\"pause\"}");
        button(root, 40305, "继续", "{\"op\":\"resume\"}");
        button(root, 40306, "提前结束 / 重置", "{\"op\":\"reset\"}");
        Button back = new Button(this); back.setText("返回四象限"); back.setOnClickListener(v -> finish()); root.addView(back);
        setContentView(root);
    }
    private void button(LinearLayout root, int id, String label, String json) {
        Button button = new Button(this); button.setId(id); button.setText(label); button.setOnClickListener(v -> command(json)); root.addView(button);
    }
    private void command(String json) {
        NativeTimerStore.request(this, json, (value, error) -> runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            if (error != null) { status.setText("未保存：" + error); return; }
            long remaining = value.optLong("remainingMillis") / 1000;
            status.setText(String.format(java.util.Locale.ROOT, "%02d:%02d\n%s\n今日专注 %.1f 分钟",
                remaining / 60, remaining % 60, value.optBoolean("completed") ? "已完成" : value.optBoolean("running") ? "计时中" : "已暂停 / 待开始",
                value.optLong("focusedMillisToday") / 60000.0));
            if (value.optBoolean("completionDelivered")) Toast.makeText(this, "本次隔离计时完成", Toast.LENGTH_LONG).show();
        }));
    }
    @Override protected void onResume() { super.onResume(); resumed = true; handler.post(poll); }
    @Override protected void onPause() { resumed = false; handler.removeCallbacks(poll); super.onPause(); }
}
