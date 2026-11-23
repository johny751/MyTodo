# C006 最终源逐行结果

源：`1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`；日期 2026-11-23（Asia/Shanghai）。主矩阵 83、Android 强杀 2、bootstrap 4，共 89 个实际场景结果行。最终断言均通过；A27 首崩、凭据排除等限定见总报告。下表保留相同 case 的历史红测结果，未改写旧收据。主控已完成限定验收并关闭 C006：`accepted=true`、`status=accepted-with-documented-evidence-qualifications`、`pending=[]`。Android 稳定性问题仍 open，C007 独立验收。

## core-javascript — 59/59

GitHub run `45170150079/1`；summary SHA256 `e0c6c006029622553930a8986a65b34e873f9722b673bf7b01150999bb6a18a9`。

| case | 最终结果 | 历史基线 | 限定 |
| --- | --- | --- | --- |
| C006-01-empty | passed | passed (45164223526) | — |
| C006-02-legacy | passed | passed (45164223526) | — |
| C006-03-backup-before | passed | passed (45164223526) | — |
| C006-04-backup-after | passed | passed (45164223526) | — |
| C006-05-fence-before | passed | passed (45164223526) | — |
| C006-06-fence-after | passed | passed (45164223526) | — |
| C006-27-manifest-before | passed | passed (45164223526) | — |
| C006-28-manifest-after | passed | passed (45164223526) | — |
| C006-07-reread-v1 | passed | passed (45164223526) | — |
| C006-08-reread-missing | passed | failed (45164223526) | — |
| C006-09-appearing-v1 | passed | passed (45164223526) | — |
| C006-10-appearing-guard | passed | passed (45164223526) | — |
| C006-11-appearing-empty | passed | passed (45164223526) | — |
| C006-13-etag-missing | passed | passed (45164223526) | — |
| C006-13-etag-weak | passed | passed (45164223526) | — |
| C006-12-eight-conflicts | passed | passed (45164223526) | — |
| C006-16-backup-404 | passed | passed (45164223526) | — |
| C006-16-backup-500 | passed | passed (45164223526) | — |
| C006-17-truncated | passed | passed (45164223526) | — |
| C006-17-crc | passed | passed (45164223526) | — |
| C006-17-json | passed | passed (45164223526) | — |
| C006-17-format | passed | passed (45164223526) | — |
| C006-19-20-absent | passed | failed (45164223526) | — |
| C006-19-20-empty | passed | failed (45164223526) | — |
| C006-19-20-number | passed | passed (45164223526) | — |
| C006-19-20-array | passed | passed (45164223526) | — |
| C006-19-20-object | passed | passed (45164223526) | — |
| C006-19-20-traversal | passed | passed (45164223526) | — |
| C006-19-20-url | passed | passed (45164223526) | — |
| C006-19-20-query | passed | passed (45164223526) | — |
| C006-19-20-fragment | passed | passed (45164223526) | — |
| C006-19-20-directory | passed | passed (45164223526) | — |
| C006-19-20-long | passed | passed (45164223526) | — |
| C006-18-capacity | passed | passed (45164223526) | — |
| C006-21-format | passed | passed (45164223526) | — |
| C006-21-string-version | passed | passed (45164223526) | — |
| C006-21-version | passed | passed (45164223526) | — |
| C006-21-trailing | passed | passed (45164223526) | — |
| C006-21-nul | passed | failed (45164223526) | — |
| C006-22-winner-valid | passed | passed (45164223526) | — |
| C006-23-winner-missing | passed | passed (45164223526) | — |
| C006-23-winner-malformed | passed | passed (45164223526) | — |
| C006-23-winner-weak | passed | passed (45164223526) | — |
| C006-24-kill-after-backup | passed | passed (45164223526) | — |
| C006-25-kill-after-fence | passed | passed (45164223526) | — |
| C006-26-kill-after-import | passed | passed (45164223526) | — |
| C006-29-kill-after-manifest | passed | passed (45164223526) | — |
| C006-30-fresh-takeover | passed | failed (45164223526) | — |
| C006-31-kill-after-batch | passed | passed (45164223526) | — |
| C006-34-delete-with-base | passed | passed (45164223526) | — |
| C006-35-delete-without-base | passed | failed (45164223526) | — |
| C006-32-two-migrators | passed | passed (45164223526) | — |
| C006-33-three-way-base | passed | passed (45164223526) | — |
| C006-36-edit-during-retry | passed | failed (45164223526) | — |
| C006-37-conflict-retry | passed | passed (45164223526) | — |
| C006-38-v2-delete-after-migration | passed | passed (45164223526) | — |
| C006-39-import-marker-atomic | passed | failed (45164223526) | — |
| C006-40-import-marker-repeat | passed | failed (45164223526) | — |
| C006-41-import-backup-tamper | passed | failed (45164223526) | — |

## core-windows-native — 18/18

GitHub run `45170150079/1`；summary SHA256 `a7c059317d557889a4efb936b77639f162af65525e852a0b494f8605c47313eb`。

| case | 最终结果 | 历史基线 | 限定 |
| --- | --- | --- | --- |
| C006-01-empty | passed | passed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-09-appearing-v1 | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-10-appearing-guard | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-11-appearing-empty | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-14-existing-guard | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-15-existing-v1 | passed | passed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-absent | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-empty | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-number | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-array | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-object | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-traversal | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-url | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-query | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-fragment | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-directory | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-19-20-long | passed | failed (45164223526) | Native nonempty legacy/v1 cases may pass through required safe rejection; no native v1 importer is claimed. |
| C006-30-js-killed-native-snapshot | passed | failed (45164223526) | Kills JavaScript producer, then native takes over. Does not claim native process forced-termination recovery. |

## core-android — 6/6

GitHub run `45170150079/1`；summary SHA256 `b1ae80dcde25f0acc052015bf9e33a5e9ada222bfa9797e322f9ce9ad1b559b1`。

| case | 最终结果 | 历史基线 | 限定 |
| --- | --- | --- | --- |
| C006-A02-legacy | passed | passed (45164223526) | — |
| C006-A06-fence-drop | passed | passed (45164223526) | — |
| C006-A27-manifest-fail | passed | passed (45164223526) | Final operation accepted as expected; observer restart attempt1 crashed, same dbCase later passed. Original diagnostic scene preserved after force-stop, not crash-time transaction state. |
| C006-A28-manifest-drop | passed | passed (45164223526) | — |
| C006-A19-missing-backup | passed | failed (45164223526) | — |
| C006-A35-tombstone | passed | failed (45164223526) | — |

## android-internal-kill — 2/2

GitHub run `45170150057/1`；summary SHA256 `a989b3a928ea58d7b2661bdf58935cc41e2b86f2a15ceccb915ded1cbdc912b7`。

| case | 最终结果 | 历史基线 | 限定 |
| --- | --- | --- | --- |
| C006-A26-import-kill | passed | passed (45164373911) | Actual internal process death; original database reopened/resumed after natural lease wait, original actor/rows/outbox checked. |
| C006-A30-manifest-kill | passed | failed (45164373911) | Actual death after manifest; original database isolated; fresh database restores retained records from snapshot only. |

## bootstrap — 4/4

GitHub run `45170150092/1`；summary SHA256 `2f71588e42487941174b7f87b3187af1df2531466b5b8dc39bf4f57c743ca081`。

| case | 最终结果 | 历史基线 | 限定 |
| --- | --- | --- | --- |
| C006-B42-snapshot-before | passed | failed (45166586294) | Actual injected fault seen2/used1, initial rejection, retry and fresh observer pass. |
| C006-B43-snapshot-disconnect | passed | failed (45166586294) | Actual injected fault seen2/used1, initial rejection, retry and fresh observer pass. |
| C006-B44-kill-after-snapshot | passed | failed (45166586294) | Snapshot PUT returned201; real SIGKILL PID2249; later audit/retry/observer pass. |
| C006-B45-real-edit-cas | passed | failed (45166586294) | Independent editor PID2377 changes real database; sync PID2365 has actual CAS outcome.ok=false then recomputes and passes. |

历史错误完整原文及来源 SHA 保留在 JSON；它们是旧执行结果。不同 suite 不合成为全平台全场景覆盖。DPAPI 22、helper 10、baseline JS121、完整协议矩阵936保持独立计数。
