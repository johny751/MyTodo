# Android 原生存储与 WebView 数据盘点

审查日期 2026-11-24（Asia/Shanghai）。源码固定点 `ca00c2504a31198f2d49e787483f9ebd2a48a7da`。范围包括 Android 主工程 Java 与 Manifest、打包资产清单、进入 Android WebView 的共享 JS、构建脚本固定 SHA-256 的 Android Feedback Kit AAR。所有结论来自静态阅读。数据库实例、设备、网络、APK 和历史数据文件的运行行为未验证。

## 入口与作用域

- 当前 Android 主壳加载打包的共享 JS。本地 WebView 使用应用自有 HTTPS origin 拦截资产请求，关闭 DOM storage 和文件访问。任务界面与 Web 共用模型及增量协议。Android 的 `GxNative.replicaVersion` 选择 SQLite，旧壳无该方法时走 `readStateFor/writeStateFor`。JS `databaseCall` → `syncCall` JSON（带 `accountId`）→ Java 单线程 executor → `AccountStore.sync` → `ReplicaDatabase.invoke`。回执经 `gx-sync-result` 返回。包内存在浏览器反馈及提醒模块，当前 native 分支分别进入 `openFeedback` 和系统提醒。 [资产与 WebView](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/MainActivity.java#L34-L86) · [桥接](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/MainActivity.java#L99-L140) · [打包清单](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/scripts/build-android.mjs#L20-L30) · [JS 存储](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/storage.mjs#L6-L25) · [JS 同步入口](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-client.mjs#L3-L9) · [浏览器提醒分支](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/reminders.mjs#L3-L12)
- 主库路径为 `files/tasks.sqlite`（默认账号）或 `files/accounts/<id>/tasks.sqlite`。账号注册表、同步配置、旧 JSON、本地提醒回执各有边界。Android 另有应用级反馈库 `databases/feedback-kit.db` 与反馈图片目录。系统备份策略在 Manifest 为 `allowBackup=false`，显式 SAF 导入导出另行列明。 [账号与路径](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/AccountStore.java#L13-L49) · [Manifest](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/AndroidManifest.xml#L14-L36)

## tasks.sqlite 物理表、列与生命周期

本项目主库 DDL 共 3 表 16 列，3 个显式非唯一索引。DDL 没有 `DEFAULT`、外键、触发器、视图、FTS、显式 collation、`AUTOINCREMENT`、编号 migration 或显式设置 `user_version`。SQLite 的 rowid、schema catalog 和 TEXT PK 产生的内建索引属于引擎机制。 `key TEXT PRIMARY KEY` 的声明未附加 `NOT NULL`，应用写入口始终取 JSON 字符串。WAL 与 `synchronous=FULL` 是构造代码的设置。 [建库、读取、提交](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReplicaDatabase.java#L12-L38)

| 表.列 | SQLite 约束 | 写法、NULL 与缺省 | 读取、删除和用途 |
| --- | --- | --- | --- |
| `meta.id` | INTEGER PK，`CHECK(id=1)` | 初始化位置型 `INSERT OR IGNORE INTO meta VALUES(1,?)`，显式 1 | `WHERE id=1` 读取及更新，未找到即报错。同步基础设施兼账号本地设置 |
| `meta.value` | TEXT NOT NULL | JSONObject 序列化整份写入，初值见下 | `meta()` 解析，成功提交整体覆盖，源码未见删除路径 |
| `entities.key` | TEXT PK | 共享 JSON `["kind","id"]` 字符串，Java 必取 | `inspect` exact key，`page` 按原始 TEXT 比较和排序，逻辑删除继续占用此键 |
| `entities.kind` | TEXT NOT NULL | Java 取 key JSON 数组首项 | 原生任务查询谓词、树形导出分类和两个复合索引 |
| `entities.id` | TEXT NOT NULL | Java 取 key JSON 数组第二项 | 原生番茄钟任务定位及 `ORDER BY ... id`，没有单独的 ID 索引 |
| `entities.data` | TEXT NOT NULL | 物化实体 JSONObject 整体序列化。字段 JSON null 与 SQL NULL 分属两层 | `state`、原生消费者、`stateJSON` 读取。删除后仍可在原始行读取 |
| `entities.record` | TEXT NOT NULL | JSONObject 事件记录，事件字段包含 `_deleted` | `inspect/page` 回传并供 JS 归并，活体视图和 JSON 业务导出排除 |
| `entities.deleted` | INTEGER NOT NULL | `optBoolean("deleted")` → 1/0，缺字段默认 false | `row()` 转回布尔，SQL 活体筛选 `deleted=0`，无整行业务物理删除路径 |
| `entities.conflicts` | TEXT NOT NULL | JSONArray JSON 文本，缺省/非数组写 `[]` | `row()` 解数组，`conflicts` 读取非字面 `[]` 的前 200 行并拼接，非永久历史 |
| `entities.parent_id` | TEXT，可为 SQL NULL | `data.isNull("parentId")` 对缺失与 JSON null 汇为 SQL NULL。空字符串可形成 TEXT 空串 | 已建 `task_parent`。当前主库树组装使用 `data.parentId`，未找到 Java 查询该列 |
| `entities.done` | INTEGER，可为 SQL NULL | `data.optBoolean("done")` → 1/0，缺失或不识别时回 0 | 提醒、日摘要、挂件、番茄钟排序。业务 JSON 布尔与物化整数分开 |
| `entities.quadrant` | INTEGER，可为 SQL NULL | `data.optInt("quadrant",0)` 数值转换回退 0，Java 写这里无需 0–3 检查 | 挂件按 0–3 分桶，`task_filter` 组成列。共享 UI 正常保存前另行约束范围 |
| `entities.reminder_at` | INTEGER，可为 SQL NULL | `data.isNull("reminderAt")` → SQL NULL，否则 `optLong`，转换失败回 0。有效值为 Unix epoch 毫秒 | `done=0 AND reminder_at>0` 后调度，使用 `task_reminders` 的字段序列 |
| `entities.start` | TEXT，可为 SQL NULL | `data.optString("start")`，缺省空串。JSON null 走框架 optString 转换路径，其具体 API 行为未在本批运行核验 | 字符串排序与日期前缀条件。日摘要 SQL 区分 SQL NULL 与空串。不得把空串、JSON null 和 SQL NULL 互换 |
| `outbox.id` | INTEGER PK | JS `++meta.queue` 后 Java `getLong`，位置型 `INSERT INTO outbox VALUES(?,?)` | 升序分页。显式 `clearOutbox` 清空，`ack` 物理删除 `id<=ack` |
| `outbox.event` | TEXT NOT NULL | JSONObject 序列化，字段 `key,actor,seq,clock,context,values` | 解析打包到 WebDAV 批次，随 outbox ACK 删除。外来事件归并不会再次追加本地 outbox |

| 索引 | 声明与直接读者 | 边界 |
| --- | --- | --- |
| `task_filter` | `(kind,deleted,done,quadrant,start)`。挂件 `WHERE kind='tasks' AND deleted=0 AND done=0 AND quadrant=? ORDER BY start,id`，日摘要和原生候选也按部分条件看实体 | 索引键没有 `id`，未做查询计划验证；日摘要含 OR |
| `task_reminders` | `(kind,deleted,done,reminder_at)`。提醒 `tasks(true)` 对前三列和 `reminder_at>0` 过滤 | 按筛选能力描述；具体优化器选择 UNKNOWN |
| `task_parent` | `(parent_id)`。主库每次行写重建投影 | Java 当前读调用未见以该列条件查树；树读取来自 JSON |
| TEXT PK 自动索引 | `entities.key` 唯一，`inspect` exact / `page` keyset 范围 | 关注原始 key 文本，`kind,id` 没有二级联合唯一约束 |

提交事务执行 `revision` CAS、检查 meta version=2 与 Actor 不变、逐行构造全部列并执行 `CONFLICT_REPLACE`、处理 outbox、整体更新 meta 后 commit。失败或 CAS 不符均经 `endTransaction()`。 `state` 走活体轻投影，`inspect/page` 读取原始行，`page/outbox` 默认 100、上限 500。SQLite 排序与 WebView 查询算法各自独立。 [事务](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReplicaDatabase.java#L20-L38) · [原生查询和导出](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReplicaDatabase.java#L41-L78)

## meta.value、事件与云端文件

| JSON 字段 | 产生、更新、读取 | 数据属性和无损对应的边界 |
| --- | --- | --- |
| `version` | Java 初始 2，commit 仅接受 2 | 数据负载标记。保留其来源，不据此推知 SQLite DDL 版本 |
| `revision,dataRevision` | 初始均 0。前者每次事务成功 +1；后者仅有 rows 时 +1，旧库缺失用 0 | 本地并发/刷新计数，不是时间戳或业务版本 |
| `actor` | 初始 `UUID.randomUUID().toString()`，commit 同 Actor 校验，JS 事件引用 | 复制身份及数据范围一起对应。设备注册表账号 ID 与 Actor 分别保留 |
| `seq,clock,queue` | 初始 0，JS 编辑增事件序号、逻辑时钟和队列号，接收按事件时钟取 max | 非负协议整数和队列身份，逻辑计数没有时间单位。保留三者独立 |
| `vector,cursors` | 初始 `{}`，发送和接收维护 Actor 序号 vector；接收和 ACK 推进批索引 cursor，scope/epoch 换绑分支重设 cursor | 同步基础设施。Actor → 事件 seq 与 Actor → 批 index 语义不同 |
| `initialized` | 初始 false，`initializeReplica` 迁入现有逻辑 state 并建出站事件时置 true | 决定账号是否允许旧 JSON 路径。它无法表达旧文件内容及来源 |
| `scope,epoch` | 初始显式 JSON null。v2 bind 设置，`scope` 来自配置用户名和目录的 JSON 数组字符串，`epoch` 来自云端 | 文本、JSON null 和缺失的保留语义。不要从账户名称或目录名推造历史 scope |
| `pending` | 初始 JSON null。上传前持久化 `{device,index,through,body,path}`，成功可达 publish 后与 ACK 同次提交清除 | `body` 是原始 JSON 字符串、`index` 批次号、`through` 本地队列边界。保留其原内容与身份 |
| `cachedManifest` | 初始未写；换绑可置 null；一次交换后写 `{value,etag}`，相同 scope 时供条件 GET | 本地同步缓存。值中 manifest 包含 `format,version,epoch,heads,snapshot,legacy` 等，原始存在状态应保留 |
| `legacyMigration` | 初始未写。受控 v1 导入成功随实体事务写 `{scope,backup,sha256}`，重试读取标记 | 迁移回执。备份路径、摘要和范围分别保留 |
| `settings` | Java 初始 `{}`；JS 初始化和后续写入按 `normalizeSettings` 产生 `swipeMenu/swipeComplete` 布尔（默认 true）、`longPressMs` 3000（限制 300–10000）、`undoMs` 8000（3000–30000） | 账号本地设置，随业务导出；不生成实体事件。JS 默认参数只处理缺省，传显式 null 会在访问字段时报错。Java 导出用 `getJSONObject` 要求对象 |

JS 白名单为 `tasks,notes,projects,tags,places`。Java 行 commit 从 key 取 kind，Java `stateJSON` 按固定五个数组处理。JS `validateEvent` 拒绝非法 kind、ID 和事件结构，拒绝 NUL／危险字段名／`subtasks` 字段，普通未知字段可进记录。物化 `data`、规范化 UI state 和原始 `record.events` 不是同一个视图。并发 `_deleted:true` 形成 tombstone，活体导出隐藏它。冲突记录为字段与竞争值的物化结果，不能重建被支配丢弃的完整变更历史。 [共享协议与白名单](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/replica.mjs#L7-L141) · [初值与提交](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReplicaDatabase.java#L13-L36) · [设置](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L26-L27) · [同步缓存与进度](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/delta-sync.mjs#L203-L305)

远端 `state.json` 为 v1 数据或迁移保护记录。 `v2/manifest.json` 维护 epoch、heads、snapshot 引用等，独立批文件和快照分片按共享协议处理，`.gz` 由 Android Java 负责传输压缩。Manifest cache 和 Pending 保存在 meta，未发现独立本地表。Android 的 WebDAV 路径白名单、ETag、GZIP 和请求上限归 `SyncStore`，v1 兼容和发布顺序归共享 JS。源码内未见 Android LAN 同步/双目标投递账本。 [传输](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/SyncStore.java#L31-L69) · [迁移、manifest 和快照](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/delta-sync.mjs#L59-L305)

## 应用文件、设置与临时状态

| 位置与属性 | 字段、读写和生命周期 | 保留方式及风险 |
| --- | --- | --- |
| `files/accounts.json`，设备本地应用级账号注册 | UTF-8 AtomicFile。根 `version:1,activeId,accounts[]`。每项 `id,name,defaultFolder,createdAt`，创建时间为 Unix 毫秒。首次缺文件创建 `default/account-b`；列表要求 1–30 个、ID 和名称唯一，并包含默认和当前账号；创建 UUID 后缀，名字修整且 1–32 个 Java 字符，目录 ASCII 1–60。rename 只改名，activate 先读/验证目标数据再写 activeId，`manage` 无删除操作 | 保留原账号 ID、目录及创建时间。账号注册和 Actor 是不同命名域。缺省产生账号不是对旧资料推断 |
| 每账号 `state.json`，旧业务载体 | UTF-8 AtomicFile。初始化前读取时缺文件回 `""`。写入必须有 version 1/2 及 `tasks,notes,projects,tags,places` 数组，Java 限 5 MiB。SQLite 初始化后切换 `stateJSON()` 且禁止旧写。JS 首次迁入调用 normalize，未发现迁入后删除旧文件 | 原文件可能含 UI 规范化后被修整/截断的值。保留旧文件和已激活数据库的身份；从业务导出无法恢复 tombstone、事件、出站及同步连续性 |
| 每账号 `sync-config.enc`，设备本地私有配置 | UTF-8 JSON 加密后写入 AtomicFile。 `enabled:bool` 默认 false、`autoSync:bool` 默认 true、`username:string` 默认空、`folder:string` 缺文件取账号默认、`password:string` 保存时空串表示沿用旧值。 `config-get` 仅给 `scope,enabled,autoSync,username,folder,configured`，禁止把密码交给 WebView。AES/GCM，IV 前缀与密文和认证 tag，AndroidKeyStore alias `gxtodo-webdav` | 配置作用域与 Keystore 依赖必须分开。不可从 redacted 数据重建密码；旧壳和不同设备中 Keystore 的行为 UNKNOWN |
| 每账号 `sync-base.json`，旧同步缓存 | AtomicFile；`base-get/base-save/request` 先比对当前 scope。缺文件与 4 字节 JSON `null` 均返回 JSON null；其他内容解析 JSONObject。变更用户名或目录时覆盖为 `null`。v2 client 在 meta scope 未绑定时尝试读取 | 保留路径、范围和内容区别；旧合并基线不是事件历史 |
| 每账号 `tasks.sqlite-wal`、`tasks.sqlite-shm` 等，SQLite 派生运行文件 | 主库以 WAL 打开；实际 sidecar 存在及生命周期由 SQLite 和打开状态决定。AtomicFile 也可能出现框架辅助写入文件 | 主文件静态路径不能证明某次备份，一致性快照需要单独鉴定 |
| 系统 SAF `gxtodo-backup.json`，用户选择的业务导出 | `exportStateFor` 从指定账号读取并暂存在 `exportData`，系统文档 URI 写 UTF-8。 `stateJSON` 只含 version、settings、五种活体数组，任务恢复子树，移除 `parentId`，tags/places 恢复为字符串数组。import 读系统 URI，64 MiB 上限，通过 `gx-import` 交给 JS 预览／确认后业务写入 | 手工业务交换介质。原始 record、outbox、cursors、manifest、配置、附属文件和反馈库在其格式外 |
| `reminder-delivery[-<accountId>]`，设备本地提醒投递 | SharedPreferences。默认账号无后缀。键 `id + "\|" + reminderAt`，值 Long：缺省读取 0，`-1` 已发，正数 Unix 毫秒延后。 `fire` 通知后 `commit(-1)`；SNOOZE 校验当前账号后写当前时间+600000；refresh 清理无效键并撤销无当前任务的用户通知 | 完整保留每账号、任务 ID 与触发时刻关联。不能把 `-1` 转成 epoch 时间、任务事件或通用 ACK；只拿 task JSON 不能恢复已发/延后 |
| `android-tools`，设备本地全局设置 | SharedPreferences。 `statusEnabled` bool true，`notificationAsked` bool false，`ballEnabled` bool false，`edgeDot` bool true，`ballSide` string `right`，`ballYRatio` float 0.55、读时夹限 [0,1]，`ballMenu` StringSet 默认 add/today/done/timer/notes/settings/hide（可开 search），`hiddenApps` StringSet 默认空，`timer.state` 见下。原生设置、通知权限提示及悬浮球位置调用 `apply`；番茄钟是独立同步 `commit` | 平台级偏好按字段类型保留；缺键与明确保存默认值、空集合分开。跨账号共享，任务同步不处理这些字段 |
| 系统与内存，缓存或临时运行 | OS alarm/notification/widget，前台服务状态、悬浮球和 UsageStatsManager 的系统信息。 `DailyTaskSummary` 日期/账号与计数派生，服务为刷新缓存；WebView 的 `storage.mjs` 按账号缓存 `state,revision,vector`；页面筛选、排序、编辑器、UndoQueue、同步请求 Map、通过 Bundle 的 `pendingOverlay,selectedMode,section,pendingPicker,pendingRestore`、外部导出 URI/字符串为运行状态 | 可重算的投影归派生/缓存。Bundle 与 OS 实际保留及生产 WebView 框架自动维护的内部文件 UNKNOWN；未读取设备沙箱 |

[账号读写](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/AccountStore.java#L18-L49) · [加密与作用域](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/SyncStore.java#L24-L46) · [导入导出](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/MainActivity.java#L127-L168) · [提醒调度](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReminderScheduler.java#L15-L24) · [延后](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/ReminderReceiver.java#L4) · [AndroidToolsActivity](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/AndroidToolsActivity.java#L416-L550) · [FloatingBallController](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/FloatingBallController.java#L103-L145) · [通知权限](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/MainActivity.java#L191)

## 成熟功能的 Android 字段映射

下表 business 数据经过同一写入链。UI 提交整份业务草稿，`normalizeState` → `diffState` → `editReplica` → Java 投影及 outbox。新实体产生 `_deleted:false`，删实体产生 `_deleted:true`。读链为 Java `state` → JS `buildState` → normalize。原生 SQL 使用投影列和原始 `data`。导出为 Java 的活体 `stateJSON`。保真证据优先保留持久化 JSON/事件，从活动 UI 或导出不能反推归一化之前已丢失的值。 [应用提交](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L93) · [读取和写入](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/storage.mjs#L10-L24) · [字段规范化](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L62-L84) · [树、变更和删除](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/replica.mjs#L10-L36)

| 功能 | 现有字段、写与读路径 | 无损对应与风险 |
| --- | --- | --- |
| 四象限任务及排序 | `tasks.id,title,quadrant,order,done,start,end,allDay,createdAt,completedAt,notes,review,weight`，其余关联与规则见下。 `task-editor.saveTaskRecord` 基于实际兄弟数组保存。 `moveTask` 调整象限与同组 order。 `done` 变更经 `setTaskDone` 设置或清空 `completedAt`。 `id` 字符串，使用共享长度／唯一性约束；`title` 修整、限 2000；`notes` 50000；`review` 10000；`weight` 数值转换 0–100；布尔按 JS truthiness；`quadrant` 转整型及 0–3；`order` 非有限数缺省按 index×1024；时间文本至多 40，非字符串归空。SQLite 投影与挂件读取见上 | 保留原 ID、排序号和所属象限。保留开始结束文本与生成时区含义。对完成时间保留原文本；未排期为空时无法从已归一值确定原来是 NULL、缺省或空串。源码允许 order 和 weight 非整数，不能默认取整 |
| 子任务 | UI `subtasks[]`，同步 `tasks.parentId`，Java `parent_id`。 `quickSubtask` 创建 ID 并复制父象限、项目、地点、标签等；normalize 在相应原值为 null／缺省时执行父项回退，显式空字符串/空数组有独立含义。共享 `flattenState` 把根 parentId 写 null；`buildState` 和原生导出在父缺失或循环等情况提升显示，并忽略输出中的 parentId | 保留平铺实际 parentId 和所有子任务 ID。仅使用导出树会丢失悬挂父 ID 与循环证据；`subtasks` 不是事件字段 |
| 提醒 | `reminder` null 或 `{mode,minutes,days,at}`。模式 offset/day/custom；`minutes` 0–525600 整数分钟；`days` 0–365 整数天；`at` 有效北京本地分钟文本或空。 `reminderAt` 由规则和 `done,start` 派生为 Unix 毫秒或 null，并进入同步物化任务字段。原生按 `reminder_at,done,deleted` 查候选，再读 `id,title,reminderAt` 并使用本地回执 | 保留来源规则和触发绝对时间各自取值。SQLite NULL、JSON null 及本地 0/-1 处于不同语义层。到期和发送不可仅靠任务同步字段还原 |
| 备注、便签与复盘 | `tasks.notes` 备注和 `tasks.review` 复盘是任务正文子字段，随任务物化及 tombstone。独立 `notes` 实体含 `id,body,createdAt`，`app.mjs` 新建/编辑/删除，`model.mjs` body 50000、时间文本 40，列表上限 10000。 `notes` 实体使用独立键，搜索读取 body 和 createdAt | 任务备注、复盘、独立便签和原生优化意见四者可区分。早期值超长截断、没有历史版本等缺失不能补造 |
| 循环任务 | `repeat` null 或 `{frequency,interval,weekdays,until,anchor}`；频率 daily/weekdays/weekly/monthly/yearly，interval 1–365 缺省 1，weekdays 为去重 0–6，`until` 正则日期文本或空，`anchor` 可解析分钟文本否则 start。完成时新增 `id=repeat-...`、`seriesId`、`generatedFrom`，剪裁关联与子任务字段并推移计划时间，独立事件保存。JS `seriesId/generatedFrom` 字符串至多 100 | 保留当前实例、父子关联、模板规则和生成来源。由历史截断/空串无法反推系列 ID；依据看似相同的标题或开始日补链会错连 |
| 已有项目分类与标签地点 | `projects.id,name,description,archived`，name 100、description 10000、布尔转换 archived。任务 `project,place,tags[]` 以名称文本关联；project/place 长度 100，tags 去重且至多 30，标签/地点列表经 trim 去重，各至多 1000。共享 flatten 使用 tags/places 名称兼作实体 id；app 的重命名/删除路径递归更改任务中的名称；分组用文本相等 | 分开保留真实项目 id 与历史文本关系，缺失/重名时标记风险。关系不是外键，不可断言任意项目名能唯一改写为项目 id |
| 统计 | WebView `taskStats` 读平铺任务 `done,start,end,completedAt,quadrant`，图表另读 `weight`。原生通知日摘要读 `done,start,repeat.until,completedAt`（上升为北京日），生成 `pending,completed,overdue`；挂件读 `quadrant,title,done,start,id` 投影并派生计数。两种逾期算法输入不同 | 保留原始任务字段并按消费者重算。统计结果没有业务表，也不可反推各条任务；Java 与 JS 相同名字的指标不能直接等同 |
| 搜索 | WebView `matchesQuery/searchAll/taskSearchText` 对标题、备注、分组名称、标签、子任务文本、时间、复盘、状态等 NFKC 和小写内存匹配；独立便签/分类另查。原生番茄钟选择器按当前账号读 `title`，Locale.ROOT 小写子串匹配，排序 `done,start,id`，1–100 条及 lookahead | 搜索字段来源可保留，查询过滤、`hasMore`、命中和排序派生。主库未见保存查询词、搜索索引列、独立 FTS；反馈库单独有 `records.search` |
| 番茄钟 | 原生 `android-tools.timer.state`，与任务关联仅为 `{accountId,id,accountName,title,done}` 本地快照；`setTaskFromSelection` 对所选账号和活体任务复核，JS 活体及旧树均可提供候选。计时器、统计、通知状态详见下 | 保留账号、任务 ID 与缓存标题和任务完成状态的区别。删除后旧连接的当前展示与自动清除策略不得从任务 tombstone 推断。计时记录无跨端事件 |

[编辑器写入](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/task-editor.mjs#L4-L19) · [共享分组、搜索及排序](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L28-L60) · [规则和统计](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/schedule.mjs#L3-L30) · [项目与便签操作](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L173-L215) · [原生统计](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/DailyTaskPolicy.java#L29-L87) · [番茄钟任务](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/PomodoroTasks.java#L17-L118)

| 写入入口 | 字段和默认行为 | 读出和删除 |
| --- | --- | --- |
| 新任务、编辑与排序 | `openTask` 生成 ID、createdAt ISO 字符串、未完成、空 end/completedAt，起始时间默认父开始或当天 09:00，继承父分组或使用当前导航组。`captureDraft/captureSchedule` 写 title/notes、计划/重复/提醒和 review/weight，时间选择器应用 start/end。保存校验标题、顺序与规则，拖动/位移更新 quadrant/order，`setTaskDone` 设置/清空 completedAt | 界面读归一化数据。删除通过 `deleteItem` 移除指定兄弟数组项及子树，diff 为每个消失键产生 tombstone |
| 子任务快捷新增 | `quickSubtask` 复制父 quadrant/project/place/tags，默认 start 按创建墙钟换算北京时间到分钟，end 空、allDay/完成为 false；`moveSubtask` 更改子项 order | 现有编辑定位实际父数组，避免保存时提升为根；树从 `parentId` 重建 |
| 新建/编辑分类和便签 | `note-form` 写 id、非空修整正文、ISO createdAt。编辑只改 body；项目 `entity-form` 更新 `name,description` 同时修正后代任务文字引用，归档开关更新 archived。标签/地点名改变时更新身份名和对应任务引用 | `deleteItem` 对便签移除实体。项目、标签或地点删除时保留关联任务并置 project/place 为 `""` 或缩减 tags 数组。跨端事件可能独立冲突，不从最终结果反推旧关联 |

[表单捕获和新建](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L89-L89) · [保存和删除](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L147-L159) · [表单提交](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L233-L238) · [计划捕获](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/personal-ui.mjs#L4-L5)

### 番茄钟持久化字段

`PomodoroTimer` 初始化读取 SharedPreferences 字符串，支持 JSON version 1/2，并生成 version 2 单条记录。缺失、版本错误和解析异常走默认时钟路径。操作或快照驱动 `persist`，运行中按控制状态或约 10 秒条件写入，`SharedPreferences.commit()` 失败抛错。原生读者包括设置页、通知服务与浮球。该对象没有按账号分库的独立计时行、逐 session 清单或同步事件。 [读取与操作](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/PomodoroTimer.java#L12-L119) · [序列化与快照](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/PomodoroTimer.java#L121-L263) · [时钟和裁剪](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/PomodoroClock.java#L193-L288)

| 字段 | 类型、缺省和时间含义 | 生命周期 |
| --- | --- | --- |
| `version` | 整数，parse 缺失为 0，写 2 | 本地 JSON 格式版本 |
| `task` | 显式 JSON null 或对象；对象包含字符串 `accountId,id,accountName,title` 和 bool `done`。解析缺失/非对象为空；新选择缺 accountName/title 用本地 UI 文案，done 缺失 false | setTask 更新或显式取消。 `accountId,id` 是关联身份，其他为选择时快照 |
| `sessionActive` | bool，旧记录缺失时依据未完成且运行或 elapsed>0；完成时清 false | start／resume 可启用，reset／计时完成关闭 |
| `mode` | 字符串 `countdown/countup`，默认 countdown，非法回退 | start 对应模式，保留状态 |
| `running,completed,completionPending` | bool，`optBoolean` 缺省 false。countup 清 completed 和 pending | 控制流与通知确认，`tick()` 取走完成通知；字段不是业务 ACK |
| `durationMinutes` | 整数分钟，1–180，默认 25 | UI 自定义倒计时，越界历史值回到默认 |
| `elapsedMillis` | Long 毫秒，缺省 0，非负；倒计时限额内，完成置完整持续时间 | start/reset/pause/resume/tick 推进。剩余时间 snapshot 派生 |
| `lastElapsedRealtimeMillis,lastWallMillis` | Long 毫秒，缺省 0；分别为设备自开机单调时钟与 Unix 墙钟 | 暂停/恢复和跨进程重算。单调值和 bootId 作用域必须同时表达 |
| `bootId` | 字符串，缺省空；Global BOOT_COUNT 可读时转十进制字符串 | 识别重启，旧机型可能回退 elapsed 判断，不能跨设备混用 |
| `focusedMillisByDay,completedSessionsByDay` | JSONObject，键为北京时间 epoch day 的十进制字符串，`floorDiv(wallMillis + UTC+08 offset, 86400000)`。值分别为 Long 毫秒和 int 次数；缺失/非对象走空 map，非法键忽略，恢复负数取 0 | 计时最多保留含当天在内 32 天的范围，过期清除；重置当前会话不等同于清统计。无法从聚合反推逐次开始/结束、关联任务或裁剪历史 |

## Android Feedback Kit 数据库及文件

代码入口为 `MainActivity.openFeedback/newFeedbackIdea`、`FeedbackToolsActivity` 和 `FeedbackApplication`，使用独立 `DefaultFeedbackStorage`。AAR `1.2.0` 的 SHA-256 `4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade` 与构建脚本固定校验值相同。证据从相同 SHA-256 的本地归档读取 `classes.jar` 的静态常量、类方法字节码和行号表。以下以类/方法定位 AAR。源码模块原始共享路径在 `android/libs/README.md` 中给出，本次未取得原始 Java 源，也未执行类。 [AAR](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/libs/feedback-kit-1.2.0.aar) · [固定校验](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/scripts/build-android.mjs#L27-L42) · [接入说明](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/libs/README.md) · [入口](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/MainActivity.java#L104-L119) · [备份/恢复入口](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/FeedbackApplication.java#L16-L67)

### 反馈表与索引

默认构造使用 `SQLiteOpenHelper` 的应用目录 `databases/feedback-kit.db`，helper version 1，`onConfigure` 开启外键，`onUpgrade` 抛错。AAR 另有可传非默认 namespace 的构造，路径为 `feedback-kit-<namespace>.db` 和 `files/feedback-kit/namespaces/<namespace>`。已追踪的 MyTodo 入口使用默认 namespace。DDL 共四张持久表、20 列、4 个显式索引，无显式 DEFAULT、触发器、视图或 FTS。位置型写入风险表须与主库区分。出处为 AAR `DefaultFeedbackStorage$SharedState.<init>`、`SharedState$1.onConfigure/onCreate/onUpgrade`、`DefaultFeedbackStorage.createTables`。 [固定 AAR](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/libs/feedback-kit-1.2.0.aar)

| 表及关键关系 | 持久列、NULL 与默认 | 调用链与保留边界 |
| --- | --- | --- |
| `records`，复合 PK `(bucket,id)` | `bucket TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,state TEXT NOT NULL,search TEXT NOT NULL,deleted INTEGER NOT NULL,number INTEGER`。 `number` 仅 notes 写数值，其他 SQL NULL。 `state/search` notes 投影，其他写空字符串。 `deleted` notes 的 `deletedAt` 非 null → 1，其他 → 0。 `updated_at` 投影来自 payload `updatedAt` 的 `optLong` | `FeedbackRepository` 创建/编辑/删除/撤销，`DefaultFeedbackStorage.put/recordValues` 序列化 JSON 和投影，`get/all/queryNotes/deletedNotes` 读。软删除靠 `deletedAt,deleteToken`，永久删除走 `remove`，外键级联相应 links。保留完整 payload、bucket 语义和原始时间，不能用搜索或显示标题重建正文 |
| `assets`，PK `id`，`file_name` 唯一 | `id TEXT PRIMARY KEY NOT NULL,file_name TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL`；大小 byte，宽高 pixel；均显式写入 | `importImage` 从文档 URI 读取，校验 PNG/JPEG/WebP，写缓冲文件，计算摘要并插入 `assetValues`，原生图片浏览由 `openImage/shareUri` 解析。内容和元数据都需要保留 |
| `links`，复合 PK `(bucket,record_id,asset_id)` | `bucket TEXT NOT NULL,record_id TEXT NOT NULL,asset_id TEXT NOT NULL`。FK `(bucket,record_id) → records(bucket,id) ON DELETE CASCADE`，`asset_id → assets(id)`（无显式 ON DELETE） | `put` 解析并维护图片 references，以表检查引用和清理孤儿，`remove` 后清理未引用资产。保持顺序语义的来源是 payload 引用数组，SQL link 键无顺序列 |
| `settings`，PK `key` | `key TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL`；createTables 插显式 `restore_generation=0` | `SharedState` 打开读取，缺行内存回 0；成功恢复通过 `FeedbackBackup.commitRestore` 更新代次。该代次独立于主任务 meta |
| 临时恢复 `archive_entries`，PK `name` | `name TEXT PRIMARY KEY NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL`；条目名称、字节长度、SHA-256 | `FeedbackBackup.restoreStore` 在 `files/feedback-kit/restore_<32hex>/validation.db` 创建同样四张反馈表和该表，开启外键。展开 ZIP 写元数据，校验条目及关系，通过后提交持久库。finally 清理 staging，下一次打开可回收残留。临时库实际存放 5 表、23 列，属于恢复执行状态 |

| 索引 | SQL |
| --- | --- |
| `feedback_order` | `records(bucket,deleted,updated_at DESC,id)` 非唯一 |
| `feedback_status_order` | `records(bucket,deleted,state,updated_at DESC,id)` 非唯一 |
| `feedback_note_numbers` | `records(number) WHERE bucket='notes'` 部分唯一索引；scope 为同一数据库 |
| `feedback_asset_refs` | `links(asset_id)` 非唯一 |
| 内建约束索引 | `records(bucket,id)`、`assets(id)`、`assets(file_name)`、`links(bucket,record_id,asset_id)`、`settings(key)`、仅临时库额外 `archive_entries(name)`；实际查询计划未执行 |

### 反馈逻辑数据及外部载体

AAR `FeedbackContract.validateNote/validateDraft/validateMeta/validateOrigin/validateIds` 的已读字段如下。 `notes` 是这个组件的 bucket 名，业务任务便签通过另一个 WebView/SQLite 入口存储。

| 载体 | 现有字段与含义 | 无损对应约束 |
| --- | --- | --- |
| `records.payload` 的 `notes` | `id,number,createdAt,updatedAt,revision,body,category,status,origin,assetIds,deletedAt,deleteToken`。时间用 Unix 毫秒。标题由 body 推导；category 可为空值或 feature/experience/bug，status 为 pending/in_progress/done/deferred。origin 包含 `appId,appName,versionName,versionCode,pageLabel`；图片 ID 数组去重。软删除要求对应 timestamp 与 token | 保留状态枚举、原创建来源、修改计数、删除批身份和图片关系。Web 反馈同名 `status` 和 ISO 文本时间不能直接按 Android 值处理 |
| `records.payload` 的 `drafts` | `id,targetId,baseRevision,isNew,createdAt,updatedAt,revision,note,assetIds,inheritedAssetIds`（继承图片校验适用含此字段的对象）。Draft 含完整业务 note，并对 target 关系和图片一致性校验 | 草稿为设备本地编辑数据。保留 draft、本体和基线修订的身份；当前执行的 save/discard 路径只能说明 AAR 校验条件，历史意外断点实际表现 UNKNOWN |
| `records.payload` 的 `meta` | 固定 ID `feedback_sequence`：`id,nextNumber,createdAt,updatedAt,revision`。 `feedback_delete_batch`：`id,token,count,createdAt,updatedAt,revision,assetIds`，可含关联编辑 `draft` | 序号、暂存删除批和回滚所需图像单独保留。它们属于反馈基础设施，与 WebDAV tombstone 或 outbox 不共享 |
| `files/feedback-kit/images/<filename>`、FileProvider | 由 asset 行提供文件名、类型、大小、SHA-256、宽高。System URI 导入时有 `import_<32hex>.tmp`；`.feedback.files` authority 用于本地分享。孤儿清理会查看全部 links | 文件和元数据必须配对。仅有 SHA-256、文件名或 URI 不能恢复缺失字节。该图片实现服务于反馈模块 |
| SAF `feedback-<stamp>.zip` | `manifest.json`（`format="androidshared-feedback",schemaVersion=1,appId,createdAt,recordCount,assetCount,recordsSha256,assetsSha256`），`records.jsonl`、`assets.jsonl`、`images/`。ZIP 恢复先入临时校验库，校验资产引用、格式、尺寸及 hash。便携导出对恢复相关标识有转换路径，完整内部 payload 与导出对象的所有差异 NEEDS INVESTIGATION | 保留真实文件与 manifest 一致性。反馈 ZIP 与任务 JSON 各自是设备本地显式导入导出入口 |
| MyTodo 任务附件边界 | 已读主业务 `model/replica` 无附件实体或引用定义，主库无附件列/表，SyncStore 白名单只允许旧 state 与 v2 协议路径。AAR 图片与业务任务同步没有调用关系 | 历史未知字段中的附件样数据是否存在 UNKNOWN，不能用反馈资产 ID 替代 |

上述字段和类定位来自 [固定 AAR](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/libs/feedback-kit-1.2.0.aar)。用户界面入口见 [FeedbackToolsActivity](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/FeedbackToolsActivity.java#L94-L162)、[任务白名单](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/replica.mjs#L7-L15) 与 [请求白名单](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/android/src/local/gxtodo/replica/SyncStore.java#L40-L48)。

## 覆盖与未确认项

| 覆盖单元 | 已确认范围 | 尚未确认 |
| --- | --- | --- |
| Android 任务/同步主库 | 3/3 源码声明持久表、16/16 列、3/3 显式索引、0 已发现 app DDL 触发器，读、写、逻辑删除、ACK 和序列化入口 | **UNKNOWN** 已有 DB 的 SQLite catalog、遗留自建对象/触发器、框架 `android_metadata` 实际存在、sidecar 状态、PRAGMA 最终值、真实索引计划和不同 Android API 的 JSON 边界实测 |
| 反馈库 | 4/4 AAR DDL 持久表、20/20 列、4/4 显式索引，临时验证额外 1 表/3 列，0 个发现的应用触发器。固定 AAR 主存储和备份类已静态追踪 | **NEEDS INVESTIGATION** 上游完整源、各系统版本 SQLite/SAF/文件权限运行细节、未知扩展 payload、便携备份所有规范化细节及历史 APK 是否使用个别 namespace |
| 文件与设备状态 | 项目 Java/JS 明确声明的账号、旧快照、同步配置/基线、提醒回执、工具偏好、计时、反馈及 SAF 数据路径 | **UNKNOWN** 历史安装状态、框架 WebView 自动文件、OS 及厂商生成的数据、用户实际内容及旧 Keystore 是否可解 |
| 运行与历史 | 仅静态证据 | **NOT TESTED** 本批没有 APK、SQLite、ADB、设备、故障、WebDAV、LAN 或测试执行。Android issue #1 仍为阶段 0 保留风险 |

[阶段 0 Android 风险](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/docs/upgrade/phase0-final-review/android-stability-risk.md) · [Android issue #1](https://github.com/johny751/MyTodo/issues/1)
