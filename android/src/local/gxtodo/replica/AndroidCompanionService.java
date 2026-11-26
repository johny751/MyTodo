package local.gxtodo.replica;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.widget.RemoteViews;
import android.view.View;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class AndroidCompanionService extends Service {
    static final String CHANNEL = "daily-task-status", TIMER_CHANNEL = "focus-completed";
    static final int STATUS_ID = 8401, COMPLETE_ID = 8402;
    private static volatile AndroidCompanionService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService reader = Executors.newSingleThreadExecutor();
    private FloatingBallController floating;
    private PomodoroTimer timer;
    private NativeIntegration.Companion integrated;
    private JSONObject summary = new JSONObject();
    private boolean summaryBusy, destroyed;
    private long summaryAt, nextNoticeAt, summaryGeneration;
    private String summaryDay = "";

    private static boolean needed(Context context) {
        SharedPreferences p = context.getSharedPreferences("android-tools", MODE_PRIVATE);
        PomodoroTimer timer = PomodoroTimer.get(context);
        return NotificationTimerControls.shouldKeepService(p.getBoolean("statusEnabled", true),
            p.getBoolean("ballEnabled", false), timer.hasActiveSession(), timer.hasPendingCompletion());
    }
    public static void refresh(Context context) { command(context, "refresh"); }
    public static void command(Context context, String command) {
        if (NativeIntegration.enabled(context)) { NativeIntegration.adapter(context).command(context, command); return; }
        AndroidCompanionService active = instance;
        if (active != null && !active.destroyed) {
            active.handler.post(() -> active.handle(command));
            return;
        }
        if ("refresh".equals(command) && !needed(context)) return;
        Intent intent = new Intent(context, AndroidCompanionService.class).putExtra("command", command);
        try {
            context.startForegroundService(intent);
        } catch (RuntimeException error) {
            android.util.Log.w("GxTodoTools", "Cannot start companion from this context", error);
            if (context instanceof Activity)
                Toast.makeText(context, "请重新打开应用启用通知栏或悬浮球", Toast.LENGTH_LONG).show();
        }
    }
    @Override public void onCreate() {
        super.onCreate();
        if (NativeIntegration.enabled(this)) { integrated = NativeIntegration.adapter(this).create(this); return; }
        instance = this;
        timer = PomodoroTimer.get(this);
        channels();
        Notification first = notification();
        if (Build.VERSION.SDK_INT >= 34)
            startForeground(STATUS_ID, first, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(STATUS_ID, first);
        floating = new FloatingBallController(this);
        handler.post(ticker);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (integrated != null) {
            if (integrated.isClosed()) integrated = NativeIntegration.adapter(this).create(this);
            return integrated.start(intent, flags, startId);
        }
        handle(intent == null ? "refresh" : intent.getStringExtra("command"));
        return START_STICKY;
    }
    private void handle(String command) {
        if (destroyed) return;
        if (command == null) command = "refresh";
        try {
            switch (command) {
                case "timer-countdown": timer.startCountdown(timer.durationMinutes()); manager().cancel(COMPLETE_ID); break;
                case "timer-countup": timer.startCountup(); manager().cancel(COMPLETE_ID); break;
                case "timer-pause": if (timer.hasActiveSession()) timer.pause(); break;
                case "timer-resume": if (timer.hasActiveSession()) timer.resume(); break;
                case "timer-reset": timer.reset(); manager().cancel(COMPLETE_ID); break;
                case "toggle-ball":
                    SharedPreferences p = getSharedPreferences("android-tools", MODE_PRIVATE);
                    boolean enable = !p.getBoolean("ballEnabled", false);
                    if (enable && !Settings.canDrawOverlays(this)) {
                        Toast.makeText(this, "请在设置中允许显示在其他应用上层", Toast.LENGTH_LONG).show();
                        enable = false;
                    }
                    p.edit().putBoolean("ballEnabled", enable).apply();
                    break;
                default: break;
            }
            if (floating != null) floating.sync();
            updateDeadline();
            summaryGeneration++;
            summaryAt = 0;
            nextNoticeAt = 0;
            handler.removeCallbacks(ticker);
            handler.post(ticker);
        } catch (RuntimeException error) {
            android.util.Log.e("GxTodoTools", "Companion action failed", error);
            Toast.makeText(this, "操作未完成，请检查权限和可用空间", Toast.LENGTH_LONG).show();
        }
    }
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (destroyed) return;
            try {
                if (timer.tick()) {
                    manager().notify(COMPLETE_ID, completedNotification());
                    updateDeadline();
                }
                long now = SystemClock.elapsedRealtime();
                String day = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
                if (getSharedPreferences("android-tools", MODE_PRIVATE).getBoolean("statusEnabled", true)
                    && !summaryBusy && (summaryAt == 0 || now - summaryAt >= 60000 || !day.equals(summaryDay)))
                    readSummary(day);
                if (!needed(AndroidCompanionService.this)) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                    stopSelf();
                    return;
                }
                if (now >= nextNoticeAt) {
                    manager().notify(STATUS_ID, notification());
                    nextNoticeAt = now + (timer.snapshot().optBoolean("running") ? 1000 : 10000);
                }
                handler.postDelayed(this, timer.snapshot().optBoolean("running") ? 1000 : 10000);
            } catch (RuntimeException error) {
                android.util.Log.e("GxTodoTools", "Cannot update companion", error);
                handler.postDelayed(this, 5000);
            }
        }
    };
    private void readSummary(String day) {
        summaryBusy = true;
        final long generation = summaryGeneration;
        reader.execute(() -> {
            JSONObject loaded = DailyTaskSummary.load(this);
            handler.post(() -> {
                summaryBusy = false;
                if (destroyed) return;
                if (generation == summaryGeneration) {
                    summary = loaded;
                    summaryAt = SystemClock.elapsedRealtime();
                    summaryDay = day;
                    nextNoticeAt = 0;
                }
                handler.removeCallbacks(ticker);
                handler.post(ticker);
            });
        });
    }
    private NotificationManager manager() { return (NotificationManager)getSystemService(NOTIFICATION_SERVICE); }
    private int id(String name) { return getResources().getIdentifier(name, "id", getPackageName()); }
    private int layout(String name) { return getResources().getIdentifier(name, "layout", getPackageName()); }
    private int icon() { return getResources().getIdentifier("ic_notification", "drawable", getPackageName()); }
    private void channels() {
        NotificationChannel status = new NotificationChannel(CHANNEL, "当日待办状态条", NotificationManager.IMPORTANCE_LOW);
        status.setDescription("待办、当日完成、快速添加、悬浮球和番茄钟");
        status.setShowBadge(false);
        manager().createNotificationChannel(status);
        NotificationChannel completed = new NotificationChannel(TIMER_CHANNEL, "番茄钟完成", NotificationManager.IMPORTANCE_HIGH);
        completed.setDescription("倒计时结束时提醒");
        completed.enableVibration(true);
        manager().createNotificationChannel(completed);
    }
    private PendingIntent taskIntent(String action, int request) {
        Intent intent = new Intent(this, MainActivity.class).putExtra("toolAction", action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .setData(Uri.parse("gxtodo://tools/" + action));
        return PendingIntent.getActivity(this, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private PendingIntent toolsIntent(String section, int request) {
        Intent intent = new Intent(this, AndroidToolsActivity.class).putExtra("section", section)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("gxtodo://tools/settings/" + section));
        return PendingIntent.getActivity(this, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private PendingIntent toggleIntent() {
        if (!Settings.canDrawOverlays(this)) return toolsIntent("settings", 7);
        Intent intent = new Intent(this, AndroidCompanionService.class).putExtra("command", "toggle-ball");
        return PendingIntent.getService(this, 6, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private PendingIntent timerIntent(String command) {
        Intent intent = new Intent(this, AndroidCompanionService.class).putExtra("command", command)
            .setAction("local.gxtodo.tools." + command)
            .setData(Uri.parse("gxtodo://tools/timer-command/" + command));
        int request = "timer-pause".equals(command) ? 8410 : 8411;
        return PendingIntent.getForegroundService(this, request, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static String timerCommand(JSONObject state) {
        return NotificationTimerControls.command(state.optBoolean("sessionActive"),
            state.optBoolean("running"), state.optBoolean("completed"));
    }
    private static String taskCaption(JSONObject state) {
        JSONObject task = state.optJSONObject("task");
        return task == null ? "" : NotificationTimerControls.taskCaption(task.optString("title"),
            task.optString("accountName"));
    }
    private RemoteViews strip(String name, JSONObject state) {
        RemoteViews views = new RemoteViews(getPackageName(), layout(name));
        boolean expanded = "notification_status_expanded".equals(name);
        boolean available = !summary.has("error");
        views.setTextViewText(id("pending_count"), available ? (expanded ? "当日待办 " : "待办 ") + summary.optInt("pending") : "待办读取失败");
        views.setTextViewText(id("done_count"), available ? (expanded ? "当日完成 " : "完成 ") + summary.optInt("completed") : "点击打开应用");
        views.setOnClickPendingIntent(id("pending_count"), taskIntent("today", 1));
        views.setOnClickPendingIntent(id("done_count"), taskIntent("done", 2));
        views.setOnClickPendingIntent(id("add_task"), taskIntent("add", 3));
        views.setOnClickPendingIntent(id("toggle_ball"), toggleIntent());
        boolean ball = getSharedPreferences("android-tools", MODE_PRIVATE).getBoolean("ballEnabled", false);
        views.setTextViewText(id("toggle_ball"), ball ? "O 隐藏" : "O 显示");
        PendingIntent openTimer = toolsIntent("timer", 4);
        views.setOnClickPendingIntent(id("open_timer"), openTimer);
        if (!expanded) views.setOnClickPendingIntent(id("open_timer_area"), openTimer);
        boolean sessionActive = state.optBoolean("sessionActive");
        boolean countup = "countup".equals(state.optString("mode"));
        long millis = state.optLong(countup ? "elapsedMillis" : "remainingMillis");
        views.setTextViewText(id("open_timer"), sessionActive
            ? (expanded ? (countup ? "正计时\n" : "倒计时\n") : "◷ ") + clockText(millis) : "番茄钟");
        String association = taskCaption(state);
        JSONObject task = state.optJSONObject("task");
        views.setViewVisibility(id("task_title"), association.isEmpty() ? View.GONE : View.VISIBLE);
        if (!association.isEmpty()) {
            views.setTextViewText(id("task_title"), expanded ? "关联待办 · " + association : task.optString("title"));
            views.setContentDescription(id("task_title"), "关联待办 " + association);
            views.setOnClickPendingIntent(id("task_title"), openTimer);
        }
        String command = timerCommand(state);
        views.setViewVisibility(id("timer_control"), command == null ? View.GONE : View.VISIBLE);
        if (command != null) {
            String label = NotificationTimerControls.label(command);
            views.setTextViewText(id("timer_control"), label);
            views.setContentDescription(id("timer_control"), label + "计时" + (association.isEmpty() ? "" : "，" + association));
            views.setOnClickPendingIntent(id("timer_control"), timerIntent(command));
        }
        if (expanded) {
            views.setTextViewText(id("status_detail"), "逾期待办 " + summary.optInt("overdue") + " · "
                + (state.optBoolean("completed") ? "专注已完成" : state.optBoolean("running") ? "正在专注" : sessionActive ? "计时已暂停" : "准备专注")
                + " · 今日 " + state.optInt("completedSessionsToday") + " 个番茄");
            views.setOnClickPendingIntent(id("tool_settings"), toolsIntent("settings", 5));
        }
        return views;
    }
    static String clockText(long millis) {
        long seconds = Math.max(0, millis + 999) / 1000;
        long hours = seconds / 3600;
        return hours > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", hours, seconds / 60 % 60, seconds % 60)
            : String.format(java.util.Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }
    private Notification notification() {
        JSONObject state = timer.snapshot();
        String association = taskCaption(state);
        boolean sessionActive = state.optBoolean("sessionActive");
        if (!getSharedPreferences("android-tools", MODE_PRIVATE).getBoolean("statusEnabled", true)) {
            boolean running = state.optBoolean("running");
            boolean countup = "countup".equals(state.optString("mode"));
            String detail = sessionActive ? (running ? "" : "已暂停 · ") + (countup ? "正计时 " : "倒计时 ")
                + clockText(state.optLong(countup ? "elapsedMillis" : "remainingMillis")) : "悬浮球正在运行";
            Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(icon())
                .setContentTitle(association.isEmpty() ? "GxTodo 后台工具" : "专注 · " + association).setContentText(detail)
                .setContentIntent(toolsIntent(sessionActive ? "timer" : "settings", 4))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_SERVICE);
            String command = timerCommand(state);
            if (command != null) builder.addAction(icon(), NotificationTimerControls.label(command), timerIntent(command));
            return buildNotice(this, builder, state, false);
        }
        Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(icon())
            .setContentTitle("当日待办 · " + summary.optString("accountName", "当前账号"))
            .setContentText("待办 " + summary.optInt("pending") + " · 当日完成 " + summary.optInt("completed"))
            .setContentIntent(taskIntent("today", 1)).setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_SERVICE)
            .setStyle(new Notification.DecoratedCustomViewStyle())
            .setCustomContentView(strip("notification_status", state))
            .setCustomBigContentView(strip("notification_status_expanded", state));
        return buildNotice(this, builder, state, false);
    }
    /** Single builder hook for standard, custom and completion notices, including alarm delivery. */
    private static Notification buildNotice(Context context, Notification.Builder builder, JSONObject state, boolean completed) {
        return builder.build();
    }
    private Notification completedNotification() { return completionNotice(this, timer); }
    private static Notification completionNotice(Context context, PomodoroTimer timer) {
        Intent intent = new Intent(context, AndroidToolsActivity.class).putExtra("section", "timer")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(Uri.parse("gxtodo://tools/settings/timer"));
        PendingIntent open = PendingIntent.getActivity(context, 4, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int smallIcon = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        JSONObject state = timer.snapshot();
        String association = taskCaption(state);
        String detail = "已专注 " + timer.durationMinutes() + " 分钟，休息一下吧";
        Notification.Builder builder = new Notification.Builder(context, TIMER_CHANNEL).setSmallIcon(smallIcon)
            .setContentTitle(association.isEmpty() ? "番茄钟完成" : "番茄钟完成 · " + association).setContentText(detail)
            .setContentIntent(open).setAutoCancel(true)
            .setStyle(new Notification.BigTextStyle().bigText(detail + (association.isEmpty() ? "" : "\n关联待办：" + association)))
            .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PRIVATE);
        return buildNotice(context, builder, state, true);
    }
    /** Deliver deadlines without requiring a background foreground-service launch exemption. */
    static void wake(Context context) {
        AndroidCompanionService active = instance;
        if (active != null && !active.destroyed) { command(context, "timer-wake"); return; }
        try {
            PomodoroTimer timer = PomodoroTimer.get(context);
            if (timer.tick()) {
                NotificationManager manager = (NotificationManager)context.getSystemService(NOTIFICATION_SERVICE);
                NotificationChannel channel = new NotificationChannel(TIMER_CHANNEL, "番茄钟完成", NotificationManager.IMPORTANCE_HIGH);
                channel.enableVibration(true);
                manager.createNotificationChannel(channel);
                manager.notify(COMPLETE_ID, completionNotice(context, timer));
            }
            refresh(context);
        } catch (RuntimeException error) {
            android.util.Log.e("GxTodoTools", "Cannot deliver countdown deadline", error);
        }
    }
    private PendingIntent deadlineIntent() {
        return PendingIntent.getBroadcast(this, 8403,
            new Intent(this, CompanionAlarmReceiver.class).setAction("local.gxtodo.TIMER_DEADLINE"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private void updateDeadline() {
        AlarmManager alarms = (AlarmManager)getSystemService(ALARM_SERVICE);
        alarms.cancel(deadlineIntent());
        JSONObject state = timer.snapshot();
        if (!state.optBoolean("running") || !"countdown".equals(state.optString("mode"))) return;
        long at = SystemClock.elapsedRealtime() + Math.max(1, state.optLong("remainingMillis"));
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, deadlineIntent()); return; }
            catch (SecurityException revokedDuringScheduling) { /* Fall back after permission revocation. */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, deadlineIntent());
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        if (integrated != null) integrated.close();
        destroyed = true;
        if (instance == this) instance = null;
        handler.removeCallbacksAndMessages(null);
        reader.shutdownNow();
        if (floating != null) floating.destroy();
        super.onDestroy();
    }
}
