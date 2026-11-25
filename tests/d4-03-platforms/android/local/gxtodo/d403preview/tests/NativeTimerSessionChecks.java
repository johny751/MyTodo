package local.gxtodo.d403preview.tests;

import local.gxtodo.d403preview.NativeTimerSession;
import local.gxtodo.replica.PomodoroClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/** Deterministic envelope checks using Android's real org.json; no store, UI, sleep or filesystem. */
public final class NativeTimerSessionChecks {
    private NativeTimerSessionChecks() {}
    private interface Attempt { void run() throws Exception; }
    private static final class ControlledTime implements PomodoroClock.TimeSource {
        long wall = Instant.parse("2026-11-25T04:00:00.000Z").toEpochMilli();
        long elapsed = 600000L;
        @Override public PomodoroClock.Time now() { return new PomodoroClock.Time(wall, elapsed, "deterministic-boot"); }
        void advance(long millis) { wall += millis; elapsed += millis; }
    }

    public static JSONObject shortenCompletionOnce() throws Exception {
        ControlledTime time = new ControlledTime();
        NativeTimerSession session = new NativeTimerSession(time, null);
        JSONObject configured = session.command(request("configure", config("countdown", 5, 1, "shorten-task"), "shorten:configure", 0));
        JSONObject started = session.command(request("start", new JSONObject(), "shorten:start", configured.getLong("revision")));
        require("2026-11-25T04:00:00.000Z".equals(started.getString("startedAt")), "Whole-second timestamps retain exactly three fractional digits");
        time.advance(90000L);
        JSONObject before = session.snapshot();
        require(before.getLong("elapsedMillis") == 90000L && "running".equals(before.getString("status")), "Five-minute focus runs for the controlled ninety seconds");
        require(total(before, "focusedMillisByDay") == 90000L && total(before, "completedSessionsByDay") == 0, "Observed focus is credited before shortening without completion");
        JSONObject shortened = session.command(request("configure", config("countdown", 1, 1, "shorten-task"), "shorten:target", before.getLong("revision")));
        String id = started.getString("sessionId");
        require("completed".equals(shortened.getString("status")) && id.equals(shortened.getString("sessionId")), "Shortening completes the original session identity");
        require(shortened.getLong("revision") == before.getLong("revision") + 1 && shortened.getLong("elapsedMillis") == 60000L, "Shortening is one command revision and preserves the frozen kernel's target cap");
        require(shortened.getJSONArray("history").length() == 1, "Shortening creates exactly one terminal row");
        JSONObject row = shortened.getJSONArray("history").getJSONObject(0);
        require(id.equals(row.getString("id")) && "completed".equals(row.getString("outcome")) && row.getLong("elapsedMillis") == 60000L, "History records this target-capped completion");
        require("2026-11-25T04:01:30.000Z".equals(row.getString("finishedAt")), "A shortened target completes when configured, not at a fabricated past deadline");
        require(total(shortened, "focusedMillisByDay") == 90000L && total(shortened, "completedSessionsByDay") == 1, "Actual previously credited focus is retained and one round is counted");
        require(shortened.getBoolean("completionPending") && id.equals(shortened.getString("completionId")), "Completed session exposes an unclaimed stable completion identity");
        JSONObject claimRequest = request("claim-completion", new JSONObject(), "shorten:claim", shortened.getLong("revision"));
        JSONObject claimed = session.command(claimRequest);
        require(claimed.getBoolean("completionDelivered") && !claimed.getBoolean("completionPending"), "The first durable claim receives completion once");
        JSONObject replay = session.command(claimRequest);
        require(canonical(claimed).equals(canonical(replay)), "The same claim ID replays the original receipt exactly");
        JSONObject otherClaim = session.command(request("claim-completion", new JSONObject(), "shorten:other-consumer", claimed.getLong("revision")));
        require(!otherClaim.getBoolean("completionDelivered") && !otherClaim.getBoolean("completionPending"), "A different consumer cannot claim the same completion again");
        JSONObject saved = session.save();
        time.advance(300000L);
        NativeTimerSession reopened = new NativeTimerSession(time, new JSONObject(saved.toString()));
        JSONObject finalState = reopened.snapshot();
        require(finalState.getLong("revision") == otherClaim.getLong("revision") && "completed".equals(finalState.getString("status")), "Reading reopened completion does not add another revision");
        require(finalState.getJSONArray("history").length() == 1 && canonical(row).equals(canonical(finalState.getJSONArray("history").getJSONObject(0))), "Completed history remains immutable after clock advance and reopen");
        require(total(finalState, "focusedMillisByDay") == 90000L && total(finalState, "completedSessionsByDay") == 1 && !finalState.getBoolean("completionPending"), "Reopening cannot add focus, duplicate a round or resurrect the claimed completion");
        return new JSONObject().put("before", before).put("shortened", shortened).put("claimed", claimed).put("otherClaim", otherClaim).put("reopened", finalState);
    }

    public static JSONObject refusesUnconvertedState() throws Exception {
        ControlledTime time = new ControlledTime();
        JSONObject raw = new JSONObject().put("mode", "countdown").put("running", true).put("durationMinutes", 25).put("elapsedMillis", 17000L);
        String rawBefore = canonical(raw);
        String legacyError = rejected("legacy-state-unconverted", () -> { new NativeTimerSession(time, raw); });
        require(rawBefore.equals(canonical(raw)) && !raw.has("schemaVersion"), "Rejecting a raw legacy clock does not migrate or mutate the supplied data");
        JSONObject valid = new NativeTimerSession(time, null).save();
        JSONObject unknownSchema = new JSONObject(valid.toString()).put("schemaVersion", 2);
        String unknownBefore = canonical(unknownSchema);
        String schemaError = rejected("unsupported-timer-envelope", () -> { new NativeTimerSession(time, unknownSchema); });
        require(unknownBefore.equals(canonical(unknownSchema)), "Unsupported envelope schema stays unchanged");
        JSONObject inconsistent = new JSONObject(valid.toString()).put("status", "running");
        String inconsistentBefore = canonical(inconsistent);
        String stateError = rejected("inconsistent-timer-status", () -> { new NativeTimerSession(time, inconsistent); });
        require(inconsistentBefore.equals(canonical(inconsistent)), "Rejected status and kernel mismatch does not repair itself silently");
        NativeTimerSession completedSession = new NativeTimerSession(time, null);
        JSONObject configured = completedSession.command(request("configure", config("countdown", 1, 1, ""), "refusal:configure", 0));
        completedSession.command(request("start", new JSONObject(), "refusal:start", configured.getLong("revision")));
        time.advance(60000L);
        require("completed".equals(completedSession.snapshot().getString("status")), "Corrupted completion fixture begins as a legitimate completed countdown");
        JSONObject corruptedCompletion = completedSession.save();
        corruptedCompletion.getJSONObject("focusClockState").put("elapsedMillis", 0);
        String corruptedBefore = canonical(corruptedCompletion);
        String completionError = rejected("invalid-clock-state", () -> { new NativeTimerSession(time, corruptedCompletion); });
        require(corruptedBefore.equals(canonical(corruptedCompletion)) && corruptedCompletion.getJSONObject("focusClockState").getLong("elapsedMillis") == 0, "A damaged completed elapsed value is rejected before kernel sanitization and the input remains untouched");
        return new JSONObject().put("legacyError", legacyError).put("unsupportedSchemaError", schemaError).put("inconsistentStateError", stateError).put("corruptedCompletionError", completionError).put("inputsUnchanged", true);
    }

    public static JSONObject durableReceiptReplay() throws Exception {
        ControlledTime time = new ControlledTime();
        NativeTimerSession session = new NativeTimerSession(time, null);
        JSONObject configured = session.command(request("configure", config("countdown", 2, 1, "original-task"), "replay:configure", 0));
        JSONObject startRequest = request("start", new JSONObject(), "replay:first-start", configured.getLong("revision"));
        JSONObject accepted = session.command(startRequest);
        String firstId = accepted.getString("sessionId");
        time.advance(17000L);
        JSONObject progressed = session.snapshot();
        require(progressed.getLong("revision") == accepted.getLong("revision") && progressed.getLong("elapsedMillis") == 17000L, "Natural elapsed snapshots keep the command revision");
        JSONObject beforeSameRevisionReplay = session.save();
        JSONObject sameRevisionReplay = session.command(startRequest);
        require(canonical(accepted).equals(canonical(sameRevisionReplay)), "A retry at the same revision returns the original older elapsed receipt");
        require(canonical(beforeSameRevisionReplay).equals(canonical(session.save())), "Receipt replay does not roll back the actual live clock state");
        JSONObject endRequest = request("end", new JSONObject(), "replay:first-end", progressed.getLong("revision"));
        JSONObject ended = session.command(endRequest);
        require(ended.getJSONArray("history").length() == 1 && ended.getJSONArray("history").getJSONObject(0).getLong("elapsedMillis") == 17000L, "Early end has one real elapsed row");
        JSONObject secondConfig = session.command(request("configure", config("countup", 5, 1, "next-task"), "replay:second-configure", ended.getLong("revision")));
        JSONObject second = session.command(request("start", new JSONObject(), "replay:second-start", secondConfig.getLong("revision")));
        require(!firstId.equals(second.getString("sessionId")), "The later explicit start gets its own identity");
        time.advance(8000L);
        JSONObject paused = session.command(request("pause", new JSONObject(), "replay:second-pause", second.getLong("revision")));
        JSONObject saved = session.save();
        time.advance(12000L);
        NativeTimerSession reopened = new NativeTimerSession(time, new JSONObject(saved.toString()));
        JSONObject beforeReplay = reopened.save();
        JSONObject originalStartReplay = reopened.command(new JSONObject(startRequest.toString()));
        JSONObject originalEndReplay = reopened.command(new JSONObject(endRequest.toString()));
        require(canonical(accepted).equals(canonical(originalStartReplay)), "Saved start receipt restores its original empty history window and exact elapsed snapshot");
        require(canonical(ended).equals(canonical(originalEndReplay)), "Saved end receipt restores its original immutable history window exactly");
        require(canonical(beforeReplay).equals(canonical(reopened.save())), "Old receipt replay after reopening mutates no current session, history, statistics or ledger");
        JSONObject changed = new JSONObject(startRequest.toString()).put("action", "end");
        String reusedError = rejected("command-id-reused", () -> { reopened.command(changed); });
        require(canonical(beforeReplay).equals(canonical(reopened.save())), "Same ID with different payload is rejected without changing saved state");
        JSONObject current = reopened.snapshot();
        require(current.getLong("revision") == paused.getLong("revision") && second.getString("sessionId").equals(current.getString("sessionId")) && "paused".equals(current.getString("status")), "Current state retains the later paused session after replaying old receipts");
        require(current.getLong("elapsedMillis") == 8000L && current.getJSONArray("history").length() == 1 && total(current, "focusedMillisByDay") == 25000L, "Replay preserves paused elapsed, one prior history row and all actual focus");
        return new JSONObject().put("accepted", accepted).put("sameRevisionReplay", sameRevisionReplay).put("ended", ended).put("reopenedStartReplay", originalStartReplay).put("reopenedEndReplay", originalEndReplay).put("reusedError", reusedError).put("current", current);
    }

    private static JSONObject request(String action, JSONObject values, String id, long expected) throws Exception {
        return new JSONObject().put("op", "command").put("action", action).put("values", values).put("commandId", id).put("expectedRevision", expected);
    }
    private static JSONObject config(String mode, int focus, int rest, String task) throws Exception {
        return new JSONObject().put("mode", mode).put("durationMinutes", focus).put("breakMinutes", rest).put("taskId", task);
    }
    private static long total(JSONObject snapshot, String key) throws Exception {
        JSONObject values = snapshot.getJSONObject(key); long sum = 0;
        for (Iterator<String> it = values.keys(); it.hasNext();) sum += values.getLong(it.next());
        return sum;
    }
    private static String rejected(String expected, Attempt attempt) throws Exception {
        try { attempt.run(); }
        catch (Exception actual) { require(actual.getMessage() != null && actual.getMessage().contains(expected), "Expected explicit refusal " + expected + ", got " + actual); return actual.toString(); }
        throw new AssertionError("Expected refusal: " + expected);
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; List<String> keys = new ArrayList<>();
            for (Iterator<String> it = object.keys(); it.hasNext();) keys.add(it.next()); Collections.sort(keys);
            StringBuilder out = new StringBuilder("{");
            for (String key : keys) { if (out.length() > 1) out.append(','); out.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key))); }
            return out.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; StringBuilder out = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) { if (i > 0) out.append(','); out.append(canonical(array.get(i))); }
            return out.append(']').toString();
        }
        if (value instanceof String) return JSONObject.quote((String) value);
        return String.valueOf(value);
    }
}
