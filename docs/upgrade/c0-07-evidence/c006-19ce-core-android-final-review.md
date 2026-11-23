# C006 19ce Android core independent review

Review date: 2026-11-23. Run `45199685003`, attempt `1`, source `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa`.

The six Android cases support the selected-database migration contract: 24 operations, 24 final new-process reopens of the selected database, and no fresh retry database substitution. This is a qualified semantic pass. It is not a crash-free pass: A27 observer output 5 suffered one original restart crash and succeeded on a second restart using the same observer database. The prior `no-crash-and-export` failure remains valid and preserved; Android startup stability remains open.

## Scope and evidence

Only local archived JSON/text, string/date-preserving comparisons, UTF-8 lengths and text SHA256 were used. No project, Node, Python, build, test, SQLite, ADB or network execution occurred in this review. No APK, SQLite or credential binary was read. `sync-config.enc` was neither read nor decrypted. PowerShell ran only the static archived-evidence audit.

Root: `outputs/c0-07/evidence/45199685003`.

- Android artifact: `artifacts/c006-android-45199685003-1`.
- Environment artifact: `artifacts/c006-android-environment-45199685003-1`.
- GitHub success does not override collector `collectionExitCode=1` / `evidenceComplete=false`: 24 `unexpected-credential-fixture-in-artifact` exclusions remain recorded.
- Parent supplied archive: 5,279,924 bytes, SHA256 `4712aeb72630f33e758bdc007cfe7cbf699a1866862b1f4e85d70aa2b108d5de`. This reviewer did not independently hash the ZIP.
- Inventory audit from credentials reviewer, rechecked as a local text file: `work/c007-19ce-c006-core-integrity-only-raw.json`, 9,622 bytes, SHA256 `4f7f509f9005112f313664d2246f18884623dadf61f0445de79594e5799a5c07`. It reports 2,620 local text files / 37,464,530 bytes (2,610 artifact files plus 10 metadata files), 3,089 cloud inventory rows, six manifests / 3,127 entries (2,648 locally verified references and 479 cloud-only references), no integrity issues.

Cloud binary inventory digests and producer records are bindings to archived receipts, not independent local binary verification.

## Results

The supplemental static audit `work/c006-19ce-core-android-semantic-audit.json` records 3,544 checks, zero semantic/integrity issues, and one explicit `stabilityIssues` entry. It preserves and qualifies, rather than overwrites, the original broad audit at `work/c007-19ce-c006-core-audit.json`: 1,365 checks with exactly one failed criterion, `android:C006-A27-manifest-fail:output-5.json:no-crash-and-export`. Original audit SHA256: `7ba341f57c2581aec03d04de606920c109252c9b3d0abd8f071ad717fc34750e` (177,489 bytes). The earlier unexecuted draft `work/c006-19ce-core-android-audit.ps1` also remains unchanged.

| Case | Operations | HTTP requests | Result / qualification |
|---|---:|---:|---|
| A02 legacy | 4 | 18 | Migration and observer retain the expected rows. |
| A06 fence-drop | 5 | 23 | Request 7 writes `state.json` then disconnects; expected rejection and original-DB recovery pass. |
| A27 manifest-fail | 5 | 26 | Request 10 rejects manifest before write; original-DB recovery passes. Observer restart has one preserved crash and same-DB retry. |
| A28 manifest-drop | 5 | 18 | Request 10 commits manifest then disconnects; original-DB recovery and observer pass. |
| A19 missing-backup | 2 | 5 | Expected rejection, no PUT request. |
| A35 tombstone | 3 | 13 | Deleted legacy-note remains a tombstone after migration. |

The 24 operations comprise 20 accepted operations and four expected rejections. They use ten planned databases: six main case databases and four observer databases. Fourteen subsequent-operation `before` states match the preceding successful reopened state, including actor identity. Each planned database begins only with an empty initialization. No `pm clear`, database delete/copy/move/push/pull, or case ID ending in a retry suffix appears in the recorded commands. All 24 APK installs use `install -r`.

All final native results identify the exact selected path `/data/data/local.gxtodo.protocolharness/files/protocol-cases/<dbCase>/tasks.sqlite`. Source/run identity, receipt/process/case bindings, native PIDs, full `{meta,rows,outbox}` state, native SQL-derived state and export-audit state agree. Each final reopen uses a different native PID from its successful main operation. There are 48 distinct successful native PIDs plus failed PID 9801: 49 instrumentation invocations total, 48 success codes `-1` and one original crash code `0`.

The audit rehashed all 744 operation command logs and checked their inventory/receipt bindings. It checked 24 exports (983,040 bytes recorded in cloud), 24 native/export audit comparisons and 27 cloud plain-text content hashes. The failure adds seven retry command labels, all `restart-retry-2-*`; these labels do not change the selected `dbCase`.

Environment records identify API 34 / x86_64, framework SQLite 3.39.2 and WebView 113.0.5672.136. All 24 operations bind to test APK SHA256 `a6add2cd2465bdff42f24e133853afc5c9cadf366c225fddb394f52d0c199ed9` through native receipts, build receipt and cloud inventory. No APK binary was locally opened or rehashed.

## A27 original rejected operation and recovery

All times below are UTC on 2026-11-23; add eight hours for Asia/Shanghai.

Main database: `C006-A27-manifest-fail`; actor `c7dc98bd-07e2-4b76-8ae0-e4d2013ddc37`.

| Output | Operation | Successful main → final reopen PID | Revision | Rows / outbox |
|---|---|---|---:|---:|
| 1 | initialize | 8129 → 8326 | 1 | 1 / 1 |
| 2 | sync, expected rejection | 8573 → 8780 | 4 | 2 / 2 |
| 3 | sync, recovery | 8961 → 9088 | 12 | 2 / 0 |
| 4 | observer initialize | 9308 → 9442 | 1 | 0 / 0 |
| 5 | observer sync | 9613 → 10258, failed intermediate 9801 | 8 | 2 / 0 |

Output 2 main instrumentation ran 15:02:21.276–15:02:26.518. Actual request 10 at 15:02:25.924 was `PUT v2/manifest.json`, fault phase `before-write`, HTTP 500, `writeCommitted=false`. Its failure is native `operationAccepted=false`, `expectedAccepted=false`, with production error HTTP 500. It retains local-note and legacy-note, sequence 2 and two outbox events; pending and lease are both null.

Output 3 runs on the same original database and actor, with its entire initial state equal to output 2's final state. Its sync completes (`more=false`, not busy), retains both rows, clears outbox to zero, and leaves pending/lease null. Manifest requests 18 and 22 commit with HTTP 201 and 204 respectively. The final manifest references a batch containing each of the two original retained outbox events exactly once. This closes the specific original-database rejection→recovery gap from the failed `edf` run; it does not rewrite that historical failure.

Observer actor is `05e82daf-d3f4-459d-94c3-5dac6410e86a`. Its successful sync reads manifest, snapshot and batch in requests 24–26, ending at 15:02:57.581, before the restart crash. No further HTTP requests occur during the failed/retried report-mode reopens. Both main and final observer states agree in full, including revision 8, both rows, empty outbox, actor and selected database.

## Preserved observer restart crash

All three instrumentation attempts for output 5 explicitly select `C006-A27-manifest-fail-observer`. Successful main PID 9613 is followed by original restart PID 9801, then successful restart PID 10258. No `-retry-2` database is introduced. The shared runner's main-crash branch can substitute a fresh database, but that branch was not used in this run. The strict C006 runner additionally rejects receipt `dbCase` changes and native `databaseFile` mismatch.

Direct archived evidence:

- `cases/C006-A27-manifest-fail/output-5.json.logs/027-restart-instrument.log`: `shortMsg=Process crashed.`, `INSTRUMENTATION_CODE: 0`.
- `028-restart-read-result.log`: `files/result.json: No such file or directory`.
- `030-restart-evidence-exit-info.log`: PID 9801 at 15:03:02.008, `reason=12 (DEPENDENCY DIED)`, FontsProvider dependency in dying GMS persistent process.
- `032-restart-evidence-logcat.log` lines 2022–2029: at 15:03:01.821, GMS persistent PID 4814 changes module `com.google.android.gms.herrevad` and sends itself SIG 9; at 15:03:02.005 that process dies; at 15:03:02.008 ActivityManager kills PID 9801 because it depends on `com.google.android.gms/.fonts.provider.FontsProvider`. A separate GMS PID 1452 also self-kills for an appintegrity change at 15:03:01.816, but the direct provider death chain names persistent PID 4814.

The failed restart ran 15:02:58.756–15:03:02.332. Diagnostic observations followed. Diagnostic force-stop completed at 15:03:03.174, followed by `pidof` exit 1 with empty output. File preservation began at 15:03:03.271 and completed at 15:03:04.572. The second restart's force-stop/check precede instrumentation 15:03:05.764–15:03:09.686, with successful atomic result read by 15:03:09.808.

Failure record: `cases/C006-A27-manifest-fail/output-5.json.failures/restart/evidence.json`, SHA256 `a7cef070f7f11f6e2b48821c3c5643cdb6fe407f1363f85451000a354a1c3334`. Its file and observation bindings are independently checked against locally rehashed command logs.

One file is preserved: original observer `tasks.sqlite`, 40,960 bytes, SHA256 `17416ddb0e92462b75b653341abfd1b0ae87d21f58a24b852b8ec9bcc518594d`. Remote-before, binary transfer, remote-after and cloud inventory records agree. Six files are explicitly missing: `tasks.sqlite-wal`, `tasks.sqlite-shm`, `tasks.sqlite-journal`, and atomic result `.json`, `.json.bak`, `.json.new`. All eight before/after probe outputs were bound to their exact stdout hash/length and actual `MYTODO_FILE_V1` result; missing files are not counted as preserved or silently ignored. Binary content/header/readback verification remains a producer claim, not local binary re-verification.

The original record explicitly says `Raw files after diagnostic force-stop; no claim of crash-time transaction state`. Preserve this limitation. `originalDatabaseReplayed=false` is also preserved: the capture routine did not replay the snapshot. The subsequent live original database restart is independently demonstrated by selected case ID, same native database path, actor and full state comparison; it does not imply replay of the archived binary.

## Qualification and artifact hashes

Supported: six selected-database Android core cases, 24 operations, full persisted state after final independent-process reopen, A27 original manifest rejection→same-DB recovery, and same-observer-DB final recovery after one preserved restart crash.

Not supported: crash-free Android startup, a fix for GMS/FontsProvider dependency deaths, a crash-time atomic DB snapshot, or an independent local rehash of APK/DB binaries. Collector incompleteness and the original no-crash assertion failure remain open facts.

- `work/c006-19ce-core-android-semantic-audit.ps1`: 26,145 bytes, SHA256 `0bda5f9ecc6eb5165f73aaebe611cf1c963fd135997e48e10f41f5d2c66de30b`.
- `work/c006-19ce-core-android-semantic-audit.json`: 19,001 bytes, SHA256 `d5b38a9cf1b327352a31669265f396ed4bbfd7f3e03d68b757c4435dd2b4d3b6`.

This reviewer changed no implementation, collector flags, original receipts, historical audit, project configuration or final delivery directory. Parent owns publication and project/GROWTH updates.
