# C006 兼容边界

2026-11-23（Asia/Shanghai）；最终生产源 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`。C006 已由主控完成限定验收并关闭：`accepted=true`、`status=accepted-with-documented-evidence-qualifications`、`pending=[]`。本文说明已实现和验证的范围，不扩写为所有客户端版本的互操作保证；Android 稳定性问题仍 open，C007 独立验收。

| 场景/结构 | 最终行为 | 限制 |
| --- | --- | --- |
| 无 manifest、真实旧 v1 或合法非空 backup guard | JS/Android 通过现有 merge/editReplica 导入；marker 与 rows/outbox 同事务；真实 snapshot 先于 manifest | C 原生安全拒绝未完成迁移；没有 native v1 importer |
| 明确合法 `backup:null` guard | 可空初始化；C 条件冲突重读，最多八次 | 缺字段、空字符串、错误类型/路径不等于 null |
| 初始 retained-record snapshot | 沿用 wire schema，heads={}、cursors={}；actor/seq/clock/context/value/墓碑保留 | outbox 后续仍须正常发布与 ACK；不等于全部老客户端已实测 |
| 首次 snapshot 后有正进度 | 全零初始游标可生成首个完整 checkpoint；零进度仍节流，已有正游标保留 64 节流 | 最终原 JS 121 项通过；不靠放宽快照跳过旧日志的断言 |
| migration marker | metadata JSON `legacyMigration={scope,backup,sha256}`；没有新增 SQL 表列或 wire 字段 | 仅最近一次 marker；scope/path 变化可另导入，同路径字节变化失败；不泛化保证旧客户端不删未知字段 |
| 已有 durable tombstone | 完整 retained records 中的删除不被历史 backup 复活 | 其余合并维持现有规则，不另造删除协议 |
| 真实并发编辑 | stale revision/CAS 失败后重读、重算；marker 不能独立落库 | B45 使用真实第二进程编辑与原事务结果；非伪造返回 |
| manifest 竞争失败 | 接受经过验证的赢家 epoch/snapshot；孤立不可变文件可保留 | 旧客户端若发布残缺 manifest，新版本不自动补写自身假设 |
| 已存在 snapshot=null、heads={} 的历史 manifest | 沿用既有同步路径 | 无法安全区分合法删除与旧迁移残缺，不盲目重放 backup |
| C005 凭据保护 | 22/22 on 32e；三份相关生产文件至 1b9 云端证明字节相同 | 不是 1b9 上新跑的 DPAPI suite；不读取真实凭据 |
| C004 协议约束 | 最终源 936 唯一执行、936 唯一比较及 702 lineage 独立核对通过 | 三次 Android 首崩、两次替换库重试保留；比较不涵盖 revision/dataRevision/settings/lease/cachedManifest，actualPublishAckFault 留 C007 |
| 中断与恢复 | Node 指定边界 SIGKILL；Android A26/A30 专用控制器验证 | 普通操作间 force-stop 不等于内部强杀；native 自身强杀未覆盖 |
| 采集副本 | 新 helper 校验远端前/传输/远端后长度哈希及 SQLite 头 | 诊断 force-stop 后逐文件拷贝非 crash-time 事务态，也非跨文件原子快照 |
| 云端持久性 | 合成磁盘 WebDAV、真实 gzip/rename/ETag/条件请求/断连 | 无真实坚果云、私有账户、断电/fsync 耐久性结论 |

实际主矩阵为 JS 59、native 18、Android 6；Android 强杀另 2，Node bootstrap 另 4。它们不代表所有平台运行所有场景。完整 visible state、原 retained events、outbox/pending、原路径重开、cloud heads/batches 与独立观察者各自的比较范围保持独立。另库重试只能证明该次重试断言，不消除原场景失败。

SQL schema 与线上 wire schema 均保持原有格式。C007 SQL 错误传播独立验收；D1 未批准。基线 unsigned APK 和测试 harness APK 不构成面向用户的签名升级发布。
