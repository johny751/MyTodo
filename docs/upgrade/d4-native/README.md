# D4-04—D4-07 native integration candidate

Accepted starting source: `9fe8824754af4e8b541f3550e677564183fa7c1f`.
Accepted evidence: UI `45677279106` (Android emulator 58/58, Windows browser 158/158, Ubuntu browser 158/158), C0 `45677278925` (936 executions and 936 comparisons).
Those original results and failures remain historical evidence. All new code requires its own Actions run. D4-03 is not closed.

## Candidate packages

| Package | Implemented integration | Required evidence | Unresolved scope |
| --- | --- | --- | --- |
| D4-04 Windows | Actual Win32 workspace over existing native SQLite and existing editor/menu callbacks; task, project, note, archive and statistics views | Native EXE, 10 startup isolation guards, 2 DPI workspace runs, 7 mature native suites, screenshots and raw logs | Independent work-item/process/contact models and native pomodoro persistence need explicit admission |
| D4-05 Android | Separate application profile using formal service, reminder and FeedbackKit components plus one accepted native timer authority | APK identity/permissions/certificate, emulator lifecycle/raw touch/notification/real process kill reports | Production package activation, stable signing, overwrite upgrade and physical-device validation remain blocked |
| D4-06 Web | Explicit existing V2 service port, actual existing storage/SQLite adapters under synthetic transport; long notes/focus corrections | 5 service tests, old 158 browser checks plus 6 new checks per OS, 360/412/1440 screenshots | No default real endpoint; new work relationships remain isolated UI data until model approval |
| D4-07 Cross-platform | Preserve original tests and source-bound C0 matrix; separate native and browser results | Source admission, original reports, artifacts and coverage review | Synthetic Actions coverage does not imply real data, production sync or upgrade approval |

## Source and execution boundaries

`source-admission.json` pins every modified/new file. The new guard compares against the exact accepted source, retains all old test files (the browser runner only appends tests), all original historical documents, and all original production model/schema/synchronization files. The original D4-03 guard is preserved; it is not applicable to newly authorized native UI changes, so the new candidate has its own explicit guard. The old Android zero-permission scope checks still run unchanged.

All builds, tests, SQLite access and executable packaging run only in GitHub Actions. The Win32 candidate is compiled with `--d404-candidate`: no implicit default database, only a fresh/marked explicit candidate directory; real sync and external imports are refused in this candidate configuration. Normal build storage and sync source semantics remain unchanged. Candidate feedback is kept under the explicit candidate directory.

The Android service application ID is `local.gxtodo.d405candidate`; the preserved UI regression application remains `local.gxtodo.d403preview`. Their temporary CI signing identities are not the formal application identity. No old application is uninstalled or overwritten. Signing approval requires the separate plan.

No D2 code, new production entities, real-user database migration, LAN/WebDAV activation, ACK/outbox/cursor/manifest/batch changes, production branch merge or issue closure is included. The C0 matrix reuses the accepted jobs verbatim with only a new workflow name/branch trigger. Production remote connection remains disabled.

## Evidence interpretation

Builds and tests are pending at source-preparation time. Actual results, source SHA, file range, artifact checksums, Actions URLs, coverage and historical failures will be collected after each run, including failures. Formal integration seams are review candidates, not production admission. Completion of the authorized packages is followed by unified owner review.
