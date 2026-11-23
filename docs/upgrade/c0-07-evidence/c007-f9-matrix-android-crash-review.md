# f9 matrix Android first failures and retry qualification

Reviewed 2026-11-23. Run `45186305196`, attempt 1, source `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277`. Evidence root: `outputs/c0-07/evidence/45186305196`. This review used local text/JSON, static comparisons and text hashes only. No project, parser, test, build, Node/Python, ADB, SQLite or networking execution; no APK/database binary inspection.

## Required qualification

All eight Android shard summaries are finally passed: shards 0–5 each have 40 outer executions and shards 6–7 each have 36, totaling **312 final Android executions**. These results contain **7 original failed instrumentation attempts**, one each in shards 0, 1, 2, 3, 4, 6, 7. There are **631 recorded instrumentation invocations**, comprising 624 successful main/restart invocations plus those seven failures. The outer green status is not a crash-free result.

**Five main-stage retries switch to a new `-retry-2` database path. Two restart-stage retries reopen the same original path.** The former cannot be counted as recovery of the initially failed database. The latter establish a successful later report/reopen of the existing fixture and equality with its earlier successful main result; they do not establish business correctness at an intentional transaction interruption boundary. Android issue 1 / stability remains open.

## Per-case original failure and later result

All seven raw instrumentation logs say `Process crashed.` and `INSTRUMENTATION_CODE: 0`, with ADB exit 0 and no recorded command timeout or signal. Their exit-info records identify the indicated harness PID as reason 12 `DEPENDENCY DIED`, dependent on `com.google.android.gms/.fonts.provider.FontsProvider` in dying `com.google.android.gms.persistent`.

| Shard | Case directory | Failed stage / PID | Original DB evidence | Later successful DB |
| --- | --- | --- | --- | --- |
| 0 | `id-cjk-67--receive--android--javascript` | restart / 9022 | main 40,960 bytes preserved; WAL/SHM/journal missing | same base path; successful main PID 8885 → later report PID 9461 |
| 1 | `id-emoji-100--generate--android` | main / 8459 | main 40,960 bytes, empty WAL, 32,768-byte SHM preserved | new `-retry-2` path; PIDs 9016 → 9156 |
| 2 | `actor-length-81--generate--android` | main / 7527 | main 40,960 bytes, empty WAL, 32,768-byte SHM preserved | new `-retry-2` path; PIDs 8013 → 8139 |
| 3 | `actor-invalid-punctuation--generate--android` | main / 7510 | main and all sidecars **missing**; receipt `partial`, originalDatabasePreserved false | new `-retry-2` path; PIDs 7924 → 8114 |
| 4 | `key-one-item--receive--android--windows-c` | main / 9039 | main 40,960 bytes, empty WAL, 32,768-byte SHM preserved | new `-retry-2` path; PIDs 9579 → 9733 |
| 6 | `key-array-type--generate--android` | restart / 8754 | main 40,960 bytes preserved; WAL/SHM/journal missing | same base path; successful main PID 8623 → later report PID 9308 |
| 7 | `id-cjk-66--receive--android--android` | main / 8144 | main and all sidecars **missing**; receipt `partial`, originalDatabasePreserved false | new `-retry-2` path; PIDs 8611 → 8780 |

Each base path is `/data/data/local.gxtodo.protocolharness/files/protocol-cases/<case-directory>/tasks.sqlite`. For each main retry, both the second instrumentation `caseId` argument and native `reopened.databaseFile` move to `<case-directory>-retry-2`. Its eventual report/restart uses that new path. No claim is made that the original failed main operation completed, rolled back correctly, or recovered.

For the two restart retries, all three instrumentation `caseId` arguments (successful main, failed restart, later retry) retain the base case. Native main `reopened.databaseFile` and later report `raw.databaseFile` match. I independently compared each of the seven successful main `reopened` objects to its final report `raw`: all were identical, including meta, metaJSON, rows, outbox, accountRegistry and databaseFile. Thus the five main-retry comparisons validate their replacement fixture, while the two report-retry comparisons validate the original fixture's later state. The final PID pairs differ in every case.

All seven failed-attempt evidence records say `originalDatabaseReplayed: false`. This is consistent with no captured-file replay; it does not negate the two in-place original-path report retries. The recorded commands for these cases contain no install, pm clear, DB push/pull, DB cp/mv or DB removal. Result-file cleanup is distinct from database replacement.

## Stronger direct system evidence in this run

Unlike the separate A26 kill run, this matrix archived system/event logcat for all seven failures. In every case the same PID identified as the dying gms.persistent process first logs `ChimeraModuleLdr: Module config changed, forcing restart due to module ...`, then sends SIG9 to itself. ActivityManager then records that PID's death and kills the harness because its FontsProvider dependency died.

| Shard | gms.persistent PID | Module in the forced-restart log | Harness exit timestamp as recorded |
| --- | --- | --- | --- |
| 0 | 1384 | `com.google.android.gms.rcs` | 2026-11-23 13:49:34.410 |
| 1 | 2886 | `com.google.android.gms.herrevad` | 2026-11-23 13:48:50.371 |
| 2 | 3956 | `com.google.android.gms.herrevad` | 2026-11-23 13:48:16.727 |
| 3 | 3915 | `com.google.android.gms.rcs` | 2026-11-23 13:48:25.045 |
| 4 | 3783 | `com.google.android.gms.herrevad` | 2026-11-23 13:49:11.146 |
| 6 | 1410 | `com.google.android.gms.rcs` | 2026-11-23 13:48:55.984 |
| 7 | 1447 | `com.google.android.gms.rcs` | 2026-11-23 13:48:47.207 |

These are device timestamps as emitted; this review does not infer an unrecorded timezone. This evidence supports the immediate chain **GMS module configuration change → process self-restart → provider dependency death → harness kill** for these seven attempts. It is stronger than an unexplained FontsProvider exit hint. It does not establish the upstream cause of module configuration delivery, a production fix, or universal Android behavior. It must not be silently substituted for the missing full system log in A26 run `45186305462`.

## Failed-database evidence and snapshot limits

Seven records contain 49 file observations. They preserve 12 files: five main SQLite files, three empty WAL files, three SHM files, and one empty `atomic-result.json.new` in shard 1. The remaining **37** observations are explicit valid missing probes; I matched all 37 original nonce-bearing raw lines to the `unavailable missing - -` protocol form, with no mismatch. All seven failed normal result files are missing; an empty atomic `.new` is not a valid result.

The two missing-DB cases are deliberately marked `partial`, despite `allObservedFilesVerified: true` and `errors: []`: valid evidence of absence does not mean that a database was preserved. Their later new-path successes cannot repair this original recovery-evidence gap.

The other five records preserve a main DB and say `recorded`, but explicitly define `snapshotSemantics` as **raw files after diagnostic force-stop, with no claim of crash-time transaction state**. All report that the main process was observed stopped. Do not describe these sequential copies as atomic crash-time snapshots. Preserved binary lengths/hashes and header/readback flags come from cloud receipts; binaries were not read or rehashed locally.

## Traceability and review boundary

The derived index `work/c007-f9-matrix-android-crash-index.json` retains each exact case, stage, failed/final dbCase, failure status, native PID pair, DB path pair, file observation, original evidence hash and logcat path, plus the matched GMS restart/signal/death lines.

Original evidence locations under each `artifacts/c004-android-shard-<n>-45186305196-1/cases/<case>/`:

- `result.json.receipt.json`: original crashedAttempts, failureEvidence and subsequent native command caseId arguments.
- `result.json.failures/<main-or-restart>/evidence.json`: preserved/missing files and snapshot limitations. All seven local evidence-file SHA256 values were independently matched to the referring receipt.
- `result.json.logs/*-<stage>-instrument.log`, `*-<stage>-evidence-exit-info.log`, `*-<stage>-evidence-logcat.log`: failure and OS mechanism.
- `result.json.main.json` and `result.json.restart.json`: independently compared successful main/reopen/report state.

The local reference runner `work/android-observation-fix/tests/protocol-harness/android/run-android.mjs`, SHA256 `96d48dc0ee6f81d77da76284b4ee68b5b38c572c230d4ae9512c6b2bceb8cfba`, explains this retry policy: only main retries change dbCase; restart retries preserve it. The conclusions above are also verified directly from this run's command and native evidence, so they do not depend on assuming the reference file has an unrecorded execution provenance.

The original collector records `collectionExitCode: 0`, `evidenceComplete: true`, no failures, 13,540 copied text files and 2,203 cloud-only files. Collector completeness does not erase the two valid missing-DB observations. Full archive/manifest hash closure is the separate audit assigned to credentials_audit; overall protocol execution/comparison/lineage totals are the parent review's scope.

Recommended acceptance wording: **The f9 protocol matrix has passing final functional comparisons, with seven preserved original Android instrumentation failures: five retried on new database paths and two retried on the same path during report/reopen. Two first-failure database captures are missing and remain partial. This is not evidence of crash-free startup or recovery of all seven original failed databases.**
