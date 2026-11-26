# D4-08 external Windows UI reproduction

Run only on a GitHub Actions Windows runner. The script compiles only its external Win32 driver; it never changes or injects product code. It launches the supplied real native executable into a fresh synthetic candidate root, clicks native controls, sends actual keyboard input, reads business results through the original native export command, and preserves HWND inventories, screenshots, small previews, logs and per-scenario JSON.

```powershell
pwsh -NoProfile -File tests/d4-08/windows/reproduce-ui.ps1 `
  -Executable "$env:RUNNER_TEMP/MyTodo-D404.exe" `
  -ProductSourceSha 04c525c55fc136ad1b960b5d727dab3c5e3165fd `
  -ExpectedExecutableSha256 <hash-from-the-frozen-build-receipt> `
  -OutputDirectory "$env:RUNNER_TEMP/d4-08-windows-baseline"
```

`ProductSourceSha` must be bound to the executable by the workflow's build receipt. The harness separately records its own checkout HEAD, Actions run and attempt. A baseline executable and newer test checkout are deliberately permitted; they must never be reported as the same source identity.

The expected contract is the newly authorized D4-08 behavior, so the frozen executable is expected to exit 1 with feature failures. The workflow should preserve the step outcome (for example `continue-on-error: true`) and upload the new evidence directory with `if: always()`. Do not convert expected feature failures to passing cases or erase the first failure. Harness/startup/focus failures are classified separately and must be repaired before claiming user-issue reproduction.

Use the same script/expectations with the D408 executable, its exact source SHA/hash, and a different new output directory to verify remediation. `-Dpi 144` creates a separate DPI run; each run has its own counts. Product tests, compiler execution, SQLite and native process launches all remain Actions-only.

Eight cases: visible work entry with native opening, visible timer entry with real controls, positive plain-Enter/no-save control, task title Ctrl+Enter persistence, task notes Ctrl+Enter persistence, child Ctrl+Enter creation, project suggestions with keyboard selection, and actual template creation with persisted name/two steps. Existing Save is a setup positive control; setup failure stops product-gap claims. Template storage is searched only under the newly created candidate root. Rich timer lifecycle, feedback, IME, remaining suggestions, full work CRUD and restart/failure recovery need the later D408 suites.

This suite's task Ctrl+Enter expectation intentionally differs from the frozen `detail.c` title-newline assertion. The original D404 test files and macro remain unchanged. D408 quick-child focus takes precedence; ordinary Enter/Shift+Enter remain multiline; independent-note behavior remains unchanged.

The harness uses established IDs for original task editors (600 title, 605 project, 608 notes, 571 quick child, 555 Save, 552 Close) and user-visible native labels for new entrances and template forms. New timer/work windows should expose native class names containing `Timer`/`Pomodoro` and `Work`, respectively. This is an observable UI seam, not a product test-only shortcut.

Status at authoring: static preparation only. No local execution or passing result is claimed.
