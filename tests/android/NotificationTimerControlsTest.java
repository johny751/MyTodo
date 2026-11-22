package local.gxtodo.replica;

public final class NotificationTimerControlsTest {
    private static int assertions;
    private static void check(boolean actual, String message) {
        assertions++;
        if (!actual) throw new AssertionError(message);
    }
    private static void equal(String expected, String actual, String message) {
        check(expected == null ? actual == null : expected.equals(actual), message + ": " + actual);
    }
    private static void runningAndPaused() {
        check(NotificationTimerControls.shouldKeepService(false, false, true, false), "A running session retains its notification with status and ball off");
        equal("timer-pause", NotificationTimerControls.command(true, true, false), "A running session has an explicit pause action");
        equal("暂停", NotificationTimerControls.label("timer-pause"), "Pause label");
        check(NotificationTimerControls.shouldKeepService(false, false, true, false), "A paused session retains its notification, including an immediate pause at zero elapsed time");
        equal("timer-resume", NotificationTimerControls.command(true, false, false), "A paused session has an explicit resume action");
        equal("继续", NotificationTimerControls.label("timer-resume"), "Resume label");
        check(!NotificationTimerControls.command(true, true, false).equals(NotificationTimerControls.command(true, false, false)), "Pause and resume use distinct commands rather than toggling current state");
    }
    private static void completionAndReset() {
        equal(null, NotificationTimerControls.command(false, false, true), "Completion removes timer controls");
        equal(null, NotificationTimerControls.command(true, false, true), "Completion wins over a stale active flag");
        check(NotificationTimerControls.shouldKeepService(false, false, false, true), "A recovered completion is retained until delivery");
        check(!NotificationTimerControls.shouldKeepService(false, false, false, false), "An inactive session releases the foreground notification after completion delivery");
        equal(null, NotificationTimerControls.command(false, false, false), "Reset and idle states have no resume action");
        equal(null, NotificationTimerControls.command(false, true, false), "An inactive snapshot does not expose a stale running action");
        check(NotificationTimerControls.shouldKeepService(true, false, false, false), "Status shortcuts remain after completion or reset");
        check(NotificationTimerControls.shouldKeepService(false, true, false, false), "Floating controls retain the minimal notification after reset");
        equal("", NotificationTimerControls.label(null), "Inactive states have no control label");
    }
    private static void taskCaptions() {
        equal("准备发布 · 工作账号", NotificationTimerControls.taskCaption("准备发布", "工作账号"), "Associated task keeps its original account label");
        equal("准备发布", NotificationTimerControls.taskCaption("准备发布", ""), "A task can be shown without an account label");
        equal("准备 发布 · 工作 账号", NotificationTimerControls.taskCaption("准备\n发布", "工作\r账号"), "Task and account captions fit one line");
        equal("", NotificationTimerControls.taskCaption(null, "工作账号"), "No task title means no association caption");
    }
    public static void main(String[] args) {
        runningAndPaused();
        completionAndReset();
        taskCaptions();
        System.out.println("Notification timer controls: " + assertions + " assertions passed");
    }
}
