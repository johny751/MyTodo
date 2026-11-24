# 版本与迁移契约候选

候选标识：`d1-01-candidate.1`。本页修订 D1-01-B 草案，以 D1-01-A 固定盘点为历史事实锚点；本批真实 HEAD、工具路径、云端运行和提交身份由主 Agent 的基线及验证回执单独记录，本页不预填结果。`FACT` 只表示注明范围的已有证据，`PROPOSAL` 表示候选规则，`UNVERIFIED` 表示尚无该范围运行证据，`OWNER DECISION` 表示仍需负责人作出的产品或生产准入决定，`BLOCKER` 表示应拒绝该候选动作的条件。规则获批或合成工具运行成功都不把生产未验证事项升级为事实。

`PROPOSAL`：本批工具只在 GitHub 云端的隔离合成工作集工作；不接入生产启动、存储、迁移或同步入口，不使用真实库、真实账号/凭据、真实 WebDAV/LAN。Windows/Android 的具体测试后端和证据资格以实际云端报告为准，独立 SQL 模拟不算其生产 API 或真机验证。当前生产核心仍为 `meta/entities/outbox` 三表；反馈属于独立组件存储域。新增迁移登记、版本标记或测试列仅属于独立合成候选，不部署到生产。

2026-11-24（Asia/Shanghai）。适用 Windows C、Node/Web 和 Android 三端。已提交的 D1-01-A 盘点为证据锚点 `6a4b179f361602f47429bc9aa88e51c0b61395e3`，对应生产源码 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。本页供负责人审核。文中的版本标识、登记字段及门槛是 PROPOSAL（设计建议）；本页不预填本批隔离工具运行结果，生产/真实设备门槛仍为 `NOT TESTED`。[D1-01-A 复制层与身份](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111)

## 版本轴与识别

| 版本或身份 | FACT（已有源码证据） | PROPOSAL（设计建议） | UNVERIFIED（待验证） | OWNER DECISION（负责人决策） |
| --- | --- | --- | --- | --- |
| 主账本 `schemaVersion` | 三端有相同的核心 DDL，Windows GUI 另维护搜索表，C/Node 仍有位置型写入；Node 已盘点路径未见 `PRAGMA user_version` 读写 | Schema 识别绑定经批准的存储族、源 schema 形状及能力。先按应用表/列/关键约束/索引等识别旧库，区分 Win GUI 与核心、反馈库与主库、系统/厂商对象。新布局应有单一权威版本；若 `user_version` 被选作声明，则与成功迁移登记在同一事务写入并互校 | 真实在用 SQLite 目录、系统对象、历史同版不同形状、版本标记是否被其他组件使用均待核对 | 选定版本载体、首批允许的源版本、必需和可忽略的结构差异，以及跨端共同或分端编号方式 |
| 业务 `contractVersion` | 当前业务 JSON `version:1/2`、`meta.version` 值 2、`revision/dataRevision` 各有用途，JS 读端会做字段投影和补缺省 | 用独立合同版本标识字段、类型、约束和关系语义。以来源版本选解码器；变更投影规则也需要有身份。旧包按识别出的原格式解释并封存原值。允许同一合同投影使用不同本地 schema | 部署版本支持的实际导出格式和异常值表现 `UNKNOWN` | 首个合同编号、最低读取/写入能力、何类字段扩展视为兼容 |
| `syncProtocol` | 当前 manifest `format: gxtodo-delta` 与 `version:2`、batch 自有 `format` 和 `epoch`，事件 kind 有固定白名单；存在旧 v1 文件入口与安全拒绝分支 | 保持现行版本与能力边界。未来若需表示旧 wire 无法理解的语义，另行审批版本/能力检测与接入控制，证明旧端不可写入不兼容的同步范围，再允许新语义发布 | 混合版本实际拒绝和断线重连，部分批次遇未知类型、旧客户端继续写入等行为等待验证 | 支持旧范围共存还是统一停写并协调切换，保留期限及退场准入 |
| `migrationId` 与迁移登记 | `legacyMigration` 是特定旧 WebDAV 导入的去重回执，记录 `scope/backup/sha256`，`initialized` 控制初次导入，现有 `revision` 用作账本提交比较 | 给每个后续转换分配不可复用的稳定编号，登记源/目标版本、交付实现身份和结果。现有标记按原义保留。数据库本地修订计数继续保真 | 历史标记缺失、重复尝试和中断现场的组合尚无设备结论 | 迁移编号目录、登记设计、日志留存和失败处置责任 |
| 发布与组件版本 | Git SHA、应用发布/包版本、Windows `native_index_meta.version`、Android Feedback SQLite helper version、反馈备份 `schemaVersion` 来源各异；反馈 `restore_generation` 记录本地恢复代次 | 由发布清单管理支持的输入和能力，分别声明业务、存储、复制与组件版本。反馈独立升级与恢复，保留原 `restore_generation`；新恢复动作只有按已验证组件语义成功提交才能建立新代次 | 历史 APK、反馈 AAR 上游和设备命名空间策略仍有缺口 | 允许的签名包与最低版本、反馈组件支持声明，以及是否允许把反馈和主账本分批升级 |

每个版本值保留原来源和字段存在性。未知的版本、来源或结构保持原样，进入只读诊断或隔离。缺少 `user_version` 标记或其值为 0、本地 `initialized=true`、协议中的数字 2、`restore_generation` 或搜索版本，都不足以为生产库授权或选定迁移。现有启动打开可创建表和初始化状态，未来只读预检应使用经验证的只读入口，必要时扫描经封存的副本。旧产品版本使用的实际库目录与额外 schema 对象继续为 `UNKNOWN`。[三端的列顺序依赖与版本边界](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L46) · [Node 副本版本与旧云端标记](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L118-L146) · [Android Feedback 结构](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L121-L158) · [未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L5)

**PROPOSAL（设计建议）**。改变主账本列、约束、物理表示或旧写端可操作性时按 schema 变化评审。改变字段类型、存在性、关系解析含义或标准值域时按合同变化评审。改变复制解释、支持的必需字段或可发送对象时按协议能力变化单独评审。通用发布版本仅引用上述变化，搜索重建与反馈还原仍归各自组件。格式兼容的声明必须基于读写往返和保真证据。新增可选字段依然可能使旧投影漏掉字段，不能仅根据“可选”断言可跨端编辑。[原生 SQL 与写入方式](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L9-L37) · [三端字段与白名单差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L46)

## 兼容矩阵

“旧端”指当前已部署客户端，“新端”指将来独立审批、明确声明读写能力的实现。分开核对四种入口。① 原库只读识别 ② 原库写入 ③ 跨设备现有协议 ④ 业务导入导出。浏览器与 Android 复用 JS，Node/Android 的 SQLite 写入和 Android 本地组件仍需单独声明能力。进入迁移窗口后，应用与同步进程均须停写原库和候选库，只有受控迁移步骤可写候选。切换后保留的原库只用于受控核验或批准的回退。仅独立、仍处于兼容运行状态的旧账本可按原规则写入。任何生产放行以实际构建/设备证据为准。

| 场景 | FACT（已有源码证据） | PROPOSAL（设计建议） | UNVERIFIED（待验证） | OWNER DECISION（负责人决策） |
| --- | --- | --- | --- | --- |
| 旧 Windows + 新 Android | C `db_open/db_put` 依赖固定核心形状，GUI 另装搜索对象。Android SQLite 有独立 bridge；C WebDAV v1 拒绝与本地 `db_import` 分支不同 | 两端只用现有 wire 的五个 kind 与已验证字段交换；新版合同投影留在本地。旧 Windows 只访问原库，禁止其打开更换格式的账本写入 | Windows 原生启动、GUI 搜索与定时写入、原 v1 拒绝是否保持，Android 升级/回退与待发事件 | 该组合支持哪个已测范围及期限 |
| 新 Windows + 旧 Android | Android WebView `normalizeState` 和 `stateJSON` 各有投影/五类型边界，SQLite 写 `ContentValues`，回执及反馈为独立设备本地状态 | 新 Windows 对原界面未知字段不导出或回写，保留原复制层。共享旧范围仍仅发布已验证的旧语义；旧 APK 保留原 schema 和本地状态 | 旧 APK/签名覆盖、后台停写与重开、父 ID 空串和 `quadrant` 规范化 | 允许的旧 APK/设备范围 |
| 旧 Node/Web + 新 Windows | Node `entities VALUES(...)`，JS 业务投影重新规范化；旧浏览器请求由 Node 服务落库 | 版本认定要包括服务端写入器与对应浏览器/API 能力，停住旧 Node 进程与浏览器待提交操作后才允许更换账本。跨设备同样限制在已验证的旧语义 | 服务重启、旧标签页/离线队列重新发请求、Windows 原生和 Node 共用根目录的阻断 | 旧 Node 和旧页面能否继续作为独立旧范围使用及其关闭时间 |
| 新 Node/Web + 旧 Windows | C 原账本与 Node 核心 DDL 现状接近，写法仍耦合原列序。接口在 JS 和 C 不一 | 新 Node 不将升级后的文件交给旧 C；旧账号保留原库原入口。协议兼容以类型、字段和复制行为证据为条件 | 旧 C 再次启动时文件保护、Node 进程与 C 同目录并发，业务导入后的字段保留 | 是否支持原库上的只读跨端访问，以及隔离方案 |
| 三端版本不同、旧设备长离线后再上线 | 当前通过 `actor/scope/epoch`、manifest heads、游标、快照及 pending 推进，现有源码未确认额外协商机制 | 所有写端须在切换计划清单内。旧 writer 未能停写或归属未知时维持原范围，升级账户候选保持隔离。混用时只能使用已验证的旧交集；重新上线先核对账号、域、远端进度和能力，落后或不兼容分流 | 三端错峰、旧应用后台重启、离线未发队列、旧会话迟到响应、较早快照 | 支持期、强制升级条件、离线保全与重新接入流程 |
| 未知字段、未知 kind 或碰到新合同 | C/JS 可以校验五个 kind 内的部分一般未知字段，旧 JS UI 不提供无损往返保证。旧 kind 白名单和 Android 导出会约束未知实体 | 新端保留可读取的安全原始字节，标准投影明确不支持。遇不支持的必需字段、kind 或版本时，未来适配应阻止提交整个不可解释的输入单元并保持原进度，保全待处理材料。未经验证的字段或 kind 留在本地隔离，禁止借旧范围转发 | 批次部分不识别、重放、旧 UI 往返、攻击性键及过长数据的边界。此为未来接收契约 | 必需能力标记、扩展是否可忽略，以及隔离后人工处理流程 |

识别出的原格式可生成只读兼容投影。已批准的降级导出若有字段被遗漏，须列出范围、数量、原始备份和影响，并标明这是业务副本。未知字段留在验证过的原载体中，不把原始内容注入 UI 对象、现有 wire 或数据库写入。旧读端是否认识新格式、是否保持未知字段仍看实际兼容证据。建议对关键字段区分缺失、JSON null、空字符串、SQL NULL、数值 0 和类型/范围错误。界面后备值和派生列不能覆盖原证据。[字段兼容矩阵](field-compatibility-matrix.md) · [D1-01-A 白名单差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L46) · [三端读写入口](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L5-L15)

## 保真等级与确认条件

| 等级 | FACT（已有源码证据） | PROPOSAL（设计建议） | UNVERIFIED（待验证） | OWNER DECISION（负责人决策） |
| --- | --- | --- | --- | --- |
| 可逆 | 原 `record`、元数据与原 pending 可分开读取，`entities` 有业务和复制两个载体 | 用已验证原始载体做源，保留原始字段存在性及类型，添加可重算投影或明确的一对一映射。原始 bytes/值与指纹都可从安全快照核对 | 三端原字段、关联、墓碑、冲突、事件、未确认队列和 meta 在同库重开后对照 | 哪些投影达到放行标准，哪些原始载体必须长期保留 |
| 投影有损，整体可追溯 | C/JS/Java 对父 ID、象限、提醒及时间转换各有差异 | 截取、规范化、日期解释、浮点转整数、忽略非法项都生成明确损失/隔离记录。只要原底本可恢复，仍能更换投影规则或离线复核。禁止从投影倒推原值或补造事件 | 历史原值及缺损样本范围、损失报告足以定位每条异常 | 可降级导出的数据范围及逐条恢复责任 |
| 不可逆或目前不确定 | 被历史投影舍弃的数据、已物理清出的队列、缺失文件字节、过去计时会话及相同名称歧义无法仅凭活动视图重建 | 报告不可逆或 `UNKNOWN`，暂停受影响写入/关联。重名项目 `ambiguous`、无匹配 `missing`，保留旧名，仅在唯一且同范围合法匹配时建立 ID 关联。来源语义不明的旧时间保留原串，异常循环链保留原 ID | 寻找已保全原始快照、排查实际历史来源，确认人工更正语义和影响 | 人工确认补充信息的依据、哪些拒绝或隔离，以及是否接收注明损失的部分恢复 |

人工决策不得替代备份、版本识别或实际验证。原始记录内已被支配或物理删除的数据不假定可回找。将来若经批准更正，可通过单独记录表明更正来源与依据，原始层仍保留。相关字段与恢复风险见 [D1-01-A 字段差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L5-L28) · [D1-01-A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L18) · [关系转换方案](relationship-migration-strategy.md) · [备份与恢复](backup-restore-contract.md)

## 后续迁移的状态与失败边界

| 阶段 | FACT（已有源码证据） | PROPOSAL（设计建议） | UNVERIFIED（待验证） | OWNER DECISION（负责人决策） |
| --- | --- | --- | --- | --- |
| 识别与停写 | 三端有 SQLite 提交事务及不同应用入口。Windows CLI/GUI、Node 服务、Android bridge 与后台能力需要分开考虑；复制拥有异步请求和租约 | 在任何生产写入前锁定账号、实际库路径、应用 writer、Actor、scope、epoch 和源 schema。等待已提交动作核实，禁止旧进程、后台任务及过期会话改变候选。来源未识别、版本更高、并发写入未停止或缺授权则拒绝 | 当前在用 writer、进程/服务/设备入口是否真能停，旧 LAN/WebDAV 未启用边界，Windows 迟到响应隔离仍待验证 | 允许的维护窗口、停写证据和回退负责人 |
| 归档与预检 | WAL、`meta`、`entities`、`outbox` 与反馈/文件组件是不同边界，业务导出缺完整复制状态 | 停写后建立可校验原库恢复点及必要外部数据的同代清单。校核源 schema 和版本、原始行及资产数量/摘要、Actor/范围/进度和待发原文。新建候选与原库隔离，不接受不完整的必要组件 | WAL、挂起写端、文件断点、设备原库身份与备份恢复验证；`T15/T16` 待完成 | 备份必需集、最低保留期限、所需设备组合及是否允许带缺失项的独立业务副本 |
| 转换与登记 | `revision` CAS、事务错误传播、旧 `legacyMigration` 去重与行合并证据为限定测试，位置型写入风险仍在 | 未来用显式列名和源数据版本化解析器。每步 `migrationId` 先由受审清单分配，候选库登记源库身份及源 schema/contract、目标版本、实施提交或转换规范与校验摘要、原始备份 ID、转换/隔离计数和时间。版本标记与成功登记同本地事务提交，跨文件步骤用独立持久记录追踪。相同身份和校验摘要成功时重启不重做。不同摘要、源或目标冲突时拒绝 | 模拟失败不等于同库恢复。T15 故障点覆盖备份、DDL、回填、登记、提交边缘、切换及重启。T16 验证历史版本保真 | 注册与校验摘要的权威位置、版本兼容映射和重复迁移拒绝策略 |
| 验收与激活 | D1-01-A 有数据与写入路径清单及未验证项，历史同库与换库回执分别存在 | 候选身份、预期字段和文件哈希、SQL 一致性、记录/队列和引用均匹配，再由新进程重开同一指定候选确认。文件切换须经可恢复交接并另验最终目标路径。激活前保留原指针和原库，关闭写入和复制直到验收完成。恢复旧 Actor 继续发送须按备份契约另行核对远端和旧 writer 排除 | 同库核验必须有同一实际库标识、路径、Actor、新进程、rows/meta/outbox/pending 与首次失败。跨文件恢复、掉电、旧应用误启动和切换完整性待测 | 是否联动激活反馈或本地组件、何时恢复只读或写权限，以及应用发布/升级授权 |
| 失败与回退 | 阶段 0 保留首次失败、同库重开及换库独立尝试；已 ACK 队列可能物理删除，远端文件可独立提交 | 提交前错误回滚候选事务，保留首错、来源和候选；跨文件切换后检查实际活动指针及持久记录。只有证明尚无新写入、ACK 或外部副作用且原库仍等于切换前最新冻结状态时，才可切回该原库并复核身份；不得切回更早的备份。已有新写或远端提交时冻结并保全两侧，人工确认合并或前向恢复；禁止用旧快照覆盖新进展或将数据库回退视为远端回退。恢复路径若无法确认，保持隔离 | 同库复开、首次失败后再次启动、切换中断、回退后旧客户端写入和远端接收，Android issue #1 仍开放 | 首错证据策略、切换后回退和冲突负责人、允许何时清理原始备份 |

需要区分尝试日志和成功迁移登记。尝试日志可记录失败、中断和停写/切换状态，供续跑核对，不能提前提升成功版本。成功登记的摘要应绑定不可变实现与源输入身份，禁止以同一 `migrationId` 替换实现后无痕重跑。恢复后若任一存储族、Actor、范围或必要文件身份不匹配，保留原态并停止激活。设备验证放行条件仍以阶段 0 准入及后续负责人审批为准。[D1-01-A 同库/备份限制](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L14-L19) · [阶段 0 准入门槛](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/phase0-final-review/d1-entry-decision.md#L15-L21) · [Android issue #1](https://github.com/johny751/MyTodo/issues/1)

## 待审核决定

- **OWNER DECISION D1B-06**。评审独立版本轴、迁移登记与校验摘要、明确支持的原库版本和混合端兼容表。旧端停写能力及数据保真纳入上线门槛。
- **OWNER DECISION D1B-07**。评审恢复后恢复本机写入和重新接入同步的授权点，确认旧 writer 隔离、旧 Actor 续用核对和切换后失败处理责任。

两项均为本批审批输入，执行仍待独立准入。[D1-01-B 未决问题](d1-01-b-open-questions.md)

## 本候选补充：迁移编号、checksum 和事务登记

**FACT。** A 盘点的三端核心是 `meta/entities/outbox`，Windows GUI 的搜索表和 Android 反馈库属于其他对象/组件域。Node 和 Android 主库未见应用 `user_version` 管理，现有 `legacyMigration` 回执属于特定旧 WebDAV 导入，不是通用 SQL schema registry。不得把 metadata 数字 2、搜索版本 4 或反馈 helper version 1 当作新版统一 schema 编号。[A 核心对象](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L5-L19) · [A Node DDL](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L10-L40) · [A 反馈域](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L121-L156)

**PROPOSAL。** `d1-01-candidate.1` 的通用 registry 仅为独立合成候选设计。将来允许 D1-02 验证显式列名时，不得同时接通 schema 自动迁移。本批不会向真实三表或 Feedback Kit 添加 registry、`user_version` 或启动升级入口。合成库采用单独命名的 registry 和已封存 plan；真实主账本和反馈库的登记载体、版本值仍待各自审批。

| 登记项 | PROPOSAL：原始输入与用途 | BLOCKER |
| --- | --- | --- |
| `migrationId` | 受审计划分配的稳定 ID；测试 ID 明确含 synthetic 标识，绑定存储族和不可替换的转换语义 | 重复 ID 对应不同 SQL/实现、版本/存储族改变、失败后修改脚本继续沿用旧 ID |
| `planChecksum` | SHA-256 对 `plan.json` 封存原始字节计算，清单不在自身字节中放自引用摘要；路径、顺序、migrationId、源/目标和每步实现摘要属于封存 plan | 计划文件变化、条目遗漏/重排、重复 ID、摘要输入范围不明、外部传入摘要没有独立锚点 |
| `implementationChecksum` | 每步 SQL/转换文件封存字节的 SHA-256；多文件先由有序文件清单逐件校验。LF/编码规范化只在封存前执行并记录源/封存双摘要 | 执行文件与封存摘要不符；事后重编码或修改 SQL；只用 filename/Git 短 SHA/mtime 代替实际字节摘要 |
| 源与目标 | `sourceSchemaId/sourceSchemaFingerprint/targetSchemaId/targetSchemaFingerprint`、读取器/写入器能力、候选 contractId；源记录的类型和值存在性独立保留 | schema 未识别、user_version 与实际形状不符、未知对象/约束影响不明、源版本高于支持范围、反馈域误用主库迁移 |
| 输入身份 | sourceSnapshot/backupId、原库与候选映射、账号/组件、Actor/scope/epoch、冻结代次、原始 rows/meta/outbox/pending 与附件摘要 | 原库/候选被替换，pending 原正文或队列前缀不符，存在备份后的事件/ACK/remote progress 或不可判定的新进展 |
| 结果与数量 | 源/目标行及引用摘要、保留/投影/隔离/显式损失数量、成功迁移时间与工具/运行身份；仅在结果一致性验证通过时登记 success | 数量凑平但原 ID/类型/事件/附件不等、隔离记录丢失、把失败 attempt 记作 success、时间来自虚构证据 |

**PROPOSAL。** 合成事务采用以下不可拆分的本地成功边界：识别已批准源 schema → 开始受控写事务 → 使用显式列名转换 → 验证目标行与复制/队列不变量 → 写成功 registry → 写目标 `PRAGMA user_version` → COMMIT。所有成功版本和 registry 在同一 SQLite 事务中提交。registry 的初次创建如属于该 step，也在同一候选事务内；旧库打开或只读预检不能创建它。COMMIT 前后故障必须重新打开同一候选路径，从实际持久版本、registry、schema 形状及行摘要判断完整旧态或完整新态。不能因为应用内变量已经更新就宣称迁移已提交。

**PROPOSAL。** 成功后重复启动只有在 registry、migrationId、planChecksum、implementationChecksum、源输入身份、实际目标 schema 和 user_version 全部一致时才跳过同一步。发现登记 success 但结构/版本/内容不符，或目标结构出现而 registry 缺失时，记录 `BLOCKER` 并隔离；不能补写 registry、补改版本来绕过检查。尝试/故障日志在独立审计域记录阶段、首错、PID、路径和返回值，不能提前推进成功版本。原 `meta.revision/dataRevision/seq/vector/cursors/pending` 不用作 registry 字段，也不为测试程序方便而重置。

**UNVERIFIED。** 上述是一致性候选而非真实三端 API 保证。DDL、user_version、registry 的同事务行为需从实际云端 SQLite 回执确认；Python/CLI SQL runner 的通过只能归属于该后端。Windows C `db_open/db_put`、Node `DatabaseSync`、Android `ReplicaDatabase`、Feedback SQLiteOpenHelper 的生产接入尚未实施。反馈独立域与图片文件不能通过主库一笔事务获得跨模块原子性。

## 本候选补充：迁移计划与旧备份保护

| 状态 | PROPOSAL：动作和判定 | BLOCKER |
| --- | --- | --- |
| `identified` | 封存原库身份、schema 及当前停写点 `S`，绑定 plan/implementation 字节；备份 `B` 与 `S` 分开保留 | 只凭 user_version=0 或主库文件存在选计划；旧 writer 未停止；当前头或生产差异尚未核对 |
| `staged` | 对已声明合成候选使用隔离路径、核对备份原字节/原图与复制基础设施；原工作集保持不变 | 用业务 JSON 重建原 Actor/seq/pending，或把旧 `B` 直接替换 `S` 当前库；发现或无法排除 `B→S` 新 events/ACK/remote progress |
| `committed` | 新进程重开同一候选，证明 registry/user_version/schema/rows/meta/outbox 同一成功态，失败时保留首错 | 新库/新 Actor 重试替代原失败；registry/checksum 不符；未知 COMMIT 结果未经读回即重跑 |
| `activated` | 本批只模拟活动指针，不改生产路由；若将来放行，先核对最终目标路径与所有必要组件，同步另行准入 | 实际组件未匹配、旧会话可能迟到，或未核对远端就恢复原 Actor 发送 |
| `failed-before-activation` | 原库和 `S` 活动入口不变，候选隔离，按原失败身份读回 | 删除/覆盖原库、清理原 pending/WAL/原图；用更早备份掩盖当前源状态 |
| `failed-after-activation` | 证明无新写入/ACK/通知/远端发布且原库仍等于 `S` 才可回到该原库；有新副作用或不确定则保全两侧前向对账 | 直接降回 `B` 或旧版本库；删除新 events/ACK；把本地 DB 回退解释为撤回已发布远端对象 |

**PROPOSAL。** 任何降级导出生成独立业务副本及逐字段损失/隔离清单，不覆盖主账本，不取得原 Actor 连续性。不可逆或缺损项继续标 `UNKNOWN` 或明确 loss；唯一项目名称匹配只建立可追溯投影，不推造历史 ID/事件。备份后的新进展比较规则以 [BR-01–05](backup-restore-contract.md#本候选补充备份之后的新进展与降级阻断) 为共同门禁。

**OWNER DECISION。** 本次仅冻结候选规则和工具设计，不决定生产 schema/user_version、真实迁移 registry、旧版本支持范围、旧写端接入、反馈升级或正式降级。D1-02 独立工具可验证指定合成 SQL 及保真/阻断断言；生产合并与执行入口仍须另批审核。[独立工具准备设计](d1-01-02-tool-preparation-design.md)
