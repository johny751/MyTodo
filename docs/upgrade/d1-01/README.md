# MyTodo D1-01 集中交付索引

2026-11-24（Asia/Shanghai）。候选 `d1-01-candidate.1`；**文档与限定合成验证已收口，等待负责人统一审核**。

**FACT（CI5）。** 验证源码 [8239d39220d940bf9c047a1dcaffd2a831cca2fc](https://github.com/johny751/MyTodo/commit/8239d39220d940bf9c047a1dcaffd2a831cca2fc)，[Actions 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986)，attempt 1：三端参考套件各97/97、16/16采集单元用例、14/14比较通过。14项包括3个来源资格检查、6个跨端有向比较、3个同端自比及2个反馈域/原图用例。三端生成器实际使用 C SQLite、node:sqlite 和独立 Android Framework API；迁移/恢复使用独立 Python SQLite reference，生产存储封装未加载。

| 交付要求 | 文件/证据 |
| --- | --- |
| 七份 B 修订 | [契约草案](unified-data-contract-draft.md)、[字段矩阵](field-compatibility-matrix.md)、[归属与同步边界](data-ownership-and-sync-boundaries.md)、[关系迁移](relationship-migration-strategy.md)、[备份恢复](backup-restore-contract.md)、[版本迁移](migration-versioning-contract.md)、[原未决问题](d1-01-b-open-questions.md) |
| 唯一统一候选 | [统一数据契约候选](unified-data-contract-candidate.md)；候选身份不等于生产 schema、JSON 或同步协议版本 |
| 时间/循环与同步保护 | [时间及星期规则](time-and-recurrence-contract.md)、[同步状态保护](sync-state-migration-protection.md) |
| D1-02 设计/独立工具准备 | [工具准备设计](d1-01-02-tool-preparation-design.md)；源码位于 tests/d1-01/ 与专用 workflow |
| 最终审核与未覆盖范围 | [最终报告](final-review.md)、[覆盖审查](coverage-review.md)、[未决与 BLOCKER](unresolved-and-blockers.md)、[静态交叉审核](consolidated-static-review.md)、[执行边界](source-and-validation-scope.md) |
| 合成数据与全部原失败 | evidence/run-45348588067/、run-45353907376/、run-45359601767/、run-45362018398/、run-45367557986/；每轮4个官方原ZIP及原JSON，失败未追改 |
| 独立文件审计 | cloud-evidence-audit.json：只核ZIP/JSON/原文件摘要，不执行SQLite；嵌套S51假回执是负例输入，生产者只取确切主路径 |
| SHA-256 | source-sha256.json、SOURCE-SHA256SUMS.txt；全部发布路径/原证据的摘要另在 publication receipt |
| GitHub提交及Compare | 随本次交付产生的 publication receipt 含验证source、发布parent/tree/SHA、远端master、GitHub Compare结果、逐文件字节与摘要；发布工具与CI5源码差异必须为零 |

**PROPOSAL。** 原值、业务投影、派生物、墓碑、设备本地与复制基础设施分层。星期0Sunday历史编码保留，候选ISO编码显式映射；时间来源/精度与可解释、可调度分开；项目名称只按同账本一致快照精确唯一匹配。旧备份若落后事件、ACK、pending、cursor、远端或本地资产进展，拒绝覆盖当前库。

**UNVERIFIED / BLOCKER（生产）。** 历史用户库/旧版本、生产停写及同库恢复、T15/T16、掉电与跨文件切换、真实远端认证、Actor排他、真实设备/SAF/AAR/凭据/通知及双目标ACK仍未准入。参考registry没有独立plan/targetSchemaId登记，活动指针切换和生产命名列runner未实施。固定反馈PNG不代表真实用户图片/历史恢复。Android [issue #1](https://github.com/johny751/MyTodo/issues/1)保持Open。

**OWNER DECISION。** 集中审核候选合同及上述未决项。交付后停止；不开始真实迁移、生产D1-02或LAN/WebDAV双通道。
