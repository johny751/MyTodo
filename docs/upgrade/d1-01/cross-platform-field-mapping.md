# 三端实体与字段映射

2026-11-24（Asia/Shanghai）。本页依据提交 [`bc3f44d`](https://github.com/johny751/MyTodo/commit/bc3f44d1e76a988dbe269edcf1c606eebec37293) 的应用源码。Android 业务页面所用 JS 与 Web 共用。以下是现有字段和可保留数据的盘点，映射目标仍待 D1-01-B 决策。物理 SQL 类型、约束和各列投影见 [Windows](windows-storage-inventory.md)、[Node/Web](node-web-storage-inventory.md)、[Android](android-storage-inventory.md)。

## 读写与同步入口

| 路径 | 创建与更新 | 读取与序列化 | 同步与删除 |
| --- | --- | --- | --- |
| W（Windows C） | `task_default`、`detail_save_record`、`quick_add`、`save_note`、`op_category`、`task_complete`；保留行记录，`db_local` 批量生成新事件 | `db_row`、`query_rows`、`db_export`；内部扁平行，业务导出按父子嵌套；SQL 搜索等同时读取派生列 | `db_put` 写 JSON 与 SQL 投影、`outbox` 和 meta 同事务；原生 `sync.c` 传 v2；`task_delete` 递归产生墓碑，其他目录实体使用 `op_delete_entity`/`op_category` |
| J（浏览器 / Node） | `app.mjs` 中 `openTask`、`saveTask`、`commit`、`toggleTask`、表单和删除动作；浏览器 `writeState` 对规范化状态做差分；Node `/api/state` 也有服务器写入边界 | `readState → databaseCall → /api/sync → SQLite`；`buildState` 重组树再规范化；`/api/export` 导出业务状态 | `flattenState → diffState → editReplica`；每字段差分、对象/数组字段整体作为值；消失行 `_deleted:true`，落 Node 事务；`sync-client` 调用 `delta-sync` |
| A（Android） | WebView 业务动作使用 J 的同一 JS，`syncCall → GxNative → MainActivity → ReplicaDatabase.invoke`；原生提醒与伴随服务另外读取任务/写本地状态 | `ReplicaDatabase` 的 `state`/`inspect`/`page` 和 `exportState`，J 投影用于 WebView，原生读端直接读工作表 JSON 或查询列 | J 同步模型，`GxNative` 将存储和 HTTP 委派给 Java。Android 事务使用 `ContentValues`；业务删除由 J 差分，Android 原生提醒和番茄钟的本地动作有独立持久化 |

W 源码见 [detail](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/detail.c#L6-L19) · [catalog](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/catalog.c#L9) · [operations](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/operations.c#L17-L38) · [database](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/database.c#L337-L347)。

J/A 源码见 [应用提交入口](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/app.mjs#L89-L93) · [任务动作](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/app.mjs#L147-L159) · [共享存储](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/storage.mjs#L6-L25) · [服务端路由](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/server.mjs) · [Android bridge](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/MainActivity.java) · [Android 行存储](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L12-L38)。

## 四象限任务、子任务和备注

本节各字段随同一 `tasks` 实体按表首调用链持久化和同步。下表的 `空` 专指 JSON 字符串 `""`，`null` 专指 JSON null。SQL NULL 另见差异清单。W 的正常编辑与原始导入/远端事件不能共享同一套默认值假设。J 的规则指规范化业务投影，原始 `record.events` 可能保留被投影折叠的值。

| 字段 | W 创建、更新和读取 | J/A 创建、更新和读取 | 保留旧值的边界 |
| --- | --- | --- | --- |
| `id` | `task_default` 生成 ID，`taskkey` 编成 `["tasks", id]`；导入遇到同键不同数据的任务可重发新 ID | `openTask` / `quickSubtask` 提供 ID，`normalizeState` 校验非空、有效 Unicode、最多 800 UTF-8 字节及业务状态中的唯一性 | 保存原 `kind`、ID 与引用，原始导入若已改标识，凭当前行无法恢复旧对应关系 |
| `title` | 缺省空，详情 `collect` 取自由文本、统一换行；`validate_task` 拒绝空或过长正文标题；面板与索引读取 | 字符串截至 2000 后 trim，缺省/非串投影为空，编辑提交要求有标题 | 原始空白、非字符串或被截断值需读原始复制记录 |
| `quadrant` | 默认调用参数；详情和 `op_move` 更新；SQL 整数投影负责面板筛选 | 缺失或 null 可继承父值，数值化、取整并限制到 0–3；`moveTask` 调顺序 | 保留原数值及已观察投影，禁止从一个视图的颜色推断原字段 |
| `order` | 初始 `time(0)` 秒值用作排序数，移动、邻居和重复生成可改逻辑排序值；SQL 提取 JSON | 非有限值以同层索引乘 1024 补值；新增和移动重排，按 order、创建时间、ID 决胜 | 保留数值精度及根/子同层作用域，既有 order 不能统一解释成时间 |
| `done` | 默认 false，`task_complete` 写布尔值，SQL 整数投影给统计/查询/提醒 | 默认 false，`!!` 规范化；`setTaskDone` 写布尔值。Android 提醒和小组件用 SQL | 原始非布尔值和三端 SQL 投影可不同，无法仅据 SQL 0/1 反推 |
| `start` | 一般默认空；详情把空格转换成 `T` 后校验，快建子任务填当前时间；存 TEXT 查询列 | 时间选择器填本地分钟串或空；快建子任务填当前时间；`stamp` 只限制字符串到 40，并在需要时严格解析 | 保留墙钟串与无值表征，不能一律按 UTC 或按已换算 epoch 读 |
| `end` | 默认空，详情编辑并与 `start` 校验；循环有值时移动 | 同类输入与 `stamp`，正常编辑要求结束不早于开始；循环移动有效值 | 与 `start` 分开保存，已有失败解析的字符串保留原值 |
| `allDay` | 默认 false，详情布尔值；日期仍有 `start/end` 原串 | 表单复选框、规范化 `!!`，展示根据标记隐藏小时 | 保存标记与原有日期，不能由 `00:00` 推断全天 |
| `parentId` / `subtasks` | SQL/JSON 扁平 `parentId`；快建从父任务继承选定字段，递归读子任务、删除整棵子树，导出移除 `parentId` 并重组 `subtasks` | `subtasks` 嵌套创建和排序，`flattenState` 转为 `parentId`（根 null），`buildState` 重组；删树后每个消失行生成墓碑 | 保留扁平父引用、原顺序和墓碑。无父行或环的读端修正不可当作真实父关系；脱离元数据的业务导出不足以重建边界 |
| `notes` | 任务备注自由文本，默认空，与任务一同保存和索引 | `captureDraft` 读 textarea，投影默认空，最长 50,000；子任务同字段 | 区分业务 `notes` 字符串和独立 `notes` kind。换行/截断损失只可从保留的原始值核对 |
| `review` | 详情自由文本，默认空，搜索消费；循环复制清空 | `captureSchedule` 填自由文本，最长 10,000，缺省空；复制清空 | 保留为独立文本，不能合并到 `notes` |
| `weight` | 默认 0，详情读数值，统计汇总已完成分值 | 表单转数值，规范化限制 0–100（可为小数）；`statsPage` 单独合计已完成分值 | 保存原分值及数值类型，显示合计无法逆推每条原值 |
| `createdAt` | `task_default` 用 `now`；循环根使用预计开始串加偏移、复制子任务使用实际生成时间 | 新建/快建用 ISO 时间；缺失或假值可从父值补，循环根及其复制子树统一预计开始时间 | 保留原时间文本和偏移，不能为既成子任务改写来源时间 |
| `completedAt` | 完成写当前时间，重新打开清空，SQL 统计用该时刻换算日期 | 同类完成/重开写法，统计通过 JS `Date.parse` 消费 | 保留原值及空，当前值不能恢复多次重开/完成历史 |
| `project` | 默认空，详情按项目名称，`op_category` 改名/删除更新引用 | 缺失/null 可继承父项目；空串为独立值；编辑选择或输入新分类，按名称读取 | 原名优先。已有同名项目或无匹配时，不能硬关联到 ID |
| `place` | 默认空，详情保存地点，按名称筛选与同步 | 缺失/null 可继承父值，编辑器 `applyPlaceDraft` trim | 保留原名，与项目/标签各自区分 |
| `tags` | `task_default` 空数组，详情文本输入转为标签，类别实体按名称 | 缺失/null 可继承，以数组为准，非数组 `[]`，切分、按字符串去重、最多 30 项 | 保留原数组元素、顺序和能取得的原值；失去内容的去重投影无法逆推 |

字段与行为证据见 [JS 字段白名单与默认值](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L62-L85) · [新建/更新子任务](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/task-editor.mjs#L1-L21) · [C 读取与保存](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/detail.c#L6-L19) · [C 完成与递归删除](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L9-L12) · [JS 扁平化与差分](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L8-L36)。

## 提醒和循环任务

| 字段 | W | J/A | 保留旧值的边界 |
| --- | --- | --- | --- |
| `reminder` | `task_default` null，详情保存对象，完成时重算 SQL 投影 | `normalizeReminder` 对缺失、null、无效模式输出 null。设置 UI 生成对象 | 保存原对象、原缺省状态和模式 |
| `reminder.mode` | 详情模式与 `reminder_recalc` 分支 | `offset`、`day`、`custom` 三种 | 模式不可从 `reminderAt` 反推 |
| `reminder.minutes` | 距开始前分钟（offset） | 数值化、取整、限制 0–525600，默认 0 | 不与番茄钟计时或毫秒字段合并 |
| `reminder.days` | 根据开始日 09:00 倒推的日数（day） | 0–365 整数，默认 0 | 保留业务规则，即使已经过期或完成 |
| `reminder.at` | 自定义墙钟分钟值（custom） | 严格校验 `YYYY-MM-DDTHH:mm`，无效/缺省成空串 | 保留原串和规则源 |
| `reminderAt` / `reminder_at` | JSON 数或 null，SQLite 转整数或 SQL NULL；日期/完成动作重算，原生提醒取非 NULL | JS 从任务规则重算 Unix 毫秒或 null；Node 有限数才投影；Android `done=0 AND reminder_at>0` 用于原生提醒 | 同时保留规则和已有值用于核对，规则、JSON 值、SQL 列及已发本地回执各有语义 |
| 提醒回执和延后 | `native-reminder-ledger.json` 中 `r-<token>` 对 `sent` 或延后墙钟毫秒，另合并 `reminder-receipts.json` | 浏览器 origin 台账；Android 原生另用应用偏好及系统 alarm。平台台账分别消费，详见各附录 | 账户、设备、token 及到期时间都要保留。历史只剩 token 时没有可验证的反向映射 |
| `repeat` | 默认 null，详情创建/更新规则，`next_time` 消费 | `normalizeRepeat` 缺省/null/不支持频率输出 null，`setTaskDone` 消费 | 保留原规则，不能由生成实例回推全部配置 |
| `repeat.frequency` | `daily`、`weekdays`、`weekly`、`monthly`、`yearly` | 同枚举 | 旧值超出枚举时保留可取得的原始记录 |
| `repeat.interval` | 非 1–365 在 `next_time` 回退到 1 | 转数值取整后限制到 1–365，缺省 1 | 异常旧值计算可能不同，避免将已生成任务重新排程 |
| `repeat.weekdays` | 星期日为 0，星期六为 6；空数组按 anchor 星期选择（weekly） | 数组数值化、过滤、去重排序，weekly 用空回退 | 空数组与显式星期列表须分别保留 |
| `repeat.until` | 日期串，用字符串日期界限比较 | 日期形状匹配 `YYYY-MM-DD`，缺省空 | 源字段只有日期，时间/偏移不可补造 |
| `repeat.anchor` | 起点分钟串，无效回退到当前实例开始 | 解析失败取入参 `start`，编辑开始时刷新锚点 | 保留锚点与实例 `start`，复制子树锚点与根不同 |
| `seriesId` | 默认空，新实例取原 series 或源任务 ID，复制子任务置空 | 同；JS 投影限制字符串 100 | ID 本身可达 800 UTF-8 字节。只剩被投影截短的字段时，关系需标记风险 |
| `generatedFrom` | 默认空，新实例存源任务 ID，生成前查 `db_row` 及活跃同来源行 | 同名。`setTaskDone` 在当前活跃树判重；投影限制字符串 100 | 保留原始链和已生成子树 ID；现有 ID 优先，避免跨端按派生规则补造 |

调用锚点见 [C 表单与编辑](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/detail.c#L9-L18) · [C 重算与验证](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/operations.c#L36-L38) · [C 重复实例与删除](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L3-L12) · [J/A 编辑与校验](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/personal-ui.mjs#L4-L7) · [J/A 提醒、循环与时间转换](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L3-L29) · [Windows 提醒台账](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/dashboard.c#L4-L11) · [Android 提醒查询](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L38)。

## 独立便签、项目、标签与地点

| 字段 | 写入和读取 | 保留旧值的边界 |
| --- | --- | --- |
| `notes.id` | W `save_note` 生成并用 `notes` 键，J/A 便签提交生成 ID，同步按 kind/id 独立识别 | 保留原 ID 和墓碑 |
| `notes.body` | W 自由文本与 `catalog` 保存；J/A 便签表单存 body，模型非串/缺省为空，限 50,000；两侧搜索 | 不与 `tasks.notes` 合并，保留已存在的空/原始值 |
| `notes.createdAt` | W 详情用 `now`，快速便签用没有偏移的 UTC+08 分钟串；J/A `toISOString`，便签按时间展示，JS 查询也以它为候选文本 | 保留原时间及格式，无偏移的历史来源未确认时不能补写绝对时刻 |
| `projects.id` | W 从原行或新生成 ID，J/A 以项目实体 ID 管理编辑/删除 | 与当前任务的 `project` 名称分开保留 |
| `projects.name` | W 目录写入并按名称查任务，J/A 表单改名更新任务中的同名引用；业务投影限 100 | 保留原名称，重名与悬空引用单列，不能武断取一条 |
| `projects.description` | W 目录详情字段，J/A 字符串，缺失/非串投影为空，限 10,000；进入搜索 | 保留原值与空 |
| `projects.archived` | W 和 J/A 归档/撤销归档为布尔值，活动/归档视图筛选 | 保留状态，归档和墓碑不能合并 |
| `tags.id`、`places.id` | 同步行以名称作为 ID。业务层展示与导出简化为字符串数组，J `flattenState` 由名称构造记录 | 保留原行身份及名称，不能只依赖字符串列表重建历史 |
| `tags.name`、`places.name` | W `op_category` 保存并更新任务分类引用；J/A 去空/trim/去重并限制目录规模。改名通常是删除旧名称行、生成新名称行，并改写任务引用 | 原名、墓碑和各任务引用都要保留；已折叠的空值或变体无法从目录投影复原 |

项目/标签/地点的链接是业务名称匹配，SQLite 没有关系表或 FK。删除项目/目录实体的本地入口处理活跃任务引用。收到墓碑本身不触发 SQL 外键级联。便签删除不触及任务备注。依据 [Windows 目录 UI](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/catalog.c#L9-L39) · [Windows 目录动作](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/operations.c#L32-L34) · [JS 目录读端](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/app.mjs#L125-L137) · [JS 目录写端](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/app.mjs#L159) · [JS 业务字段](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L80-L83) · [JS 数据序列化](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L10-L36)。

## 番茄钟、统计与搜索

| 数据 / 字段 | Windows | Node/Web | Android | 保留边界 |
| --- | --- | --- | --- | --- |
| 番茄钟控制 `mode`、`running`、`completed`、`sessionActive`、`durationMinutes` | 未发现原生生产入口 | Web 页面只在有 Android bridge 时展示入口，Node 账本无对应实体 | Android `PomodoroTimer` 保存本地会话控制和时钟状态，`PomodoroClock` 更新 | 保留原偏好、作用域及单位；运行状态只在时钟锚点相符时可解释 |
| 番茄钟锚点、运行累计和任务链接 | 未发现 | 未发现标准浏览器持久化 | `elapsedMillis` 与墙钟/单调计时锚点、任务链接账号/ID/标题快照等由 `PomodoroTimer` 保存；任务查询走 `PomodoroTasks` | 只能保留现有持久化状态，禁止推断关联任务或补全重启前时钟历史 |
| 番茄钟按日聚合 `focusedMillisByDay`、`completedSessionsByDay` | 未发现 | 未发现 | 偏好 JSON 中按日键持久化，读端派生 `focusedMillisToday`、`completedSessionsToday` | 聚合不是逐会话原始历史，不能逆推逐段会话；精确锚点和偏好键见 Android 附录 |
| 统计 `total/done/pending/overdue`、完成率、象限与近七天 | `ui_stats_paint` 读取活跃 SQL 行，逾期按 `start`，完成分值汇总 `weight`，按 `completedAt` 计算日桶 | `statsPage → taskStats(flattenTasks)`，逾期在 `start` 合法前提下用 `end \|\| start`；近七天以完成时间计算，页面另汇总已完成 `weight` | WebView 同 J；原生还有 `dailyTaskSummary`、widget 的不同日期和筛选条件 | 保留输入及其统计口径，派生结果可重算，缺少过去快照时不可恢复历史显示 |
| 搜索索引与查询 `title/body/name/description/notes/review/project/place/tags/start/end/done/repeat/reminder` | `native_search*` 用 JSON 提取拼文本，递归纳入活跃子任务文本，`gx_normal/gx_match` 查询。`native_index_meta.version=4` 是搜索层内部版本 | `searchAll/matchesQuery` 以内存业务态做 NFKC + 词 AND；便签还搜索 `createdAt`，子树使用指定字段 | WebView 同 J；番茄钟任务选择另走 `searchPomodoroTasks`、按标题筛选 | 保存原始业务行可重算，跨端重算不保证命中顺序或集合一致，仅保留查询词也无法还原历史结果 |

依据 [Windows 统计](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/dashboard.c#L3) · [Windows 搜索](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/query.c#L3-L15) · [JS 搜索与过滤](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L28-L61) · [JS/Android WebView 统计](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L30) · [Android 番茄钟持久化](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/PomodoroTimer.java#L182-L265) · [Android 原生查询](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/android/src/local/gxtodo/replica/ReplicaDatabase.java#L38-L76)。

## 复制层、身份和设置

| 数据 | 真实字段和存放 | 旧值保留与风险 |
| --- | --- | --- |
| Actor/设备、账号、范围 | `meta.actor` 是账本的复制 Actor，账户目录 ID 与之分离；Batch `device` 取 `actor`；`meta.scope`、`epoch`、`initialized` 是本地绑定/初始化状态 | 原账号、Actor、scope、epoch 应按原归属记录。没有证据时不得把帐号名、设备名或文件路径指定成 Actor |
| 版本/本地修订 | `meta.version`、`revision`、`dataRevision`，业务 JSON `version` 以及 manifest `version`；具有不同读端 | 保留每个来源和原始含义，不能从搜索索引 `version` 或同为 2 推断兼容 |
| 设置 | `meta.settings.swipeMenu`、`swipeComplete` 布尔，`longPressMs`、`undoMs` 毫秒；JS 的默认值 true/true/3000/8000 | 设备本地，可随业务导出保存，设置改动不生成对应业务事件。保持缺省值与用户明确选择的区别，若只剩规范化值则已无法区分 |
| 因果向量与计数 | `meta.seq`、`clock`、`queue`、`vector{actor:seq}`、`cursors{actor:batchIndex}` | 逻辑计数无时钟单位。`seq`、出队 `id`、batch index、修订值互不等价。只剩实体值时无法重建迁移前边界 |
| 事件 | `{key,actor,seq,clock,context,values}`；`context` 为因果向量，`values` 可能有 `_deleted` | 恢复至少保存原记录和值类型。字段缺失（本事件不改）、显式 null（写 null）、空串（写空）分别保留 |
| 原记录与冲突 | `entities.record` 是 `{key,events:[…]}`、`data` 是合并投影、`conflicts` 是冲突投影。事件同一 Actor/seq 重复判定，按逻辑时钟、Actor ASCII、seq 排序 | 原记录保存因果上下文、冲突和墓碑。仅从获胜业务值补造版本或失败历史会失真 |
| Outbox 与 ACK | `outbox.id` 本地整数、`event` 是 JSON。ACK 到 `through`，物理清理 `id<=through`；`clearOutbox` 为单独动作 | 保留未确认事件、原队列号和确认边界。已物理删的旧队列无法按序号倒推，当前实现没有每目标 ACK 账本 |
| Pending | `meta.pending` 为 null 或 `{device,index,through,body,path}`，`body` 是序列化批次内容 | 保留准确 body、作用域和批次身份，重编码后字节可能不等价 |
| Manifest | `v2/manifest.json`，`format`、`version`、`epoch`、`heads`、可选 `snapshot`，HTTP ETag 是并发控制；本地可缓存响应 | 区分远端事实和本地缓存；Actor 缺席按 0 读取、非负安全整数。不能用本地空缓存补写远端 head |
| Batch 与 cursor | `v2/b-<device>-<index>.json.gz`，包含 `format,epoch,device,index,events`；`meta.cursors` 记录每个 Actor 已应用批次 | 缺分片不向前跳，保留原始序号同该作用域版本。收到的批次不会变成本地未确认业务事件 |
| Snapshot 与墓碑 | Manifest snapshot `{id,parts:[{path,sha256}],cursors,createdAt}`，分片 `{id,epoch,records}`；记录合并含 `_deleted` 且快照 cursor 不超过对应 head | 备全原始记录、分片校验及边界。业务导出排除已删除行，不能充当完整快照 |
| 遗留标记、缓存与会话 | JS `legacyMigration`、`cachedManifest`、`lease` 等随真实路径保存；C `sync.c` 有自己的绑定、版本拒绝、租约及缓存处理 | `sync-base.json`、旧备份、迁移 guard 和租约 token 按使用点识别，保留原样，不能假定缓存/期限可跨 Actor 复用 |
| 附件及反馈 | 五类业务 kind 没有附件类型。Android Feedback Kit 的记录、资产和文件另属本机模块；Web 反馈存储另见附录 | 反馈图像不是任务业务附件，保留本地原件与元数据归属。任务备注中的文本/路径不能当成已验证附件 |

依据 [元数据及业务变化](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L8-L36) · [事件及投影](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L38-L138) · [Manifest/Pending 校验](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L25-L54) · [批次及快照](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L202-L306) · [Windows 原生同步](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/sync.c) · [反馈与原生存储](android-storage-inventory.md)。
