package local.gxtodo.replica;

/** Shared notification lifecycle and explicit action policy, independent of Android. */
final class NotificationTimerControls {
    private NotificationTimerControls() {}

    static boolean shouldKeepService(boolean statusEnabled, boolean ballEnabled,
                                     boolean sessionActive, boolean completionPending) {
        return statusEnabled || ballEnabled || sessionActive || completionPending;
    }

    static String command(boolean sessionActive, boolean running, boolean completed) {
        if (!sessionActive || completed) return null;
        return running ? "timer-pause" : "timer-resume";
    }

    static String label(String command) {
        if ("timer-pause".equals(command)) return "暂停";
        if ("timer-resume".equals(command)) return "继续";
        return "";
    }

    static String taskCaption(String title, String accountName) {
        String task = oneLine(title), account = oneLine(accountName);
        if (task.isEmpty()) return "";
        return account.isEmpty() ? task : task + " · " + account;
    }

    private static String oneLine(String value) {
        return value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
    }
}
