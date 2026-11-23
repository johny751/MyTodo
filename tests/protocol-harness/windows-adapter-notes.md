# Windows C protocol adapter: static integration notes

Status: static-reviewed only. No application compilation or test was run locally.

The inspected business source is the original `5480c88c806cf1c366ec998b0ba627543d63233a` snapshot. The parent agent must verify the current cloud checkout and source identity before integrating these test files.

## Actual production entry points

- The real header is `windows/native.h`, not `gxtodo.h`. `DB` exposes its `sqlite3 *sql` handle, data directory and error buffer.
- `db_open` and `db_close` create/reopen the actual WAL/FULL SQLite store. The tables are `meta`, `entities` and `outbox`.
- `db_local` generates actor/seq/clock/context events, persists entity rows and queues the real outbox in a transaction. `db_remote` applies real production validation/merge, updates vector/clock/cursors, and commits or rolls back.
- `db_meta`, `db_page`, `db_row`, and `db_outbox` expose production records. A test export can preserve raw entity `record.events`, projection data, deletion flag, conflicts and all sync metadata. Direct SQLite observations must retain error status; they must not replace the production API's returned result.
- `event_valid` and `compare` are private in `database.c`. Calling the public database APIs already exercises them. A separate validation/merge implementation would be invalid for C0-03.
- `manifest`, `prepare`, `checkpoint`, `pull` and `ack` are private in `sync.c`. The harness translation unit includes the reviewed fixture copy, with `database.c` and `util.c` compiled separately. This exposes the original function bodies without duplicating their algorithms. C0-03 does not implement a second outbox ACK rule.

## Build integration

The original `scripts/build-windows.mjs` discovers the preinstalled MSVC/SDK, compiles resources and links the real production modules and vendor sources. A cloud-only adapter can copy that builder to an exact temporary `scripts/.c003-build-<uuid>.mjs`, replace only its `main.c` source entry with `../tests/protocol-harness/windows-protocol.c`, and omit the standalone `sync.c` entry because the harness includes it. All other production modules remain linked.

The harness should implement the original `wWinMain` signature and use the existing console-output redirection behavior. `operations.c` supplies the real `undo_capture`; because the original global `app.ready` is false for this database CLI, its own guard returns without UI undo side effects. Do not write a mock `undo_capture`.

The adapter rejects local compilation/execution before creating files and checks the frozen checkout SHA. It removes only the exact temporary builder and sync copy it actually created, including when the second write or child build fails. Original business files and the original builder remain unchanged. Build receipts and the harness output record original/fixture `sync.c` SHA256 values and the one substitution count. The receipt's exit code is the actual invoked Node builder process code; the original builder does not separately expose its inner compiler numeric code.

## Fault observations

The public `DB.sql` handle supports `sqlite3_set_authorizer` to deny a selected read/write, or a TEMP trigger with `RAISE(ABORT)` to force the original SQL path to fail. The actual return value, `DB.error`, SQLite error code, metadata, outbox and post-reopen state must all be retained. Read failures currently can return an empty array from `db_page`/`db_outbox`; the observer must not silently relabel that as a rejected production operation.

## Coverage boundary

The parent approved a test-only loopback transport seam: the temporary `sync.c` copy replaces exactly one `WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE` with `WINHTTP_DEFAULT_ACCEPT_TYPES,0`; the harness creates a real native WinHTTP connection only to an origin-only `http://127.0.0.1:PORT` URL. The original production `request`, gzip, ETag, manifest, snapshot-hash/identity verification, database merge and cursor commit bodies run over loopback TCP. The fixture serves concrete protocol files at the existing `/dav/C003/` path. No mock request or copied snapshot algorithm is introduced. This is real storage/protocol execution against synthetic cloud-runner fixtures, not evidence of a real Nutstore connection or LAN product implementation.

`generate`, `receive` and `report` reject output/database paths outside GitHub `RUNNER_TEMP`. Generate/receive require a new store; report requires an existing store. The harness always closes and reopens SQLite, exports raw production entities/events/conflicts/tombstones/meta/outbox plus reopened state, and runs the production integrity check. SQL `update-abort` and id-specific `insert-id-abort` use TEMP triggers on the same production SQLite handle. In the second snapshot-part failure case, the first part can remain materialized while snapshot cursors must remain uncommitted; disabling the trigger and reopening allows the original pull path to resume. Per-stage blocked status remains distinct from an expected production rejection; process exits are 0 passed, 1 failed, 2 blocked.

Known static differences to measure, not repair in C0-03: C `strcmp` versus JS `localeCompare`; C UTF-8 ID byte limit 800 versus JS UTF-16 length 200; exact event-key array size in C versus JS destructuring; context object/type validation; C manifest head range and `int` cursor/index conversions. These are observations, not a second protocol specification or a claimed test result.
