# C0-07 SQL、发布与 ACK 故障恢复

2026-11-23，Asia/Shanghai。状态：C0-07 在本文声明范围内限定验收。C005、C006 已在各自历史阶段独立验收并发布；本阶段关联回归另列如下。D1 未授权。

本阶段修复 Windows SQLite 读取失败被当作缺行、COMMIT 失败被忽略或被清理错误覆盖，以及 Node 事务回滚再次失败时原异常被覆盖的问题。生产提交 `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277` 仅修改 `windows/database.c`、`windows/sync.c`、`src/sqlite-store.mjs`。C005 凭据配置段、C006 create_manifest、协议验证和合并逻辑保持原字节；Android 生产代码未修改。

项目构建、语法检查、测试与依赖操作全部在 GitHub。仅使用合成数据；未访问真实坚果云、用户数据或真实凭据。本地只做源码文本、证据 JSON、文件长度与哈希处理。

## 真实红测、修复与复测

| 阶段 | 提交 / GitHub run | 实际结果与解释 |
| --- | --- | --- |
| 初始纯测试 | `4a8dd94f` / `45180141745` | 141 次宿主尝试、1,644 条检查、47 条失败。Node 55/601/0；Windows 76/1,023/27；Android 10/20/20。Android 十次只尝试 seed 入口，未完成业务、故障点或重开，不能称 141 次业务执行。 |
| Android 夹具修正 | `342464b0` / `45180939841` | 修正 asset import 和 pidof stderr 判定。排队运行被后续 push 自动替代，cancelled、jobs=[]、零执行；不是手动取消或通过。 |
| 首错与双异常探针补强 | `feb0dca3` / `45183273190` | 30 场景、187 次尝试、2,299 检查、33 失败。Node 56/620/2；Windows 76/1,027/31；Android 55/652/0。Node 真实 RAISE(ROLLBACK) 后再次 ROLLBACK 失败覆盖首错；Windows COMMIT/ACK 首错亦被清理覆盖。 |
| 三文件生产修复 | `f9ca0f1a` / `45186305189` | 187/2,299/3；Node、Android 全过。仅 Windows 三项 inspect 操作接受值测量失败：真实返回为 NULL、生产诊断正确，但测试将 NULL 包装为非空 cJSON null 后误判成功。 |
| 独立 inspect 夹具修正 | `de7ce40c` / `45190559178` | 三端任务和汇总 success；30 场景、187 次尝试、2,299 检查全部通过。仅保存包装前的 C 指针返回值，生产代码、场景和预期断言未改。详细独立审查见随附审查记录。 |
| 独立 Android 失败补采修正 | `edfde91e` / `45194185184` | C006 kill runner 仅三处文本变化，补采改用 failure-database，保留首次证据及原失败。2/2 真实中断恢复通过独立复核；成功路径未执行异常 catch，不宣称动态覆盖补采分支或修复启动稳定性。 |
| 补充 C006 核心回归 | `edfde91e` / `45194185453` | **failure，82/83**：Node 59/59、native suite 18/18、Android 5/6。A27 首进程因 FontsProvider 依赖死亡，shared runner 换新库重试；下一操作回原库遇到有效 lease，正确返回 busy 后测试失败。该失败永久保留。 |
| 独立指定数据库合同检查 | `19ceea62` / `45199685003` | C006 operation 新增两项身份断言，拒绝与指定 dbCase 不一致的 receipt 或结果路径。实际核心回归 success、83/83＝59＋18＋6；Android 24 次操作绑定指定数据库，含一次观察者 restart 首崩后同库恢复。生产代码、shared runner 与 lease 行为未改。 |

Windows 三项旧失败的字面检查名是 `010-row-prepare-denied:operation`、`011-row-step-overflow:operation`、`017-row-invalid-json:operation`；`:observer` 检查本身通过。旧首轮仍有真实生产首错/坏实体失败，inspect 修正不会将其追认为通过。

## 最终 C007 执行

| 平台 | 场景 | 操作尝试 | 普通结果 | 预期边界退出 | 新进程审计 | 检查 | 失败检查 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Node JavaScript | 10 | 56 | 53 | 3 | 56 | 620 | 0 |
| Windows C | 10 | 76 | 73 | 3 | 76 | 1,027 | 0 |
| Android | 10 | 55 | 52 | 3 | 55 | 652 | 0 |
| 合计 | 30 | 187 | 178 | 9 | 187 | 2,299 | 0 |

以上单位分开计数，187 次审计不叠加为额外业务操作。预期退出不等同普通成功返回。Android 真实进程死亡由 native marker、原 PID、同库路径、运行身份、系统退出及清理前 stdout/stderr 均空且退出码为 1 的 pidof 共同证明；宿主协议退出码 86 不冒充 Android 的系统退出码。

覆盖真实 SQLite prepare/step/COMMIT/触发器/deferred FK 拒绝、错误保留、事务结束、同库重开，以及请求续租、准备 pending、写入前拒绝、落盘后断连、ACK、cache/release 等边界。Node 双异常探针先确认首条 INSERT 实际存在，随后由第二条触发 RAISE(ROLLBACK)，生产代码保留原异常并附真实 rollbackError。Windows COMMIT 探针要求实际故障命中、拒绝操作、准确首错及同次原生码/日志证据，不靠合成异常通过。

网络测试分别核对服务端写前拒绝和持久化后响应丢失、pending 原字节重发、batch 去重、ACK through 范围和 later-event 保留。服务端为合成 HTTP/WebDAV 夹具。

## 回归门禁与源码关联

| 门禁 | 直接执行源 / run | 独立核实结果 |
| --- | --- | --- |
| 原项目基线 | `19ceea62` / `45199684912`；历史 `f9ca0f1a` / `45186305173` | 两次均为共享 TAP 121/121；Windows self 32、advanced 48、feedback 21，另 detailKey 48；Android 宿主断言 73/47/20；三端构建通过。Android 宿主断言不冒充设备测试。 |
| C005 DPAPI | `f9ca0f1a` / `45186305386` | 22/22，55 次子进程，14 次预期拒绝，零网络请求。同一 runner Windows 用户上下文，不推断跨用户解密。 |
| C006 核心历史回归 | `f9ca0f1a` / `45186305230` | 83/83＝Node 59＋native suite 18＋Android 6；408 次操作分别为 280/104/24。Android 24 次均有新进程同库重开，无首崩重试。native suite 的 kill 分支终止的是 JS 进程，随后由 native snapshot 接管，不是 native 进程强杀恢复。edf 历史 82/83 失败另列，不以此通过替代。 |
| C006 核心最终补强回归 | `19ceea62` / `45199685003` | 83/83；408 次操作按 suite 分组仍为 280/104/24。非 Android 的 384 次实际进程操作为 298 JS 与 86 native，因 native suite 内有 18 次 JS 协作。2,948 项 Node/native 静态证据比较全部一致；Android 3,544 项语义/身份/哈希核验无问题，24 次同库导出与新进程重开成立，原始首崩及审计失败按下文保留。 |
| C006 bootstrap/CAS | `19ceea62` / `45199685144`；历史 `f9ca0f1a` / `45186305576` | 两次均 4/4，23 次子进程，含两次预期拒绝和一次 SIGKILL。 |
| C006 Android 内部中断 | `19ceea62` / `45199685578`；历史 `edfde91e` / `45194185184` | 两次均 2/2；各 11 个唯一主进程 PID、9 次 force-stop、2 次目标 SIGKILL。A26 原库等待真实租约过期后恢复；A30 隔离原库，由新库新 actor 只读 snapshot 接管。 |
| 完整协议矩阵 | `f9ca0f1a` / `45186305196` | 78 个输入向量，936 个唯一执行、936 比较、702 producer lineage 全过；逐项结果和来源哈希关联均一致。Android 重试资格见下文。 |

云端读取精确 commit 的全部 682 个文件字节并计算长度/SHA256：f9→de7 只有 C007 worker 变化；de7→edfde91 只有 C006 kill runner 变化；edfde91→19ce 只有 C006 core Android runner 变化；每一步另 681 个文件字节相同。最终生产字节自 f9 起完全相同。C007 直接验证 de7，最后 C006 core、kill、bootstrap 和基线直接验证 19ce；其他门禁以其明确执行源及未变的生产/对应测试、脚本和 workflow 依赖关联最终源，不将旧 run 的 sourceSha 改写为最新提交。

附加基线 `45190559425@de7` 与 `45194185293@edfde91` 的 success 状态作为补充记录，不替代上述已详细审计基线。`45194185453@edfde91` 核心任务的 **failure、82/83** 原值与新 19ce 运行分别记录。旧 C003 workflow `45186305164` 仍为 failure，其 Android smoke 记录为缺少预装系统镜像、protocol blocked、wrapperExitCode 78；该失败不隐藏，也不计作上述完整矩阵通过。

## Android 原始失败与取证边界

f9 C006 kill `45186305462` 实际 2 执行、1 通过、1 失败。A26 在 initialize 首次启动即发生 `DEPENDENCY DIED`，系统明确关联 Google FontsProvider 依赖；四项数据库文件有效 missing。尚未执行 after-import 边界。首次导出抛错后 catch 重建相同目录造成次生 EEXIST。此次 edfde91 只修补采目录，无自动业务重试、无换库、原 error 仍重抛。绿路径本身不证明失败 catch 已动态覆盖。

f9 完整矩阵 Android 最终 312 条结果包含 7 次原始 instrumentation 失败：5 次主流程随后使用 `-retry-2` 新数据库路径，2 次 restart 重试保留原路径。共有 631 次 instrumentation＝624 次成功＋7 次原始失败。五次主流程失败中有两次原 DB 及 sidecar 全部 missing，取证 partial 保留。七例日志可直接串联 GMS 模块配置变动强制重启、同 PID SIG9、provider 依赖死亡；不能将这些证据外推到缺少同等日志的 A26，或宣称产品稳定性已修复。5 个新库重试不证明原失败库恢复。

C007 最终 de7 运行的 55 次操作均完成原库新进程重开，3 次目标 SIGKILL，110 个唯一主进程 PID，652 条检查全过；该 run 未见额外主进程 CRASH、ANR 或 DEPENDENCY DIED。三次自然死亡先用独立 pidof 证明原进程消失，再做 after-confirmed-natural-exit-stop 清理和导出，不能概括为全分支没有 force-stop。221 条 OS 退出含 110 主进程（107 force-stop、3 SIGKILL）和 111 WebView；WebView 109 reason13、2 EXIT_SELF，均标明 isolated-not-needed。

edf 历史核心失败 A27 的 initialize 使用原 actor `5dbf128a-d40c-481b-b09d-f4264f0df881`，revision 1、local-note/outbox 各 1。第二操作的原 PID 8502 在发出 HTTP 前死亡：日志串联 GMS 模块配置改变、com.google.android.gms.rcs 强制重启、GMS PID 1426 自行 SIG9，以及 FontsProvider 依赖死亡。shared runner 随后改用 `C006-A27-manifest-fail-retry-2`，actor `889d9cb6-cbcf-449a-8dfb-af9c8b0a2643`；10 条 fixture HTTP 均发生在新库重试之后。第三操作回到原库时 revision 2，仅有有效 lease 增加，原 actor、local-note/outbox 未变，因此返回 busy/more。新库的 HTTP 500 拒绝不能证明原库完成同一故障操作；该 case 未执行到租约到期后的原库恢复。独立提交 19ceea620d1f7c21d89e5c65f1aa9fcac437caaa 已为 C006 operation 增加 receipt.dbCase 与 rawSQL.databaseFile 必须匹配指定数据库的合同；未更改共享重试策略、租约或生产代码。后续云端运行已完成，结果与该历史失败分别保存。新运行没有触发错库拒绝分支，不能宣称动态执行了该拒绝分支。

19ce 核心回归的 A27 主库使用 actor `c7dc98bd-07e2-4b76-8ae0-e4d2013ddc37`。原库 manifest 写前 HTTP 500 拒绝后，下一操作在同一原库成功恢复：两条原事件各发布一次，outbox 清空，pending/lease 均为空。观察者 sync 主 PID 9613 成功后，首次报告模式 restart PID 9801 因 GMS persistent PID 4814 的 herrevad 模块变化、自发 SIG9 及 FontsProvider 依赖死亡而崩溃；restart-retry-2 PID 10258 使用同一 `C006-A27-manifest-fail-observer`、同一路径和 actor 成功重开，完整 meta/rows/outbox 一致。全轮 49 次 instrumentation＝48 成功＋1 首崩，无新库重试替换。失败导出保留原库 40,960 字节，另六文件明确 missing；采集在 diagnostic force-stop 之后，未重放导出数据库，不能称死亡时刻原子快照。

复用历史审计中的 `no-crash-and-export` 条件仍有一项真实失败：1,365 项检查中的 `android:C006-A27-manifest-fail:output-5.json:no-crash-and-export`，原 `auditPassed=false` 未改。补充语义审查的 3,544 项无问题与单列的一项 stabilityIssue 同时保留，支持指定数据库合同的限定验收，不表示无崩溃或启动稳定性已修复。静态证据比较数量不计入项目测试用例数。

issue #1 保持 OPEN；本阶段 SQL 修复和一次故障套件通过不关闭稳定性问题。

## 证据封存资格

所有原 ZIP、collector 退出码、失败记录和历史审计均保留。producer `sealed` 仅说明封存，不能代表测试通过。

最终 C007 原 collector 仍为 exit1 / evidenceComplete=false：114 个 `.stdout` 实为 SQLite 二进制导出，按严格文本归档策略未复制到本地；云端记录保留实际长度、SHA256、producer seal 和逐文件传输验证。本地独立审计核实 11,357 个文本文件、29,180,649 字节；12,117 producer 行中 11,342 行对本地原字节、775 行对云端哈希清单，无完整性矛盾。冻结审计器的 recordedRunPassed 因 collectorComplete 条件仍为 false；真实 execution.status=passed 和 2,299/2,299 是另一个字段。限定验收保留上述原始值。

C006 f9 与 edf core 各保留 24 个合成 `sync-config.enc` 排除，未读取/解密；baseline 保留五个无 producer manifest 记录，四个实际云端产物另行读取字节复算长度/SHA256并匹配原 receipt。DPAPI、bootstrap 和完整矩阵原 collector 为 complete。edf kill 的 collector exit1 / incomplete，16 个二进制排除；725 个本地文本、2,489,200 字节，857 个 producer 行＝754 本地字节＋103 云端哈希，库存核对零问题。最终报告引用具体资格，不能统称所有采集完整。

19ce core 同样保留 collector exit1 / incomplete 与 24 个合成凭据排除；本地 2,620 个文本（2,610 artifact 文件＋10 元文件）、37,464,530 字节，六份 manifest 的 3,127 行＝2,648 本地引用＋479 云端引用，库存核对无矛盾。19ce kill 保留 exit1 / incomplete、16 个二进制排除；本地 727 文本、2,492,676 字节，861 producer 行＝758 本地引用＋103 云端引用，库存核对无矛盾。19ce bootstrap 为 collector0 / complete；19ce baseline 仍为 collector1 / incomplete、五份缺 manifest，四份实际构建产物均在云端另行重哈希并与收据一致。

## 未覆盖范围

- full-sync business 比较排除 revision/lease/cache；lease/cache 另断言，revision 无精确期望断言。完整矩阵还排除 dataRevision/settings。
- snapshot/rebind 的全部 page/outbox/meta 故障、bind 直接 SQL、部分 bind/finalize、启动 meta 及所有 UI/import/export/undo 调用方，未逐一做端到端故障向量。部分保护只获静态审查。
- HTTP close/reopen 是同进程新 listener，不是独立服务器进程崩溃；SQLite API/事务故障不等同真实磁盘 I/O 错误、内部 fsync 点死亡或断电测试。
- 数据库取证为进程停止后逐文件副本，未重放导出副本，不等同跨文件原子快照或精确 crash-time 状态。
- 未验收真实坚果云、私人账户、发行 APK 安装/签名升级或全平台所有组合。

本阶段按上述边界完成限定验收，结构化结论及来源见同目录 verification 和 provenance。原始失败与采集资格不因验收改变；D1 保持未批准。
