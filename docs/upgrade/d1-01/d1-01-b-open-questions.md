# D1-01-B 审核决策与未决问题

2026-11-24（Asia/Shanghai）。远端审查起点 `6a4b179f361602f47429bc9aa88e51c0b61395e3`。下表均等待负责人审核，设备验证状态 `NOT TESTED`。本批讨论限定于文档设计。[D1-01-A 提交](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3) · [统一契约草案](unified-data-contract-draft.md)

## 设计决策

| 决策 | 源码证据 | 设计建议 | 尚待设备验证 | 负责人决策 |
| --- | --- | --- | --- | --- |
| D1B-01 原始来源与标准投影 | SQL `record/data/conflicts`、活跃业务导出和 SQL 投影有不同证据能力 | 保存原始来源和读边界，分离业务投影、墓碑、Ui 回退及不可解析记录 | 三端读取原始字节、SQLite 类型、反序列化和应用生命周期的保真度 | 批准保存范围、访问权限、保留期限以及原件缺失时的只读/隔离策略。见 [总稿](unified-data-contract-draft.md#逻辑层与来源证据) |
| D1B-02 标准接纳与旧端显示 | `parent_id/quadrant/reminder_at` 三端绑定有差异；时间、null、缺省及空串会折叠 | 按明确类型和值域接受，保留 presence、旧行为和诊断，未知历史不回填。已存提醒时间与可重算值分别保留 | 历史值分布和 Android `optXxx` 边界、读取与回写；按各支持版本做隔离样本 | 确认各类型规则、诊断呈现、legacy 时间可证来源及有效 `0` 的调度策略。见 [字段矩阵](field-compatibility-matrix.md) |
| D1B-03 保守关联 | `task.project` 为名称，JS/C/Java 读端对失配父关系可能升根 | 同一账本一致快照只自动解析唯一匹配，保留原名。`missing/ambiguous`、异常父和循环来源不上写 | 历史重名、改名、归档、墓碑、循环和超长引用；关联重算的确定性 | 批准精确匹配口径、候选资格及人工修复权限、审计留存。见 [关系策略](relationship-migration-strategy.md) |
| D1B-04 设备数据范围 | Android 番茄钟落本地偏好，反馈独立存记录/图片/草稿/恢复代次。三个平台的提醒与反馈不同 | 本地组件的同机恢复与可携带导出分开。应用编辑草稿/运行锚点与已落盘反馈草稿分别处理 | Android API、boot 时间、通知及系统文件生命周期，反馈 AAR 旧版本和真实目录 | 确认可选本地数据组件、授权和隐私限制。见 [数据归属](data-ownership-and-sync-boundaries.md) |
| D1B-05 一致备份与资产 | 三端账本声明 WAL。业务导出不含完整 SQLite/复制历史和各本地资产，反馈恢复使用临时库 | 同一冻结点保存主账本、复制证据、明确选择的本地组件及二进制资产，逐文件长度与哈希校验，恢复先暂存再切换 | WAL/文件一致性、真实耐久性、资产链接和故障后保留原件，T15/T16 | 批准恢复包类型、组件边界、完整性与验证门。见 [备份恢复](backup-restore-contract.md) |
| D1B-06 版本、迁移和旧端兼容 | `meta.version`、业务 JSON `version`、线上协议和反馈库版本各有含义，C/Node 有位置型 INSERT | 独立版本轴、能力声明、编号计划和指纹。双向兼容必须证明，未知实体与不兼容方向停在边界 | 旧端是否成功识别隔离、已有及历史 schema 实态、同库恢复、C/Node/Android 写回保真 | 批准支持版本/客户端矩阵、迁移登记粒度、兼容门禁和审计策略。见 [版本与迁移](migration-versioning-contract.md) |
| D1B-07 恢复上线和 Actor | `actor/scope/epoch/vector/cursors/pending` 有独立含义，Windows 迟到会话隔离及旧 Actor 状态未验证 | 生产恢复后先离线验证，按同一库恢复、已回滚的旧备份或重新加入区分。原身份使用需证明排他与进度可接续 | 同一数据库、旧库/新 Actor 情形、迟到请求、服务器不可达及恢复失败不损原库 | 批准恢复上线流程、恢复身份和会话隔离的证明条件。见 [备份恢复](backup-restore-contract.md) |

源码依据见 D1-01-A 固定的 [字段和复制层](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L17-L111) · [三端比较](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L5-L61) · [Android 本地存储](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/android-storage-inventory.md#L104-L158)。

## 原盘点的开放记录

- **UNKNOWN**。用户实际 SQLite 对象与运行索引计划；历史发布物的 schema 和现存旧业务样本；同名分类及悬空引用的真实分布；旧回执来源与仅剩规范化数据时缺失的历史。保留观察来源、未知标记和可用证据。[A 盘点登记](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L14)
- **NEEDS INVESTIGATION**。异常 JSON 的 SQL 转换；父关系与旧搜索索引、跨端循环边界；WAL、跨文件及同库恢复；反馈组件历史或厂商状态、Android 原生计时/通知和反馈瞬态；业务附件、双目标 ACK、Windows 迟到响应和真实服务。计划验证须经后续阶段审批。[A 盘点登记](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L19)
- **OPEN RISK**。Android issue #1 在本阶段 GitHub 复核为 Open。首崩、同原库重开、换库重试和采集状态仍按阶段 0 的原证据解释。Windows C 原生 WebDAV v1 导入限制与真实环境验证资格仍依阶段 0。[issue #1](https://github.com/johny751/MyTodo/issues/1) · [Android 风险审查](../phase0-final-review/android-stability-risk.md) · [同步安全审查](../phase0-final-review/sync-safety-review.md)

本批提交后由负责人审阅七份草案。D1-01-C 须等负责人明确批准。运行验证仍为 `NOT TESTED`。
