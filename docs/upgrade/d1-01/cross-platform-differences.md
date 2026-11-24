# 三端差异清单

2026-11-24（Asia/Shanghai）。固定源码 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。SQL 对象与类型依据声明、绑定和读端。以下差异是 D1-01-B 的评审输入。

## NULL、缺省与类型转换

三端 `entities` 的五个查询投影列允许 SQL NULL，DDL 未声明列默认值。以下是应用写该列的方法，历史文件或绕过从业务态进入的记录可能不同；JSON 与 SQL 投影不能互相替代。

| 同名 SQL 列 / JSON 路径 | Windows C | Node/Web | Android Java | 兼容影响 |
| --- | --- | --- | --- | --- |
| `parent_id` / `parentId` | 非空 C 字符串入列；空、null、缺失或非字符串绑定 SQL NULL | `parentId \|\| null`；空及假值绑定 NULL | `isNull` 为真写 SQL NULL，其他值经 `optString(.., null)`；显式空串可保留 | 同一根/孤儿用 `IS NULL` 过滤时，空父与 NULL 父可能分流。记录原 JSON 和所在列 |
| `done` / `done` | `truth` 投影为 0/1 | JS truthiness 投影为 0/1，字符串 `"false"` 是真 | `optBoolean` 的布尔读取与 JS truthiness 不同；缺省 false | 非布尔的历史/远端值不能按普遍的 0/1 反推。Android 框架不同版本边界见未确认清单 |
| `quadrant` / `quadrant` | cJSON 数字转 C `int`；非数绑定 SQL NULL | `?? null`，仅缺失/null 变 SQL NULL，绑定仍受参数类型和列 affinity 影响 | `optInt(..., 0)`，缺失或无法转换回退到 0 | 示例为普通未含 quadrant 的便签行。Android SQL 列可记 0，C/Node 为空，而业务 kind 相同。既有远端异常值的查询差异另留 |
| `reminder_at` / `reminderAt` | 非数绑定 NULL，数值转 `sqlite3_int64` | 有限 JS `number` 才绑定，非整数能进入参数 | 缺失/null 绑定 NULL，非空走 `optLong` | 小数和数字文本可能有截断、回退或 NULL 差异。正常 UI 根据规则产生 Unix 毫秒 |
| `start` / `start` | 非字符串或缺失经 `str` 读为空串 | `start \|\| ''`，真值传入 SQLite | `optString`，缺省为空；显式 `JSONObject.NULL`、非串的结果由平台实现决定 | SQL 空与 JSON 空、null、缺失必须分别观察。业务日期查询读取墙钟串 |
| `conflicts` | `db_put` 序列化传入的 JSON | 缺省/假值回退 `[]` | `optJSONArray` 失败回退字符串 `[]` | 从空冲突数组不能判断字段来源及截断历史 |

链接 [C SQL 绑定](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/database.c#L75) · [Node SQL 绑定](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/sqlite-store.mjs#L13-L28) · [Android SQL 绑定](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L30-L36)。

| 行为维度 | 发现与边界 |
| --- | --- |
| SQL 声明的缺省值 | 五个投影字段无列 DEFAULT。`meta` 初始行、活动状态和业务字段默认值由程序产生。Windows 新原生库直接置 `initialized=true` 且填设置，Node/Android 初始化行先置 false，Android 初始 `settings={}` |
| 事件字段缺省 | `values` 未含该字段表示事件未改它。读取投影补出的空串、0 或继承值不证明历史事件设置过该字段 |
| 业务字段 null | J `quadrant/project/place/tags` 等对缺失或 null 继承父值。`repeat/reminder` 对缺失/null/无效形状折为 null。显式的这种 null 在原事件中仍有意义 |
| 业务字段空串 | `project/place` 的显式空串阻止 `??` 继承，`createdAt` 对空串用 `\|\|` 回退父值，`completedAt=''` 表达重开清空，`start/end=''` 表达未设日程 |
| 强制转换 | JS `text` 仅接收实际字符串并截 UTF-16 序列，`done/allDay/archived` 经 `!!`，`weight` 数值化限制 0–100，`order` 只接有限数。C GUI 表单、C `db_import`、Java bridge SQL 绑定分别有自己的转换边界 |
| 主键空值风险 | `entities` 的 `key TEXT PRIMARY KEY` DDL 没有额外 `NOT NULL`。程序正常入口以 JSON 编码的 kind/id 绑定，不能从 DDL 推断任意外部写入都受业务 ID 规则保护 |

依据 [Windows 初始数据库](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/database.c#L347) · [Android 初始数据库](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L12-L22) · [JS 默认与业务字段](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L62-L85) · [JS 事件合并](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L65-L103)。

## 同义异名、字段缺失、写入和白名单

| 问题 | 已确认源码事实 | 映射风险 |
| --- | --- | --- |
| 父子表示 | UI 和业务 JSON 的 `subtasks` ↔ wire `parentId` ↔ SQL `parent_id`。J 与两种原生导出均重组，遇到缺父或环有退化路径 | 不能由重组结果还原有问题的原父引用 |
| 提醒同名异型 | 表单名 `reminderAt` 是自定义墙钟字符串，保存进 `reminder.at`；任务对象 `reminderAt` 是数值毫秒或 null，再镜像为 SQL `reminder_at` | 字符串不应直接解释成数字字段；规则、调度时间和回执需要分开 |
| 删除同义异型 | 事件 `_deleted`、合并行 `deleted`、SQL `entities.deleted` 名/型不同。`projects.archived` 是业务归档 | 业务状态已无某 ID 不能直接断言从未存在或已经 ACK |
| 计数同名语义 | Manifest `heads`、本地 `cursors` 都是批次索引；`vector` 是 Actor 的事件 seq。各端 `queue` 只服务本地 outbox 行 ID | 不能从其中一套计数恢复另一套；`device` 与目录账号 ID 不是同义 |
| 业务白名单与协议白名单 | 当前三端 wire 使用五种 kind，C `protocol_event_valid` 与共享 JS `validateEvent` 接受符合语法的字段，均禁止在 wire 放 `subtasks`；JS 业务投影另重建字段白名单，`settings` 不成为同步 kind。Java 行写入和业务导出有各自的入口与分支 | 收到合规未知字段后原始 `record` 可能保真，JS 业务读写、导出无法承诺往返。未知 kind 不具备旧端安全转发能力 |
| JS 与 C 写入差异 | J 从规范化业务态取字段差分后写；C GUI 操作按本地行生成特定变化，C 业务导入 1/2 版与原生文件/同步版本拒绝走不同入口；Android bridge 由 J 生成业务事件，Java 用命名 `ContentValues` REPLACE | 限制、默认、未知字段及现存状态合并需逐入口处理。Java REPLACE 和 SQL `ON CONFLICT … UPDATE` 的变更动作不能视同 |
| 位置型写入 | C、Node 的 `entities VALUES(...)` 依赖整表列序，Android 主行给出键名。三端部分 `meta`/`outbox` 初始化或入队仍为位置型。Windows 索引派生表也有位置插入 | 旧客户端与新表演进存在直接耦合。后续评审先拿调用点与 schema 版本约束 |
| 分类关联 | `task.project` 值是项目名称，项目实体另有 ID。`tags`、`places` 实体以名称作为 ID，而业务状态只有字符串。绕过本地 UI 的事件没有 SQL FK 做引用修正 | 改名、同名、缺项须保留原关联字符串，确认唯一对应前不补 FK |
| 平台独有字段 | Android 原生番茄钟、Widget、原生每日摘要和反馈库；Windows GUI 搜索派生表。Windows 和 JS 页面用不同读端聚合已完成 weight | 番茄钟及反馈现有数据不可从任务或同步导出补出。搜索派生信息可以重建，但要保留独立统计口径 |
| Windows v1 安全拒绝 | Native WebDAV 导入未实现完整自动新旧转换。Windows 本地业务 JSON 导入可接受 `version:1/2` | 不能用本地 `db_import` 成功推断旧 WebDAV 已能导入。详见阶段 0 核查 |

链接 [C 协议校验和合并](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/database.c#L120-L146) · [C 业务导入导出](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/database.c#L343-L347) · [JS 业务重建](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L8-L36) · [JS 协议校验](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L38-L72) · [阶段 0 同步审查](../phase0-final-review/sync-safety-review.md)。

## 时间、删除与索引的独立差异

| 维度 | 平台差异 / 无损要求 |
| --- | --- |
| 日程与日期 | `start/end/repeat.anchor/reminder.at` 是 Asia/Shanghai 墙钟分钟串，`repeat.until` 是日历日期。`createdAt/completedAt` 是存储时间文本。Windows 快速便签写无偏移的 UTC+08 分钟串，详情便签用 UTC ISO，导入后也可保留无偏移旧记录。比较和分桶不能仅靠字段名字判断时区 |
| 墙钟和逻辑时钟 | `reminderAt`、提醒延迟、租约到期、原生 timer 墙钟及单调计时锚点等使用毫秒；`clock`、`seq`、`revision`、`id` 和 batch `index` 是逻辑数字。Android 番茄钟的 `durationMinutes` 是分钟，日桶和其计数/累计分别保留 |
| 循环生成 | Windows `task_complete` 查到同 ID 的行（含墓碑）即不重建，JS 以活跃树判重。Windows 重复子任务 `createdAt` 为复制时刻，JS 使用下一实例计划时刻。C `repeat.interval` 异常值回退 1，JS 限制到范围边界 | 
| 统计 | Windows 逾期看 `start`，WebView/JS 依 `end \|\| start`；JS `completionDay` 对无偏移 datetime 使用日期部分，近七天 `taskStats` 使用 `Date.parse`；Windows 统计由 SQLite 加 8 小时，Android 原生摘要另用本地策略 |
| 删除业务 | `tasks` 树删除由 W 的递归 SQL 取键或 J 从活跃业务树移除后差分；`_deleted` 同步，工作表保留。类别引用修正为显式业务改动；项目归档保持活跃行，没有同样的删除语义 |
| 删除队列 | 三端 ACK 或清理路径物理删 outbox；无每 LAN/WebDAV 目标状态。搜索缓存的清理、重建以及本地偏好/pruning 与业务删除分别考虑 |
| 索引 | 三端索引 DDL 相同的核心部分为 `task_filter(kind,deleted,done,quadrant,start)`、`task_reminders(kind,deleted,done,reminder_at)`、`task_parent(parent_id)`。C GUI 另有 10 个索引以及 2 个搜索触发器，Node 的业务过滤在 JS，Android SQL index 支持原生任务和提醒查询。三端 SQL affinity、NULL、空串、文本归一化和过滤条件差异仍可改变读端结果 |
| 搜索 | Windows trigger/dirty 缓存和 `gx_normal/gx_match` 各自定义索引内容、后代聚合与更新，JS 内存 NFKC/小写/空白词 AND 以及分实体字段集，Android 原生 task picker 再有一条不同入口。程序定义有无和已命中实际运行计划分开 |

链接 [Windows 完成与递归删除](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L3-L12) · [Windows 索引与搜索](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/query.c#L3-L15) · [Windows 统计](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/dashboard.c#L3) · [JS 日期/搜索筛选](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L28-L61) · [JS 统计/循环](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L4-L30) · [Android SQL 查询](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L38-L76)。
