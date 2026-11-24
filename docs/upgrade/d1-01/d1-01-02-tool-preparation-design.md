# D1-01 收口与 D1-02 独立工具准备设计

日期：2026-11-24（Asia/Shanghai）。候选标识：`d1-01-candidate.1`。本页规定工具职责、隔离输入、比较断言和证据输出。实际实现文件、Git SHA、plan/工具 SHA-256、GitHub run/job/attempt 和结果以主 Agent 提交的工具清单及云端回执为准；下列逻辑组件和字段是 `PROPOSAL`，不宣称均已实现。

`FACT` 表示已有且有明确证据范围的事实；`PROPOSAL` 表示候选方案；`UNVERIFIED` 表示该范围仍缺运行证据；`OWNER DECISION` 表示尚需负责人决定的产品或生产准入；`BLOCKER` 表示应拒绝动作或结论的条件。设计冻结、静态审阅、合成通过、生产验证及正式发布分别记录。

## 静态依据与目标

| 标签 | 已有依据/候选目标 | 固定出处 |
| --- | --- | --- |
| FACT | 三端核心 DDL 是 `meta/entities/outbox`，共 16 列；Windows GUI 另有搜索派生对象，Android Feedback Kit 是独立四表及原图存储域 | [A 对象清单](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L5-L19) |
| FACT | C/Node 有依赖列位置/列数的 INSERT，Android 用命名 ContentValues；数据行、原 record、投影、outbox 与 meta 有各自语义 | [A Windows DDL/写入](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L9-L37) · [A Node 写入](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L10-L40) · [A Android 事务](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L10-L40) |
| FACT | ACK 可删除 outbox 前缀；原 pending 的 body/through 与队列、actor/scope/epoch/cursors 必须关联，业务 JSON 不构成完整复制恢复包 | [A 复制字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111) · [阶段 0 同步安全](../phase0-final-review/sync-safety-review.md) |
| PROPOSAL | 为 D1-02 显式列名候选准备独立 SQL runner、原值比较器、备份/恢复校验、故障注入和审计工具；只对完全隔离合成库产生可审阅证据 | 本页及 [版本登记候选](migration-versioning-contract.md) |
| UNVERIFIED | 未读取真实旧库/用户 schema；实际 Android JSONObject/SQLite API、Windows 原生路径、WAL跨文件一致性及历史字段行为仍有缺口 | [A 开放问题](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md) |

**PROPOSAL。** D1-02 工具准备不自动实施 D1-02 生产改动。显式列名 SQL 的候选只能新增在隔离工具/fixture 内，不修改 `windows/database.c`、`src/sqlite-store.mjs`、`android/.../ReplicaDatabase.java` 等生产文件，不让生产程序引用候选。通用 registry、测试列和文件切换只发生在测试工厂创建的合成候选。反馈组件保留独立域，其测试样表/原图字节不成为生产主库新表或任务附件功能。

## 统一输入与身份门禁

**PROPOSAL。** 每次运行绑定一份封存 `runManifest`，逻辑内容包括：`purpose=independent-synthetic`、candidateId、run/job/attempt、执行后端和版本、tool/plan/fixture 字节摘要、创建者工具身份、只读源文件清单、允许写入的隔离根、各 case 的唯一身份、源库/候选/恢复库路径及角色、预期 schema 指纹、合成账号/Actor/scope/epoch、预期文件数量/大小边界和故障阶段。实际字段名称以受审实现清单映射；不能凭工具名推断已有该保护。

| 门禁 ID | PROPOSAL：工具执行前及重新打开时必须核对 | BLOCKER |
| --- | --- | --- |
| TG-01 环境/目的 | 仅授权 GitHub 云端环境执行项目 SQL/构建/测试；从可信工作流及 run 身份确认隔离目的。本机仅文本编辑、静态读文档与文件哈希 | 本机误运行项目/SQLite、真实账号或库输入、运行环境未授权、candidate/purpose 不符 |
| TG-02 正向路径允许集 | 工厂在已解析允许根下独占创建新 case；输入输出均由清单正向允许。解析绝对目标、所有祖先与链接/重解析目标，核对仍在本 case；生产 checkout 源文件仅以封存白名单读取 | 任意 `--db`/环境路径逃逸、`..`、绝对/UNC/设备路径、symlink/reparse/hardlink 指向原库、错 case、未封存旧文件；只靠名称含 test 或目录存在放行 |
| TG-03 同库身份 | 记录 source/candidate/restored 各自的路径、工厂 caseId、文件/快照见证、Actor/scope/epoch、schema fingerprint 和原始摘要；读回同一 case、同一路径和预期角色 | 同一路径换文件、新空库或新 Actor 代替原失败库、身份丢失、候选与原库混用，缺 marker 时重建后继续 |
| TG-04 封存与SQL范围 | 校验 plan、SQL、fixture 原字节和执行顺序；runner 不接受未封存任意 SQL/动态路径。禁用扩展加载与任意 ATTACH/外部文件写入等逃逸能力；合法测试变更在受审 plan 明确列出 | checksum不符、加载生产模块产生写入、SQL 包含未允许的跨库/外部文件操作、临时改脚本后沿用旧 seal |
| TG-05 数据/网络 | 由 fixture factory 生成 synthetic 记录和二进制原件；scope/remote evidence 仅为无真实凭据的合成夹具。真实 endpoint、Token、Keystore/DPAPI数据均不输入 | 使用用户样本、真实密码/账号、真实WebDAV/LAN、把图片预览或token当作原件/凭据恢复来源 |
| TG-06 资源及清理 | 限定 row/文件/字节数、ZIP条目数和超时；保留失败证据。清理仅针对当前case中清单指定的可删派生物，先证明绝对目标和身份 | 原库/失败证据删除、递归清理未解析路径、复用旧目录掩盖失败、容量超限而仍宣称完整采集 |

**PROPOSAL。** 隔离标记是本工具目的与创建来源证据，不是生产库内新增字段。不能从 `user_version=0`、`actor` 看起来随机、空表或测试文件名判断合成身份。工厂独占创建后清单与 seal 可防止误用；如果实现尚缺任一适用门禁，应标明 `UNVERIFIED/BLOCKER`，不得把设计中的保护写成运行事实。

## 工具职责和禁用能力

| 逻辑工具 | PROPOSAL：职责、输入和输出 | 不可据此宣称/执行的范围 |
| --- | --- | --- |
| fixture factory | 从固定 A DDL 和合成值构造核心三表；任务、子任务、便签、项目、标签、地点、墓碑、冲突、outbox/pending及各类异常输入有独立编号。图片用合成原件字节，反馈采用独立合成域。输出输入摘要、schema及身份清单 | 不读取/克隆用户tasks.sqlite，不补造真实历史，不把Feedback草稿当任务备注，不修改生产数据库 |
| independent SQL runner | 在TG门禁后执行封存SQL；比较原位置型示例与明确列名候选，固定列数/加测试列/列顺序等合成变化单独分案；输出实际SQL摘要、绑定SQLite类型、事务结果、主错/rollback错、rows/meta/outbox及新进程重开 | 不给生产替换SQL背书，不从通用SQLite行为推断Java JSONObject/ContentValues或C cJSON实际行为，不在已有真实库上ALTER/回填 |
| raw/semantic comparator | 逐行按稳定key比较业务ID、SQL存储类型、JSON字段presence/null/空串/0、原record/冲突/墓碑、顺序及原字符串/字节；分别输出原值保真与标准投影差异，损失/隔离均定位源输入 | 不将解析再序列化后相等当原字节相等，不用行数相等/整包hash代替字段级差异，不忽略陌生字段/类型/数组顺序 |
| backup validator | 核对源库一致快照、必需组件与原图清单，逐件大小/原始SHA-256、关系闭合/SQLite完整性、pending正文与队列前缀；报告BR-01–05和跨文件冻结证据 | 不把WAL主文件静态复制、业务导出或缩略图当完整快照；不因integrity_check=ok就放行复制连续性 |
| restore/progress guard | 比较备份点B、最新停写点S、激活点A的身份/原值与events、ACK、cursor、pending、remote progress、本地反馈/原图代次；只模拟候选切换和恢复 | 不覆盖生产文件；不回退更早B而丢S后的进展；不重造Actor/seq/pending，不把新Actor接收场景当同Actor恢复 |
| migration-plan/registry demonstrator | 对独立synthetic候选校验migrationId、plan/implementationchecksum、sourceSnapshot及schema；registry与user_version同事务，读回持久态；重复执行和异checksum拒绝各有回执 | 不创建通用生产registry，不把legacyMigration/meta.version当SQL schema version，不接入生产启动 |
| fault injector | 用封存故障点注入候选SQL写入、登记、版本、COMMIT、快照采集、文件切换前后失败；记录是否实际命中，再新PID重开同一case/路径 | 故障未命中不得算通过；用try/catch伪造底层错误不算真实故障；进程kill不等于物理断电；新库重试不算原库恢复 |
| auditor/sealer | 独立读取运行产物，核对run/source/tool/fixture/case身份、stdout/stderr/首错和所有文件的SHA-256及数量；区分expected rejection、unexpected failure、skip、collection incomplete | 不重写首轮失败、筛掉stderr/坏样本、把工作流绿色或collector成功当断言通过；缺证据必须列缺项 |

**PROPOSAL。** runner负责执行与原始回执，比较器独立计算判定，audit再检查结果与输入/身份引用。共享fixture和统一报告格式不意味着共享期望值生成器；期望值由冻结契约和可追溯样例定义，不能简单复制实现输出形成“验证”。必要的投影比较与原字节比较分别有expected规则。备份的数据库文件hash可以随布局改变，原字段/复制层保真仍需单独验证。

## 断言计划与故障资格

下表全部为 **PROPOSAL**。实际执行/失败/跳过数量只能来自云端机器回执，计划行数不能称作通过数，也不等于完整生产T15/T16验收。

| 范围 | 必须产生的实际断言和反例 |
| --- | --- |
| 显式列名 | 固定原DDL下候选结果与基线全字段/原类型一致；新增仅synthetic测试列后命名INSERT保留默认/原字段；位置型失败留原主错；meta/entities/outbox一同核对。是否调用C/Node/Java生产API单列 |
| 兼容/类型 | 缺失、JSON null、SQL NULL、空串、0、bool、数字文本、非法/超范围值分别保留；parentId/quadrant/reminderAt、时间、数组/对象原数据不折叠；异常投影不修改源证据 |
| 关系/删除 | 唯一项目名称精确匹配、ambiguous/missing、父环/缺父/墓碑、循环来源异常都保留原名/ID；投影不补事件；复制墓碑与outbox ACK物理删除各自比较 |
| registry/version | 同migrationId同checksum已成功重开不重做；不同checksum/plan/source/schema拒绝；登记/版本/转换事务中故障只能完整旧态或新态；未知COMMIT先读回，attempt不提前提升版本 |
| 备份/原图 | 活动WAL已提交和未提交隔离按实际后端核对；跨文件共同屏障存在/缺失分别判定；原图hash/size、缺图/坏图/错误引用、ZIP越界/重复/超限各有拒绝回执 |
| 旧备份新进展 | 备份后新events、ACK清前缀/cursor推进、pending换代、remote head进展或epoch变化、反馈/图片/提醒回执变化均拒绝旧文件覆盖；当前业务投影相同而复制层不同也拒绝；无法判断即BLOCKER |
| 失败/切换 | 激活前失败原库/入口/原图不变；切换结果未知先读marker；激活后无副作用仅返回最新S原库；有新写入/ACK/通知/发布时阻断降回B并保全两侧 |
| 路径/身份 | 错case、错角色、逃逸链接、旧目录、源/候选交换、同路径换文件、缺marker/摘要、恢复用新空库或新Actor均拒绝；拒绝前无未授权写入 |

**PROPOSAL。** 每个fault case记录 `requestedFault`、实际 `faultHit`、命中操作及返回错误、写入/commit结果是否已知、源与候选路径/身份、首次PID、重开PID、前后rows/meta/outbox/pending/registry/user_version、原图摘要和活动指针。命中前失败、fixture配置错误、依赖终止、collector不完整等各有独立资格，不能算作目标故障验证通过。首次失败及重试保留不同attempt编号。

## 报告格式与实际平台边界

**PROPOSAL。** 机器报告至少链接run/job/attempt、source/tool/plan/fixture的不可变身份、candidateId、backend/SQLite/runtime/OS版本、caseId和所有原始证据。逐断言记录actual、expected、pass/fail/expected-reject/skip及首错；汇总分别列执行断言、真实命中fault、未执行和采集缺口。复制输出文件时保留原文件hash与交付hash，任何文本规范化明确记录，不改原始结果含义。

| 可能后端 | 可支持的结论范围 | UNVERIFIED：必须继续保留的边界 |
| --- | --- | --- |
| 独立通用SQLite/SQL后端 | 该引擎版本上封存DDL/SQL、事务、registry和原值比较器的合成行为 | C cJSON解析、Node DatabaseSync封装、Android JSONObject/ContentValues、应用账号/后台/真实路径等 |
| Node真实存储API隔离后端（若实际采用） | 该提交下Node API在指定合成case的实际写入/回读 | Windows C、AndroidJava/真机、浏览器origin状态、实际WebDAV等 |
| Windows原生隔离后端（若实际采用） | 该编译产物/API在云端指定合成case的实际行为 | GUI全部写入、用户多进程、DPAPI、真实设备文件切换和物理断电等 |
| Android隔离后端（若实际采用） | 实际构建/安装/API、指定测试库和新PID重开的用例范围，明确JVM替身或设备/模拟器 | 替身不证明AndroidAPI；Android首崩/后台/SAF/Keystore/签名覆盖升级和真实设备均需自身证据 |

**UNVERIFIED。** 主 Agent 尚未写入实际回执的后端不标pass；未运行工具能力标 `NOT EXECUTED`，未采集证据标 `INCOMPLETE`。本页不声称JNI、Android instrumentation、Windows生产构建或三端真实存储已验证。Android issue #1仍开放，A中的UNKNOWN/NEEDS INVESTIGATION仍保持原状态。

**OWNER DECISION。** 生产D1-02显式列名改动、迁移接入、registry载体/user_version编号、真实旧版本/设备范围、反馈升级、原Actor恢复和正式发布另批审核。工具证据用于评审候选规则与准备程度；不能扩大到真实数据、真实网络、LAN/WebDAV双通道或自动清理生产历史。[备份与恢复候选](backup-restore-contract.md) · [版本与迁移候选](migration-versioning-contract.md)
