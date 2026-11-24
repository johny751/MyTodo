# D2 implementation candidate architecture

Updated 2026-11-24 Asia/Shanghai. This is a branch candidate under owner review. All conclusions use FACT, PROPOSAL, UNVERIFIED, OWNER DECISION or BLOCKER; implementation presence and Actions validation are separate evidence.

## Accepted baseline and stop boundary

FACT: owner accepted `D1-01 CLOSED — Candidate Contract and Isolated Validation Completed`. Release `d4c5af4cbbb9192c19276dd371bd142c2b835534`, D1 validated source `8239d39220d940bf9c047a1dcaffd2a831cca2fc`, Actions `45367557986`. D1 documents, historical failures, UNVERIFIED, OWNER DECISION and BLOCKER remain in place. Android issue #1 stays open. D1 synthetic validation did not certify production migration.

FACT: D2 work is isolated on `d2/implementation-candidate-1` from the accepted release. Owner permits necessary production branch changes, independent tools, synthetic databases and GitHub Actions. No merge to master/main, real database access, synchronization activation, LAN/WebDAV tests, dual channel, or ACK/outbox/cursor/manifest/batch semantics changes are authorized. Compilation, tests and executable packaging take place only in Actions.

## One implementation contract

PROPOSAL: the first manual step is `mytodo-storage-infrastructure-0001`, contract `d1-01-candidate.1`, algorithm `mytodo-storage-fingerprint-v1`, SQLite user_version 0→1. It adds only the three Registry/Snapshot/Audit tables from [shared-runtime-contract.md](shared-runtime-contract.md). No business normalization, project relinking, time conversion, tombstone pruning or event rewriting occurs. This small infrastructure step establishes the machinery before semantic migrations.

FACT (source): Windows C uses the existing `db_open/db_put/db_begin/db_end` adapter; Node uses `createSQLiteStore.call`; Android uses `ReplicaDatabase` and Framework SQLite. Migration implementation modules live under production source paths and expose explicit manual APIs. Test fixtures/fault definitions/build drivers live only under `tests/d2`. No startup migration call or production import of tests is permitted. Platform adapter documents identify the exact source APIs and limitations.

PROPOSAL: each manual request binds the Migration ID, contract/algorithm IDs, implementation checksum and immutable source snapshot. Build identity is derived from actual implementation/dependency source bytes plus plan identity, rather than a made-up constant. Source and target schema fingerprints retain sqlite_master SQL bytes, all automatic indexes and NULL SQL. The independent expected target is the source plus exactly six infrastructure objects. Source SQL/columns/indexes must also match the fixed reviewed layout whitelist. Hashing an arbitrary schema does not authorize migration.

PROPOSAL: raw snapshots preserve original SQLite storage type, CAST-to-BLOB bytes, REAL IEEE754 bits, original record/conflicts/meta/outbox bytes, and NULL independently from empty string. The shared fixture includes tombstones, pending events, missing relationships, invalid historical scalars, BLOB, Unicode, 64-bit integer and a one-ULP REAL boundary. These are synthetic boundary specimens, not assertions about the frequency or interpretation of real historic data.

## Transaction, errors and recovery

PROPOSAL: one IMMEDIATE transaction (Android exclusive equivalent) rechecks the source, creates infrastructure, records source snapshot, verifies raw values and independently expected schema, writes committed Registry/audit and user_version, then commits. A caller-owned external attempt sink preserves failures even when the database transaction rolls back. Cleanup errors must remain secondary to the first error.

PROPOSAL: repeated execution requires exact committed identity and raw snapshot. Later data/replication progress yields `blockedDataAdvanced`; no repeat transformation, backup replacement or fabricated success. An unknown COMMIT result requires close and a new actual platform handle on the same database path. Exact old state confirms not committed; exact new state confirms committed; mixed/advanced/uncertain state is preserved and blocked.

OWNER DECISION: accepted D1 strict fixed-window retry behavior blocks after later ordinary edits. A future normal-startup no-op policy requires a separate approved contract and evidence; this branch does not silently relax D1.

## Backup and test lanes

FACT (source): `tests/d2/backup-recovery.mjs` provides an independent Actions-only SQLite online backup and controlled common-snapshot laboratory. `backup-runner.mjs` tests committed WAL visibility, exclusions of uncommitted writes, component integrity, complete raw replication state, same-path restoration, fresh-process recheck and interruptions. It has no production restoration call site.

PROPOSAL: future production backup must fence every database and attachment writer, capture core/feedback/attachments plus replication progress, and perform B/S/A eligibility before any activation. Current local or remote advancement refuses an old backup. [backup-restore-implementation.md](backup-restore-implementation.md) distinguishes implemented laboratory behavior from production requirements.

FACT (source): Actions builds Windows actual C storage sources and Android's actual production SQLite closure in a dedicated no-INTERNET test APK; Node uses its actual production store. The independent cross comparer checks raw core equivalence across ends, per-end locale metadata separately, exact source snapshots, target schema, Registry/checksum and version. Failure artifacts are uploaded with `always()`; a process exit code alone cannot certify Android success.

UNVERIFIED until an authoritative run receipt is collected: compilation and pass counts for this candidate. The final review report records exact SHA/run/attempt and every retained failed run. Source inspection is not described as runtime validation.

## Gates to production

BLOCKER: actual user schema versions and unknown history are unverified. Windows GUI search/index/trigger extensions are rejected by the core-only known-layout check. No source layout is silently converted to pass.

BLOCKER: existing platform constructors/openers may create legacy tables/indexes or initial meta. A future real migration must obtain read-only preflight and writer fencing before such startup effects; testing explicit manual migration after synthetic opener initialization does not establish this gate.

BLOCKER: production build identity distribution, all-writer cross-file barrier, authenticated remote B/S/A evidence, durable multi-file activation and post-activation side-effect fencing are not integrated or enabled. True device power loss, full release app lifecycles and production databases are unverified.

OWNER DECISION: approve exact production operation scope only after reviewing unified evidence and the decision checklist. This work ends at concentrated delivery; no real migration or synchronization enablement follows automatically.
