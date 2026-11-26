package local.gxtodo.replica;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import local.gxtodo.d403preview.NativeTimerStore;
import org.json.JSONObject;

/** Native service presentation over the accepted single durable timer authority. */
final class D405TimerCompanion implements NativeIntegration.Companion {
    static volatile D405TimerCompanion active;
    static final String STATUS = "d405-focus-status", COMPLETE = "d405-focus-completed";
    static final int STATUS_ID = 8501, COMPLETE_ID = 8502, DEADLINE_ID = 8503;
    final Service service;
    final Handler main = new Handler(Looper.getMainLooper());
    boolean closed, loading;
    JSONObject current;
    D405TimerCompanion(Service owner) {
        service = owner; active = this; channels(owner);
        Notification first = new Notification.Builder(owner, STATUS).setSmallIcon(icon(owner))
            .setContentTitle("MyTodo 番茄钟").setContentText("正在恢复已保存计时")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) owner.startForeground(STATUS_ID, first, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else owner.startForeground(STATUS_ID, first);
        main.post(tick);
    }
    @Override public int start(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("timerCommand")) {
            final String request = intent.getStringExtra("timerCommand");
            NativeTimerStore.request(service, request, (value, error) -> main.post(() -> {
                if (error != null) android.util.Log.w("D405Timer", "notification-command-rejected: " + error);
                command("refresh");
            }));
        } else command("refresh");
        return Service.START_STICKY;
    }
    @Override public boolean isClosed() { return closed; }
    void command(String ignored) { if (!closed) { main.removeCallbacks(tick); main.post(tick); } }
    final Runnable tick = new Runnable() {
        @Override public void run() {
            if (closed || loading) return;
            loading = true;
            NativeTimerStore.request(service, "{\"op\":\"snapshot\"}", (value, error) -> main.post(() -> {
                loading = false;
                if (closed) return;
                if (error != null) {
                    manager(service).notify(STATUS_ID, new Notification.Builder(service, STATUS).setSmallIcon(icon(service))
                        .setContentTitle("计时状态未能确认").setContentText("已保留原数据，请返回应用重试")
                        .setVisibility(Notification.VISIBILITY_PRIVATE).setOngoing(true).build());
                    main.postDelayed(tick, 5000); return;
                }
                current = value;
                schedule(service, value);
                deliver(service, value, () -> {});
                boolean sessionActive = "running".equals(value.optString("status")) || "paused".equals(value.optString("status"));
                if (!sessionActive) {
                    // Retire this controller before asynchronous Service destruction. A new start must not enqueue on it.
                    close(); service.stopForeground(Service.STOP_FOREGROUND_REMOVE); service.stopSelf(); return;
                }
                manager(service).notify(STATUS_ID, notification(value));
                main.postDelayed(tick, value.optBoolean("running") ? 1000 : 10000);
            }));
        }
    };
    Notification notification(JSONObject state) {
        boolean running = state.optBoolean("running"), up = "countup".equals(state.optString("mode"));
        String text = ("break".equals(state.optString("phase")) ? "休息" : "专注") + " · "
            + (running ? "" : "已暂停 · ") + AndroidCompanionService.clockText(state.optLong(up ? "elapsedMillis" : "remainingMillis"));
        Notification.Builder builder = new Notification.Builder(service, STATUS).setSmallIcon(icon(service))
            .setContentTitle("MyTodo 番茄钟").setContentText(text).setOngoing(true).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(open(service)).setShowWhen(false);
        String oldCommand = NotificationTimerControls.command(true, running, false);
        try {
            String action = running ? "pause" : "resume";
            JSONObject command = new JSONObject().put("op", "command").put("action", action).put("values", new JSONObject())
                .put("commandId", "notice:" + state.getString("sessionId") + ":" + state.getLong("revision") + ":" + action)
                .put("expectedRevision", state.getLong("revision"));
            Intent intent = new Intent(service, AndroidCompanionService.class).putExtra("timerCommand", command.toString())
                .setData(Uri.parse("mytodo-d405://timer/" + Uri.encode(command.getString("commandId"))));
            PendingIntent click = PendingIntent.getForegroundService(service, running ? 8510 : 8511, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(icon(service), NotificationTimerControls.label(oldCommand), click);
        } catch (Exception failure) { throw new IllegalStateException(failure); }
        return builder.build();
    }
    static void channels(Context context) {
        NotificationChannel status = new NotificationChannel(STATUS, "番茄钟后台计时", NotificationManager.IMPORTANCE_LOW);
        status.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE); status.setShowBadge(false);
        manager(context).createNotificationChannel(status);
        NotificationChannel complete = new NotificationChannel(COMPLETE, "番茄钟完成", NotificationManager.IMPORTANCE_HIGH);
        complete.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager(context).createNotificationChannel(complete);
    }
    static NotificationManager manager(Context c) { return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); }
    static int icon(Context c) { return c.getResources().getIdentifier("ic_notification", "drawable", c.getPackageName()); }
    static PendingIntent open(Context c) {
        Intent intent = new Intent(c, D405Activity.class).putExtra("nativeRoute", "pomodoro")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 8504, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static PendingIntent alarm(Context c) {
        return PendingIntent.getBroadcast(c, DEADLINE_ID,
            new Intent(c, CompanionAlarmReceiver.class).setAction("local.gxtodo.d405.TIMER_DEADLINE"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void schedule(Context c, JSONObject state) {
        AlarmManager alarms = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(alarm(c));
        if (!state.optBoolean("running") || !"countdown".equals(state.optString("mode"))) return;
        long deadline = SystemClock.elapsedRealtime() + Math.max(1, state.optLong("remainingMillis"));
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, alarm(c)); return; }
            catch (SecurityException revoked) { android.util.Log.w("D405Timer", "exact-alarm-permission-revoked"); }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, alarm(c));
    }
    static void wake(Context context, Runnable finished) {
        Context app = context.getApplicationContext();
        NativeTimerStore.request(app, "{\"op\":\"snapshot\"}", (state, error) -> {
            if (error != null) { android.util.Log.e("D405Timer", error); finished.run(); return; }
            schedule(app, state); deliver(app, state, finished);
        });
    }
    static void deliver(Context c, JSONObject state, Runnable finished) {
        if (!state.optBoolean("completionPending")) { finished.run(); return; }
        channels(c);
        NotificationChannel channel = manager(c).getNotificationChannel(COMPLETE);
        if (!manager(c).areNotificationsEnabled() || channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
            // No claim when delivery is blocked: retry after the owner grants notification access.
            finished.run(); return;
        }
        try {
            String session = state.getString("sessionId");
            // Stable notification identity tolerates death between notify and durable claim.
            manager(c).notify(session, COMPLETE_ID, new Notification.Builder(c, COMPLETE).setSmallIcon(icon(c))
                .setContentTitle("break".equals(state.optString("phase")) ? "休息计时完成" : "专注计时完成")
                .setContentText("点击返回番茄钟").setContentIntent(open(c)).setAutoCancel(true).setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_ALARM).build());
            JSONObject claim = new JSONObject().put("op", "command").put("action", "claim-completion").put("values", new JSONObject())
                .put("commandId", "notice-complete:" + session + ":" + state.getLong("revision"))
                .put("expectedRevision", state.getLong("revision"));
            NativeTimerStore.request(c, claim.toString(), (value, error) -> {
                if (error != null) android.util.Log.w("D405Timer", "completion-claim-not-confirmed: " + error);
                finished.run();
            });
        } catch (Exception failure) { android.util.Log.e("D405Timer", "completion-delivery-failed", failure); finished.run(); }
    }
    @Override public void close() { closed = true; main.removeCallbacksAndMessages(null); if (active == this) active = null; }
}
