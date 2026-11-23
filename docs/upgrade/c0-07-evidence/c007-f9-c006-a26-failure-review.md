# C007 f9 / C006 A26 original failure — independent Android review

Reviewed 2026-11-23. Scope: static reading of original text evidence, length/SHA256 verification, and runner source inspection. No local project execution, tests, build, Node/Python, ADB, SQLite, APK/database read, network access, or rerun was performed for this review.

## Decision

Run `45186305462`, attempt `1`, source `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277` remains **failed: two cases executed, A26 failed, A30 passed**. A26's sole attempt is its initial `initialize`, with `exitAt: null`. The intended `after-import` interruption and original-database recovery sequence were not executed. A30's separate result does not close the A26 gate.

The original failure chain is an **unexpected startup process death**, followed by **a real missing-database observation**, followed by **a secondary host evidence-directory collision**. The evidence does not demonstrate a production SQLite/migration regression. It also does not justify calling Android stability fixed.

## Original evidence and chronology

Evidence root: `outputs/c0-07/evidence/45186305462`.

Artifact root below: `artifacts/c006-android-kill-45186305462-1`.

A26 attempt root below: `cases/C006-A26-import-kill/attempt-001`.

Host timestamps come from `cases/execution.json` and are UTC. Device exit-info timestamps are quoted as emitted; no unrecorded device-timezone assumption is needed to establish the command order.

| Event | Original evidence |
| --- | --- |
| First initialization selected an absent DB | `0007-database-exists`: exit 1; both raw streams empty; 13:44:29.887–13:44:29.964Z. |
| Instrumentation launched | `0014-instrument`: 13:44:30.437–13:44:42.082Z; ADB exit 0, signal null, no timeout/spawn/stdin error. |
| Instrumentation reported failure | Raw stdout is 74 bytes: `INSTRUMENTATION_RESULT: shortMsg=Process crashed.` followed by `INSTRUMENTATION_CODE: 0`. Stderr is empty. |
| OS recorded original app death | `0015-exit-info.stdout`: main PID **3421**, device timestamp **2026-11-23 13:44:41.288**, reason **12 (DEPENDENCY DIED)**, subreason 0, status 0. Description: `depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc com.google.android.gms.persistent (adj -10000)`. Trace null. |
| OS recorded WebView child cleanup | Same dump: PID 3520, timestamp 13:44:41.444, reason 13 OTHER KILLS BY SYSTEM, subreason 17 ISOLATED NOT NEEDED. This is not evidence of a separate application business crash. |
| Crash-buffer query | `0016-crash-log` exit 0, both streams 0 bytes. Empty crash-buffer output does not cancel the explicit exit-info record. |
| Normal cleanup began after failure evidence | `0017-after-stop` began 13:44:42.459Z, after the instrument response and exit-info collection. Its pidof check returned 1 with empty output. This cleanup did not cause the already-recorded dependency death. |
| Four export probes found missing files | `0019`–`0022`, 13:44:42.778–13:44:43.508Z: main DB, WAL, SHM, journal each returned exit 0 and an exact nonce-bearing `MYTODO_FILE_V1 ... unavailable missing - -` line, 72 bytes, empty stderr. |
| Export failed its unchanged DB assertion | `database/files.json` contains all four `unavailable/missing` observations. The runner then threw `Real SQLite database is unavailable or not verified`, at exportDatabase line 68, operation line 99, initialization line 168. |
| Failure cleanup then hit host collision | `0023-failure-stop` and `0024-failure-stop-pid-0` completed; `process.json.captureError` records `EEXIST ... mkdir .../attempt-001/database`. No second remote capture command was issued. |

`request.json` binds source/case/attempt/dbCase to this initialization and contains the initial local note. It has no planned exit boundary. A26 has only `attempt-001`; no second `sync` operation exists. `final-cloud.json` still contains only the original legacy `state.json`. There is no collected A26 native result, before receipt, or gate receipt. Importantly, the runner throws during DB export **before its evidence-exists/read loop**, so the local absence of these receipts alone does not prove their remote absence. The stronger scope proof is the sole initialization operation and failure before the runner's next `sync` call.

## Error precedence and minimum evidence fix

Inspected baseline: `work/c006-export-input/tests/c006/android-kill/android-kill-runner.mjs`, 23,255 bytes, SHA256 `e671bd7be73d2aea7299fc2e4839f0d01367d031f7d85cd65e1766322746d518`. The parent independently confirmed the current de7 cloud runner has exactly that length/hash. The failure's stack locations and behavior match this baseline; the original f9 execution artifact does not separately record its runner hash, so this review does not manufacture that missing provenance receipt.

Source order explains both follow-on errors:

1. The runner records instrumentation status, exit-info, crash-log, and cleanup; it calls `exportDatabase` before validating a normal instrumentation code of -1 and the native result.
2. `exportDatabase` creates `database`, writes immutable `files.json`, then asserts the main SQLite file is preserved and verified. All four missing observations are valid evidence, but the main-file assertion correctly fails.
3. Because the awaited export throws, assignment to `observed.database` does not complete. The catch block sees `started && !observed.database` and calls the same export with the same fixed target directory. The second `mkdir` fails with EEXIST before its remote probes. The original `observed.error` and outer case failure remain; `captureError` records this separate defect.

A minimum test-only candidate may add an optional fixed export leaf, default `database`, and use `failure-database` for catch-path capture. Preserve the first `database/files.json`, original exception, failed case status, all existing assertions, and the original fail archive. This only repairs secondary evidence collection; it does **not** fix the original dependency death or turn missing SQLite into success. If the DB remains missing, the second capture should likewise record missing observations and fail its DB assertion, rather than fail to create a directory. No business retry, fresh database, or install replacement is needed for that change.

The earlier instrumentation failure should remain visible in review/reporting even though the existing thrown message is the subsequent export assertion. A separate change to primary-error precedence is outside this minimum candidate.

## Integrity and execution identity

- Independently rehashed **384 indexed local text files**, with matching lengths and SHA256 values; zero mismatches. The collector copied 374 artifact text files; the 384 index also includes collector metadata.
- All **408** main artifact producer-manifest rows match the cloud collection inventory by path/length/hash. This is a manifest comparison, not local binary verification.
- All **50** A26 inventory rows are present as local text. No A26 file is omitted to cloud-only storage.
- The run has **135** command records / **270** expected raw command streams. **263** local streams were individually rehashed against execution receipts with zero mismatches. The remaining **7** are binary database stdout streams for A30, identified by the collector; none is an A26 crash or probe stream.
- Original collector status is still `collectionExitCode: 1`, `evidenceComplete: false`, with seven `binary-in-text-evidence-path` failures. Overall inventory: 456 files, 82 cloud-only; 498 verified producer-manifest rows including two environment manifests. Do not rewrite these statuses as complete/successful.
- Build receipt, execution receipt, metadata and environment agree on exact f9 source and run 45186305462/1. Build status passed, exit 0; APK SHA256 recorded as `14aab7418d20510ea1e9c51983e690003b2b2668d02433d703e1f0ae2934cefb`. This APK hash is cloud receipt evidence; the binary was not locally rehashed/read.
- Capture helper recorded SHA256: `41613ce991718a0c1cf03f2f7747d43598e5b0ab3cf081f811e0d3af08a0c350`.
- Environment: Ubuntu 24 X64 image `20261116.376.1`; emulator `37.3.10.0`; Android API 34, google_apis x86_64 image revision 14; WebView `113.0.5672.136`. Environment ready at 13:43:54.542Z, exit 0. Boot/readiness is not proof that provider startup is stable.
- The environment's optional SQLite CLI probe says 3.39.2. No A26 native database receipt establishes actual A26 framework SQLite use/version; do not substitute the CLI version for that missing observation.
- `001-android-runtime-errors.log` contains only the empty stdout/stderr separator (16 bytes). Available environment logs contain no additional FontsProvider/gms.persistent death explanation. The artifact has no dedicated contemporaneous gms.persistent exit-info or full system-buffer history to establish why that provider process died.

Parent-supplied downloaded text archive SHA256: `8c3282c9537719c82c803957f25e23636cedb0798c28e651530b09aff0ad98fa`. This review independently verified the extracted indexed text; it does not claim to have recomputed that archive hash.

## Follow-up scope and limits

1. Keep this run and A26 first failure immutable. A subsequent green run is new evidence, not a replacement for or retroactive correction of this failure.
2. Apply/review the narrow catch-destination fix independently. A normal push-triggered run can validate compilation and both A26/A30, but a green path alone does not exercise the catch collision. If a failure path occurs, inspect first and failure capture directories and unchanged primary error/status.
3. Investigate Android startup/provider readiness with recorded provider/process/package state and relevant system logs. The direct death dependency is demonstrated; the underlying reason for gms.persistent death remains open. Do not assert a guessed fixed delay or unrelated production SQLite edit resolves it.
4. Require source-bound A26 original-DB import/lease/recovery and A30 fresh-observer snapshot checks plus the parent's same-source regression gates. Fresh DB retries must be recorded as fresh and cannot stand in for A26's original-DB recovery.
5. Retain issue 1 / Android stability as open. No evidence in this failure independently closes that existing issue.
