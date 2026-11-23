# 最终三端矩阵证据独立复核

复核日期：2026-11-23（Asia/Shanghai）。范围仅为已下载的 GitHub 文本证据与本地源码文本的读取、计数、静态比对及 SHA256；没有在本地运行项目、测试、构建、安装依赖、ADB 或联网。

## 结论

Run `45170150060`、attempt `1`、source `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` 的最终矩阵有 **936 条实际执行的逻辑用例记录，936 条唯一跨端比对记录，最终均 passed**。逐条执行记录与各阶段原始 summary、对应命令和结果文件 SHA256 一致，未发现缺失结果文件或重复 ID。936 是矩阵逻辑执行数，内部重启和失败重试另有命令证据，不等于操作系统启动进程次数。

**这不表示所有 Android 首次尝试都成功。** 312 份 Android receipt 保留了 3 次首次进程异常：两例换新 `dbCase` 重试，一例同路径重启后状态一致。下文保留原始失败与采集局限。

本地归档清单 **13,437/13,437** 条通过路径安全、路径唯一性、存在性、字节数和 SHA256 复核，共 `109,522,111` 字节。18 份生产者清单合计 **15,604** 行与云端库存逐项匹配。2,195 个二进制等文件留在云端，本复核只验证其清单/库存一致性，没有重新读取本地二进制原件。

## 身份与归档完整性

证据根目录为本报告同级 `evidence/45170150060/`。主要来源：`github-run.json`、`collection-summary.json`、`text-archive-files-sha256.json`、`all-files-sha256.json`、`verified-payloads.json`，以及 `artifacts/` 中各阶段证据。

- GitHub 记录的 workflow 为 `MyTodo C0-04 three-platform production protocol matrix`，conclusion 为 `success`。所有 18 个 artifact 的 workflow run ID 和 head SHA 一致。
- 桌面、8 个 Android 分片、complete 共 10 份阶段 summary 的 source/run/attempt 一致；各自 `git-head` stdout 也是完整 `1b9c41...`；`trackedSourceDiffExit=0`。
- 云端采集器 exit `0`、`evidenceComplete=true`、`failures=[]`，`projectTestsExecutedByCollector=0`。这些是采集器记录，不能替代下面的本地独立复核。
- 库存 `15,622` 文件 = `15,604` 个生产者清单项 + `18` 个清单文件本身；没有其它未列入生产者清单的产物。
- `13,409` 个生产者文件已包含本地文本 + `18` 个清单 = `13,427` 个产物文本；再加 `10` 个采集元数据，文本清单为 `13,437` 行。磁盘共 `13,438` 文件，额外一个是文本清单本身。
- 全部生产者清单项的路径、字节数与 SHA256 均与库存相同；本地部分又与已逐文件哈希验证的文本清单相同。complete 对 desktop 和 8 个 Android 分片的 9 个依赖 manifest SHA 引用均与实际本地 manifest 相同。

| Artifact 类别 | 生产者清单行 | 已在本地重验的文本 | 云端文件 |
|---|---:|---:|---:|
| Android 环境分片 0–7 | 339 | 339 | 0 |
| Android 用例分片 0 | 1,205 | 1,020 | 185 |
| Android 用例分片 1 | 1,205 | 1,020 | 185 |
| Android 用例分片 2 | 1,202 | 1,017 | 185 |
| Android 用例分片 3 | 1,258 | 1,064 | 194 |
| Android 用例分片 4 | 1,208 | 1,020 | 188 |
| Android 用例分片 5 | 1,225 | 1,043 | 182 |
| Android 用例分片 6 | 1,123 | 949 | 174 |
| Android 用例分片 7 | 1,094 | 924 | 170 |
| complete | 1,504 | 1,311 | 193 |
| desktop | 4,241 | 3,702 | 539 |
| 合计 | **15,604** | **13,409** | **2,195** |

## 936 条执行与比对的实数核对

`artifacts/c004-complete-45170150060-1/summary.json` 的 `allExecutions` 实际数组长度为 936，唯一 ID 数为 936；每项 `executed=true`、`status=passed`、`processExitCode=0`。独立汇合各子阶段 `executions` 得到同一 936 项，关键字段逐项相同，每项都有同名命令且 exitCode 为 0，每个 `result.json` 的 SHA256 都与 `outputSha256` 相同。

| 阶段 | 实际执行条数 |
|---|---:|
| desktop | 468 |
| Android shard 0–5 | 每片 40，共 240 |
| Android shard 6–7 | 每片 36，共 72 |
| complete | 156 |
| 合计 | **936** |

独立构造 78 个 case ×（3 个平台生成 + 3 个来源 × 3 个接收平台）预期 ID 集合，得到 234 个生成与 702 个接收执行，与实际集合完全相等，无缺项、多项或重复。

`comparisons` 实际数组长度与唯一组合键数都为 936。按每个 case 的三组平台配对生成比较，以及三个来源各三组接收平台配对，独立构造的预期集合与实际完全相等：生成比较 234、接收比较 702。936 项全部 `semanticEqual=true`、`stageAcceptanceEqual=true`、`wireEventsAndPendingBytesEqual=true`，raw batch 分类全部 `identical`；差异数组均为空，左右结果引用均有效。

702 条 `producerLineage` 全部 passed；每条 expected/recorded producer SHA 相同，且与生成执行的实际结果 SHA 一致，接收执行引用均存在。上述是归档结果的独立静态复核，没有在本地重新执行比较器。

suite 共 78 cases，所有阶段记录相同语义 SHA：

`81f5826501b5a966df96798a7aa0cfb5fea0a4d661994c54520b8403443137f9`

Linux suite 原字节 SHA 为 `1c61ca9b19493486b4cc1471606255ea90fcd60ad7b4a237e3b0d521ed39eebc`，Windows 为 `3d24f6ff5f7d80ea84a9adba360d561b0fecca306fdfccdf4010d2afb4e85c20`。读取已有 C0-04 `core/tests/protocol-vectors/suite.json`，原件恰为前者；仅在内存中将 LF 换为 CRLF 后 SHA 恰为后者。此差异已精确对应换行，不是套件内容变化。

## Android 首次异常与重试

以下路径都以 `evidence/45170150060/artifacts/` 为前缀。312 份 `result.json.receipt.json` 全部最终 passed，source/run/attempt 一致，restart 状态全部 passed；其中仅下列 3 份有非空 `crashedAttempts`，每份 1 次。

| 分片与 case | 首次异常 | 后续成功使用的库 | 首次失败取证 |
|---|---|---|---|
| shard 3 `actor-invalid-punctuation--receive--android--android` | main attempt 1 | `actor-invalid-punctuation--receive--android--android-retry-2` | recorded；原 SQLite/WAL/SHM 已在云端保全 |
| shard 5 `key-swapped--receive--android--javascript` | main attempt 1 | `key-swapped--receive--android--javascript-retry-2` | partial；原库未保全，7 个目标全部 missing |
| shard 6 `id-ascii-201--generate--android` | restart attempt 1 | 同一 `id-ascii-201--generate--android` 路径 | recorded；原 SQLite 已在云端保全 |

三个异常的 instrumentation 原文均为 `shortMsg=Process crashed.`、`INSTRUMENTATION_CODE: 0`，ADB exit 0；receipt 原因均为 `Process crashed with no valid atomic result`。所以不能只看 ADB 退出码判断用例成功。三个 crash-buffer 日志为空，最近的 harness exit-info 分别记录 PID 8249、9478、7345、reason `12 (DEPENDENCY DIED)`，描述为依赖 `com.google.android.gms/.fonts.provider.FontsProvider` 所在的 `com.google.android.gms.persistent` 进程退出。这支持当次系统依赖退出的诊断，不能据此泛化产品代码根因、断言没有其它缺陷或删除首次失败。

三份取证 JSON 位于：

- `c004-android-shard-3-45170150060-1/cases/actor-invalid-punctuation--receive--android--android/result.json.failures/main/evidence.json`，SHA `f26566407dcf3b78896fd44fc0e13043b7b5ffd4d0465cb7d0e29cae5a67600d`。
- `c004-android-shard-5-45170150060-1/cases/key-swapped--receive--android--javascript/result.json.failures/main/evidence.json`，SHA `391fc17608fa483d60bce84a75cd704794315512356536e5909af0174116d6f1`。
- `c004-android-shard-6-45170150060-1/cases/id-ascii-201--generate--android/result.json.failures/restart/evidence.json`，SHA `10a47c4f75ed01d4a1c4a08e9a645cee095da05ff99aba5295dd8e8ecf86e0b7`。

三份本地 JSON 的 SHA 与 receipt 引用一致；50 条 observation 日志逐条 SHA 匹配；25 个文件 probe 的命令 nonce 与日志首行六字段回执逐个匹配。4 个 preserved 文件的 remote-before、transfer、remote-after 字节数/SHA 完全一致，且 `sourceStable`、`transferMatchesRemote`、`localReadbackVerified` 为 true；两个主 SQLite 文件 `sqliteHeaderValid=true`。这些是已验文本中的云端采集凭据，未将云端二进制冒充成本地重验。

| 原始文件 | 字节数 | 云端保全 SHA256 |
|---|---:|---|
| shard 3 `tasks.sqlite` | 12,288 | `7ff254d0437c03c9e415581d181473fa17d17d76d905b8098b5fb088d8c2242d` |
| shard 3 `tasks.sqlite-wal` | 94,792 | `b59e47003c54f161212137556ddf76df67f6e0182bdb94a7c75afebc99339c1a` |
| shard 3 `tasks.sqlite-shm` | 32,768 | `f8ac61f48833618d7ebbeeb479b506558f22e0dfee2a7ace6497e67569dd8a1a` |
| shard 6 `tasks.sqlite` | 40,960 | `a64253c970602b42244ada58ba3ba0a9e8f775cf1e493265d588b0a3a7a30754` |

shard 3 与 shard 5 的最终通过来自新 `-retry-2` 数据库，不证明首次异常原库恢复。shard 6 主执行 PID 7131、成功重启 PID 7768，main/restart 的 `databaseFile` 路径相同；restartComparison 对 meta、metaJSON、rows、outbox、accountRegistry、databaseFile 均通过。因此可以表述为“同路径重启后状态一致”，不能表述为“采集出的原库副本已被重放恢复”。

三份取证均明确 `originalDatabaseReplayed=false`、`mainProcessObservedStopped=true`，且 `snapshotSemantics` 为诊断 force-stop 后原始文件，不主张崩溃瞬间事务状态。逐文件 before/after 稳定性也不构成跨 SQLite/WAL/SHM 文件的原子快照。shard 5 的 `allObservedFilesVerified=true` 只表示 missing 状态的观察得到验证；`originalDatabasePreserved=false` 和 partial 仍然有效，不能把缺失解释为保全成功。

## 边界与证据指纹

矩阵自身 coverage 明确 `actualPublishAckFault` 尚未执行、留待 C0-07；当前生产 schema 没有独立 receipt table。936 比较还明确排除了跨平台 revision、dataRevision、settings、lease、cachedManifest；不能把比对通过扩写成所有内部元数据完全相同。C0-05、C0-06 核心/kill/bootstrap/DPAPI、独立 Android 采集器验证及未来 C0-07 的结果应分别报告。

已有本地采集器输入文本的 helper SHA 为 `41613ce991718a0c1cf03f2f7747d43598e5b0ab3cf081f811e0d3af08a0c350`，runner SHA 为 `96d48dc0ee6f81d77da76284b4ee68b5b38c572c230d4ae9512c6b2bceb8cfba`。此处已重新哈希本地输入副本；本 run 归档没有单独存放这两个源码文件，不能把输入副本哈希称为 run 内源码实物哈希。run 内实际 probe 命令、nonce、回执、source identity 和构建回执另有上述验证。

| 文件 | SHA256 |
|---|---|
| `text-archive-files-sha256.json` | `87c9e5e6998c1619abe6a98b1f036ba5f5ad0c3b0a18b021ed060f7fcb36e9fb` |
| `all-files-sha256.json` | `d8a8f0d16abac53d7d24ab54667fd48d4641945a82ff8ef475584073cfee58d9` |
| `collection-summary.json` | `a92684764b4ec5b598f2a138f7dc57cbe2d3fca198a138b7e3e194f220aa79e7` |
| `verified-payloads.json` | `624f9de0bf06414a8475626494ac8de15cc0a7f458611f6e1aa11e7d61096a2c` |
| `github-run.json` | `3c74443bae284eebfe5817974af99d58e8ada2cdea64a50adfda050b2c1e11f1` |
| complete `summary.json` | `79608ecaee2e91ddaeee1e0e84b5f75c3323c3fc086dfbb16c23278cad4c0089` |
| complete `payload-sha256.json` | `41adcd5162ba2d83b82b98d542db7b1ee3a42c7fe960c2bd964dbf39dee03d60` |

父 Agent 下载记录给出的传输 ZIP SHA 为 `5ef91925ce3256254e338361e34329cae3f76d2be931796b10ebee02c82f6eee`；此项引用交接记录，本复核未重新哈希 ZIP。归档内所有文本文件的独立哈希验证结果见上。
