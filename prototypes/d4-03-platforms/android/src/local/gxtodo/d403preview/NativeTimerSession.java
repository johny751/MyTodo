package local.gxtodo.d403preview;

import local.gxtodo.replica.PomodoroClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Preview-only session envelope around the byte-frozen timer model. Worker-confined. */
public final class NativeTimerSession {
    public static final int PROTOCOL = 1;
    private static final int VISIBLE_HISTORY_LIMIT = 10000;
    private static final long MAX_SAFE_REVISION = 9007199254740991L;
    private static final DateTimeFormatter ISO_MILLIS = new DateTimeFormatterBuilder().appendInstant(3).toFormatter(java.util.Locale.ROOT);
    private final PomodoroClock.TimeSource source;
    // Every operation uses one sampled instant, including all kernel calls and metadata.
    private PomodoroClock.Time instant;
    private final PomodoroClock focus;
    private final PomodoroClock rest;
    private long revision;
    private String phase = "focus", focusMode = "countdown", status = "idle";
    private int durationMinutes = 25, breakMinutes = 5;
    private String sessionId = "", startedAt = "", taskId = "";
    private boolean completionPending;
    private final List<JSONObject> history = new ArrayList<>();
    private final Map<String, JSONObject> receipts = new LinkedHashMap<>();

    public NativeTimerSession(PomodoroClock.TimeSource source, JSONObject saved) throws Exception {
        if (source == null) throw new IllegalArgumentException("time-source-required");
        this.source = source;
        instant = source.now();
        PomodoroClock.State focusState = null, restState = null;
        if (saved != null) {
            if (!saved.has("schemaVersion"))
                throw new IllegalStateException("legacy-state-unconverted: preserved isolated timer file; explicit reviewed conversion required");
            if (saved.getInt("schemaVersion") != 1 || !"mytodo-preview-unified-timer".equals(saved.getString("kind")))
                throw new IllegalStateException("unsupported-timer-envelope: file preserved");
            revision = integer(saved, "revision", 0, MAX_SAFE_REVISION);
            phase = choice(saved.getString("phase"), "focus", "break");
            focusMode = choice(saved.getString("focusMode"), "countdown", "countup");
            status = choice(saved.getString("status"), "idle", "running", "paused", "completed", "ended");
            durationMinutes = (int) integer(saved, "durationMinutes", 1, 180);
            breakMinutes = (int) integer(saved, "breakMinutes", 1, 180);
            sessionId = saved.getString("sessionId"); startedAt = saved.getString("startedAt"); taskId = saved.getString("taskId");
            completionPending = saved.getBoolean("completionPending");
            focusState = decodeClock(saved.getJSONObject("focusClockState"));
            restState = decodeClock(saved.getJSONObject("breakClockState"));
            JSONArray entries = saved.getJSONArray("history");
            Set<String> ids = new HashSet<>();
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = copy(entries.getJSONObject(i));
                String id = entry.getString("id");
                if (id.isEmpty() || !ids.add(id)) throw new IllegalStateException("invalid-history-identity");
                choice(entry.getString("phase"), "focus", "break"); choice(entry.getString("mode"), "countdown", "countup");
                choice(entry.getString("outcome"), "completed", "ended");
                integer(entry, "elapsedMillis", 0, Long.MAX_VALUE);
                Instant.parse(entry.getString("startedAt")); Instant.parse(entry.getString("finishedAt")); entry.getString("taskId");
                history.add(entry);
            }
            JSONObject ledger = saved.getJSONObject("commandReceipts");
            for (Iterator<String> it = ledger.keys(); it.hasNext();) {
                String id = it.next(); validateCommandId(id);
                JSONObject receipt = copy(ledger.getJSONObject(id));
                receipt.getString("signature");
                integer(receipt, "historyCount", 0, history.size());
                JSONObject result = receipt.getJSONObject("result");
                if (result.has("history") || !"android-native".equals(result.getString("provider")) || result.getInt("protocol") != PROTOCOL)
                    throw new IllegalStateException("invalid-command-receipt");
                integer(result, "revision", 0, revision);
                receipts.put(id, receipt);
            }
        }
        focus = new PomodoroClock(() -> instant, focusState);
        rest = new PomodoroClock(() -> instant, restState);
        if (saved == null) prepare(rest, "countdown", breakMinutes);
        validateEnvelope();
    }

    public JSONObject snapshot() throws Exception {
        synchronize();
        return response(false);
    }

    public JSONObject command(JSONObject request) throws Exception {
        onlyKeys(request, "op", "action", "values", "commandId", "expectedRevision");
        String action = request.getString("action");
        choice(action, "start", "break", "pause", "resume", "end", "finish", "reset", "configure", "claim-completion");
        String id = request.getString("commandId"); validateCommandId(id);
        long expected = integer(request, "expectedRevision", 0, MAX_SAFE_REVISION);
        JSONObject values = request.has("values") ? request.getJSONObject("values") : new JSONObject();
        if ("configure".equals(action)) validateConfiguration(values); else onlyKeys(values);
        String signature = canonical(new JSONObject().put("action", action).put("values", values).put("expectedRevision", expected));
        JSONObject previous = receipts.get(id);
        if (previous != null) {
            if (!signature.equals(previous.getString("signature")))
                throw new IllegalArgumentException("command-id-reused: same id requires the same payload and expectedRevision");
            // No clock mutation: retries return the exact accepted result, even after reopening.
            JSONObject result = copy(previous.getJSONObject("result"));
            result.put("history", historyAt(previous.getInt("historyCount")));
            return result;
        }
        synchronize();
        if (expected != revision)
            throw new IllegalStateException("stale-revision: expected " + expected + ", current " + revision + "; refresh required");
        boolean delivered = apply(action, values);
        incrementRevision();
        JSONObject result = response(delivered), compactResult = copy(result);
        compactResult.remove("history");
        receipts.put(id, new JSONObject().put("signature", signature).put("result", compactResult).put("historyCount", history.size()));
        return result;
    }

    /** Kept only for frozen instrumentation callers. New UI writes use command(). */
    public JSONObject legacy(JSONObject request) throws Exception {
        String op = request.optString("op", "snapshot");
        if ("snapshot".equals(op)) return snapshot();
        choice(op, "start", "countup", "pause", "resume", "reset", "poll");
        synchronize();
        boolean delivered = false, changed = true;
        if ("start".equals(op) || "countup".equals(op)) {
            int minutes = "start".equals(op) ? (int) integer(request, "minutes", 1, 180) : durationMinutes;
            if (active()) finishEnded();
            reset();
            focusMode = "countup".equals(op) ? "countup" : "countdown";
            durationMinutes = minutes;
            prepare(focus, focusMode, durationMinutes);
            start("focus");
        } else if ("pause".equals(op)) apply("pause", new JSONObject());
        else if ("resume".equals(op)) {
            if ("idle".equals(status)) start(phase); else apply("resume", new JSONObject());
        } else if ("reset".equals(op)) reset();
        else { delivered = claimCompletion(); changed = delivered; }
        if (changed) incrementRevision();
        return response(delivered);
    }

    public JSONObject save() throws Exception {
        validateEnvelope();
        JSONObject ledger = new JSONObject();
        for (Map.Entry<String, JSONObject> entry : receipts.entrySet()) ledger.put(entry.getKey(), copy(entry.getValue()));
        JSONArray allHistory = new JSONArray();
        for (JSONObject entry : history) allHistory.put(copy(entry));
        return new JSONObject().put("kind", "mytodo-preview-unified-timer").put("schemaVersion", 1)
            .put("revision", revision).put("phase", phase).put("focusMode", focusMode).put("status", status)
            .put("durationMinutes", durationMinutes).put("breakMinutes", breakMinutes).put("sessionId", sessionId)
            .put("startedAt", startedAt).put("taskId", taskId).put("completionPending", completionPending)
            .put("history", allHistory).put("focusClockState", encodeClock(focus.save()))
            .put("breakClockState", encodeClock(rest.save())).put("commandReceipts", ledger);
    }

    private boolean apply(String action, JSONObject values) throws Exception {
        switch (action) {
            case "start": start("focus"); break;
            case "break": start("break"); break;
            case "pause": if ("running".equals(status)) { clock().pause(); status = "paused"; } break;
            case "resume": if ("paused".equals(status)) { clock().resume(); status = "running"; } break;
            case "end": if (active()) finishEnded(); break;
            case "finish":
                if (!active() || !"countup".equals(mode()))
                    throw new IllegalStateException("countdown-completes-at-deadline: early end is not a completed session");
                clock().pause(); markCompleted(instant.wallMillis); break;
            case "reset": reset(); break;
            case "configure": configure(values); break;
            case "claim-completion": return claimCompletion();
            default: throw new IllegalArgumentException("unsupported-timer-action");
        }
        return false;
    }

    private void start(String nextPhase) throws Exception {
        if (active()) throw new IllegalStateException("timer-already-active: end the current phase first");
        // Old completed/ended histories stay immutable, and only one phase can be active.
        focus.reset(); rest.reset();
        phase = nextPhase; status = "running"; completionPending = false;
        sessionId = UUID.randomUUID().toString(); startedAt = iso(instant.wallMillis);
        if ("countup".equals(mode())) clock().startCountup();
        else clock().startCountdown("break".equals(phase) ? breakMinutes : durationMinutes);
    }

    private void finishEnded() throws Exception {
        clock().pause(); status = "ended"; completionPending = false;
        record("ended", instant.wallMillis);
    }

    private void reset() throws Exception {
        if (active()) finishEnded();
        focus.reset(); rest.reset(); phase = "focus"; status = "idle"; completionPending = false;
        sessionId = ""; startedAt = "";
        prepare(focus, focusMode, durationMinutes);
    }

    private void configure(JSONObject values) throws Exception {
        validateConfiguration(values);
        String chosen = values.getString("mode");
        if (active() && !focusMode.equals(chosen))
            throw new IllegalStateException("timer-mode-locked: end the current phase before changing the focus mode");
        durationMinutes = values.getInt("durationMinutes"); breakMinutes = values.getInt("breakMinutes");
        taskId = values.getString("taskId");
        if (active()) {
            focus.setDurationMinutes(durationMinutes); rest.setDurationMinutes(breakMinutes);
            if (clock().snapshot().completed) markCompleted(instant.wallMillis);
        } else {
            focusMode = chosen;
            reset(); prepare(rest, "countdown", breakMinutes);
        }
    }

    private boolean claimCompletion() {
        boolean delivered = completionPending;
        if (delivered) { clock().tick(); completionPending = false; }
        return delivered;
    }

    private void synchronize() throws Exception {
        instant = source.now();
        PomodoroClock.State before = clock().save();
        PomodoroClock.Snapshot current = clock().snapshot();
        // Prune both kernels on the same Beijing date, even while the other phase is active.
        if ("focus".equals(phase)) rest.snapshot(); else focus.snapshot();
        if (active() && current.completed) {
            long finishWall = instant.wallMillis;
            if (before.running) {
                boolean sameBoot = before.bootId.equals(instant.bootId) && instant.elapsedRealtimeMillis >= before.lastElapsedRealtimeMillis;
                long delta = sameBoot ? instant.elapsedRealtimeMillis - before.lastElapsedRealtimeMillis : positiveDifference(instant.wallMillis, before.lastWallMillis);
                long earned = Math.min(delta, Math.max(0, before.durationMinutes * 60000L - before.elapsedMillis));
                finishWall = instant.wallMillis - delta + earned;
            }
            markCompleted(finishWall); incrementRevision();
        }
    }

    private void markCompleted(long wall) throws Exception {
        if ("completed".equals(status)) return;
        status = "completed"; completionPending = true;
        record("completed", wall);
        // Countdown statistics come only from focus's frozen kernel. Countup/break add none.
    }

    private void record(String outcome, long wall) throws Exception {
        if (sessionId.isEmpty()) throw new IllegalStateException("active-session-identity-required");
        for (JSONObject row : history) if (sessionId.equals(row.getString("id"))) return;
        history.add(new JSONObject().put("id", sessionId).put("phase", phase).put("mode", mode()).put("taskId", taskId)
            .put("startedAt", startedAt).put("finishedAt", iso(wall)).put("elapsedMillis", clock().save().elapsedMillis).put("outcome", outcome));
    }

    private JSONObject response(boolean delivered) throws Exception {
        PomodoroClock.Snapshot current = clock().snapshot(), focusSnapshot = focus.snapshot();
        PomodoroClock.State statistics = focus.save();
        return new JSONObject().put("provider", "android-native").put("protocol", PROTOCOL).put("revision", revision)
            .put("sessionId", sessionId).put("status", status).put("phase", phase).put("mode", mode()).put("focusMode", focusMode)
            .put("durationMinutes", durationMinutes).put("breakMinutes", breakMinutes).put("taskId", taskId).put("startedAt", startedAt)
            .put("elapsedMillis", current.elapsedMillis).put("remainingMillis", "countup".equals(mode()) ? 0 : Math.max(0, ("break".equals(phase) ? breakMinutes : durationMinutes) * 60000L - current.elapsedMillis))
            .put("history", historyAt(history.size())).put("focusedMillisByDay", encode(statistics.focusedMillisByDay))
            .put("completedSessionsByDay", encode(statistics.completedSessionsByDay)).put("focusedMillisToday", focusSnapshot.focusedMillisToday)
            .put("completedSessionsToday", focusSnapshot.completedSessionsToday).put("running", "running".equals(status))
            .put("completed", "completed".equals(status)).put("completionPending", completionPending)
            .put("completionId", "completed".equals(status) ? sessionId : "").put("completionDelivered", delivered)
            .put("clock", "Android elapsedRealtime");
    }

    private JSONArray historyAt(int count) throws Exception {
        JSONArray out = new JSONArray();
        for (int i = count - 1; i >= Math.max(0, count - VISIBLE_HISTORY_LIMIT); i--) out.put(copy(history.get(i)));
        return out;
    }

    private void validateEnvelope() throws Exception {
        PomodoroClock.State current = clock().save(), inactive = ("focus".equals(phase) ? rest : focus).save();
        PomodoroClock.State focusState = focus.save(), restState = rest.save();
        if (inactive.running || !mode().equals(current.mode) || current.durationMinutes != ("break".equals(phase) ? breakMinutes : durationMinutes))
            throw new IllegalStateException("inconsistent-timer-envelope");
        if (!focusMode.equals(focusState.mode) || !"countdown".equals(restState.mode) ||
            focusState.durationMinutes != durationMinutes || restState.durationMinutes != breakMinutes || inactive.completed || inactive.completionPending)
            throw new IllegalStateException("inconsistent-phase-clocks");
        if ("running".equals(status) != current.running || (completionPending && !"completed".equals(status)))
            throw new IllegalStateException("inconsistent-timer-status");
        boolean kernelCompleted = "completed".equals(status) && "countdown".equals(mode());
        if (current.completed != kernelCompleted || ("countdown".equals(mode()) && current.completionPending != completionPending))
            throw new IllegalStateException("inconsistent-completion-state");
        if ("idle".equals(status)) {
            if (current.elapsedMillis != 0 || !sessionId.isEmpty() || !startedAt.isEmpty()) throw new IllegalStateException("invalid-idle-session");
        } else {
            if (sessionId.isEmpty() || startedAt.isEmpty()) throw new IllegalStateException("session-identity-required");
            Instant.parse(startedAt);
        }
        if ("completed".equals(status) || "ended".equals(status)) {
            int count = 0;
            for (JSONObject row : history) if (sessionId.equals(row.getString("id")) && status.equals(row.getString("outcome"))) count++;
            if (count != 1) throw new IllegalStateException("terminal-session-history-required");
        }
    }

    private PomodoroClock clock() { return "break".equals(phase) ? rest : focus; }
    private String mode() { return "break".equals(phase) ? "countdown" : focusMode; }
    private boolean active() { return "running".equals(status) || "paused".equals(status); }
    private void incrementRevision() { if (revision >= MAX_SAFE_REVISION) throw new IllegalStateException("timer-revision-capacity"); revision++; }
    private static void prepare(PomodoroClock clock, String mode, int minutes) { clock.setDurationMinutes(minutes); if ("countup".equals(mode)) clock.startCountup(); else clock.startCountdown(minutes); clock.reset(); }
    private static String iso(long millis) { return ISO_MILLIS.format(Instant.ofEpochMilli(millis)); }
    private static long positiveDifference(long now, long before) { if (now <= before) return 0; long delta = now - before; return delta < 0 ? Long.MAX_VALUE : delta; }
    private static JSONObject copy(JSONObject value) throws Exception { return new JSONObject(value.toString()); }
    private static void validateCommandId(String id) { if (!id.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException("invalid-command-id"); }
    private static String choice(String value, String... allowed) { for (String item : allowed) if (item.equals(value)) return value; throw new IllegalArgumentException("invalid-value: " + value); }
    private static void onlyKeys(JSONObject value, String... allowed) throws Exception {
        Set<String> keys = new HashSet<>(); Collections.addAll(keys, allowed);
        for (Iterator<String> it = value.keys(); it.hasNext();) { String key = it.next(); if (!keys.contains(key)) throw new IllegalArgumentException("unsupported-field: " + key); }
    }
    private static long integer(JSONObject value, String key, long min, long max) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof Number)) throw new IllegalArgumentException("integer-required: " + key);
        Number n = (Number) raw; long result = n.longValue(); double d = n.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d) || d != (double) result || result < min || result > max)
            throw new IllegalArgumentException("integer-out-of-range: " + key);
        return result;
    }
    private static void validateConfiguration(JSONObject values) throws Exception {
        onlyKeys(values, "mode", "durationMinutes", "breakMinutes", "taskId");
        choice(values.getString("mode"), "countdown", "countup"); integer(values, "durationMinutes", 1, 180); integer(values, "breakMinutes", 1, 180);
        Object task = values.get("taskId");
        if (!(task instanceof String) || ((String) task).length() > 512) throw new IllegalArgumentException("invalid-task-id");
    }
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; List<String> keys = new ArrayList<>();
            for (Iterator<String> it = object.keys(); it.hasNext();) keys.add(it.next()); Collections.sort(keys);
            StringBuilder out = new StringBuilder("{");
            for (String key : keys) { if (out.length() > 1) out.append(','); out.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key))); }
            return out.append('}').toString();
        }
        if (value instanceof String) return JSONObject.quote((String) value);
        if (value instanceof Number) { Number n = (Number) value; return n.doubleValue() == (double) n.longValue() ? Long.toString(n.longValue()) : n.toString(); }
        if (value == JSONObject.NULL) return "null";
        return String.valueOf(value);
    }
    private static JSONObject encode(Map<? extends Number, ? extends Number> values) throws Exception {
        JSONObject out = new JSONObject();
        for (Map.Entry<? extends Number, ? extends Number> entry : values.entrySet()) out.put(entry.getKey().toString(), entry.getValue());
        return out;
    }
    private static JSONObject encodeClock(PomodoroClock.State s) throws Exception {
        return new JSONObject().put("mode", s.mode).put("running", s.running).put("completed", s.completed)
            .put("completionPending", s.completionPending).put("durationMinutes", s.durationMinutes).put("elapsedMillis", s.elapsedMillis)
            .put("lastElapsedRealtimeMillis", s.lastElapsedRealtimeMillis).put("lastWallMillis", s.lastWallMillis).put("bootId", s.bootId)
            .put("focusedMillisByDay", encode(s.focusedMillisByDay)).put("completedSessionsByDay", encode(s.completedSessionsByDay));
    }
    private static PomodoroClock.State decodeClock(JSONObject j) throws Exception {
        PomodoroClock.State s = new PomodoroClock.State();
        s.mode = choice(j.getString("mode"), "countdown", "countup"); s.running = j.getBoolean("running"); s.completed = j.getBoolean("completed");
        s.completionPending = j.getBoolean("completionPending"); s.durationMinutes = (int) integer(j, "durationMinutes", 1, 180);
        s.elapsedMillis = integer(j, "elapsedMillis", 0, Long.MAX_VALUE); s.lastElapsedRealtimeMillis = integer(j, "lastElapsedRealtimeMillis", 0, Long.MAX_VALUE);
        s.lastWallMillis = j.getLong("lastWallMillis"); s.bootId = j.getString("bootId");
        if ((s.completed && (s.running || !"countdown".equals(s.mode) || s.elapsedMillis != s.durationMinutes * 60000L)) || (s.completionPending && !s.completed) ||
            ("countdown".equals(s.mode) && s.elapsedMillis > s.durationMinutes * 60000L)) throw new IllegalStateException("invalid-clock-state");
        JSONObject focus = j.getJSONObject("focusedMillisByDay"), sessions = j.getJSONObject("completedSessionsByDay");
        for (Iterator<String> it = focus.keys(); it.hasNext();) { String key = it.next(); s.focusedMillisByDay.put(Long.parseLong(key), integer(focus, key, 0, Long.MAX_VALUE)); }
        for (Iterator<String> it = sessions.keys(); it.hasNext();) { String key = it.next(); s.completedSessionsByDay.put(Long.parseLong(key), (int) integer(sessions, key, 0, Integer.MAX_VALUE)); }
        return s;
    }
}
