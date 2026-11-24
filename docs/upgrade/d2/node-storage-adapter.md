# Node 真实存储入口与手动迁移基础设施

2026-11-24（Asia/Shanghai）。**PROPOSAL / BLOCKER**。仅用于获准的 `d2/implementation-candidate-1` 分支与隔离 Actions 验证。主应用启动不执行迁移；没有修改 D1 candidate.1 的字段、业务投影或 ACK/outbox/cursor 语义。下面 FACT 指本分支源代码可见实现，不表示运行验证通过。

**FACT（源码）**。`createSQLiteStore` 的 meta、entities、outbox INSERT 改为明确列名，保持原绑定顺序和值、CAS、revision/dataRevision、事务与错误清理。旧 `commit` 的队列清理和 ACK 上界没有变化。新增手动方法 `captureD2Snapshot`、`getD2BuildIdentity`/`migrationBuildIdentity`、`migrateStorageInfrastructure`、`inspectStorageMigrationOutcome` 和 `closeChecked`，没有路由或启动调用。

**FACT（源码）/ PROPOSAL**。`src/migration-runtime.mjs` 使用真实 Node `DatabaseSync` 句柄，实现 [统一契约](shared-runtime-contract.md) 的 step `mytodo-storage-infrastructure-0001`、SQLite user_version 0→1、11 列 registry、6 列 immutable snapshot 和 5 列 successful audit。所有新增表、source snapshot、registry、audit 及 user_version 在同一 IMMEDIATE 事务中提交。expected target 独立由 source schema 加六个固定对象构造；原业务三表 raw payload 不写回。

**FACT（源码）/ PROPOSAL**。指纹用 `N;`/`S<byteLength>:exactUTF8`，含 schema/raw count、表/列/行 count。schema SQL 不规格化后入指纹。每个原 SQL 单元包含 typeof、HEX(CAST AS BLOB) 和 REAL 的 big-endian IEEE754 16 位 hex；非 REAL 最后项为 NULL，SQL NULL 的 HEX 项为 NULL。整数不经 JS double 读取，未知 JSON、BLOB、墓碑和队列正文保持原字节。

**FACT（源码）/ BLOCKER**。source known-layout 只接受完整 baseline 或指定三表反序 DDL，加严格列属性、索引和无未知对象检查；不以任意已存在 schema 的 hash 作为许可。Node 不接纳未经本平台批准的 Android Framework locale 表。缺少 build-bound identity、源变化、未知 schema 或指纹不符均拒绝；没有试图填补真实历史样本。

**FACT（源码）/ PROPOSAL / OWNER DECISION**。手动 repeat 固定在原 snapshot 窗口：匹配后 idempotent，后续真实业务写入或 ACK 导致 blockedDataAdvanced，不重做旧迁移、不覆盖较新数据。COMMIT 异常关闭原句柄并用同一路径新只读句柄核验原态或完整新态，返回 notCommitted/committed/blockedUnknown/blockedDataAdvanced；原错误、rollback error 与 caller-owned audit 保留。确认结果不授权同步身份恢复。原成功返回后的 callback 错误也按未知响应核验，不能假装原异常没有发生。

**FACT（源码）/ BLOCKER**。build identity 从实际生产 `sqlite-store.mjs`、`migration-runtime.mjs` 源 bytes 加 step/contract/algorithm identity 计算，测试与当前 Actions source SHA/run/attempt 对齐；未记录身份拒绝运行。独立 observer/audit sink 是生产诊断接口，故障定义只在 `tests/d2`；生产没有 import tests。**UNVERIFIED**。这两个源文件标识本 step 与 adapter；replica 及其余整包依赖的整体构建 identity 接入仍待后续工作，不把局部源码 checksum 当成全部发布物校验。

**PROPOSAL**。执行命令：选择支持 `node:sqlite` 与 `backup` 的已验证 Node，在 Actions 执行 `EXPECTED_SOURCE_SHA=$GITHUB_SHA node tests/d2/node-runner.mjs "$RUNNER_TEMP/d2-$GITHUB_RUN_ID-node"`。所有 case 在 `.d2-synthetic-only.json` 标记的独立 RUNNER_TEMP root 下，先证明真实 `createSQLiteStore.call(commit)`，再使用共同 raw fixture；本机没有执行。

**FACT（源码）/ UNVERIFIED（运行）**。报告为 `node-report.json`，身份另存 `production-source-identity.json`。原 worker stdout/stderr、caller audit、失败数据库、`cross-source.sqlite`/`cross-target.sqlite` 与 payload SHA 清单保留。真实 API、反序/额外列、事务/版本/幂等、real primary/rollback error、未知响应与进程死亡重开、REAL 1ulp、target schema 漂移均有独立命名断言；实际通过/失败数只能来自 Actions 原始报告。

UNVERIFIED / OWNER DECISION：生产发布包如何提供记录过的 build identity、真实用户库规模与历史 schema、全部 writer 的停写、跨文件/附件一致性、掉电与真实设备恢复、凭据及同步身份放行仍须后续证据。这里只落地首个基础设施 step，不部署、不合并 master，不把合成 raw 异常夹具称为合法历史复制事件，也不关闭 Android issue #1。
