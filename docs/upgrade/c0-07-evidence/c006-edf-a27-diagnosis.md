# C006 A27：环境终止、替代数据库重试及原库租约未过期

审阅日期：2026-11-23（Asia/Shanghai）。GitHub run `45194185453`，source `edfde91eba174f9f8c20657ded4657c8841d0f83`。此运行仍为 **83 项中 82 通过、1 失败**；失败项 `C006-A27-manifest-fail`。本记录不改变历史运行结果，也不以之前源码或其他运行的通过结果替代它。

## 结论

本次直接触发 case 失败的是第三次 operation 返回 `busy: true`，而非第二次 operation 的最终退出码。完整链路是：首次 sync 使用原库时，被 Android 因 Google Play 服务字体提供程序死亡而终止；shared runner 改用空的新库 `C006-A27-manifest-fail-retry-2` 重试，成功得到预期的 HTTP 500 拒绝，于是第二次 operation 被旧 C006 runner 接受。第三次 operation 恢复指定原库，遇到首次终止前取得、此时尚未到期的租约，遂失败。

该替代库结果不能证明原库恢复。新库还在同一个合成云夹具中写了备份、迁移围栏和快照，因此不能将后续操作解释成未经影响的首次原库重试。新增检查应在 C006 operation 的成功边界发现数据库身份变化，保留本次所有失败和替代执行记录。

## 原始证据与时间线

以下路径相对于 `outputs/c0-07/evidence/45194185453/artifacts/c006-android-45194185453-1/cases/C006-A27-manifest-fail/`，时间统一为 **2026-11-23 UTC**；换算为上海时间需加 8 小时。

设备时区由同次 operation 的 `output-2.json.logs/007-android-properties.log` 直接支持：第 255 行 `persist.sys.timezone=Etc/UTC`，第 564 行 `vendor.qemu.timezone=Etc/UTC`。因此本表将不自带时区的 logcat threadtime 解释为 UTC；host receipt 与 HTTP 记录本身带 Z。

| 时刻/阶段 | 原始记录 | 已证实行为 |
| --- | --- | --- |
| input/output 1，14:31:44.554–14:31:58.626 | `output-1.json`、receipt | 初始化原库；actor `5dbf128a-d40c-481b-b09d-f4264f0df881`，revision 1，保有 `local-note` 和 outbox 1。 |
| input 2 首次 main，14:32:00.227–14:32:04.725 | receipt command、`020-main-instrument.log` | 指定原 `dbCase`；PID 8502；instrumentation code 0，`shortMsg=Process crashed.`，无原子结果。ADB 命令本身 exit 0；上层 operation 的 `timedOut=false`。 |
| 14:32:04.285 | `025-main-evidence-logcat.log` 第 2321–2322 行 | GMS persistent PID 1426 的 `ChimeraModuleLdr` 因 `com.google.android.gms.rcs` 模块配置改变而强制重启，并向自身发送 SIG 9。 |
| 14:32:04.364 | 同日志第 2395 行；`023-main-evidence-exit-info.log` | Android 因 `com.google.android.gms/.fonts.provider.FontsProvider` 所在进程死亡而杀死 PID 8502；exit-info reason 12 `DEPENDENCY DIED`。这不是一条生产 JavaScript/SQLite 异常证据。 |
| 14:32:04.959–14:32:06.718 | `output-2.json.failures/main/evidence.json` | 在诊断 force-stop 后保全原数据库及 WAL/SHM；`originalDatabasePreserved=true`、`originalDatabaseReplayed=false`、`allObservedFilesVerified=true`。 |
| main retry 2，14:32:07.814–14:32:14.217 | receipt command、`output-2.json.main.json` | 改用 `.../C006-A27-manifest-fail-retry-2/tasks.sqlite`。重试开始时数据库为空、revision 0、initialized false；actor 改为 `889d9cb6-cbcf-449a-8dfb-af9c8b0a2643`。 |
| 14:32:12.305–14:32:13.341 | `cloud/http-requests.jsonl`，共 10 条 | 首个夹具请求发生在原进程死亡后、retry 2 期间。备份 PUT、state.json 围栏 PUT、snapshot PUT 已提交；快照仅含 retry actor 的 `legacy-note`。第 10 请求发布 manifest 时注入 HTTP 500，`writeCommitted=false`、fault used 1。 |
| output 2 最终，14:32:19.287 | `output-2.json`、receipt | retry 库内 expectedAccepted=false、operationAccepted=false，输出/重启比对均 passed，进程最终 exit 0。它通过的是新库的预期拒绝；旧 C006 operation 缺少与调用指定 dbCase 的比较。 |
| input/output 3，14:32:19.404–14:32:28.524 | `output-3.json`、receipt、`process-3.json` | 回到原库；actor 仍为 `5dbf...`，revision 2，保有 `local-note`/outbox 1；lease token `695f9a0f-a175-4c08-ab26-3703bde104ee`，until `1795444444306`，即 14:34:04.306，尚未到期。sync 返回 more/busy true，downloaded/uploaded 0；最终 exit 1。 |

第三次 operation 的 before→raw 的 meta、rows、outbox 完全相等，raw→reopened 也完全相等；重启比对通过。故原库已有数据与队列在该步骤仍保留。此 case 没有执行到租约到期后的原库恢复，不能宣称那部分已经通过。

失败快照是诊断 force-stop 后的原始文件，**不声称是进程死亡瞬间的事务快照**。其生产方记录的三组 before/transfer/after hash 相等，且本地回读检查为 true：

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| tasks.sqlite | 40960 | `cad955e40ee536ea8018f9523da2f387e5596bfcf5a6b5d945cd1dbe7415b04d` |
| tasks.sqlite-wal | 4152 | `18d12d581b1524c89ed3e735da958bbda02e026600d78aea2d48c67041e23bc4` |
| tasks.sqlite-shm | 32768 | `73db88e3c7af7631f354f6a48916ffc69f95a0cbea35f153c42a55b97ec1ece3` |

以上二进制 hash 是云端保全证据的记录；本地审阅未打开、重放或运行 SQLite。journal 和 atomic result/json.bak/json.new 均记录 unavailable，没有伪造空文件或替代成功结果。

## 静态源码绑定与窄修正

`outputs/c0-07/evidence/edf-final-transfer/c007-final-source-bytes.json` 绑定 edf 的实际云端文件字节：

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| `tests/protocol-harness/android/run-android.mjs` | 24192 | `96d48dc0ee6f81d77da76284b4ee68b5b38c572c230d4ae9512c6b2bceb8cfba` |
| `tests/c006/c006-harness/android-runner.mjs`（基线） | 7512 | `9aa22bbfc01c7087edc4f57776ecc7ae6cb5614e396a8774e6f20b5f70e97106` |
| C006 候选 | 7788 | `53ce46518adc004979f8e8f95712e48b4a8bed0ad481c329a3625bbb631f3c9a` |

shared runner 第 295–307 行负责 instrumentation crash 重试；第 299 行在 main 的后续 attempt 改写 dbCase 为 `baseCase + '-retry-' + attempt`。这解释真实 receipt 中的换库，未对此 shared runner 做修改。

候选保存在 `work/c006-selected-db-contract/tests/c006/c006-harness/android-runner.mjs`。唯一变更为 operation 执行状态检查后插入两条断言：

```js
must(receipt?.dbCase===dbCase,'Android execution switched the selected database');
must(typeof result?.rawSQL?.databaseFile==='string'&&result.rawSQL.databaseFile.endsWith('/protocol-cases/'+dbCase+'/tasks.sqlite'),'Android result does not identify the selected database');
```

这会在任何 operation 被认可之前把最终 receipt 和结果数据库路径绑定到调用方指定的数据库，包含 observer 的独立 dbCase。缺失或不一致的身份字段均拒绝。原始 process/receipt 已在断言前保存，失败 case 仍会保留云状态与错误。此改动不增加生产重试、不处理/绕过租约，也不修改共享测试器的默认重试策略。

静态证据文件 `work/c006-edf-selected-db-contract-evidence-v2.json` 对旧运行 22 次 Android operation、95 个索引绑定输入进行比较（91 个 JSON/JSONL，加 4 份诊断/时区文本）：旧 operation 判断接受 21 次；两项新身份断言唯一新增拒绝为 A27 output 2。其 receipt 的 dbCase 与 rawSQL 路径都明确带 `-retry-2`。output 3 仍是原运行失败，不会被改判通过。该对照只是旧证据解析，**不计入新项目测试数，也不构成候选运行通过**。原版机器记录和诊断草稿分别保存在 `work/c006-edf-selected-db-contract-evidence.json` 与 `work/c006-edf-a27-diagnosis-v1.md`。

## 完整性锚点与验收状态

| 原始文本 | SHA256 |
| --- | --- |
| case.json | `6affd95b3e036f178e5fa89f0d83aba55ffea4c495c61dfe72f3378d604fe40e` |
| output-2.json | `1529572e8fd971ed2893bcd371d16065c5c10c25b0e0c41b5808e40f7a6e2ccc` |
| output-2.json.receipt.json | `62e6b415f849f22c245c0981f3c53018a67111c58f8e1bb2a3fafe35e26cb74d` |
| output-2.json.failures/main/evidence.json | `66218a936723e03465bdbb8138bd710146a5c3ae4de3858450491a88e415c2cd` |
| exit-info log | `3170685b8e45e8dccd2df0f0df131ff0e3e966b00e990e1e78284c36422d89cd` |
| logcat | `806fdc35f78294d42d60c79d2814cef8576d046ee21763f7da04b0b0d358aaa7` |
| HTTP requests | `414c283a5a24c2d3edbdd3a8b8dd82d4d2df2329d0d53ceca81609a8c7b2cb4c` |
| output-3.json | `88954734c3acc71f4d7f4c4bbfae96ff26fa19bb53f9fe11bcbe58ee97c93242` |
| output-3.json.receipt.json | `d25df79b21ec04a156ecf4b10ee4fdb6d2fbac295aa49ee73d870462a6ce0f47` |

独立证据审阅 `work/c007-edf-a27-local-text-integrity-review.json`（SHA `d0d0550cbe3e0653b2726481a531e64aed5375776b7cb5838f4d45ff139229b4`）核对 A27 全部 145 个 indexed local text，bytes/hash 145/145 匹配、0 failed。文本索引本身 SHA `2b81728c241d6727f9d9e4258071613a840c7938a068363691ae4783786e1d3d`。这证明所审阅字节与已归档文本索引一致，不替代运行语义或总传输闭合审核。

候选只完成文本修改和证据对照；没有进行本地 JS 语法检查、编译、项目测试、依赖安装或数据库执行。应由父 Agent 推送独立提交，在 GitHub 执行正式 core/kill/bootstrap 回归并收集该提交的证据。新增身份校验不会消除 GMS 环境终止，因此只有真实云端运行与证据完整性都满足验收条件后才能推进。当前 C006 关联验收仍未完成，D1 未启动。
