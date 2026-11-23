# de7 C007 independent evidence review

Reviewed on 2026-11-23 by credential_review. GitHub run `45190559178`, attempt 1, source `de7ce40ccac3e963108a3a9af7c875186f822cce`.

The archived execution records pass all 30 cases, 187 controller attempts and 2,299 checks. The independent Node/Windows review found no inconsistent or failing recorded result. This conclusion is based on original requests, results, errors, before/after state, reopened receipts and traces; the green GitHub status was not used as a substitute for them.

## Transfer and integrity

The local source archive is `outputs/c0-07/evidence/de7-transfer/archives/c007-de7-evidence-45190559178.zip`, 7,941,721 bytes, SHA256 `e9f094e2e25b294bcac0d46b7e554243de59ff292d5bdee1cf6f8741a5bd3ba9`, independently matching the parent's transfer reference.

The frozen evidence-only auditor is still SHA256 `eb614a19ee4faa4a7a201925e17dd14c938edb15b431fc232cdc858e610e1f5d`. Its result, `work/c007-de7-production-integrity-audit.json`, is 58,022 bytes with SHA256 `61d72889e7a5473235b1a8390648f15b9ef63e366505a13d3d763a5e99a9497f`.

That audit has `archiveIntegrityPassed=true`, audit exit 0, zero execution-consistency issues and `execution.status='passed'`. It verifies 11,357 local text files and closes 12,117 producer rows: 11,342 against local bytes and 775 against cloud collector records. The cloud inventory contains 12,122 files.

The original collector remains exit 1 with `evidenceComplete=false` and 114 Android binary-stdout exclusions. Consequently the unchanged auditor reports `recordedRunPassed=false`: that field requires collector completeness as well as execution success. This is intentionally retained alongside the passing execution counts. Cloud-only bytes were not locally rehashed or replayed. A final qualified acceptance decision belongs to the parent and must carry the collector limitation.

## Recorded platform counts

| Platform | Cases | Controller attempts | Checks | Failed checks | Ordinary receipts | Exit-86 boundaries | Reopen receipts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 10 | 56 | 620 | 0 | 53 | 3 | 56 |
| Windows C | 10 | 76 | 1,027 | 0 | 73 | 3 | 76 |
| Android | 10 | 55 | 652 | 0 | 52 | 3 | 55 |
| Total | 30 | 187 | 2,299 | 0 | 178 | 9 | 187 |

The Android counts above come from the frozen integrity/record consistency audit; detailed Android lifecycle meaning is covered by the separate Android reviewer. Generic Android `faultHitReceipts=0` means its receipts do not carry that generic field, not that no faults executed.

## Independent Node and Windows receipt comparisons

The evidence-only review script `work/review-c007-de7-node-windows.ps1`, SHA256 `35584dd9dd95e6316f307041ccab5703bd132d55b1d72900fb6e6a46b6554e0d`, produced `work/c007-de7-node-windows-evidence-audit-v3.json`, 599,493 bytes, SHA256 `19b4c1908e6927e86cbecd04e39571289a8710b78fdaa0ef0df5e7bec16b8245`.

It reads all 132 Node/Windows attempts. All 2,500 evidence comparisons pass. These are archive-review checks, not 2,500 newly executed project tests. The 616 recorded inputs comprise 615 original evidence JSON files whose size/hash was checked against the unchanged text inventory plus the frozen generic-audit output. Both suites are required to have ten cases and the expected source/platform; exactly 132 attempts must be reviewed.

The comparisons cover actual operation acceptance, request/fault agreement, expected SQL errors and required fault hits; before/after protocol state and business-state preservation; transaction completion on Windows; independent reopen requests restricted to resume/audit/no-fault on the same database; reopened state and Node PID changes; pending body bytes, outbox, cursors, cache/lease outcomes; and actual crash-boundary state from raw pre-operation evidence. All expected-negative operations are checked as literal boolean false, not converted from truthy values. There are 13 expected-negative ordinary Node receipts and 29 on Windows; these are successfully tested rejection paths.

### Windows inspect correction is actually exercised

The three previously failing rows now each have `returned=null`, `operationAccepted=false`, observer exit zero and passing operation/error/state/reopen checks:

| Attempt | Preserved production diagnostic | SQLite primary/extended |
| --- | --- | --- |
| `010-row-prepare-denied` | `SQLite read entity failed (23): access to entities.key is prohibited` | 23 / 23 |
| `011-row-step-overflow` | `SQLite read entity failed (1): integer overflow` | 1 / 1 |
| `017-row-invalid-json` | `Invalid stored entity JSON` | 0 / 0, JSON-validation failure |

The last row is a JSON failure, so a nonzero SQLite code is not required. Overflow and invalid-JSON view injections may have generic `faultHits=0`; their actual error/result/state receipts establish the behavior. Required counter-based faults all have positive hits.

The de7 source inventory binds the corrected worker to LF SHA256 `d8aef0e85ef658e564b2bb4d96d389c0e502909ab60d97f874249e21a15cc8ea`. Converting the independently reviewed candidate to CRLF gives exactly 17,185 bytes and SHA256 `f9a80b1552507e464eb44d336626c15bc4484a2c8d234964b4a9a74dce03fe17`, matching the Windows checkout inventory. This connects the real run to the reviewed one-line raw-pointer correction.

### COMMIT first error and rollback double error

Both Windows `005-commit-failure` and `C007-ack-commit-failed/003-publish-fault` record fault kind `commit-reject`, `faultHits=1`, boolean `operationAccepted=false`, SQLite primary 19 / extended 531, exact `operationError='constraint failed'`, and transaction completion. The original COMMIT-hook pair is present in the same-operation fields; an empty native log does not erase that pair. Protocol state, pending body and outbox are preserved through reopening. The diagnostic was not overwritten by a later rollback/no-transaction message.

Node's ordinary and ACK deferred-foreign-key COMMIT failures record `ERR_SQLITE_ERROR`, extended code 787, exact `FOREIGN KEY constraint failed`, a positive hit and literal rejection. The complete before/after and reopened protocol states match.

Node `006-rollback-double-failure` records the original error `C007_SQL_ROLLBACK_ABORT`, `ERR_SQLITE_ERROR`, extended code 1811 (primary 19), and a separate `rollbackError` with `cannot rollback - no transaction is active`, code `ERR_SQLITE_ERROR`, errcode 1. Its result SHA256 is `ed75b8556ad096649076d67099e8ff5f7adcf8934eb1b7867c8d9e11bffd4b5b`. Both newly named probe rows are absent before, after and after reopening; metadata, original rows/outbox and main schema are unchanged, and the reopen has a distinct Node PID on the same database path.

The actual de7 source inventory binds `c007-sql-faults.mjs` to `5ff601a4df588544aa9df72806a8d5ae14234735e662d46f202cef7c537bf3be`, equal to the reviewed source. Its trigger requires the prior inserted row to exist before it increments the hit and raises `ROLLBACK`; otherwise it raises a different `C007_FIRST_WRITE_NOT_PRESENT` error. The observed target error and hit therefore correspond to the intended real earlier write followed by SQLite rollback, rather than an empty mutation.

### Other SQL, metadata and ACK paths

All materialized Node 11-step and Windows 31-step SQL scenarios were compared, including prepare/read/step failures, invalid row/page/meta/outbox JSON, local/remote read rejection, and normal edits/ACKs after failures. The denied Windows pending-prepare, lease-renewal, empty-prepare, cache and release COMMIT paths retain `not authorized`. Cache/release receipts bind the observed phase and token to the actual sync token. Cache rejection leaves cache/lease absent; release rejection preserves the acquired lease and cached manifest while retaining business state. The lease-renewal denial produces zero cloud requests; full-sync cache/release traces contain actual GETs and no unexpected PUTs.

For each platform, ACK delete, metadata and COMMIT faults retain the original pending body and all three outbox entries despite an already persisted cloud batch/head. Resume removes only the acknowledged prefix, retains later outbox id 3, clears pending and advances cursor to 1. Expected exits before ACK COMMIT recover the pre-commit state; exits after ACK COMMIT recover exactly the acknowledged state. Node's pre-COMMIT marker additionally records the actual uncommitted ACK changes. Windows marker semantics remain its native COMMIT-hook and post-ACK-return boundaries, as declared by the harness.

### Separate network trace review

credentials_audit independently reviewed the four batch/manifest rejected/response-lost cases on both platforms: `work/c007-de7-network-independent-audit.json`, 42,398 bytes, SHA256 `7fffa5b62e3ee1e33bb472f5fc9c5cc5ded351e8caebcb9ce8c2913c97fb8694`. It verifies 88 local text files and 122 evidence comparisons with zero failures. Every configured network fault is used exactly once. Rejections are HTTP 503 without persisted writes; response-loss cases persist then disconnect. The pending UTF-8 body is 383 bytes with SHA256 `913de72935793cf9d6f35e256bff9399307457fc0d2677dfb40de4e682dc769e`. Retries retain identical pending/wire bytes and leave one batch, head/cursor 1, pending null and only later outbox id 3. Existing rows and tombstones remain unchanged. See that review for the platform-specific lease-renewal and native process-evidence qualifications.

## Review history and limits

The reviewer's first evidence script invocation stopped before producing a result because the PowerShell alias `Copy` resolved to `Copy-Item`; the helper was renamed `Copy-Json`. Its first completed draft then marked 31 normal Node receipts unequal because it did not model the worker's documented absent-fault normalization to `{kind:'none'}`. That draft output (`work/c007-de7-node-windows-evidence-audit.json`, SHA256 `d88231e36f25b73b57b0033adf22e7f3f5e94f1f9a10cfab8f7abae866061595`) and v1 source are preserved. v2 fixes only that verified default and passes 1,881 comparisons; its source/output are also retained. v3 adds exact suite/attempt counts and input index size/hash binding. No original run evidence or project result was rewritten.

No project code, tests, builds, SQLite database, executable or APK was run locally. Only evidence-parsing PowerShell, JSON reading and hashes were used. Observed disk bytes after rename are not a power-loss durability guarantee. This review does not assert an Android device matrix, cross-user DPAPI behavior or completion of unrelated final-source regressions. Historical red runs remain red. Final acceptance and publication remain parent-owned with the collector limitation above.
