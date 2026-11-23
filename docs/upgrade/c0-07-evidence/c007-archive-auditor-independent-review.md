# C007 evidence archive auditor independent review

Reviewed on 2026-11-23 by credential_review. This record concerns the evidence-only auditor, not C007 acceptance or a new project test run.

## Reviewed version and conclusion

- File: `work/audit-c007-archive.ps1`
- Bytes: 33,424
- SHA256: `eb614a19ee4faa4a7a201925e17dd14c938edb15b431fc232cdc858e610e1f5d`
- Auditor output schema: `mytodo-c007-independent-evidence-audit`, version 2.
- Conclusion: the final source is suitable for the stated archived JSON/text integrity and recorded-execution comparison scope. No unresolved blocking issue was identified within that scope.
- Independent method: source text reading, JSON evidence reading, file hashes, and text comparison only. The reviewer did not execute the auditor or project code, run project tests, open databases, build binaries, install dependencies, or modify original evidence. The author's execution and syntax-check claims remain separate evidence.

## Verified controls

The auditor keeps archive integrity, collector completeness, recorded execution and final acceptance separate. A faithfully archived failed run can have `archiveIntegrityPassed=true` and audit exit zero while `recordedRunPassed=false`. The auditor explicitly makes no acceptance decision and does not claim a deep platform semantics review.

Local text files are size/hash checked against the inventory. Producer rows are compared with the cloud collector inventory, and copied text bytes are rehashed. Cloud-only rows are labelled as producer/collector hash comparisons, not as local verification of unavailable bytes. Singleton arrays retain their shape. Duplicate/self-referencing inventory paths, escaping or aliased paths, reparse points, and unindexed files are rejected. A supplied output must be new and outside the original evidence directory.

Execution JSON must be covered by a closed C007 producer seal. Collection, suite, seal, report, summary, result and reopen identity checks bind source SHA, run identity where available, platform, case and attempt. C007 seal rows explicitly require `path` and `bytes`; legacy generic manifests may retain their documented alternate fields. Report seals must agree with the recorded report verdict.

The script derives planned counts from materialized scenarios, validates attempt order and required restart/exit/database checks, requires normal result and reopen receipt hashes, and uses actual boundary-marker filenames for expected exit 86. Result/reopen identities and observer completion are checked before counts are accepted. Reopen receipts use `attemptId + '-reopen'` and `operation.op='audit'`.

Report validation now checks exactly three platforms, each expected platform once, per-case verdict agreement, count agreement, unique case IDs, and required statistics for passed cases. A passed report must have an empty errors array. The final two-line change was compared against the preserved `dc5234e953306d67e0e1a83282cc3a4a9e229ea5cf9607ff0d2d2fff51588f4d` version; the only changes add the exact platform count and passed-case statistics gates.

## Evidence compatibility and interpretation

The reviewer directly read first-red Node/Windows normal and reopened receipts. They use schema `mytodo-c007-attempt`; SQL scenario/summary receipt case identity is `c007-real-sql-atomicity`, while the suite directory is `sql-atomicity`. Reopened receipts use the `-reopen` suffix, observer exit zero and the audit operation.

The independent Android reviewer confirmed that the strengthened-red archive has 52 ordinary receipts, 55 reopen receipts and three expected exit-86 boundary receipts with compatible identities. Android receipts do not carry the generic `faultHits` field; a zero `faultHitReceipts` count therefore must not be interpreted as absence of injected Android faults. Positive integer `faultHits` counts are a field-specific observation, not a cross-platform fault total.

Controller attempts are never presented as successful business operations. In the first-red Android archive, ten startup attempts yielded zero business, reopen or boundary receipts. The script retains that difference. The strengthened-red collector's original incomplete status and 114 binary `.stdout` exclusions also remain visible; local omission of those bytes is not silently reclassified as a complete collection.

## Limits carried into publication

The text inventory is not self-authenticating; the parent must retain the trusted transfer receipt and artifact provenance. A hash-closed archive and internally consistent report do not independently prove the behavior asserted by the controller. Database durability, Android lifecycle, network fault meaning, production source binding and final-source regression gates require their own evidence and platform reviews. Expected exit 86, a closed source seal or a negative operation result alone is not success.

The parent owns final acceptance, cloud integration, final output publication, project checkpoint and GROWTH updates. Earlier script/output versions remain historical snapshots under `work/c007-audit-history/`; they must not be substituted for the final auditor hash when citing its results.

## Final output readback

The reviewer read and hashed the author's final two JSON outputs after generation. Both embed the reviewed `eb614a19ee4faa4a7a201925e17dd14c938edb15b431fc232cdc858e610e1f5d` auditor hash, report zero integrity issues, retain `recordedRunPassed=false`, and retain execution status `failed-or-incomplete`.

| Output | Bytes | SHA256 | Retained result |
| --- | ---: | --- | --- |
| `work/c007-first-red-integrity-audit.json` | 68,069 | `12fcbdd3e5e339d23eb5ddbc4400743b959ec6ee55deeaccbc0e71fd0d22f57e` | 141 controller attempts, 47 failed checks; collector exit 0, complete true |
| `work/c007-strengthened-red-integrity-audit.json` | 68,126 | `2252cc77ce8939274b21ef925c963a9f4286c99ed0d399d0427c4191d02baa00` | 187 controller attempts, 33 failed checks; collector exit 1, complete false, 114 retained failures |

This readback confirms the final outputs' stated scope and bindings; it does not convert either historical red run into a passing test or independently replay its controller.
