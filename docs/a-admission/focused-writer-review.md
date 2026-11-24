# Focused production writer review

Updated 2026-11-25 Asia/Shanghai. This is a source-only read of existing D2 entry points, not a new real-data inventory. The A package does not modify them.

| Existing entry | Source fact | Required admission integration |
| --- | --- | --- |
| Node `src/sqlite-store.mjs:createSQLiteStore` | Constructor opens SQLite, enables WAL, creates legacy tables/indexes and initializes metadata before explicit migration methods. Commit can write entities, metadata and outbox/ACK-related rows. | Put approved read-only preflight and a real writer lease before constructor side effects. Register worker/commit/sync owners and checked close; do not change commit/ACK semantics. |
| Windows `database.c:db_open`, `storage.c:storage_guard` | Legacy opener creates directories/schema/meta. Storage lock coordinates selected app/location paths; its presence is not a complete database/attachment writer registry. | Preflight before opener; map every DB owner, account operation, search maintenance and callback. Preserve checked-close diagnostics and actual handle ownership. |
| Windows `feedback.c:feedback_open/ui_feedback` | Feedback uses a separate location, lock, JSON and editor lifecycle outside the core SQLite database. | Register that real file/editor writer and all snapshot components; core DB close alone is insufficient. |
| Android `ReplicaDatabase` | Helper and synchronized storage methods protect the instance's SQLite operations, while application/feedback/image lifecycles are separate concerns. | Prove a common lifecycle barrier across helper instances, callbacks, feedback and original image owners. Java synchronization is not whole-application snapshot authority. |
| D2 manual migration APIs | Explicit candidate entry points remain disabled at startup and preserve strict snapshot reentry/unknown-result policy. | A preflight result is not permission to invoke a real migration or resume Actor. Exact source, release identity and operational scope require owner approval. |

FACT: the A Node prototype exercises generated SQLite handles and original image file handles with checked closure, pending I/O and capability generation. It does not patch any entry above or declare all three production barriers complete.

BLOCKER: real writer inventory, cross-process ownership, startup ordering, actual GUI undo/search lifecycle, registered-close error handling and unknown-callback reconciliation remain unverified. D2's byte-preserving undo extraction has static function-body evidence and storage-harness context; active GUI undo begin/finish/apply and a formal complete application build are separate validation work.

Android issue #1 remains open by current authorization. This package neither closes it nor claims a new live GitHub investigation; the inherited D1/D2 status and unknown production framework/history evidence remain preserved. A later focused issue review must bind retrieved source/issue evidence and test scope explicitly.
