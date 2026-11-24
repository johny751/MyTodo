# Node 真实存储入口与手动迁移基础设施

2026-11-24（Asia/Shanghai）。**PROPOSAL / BLOCKER**。仅用于获准的 `d2/implementation-candidate-1` 分支与隔离 Actions 验证。主应用启动不执行迁移；没有修改 D1 candidate.1 的字段、业务投影或 ACK/outbox/cursor 语义。下面 FACT 指本分支源代码可见实现，不表示运行验证通过。

**FACT（源码）**。`createSQLiteStore` 的 meta、entities、outbox INSERT 改为明确列名，保持原绑定顺序和值、CAS、revision/dataRevision、事务与错误清理。旧 `commit` 的队列清理和 ACK 上界没有变化。新增手动方法 `captureD2Snapshot`、`getD2BuildIdentity`/`migrationBuildIdentity`、`migrateStorageInfrastructure`、`inspectStorageMigrationOutcome` 和 `closeChecked`，没有路由或启动调用。

**FACT（源码）/ PROPOSAL**。`src/migration-runtime.mjs` 使用真实 Node `DatabaseSync` 句柄，实现 [统一契约](shared-runtime-contract.md) 的 step `mytodo-storage-infrastructure-0001`、SQLite user_version 0→1、11 列 registry、6 列 immutable snapshot 和 5 列 successful audit。所有新增表、source snapshot、registry、audit 及 user_version 在同一 IMMEDIATE 事务中提交。expected target 独立由 source schema 加六个固定对象构造；原业务三表 raw payload 不写回。

**FACT（源码）/ PROPOSAL**。唯一当前候选为 `mytodo-storage-fingerprint-v2`，用 `N;`/`S<byteLength>:exactUTF8`，含 schema/raw count、表/列/行 count；schema SQL 不规格化后入指纹。每个原 SQL 单元仍有三个字段：REAL 为 `('real', NULL, big-endian IEEE754 16 位小写 hex)`；SQL NULL 为 `('null', NULL, NULL)`；INTEGER/TEXT/BLOB 为 `(typeof, HEX(CAST AS BLOB), NULL)`。REAL 中间的 NULL 仅是指纹格式 sentinel，不把原业务值或 SQL storage type 改成 NULL，实际 CAST 文本只作诊断、不参与 REAL 身份。整数不经 JS double 读取，未知 JSON、BLOB、墓碑和队列正文保持原字节；LP、排序、DDL、step、user_version 与 D1 合同不变。

**FACT（源码）/ BLOCKER**。source known-layout 只接受完整 baseline 或指定三表反序 DDL，加严格列属性、索引和无未知对象检查；不以任意已存在 schema 的 hash 作为许可。Node 不接纳未经本平台批准的 Android Framework locale 表。缺少 build-bound identity、源变化、未知 schema 或指纹不符均拒绝；没有试图填补真实历史样本。

**FACT（源码）/ PROPOSAL / OWNER DECISION**。手动 repeat 固定在原 snapshot 窗口：匹配后 idempotent，后续真实业务写入或 ACK 导致 blockedDataAdvanced，不重做旧迁移、不覆盖较新数据。COMMIT 异常关闭原句柄并用同一路径新只读句柄核验原态或完整新态，返回 notCommitted/committed/blockedUnknown/blockedDataAdvanced；原错误、rollback error 与 caller-owned audit 保留。确认结果不授权同步身份恢复。原成功返回后的 callback 错误也按未知响应核验，不能假装原异常没有发生。

**FACT（源码）/ BLOCKER**。build identity 从实际生产 `sqlite-store.mjs`、`migration-runtime.mjs` 源 bytes 加 step/contract/algorithm identity 计算，测试与当前 Actions source SHA/run/attempt 对齐；未记录身份拒绝运行。独立 observer/audit sink 是生产诊断接口，故障定义只在 `tests/d2`；生产没有 import tests。**UNVERIFIED**。这两个源文件标识本 step 与 adapter；replica 及其余整包依赖的整体构建 identity 接入仍待后续工作，不把局部源码 checksum 当成全部发布物校验。

**PROPOSAL**。执行命令：选择支持 `node:sqlite` 与 `backup` 的已验证 Node，在 Actions 执行 `EXPECTED_SOURCE_SHA=$GITHUB_SHA node tests/d2/node-runner.mjs "$RUNNER_TEMP/d2-$GITHUB_RUN_ID-node"`。所有 case 在 `.d2-synthetic-only.json` 标记的独立 RUNNER_TEMP root 下，先证明真实 `createSQLiteStore.call(commit)`，再使用共同 raw fixture；本机没有执行。

**FACT（源码）/ UNVERIFIED（运行）**。报告为 `node-report.json`，身份另存 `production-source-identity.json`。原 worker stdout/stderr、caller audit、失败数据库、`cross-source.sqlite`/`cross-target.sqlite` 与 payload SHA 清单保留。真实 API、反序/额外列、事务/版本/幂等、real primary/rollback error、未知响应与进程死亡重开、REAL 1ulp、target schema 漂移均有独立命名断言；实际通过/失败数只能来自 Actions 原始报告。

**FACT（CI2 原证据）**。[运行 45410409313](https://github.com/johny751/MyTodo/actions/runs/45410409313)、源码前缀 `7ac7d7c` 的 Node 报告为 15/16，唯一 N15 失败。相邻 REAL 的实际 CAST 文本分别为 `1.23456789012345` 与 `1.2345678901234503`，否定该用例原先假设的“此引擎一定把相邻值都折为相同 15 位文本”。原失败及原 CAST HEX 保留；不能把这一具体观测泛化为每个 SQLite 版本的格式规则。

**FACT（CI3 原证据）/ PROPOSAL（解决方案）**。[运行 45414368180](https://github.com/johny751/MyTodo/actions/runs/45414368180)、源码 `d57963c35c5a6d06fce3664b5789acb7e6ac2e35` 的 Android v1 REAL 单元为 `S4:realS6:312E30S16:3ff0000000000001`，同一确切 binary64 值在 Node 的实际 CAST 表示不同，跨端 comparer 严格拒绝 v1 raw identity。详见 [D2-CONFLICT-REAL-001](fingerprint-portability-resolution.md)。v2 移除 REAL 身份中依赖 SQLite 引擎的冗余 CAST 文本；CI1–CI3 的 v1 payload、snapshot、registry、失败及档案保持原样。旧 v1 request 在现有 N08 中必须以 blockedPlan 拒绝且 source snapshot 不变，不静默重解释或迁移旧证据。

**PROPOSAL / UNVERIFIED（v2 用例运行）**。16 个具名用例保持；N15 使用确切相邻 binary64 位 `3ff0000000000001` 和 `3ff0000000000002`。数据库必须读回这两组原位、ULP 距离必须为 1，两个完整 v2 raw payload 与 SHA 必须分别逐字匹配独立新只读句柄的规范 oracle；schema/user_version 不变，而 raw payload/指纹必须变化。实际 CAST HEX 和是否碰撞如实报告，不能人为写成相等。oracle 使用独立 literal v2 header 与逐 cell 编码，不调用生产编码器，原 payload 另存 `real/oracle-0-raw.lp`、`real/oracle-1-raw.lp`。D1 字段语义保持不变；v2 运行及跨端一致性须等待下一次权威 Actions 收据，不能沿用 v1 结果声称通过。

**UNVERIFIED / OWNER DECISION**。旧引擎中的 CAST 碰撞回归仍须绑定实际 bundled C/其他版本的独立运行证据；本次 Node 修订不宣称该历史前提已经验证通过，也不取消 REAL64 第三字段或未知历史数据的保护要求。

UNVERIFIED / OWNER DECISION：生产发布包如何提供记录过的 build identity、真实用户库规模与历史 schema、全部 writer 的停写、跨文件/附件一致性、掉电与真实设备恢复、凭据及同步身份放行仍须后续证据。这里只落地首个基础设施 step，不部署、不合并 master，不把合成 raw 异常夹具称为合法历史复制事件，也不关闭 Android issue #1。
