# D4-05 second cloud run: retained failure and proposed repair

Updated 2026-11-26 Asia/Shanghai. Source `84de5bc9f261c1eb8051124e67e363b1a12624e5`, run `45739951988`, attempt `1`, D405 job `139642630204`: **15 executed / 14 passed / 1 failed**. Candidate `0.5.2` / `405002`, actual APK compile timestamp `2026-11-26T02:05:46.428Z` UTC. This is a failed, unreleased, unaccepted candidate signed with temporary CI material. No final third-run result exists yet.

## Raw outcome

The only failure is `D405-09-formal-reminder-alarm-delivery-and-snooze`: `java.lang.AssertionError: timeout: OS reminder alarm`, original 20-second deadline, instrumentation line 228 in the exact second-run source. Recorded failure state is interactive=true, keyguardLocked=false, D405Activity hasWindowFocus=true, decorShown=true, destroyed=false. All previous five failures (lockscreen, Activity recreation, native FeedbackKit editor and actual edit at CSS 360/412) passed this run. Actual one-minute timer delivery and external process death/recovery also passed. Formal isolated javac passed with javac 17.0.21; 22 input files and 56 output classes, no candidate classes in that compile and no formal APK built or installed. Old D403 58 remains a separate gate and must be audited when its artifact arrives.

## Supported cause and evidence limit

Ranked hypotheses were (1) a late initial WebView reminder mirror save overwrote the native-only synthetic fixture, (2) scheduler cancellation, and (3) OS delivery delay. Static source supports (1) triggering (2): case 08 launches a fresh D405 WebView but only waits for Activity focus; old case 09 inserted the synthetic task directly into AccountStore. `native-integration.js` ready() immediately writes the entire authoritative repository state. `D405Bridge.saveReminderState()` writes that state and calls the unchanged formal `ReminderScheduler.refresh()`. Refresh cancels the prior alarm, then schedules only tasks still present in its mirror. A native-only fixture is absent from the repository and can therefore be erased. First-run case 09 passing under a differently delayed WebView does not exclude this timing race.

The raw second-run alarm dump lines 620–623 record `u0a209`, `Reason=alarm_cancelled`, RTC `2026-11-26 02:09:20.879`, tag `*walarm*:local.gxtodo.REMIND`, after case 08 completion and foreground relaunch at 02:09:17.139. The same dump records earlier actual REMIND delivery; the notification dump has the earlier `d4-task-0` reminder on private importance-4 channel, but no d405-qa-reminder. Logcat has no GxTodoReminder schedule/delivery exception. These observations support cancellation and rule against a simple disabled channel, but do not directly identify the cancelling call or alone prove mirror overwrite. The diagnosis is source-supported and awaits the targeted Actions rerun.

## Minimal third-run preparation

Only D405-09 instrumentation logic changes. Wait for the real initial reminder save, create the synthetic task using the existing `D4Prototype.repo.createTask`, and wait until native AccountStore contains matching id/title/reminderAt/done. The existing domain accepts custom reminders at minute precision in Beijing time; the current minute is already due, and the real formal scheduler uses its existing +500ms minimum alarm time. Capture the JavaScript wall clock in the same evaluation as task creation; assert and record `fixtureWallMillis - reminderAt` in [0,60000). This now covers current-minute due-reminder scheduling, whereas the old native-only fixture used now+2 seconds; the exact trigger instant is deliberately different to obey the existing domain input precision. There is no clock mock, forced receiver invocation, replacement scheduler, or relaxed notification test. Preserve the original 20-second OS delivery timeout, VISIBILITY_PRIVATE check, actual snooze PendingIntent action and durable native snooze receipt. Finally delete the fixture through the same repository and confirm both repository and native mirror absence. Record fixture/mirror agreement, cleanup, and failure mirror/alarm diagnostics, preserving the primary exception if cleanup also fails.

All 43 original check calls and original 15 case names remain unchanged; two assertions are added: captured current-minute due time and cleanup. Static comparison is `original-assertions-static-comparison.json`, exact source diff `second-run-reminder-repair.diff`. Product implementation, formal seam, permission manifest, scheduler, runner and all frozen accepted sources remain unchanged. Offline version history adds this real failed run without rewriting the first candidate. `prepare.mjs` current change text describes the instrumentation fixture repair; version number/build time are still injected only by Actions.

## Preservation and execution boundary

Raw evidence remains under `../ci/84de5bc9f261c1eb8051124e67e363b1a12624e5/45739951988-a1/`; no reports or artifacts were edited. Second-run 19-file source inventory and assertion comparison are preserved as `second-run-candidate-file-inventory.json` and `second-run-original-assertions-static-comparison.json`. Original first-run failure evidence remains separate. Current review uses only source, JSON, ZIP and hashes locally; no project build/test/SQLite/emulator/browser/APK execution or runnable packaging occurs locally. Third-round exact-source GitHub Actions must run every gate again.

## Original artifact hashes

- `d405-build-identity.json`: `d5eef410b8efa959084b424399034159efd7ab305560bb966ec943a2218dbcd3`
- `mytodo-d4-05-native-candidate.apk`: `fca8b7753fe7ee79868968a3f9dc9168277eb630592000e2ce88b2203d6a0977`
- `native-evidence/aggregate.json`: `28802fba6deb6620fc353d9da925736194bec802b84edabfa3d0047dc7fd4b1d`
- `native-evidence/logcat.txt`: `05e5f68426242b5f2d5fa5e7f5a6fd44726ffb198f6f18a9b0556e16bfca3023`
- `native-evidence/alarm-dump.txt`: `c6dc15b97abc5ae0b19b3bd902fd6240620c099e7cbb069b00b2d4f36d0ec581`
- `native-evidence/notification-dump.txt`: `f36887b0388de636027eeebd526f60d19b9ac514e1d7953ad1189b51a9068e87`
- `formal-source-compile.json`: `1126b1d8295f3362c715ab56252b29810578c1ec1bff75bff235c58099cc4680`
