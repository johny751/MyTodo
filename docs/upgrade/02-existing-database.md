# 现有数据库结构与迁移审计

日期：2026-11-23，Asia/Shanghai。源码：`master` ZIP，提交注释 `5480c88c806cf1c366ec998b0ba627543d63233a`。本轮已完成静态源码审计；没有读取生产数据库，没有执行本地构建、测试或迁移。下述代码行号针对该源码快照，历史报告不作为本轮执行结果。

## 1. 三端实际存储

Windows C、网页 Node 服务及 Android Java 都将每个本地账号保存在独立 `tasks.sqlite` 中；网页不是只有浏览器 localStorage 的静态站点。共同基础 schema 是三个通用表，不是独立 Tasks/Projects/Workflow 表。

| 入口 | 实际实现 |
|---|---|
| `windows/database.c:33` `db_open` | SQLite C API；WAL、`synchronous=FULL`、5 秒 busy timeout、FULLMUTEX；仓库 vendor SQLite 3.38.2（`windows/vendor/sqlite3.h:149`） |
| `src/sqlite-store.mjs:6–34` `createSQLiteStore` | Node `node:sqlite` 的 DatabaseSync；相同基础 schema、WAL/FULL/busy_timeout；没有第三方 SQLite npm 依赖 |
| `android/src/local/gxtodo/replica/ReplicaDatabase.java:12–18` | Android SQLiteDatabase，启用 WAL、FULL；直接 openOrCreateDatabase，未使用 SQLiteOpenHelper/onUpgrade |

账号清单是数据库之外的 `accounts.json`，版本为 1，负责账号名称、激活账号和默认同步目录。它代表本地隔离账号，不是 Workspace/团队 Users。默认账号数据库在数据根目录；其他账号在 `accounts/<account-id>/tasks.sqlite`。网页与 Android 检查清单并拒绝坏格式；Windows 路径规则见 `windows/gui.c:254–259`、账号管理见 `windows/operations.c:35`。公开 Windows 版默认 `%LOCALAPPDATA%/GxTodoLocal/data`；非公开版保留发现旧 `M:/dev/gxtodo-local/data/tasks.sqlite` 时使用该位置的兼容分支，不能在验收时沿用生产目录。

## 2. 基础 schema

三端建表代码分别在上述入口。没有应用外键、独立 schema 迁移登记或 `PRAGMA user_version` 升级入口。

| 表 | 列及约束 | 语义 |
|---|---|---|
| `meta` | `id INTEGER PRIMARY KEY CHECK(id=1)`；`value TEXT NOT NULL` | 单行 JSON 元信息 |
| `entities` | `key TEXT PRIMARY KEY`；`kind,id,data,record,conflicts TEXT NOT NULL`；`deleted INTEGER NOT NULL`；`parent_id TEXT`；`done,quadrant,reminder_at INTEGER`；`start TEXT` | 业务 JSON、因果记录、删除墓碑、冲突及可查询投影 |
| `outbox` | `id INTEGER PRIMARY KEY`；`event TEXT NOT NULL` | 本设备待发布变更；ID 来自 meta.queue，不是独立 AUTOINCREMENT |

基础索引：`task_filter(kind,deleted,done,quadrant,start)`、`task_reminders(kind,deleted,done,reminder_at)`、`task_parent(parent_id)`。`entities.key` 是 JSON 数组字符串，例如 `["tasks","稳定ID"]`；当前合法 kind 只有 `tasks/notes/projects/tags/places`（`src/replica.mjs:8,35–40`、`windows/database.c:13`）。子任务也是 tasks 行，通过 `parent_id` 关联，导出时才重建嵌套树，没有 Subtasks 表。

`meta.value` 保存 version=2、revision/dataRevision、actor、seq、Lamport clock、queue、vector、按来源设备的 cursors、initialized、scope、epoch、pending 和 settings。这里的 version=2 是复制数据格式，不是完整 SQL schema 版本。账号清单 version=1、应用 package version=0.9.2、Windows 搜索缓存 version=4 是不同层级，升级不能混用。

Windows `ui_query_init`（`windows/query.c:9`）还创建四张本地派生表：`native_search(key,text)`、`native_search_normal(key,text)`、`native_search_dirty(key)`、`native_index_meta(version)`，及两个 insert/update 触发器。native_index_meta 当前值是 4，仅控制搜索缓存重建。另有 10 个 native 查询索引：entity_id、board_count、order、time、manual、project、place、neighbors、child_order、children；部分使用 JSON expression index。Android 8 的代码特意用 Java 流式解析 JSON，不能据“基础表相同”承诺 Windows 完整 SQLite 文件可以原样移植到所有 Android SQLite 版本；正常跨端方式是事件/业务备份。

## 3. 业务对象、稳定 ID 与版本

`src/model.mjs:63–82` 是网页/Android 的字段白名单；`src/replica.mjs:10–31` 把状态展开成复制实体。

| 对象 | 已有字段/关系 | 与正式升级需求的差距 |
|---|---|---|
| Tasks（含子任务） | id、title、order、quadrant、done、start/end、allDay、repeat、reminder/reminderAt、seriesId/generatedFrom、review、weight、project/place/tags、notes、createdAt、completedAt；parentId 在复制行中 | 状态主要是 done；没有独立负责人、附件、完整状态枚举或统一 updatedAt/rowVersion |
| Notes | id、body、createdAt | 便签成熟基础；没有独立档案/附件关系 |
| Projects | id、name、description、archived | 已有项目分类和任务进度基础；缺目标、阶段、成员、负责人、期限、成果/附件。task.project 引用项目名称而非稳定项目 ID |
| Tags / Places | 字符串名称，复制实体 id=name | 改名会更换复制 key 并更新任务名称关系；不能视为稳定不变的目录实体 ID |

Windows `op_category`（`windows/operations.c:33`）会在同一业务变更中更新项目/地点/标签名与所有关联任务，避免简单改名断联；应保留此兼容路径，再渐进新增 `projectId` 等稳定关联。任务 ID 通常 UUID，重复实例有确定性 ID；SQL 本身不约束 `(kind,id)` 唯一或 parent 外键，正确性由业务层验证与树重建维护。

时间约定：任务计划 start/end 是北京时间无偏移 `YYYY-MM-DDTHH:mm`；reminderAt 是毫秒时间戳。Windows `util.c:6–8` 用 UTC ISO 时间生成 created/completed 时间并将计划时间按 +08:00 解析。不能把这些列一律当无时区字符串。现有“并发版本”主要是设备事件/vector 与数据库整体 revision，不是每个业务实体独立 rowVersion。

## 4. 写入、墓碑和追溯

- Windows `db_local`（`windows/database.c:23`）在 BEGIN IMMEDIATE 中应用业务行、入 outbox、保存 meta，再一起 COMMIT/ROLLBACK；`db_remote:24` 同事务保存远端事件、vector 和 cursor，不再次入 outbox。
- Node `call(commit)`（`src/sqlite-store.mjs:22–29`）及 Android `invoke(commit)`（`ReplicaDatabase.java:30–36`）先检查 expected revision 和设备身份，原子保存 rows/outbox/ack/meta。冲突时不提交。
- 删除通过复制字段 `_deleted` 形成 `entities.deleted` 墓碑；Windows 删除任务及后代见 `windows/tasks.c:13`，不会直接删掉任务 SQL 行。并发删除采用删除优先，见 `windows/database.c:19` 与 `src/replica.mjs:51–59`。
- `entities.record` 保留用于因果合并的事件；已被覆盖的字段事件会被裁剪（`windows/database.c:16–17`、`src/replica.mjs:45–48`），outbox 可在确认后移除。它们不是永久业务审计日志，不能代替未来 WorkflowEvents/状态历史。
- 提醒收据、Windows native-reminder-ledger、同步配置和优化意见是数据库外的本地文件，不应在新实体迁移中遗漏。Windows 便签/项目/任务导出只输出活业务数据，不能当完整复制状态恢复包。

## 5. 已有迁移/备份与实际缺口

**可复用机制。** 网页 `src/account-store.mjs:29–35`、Android `AccountStore.java:35–37` 与 `src/storage.mjs:10–15` 保留旧 state.json，并通过 initialized 标志一次性转入 SQLite；`initializeReplica`（`src/replica.mjs:60–70`）将旧数据和 outbox 一起提交。Windows 有显式业务 JSON 导入（`database.c:29–30`、`dialogs.c:36`），没有同样的自动 JSON 初始化逻辑。

Windows 的“更改保存位置”是真实实现：`windows/storage.c:34–67` 通过 sqlite3_backup API 拷贝一致数据库快照、处理 busy/locked、integrity_check；复制时不直接复制 WAL/SHM/journal，原目录保留。临时阶段目录只在检查成功后启用，位置文件保存失败时原目录仍权威。`windows/dialogs.c:9–17` 阻止同步中或其他窗口使用时迁移，取得独占根锁，保存当前编辑后再迁移。可复用这一备份和恢复经验，但它是目录迁移，**没有证明 schema 升级前备份、版本登记、SQL 失败回滚已实现**。

| 发现 | 代码证据 | 影响及下一步 |
|---|---|---|
| 没有编号 SQL 迁移框架 | 三端入口只 CREATE IF NOT EXISTS；没有 ALTER/user_version/schema_migrations | 新 schema 必须增量编号、备份、事务与失败恢复，不能仅改 CREATE 字符串 |
| entities 新增列会破坏旧位置 INSERT | `windows/database.c:10`、`src/sqlite-store.mjs:13` 是 12 参数 `INSERT INTO entities VALUES(...)`；Android 是 ContentValues | 给该表加列前先改为明确列名；更优先新增独立业务表，保留现有表 |
| 新实体/字段会受旧模型白名单限制 | `model.mjs:63–82`、`replica.mjs:8,35–40` | 项目扩展/工作流必须同步调整数据模型和协议兼容门槛，不能只增加数据库表 |
| Windows v1 最小子任务导入不兼容路径 | `database.c:29` 强制每层 subtasks 为数组；JS `model.mjs:71–74` 允许缺省为空 | `{id,title,done}` 的旧子任务可由 JS 升级，但原生导入路径会拒绝；逻辑路径已确认，尚未原生执行复现 |
| Windows Notes/Projects 同 ID 冲突被跳过 | `database.c:30` 仅在 db_row 不存在时加入；tasks 冲突另造 ID | 与“冲突内容保留副本”的广泛说明不完全一致；需补实体级导入回归，不能宣称所有类型完整保全 |
| Windows 坏 accounts.json 的恢复语义不同 | `gui.c:259` JSON parse 失败时内存重建默认账号；Web `account-store.mjs:25`、Android `AccountStore.java:21` 拒绝坏清单 | 可能隐藏已有账号并在后续保存时覆盖清单；应区分文件不存在与损坏，先保全证据后恢复 |
| 生命周期与审计字段不统一 | Tasks/Notes 有部分时间；Projects/Tags/Places 没有统一 created/updated；事件被裁剪 | 阶段 1 补充语义和可追溯日志，不能把全库 revision 当实体历史 |

这些是源码分析结果；本轮未运行失败夹具或原生程序，不把静态确认冒充 T15/T16 实测。

## 6. 阶段 1 的文件边界和云端验证

优先保留三表复制机制和已有任务结构。公共数据模型先由主 Agent 统一决定：给现有项目扩展稳定关联和必要时间/版本，新增工作流模板/版本/运行实例、往来和附件元数据；模板版本快照及业务事件是新能力。业务表与复制事件映射必须同时设计，附件本体独立存储和哈希传输。

最小修改范围：`windows/database.c`、`src/sqlite-store.mjs`、`android/.../ReplicaDatabase.java` 加迁移调用与明确列写入；`src/model.mjs`、`src/replica.mjs` 扩展模型/同步语义；Windows `query.c` 保持派生缓存可重建；Windows `storage.c` 的快照逻辑可抽取复用。拟新增 migrations/版本登记与旧数据夹具，但具体 schema 编号必须由主 Agent 审核。现有成熟任务、便签、提醒、重复与同步逻辑不整体替换。

用户最新要求编译/测试/打包全部在 GitHub 执行。本报告只推荐云端验证，不执行本地测试：

1. Node runner 运行已有 `tests/*.test.mjs`，明确旧 native-storage.test 是 JS mock，不等于 Android SQLite/Windows C 验收。
2. Windows runner 按原 MSVC 入口构建后，以显式隔离 `--data-dir` 执行 `--self-test`、`--advanced-test`、`--storage-regression`、`--detail-regression`；真实生产路径和 GUI 默认目录禁止用作夹具。
3. 新增同一 v1 最小子任务、Notes/Projects ID 冲突、坏账号清单的三端夹具；执行迁移前后一致性、事务失败注入、WAL 快照、恢复再迁移与新增列兼容验证。
4. Android runner/专用设备环境执行实际 ReplicaDatabase，而非只用 JS bridge mock；逐项标注模拟器与真机结果。T15/T16 当前尚未执行。
