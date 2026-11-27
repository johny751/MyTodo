# D4-08 Android independent candidate

This package is `local.gxtodo.d408candidate`. Development workflow versions are `408000 + GITHUB_RUN_NUMBER` / `0.8.<run>`; the candidate and preserved-regression workflow uses a separate `418000 + GITHUB_RUN_NUMBER` / `0.8.<10000 + run>` range. Both ranges accept actual workflow run numbers 1–9999, reject unknown workflow names, and retain the unmodified run number, run ID, attempt and workflow name in the receipt. Workflow counters must never be spoofed. History is ordered by actual build time across the two tracks; these are independent temporary-signature builds, not a cross-track overwrite-upgrade promise. All preparation, compilation, tests, database access, emulator execution and packaging require GitHub Actions. Local source review does not establish build or runtime success.

Build:

```bash
bash android/d408/build-android-d408.sh SAME_RUN_HTML "$RUNNER_TEMP/d408-native-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
bash tests/d4-03-platforms/start-emulator.sh
bash tests/d4-08/android/run-native.sh "$RUNNER_TEMP/d408-native-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
```

The HTML input must have a matching same-run build receipt. Outputs include `mytodo-d4-08-native-candidate.apk`, `mytodo-d4-08-native-tests.apk`, `d408-build-identity.json`, raw compiler logs, certificate metadata, SHA256SUMS and native evidence. Never upload CI private keystores.

The source in `android/src/`, D403 timer files and `android/d405/` remains unchanged. The prepare step records original/generated hashes for the isolated integration seam, store service notification hook and full history presentation bound. Candidate compilation excludes the original `NativeIntegration.java` and uses its explicitly transformed D408 copy; a separate first pass compiles the untouched formal Java source without candidate classes.

`D408TimerActivity` supplies native task selection, start/pause/resume/end/finish/rest/reset controls, all stored history through native pagination, daily statistics, errors and explicit idempotent retry. The existing `NativeTimerStore` remains the only timer authority. Task names are resolved through the candidate application's existing isolated AccountStore mirror; no production account or remote connection is exposed. Historic records preserve task IDs; current task names can change or disappear without deleting the timer history. Statistics retain the original Beijing-day and countdown-completion semantics.

The candidate uses the unchanged FeedbackKit 1.2.0 AAR and original tools/list/editor/storage, presented as the primary feedback workflow. The separate synthetic Web feedback remains available through an explicit expandable control, with its data boundary preserved. No remote feedback submission service is invented.

The system gesture exclusion rectangle is 48dp wide and at most 200dp tall, starting at 80dp, and does not disable system Back. The shared Web gesture recognizer supplies an application-side 48 CSS px start region. The new native navigation suite changes the actual installed gestural/threebutton overlay at 360/412 CSS widths and preserves overlay and display evidence; the external blackbox probe remains the frozen D405 comparison.

The only new permission relative to D405 is RECEIVE_BOOT_COMPLETED in this separate manifest. `D408BootReceiver` restores the candidate's saved timer and alarms. Strong force-stop semantics remain OS controlled: the user must reopen after force stop. The exact notification permission and channel state still governs delivery, with durable pending completion retained while blocked.

The new run report separates adapted retention tests (15), D408 feature tests (7), FeedbackKit UI cases (7), native navigation cases (20: five per size/mode combination), permission cases (3) and actual reboot cases (2). These are planned assertions, not claims of passing. Unchanged D403/D405 suites run separately and retain their own original counts. The feature set exercises actual primary feedback entry/editor save and independent actual FeedbackKit image/draft/backup/batch data operations. The separate FeedbackKit UI suite uses real system Photo Picker/SAF windows, native previews, draft recreation, cancel/confirm deletion and undo, local archive restore/error/retry, and required-body validation. It creates only isolated synthetic MediaStore fixtures and never injects fake picker results. Native navigation uses actual MotionEvents over thirteen routes, edits with the observed keyboard, a clearly labelled synthetic horizontal-scroll fixture, and native work-note text selection. All results remain pending until corresponding cloud reports are available.

The reboot pair proves actual boot-count change and session recovery after reopening; the runner also captures service state before opening. Do not describe automatic post-boot notification delivery as verified solely from the reopened instrumentation result.

The native aggregate rejects missing or duplicated case IDs, wrong phases/build identities, inconsistent result counters and incomplete groups. The frozen baseline collector separately expects forty planned IDs across four phases; it records attempted IDs, not-executed IDs, setup aborts and harness errors. Baseline product gaps stay false while a complete collection may succeed; infrastructure errors cannot produce `collectorPassed: true`. Source-only corrections after run 45790215610 are pending their own exact-source cloud verification.

The storage-level F04/F05 cases use actual MediaStore content URIs and retain the resulting archive bytes. They do not claim system picker interaction. U01/U04–U06 separately exercise the actual Photo Picker and SAF using UiAutomation screen/key input, with no fabricated Activity result. The native task picker case searches for its seeded task before selecting the visible result.

Stable signing, installation over a user's old application, production migrations, D2 integration and production synchronization remain out of scope. The shipped UI identifies a temporary CI signature and the actual injected build time/source. A successful candidate run does not close issue #1 or D4-03.
