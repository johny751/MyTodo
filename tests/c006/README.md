# C006 real execution drafts

Status: authored by static source review, **not executed or compiled locally**. Parent must freeze source and run on GitHub after C005 acceptance.

Integration mapping: copy the contents of this `tests` directory to repository `tests/c006/`. Therefore shared scripts live at `tests/c006/c006-harness/`, and the native adapter at `tests/c006/windows/`. The native build script uses that exact layout. Copy `c0-06-migration.yml` to `.github/workflows/` only when ready for the C006 stage.

## Node

`c006-harness/runner.mjs` calls a distinct Node process per production operation. `js-worker.mjs` imports actual `src/delta-sync.mjs`, `createSQLiteStore`, `initializeReplica` and `editReplica`, opens a real `tasks.sqlite`, records raw SQL and process/source identity, and refuses execution outside Actions. It does not clone migration or recovery algorithms.

The runner implements normal v1/no-file migration, backup/fence/manifest transport faults, 412 rereads, eight-attempt exhaustion, invalid ETags/guards/backup data, manifest winner validation, real process kill gates, same-DB lease and retry, fresh-device takeover, tombstone preservation, concurrent real migrators, legacy-base edit merge, retry conflicts, and subsequent v2 deletion. `scenario-matrix.md` remains the complete proposed cross-platform matrix; a JS implementation must not be represented as an Android or C execution.

Cases `C006-30-fresh-takeover`, `C006-35-delete-without-base` and `C006-36-edit-during-retry` deliberately assert preserved semantics and are predicted red on existing production. No `expectedFailure` bypass exists. Parent must inspect actual red evidence before selecting production fixes.

The producer-to-observer comparisons include complete domain state, explicit Chinese/emoji field text and task parent/child relationships. All durable rows/events/tombstones/meta/outbox are retained. A killed process leaves the real production lease intact; same-DB tests first require the busy response, then wait for the actual recorded lease expiration. No production clock or lease is rewritten.

Directed marker rows C006-39/40/41 cover a real SQLite trigger abort during marker persistence, unchanged logical import sequence/outbox across a repeat import, and explicit rejection if the selected immutable backup changes after import. The draft currently defines 59 Node rows; this is a static inventory, not an executed or passed count.

## Windows C

`windows/migration-native.c` includes unchanged current production sync source with a narrow API transport seam and links real production SQLite. `windows/build-native.mjs` adapts only the existing build recipe. `windows/native-runner.mjs` uses asynchronous processes while the real HTTP server remains responsive and checks exact exit/result/source provenance. Consult that directory's README for scope and the deliberate native v1/incomplete-backup refusal.

Its 18 drafted rows include C006-30: an actual JS process is killed after the first successful manifest PUT, heads remain empty, no batch exists, and a new actual native database must recover legacy records through every referenced snapshot part. This is a JS-kill/native-observer test, not native forced termination. Refusal/recovery rows retain the original native actor and require every original outbox event to appear unchanged in an actual published batch, in addition to full domain comparisons.

## Android

`prepare-android.mjs` copies the existing C003 Android test shell into RUNNER_TEMP, substitutes a migration entry that calls actual `syncDelta`, adds validated synthetic folder selection, raw SQLite audit fields, and real TCP MKCOL support for loopback. It preserves production `AccountStore`, `ReplicaDatabase`, shared migration and merge functions. The generated adapter hashes and exact text changes are recorded.

`android-runner.mjs` uses the established real APK/instrumentation runner with one fixed `dbCase` across each failed operation and recovery. Each successful operation includes an actual force-stop/relaunch and same-DB comparison. It currently contains six real Android case drafts. It does **not** claim abrupt Android process death at an internal migration boundary; that needs a dedicated gate controller. Raw SQL, source SHA and runtime are retained in addition to the old normalized comparison.

The Android job uses `ubuntu-24.04` and calls the existing `scripts/ci/c004-android-emulator.mjs start/finish`. It preserves the API34 Google APIs x86_64 image, KVM setup, WebView readiness, JDK17, optional authorized official Google SDK installation and Ubuntu libpulse0 policy. No serial is supplied externally. The Android runner requires the ready runtime receipt to match the exact commit, run ID, attempt and serial. Skipped or blocked execution is not a pass, and results from an earlier source SHA are rejected.

## Remaining review before execution

- Native/runtime dependency versions and emulator provisioning come from the existing authorized project CI; no local build or dependency fallback is provided.
- Add actual native process-kill boundary cases and Android mid-operation kill controller to extend platform coverage beyond current drafts.
- The Node fault server serializes conditional PUT validation through disk rename so simultaneous writers cannot both pass a stale ETag check. It stores raw gzip files and request conditions.
- Corruption fixture restoration is explicitly a controlled test repair, not normal client behavior. Immutable production backup writes are still checked through actual conditional HTTP.
- Tests use only synthetic data and loopback endpoints. No real Nutstore credentials or user business data are accessed.

`summarize.mjs` reads only artifacts from this workflow attempt, requires all three platform summaries and the Android runtime receipt, checks per-row/count agreement and source lineage, and reports all failing or absent evidence. The workflow keeps this report even when upstream jobs fail.

Every uploaded root is sealed by `seal-evidence.mjs` after its last writer: Node, native build plus cases, Android build plus cases, emulator environment after finish, and final report. The root `sha256.json` recursively lists every payload file (including summaries, logs and `evidence-seal.json`) except itself. Sealing uses the exact source/run/attempt and does not execute tests. The complete job checks manifests, hashes, missing/unlisted files and seal lineage before declaring acceptance. The parent collector may independently verify the same `sha256.json` format.
