package local.gxtodo.replica;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Pure timer model. Monotonic time is authoritative within a boot; wall time is
 * used only for Beijing day statistics and recovering a running timer after reboot.
 * Reading a snapshot never consumes a pending countdown completion.
 */
public final class PomodoroClock {
    public static final int DEFAULT_MINUTES = 25;
    public static final int MAX_MINUTES = 180;
    private static final long MINUTE = 60_000L;
    private static final long DAY = 86_400_000L;
    private static final long BEIJING_OFFSET = 8 * 60 * MINUTE;

    public interface TimeSource {
        Time now();
    }

    public static final class Time {
        public final long wallMillis;
        public final long elapsedRealtimeMillis;
        public final String bootId;

        public Time(long wallMillis, long elapsedRealtimeMillis, String bootId) {
            this.wallMillis = wallMillis;
            this.elapsedRealtimeMillis = Math.max(0, elapsedRealtimeMillis);
            this.bootId = bootId == null ? "" : bootId;
        }
    }

    /** Serializable values, independent of Android and JSON. Copies are defensive. */
    public static final class State {
        public String mode = "countdown";
        public boolean running;
        public boolean completed;
        public boolean completionPending;
        public int durationMinutes = DEFAULT_MINUTES;
        public long elapsedMillis;
        public long lastElapsedRealtimeMillis;
        public long lastWallMillis;
        public String bootId = "";
        public final Map<Long, Long> focusedMillisByDay = new HashMap<>();
        public final Map<Long, Integer> completedSessionsByDay = new HashMap<>();

        public State() {}

        public State(State other) {
            mode = other.mode;
            running = other.running;
            completed = other.completed;
            completionPending = other.completionPending;
            durationMinutes = other.durationMinutes;
            elapsedMillis = other.elapsedMillis;
            lastElapsedRealtimeMillis = other.lastElapsedRealtimeMillis;
            lastWallMillis = other.lastWallMillis;
            bootId = other.bootId;
            focusedMillisByDay.putAll(other.focusedMillisByDay);
            completedSessionsByDay.putAll(other.completedSessionsByDay);
        }
    }

    public static final class Snapshot {
        public final String mode;
        public final boolean running;
        public final boolean completed;
        public final int durationMinutes;
        public final long elapsedMillis;
        public final long remainingMillis;
        public final int completedSessionsToday;
        public final long focusedMillisToday;

        private Snapshot(State state, long day) {
            mode = state.mode;
            running = state.running;
            completed = state.completed;
            durationMinutes = state.durationMinutes;
            elapsedMillis = state.elapsedMillis;
            remainingMillis = "countdown".equals(mode)
                ? Math.max(0, durationMinutes * MINUTE - elapsedMillis) : 0;
            Integer sessions = state.completedSessionsByDay.get(day);
            Long focused = state.focusedMillisByDay.get(day);
            completedSessionsToday = sessions == null ? 0 : sessions;
            focusedMillisToday = focused == null ? 0 : focused;
        }
    }

    private final TimeSource timeSource;
    private final State state;

    public PomodoroClock(TimeSource timeSource) {
        this(timeSource, null);
    }

    public PomodoroClock(TimeSource timeSource, State saved) {
        if (timeSource == null) throw new IllegalArgumentException("A time source is required");
        this.timeSource = timeSource;
        state = saved == null ? new State() : new State(saved);
        sanitize();
        if (saved == null) anchor(timeSource.now());
    }

    public synchronized void startCountdown(int minutes) {
        validateMinutes(minutes);
        Time now = advance();
        state.durationMinutes = minutes;
        start("countdown", now);
    }

    public synchronized void startCountup() {
        start("countup", advance());
    }

    private void start(String mode, Time now) {
        state.mode = mode;
        state.elapsedMillis = 0;
        state.running = true;
        state.completed = false;
        state.completionPending = false;
        anchor(now);
    }

    public synchronized void pause() {
        advance();
        state.running = false;
    }

    public synchronized void resume() {
        Time now = advance();
        if (!state.completed) {
            state.running = true;
            anchor(now);
        }
    }

    /** Reset the current timer, retaining the chosen duration and daily statistics. */
    public synchronized void reset() {
        Time now = advance();
        state.elapsedMillis = 0;
        state.running = false;
        state.completed = false;
        state.completionPending = false;
        anchor(now);
    }

    /**
     * Change the countdown target without discarding an in-progress session.
     * Changing a finished countdown prepares an idle timer with the new duration.
     */
    public synchronized void setDurationMinutes(int minutes) {
        validateMinutes(minutes);
        Time now = advance();
        if (minutes == state.durationMinutes) return;
        state.durationMinutes = minutes;
        if ("countdown".equals(state.mode)) {
            if (state.completed) {
                state.elapsedMillis = 0;
                state.completed = false;
                state.completionPending = false;
            } else if (state.elapsedMillis >= minutes * MINUTE) {
                state.elapsedMillis = minutes * MINUTE;
                complete(now.wallMillis);
            }
        }
    }

    public synchronized int durationMinutes() {
        return state.durationMinutes;
    }

    public synchronized Snapshot snapshot() {
        Time now = advance();
        return new Snapshot(state, beijingDay(now.wallMillis));
    }

    /** Returns true once per completed countdown, including a completion found by snapshot(). */
    public synchronized boolean tick() {
        advance();
        boolean pending = state.completionPending;
        state.completionPending = false;
        return pending;
    }

    /** Export the model after snapshot/tick/mutation; exporting itself does not advance time. */
    public synchronized State save() {
        return new State(state);
    }

    public static long beijingDay(long wallMillis) {
        return Math.floorDiv(wallMillis + BEIJING_OFFSET, DAY);
    }

    private static void validateMinutes(int minutes) {
        if (minutes < 1 || minutes > MAX_MINUTES) {
            throw new IllegalArgumentException("倒计时请输入 1–180 分钟");
        }
    }

    private void sanitize() {
        if (!"countup".equals(state.mode)) state.mode = "countdown";
        if (state.durationMinutes < 1 || state.durationMinutes > MAX_MINUTES) {
            state.durationMinutes = DEFAULT_MINUTES;
        }
        state.elapsedMillis = Math.max(0, state.elapsedMillis);
        state.lastElapsedRealtimeMillis = Math.max(0, state.lastElapsedRealtimeMillis);
        if (state.bootId == null) state.bootId = "";
        if ("countdown".equals(state.mode)) {
            state.elapsedMillis = Math.min(state.elapsedMillis, state.durationMinutes * MINUTE);
            if (state.completed) state.elapsedMillis = state.durationMinutes * MINUTE;
        } else {
            state.completed = false;
            state.completionPending = false;
        }
        if (state.completed) state.running = false;
        state.focusedMillisByDay.entrySet().removeIf(e -> e.getValue() == null || e.getValue() < 0);
        state.completedSessionsByDay.entrySet().removeIf(e -> e.getValue() == null || e.getValue() < 0);
    }

    private Time advance() {
        Time now = timeSource.now();
        long delta = 0;
        if (state.running) {
            boolean sameBoot = state.bootId.equals(now.bootId)
                && now.elapsedRealtimeMillis >= state.lastElapsedRealtimeMillis;
            delta = sameBoot
                ? now.elapsedRealtimeMillis - state.lastElapsedRealtimeMillis
                : positiveDifference(now.wallMillis, state.lastWallMillis);
            long earned = "countdown".equals(state.mode)
                ? Math.min(delta, Math.max(0, state.durationMinutes * MINUTE - state.elapsedMillis))
                : delta;
            state.elapsedMillis = saturatedAdd(state.elapsedMillis, earned);
            // A late tick credits the actual interval, capped at the countdown deadline.
            long startWall = now.wallMillis - delta;
            creditFocus(startWall, earned, beijingDay(now.wallMillis));
            if ("countdown".equals(state.mode) && state.elapsedMillis >= state.durationMinutes * MINUTE) {
                complete(startWall + earned);
            }
        }
        anchor(now);
        pruneStatistics(beijingDay(now.wallMillis));
        return now;
    }

    private void anchor(Time now) {
        state.lastElapsedRealtimeMillis = now.elapsedRealtimeMillis;
        state.lastWallMillis = now.wallMillis;
        state.bootId = now.bootId;
    }

    private void complete(long wallMillis) {
        if (state.completed) return;
        state.completed = true;
        state.running = false;
        state.completionPending = true;
        long day = beijingDay(wallMillis);
        Integer old = state.completedSessionsByDay.get(day);
        int count = old == null ? 0 : old;
        state.completedSessionsByDay.put(day, count == Integer.MAX_VALUE ? count : count + 1);
    }

    private void creditFocus(long startWall, long earned, long today) {
        if (earned <= 0) return;
        long endWall = saturatedAdd(startWall, earned);
        // Only recent daily totals are needed; avoid iterating every day after a long absence.
        for (long day = today - 31; day <= today; day++) {
            long dayStart = day * DAY - BEIJING_OFFSET;
            long overlap = Math.max(0, Math.min(endWall, dayStart + DAY) - Math.max(startWall, dayStart));
            if (overlap > 0) {
                Long old = state.focusedMillisByDay.get(day);
                state.focusedMillisByDay.put(day, saturatedAdd(old == null ? 0 : old, overlap));
            }
        }
    }

    private void pruneStatistics(long today) {
        Set<Long> days = new HashSet<>(state.focusedMillisByDay.keySet());
        days.addAll(state.completedSessionsByDay.keySet());
        for (Long day : days) {
            if (day < today - 31 || day > today) {
                state.focusedMillisByDay.remove(day);
                state.completedSessionsByDay.remove(day);
            }
        }
    }

    private static long positiveDifference(long now, long previous) {
        if (now <= previous) return 0;
        long difference = now - previous;
        return difference < 0 ? Long.MAX_VALUE : difference;
    }

    private static long saturatedAdd(long first, long second) {
        if (second > 0 && first > Long.MAX_VALUE - second) return Long.MAX_VALUE;
        return first + second;
    }
}
