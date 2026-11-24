# 关系映射与迁移保护候选

2026-11-24（Asia/Shanghai）。候选标识 `d1-01-candidate.1`。本页收敛 D1-01-B 的保守关系建议，供独立合成验证和负责人审核。`FACT` 为固定源码或 A 盘点事实；`PROPOSAL` 为候选规则；`UNVERIFIED` 为未取得证据；`OWNER DECISION` 为尚待负责人决定；`BLOCKER` 为阻止自动建立关系或放行生产的条件。合成模型结果只证明候选规则在该模型中的表现。

本页共用 [统一候选](unified-data-contract-candidate.md) 的 identity/raw/projection/presence 定义，三端实际合成 SQLite 类型观察单列，不以标准投影抹去旧平台绑定差异。

## 事实及证据边界

| 标识 | 已确认内容 | 固定证据 |
| --- | --- | --- |
| FACT | 现有五类业务 kind 为 `tasks/notes/projects/tags/places`；复制事件 key 解码为 `[kind,id]`，子任务仍是 `tasks` 行。现有 SQL 没有任务到项目或父任务的业务外键。 | [事件验证](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L65-L71)；[A 实体及字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L17-L41) |
| FACT | `task.project` 和 `task.place` 是名称输入，`task.tags` 是名称数组；项目有独立 ID。目录改名与删除路径不等于存在全域唯一名称或 SQL FK。 | [A 项目、标签、地点](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L65-L79)；[A 分类差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L37-L46) |
| FACT | 复制行 `parentId`、SQL `parent_id`、导出 `subtasks` 处于不同层；根级回退会遮蔽失配引用。循环任务保有 `generatedFrom/seriesId`，原生与共享 JS 的判重、截断与墓碑筛选不同。 | [A 父子和循环差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L57)；[A 循环字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L54-L63) |
| FACT | 现存 `record.events` 是合并后保有的事件字段，因果覆盖时旧字段可移除，空事件被过滤。因此它不是已发生全部修改的完整历史。 | [复制合并](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L73-L79) |
| UNVERIFIED | 用户旧库的重名、悬空父链、截断实例、未知扩展及实际 schema 分布。只有规范化导出时无法推知其之前的关系原件。 | [A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L14) |

## 身份、输入与解析记录

**PROPOSAL R01。** 候选逻辑身份为 `(ledgerId,kind,id)`。`ledgerId` 是经证据识别的账本边界，不由账号显示名、目录名、Actor、WebDAV folder 或同名项目推导。序列化形式由统一候选规范定义；原 `key/kind/id/data.id` 分别保留。反馈域的同名 ID 不进入主账本身份空间。

**PROPOSAL R02。** 每次解析使用同账本一致且声明完整性的快照，记录 `candidateId`、账本、快照/读取边界、源实体、源字段路径、原始载体定位、presence、原值及候选目标。标签还记录原元素位置、重复和次序。字符串输入显式保有 `rawName`；不以标准目标反查出的新名称替代它。原始 JSON/SQL 字节及类型保留规则见 [字段矩阵](field-compatibility-matrix.md)。

**PROPOSAL R03。** 关系结果采用冻结 B 的语义：`resolved/unset/missing/ambiguous/invalid/conflict/unknown`；父链和历史出处另有 `deletedTarget/cycle/depthExceeded` 诊断。只有 `resolved` 具有可用标准目标。非 resolved 的目标保持无值，原字段仍完整存在。记录状态不得把 JSON null、字段缺失、空串、SQL NULL 和空数组合并成一种原始状态。此处枚举描述候选逻辑，现行 wire 不新增这些字段。

**BLOCKER R04。** 账本身份不明、重复原 key、原 key 与原实体 ID 不符、目标 ID 非法、会影响候选数的冲突、原名被截断或快照不完整时禁止自动匹配。可输出只读诊断，不伪造目标、不补造项目、不将未知写成 missing。`missing` 只表示完整且有效的指定快照中没有合法匹配。

## 项目、标签及地点

**PROPOSAL R05。** 项目匹配仅比较同一 ledger 的 `projects`。原名称按 Unicode 字符序列精确相等；不 trim、不折叠大小写、不做 Unicode NFC/NFKC、不使用搜索规格化、不移除标点。候选必须具有合法且唯一的原身份。未删除的归档项目参与候选，并记录归档状态；墓碑不作为活跃匹配对象，只附历史诊断。此规则继承冻结 B 的推荐，仍不是生产部署批准。

| 标识与条件 | 标准结果 | 必须保留 |
| --- | --- | --- |
| PROPOSAL：合法非空 rawName，完整快照恰好 1 个合法项目 ID | `resolved`，仅给该 ID | rawName、presence、源字段、候选身份、归档状态、匹配策略与快照 |
| PROPOSAL：2 个以上不同合法 ID 同名 | `ambiguous`，不给目标 | rawName 与全部可定位候选；不按时间、顺序、平台或归档选择 |
| PROPOSAL：完整快照无匹配 | `missing`，不给目标 | rawName；有同名墓碑时保留其身份作为诊断 |
| PROPOSAL：空串、JSON null、缺失 | `unset`，不给目标 | 各自原始 presence；旧 UI 继承只是兼容展示 |
| BLOCKER：冲突、坏身份、有损或不完整材料影响候选 | `conflict/invalid/unknown`，不给目标 | 原件、问题路径及已有候选，不输出假唯一结果 |

**PROPOSAL R06。** `tags` 按每个原数组元素的对应位置，用相同准则查 `kind=tags`；`place` 只查 `kind=places`。不同 kind 的同名 ID 不互相匹配。标签筛选视图可以对 resolved ID 去重，来源数组不能被去重覆盖。旧实现以名称构造 ID 不授权候选凭名称创建一个不存在的目录 ID。

**PROPOSAL R07。** 重算关系只新增当前快照的投影。目录重命名、删除或归档后，旧 rawName、事件、旧解析结果仍按其快照保留。它不自动改任务、不触发墓碑、级联删除或新同步事件。人工修复如获未来批准，必须记录决定人、时间、理由、原值/候选/快照、所选完整身份及受影响版本；源值变化后重新核验，历史决定不覆盖原证据。

## 父任务及循环历史

**PROPOSAL R08。** `parentId` 仅解析同 ledger、`kind=tasks` 的目标。有效唯一活跃目标还须通过自引用、完整父链环检测及经批准深度界限后才 resolved。`parentId:null` 只有在已识别载体明确根语义时为根。事件补丁缺字段表示未修改该字段，不能变成新的根。SQL NULL 或旧导出升根本身不能证明原始根。

**PROPOSAL R09。** 完整快照缺父为 missing；可定位父墓碑为 deletedTarget；自引用或环为 cycle；深度超界为 depthExceeded；不完整来源为 unknown。保留原 parentId/parent_id、嵌套路径、子任务 order 和所有冲突。兼容 UI 可在带诊断的根视图显示孤儿，但不把原边写 null，也不恢复墓碑父节点。

**PROPOSAL R10。** `generatedFrom` 是同 ledger 任务 ID 的历史边。唯一可验证来源可呈现出处；来源墓碑保留为 deletedTarget，不成为活跃依赖或恢复模板。`seriesId` 保留原分组串，不要求等于存在的活跃任务 ID。仅凭标题、日期、ID 前缀、频率或相同 series 字符串不合并历史任务。保留所有已生成实例、重复实例、时间、子树与墓碑；候选映射不调用循环发生器、不重新排程、不重发事件。

**BLOCKER R11。** 只有树形导出时，可显示导出范围树，但必须标为投影来源。原先的坏边、环、墓碑和被切掉的 series/generatedFrom 仍为 UNKNOWN。不能把兼容树或一条有效历史边当作完整来源恢复证明。

## 主外键建议及可逆性

**PROPOSAL R12。** 未来物理投影表可对有效实体使用复合主键 `(ledgerId,kind,id)`；关系表的源与目标引用携带完整复合键，区分项目/标签/地点/任务。关系自身身份还须定位源字段和标签位置、解析快照，避免覆盖多次解析。原始复制记录、SQL 观察、异常原字段、墓碑及未解析关系存储在独立来源层，不以 active-only FK 拒绝它们。

**PROPOSAL R13。** SQLite 合成布局可以验证 resolved 关系引用完整目标键及 FK 完整性。FK 只应用于有效候选投影，不能为了通过 `foreign_key_check` 清除原悬空值、把非法 parentId 改 NULL、删子任务、丢墓碑、重新命名分类或新建假目录。历史出处的墓碑关系以原证据表达，不塞入活跃关系表。真实库 schema 与生产 FK 实施不属于本候选授权。

**PROPOSAL R14。** 同输入、同完整快照、同候选规则应得同结果。丢弃投影后只要原材料完整即可重算；仅存目标 ID 不能还原 rawName、presence、顺序、重复和历史快照。既有原件丢失、已清事件或截断关系属于不可逆或未知，报告损失/隔离范围，不宣称已无损。

**OWNER DECISION。** 确认精确匹配与归档候选策略、深度界限、人工修复权限、审计保留及非 resolved 的 UI 呈现；批准真实库/新写端之前另审生产安全证据。候选合成验证可以按 R01–R14 检查规则确定性和原材料不变，不能证明实际历史分布、旧客户端往返、Windows 搜索缓存刷新或多设备关系一致性。

**UNVERIFIED / BLOCKER。** 实机旧祖先搜索缓存、三端循环边界、旧 APK/GUI 导出回写、真机 FK/备份切换及 Android issue #1 均未因本页或合成模型解决。[A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L21)；[同步状态保护](sync-state-migration-protection.md)。
