# D1-01 实施计划

计划日期为 2026-11-24（Asia/Shanghai）。基线锚点为已发布的阶段 0 审查提交 `d9e58b04484ce14a1bfc3021757b2167df2b0407`。本批实际远端 HEAD、树差异、工作区状态和 CI 回执见 [基线核查](baseline-verification.md)。

负责人已批准 D1-01 数据契约设计及 GitHub Actions 隔离合成验证。第一批交付基线核查、本计划和预计测试矩阵，随后先做现状盘点和合同设计。矩阵是计划，等到实际 Actions 执行并核对证据才改变状态。本批准仅覆盖 D1-01，D1-02 另行申请。

## 工作单元、依赖与提交

| 顺序 | 工作单元 | 文档或代码范围 | 完成条件 |
| --- | --- | --- | --- |
| 1 | 基线与工作拆解 | `baseline-verification.md`、本文件、`validation-plan.md` | 远端 HEAD、工作区、阶段 0 审查祖先关系、受测 SHA 和生产路径身份均有出处。记录新增差异与风险，测试矩阵标记为预计。先提交并报负责人检查。 |
| 2 | A 现有模型盘点 | `current-data-model-inventory.md` | 根据三端实际调用追到持久化和同步边界。区别逻辑实体、投影、派生索引、队列及文件资产。字段、键、类型、默认值、空值、删除、同步和风险可定位到受审 SHA 下源码。 |
| 3 | B 统一业务契约 | `unified-business-data-contract.md`、`contract/` | 在 A 的映射上定义基础实体规则、成熟功能映射和七类新业务结构。将逻辑业务、物理 SQLite、同步事件、附件内容分层。给出机器可读的合同和跨 C、Java、JS/Node 表达与校验规则。 |
| 4 | C / D / E 版本迁移、备份恢复、统一同步 | `schema-version-and-migration-contract.md`、`backup-and-restore-contract.md`、`unified-sync-contract.md` | 先定三类版本、兼容表、迁移输入身份和恢复点，再定备份中 SQLite、WAL、原 Pending、复制状态和附件的完整性。同步合同明确双目标独立 ACK、回收条件、迟到会话隔离和实例示例。逐一对照 C0-03/04 已统一规则。 |
| 5 | G 决策记录及内部设计复核 | `architecture-decisions.md`，并检查步骤 2–4 的术语、正反例和映射 | 逐题列出现状、替代方案、建议、理由、风险和需负责人确认的问题。把未定设计标为待决。评审通过后冻结第一版合同和矩阵对应关系，作为步骤 6 的测试依据。 |
| 6 | F 隔离测试程序及云端 CI | `tests/d1-01/`、`.github/workflows/d1-01-contract-validation.yml` | 先提交夹具、测试和用例追踪，再独立提交工作流。用 GitHub 托管 runner 创建全新临时 SQLite 和附件目录。运行、原始日志、机器结果、人读报告、哈希清单和退出码由 GitHub 生成，保留每次尝试。 |
| 7 | 验证闭环及验收申请 | `validation-report.md`、`validation-results.json`、`d1-01-final-report.md` | 将 workflow/run/job/source SHA、计数、首错、重试、产物及原件哈希与矩阵逐一绑定。需要修订时先说明设计或实现缺陷，独立保留失败证据，明确后续运行。最终只申请 D1-01 完成验收及提出 D1-02 建议。 |

以上文档路径均相对 `docs/upgrade/d1-01/`，仓库根路径例外已完整写出。第一批使用 `docs(d1-01): verify baseline and plan contract validation`，后续按盘点、业务契约、迁移与备份、同步、测试、CI、结果发布分别提交。每次提交前校对路径范围、变更类型和基线，保存提交及推送回执。历史 run 绑定原受测提交。

## 下一批数据模型盘点

每条数据先找生产创建与读取入口，追踪默认值和序列化到实际 SQLite 表、文件或内存，再追踪复制过滤、合并及删除。源码说明优先用提交固定链接到文件和行。对同名异型、字段丢失、未知字段和实体，以及旧数据入口拒绝单列兼容风险。对派生信息记录重建输入和跨端差异。

| 追踪面 | 起点与核对项 |
| --- | --- |
| Windows C | 从 `windows/gui.c` 的账户打开、同步线程及动作入口追到 `windows/database.c` 的 `db_open`、行写入、查询、事务、SQL 错误与旧格式导入，再读 `windows/sync.c` 的状态、批次和 ACK。检查 `windows/native.h`、`storage.c`、`operations.c`、`query.c`、`catalog.c` 等实际表/字段消费者，核对位置型 INSERT、列默认值及 Win32 独有派生字段。 |
| Web / Node 与共享 JS | 从 `server.mjs` 和 `src/app.mjs` 的路由、业务动作及保存调用追到 `src/account-store.mjs`、`sqlite-store.mjs`、`storage.mjs`。沿 `model.mjs`、`replica.mjs`、`sync-core.mjs`、`delta-sync.mjs`、`sync-client.mjs` 和 `sync-server.mjs` 核对序列化、投影、未知 kind 白名单、版本排序、作用域及远端条件写。 |
| Android Java / WebView | 从 `android/src/local/gxtodo/replica/MainActivity.java` 暴露的 `GxNative`、`AccountStore.java` 分账本路径追到 `ReplicaDatabase.java` 和 `SyncStore.java`。对照共享逻辑的 Java bridge 形状、`ContentValues`、提醒接收器、番茄钟及小组件等独立入口，确认哪些状态有后台写入、SQLite 索引或本地辅助存储。静态阅读配置边界，不读凭据。 |
| 业务与派生数据 | 覆盖四象限任务、子任务、提醒、备注、番茄钟、统计、搜索、循环任务、已有项目分类或关联，以及实际识别的账号设置、标签、地点和反馈。区分可持久同步字段、设备本地偏好、可重建统计或搜索索引。适配追到具体动作、转换和保存路径后再定归类。 |
| 复制与内容 | 覆盖 Actor/Device、scope/epoch、clock/seq、event、outbox、pending、cursor、manifest、batch、tombstone、conflict、snapshot 及附件引用。核对既有文本或文件路径字段与独立附件能力的界限，以及旧 Windows C 对 WebDAV v1 导入和不支持备份的安全拒绝。 |

盘点表每项记录实体真实名、平台、表或文件位置、主键、字段类型与可空性、关联、同步、删除和风险。先标记源码可确认事实，再另记需合成验证或留待生产验证的设计问题。合同初稿须明确如何无损保留成熟字段，如何让未知新字段保真、未知实体暂停应用，以及新旧端何时停止推进游标。

## 安全与证据门槛

- 生产范围保持只读。隔离内容置于 `docs/upgrade/d1-01/`、`tests/d1-01/` 和独立 CI workflow。生产程序、现有构建入口及同步代码均不得依赖这些目录。先检查新增路径，最终以记录的基线对照生产源码、数据库入口、同步协议、原工作流与包装路径。
- 本机只做静态阅读、文档编辑与证据整理。编译、测试、SQLite、故障注入和报告生成均在 GitHub Actions。夹具只用固定的合成身份、数据和临时目录，禁止实际 WebDAV/LAN 服务、生产账号、真实凭据、生产数据库和生产迁移入口。
- 用例分设计文档检查、隔离合成执行、生产代码和真实环境四类。各留独立状态和统计，执行中断、换库、预定故障和真实失败分别记账。事件被接受、数据实际同库恢复、collector 归档完成分别核对。不得将重复重试或静态检查计入合成用例通过数。
- 验收前核对 GitHub 原始回执、机器 JSON 与报告口径一致，采用 `PASS`、`FAIL`、`BLOCKED`、`NOT TESTED`、`OPEN RISK`。核心用例失败或阻塞时先记录限制与下一步验证。没有完整证据不申请无条件通过。
- Android issue #1、Windows v1 安全拒绝、真实 WebDAV 未验收、生产备份/T15/T16/同库恢复、独立 ACK 和 Windows 迟到响应隔离仍按阶段 0 的风险边界管理。合成结果只能说明设计和本阶段夹具的已覆盖行为。

参考：[阶段 0 最终审查](../phase0-final-review/phase0-final-report.md)、[阶段 0 D1 准入评审](../phase0-final-review/d1-entry-decision.md)、[既有 D1 执行顺序](../09-phase-one-entry-plan.md)、[基线核查](baseline-verification.md)、[预计验证矩阵](validation-plan.md)。
