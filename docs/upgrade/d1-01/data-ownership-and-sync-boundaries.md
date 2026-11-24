# 数据归属与同步边界草案

草案日期为 2026-11-24（Asia/Shanghai）。依据 D1-01-A `6a4b179f361602f47429bc9aa88e51c0b61395e3` 的静态盘点。源码证据描述现状，设计建议、待设备验证和负责人决策描述后续工作。运行结论为 `NOT TESTED`。[D1-01-A 数据归属](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L19-L28)

## 归属、身份与生命周期

| 数据类别 | 已有源码证据 | 设计建议 | 尚待设备验证 | 需要负责人决策 |
| --- | --- | --- | --- | --- |
| 跨设备同步业务 | `tasks`（含子任务）、`notes`、`projects`、`tags`、`places`。`entities.data` 是合并后的业务投影，规范化 UI 还可能折叠值 | 以账本和 kind 原始 ID 限定身份。按来源保存原始复制记录、字段存在性和映射状态，另生成可用投影。新业务读端只消费有效投影。合并和删除以原复制记录为据，投影可重建 | 原生/UI 按旧值重建一致性、未知字段可见范围、旧记录读写往返和关联异常 | 是否采用只读投影作为兼容层，哪些异常影响单个字段、单行或整次写入 |
| 账号级设备本地 | `meta.settings`，Windows/Node/Web/Android 提醒台账及同步配置 | 保留对应账本身份。提醒的事件已发、延时、去重键原样保存。提醒规则与排程计算仍是业务和派生层。配置留原保护域，接入恢复需独立授权。在旧代码仍读 `meta.settings` 时保持其物理位置与本机作用域 | 提醒回执格式、设备迁移后的权限和通知去重，受保护配置在原用户或同设备能否复用，浏览器 origin 及 Android profile 的现场状态 | 设置与提醒台账的跨设备复制是否永远关闭，同机恢复是否默认保留本地回执，凭据的单独恢复权限 |
| 应用或浏览器 origin 级设备本地 | 应用级 `accounts.json` 账户目录与当前选择，Windows `feedback/ideas.json`，Web 的 `gxtodo.feedback.v1` 和 `gxtodo.feedback.before-import.v1`，Android 设备级工具偏好、原生番茄钟和 Feedback Kit | 保留来源平台、安装或浏览器 origin，以及应用级账户路由与各账本的对应关系，继续独立于账本同步。只有明确的本地导入/恢复流程可以选取组件。平台反馈的删除、状态和时间字段按各自格式解释 | Web origin/端口改变后的存留，多个账号共用模块的实际隔离，Android 反馈内部载体和便携 ZIP 的转换 | 哪些本地模块可随整机恢复，哪些可由用户单独选择，是否允许跨 origin 或平台重新绑定 |
| 派生数据 | `entities` SQL 投影列、Windows 搜索表和索引、三端统计、Android 小组件和日摘要。现有查询口径与 SQL NULL 等表现有差别 | 存储快照可保留现有投影供比对，有证据表明可重算的部分用指定版本算法重建。旧值按原列保存，计算失败标记错误。持久化番茄钟日累计缺少逐段原始事件，作为原始可得业务证据归本地数据 | SQL NULL 与空串在索引过滤中的影响、查询结果、统计时区、Windows 搜索父级缓存、Android 小组件刷新 | 哪些派生结构可在授权迁移中重建，是否保持平台现有搜索和统计差异 |
| 可再取得的缓存 | WebView/浏览器 `storage.cache`，本地 `cachedManifest`（值与 ETag）。`sync-base.json` 可能在 v1 兼容路径读作旧合并基线 | 缓存可备查。正式恢复以完整账本和重新取得的远端证据为准。归档保留 `cachedManifest` 的原字段及存在性，恢复会话获得授权后再按现行协议重新校验。旧基线的原文件、缺失与 JSON null 分开标记 | 失效、故障重启、scope/epoch 改变后的读取行为 | 本地备份需要携带哪些缓存作诊断，以及缓存存续期限 |
| 临时运行状态 | 未持久化任务编辑器、撤销队列、tab/窗口导航、HTTP 回调、Android `Bundle` 与系统通知和暂存。Android 已入 `drafts` 的反馈草稿属于设备本地持久数据 | 待处理写入在未来采集时应受停写屏障管理。已提交值纳入一致性点，未提交内容可单独记录存在性或风险。运行句柄、回调、租约持有权、正在显示的通知和恢复中的临时工作不进入激活候选 | 休眠、退出、重启、恢复切换时各原生 writer 是否实际停写，编辑和未完成操作如何提示 | 对中断前的未提交本地编辑，采用主动完成提交还是明确提示后暂缓备份 |
| 同步基础设施 | `entities.record`、`conflicts`、墓碑，`meta.actor/seq/clock/queue/vector/cursors/scope/epoch/pending` 和 `outbox`。`lease` 是持久化协调状态，远端 manifest/batch/snapshot 在单 WebDAV 域 | 将整个 `entities/record/outbox/meta` 作为连续性单元保留。区分归档的协调字段和可获得的未来执行权限。使用原账本身份核验，并在满足独占与远端对账门槛后才允许续传。业务导出只用于可读业务交接 | 同库重开、旧备份对账、Win 过期会话返回后的 ACK 和缓存提交、原始 pending 与实际 outbox 前缀逐项匹配 | 原 Actor 延续需要哪些排他证据，历史克隆隔离期限，以及丢失设备的重新加入策略 |

对应盘点见 [三端字段与复制层](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111)、[Windows 文件和运行态](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L151-L165)、[Node/Web 文件和运行态](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L42-L60)、[Android 文件、设置和运行态](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L62-L76)。

## Android 番茄钟与反馈

| 归属 | 已有源码证据 | 设计建议 | 尚待设备验证 | 需要负责人决策 |
| --- | --- | --- | --- | --- |
| `android-tools` 的 `timer.state` | 全应用 SharedPreferences，包含 `task` 快照及 `sessionActive/mode/running/completed/completionPending/durationMinutes/elapsedMillis/lastElapsedRealtimeMillis/lastWallMillis/bootId` 和按北京 epoch day 的 `focusedMillisByDay/completedSessionsByDay`。现有裁剪最长保留含当日在内 32 天 | 按安装及来源记录保存原持久化对象和日累计。显示或匹配任务时使用 `accountId` 与任务 `id`，保留标题、账号名和完成态选择快照。缺目标时展示原始快照及未解析标记。旧设备开机单调时钟和未完成计时只在可信的原安装/启动上下文经验证后继续。其他情况先只读呈现已记录状态并请求人工选定重新开始方式 | 真机重启、回拨/前拨、跨安装开机计数和日桶裁剪。持久动作、通知记录和单调计时之间的一致性 | 跨安装要保留哪些累计与偏好，是否允许重新开启计时，由谁确认可能的重复完成通知 |
| Feedback Kit 的 `notes` 和 `drafts` | `feedback-kit.db` 的 `records` 包含 bucket 及原 payload。`notes` 包含 `number/status/origin/assetIds/deletedAt/deleteToken`。`drafts` 有 `targetId/baseRevision/isNew/note/assetIds/inheritedAssetIds` | 保存反馈原记录、修订、原状态/顺序和软删除。草稿保留基线修订，恢复后待编辑者核对再打开。草稿提交须检查目标与修订关系。`notes` bucket 使用反馈域独立身份，避免误用任务便签或同步墓碑的路径 | 升级/重启/还原后草稿是否仍关联原编辑基线，软删及撤销的持续行为，未知扩展字段，便携 ZIP 的归一化范围 | 默认包含反馈草稿还是模块独立可选，文档与图片的保护、保留时长和跨设备恢复权限 |
| Feedback Kit 的资产与关系 | `assets` 记录 `file_name/mime/size/sha256/width/height`，`links(bucket,record_id,asset_id)` 连接记录和内容，`payload.assetIds` 提供数组顺序。实体图像在本机 `files/feedback-kit/images/` | 按模块及 namespace 保存 ID、链接表、原 payload、原图字节及其哈希。对应草稿、当前笔记、历史软删或撤销的仍可达资产一起纳入。内容校验完成后才允许发布本地恢复候选。URI、索引与显示派生可按本机授权重建 | 真机存储权限、跨目录文件与 SQLite 是否一致、非法/缺图的错误与恢复，部分 ZIP 的支持范围 | 附件内容的加密、容量限制、异常时整模块阻断还是仅只读预览 |
| Feedback Kit 恢复状态 | `feedback_sequence`、`feedback_delete_batch` 及 `settings.restore_generation` 有各自持久入口。`restore_<id>/validation.db` 的 `archive_entries` 属暂存 | 将持久代次和删除批放进同一反馈快照，保留原值和来源。原样归档与恢复后本机的代次变更分开登记。复用反馈库入口前验证其组件级代次逻辑，挂起旧草稿、运行队列和过期共享 URI。暂存库仅作失败证据或在验证过的本次作业中消费 | AAR 还原成功/失败、进程退出和重试时各模块句柄是否陈旧，代次是否按预期递增，持久 `feedback_delete_batch` 所需字段和附件是否完整 | 同设备精确恢复与便携恢复是否分别提供、代次重新登记的策略、失败暂存的访问和保留时长 |

对应盘点见 [Android 番茄钟字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L104-L119)、[反馈四表及恢复暂存](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L121-L143)、[反馈 payload、草稿和图片](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L145-L156)。

## 同步与权限边界

| 主题 | 已有源码证据 | 设计建议 | 尚待设备验证 | 需要负责人决策 |
| --- | --- | --- | --- | --- |
| 单 WebDAV 目标 | `scope/epoch`、manifest 版本及 `actor/seq` 属现有复制协议。WebDAV 发布确认后 ACK 受 `pending.through` 约束并在本地物理清理已确认 outbox。恢复时可用证据尚不足以重建全部历史收据 | 现行复制流保持原语义。备份如想恢复连续性，应复制或核对完全相同的队列、批次原文、epoch 与边界，按核验过的条件恢复现行客户端。待确认事项留在本地隔离状态 | Windows 过期会话与迟到响应、不同客户端重开原库时的一致性、历史 `pending` 对账、同一 Actor 双活拒绝 | 原 Actor/账本恢复资格和隔离责任人，未知或冲突状态如何人工处理 |
| LAN 与新业务附件 | 当前已盘点路径只支持五类业务 kind 及单 WebDAV。反馈图片是本机独立内容。历史未知字段中的附件样数据仍为 `UNKNOWN` | 双通道、多目标 ACK 或独立内容传输均作为未来另审议题。设计阶段将二进制原件、模型引用和目标投递收据分开建模。未来删除内容必须能证明关联和保留规则已满足 | 独立发送和恢复收据、内容缺失完整性、真正多目标数据留存、旧端未知字段读写 | 是否及何时另立 LAN、双通道和附件传输协议，兼容期保留方式 |
| 凭据与本机权限 | Windows C 和 Windows Node 使用 DPAPI，Android `sync-config.enc` 依赖 Keystore，Node 自带平台相关保护。Web/Android 对页面返回部分配置，导出无完整凭据 | 普通备份可记录脱敏配置和保护器类型。经独立权限批准可另行保存适当加密配置并声明绑定条件。用于证明完整性的清单及复位日志需避免泄露可直接认证的材料。恢复验收之前先暂停同步和通知 | 真实操作账号、Keystore、DPAPI、Android OS 权限与重签/迁移后的可用性 `UNKNOWN` | 认证恢复空缺时的重新配置流程和授权，备份包的访问和保护责任 |

对应盘点见 [三端复制元数据、附件及反馈](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111)、[Node 受保护配置](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L44-L56)、[D1-01-A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L21)、[阶段 0 同步审查](../phase0-final-review/sync-safety-review.md)。[备份恢复草案](backup-restore-contract.md) 定义允许恢复的证据条件，双通道或生产运行扩大须另行审批。Android issue #1 保持 `OPEN RISK`。[Android issue #1](https://github.com/johny751/MyTodo/issues/1)
