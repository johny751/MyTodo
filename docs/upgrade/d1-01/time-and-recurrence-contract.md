# 候选时间、星期与循环契约

2026-11-24（Asia/Shanghai）。候选编号 `d1-01-candidate.1`。本稿是逻辑设计，独立合成工具用于验证候选断言，生产实现、旧二进制兼容和真实设备行为各自仍需证据。本文 FACT、PROPOSAL、UNVERIFIED、OWNER DECISION、BLOCKER 分别表示固定源码事实、候选建议、证据未取得、负责人选择和阻止受影响候选操作的条件。

## 固定事实及出处

| 标识 | 事实与限定范围 | 固定源码证据 |
| --- | --- | --- |
| FACT | Web/Android 共享 JS 日程必须是 `YYYY-MM-DDTHH:mm`；先加 `:00+08:00` 解析，再按固定加八小时格式化回环。这里没有历史 IANA 时区规则表。 | [schedule.mjs L2–L5](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L2-L5) |
| FACT | C 日程同样使用固定八小时偏移，16 字节分钟串经过 Windows 日历转换及回环核对；任务执行入口把负时间结果当作无效。 | [util.c L7–L8](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/util.c#L7-L8) · [tasks.c L7](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L7) |
| FACT | 现有 `repeat.weekdays` 是 0–6，0 为 Sunday。JS 使用 `getUTCDay()`，C 使用 `wDayOfWeek`，标签按 `日一二三四五六` 显示。 | [schedule.mjs L8、L16、L26](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L8-L26) · [tasks.c L7](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L7) |
| FACT | 共享 JS 周视图与 weekly interval 计算都以 Monday 开始；C 周视图和 weekly 计算也按 `(weekday+6)%7` 回到 Monday。此事实限定当前固定源码，不说明所有旧发布包。 | [model.mjs L9–L18](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L9-L18) · [schedule.mjs L16](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L16) · [query.c L10](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/query.c#L10) · [tasks.c L7](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L7) |
| FACT | 旧 JS 规则把 interval/minutes/days 数值化、截断并夹取；weekdays 数组数值化、去重排序。JS `repeat.until` 规范化只检查日期形状，C 表单另调用日历验证。两端都保留直到日期包含当天的截止比较。 | [schedule.mjs L6–L19](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L6-L19) · [operations.c L37–L38](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/operations.c#L37-L38) |
| FACT | daily 从当前实例加整日；monthly/yearly 保留 anchor 日，在目标月末夹取；weekly 以 anchor 的周为 interval 基准。`weekdays` 实际忽略 interval，只选 Monday–Friday。两端最多向前找 7×366 日，生成结果年超过 9998 不再生成。 | [schedule.mjs L11–L19](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L11-L19) · [tasks.c L5–L7](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L5-L7) |
| FACT | 完成时生成后续实例，并保留 seriesId/generatedFrom。C 判重可看到同 ID 墓碑，JS 判重在当前活跃树。复制子任务的 createdAt 在 C 为实际复制时刻，在 JS 为下一根的预计开始时刻。 | [schedule.mjs L21–L24](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/schedule.mjs#L21-L24) · [tasks.c L10–L11](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/windows/tasks.c#L10-L11) · [D1A 差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L48-L60) |

## 时间类型与两个独立判断轴

**PROPOSAL。** 所有候选时间都有 `type`、可定位原始来源和 `sourceSemantics`。这些是逻辑属性，不规定现有 wire 或生产列。原始文本、JSON 类型、SQL 存储类、精度、偏移和 presence 单独保留。定义两轴：`interpretable` 表示在明确来源语义下可形成确定值；`canSchedule` 表示具备当前获选候选调度能力的全部前提。`interpretable=true` 不会使旧端可写，也不会使 `canSchedule=true`。canSchedule 只表示候选类型、来源、共同时间域及必需控制的资格，不触发真实调度；设备投递、权限和历史到期策略另验。

| PROPOSAL 类型 | 严格识别及解释 | 可执行边界 |
| --- | --- | --- |
| `calendar-date` | ASCII `YYYY-MM-DD`，前推公历，年份 0001–9999。日历检查月、日及闰年：整除 4 且不整除 100，或整除 400。日期没有时刻或偏移。 | 不独立触发提醒。`allDay` 保留独立布尔；不得由 00:00 推断全天。 |
| `civil-minute` | ASCII `YYYY-MM-DDTHH:mm`，有效公历日，小时 00–23、分钟 00–59，无秒/偏移/空白。原日程固定语义为 `legacy-shanghai-fixed-offset-v1`（+08:00）。 | 原 C/共享逻辑的共同计划边界需要换算 epoch ≥0，结果年 ≤9998；fixed+08 起点精确为 `1970-01-01T08:00`。候选可识别更早或 9999 年文本，仍 `canSchedule=false`。 |
| `epoch-millis` | JSON 数字、有限、安全整数。单位必须由来源确认；允许识别有已知来源的负 epoch 和合法 0，不按数值大小猜秒/毫秒。 | 当前共同提醒候选非负且在可表示日历域；0 保留 epoch 零，不折为空。是否允许历史到期提醒是独立策略，不能自动补发。 |
| `offset-instant-text` | 完整公历日期、`T`、小时分钟秒、可选 1–3 位小数，以及 `Z` 或明确 `±HH:mm`。秒 00–59，偏移最大 ±14:00；±14 不允许额外分钟。保留原偏移和精度，可投影整数 epoch 毫秒。 | 绝对时刻识别不改变 createdAt/completedAt，也不提供提醒投递证据。超过毫秒精度保留并拒绝候选转换，不取整。`-00:00` 表示偏移来源未知，保持 UNVERIFIED，不冒充 +00:00。 |
| `monotonic-millis` | 只在原 boot/session/clock 来源相符时解释 Android 计时锚点，保留关联身份。 | 不可作为跨设备 epoch、创建时间、同步顺序或恢复后的计时起点。 |
| `logical-counter` | seq/clock/revision/queue/head/cursor 具有各自来源和安全整数约束。 | 不转换为日期；不同计数不得相互补齐。 |

**PROPOSAL / BLOCKER。** 不接纳空串、null、缺失、小数、数值字符串、布尔、错误日期、`24:00`、闰秒、未知单位或无出处偏移作为可执行标准时间。它们按各自原值保留，诊断字段不产生伪标准值。民用时间显式转换到 epoch 必须带固定偏移语义；禁止从操作系统默认时区或未经证实的历史 IANA 行为推导。

**FACT / UNVERIFIED。** Windows 快速便签写无偏移的 +08 民用分钟串，其他 createdAt/completedAt 路径可写带偏移 ISO。来源可固定定位时能声明该来源语义，未知旧串仍不具备 absolute instant。见 [D1A 便签时间](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L65-L79) 与 [model completionDay](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L42-L47)。

## 星期编码与保真映射

**PROPOSAL。** 原 `repeat.weekdays` 永远使用已证实的 legacy 编码保留。候选逻辑属性命名 `isoWeekdays`，`weekdayEncoding=iso-8601`，Monday=1 至 Sunday=7。逐元素映射 `0→7`、`1…6→自身`；逆映射 `7→0`、`1…6→自身`。不得把 legacy 原字段直接改成 1–7 数组。未知编码是 BLOCKER，不根据 UI 文案或数组中刚好存在 0/7 猜编码。

| PROPOSAL 输入 | 原值及解释 | 候选结果 |
| --- | --- | --- |
| 已知 legacy `[0,1,1,6]` | 原数组、顺序、重复保持 | 逐项证据 `[7,1,1,6]`；调度集合 `[1,6,7]` 单独派生，可由原值重建。 |
| legacy `[]` | 显式空，与缺失/null 分开 | 空集合仍保留；旧 weekly 的 anchor 星期回退可作为有版本的兼容投影，不写入源数组。候选计划执行须记录该派生来源。 |
| legacy `["1",2.5,7]` | 原字面量保持，不采用旧 Number/截断规则 | invalid-type/out-of-range；该数组对应计划不可执行，不过滤坏项后当作成功。 |
| candidate ISO `[7,1]` | 自有编码与来源 | 调度集合 `[1,7]`，如需旧表示，只能生成独立副本 `[0,1]` 并证明整个旧读写能力；本批不发送 wire。 |

## 候选循环与提醒规则

**PROPOSAL。** 规则类型、interval、anchor、until 及相关数组必须完整可解释。interval 是 JSON 整数 1–365。anchor/current 均为已识别 `civil-minute`，anchor 不晚于 current；来源缺失或冲突时保留并阻止该计划，不替换为 now。即使可以独立计算下一次，只要 current、anchor 或结果任一超出共同可调度时间域，整个计划的 canSchedule 仍为 false。原空 anchor/until 可依明确旧版本规则形成单独兼容投影，但补出的值带出处，不能静默覆盖原字段。截止 `until` 若不为空必须是严格 `calendar-date`。

| PROPOSAL 频率 | 确定性下一次规则 | BLOCKER / 边界 |
| --- | --- | --- |
| daily | 当前实例民用分钟 + interval 个固定 24 小时日，保持当前小时分钟。 | 计算溢出、结果超共同调度域、until 早于结果日期时无可执行下一次。 |
| weekdays | 严格晚于 current 的第一个 Monday–Friday，保持当前小时分钟。候选只在 interval=1 执行。 | 旧端忽略非 1 interval 的行为是事实；候选拒绝执行该组合并保留原规则，负责人选择前不把非 1 改成 1。 |
| weekly | 从严格晚于 current 的民用日筛选 isoWeekdays；其 Monday 起点与 anchor 周的整周距离能被 interval 整除，保留 current 时分。最多扫描 7×366 日。 | 不完整/异常 weekdays 整个规则阻止；空数组的 anchor 星期兼容回退需有显式派生标记。搜索耗尽标 `no-occurrence-within-search-bound`，不伪造日期。 |
| monthly | 以 anchor 月和 interval 为节拍，选择 current 月之后第一个节拍月；目标日=min(anchor 日,该月天数)，保留 current 时分。每次依据原 anchor，月末夹取不会永久改变日号。 | 目标与 current 顺序、上限、until 必须再次检查。不存在完整 anchor 不猜当前日期作为新系列原点。 |
| yearly | 同 monthly，月步长=12×interval；保留 anchor 月日，遇非闰年将 2 月 29 夹到 2 月 28，之后仍依据原 anchor 恢复闰年 29 日。 | 与 monthly 相同。不得将缺失历史实例补生成或改写旧 generatedFrom/seriesId。 |

**PROPOSAL。** until 包含截止当日，以固定来源的民用日期比较；end≥start 才可解释任务区间。已生成实例、来源边、墓碑、原时刻和子任务 ID 都保留，本批候选计算不创建生产实例、重算历史 createdAt 或触发同步事件。生成身份、容量和幂等策略见关系/版本契约，合成计算正确不等于实际三端发生器兼容。

| PROPOSAL 提醒模式 | 计算规则与 required input |
| --- | --- |
| offset | start 的固定来源 epoch − minutes×60000；minutes 必须 JSON 整数 0–525600。 |
| day | start 所在民用日期 `T09:00` 的固定来源 epoch − days×86400000；days 必须 JSON 整数 0–365。 |
| custom | at 为带既定 fixed+08 语义的有效 civil-minute；不得把表单 reminderAt 字符串当任务 epoch reminderAt。 |

**PROPOSAL / BLOCKER。** done=true 或明确无提醒规则时输出可解释的 `not-scheduled`，与非法规则导致的 `blocked` 分开。已有 reminderAt 与独立计算不同，保留双方并标 mismatch；没有实际投递/延后回执，不补发、不覆盖、不生成事件。done 必须明确为 JSON false 才能获得候选调度资格；done 缺失、null、0 或字符串等未知/非法控制可以保留独立可解释的派生时刻，但 canSchedule=false 并附诊断。负计算值可解释但共同 `canSchedule=false`；原来负值不改 null。0 是合法 epoch 记录；是否调度历史值待策略。

## 独立合成验证应证明的断言

以下是 **PROPOSAL** 的测试预期，不是已运行结果。工具需验证原值在输入前后逐字节/逐字段不变，并分别报告 interpretable 和 canSchedule；真实三端旧包兼容、系统 alarm、clock/boot、掉电和用户历史样本保持 UNVERIFIED。

| 断言 | 预期 |
| --- | --- |
| `2024-02-29` / `2023-02-29` / `2100-02-29` / `2000-02-29` | 合法 / 非法 / 非法 / 合法；非法串保留。 |
| `1970-01-01T08:00` / `1970-01-01T00:00`，明确 legacy fixed+08 | interpretable 都 true；epoch 为 0 / −28800000；共同 canSchedule 前者可进入计划评估、后者 false。 |
| `9999-01-01T09:00` | 可解释日历；共同 canSchedule=false，不能用合法日历证明旧端执行。 |
| legacy Sunday=0、Monday=1、Saturday=6 | ISO 7、1、6；逆变换恢复原编码，原数组顺序和重复另保留。 |
| 周范围 `2026-11-29`（Sunday） | Monday 起始为 `2026-11-23`，结束 `2026-11-29`。 |
| monthly anchor/current `2024-01-31T09:00`，interval1 | 下一次 `2024-02-29T09:00`；继续保留同 anchor/current February29 时下一次 `2024-03-31T09:00`。 |
| yearly anchor `2024-02-29T09:00`，interval1 | 2025 夹到 February28；2028 恢复 February29，anchor 不改。 |
| weekdays current `2026-11-27T09:00`，interval1 / interval2 | 前者下一次 `2026-11-30T09:00`；后者 blocked，原 2 不改 1。 |
| weekly anchor `2026-11-23T09:00`，current `2026-11-29T09:00`，ISO[7]，interval2 | 下一次 `2026-12-13T09:00`；必须严格晚于 current，不能重复当前实例。 |
| until 等于下一次民用日期 / 小于该日期 | 包含当日 / 明确无符合截止的下一次，原规则不删除。 |
| interval=1.5、minutes="5"、days=false、未知枚举、无来源 offset | 各自保留并 blocked 或 unverified，不截断、数值化或猜默认。 |

**OWNER DECISION。** 负责人在生产阶段确认固定偏移与未来 IANA 命名策略、时间识别与执行域、毫秒精度、weekday 空数组兼容、非 1 weekdays 处理、历史过期提醒策略、旧端支持列表及迁移窗口。**UNVERIFIED / BLOCKER。** 本批独立工具即使通过也不解除 T15/T16、同库恢复、Android issue #1、真实服务及旧写端隔离门槛，不授权生产迁移或开启 LAN/WebDAV 双通道。

**PROPOSAL。** 这里的 JSON 整数指 JSON number 的数学整数值；1、1.0、1e0 可以按同一整数值检查候选范围，原字面量仍保存在 raw，不能以投影整数覆盖原值。1.5、布尔和数值字符串不能据此通过整数检查。
