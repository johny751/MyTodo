package local.gxtodo.replica;

import org.json.JSONObject;

/** Shared original task read projection; no account router or storage mock. */
final class ReplicaTaskRecord {
    private ReplicaTaskRecord() {}
    static JSONObject taskRecord(JSONObject task, String inheritedParent) throws Exception {
        String parent = task.isNull("parentId") ? inheritedParent : task.optString("parentId", inheritedParent);
        return new JSONObject().put("id", task.getString("id"))
            .put("title", task.optString("title", "").isEmpty() ? "未命名任务" : task.optString("title"))
            .put("done", task.optBoolean("done"))
            .put("parentId", parent == null || parent.isEmpty() ? JSONObject.NULL : parent);
    }
}
