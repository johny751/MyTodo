# D1-01 集中未决问题与 BLOCKER

2026-11-24（Asia/Shanghai）。唯一候选为 d1-01-candidate.1。本表合并原 B 决策并区分设计选择、隔离证据和生产阻断；不要求负责人逐项批准后才完成其他获授权任务。

| ID / 状态 | 问题与证据 | 当前候选处理及所阻断操作 |
| --- | --- | --- |
| D1B-01 OWNER DECISION | 原始来源和投影保管范围、访问权限、期限；FACT：原SQL/导出证据能力不同 | 原件/标准投影并存；原件缺失不伪造。负责人统一决定保管与只读政策 |
| D1B-02 OWNER DECISION | 时间 type、fixed +08 / IANA、毫秒精度、共同可调度域、历史过期提醒 | 采用严格值域与两轴，保留原格式；负epoch/未知done不能授权提醒，epoch0调度政策待决定 |
| D1B-03 OWNER DECISION | 空 weekly weekdays、非1 weekdays、名称关联人工修复权限和审计 | 原始数组/间隔保留、显式ISO转换；歧义不能猜；候选不得自动重写旧字段 |
| D1B-04 OWNER DECISION | 设备计时、反馈草稿/软删/图片、恢复代次可选范围和隐私 | Android反馈独立域，应用级账户路由不并入单账号；本地组件独立备份选择 |
| D1B-05 OWNER DECISION | 备份组件、可信清单、失败切换和恢复上线门槛 | 完整包含DB与附件原字节，独立哈希/身份；旧备份新进展必须前向对账 |
| D1B-06 OWNER DECISION | 支持客户端/版本矩阵、迁移登记粒度、诊断和审计策略 | checksum覆盖实现依赖，源/目标指纹和user_version与成功登记同事务；不兼容方向只读/隔离 |
| D1B-07 OWNER DECISION | Actor续用排他证明、克隆退役、旧备份/丢失设备重新加入 | Actor/seq/clock/cursor保管不等于续传授权；原身份接续必须证明安全 |
| BL-01 UNVERIFIED / BLOCKER | 用户旧库schema/样本与历史发布行为仍UNKNOWN；实际写回/查询计划未采集 | 不允许根据新库DDL或合成样本替换用户库、宣称全部旧数据可迁移 |
| BL-02 UNVERIFIED / BLOCKER | 生产三端writer屏障、完整备份一致点、T15/T16、掉电、原库切换和同库恢复资格 | 独立工具的事务/进程退出只证明本工具；不批准生产迁移入口 |
| BL-03 UNVERIFIED / BLOCKER | Windows迟到会话/在途远端副作用、ACK及各目标连续性仍有开放边界 | 不改生产协议，禁止启用双通道；本地fence与数字max不足以证明远端安全 |
| BL-04 FACT / BLOCKER | Android issue #1 在本批GitHub复核为Open；原始首崩/同库/换库/采集资格保留 | 独立Instrumentation通过也不能关闭或绕过生产稳定性问题 |
| BL-05 UNVERIFIED / BLOCKER | 当前反馈AAR/历史包、真机URI/权限/厂商目录/boot计时行为 | 本工具测试独立合成反馈schema与原图保管，不宣称调用生产AAR恢复通过 |
| BL-06 UNVERIFIED / BLOCKER | Windows C原WebDAV v1导入限制、真实LAN/WebDAV环境未新增验证 | 继续安全拒绝不支持的旧数据或非空旧备份；不能从合成协议/SQLite推断真实服务通过 |
| BL-07 UNVERIFIED | 完整tag逐位置ID图、generatedFrom历史环/并发/缺损、实际跨ledger身份发现不由固定单账本夹具全面覆盖 | 候选策略保持，不以局部R用例宣称全图已验证；生产实现前另做对应隔离/设备验证 |
| BL-08 UNVERIFIED / BLOCKER | 旧备份落后本地outbox/pending/已ACK或远端head，或无法取得可信当前证据 | restore工具明确拒绝替换；禁止回退文件丢弃较新数据、进度或未确认事件 |

**FACT（源码）。** 原开放记录见 [A 未确认清单](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md)。UNKNOWN与NEEDS INVESTIGATION原含义保留。源码与隔离测试FACT必须在最终报告各列说明输入、源SHA、run/attempt及适用范围。

**PROPOSAL。** 某个生产BLOCKER不妨碍本批文档、独立测试工具和其他合成用例完成。最终统一候选及报告提交后停止，等待负责人集中审核；没有自动批准D1-02生产实施或真实数据操作。
