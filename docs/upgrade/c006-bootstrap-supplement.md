# C006 supplementary initial snapshot and concurrent edit evidence

This separate four-case suite adds previously missing candidate branches without changing frozen C006 tests. It executes the checkout's actual `syncDelta`, `editReplica`, and SQLite store in GitHub Actions. A loopback disk HTTP fixture supplies only synthetic legacy content and failure boundaries. No real account, credential or business data is used.

The workflow `.github/workflows/c0-06-bootstrap.yml` runs on relevant pushes to `master` or `c0-06/**` (and also supports manual dispatch). It checks out its exact source SHA, selects the existing Node runtime, executes `tests/c006/bootstrap/runner.mjs`, then seals and uploads all output. No additional dependencies are installed. Run and retain baseline red evidence and then the production candidate against the same cases; adding source files is not an execution result.

| Case | Real boundary | Required evidence |
| --- | --- | --- |
| C006-B42-snapshot-before | HTTP 500 before first initial snapshot write | Fault consumed, no part or manifest, committed import marker/rows/outbox retained; same DB retry preserves actor/sequence/queue and retained events; published events and fresh observer agree. |
| C006-B43-snapshot-disconnect | Snapshot file persisted, HTTP response disconnected | Fault consumed, exact stored part digest matches request, no manifest; same DB retry leaves orphan bytes immutable and does not reimport; referenced parts and fresh observer verified. |
| C006-B44-kill-after-snapshot | Actual SIGKILL after successful initial snapshot response, before manifest | Fsynced pre-kill raw audit, real signal and distinct reopened PID, exact original SQLite rows/outbox/metadata, real unexpired lease respected; original wall-clock expiry awaited without edits; same actor/path/sequence/queue, immutable parts and fresh observer verified. |
| C006-B45-real-edit-cas | Pause immediately before actual import commit; second process performs a real `editReplica` on the same DB | Concurrent deletion and local edit advance SQLite revision; original commit returns `ok:false` with unchanged exact raw state; import retries from newer revision, retains tombstone/local edit and atomic marker; original outbox events remain in advertised batches. |

The supplemental worker derives from the frozen C006 production adapter but adds fsynced gate receipts, a resumable IPC gate, and raw evidence for actual commit outcomes. It does not implement merge, snapshot, ACK, import or CAS behavior. A failed CAS is obtained by the real second process and production storage, not by overriding a return value or writing SQL fixture metadata. The process kill is not a thrown exception or graceful stop. All original DB and cloud files remain under the case artifact directory.

Every worker records source hashes, runtime versions, actual PID, raw SQLite rows/outbox/metadata, and operations. The controller retains exact input files, process exit/signal, all HTTP request and cloud inventories. The original C006 evidence sealer covers the complete output tree after its last writer. Fresh observers compare the complete domain (excluding local settings) and retained row records/tombstones with the successful producer.

Scope is limited to these four Node paths. This does not replace the original 59 Node, 18 native, six Android core cases or separate Android kill evidence, and it makes no claim that a historical preexisting empty manifest can be safely repaired.
