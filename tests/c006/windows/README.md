# C006 native thin adapter — static candidate

No build or test has been performed locally. Integrate these files at:

- `tests/c006/windows/migration-native.c`
- `tests/c006/windows/build-native.mjs`

The workflow snippet is advisory; parent owns the final CI integration and execution.

## Protocol

Invoke `<native.exe> <absolute-spec.json> <absolute-result.json>`. Both paths and `directory` must be under current GitHub RUNNER_TEMP. The adapter rejects use outside GitHub Actions.

Spec:

```json
{
  "caseId": "C006-example",
  "operation": "sync",
  "directory": "C:/runner/temp/c006-case/db",
  "folder": "C006-example",
  "endpoint": "http://127.0.0.1:PORT",
  "changes": [],
  "context": null
}
```

Operations:

- `init`: opens actual production SQLite database; saves synthetic DPAPI sync configuration for this folder. Does not seed scope, epoch, actor or replica events. Call once per new DB before `sync`.
- `local`: actual `db_local(changes,context)`, allowing local records/tombstones through production code.
- `sync`: actual unmodified `sync_run`, including production lease acquisition, pull, pending/publish/ACK and cleanup.
- `create-manifest`: actual static `create_manifest` from included current sync.c; acquires a **test-owned** lease only if no unexpired lease exists, then releases its own token after completion. Report explicitly states this focused scope. This is not proof of full sync_run behavior.
- `audit`: actual database open, raw SQL audit, close/reopen; no sync or lease alteration.

`endpoint` is required for sync/create-manifest only. The only accepted origin is HTTP `127.0.0.1:PORT` with no extra path/query/fragment. `folder` follows actual valid_folder rules. No arbitrary URL or proxy is used.

Result includes source SHA and actual sync/database SHA256, pid, accepted, operation error, uploaded/downloaded/more, and before/after/reopened audits. Audit includes exact SQL string columns (`sqlMeta`, `sqlEntities`, `sqlOutbox`) plus decoded production APIs, real SQLite version/integrity and transaction-autocommit state. SQL read errors are recorded, never silently replaced with empty success.

Exit 0 = operation accepted and evidence written. Exit 1 = operation rejected and evidence written. Exit 2 = invalid invocation or evidence write failure. A case expecting rejection must require exact exit 1 plus JSON accepted=false and no process failure. The adapter does not decide whether a rejected operation is an expected result.

## Production provenance and allowed seam

The cloud builder reuses scripts/build-windows.mjs and current source checkout. It changes the entry point and console subsystem, removes separate sync.c compilation because the test TU includes that **unchanged** file, and injects source provenance definitions. No copied migration/recovery algorithm is used.

Test TU wrappers call real WinHTTP. They replace only the fixed production hostname/port with validated loopback, disable proxy routing and remove TLS for the synthetic fixture. All body/ETag/gzip/response handling runs unchanged production code. The wrapper refuses unexpected production endpoint or request flag values rather than silently adapting an unknown source change.

Compile after the accepted C005 fixes, not against the old C004 source. No `<io.h>` is included, avoiding the known CRT dup/native JSON dup collision.

## Restart and lease evidence

One invocation creates one process. Reinvoke with the same `directory` to test a true process restart and obtain a new pid. Abruptly killed full sync leaves its real production lease; this adapter never clears an old lease, changes its expiry or overrides it. The parent runner must wait through actual lease expiry and record the early retry rejection. Focused create-manifest owns only the lease established by that explicit focused invocation and marks it accordingly.

The parent runner owns disk fixture faults, gate-triggered termination, cloud inventory, manifest/cursor/backup comparisons and independent-observer assertions. Do not claim passing C006 merely because an adapter invocation exits 0. Native v1/unfinished-backup refusal is reported separately from supported Node migration and later native observation.

The current 18-row static runner includes actual JS process death immediately after first successful manifest PUT, then a fresh native snapshot-only observer with empty cloud heads and no batch files. It requires all referenced snapshot GETs and legacy content/relationships. It does not claim native process death. Refusal cases compare raw SQL business rows/outbox and existing synchronization progress exactly; subsequent JS/native recovery checks the unchanged native actor and locates each original queued event, by actor/seq/key and complete canonical JSON, in actual cloud batch payloads. Existing nonzero bound synchronization progress is not exercised by these first-migration fixtures.
