# D2 implementation preparation — unified review

## Result and evidence boundary

FACT: the authorized branch-development and isolated-validation package is complete. Validated source: `d86aecd56a1c0dfa4d66a982703b3c93bdc5e9d7`; [Actions 45425446577](https://github.com/johny751/MyTodo/actions/runs/45425446577), attempt 1, conclusion success. Source scope, Windows, Node, Android, backup and independent comparison jobs all succeeded. Seven official artifact ZIPs, eleven selected raw receipts and the original job log ZIP are preserved under `evidence/run-45425446577/`, with official SHA-256 digests verified before preservation.

FACT: D1 owner acceptance remains `D1-01 CLOSED — Candidate Contract and Isolated Validation Completed`, release `d4c5af4cbbb9192c19276dd371bd142c2b835534`, D1 source `8239d39220d940bf9c047a1dcaffd2a831cca2fc`, Actions `45367557986`. Its history, unresolved decisions and blockers remain in place. D1 validation did not certify production migration. Android issue #1 remains open.

FACT: production candidate code is confined to `d2/implementation-candidate-1`; no master/main merge, real user database access, real migration, synchronization activation, LAN/WebDAV test or dual channel occurred. Existing ACK/outbox/cursor/manifest/batch semantics were not rewritten. All project compilation, SQLite execution, tests and executable packaging took place in GitHub Actions. Codespaces handled Git and evidence files; local preparation handled text, hashes and archives.

## Actual validation

| Lane | Authoritative raw receipt | Passed / failed | What it establishes |
|---|---|---:|---|
| FACT: Windows C | `results.json` in d2-windows artifact | 30 / 0 | Actual db_open/db_put/db_local/transaction/checked-close/manual migration/reopen APIs; raw and schema checks, retry, faults and two real process exits |
| FACT: Node SQLite | `node-report.json` | 16 / 0 | Actual createSQLiteStore.call, named columns, preserved ACK behavior, manual Registry, raw oracle, unknown response and hard process termination/reopen |
| FACT: Android Framework SQLite | `android-storage-receipt.json` | 11 / 0 | Actual ReplicaDatabase/ContentValues/transactions/new same-path handles and manual Registry inside a separate no-INTERNET test APK |
| FACT: independent backup laboratory | `backup-results.json` | 25 / 0 | Committed WAL visibility, uncommitted exclusion, complete core/feedback/attachment snapshot, B/S/A refusal, same-path recovery, fresh-process probe and repeated execution |
| FACT: independent cross comparer | `comparison-results.json` | 7 / 0 | Per-platform source/target identity, original raw values, exact Registry/snapshot/audit, source-plus-six target schema, producer identity and three core comparisons |
| FACT: static source gate | `source-scope-receipt.json` | passed | Six frozen baseline byte identities, fourteen permitted production paths, no production test imports and Git diff checks |

FACT: these are 89 successful named runtime/comparison cases, with zero failures in their final raw reports. Android's separate positive-capture unit tests are additional evidence in its retained TAP logs. Source/build/run/attempt/checksum validation is explicit for the three production API producers. The comparison gate currently uses `cases.length` for Android and backup totals; their actual 11 and 25 counts above come from the authoritative receipts, not a claim that those gate totals are hard-coded.

## Concentrated deliverables

| Requested item | Delivered candidate implementation or document |
|---|---|
| FACT: D2 architecture | `architecture.md`, `shared-runtime-contract.md`, `fingerprint-portability-resolution.md` |
| FACT: three production storage adapters | `windows-storage-adapter.md`, `node-storage-adapter.md`, `android-storage-adapter.md`; existing production entry adapters retain startup behavior |
| FACT: Migration Registry | `windows/migration.c,h`, `src/migration-runtime.mjs`, `android/.../MigrationRegistry.java`; fixed step, source snapshot, implementation checksum, schema identity and version evidence |
| FACT: migration executors | Explicit manual APIs in actual C/Node/Java stores, single transaction and independent same-database outcome inspection; no startup caller |
| FACT: backup/recovery preparation | `backup-restore-implementation.md`; independent guarded `tests/d2/backup-recovery.mjs` and runner |
| FACT: platform test results | Official three producer raw receipts and build identities, sealed cross-source/cross-target databases |
| FACT: faults and recovery | Named producer and backup cases, caller attempt logs, first-error records and original failed-run ZIPs |
| FACT: Actions evidence | `evidence/run-*/` API run/jobs/artifacts JSON, original official ZIPs/logs, summaries and digests |
| FACT: production blockers | `owner-decisions-and-blockers.md`, prior D1 unresolved items and the limitations below |
| FACT: next owner decisions | Fingerprint v2, version/step, admission/fencing, release identity, backup authority, durable activation and exact pilot operation scope |

## One portable candidate

FACT: CI3 exposed a design defect in the unapproved D2 v1 snapshot format: Android stored REAL bits `3ff0000000000001` while its CAST display was `1.0`; Node's engine represented the same bits with a different decimal conversion. The independent Registry check failed rather than accepting a mismatched identity. `fingerprint-portability-resolution.md` retains the exact evidence and conflict decision.

FACT (implemented and isolated-tested): all three candidate runtimes and the independent oracle now use `mytodo-storage-fingerprint-v2`. REAL cells encode `(real, NULL sentinel, exact BE64 bits)`, SQL NULL encodes `(null, NULL, NULL)`, and INTEGER/TEXT/BLOB retain their original typed HEX bytes with NULL bit fields. Old v1 requests are rejected in the existing negative cases. The accepted D1 business fields, NULL/time/deletion/relationship/synchronization meanings remain unchanged.

FACT (source and core test): Windows original undo_capture was moved intact into a production helper to link the real storage path without test stubs. The other three undo bodies retain their static byte hashes. The formal build source list includes the helper. The headless storage test exercises the actual existing readiness guard; it does not establish active GUI undo behavior.

## Preserved failures

| Evidence | Source SHA | FACT: original outcome and correction |
|---|---|---|
| Initial publication preflight | transfer commit `45033417ea9a2a41fd14f2c315bfc8d7361725c6` | Git rejected one new helper's trailing space before implementation commit. Original staged worktree, binary staged patch, console and local sealed input remain preserved. |
| CI1: 45407366991 | `843e1ee91af1bdcad3919771803919a15fc46f6e` | Static gate rejected the uploaded manifest's CRLF. No platform migration tests ran. Fixed file format; kept the check. |
| CI2: 45410409313 | `7ac7d7c08c63d53b010b772974272c222cddbcc8` | Windows test CRT dup collision; Android test parenthesis; Node 15/16 CAST precision premise; backup 17/24 blocked on probe-created sidecars. Original six archives and all errors retained. |
| CI3: 45414368180 | `d57963c35c5a6d06fce3664b5789acb7e6ac2e35` | Node 16/16, Android 11/11 and backup 24/24 succeeded; Windows linker closure and v1 cross-engine Registry identity failed. Comparison 2/7. Original seven archives retained. |
| CI4: 45425446577 | `d86aecd56a1c0dfa4d66a982703b3c93bdc5e9d7` | v2 and actual native helper closure verified; final runtime/comparison 89/89. |

FACT: corrections preserved original database values and strengthened exact bit/payload comparison. No failure was relabeled as passed and no production synchronization semantic was changed to satisfy tests.

## Unresolved boundaries

BLOCKER: actual user layouts/history remain unverified. Windows GUI search tables/indexes/triggers are outside the reviewed core whitelist. Legacy constructors/openers can create schema/meta before manual capture; production admission needs read-only preflight and a proven all-writer fence before those effects.

BLOCKER: production release build identity distribution, real database/attachment writer coordination, authenticated remote A/Actor lineage and durable multi-file activation are not installed. The laboratory remote evidence and writer barrier are synthetic. No Actor or synchronization resumption is granted by an outcome result.

UNVERIFIED: full release GUI/application lifecycle, active GUI undo, real device power loss, failure in the middle of rename/journal writes and directory fsync portability. Backup faults are controlled exceptions after phases; its fresh-process probe verifies reopen, not a real killed backup writer. C and Node migration process-termination cases are separately real process events.

UNVERIFIED: backup cleanup errors are attached in source exception properties, but its report currently serializes only primary text/stack rather than every supplemental cleanup property. There is no claimed complete backup cleanup-fault audit coverage. Backup aggregate/manifest gates do not independently compare runAttempt; official artifact naming and producer receipts provide retained attempt provenance. These are explicit preparation limitations, not production audit approval.

OWNER DECISION: approve future production operation scope separately, including exact database/component, source layout, implementation SHA, backup fence, remote authority and recovery/reconciliation boundaries. SQLite rollback is valid before confirmed COMMIT. Unknown or advanced local/remote state requires preservation and same-path inspection; copying an old B over S is not a safe rollback.

FACT: the work stops here for unified owner review. This successful synthetic package does not authorize a real migration, production merge or dual-channel synchronization.
