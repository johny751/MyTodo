# C006 integration and unresolved recovery decisions

This is static preparation. No commands in this document were executed here.

## Integrating after C005

1. Resolve and record C005 accepted business SHA and passing Actions run IDs before changing production. The current draft's C004 snapshots are evidence, not the merge base.
2. Create C006 red tests using unchanged accepted production functions and real adapters. Preserve predicted failures for native fence/backup, stale retry selection, fresh-device handover and no-base tombstone scenarios.
3. Apply only the reviewed replacement functions/helpers to C005 sources. Do not copy the full C004 `windows/sync.c`, because that would undo C005 credential handling. Keep C004 validation, counter and pending guards.
4. Run all builds/tests on GitHub. Local work here consists only of source text and read-only review. Do not invoke npm/node/python/Gradle/C compilers locally even for syntax checks. Read-only hashes or diff checks can verify text provenance, but are not runtime validation.
5. Parent updates project checkpoint and `C:/Users/adwoo/.Codex/GROWTH.md` once, with actual change and verification status, to avoid concurrent edits.

## Minimal candidates' exact scope

The C candidate closes two data-loss entry points by accepting only a well-formed no-backup fence while the manifest is absent, and rereading a conflicted fence creation. A valid nonempty backup is preserved with an explicit incomplete-migration error. It retains the current native architecture's lack of full v1 merge/import. Its extra manifest recheck can notice a migration completed since the caller's initial 404.

The JS candidate adds a required null-or-safe-relative-backup field and strict envelope parsing, and makes each attempt's `legacy` selection independent. It preserves existing merge and manifest-publication ordering to avoid disguising larger semantic changes as input validation.

Neither candidate should be called a complete C006 solution until the distinct handover and tombstone cases are decided and tested.

## Recovery decision that needs production design

Current order is backup → fence → import legacy as local replica events → create empty-head manifest → bind → publish events. There is no durable public acknowledgement that a `manifest.legacy` payload has been imported/published. A fresh observer ignores it as soon as a manifest exists.

Simply merging `manifest.legacy` on every client is unsafe: after a legitimate v2 deletion, historical backup data can be replayed as fresh writes and revived. A local marker alone cannot prove another device's migration completed. A new-device recovery fix needs a durable shared completion rule (or initial reachable production event/snapshot state) and must be tested against later deletion and concurrent migrators. Do not introduce an unreviewed second recovery algorithm inside the fixture server.

The minimal C safe-refusal strategy can guarantee that it does not suppress unfinished backup migration before the manifest exists. It cannot by itself provide automatic C recovery after a JS manifest exists but its imported events are not yet published.

The no-base tombstone risk arises from a precise source path: `buildState` omits deleted rows; empty base + no local visible item + backup item returns the backup item from `mergeValue`; `diffState` emits `_deleted:false`; `editReplica` creates a causally newer event using the local vector. Test unchanged-backup deletion separately from a genuinely changed remote legacy item. The existing three-way conflict policy may intentionally preserve content on delete/edit conflict, so do not flatten these into one expected outcome.

## Harness reuse and changes

### Shared fixture server

Reuse C003 real disk/HTTP/gzip/ETag mechanics, but add a migration fixture initializer that can leave manifest absent. Existing `materializeFixture` always creates a v2 manifest and would skip the migration under test.

Extend request evidence with request conditions and fault gates. Fault plans select method, safe relative path, attempt ordinal and stage such as `before-write`, `after-rename-before-response`, `before-response-body`, or concurrent fixture replacement before conditional validation. A transport close after persistence must really write and rename the file first, then destroy the socket. Record both these facts separately.

Keep fault actions in a synthetic RUNNER_TEMP root and never log Authorization. Bind to loopback only. Legacy fixture replacement is a controlled competing-client input, not a fake production merge.

### Node

Call exported production `syncDelta`; `ensureManifest` need not be exported for end-to-end JS tests. Use actual production SQLite store. Existing private C003 export set does not include `ensureManifest` and the shared executor pre-binds scope/epoch, so add a migration-specific entry starting with unbound production metadata.

For process interruption, parent runner owns the fixture server; child owns actual production synchronization and SQLite. A thin call/request wrapper can notify a boundary only after the actual production request or transaction resolves, then pause for the parent to terminate the process. It must not fake returned state, implement a merge, or suppress production operations.

### Native C

Focused cases can expose the actual static `create_manifest` by including the production source in the existing adapter translation unit; use real WinHTTP and existing loopback connect helper. Record the source SHA and exact allowed test-copy changes.

Full `sync_run` hardcodes `dav.jianguoyun.com` and TLS; end-to-end loopback testing needs a narrow audited host/port/secure-flag seam. Never claim a test of a copied reimplementation is a test of `sync_run`. Existing C003 include collision must be retained: production `native.h` declares `J *dup(J*)`; surrounding `<io.h>` with test-only `#define dup c005_crt_dup` / `#undef dup` prevents CRT `dup(int)` conflict.

`db_import` is add-only and ignores existing keys, including tombstones. It does not equal JS `mergeStates`; it cannot be substituted as a full native legacy migration without defining and testing new semantics.

### Android

Use production `syncDelta` in WebView and real native SQLite bridge. Existing `ProtocolHarnessActivity` loopback request supports gzip and conditions but uses a C003 folder; add explicit synthetic per-case folder input with identical validation across platforms. Route fixture server through adb reverse.

Use the same `dbCase`, account/database path and cloud root after `am force-stop` and launch. Record emulator/process identity and native audit before restart. Do not use the prior crash-retry pattern that switches to a new DB, because that only tests a fresh run.

### Lease handling

Actual `syncDelta` and `sync_run` acquire a 120000 ms lease. Abrupt process termination skips finally/release. Same-DB tests must first demonstrate the lease prevents premature reentry and then wait until the recorded production expiry before retrying. Do not clear or rewrite the lease in the fixture. Bound these waits in GitHub job timeouts and distribute independent cases across jobs if needed.

## Reporting

Report cases, variants, actual executions and comparisons as separate numbers. Distinguish safe rejection, successful same-DB recovery, cross-device takeover, and eventual observer convergence. Retain all first-failure artifacts. The fact that a retry passed on another DB or runtime cannot erase or reclassify the original outcome.
