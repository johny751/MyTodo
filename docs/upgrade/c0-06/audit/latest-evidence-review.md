# C0-06 latest evidence review

Reviewed 2026-11-23, Asia/Shanghai. Scope: four newly collected runs only. This review used local PowerShell JSON/text reads, file lengths and SHA256 hashing. No project code, tests, compiler, dependency manager or binary was executed locally. Original collector receipts and historical red evidence were not changed.

The final-source baseline and four-case bootstrap suite both passed on `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`. This does not by itself turn the entire C006 matrix green. The DPAPI and Android observation suites below ran on different, explicitly identified source commits.

## Local text archive verification

For each `text-archive-files-sha256.json`, every listed path was checked to remain inside its evidence root, exist, have the listed byte length and match SHA256. All four lists have no duplicate paths, missing files, length mismatches or hash mismatches. Counts include collector metadata and differ from `copiedTextFiles`, which counts artifact text only. The archive manifest itself is independently hashed below; it does not list itself.

| Run | Evidence root | Verified listed files | Actual listed bytes | Source commit | GitHub result |
| --- | --- | ---: | ---: | --- | --- |
| 45170150066 | `outputs/c0-06/evidence/45170150066` | 122/122 | 397,201 | `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | success |
| 45170150092 | `outputs/c0-06/evidence/45170150092` | 110/110 | 7,888,448 | `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | success |
| 45168648612 | `outputs/c0-06/evidence/45168648612` | 19/19 | 67,010 | `32e21eb69764dfa99227439b7727f0553205e5ca` | success |
| 45169951082 | `outputs/android-stability/evidence/45169951082` | 147/147 | 467,151 | `8ce0a047ec14925e08072129e4fd13b372e2e084` | success |

Archive manifest SHA256:

- 45170150066: `a512de5a4ccc39ac7034246904d7e4fd1a21b4f1f186de366e4e62a085c93e05`
- 45170150092: `72a021dac74cb604edca71e8f8251524443c924af444b193b22afb564d0ac9ff`
- 45168648612: `663a70f57340e81c5338103e6e77a1515fc0ddf3f6a47ade15f8700c76a5f9a1`
- 45169951082: `5fd0b1eca0f275143c2e806cf9b34aee0d86b53cf80824507fc9945c62c5355a`

## Final-source baseline: run 45170150066

`phase0-web-45170150066-1/shared-js-tests.stdout.log` reports **121 executed, 121 passed, 0 failed, 0 skipped**. `run-receipt.json.testSummary` agrees; shared-js-tests exit code is 0. Web packaging passed and the source ZIP is present according to its build receipt and cloud inventory. This is the later green evidence after the earlier 32e baseline failure; the earlier failed run remains valid history.

All three platform run receipts have expected, actual, workflow and trigger SHA equal to the full `1b9c41fb…` commit above, `sourceVerified=true`, `jobStatus=success`, both required-completeness flags true and no evidence errors. `source-resolution.json` agrees. Receipt case arrays equal the separate `case-results.json` arrays, and every referenced stdout/stderr log exists locally. Web 13/13, Windows 11/11 and Android 19/19 are **executor step records**, not additional counts of business tests.

Windows native build and self/advanced/feedback executables returned exit 0. Their logs report self 32 checks, advanced 48 checks plus a separately reported 48 detail-key checks, and feedback 21 checks, all with zero failures. These counters are preserved separately rather than added to the 121 JS tests. Android host-side policy logs report Pomodoro 73, daily 47 and notification controls 20 assertions passed; build and manifest checks passed. The separate Android inventory is **blocked**, has no system image, and explicitly says `realAndroidSQLiteTestsExecuted=false`. This phase0 run is not Android emulator/runtime or installation/upgrade evidence; its APK is unsigned.

**Seal qualification:** the original collector remains `collectionExitCode=1`, `evidenceComplete=false`, with five `artifact-has-no-integrity-manifest` findings and zero recursively verified producer rows. These phase0 artifacts use embedded run/artifact receipts and do not supply the newer recursive `sha256.json` / `payload-sha256.json` format. Missing that format is not an observed content-hash mismatch, and local text hashes cannot replace it.

The three receipts' `artifacts` arrays equal their `artifacts.json` files. All four present principal artifacts' receipt bytes/SHA256 equal the collector's cloud inventory: helper EXE 149,504 bytes, Web source ZIP 101,740 bytes, Windows EXE 1,326,080 bytes and unsigned APK 281,749 bytes. The Android adapter's receipt SHA256 also equals its cloud inventory row. These binaries and the adapter were not locally rehashed. All three `executor.sha256` files record `75fafc8242c1b2c14819c27925ded4b88ec161bc28796d873914a7e471d4ecda`; the executor source is not included in the evidence, so its claimed digest cannot be independently reproduced from this archive. Source resolution and Android inventory likewise provide identity/status, not a recursive payload seal. The original collector's incomplete qualification is retained.

## Final-source bootstrap and real edit CAS: run 45170150092

`c006-bootstrap-45170150092-1/summary.json` and the four individual case results agree: **4 executed, 4 passed, 0 failed** on `1b9c41fb…`. The actual operation records support the intended failure boundaries:

- B42 and B43 each record fault `seen=2`, `used=1`; the first sync process rejects with exit 1, followed by successful retry and fresh-observer sync. The fault was exercised.
- B44 reaches an `after-request` gate after a snapshot `PUT v2/s-55c705b2-9f7f-407b-9627-5158fba36426-0.json.gz` returns HTTP 201. PID 2249 then has `SIGKILL`, `killed=true`, no timeout and no exit code. A distinct audit PID 2261 and subsequent restart/retry/observer processes pass.
- B45 pauses sync PID 2365 before its real commit, while separate editor PID 2377 passes. The resumed sync's actual `commitTrace` contains one `outcome.ok=false` CAS attempt before successful recovery. Later observer sync passes.

The producer seal has 121 rows; the original collector reports all 121 verified, zero integrity failures, exit 0 and `evidenceComplete=true`. Independent local review rehashed the 99 locally available producer rows, compared all 121 rows with cloud inventory metadata, and found no mismatch. The remaining 22 payloads are intentionally cloud-only; this review did not rehash their bytes locally. Producer seal SHA256: `4c60615753748ca56bf0ba91e4eb07920c5f86b6acccbcb3eae59d3e87b86b6d`.

This suite contains four real Node SQLite/HTTP/process scenarios. It supplements the frozen C006 evidence and does not replace the larger matrix or Android kill review.

## DPAPI regression: run 45168648612

`credential-report.json` contains **22 cases, all passed**, with `counts={passed:22,failed:0}` and exit 0. Native build, helper build and real interoperability execution also return exit 0. The report identifies real `CryptProtectData/CryptUnprotectData` under the same GitHub Windows runner user, `networkRequests=0`, and `credentialPlaintextLogged=false`. Coverage includes C-to-Node and Node-to-C ASCII/Unicode, legacy UTF-16 and PowerShell formats, blank-password preservation, malformed/truncated/corrupt/empty input rejection, protected malformed payloads and real Windows read-sharing denial.

This run is on `32e21eb69764dfa99227439b7727f0553205e5ca`; it must not be relabeled as a direct DPAPI execution on `1b9c41fb…`. Any unchanged-code reuse requires separate source-diff evidence.

The original collector reports 12/12 producer rows verified, zero integrity failures, exit 0 and `evidenceComplete=true`. Local review rehashed 8 producer rows and compared all 12 to cloud inventory without mismatch; 4 binary payloads remain cloud-only. No credential binary was read or decrypted. Producer seal SHA256: `dba0de1bcf804967c003e66f646f3699a9142f9f1305bfc10a4dbd93154c34eb`.

## Sealed Android observation verification: run 45169951082

The observation summary's **10 executed, 10 passed, 0 failed** agrees with all ten test records. It runs on `8ce0a047ec14925e08072129e4fd13b372e2e084` and explicitly sets `physicalCrashRecoveryClaimed=false`.

The command evidence records actual shell exit 37 with separate stdout/stderr mapping. An actual missing-file `exec-out cat` returns exit 0 with 92 bytes of error output, demonstrating why exit 0 alone cannot certify a database copy. Main-file and sidecar error-text substitutions are explicitly labeled test-only replacements of transfer results while remote probes are real; size/hash mismatch rejects them. Existing SQLite and sidecar bytes, empty sidecars, missing/unreadable/non-regular files, invalid SQLite headers and changes between remote probes are represented in the results. The main and sidecar substitution checks belong to one summarized test; they are not counted as an eleventh test.

Frozen source hashes agree:

- `remote-file-evidence.mjs`: `41613ce991718a0c1cf03f2f7747d43598e5b0ab3cf081f811e0d3af08a0c350`
- `run-android.mjs`: `96d48dc0ee6f81d77da76284b4ee68b5b38c572c230d4ae9512c6b2bceb8cfba`
- `verify-remote-file-evidence.mjs`: `bec4b2b267757f6792085f02c1b469acd7f0151aa31b8c1fc2ee8b05d16b5811`

This new run includes both producer seals. The original collector reports 196 main rows plus 44 environment rows, **240/240 verified**, zero integrity failures, exit 0 and `evidenceComplete=true`. Independent local review rehashed 91 main rows and all 44 environment rows, and compared every sealed row with the cloud inventory without mismatch. The 105 remaining main payloads are cloud-only. Main seal SHA256: `c24c5c55177eea89af87b281125277fb9ecad79b981473b2be85b514d86341d2`; environment seal SHA256: `fc7e7d527185186c0cd216e7c5e8295e88c1360d66592816e140acc807b97da6`.

This superseding sealed observation run does not retroactively add a seal to run 45168051257, recover the missing original crashed databases from older runs, or establish physical crash recovery. Those earlier qualifications remain unchanged.
