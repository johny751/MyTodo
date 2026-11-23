# C007 de7 Android 独立证据审查

审查时间：2026-11-23。对象：GitHub run `45190559178`，source `de7ce40ccac3e963108a3a9af7c875186f822cce`，runAttempt 1。本审查仅静态读取本地 JSON、文本及文本 SHA256；没有运行项目代码、构建、SQLite、ADB 或联网，也没有读取 APK/数据库二进制。归档目录为 `outputs/c0-07/evidence/45190559178`。

结论：本轮 Android 的 55 次预定操作、55 次原设备同库重开、3 次真实预定进程死亡以及 652 个记录检查，其请求、原生回执、原始命令流与状态语义相互一致，独立静态核对未发现矛盾。该结论不消除采集器的 `collectionExitCode=1`、`evidenceComplete=false`，也不把这轮测试解释为 Android 历史启动稳定性问题已修复。

## 操作与同库重开

- 10 个场景合计 55 次主操作：10 次 initialize/seed，45 次 resume。每次均紧接一个 `mode=resume`、`operation.op=audit` 的重开请求，共 55 次。
- 110 个原生进程 PID 全部不同；每个场景的 dbCase、dbDir 和设备数据库路径保持一致。10 次初始数据库存在性检查为 missing，后续 100 次为 present。
- 52 个普通结果中 `operationAccepted=true` 40 个、false 12 个；另 3 个是预定边界死亡，没有普通结果文件。普通结果的完整 after 状态与相应重开 after 状态 52/52 相等；所有重开的 before 与 after 完整状态 55/55 相等。
- 652 个 checks 全为 true；这些计数结合下述底层核对解释，不能单独由 observerExitCode、ADB 退出码、sealed 或环境 ready 推导业务成功。
- 12 个拒绝中，8 个有真实 Android SQLite 异常：4 个 trigger/1811，2 个 deferred foreign key/787，1 个缺失 SQL function、1 个读取步 integer overflow，后二者为 SQLite error 1。其余 4 个网络拒绝的 operationError 为两个 HTTP 503 和两个 IOException unexpected end of stream；nativeError 为空不表示这些故障未发生。

## 三个死亡边界

| 场景 / 操作 | 原生 PID → 重开 PID | 真实边界 | 原库重开语义 |
|---|---:|---|---|
| sql-atomicity / 009-exit-before-commit | 9431 → 9670 | before-real-sqlite-commit | revision 5 保留；pending 保留；cursor 空；outbox 1,2,3,4；与操作前状态一致 |
| C007-after-ack-commit-exit / 003-publish-fault | 25189 → 25405 | after-real-ack-return | revision 4→5；pending 清空；cursor c007-A=1；outbox 仅 3；与 ACK 提交后预期状态一致 |
| C007-before-ack-commit-exit / 003-publish-fault | 27201 → 27419 | before-real-sqlite-commit | revision 4 保留；pending 保留；cursor 空；outbox 1,2,3；与操作前状态一致 |

两个 precommit marker 均记录 `inTransaction=true`、`transactionSuccessfulMarked=true`，未提交 revision 已加一。SQL marker 包含待回滚文本 `must roll back after termination` 和额外 outbox 事件；pre-ACK marker 中删除 through 2、cursor=1、pending 清空、revision+1 的暂存状态也与预期一致。重开结果说明这些未提交更改没有成为持久状态。after-ACK marker 的状态与提交后的原库重开一致。

三个 marker 的 SHA256 依次为：

- SQL precommit：`99d449124d4eaea9659966fc84778874299063e2583138910a96b9ed7b2c9324`
- ACK after：`015d0dc4cb02f6b8f052dea71a1c0365657d0a0da4089e94b6bd7de8732687de`
- ACK before：`8ce731f6ff1515b5795b192b49c51435a23907df5e22694ea2f4ce8c20942661`

三个 OS ApplicationExitInfo 均为 `reason=2 (SIGNALED), status=9`，并对应 marker 中的 PID；不是将主机 worker 协议退出码 86 当成 Android OS 退出码。三个 instrumentation 原始输出为 Process crashed / CODE 0，仅在预期 marker、自然退出、OS 记录及原库状态共同支持下解释为预定死亡。

顺序限定必须保留：worker 首先用原始 pidof 空 stdout/stderr、退出码 1 确认原 PID 已自然消失；随后**实际执行** `after-confirmed-natural-exit-stop`（am force-stop）和第二次 pidof，最后导出。不能写成“从未 force-stop”。自然消失先于清理，清理没有替代预定死亡；导出是该清理之后的稳定文件拷贝，不是死亡瞬间的原子快照。

| 原 PID | 自然消失确认时间 UTC | 后续清理开始 UTC | 首个导出开始 UTC |
|---:|---|---|---|
| 9431 | 14:12:30.675 | 14:12:30.675 | 14:12:30.760 |
| 25189 | 14:17:45.737 | 14:17:45.737 | 14:17:45.785 |
| 27201 | 14:18:24.781 | 14:18:24.781 | 14:18:24.834 |

## 原始流、进程与数据库导出

- 110 份 process 回执包含 3,822 条命令、7,644 条 stdout/stderr。7,530 条本地文本流逐项复算长度和 SHA256，并与命令回执及采集 inventory 对齐；另外 114 条二进制 stdout 仅与云端 inventory 的已记录 hash 对照，没有声称本地二进制复算。
- 110 组 crash-log stdout/stderr 共 220 条流均为空。107 次普通 instrumentation 为 CODE -1，3 次预定死亡为 CODE 0。
- 1,704 条历史退出记录去重后为 221 条：主进程 110 条，PID 集合与原生回执精确一致，其中 107 条 reason 10/subreason 21，3 条预定 SIGKILL。其余 111 条 WebView 为 109 条 reason 13 和 2 条 EXIT_SELF，均 subreason 17 (ISOLATED NOT NEEDED)。没有发现额外主进程退出或本轮非预定启动崩溃；这只限该轮已捕获证据。
- 在 110 次 worker 操作记录中未发现 DB push/pull/copy/move/reset/replace 命令；同一设备路径用于主操作与重开，证据未用导出副本覆盖原库后再运行。
- 440 个 DB/sidecar 文件观测中，116 preserved、324 valid missing。preserved 为 110 个主库、3 个 WAL、3 个 SHM；324 个缺失都有有效 raw missing probe。
- 232 条 preserved 前后 raw probe 与 metadata/transfer hash 一致；116 份 pre-/post-reopen 拷贝的 files.json 与云端文件 inventory 大小/hash 一致。110 个主库均记录 SQLite header valid。这里验证的是归档文本中的远端前后及传输记录，并非本地打开数据库重跑查询。
- ACK-after 的 WAL 为 8,272 B；两个 precommit WAL 为 0 B；三个 SHM 均 32,768 B。空 WAL 与 missing WAL 被分别保留，不能合并为“都缺失”。

## 版本与构建绑定

source、seal、build、prepare、110 worker 及 environment 均绑定本轮 source；seal 记录 sourceUnchanged=true，Android producer files=9,385。构建、准备、110 worker 与云端 inventory 的 APK SHA256 均为 `c80cf3070c7f8d1a684e316b1cbcec4a6f4b5b91ec3a5ef28a76e9cd88829f1f`，inventory 大小 167,011 B。APK 未在本地读取或复算。

测试实际使用 production ReplicaDatabase 的观测副本：原始 SHA `efac2d464c612506debc2aea04a992352bba6ce8a816d96f6a1f07ee9b614663`，observed SHA `1726b9d1b72f4a6c170e3d85fb5a3e28f7ac06864e042b68b8270e51f8d446b4`；构建 sourceHashes 与 adaptation 对应。adaptation 记录仓库生产文件未修改、3 个观测插入以及原 SQL/事务顺序保留。本审查未重新编译验证该声明。delta adapter 的原始 hash 与 source.json 相同，改造记录为仅追加测试私有导出。

环境为 API 34 / x86_64，原生 SQLite 3.39.2，WebView 113.0.5672.136；host Node SQLite 3.54.1 不是设备数据库版本。环境 ready、shutdown finished 只表示环境阶段状态。

## 采集限定与审查产物

GitHub conclusion=success。采集器仍为 exit 1、evidenceComplete=false，114 个 binary-in-text-evidence-path 全保留。通用库存审查确认这些为 110 个主库 stdout、3 个 SHM stdout、1 个非空 WAL stdout；均有云端索引且本地缺失。本地文字审查不能将总门禁改成完整通过。

同级库存审查 `work/c007-de7-production-integrity-audit.json` 的 archiveIntegrityPassed=true、auditIssues=0；该审查同时保留 recordedRunPassed=false。其 SHA256 为 `61d72889e7a5473235b1a8390648f15b9ef63e366505a13d3d763a5e99a9497f`。ZIP 外层 hash 由主 Agent 复核，本审查没有重复 ZIP 复算，也不据此宣称独立 ZIP 验证。

本审查的可复核静态计算：

- `work/c007-de7-android-semantics.ps1` → `work/c007-de7-android-semantics.json`，issues=[]。
- `work/c007-de7-android-process-audit.ps1` → `work/c007-de7-android-process-audit.json`，issues=[]。

前轮 f9 的启动失败、fresh-db retry 限定、C006 A26 原始失败以及稳定性开放事项仍独立有效。本轮 C007 无额外启动崩溃不能替代那些失败记录，也不能推导新源码 edfde91 的其他运行结果。
