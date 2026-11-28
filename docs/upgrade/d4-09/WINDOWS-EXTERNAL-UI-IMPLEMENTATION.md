# D409 independent Windows external UI harness

2026-11-28, Asia/Shanghai. No C# compilation, PowerShell parsing or native application execution has been performed locally. All application, test, SQLite and packaging execution is restricted to GitHub Actions. Frozen D408/D404 test files are unchanged. First full candidate `f7a2b97d6bff08440fea83af16e914a1e6d1ce46`, Actions `46092613090` attempt 1, executed the new external suite and preserved failures; the current repair is awaiting its own cloud run.

## Files and integration

- `tests/d4-09/windows/NativeUiDriver.cs`: independent D409 namespace; native window/PID/root/control lookup; timeout-bounded system read messages; actual mouse SendInput with WindowFromPoint evidence; native keyboard/Unicode SendInput; explicit focus/window-management method labels; temporary supported desktop mode selection and restoration.
- `tests/d4-09/windows/native-ui.ps1`: strict source/run/attempt/EXE/build-receipt/isolated-directory guards, original CLI synthetic task fixture/export, real native work forms and original backup/file-dialog paths, 24 mandatory cases, exact durable JSON readbacks, screenshots and input traces.
- `tests/d4-09/windows/native-expected.json`: unique case IDs and mandatory screenshot names. Missing, failed or blocked cases or screenshots make the suite fail. No skips or hidden retries.

The existing candidate workflow calls the runner separately for application scale 96 and 144, with `-Executable`, `-ProductSourceSha`, **required** `-ExpectedExecutableSha256`, `-OutputDirectory "$env:RUNNER_TEMP/d4-09-ui-{dpi}"`, and `-Dpi`. Both runs use the exact same built EXE. Output `ui-report.json` retains the packager's compatibility fields, and adds `harnessSourceSha`, `productionAdmission:false`, the build receipt hash, real OS DPI observations, actual desktop bounds, case status, screenshots and readbacks.

Compatibility product identity remains D4-08; presentation stage is D4-09. This matches the retained executable/build contract, and is not rewritten as a new production version.

## Implemented external cases

| Case | Actual new external checks |
|---|---|
| N409-01 | Exact source/EXE and receipt, genuine main HWND, original isolated marker, quadrant screenshot |
| N409-02 | Three genuine module entry mouse hits, hide/reopen HWND lifetime |
| N409-03 | Ten real work navigation targets and distinct page titles |
| N409-04 | Original visible zero-count overview and empty guidance |
| N409-05 | Item creation by native keyboard, stable readback, selected preview, row double-click editor |
| N409-06 | Independent per-page query/selection, filtered-out preview removal, no-result recovery |
| N409-07 | Invalid form input remains available; correction saves one record |
| N409-08 | Two same-name projects, actual color and stable-ID relation selection |
| N409-09 | Zero-step rejection with preserved name, two stable steps, enable/disable/copy independent IDs |
| N409-10 | Native instance snapshot, pause/resume/two advances, repeat-complete rejection |
| N409-11 | Contact/followup stable relations, archive/restore identity, delete cancellation |
| N409-12 | Explicit synthetic original-format backup imported through native dialog; exact historical milliseconds/timezones/unknown/null/extension preservation; full note selection and scroll |
| N409-13 | Modal owner disabled/restored; short modal Tab traversal and fixed footer reachability |
| N409-14 | Real task title/notes/quick-subtask keyboard input and original CLI export readback |
| N409-15 | Actual cross-quadrant drag with pointer endpoints and exact durable one-task change |
| N409-16 | Timer labels/control geometry, task/config save, invalid duration does not replace valid config |
| N409-17 | Real start/pause/hide/reopen/resume/end continuity and one history row |
| N409-18 | Real one-minute countdown, ACK, count-up completion, early rest and original round semantics |
| N409-19 | Original statistics/date-inclusive count, invalid date leaves prior valid result |
| N409-20 | Actual debounce/durable draft, generated PNG via native file dialog, byte hash, GDI+ preview, local submit, deletion batch and undo |
| N409-21 | Populated real page screenshots and honest settings/build source information |
| N409-22 | Actual Tab/ShiftTab/Escape and cancelled draft preservation |
| N409-23 | Native minimum/maximized/restored geometry and original required actions in actual desktop |
| N409-24 | Original normal shell close/reopen, stable work IDs/timer history/feedback IDs |

The earlier test-plan table was a broader design checklist. This table describes what the newly written external runner actually attempts. Account switching, full project/tag suggestion matrix, over-20 template steps, protected legacy-template deletion, every task menu/zoom/collapse behavior, exact font metrics, injected write errors and real IME composition are **not** claimed again as new external cases; the unchanged earlier regression suites retain their existing coverage. Contacts/followups/archive owner acceptance is still unknown. No physical-device, multi-monitor or real OS 150% scaling acceptance is implied.

## Evidence behavior

Every operation either checks the actual target root/PID/class/ID or uses an explicitly named window/focus API. The driver contains no BM_CLICK, WM_SETTEXT, arbitrary mutation-message entry point, remote process memory access or product injection. Read-only LB/CB/edit messages are marshalled system messages; SysListView reads only scalar count, never a foreign pointer.

Screenshots use actual foreground `CopyFromScreen`, retain the original PNG, and create a separate at-most-960px JPEG with hashes, dimensions, screen crop and preview conversion factors. Capture checks that the client fits the actual desktop and that a client-center point belongs to the intended window tree. It does not use PrintWindow as evidence of selection or scrolling. Full image review remains a separate root task after Actions output is available.

144 means `--visual-dpi 144` application scaling. The runner first records the actual desktop, requests a supported temporary 1920x1080-or-larger mode only if needed, and continues on the actual current desktop when no larger mode exists. Original display mode is restored in `finally`. Product-native 680-logical-pixel minimum heights and workarea clamping are tested without assuming an unavailable 2304px display. Per-window actual DPI and awareness are recorded separately.

The one-minute countdown uses actual OS clocks and up to 75 seconds of bounded polling; no new product fake-clock/test acceleration switch exists. Unicode SendInput is explicitly distinguished from Chinese IME composition. All data is synthetic under a newly created, guarded RUNNER_TEMP child; production data, remote configuration, protocol semantics and signing remain untouched.

## First-run evidence and driver corrections

Both first-run scale reports recorded 6 passing cases out of 24, with failures and one blocked dependency preserved in the original artifact `15242143028-d409-win32-46092613090-1.zip`. These are failed results, not waived or relabelled coverage. The unchanged older native suites passed in the same job.

The original N409-01/N409-15 snapshots show control 105 is a hidden period-state ComboBox. The corrected runner clicks visible toolbar button 123, records the actual `#32768` popup, sends Home/Down/Enter through SendInput to its fourth item, and verifies both the read-only period state and visible `全部日期` label. It never mutates the hidden control.

The N409-07/N409-09 window snapshots show a sole visible button captioned `OK` with native ID 2. Message dismissal now requires exactly one visible/enabled button matching the intended affirmative or cancellation caption, records its actual ID/rectangle, and clicks that handle. Negative choices never fall back to an affirmative button. Failed-scenario cleanup cancels an enabled message dialog before re-enumerating the underlying form, retaining any cleanup errors alongside the original failure.

The preview ratio now passes a floating-point `1.0` to `Math.Min`, correcting PowerShell overload selection that produced unscaled first-run preview JPEGs. Original screenshots remain unchanged. Ctrl+A/full selection assertions and exact field readbacks remain in place; the separately prepared product EDIT keyboard fix must satisfy them in Actions. No frozen test assertion has changed.

N409-23 additionally checks every visible native Button, Edit, ComboBox and ListBox against the root client bounds and, when enabled, the actual hit target at minimum, maximized and restored size. The work statistics page is also visited at minimum size so date inputs 4938/4939 (Edit), Apply/Reset actions 4940/4941 (Button), and its other visible controls are checked and captured. Original mandatory action checks remain. This verifies geometry and hit testing; separate screenshot inspection is still required to detect paint artifacts.

N409-24 serializes sorted ID collections with explicit JSON arrays and enumerates record IDs individually, preserving strict before/after comparison when a valid collection is empty. Missing IDs on actual records still fail under StrictMode; timer-history equality remains unchanged.
