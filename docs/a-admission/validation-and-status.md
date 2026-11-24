# A validation and remaining gates

Updated 2026-11-25 Asia/Shanghai. Source package ready for root's isolated branch upload. Runtime status is UNVERIFIED until authoritative Actions artifacts are collected. Local work used text/static reads and hashes only.

Cloud command, after resolving the exact accepted D2 base SHA and candidate source SHA:

```bash
EXPECTED_SOURCE_SHA=<candidate full SHA> BASE_SOURCE_SHA=<accepted D2 full SHA> node tests/run-admission.mjs "$RUNNER_TEMP/a-admission-$GITHUB_RUN_ID"
```

Use `.github/workflows/a-admission-validation.yml` on `a/admission-candidate-1` with `expectedSourceSha` and `baseSourceSha`. The job uses official Node 24, built-in SQLite and generated fixtures. No install step, Python, production storage import or migration is needed. Its source-scope gate runs before SQLite; complete failed artifacts and stdout/stderr are uploaded with source/run/attempt provenance.

Expected outputs: `source-scope-receipt.json`, `admission-build-identity.json`, `admission-results.json`, per-case source/attempt artifacts, before/after component proofs, private shadows, JSONL audit chains, child-process stdout/stderr and preserved main/WAL/SHM files. No generated source artifact is evidence of real historical schema frequency or three-platform production admission.

Independent static review identified and source changes addressed two direct gaps before upload: unused index damage now requires a successful readonly shadow integrity/foreign-key check; a known late registration invalidates the writer generation/fence rather than leaving an issued lease valid. GHA negative cases deliberately damage a synthetic index page and open a real late file handle. Their runtime result remains UNVERIFIED until the exact run receipt. These changes do not touch D2 sources or B/D4 UI.

| Gate | This batch | Remaining production classification |
| --- | --- | --- |
| Read-only source preflight | Independent original OS-copy/hash, readonly shadow, committed-WAL process-exit fixture, strict unknown source/metadata/version refusal | BLOCKER: approved real schemas and platform opener ordering; no real data scope granted |
| All-writer barrier | Registered actual fixture writers, drain/close/unknown/late/stale capability prototype | BLOCKER: actual complete cross-process GUI/sync/feedback/image registration and lifecycle integration |
| Build-bound identity | Actual A tool source/runtime/Actions identity and refusal on missing identity | OWNER DECISION/BLOCKER: formal signed complete release/runtime identity and distribution |
| Supplemental audit | Full nested cleanup serialization, attempt identity, complete writes/sync and tamper detection | UNVERIFIED/BLOCKER: production caller integration, every write failure, power loss and external anchoring |
| Remote A | Concrete authority/freshness/lineage design; no real endpoint or authentication test | OWNER DECISION/BLOCKER: approved service, credentials, authority and operational scope |
| Android issue #1 | Status preserved open; no closure or real-data claim | BLOCKER: issue-specific evidence and focused approved validation still required |

No master/main merge, production migration, startup integration, Actor resumption, sync/ACK semantics change, user data, real LAN/WebDAV or D4 UI change is made. D1/D2 outputs remain frozen. A evidence and B UI evidence must be reported separately; A must not postpone B's early owner preview.
