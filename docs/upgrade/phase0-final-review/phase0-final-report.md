# MyTodo 阶段 0 总体验收报告

审查日期 2026-11-24（Asia/Shanghai）。审查基准为 `johny751/MyTodo` 的 `master` 提交 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。范围涵盖 C0-03 至 C0-07、当前生产源码与测试身份、同步及持久化边界、Android 稳定性和 D1 准入。

C0-03 至 C0-07 的既有证据支持各阶段的限定技术验收。C0-03 自己的历史协议运行仍是失败，后来由 C0-04 同一轮完整矩阵补足三端执行和修复证明。阶段 0 的限定结论保留 Android 首崩、换库重试、采集不完整和发布限制。D1 建议为 `CONDITIONAL-GO`，仅限负责人明示批准、满足准入条件后的隔离设计与合成验证。

报告所引仓库材料从 Codespaces 核实的当前 `master` Git tree `e7db82447dd94cfc2881e0c91191099a7b14ff44` 取回。快照 ZIP 的 SHA-256 为 `02a7070226f8ca9ae67ce426b7073520574a692612f6aa56f4c3e63fffe24f25`。本次逐件复算阶段引用的 Git blob 和 SHA-256，以旧收据和独审补充仓库摘要未列出的细节。机器可读的引用锚点、计数和证据限制见 [verification.json](verification.json)。

## 各阶段验收

| 阶段 | 验收状态与受测源码 | 已执行结果 | 证据采集与独立结论 |
| --- | --- | --- | --- |
| C0-03 共同协议向量 | 通过 C0-04 的同一次矩阵完成限定验收。直接记录的历史源码 `d02e416f6f353eb018a72446d4851722f2f956c6` 仍失败。 | [45117818661](https://github.com/johny751/MyTodo/actions/runs/45117818661) 实际桌面执行 462 个位置（460 通过、2 失败），另 240 个执行位置阻塞。比较 190 通过、38 失败、474 阻塞。闭环见 [45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501)。 | 原运行 exit 1。下载命令 exit 0，独立取得的 9,511 个 payload 摘要匹配；后者是证据核验。Android 历史 run 未执行真实存储，仍标记 blocked。 |
| C0-04 三端协议修复 | 限定验收，直接受测 `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc`。 | [45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501) 在 78 个向量上完成 936 个执行、936 个比较，最终失败、阻塞、跳过均为 0。702 条来源关系得到核对。Android 312 个位置均通过实际重启和 SQLite 持久审计，保留四次原始首崩和重试。 | 原矩阵 exit 0。旧 collector 记录六条取证和汇总命令均 exit 0，无现行格式的单独 `collectionExitCode` 字段。18 份产物 15,547 条摘要在 Codespaces 复算，报告按逐格结果闭合 C0-03 旧失败与 C/JS 阻塞。 |
| C0-05 DPAPI 凭据互操作 | 限定验收，直接受测 `648f550812a18ad203aa32ebabc06625bcb24c0d`。 | [45158226148](https://github.com/johny751/MyTodo/actions/runs/45158226148) DPAPI 22/22。同源 [45158226161](https://github.com/johny751/MyTodo/actions/runs/45158226161) 三端基线成功，[45158226276](https://github.com/johny751/MyTodo/actions/runs/45158226276) 936 个执行和 936 个比较通过。 | 凭据与矩阵 collector 均 exit 0 / complete；基线 collector exit 1 / incomplete，五处缺递归清单，四个实际云端构建产物补充哈希核验。独审确认同 runner 用户上下文的双向互读与原文件保持，保留矩阵两次 main 首崩随后换库。 |
| C0-06 旧 WebDAV 迁移恢复 | 限定验收，直接受测 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`。 | 主矩阵 [45170150079](https://github.com/johny751/MyTodo/actions/runs/45170150079) 83/83，Android 内部强杀 [45170150057](https://github.com/johny751/MyTodo/actions/runs/45170150057) 2/2，bootstrap/CAS [45170150092](https://github.com/johny751/MyTodo/actions/runs/45170150092) 4/4，原三端基线 [45170150066](https://github.com/johny751/MyTodo/actions/runs/45170150066) 含共享 JS 121/121。完整矩阵 [45170150060](https://github.com/johny751/MyTodo/actions/runs/45170150060) 936 执行、936 比较、702 来源。 | 核心 collector exit 1 / incomplete（24 个排除的合成凭据），基线 exit 1 / incomplete（五份产物缺递归 seal）。强杀、bootstrap、矩阵均 exit 0 / complete。独审分开判定原库续接与新库接管，保留核心一次同库 restart 首崩及矩阵三次首崩。 |
| C0-07 SQL、publish 与 ACK 故障传播 | 限定验收，直接受测 `de7ce40ccac3e963108a3a9af7c875186f822cce`，三文件生产修复来自 `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277`。 | [45190559178](https://github.com/johny751/MyTodo/actions/runs/45190559178) 30 个三端场景，187 次尝试，2,299 项检查均通过。同生产字节、更晚测试契约的核心回归 [45199685003](https://github.com/johny751/MyTodo/actions/runs/45199685003) 于 `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa` 为 83/83。 | 故障套件原 collector exit 1 / incomplete（114 个二进制 stdout 排除），原 `recordedRunPassed=false` 保留。独审确认 `executionStatus=passed` 和证据关系，并保留较早核心回归 82/83 失败与后续同库 restart 首崩。 |

本表的事件执行位置、比较位置、场景、操作尝试、进程、应用断言和静态证据审计采用不同计数单位。相同 run 在多个阶段出现只记为同一证据，不加总。没有定义统一比较格子的专项在机器记录中使用空值，进程数与明细审计数也独立保存。

## C0-03 与 C0-04：历史失败到完整矩阵

- [45112980707](https://github.com/johny751/MyTodo/actions/runs/45112980707) 和 [45116193790](https://github.com/johny751/MyTodo/actions/runs/45116193790) 各为 72 个向量。每轮 424 个执行位置通过、2 个失败、222 个阻塞，比较 178 通过、32 失败、438 阻塞。第一轮另有四条 payload 库存不符，第二轮 8,813 条摘要通过，原两轮项目 exit 1。Android 的内部收据 wrapper 78 与 Actions 父步骤 exit 1 分开。
- C0-03 扩为 78 个向量后，`45117818661` 的执行为 Windows C 226 通过、2 失败、6 API 范围阻塞，JS 234 通过，Android 234 位置环境阻塞。比较为 C/JS 190 通过、38 失败、6 阻塞，另 468 个涉及 Android 的比较阻塞。同源三端应用基线 [45117818711](https://github.com/johny751/MyTodo/actions/runs/45117818711) 成功，范围不含受阻的 Android 协议执行。
- C0-04 早期预检 [45132468377](https://github.com/johny751/MyTodo/actions/runs/45132468377) 与 [45133421860](https://github.com/johny751/MyTodo/actions/runs/45133421860) 保留环境阻塞。修复后的桌面 [45134179988](https://github.com/johny751/MyTodo/actions/runs/45134179988) 468 个实际执行和 234 个 C/JS 比较通过，Android 当轮受动态库环境阻塞。第一次真实三端 [45137698063](https://github.com/johny751/MyTodo/actions/runs/45137698063) 有两次 Android 首崩，执行 931 通过、2 失败、3 跳过，比较 929 通过、4 失败、3 跳过，完整阶段 exit 1。
- 最终矩阵中，78 个向量分别由三个实现生成，每个来源再由三个实现接收，得到 936 个位置。以前 2 个执行失败、38 个比较失败和 6 个 C API 阻塞均有后来实际通过的对应位置。四次 Android 首崩包括三次 main 换隔离库和一次 restart 同库重开。限定支持适配器覆盖的 schema、原生 SQLite、事件和冲突协议，同一生产发送方重启前后比较 pending 原字节。独立生产者生成语义等价 JSON 时可存在字节序列差异。旧 Windows runner 诊断 [45140238582](https://github.com/johny751/MyTodo/actions/runs/45140238582) 因无预装 Android 镜像仍失败；[45140238535](https://github.com/johny751/MyTodo/actions/runs/45140238535) 是原三端构建回归。

仓库证据见 [C0-03 状态与兼容报告](../protocol-compatibility.md)、[C0-03 逐例 JSON](../protocol-case-results.json)、[C0-04 状态](../c0-04-status.md)、[C0-04 逐例报告](../c0-04-case-results.md) 和 [Android 云端环境](../android-cloud-environment.md)。文档历史由 [C0-03 末次报告修订](https://github.com/johny751/MyTodo/commit/b805c39cb6f3ab78f0da0f14b49627e401781b1c) 和 [C0-04 报告发布](https://github.com/johny751/MyTodo/commit/035c3143ccffd98e98ecc9c58114c4ce9b011a91) 追溯。C0-04 逐项 JSON 与 collector 命令收据作为补充封存证据，仓库留有逐例 Markdown、实际用例和原 run 入口。

## C0-05：真实 DPAPI 与基线

首次测试 [45153269614](https://github.com/johny751/MyTodo/actions/runs/45153269614) 因适配翻译单元 C2040 未执行 22 个场景；头文件修正 [45153999774](https://github.com/johny751/MyTodo/actions/runs/45153999774) 为 2/22，失败 20 项含 19 个产品场景及 1 个 PowerShell 夹具准备失败。生产修复 [45154587045](https://github.com/johny751/MyTodo/actions/runs/45154587045) 与补充诊断 [45155116261](https://github.com/johny751/MyTodo/actions/runs/45155116261) 各 21/22，剩余失败为同一夹具。夹具修复 [45157015901](https://github.com/johny751/MyTodo/actions/runs/45157015901) 与同源门禁各 22/22。

实际 C↔Node 凭据格式读写使用同一 GitHub Windows runner 用户的 DPAPI。55 条子进程回执含 14 次预期拒绝写入，网络请求数为 0。Node 负例接受抛出的异常，证据支持失败关闭和保全原文件，内部异常类型仍未逐一拆分。最终 Android 比较运行两次 main 换库没有证明初次失败的原库恢复。基线共享 JS 121/121，Windows self/advanced/feedback 的外层检查为 32/48/21。Android Java 73/47/20 断言为宿主级执行，产出 unsigned APK，不覆盖正式签名升级。

仓库证据见 [报告](../c0-05-report.md)、[逐例 JSON](../c0-05-case-results.json)、[验证 JSON](../c0-05-verification.json)、[文档发布](https://github.com/johny751/MyTodo/commit/43cce5d58335df33f3e77b5d6b649fabab05d280) 和 [审计范围勘误](https://github.com/johny751/MyTodo/commit/d3ba93cbb6b31c6544c23b333da1453c91ee1256)。单独的 C0-05 独审 Markdown 来自本地封存，当前仓库报告和验证 JSON 已记录最终结论与勘误范围。

## C0-06：迁移与恢复

83 个场景分为 Node 59、native suite 18、Android 6。Android 独立强杀 A26 验证同一原库等待租约后继续，A30 验证原库隔离且新库只读 snapshot 接管。native suite 的相关强杀在 JS 生产者侧。bootstrap 验证了实际 snapshot PUT 边界和真实第二进程 CAS；基线独立保留 Windows 32/48/21 外层断言及 detail-key 48 和 Android 宿主 73/47/20 断言。

历史主矩阵 [45161953954](https://github.com/johny751/MyTodo/actions/runs/45161953954) 为 51/83，Android 六行在导出审计契约处终止；[45164223526](https://github.com/johny751/MyTodo/actions/runs/45164223526) 为 55/83。独立强杀 [45164373911](https://github.com/johny751/MyTodo/actions/runs/45164373911) 与补可靠采集后 [45168301803](https://github.com/johny751/MyTodo/actions/runs/45168301803) 仍各 1/2，bootstrap 红测 [45166586294](https://github.com/johny751/MyTodo/actions/runs/45166586294) 0/4，旧同源基线 [45168648565](https://github.com/johny751/MyTodo/actions/runs/45168648565) 120/121。Windows C 当前限定为识别已完成迁移及安全初始化，未完成的有 backup 迁移须由支持的客户端处理；没有在本阶段补齐 C 端 v1 importer。

辅助门禁 [45168648612](https://github.com/johny751/MyTodo/actions/runs/45168648612) 直接在 `32e21eb69764dfa99227439b7727f0553205e5ca` 运行 DPAPI 22/22，采集工具 [45169951082](https://github.com/johny751/MyTodo/actions/runs/45169951082) 直接在 `8ce0a047ec14925e08072129e4fd13b372e2e084` 运行 10/10。二者原 collector exit 0，关联 C0-06 最终源依赖实际相同源码核对。采集工具测试证明取证流程的条件行为，不计作物理崩溃恢复次数。矩阵三次首崩为两次 main 换库（其中一处原库文件未获得）和一次 restart 同库。逐文件复制发生于诊断 force-stop 之后，原副本没有重放。

仓库证据见 [报告](../c0-06/reports/c0-06-report.md)、[逐例 JSON](../c0-06/reports/c0-06-case-results.json)、[验证 JSON](../c0-06/reports/c0-06-verification.json)、独立审查 [核心](../c0-06/audit/final-core-evidence-review.md) · [强杀](../c0-06/audit/final-kill-evidence-review.md) · [矩阵](../c0-06/audit/final-matrix-evidence-review.md) · [基线与其他门禁](../c0-06/audit/latest-evidence-review.md) 及 [发布提交](https://github.com/johny751/MyTodo/commit/a0ad1940be5dfe3d74b940fcbe864d8e30f93021)。

## C0-07：事务故障与关联回归

最终 187 次尝试产生 178 个普通结果和 9 个预期边界退出，对应的 187 次新进程审计单独计数。Node 56 次尝试/620 项检查，Windows C 76/1,027，Android 55/652。Android 本轮 55 个同库重开、3 次预期 SIGKILL，通过真实进程证据验证。测试的 HTTP/WebDAV 是合成夹具，故障覆盖写前拒绝、已有持久状态后掉线、pending 原字节重发、去重、ACK through 和后续事件保留。首轮 [45180141745](https://github.com/johny751/MyTodo/actions/runs/45180141745) 141 尝试/1,644 检查/47 失败，Android 10 次停在 seed 入口。补强轮 [45183273190](https://github.com/johny751/MyTodo/actions/runs/45183273190) 187/2,299/33，生产修复轮 [45186305189](https://github.com/johny751/MyTodo/actions/runs/45186305189) 187/2,299/3。三处末尾失败来自 inspect 夹具包装前返回值测量，修正后执行证明与原红测共同保留。排队被替换的 [45180939841](https://github.com/johny751/MyTodo/actions/runs/45180939841) 无 job 和用例执行。

[45194185453](https://github.com/johny751/MyTodo/actions/runs/45194185453) 的原 82/83 失败保留。A27 首次 main 在 HTTP 前死亡，换新库重试后再回原库遇到尚未过期的 lease，没有完成本轮原库恢复。[45199685003](https://github.com/johny751/MyTodo/actions/runs/45199685003) 的 83/83 是更晚的指定数据库契约运行，共 408 次操作。Android 6 个场景的 24 次操作均用指定数据库，48 次 instrumentation 成功、一次 observer restart 首崩后同库重开。原 no-crash 审计条件仍失败 1/1,365；后续 3,544 次静态证据核对以及 2,948 次 Node/native 核对独立记录，与项目用例 83/83 分属不同单位。原 collector exit 1 / incomplete，保留 24 个合成凭据排除。

更晚的 Android 强杀 [45199685578](https://github.com/johny751/MyTodo/actions/runs/45199685578) 2/2，collector exit 1 / incomplete（16 个二进制排除）。[45199685144](https://github.com/johny751/MyTodo/actions/runs/45199685144) bootstrap/CAS 4/4，collector exit 0 / complete。[45199684912](https://github.com/johny751/MyTodo/actions/runs/45199684912) 基线共享 JS 121/121 且三端构建通过，collector exit 1 / incomplete（五份产物缺 manifest）。更早受测生产修复源 `f9ca0f1a…` 的 [45186305386](https://github.com/johny751/MyTodo/actions/runs/45186305386) Windows DPAPI 22/22 和 [45186305196](https://github.com/johny751/MyTodo/actions/runs/45186305196) 完整协议 936/936 执行、936/936 比较、702 来源均通过，原 collector 同为 complete。后者保留七次 Android 首崩，五次 main 换库、两次 restart 同库。

仓库证据见 [主报告](../c0-07-report.md)、[逐例 JSON](../c0-07-case-results.json)、[验证 JSON](../c0-07-verification.json)、[来源清单](../c0-07-provenance.json)、[最终独立审查](../c0-07-final-independent-review.md)、[A27 补强运行独审](../c0-07-evidence/c006-19ce-core-android-final-review.md) 和 [发布提交](https://github.com/johny751/MyTodo/commit/bc3f44d1e76a988dbe269edcf1c606eebec37293)。

## 总体范围与负责人决策

本报告引用的项目结果是历史 GitHub Actions 实际运行。Git 对象对照显示 `master` 相对 `19ceea62` 只有 61 个文档新增。相对 C0-07 直接受测 `de7ce40c`，文档以外仅有两个 C0-06 Android 测试 runner 变化。C0-07 测试使用的生产字节与当前一致。更早阶段的整树存在后续生产修订，历史受测提交仍以原 SHA 标识，关联到当前基线须有生产路径和所需依赖的身份核对。本次只做静态复核，详见 [生产源码基线](production-source-baseline.md)。

同步边界和后续验证条件分别在[同步安全审查](sync-safety-review.md)、[Android 风险](android-stability-risk.md)和[D1 准入建议](d1-entry-decision.md)记录，根因未确认的崩溃继续归 [issue #1](https://github.com/johny751/MyTodo/issues/1)。未验证的真实服务、真机安装/升级与长期运行、正式签名升级、真实 LAN、断电与 fsync、长离线并发及附件数据同步保留为相应后续门槛。旧 [11 验收执行状态](../11-acceptance-execution-status.md) 是早期快照，本轮引用后续阶段实际结果，不据此把原 T01–T16 真环境应用验收一并标为通过。D1 尚未启动或获批。
