package local.gxtodo.d403preview;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;
import local.gxtodo.replica.PomodoroClock;
import org.json.JSONObject;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Independent timer validation adapter; disk/model calls only on this worker. */
public final class NativeTimerStore {
    public interface Result { void complete(JSONObject value, String error); }
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<Runnable>(64), new ThreadPoolExecutor.AbortPolicy());
    private static NativeTimerStore instance;
    private final AtomicFile file;
    private final PomodoroClock clock;
    private NativeTimerStore(Context context) throws Exception {
        file = new AtomicFile(new File(context.getFilesDir(), "d403-native-timer-synthetic.json"));
        final String boot;
        int count;
        try { count = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
        catch (SecurityException denied) { count = -1; }
        boot = count < 0 ? "" : Integer.toString(count);
        PomodoroClock.State state = null;
        try { state = decode(new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8))); }
        catch (FileNotFoundException absent) { /* New isolated package. */ }
        clock = new PomodoroClock(() -> new PomodoroClock.Time(
            System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot), state);
    }
    public static void request(Context context, String input, Result result) {
        final Context app = context.getApplicationContext();
        try { WORKER.execute(() -> {
            try {
                JSONObject command = new JSONObject(input);
                if (instance == null) instance = new NativeTimerStore(app);
                String op = command.optString("op", "snapshot");
                boolean completion = false;
                switch (op) {
                    case "start": instance.clock.startCountdown(command.getInt("minutes")); break;
                    case "countup": instance.clock.startCountup(); break;
                    case "pause": instance.clock.pause(); break;
                    case "resume": instance.clock.resume(); break;
                    case "reset": instance.clock.reset(); break;
                    case "poll": completion = instance.clock.tick(); break;
                    case "snapshot": break;
                    case "reopen-for-isolated-test":
                        instance.clock.snapshot(); instance.persist(); instance = new NativeTimerStore(app); break;
                    default: throw new IllegalArgumentException("Unsupported isolated timer operation");
                }
                PomodoroClock.Snapshot snapshot = instance.clock.snapshot();
                instance.persist();
                JSONObject value = new JSONObject().put("mode", snapshot.mode).put("running", snapshot.running)
                    .put("completed", snapshot.completed).put("elapsedMillis", snapshot.elapsedMillis)
                    .put("remainingMillis", snapshot.remainingMillis).put("durationMinutes", snapshot.durationMinutes)
                    .put("focusedMillisToday", snapshot.focusedMillisToday)
                    .put("completedSessionsToday", snapshot.completedSessionsToday)
                    .put("completionDelivered", completion).put("clock", "Android elapsedRealtime");
                result.complete(value, null);
            } catch (Exception e) {
                // A failed AtomicFile write is not an accepted operation. Reload persisted
                // state next time so a consumed but undelivered completion is not lost in RAM.
                instance = null;
                result.complete(null, e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }); } catch (RejectedExecutionException full) { result.complete(null, "Isolated timer queue full; retry later"); }
    }
    private void persist() throws Exception {
        PomodoroClock.State s = clock.save();
        JSONObject value = new JSONObject().put("mode", s.mode).put("running", s.running)
            .put("completed", s.completed).put("completionPending", s.completionPending)
            .put("durationMinutes", s.durationMinutes).put("elapsedMillis", s.elapsedMillis)
            .put("lastElapsedRealtimeMillis", s.lastElapsedRealtimeMillis).put("lastWallMillis", s.lastWallMillis)
            .put("bootId", s.bootId).put("focusedMillisByDay", encode(s.focusedMillisByDay))
            .put("completedSessionsByDay", encode(s.completedSessionsByDay));
        FileOutputStream out = file.startWrite();
        try { out.write(value.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(out); }
        catch (Exception e) { file.failWrite(out); throw e; }
    }
    private static JSONObject encode(Map<? extends Number, ? extends Number> map) throws Exception {
        JSONObject out = new JSONObject();
        for (Map.Entry<? extends Number, ? extends Number> entry : map.entrySet()) out.put(entry.getKey().toString(), entry.getValue());
        return out;
    }
    private static PomodoroClock.State decode(JSONObject j) throws Exception {
        PomodoroClock.State s = new PomodoroClock.State();
        s.mode = j.getString("mode"); s.running = j.getBoolean("running"); s.completed = j.getBoolean("completed");
        s.completionPending = j.getBoolean("completionPending"); s.durationMinutes = j.getInt("durationMinutes");
        s.elapsedMillis = j.getLong("elapsedMillis"); s.lastElapsedRealtimeMillis = j.getLong("lastElapsedRealtimeMillis");
        s.lastWallMillis = j.getLong("lastWallMillis"); s.bootId = j.getString("bootId");
        JSONObject focus = j.getJSONObject("focusedMillisByDay"), sessions = j.getJSONObject("completedSessionsByDay");
        for (Iterator<String> it = focus.keys(); it.hasNext();) { String key = it.next(); s.focusedMillisByDay.put(Long.parseLong(key), focus.getLong(key)); }
        for (Iterator<String> it = sessions.keys(); it.hasNext();) { String key = it.next(); s.completedSessionsByDay.put(Long.parseLong(key), sessions.getInt(key)); }
        return s;
    }
}
