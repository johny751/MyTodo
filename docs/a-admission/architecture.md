# A admission candidate architecture

Updated 2026-11-25 Asia/Shanghai. A is independent of D4 UI and does not enable the accepted D2 candidate. Candidate branch: `a/admission-candidate-1`, based on the accepted D2 `b94f522993f44b83727926ec9db4caa374ffdc71` supplied by root. Root must verify that remote identity and supply the full base to Actions. D2 source and outputs remain unchanged. All statuses below distinguish source implementation from authoritative runtime evidence.

FACT (source): this package adds independent Node tools only. No original platform opener, SQLite schema, data, Actor, ACK, outbox, cursor, manifest, batch or startup call is changed. No real user database, LAN/WebDAV endpoint, credential or Android issue operation is exposed. The tools accept only generated fixtures under the exact hosted Actions SHA/branch/run/attempt and `RUNNER_TEMP/a-admission-<runId>` marker. A source-scope gate rejects changes outside this package before any SQLite execution. No Python or third-party dependency is used.

## Read-only source admission

FACT (source): original main, WAL, SHM and rollback-journal files are accessed only with OS read/stat APIs. Every present component is recorded with size, SHA256, filesystem identity and modification time before and after preflight. Source SQLite is never opened by the preflight tool. A registered closed-writer capability is required before reading source bytes and rechecked before SQLite read and at completion. Missing, copied, forged, revoked, unknown or incomplete writer proof blocks the attempt.

FACT (source): main and committed WAL are copied to a new private shadow directory. SHM is not copied or trusted as database identity; SQLite may create private shadow SHM. An actual Node `DatabaseSync` READONLY handle opens only that shadow, with one read transaction. Known complete baseline/reversed core DDL, original user_version=0, integrity/foreign-key checks, immutable LP-v2 schema/raw snapshot and a conservative metadata subset are checked. A damaged unused index page cannot be admitted merely because table rows and schema fingerprints still match. Source business JSON and entity fields are not rewritten or normalized. Unknown layouts, target versions, JSON metadata duplicates, Actor/counter/outbox boundaries, corruption and rollback journals are preserved and blocked. A matched expected snapshot and Actor can produce `eligibleSynthetic`; the result always contains `productionAdmission:false`.

PROPOSAL: a future real admission implementation must prove a platform-wide writer fence and an approved exact source layout before invoking legacy constructors, which may initialize tables or metadata. This shadow tool offers a reviewable preflight mechanism, not that production integration or permission to read real schemas.

## WAL and immutable boundaries

FACT (design): SQLite READONLY protects database writes by that handle, but WAL readers may create or modify SHM and read-mark state. Therefore the ordinary readonly opener is not the no-component-write proof. A separate synthetic observation records before/during/after hashes honestly; it does not require an assumed mutation result.

PROPOSAL: never apply `immutable=1` to a source with relevant WAL merely to suppress sidecars. Immutable promises that the database cannot change and can bypass WAL/locking behavior; ignoring WAL can omit committed data. This candidate never uses immutable. It preserves main+WAL under a verified closed fixture capability and queries the isolated copy. Unknown rollback-journal recovery remains blocked rather than silently repaired. Ordinary filesystem access-time changes are outside the component-byte preservation claim.

UNVERIFIED until Actions: a real child process exits without SQLite close or checkpoint, leaving committed WAL and an open uncommitted transaction. The parent observes that process exit, copies main+WAL without SQLite-opening the original, and requires committed outbox IDs 8/9 with uncommitted ID 10 excluded. All source main/WAL/SHM hashes must remain unchanged. These are generated fixtures, not frequency evidence for historical user databases.

## Registered writer lease

FACT (source): `WriterRegistry` checks a fixed declared inventory, drains actual pending operations, prevents new writes during fencing, calls checked close callbacks and requires an actual closure observation. Lease issuance uses private ownership and generation state; copying its public fields or replacing the registry method does not satisfy verification. A late registration can represent an already-open actual writer, so it poisons the fence and generation rather than merely throwing while leaving the old lease valid. Acquisition rechecks that state after drain and close. A failure, unknown writer, missing writer, late operation or stale capability remains blocked. No release reopens writers or resumes Actor.

UNVERIFIED / BLOCKER: inventory completeness and close-observer authority are fixture controlled. This prototype cannot prove that every real GUI, background worker, sync callback, feedback database or original-image writer has registered. Production adoption requires a lifecycle-wide registry with actual owners and failure recovery, not new boolean flags.

## External attempt audit and build identity

FACT (source): each request with a recorded tool identity owns a fresh external JSONL file with checked complete writes, sync, monotonically numbered hash chaining and immutable SHA/run/attempt/tool/snapshot/lease binding. A request without identity is rejected before source access and retained in the caller's report, without fabricating a checksum. Error serialization retains primary, cause, rollback errors, checked-close errors and audit-write errors rather than losing secondary properties in String(error). Diagnostic error payloads and capability faults are labeled synthetic; external file writes and writer/SQLite closure observations are actual APIs. Unknown or failed attempts remain external and survive SQLite rollback. Source bytes and supplemental audits are separate from the database.

FACT (source): the tool checksum is derived from the actual admission module bytes and fixed algorithm/contract identity, recorded with Node version and Actions source/run/attempt. It is an admission-tool identity. It does not establish signed Windows/Android release provenance or the entire application's dependency/runtime identity. `release-and-remote-decisions.md` describes the remaining owner decisions. No source hash is fabricated and missing identity refuses preflight before source access.

UNVERIFIED: power loss, directory fsync portability, storage exhaustion at every audit write and release trust distribution require additional evidence. The hash chain detects modifications under the test trust model; it is not a signed remote authority.

FACT (source): a successful audit close returns a final digest/entry-count anchor in the caller's preflight result. Verification can require that anchor and a terminal outcome, so a cleanly truncated valid prefix is not accepted as the complete attempt. Without a caller-held tip, a hash chain proves only internal consistency of the surviving prefix. Authentic distribution/signing of the caller's anchor remains a separate owner decision.
