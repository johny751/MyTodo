package local.gxtodo.replica;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAccessor;

/** Pure daily counting rules; planned task dates are Beijing-local calendar dates. */
public final class DailyTaskPolicy {
    public static final ZoneId BEIJING = ZoneId.of("Asia/Shanghai");
    public static final int PENDING = 1;
    public static final int COMPLETED = 2;
    public static final int OVERDUE = 4;

    private final String today;
    private final String tomorrow;

    public DailyTaskPolicy(String today) {
        LocalDate date = LocalDate.parse(today);
        this.today = date.toString();
        tomorrow = date.plusDays(1).toString();
    }

    public static String today() {
        return LocalDate.now(BEIJING).toString();
    }

    public static String dayAt(long epochMillis) {
        return Instant.ofEpochMilli(epochMillis).atZone(BEIJING).toLocalDate().toString();
    }

    public String tomorrow() {
        return tomorrow;
    }

    /**
     * Bits describe one task independently of its parent. Completion uses actual
     * completedAt, while today's pending list includes older unfinished tasks.
     */
    public int evaluate(boolean done, boolean deleted, String start, String repeatUntil, String completedAt) {
        if (deleted) return 0;
        if (done) return today.equals(completedDay(completedAt)) ? COMPLETED : 0;
        String plannedDay = datePrefix(start);
        String until = clean(repeatUntil);
        int flags = 0;
        if ((plannedDay.isEmpty() || plannedDay.compareTo(today) <= 0)
                && (until.isEmpty() || until.compareTo(today) >= 0)) {
            flags |= PENDING;
        }
        if (!plannedDay.isEmpty() && plannedDay.compareTo(today) < 0) flags |= OVERDUE;
        return flags;
    }

    /** ISO instants/offsets are converted to Beijing; timestamps without an offset are Beijing-local. */
    public static String completedDay(String value) {
        String text = clean(value);
        if (text.isEmpty()) return "";
        if (text.length() > 10 && text.charAt(10) == ' ') {
            text = text.substring(0, 10) + "T" + text.substring(11);
        }
        try {
            TemporalAccessor parsed = DateTimeFormatter.ISO_DATE_TIME.parseBest(text,
                ZonedDateTime::from, OffsetDateTime::from, LocalDateTime::from);
            if (parsed instanceof ZonedDateTime) {
                return ((ZonedDateTime) parsed).withZoneSameInstant(BEIJING).toLocalDate().toString();
            }
            if (parsed instanceof OffsetDateTime) {
                return ((OffsetDateTime) parsed).atZoneSameInstant(BEIJING).toLocalDate().toString();
            }
            return ((LocalDateTime) parsed).toLocalDate().toString();
        } catch (DateTimeParseException invalid) {
            return "";
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String datePrefix(String value) {
        String text = clean(value);
        return text.length() > 10 ? text.substring(0, 10) : text;
    }

    /** A fixed-size accumulator avoids allocating an object per database row. */
    public static final class Counts {
        public int pending;
        public int completed;
        public int overdue;

        public void add(int flags) {
            if ((flags & PENDING) != 0) pending++;
            if ((flags & COMPLETED) != 0) completed++;
            if ((flags & OVERDUE) != 0) overdue++;
        }
    }
}
