# C0-04 共同协议向量前后对比

历史受测提交 `d02e416f6f353eb018a72446d4851722f2f956c6`，进程退出码 `1`。[C0-03 run](https://github.com/johny751/MyTodo/actions/runs/45117818661)

当前受测提交 `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc`，完整矩阵进程退出码 `0`。[C0-04 run](https://github.com/johny751/MyTodo/actions/runs/45140238501)

C0-03 三端共同向量矩阵 **通过**。比较采用同一 GitHub 源码和运行批次的收据。

历史 C/JS 比较 {"passed":190,"failed":38,"blocked":6,"skipped":0,"static-reviewed":0}。当前同范围 {"passed":234,"failed":0,"blocked":0,"skipped":0,"static-reviewed":0}。

当前全部执行 {"passed":936,"failed":0,"blocked":0,"skipped":0,"static-reviewed":0}。当前全部比较 {"passed":936,"failed":0,"blocked":0,"skipped":0,"static-reviewed":0}。

历史失败位置 {"已修复":40,"规范允许的序列化差异":0,"仍未解决":0,"阻塞，无法验证":0}。每个向量可涉及多个执行和比较。

每个方向的状态顺序为 C、JS、Android。每格为历史状态 → 当前状态。skipped 表示对应位置缺少执行或比较收据。

| 向量 | 生成 | C 样本接收 | JS 样本接收 | Android 样本接收 | 对应的历史失败状态 |
| --- | --- | --- | --- | --- | --- |
| `basic-note` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `unicode-body` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `causal-field-trimming` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `multiple-entities` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `duplicate-events` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `reversed-events` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `independent-fields` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `actor-A-a` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `actor-A-a-reverse` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `actor-hyphen-ascii` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `ascii-punctuation-id` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `field-conflict` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `tombstone-late-old` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `tombstone-concurrent-edit` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `explicit-causal-restore` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `sparse-retained-seq` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `tampered-duplicate` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `actor-length-80` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `actor-length-81` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `actor-invalid-punctuation` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `actor-unicode` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-ascii-200` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-ascii-201` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `id-cjk-66` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-cjk-67` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-emoji-100` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-empty` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-three-items` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `key-one-item` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-swapped` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-array-type` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-malformed` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-scalar-json` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `key-number-id` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-null` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-array` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-number` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `context-string` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-negative` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-max-safe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `context-invalid-actor` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `seq-zero` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `seq-fraction` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `seq-max-safe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `seq-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `clock-max-safe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `clock-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `values-array` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `values-forbidden-field` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `manifest-int32-plus-one` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `manifest-max-safe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `manifest-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `manifest-heads-array` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `manifest-empty-actor` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `manifest-empty-epoch` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `prepare-int32-overflow` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `sql-remote-rollback` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `sql-local-rollback` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `batch-gap` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `batch-duplicate-restart` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `batch-over-500` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `snapshot-complete` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `snapshot-missing-part` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `snapshot-bad-hash` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `snapshot-wrong-epoch` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `snapshot-cursor-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | failed → passed<br>passed → passed<br>blocked → passed | failed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `snapshot-sql-restart` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `cursor-int32-max` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `cursor-int32-plus-one` | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `cursor-max-safe` | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `cursor-unsafe` | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-ascii-800` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `id-ascii-801` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-cjk-266` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `id-cjk-267` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |
| `id-emoji-200` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 已修复 |
| `id-emoji-201` | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | passed → passed<br>passed → passed<br>blocked → passed | blocked → passed<br>blocked → passed<br>blocked → passed | 无 |

## 逐项比较

比较顺序为 C/JS、C/Android、JS/Android。每格为历史状态 → 当前状态。

| 向量 | 生成比较 | C 样本比较 | JS 样本比较 | Android 样本比较 |
| --- | --- | --- | --- | --- |
| `basic-note` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `unicode-body` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `causal-field-trimming` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `multiple-entities` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `duplicate-events` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `reversed-events` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `independent-fields` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-A-a` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-A-a-reverse` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-hyphen-ascii` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `ascii-punctuation-id` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `field-conflict` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `tombstone-late-old` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `tombstone-concurrent-edit` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `explicit-causal-restore` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `sparse-retained-seq` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `tampered-duplicate` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-length-80` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-length-81` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-invalid-punctuation` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `actor-unicode` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-ascii-200` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-ascii-201` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-cjk-66` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-cjk-67` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-emoji-100` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-empty` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-three-items` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-one-item` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-swapped` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-array-type` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-malformed` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-scalar-json` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `key-number-id` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-null` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-array` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-number` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-string` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-negative` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-max-safe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `context-invalid-actor` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `seq-zero` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `seq-fraction` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `seq-max-safe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `seq-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `clock-max-safe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `clock-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `values-array` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `values-forbidden-field` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-int32-plus-one` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-max-safe` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-heads-array` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-empty-actor` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `manifest-empty-epoch` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `prepare-int32-overflow` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `sql-remote-rollback` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `sql-local-rollback` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `batch-gap` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `batch-duplicate-restart` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `batch-over-500` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-complete` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-missing-part` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-bad-hash` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-wrong-epoch` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-cursor-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `snapshot-sql-restart` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `cursor-int32-max` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `cursor-int32-plus-one` | passed → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `cursor-max-safe` | passed → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `cursor-unsafe` | passed → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | blocked → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-ascii-800` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-ascii-801` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-cjk-266` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-cjk-267` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-emoji-200` | passed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | failed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |
| `id-emoji-201` | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | passed → passed<br>skipped → passed<br>blocked → passed | skipped → passed<br>skipped → passed<br>skipped → passed |

## 历史失败位置

| 向量 | 范围 | 历史状态 | 当前状态 | 结论 |
| --- | --- | --- | --- | --- |
| `reversed-events` | C 样本 · C / JS | failed | passed | 已修复 |
| `reversed-events` | JS 样本 · C / JS | failed | passed | 已修复 |
| `independent-fields` | C 样本 · C / JS | failed | passed | 已修复 |
| `independent-fields` | JS 样本 · C / JS | failed | passed | 已修复 |
| `actor-A-a` | C 样本 · C / JS | failed | passed | 已修复 |
| `actor-A-a` | JS 样本 · C / JS | failed | passed | 已修复 |
| `actor-A-a-reverse` | C 样本 · C / JS | failed | passed | 已修复 |
| `actor-A-a-reverse` | JS 样本 · C / JS | failed | passed | 已修复 |
| `actor-hyphen-ascii` | C 样本 · C / JS | failed | passed | 已修复 |
| `actor-hyphen-ascii` | JS 样本 · C / JS | failed | passed | 已修复 |
| `tombstone-late-old` | C 样本 · C / JS | failed | passed | 已修复 |
| `tombstone-late-old` | JS 样本 · C / JS | failed | passed | 已修复 |
| `tombstone-concurrent-edit` | C 样本 · C / JS | failed | passed | 已修复 |
| `tombstone-concurrent-edit` | JS 样本 · C / JS | failed | passed | 已修复 |
| `id-ascii-201` | C 样本 · C / JS | failed | passed | 已修复 |
| `id-ascii-201` | JS 样本 · C / JS | failed | passed | 已修复 |
| `key-three-items` | C 样本 · C / JS | failed | passed | 已修复 |
| `key-three-items` | JS 样本 · C / JS | failed | passed | 已修复 |
| `context-number` | C 样本 · C / JS | failed | passed | 已修复 |
| `context-number` | JS 样本 · C / JS | failed | passed | 已修复 |
| `manifest-unsafe` | C 样本 · C / JS | failed | passed | 已修复 |
| `manifest-unsafe` | JS 样本 · C / JS | failed | passed | 已修复 |
| `manifest-heads-array` | C 样本 · C / JS | failed | passed | 已修复 |
| `manifest-heads-array` | JS 样本 · C / JS | failed | passed | 已修复 |
| `manifest-empty-actor` | C 样本 · C / JS | failed | passed | 已修复 |
| `manifest-empty-actor` | JS 样本 · C / JS | failed | passed | 已修复 |
| `manifest-empty-epoch` | C 样本 · C / JS | failed | passed | 已修复 |
| `manifest-empty-epoch` | JS 样本 · C / JS | failed | passed | 已修复 |
| `prepare-int32-overflow` | C 样本 · C / JS | failed | passed | 已修复 |
| `prepare-int32-overflow` | JS 样本 · C / JS | failed | passed | 已修复 |
| `snapshot-cursor-unsafe` | C 样本 · C | failed | passed | 已修复 |
| `snapshot-cursor-unsafe` | JS 样本 · C | failed | passed | 已修复 |
| `snapshot-cursor-unsafe` | C 样本 · C / JS | failed | passed | 已修复 |
| `snapshot-cursor-unsafe` | JS 样本 · C / JS | failed | passed | 已修复 |
| `id-ascii-800` | C 样本 · C / JS | failed | passed | 已修复 |
| `id-ascii-800` | JS 样本 · C / JS | failed | passed | 已修复 |
| `id-cjk-266` | C 样本 · C / JS | failed | passed | 已修复 |
| `id-cjk-266` | JS 样本 · C / JS | failed | passed | 已修复 |
| `id-emoji-200` | C 样本 · C / JS | failed | passed | 已修复 |
| `id-emoji-200` | JS 样本 · C / JS | failed | passed | 已修复 |
