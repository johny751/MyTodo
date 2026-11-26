# D4-05 Android native integration candidate

Prepared from accepted `9fe8824754af4e8b541f3550e677564183fa7c1f` on 2026-11-26 Asia/Shanghai. First cloud source `8779f84`, run `45737059912` attempt 1: **10/15 passed, 5 failed**. Second cloud source `84de5bc9f261c1eb8051124e67e363b1a12624e5`, run `45739951988` attempt 1: **14/15 passed, 1 reminder timeout**. All first-run failed cases passed in the second run. The current reminder fixture repair is prepared for a new exact-source Actions run; see `SECOND-RUN-FAILURE.md`, preserving `FIRST-RUN-FAILURE.md`. All execution is reserved for GitHub Actions. Candidate source is `candidate/`; no local build, emulator, SQLite or project test was executed.

## Actual native integration

The candidate compiles the formal `android/src` application tree and pinned FeedbackKit AAR. Its explicit application id is `local.gxtodo.d405candidate`. Formal MainActivity dispatches only that id to D405Activity. The formal AndroidCompanionService delegates only that id to D405TimerCompanion. The ordinary formal package retains its original timer and startup behavior.

D405Activity preserves the accepted WebView asset boundary, exact-once Back, safe-area layout, document selection and text-selection lifecycle. It adds a separate narrow `GxD405Native` bridge, never the formal generic account/sync bridge. Formal native FeedbackApplication and FeedbackToolsActivity are compiled unchanged. FeedbackKit 1.2.0 is merged from the pinned AAR (SHA256 `4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade`). The existing synthetic feedback UI remains available; an explicit native entry opens the actual shared module.

The original `NativeTimerSession` remains the sole candidate authority; formal `PomodoroTimer` does not initialize in D4-05. Build preparation copies the original accepted NativeTimerStore and NativeTimerActivity into a fresh build directory and applies two recorded adaptations: a successful user mutation wakes the formal service; the foreground native page leaves automatic completion claiming to that service. Original source files are never edited. The session and original PomodoroClock are reused unchanged. Native and Web timer commands retain expectedRevision and idempotency receipts. Notification actions carry session/revision identity. Stale actions cannot mutate a later session.

The service persists through normal background/Activity replacement, uses a private status notification, and schedules the native deadline alarm. Exact-alarm capability is checked at scheduling; without it, the Android inexact wakeup API is used and the UI reports possible delay. Native completion uses the session id as a stable notification tag, then durably claims the completion. If notification permission/channel is unavailable, completion remains pending. This does not claim exactly-once physical alerting across arbitrary OS kills between notification and claim; stable notification identity prevents separate duplicate entries.

Task reminder data crosses a narrow `saveReminderState` interface containing the existing version-2 model only. This writes through the existing AccountStore inside the independent candidate application sandbox, then uses the unchanged formal ReminderScheduler. It does not access the installed formal package. The reminder receiver's D4-05 execution moves onto the bounded native I/O worker, retaining formal handling and snooze semantics. A system tap routes through formal MainActivity into candidate task detail.

## Formal modification boundary

`formal-source-minimal.diff` contains four edited formal files:

- MainActivity: exact candidate-id dispatch and lifecycle short-circuit.
- AndroidCompanionService: candidate service delegate, start, shutdown.
- CompanionAlarmReceiver: asynchronous candidate completion delivery.
- ReminderReceiver: candidate receiver I/O dispatch, unchanged handler body.

`NativeIntegration.java` is the new optional interface seam. D4-05-specific classes are in `android/d405/src`. Formal manifest, original timer, all database and sync sources, schema, models, and ACK/outbox/cursor/manifest/batch semantics are unchanged. No LAN/WebDAV or startup network is exposed. D4-05 manifest has an exact four-permission whitelist: POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, SCHEDULE_EXACT_ALARM. No INTERNET, account, storage, overlay, usage or boot permission is requested. Original D4-03 manifest still has zero permissions and no service.

## Actions entry points

Prerequisites: Linux Actions runner, JDK17, official Android API35/build-tools35.0.0, existing same-run verified HTML and its build-receipt.json, emulator API35. Environment: GITHUB_ACTIONS=true, EXPECTED_SOURCE_SHA=GITHUB_SHA=checked-out candidate SHA; GitHub run identity and RUNNER_TEMP.

Build: `bash android/d405/build-android-d405.sh "$VERIFIED_HTML" "$RUNNER_TEMP/d405-native-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`.

Before candidate compilation, the builder compiles only formal `android/src` plus generated `R.java` against the official SDK and pinned AAR in an independent class directory, with an empty source path. `formal-source-compile.json`, `formal-java-sources.txt`, `formal-javac-version.txt` and `formal-compile-log.txt` preserve this compile-only check; no formal package is signed or installed. Second-run Actions receipt proves this isolated compile passed (22 sources, 56 classes, javac 17.0.21); every new candidate source must rerun it.

Runtime in emulator: `bash tests/d4-05/run-native.sh "$RUNNER_TEMP/d405-native-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`.

Static regression in Actions: `node --test tests/d4-05/scope.test.mjs` (two tests including 25 frozen file hashes). Native suite has 15 cases across five phases: main, visual-360, visual-412, process-prepare, process-recover. Phone visual phases use real native touch/key replacement and read-only selection observations; runner records exact CSS width and restores device size/density.

Build outputs: `mytodo-d4-05-native-candidate.apk`, `mytodo-d4-05-native-tests.apk`, `d405-build-identity.json`, `permission-policy.json`, `apk-signature.txt`, `test-apk-signature.txt`, `apk-badging.txt`, `apk-permissions.txt`, `SHA256SUMS.txt`, generated compilation sources and source lists. Exclude `isolated-d405-key.jks` from artifact uploads; it is disposable per-run test signing material and unrelated to the formal release or D4-03 package.

Runtime outputs: `native-evidence/aggregate.json`, five unaltered phase reports and instrumentation stdout, process-death fixture and killed-pid.txt, screenshots, logcat, notification/alarm/service dumps. Preserve artifacts on failure. Do not label preparation or build success as runtime success. Keep original 58-case D4-03 job and browser/C0 jobs separately.

## Coverage and unresolved conditions

| Owner area | Executable CI coverage | Current status |
|---|---|---|
| Background timer service | D405-03, D405-05 | Second run passed; third source rerun pending |
| Notification control | D405-04 | Second run passed; third source rerun pending |
| Lock screen | D405-06: actual keyguard/screen-off, private notice | Second run passed; true keyguard entry and stable unlocked/focused cleanup recorded |
| Activity reconstruction | D405-07: actual recreate, shared session, dirty native config | Second run passed; same session and draft after actual recreation |
| Process death/recovery | D405-12/13: external run-as kill -9, different process, same durable session | Second run passed; third source rerun pending |
| Actual timer deadline | D405-08: real one-minute countdown; no fake time | Second run passed; third source rerun pending |
| Reminders and snooze | D405-09: actual formal OS alarm + notification action | Second run FAILED: real OS delivery timeout; repository fixture repair awaits third run |
| Native FeedbackKit | D405-02/10: native entry and actual AAR editor touch/save/storage | Second run passed; actual AAR editor, native touch/save and storage |
| Original interactions | Original 58 + original browser suites remain independent | Must rerun current candidate |
| Work-note visual trace | D405-11 plus actual edit/save/detail at 360/412; read-only selection/focus + screenshot | Second run passed at both CSS widths; screenshots/read-only selection evidence retained |
| Stable signing | Review plan only | Explicit approval pending |
| Old-version overwrite/data | Review plan only | Explicit approval pending |

Unresolved: real-device/OEM background restrictions and secure credential lockscreen are not emulator evidence; reboot recovery is not included (no boot receiver/permission); force-stop does not promise background delivery; notification denial/revocation and exact-alarm fallback have code paths but no dedicated current runtime case; all accepted arbitrary unsaved Web work forms across process death are not covered by native timer draft recreation; native FeedbackKit backup/export/restore inherits the old implementation but this suite only adds current editor save coverage; full data/storage migration remains prohibited. The candidate reminder store is a mirror for native delivery, not approval of the entire new work model as production storage.

The third-run preparation changes only reminder test fixture setup/cleanup plus offline history text. All 43 original assertions remain; current-minute due-time and cleanup assertions are added. Current-minute reminder scheduling follows the domain’s existing Beijing minute precision and replaces the former native-only now+2s fixture; the original OS alarm timeout remains 20 seconds. The source-supported mirror-overwrite diagnosis is not a claim that logcat directly identifies the cancelling caller.

D4-03 remains open. Candidate success grants no production admission. Retain prior failures and owner acceptance evidence unchanged.
