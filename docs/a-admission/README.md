# MyTodo A admission source candidate

Updated 2026-11-25 Asia/Shanghai. This is the independent A source/review package. It does not delay B/D4 UI preview and does not enable or merge D2 production migration.

Implemented source: original-component OS read/copy/hash preflight, readonly isolated SQLite shadow with committed WAL, strict source schema/version/metadata refusal, registered writer capability prototype and full supplemental audit serialization/attempt binding. The package includes a real child-process exit WAL fixture, actual SQLite/file-handle closure observations and explicitly labeled diagnostic faults.

Validation: **UNVERIFIED until root collects the exact GitHub Actions source/run/attempt artifacts.** No Node program, SQLite, test or build was run locally. The independent workflow accepts only `a/admission-candidate-1` and an exact candidate/base SHA; original source values and all failed artifacts are retained. Results always state `productionAdmission:false`.

Read `architecture.md`, `focused-writer-review.md`, `release-and-remote-decisions.md` and `validation-and-status.md`. The cloud command is:

```bash
node tests/run-admission.mjs "$RUNNER_TEMP/a-admission-$GITHUB_RUN_ID"
```

Use the workflow inputs `expectedSourceSha` and `baseSourceSha`; root must resolve the accepted D2 `b94f522` base to its actual full SHA. No new dependency service, Python, real remote authentication or user-data scope is required. Local `AGENTS.md` is workspace authorization evidence and should not overwrite the repository's instructions during upload.

Remaining production gates: approved real layouts and opener ordering; complete real GUI/sync/feedback/image writer registry; signed whole-release identity; authenticated remote A; durable cross-file activation and power-loss recovery; Android issue #1 evidence. Issue #1 remains open. No Actor resumption, ACK/outbox/cursor/manifest semantic change, real migration, real LAN/WebDAV operation or master/main merge is made.
