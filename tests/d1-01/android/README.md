# Independent Android framework fixture

This package is `local.mytodo.d1fixture`, version `0.0.1-d1-fixture`, code 1. It has no UI, network permission, production source/asset, Feedback AAR or formal signing material. It is a test generator, not the MyTodo application. The build injects UTC compilation metadata, Git SHA, test version/history and an ephemeral synthetic signature into this APK.

Run only in the authorized GitHub-hosted Linux job, after `factory.py` exclusively creates a dedicated child of `RUNNER_TEMP` with `D1-SYNTHETIC.json` and `fixture.json`:

```
node tests/d1-01/android-runner.mjs <syntheticRoot>
```

The runner accepts exactly that one root. It validates the Actions run/source identity, marker, fixture purpose, nonlinked paths and the sealed core DDL before commands or project writes. It uses preinstalled API34, build-tools35.0.0 and JDK17 with aapt2/javac/d8/zipalign/apksigner. `emulator.mjs` is an independent renamed copy of the existing official API34 Google APIs x86_64 provisioning flow. Missing official emulator/image and host libpulse0 installation is allowed only when the workflow sets the already authorized `MYTODO_D1_ANDROID_IMAGE_INSTALL=1` and `MYTODO_D1_ANDROID_PULSE_INSTALL=1`; legacy `MYTODO_ANDROID_*` install flags are mapped without enabling them by default. No implicit new database, package reset or retry is performed after a first error.

`FixtureInstrumentation` uses the real Android `SQLiteDatabase`, `ContentValues` and `JSONObject` APIs. Raw `data/record/conflicts/meta/outbox.event` TEXT from the fixed factory is bound without JSON reserialization. Only the legacy SQL projection calls for parent/done/quadrant/reminder/start are independently reproduced from the A inventory. Per field it records missing/null, actual Java type and optXxx observations. It does not call the production `ReplicaDatabase` and does not verify the production Java bridge or any actual user database.

Files emitted into the host synthetic root:

- `android-source.sqlite`: fixed A core three-table DDL plus synthetic guard; raw fields, tombstones/conflicts, metadata and outbox retained.
- `feedback-source.sqlite`: independent A persistent feedback four-table DDL plus guard. Its physical tables are records/assets/links/settings; `meta` is a records bucket.
- `feedback-validation.sqlite`: independent A validation-store DDL, with the extra temporary archive_entries table and guard. It is kept separate from the persistent feedback fixture.
- `feedback-original.png`: fixed synthetic original bytes referenced by feedback assets. It is not a user image, preview, task attachment or validated Feedback AAR import.
- `android-generator-receipt.json`: device framework SQLite version, PID/API/fingerprint, original fixture identity, field observations, actual row/outbox counts, feedback fixture scope, raw payloads and closed-file seals.
- `android-build-receipt.json` and `android-runner-receipt.json`: compile/runtime identity, command stdout/stderr hashes, first error and artifact hashes.
- `d1-synthetic.json`, `android-build/` and `android-run-logs/`: device marker, APK/intermediate sources, build metadata, and complete command evidence. The build directory contains a clearly synthetic temporary signing key; it is not production credential material.

The package accepts no database path argument and creates only a fresh private `files/d1-fixtures/` namespace. All DB handles close before sealing. The host captures SQLite bytes twice with run-as, checks exact header/size/hash against the device receipt and verifies sidecars are absent or empty; it never deletes sidecars to make capture pass. This proves the closed fixture capture only, not a cross-file active-WAL backup or physical-power-loss guarantee. Feedback AAR validation, SAF/URI lifecycle, vendor schema, application stability, production migration and Android issue #1 remain outside the result.

The root Python tools perform strict candidate/projection comparison and audit using these raw outputs. Actual pass/fail/skip and evidence qualification are recorded only after a real GitHub run. This tool was authored with local text edits; it must not be built or executed locally for this project.
