# D1-01-B 修订总稿与候选入口

2026-11-24（Asia/Shanghai）。本版集中修订此前七份草案，统一候选身份为 **d1-01-candidate.1**。候选全文：[统一数据契约候选](unified-data-contract-candidate.md)。本批允许文档、静态审查、独立工具和 GitHub Actions 隔离合成验证；禁止生产数据库/源码/同步修改、真实数据、真实 LAN/WebDAV 或双通道启用。最终隔离运行结果与源码事实在独立报告中区分，不将设计写成现有生产能力。

**FACT。** D1-01-A 发布于 `6a4b179f361602f47429bc9aa88e51c0b61395e3`，B 首稿发布于 `1a55ea6da9f2012d7ba82d5756ae8f61d87bae47`。生产源码证据固定在 `bc3f44d1e76a988dbe269edcf1c606eebec37293`；本批起点须见基线回执。原盘点的 UNKNOWN/NEEDS INVESTIGATION 及 Android issue #1 Open 保留。[A 总览](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md)

| 本轮审核意见 | 统一候选处理（PROPOSAL） | 依据或配套契约 |
| --- | --- | --- |
| 时间字段格式、时区与语义 | 区分 civil-minute、epoch-millis 和 offset-instant-text；来源固定 +08 与未来 IANA 策略分开；可解释与可调度两轴；原字面量/负 epoch/无法识别来源不丢弃 | [时间与循环](time-and-recurrence-contract.md) |
| 星期与循环 | 历史 0=Sunday 原样保存，候选 ISO 1=Monday…7=Sunday 显式转换；Monday 周基准；anchor/月末/闰年/until 包含边界；非1 weekdays 不猜新语义 | [时间与循环](time-and-recurrence-contract.md) |
| 标准值域与历史兼容 | 类型与范围严格接纳，不合规保留 raw+诊断；missing/null/空串/SQL NULL/0/false 分开；数学整数1.0可解释但不改原数字字面量 | [最终字段矩阵](field-compatibility-matrix.md) |
| 原始/业务/派生 | 原 record/data/conflicts/SQL 类型与字节保留；标准投影与 UI 回退不覆盖 raw；派生搜索/统计不能恢复丢失原历史 | [候选全文](unified-data-contract-candidate.md) |
| 名称到 ID | 同 ledger/kind、一致快照、精确唯一匹配；保留原名、候选和 presence；ambiguous/missing/conflict/unknown 不猜目标 | [关系策略](relationship-migration-strategy.md) |
| Android 独立反馈与图片 | feedback records/assets/links/settings 为独立域，notes/drafts/meta 是 bucket；archive_entries 只属恢复临时；原图字节与引用/哈希均保管，不能由标题/URI重建 | [数据归属](data-ownership-and-sync-boundaries.md)、[备份恢复](backup-restore-contract.md) |
| 墓碑与待发送/同步进度 | record 内存留 events、pending.body 与 outbox.event 独立原字节；解析后事件对应，不将 through 队列号当 seq；Actor/clock/cursor/epoch 不重造 | [同步状态迁移保护](sync-state-migration-protection.md) |
| 迁移/中断/回滚 | 实现依赖 checksum、源和目标指纹及登记与版本同事务；激活前保持原库；旧备份有较新本地/远端进展即阻断，激活后新副作用必须前向对账 | [版本迁移](migration-versioning-contract.md)、[工具准备](d1-01-02-tool-preparation-design.md) |

**PROPOSAL。** 独立工具只在带本 run 标记、真实路径和 synthetic DB guard 的 GitHub runner 临时根工作。C、Node、Android 用各自真实 SQLite API 生成源库；候选迁移/备份/故障工具采用独立 Python SQLite 参考实现。该组合验证格式保全、SQLite 候选和固定样本比较，不能证明生产三端存储封装已实现候选、旧客户端写回安全或生产恢复门禁。

**UNVERIFIED / BLOCKER。** 生产 writer 停写/切换、真实掉电耐久、旧版本全集、未知字段写回、用户历史数据、Windows 迟到响应栅栏、真实服务、Android 稳定性及生产 AAR 恢复均须另外证明。参考工具未覆盖的完整标签关系/历史生成图/跨账本身份发现按未验证登记；不能以测试计数替代这些证据。

**OWNER DECISION。** 所有设计选择和上线门槛在 [未决问题与 BLOCKER](d1-01-b-open-questions.md) 集中评审。完成本工作包后停止；D1-02 仅有设计和隔离工具准备，生产实施和真实迁移未获授权。
