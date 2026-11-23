# C0-03 Android production-storage adapter

This adapter is an isolated instrumentation application, not a second synchronization protocol or a replacement application. The shared suite at `tests/protocol-vectors/suite.json` and `shared-executor.mjs` provide the same operations used by the other platform harnesses. Expected behavior continues to come from the existing WebDAV v2 documentation and production entrypoints.

## Production path and isolation

The bundled WebView executes unchanged `src/replica.mjs` / `src/model.mjs` and a byte-for-byte `src/delta-sync.mjs` copy with one appended test-only private-symbol export. Actual database operations pass through unchanged `src/sync-client.mjs` → `GxNative.syncCall` → `AccountStore.sync(op=replica)` → `ReplicaDatabase.invoke`. The production Java files are compiled directly from the repository; no SQLite shadow, mock database, independent merge algorithm, or Java timer test is used.

The application ID is `local.gxtodo.protocolharness`, distinct from the production application. Test cases use separate directories inside that test application's private files. Only a fresh empty test database's actor is seeded; normal initialization, entity writes, outbox, metadata, and merges use production operations. The audit queries actual `meta`, `entities`, and `outbox` tables, including deleted rows and field records. The current production schema contains no independent durable receipt or target delivery ledger table; the report explicitly records that absence instead of inventing it. Actual `pending`, `cursors`, vector, clock, sequence, and outbox remain in the comparison.

The test shell's `reopen` closes every actual SQLite connection and reconstructs `AccountStore` from its persisted account registry. The cloud runner additionally force-stops the application and launches a new instrumentation process for a no-write report, then compares normalized persisted state. It checks the atomic JSON result, the instrumentation result code, and the real adb exit code together.

SQL faults are real SQLite TEMP triggers installed on the real connection. `commit-meta` aborts metadata updates; `entity-insert` aborts entity insertion, optionally only for a specified fixture entity ID so a completed snapshot part and an interrupted later part can be observed. Fault controls are test-only; they do not modify the production class or schema. Connection reopening removes TEMP triggers as SQLite normally does.

The bounded loopback fixture transport performs real TCP/HTTP I/O and application-layer gzip for `.gz` resources, with actual conditional HTTP headers and returned ETags. It is not the production Java HTTPS connection: production `SyncStore` hardcodes the real service and casts to `HttpsURLConnection`, so the adapter explicitly confines fixture I/O to adb-reversed `http://127.0.0.1:PORT`. It never contacts the real account or tests real WebDAV authentication. The event, snapshot, batch, cursor, ACK, and storage operations remain production functions.

## GitHub-only execution

Both scripts refuse to run unless `GITHUB_ACTIONS=true` or `CODESPACES=true`. They do not install or download dependencies. Build requirements are the existing manual toolchain: JDK 17, Android API 34, build-tools 35.0.0, and preinstalled adb. The separately signed test APK uses an ephemeral synthetic key; formal application signing files are never opened or replaced.

```sh
node tests/protocol-harness/android/build-android.mjs \
  --output-dir "$RUNNER_TEMP/c003-android"

node tests/protocol-harness/android/run-android.mjs \
  --apk "$RUNNER_TEMP/c003-android/mytodo-c003-test.apk" \
  --serial emulator-5554 \
  --input resolved-case.json \
  --output "$RUNNER_TEMP/c003-results/android-case.json" \
  --db-case basic-note-receiver-windows
```

The input contains `suite`, `caseId`, `mode` (`generate` or `receive`), optional producer `sample`, optional origin-only `fixtureUrl`, and `provenance`. Resolve physical fixture plans before invoking snapshot/pull cases. Each receiver/producer pair must receive a distinct `--db-case` so earlier matrix runs cannot seed or alter an existing initialized database.

The runner requires a specifically named, fully booted GitHub emulator with a real WebView provider. It rejects physical device serials and never connects to a user device. Emulator startup and any explicit dependency authorization are handled by the parent CI workflow. If no installed image, emulator, acceleration, or real WebView environment exists, record `blocked` with its concrete inventory/log and retain exit code 78. An APK build alone cannot satisfy C0-03.

Exit codes: executed and individually passing case/restart checks return 0; execution failures retain the actual command exit code where available (otherwise 1); missing environment returns 78 and `blocked`. `passed` in an individual result does not establish three-platform compatibility: the parent matrix must compare all actual producer/receiver exports.

## Evidence files

`build-receipt.json` records the Git SHA/worktree, runner, versions, each tool command, real exit codes, logs/SHA256, unchanged Java/JS source hashes, the appended delta copy hashes, and unsigned/test-signed APK hashes. It never labels that build as a protocol pass.

For each case, `result.json` carries the actual shared result plus process restart comparison. Companion `.main.json`, `.restart.json`, `.receipt.json`, and `.logs/` preserve instrumentation output, raw tool exit codes, package/runtime information, and result/log SHA256. Failed or blocked invocations still write evidence. No executed results are claimed in this adapter README; current execution evidence belongs to the cloud run report.
