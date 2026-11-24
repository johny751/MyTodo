# Node / Web 存储与字段盘点

2026-11-24（Asia/Shanghai）。D1-01-A 静态源码基线 `ca00c2504a31198f2d49e787483f9ebd2a48a7da`。范围为 Node 本地 HTTP 服务、发布版启动器、浏览器及 Android WebView 共用 JS 模型和生产 WebDAV 路径。以下 SQLite 对象是源码可见声明。已有设备的实际 `sqlite_schema`、数据内容和执行计划均未读取或运行验证。

## 入口与数据边界

- 页面从 `index.html` 装载 `src/app.mjs`。Node 使用 `GXTODO_DATA_DIR`，缺省为 `%LOCALAPPDATA%/GxTodoWeb/data`，环境变量不存在时以 `~/.local/share` 为根。`default` 账号使用该根目录，其他账号使用 `accounts/<id>/`。服务监听 `127.0.0.1`，账号取 `X-Gx-Account`、URL `account` 或 `default`。账号注册表 `activeId` 供 UI 初始化，未指明账号的旧 HTTP 调用始终解析为 `default`。[页面入口](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/index.html#L2) · [server.mjs L8–17、L36–63](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/server.mjs#L8-L63) · [account-store.mjs L24–36](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/account-store.mjs#L24-L36)
- 现代页面路径为 `app.commit` → `storage.writeState` → `normalizeState` / `diffState` / `editReplica` → `syncCall({op:'replica',…})` → HTTP `POST /api/sync` → `account-store.sync` → `database.call`。读取反向走 `inspect`、`state` 和 `buildState`。兼容 `GET /api/state` 与带 `X-Gx-Storage: 2` 的 `PUT /api/state` 也进入同一库，后者先规范化再比较全量 UI 状态。`GxNative` 环境把 replica 调用转给原生桥。无 `replicaVersion` 的旧桥有 `readStateFor` / `writeStateFor` JSON 分支。该条件分支是源码可见兼容路径，当前已发布旧桥在真实设备上的覆盖面为 UNKNOWN。[app.mjs L89–93](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L89-L93) · [storage.mjs L8–25](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/storage.mjs#L8-L25) · [sync-client.mjs L3–9](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-client.mjs#L3-L9) · [server.mjs L41–57](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/server.mjs#L41-L57)

## SQLite 物理对象

每账号 `tasks.sqlite` 由 `node:sqlite DatabaseSync` 打开。源码设 `journal_mode=WAL`、`synchronous=FULL`、`busy_timeout=5000`。可解释运行时伴随的 `tasks.sqlite-wal`、`tasks.sqlite-shm` 属 SQLite 辅助文件，出现时点和现场状态 UNKNOWN。DDL 包含 3 张应用表、16 列、3 个显式索引。无显式 `DEFAULT`、外键、`AUTOINCREMENT`、`WITHOUT ROWID`、`STRICT`、额外业务表、FTS、视图、应用触发器及 `user_version` 读写。`sqlite_schema` 为引擎目录，`entities` 主键约束有隐式唯一索引，按此建表可推导 `sqlite_autoindex_entities_1`。`meta.id` 和 `outbox.id` 是 INTEGER PRIMARY KEY 的 rowid 别名。已有库的对象可能与声明有差异，实际差异为 UNKNOWN。[sqlite-store.mjs L1–14](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sqlite-store.mjs#L1-L14)

| 表.列 | SQLite 声明 | 写入、缺省、空值与转换 | 读取及含义 |
|---|---|---|---|
| `meta.id` | INTEGER PRIMARY KEY，`CHECK(id=1)` | 初始化固定 `1` | 读写按 `id=1`，设备和同步基础设施单行 |
| `meta.value` | TEXT NOT NULL | `initialMeta(randomUUID())` 序列化为 JSON，后续提交整体替换 | `inspect/state/page/outbox` 携带，字段见下表 |
| `entities.key` | TEXT PRIMARY KEY，DDL 无显式 NOT NULL | 应用生成 `JSON.stringify([kind,id])`，匹配时 upsert | `inspect` 点查、`page` 按 key 翻页。普通 rowid 表的 SQL 约束与应用非空保证分别核对 |
| `entities.kind` | TEXT NOT NULL | 从已解析复合 key 取第 1 项 | 索引列，Node 重建视图从 key 解析 kind |
| `entities.id` | TEXT NOT NULL | 从已解析复合 key 取第 2 项 | 无独立唯一约束。身份按 kind 和 id 一起保留 |
| `entities.data` | TEXT NOT NULL | `JSON.stringify(row.data)`，业务胜出值，可含 JSON null 或缺字段 | `state`、`inspect`、`page` JSON 解码。原始行与 UI 投影不同 |
| `entities.record` | TEXT NOT NULL | `JSON.stringify(row.record)` | `inspect/page` 读取保留字段事件，供合并、重绑定、快照 |
| `entities.deleted` | INTEGER NOT NULL | `row.deleted` 真值写 1，假值写 0 | `state` 取 `deleted=0`。`inspect/page` 解码 JS 布尔，保留墓碑行 |
| `entities.conflicts` | TEXT NOT NULL | `JSON.stringify(row.conflicts\|\|[])` | `inspect/page` 解码。`conflicts` 取文本不等于 `'[]'` 的前 200 行再展平 |
| `entities.parent_id` | TEXT，可 SQL NULL | `d.parentId \|\| null`，缺失、JSON null、`''` 及其他 JS 假值落 SQL NULL | `task_parent`，业务树从 JSON `parentId` 重建 |
| `entities.done` | INTEGER，可 SQL NULL | 正常提交 `d.done?1:0`。缺失、JSON null、`''` 写 0，非空字符串按真值写 1 | 两个任务索引列。业务状态读 JSON 布尔归一值 |
| `entities.quadrant` | INTEGER，可 SQL NULL | `d.quadrant ?? null`，缺失和 JSON null 写 SQL NULL，`''` 原样传给 SQLite 绑定 | `task_filter`。SQL 声明 affinity 与实际存储类需分别对待 |
| `entities.reminder_at` | INTEGER，可 SQL NULL | `Number.isFinite(d.reminderAt)` 才绑定，数字以 epoch 毫秒解释。缺失、null、`''`、数字字符串落 SQL NULL | `task_reminders`。UI 重新派生提醒时间 |
| `entities.start` | TEXT，可 SQL NULL | `d.start \|\| ''`，缺失、null 和假值写空字符串 | `task_filter`。UI 按 JSON 值处理日期 |
| `outbox.id` | INTEGER PRIMARY KEY | 使用 `++meta.queue` 显式分配，重复键不走 upsert | ID 排序取批次，`ack` 指该序号的含端点上界 |
| `outbox.event` | TEXT NOT NULL | `JSON.stringify(item.event)` | 解码后待发送，事件结构见下表。ACK 或重绑定才物理删除队列 |

| 索引 | 成员及顺序 | 静态查询用途 |
|---|---|---|
| 隐式 `sqlite_autoindex_entities_1` | `key`，主键唯一 | `WHERE key=?`、`key>? ORDER BY key` 可用，实际查询计划 UNKNOWN |
| `task_filter` | `kind,deleted,done,quadrant,start` | Node 的已追踪调用读取活动行后在 JS 做筛选与排序，未见 Node SQL 以整组过滤条件查询 |
| `task_reminders` | `kind,deleted,done,reminder_at` | Node 浏览器提醒从业务树计算，未见 Node 查询直接取索引中的提醒 |
| `task_parent` | `parent_id` | Node 业务树从数据 JSON 在内存重建，未见 Node 查询直接按此列取子任务 |

`INSERT OR IGNORE INTO meta VALUES(1,?)`、`INSERT INTO entities VALUES(...)` 和 `INSERT INTO outbox VALUES(?,?)` 依赖列数与位置。提交用 `BEGIN IMMEDIATE`、检查 `expected` 与 `actor` / `version=2`，实体、ACK/清队列、入队、元数据同事务。成功 `revision+1`，提交含行时 `dataRevision+1`，提交失败保留主要 SQL 异常并附回滚错误。`state` 仅取活动行，`page` 含墓碑。保留原始 JSON、事务关联和队列顺序可覆盖这层存储语义，单靠投影列或业务导出会损失原始类型、字段存在性、墓碑、冲突和待发送状态。[sqlite-store.mjs L8–39](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sqlite-store.mjs#L8-L39)

## 文件、浏览器和临时状态

| 位置 | 真实字段与动作 | 分类及无损边界 |
|---|---|---|
| 根目录 `accounts.json` | `{version:1,activeId,accounts:[{id,name,defaultFolder,createdAt}]}`。缺文件生成 `default` / `account-b`，目录 `GxTodo` / `GxTodo-B`，时间 ISO 字符串。账号 ID 唯一、姓名检查、总数 1–30。创建、改名、激活、列表均有入口，未见删除账号入口 | 设备本地。保留原 ID、当前选择、目录和实际已存值。读取校验未单独校验 `createdAt` 格式，不补造旧账号时间 |
| 每账号 `state.json` | `version,settings,tasks,notes,projects,tags,places`。账号创建/缺文件生成空状态，读取规范化。文件损坏时停止打开。`initializeReplica` 以 `initialized` 门禁导入，之后业务写走 SQLite | 旧业务来源文件。保留原始 JSON 可留住归一前差异。不能用旧文件替代当前 SQLite。导入取规范化结果 |
| `reminder-receipts.json` | 预期字符串数组，缺文件 `[]`，非数组抛错，数组非字符串元素被丢弃。`GET /api/reminder-receipts` 读取，UI 请求错误回退 `[]`。未见 Node 生产写入者 | 设备本地提醒收据。保留已有字符串和来源。Windows 原生也读取此文件，首次生成路径 UNKNOWN。仅靠同步提醒规则无法重算“已提醒” |
| `sync-config.enc` | 加密前 `{enabled,autoSync,username,folder,password}`。启用布尔转换，`autoSync` 仅显式 false 关闭，用户名/目录 trim。未提供密码或空密码保留原有密码。缺文件回 `{folder:defaultFolder}`，损坏/解密失败报错。对 UI 暴露 `scope,enabled,autoSync,username,folder,configured` | 设备本地受保护配置。Windows Node 用 `gx-dpapi-v1:` helper / 历史 DPAPI 读取。其他系统 AES-256-GCM 封装，依赖本地 `sync-key`（32 字节，创建时请求 0600）。不得从密文推测可跨机器恢复 |
| `sync-base.json` | 旧同步基线 JSON，`base-get` 缺文件 `null`，用户名或目录变化写字面量 `null`。`base-save` 经 scope 检查保存传入 `base`。现代 `exchange` 只在 `meta.scope==null` 读取。现代调用链未见 `base-save` 调用 | 同步基础设施。区分文件缺失、字面量 null、非空旧基线和解析错误，勿由现有实体重构 |
| `accounts.json.tmp`、`state.json.tmp`、`sync-config.enc.tmp`、`sync-base.json.tmp` | 写临时同名文件后 rename，写入请求模式 0600 | 中间文件，现场遗留状态 UNKNOWN。有效恢复来源需额外核对 |
| 浏览器 `localStorage` 键 `gxtodo-reminders-v1`，非默认账号追加 `:<accountId>` | `{[receiptId]: 'sent' \| number}`。`receiptId='r-'+stableId(task.id+'\|'+time)`，number 是约定的稍后提醒 epoch 毫秒，按钮设置 `Date.now()+600000`。缺值 `{}`，解析失败忽略，文件收据初始化 `'sent'`，失效后从账本删除。五个页内提示上限，5 秒检查、聚焦和可见性触发 | 设备本地，按浏览器 origin 与账号隔离。端口、主机名、profile 的变化可分隔 origin 存储，实际历史存留 UNKNOWN |
| 浏览器 `localStorage` 键 `gxtodo.feedback.v1`、`gxtodo.feedback.before-import.v1` | `{format:'gxtodo.feedback',version:1,ideas:[{id,title,body,status,createdAt,updatedAt}]}`。`id` 为最大 128 个 ASCII 字符的标识，创建默认 UUID。标题和正文各将缺或 null 视作空字符串，分别限制 200/50,000 Unicode 码点及 800/200,000 UTF-8 字节，两者至少一项非空。保存时 trim，空标题可从正文首行取 50 码点。`status` 仅 `pending/resolved`。新建写 `createdAt` 和 `updatedAt`，后者递增，均为 UTC ISO。缺数据键得到空列表，非法 JSON/时间/ID 抛错。支持编辑、物理删除、单独 JSON 导出、导入前备份和按更新时间合并 | 设备与 origin 本地，两个键无 account 后缀。保留数据、备份和 origin 上下文。反馈 JSON 不进业务 SQLite 或 delta 事件 |
| 启动器 `GXTODO_RUNTIME_DIR` 或 `<localRoot>/GxTodoWeb/runtime` | `server-<install-hash>.json` 含 `installRoot,pid,port,token,dataDir`，以 `.tmp` rename。`data-<data-hash>.lock` 为独占文件，含 `pid`，启动/停止结束或识别出已退出进程时删除。`server-<hash>.log`、`server-<hash>-error.log` 每次启动重新写 | 运行状态及诊断。停止 token 与业务身份无关且敏感，日志有自身保全语义。不能用它们复原业务状态 |
| 浏览器内存 / History API、Node 内存 | `storage.cache` 每账号 `{state,revision,vector}`。`sync-client.pending` 原生桥请求 ID/回调/定时器。账号当前选择、草稿、查询/列表 UI、`ViewHistory` 条目和 `{gxView,index}` history marker、撤销队列 `{id,before,after,label,expires}`。Node `opened`、账号/保存/配置串行队列和以密文匹配的配置缓存 | 分别为缓存、导航和运行状态，撤销仅可逆转尚与事件结果相符的字段，有效期毫秒，到期及账号切换清理。运行中的未提交草稿没有可确认的持久副本 |
| 导出与导入 | `/api/export` 序列化活动业务投影并使用 `gxtodo-<id>.json` 的 HTTP 下载名。UI 文件选择或 Android 桥只接受备份 JSON，读取裸业务 state 或 `gxtodo-sync` 的 `state` 后按现有合并路径写回 | 独立业务文件。`Content-Disposition: attachment` 是下载方式。此投影缺少墓碑、字段事件、队列、同步元数据、凭据和提醒/反馈账本 |

[account-store.mjs L9–78](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/account-store.mjs#L9-L78) · [sync-server.mjs L7–26](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-server.mjs#L7-L26) · [sync-client.mjs L3–9](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-client.mjs#L3-L9) · [reminders.mjs L3–12](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/reminders.mjs#L3-L12) · [feedback.mjs L1–31、L57–82](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/feedback.mjs#L1-L82) · [feedback-ui.mjs L10–46](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/feedback-ui.mjs#L10-L46) · [web-launcher.cjs L7–50、L65–124](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/scripts/web-launcher.cjs#L7-L124) · [undo.mjs L4–23](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/undo.mjs#L4-L23) · [view-history.mjs](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/view-history.mjs#L1-L27) · [app.mjs L218–251、L274–284](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L218-L284)

发布脚本打包 Node runtime、凭据 helper 和指定模块。离线官方文件转换工具会输出 `converted-official.json`、`merged-preview.json`、`import-ledger.json`、`import-report.json`。QA、CI、打包文件及此类独立转换产物不属于 Node/Web 运行时数据库。已追踪的 Node/Web 应用路径未见 IndexedDB、sessionStorage、附件表、普通任务附件文件写入或 LAN 传输。浏览器引擎内部存储、安装目录遗留文件和未来模块均在本静态覆盖范围外。[package-release.mjs L29–54](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/scripts/package-release.mjs#L29-L54) · [import-official.mjs L127–140](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/scripts/import-official.mjs#L127-L140)

## 业务字段与调用链

除 `subtasks` 这个业务投影容器外，下列任务字段存于 `entities.data`，按活动行重建任务树。在新增或字段差异时，`diffState` 把字段送进 `record.events[].values` 与 Outbox，新增另写 `_deleted:false`。移除业务对象写 `_deleted:true`，未改字段不会被这次编辑重发，已保留的字段事件仍可能用于快照和重绑定。`normalizeState` 的 `text` 仅接受字符串，按 JS UTF-16 code unit 切片，缺省、显式 null、错误类型归 `''`，只有表中特别指出时会 trim。日期字段下的 `stamp` 为 40 code units 的字符串处理。其正则或日历校验取决于具体 UI/业务使用路径。[model.mjs L62–84](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L62-L84) · [replica.mjs L7–36、L65–102](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/replica.mjs#L7-L102)

| 任务字段 | JS 类型、空值及默认 | 创建 / 更新 → 读取与派生 |
|---|---|---|
| `id` | 非空 Unicode 标量字符串，最大 800 UTF-8 字节，无 NUL，缺/NULL/空均拒绝。业务状态各任务、便签、项目共用去重集合 | UI `crypto.randomUUID()`，重复任务确定性 ID，重复子任务重置 ID。用于 `findTaskEntry` 和 `entityKey('tasks',id)`，行解码从 key 反写 `data.id` |
| `order` | 有限 JS 数值原样，否则缺/NULL/`''` 都用兄弟数组下标 ×1024。未要求整数 | 草稿 0，保存按兄弟组最大 +1024，根任务按象限分组。拖动重排在各组内写 i×1024。排序并列再看 `createdAt` / `id`，不等同于同步冲突排序 |
| `title` | string 最大 2000 并 trim，归一可 `''`。普通 UI 保存拒绝空 | 草稿 `''`，表单捕获、编辑保存，列表、搜索、提醒内容使用 |
| `quadrant` | `Number` 转整数并限制 0–3。缺/NULL 先继承父值，`''` 数值化为 0 | 新根取当前象限，子任务继承或随后更改。拖动、表单改值，四象限过滤与统计读取，另有实体投影索引 |
| `done` | JS `!!` 转 boolean。缺/NULL/`''` → false，非空字符串（包括 `"false"`）→ true | 新建 false。`setTaskDone` 与 `completedAt` 同改，关闭再打开清完成时间。参与筛选、统计、提醒与重复触发，SQL 投影 0/1 |
| `start` | 40 code units 的 string。缺/NULL/非字符串/空都成为或保留 `''`。排期严格解析 `YYYY-MM-DDTHH:mm`，北京时间固定 +08:00 | 根草稿 `ui.date+'T09:00'`，可继承父开始。快捷子任务起点为当前北京时间分钟。日期选择清空写 `''`，重设重复锚点。四象限、搜索、提醒与统计读取，投影进 `entities.start` |
| `end` | 同 `stamp`，有效排期用北京时间分钟 | 草稿 `''`，选择器写值。UI 拒绝结束早于起点。统计逾期以 `end` 否则 `start`，周期复制按时差移位。搜索使用文本 |
| `allDay` | boolean `!!`，缺/NULL/空 → false | 完整子任务草稿可继承，快捷子任务 false。排期复选框写，表单与显示读取 |
| `repeat` | object 或 null，缺/NULL/无效 mode/空 → null | 由排期表单设置，`setTaskDone` 读取、生成下一实例。子字段与单位见下 |
| `reminder` | object 或 null，缺/NULL/无效 mode/空 → null | 由排期表单设置，`reminderTime` 派生实际提醒日期、由浏览器/原生提醒读取。子字段见下 |
| `reminderAt` | epoch 毫秒 number 或 null。输入同名字段不作为归一来源，从原任务 `done,start,reminder` 重新计算，无有效规则/时间或已完成得 null | 保存进字段事件，也投影到 `reminder_at`。表单同名 `reminderAt` 控件是本地日期字符串，捕获时写入 `reminder.at`，不是业务字段同类型 |
| `seriesId` | string 最大 100，缺/NULL/非字符串/空 → `''` | 下一实例沿用已有 series ID 或源任务 ID。正常任务编辑界面无直接输入。不得由显示标题反推 |
| `generatedFrom` | string 最大 100，缺/NULL/非字符串/空 → `''` | 下一实例记录源任务 ID。重复发生去重同时查此字段和派生 ID。复制子任务清空。没有 SQL FK |
| `review` | 完成复盘 string 最大 10,000，缺/NULL/非字符串/空 → `''` | 新建空，排期表单捕获。重复下一实例和复制子任务清空。检索读取，独立于任务备注 |
| `weight` | `Number` 转换并限制 0–100，缺/NULL/空 → 0，未要求整数 | 新建 0，表单捕获，统计已完成的值合计 |
| `project` | 名称 string 最大 100，缺/NULL 回退父名称，显式 `''` 保留空值 | 草稿按父/当前项目建。选择/手输保存，必要时补建一个项目实体。改名更新所有同名任务，删除清 `''`，按名称过滤，没有外键 |
| `place` | 名称 string 最大 100，缺/NULL 回退父名称，显式 `''` 保留空值 | 草稿按父/当前地点建。选择/手输保存，必要时补建地点。改名更新引用，删除清 `''` |
| `tags` | string 数组，缺/NULL 回退父值，显式 `[]` 保留空集合，非数组（含 `''`）→ `[]`。每项上限 100，去空去重，最多 30，归一层自身不 trim 项 | 编辑器分隔/trim 文字，保存补建标签，读用于分组和搜索。标签改名/删除逐任务更新引用数组 |
| `notes` | 任务备注 string 最大 50,000，缺/NULL/非字符串/空 → `''`，归一保留空白 | 草稿空，表单捕获。搜索和任务详情读取，随任务一起墓碑。与 `notes` 实体集合分开 |
| `subtasks` | 业务嵌套数组，缺/NULL/错型 → `[]`。每节点最多 100 个直接子任务、深度最多 64、任务总数最多 100,000 | `saveTaskRecord` 定位原兄弟容器，`quickSubtask` 访问父数组，重排按 `order`。扁平化剥除该字段，协议拒绝 `values.subtasks` |
| `parentId` | 扁平任务的父 ID 或 JSON null，根由扁平化显式写 null。远端缺/挂空/无匹配父记录的可见树作为根，环/深链有保护 | 跟随原兄弟容器、保留同一任务 ID。重建根据原始父引用组树，然后移除 UI 对象 `parentId`。删除父任务的本地 UI 动作移除整棵子树，逐实体墓碑，无 SQL cascade |
| `createdAt` | string 最多 40。假值先用父值，父无则 `''`。普通 UI UTC ISO，重复实例由计划开始构造含 `+08:00`，历史可能为无时区文本 | 创建一次，编辑可保留，排序和搜索读取。保留原文字和时区可避免误定一个历史 instant |
| `completedAt` | string 最多 40，缺/NULL/非字符串/空 → `''`。常规完成写 UTC ISO，恢复为空 | `setTaskDone` 更新，重复下一实例初始空。完成日视图对无时区时间串取前 10 字符，对可解析带时区文本按北京时间取日。7 日统计走 `Date.parse` 后北京时间，旧无时区输入存在解释差异 |

| 子字段 | 归一、比较与读取 |
|---|---|
| `repeat.frequency` | `daily/weekdays/weekly/monthly/yearly`，任何其他值使整条规则成为 null。日/月/年/周分别计算，工作日模式固定周一至周五 |
| `repeat.interval` | `Number` → 整数，缺/NULL/空/不可解析默认 1，限制 1–365 |
| `repeat.weekdays` | 数组元素先 `Number`，去重排序，保留 0–6 整数（0 为周日，数组内 null/`''` 均数值化为 0）。字段缺/NULL/非数组得到 `[]`。周规则 UI 要求勾选，算法空数组可回退锚点星期 |
| `repeat.until` | 空值或格式不符落 `''`，仅查 `YYYY-MM-DD` 格式，结束日包含，UI 不许早于本次开始日 |
| `repeat.anchor` | 有效北京时间分钟字符串，否则取归一的 `start`。控件改开始时间可重设锚点 |
| `reminder.mode` | `offset/day/custom`，其他值令整条规则成为 null。`offset` 计算开始前分钟，`day` 计算相对日期 09:00，`custom` 用 `at` |
| `reminder.minutes` | `Number` → 整数，缺/NULL/空/不可解析 → 0，限制 0–525600 分钟 |
| `reminder.days` | `Number` → 整数，缺/NULL/空/不可解析 → 0，限制 0–365 天 |
| `reminder.at` | 有效北京时间 `YYYY-MM-DDTHH:mm`，否则 `''`。自定义模式 UI 校验有效，复制重复实例会按时差移位 |

循环任务的历史由原完成实例继续留存。`setTaskDone` 按 `seriesId/源 ID` 与下次北京时间生成稳定 ID，若已存在同 ID 或 `generatedFrom===id` 的实例不再创建，复制子任务换 ID 并重置完成及复盘。无独立 recurrence 表或历史表。映射需要保留历史实例、原 ID/父引用和时间表达。无法唯一由当前显示树恢复已经归一的原 parent 引用、丢失的旧字段、重复来源或过往时间解释。[app.mjs L147–159、L226–238、L285–292](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L147-L292) · [task-editor.mjs L3–19](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/task-editor.mjs#L3-L19) · [task-tree.mjs L1–16](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/task-tree.mjs#L1-L16) · [model.mjs L28–60](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L28-L60) · [schedule.mjs L2–30](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/schedule.mjs#L2-L30) · [personal-ui.mjs L4–7](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/personal-ui.mjs#L4-L7)

| 功能或实体 | 字段、生命周期、存储和映射边界 |
|---|---|
| 独立便签 `notes` | `{id,body,createdAt}`。UI 生成 UUID，正文 trim 后拒绝空，编辑只改 `body`，`createdAt` 保留。规范化正文最大 50,000，缺/null/错误类型→`''`，时间 40 code units，最多 10,000 项。活动行按时间和 ID 排序，搜索正文与时间。删除写实体墓碑。用 `notes` kind 和原 ID 与任务 `notes` 字段分开 |
| 项目分类 `projects` | `{id,name,description,archived}`。UUID，名称最大 100、描述 10,000，缺/null/错误类型→`''`。`archived` 为 truthiness，UI 创建 false，归档只翻状态，最多 1,000 项。改名更新任务引用字符串，删除项目同时将同名引用清空，任务仍保留。UI 创建检查同名。模型校验 ID，不统一拒绝重复项目名。没有可证明一一对应的同名/孤立引用，不推测 ID |
| 标签 `tags`、地点 `places` | 状态中是去重复、trim 后的非空字符串，单项最大 100、每类最多 1,000。空值、NULL、非字符串项被丢弃。Delta 中为 `{id:name,name}`，键是 kind+名称。改名等于删除旧键、创建新键并修改任务名称引用。搜索及筛选用原名称。保留名称及 kind，无法凭当前标签重建历史同名合并或更名身份 |
| `settings` 交互 | 缺 `settings` 时用默认对象，整个 `settings:null` 无法由 `normalizeSettings` 解引用。对象内 `swipeMenu`,`swipeComplete` 仅接受布尔否则 true，`longPressMs`,`undoMs` `Number` 转换，字段缺/null/空或 0 落 3000 / 8000，分别钳制 300–10000 / 3000–30000 ms。表单以秒转 ms，Android 复用 UI 时保留已有 `swipeComplete`。SQLite `meta.settings` 持久保存并进入业务导出。v2 `diffState` 将其单独提交，无 outbox 事件，历史 v1 包装可带 `settings` 但合并采用本端值 |
| 统计（派生） | `taskStats` 由活动 `tasks` 及子任务的 `done,quadrant,start,end,completedAt` 计算 total/done/pending/overdue/percent、四象限总量/完成、7 日完成数量，页面另用 `weight` 计算完成分值。项目卡片聚合按 `project` 名称。无统计实体、表或持久搜索索引。保留输入和时间解释，不能从汇总逆推出被删除的历史 |
| 搜索（派生+运行状态） | `ui.query` → `searchAll`。NFKC、locale 小写、按空白切词，所有词均须匹配。任务用 `title,notes,project,place,tags,start,end,review,repeat/reminder/done` 的指示文本和各子任务 `title,notes,review,tags,project,place`。另查便签 `body,createdAt`、项目 `name,description`、标签/地点名称。没有 SQLite FTS、持久查询历史和搜索业务 ID。保留来源字段能重建，但 locale/归一与历史本地数据可能改变结果 |
| 番茄钟 | Node/Web 无此存储或写入路径。共用 `app.mjs` 仅在 `window.GxNative.openAndroidTools` 存在时呈现并调用原生计时入口。Node/Web 侧不存在可确认的 `taskId`、番茄持续时间、会话记录或统计字段。原生字段以 Android 盘点为据，勿由业务任务完成时间填补 |

[app.mjs L94、L125–133、L159–163、L202–215、L233–238](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/app.mjs#L94-L238) · [model.mjs L26–30、L78–84](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/model.mjs#L26-L84) · [schedule.mjs L30](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/schedule.mjs#L30) · [sync-core.mjs L19–31](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-core.mjs#L19-L31)

## 副本元数据、事件与远端文件

| `meta.value` 字段 | 写入、读取、缺省及语义 |
|---|---|
| `version` | JSON number 2，提交检查严格等于 2。SQLite `PRAGMA user_version` 未见读写。活动业务状态自身也是 `version:2`，WebDAV v1/v2 有独立的 format 和 version，语义各异 |
| `revision`,`dataRevision` | `0` 起。每次成功提交 `revision+1`，含实体行才增 `dataRevision`。后者缺/假值按 0 累计。并发写预期版本不符回滚。快照扫描按 `dataRevision` 核对是否变化 |
| `actor` | 每库 `crypto.randomUUID()` 文本，提交要求与原库相同。协议允许 1–80 个 ASCII 字母、数字、连字符，区分大小写。不同本地账号、`scope`、业务实体 ID 分开 |
| `seq`,`clock`,`queue` | 0 起，分别是 Actor 事件序号、逻辑时钟、Outbox ID 高水位。`editReplica` 要求非负安全整数且可递增，应用远端时 `clock` 取较大值。三者无时间单位，不能用 Unix 时间或彼此补齐 |
| `vector` | 缺省 `{}`，Actor → 已知事件序号，更新来自本地事件、远端事件及 `context`。编辑 context 可来自 UI 读时向量，保持因果关系。缺键读取为 0 |
| `cursors` | 缺省 `{}`，Actor → 已接收 batch index，缺键读取为 0。与 `vector` 计数目的不同。拉取批次写本轮 index。快照所有分片通过才推进其 cursor，之前的分片行可能已持久写入。首次绑定/换 scope 或 epoch 时重置 |
| `initialized` | 缺省 false，`initializeReplica` 导入规范化本地历史状态及初始 outbox 后一并写 true。已 true 时跳过历史导入 |
| `scope`,`epoch` | 缺省显式 null。scope 从 JSON 字符串 `[username,folder]` 生成，epoch 为 manifest 世代字符串。首次绑定设值。变化则按留存 record 重建队列并替换 pending/cursors/cache，不能从当前活动 UI 数据重建 |
| `pending` | null 或 `{device,index,through,body,path}`，`body` 为原批次 JSON 字符串，`through` 为最大 Outbox ID，`path` 可核对 Actor 和 batch index。首次写持久值后才发布。崩溃或错误后复用原值，确认已发布后置 null，和 `ack`、本地 cursor 更新同提交 |
| `settings` | 本地交互属性，缺省四字段默认值见上，参与本地版本增长 |
| `cachedManifest` | 初始化时缺字段，绑定时可能显式 null，成功同步后可为 `{value,etag}`。仅当前 scope 且合法清单、强 ETag 时使用，HTTP 304 复用，换绑清空。它是持久缓存，不能代表远端当前事实 |
| `legacyMigration` | 初始缺字段。迁移时写 `{scope,backup,sha256}`，以同 scope/backup 及原始读取文本 hash 去重，原数据变动时拒绝。和导入事件同事务，后续 metadata spread 保留 |
| `lease` | 初始缺字段，JS 同步开始写 `{token,until}`，`until` 为 epoch 毫秒，通常 120,000 ms，远端请求前剩余不足 45,000 ms 时刷新。正常 `finally` 校验 token 后设 null。未走到该处的现场状态 UNKNOWN。持久排他/运行协调数据 |

| 对象 / 文件 | 内容与生命周期 |
|---|---|
| 实体键、Outbox event | 复合键 JSON 数组 `[kind,id]` 的字符串，kind 仅 `tasks,notes,projects,tags,places`。event `{key,actor,seq,clock,context,values}`，`seq/clock` 正安全整数，`context` 非负安全整数至多 256 Actors。键名拒绝 NUL 和 `__proto__`、`constructor`、`prototype`、`subtasks`。未枚举其余业务字段，允许未知安全字段入原始 record，业务 UI 投影按固定字段重建。协议保存 `values` 自有字段与 null，无法用规范化默认值替代 |
| `record`、墓碑、冲突 | `record={key,events:[{actor,seq,clock,context,values}]}`，存储事件去掉重复 key，按各字段因果关系保留候选值。已有同 Actor/seq 事件且重叠字段不等时拒绝，其他重复回读不重新应用。胜出顺序为逻辑 `clock`、Actor ASCII、`seq`，`_deleted` 任一并发候选严格为 true 则墓碑。冲突结构 `{key,field,values:[{value,device}],title}`，候选值按结构比较去重。它保留当前冲突和胜出状态，其范围受字段裁剪限制。UI 选择候选值会写新本地事件，现有胜出值无法还原冲突候选 |
| `v2/b-<actor>-<index>.json.gz` | `{format:'gxtodo-batch',epoch,device,index,events}`，每 batch 至多 500 事件，出队按 ID，构造目标约 384 KiB，body 上限 1 MiB。同名上传冲突时 GET 比对解压文本一致性。接收校验 batch/epoch/device/index 后用 `applyRemote` 与 cursor 同事务。发布写 manifest CAS 后 ACK `id <= through` 物理删 outbox。全局单队列，未见按同步目标独立 ACK |
| `v2/manifest.json` | `{format:'gxtodo-delta',version:2,epoch,heads,snapshot?,legacy?}`，当前远端同步结构。`heads` 至多 256 actors，非负安全整数，snapshot 可缺或 null。`snapshot={id,parts:[{path,sha256}],cursors,createdAt}`，分片最多 10,000，cursor 不超过同 Actor head，按 schema 对路径和 hex hash 校验。`createdAt` 写入 UTC ISO，清单校验未确认该字段格式。读取强 ETag 并以 CAS 更新 |
| `v2/s-<id>-<part>.json.gz` | `{id,epoch,records:[{key,events}]}`，含活动行和墓碑的字段事件，分片 SHA-256 基于解压后的 UTF-8 JSON 文本。读先校验 hash/id/epoch。每片应用行，最终合并 cursor。产生快照时以行修订和进度校验一致性 |
| 远端旧 `state.json` 与 `v2/legacy-<id>.json.gz` | v1 文件为 `{format:'gxtodo-sync',version:1,state}`。迁移先保护原解压文本并条件替换为 `{format:'gxtodo-sync',version:2,backup,message}`。`backup` 显式 null 或保护副本路径。旧状态经 `normalizeState` / `mergeStates`，显式墓碑不恢复，持久导入标记去重。先生成恢复快照，再出现可见 manifest。当前 `exchange` 走 v2 及旧版导入，`syncExchange` 是仍定义的 v1 函数。历史部署文件与服务设施 UNKNOWN |

[replica.mjs L3–36、L38–141](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/replica.mjs#L3-L141) · [delta-sync.mjs L17–125](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/delta-sync.mjs#L17-L125) · [delta-sync.mjs L128–253](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/delta-sync.mjs#L128-L253) · [delta-sync.mjs L255–321](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/delta-sync.mjs#L255-L321) · [sync-client.mjs L9](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-client.mjs#L9) · [sync-core.mjs L30–41](https://github.com/johny751/MyTodo/blob/ca00c2504a31198f2d49e787483f9ebd2a48a7da/src/sync-core.mjs#L30-L41)

事件的身份、逻辑因果、原集合键、墓碑和冲突应从原始副本核对。仅凭 `state.json` 或活动对象导出不能证明旧数据有完整映射。待发批次包含准确文本和队列上界，远端设备 head、事件 vector 和本地 cursor 不能互换。证据缺失时，某个已发送或已删除事件的原始内容与因果状态为 UNKNOWN。

## 覆盖与待查

- SQLite 源码可见声明覆盖 3/3 应用表、16/16 列、3/3 显式索引和 1 个可由约束推导的隐式索引。搜索已追踪生产 JS 模块、`server.mjs` 和发布启动入口，未找到其他应用触发器、视图、SQL 表和浏览器本地数据库声明。未知是存量数据库实际扩展对象、触发器、索引、`user_version` 占用、存储类和 query plan。
- 业务覆盖任务字段、嵌套子任务、排期提醒、复盘与备注、独立便签、项目/地点/标签、统计、搜索、重复任务，以及番茄钟的原生桥入口和 Node/Web 侧缺位。字段级盘点含配置的缺值回退、文件级来源和派生关系。待查是历史无时区时间真实来源时区、历史库中是否有三端往返后保留的异常字段和悬空引用。
- 同步覆盖 Actor、event、record、墓碑、冲突、outbox、pending、cursor、manifest/cache、lease、远端 batch/快照/旧备份、迁移标记和账号隔离。浏览器 origin/profile 下历史 feedback 与提醒账本是否存在、旧 Node 版本写入 `sync-base.json` 的具体版本、历史 `reminder-receipts.json` 现场来源需独立核对。源码只确认当前 reader 和兼容路由。
- 未覆盖真实目录、库文件、账本、凭据、日志实际内容、真实 WebDAV / LAN、SQLite 查询计划及跨端运行结果。证据为固定提交的静态路径。
