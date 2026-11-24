# 字段兼容矩阵

2026-11-24（Asia/Shanghai）。D1-01-B 设计建议，D1-01-A 基线 `6a4b179f361602f47429bc9aa88e51c0b61395e3`。字段接纳、读者能力及异常交互尚待负责人核准，设备行为 `NOT TESTED`。本稿适用于未来评审的逻辑层，既有写入和线上协议沿用其现状。[三端差异源码证据](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L5-L29)

## 输入状态、标准值及旧读端

**设计建议**。以来源类型、账本、读取边界、实体键和字段路径定位一条原始观察。使用 `presence` 表达存在状态，分别记录原始值、类型、标准值有无和诊断。JSON 以有无自有键判断缺席。SQL NULL 与原始 SQL 值独立记录。原字段语法不可靠时保留受限访问的原始字节，标准投影标记不可用。若解析器会丢弃重复键或改变数字表达，在解析前保留输入，并标出歧义，禁止从原始层造一套“正确的”值。读取能拿到的最后一层即是证据边界。表中“旧读端”指当前同协议的原入口及其已有表现，未证明这些入口能读取新的标准投影。

| 输入状态 | 原始保留 | 标准表达与处理 | 旧读端兼容及不可逆性 |
| --- | --- | --- | --- |
| 缺失 | 记录来源对象、路径和键缺席；事件中缺席继续表达未改此字段 | `presence=missing`，无标准值；UI 可另算默认显示和继承值 | 旧 JS `normalizeState` 可能填默认。只有规范化导出时无法恢复先前缺席 |
| JSON `null` | 保留键与原始 null | `presence=json-null`。按允许字段表达显式空，否则标异常 | 旧 `??` 或字符串回退可折叠；只剩投影无法区分显式空与缺席 |
| 空字符串 `""` | 保留 JSON 字符串和零长度 | `presence=value`，值仍为空串；禁止空值的标准字段标诊断 | `project/place` 旧端可用空串阻止继承；有的 SQL 绑定会变 NULL。独立保留原值与列值 |
| SQL NULL | 保留数据库、表、列、行定位和 `NULL` 存储类别 | `presence=sql-null`，仅作列观察；业务标准值仍由可确定的业务来源推导 | 旧读者或过滤器有 `IS NULL` 与空串行为，从 SQL NULL 推断 JSON null、empty 或 missing 不可逆 |
| `0`、`false` | 保留值及实际类型；位置型写入的列类型单列 | 两者都是 `presence=value`。只有类型和值域符合时才输出对应数值或布尔 | 旧 truthiness / `optBoolean` / SQL 整数投影有差异，不能把 0、false 和无值合并 |
| 无效类型或范围 | 保存类型、原始数字字面量/文本、准确字节及原因 | `presence=value`，诊断 `invalid-type`、`out-of-range` 或 `invalid-format`，无标准值；按字段隔离风险 | 旧端钳位、截断或转型可能继续显示。实际原值已丢失时，反推不可逆 |

**源码证据**见 [三端 `parent_id` 等 SQL 绑定](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L7-L27)。

## 三个重点字段

| 字段 | 源码证据 | 设计建议：原始值、标准值及异常 | 旧读端及不可逆性 |
| --- | --- | --- | --- |
| `tasks.parentId` / `entities.parent_id` / `subtasks` | C/Node 可把空值投影成 SQL NULL，Android 可能保存空串；业务导出拆除 `parentId` 并重组树 | 并存 JSON、嵌套位置与 SQL 观察。显式 JSON null 可以表示根；合规非空 ID 进入父边校验；空串、非串、缺席、悬空、墓碑、循环各有诊断。只有明确版本定义且原嵌套位置可辨的旧业务导出，才按其原结构投影父边；冲突来源未裁决时保留全部证据 | 原旧载体用于旧读端；展示升根只是 UI。只剩导出树时，原始断边和循环可能不可逆。见 [关系策略](relationship-migration-strategy.md) |
| `tasks.quadrant` / SQL `quadrant` | JS 数值化、取整、钳位，缺失/null 可继承父值；C SQL 非数字入 NULL；Android 默认 0 | 原样保存值。任务标准仅接纳 JSON 整数 0–3；字符串 `"2"`、1.5、4、-1、null/缺席分别标记。非 `tasks` 行的同名 SQL 投影不产生业务字段。展示可局部使用父值或未分类，提交字段需显式编辑 | 旧端仍按旧规则显示。钳位后仅留 3 无法重建原 4 或更大值。使用旧投影重新写入需单独审核 |
| `tasks.reminderAt` / `reminder_at` / `reminder.at` | 业务 `reminderAt` 是 UNIX 毫秒或 null，SQL 绑定不同，旧 HTML `reminderAt` 是自定义时间文本 | 分开保存提醒规则及字面量、原业务 `reminderAt`、SQL 值。可调度标准值从受支持规则和有效时间推导为非负安全整数毫秒，无规则/完成输出显式不调度状态，输入非法给诊断。派生值与已存值不同时保留并标记 `mismatch`，验证前不自动发补偿提醒、覆盖已存值或生成同步事件。合法 0 仍记录为 epoch 零，是否可调度由策略另行决定 | 旧端继续消费原字段，Windows 查非 NULL，Android 原生查 `>0`。数字文本、负值、毫秒小数、单位不明或只剩 SQL 投影，现有语义有损。无设备回执时无法用毫秒值反推送达 |

**源码证据**见 [父关系、SQL 投影与日期差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L7-L48) · [提醒字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L43-L64)。

## 通用类型及字段组

| 字段组 | 设计建议：原始保留与标准值 | 异常、旧读端兼容与不可逆性 |
| --- | --- | --- |
| ID 与文本 | 原 ID 保留完整 Unicode 和原 UTF-8 长度，标准 ID 使用协议边界。同一原值与内容字段的长度策略独立。`title`、`notes`、`review`、`body`、分类名称和描述保留原换行及字面串 | 无效 ID、重复键、超长、NUL、类型错误标记，先阻止生成不合法的标准 ID。禁止从显示切片生成新 ID。JS trim / UTF-16 slice 和 C 换行转换会丢原格式，旧展示仍可用原入口 |
| 日期与墙钟时间 | `start/end/repeat.anchor/reminder.at` 使用严格有效的北京时间 `YYYY-MM-DDTHH:mm`。`repeat.until` 保留严格日历日期。保存原文、偏移是否存在、精度与时间字段用途 | 非法日历、结束早于开始、未知时间制式保留原值并标异常。旧端可本地解析，但基于平台默认时区的结果不可回填。未经出处确认不得把未知格式转成 epoch |
| `createdAt/completedAt` | 带妥当偏移时间的标准时刻可以同时投影原偏移/精度和 UTC 比较值；有证据的旧墙钟格式按其固定来源规则读取。空 `completedAt` 仍作为原重开输入保存 | 无偏移且来源未证实，只保留日期或墙钟文本及诊断，绝对时刻未知。旧 JS `completionDay`、`Date.parse` 和 Windows SQL 分桶差异不生成新历史。秒/毫秒或偏移不可猜 |
| `done/allDay/archived` | 标准仅 JSON 布尔，SQL 0/1 只能在明确为来源投影时单独记录；保留旧类型 | 不把 `"false"`、0、1 自动当作业务布尔。缺席与 false 分开。旧读端继续自己的 truthiness；规范化后历史类型不可还原 |
| `weight/order` 与协议计数 | 保留 JSON 数字字面量与能取得的精度；`weight` 采用 0–100 有限数，`order` 为有限排序值且保留根/同父作用域。未来若统一精度，应确认精确表示或隔离。`seq/clock/queue/revision`、head/cursor 使用各自安全整数范围，按协议解释 | 超出范围、浮点不精确、数值文本、负/小数计数标异常。禁止按 `order` 猜创建时间，禁止把队列号、事件序号和进度混用。旧 C 的转换、JS clamp 或 JS double 失真一旦入存储就可能不可逆 |
| 数组 `tags`, `weekdays`, `subtasks` | 保留原元素、位置、重复值和层级。标准 `tags` 为有效字符串序列，集合视图可另去重；`weekdays` 标准为 0–6 整数集合并保留输入顺序信息；`subtasks` 为树形业务投影 | 类型错误或重复/非法元素单列诊断，禁止把混入值直接清理并保存。现有 JS 有去重、列表上限，C/JS 排序路径有差异；只能从真实原输入恢复丢失条目 |
| 对象 `repeat`, `reminder` | 保留对象及未知键。标准按已知频率/模式读子字段。`repeat.interval` 为 1–365 的 JSON 整数，`reminder.minutes` 为 0–525600 的 JSON 整数，`reminder.days` 为 0–365 的 JSON 整数，按模式要求有效输入；旧保留的非当前模式字段记原值。旧小数与数值文本保留并标记异常，不静默取整 | 非对象、未知枚举、缺少当前模式关键值时不计算后续发生/调度。标准投影不回写。旧端对异常 interval 有回退/clamp 差异，不能用生成实例重建原规则 |
| 未知字段、空数组 `[]`、空对象 `{}` | 保留确切 JSON 类型和内容，已知字段以独立版本投影。空容器和缺席各自可追踪；未知字段保留在受限访问的来源或扩展记录 | 当前共享 JS 投影会选定字段，旧编辑/导出往返保真尚未证明。旧端只接收验证过可表达的同协议内容，禁止以规范化导出作为全量兼容写入；新 kind 走 [版本契约](migration-versioning-contract.md) |

**源码证据**见 [现有字段映射](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L17-L91) · [字段与线上白名单](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L58)。

**尚待设备验证**。隔离样本应覆盖以上各输入形态、原 JSON 与实际绑定不同、Unicode 和大数字、关系失配、旧导入-编辑-导出、历史时间字面值及提醒已发状态。原有 D1-01-A 关于真实分布、框架 `optXxx`、合法异常值及历史读端的状态保持 `UNKNOWN` / `NEEDS INVESTIGATION`。**负责人决策**。D1B-02 确认可接纳的旧变体、默认显示与隔离动作，审批任何可能跨越原值证据边界的转换。[盘点未确认项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L5-L19) · [待决清单](d1-01-b-open-questions.md)
