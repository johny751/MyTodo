package local.gxtodo.replica;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayDeque;
import java.util.Deque;

/** Load off the UI thread; the service caches this result between refreshes. */
public final class DailyTaskSummary {
    private DailyTaskSummary() {}

    public static JSONObject load(Context context) {
        String accountName = "当前账号";
        try {
            AccountStore store = AccountStore.get(context);
            final String accountId;
            final ReplicaDatabase database;
            // Capture name and ID together, then release the account lock before the query.
            synchronized (store) {
                accountId = store.active();
                accountName = store.activeName();
                database = store.database(accountId);
            }
            String today = DailyTaskPolicy.today();
            if (database.initialized()) {
                return database.dailySummary(today).put("accountName", accountName);
            }
            String text = store.read(accountId);
            DailyTaskPolicy policy = new DailyTaskPolicy(today);
            DailyTaskPolicy.Counts counts = new DailyTaskPolicy.Counts();
            if (!text.isEmpty()) {
                JSONArray roots = new JSONObject(text).optJSONArray("tasks");
                if (roots != null) countLegacy(roots, policy, counts);
            }
            return result(counts.pending, counts.completed, counts.overdue, accountName);
        } catch (Exception error) {
            JSONObject result = result(0, 0, 0, accountName);
            try {
                String message = error.getMessage();
                result.put("error", message == null || message.isEmpty()
                    ? error.getClass().getSimpleName() : message);
            } catch (JSONException ignored) {}
            return result;
        }
    }

    private static final class Frame {
        final JSONArray tasks;
        int next;
        Frame(JSONArray tasks) { this.tasks = tasks; }
    }

    /** Visit every nested task without copying all entries into a second flat array. */
    private static void countLegacy(JSONArray roots, DailyTaskPolicy policy, DailyTaskPolicy.Counts counts) {
        Deque<Frame> stack = new ArrayDeque<>();
        stack.push(new Frame(roots));
        while (!stack.isEmpty()) {
            Frame frame = stack.peek();
            if (frame.next >= frame.tasks.length()) {
                stack.pop();
                continue;
            }
            JSONObject task = frame.tasks.optJSONObject(frame.next++);
            if (task == null) continue;
            JSONObject repeat = task.optJSONObject("repeat");
            counts.add(policy.evaluate(task.optBoolean("done"), task.optBoolean("deleted"),
                task.optString("start", ""), repeat == null ? "" : repeat.optString("until", ""),
                task.optString("completedAt", "")));
            JSONArray children = task.optJSONArray("subtasks");
            if (children != null && children.length() > 0) stack.push(new Frame(children));
        }
    }

    private static JSONObject result(int pending, int completed, int overdue, String accountName) {
        try {
            return new JSONObject().put("pending", pending).put("completed", completed)
                .put("overdue", overdue).put("accountName", accountName);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
