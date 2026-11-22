package local.gxtodo.replica;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.Map;

/** Device-local, process-independent timer shared by the native bridge and service. */
public final class PomodoroTimer {
    private static final String STATE_KEY = "timer.state";
    private static PomodoroTimer instance;
    private final SharedPreferences preferences;
    private final PomodoroClock clock;
    private String lastPersisted;
    private long lastPersistedAt;
    private String lastControlState;
    private JSONObject task;
    private boolean sessionActive;

    public static synchronized PomodoroTimer get(Context context) {
        if (instance == null) instance = new PomodoroTimer(context.getApplicationContext());
        return instance;
    }

    private PomodoroTimer(Context context) {
        preferences = context.getSharedPreferences("android-tools", Context.MODE_PRIVATE);
        String saved = preferences.getString(STATE_KEY, null);
        JSONObject savedJson = parseState(saved);
        task = savedJson == null ? null : savedJson.optJSONObject("task");
        final String bootId = readBootId(context);
        clock = new PomodoroClock(new PomodoroClock.TimeSource() {
            @Override public PomodoroClock.Time now() {
                return new PomodoroClock.Time(System.currentTimeMillis(),
                    SystemClock.elapsedRealtime(), bootId);
            }
        }, restore(saved));
        PomodoroClock.Snapshot restored = clock.snapshot(); // Keep completion pending.
        sessionActive = !restored.completed && (savedJson != null && savedJson.has("sessionActive")
            ? savedJson.optBoolean("sessionActive") : restored.running || restored.elapsedMillis > 0);
        persist();
    }

    public synchronized void startCountdown(int minutes) {
        clock.startCountdown(minutes);
        sessionActive = true;
        persist();
    }

    public synchronized void startCountup() {
        clock.startCountup();
        sessionActive = true;
        persist();
    }

    public synchronized void pause() {
        clock.pause();
        persist();
    }

    public synchronized void resume() {
        clock.resume();
        if (clock.save().running) sessionActive = true;
        persist();
    }

    public synchronized void reset() {
        clock.reset();
        sessionActive = false;
        persist();
    }

    public synchronized void setDurationMinutes(int minutes) {
        clock.setDurationMinutes(minutes);
        persist();
    }

    /** Accept only a resolved task link; the selection helper validates ownership atomically. */
    public synchronized void setTask(JSONObject link) {
        try {
            if (link == null || link == JSONObject.NULL) {
                task = null;
            } else {
                String accountId = link.getString("accountId");
                String id = link.getString("id");
                if (!AccountStore.valid(accountId) || id.isEmpty()) {
                    throw new IllegalArgumentException("关联任务标识无效");
                }
                task = new JSONObject().put("accountId", accountId).put("id", id)
                    .put("accountName", link.optString("accountName", "关联账号"))
                    .put("title", link.optString("title", "未命名任务"))
                    .put("done", link.optBoolean("done"));
            }
            persist();
        } catch (JSONException error) {
            throw new IllegalArgumentException("关联任务格式无效", error);
        }
    }

    /** A picker from a previous account, or a task deleted while picking, cannot be committed. */
    public static void setTaskFromSelection(Context context, String accountId, String taskId) throws Exception {
        AccountStore store = AccountStore.get(context);
        synchronized (store) {
            if (!store.active().equals(accountId)) {
                throw new IllegalStateException("账号已切换，请重新选择关联任务");
            }
            ReplicaDatabase database = store.database(accountId);
            synchronized (database) {
            JSONObject link = taskId == null || taskId.isEmpty()
                ? null : PomodoroTasks.resolve(context, accountId, taskId);
            if (taskId != null && !taskId.isEmpty() && link == null) {
                throw new IllegalStateException("该任务已删除，请重新选择");
            }
            PomodoroTimer.get(context).setTask(link);
            }
        }
    }

    public synchronized boolean hasActiveSession() {
        clock.snapshot();
        persist(false);
        return sessionActive;
    }

    public synchronized int durationMinutes() {
        return clock.durationMinutes();
    }

    public synchronized JSONObject snapshot() {
        PomodoroClock.Snapshot value = clock.snapshot();
        persist(false);
        try {
            return new JSONObject()
                .put("mode", value.mode)
                .put("running", value.running)
                .put("completed", value.completed)
                .put("sessionActive", sessionActive)
                .put("task", task == null ? JSONObject.NULL : new JSONObject(task.toString()))
                .put("durationMinutes", value.durationMinutes)
                .put("elapsedMillis", value.elapsedMillis)
                .put("remainingMillis", value.remainingMillis)
                .put("completedSessionsToday", value.completedSessionsToday)
                .put("focusedMillisToday", value.focusedMillisToday);
        } catch (JSONException error) {
            throw new IllegalStateException("无法读取番茄钟状态", error);
        }
    }

    public synchronized boolean tick() {
        boolean completed = clock.tick();
        persist(completed);
        return completed;
    }

    public synchronized boolean hasPendingCompletion() { return clock.save().completionPending; }

    private static String readBootId(Context context) {
        try {
            int bootCount = Settings.Global.getInt(context.getContentResolver(),
                Settings.Global.BOOT_COUNT, -1);
            return bootCount >= 0 ? Integer.toString(bootCount) : "";
        } catch (RuntimeException unavailable) {
            // Old/vendor devices can still detect a reboot when elapsedRealtime decreases.
            return "";
        }
    }

    private static JSONObject parseState(String text) {
        if (text == null) return null;
        try {
            JSONObject json = new JSONObject(text);
            int version = json.optInt("version", 0);
            return version == 1 || version == 2 ? json : null;
        } catch (JSONException invalidState) {
            return null;
        }
    }

    private static PomodoroClock.State restore(String text) {
        if (text == null) return null;
            JSONObject json = parseState(text);
            if (json == null) return null;
            PomodoroClock.State state = new PomodoroClock.State();
            state.mode = json.optString("mode", "countdown");
            state.running = json.optBoolean("running");
            state.completed = json.optBoolean("completed");
            state.completionPending = json.optBoolean("completionPending");
            state.durationMinutes = json.optInt("durationMinutes", PomodoroClock.DEFAULT_MINUTES);
            state.elapsedMillis = json.optLong("elapsedMillis");
            state.lastElapsedRealtimeMillis = json.optLong("lastElapsedRealtimeMillis");
            state.lastWallMillis = json.optLong("lastWallMillis");
            state.bootId = json.optString("bootId", "");
            JSONObject focused = json.optJSONObject("focusedMillisByDay");
            if (focused != null) {
                Iterator<String> keys = focused.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    try {
                        state.focusedMillisByDay.put(Long.parseLong(key), Math.max(0, focused.optLong(key)));
                    } catch (NumberFormatException ignored) {}
                }
            }
            JSONObject sessions = json.optJSONObject("completedSessionsByDay");
            if (sessions != null) {
                Iterator<String> keys = sessions.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    try {
                        state.completedSessionsByDay.put(Long.parseLong(key), Math.max(0, sessions.optInt(key)));
                    } catch (NumberFormatException ignored) {}
                }
            }
            return state;
    }

    private void persist() { persist(true); }
    private void persist(boolean force) {
        PomodoroClock.State state = clock.save();
        if (state.completed) sessionActive = false;
        String controls = state.mode + "|" + state.running + "|" + state.completed + "|"
            + state.completionPending + "|" + state.durationMinutes + "|" + (state.running ? 0 : state.elapsedMillis)
            + "|" + sessionActive + "|" + (task == null ? "" : task.toString());
        long now = SystemClock.elapsedRealtime();
        if (!force && controls.equals(lastControlState)
                && (!state.running || now - lastPersistedAt < 10000)) return;
        try {
            JSONObject focused = new JSONObject();
            for (Map.Entry<Long, Long> entry : state.focusedMillisByDay.entrySet()) {
                focused.put(Long.toString(entry.getKey()), entry.getValue());
            }
            JSONObject sessions = new JSONObject();
            for (Map.Entry<Long, Integer> entry : state.completedSessionsByDay.entrySet()) {
                sessions.put(Long.toString(entry.getKey()), entry.getValue());
            }
            String text = new JSONObject()
                .put("version", 2)
                .put("task", task == null ? JSONObject.NULL : task)
                .put("sessionActive", sessionActive)
                .put("mode", state.mode)
                .put("running", state.running)
                .put("completed", state.completed)
                .put("completionPending", state.completionPending)
                .put("durationMinutes", state.durationMinutes)
                .put("elapsedMillis", state.elapsedMillis)
                .put("lastElapsedRealtimeMillis", state.lastElapsedRealtimeMillis)
                .put("lastWallMillis", state.lastWallMillis)
                .put("bootId", state.bootId)
                .put("focusedMillisByDay", focused)
                .put("completedSessionsByDay", sessions)
                .toString();
            if (text.equals(lastPersisted)) return;
            // One atomic record couples elapsed time, statistics and the delivered-event marker.
            if (!preferences.edit().putString(STATE_KEY, text).commit()) {
                throw new IllegalStateException("无法保存番茄钟状态");
            }
            lastPersisted = text;
            lastControlState = controls;
            lastPersistedAt = now;
        } catch (JSONException error) {
            throw new IllegalStateException("无法保存番茄钟状态", error);
        }
    }
}
