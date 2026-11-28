# D4-09 Android native UI regression

Prepared 2026-11-28 (Asia/Shanghai). This is source and a test contract, not a passing runtime receipt. Execute only in GitHub Actions against the same run's isolated `local.gxtodo.d408candidate` APK. The browser prototype's 16 cases do not substitute for these native checks.

## Integration

The D4-09 candidate workflow first builds the existing candidate and its frozen original tests through `android/d408/build-android-d408.sh`. In the same Actions job and output directory:

```sh
bash tests/d4-09/android/build-tests.sh "$RUNNER_TEMP/d408-native-candidate"
# Run the frozen tests/d4-08/android/run-native.sh first, retaining its outcome.
bash tests/d4-09/android/run-native.sh "$RUNNER_TEMP/d408-native-candidate"
```

The actual output directory may have another `d408-native-` suffix; it must be a direct child of `RUNNER_TEMP`. `EXPECTED_SOURCE_SHA`, `GITHUB_SHA`, current Git HEAD, run ID/attempt, workflow and build identity must agree. The new test APK uses the candidate's already-created same-run ephemeral signing key. It does not create or change a stable signing identity. The installed candidate APK hash is read back before the new instrumentation is installed; the runner neither reinstalls nor clears the candidate.

Run the new suite even if the original suite failed, so its independent evidence is available. The final `combinedPassed` requires both suites to pass with complete coverage. Do not relax, edit, replace or skip original tests to make the new suite pass.

## Exact matrix

Each case runs at 360×900 and 412×900 pixels, density 160, with the actual installed gestural and three-button navigation overlays: 8 cases × 4 phases = 32 new cases.

| Case | Main observations |
| --- | --- |
| U01 | Actual native start/pause/resume/finish controls, 48dp targets, same session in history, screenshots of the native timer |
| U02 | Real Activity recreation, unsaved duration draft, same session, elapsed time while backgrounded, return to the same Activity |
| U03 | Three-level task hierarchy, explicit collapse, same-title tasks with different parents, search/clear expansion restoration, draft-only selection then durable save of the intended ID |
| U04 | All 13 workspace destinations reached by actual menu-button and route-button touches, with a separate route screenshot after each successful visit; screenshots do not add test cases |
| U05 | Actual IME then physical system Back; editor draft retained when IME closes, existing save-on-leave contract on next Back, drawer Back leaves repository unchanged |
| U06 | Actual workspace-to-native timer entry, physical system Back closes picker before Activity, running session survives return to workspace |
| U07 | Actual x32, x56 and x63 content-edge starts, trusted DOM input observation, vertical rejection, x100 rejection and modal priority at x56 in the added 48..64 band; physical Back closes navigation |
| U08 | Actual bounded native exclusion rectangle, system Back outside that rectangle, mandatory bottom inset and actual system Home |

The frozen original matrix remains separately recorded: retained 15, features 7, feedback UI 7, work preservation 4, navigation 20, permissions 3 and reboot 2 = 58 cases in seven groups. New reports cannot replace missing original groups or original raw failures.

## Input and setup boundaries

All controls under assertion receive real `UiAutomation.injectInputEvent` MotionEvents. Each gesture receipt includes coordinates, action, monotonic down/event/dispatch times and whether Android accepted each event. Native fields receive real key input. Native taps combine the target's local visible rectangle and actual screen location, including a Dialog's window origin, and record that geometry. Gestural Back uses the physical right edge; three-button Back/Home uses observed accessibility bounds from a system window inside the actual navigation-bar inset. The Android 15 emulator may host that bar in SystemUI or NexusLauncher Taskbar; the observed owner, node ID/description/bounds, window type/bounds and before/after screenshots are retained. No hard-coded button coordinate or key-event fallback is used in these system-navigation assertions. IME dismissal used only to prepare another assertion may use a Back key event and is not reported as physical system-navigation evidence.

Existing repository APIs create explicitly named synthetic task fixtures. Existing timer commands establish/reset a case's synthetic session. Web JavaScript supplies setup routes, geometry, hit tests and state observations. It does not dispatch tested navigation/selection events or implement a second timer. Programmatic scroll-to-visible is used to reveal an actual native target and frame screenshots; the following button action is still a device touch.

The task picker exposes stable native View tags: `d409-task-select:<taskId>`, `d409-task-toggle:<taskId>` and `d409-task-context:<taskId>`. They identify real views; they are not test-only action endpoints. The original native IDs and incomplete-task title TextViews remain available for the frozen F01 test.

## Gesture boundaries

The shared app's content activation band is 64 CSS pixels. Its original direction, distance, velocity, editable-control and horizontal-scroll arbitration remain in place. An open modal blocks the outer content band at x>22 while the original x<=22 edge navigation remains available, including navigation away from and back to a held task-edit draft. U07 checks modal priority at x56, inside the added 48..64 band; the unchanged D403 draft case checks the original x3 edge. Modal subtask gestures remain available. The original Android exclusion rectangle remains at most 48dp wide and 200dp high in its existing local segment. CSS content activation and native system exclusion are separate controls. The extra 48..64 CSS pixels do not enlarge the OS exclusion. Mandatory bottom gestures are not excluded.

## Evidence and limits

`d409-ui-test-build.json` records exact source/run identity, the test APK's hash, its same-run signer and the test source hashes. `d409-native-ui-evidence` retains four raw instrumentation streams, requested and observed display/navigation configuration, raw input receipts, full PNG screenshots and SHA-256 values, failure window dumps, raw logcat, service and overlay dumps, and the original device evidence TAR. The aggregate rejects missing/duplicate case IDs, mismatched identities, missing screenshot bytes and incomplete old coverage. Each phase also requires the exact 13 U04 route visits and 13 original route screenshots attributed to U04; missing or failed visits remain failures and do not generate replacement images or extra cases.

This matrix covers the official isolated Android emulator. It is not physical-device/OEM certification, predictive-Back animation validation, quick-switch testing, production admission, stable signing or overwrite-upgrade approval. The original process-death/reboot/service/alarm tests remain the authority for their retained cases. No local app test, emulator, compilation, SQLite execution or runnable packaging is allowed for this project.
