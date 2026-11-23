# Android 稳定性风险

审查日期为 2026-11-24（Asia/Shanghai），受审 GitHub `master` 为 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。范围为阶段 0 Android 测试壳、实际进程退出、数据库身份、重试、故障后采集和发布约束。重新读取了该提交的仓库报告、独立审查、验证 JSON 和执行器源码，并逐条读取 8 个已有 Actions 运行中含首崩记录的 20 份原始收据，核对首次及最终数据库身份。本文属于静态证据复核，本轮没有新增稳定性运行。

GitHub issue #1 于本次审查从已认证的 Codespaces 实查为 `OPEN`，`closedAt=null`，更新时间为 `2026-11-23T12:39:03Z`。间歇性 Android 主进程异常终止在多个历史运行中存在，单轮的最终逻辑用例通过与启动稳定性是两个判定。原失败、受测提交、重试和采集资格继续分别跟踪。[Android instrumentation intermittent crashes: preserve failed original databases](https://github.com/johny751/MyTodo/issues/1)

## 发生了什么

表中的“同库重开”指设备上使用原 `dbCase`、原路径，且新 PID 读取到匹配的持久状态。“换库重跑”指业务 main 首败后取得新 `-retry-2` 数据库的结果。“原库保全”指停止进程后的文件采集，目录身份和逐文件长度/哈希来自取证回执。只有同库恢复测试才能支持原设备数据库的具体恢复结论。无有效原子结果只证明调用没有提交结果文件，其此前 SQLite 事务的状态可能未知。

| 云端运行和受测源码 | 首败、终止或阻塞 | 重开、重跑及结论 |
| --- | --- | --- |
| [45117818661](https://github.com/johny751/MyTodo/actions/runs/45117818661) · `d02e416f6f353eb018a72446d4851722f2f956c6` | C0-03 旧 Windows runner 缺预装系统镜像，Android 234 个位置阻塞，未运行 Android 存储路径。 | 历史环境阻塞，无首败重试或同库结果可计。 |
| [45137698063](https://github.com/johny751/MyTodo/actions/runs/45137698063) · `0dcf37d6692f7fc7b0b3b3f0138a2be733a9bff5` | C0-04 首次实际三端矩阵。两次 `Process crashed`，分别为 `actor-invalid-punctuation` 生成后的 restart、`tombstone-concurrent-edit` 接收 Android 样本。整轮执行 931 通过、2 失败、3 跳过，比较 929/4/3，最终阶段退出 1。 | 原失败和缺少有效根因日志的限制保留。 |
| [45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501) · `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc` | C0-04 最终 936/936 执行、936/936 比较。4 个 Android 格子首崩，ADB 和 instrumentation 均返回 0，无有效原子结果。 | 分片 1 `actor-length-80` 自产自收为同库 restart，成功 main PID 8043、最终 restart PID 8548。分片 2 `id-empty` 接收 C、5 `id-ascii-200` 接收 JS、6 `key-array-type` 接收 C 为 3 次 main 换库重跑；第二次成功，无第 3 次日志。从归档索引和当时执行器得出的分类，原始失败 main 只有清单索引，未见独立原库导出。 |
| [45154587042](https://github.com/johny751/MyTodo/actions/runs/45154587042) · `2114f152e23b432dbf2df798464094c116bb57e1` | C0-05 生产修复后的三端矩阵，3 次首崩，矩阵最终通过。 | `actor-invalid-punctuation` Android 生成、`key-malformed` 接收 C 为 2 次新库重跑，`key-array-type` 接收 JS 为同库 restart；后者原路径与成功进程的重启比对通过。 |
| [45158226276](https://github.com/johny751/MyTodo/actions/runs/45158226276) · `648f550812a18ad203aa32ebabc06625bcb24c0d` | C0-05 最终矩阵有 Android `id-empty` 生成、`key-array-type` 接收 JS 两次 main 首崩。 | 两次均换新库重跑后通过。报告中的 JavaScript 标签指输入样本来源，执行器均为 Android。未重放首次失败原库。 |
| [45161452258](https://github.com/johny751/MyTodo/actions/runs/45161452258) · `3ed91b240e98f69ceed851a22663c6a949d6ebfe` | 2 次 main 首崩，`tombstone-late-old` 和 `id-ascii-200` 均接收 Android 样本。旧采集器把 14 份 `cat` 错误文本标成 `preserved`，其中两个所谓主库只有 112/106 B。 | 两次均用新库重跑。原记录保留，错标文件不能用于恢复判定。修正后的采集验证另见下文。 |
| [45170150079](https://github.com/johny751/MyTodo/actions/runs/45170150079) · `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | C0-06 最终 core 83/83，A27 observer 的 restart attempt 1 首崩。 | 同一 `C006-A27-manifest-fail-observer` 重试，最终 main/restart PID 9526/10264，重启比较通过。原库、空 WAL、SHM 和空 AtomicFile .new 有独立采集回执。完整根因未确认。核心 collector 原值 exit 1 / incomplete，24 个合成凭据项排除。 |
| [45170150060](https://github.com/johny751/MyTodo/actions/runs/45170150060) · `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | C0-06 最终全协议矩阵 936/936 执行、936/936 比较、702 条来源。Android 312 条逻辑结果中 3 次首崩，系统均记录 FontsProvider 依赖死亡。 | 分片 3 `actor-invalid-punctuation` 与 5 `key-swapped` main 换库重跑，分片 5 原库及 sidecar 等 7 个目标有效 missing。分片 6 `id-ascii-201` restart 同路径，PID 7131/7768，持久状态一致，无导出副本重放。 |
| [45170150057](https://github.com/johny751/MyTodo/actions/runs/45170150057) · `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | C0-06 正式验收的 Android 内部中断 2/2。 | 两次目标进程终止分别验证 A26 原库恢复和 A30 新库接管。本轮 collector 原 exit 0 / complete，859 条清单含环境记录。[C0-06 强杀独审](../c0-06/audit/final-kill-evidence-review.md) |
| [45186305462](https://github.com/johny751/MyTodo/actions/runs/45186305462) · `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277` | C0-06 A26/A30 关联强杀回归 1/2，A26 在未到目标边界的 initialize 首崩，PID 3421 依赖 FontsProvider 的系统退出明确。 | 原库、WAL、SHM、journal 四个探测有效 missing。随后导出断言失败，异常采集发生次生 `EEXIST`。后续修正的是补采目录，原失败保留。本轮 A30 通过独立新库接管。 |
| [45186305196](https://github.com/johny751/MyTodo/actions/runs/45186305196) · `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277` | C0-07 关联全协议矩阵 936/936 执行、936/936 比较、702 条来源。Android 631 次 instrumentation 中 624 成功、7 次首崩，均有相关系统日志。 | 5 次 main 换库、2 次同库 restart。两个原主库及 sidecar 全部 missing 的记录为 partial，分别是分片 3 `actor-invalid-punctuation` 生成及分片 7 `id-cjk-66` 接收。其它保存的采集记录保留 `originalDatabaseReplayed=false`。 |
| [45180141745](https://github.com/johny751/MyTodo/actions/runs/45180141745) · `4a8dd94f7fbceeb0583c37cc7aefdb29e9937691` | C0-07 首轮 Android 10 个 seed 均超时，只有 20 条失败检查，没有业务完成回执。 | 入口 APK 资源名称不匹配有证据，现有存档未能确定逐例进程终止次数。超时不归为已知 GMS 依赖死亡，目标 SQL、发布/ACK 和重开未取得验证。 |
| [45190559178](https://github.com/johny751/MyTodo/actions/runs/45190559178) · `de7ce40ccac3e963108a3a9af7c875186f822cce` | C0-07 最终三端 2,299/2,299。Android 55 次动作、55 次原路径新进程重开、652 条检查、3 次预定 SIGKILL。 | Android 独立核对 110 个不同主 PID。该轮已采集记录中未见额外主进程崩溃、ANR 或依赖死亡。collector 原 exit 1 / incomplete，114 条二进制 stdout 仅对照云库存。 |
| [45194185453](https://github.com/johny751/MyTodo/actions/runs/45194185453) · `edfde91eba174f9f8c20657ded4657c8841d0f83` | C0-06 补充核心回归实际失败 82/83，Android 5/6。A27 原 main PID 8502 在任何夹具 HTTP 前因 FontsProvider 依赖死亡。 | 随后新 dbCase/actor 发出 10 次请求并取得预期拒绝，第三操作回原库因有效租约返回 busy/more，状态与原 outbox 保持。该运行未执行到原库租约到期的恢复。 |
| [45199685003](https://github.com/johny751/MyTodo/actions/runs/45199685003) · `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa` | C0-06 最终关联核心 83/83。Android 24 次原路径重开，49 次 instrumentation 中 48 次成功、1 次 A27 observer restart 首崩。 | observer PID 9801 首次失败，PID 10258 同路径、同 actor、同 meta/rows/outbox 成功重开。A27 原主库的 manifest 写前 500 后同库重新发布也另有证据。原 no-crash 判据的一项失败保留，3,544 条独立静态证据核验另记 stabilityIssue。 |
| [45199685578](https://github.com/johny751/MyTodo/actions/runs/45199685578) · `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa` | C0-06 最终关联强杀 2/2，两个预定 SIGKILL。 | A26 导入真提交后强杀，原库重开保留六条原事件，实际等待租约到期后发布，每条一次。A30 manifest 实际 201 后强杀，原库隔离，独立新库只发 GET manifest 和 snapshot 后接得五条状态。这是新库接管；新 actor 的 outbox 为零。该轮未见额外主进程首崩。collector 原 exit 1 / incomplete 含 16 条二进制排除。 |

上述表格按运行分开记录，同一个协议向量在多个运行重复出现。用例、检查、进程、预定杀进程和首次意外退出各用各的计数。没有以这些不同分母估计真实设备的故障率。

仓库出处包括 [C0-03 协议报告](../protocol-compatibility.md)、[C0-04 发布状态](../c0-04-status.md)、[C0-05 报告](../c0-05-report.md)和 [C0-05 验证 JSON](../c0-05-verification.json)。后续来源见 [C0-06 核心独审](../c0-06/audit/final-core-evidence-review.md)、[C0-06 矩阵独审](../c0-06/audit/final-matrix-evidence-review.md)、[C0-06 验证 JSON](../c0-06/reports/c0-06-verification.json)、[C0-07 验证 JSON](../c0-07-verification.json)及 [C0-07 独立复核](../c0-07-final-independent-review.md)。

## 根因证据的边界

- **直接系统证据。** `45186305196` 的 7 次、`45194185453` 的 A27 main、`45199685003` 的 A27 observer restart 都有同一 PID 在系统日志中经历 GMS 模块配置变化、GMS persistent 自发 SIG9、原 provider 进程消失、ActivityManager 因 FontsProvider 依赖死亡终止测试进程的链路。最新 observer 个案是 GMS PID 4814 与测试 PID 9801，关联 herrevad 模块变化。该链路证明所列尝试的近因，上游触发配置变化的原因、复现条件和正式应用在真实设备上的影响仍未确认。[七次首崩的系统证据](../c0-07-evidence/c007-f9-matrix-android-crash-review.md) · [edf A27 诊断](../c0-07-evidence/c006-edf-a27-diagnosis.md) · [19ce A27 独审](../c0-07-evidence/c006-19ce-core-android-final-review.md)
- **仅有系统归类。** `45170150060` 三次和 `45186305462` A26 的 `exit-info` 支持 `DEPENDENCY DIED` 及 FontsProvider 依赖。特别是 A26 没有同时段完整系统缓冲和对应 GMS 退出记录。测试壳生命周期、WebView renderer、宿主系统调度/资源状态、SQLite/桥接错误均需按实际记录定位。空的 crash buffer 与 ADB 退出 0 不排除系统终止。早期 C0-04 的空 crash-buffer 和图形报错不能单独归因，也不能借用晚期机制回填早期根因。[C0-06 矩阵独审](../c0-06/audit/final-matrix-evidence-review.md) · [A26 原始失败](../c0-07-evidence/c007-f9-c006-a26-failure-review.md)
- **故障现场的采集质量。** 采集器修正使用 nonce 回执、源文件类型和前后大小/SHA256、目标回读和主库头检查。云端 [45168051257](https://github.com/johny751/MyTodo/actions/runs/45168051257) 实际 10/10，主 artifact 缺清单，collector exit 1 / incomplete。后续 [45169951082](https://github.com/johny751/MyTodo/actions/runs/45169951082) 在 `8ce0a047ec14925e08072129e4fd13b372e2e084` 实际再执行 10/10，240 条 producer 清单验出，collector exit 0 / complete。这两轮验证采集工具，逐文件完整性既不能证实崩溃瞬间的跨文件原子状态，也不能替代原库重开。二进制的云端回执与本地文本索引分别记录。[已核验的 issue 更新](https://github.com/johny751/MyTodo/issues/1#issuecomment-7101431544)
- **身份检查和处理范围。** 共享测试器允许 main 崩溃后启用隔离的新 fixture，restart 重试沿用当次运行选择的 `dbCase`。C0-06 核心在审查版本第 35–36 行新增 receipt 与 native 返回路径两处绑定，对选择错库的结果拒绝验收。19ce 的实测证明成功判据可在正确库上满足，错误库分支没有动态触发。目标 SIGKILL、系统异常死亡、测试壳 cleanup force-stop 和 A30 新库接管分别统计。[共享测试器](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/tests/protocol-harness/android/run-android.mjs#L295-L325) · [C0-06 核心 Android 执行器](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/tests/c006/c006-harness/android-runner.mjs#L33-L41) · [19ce 强杀独审](../c0-07-evidence/c006-19ce-kill-final-review.md)

## D1 与正式发布

对 D1，issue #1 是 Android 数据写入场景的高风险未决项。负责人批准后，可以先做隔离设计、合成夹具、证据采集和云端稳定性诊断。任何触及 Android 生产库迁移、游标、ACK 或 outbox 的实现要先建立原库身份强制校验、首次失败保全和可复现回归的门禁。在门禁未满足时，仅因重试成功无法接受丢失原库证据的风险。用户私有云数据、真实 LAN 与 WebDAV 双目标交付、真实设备推广、签名 APK 升级应按独立准入前置判断。

正式发布需要确认生产包的启动、恢复及升级行为。现有独立应用 ID 的模拟器 instrumentation、测试签名构建与 unsigned 构建产物不能代替正式 APK 的安装及覆盖升级证据。应在受控 Android 设备矩阵内验证冷启动、前后台交替、系统更新/杀进程、待发队列恢复和长期同步，另外核实发行签名与升级链。无法定位的意外进程退出、原库持久状态缺失或可重复的数据不一致都应阻止发布。

| 优先级与阶段 | 待验证内容与建议通过条件 |
| --- | --- |
| P0，批准后且进入 Android 持久化/同步开发前 | 用现有 A27、四个 C0-04 原首崩格子和 A26 initialize 在 GitHub 云端做当前基线定向启动。提前登记运行上限、样本量和判据。建议每种目标 runner/镜像至少 30 次独立首次尝试，记录首次成败，自动重试结果另列。记录 runner、系统镜像、GMS/WebView 版本、app PID/actor/dbCase、单调时钟、native SQL 与结果写入阶段。首次失败缺诊断、证据混到新库或出现状态差异时中止该门禁。保留历史并报分母。 |
| P0，允许 Android 数据写入前 | 在受控场景对照 GMS 启动/更新时机，一次改变一项变量，捕获 system/events/main/crash 和 ApplicationExitInfo 的关联 PID 与时序。测试报告模式同库重开、未完成 main 后同库操作以及真实错误库回执拒绝。独立验证租约 busy → 到期恢复，精确比较 rows/meta/outbox/pending/cursor，确保合法旧事件没有重复或消失。 |
| P1，D1 开发中 | 在云端隔离测试环境增加多客户端并发、长离线、旧版本与新版本混用、重试接续和可重复脱网/系统进程终止。逐目标检查 ACK 与投递，对发现的差异留独立失败样本。模拟器强杀事实与断电/fsync 证据分别记录。 |
| P0，正式发布前 | 通过 GitHub 云端编排且经负责人批准的独立真机环境，使用候选发行包验证冷启动、覆盖升级、应用数据保留、进程终止后原库恢复与长期运行。提交签名/版本/编译时间对应的受控核验记录。对同一已确认机制保留修复前后的可比复现及首轮统计，原失败归档保留。负责人据证据决定 issue #1 是否关闭，当前审查维持 OPEN。 |

实际测试的数值全部来自表中既有云端运行。上表的门槛、影响和优先级是审查建议，尚无项目负责人授权 D1 或完成相应验证。
