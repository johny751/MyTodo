# D2 backup and restoration candidate

## Implemented independent laboratory

FACT (source): the Node SQLite backup tool runs only after the exact Actions SHA/run/RUNNER_TEMP/marker guard. It accepts only generated files within that root. SQLite `backup()` is the online API; arbitrary live main-file copying is not presented as consistent backup. Source and backup are compared by all SQLite tables, original typed cells, REAL bits, schema and user_version. Core meta/outbox, tombstones and all replication state are included.

PROPOSAL (v2 candidate): complete-state backup value identity is explicitly `mytodo-complete-state-v2`, using the same REAL `(type, NULL sentinel, exact bits)` rule as the migration raw contract. Old/missing encoding tags refuse verification rather than being silently reinterpreted. The synthetic factory includes a one-ULP REAL boundary and an unsupported-encoding refusal case. CI3's original 24 successful laboratory cases remain history; the v2 25-case package still requires authoritative revalidation.

FACT (source): common snapshots use a fixture-owned writer barrier covering core database, Android feedback database and original attachment bytes, plus BEGIN IMMEDIATE per database. Backup readers see committed WAL state. A sealed manifest hashes each component, sizes, raw logical identity, source SHA/run and synthetic remote evidence. Restoring only a business projection cannot pass the verifier. Missing/changed database, image or manifest refuses restoration.

FACT (source): B is the sealed backup; S is the complete current local raw state; A is independently supplied remote evidence. Eligible restoration in this laboratory requires a controlled fence, exact S=B and A equal to B's remote snapshot. Unknown or advanced A and any changed Actor/outbox/pending/cursor/manifest/ACK/clock are blocked without changing S. Different Actor or lost pending events do not count as equivalent business data.

FACT (source): same-snapshot activation stages every component, retains the current components, records a restoration journal, activates at the same paths and reopens actual SQLite handles. A new process probes the same database paths. Existing live WAL/SHM/journal bytes refuse activation. Failure injection covers stage, source retention, activation and verification. Recovery checks existing data before proceeding; new progress after an uncertain activation refuses an old backup. Retained originals and journal remain available for audit.

FACT (CI2 failure evidence): a read-only decision probe created WAL/SHM after the fixture writers had closed. The initial laboratory activation correctly refused the sidecars; seven dependent recovery cases failed before their injected boundaries. PROPOSAL (laboratory correction): the fixture now registers successful writer close explicitly. Within that closed-writer fence, a supported SQLite TRUNCATE checkpoint and checked close seal probe-created sidecars, with exact raw snapshot comparison before/after. Busy checkpoint, open registered writer, raw advancement or remaining nonempty sidecar still refuses activation. No direct deletion of live sidecars is introduced. Cloud revalidation remains required.

PROPOSAL: a production restoration implementation should bind a stable Source Snapshot identity, implementation checksum, device/Actor lineage, component hashes and authenticated remote progress in an append-only external recovery audit. SQLite logical evidence and the sealed components must travel together. A complete old snapshot is retained as evidence, not automatically copied over a more advanced current database.

## WAL and SQLite boundaries

PROPOSAL: SQLite online backup or an equivalent supported platform API must capture committed transactions consistently. WAL checkpoint is an explicit managed operation, not a substitute for backup fencing. If any relevant writer remains open or a connection close is busy, activation refuses. Checkpoint/open/close error handling preserves the first failure and cleanup failures. A successful checkpoint does not prove attachments or remote progress belong to the same snapshot.

UNVERIFIED: Windows/Android production online-backup API wiring is not included by the independent Node tool. SQLite backup tests demonstrate the underlying laboratory behavior, not every platform's full restoration API. Windows checked-close and Android same-path reopen are separately exercised by their migration harnesses.

## Interruption and rollback

PROPOSAL: migration rollback is the SQLite transaction before confirmed COMMIT. Unknown COMMIT is resolved by reopening the current database; it is never resolved by copying B over S. Once any successful sync, ACK, outbox addition or remote progress may have occurred, automatic old-file rollback is prohibited. Preserve current state, retain B/journal/attempts, authenticate A, and request an approved reconciliation operation.

FACT (source): the laboratory same-snapshot recovery accepts only the fixed closed-writer window and verifies each retained or active file, raw database identity and fixture remote evidence. It does not change a real remote, issue ACK, resume Actor, clear events or start synchronization.

BLOCKER: no common production barrier has been proven for every business writer, native search maintenance, Android feedback/image writer and sync callback. No authenticated remote A is connected. No production multi-file durable pointer/rename protocol is installed. Directory fsync portability, device power loss, storage exhaustion during every journal write and full application restart are UNVERIFIED. Do not deploy this test-only activation routine into a production caller.

OWNER DECISION: select and approve each platform's real writer lease, consistent backup API, durable component activation strategy and remote evidence authority, with explicit impact and rollback/reconciliation boundaries. No such permission is implied by D2 branch validation.
