package local.gxtodo.replica;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;

/** Bounded task selection for Android tools; every result carries its owning account. */
public final class PomodoroTasks {
    private PomodoroTasks() {}

    public static JSONObject search(Context context, String query, int limit) throws Exception {
        int maximum = Math.max(1, Math.min(100, limit));
        String needle = query == null ? "" : query.trim();
        if (needle.length() > 256) needle = needle.substring(0, 256);
        AccountStore store = AccountStore.get(context);
        final String accountId, accountName;
        final ReplicaDatabase database;
        synchronized (store) {
            accountId = store.active();
            accountName = store.activeName();
            database = store.database(accountId);
        }
        JSONObject result;
        if (database.initialized()) {
            result = database.searchPomodoroTasks(needle, maximum);
        } else {
            String text = store.read(accountId);
            JSONArray roots = text.isEmpty() ? null : new JSONObject(text).optJSONArray("tasks");
            result = searchLegacy(roots, needle, maximum);
        }
        return result.put("accountId", accountId).put("accountName", accountName);
    }

    /** Resolve in the named account, including when the timer survives an account switch. */
    public static JSONObject resolve(Context context, String accountId, String taskId) throws Exception {
        if (taskId == null || taskId.isEmpty()) return null;
        AccountStore store = AccountStore.get(context);
        final ReplicaDatabase database;
        final String accountName;
        synchronized (store) {
            database = store.database(accountId); // validates the account before reading its directory
            JSONArray accounts = store.manage(new JSONObject().put("op", "list")).getJSONArray("accounts");
            String name = "关联账号";
            for (int i = 0; i < accounts.length(); i++) {
                JSONObject account = accounts.getJSONObject(i);
                if (accountId.equals(account.getString("id"))) { name = account.getString("name"); break; }
            }
            accountName = name;
        }
        JSONObject task;
        if (database.initialized()) {
            task = database.resolvePomodoroTask(taskId);
        } else {
            String text = store.read(accountId);
            task = findLegacy(text.isEmpty() ? null : new JSONObject(text).optJSONArray("tasks"), taskId);
        }
        return task == null ? null : task.put("accountId", accountId).put("accountName", accountName);
    }

    private static final class Frame {
        final JSONArray tasks;
        final String parentId;
        int next;
        Frame(JSONArray tasks, String parentId) { this.tasks = tasks; this.parentId = parentId; }
    }

    static JSONObject searchLegacy(JSONArray roots, String query, int limit) throws Exception {
        int maximum = Math.max(1, Math.min(100, limit));
        JSONArray selected = new JSONArray();
        String needle = (query == null ? "" : query.trim()).toLowerCase(Locale.ROOT);
        // Match SQLite ordering: unfinished tasks first, then completed tasks.
        for (int donePass = 0; donePass < 2 && selected.length() <= maximum; donePass++) {
            if (roots == null) break;
            Deque<Frame> stack = new ArrayDeque<>();
            stack.push(new Frame(roots, ""));
            while (!stack.isEmpty() && selected.length() <= maximum) {
                Frame frame = stack.peek();
                if (frame.next >= frame.tasks.length()) { stack.pop(); continue; }
                JSONObject task = frame.tasks.optJSONObject(frame.next++);
                if (task == null) continue;
                String id = task.optString("id", "");
                if (!task.optBoolean("deleted") && !id.isEmpty()
                        && task.optBoolean("done") == (donePass == 1)
                        && task.optString("title", "").toLowerCase(Locale.ROOT).contains(needle)) {
                    selected.put(taskRecord(task, frame.parentId));
                }
                JSONArray children = task.optJSONArray("subtasks");
                if (children != null && children.length() > 0) stack.push(new Frame(children, id));
            }
        }
        boolean hasMore = selected.length() > maximum;
        if (hasMore) selected.remove(selected.length() - 1);
        return new JSONObject().put("tasks", selected).put("hasMore", hasMore);
    }

    static JSONObject findLegacy(JSONArray roots, String id) throws Exception {
        if (roots == null) return null;
        Deque<Frame> stack = new ArrayDeque<>();
        stack.push(new Frame(roots, ""));
        while (!stack.isEmpty()) {
            Frame frame = stack.peek();
            if (frame.next >= frame.tasks.length()) { stack.pop(); continue; }
            JSONObject task = frame.tasks.optJSONObject(frame.next++);
            if (task == null) continue;
            String taskId = task.optString("id", "");
            if (!task.optBoolean("deleted") && id.equals(taskId)) return taskRecord(task, frame.parentId);
            JSONArray children = task.optJSONArray("subtasks");
            if (children != null && children.length() > 0) stack.push(new Frame(children, taskId));
        }
        return null;
    }

    static JSONObject taskRecord(JSONObject task, String inheritedParent) throws Exception {
        return ReplicaTaskRecord.taskRecord(task, inheritedParent);
    }
}
