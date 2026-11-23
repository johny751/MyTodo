# 阶段 0 同步安全审查

审查日期 2026-11-24（Asia/Shanghai）。审查基线为 GitHub `master` 的 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。范围包括 Windows C、Node/共享 JS、Android WebView 与 Java SQLite 的事件、事务、WebDAV v2、迁移及恢复，另检查 LAN 和附件链路是否存在。本轮从该提交的源码和报告重新核对，并关联既有云端证据。受测提交与当前 Git blob 的对应关系见 [生产源码基线](production-source-baseline.md)。历史运行及限定范围见 [阶段 0 总报告](phase0-final-report.md)。

## 现有链路和 ACK 边界

| 链路 | 当前实现和边界 | 源码 |
| --- | --- | --- |
| Node/网页 | `exchange` 调用共享 v2 算法，数据库落到账号目录 SQLite。HTTP 服务固定监听 `127.0.0.1`，代理发往固定坚果云 HTTPS 地址。 | [sync-client](../../../src/sync-client.mjs#L5-L9) · [server](../../../server.mjs#L41-L63) · [sync-server](../../../src/sync-server.mjs#L19-L25) |
| Android | WebView 复用 `sync-client`、`delta-sync`、`replica`，桥接账号存储和 Java SQLite 事务。Java 网络入口连接同一固定 HTTPS 服务。 | [MainActivity](../../../android/src/local/gxtodo/replica/MainActivity.java#L121-L137) · [AccountStore](../../../android/src/local/gxtodo/replica/AccountStore.java#L45-L49) · [ReplicaDatabase](../../../android/src/local/gxtodo/replica/ReplicaDatabase.java#L23-L36) · [SyncStore](../../../android/src/local/gxtodo/replica/SyncStore.java#L40-L70) |
| Windows | `sync_run` 使用 WinHTTP 和 C 存储，独立实现同一 v2 协议及 WebDAV 确认。 | [sync.c](../../../windows/sync.c#L363-L407) · [database.c](../../../windows/database.c#L337-L338) |
| LAN 与附件 | 在当前生产目录未发现 LAN 发现、配对、撤销、传输和每目标投递账本。也未发现通用的附件对象、独立二进制存储或传输。业务备份、日志和 WebDAV gzip 批次/快照具有其他用途，当前五类复制实体为任务、便签、项目、标签、地点。 | [server](../../../server.mjs#L63) · [Android Manifest](../../../android/AndroidManifest.xml) · [共享实体类型](../../../src/replica.mjs#L3-L9) · [历史任务门禁](../08-development-task-gates.md) |

每个账号当前只有一套 `scope/epoch/pending/cursors` 和一个 outbox。WebDAV ACK 在同事务更新来源游标、清 pending、删除 `id <= through` 的行。Node 和 Android 的存储入口也支持整表 `clearOutbox`，用在单目标 scope/epoch 重绑时按现存字段事件及墓碑重建队列。既有设计适用于单一 WebDAV 目的地。如果直接增加 LAN，任何复用全局 ACK 删除入口的实现都可能使另一个目标失去唯一待投递副本。WebDAV 的 ACK 表示共同云空间发布，设备接收有自己的阅读进度。目前无 LAN ACK，也没有观测到既有双通道误删的运行事件。[共享元数据与重绑](../../../src/delta-sync.mjs#L202-L213) · [Node 提交](../../../src/sqlite-store.mjs#L22-L34) · [Java 提交](../../../android/src/local/gxtodo/replica/ReplicaDatabase.java#L31-L36) · [C 重绑与 ACK](../../../windows/sync.c#L169-L199) · [C ACK](../../../windows/sync.c#L235-L246)

双通道准入条件是持久化每目标投递状态、逻辑批次身份和本地可重发载荷。ACK 必须绑定逻辑空间、认证目标、批次身份及内容摘要。关闭通道、离线、超时或撤销不能被当作成功投递。只有所有必要目标已完成并满足墓碑和恢复保留条件，才允许逻辑回收。物理 outbox 行移除前，仍有待投递义务的载荷要先写入、校验并切换到本机持久副本。后续恢复须证明 WebDAV 已 ACK 时，LAN 可在禁止广域网的情况下从该副本发送同一逻辑批次。旧删除入口如仍可绕过目标账本，则双通道继续封锁。[正式同步约束](../07-development-standards.md)

## 事务、发布和重放

| 环节 | 当前静态结论与验证边界 |
| --- | --- |
| 本地编辑 | 实体当前值、复制记录、向量/时钟、outbox 与 meta 在一次事务提交。Node/Android 通过 revision CAS 和 SQLite 事务落盘，Windows 使用 `BEGIN IMMEDIATE` 及 SQL 错误检查。三端采用 WAL／FULL 配置。C0-07 覆盖明确的 SQL 读写、COMMIT 和清理二次错误，真实断电、底层 fsync、所有 SQL 分支及所有 UI 调用方均未在该运行验证。 [共享编辑](../../../src/replica.mjs#L104-L139) · [Node 存储](../../../src/sqlite-store.mjs#L6-L34) · [Android 存储](../../../android/src/local/gxtodo/replica/ReplicaDatabase.java#L12-L36) · [Windows 事务](../../../windows/database.c#L4-L14) · [Windows 写入](../../../windows/database.c#L337-L338) |
| 持久 pending 和发布 | 先事务冻结发布正文、epoch、actor、编号、路径及 through，再用条件 PUT 创建不可变文件。若目标已有同名文件，读取并比对原正文，否则拒绝覆盖。清单先验证 epoch 和相邻 head，再用强 ETag 条件写；发生 412 重读再合入本 actor。只有清单成功确认或同字节文件被确认且 head 已覆盖时才提交本地 ACK。ACK 失败依赖待发送记录按原正文重试，晚于 through 的编辑继续留在队列。C0-07 运行 45190559178 覆盖写前拒绝、落盘后丢响应、原字节重发、ACK 范围和 later-event 保留，服务端为合成夹具。 [JS 准备/发布](../../../src/delta-sync.mjs#L244-L275) · [C 准备/发布](../../../windows/sync.c#L219-L252) · [C0-07 证据](../c0-07-report.md) |
| 拉取和快照 | 按每个来源连续编号获取批次，校验 epoch、来源、编号及事件。应用事件和推进该游标共同提交。快照先校验清单路径与游标约束，再检查分片 SHA-256、epoch 和快照 ID。分片逐片提交，只有所有分片完成后才推进快照游标。分片中途失败可留下已合并内容，以可重复合并和游标保留恢复。快照发布先上传分片，再 CAS 登记清单，并检查本地 dataRevision 与远端进度。这里的权限与校验基于已受信任云空间和受支持客户端，SHA-256 用于内容校验；没有证明主动篡改清单的授权或签名保障。 [JS 快照/拉取](../../../src/delta-sync.mjs#L214-L243) · [JS 快照发布](../../../src/delta-sync.mjs#L276-L290) · [C 快照/拉取](../../../windows/sync.c#L200-L218) |
| 合并与去重 | 事件身份使用 actor/seq，保留因果未覆盖的字段候选。C 与共享 JS 同用逻辑时钟、ASCII actor、seq 次序，按 UTF-8 字节序展示冲突字段，删除墓碑并发优先，Android 直接执行同一 JS 合并。已保留字段的同身份异内容会被拒绝。字段事件会压缩，业务记录和 outbox 均不能作为永久全局收据账本。C0-04 最终 936 次执行及 936 次比较，C0-07 后的 f9 完整矩阵还有 702 条 producer lineage。它们证明各自向量与受测版本的语义，对长离线、多目标幂等和永久收据保留仍有缺口。 [统一规则](../c0-04-protocol-rules.md) · [JS 合并](../../../src/replica.mjs#L38-L103) · [C 合并](../../../windows/database.c#L120-L334) · [C0-07 证据](../c0-07-report.md) |

两项有明确代码依据、尚无运行结论的风险应纳入后续门禁。

1. **Windows 租约交接。** C 在向外请求前核验并续租，释放也核对 token。网络响应返回后，`ack`、批次应用和缓存更新使用各自事务，缺少相同的事务内 token 栅栏。若一条在途请求跨过租约到期并在另一窗口接管之后才返回，旧会话仍可能进入写入路径。ACK 会清 pending 并推进游标，范围切换或新 pending 时尤其需要保护。共享 JS 在请求和 commit 入口均校验 lease，存储以 revision CAS 防止并发提交覆盖。需要云端验证迟到响应与第二会话接管，可以用事务内原 token、scope/epoch 和 pending 身份的检查或等效机制关闭该竞态。已有强杀后接续及普通续租故障证据无法确认这个相互交错的用例。 [C 请求](../../../windows/sync.c#L67-L74) · [C ACK](../../../windows/sync.c#L235-L247) · [C 缓存与释放](../../../windows/sync.c#L395-L423) · [共享 JS 租约](../../../src/delta-sync.mjs#L310-L321)
2. **恢复历史 pending。** 现有 pending 检查校验正整数 through、正文和路径身份等。ACK 依赖所恢复的 through 与队列一致。源码未提供独立的本地账本，把所有恢复场景中的正文和被确认队列逐项绑定。D1 一致备份和恢复必须一起保护 pending 原字节、through、原队列、actor、scope/epoch 与游标。任何缺项、哈希不符或无法匹配的状态都应保留并阻断恢复发送。 [JS 校验](../../../src/delta-sync.mjs#L44-L54) · [C 校验](../../../windows/sync.c#L136-L155)

## 历史版本、设备丢失和恢复

- **v1→v2。** Node/Android 先保存不可变备份并用旧文档的强 ETag 条件设置升级标记，再以 `scope + backup + SHA-256` 绑定原库导入。导入标记、事件与 outbox 同事务，并保护既有墓碑。首次恢复快照在首次清单之前发布。Windows C 遇到未迁移 v1 数据或带旧备份的未完成标记时停止，需用支持迁移的共享 JS 客户端接续。合法旧 v2 批次和快照沿用既有格式。识别 v1 的客户端在收到 v2 标记时应停止，更新前需备份其仍未上传的离线编辑。新增实体类型需专门审定兼容合同并验证旧客户端安全拒绝。未覆盖未知旧客户端、真实私有 WebDAV 或已经损坏的空历史 manifest。[共享迁移](../../../src/delta-sync.mjs#L87-L201) · [v1 读取合同](../../../src/sync-core.mjs#L30-L40) · [C 迁移守卫](../../../windows/sync.c#L266-L354) · [C0-06 证据](../c0-06/reports/c0-06-report.md)
- **设备重新加入。** Fresh observer 用新库、新 actor 从快照后补批。C0-06 A30 证明原库在清单提交后被隔离，新库只读取清单和快照即可取回合成历史数据。A26 证明原库在导入后死亡，租约自然到期后继续发布。二者是不同恢复方式。仍有 Android 首崩和换库重试；逐项资格见 [Android 稳定性风险](android-stability-risk.md)。丢失设备的本地未发布事件只能从可信备份取得。业务 JSON 导出保留可读业务数据，完整复制恢复还需原库、身份、所有版本/墓碑、pending、游标和 outbox。当前无设备注册、远端撤销或身份轮换账本。不得把活动 SQLite/WAL 文件作为一份新设备数据库克隆；同设备恢复保留身份但需防止两份副本同时上线。 [旧设备和备份操作说明](../../sync-v2.md) · [共享重绑](../../../src/delta-sync.mjs#L202-L213)
- **WAL、账号和附件。** Windows 数据位置迁移已有 `sqlite3_backup` 及核验入口。当前通用 schema 没有正式迁移登记，仍需三端证实停写、原库和失败副本保全、恢复重放及多账号一致性。项目计划的附件元数据只能引用稳定 ID、尺寸、摘要、内容版本及状态；本体在有界独立存储传输，临时文件和完成文件分离，哈希成功后才原子可见。附件收据不能复用业务行 ACK，删除需要验证墓碑保留和内容回收。 [Windows 备份](../../../windows/storage.c#L34-L47) · [迁移与附件合同](../09-phase-one-entry-plan.md)

仓库已有旧版本的真实坚果云联调描述，阶段 0 的源身份和实际测试证据单独取自对应运行。当前基线的真实坚果云/用户私有 WebDAV、签名升级、设备长期运行和跨网络切换尚未验收。[历史产品说明](../../sync.md) · [阶段 0 云端证据](../c0-07-report.md)

本审查支持在负责人明确批准后开展 D1-01 合同和隔离的合成数据验证。真实生产库迁移需先完成 T15/T16、原库/副本身份核验、重复迁移和失败恢复门禁。LAN、双通道回收、附件内容发布、设备撤销和真实环境启用按各自证据另行开放。具体计划和退出条件见 [D1 准入决定](d1-entry-decision.md)。
