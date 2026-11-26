# D4-04 Win32 native integration candidate

Baseline: `9fe8824754af4e8b541f3550e677564183fa7c1f`. This is a source integration candidate. Actual source commit, executable hash, Actions run and raw test outcome must be supplied by the enclosing delivery receipt. No local execution or passing-test claim is made by this document.

## Integration

The original executable now has an owned modeless `GxNativeWorkspace` Win32 window, opened from the original toolbar **⋯ → 原生工作区** or **Ctrl+Shift+W**. It uses native buttons, edit, combo box and list box controls; there is no browser or WebView dependency. Its separate window avoids changing the original fixed page-index arrays, four-quadrant layout and task interactions.

The workspace reads the currently active `app.db` on each refresh. It retains only copied record data and keys, never a long-lived SQLite connection or statement. Paging is bounded to 50 rows. SQL parameters bind search input. Browsing uses read-only SELECTs and does not populate the original lazy search cache. Search matches a literal substring of the current entity fields, with SQLite ASCII case folding; the original full NFKC/multi-term/descendant search remains reachable from the old Search page.

Every mutation goes through the existing native detail editor, project editor or task menu. Entry saves pending catalog/detail drafts through the existing save barrier. Read errors clear stale rows and display a retry message. Record deletion is checked before opening. Changing active account or storage directory clears search and selection before any cached record can be used. F5 refreshes, Ctrl+F focuses search, Ctrl+N uses the original creation editor, and Esc returns to the original shell.

## Coverage and exact limits

| Capability | Candidate behavior | Evidence planned |
| --- | --- | --- |
| Work dashboard | Counts current existing tasks/projects/notes; pending list with paging | Real HWND + SQLite snapshot + screenshots |
| Projects | Active existing projects; original project creation/editing and original project task view | Dialog actions, persistence, name relation |
| Work items | Explicit **existing tasks** view with status/search; independent work items are not claimed | Original editor, task entity and unchanged relation |
| Processes | Native navigation and precise unavailable explanation; no template/instance CRUD | No active create control, no new entities |
| Contacts/relations | Native navigation and precise unavailable explanation; no contact CRUD | No active create control, no new entities |
| Notes | Independent existing notes; original native note editor | Multiline save and readonly reopen |
| Archive | Existing project archive flag only | Active/archive filters + old advanced suite |
| Statistics | Existing original task statistics implementation in a scrollable native viewport | Minimum-window end-of-content scroll assertion + HWND capture; original implementation untouched |
| Four quadrants, zoom, drag/reorder/move, menus | Original native pages and handlers retained | Legacy drag/repaint/detail/advanced suites |
| Tags, places, search, settings, accounts | All ten original navigation controls retained | Navigation inventory; advanced suite |
| Feedback | Original native entry and format retained; candidate build stores within its explicit data root | Real native save plus original global-store unchanged assertion; separate `--feedback-test` |
| Sync | Candidate keeps an explanatory entry and blocks real configuration/connection; regular build retains original behavior | Candidate no-start/state-preservation check; original protocol regression runs separately |
| Pomodoro | Accepted isolated web/Android implementation preserved; **no native Windows timer exists in this baseline and none is claimed here** | Source inventory and admission proposal |
| Real-user DB/remote services | Not exercised or activated | Synthetic CI data only |

This is partial D4-04 integration. It cannot close D4-04, D4-03 or production blockers. Process/contacts/independent work data and native timer need separately approved persistence and cross-platform mapping. The retained browser prototype is not relabeled as native.

## Storage and synchronization impact

No changes to `windows/database.c`, `tasks.c`, `query.c`, `operations.c`, `sync.c`, storage migration, production entity validation or protocol are included. Existing kinds remain `tasks`, `notes`, `projects`, `tags`, `places`. No new table, column, trigger, JSON task/note field, sync kind or business sidecar store is added. The candidate directory has a dedicated launch-safety marker, not business data. Original startup native search indexes/caches still exist; this candidate does not claim that the original application never creates them.

Project membership remains the existing `task.project` **name** string, including any existing ambiguity of historical duplicate names. New display data are not written back. Existing edits legitimately create the same native local events/outbox records as before; this is preservation of existing behavior, not a zero-write claim for editing. Pure workspace navigation/search/capture is asserted to preserve exact schema/entities/meta/outbox and total SQLite changes.

The `--d404-candidate` build compiles `GX_D404_CANDIDATE`. Before COM or any database initialization, the executable requires exactly one explicit `--data-dir`, refuses roots/remote paths/reparse ancestors and requires either an empty directory or its exact marker bound to that canonical directory. Existing unmarked data are rejected without opening the database. A copied marker from another root does not grant admission. The candidate cannot load external sync configuration, run remote sync commands, or invoke storage regression/migration. Its sync UI entry explains that real remote connection is unavailable. These compile-time gates do not change normal builds.

The original Feedback window's regular-build directory is unchanged. Candidate builds instead use `<explicit-candidate-root>/feedback` with the same original feedback implementation and file format. CI saves through the actual Feedback window and checks both candidate persistence and byte preservation of the global feedback file.

## Actions commands

Windows hosted runner prerequisites are Node and the already-installed Visual Studio C++ tools/Windows SDK. SQLite, cJSON and zlib source are vendored. No npm dependency installation is required for this build script.

```powershell
$env:EXPECTED_SOURCE_SHA = $env:GITHUB_SHA
node scripts/build-windows.mjs "$env:RUNNER_TEMP\MyTodo-Native-Candidate.exe" --d404-candidate
node scripts/d4-04-native-regression.mjs "$env:RUNNER_TEMP\MyTodo-Native-Candidate.exe" "$env:RUNNER_TEMP\d4-04-evidence"
```

The second command requires Actions/Windows, exact `EXPECTED_SOURCE_SHA = GITHUB_SHA = git HEAD`, a run/attempt identity and a nonexistent direct `d4-*` child of `RUNNER_TEMP`. It first exercises ten candidate launch-guard scenarios, then preserves nine independent fresh suites, raw stdout/stderr, native JSON, synthetic data, screenshot BMPs and executable SHA256. It stops before database suites if startup isolation fails; otherwise it continues after an individual suite failure and exits nonzero if any failed. The workspace C entry additionally requires Actions, explicit `--data-dir`, an empty DB and disabled sync. No existing failure evidence is overwritten.

Native suite flags: `--self-test`, `--advanced-test`, `--ui-regression`, `--detail-regression`, `--repaint-regression`, `--drag-regression --drag-render <dir>`, `--feedback-test`, plus new `--work-regression --work-render <dir>` at 96/144 DPI. Each receives a different fresh synthetic directory. Original storage migration tests are available but excluded from this narrower runner; no new migration is introduced.

Candidate owner preview packaging should supply an explicit isolated launch directory:

```bat
MyTodo-Native-Candidate.exe --data-dir "%~dp0candidate-data"
```

The packaged `--d404-candidate` executable refuses a bare launch; it cannot silently select the original application's default database. Regular builds retain their existing default directory selection. Include the actual native executable, code scope, receipt, evidence and this limit; stop for owner review after the authorized package.
