package local.gxtodo.replica;

import java.time.Instant;

public final class PomodoroClockTest {
    private static final long SECOND = 1000L;
    private static final long MINUTE = 60 * SECOND;
    private static final long DAY = 24 * 60 * MINUTE;
    private static int assertions;

    private static final class FakeTime implements PomodoroClock.TimeSource {
        long wall = Instant.parse("2026-11-01T04:00:00Z").toEpochMilli();
        long monotonic = 100 * MINUTE;
        String boot = "boot-1";

        @Override public PomodoroClock.Time now() {
            return new PomodoroClock.Time(wall, monotonic, boot);
        }

        void advance(long millis) {
            wall += millis;
            monotonic += millis;
        }

        void reboot(long wallAdvance) {
            wall += wallAdvance;
            monotonic = 5000;
            boot = "boot-2";
        }
    }

    private static void equal(long expected, long actual, String message) {
        assertions++;
        if (expected != actual) throw new AssertionError(message + ": expected " + expected + ", got " + actual);
    }

    private static void check(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }

    private static void invalid(Runnable action) {
        assertions++;
        try {
            action.run();
            throw new AssertionError("Invalid duration was accepted");
        } catch (IllegalArgumentException expected) {}
    }

    private static void defaultsAndValidation() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        PomodoroClock.Snapshot value = clock.snapshot();
        equal(25, value.durationMinutes, "Default duration");
        equal(25 * MINUTE, value.remainingMillis, "Idle countdown remaining");
        check(!value.running && !value.completed, "Default timer is idle");
        invalid(() -> clock.startCountdown(0));
        invalid(() -> clock.startCountdown(181));
        invalid(() -> clock.setDurationMinutes(-1));
        clock.setDurationMinutes(180);
        equal(180, clock.durationMinutes(), "Custom duration persists");
        clock.startCountdown(1);
        equal(1, clock.durationMinutes(), "Explicit start duration");
    }

    private static void countdownAndSingleDelivery() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(1);
        time.advance(MINUTE - 1);
        check(!clock.tick(), "Countdown does not finish early");
        equal(1, clock.snapshot().remainingMillis, "Last millisecond remaining");
        time.advance(1001);
        PomodoroClock.Snapshot value = clock.snapshot();
        check(value.completed && !value.running, "Reading finds completion");
        equal(MINUTE, value.elapsedMillis, "Countdown elapsed is capped at deadline");
        equal(0, value.remainingMillis, "Completed countdown has no remaining time");
        equal(1, value.completedSessionsToday, "One completed session");
        equal(MINUTE, value.focusedMillisToday, "Late tick does not credit extra focus");
        check(clock.tick(), "Snapshot leaves the event available for the service");
        check(!clock.tick(), "Repeated tick has no duplicate completion");
        time.advance(DAY);
        check(!clock.tick(), "Completed timer stays stopped");
        clock.resume();
        check(!clock.snapshot().running, "A completed countdown cannot resume");
    }

    private static void countupHasNoDeadline() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountup();
        time.advance(50 * 60 * MINUTE);
        check(!clock.tick(), "Countup has no completion event");
        PomodoroClock.Snapshot value = clock.snapshot();
        equal(50 * 60 * MINUTE, value.elapsedMillis, "Countup exceeds 180 minutes");
        equal(0, value.remainingMillis, "Countup has no remaining duration");
        check(value.running && !value.completed, "Countup keeps running");
        equal(0, value.completedSessionsToday, "Countup does not count Pomodoro completions");
        clock.pause();
        long focused = clock.snapshot().focusedMillisToday;
        time.advance(MINUTE);
        equal(focused, clock.snapshot().focusedMillisToday, "Paused countup earns no focus");
    }

    private static void pauseResumeAndReset() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(2);
        time.advance(10 * SECOND);
        clock.pause();
        clock.pause();
        time.advance(30 * MINUTE);
        equal(10 * SECOND, clock.snapshot().elapsedMillis, "Pause does not accumulate");
        clock.resume();
        clock.resume();
        time.advance(15 * SECOND);
        equal(25 * SECOND, clock.snapshot().elapsedMillis, "Resume continues from saved elapsed");
        equal(25 * SECOND, clock.snapshot().focusedMillisToday, "Statistics exclude pause time");
        clock.reset();
        PomodoroClock.Snapshot value = clock.snapshot();
        equal(0, value.elapsedMillis, "Reset clears elapsed");
        equal(2, value.durationMinutes, "Reset keeps selected duration");
        equal(25 * SECOND, value.focusedMillisToday, "Reset keeps daily focus");
        check(!value.running && !value.completed, "Reset prepares an idle timer");
        time.advance(MINUTE);
        equal(0, clock.snapshot().elapsedMillis, "Reset timer stays stopped");
    }

    private static void processRestart() {
        FakeTime time = new FakeTime();
        PomodoroClock first = new PomodoroClock(time);
        first.startCountdown(1);
        time.advance(10 * SECOND);
        first.snapshot();
        PomodoroClock.State state = first.save();
        time.advance(20 * SECOND);
        PomodoroClock restored = new PomodoroClock(time, state);
        equal(30 * SECOND, restored.snapshot().elapsedMillis, "Process absence is accumulated");
        equal(30 * SECOND, restored.snapshot().focusedMillisToday, "Restored statistics accrue only missing time");
        time.advance(30 * SECOND);
        check(restored.tick(), "Restored countdown completes once");
        PomodoroClock delivered = new PomodoroClock(time, restored.save());
        check(!delivered.tick(), "Delivered completion stays delivered after restart");
        equal(1, delivered.snapshot().completedSessionsToday, "Restart does not recount the session");

        PomodoroClock pending = new PomodoroClock(time);
        pending.startCountdown(1);
        time.advance(MINUTE);
        pending.snapshot();
        PomodoroClock pendingRestored = new PomodoroClock(time, pending.save());
        check(pendingRestored.tick(), "Undelivered completion survives restart");
        check(!pendingRestored.tick(), "Restored pending event is consumed once");
        equal(1, pendingRestored.snapshot().completedSessionsToday, "Pending event does not duplicate statistics");
    }

    private static void wallClockChanges() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(25);
        time.advance(MINUTE);
        clock.snapshot();
        time.wall += 2 * DAY;
        equal(MINUTE, clock.snapshot().elapsedMillis, "Forward system time change cannot finish countdown");
        check(!clock.tick(), "System time change emits no completion");
        time.wall -= 4 * DAY;
        equal(MINUTE, clock.snapshot().elapsedMillis, "Backward system time change cannot rewind elapsed");
        time.advance(MINUTE);
        equal(2 * MINUTE, clock.snapshot().elapsedMillis, "Monotonic clock continues after wall changes");
        PomodoroClock.State saved = clock.save();
        time.wall += 10 * DAY;
        time.monotonic += 2 * MINUTE;
        PomodoroClock restored = new PomodoroClock(time, saved);
        equal(4 * MINUTE, restored.snapshot().elapsedMillis, "Same-boot restart uses monotonic time despite wall change");
    }

    private static void rebootRecovery() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(1);
        time.advance(10 * SECOND);
        clock.snapshot();
        PomodoroClock.State saved = clock.save();
        time.reboot(30 * SECOND);
        PomodoroClock restored = new PomodoroClock(time, saved);
        equal(40 * SECOND, restored.snapshot().elapsedMillis, "New boot restores nonnegative wall elapsed");
        time.advance(20 * SECOND);
        check(restored.tick(), "Rebooted countdown finishes normally");

        FakeTime pausedTime = new FakeTime();
        PomodoroClock paused = new PomodoroClock(pausedTime);
        paused.startCountup();
        pausedTime.advance(10 * SECOND);
        paused.pause();
        PomodoroClock.State pausedState = paused.save();
        pausedTime.reboot(DAY);
        PomodoroClock pausedRestored = new PomodoroClock(pausedTime, pausedState);
        equal(10 * SECOND, pausedRestored.snapshot().elapsedMillis, "Paused timer stays paused across reboot");
        check(!pausedRestored.snapshot().running, "Paused running state is restored");

        FakeTime backwards = new FakeTime();
        PomodoroClock previous = new PomodoroClock(backwards);
        previous.startCountup();
        backwards.advance(10 * SECOND);
        previous.snapshot();
        PomodoroClock.State previousState = previous.save();
        backwards.reboot(-DAY);
        PomodoroClock after = new PomodoroClock(backwards, previousState);
        equal(10 * SECOND, after.snapshot().elapsedMillis, "A backwards reboot clock adds no negative time");
    }

    private static void beijingDailyStatistics() {
        FakeTime time = new FakeTime();
        time.wall = Instant.parse("2026-11-01T15:59:50Z").toEpochMilli(); // Beijing 23:59:50.
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(1);
        long firstDay = PomodoroClock.beijingDay(time.wall);
        time.advance(20 * SECOND);
        equal(10 * SECOND, clock.snapshot().focusedMillisToday, "Focus is split at Beijing midnight");
        equal(0, clock.snapshot().completedSessionsToday, "New day starts without completed sessions");
        time.advance(40 * SECOND);
        check(clock.tick(), "Cross-midnight countdown completes");
        equal(50 * SECOND, clock.snapshot().focusedMillisToday, "Only today's 50 seconds are credited");
        equal(1, clock.snapshot().completedSessionsToday, "Completion belongs to today's Beijing date");
        equal(10 * SECOND, clock.save().focusedMillisByDay.get(firstDay), "Yesterday's focused interval is retained");

        FakeTime late = new FakeTime();
        late.wall = Instant.parse("2026-11-01T15:00:00Z").toEpochMilli(); // Beijing 23:00.
        PomodoroClock lateClock = new PomodoroClock(late);
        lateClock.startCountdown(1);
        long yesterday = PomodoroClock.beijingDay(late.wall);
        late.advance(2 * 60 * MINUTE);
        check(lateClock.tick(), "Late tick still delivers the finished countdown");
        equal(0, lateClock.snapshot().completedSessionsToday, "Late tick does not move yesterday's completion into today");
        equal(0, lateClock.snapshot().focusedMillisToday, "Late tick credits no post-deadline focus");
        equal(1, lateClock.save().completedSessionsByDay.get(yesterday), "The deadline determines completion date");
        equal(MINUTE, lateClock.save().focusedMillisByDay.get(yesterday), "Yesterday receives the actual minute");
    }

    private static void savedValuesAreDefensive() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountup();
        time.advance(MINUTE);
        clock.snapshot();
        PomodoroClock.State exported = clock.save();
        exported.elapsedMillis = 999;
        exported.focusedMillisByDay.clear();
        equal(MINUTE, clock.snapshot().elapsedMillis, "Exported state cannot mutate live elapsed");
        equal(MINUTE, clock.snapshot().focusedMillisToday, "Exported map cannot mutate live statistics");
        PomodoroClock.State corrupt = new PomodoroClock.State();
        corrupt.durationMinutes = 999;
        corrupt.elapsedMillis = -100;
        corrupt.mode = "unknown";
        PomodoroClock restored = new PomodoroClock(time, corrupt);
        equal(25, restored.durationMinutes(), "Corrupt duration recovers to default");
        equal(0, restored.snapshot().elapsedMillis, "Corrupt elapsed recovers safely");
        check("countdown".equals(restored.snapshot().mode), "Corrupt mode recovers to countdown");
    }

    private static void durationChanges() {
        FakeTime time = new FakeTime();
        PomodoroClock clock = new PomodoroClock(time);
        clock.startCountdown(2);
        time.advance(30 * SECOND);
        clock.setDurationMinutes(3);
        equal(30 * SECOND, clock.snapshot().elapsedMillis, "Changing duration keeps elapsed focus");
        equal(150 * SECOND, clock.snapshot().remainingMillis, "Changing duration updates target");
        time.advance(150 * SECOND);
        check(clock.tick(), "Changed duration completes at the updated deadline");
        clock.setDurationMinutes(25);
        check(!clock.snapshot().running && !clock.snapshot().completed, "Finished timer duration edit prepares idle countdown");
        equal(25 * MINUTE, clock.snapshot().remainingMillis, "Prepared countdown uses new duration");
        equal(1, clock.snapshot().completedSessionsToday, "Duration edit preserves statistics");
    }

    public static void main(String[] arguments) {
        defaultsAndValidation();
        countdownAndSingleDelivery();
        countupHasNoDeadline();
        pauseResumeAndReset();
        processRestart();
        wallClockChanges();
        rebootRecovery();
        beijingDailyStatistics();
        savedValuesAreDefensive();
        durationChanges();
        System.out.println("PomodoroClock: " + assertions + " assertions passed");
    }
}
