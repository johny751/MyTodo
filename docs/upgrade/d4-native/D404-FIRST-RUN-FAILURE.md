# D4-04 first real Actions run: preserved repaint failure

Recorded 2026-11-26 Asia/Shanghai. This note is source review and failure triage, not a passing retest.

## Immutable first run

- Source: `8779f84848c7df5eff86896abe627fe10ce1cfdb`.
- Actions run: `45737059912`, attempt `1`; Windows job `139632735815`.
- Actual Win32 build succeeded; executable SHA256 `938ac311f3740056f9f90fcb22c651b5ad37284ba91236404fbbef56da018159`.
- All 10 startup guards passed. Eight of nine native suites passed; workspace 96 and 144 DPI each reported 127 checks and zero failures.
- `legacy-repaint`: 359 checks, 5 failures, exit 1. Packaging correctly did not proceed.
- Evidence directory relative to `work/d4-native-integration/`: `ci/8779f84848c7df5eff86896abe627fe10ce1cfdb/45737059912-a1/artifacts/d404-win32-45737059912-1/d4-04-evidence/`.
- `native-regression.json` SHA256: `ab2be94ab57f6f6f7fdcae89ffb1142d95069aa2db6f586170a488f0354a9d18`.
- `legacy-repaint/stdout.log` SHA256: `fd3c9bc38c2074ab32ab16f5789320075c2f3a0b3bd680b4062263fe0e7b6237`.

Original failures, verbatim:

```text
FAIL startup: main window is visible before repaint actions
FAIL zoom transition: native transition draw observed
FAIL page transition: native transition draw observed
FAIL resize transition: native transition draw observed
FAIL fixture: task available for detail repaint
REPAINT REGRESSION 359 checks, 5 failures
```

The same log reports `tasks=0`; all three transition records have `draws=0 partial=0 windows=48`. Original files remain in their first-run directory without modification.

## Ranked diagnosis and source evidence

1. **Hidden startup prevents paint observations.** The new runner always used `execFile(..., {windowsHide:true})`. The unchanged original GUI has one initial `ShowWindow(window,SW_SHOW)`. Windows can apply the process STARTUPINFO show state to that first call, making the hidden startup override the requested show. This predicts invisible startup and zero visible transition draws; both occurred. Changing the runner's GUI launch visibility should restore native observations without a forced repaint or relaxed assertion. Microsoft ShowWindow API documentation and libuv `src/win/process.c` establish the platform behavior.
2. **Missing required fixture prevents detail coverage.** A fresh empty suite database was passed directly to the unchanged repaint suite. Accepted `docs/windows-native.md:146` explicitly requires demonstration tasks before repaint regression; `repaint-test.c` queries the first task and requires it before detail/scroll/overlay checks. The original `tasks=0` and fixture failure match this precondition error. Providing ordinary synthetic task changes through the existing native CLI should make detail coverage execute.
3. **Candidate layout changes break existing paint logic.** Less likely as the workspace is not opened by the legacy suite, existing main layout/show code is retained, and failures start at invisible startup. A successful visible replay with original assertions would distinguish this from a product regression.
4. **Candidate marker blocks database access.** Not supported: guard admission succeeded, the GUI created 48 windows and repaint ran to completion. The marker affects admission before DB opening; no guard refusal or SQLite error appears in this suite.

The definitive feedback loop remains the unchanged real Win32 repaint suite in GitHub Actions. No local build, executable launch, SQLite access or regression test was used for this diagnosis.

## Minimal runner correction for the next source

Only `candidate/scripts/d4-04-native-regression.mjs` changes from the Windows source freeze:

- Explicit `gui:true` on suites exercising the real GUI; `execute(args,gui)` uses `windowsHide:!gui`. Startup guards, fixture CLI and non-GUI tests stay hidden. No application show or paint implementation changes.
- Before `legacy-repaint`, generate four synthetic top-level unfinished tasks (one per existing quadrant), with no schedule, reminder or remote configuration. Use the existing `--change` CLI against the just-created suite `synthetic-data` directory; do not relax the candidate import gate or use a user backup.
- Preserve `synthetic-fixture.json`, preparation stdout/stderr, execution/exit evidence and SHA256 in that suite directory. A preparation failure also fails the suite, even if repaint happens to exit zero.
- Record the GUI mode and fixture summary in the new `execution.json` and manifest. Original suite IDs, 10 startup guards, all C test files and assertions, timeout and pass/failure criteria remain.

The four fixtures are ordinary existing task entities written only inside the synthetic Actions directory. They may create the same local events/outbox entries as any original local edit; no schema, production entity model or sync semantic changes are made. Real data and remote sync remain prohibited.

Retest status: **pending a new Actions source/run**. Do not reinterpret the first failure as passed or reduce expected assertions. Retest must check visibility, real transition draw observations, detail path execution and the full native suite set before packaging.
