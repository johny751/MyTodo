# 同步状态迁移与恢复保护候选

2026-11-24（Asia/Shanghai）。候选标识 `d1-01-candidate.1`。`FACT` 是固定源码事实，`PROPOSAL` 是模型与后续设计规则，`UNVERIFIED` 是证据未得，`OWNER DECISION` 是负责人决定，`BLOCKER` 是放行阻断。只设计和验证完全隔离的合成状态；不改变 ACK/outbox/cursor/manifest/batch 的现行生产语义，不连真实服务。

身份及字段表示遵循 [统一候选](unified-data-contract-candidate.md)。三端实际独立合成 SQLite 的读取、事务和原 bytes 保存报告，与模拟的远端状态/会话故障、完整生产程序和真实设备证据分别报告。

## 持久载体和计数含义

| 载体/字段 | FACT 与固定证据 | PROPOSAL 保全规则 |
| --- | --- | --- |
| entities.key/record/data/conflicts/deleted | key 是 kind/id；record 是现存复制合并输入，data/conflicts/deleted 是投影；旧覆盖事件可能不再保留。[复制合并及物化](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L65-L102) | 保存原 TEXT 字节及 SQL 类型、原 key/ID、事件与冲突；来源能力受限时显式标记。不能将活跃导出当作完整 record 或生成已不存在事件。 |
| outbox.id/event | queue 分配本地行 ID，event 是独立 JSON TEXT；按 ID 读，ACK 按 through 含端点物理删除。[A 队列](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L28-L29)；[事件和队列分配](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L115-L122) | 每行保存 ID、原 event TEXT 字节、长度/hash 和已知顺序。队列 ID 不是 actor seq 或 batch index，不为了顺序整齐重排或重编号。 |
| meta.pending | null 或 device/index/through/body/path，body 是已持久批次 JSON 字符串；先存后发，失败可重用。[A pending](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L130)；[准备批次](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L245-L253) | 保存 meta 的原序列化来源、pending presence、body 解码后的字符串及其 UTF-8 bytes、路径和所有边界。body 内 events 与 outbox.event 各自定位，不把它们合为一个字节载体。 |
| actor/seq/clock/vector | actor 区分大小写；seq 是事件序号，clock 是逻辑钟，vector 是因果事件序号映射；local/remote 各有更新路径。[A 因果字段](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L122-L126)；[远端合并](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/replica.mjs#L126-L135) | 字段原值和缺失状态不损，使用已支持协议值域。不能互填计数、变 actor、刷新历史 clock 或把 vector 当 batch cursor。 |
| queue/revision/dataRevision | queue 分配队列号，revision 是本地事务比较；业务修订有独立含义。[A 元数据](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L122-L125) | 原值按各用途保留。候选 schema/migration 版本不覆盖它们；不按最大 outbox ID 反推丢失的 queue 或 revision。 |
| scope/epoch/cursors | scope/epoch 定位复制域/代次，cursor 是已接收 batch index；原绑定变化可重建队列并清进度。[A 元数据](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L127-L130) | 同一账本复制域恢复时按基线比较，禁止回退现有位置。scope/epoch 变更走独立授权，不能以恢复名义触发当前换绑或重整路径。 |
| manifest/head/snapshot | heads 为 batch 高水位；snapshot cursor 不超对应 head，分片校验后才推进 cursor。部分分片行可能先落盘。[A wire](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L140-L142)；[分片与 cursor](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L217-L239) | 记录远端证据来源、ETag、epoch、descriptor、parts 原字节/hash 和游标，保留部分失败。未完成全片校验不推进完成标志，不能凭新投影假装快照完整。 |
| cachedManifest/lease/legacyMigration | 持久缓存、会话租约及特定旧导入回执有不同生命周期。[A 元数据](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/node-web-storage-inventory.md#L132-L134) | 原样归档并区分存在性；旧缓存不代表远端当前事实，旧 lease 不授予执行权限，legacyMigration 不代替数据契约版本或全量历史。 |

## 原件不变与 pending/outbox 对应

**PROPOSAL S01。** 同一冻结读取边界保存主账本原件、meta、entities/record/conflicts/墓碑、全部可得 outbox 与 pending；每种载体有独立 source locator、字节长度/hash、SQL/JSON 类型和 presence。合成投影及审计不能重写原件，未知字段、冲突候选、显式空值和原始事件顺序完整保留。[字段兼容](field-compatibility-matrix.md)；[备份恢复](backup-restore-contract.md)。

**PROPOSAL S02。** 明确三层：① meta.value 中原序列化 JSON（含 body 的 JSON 字符串转义）② pending.body 解码字符串对应的批次 UTF-8 bytes ③ 各 outbox.event 的原 TEXT bytes。每层分别保全。原始外层转义、body 空格/键顺序与 event TEXT 表达可以不同；解析成功不是字节相同，重新 stringify 不能证明原 body 未改。

**FACT。** 准备批次先把读取到的队列对象放进 events，再 JSON.stringify 整个 batch；因此原 event TEXT 与 body 内事件子串不是承诺相同的字节表达。[batch 构造](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L247-L253)。

**PROPOSAL S03。** 对合成来源逐项核对 pending：device 等于 meta.actor，index 与路径对应，body 的 format/epoch/device/index 对应，events 为非空且不超现行 500 个事件；through 是已选择队列前缀的最大 ID。按原 outbox ID 升序，将 `id<=through` 的可得选中前缀逐行对应 body.events；事件 key/actor/seq/clock/context/values、位置和数目一致。比较解析后结构时保留确切 JSON 类型，不用规范化业务对象替代。两个原始字节域仍独立核 hash。

**PROPOSAL S04。** 队列 ID 不必等于事件 seq，已 ACK 的旧行可造成起点不同；不要求凭空填补历史 ID。pending 后新增的 `id>through` 行必须原样保留，模型中的一次 ACK 不得删它们。队列/事件同身份异内容、pending 缺选中行、through 与内容数目/顺序不符、body/path/epoch 不一致均保留原件并 BLOCKER，不通过重生成 pending 或默认清队列来“修好”。

**FACT。** 生产 pending 校验会检查 body、路径、Actor、epoch 与事件格式；同名批次发布先核对不可变内容，再根据 head/CAS 成功清 pending 并 ACK through。这不等于本候选已证明历史 pending 与当前 outbox 每项均一致。[pending 校验](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L44-L52)；[发布与 ACK](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L257-L272)。

**PROPOSAL S05。** 合成 ACK 模型只能在已证明的目标/epoch/batch 身份、原 body 字节、发布确认和队列前缀之内模拟现行清理。拒绝时 pending、outbox、cursor、原 bytes 和 counters 全部不变。一次模型确认不生成真实回执、不授予网络发送权限、不等于真实 WebDAV 验收。未知旧 ACK、已物理删除 outbox 或被覆盖事件不能根据现存 token/数量还原。

## 防止旧备份倒退与身份双活

**PROPOSAL S06。** 恢复比较的至少三个对象分别留证：封存备份 B、当前本地 L、当前远端 R。候选模型用虚构 L/R，但实际生产当前值为 UNVERIFIED。必须先证明 ledger、scope、epoch、Actor 归属及读取完整性，才有同一 lineage 的比较意义。不同身份、代次或缺远端证据保持隔离，不按名称拼成同一来源。

**PROPOSAL S07 / BLOCKER。** 在同 lineage 内，旧 B 不能覆盖较新的 L 的 seq/clock/queue/revision/dataRevision/vector/cursors、未发事件、pending、record 或墓碑；不能向远端提交较旧 manifest/head/snapshot 取代 R。任何本地/远端已知进度较新、已提交事实无法在候选中证明保有、或 event 同身份异内容，均停止自动激活并输出差异清单。不能简单取数字 max 后声称历史已追回，因为较新数字并不提供相应事件/记录/字节。

**PROPOSAL S08。** 备份比当前远端落后是受控对账需求，不是永久丢弃备份。后续获批程序应先保留 B/L/R，取得缺失可验证事件、快照及发布事实，在隔离候选内完成对账；证据无法取得时继续只读。该程序与真实对账不在本批实现。显式批准的换 scope/epoch、退役 Actor 或新设备加入是独立路径，不能用它规避同 lineage 防倒退。

**PROPOSAL S09 / BLOCKER。** 原 Actor 续用需要证明旧 writer 不再可写、无克隆双活、当前本地与远端序列/批次可接续、pending 原件与队列对应、旧会话不能落盘。清 lease、改 until、分配新 token 或持有旧备份文件不构成该证明。证据不足保持离线候选；不得把旧 Actor 改成新 Actor 后继续发送原 pending，或以新 seq 重包装历史事件。

**FACT。** 现行 JS 持久 lease 使用 token/until，request 与 commit 包装有 token 校验；这只能说明已有静态路径，不能覆盖所有平台的迟到响应和落盘交错资格。[JS lease](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/delta-sync.mjs#L309-L320)；[A Windows 风险](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/windows-storage-inventory.md#L133-L149)。

**PROPOSAL S10。** 候选切换的作业 ID/恢复代次与原 lease、epoch 和业务版本分别登记。合成故障注入应检查切换前后来源可回读、拒绝路径不损 L/B、旧作业或旧会话结果不能清 pending/ACK/推进 cursor。真实平台必须再验证所有 writer 的停止、过期请求、原库同库恢复与失败回滚，合成模型不提供这一执行门。

## 墓碑、冲突与快照保护

**PROPOSAL S11。** 墓碑原 key、删除事件值、因果 context、来源/冲突和实体 deleted 投影保留。活跃导出中没出现某项不构成删除证明；旧备份中出现曾删除任务也不授权复活。关系映射不得把墓碑清除为 orphan cleanup，不用 active-only FK 清原字段。[关系保护](relationship-migration-strategy.md)。

**PROPOSAL S12。** 合成快照可以逐片验 bytes/hash/身份并证明“所有所需片完成后才推进完成 cursor”；失败模型须记录已成功片和失败片，不把部分行当完整恢复。只有 descriptor、hash 或 cursor 不能重建丢失 part bytes；只有聚合 count 不能证明 record、conflict 与 tombstone 保真。真实源若已出现部分应用状态则原样封存，不自行回退真实库。

**PROPOSAL S13。** 全域审计可额外检测同一 Actor/seq 出现于不同 key 或异内容，以隔离异常来源；报告这是候选证据检查。现有 applyEvent 的重复处理在同 record 内，不能宣称生产已具备完全相同的全域索引检查。模型重复提交只有按已定义输入单元和身份内容一致时才可认定幂等；幂等不表示可以略过未验证输入或未知 kind。

## 收口资格、未验证和阻断

**OWNER DECISION。** 审核 S01–S13 的候选保存/对账/隔离规则；确定原 Actor 续用证据、支持版本与客户端、真实恢复与生产放行的负责人。候选编号或 CI 通过不授予生产 schema、迁移入口、数据重写、真实服务和新同步通道的权限。

**UNVERIFIED。** 当前真实 B/L/R、历史原字节完备度、实际文件/WAL 耐久性、Windows 迟到会话、真机所有 writer 停写、原数据库恢复、Android 首崩、真实 WebDAV 和 LAN 均保留开放状态。A 的 UNKNOWN/NEEDS INVESTIGATION 不因模型 pass 升级。[A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L21)。

**BLOCKER。** 不完整来源、identity/epoch 冲突、pending/outbox 对不上、原字节被重写、旧备份倒退较新事实、未保留墓碑、无原 Actor 排他证明、恢复失败损坏原件、旧 writer 未隔离或缺真实门禁，均禁止生产自动激活。合成验证只能把上述条件演示为模型拒绝并验证模型原件不变；Android issue #1 保持 Open。[issue #1](https://github.com/johny751/MyTodo/issues/1)；[版本与迁移](migration-versioning-contract.md)；[归属及组件](data-ownership-and-sync-boundaries.md)。
