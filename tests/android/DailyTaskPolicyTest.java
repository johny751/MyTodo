package local.gxtodo.replica;

import java.time.Instant;
import java.util.TimeZone;

public final class DailyTaskPolicyTest {
    private static final DailyTaskPolicy TODAY = new DailyTaskPolicy("2026-11-01");
    private static int assertions;

    private static void equal(Object expected, Object actual, String message) {
        assertions++;
        if (!expected.equals(actual)) throw new AssertionError(message + ": expected " + expected + ", got " + actual);
    }

    private static void flags(int expected, boolean done, boolean deleted, String start, String until, String completedAt, String message) {
        equal(expected, TODAY.evaluate(done, deleted, start, until, completedAt), message);
    }

    private static void pendingAndOverdue() {
        flags(DailyTaskPolicy.PENDING, false, false, "", "", "", "An undated task is pending today");
        flags(DailyTaskPolicy.PENDING, false, false, null, null, null, "Null dates are undated");
        flags(DailyTaskPolicy.PENDING, false, false, "2026-11-01T23:59", "", "", "Any planned time today is pending");
        flags(DailyTaskPolicy.PENDING | DailyTaskPolicy.OVERDUE, false, false, "2026-10-31T23:59", "", "", "Older unfinished tasks are pending and overdue");
        flags(0, false, false, "2026-11-02T00:00", "", "", "Future tasks are excluded");
        flags(0, false, true, "2026-10-01T09:00", "", "", "Deleted tasks are excluded");
        flags(0, true, false, "2026-10-01T09:00", "", "", "Done tasks without today's completion are not pending or overdue");
        flags(DailyTaskPolicy.PENDING, false, false, "2026-11-01", "", "", "Date-only planned tasks are included");
        flags(DailyTaskPolicy.PENDING, false, false, " 2026-11-01T09:00 ", "", "", "Whitespace is normalized");
        flags(DailyTaskPolicy.PENDING, false, false, "", "", "2026-11-01T09:00", "Reopened task is pending rather than completed");
    }

    private static void repeatCutoff() {
        flags(DailyTaskPolicy.PENDING, false, false, "", "2026-11-01", "", "Repeat cutoff includes today");
        flags(DailyTaskPolicy.PENDING, false, false, "", "2026-11-02", "", "A future cutoff includes today");
        flags(0, false, false, "", "2026-10-31", "", "Repeat ended yesterday is excluded from pending");
        flags(DailyTaskPolicy.OVERDUE, false, false, "2026-10-30T09:00", "2026-10-31", "", "Overdue is independent of repeat cutoff");
        flags(0, false, false, "2026-11-02T09:00", "2026-12-01", "", "Repeat cutoff does not include future planned tasks");
        flags(DailyTaskPolicy.COMPLETED, true, false, "2026-10-30T09:00", "2026-10-31", "2026-11-01T12:00", "Actual completion ignores repeat cutoff");
    }

    private static void actualCompletionDate() {
        flags(DailyTaskPolicy.COMPLETED, true, false, "2026-10-01T09:00", "", "2026-11-01T09:00", "Completing an old planned task counts today");
        flags(DailyTaskPolicy.COMPLETED, true, false, "2026-11-10T09:00", "", "2026-11-01T09:00", "Early completion counts the actual day");
        flags(0, true, false, "2026-11-01T09:00", "", "2026-10-31T09:00", "Plan date cannot replace actual completion date");
        flags(0, true, true, "2026-11-01T09:00", "", "2026-11-01T09:00", "Deleted completions are excluded");
        flags(0, true, false, "", "", "", "Missing actual completion time is excluded");
        flags(0, true, false, "", "", "broken", "Malformed completion time is excluded");
        flags(0, true, false, "", "", "2026-02-30T09:00", "Invalid calendar completion is excluded");
        flags(DailyTaskPolicy.COMPLETED, true, false, "", "", "2026-11-01T00:00", "Naive minute timestamp uses Beijing");
        flags(DailyTaskPolicy.COMPLETED, true, false, "", "", "2026-11-01T23:59:59.999", "Naive fractional timestamp uses Beijing");
        flags(DailyTaskPolicy.COMPLETED, true, false, "", "", "2026-11-01 12:30:00", "Legacy space timestamp uses Beijing");
    }

    private static void utcAndOffsets() {
        equal("2026-10-31", DailyTaskPolicy.completedDay("2026-10-31T15:59:59.999Z"), "UTC before Beijing midnight");
        equal("2026-11-01", DailyTaskPolicy.completedDay("2026-10-31T16:00:00Z"), "UTC midnight boundary converts to Beijing");
        equal("2026-11-01", DailyTaskPolicy.completedDay("2026-11-01T15:59:59.999Z"), "UTC last instant of Beijing day");
        equal("2026-11-02", DailyTaskPolicy.completedDay("2026-11-01T16:00:00Z"), "UTC next Beijing day is excluded");
        flags(DailyTaskPolicy.COMPLETED, true, false, "", "", "2026-10-31T16:00:00Z", "UTC previous calendar date can complete today");
        flags(0, true, false, "", "", "2026-11-01T16:00:00Z", "UTC calendar date today can complete tomorrow");
        equal("2026-11-01", DailyTaskPolicy.completedDay("2026-11-01T00:00:00+08:00"), "Beijing offset keeps date");
        equal("2026-11-01", DailyTaskPolicy.completedDay("2026-10-31T23:30:00+02:00"), "Positive offset is converted rather than sliced");
        equal("2026-11-02", DailyTaskPolicy.completedDay("2026-11-01T23:30:00-04:00"), "Negative offset can move completion to next day");
        equal("2026-11-01", DailyTaskPolicy.completedDay("2026-11-01T01:30:00+08:00[Asia/Shanghai]"), "ISO zoned timestamps retain actual instant");
    }

    private static void calendarAndDeviceTimezone() {
        equal("2026-11-02", TODAY.tomorrow(), "SQL boundary is tomorrow");
        equal("2027-01-01", new DailyTaskPolicy("2026-12-31").tomorrow(), "Year boundary");
        equal("2028-02-29", new DailyTaskPolicy("2028-02-28").tomorrow(), "Leap day boundary");
        equal("2027-03-01", new DailyTaskPolicy("2027-02-28").tomorrow(), "Non-leap boundary");
        TimeZone previous = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
            equal("2026-11-01", DailyTaskPolicy.dayAt(Instant.parse("2026-10-31T16:00:00Z").toEpochMilli()), "Device timezone cannot change Beijing day");
            equal("2026-11-01", DailyTaskPolicy.completedDay("2026-11-01T00:00"), "Device timezone cannot change naive completion day");
        } finally {
            TimeZone.setDefault(previous);
        }
    }

    private static void independentNestedRows() {
        DailyTaskPolicy.Counts counts = new DailyTaskPolicy.Counts();
        // A completed root, pending child and completed grandchild each contribute independently.
        counts.add(TODAY.evaluate(true, false, "2026-10-31T09:00", "", "2026-11-01T10:00"));
        counts.add(TODAY.evaluate(false, false, "2026-10-31T09:00", "", ""));
        counts.add(TODAY.evaluate(true, false, "2026-11-10T09:00", "", "2026-10-31T16:01:00Z"));
        counts.add(TODAY.evaluate(false, true, "", "", "")); // Deleted sibling.
        equal(1, counts.pending, "Nested pending task is independent of parent completion");
        equal(2, counts.completed, "Nested completions are counted individually");
        equal(1, counts.overdue, "Nested overdue task is counted");

        DailyTaskPolicy.Counts large = new DailyTaskPolicy.Counts();
        for (int index = 0; index < 100000; index++) {
            large.add(TODAY.evaluate(false, false, "", "", ""));
        }
        equal(100000, large.pending, "No 10000-task cap");
        equal(0, large.completed, "Large pending set adds no completions");
    }

    public static void main(String[] arguments) {
        pendingAndOverdue();
        repeatCutoff();
        actualCompletionDate();
        utcAndOffsets();
        calendarAndDeviceTimezone();
        independentNestedRows();
        System.out.println("DailyTaskPolicy: " + assertions + " assertions passed");
    }
}
