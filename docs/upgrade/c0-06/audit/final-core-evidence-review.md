# C006 final core evidence review

Reviewed 2026-11-23, Asia/Shanghai. Run `45170150079/1`, source `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`, workflow `MyTodo C0-06 actual legacy recovery`, GitHub result success. This is a local text, JSON and SHA256 review only. No project execution, local test, compilation, database opening or credential decryption occurred. Original receipts and earlier red evidence remain unchanged.

The final core suite reports **83 executed scenarios, 83 passed, 0 failed**: JavaScript 59, Windows native 18 and Android 6. The per-platform summary hashes match `acceptance.json`; every summarized row is passed. All 77 Node/native case-result files match their summary status and full source SHA. The six Android summary rows are supported by 24 final operation outputs, all with matching expected/actual acceptance, matching source SHA and successful same-database restart comparison. This is final assertion success within the recorded scope, not a claim that every invocation succeeded on its first attempt.

## Archive and producer integrity

Evidence root: `outputs/c0-06/evidence/45170150079`.

- Local archive ZIP SHA256: `fce99a3a6ad200a9d8289a48e46c3d34c8009bc8d482276fe50b74861b4a46a3`, independently rehashed and equal to the supplied transfer digest.
- `text-archive-files-sha256.json` SHA256: `960d53f20f4b609ad0073b51e7a74f74ec1627ce41c09c494ab2b2d778b31f5b`.
- **2,626/2,626 listed local text files**, **37,511,539 actual bytes**, no duplicates, missing files, out-of-root paths, length mismatches or hash mismatches. The manifest itself is separately hashed and not included in its own list.
- The collector copied 2,616 artifact text files and added metadata to the archive. Its inventory has 3,098 files, of which 482 payloads remain cloud-only. These figures use a different scope from the 2,626 archive rows.

Every producer row was compared against the collector inventory. Every locally present, non-credential producer payload was independently rehashed. All seals' actual SHA256 match `verified-payloads.json`; no comparison mismatch was found.

| Artifact / seal | Producer rows | Locally rehashed rows | Other cloud-only rows | Excluded credential rows |
| --- | ---: | ---: | ---: | ---: |
| Android `sha256.json` | 1,136 | 977 | 159 | 0 |
| Android environment `payload-sha256.json` | 43 | 43 | 0 | 0 |
| Android environment `sha256.json` | 45 | 45 | 0 | 0 |
| JavaScript `sha256.json` | 1,373 | 1,134 | 239 | 0 |
| Native `sha256.json` | 536 | 452 | 60 | 24 |
| Report `sha256.json` | 3 | 3 | 0 | 0 |

The collector's **3,136 verified manifest rows** include overlapping environment seals; this is not a count of unique files. Cloud-only binary bytes were verified by the cloud collector and their recorded metadata was cross-checked here; this local review did not independently rehash those bytes.

Producer seal SHA256:

- Android: `7479226205cfe388adc8241dbc8e1fb3e3acd8d23823a34ebf4fa9db4ab553c5`
- Environment payload: `1e09a0270231602848fa502570a69538945a0b982fba3da92c8182be64e8ae2b`
- Environment recursive: `b050011afdbaf945ccd743bc6cd76fb2e3452ca9309c7cfec498eaf6779f5fa6`
- JavaScript: `6141cd05dd053a5c3ca330c928a601cd42c3f99d0ffda7ed18fe70f2cb6d55e3`
- Native: `11c19286278b26d0da11743db46a080035960d489a495b53afda30cf4eb32f1c`
- Report: `611de07d590b1935f856361ded16338b0bbe31d04b7d919bf4ddbb0ce800f18f`

## Credential exclusion qualification

The original collector remains **exit 1**, **`evidenceComplete=false`**, with **24** `unexpected-credential-fixture-in-artifact` findings. The earlier count of 20 does not apply to this run. Normalizing away the run-specific artifact directory, the new set contains all previous 20 paths plus the native observer configuration from C006-09, C006-10, C006-11 and C006-14; no old path disappeared.

All 24 `sync-config.enc` paths have a matching producer manifest and cloud inventory row with equal byte length/SHA256, `copiedToTextArchive=false`, and `omittedReason=credential-fixture-excluded`. None exists in the local evidence tree. They were not downloaded, read or decrypted by this review. The only collector findings are these exclusion-policy findings, not payload hash mismatch reports; the original incomplete result is nevertheless retained.

The local native harness explicitly constructs synthetic fixture credentials. Its LF digest is `300872f4c0fcf869635b0440be5677b624ec070857149e86955a4ea14dc02a48`; converting its text to the Windows checkout's CRLF form yields `1b29b37174e5a69b2e94f5433a38ee29ec965ee6caaf6ae205e7bd5ee7de5139`, exactly the cloud native build receipt's harness digest. This source-level evidence supports fixture provenance without inspecting encrypted contents. It does not change the collection policy or certify any real user's credentials.

## Executed failure boundaries

The JavaScript case-result files contain 280 operation records; the native suite contains 104, including explicitly marked JavaScript setup/migration operations. These subordinate operation records are not added to the 83 scenario count.

Node fault counters show the tested faults were actually used. Backup, fence and manifest before/after failure cases each have `used=1`, an initial sync process with exit 1 and rejected status, then successful new-process retry and observer/audit steps. The eight-conflicts scenario records `seen=9`, `used=8`, rejects the first sync and later succeeds. The repeated-import-marker scenario records two consumed manifest failures. The backup-tamper scenario rejects both the injected manifest failure and the later changed immutable backup; it does not report acceptance merely because a process ran.

Six Node migration-boundary cases reached actual gates and were killed, each with `signal=SIGKILL`, `killed=true`, `timedOut=false`, and a null exit code:

| Case | Killed PID | Observed boundary |
| --- | ---: | --- |
| C006-24 | 4192 | backup PUT completed with HTTP 201 |
| C006-25 | 4297 | `state.json` fence PUT completed with HTTP 204 |
| C006-26 | 4461 | import commit returned `ok=true`, revision 3 |
| C006-29 | 4600 | manifest PUT completed with HTTP 201 |
| C006-30 | 4697 | manifest PUT completed with HTTP 201, fresh takeover |
| C006-31 | 4745 | batch PUT completed with HTTP 201 |

The subsequent retry/takeover/observer operations use distinct PIDs and pass. Native C006-09/10/11 each consume their actual appearance fault. Native C006-30 kills **JavaScript producer PID 8108** after the manifest PUT, then native init PID 1548 and native sync PID 3932 exit 0. It establishes native takeover from a killed JavaScript producer; it does not establish forced-termination recovery of the native C process itself.

Android uses the recorded API 34 x86_64 emulator and real production `syncDelta`/SQLite. Its request evidence shows:

- A06: fence PUT fault after write; `writeCommitted=true`, `disconnected=true`; operation rejected, retry succeeds.
- A27: manifest PUT fault before write; HTTP 500, `writeCommitted=false`; operation rejected, retry succeeds.
- A28: manifest PUT fault after write; `writeCommitted=true`, `disconnected=true`; operation rejected, retry succeeds.
- A19: `expectedAccepted=false` and `operationAccepted=false`; production reports malformed legacy migration guard. The request log contains five reads and **zero PUTs**. This is rejection evidence after the earlier erroneous-acceptance run, not a crash interpretation of that old failure.

All 24 final Android outputs report `actualAuditMatches=true`, `fileUnchangedByRead=true` and SQLite `integrity_check=ok`. These are cloud-produced real-SQLite audit receipts, not locally executed SQLite checks. The main Android suite says each operation is force-stopped/reopened with the same dbCase and explicitly excludes abrupt internal migration-boundary kill claims; those belong to the dedicated Android controller review.

## One Android restart crash retained

`C006-A27-manifest-fail/output-5.json` records one restart instrumentation crash on attempt 1 for `C006-A27-manifest-fail-observer`: no valid atomic result was returned. The same dbCase later passes its restart comparison; final process IDs include 9526 and 10264. This run must not be described as zero-crash or first-attempt success. The available records do not establish the crash's root cause.

The new failure observer records this scene at:

`artifacts/c006-android-45170150079-1/cases/C006-A27-manifest-fail/output-5.json.failures/restart/evidence.json`

Its actual SHA256 is `203e8065765b8a1b94267a17fb3ecbd555c42fb518a11f93426eb87c7c89eae4`, agreeing with the receipt, producer seal and inventory. It has `errors=[]`, `originalDatabaseReplayed=false`, `originalDatabasePreserved=true`, `allObservedFilesVerified=true`, and `mainProcessObservedStopped=true`.

The before/transfer/after metadata, referenced local text-log hashes, cloud manifest and cloud inventory agree for all four retained files:

| Failed-scene file | Bytes | SHA256 |
| --- | ---: | --- |
| `tasks.sqlite` | 40,960 | `992251b899452040e422fbf5f0db2952db6eb7b23817a6ac6c176a3b22ca4737` |
| `tasks.sqlite-wal` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `tasks.sqlite-shm` | 32,768 | `fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb` |
| `atomic-result.json.new` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Each records stable remote metadata, transfer match and cloud local-readback verification; the main file also records a valid SQLite header. Journal, final atomic result and backup atomic result have valid missing observations. Their bytes remain cloud-only in this local text archive.

The receipt explicitly limits `snapshotSemantics` to **raw files after diagnostic force-stop, with no claim of crash-time transaction state**. This run supports preservation of that diagnostic scene and successful later same-database retry. It does not prove the exact crash-time transactional state, repair the old missing scenes, or convert the observation suite into a physical crash-recovery test.

## Acceptance boundary

The evidence supports **83/83 final core scenario assertions on source 1b9c41fb…**, with the Android retry/crash and credential-exclusion qualifications above. It must be combined with the separately reviewed final baseline, four bootstrap cases and dedicated Android boundary-kill evidence for C006 closure. It does not start C007/D1, certify all platform cross-products, validate real Nutstore/user data, or replace unsigned-build limitations.
