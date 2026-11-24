# MyTodo 统一数据契约草案

2026-11-24（Asia/Shanghai）。D1-01-B 审核稿。审查基线为 GitHub `master` 的 `6a4b179f361602f47429bc9aa88e51c0b61395e3`，生产源码证据固定到 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。本批为文档设计，运行验证状态为 `NOT TESTED`。[D1-01-A 提交](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3) · [盘点覆盖与范围](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-coverage.md)

本组文档使用四种标识。**源码证据**指 D1-01-A 的静态核查。**设计建议**指待审核的规范。**尚待设备验证**指已有可验证路径、结果仍未取得的事项。**负责人决策**指必须由负责人选择的方案或上线门槛。原盘点的 `UNKNOWN` 和 `NEEDS INVESTIGATION` 状态照原证据保留。[盘点未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md)

## 逻辑层与来源证据

| 逻辑层 | 源码证据 | 设计建议 |
| --- | --- | --- |
| 原始输入与复制记录 | `entities.record` 保存事件，`data` 与 `conflicts` 是复制合并的输出。旧文件、业务导出、SQL 列和当前界面各有信息差 | 以账户账本、来源种类、读取边界、实体键、原始路径和可验证校验值定位输入。保留实际可读的序列化字节或 SQL 值及类型、缺席状态、冲突候选与快照来源。若只有规范化结果，显式标为来源能力受限。事件记录只证明仍保留的事件，未必包含全量修改历史 |
| 逻辑业务实体 | 共享白名单为 `tasks`、`notes`、`projects`、`tags`、`places`。子任务在事件中是任务行，UI 才嵌套 | 以账本范围内的 `(kind,id)` 定位同一实体。任一原业务记录可有已验证的字段、未解析的字段和关系诊断。原始记录与投影均可定位到同一读取边界 |
| 墓碑 | 事件 `_deleted`、合并行 `deleted` 与 SQL `deleted` 表达不同层次的信息。活跃业务导出通常过滤删除行 | 墓碑继续用原实体键，可定位到删除来源及因果记录。视图隐藏墓碑，保留调试/恢复通道。归档项目仍可关联。过去已缺失的删除历史保持未知 |
| 业务投影 | `buildState`、Android 原生导出和 Windows 查询/导出各有默认值、过滤和重组路径 | 跨语言逻辑投影只从明确字段与当前读取边界导出，携带字段诊断。UI 回退、树升根、默认显示和 SQL 索引列服务读取与展示。回退值不生成修复事件。需改值时由后续明确的用户编辑或经审批的迁移操作进入独立写入路径 |
| 派生数据 | Windows 搜索派生表、三端统计/列表、Android 小组件与部分提醒值均由当前记录或本地状态算出 | 记录所需输入和算法版本，以输入重建搜索/统计；与番茄钟落盘聚合、提醒已发回执等不可从业务重建的本地数据分开 |

源码依据见 [三端现有模型](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L5-L28) · [复制层字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111) · [三端差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L46)。

**尚待设备验证**。历史文件保有的原始层次、重复 ID、未知字段、未带偏移时间及三端 JSON 边界仍需各支持版本的隔离样本和设备证据。**负责人决策**。D1B-01 决定是否采用“原始来源与标准投影并存”的逻辑模型，以及原件、诊断和版本保管要求。[未确认事项](d1-01-b-open-questions.md)

## 五类现有实体

| 对象与源码字段 | 设计建议 |
| --- | --- |
| `tasks` 根任务与子任务 | 保留 `id`、`title`、`quadrant`、`order`、`done`、`start`、`end`、`allDay`、`createdAt`、`completedAt`、`notes`、`review`、`weight`。`parentId` 是同账本任务关系输入，树形 `subtasks` 在需要时投影。保留 `project`、`tags`、`place` 原字段，另计算受来源和当前快照约束的关系结果 |
| `tasks` 提醒与循环 | 保留 `reminder` 的 `mode/minutes/days/at`、已存 `reminderAt` 和可重算提醒值。保留 `repeat` 的 `frequency/interval/weekdays/until/anchor`、`seriesId`、`generatedFrom` 及已生成实例、已有删除/冲突信息。读取、恢复和关系计算只展示已有记录，生成下一期仍是独立动作 |
| `notes` | 保存 `id`、`body`、`createdAt` 和原始空值及时间类型。任务 `notes` 保持其备注字段身份，反馈组件的 `notes` bucket 保持自己的本地命名空间 |
| `projects` | 保存 `id`、`name`、`description`、`archived`。名称可编辑，ID 为关系目标。归档项目可作为既有关系候选，已删除项目仅保留可查的墓碑证据 |
| `tags`、`places` | 各自保留原 `id`、`name` 和目录/业务值。旧实现常以名称构造 ID，按 `(kind,id)` 保持身份范围，不把不同 kind 的同名记录合并。目录字符串、任务原引用及旧 ID 均可追溯 |

**源码证据**见 [任务字段与备注](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L17-L42) · [提醒及重复字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L43-L64) · [目录与便签字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L65-L80)。

**尚待设备验证**。旧导入中的同名、悬空、超长关系、递归树差异及类型异常仍有盘点保留项。**负责人决策**。D1B-02 决定字段与旧读端的接纳规则，D1B-03 决定关联人工复核权限与审核持久化。[字段矩阵](field-compatibility-matrix.md) · [关系策略](relationship-migration-strategy.md) · [未确认事项](d1-01-b-open-questions.md)

## 公共表示及边界

- **源码证据**。既有 v2 基础口径以 C0-03/04 和当前源码为准。Actor 为 1–80 个 ASCII 字母、数字、短横线且区分大小写。现有冲突顺序为 clock、Actor ASCII 字节序、seq。实体 ID 为非空有效 Unicode 标量序列、禁止 NUL、最多 800 UTF-8 字节。协议计数上限为 `2^53−1`。Manifest head/cursor 为非负安全整数，manifest heads 最多 256 个 Actor，snapshot cursor 不可超过相应 head。应用批次采用事务边界，快照 cursor 在全分片校验后推进。[协议和复制字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111) · [阶段 0 同步审查](../phase0-final-review/sync-safety-review.md)
- **设计建议**。三端用共同值域表达业务数据，并独立记录来源存在状态和校验结果。C 在字符串验证前处理完整字节及长度，先验证整数值域再转 `int64_t`，JSON 处理需区分原数字字面量和 double。Java 使用专门的存在检查/类型分支，先检验代理项和字节长度，安全整数保留为 `long`。JS/Node 使用自有键存在检查、显式 `null`/布尔判断和安全整数校验，读取 SQLite 64 位整数或历史原数字时保留不会被 double 截断的来源值。三端读者都应能区分字段无值、字段有值但非法，以及有类型的标准值。[字段矩阵](field-compatibility-matrix.md)
- **设计建议**。本地账户、设备、Actor、scope、epoch 分别定位，不互相推导。`seq/clock/vector` 表达事件和因果，`revision/dataRevision` 为本地修订，`queue/outbox.id` 为本地序号，`heads/cursors` 为批次进度。保存原始 pending body、batch 身份、manifest/ETag、snapshot descriptor 与 parts 校验关系。当前单一路径按 `through` ACK 清理 outbox。将来引入其他目的地须另行设计、审批和验证。[归属及同步边界](data-ownership-and-sync-boundaries.md) · [备份恢复](backup-restore-contract.md)
- **尚待设备验证**。按真实 C、Node、Android 读取端核对同一原值的存在、投影与往返。备份切换、恢复身份、真实 WebDAV、LAN 独立投递和 Windows 迟到响应均保留其现有开放边界。**负责人决策**。D1B-04 至 D1B-07 分别确认本地数据、备份、版本与恢复上线边界。[版本及迁移](migration-versioning-contract.md) · [决策清单](d1-01-b-open-questions.md)

本稿的版本名、记录结构和例子用于评审。GitHub 提交范围为七份 Markdown，系统的生产模式、存储和 wire 保持原样。本次交付后停在 D1-01-B 审核点。[D1-01-A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md)
