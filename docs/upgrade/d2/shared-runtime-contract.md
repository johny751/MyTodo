# D2 shared runtime contract v1

D1 candidate remains `d1-01-candidate.1`. This branch-only first step adds infrastructure and user_version; it does not transform business fields, old SQL projections or replication state.

Step ID: `mytodo-storage-infrastructure-0001`. Source SQLite user_version=0; target=1. Algorithm ID: `mytodo-storage-fingerprint-v1`. These are branch candidates, not approved real-database versions.

All platforms use exactly these DDL statements (no test imports):

```sql
CREATE TABLE storage_migration_registry(migration_id TEXT PRIMARY KEY,checksum TEXT NOT NULL,contract_id TEXT NOT NULL,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,target_schema_fingerprint TEXT NOT NULL,target_raw_fingerprint TEXT NOT NULL,target_user_version INTEGER NOT NULL,source_snapshot_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status='committed'));
CREATE TABLE storage_migration_snapshots(snapshot_id TEXT PRIMARY KEY,source_schema_fingerprint TEXT NOT NULL,source_raw_fingerprint TEXT NOT NULL,source_user_version INTEGER NOT NULL,schema_payload TEXT NOT NULL,raw_payload TEXT NOT NULL);
CREATE TABLE storage_migration_audit(attempt_id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,result TEXT NOT NULL CHECK(result='committed'),implementation_checksum TEXT NOT NULL);
```

Fingerprint encoding is UTF-8 length-prefixed fields: a NULL field is `N;`; a string is `S<byteLength>:<exactUTF8>`. A sequence is the concatenation of these fields, preceded by the algorithm ID and role string encoded the same way. SHA-256 is lowercase hex. Do not serialize numeric cells through JS double/JSONObject/cJSON.

Schema payload role=`schema`: first encode recordCount decimal string, then sqlite_master records including automatic indexes, sorted with BINARY type/name/tbl_name; fields type,name,tbl_name,sql (SQL NULL distinct). Preserve actual SQL text. Source schemas must also pass a fixed known-layout check (core meta/entities/outbox columns and indexes; optional exact Android locale table), not merely fingerprint whatever exists. Target expected objects are source objects plus the six fixed infrastructure table/automatic-index objects. Compare actual target schema to this independently constructed expected payload before commit and on reopen.

Raw payload role=`raw`: only original source tables meta/entities/outbox and the separately recognized Android android_metadata. Fixed table order alphabetical, columns in PRAGMA table_info order. First encode tableCount decimal string; for each table encode table name, columnCount decimal string, column names, rowCount decimal string and each row's typeof(cell), hex(CAST(cell AS BLOB)), and IEEE754 binary64 big-endian 16 lowercase hex digits when typeof=real (NULL for every other type). SQL NULL has NULL hex. REAL bits are read using each platform's actual double API; integer values are never routed through double. CAST decimal text alone is insufficient for REAL precision. Order rows by their complete encoded row bytes (UTF-8 binary). This preserves every original TEXT byte, SQL storage type and scalar string representation, including raw meta/outbox/record/conflicts/deleted. Infrastructure rows are excluded from current raw digest. Empty tables and their column identities are retained.

snapshot_id = SHA-256 of encoded algorithm ID, `snapshot`, source schema hash, source raw hash, source user_version decimal string. Capture and store immutable schema/raw payloads plus these hashes. Implementation checksum is a build-bound digest of production implementation source bytes plus the fixed plan/algorithm identity; no fabricated hard-coded source hash. Missing/unrecorded build identity refuses a run. Tests may supply the checked build identity; normal app startup is not wired to call migration.

Single BEGIN IMMEDIATE/Android exclusive transaction: recheck source snapshot under the transaction; create fixed tables; persist source snapshot; verify unchanged original raw digest and independently expected target schema; insert committed registry and successful audit; set user_version=1; COMMIT. No Actor/seq/clock/cursor/pending/outbox/manifest/ACK mutation. External caller-owned attempt audit records the first error and rollback error, and survives rollback/process exit. Observer/fault callback is optional diagnostic infrastructure; test definitions live only under tests/d2.

Repeat fixed-window execution requires migration/checksum/contract/version/target schema and immutable snapshot hashes to match. If current raw data advanced, return blockedDataAdvanced without modifying anything (never rerun or roll back old data). This preserves the accepted D1 strict snapshot policy; normal-startup no-op after later edits is an OWNER DECISION for a future production activation design.

Unknown COMMIT: never blindly retry. Reopen the same database path with a new actual platform handle. Exact committed registry/snapshot/version/target schema/raw confirms committed; exact original schema/version/raw with no registry confirms notCommitted. Later writes/ACK or any partial/ambiguous combination preserves current state and returns blockedUnknown/blockedDataAdvanced, with both attempts retained. Do not restore an older B file. These outcomes do not grant Actor/sync resumption.

Production entry adapters may expose explicit manual methods and checked close, but no constructor/startup migration. Explicit-column INSERT changes keep the existing bind values, CAS, transaction, ACK/outbox and deletion semantics. Actual APIs and errors must be tested independently on each platform. D1 Python reference is comparison context, not production evidence.
