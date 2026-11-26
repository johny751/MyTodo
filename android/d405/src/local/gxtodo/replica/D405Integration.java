package local.gxtodo.replica;

import android.app.Activity;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import local.gxtodo.d403preview.NativeTimerStore;
import org.json.JSONObject;

/** Explicit isolated profile; the old PomodoroTimer is never opened here. */
public final class D405Integration implements NativeIntegration.Adapter {
    static final Handler MAIN = new Handler(Looper.getMainLooper());
    @Override public void open(Activity activity) {
        Intent intent = new Intent(activity, D405Activity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (activity.getIntent() != null && activity.getIntent().hasExtra("taskId"))
            intent.putExtra("taskId", activity.getIntent().getStringExtra("taskId"));
        activity.startActivity(intent);
        activity.finish();
    }
    @Override public void command(Context context, String command) {
        if (!NativeIntegration.enabled(context)) throw new SecurityException("D4-05 identity required");
        Context app = context.getApplicationContext();
        MAIN.post(() -> refreshOnMain(app, command));
    }
    private static void refreshOnMain(Context context, String command) {
        D405TimerCompanion current = D405TimerCompanion.active;
        if (current != null && !current.closed) { current.command(command); return; }
        // A refresh does not start an idle foreground service or initialize the legacy timer.
        NativeTimerStore.request(context, "{\"op\":\"snapshot\"}", (state, error) -> {
            if (error != null) { android.util.Log.e("D405Timer", error); return; }
            if (!state.optBoolean("running") && !"paused".equals(state.optString("status")) && !state.optBoolean("completionPending")) return;
            MAIN.post(() -> {
                D405TimerCompanion available = D405TimerCompanion.active;
                if (available != null && !available.closed) { available.command(command); return; }
                try { context.startForegroundService(new Intent(context, AndroidCompanionService.class).putExtra("command", command)); }
                catch (RuntimeException denied) { android.util.Log.e("D405Timer", "service-start-denied", denied); }
            });
        });
    }
    @Override public NativeIntegration.Companion create(Service service) { return new D405TimerCompanion(service); }
    @Override public void execute(Runnable operation) { D405Bridge.IO.execute(operation); }
    @Override public void wake(Context context, Runnable finished) {
        D405TimerCompanion.wake(context, finished);
    }
    /** Called only by the generated D4-05 store after a successfully durable mutation. */
    public static void timerChanged(Context context, JSONObject state) {
        new D405Integration().command(context.getApplicationContext(), "refresh");
    }
}
