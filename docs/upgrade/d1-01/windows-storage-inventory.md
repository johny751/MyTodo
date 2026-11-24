# Windows C 原生端存储盘点

盘点日期 2026-11-24（Asia/Shanghai）。源码引用固定于 [`ca00c2504a31198f2d49e787483f9ebd2a48a7da`](https://github.com/johny751/MyTodo/tree/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows)。下文的 `windows/文件:行号` 均指该提交。本页依据 C 源码、生产入口和 SQL 字符串作静态盘点。

## 入口和 SQLite 目录

`gui_main → db_open → ui_query_init`、账号切换和数据目录迁移后重开调用两个初始化入口。CLI 可直接调用 `db_open`。GUI 默认数据根 `%LOCALAPPDATA%/GxTodoLocal/data`，支持显式 `--data-dir` 和已记录位置，非 `GX_PUBLIC_RELEASE` 构建另有旧开发目录回退。默认账号数据库放数据根，其他账号放 `accounts/<account-id>/`。数据库文件名 `tasks.sqlite`，打开标志为 READWRITE、CREATE、FULLMUTEX，声明 WAL、FULL synchronous、5000 ms busy timeout。核心 DDL 与 GUI 附加 DDL 有独立入口，核心入口可以创建只有核心对象的库。见 `windows/gui.c:254–259`、`windows/main.c:2`、`windows/dialogs.c:26`、`windows/storage.c:53–66`。 [核心 DDL](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/database.c#L347) · [GUI DDL](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/query.c#L9)

### 所有应用表和 SQL 字段

以下 7 表均在账号库中。3 个核心表有 16 列，4 个 GUI 表有 6 列。表中的 NULL 列说明声明和写入行为。所有 22 列的 DDL 都无 `DEFAULT` 子句。4 个 `TEXT PRIMARY KEY` 是普通 rowid 表上声明的文本主键，DDL 未另写 `NOT NULL`。应用写入使用非空文本键路径。2 个 `INTEGER PRIMARY KEY` 为 rowid 别名。TEXT 主键对应 SQLite 自动索引，区别于后文的显式索引。未看到应用 SQL 创建额外视图、外键、虚表、`AUTOINCREMENT` 或编号 SQL migration。元数据 `version=2`、搜索缓存版本 4 和同步协议版本各有不同入口。

| 表 | 列与声明 | SQL NULL、类型转换和行为 | 分类及未来无损映射依据 |
| --- | --- | --- | --- |
| `meta` | `id INTEGER PRIMARY KEY CHECK(id=1)` | 固定插入和查询 1 | 同步基础设施及本地设置容器。 |
| | `value TEXT NOT NULL` | 初始化显式绑定 JSON object；读取无行和解析失败分别报错；`db_meta_save` 要求 UPDATE 恰好一行 | 原样保存 JSON 并按下节拆分用途。 |
| `entities` | `key TEXT PRIMARY KEY` | JSON 编码的 `[kind,id]` 字符串，边界是事件校验器 | 保留键与原始二元组，不能靠标题或分类名重建所有身份。 |
| | `kind TEXT NOT NULL`、`id TEXT NOT NULL` | 从复合键解码后绑定，非独立外键或唯一约束 | 保留二元组。物化 JSON 的 `id` 取键里的 ID。 |
| | `data TEXT NOT NULL` | 紧凑 JSON object，由保留的 record events 物化，SQL NULL 与 JSON 内 null 不同 | 同步业务数据，保留 JSON 字段类型与存在性。 |
| | `record TEXT NOT NULL` | 紧凑 JSON object，`{key,events}`；内层 event 不重复 key | 同步基础设施，保留保留下来的候选、因果上下文及 tombstone。 |
| | `deleted INTEGER NOT NULL` | cJSON true 绑定 1，否则 0；从 record 的 `_deleted` 候选派生 | 筛选投影，不能用布尔值替代 record。 |
| | `conflicts TEXT NOT NULL` | 紧凑 JSON array，物化候选去重后生成 `{key,field,values,title}`，无冲突写 `[]` | 派生数据，按 record 可重算；候选含原值及来源信息。 |
| | `parent_id TEXT` | `data.parentId` 非空字符串才绑定 TEXT；空串、JSON null、缺省或异型均投影为 SQL NULL | 关联投影，无 FK 约束。无损来源是 data/record。 |
| | `done INTEGER` | DDL 可 NULL，写入始终绑定 cJSON 严格布尔 true/其他 → 1/0 | 派生投影。0 不能逆推 false、null 或缺省。 |
| | `quadrant INTEGER` | cJSON number 通过 C int 绑定，其他绑定 SQL NULL | 派生投影，不能据此恢复原数值精度或类型。 |
| | `reminder_at INTEGER` | cJSON number 通过 64 位整数绑定，其他绑定 SQL NULL；Unix ms | 派生投影，保留事件中的原值和规则。 |
| | `start TEXT` | DDL 可 NULL，正常写入绑定字符串，缺省、JSON null 和异型经 `str()` 折叠为 `''` | 派生投影，日历解释见下节。 |
| `outbox` | `id INTEGER PRIMARY KEY` | `meta.queue+1` 显式分配，按 id 升序读，读取转 cJSON number | 同步基础设施，保留 id 和对应 event，区别于 actor seq。 |
| | `event TEXT NOT NULL` | 紧凑 JSON object，包含 key；ACK 对 `id<=through` 物理删除 | 保留原序及未确认事件；没有逐目标投递字段。 |
| `native_search` | `key TEXT PRIMARY KEY`、`text TEXT NOT NULL` | 实体复合键、原始拼接搜索文本。字段缺省和 JSON null 由 `coalesce` 变成 `''` | 派生缓存，可用实体和当前搜索规则重建。 |
| `native_search_normal` | `key TEXT PRIMARY KEY`、`text TEXT NOT NULL` | 规范化后的行文本，可包含仍存活的后代任务文本 | 派生缓存，删除、祖先变化和升级会触发失效或重建。 |
| `native_search_dirty` | `key TEXT PRIMARY KEY` | 待重建键，触发器先移除再添加；查询刷新完成后删除标记 | 本地缓存工作队列，和业务 outbox 含义不同。 |
| `native_index_meta` | `version INTEGER NOT NULL` | 无主键；初始化若找不到版本 4 会重建，再清表并插入 4 | 本地缓存版本。 |

`db_put` 全 12 列位置型 `INSERT INTO entities VALUES(...)`，冲突更新显式列名。核心 `meta` 首行、outbox 写入/重建、GUI 若干缓存写入同样依赖目标列顺序。新增 SQL 列时 DDL 无默认值、写入按位置和 SQLite 动态类型均须单独考虑。见 `windows/database.c:15–75,335–347`、`windows/sync.c:169–198,236–245`、`windows/query.c:9–15`。

### 所有显式索引和触发器

以下显式索引均建于 `entities`，按 DDL 顺序列出列或表达式。均为非 UNIQUE，未声明局部 WHERE、显式 collation 或 DESC。名称用于源码检索，表内未推断具体执行计划。

| 入口 | 索引 | 键 |
| --- | --- | --- |
| 核心 | `task_filter` | `kind,deleted,done,quadrant,start` |
| | `task_reminders` | `kind,deleted,done,reminder_at` |
| | `task_parent` | `parent_id` |
| GUI | `native_entity_id` | `kind,id,deleted` |
| | `native_board_count` | `kind,deleted,quadrant,done,parent_id,start` |
| | `native_order` | `kind,deleted,quadrant,done,start,json_extract(data,'$.order')` |
| | `native_time` | `kind,deleted,quadrant,done,CASE WHEN start='' THEN '9999' ELSE start END,json_extract(data,'$.createdAt'),key` |
| | `native_manual` | `kind,deleted,quadrant,coalesce(json_extract(data,'$.order'),0),key` |
| | `native_project` | `kind,deleted,json_extract(data,'$.project')` |
| | `native_place` | `kind,deleted,json_extract(data,'$.place')` |
| | `native_neighbors` | `kind,deleted,parent_id,quadrant,coalesce(json_extract(data,'$.order'),0),key` |
| | `native_child_order` | `kind,deleted,parent_id,coalesce(json_extract(data,'$.order'),0),key` |
| | `native_children` | `kind,deleted,parent_id,json_extract(data,'$.order')` |

`native_search_insert` 在 INSERT 后执行，`native_search_update` 在 UPDATE OF data 后执行。二者更新当前行的原始文本、清除归一化缓存并把当前行和使用 `new.id` 递归识别出的任务祖先标脏。两者随 `ui_query_init` drop/recreate；读搜索前以事务刷新 dirty 项，仅正常化存活行。没有发现 DELETE 触发器，也没有发现生产 SQL 对 `entities` 执行物理 DELETE。重挂父级时旧祖先缓存失效是否有其他路径补偿为 **NEEDS INVESTIGATION**，触发器语句本身使用新行。连接注册 `gx_normal`、`gx_match` 为确定性 SQL 函数，查询构造实际使用规范化后按空白分词（至多 64 项）和 `instr` 的逐词 AND。缓存使用 NFKC、`CharLowerBuffW`，覆盖 title、body、name、description、notes、review、project、place、tags、start、end、完成状态和循环/提醒标识。 [SQL 和查询路径](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/query.c#L4-L15)

## 业务字段、调用链与时间语义

公共写入链为 GUI/导入 → `db_edit_data` 或直接构造 changes → `db_local` → `record_apply` → `record_row` → `db_put` + queue + meta（同事务）。本地普通编辑按 after 中存在且变化的字段发 patch。新建加 `_deleted:false`。普通编辑中 after 省略字段不等价于发送 JSON null。公共读取链为 `query_count/query_rows` 的筛选列表及 `db_row` 的详情读取。同步收包经 `pull → db_remote` 更新实体、因果状态及游标，快照也以 record 为输入，远端合并不重排本地业务编辑进 outbox。 `cJSON` 数值读用 double，`str()` 对非 string 返回 `''`，`truth()` 仅识别 JSON true，`num()` 为 `cJSON_GetNumberValue`，非数值读为 NaN。UI 控件默认和 SQL 存储默认各自独立。 [编辑和导入导出](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/database.c#L335-L347) · [C 类型辅助函数](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/util.c#L1-L8)

### 四象限任务、子任务及关联

任务和子任务同为 `tasks`。下表列出 22 个任务 JSON 字段及循环、提醒子字段。详情 `populate/collect/detail_save_record` 读取、编辑与提交，`task_default` 初始化，任务专用操作再沿公共链写入。

| 字段 | 新建值、空值类型和读取 | 创建/更新路径及关系 | 无损映射与风险 |
| --- | --- | --- | --- |
| `id` | UUID string；物化从键强制取 id | `task_default`，重复任务另生成稳定 ID，显式业务导入遇同键异内容可另发 UUID | 保存原键/ID 与实际引用。业务导入对撞另发身份，不是保留原身份的恢复。 |
| `title` | 初始化 `''`；详情保存验证非空、宽字符长度≤2000 | `detail.collect` 的自由文本；列表/搜索/提醒展示 | 保留原字符串，避免按 UI 长度截断旧数据。 |
| `quadrant` | number；新建由控件或调用方传 q；看板用投影筛选 | 详情编辑、`op_move/op_step`、子任务快添继承选中象限 | 保留原值；列投影截断和渲染回退不可当作历史值。 |
| `order` | `task_default` 为 `time(0)` 秒值，正常建/移再按现有最大值加 1024，移动可用间距数值 | `detail_save_record/quick_add`、`op_move/op_step`；手动排序 `coalesce(order,0),key` | 保存原 JSON number 和排序域；实际语义是排位数值，不普遍代表时间。 |
| `done` | boolean false 新建；严格布尔为真 | `task_complete` 编辑，写 `completedAt`、重算 `reminderAt`，完成可触发生成下一次任务 | 保留原布尔及候选，不能从统计恢复。 |
| `start`、`end` | 两字段初始 `''`；有值为分钟粒度 `YYYY-MM-DDTHH:mm`，校验开始≤结束 | 详情校验/编辑，`ui_open` 可填日历时间，快添子任务填当前分钟，重复任务移位 | 保留原字面量和 UTC+08:00 解释。缺失、null 和空串用原 JSON 区分。 |
| `allDay` | boolean false 新建 | 详情 checkbox 写，日期时间验证仍在任务路径 | 保留布尔及日期字段，不由时间恰为午夜推断。 |
| `createdAt` | `now()` UTC ISO 秒和毫秒并有 Z；快添子任务继承新建行为 | 默认/循环生成，时间排序使用 JSON 字符串 | 保留原时区形式；导入保留历史字面值。 |
| `completedAt` | 新建 `''`；完成写 `now()` UTC 字符串，重开恢复 `''` | `task_complete`、循环复位；统计用 SQLite datetime +8 小时取日 | 保留完成时间的完整形式与空串，当前值不是历史完成日志。 |
| `parentId` | 根任务 JSON null；子任务父 ID string；读端非空才关联 | `quick_add`、`ui_open` 的带父参数路径、`import_task` 把嵌套 subtasks 扁平化、`copy_children` 生成副本。快添继承 project/place/tags 但开始时间取当前分钟，详情新建可另继承父任务 start/allDay。查询通过 parent_id 和父任务存活状态 | 保留悬空父引用、循环和原始 null/缺省；导出遇父缺失、循环或深度保护会根化。 |
| `seriesId`、`generatedFrom` | 各初始为 `''`；循环生成填 ID 字符串 | `task_complete` 的下一次任务及 `copy_children` 的系列/来源追踪 | 维持源 ID 和系列 ID 的两种责任；不能由相同标题重建系列。 |
| `review`、`notes` | 各自 string，初始 `''` | 详情自由文本分别读写；二者都进入搜索。循环移位清 review | 保留两字段，不合并成独立便签或同一个备注。 |
| `project`、`place` | 两者 string，初始 `''` 表无分类；使用名称文本 | 详情和按组新建写入，快添继承，分类重命名/删除改任务。SQL 镜像只索引 JSON 表达式 | 保留原名称及空值形式。重名、悬空分类、现存 category ID 与名称关系不能无证据换为 ID。 |
| `tags` | 默认 `[]`；详情拆分输入、去重，最多 30 项 | 子任务继承数组，分类重命名/删除改数组，`json_each` 筛选 | 保留原数组顺序、值、存在性；不要用 UI 重新分词导出旧值。 |
| `weight` | number，默认 0；详情 `atof` 后限制 0–100 | 统计对完成任务聚合分值；JSON 表达式空值聚合回退 0 | 保留原值/类型，不从统计反推。 |
| `repeat` | object 或 JSON null，新任务 null | 详情与完成/下一次生成使用下表字段 | 以对象原样保存现有字段，缺省和 null 原样保留。 |
| `reminder` | object 或 JSON null，新任务 null | 详情与 `reminder_recalc` 使用下表字段 | 原规则和计算结果分别记录。 |
| `reminderAt` | number Unix ms 或 JSON null；默认 null | 规则重算；完成时清空、重开重算；scheduler 读 `reminder_at` 投影 | 保留派生结果和原规则；同一个规则受日期及端实现解释影响。 |

| 对象子字段 | 存在、缺省及单位 | 读写路径和依据 |
| --- | --- | --- |
| `repeat.frequency` | `daily/weekdays/weekly/monthly/yearly`；未启用时整对象 null | `detail.collect` 写、`tasks.next_time` 分支读。 |
| `repeat.interval` | 整数，UI 夹 1–365，详情缺少字段显示 1，执行越界回退 1 | 保存存量不足以逆推出执行回退前值，应保留原值。 |
| `repeat.weekdays` | number[]，周日为 0、周一至周六为 1–6；未改勾选时保留旧数组 | weekly 使用选中日，weekdays 分支不以旧选中周末为准。 |
| `repeat.anchor` | UTC+08:00 分钟字串；如果原 start 未改且已有 anchor 则保留，否则取 start | 无有效 anchor 时执行回退 current start。循环子任务移位可更新 anchor。 |
| `repeat.until` | `YYYY-MM-DD` 或 `''`；缺省读取为空 | `validate_task` 校验有效日期和界限，`next_time` 比较日期，列表也使用该值过滤。 |
| `reminder.mode` | `offset/day/custom`；无规则时整对象 null | `detail.collect` 写；`reminder_recalc` 读；部分旧自定义数量可保留原规则。 |
| `reminder.minutes` | number，offset 分钟；常用 0/5/10/15/30/60，自定义界限 0–525600；非相关模式通常为 0 | 生效时 `time_ms(start)-minutes*60000`。 |
| `reminder.days` | number，day 天；UI 0–3 或自定义 0–365；非相关模式通常为 0 | 生效时根据 start 日期的 09:00 减 `days*86400000`。 |
| `reminder.at` | custom 时为分钟字符串，其他模式 `''` | custom 直接 `time_ms(at)`。无有效结果或已完成写 JSON null。 |

任务删除由 `task_delete` 递归收集存活后代并发 `_deleted:true`，`record_row` 在未被因果覆盖的删除候选中有 true 即标 tombstone。业务导出过滤 deleted=1。循环使用有界子树复制，按生成的稳定键检查已有实例，包括 tombstone，不能由当前存活视图恢复完整生成状态。日期函数 `time_ms/format_ms` 固定偏移 28800000 ms（UTC+08:00），`now()` 则生成 UTC 带 Z；`wall_ms` 为 Unix ms。 [详情编辑与子任务](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/detail.c#L9-L18) · [任务完成、循环及删除](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/tasks.c#L7-L12) · [验证及计算](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/operations.c#L36-L38)

### 便签、分类、统计、搜索和番茄钟

| 数据 | 字段级路径和语义 | 持久化及映射边界 |
| --- | --- | --- |
| 独立便签 `notes` | `id` UUID string、`body` 非空输入 string、`createdAt` string。便签首页 `save_note` 用 `format_ms(wall_ms())`（UTC+08:00 分钟，无 Z）；详情新建复用 `task_default → now`（UTC 毫秒带 Z）。详情编辑 body，经公共链更新；便签按 createdAt 字符串降序并搜索 body；删除经 `op_delete_entity` 发 tombstone | 两种时间均为实际写入形式，旧条目不可统一假定为同一时区或精度。任务 `notes` 与反馈 `ideas` 均有其他实体身份。 |
| `projects` | `id` string；`name` string；`description` string；`archived` boolean。详情自动补充、目录对话框、业务导入是写入口；重命名可保留项目 ID 并改任务名字段值；删除实体 tombstone 并清任务名称为 `''`；归档是字段修改，SQL 以 `coalesce(archived,0)` 筛选 | 保留项目行及按名任务引用各自的原始值。当前分类的唯一性查验来自写入代码，数据库无名称唯一约束。 |
| `tags` / `places` | `id` 和 `name` string；详情按名称补建，分类改名时用新名作为新 ID，旧键 tombstone，同时更新 task.tags 或 task.place；业务 JSON 导出只保留名称字符串。有同类旧数据额外字段时，通用事件和原 record 是核对来源 | 不能从只含名称数组的业务导出恢复原元数据、异名键、候选和 tombstone。 |
| 统计 | 即时 SQL 汇总任务 `done`、`start`、`quadrant`、`weight`、`completedAt`、`deleted`；总数、完成数、未完成数、逾期数、七天完成趋势、象限、完成分值；分类查询附加 `_nativeTotal/_nativeDone` 到读取对象 | 派生数据且无统计表；保留源字段时可按旧口径重算。 |
| 搜索 | 前述三个搜索辅助表和版本表；搜索输入、过滤和分页对象、行缓存驻内存 | 查询时缓存版本及内容可重建；无需把搜索派生文本映射为新业务数据。 |
| 番茄钟 | Windows C 生产 `.c/.h` 的 `pomodoro` 和相关持久化路径未发现；当前 C 同步种类不含番茄钟 | Windows 原生端存量及 UI 能力 **未见对应生产实现**；Node/Web 功能须独立盘点，不从 Windows 缺失反推其他端。 |
| 附件 | C 生产存储与同步入口未找到附件业务实体、引用的专表或独立内容传输；云 Gzip 为事件/快照分片 | 当前受查版本无已确认附件映射；用户外置文件和旧版本扩展 **UNKNOWN**。 |

[便签创建](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/catalog.c#L9) · [详情打开](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/gui.c#L73-L80) · [分类修改和删除](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/operations.c#L32-L33) · [统计](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/dashboard.c#L3) · [分类查询](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/query.c#L11-L15)

## SQLite JSON 元数据和同步对象

### `meta.value` 的字段

数据与设置、同步基础设施、缓存及运行租约共用一行。创建路径为 `db_open`，`db_meta/db_meta_save` 负责读写并保留当前 JSON。下表区分首次写入和后续字段。

| JSON 字段 | 类型、缺省与单位 | 读写链及保留边界 |
| --- | --- | --- |
| `version` | number 2，创建显式写入 | `db_open` 对不匹配的元数据或不合法 actor 拒绝。保持存储身份。 |
| `revision`、`dataRevision` | 两者 number，初始 0 | 保存元数据增加 revision，data 参数真时另增 dataRevision。快照生成以 dataRevision 检查实体是否变化，生产代码不是完整历史日志。 |
| `actor` | UUID string，协议检查区分大小写，1–80 位 ASCII 字母/数字/连字符 | 新库生成，事件和批次身份复用；不能由账号名称派生。 |
| `seq`、`clock`、`queue` | 各 number，初始 0；协议计数使用安全整数边界 | local 分配 actor seq 与逻辑 clock，remote 取 clock 最大值，queue 分配 outbox ID。保留各自当前位置。 |
| `vector`、`cursors` | 各 object，初始 `{}`；Actor → 非负计数 | local/remote 维护 vector 的因果事件 seq，pull/ACK/checkpoint 维护 cursors 的 batch 进度。绑定新 scope/epoch 清 cursors。不能用某一方的计数填另一方。 |
| `scope`、`epoch` | 各为 null 或 string；初始 null | scope 为 JSON 序列化 `[username,folder]` 字符串，epoch 取 manifest；已绑定后更换 scope/epoch 会事务内重整 outbox 并清进度/缓存。原样保留绑定关系，不以目录名覆盖。 |
| `pending` | 初始 null；有效为 object | `prepare` 写 `{device:string,index:number,through:number,body:string,path:string}`；ACK 清为 null。body 保存待发布原始紧凑 JSON，index 是批次序号，through 是 outbox 行界限。发布前重新校验，保留原 body、路径及边界。 |
| `initialized` | boolean true，新建显式写入 | 当前 C 初始化标记，是否有历史版本其他语义 **UNKNOWN**。 |
| `settings` | object，初始 `swipeMenu:true, swipeComplete:true, longPressMs:3000, undoMs:8000` | GUI 读取，设置对话框秒数转毫秒（分别限制 300–10000 和 3000–30000）后 `op_settings` 写。业务导出附带，C `db_import` 不把备份 settings 应用回本地。保留设备本地设置和被省略字段。 |
| `lease` | 初始字段缺省；同步中 `{token:string,until:number}`，until 为 Unix ms；匹配 token 的 release 写 null | 运行租约存入 DB 与 Sync 实例对应；通常设为当前时间+120000，距到期小于 45000 ms 时续期。应区分磁盘上的现有状态与进程重启后的会话授权。晚到本地写的实际隔离仍是阶段 0 的开放风险。 |
| `cachedManifest` | 初始缺省；绑定变化时 null；成功同步后 `{value:object,etag:string}` | 相同 scope 且强 ETag、有效 manifest 时可使用 304 缓存。缓存与远端 manifest 身份相关，不能作为完整同步历史。 |

[元数据保存](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/database.c#L15-L37) · [同步绑定及快照读](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/sync.c#L169-L218) · [同步准备及 ACK](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/sync.c#L219-L245) · [会话与缓存](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/sync.c#L364-L419)

### 线上对象及存储位置

| 对象或路径 | 字段、写读与用途 | 无损保留边界 |
| --- | --- | --- |
| event、record、tombstone、conflicts | 外发 event `{key,actor,seq,clock,context,values}`。record `{key,events}` 收录去掉 key 的字段事件，因果覆盖后会删去旧字段/空事件。冲突按 clock、actor ASCII 字节序、seq 比较，_deleted 候选中的 true 仍优先决定删除。冲突候选由 `record_row` 生成 `{value,device}`，device 取事件 actor | 同步基础设施。只见已保留事件候选，无法从现存 record 推回全部历史。保留 record 与待投递事件各自的原数据及 key。 |
| 事件白名单 | key 解析为 `tasks/notes/projects/tags/places` 与有效 UTF-8 ID（最多 800 字节）；拒绝 NUL、重复 value 字段名及 `__proto__/constructor/prototype/subtasks`。对其他字段无逐业务字段白名单，详情与业务导入路径另有验证 | 对新种类支持应先确认三端守卫。业务字段可随存量 JSON 存续的能力不能推断未知 kind 可以接收。 |
| `v2/b-<actor>-<index>.json.gz` | batch `format:"gxtodo-batch",epoch,device,index,events`；最多 500 事件，准备时写 pending，云端不可变 PUT，对已存在同名文件核对解压后正文；`pull` 校验并事务应用 | 保存 epoch、device、序号及正文，不代填为本地 actor seq 或 outbox ID。 |
| `v2/manifest.json` | `format:"gxtodo-delta",version:2,epoch,heads,snapshot,legacy`。C bootstrap heads={}、snapshot=null、legacy=null。heads 是 actor→批次高水位，最多 256 actors；强 ETag 用于 CAS | 保留 scope/epoch、part hash 与进度关系。ACK 在发布成功或确认已有同一批次后联动本地游标、pending 及 outbox。 |
| 快照 descriptor 和 `v2/s-<id>-<part>.json.gz` | descriptor `{id,parts:[{path,sha256}],cursors,createdAt}`；part `{id,epoch,records}`；`make_snapshot` 取清空 outbox、无 pending 且追平 heads 的实体 record。下载逐片验证哈希与身份、逐片调用 db_remote，各片成功后单独更新 cursors | 复制记录、分片内容和 Hash。cursor 保留不代表前面已提交的合法分片回滚。 |
| WebDAV `state.json` | v2 bootstrap 围栏由 C 创建 `{format:"gxtodo-sync",version:2,backup:null,message}`。读到旧版、无效守卫或声明非空 backup 时在创建 manifest 之前停止，原生 C 不做 WebDAV v1 导入 | 将围栏和旧云备份证据分开保留。本地业务 JSON 文件导入和 WebDAV v1 导入的入口不同。 |

未发现 LAN 投递表、LAN cursor 或每传输目标独立 ACK 的 C 生产路径。当前 outbox 全局 ACK 语义和过期会话风险均应延续阶段 0 边界。 [事件验证及物化](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/database.c#L120-L334) · [发布、围栏、快照](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/sync.c#L236-L361)

## 应用文件与内存状态

| 路径或持有者 | 字段与实际路径 | 分类、删除与保存边界 |
| --- | --- | --- |
| 数据根及账号目录 `tasks.sqlite`、`tasks.sqlite-wal/-shm/-journal` | DB/WAL 声明见核心入口；旧 journal 也是 `storage.copy_tree` 显式跳过的 SQLite 侧文件形式 | SQLite 主库和引擎内部状态。目录迁移对 `.sqlite` 用 SQLite backup API + integrity_check，跳过 sidecar。 |
| 根 `accounts.json` | `{version:number,activeId:string,accounts:[{id,name,defaultFolder,createdAt?}]}`，初始 version 1、default/账号 A/GxTodo，无 createdAt；新账号填 UTC 时间。默认仅在载入无解析值时构建内存对象，保存、切换和新建才有写路径 | 设备本地账号路由。保留 ID、目录、作用域和名称的关联。未见账号删除入口。 |
| `%LOCALAPPDATA%/GxTodoLocal/location.json` | `{version:1,dataDir:string}`，保存时写规范本机目录；启动读取校验目录和数据库或账号清单，已选目录不可用会停启动 | 设备本地路径偏好，保留原值；换设备时可用性须确认。 |
| 根 `.gxtodo-root.lock`，`<destination>.gxtodo-migrate-<uuid>/` | 锁文件服务于共享/独占句柄，目录迁移复制/校验后启用。失败时仅清理本操作创建的 staging，已移动的验证副本可保留。文件写入通用辅助使用 `<name>.tmp-<pid>` → 替换目标，失败清理临时文件 | 文件级运行互斥及临时文件。现行根目录搬迁对 SQLite 备份和其他文件分别处理，不能推断为跨文件一致恢复点。 |
| 账号 `sync-config.enc` | 保护对象 `folder,username,password,enabled,autoSync`，缺文件时 folder=GxTodo、autoSync=true，其他缺省。`config_read/save` 支持前缀 `gx-dpapi-v1:` + hex、DPAPI 保护 UTF-8 JSON；旧裸 hex 保护 UTF-16 数据；读取失败保留原文。GUI 配置空密码输入保留既有密码 | 设备本地凭据与同步接入配置。保留原密文及对应存取边界，不能从 SQLite 或跨端业务模型重建。 |
| 账号 `native-reminder-ledger.json` | JSON object，key 为由 `task.id\|reminderAt` 计算的 `r-...` token，值 `"sent"` 或延期触发 Unix ms。缺失、非 object 回退空对象；通知写 sent，10 分钟后提醒写 now+600000 | 本地通知回执与延期，保留 token 和原值，不能从规则计算是否曾通知。 |
| 账号 `reminder-receipts.json` | `ledger_load` 读取数组中的 string token 并合入 ledger 为 `"sent"`。当前 C 路径未见写入该文件 | 本地兼容输入；有旧回执则保留。未知文件内容非 string 时不得补造回执。 |
| 用户选取的业务备份 JSON | `db_export` 写 `version,settings,tasks,notes,projects,tags,places`，仅存活记录，tasks 输出嵌套 subtasks，tags/places 降为 name string，未写设备/进度、pending、outbox 和 tombstone。GUI import 接受普通文件或 `gxtodo-sync` 的 state 子对象，`db_import` 接受 version 1/2 并合并数据 | 手动业务交换文件，缺失的信息不可从该备份无损恢复。原始 DB/同步 payload 是核验来源。 |
| `%LOCALAPPDATA%/GxTodoLocal/feedback/ideas.json`、`feedback.lock` | `{format:"gxtodo.feedback",version:1,ideas:[{id,title,body,status,createdAt,updatedAt}]}`。缺文件初始化空集合，id 限 ASCII 1–128，title/body 为文本且不能同时空白，status `pending/resolved`，新建默认 pending。两个时间 UTC 带 Z，编辑保留 createdAt 并更新 updatedAt。保存原子替换，`feedback_remove` 实际移除数组条目 | Windows 本地反馈。与同步便签分离，保留原文件和条目身份；已物理删除的历史无法从当前文件还原。锁为无共享的进程句柄。 |
| 同反馈目录 `backup-before-import-<uuid>.json` 与用户选取反馈 JSON | 反馈导入合并前写旧数据备份。导出默认文件名 `optimization-ideas.json`，沿用反馈 schema，CLI 可指定目录和文件 | 本地业务备份及交换文件，按源格式保留，与账号资料无硬关联。 |
| `App`、`Detail`、`View`、`Sync` 实例 | 详情草稿和编辑上下文、撤销 before/after 及毫秒过期时间、分页行缓存、导航栈、通知状态、HTTP socket、缓存副本和同步 worker 进度 | 临时运行状态。没有见到生产写入会话窗口快照。撤销触发时可新建同步事件，内存记录本身不独立同步。 |

[文件读写](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/util.c#L9-L11) · [账号与备份对话框](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/dialogs.c#L25-L36) · [位置、侧文件与目录迁移](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/storage.c#L20-L67) · [提醒回执](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/dashboard.c#L4-L12) · [凭据格式](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/sync.c#L5-L56) · [反馈文件](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/windows/feedback.c#L8-L42)

## 静态覆盖与未确认事项

- 声明盘点覆盖所见两个生产 SQL 初始化入口、7 个表的 22 个具名列、13 个显式索引和 2 个触发器。区分四个 TEXT 主键自动索引与应用 SQL，SQLite 自管目录及 sidecar 独立描述。业务覆盖当前任务默认创建的 22 个字段、循环和提醒的 9 个具名子字段、便签及三个分类种类、统计、搜索以及番茄钟/附件缺口。
- 文件证据从 GUI/CLI 入口、数据库打开、账号、提醒、同步配置、Windows 目录搬迁、备份和独立反馈源文件追踪。范围排除第三方 SQLite/cJSON/zlib 源自身 DDL 示例、测试夹具文件、UI 截图及打包资源。
- **UNKNOWN** 实机和历史库 SQLite schema、SQLite 实际查询执行计划、用户自定义扩展 JSON、实际锁及 WAL 文件生命周期、异常中断后文件保留情况。DDL 和声明数来自静态源码。
- **NEEDS INVESTIGATION** 父引用由远端更新时旧祖先搜索缓存失效的全部路径，未知外部版本的提醒回执来源、跨客户端反馈/备份文件是否有等价格式，过期租约在晚到 ACK/Batch/Manifest 缓存写时的实际性状。
