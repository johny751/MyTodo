# C0-06 executable acceptance matrix draft

Status: proposed cases only, **0 executed here**. Each variant is its own result row; matrix size is not a passed-test count. All runs must be GitHub Actions using actual production functions and durable SQLite/file adapters.

## Actors and fixtures

- **J**: Node production `syncDelta`, real `node:sqlite`, existing production store adapter.
- **A**: Android production shared JS `syncDelta` inside real WebView, `AccountStore`/`ReplicaDatabase` bridge, emulator process.
- **C**: Windows C production `create_manifest` through a thin adapter for focused guard cases; production `sync_run` with an audited loopback endpoint seam for end-to-end recovery and observation.
- **O**: independent observer with a separate database and actor; J/A/C where supported. Success on J is not proof of native C or Android execution.
- **L1**: hand-authored synthetic valid v1 envelope containing a task tree, note, project, tags and places. Include UTF-8 Chinese and emoji, but no user data. Save exact UTF-8 bytes before any client reads them.
- **L2**: another valid v1 envelope with one deterministic additional item and one changed field, used only as a concurrent legacy writer's content.
- **B1**: a real persisted gzip backup of L1. Record both compressed and uncompressed byte lengths and SHA256. The decompressed bytes must equal L1 exactly, not merely normalize to equivalent JSON.
- **G0**: valid v2 fence `{format:'gxtodo-sync',version:2,backup:null}`.
- **G1**: valid v2 fence pointing to the concrete B1 path.
- **D0**: empty initialized production database with `scope:null`, no preset epoch or cached manifest. Do not reuse C003 seeding that bypasses first migration.
- **D1**: initialized local synthetic items and changes; record actual actor, rows, retained field events, outbox and meta before the operation.

All cloud roots begin without a v2 manifest unless a case explicitly says otherwise. The fixture server must implement actual disk files, strong ETags, conditional headers and gzip transport. Faults select transport/storage boundaries; they must not implement merge, recovery or ACK algorithms.

## Backup, fencing and conditional concurrency

| ID | Initial state and injected boundary | Actors | Required result |
|---|---|---|---|
| C006-01 | No `state.json`, no manifest; no fault | J/A/C independently | Create G0 with `If-None-Match:*`; create valid manifest conditionally; independent observer converges with local entries. |
| C006-02 | L1 present, strong ETag; no fault | J/A, then O | Backup exactly preserves L1; fence PUT uses L1 ETag; all legacy and local data eventually reach O; no duplicate conflict copies. |
| C006-03 | L1 present; backup PUT fails before disk write, HTTP 500 | J/A | Report failure, L1 unchanged, no fence or manifest; same DB retry succeeds after fault removed. |
| C006-04 | L1 present; backup gzip file is committed, socket closes before response | J/A | Report transport failure; L1 unchanged; orphan B1 is harmless; retry may use a new immutable backup but no backup is overwritten. |
| C006-05 | L1 present; backup stored; fence PUT fails before write, HTTP 500 | J/A | L1 remains; no manifest or business merge; same DB retry converges. |
| C006-06 | L1 present; fence is committed, response socket closes | J/A, restart same DB | Error on uncertain response; restart reads G1, imports B1 and converges; no replacement of B1. |
| C006-07 | Read L1; concurrent writer changes state to L2 immediately before fence PUT | J/A | First PUT 412; reread L2; backup/fence reference the later version; O receives L2 plus intended local changes. L1 backup remains immutable. |
| C006-08 | Read L1; state removed immediately before first fence PUT, causing 412; next GET 404 | J/A | New G0 has `backup:null`; no stale reference to first attempt's L1 backup; no L1 import from a failed fence selection. |
| C006-09 | Read 404; concurrent writer creates L1 before empty fence PUT | J/A/C | First PUT 412; reread actual L1. J/A backs it up and migrates. C safely refuses v1 and does not publish manifest. |
| C006-10 | Read 404; concurrent writer creates G1 before empty fence PUT | J/A/C | Reread G1 after 412. J/A imports B1. C safely refuses incomplete migration and leaves missing manifest untouched. |
| C006-11 | Read 404; concurrent writer creates G0 before empty fence PUT | J/A/C | Reread G0 after 412, then create/read valid manifest; no unbounded retry. |
| C006-12 | Every fence PUT conflicts for eight attempts | J/A/C | Bounded error after the eighth conflict; no manifest; local business rows/outbox retained; all eight conflict causes and rereads logged. |
| C006-13 | L1 GET has missing ETag / weak ETag (two variants) | J/A | Fail before any backup/fence/manifest PUT; L1 and local business state unchanged. |
| C006-14 | Existing G1; native takeover | C, then J/A, then C | First C operation fails without manifest creation or hiding B1; J/A completes actual migration; later C consumes published legacy items. Native refusal alone is not a migration pass. |
| C006-15 | Direct L1 with C | C, then J/A | Preserve documented native v1 refusal. No C backup/import claim. A supported JS client can still migrate the untouched L1. |

## Invalid or unavailable recovery data

| ID | Initial state and injected boundary | Actors | Required result |
|---|---|---|---|
| C006-16 | Existing G1; B1 GET 404 / 500 (two variants) | J/A; C safe-refusal variant | No manifest; local business rows/outbox unchanged; surface error; after restoring B1, same DB migration succeeds. |
| C006-17 | G1; B1 gzip truncated / CRC corrupt / malformed JSON / valid non-v1 envelope (four variants) | J/A | Production transport/parser rejects; no manifest, cursors or business import; preserve raw corrupt evidence and recovered retry. |
| C006-18 | G1; syntactically valid v1 whose item count exceeds production supported capacity | J/A | Production decode rejects loss-prone normalization; no partial import or manifest. Use actual documented capacity from source, not an invented count. |
| C006-19 | Fence backup field absent / empty string / number / array / object (five variants) | J/A/C | Reject before backup GET or manifest PUT; no silent coercion to no-backup. |
| C006-20 | Fence backup path traversal / absolute URL / query / fragment / extra directory / overlong name (six variants) | J/A/C | Reject before transport request to the reference; request log contains no unexpected target; cloud unchanged. |
| C006-21 | Fence wrong format / nonnumeric version / unknown version / JSON trailing bytes / encoded NUL (five variants) | J/A/C | Reject malformed input consistently before manifest creation. Record platform-specific error and exit outcome. |
| C006-22 | Existing valid G0; manifest PUT 412 because another actual migrator won | J/A/C | Retrieve and validate winner's manifest + strong ETag. Bind to its actual epoch; never continue with losing generated epoch. |
| C006-23 | Manifest PUT 412; following GET missing / malformed / weak ETag (three variants) | J/A/C | Report failure; no cached invalid manifest, no fake ACK or dropped outbox; same DB can recover when valid winner restored. |

## Durable interruption and device handover

| ID | Initial state and injected boundary | Actors | Required result |
|---|---|---|---|
| C006-24 | Kill actual process immediately after backup persistence, before fence request | J/A | Same DB/path and cloud root on restart; L1 or B1 stays recoverable; original lease enforced until expiry; convergence after valid retry. |
| C006-25 | Kill after G1 is committed, before first B1 read/import | J/A; J→A and A→J handovers | Independent supported JS client recovers from G1+B1 with actual SQLite effects; C takeover safely refuses until JS completes. |
| C006-26 | Kill after backup import transaction commits, before manifest PUT | J/A | Same DB restart imports idempotently: no duplicate domain IDs/conflict copies, no duplicate logical changes, original tombstones retained according to declared policy. Preserve pre-kill and reopened SQLite audit. |
| C006-27 | Manifest PUT fails before disk write, HTTP 500 | J/A | Existing durable imported outbox retained; G1+B1 retained; same DB retry converges without duplicate items. |
| C006-28 | Manifest is committed; response socket closes before delivery | J/A | Same DB retry discovers actual manifest and publishes durable imported outbox. Pending, outbox, cloud heads and observer all reach consistent state. |
| C006-29 | Kill after manifest is committed, before first legacy batch PUT; original DB restarts | J/A | Same DB recovery publishes imported events; no data lost from rows/outbox; observer convergence verified after final drain. |
| C006-30 | Same cut as C006-29; original DB is left unavailable; fresh device takes over | J→A, A→J, J/A→C | **Open recovery requirement:** fresh observer must not be reported complete while legacy items exist only in B1/original outbox. Current code is predicted to omit them. Preserve failing trace before deciding a production fix. |
| C006-31 | Kill after first immutable batch exists but before manifest head update | J/A | Same DB restart reuses real pending bytes/path, verifies immutable content, conditionally publishes head, ACKs once; eventual observer includes complete legacy set. This is recovery overlap with C007, not a substitute for C007 SQL fault tests. |
| C006-32 | Second real JS migrator competes between first client's import and manifest creation | J/A combinations | Each uses winning epoch; no hidden legacy items; deterministic conflict copies converge and remain unique; both databases' outboxes fully drain. |

## Local edits, base state and repeat migration semantics

| ID | Initial state and injected boundary | Actors | Required result |
|---|---|---|---|
| C006-33 | L1; real legacy base equals L1; local one-field edit and unrelated addition | J/A | Preserve local edit/addition and remote-only entries with real three-way merge; preferences stay device-local. |
| C006-34 | L1; legacy base equals L1; local tombstone for unchanged old item | J/A | Deletion remains a durable tombstone and does not reappear after restart or observer synchronization. |
| C006-35 | G1+B1; `legacyBase:null`; local explicit tombstone for B1 item | J/A | **Predicted red:** source currently turns this into `_deleted:false`. Record causal events and exact before/after row. Resolve intended deletion policy; do not silently count resurrection as recovery. |
| C006-36 | Import commits; local edit/delete occurs while first migration is interrupted; same DB retries before manifest creation | J/A | Preserve new edits and chosen deletion policy, without duplicated legacy conflict copies. Tests must create edits via actual `editReplica`, not rewrite stored rows. |
| C006-37 | Local and L1 independently modify same original item, then retry import after failure | J/A | Production merge creates deterministic conflict copy at most once; repeat import and restart do not produce nested duplicate copies or lose either retained version. |
| C006-38 | Existing valid v2 manifest with historical `legacy` reference; normal v2 deletion already published | J/A/C observers | Any fix for C006-30 must not blindly replay old backup and resurrect subsequently deleted v2 records. Require a real existing-head deletion plus fresh-device observation. |
| C006-39 | Real SQLite trigger aborts the meta update carrying the import marker | J | Actual production transaction rolls back both imported events and marker; no manifest; remove the trigger and recover on the same database. |
| C006-40 | Two manifest failures; edit a legacy item after first import | J | Matching marker prevents a second import: seq, queue and exact business/outbox rows remain unchanged on the second failure; later retry publishes the new edit and preserves the marker. |
| C006-41 | Same selected B1 path changes bytes after import committed but before manifest exists | J | Explicit immutable-backup error; no second import, no business changes and no manifest. |

Current implementation inventory, not a run result: 59 Node rows, 18 native rows and 6 Android rows. Matrix actors are proposed coverage, not a claim that every platform cross-product exists. C006-30 currently has actual JS termination with fresh JS and native observers; Android internal-boundary termination remains outside the frozen red core. The native C006-30 row requires empty heads, absent batch files and evidence of every referenced snapshot GET, and does not resume or read the original JS database after its death.

## Mandatory evidence per result row

1. Source SHA and source-file SHA256 for the production functions actually invoked; suite case + variant; platform/runtime; database path and actor; cloud fixture root.
2. Raw SQLite `rows`, retained events/tombstones, `meta` including scope/epoch/vector/cursors/lease/pending, outbox and pending body before interruption, immediately after reopen and after convergence. Normalized visible state alone is insufficient.
3. HTTP log with monotonic sequence, method/path, request `If-Match`/`If-None-Match`, selected fault ID and stage, observed write outcome, response/disconnect outcome, response ETag, raw/decompressed payload hash. Do not include Authorization or credentials.
4. Physical inventory of L1, every backup, guard, manifest and batch at each fault/retry boundary. Both wire and plain hashes for gzip; backup must preserve original bytes. Orphan backup existence is acceptable when explained; it cannot substitute for a reachable recovery reference.
5. For real process death: PID, exact gate, exit/termination status, no spawn error, no uncontrolled timeout, restart PID, identical DB path/identity, and lease behavior. A JavaScript caught exception or adapter reconstruction is not a process-restart test.
6. Expected controlled rejection uses exact adapter exit code and machine-readable result; unexpected crash/timeout is failure, never a successful rejection. Intentional killed-process cases must prove their explicit kill gate separately.
7. Independent observer rows/events/outbox/pending and a case-specific semantic comparison after drain. Do not count comparisons that read only the producing adapter or synthesized expected recovery state.
8. On a failed attempt, keep its evidence and original DB. Retry a recorded case on that DB; a new case/database is a separate result and cannot turn the original recovery into a pass.

Approval gate for C006: red evidence for source findings, selected minimal production fixes, real green rows for every claimed platform/variant, raw evidence manifest and limitations. No real Nutstore or private user data is needed or authorized.
