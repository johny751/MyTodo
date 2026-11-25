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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** One preview-only native/web authority. No production storage, service or network. */
public final class NativeTimerStore {
    public interface Result { void complete(JSONObject value, String error); }
    private static final String FILE_NAME = "d403-native-timer-synthetic.json";
    private static final int MAX_ENVELOPE_BYTES = 16 * 1024 * 1024;
    private static final ThreadPoolExecutor WORKER = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<Runnable>(64), new ThreadPoolExecutor.AbortPolicy());
    private static NativeTimerStore instance;
    private final AtomicFile file;
    private final NativeTimerSession session;

    private NativeTimerStore(Context context) throws Exception {
        File base = new File(context.getFilesDir(), FILE_NAME);
        file = new AtomicFile(base);
        int count;
        try { count = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
        catch (SecurityException denied) { count = -1; }
        final String boot = count < 0 ? "" : Integer.toString(count);
        JSONObject saved = null;
        if (base.length() > MAX_ENVELOPE_BYTES || new File(base.getPath() + ".bak").length() > MAX_ENVELOPE_BYTES)
            throw new IllegalStateException("timer-envelope-capacity: existing file preserved");
        try {
            byte[] bytes = file.readFully();
            if (bytes.length > MAX_ENVELOPE_BYTES) throw new IllegalStateException("timer-envelope-capacity: existing file preserved");
            saved = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (FileNotFoundException absent) {
            // A permission/read/recovery error is not a fresh empty timer.
            if (base.exists() || new File(base.getPath() + ".bak").exists() || new File(base.getPath() + ".new").exists()) throw absent;
        }
        session = new NativeTimerSession(() -> new PomodoroClock.Time(System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot), saved);
    }

    public static void request(Context context, String input, Result result) {
        final Context app = context.getApplicationContext();
        try { WORKER.execute(() -> {
            JSONObject value = null;
            String error = null;
            try {
                JSONObject command = new JSONObject(input);
                if (instance == null) instance = new NativeTimerStore(app);
                String op = command.optString("op", "snapshot");
                if ("reopen-for-isolated-test".equals(op)) {
                    instance.session.snapshot(); instance.persist();
                    instance = new NativeTimerStore(app);
                    value = instance.session.snapshot();
                } else if ("command".equals(op)) value = instance.session.command(command);
                else value = instance.session.legacy(command);
                // Includes kernel anchors, metadata, history, completion claim and receipt in one write.
                instance.persist();
            } catch (Exception failure) {
                // Uncommitted RAM is never an accepted timer or an accepted completion claim.
                instance = null;
                error = failure.getClass().getSimpleName() + ": " + failure.getMessage();
                value = null;
            }
            result.complete(value, error);
        }); } catch (RejectedExecutionException full) {
            result.complete(null, "timer-queue-full: command not accepted; refresh before another user action");
        }
    }

    private void persist() throws Exception {
        byte[] bytes = session.save().toString().getBytes(StandardCharsets.UTF_8);
        // Never evict idempotency receipts or truncate history to fit; reject without losing the old file.
        if (bytes.length > MAX_ENVELOPE_BYTES) throw new IllegalStateException("timer-envelope-capacity: change not saved; existing file preserved");
        FileOutputStream output = file.startWrite();
        try { output.write(bytes); output.getFD().sync(); file.finishWrite(output); }
        catch (Exception failure) { file.failWrite(output); throw failure; }
        if (!Arrays.equals(bytes, file.readFully()))
            throw new IOException("timer-write-unconfirmed: AtomicFile readback differs; refresh required");
    }
}
