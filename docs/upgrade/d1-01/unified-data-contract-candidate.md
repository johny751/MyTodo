# 统一数据契约候选 d1-01-candidate.1

2026-11-24（Asia/Shanghai）。本页在 D1-01-A 固定盘点及 D1-01-B 草案之上定义可由独立合成工具验证的逻辑候选。`d1-01-candidate.1` 是候选身份，不是现有业务 JSON version、生产 schemaVersion、sync protocol 或迁移登记。独立工具运行记录与生产/实际设备证据分别报告。

## 身份、层次与证据状态

**FACT。** 现有共享 wire kinds 为 tasks、notes、projects、tags、places；子任务是 tasks 行，UI 才嵌套。entities.record 保存仍存留的事件，data/conflicts 是复制合并输出，SQL 查询列和业务导出各自可能有损。项目目前按名称关联，tags/places 常以名称作 ID。见 [固定 D1A 总览](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/current-data-model-inventory.md) · [字段与复制记录](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L93-L111) · [旧白名单](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L46)。

**PROPOSAL。** 逻辑实体 key 是 `(ledgerId,kind,id)`。ledgerId 表示可识别的同一业务账本，不能根据账号显示名、设备、目录或 actor 猜测。原 scope/epoch/actor/key/data.id、源路径、源版本和快照信息分开保留；ledgerId 无出处则保持 unknown，禁止自动跨账本关联。kind/id 身份与原复制事件相连，原 key/data.id 不一致不自动改键。

| PROPOSAL 层 | 保留或计算内容 | 边界 |
| --- | --- | --- |
| raw/source | 可取得的原字节、JSON 值/presence、SQL 类别与列值、来源边界、原 kind/id、record/events、墓碑、冲突和校验 | 原文有重复键、大数字或非法编码时先封存，不通过一次解析后重序列化宣称字节保真。已丢历史保持 UNKNOWN。 |
| business projection | 可解释字段、未解析字段、关系状态、来源及候选规则身份 | 与 raw data 分离；UI 默认值或升根不回写原值。候选不规定现行 wire。 |
| derived | ISO 星期集合、计划计算、搜索/统计、树形布局等 | 必须有输入及算法身份；可丢弃重建，不能充当原始账本或送达证明。 |
| tombstone | 原 key 和删除来源、存留的因果信息 | 归档与删除分开；活体导出缺行不等于从未存在或已经 ACK。 |
| infrastructure/local | 原 meta/outbox/pending/head/cursor、设备计时/提醒回执/反馈/资产 | 不提升为新业务实体或借现有同步白名单传送，归属和备份契约独立。 |

**PROPOSAL。** 文档与报告使用 FACT（固定源码事实）、PROPOSAL（候选规范）、UNVERIFIED（证据尚缺）、OWNER DECISION（负责人选择）、BLOCKER（受影响操作不可执行）。原 D1A 的 UNKNOWN/NEEDS INVESTIGATION 不被候选通过改成事实；合成样本仅说明该固定工具对其输入成立。

## 现有实体的候选字段

各行均为 **PROPOSAL**，依据 [固定 D1A 字段盘点](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-field-mapping.md#L17-L91)。完整异常、旧读端和不可逆条件见 [字段兼容矩阵](field-compatibility-matrix.md)。下述标准字段只存在于逻辑 projection，不覆盖 raw。

| kind | 候选投影字段与类型 | 特别保真与边界 |
| --- | --- | --- |
| tasks（含子任务） | id；title/notes/review 文本；quadrant 整数0–3；order 有限数；done/allDay 布尔；weight 有限0–100数；start/end 民用分钟或明确无日程；createdAt/completedAt 原时间及可解释时刻；parent 关系；project/place/tags 原名称与独立关系；repeat/reminder 规则；reminderAt 原值与独立派生；seriesId/generatedFrom 原来源关系 | 任务备注与 notes kind 不合并；空/缺失/null 分开，bool 不取 truthiness，数字不接受字符串；排序数不冒充日期；异常父边不写 null；完整原规则和实例保留。 |
| notes（独立便签） | id、body 文本、createdAt 原时间及可解释投影 | 不并入 tasks.notes；无偏移且来源未证实不生成绝对时刻。 |
| projects | id、name/description 文本、archived 布尔；墓碑独立 | 任务原 project 名称保留；只有同账本同快照精确名称唯一匹配才能 resolved，重名 ambiguous，无匹配 missing，不猜 ID。 |
| tags | 原 id/name，任务原 tags 数组与逐位置解析 | 原目录行 identity 不能由被规范化字符串列表重新生成；重复、顺序及非法元素保留，派生集合另去重。 |
| places | 原 id/name，任务原 place 值与解析 | 同 tags 目录身份边界；空串/null/缺席不同，不构造目录不存在的目标。 |

**PROPOSAL / BLOCKER。** 合法 ID 为非空字符串、无 NUL/孤立代理项且遵守已识别协议长度边界；候选以 UTF-8 字节长度核对，不能按展示切片改 ID。候选 field-type 不合规时保留原值，不把旧规范化输出当作标准值的无损来源。关系必须同 ledgerId、同一致快照；缺身份、不完整来源、冲突或无法唯一解析时投影明确 unresolved。候选不在生产原库引入物理 FK 或级联修复；独立合成投影可验证建议的复合 FK，raw 中悬空值、墓碑和未解析关系仍完整保留。来源见 [JS isEntityId](https://github.com/johny751/MyTodo/blob/bc3f44d1e76a988dbe269edcf1c606eebec37293/src/model.mjs#L3-L4) 和 [关系策略](relationship-migration-strategy.md)。

## 字段存在性与兼容结果

**PROPOSAL。** 每个字段有独立 raw presence：missing、json-null、sql-null、value。空字符串/空数组/空对象/0/false 都是各自类型的 value。invalid-type、invalid-format、out-of-range、unknown-source、mismatch 等是诊断，不能改变原 presence。可解释标准值与诊断可并存，例如合法已有 reminderAt 与重新计算不同；该差异不能自动修正。

**PROPOSAL。** 两个能力轴分别记录 `interpretable` 与 `canSchedule`（仅用于需要计划的字段/规则）。来源明确的负 epoch 可解释，仍不在原共同可调度域；日历合法的 9999 年不证明旧端能执行。非时间关系也有 resolved/ambiguous/missing/unset/invalid/conflict/unknown 状态，只有 resolved 才存在正式逻辑目标；状态不注入原事件。

**PROPOSAL。** legacy weekdays=0Sunday 保留；候选 isoWeekdays=1Monday…7Sunday 使用显式可逆变换与来源身份。旧 shared JS/C 周范围 Monday 起是 FACT；候选也采用 Monday，但不是把 legacy 数组重编码后写回旧字段。时间必须标 type/sourceSemantics，民用分钟按固定 +08 来源解释，epoch 明确毫秒，带偏移时刻保留偏移/精度，单调计数不跨 boot。完整规则和断言见 [时间与循环契约](time-and-recurrence-contract.md)。

## 写入、版本与完整恢复门槛

**FACT。** C/Node 仍有位置型 SQL 写入，旧业务投影限制字段；unknown kind 不能安全借旧 wire 转发；ACK 可物理删除 outbox，业务 JSON 导出缺复制记录、pending、墓碑和 Android 本地数据。见 [固定差异](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/cross-platform-differences.md#L31-L60)。

**PROPOSAL / BLOCKER。** 候选与生产 schema/protocol/contract 版本独立。只有原始来源可验证、候选规则身份固定、转换保留原值、旧写端能力及隔离明确、完整一致备份与恢复门槛通过，才可另行讨论生产接入。合成 migration/restore 工具是隔离样本工具，不是三端生产 migration wrapper；工具事务、回滚或 SQLite 成功不证明生产停写、WAL、跨文件切换、凭据、alarm 或真实服务安全。禁止将本批候选加载到生产程序。

**UNVERIFIED。** 历史旧样本分布、真实设备 schema、全部旧读写往返、未知字段保真、实际同库恢复、T15/T16 生产门禁、Android issue #1、Windows C WebDAV v1 非空导入及真实 LAN/WebDAV 环境尚有独立缺口。候选工具通过不解除这些条件。

**OWNER DECISION。** 负责人选择最终 contract 编号、时间域/精度、规则缺省与 unresolved 展示、每种旧端最低读写能力、原始证据保留期及生产迁移窗口。后续 D1-02 的新业务模块可引用本候选的 ledger/key/raw/projection/time 原则，其新 kind/字段仍是设计建议，不能自动成为旧协议白名单。数据归属、版本和恢复详见 [归属边界](data-ownership-and-sync-boundaries.md)、[版本契约](migration-versioning-contract.md) 与 [备份恢复](backup-restore-contract.md)。

**PROPOSAL。** 这里的 JSON 整数指 JSON number 的数学整数值；1、1.0、1e0 可以按同一整数值检查候选范围，原字面量仍保存在 raw，不能以投影整数覆盖原值。1.5、布尔和数值字符串不能据此通过整数检查。
