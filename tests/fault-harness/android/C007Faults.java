package local.gxtodo.replica;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONObject;

/** Test package only. Uses the actual ReplicaDatabase handle supplied by the existing reflection seam.
 * This class never pretends an unsupported injection succeeded. The C007 test shell wires it;
 * production classes never reference this helper. */
final class C007Faults {
    private String viewTable;
    private static String quote(String value) { return "'" + value.replace("'", "''") + "'"; }
    private static void allowTable(String table) {
        if (!table.equals("meta") && !table.equals("entities") && !table.equals("outbox"))
            throw new IllegalArgumentException("C007 table outside allowlist");
    }
    JSONObject arm(SQLiteDatabase db, JSONObject spec) throws Exception {
        if (db.inTransaction()) throw new IllegalStateException("Arm faults outside the production transaction");
        String kind = spec.optString("kind", "none"), table = spec.optString("table", "meta");
        allowTable(table);
        if (kind.equals("none")) return new JSONObject().put("armed", false);
        if (kind.equals("prepare-fail") || kind.equals("read-overflow")) {
            // Persistent diagnostic view is intentional: Android WAL uses a connection pool.
            // Preserve and restore the same original table; never create a replacement database.
            String bad = kind.equals("prepare-fail") ? "c007_missing_function()" : "abs(-9223372036854775808)";
            String columns;
            if (table.equals("meta")) columns = "id,CASE WHEN id=1 THEN " + bad + " ELSE value END AS value";
            else if (table.equals("outbox")) columns = "id,CASE WHEN id=1 THEN " + bad + " ELSE event END AS event";
            else {
                String id = spec.getString("id");
                columns = "key,kind,id,CASE WHEN id=" + quote(id) + " THEN " + bad + " ELSE data END AS data,record,deleted,conflicts,parent_id,done,quadrant,reminder_at,start";
            }
            db.beginTransaction();
            try {
                db.execSQL("ALTER TABLE " + table + " RENAME TO c007_original_" + table);
                db.execSQL("CREATE VIEW " + table + " AS SELECT " + columns + " FROM c007_original_" + table);
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            viewTable = table;
            return new JSONObject().put("armed", true).put("kind", kind).put("mechanism", "actual persistent SQLite diagnostic view");
        }
        if (kind.equals("commit-deferred-fk")) {
            db.setForeignKeyConstraintsEnabled(true);
            try (Cursor check = db.rawQuery("PRAGMA foreign_keys", null)) {
                if (!check.moveToFirst() || check.getInt(0) != 1) throw new IllegalStateException("Foreign keys not enabled");
            }
            db.execSQL("CREATE TABLE c007_parent(id INTEGER PRIMARY KEY)");
            db.execSQL("CREATE TABLE c007_child(id INTEGER REFERENCES c007_parent(id) DEFERRABLE INITIALLY DEFERRED)");
            db.execSQL("CREATE TRIGGER c007_deferred AFTER UPDATE ON meta BEGIN INSERT INTO c007_child(id) VALUES(1); END");
        } else {
            String verb = kind.equals("insert-abort") ? "INSERT" : kind.equals("update-abort") ? "UPDATE" : kind.equals("delete-abort") ? "DELETE" : null;
            if (verb == null) throw new IllegalArgumentException("Unsupported C007 Android SQLite fault");
            String predicate = spec.has("id") && table.equals("entities") && !verb.equals("DELETE") ? " WHEN NEW.id=" + quote(spec.getString("id")) : "";
            db.execSQL("CREATE TRIGGER c007_abort BEFORE " + verb + " ON " + table + predicate + " BEGIN SELECT RAISE(ABORT,'C007_SQL_STEP_ABORT'); END");
        }
        return new JSONObject().put("armed", true).put("kind", kind).put("mechanism", "actual persistent SQLite trigger");
    }
    void clear(SQLiteDatabase db) {
        if (db.inTransaction()) throw new IllegalStateException("Cannot clear evidence faults inside a pending transaction");
        db.execSQL("DROP TRIGGER IF EXISTS c007_abort");
        db.execSQL("DROP TRIGGER IF EXISTS c007_deferred");
        db.execSQL("DROP TABLE IF EXISTS c007_child");
        db.execSQL("DROP TABLE IF EXISTS c007_parent");
        if (viewTable != null) {
            db.beginTransaction();
            try {
                db.execSQL("DROP VIEW " + viewTable);
                db.execSQL("ALTER TABLE c007_original_" + viewTable + " RENAME TO " + viewTable);
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            viewTable = null;
        }
    }
}
