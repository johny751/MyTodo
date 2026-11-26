# D4-05 Android first cloud run: preserved failure and repair hypothesis

Updated 2026-11-26 Asia/Shanghai. This is evidence review and source preparation; the revised candidate has not yet passed cloud execution.

## Immutable first run

- Source: `8779f84848c7df5eff86896abe627fe10ce1cfdb`.
- GitHub Actions run `45737059912`, attempt `1`; Android API 35 emulator.
- APK `0.5.1` / `405001`, isolated package `local.gxtodo.d405candidate`, temporary CI signing.
- Build succeeded. All 15 native cases executed: **10 passed, 5 failed**. This is a failed candidate, not release acceptance.
- Original artifact root, relative to `work/d4-native-integration/`: `ci/8779f84848c7df5eff86896abe627fe10ce1cfdb/45737059912-a1/artifacts/d405-services-45737059912-1/d405-native-45737059912-1/`.
- Original reports, screenshots, APKs and logs in that directory are unchanged. Original D4-03 tests and source pins are unchanged.

| Original case | Original failure |
| --- | --- |
| D405-06 lockscreen | `AssertionError: keyguard is locked` |
| D405-07 recreation | `AssertionError: timeout: native timer configured` |
| D405-10 FeedbackKit | `AssertionError: timeout: native feedback editor` |
| D405-visual-360 | Native pointer injection was directed at another UID |
| D405-visual-412 | Native pointer injection was directed at another UID |

## Ranked hypotheses and original log evidence

1. Sleep/lock transition was asynchronous; the 1,800 ms fixed delay was too short, and cleanup dismissed before the lockscreen appeared. Prediction: observing actual lock entry, then stable unlock and application focus, removes the shared obstruction without changing product code or assertions.
2. Activities were created but were not resumed/visible/focused. Prediction: raw window state reports hidden/sleeping tasks, while normal component creation succeeds; foreground assertions identify this before native input.
3. An independent timer rendering or FeedbackKit editor construction failure. Prediction: timeouts persist after lock/focus correction, requiring separate product diagnosis. This remains possible until the original suite passes in Actions.

The original `native-evidence/logcat.txt` provides direct evidence for hypotheses 1 and 2:

| Log line | UTC timestamp | Observation |
| --- | --- | --- |
| 12670 | 01:41:21.254 | `PowerManagerService: Going to sleep due to sleep_button` |
| 13138 | 01:41:23.259 | Cleanup already wakes the device from Dozing |
| 13939 | 01:41:24.397 | Keyguard `SHOW` is processed about 3.14 seconds after sleep initiation |
| 14003 | 01:41:24.503 | `updateActivityLockScreenState(true, false)` |
| 14231 / 15304 | 01:41:24.642 / 01:41:26.008 | NativeTimerActivity starts successfully and is displayed |
| 45933 / 45952 | 01:43:03.607 / 01:43:04.039 | Actual AAR FeedbackActivity starts successfully and is displayed |
| 45934 / 45940 | 01:43:03.607 / 01:43:03.755 | Feedback task is `isVisible=false`, `isVisibleRequested=false`, `isSleeping=true` |
| 48961 / 50145 | 01:43:23.568 / 01:43:31.102 | Native input targeted at app UID 10209 would instead reach `NotificationShade`, UID 10181 |

The accepted NativeTimerActivity starts its refresh poll in `onResume` and removes it in `onPause`. The FeedbackKit monitor had already found the real Activity; the subsequent editor search requires `View.isShown()`. These facts support a visibility/lifecycle cascade rather than a missing Activity/AAR. They do not independently prove every later failure is resolved.

## Minimal repair prepared for cloud rerun

Only the D4-05 instrumentation harness changes to address the five failures:

- Preserve the original real lockscreen assertions and all original 15 case identities.
- Poll `PowerManager.isInteractive()` and `KeyguardManager.isKeyguardLocked()` with a bounded deadline instead of assuming lock entry after a fixed 1.8 seconds.
- Keep cleanup in `finally`, wake and dismiss keyguard, and require one second of continuously observed unlocked state before continuing. Cleanup errors are added to the original failure instead of replacing it.
- Require a shown, focused Activity on an interactive unlocked display after launch/recreation and before WebView native pointer input. The actual AAR Activity has the same foreground prerequisite.
- Record lock entry duration and post-cleanup state. On failure, preserve observed UI state and raw window/power dumps in the same run evidence.
- Keep `sendPointerSync`, `sendKeySync` and `sendStringSync` as real input. No JavaScript click or selection-clearing fallback is added.

No timer/service/reminder/feedback product implementation is altered by this repair. Runtime verification remains the original Actions suite, including the full 15 cases, actual one-minute completion, actual external process kill/recovery, and 360/412 real editing.

Two additional root-requested evidence improvements accompany this source revision:

- The cloud builder independently compiles only formal `android/src`, generated `R.java`, official SDK and pinned AAR into an isolated class directory before candidate compilation. `formal-source-compile.json`, the exact source list, compiler version and compiler log record the result. No formal package is signed or installed.
- Offline version history preserves the failed first candidate with its exact source/run/build timestamp and non-release status; the current candidate and historical JSON/text use the same entries.

## Original artifact SHA256

| File under artifact root | SHA256 |
| --- | --- |
| `native-evidence/aggregate.json` | `410f2a2f8de1d0a3e08b3c0d73439a68fa4ce5220ca347a84af55450d055a911` |
| `native-evidence/logcat.txt` | `3bf365ac5e2e606f9d91033758eb20a576af5121edb1127506a272b644af7f48` |
| `native-evidence/instrumentation-main.txt` | `6158811c26d4fc90f1500699b0e7e863078e78212c1432d5457c821a99f240ae` |
| `native-evidence/instrumentation-visual-360.txt` | `517319b9cf57d55c7717053e6185a249421e5a4556b240c0a92cff9e8a44d25c` |
| `native-evidence/instrumentation-visual-412.txt` | `39a0d7a2734797b6bc7e77e2a9bb0acced0f6d0a3695fe74aeba87c11e617823` |
| `d405-build-identity.json` | `c22cc9ea3946c3b38bddbc495067421f7b24e732ac8993911d20b0674b527a51` |
| `mytodo-d4-05-native-candidate.apk` | `4e239c3559dd21e61c5a93f78f2bcdcfc887a46ac181074aceaa243049b61715` |
| `mytodo-d4-05-native-tests.apk` | `cd8124536047327517df8c3b55ab56afff5cff961849f28b6b6f7ee8ce9b3fa7` |

## Verification status

Local work was limited to source/text/JSON review and editing, hashes and evidence inspection. No local project build, tests, SQLite, browser, APK or emulator execution occurred. The first run remains **10/15 passing**. Revised cloud results must be recorded under a new exact source/run directory; this document does not convert the failed first run into a pass.
