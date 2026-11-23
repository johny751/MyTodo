# C006 Android internal interruption follow-up

Prepared by static review only on 2026-11-23 Asia/Shanghai. No local interpreter, syntax check, compilation, emulator, test or network execution. The earlier 59 Node / 18 native / 6 Android test-only core remains frozen. This is a separate test-only commit and workflow, not an edit to the first red evidence.

## Integration

- Copy `tests/android-kill/*` to repository `tests/c006/android-kill/*`.
- Copy `c0-06-android-interruption.yml` to `.github/workflows/c0-06-android-interruption.yml`.
- Existing frozen `tests/c006/c006-harness/{fixture-server,prepare-android,seal-evidence}.mjs`, the current C003 Android test shell, and C004 cloud runtime scripts are required and preserved.
- The cloud preparer calls the frozen C006 preparer first, then adds observation/termination hooks only to the temporary test Activity. Actual `AccountStore`, `ReplicaDatabase`, shared `syncDelta`, event/merge code and SQL transaction implementation are unchanged.

## Exact boundaries

**C006-A26-import-kill:** synthetic local note plus legacy task tree/note/tag/place. The native observer runs only when `operation=sync`, the actual AccountStore `commit` call returned `ok:true`, and its real row list contains the selected legacy key. It audits the committed SQLite state, verifies no transaction remains active, writes and fsyncs an immutable PID/database/source/attempt marker, then calls `android.os.Process.killProcess` in that real app process. It does not synthesize a failed return or alter the lease. The controller requires the actual process to be gone before cleanup, exports database plus available WAL/SHM/journal files, and refuses a normal final result or timeout. It reopens the same dbCase, compares exact raw business/outbox rows and all metadata against the gate, requires the actual busy lease result, waits using the recorded device clock and original expiry, then recovers. Actor, path and logical sequence are checked, and every original queued event must remain unchanged in a batch covered by the current manifest heads. Both recovered producer and a separate Android observer must equal the complete interrupted domain and retained events, including the original local note.

**C006-A30-manifest-kill:** the native HTTP shell waits for an actual 200/201/204 response to the initial conditional manifest PUT, saves/fsyncs the exact sent manifest and raw SQLite audit, then terminates before returning the response to JavaScript. This boundary is **successful response received by native transport**, not a claim that the response was lost. The fixture's existing after-write disconnect cases cover that other boundary. Cloud heads must still be empty and batch files absent. After verified process death and raw export, the controller moves only the exact synthetic original case directory to a unique retained app-private location, verifies its old production path is absent, and verifies its retained SQLite hash. It never reopens or resumes that database through production. A fresh Android dbCase must recover the complete original domain and retained actor/sequence/context/value events through referenced snapshot parts; its own seq and queue remain zero. Snapshot hashes and actual fresh-client GETs are required. Any observer GET of `state.json` or a legacy backup, or any observer batch PUT, fails the snapshot-only claim.

The APK is installed once before the two cases; retries never reinstall or switch databases. Every attempt has unique immutable request/result/marker names and raw ADB outputs. All execution is Actions-only, on the verified exact-source emulator runtime and a synthetic loopback WebDAV fixture. Test failure, missing marker, wrong PID/path/source, unexpected process exit, timeout, missing test result or unavailable environment cannot count as pass.

The workflow seals complete recursive build/case and emulator directories with root `sha256.json` inventories. The original C006 acceptance report still covers the frozen core; this follow-up's `cases/summary.json` must be reported separately and at the same accepted source SHA. It adds exactly these two Android boundaries; native C forced termination and other Android interruption boundaries remain unclaimed.

The parent owns cloud integration, red/green evidence collection, checkpoint updates and the single GROWTH entry for this change.
