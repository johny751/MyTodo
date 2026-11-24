# 数据归属、命名空间与同步边界候选

2026-11-24（Asia/Shanghai）。候选标识 `d1-01-candidate.1`。本页标识 `FACT/PROPOSAL/UNVERIFIED/OWNER DECISION/BLOCKER` 分别表示静态事实、候选规则、未验证、负责人决定和放行阻断。本候选及合成工具不接入生产应用，不读取真实用户库、凭据、WebDAV 或 LAN。

本页使用 [统一候选](unified-data-contract-candidate.md) 的 ledger 与 raw/projection 定义。Windows C、Node 和 Android 的实际独立合成 SQLite 观察可用于限定工具证据，实际用户设备和完整生产应用仍须独立证据。

## 来源、账本和组件归属

| 归属 | FACT 与固定证据 | PROPOSAL |
| --- | --- | --- |
| 跨设备业务 | 五个 kind 为 tasks（含子任务）、notes、projects、tags、places；普通导出筛活体，record 与 data 的信息层不同。[A 主模型](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L19-L28) | 业务逻辑身份为 `(ledgerId,kind,id)`。来源字节、业务标准投影、关系诊断及墓碑分开保存。新候选只能读取已验证字段，不把显示默认写回历史来源。 |
| 应用级账户路由 | 根 accounts.json 含账号集合、目录及 activeId，Android 明确是应用级注册；各端创建时间载体不同。[A Windows](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L155-L157)；[A Node](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L44-L46)；[A Android](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L66) | 按安装/本机数据根保存路由及当前选择，并分别映射各账本。它不属于某一个账号的业务，也不因为名称相同自动与另一安装合并。无证的旧 createdAt 不补造。 |
| 账号及 origin 本地 | meta.settings、每账号同步配置与提醒回执；浏览器提醒键按 origin/accountId 区分。[A Node 本地载体](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L48-L56) | 记录本地账号、安装或 origin，以及账本对应。meta.settings 的原物理位置保留。提醒规则是业务，发过/稍后/去重账本是本地；统计不能补造回执。 |
| 应用或 origin 的反馈/工具 | Windows feedback/ideas.json、Web 两个无账号后缀反馈键、Android android-tools 与 Feedback Kit 均是本地载体。[A Windows](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L163-L164)；[A Web](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L53)；[A Android](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L73-L74) | 保留安装/origin/module/namespace。反馈字段、状态、时间与软删按各自格式，不能只因同名 notes/status/id 就进入任务域。跨安装、跨 origin 或跨平台重绑是独立决定。 |
| 派生数据 | entities 查询列、Windows 搜索表、三端任务统计、小组件与摘要由源和算法派生；计时日累计是已落盘聚合。[A 归属](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md#L23-L24) | 只把有足够输入和算法身份的结构列为可重建。保存旧列观察供核对，无法从业务重建的番茄钟累计归本地原始可得数据，不能删除后重新统计。 |
| 缓存 | storage.cache 是运行内存；cachedManifest 是持久 value/ETag 缓存；sync-base.json 可能是旧合并基线。[A Node](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L50-L55)；[A cachedManifest](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L132) | 分别记录缓存类别与 presence。缓存用于诊断，不授权远端当前状态；旧基线不能因名字像缓存就抛弃。缓存缺失、null、有效值及解析失败分开。 |
| 临时运行状态 | 编辑草稿、撤销、导航、HTTP/桥回调、Bundle、运行服务及通知，持久性各异；Feedback drafts 已在 SQLite。[A Node](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L54-L55)；[A Android](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L74) | 已提交值属一致性点；未提交内容记录存在/丢失风险，不能据已存任务补造。运行句柄、请求、旧会话权限和系统显示通知不进入激活候选。持久反馈草稿作为独立本地组件保存。 |
| 同步基础设施 | record/events、conflicts、墓碑、meta 复制身份/进度/pending、outbox 与持久 lease；现行单 WebDAV，无逐目标 ACK。[A Windows](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L124-L149) | 整个账本、元数据及未确认队列是连续性单元。归档旧 lease 不复制会话权限；原 Actor 续传需独占与进度对账证据。保护矩阵见 [同步状态保护](sync-state-migration-protection.md)。 |

**PROPOSAL O01。** 存储类别是归属，不等于可以独立恢复。主账本业务、复制记录、outbox/meta 位于同一一致性域，不能恢复业务到较旧点却复用较新 pending/cursor。应用路由可指向多个账本；被选择的本地组件必须记录其保护域和共同一致性要求。[备份恢复契约](backup-restore-contract.md)。

**BLOCKER O02。** 来源 ledger/install/origin/module/namespace 或一致性点不明时禁止把它归并为已确认的现有组件。不通过 UI 文案、文件名、hash 相同或同名 ID 推断归属。文件摘要证明字节完整性，不能证明来源授权、关系正确或实际可解密。

## Android 番茄钟

**FACT。** android-tools.timer.state 是全应用 SharedPreferences 中的版本化 JSON。task 保存 accountId/id/accountName/title/done 快照；单记录计时有 sessionActive、mode、running、completed、completionPending、durationMinutes、elapsedMillis、lastElapsedRealtimeMillis、lastWallMillis、bootId；focusedMillisByDay/completedSessionsByDay 为北京时间 epoch-day 的日聚合，当前裁剪最多含当日 32 天，没有逐次 session 或跨端事件。[A 计时字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L104-L119)。

**PROPOSAL O03。** 保留 JSON 原值、类型、版本、安装身份和日桶。任务关系只以已识别本地 accountId 与 tasks.id 核对，显示名称/标题是选择快照。任务缺失保留快照与诊断；不凭快照创建任务。聚合无法反推完整会话、已裁剪历史或逐次任务关联，声明不可逆。

**PROPOSAL O04。** 墙钟、单调时钟、bootId 分别表达。恢复归档不能授权跨安装继续旧计时或再次发送完成通知。原安装/启动上下文的续计需实际设备验证；其他场景候选只读呈现已记录值，重新计时通过未来明确的用户操作。completionPending 不是同步 pending 或 ACK。

**UNVERIFIED。** 真机重启、时钟调整、旧 API boot 回退、SharedPreferences/通知耐久性和账号切换后的历史关联未由合成模型验证。[A 计时未知](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L16)。

## Android 反馈、草稿、图片及恢复代次

**FACT。** MyTodo 已定位入口使用默认 Feedback Kit namespace；AAR 另支持独立 namespace。feedback-kit.db 有 records/assets/links/settings；records 的 bucket/id 和主业务 tasks/notes 独立。settings.restore_generation 与主 meta 不是同一版本/身份。恢复暂存 validation.db 另有 archive_entries。[A 固定 AAR 及四表](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L121-L143)。

**PROPOSAL O05。** 反馈身份按 `(installId,module,namespace,bucket,id)` 保存，namespace 无证时保留 unknown，不强制改 default。notes 完整 payload、revision、状态和软删除时间/token 留存；drafts 保留目标、baseRevision、完整 note、assetIds/inheritedAssetIds。反馈 meta 中 feedback_sequence、feedback_delete_batch 与其可达草稿/资产纳入一致快照，不与 WebDAV tombstone/outbox 混用。

**FACT。** 图片位于 files/feedback-kit/images；assets 提供 file_name/mime/size/sha256/width/height，links 维护关联但没有顺序列，顺序来自 payload.assetIds。便携 ZIP 有转换路径，不能推定它与全部内部 payload 一一等同。[A payload 与原图](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L145-L156)。

**PROPOSAL O06。** 保存实际原图 bytes、准确长度/摘要、资产 ID/文件名/尺寸、links 与原 payload 次序；覆盖当前笔记、草稿、软删和撤销仍可达资产。只有 hash、URI、标题、缩略图或缺失原图时不能声称完整恢复。模型的二进制夹具只证明夹具字节保存规则，不证明 SAF、FileProvider、图片解码或真机权限。

**PROPOSAL O07。** 原 restore_generation、删除批和序号原样归档。恢复作业的候选代次/切换记录另行登记，不能覆盖原代次作为历史修复。暂存数据库/展开目录仅属于本次验证作业或失败证据，不直接作为激活库；旧句柄、草稿队列及共享 URI 在真实恢复前需隔离并经组件行为验证。

**BLOCKER O08。** 缺原图、资产校验不符、记录/links/payload 不一致、组件 namespace 不明、草稿基线或代次冲突时阻止整组件自动激活。可交付只读缺损报告，不能把异常整形、清孤儿或删除草稿写成已无损恢复。暂存失败保留来源和错误，不更换成默认空反馈库。

**UNVERIFIED。** 历史 AAR、便携 ZIP 的完整转换差异、真机文件目录一致性、soft-delete 撤销、代次切换耐久性及 SAF 生命期保留 A 原状态。[A 反馈未知](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L15-L16)。

## 凭据及新增同步边界

**FACT。** Windows C/Node 使用 DPAPI，其他 Node 平台保护依赖本地 sync-key，Android sync-config.enc 依赖 Keystore；界面和业务导出不包含完整可认证材料。[A 配置保护](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L49)；[A Android 配置](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L68)。

**PROPOSAL O09 / BLOCKER。** 合成工具只使用明确的虚构配置与字节夹具。真实凭据、DPAPI blob、Keystore 内容、真实账号/密码/token 不读取、上传或试解密。生产备份的受保护配置范围、访问权限和重新认证必须由后续授权明确；配置缺损不按默认 enabled 或凭 hash 放行。

**FACT。** 已盘点业务没有任务附件实体或传输路径；反馈图片为本机独立内容；现有 outbox 没有每目标投递回执。[A 附件与双目标边界](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L17)。

**PROPOSAL O10 / BLOCKER。** LAN、多目标 ACK、业务附件传输仅作为未来独立协议议题。候选模型可以证明单目标状态保全，不能把这一结果解释成 LAN/WebDAV 双通道已安全。未知历史附件式字段完整封存并标 UNKNOWN，不重用反馈资产 ID 作为业务附件身份。

**OWNER DECISION。** 确定可选本地组件、同机/便携包边界、隐私和原图保护、未提交编辑处置、代次恢复策略、跨安装重绑及人工缺损接收流程。所有生产恢复、跨端写回和真实同步资格另行审查。Android issue #1 保持开放，不随 D1-01 收口自动关闭。[issue #1](https://github.com/johny751/MyTodo/issues/1)。
