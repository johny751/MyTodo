# D1-01 候选及独立工具综合静态审阅

2026-11-24（Asia/Shanghai）。候选 `d1-01-candidate.1`。本页记录并行静态交叉审阅中发现的真实问题、已核对的修订及工具覆盖限制。审阅对象为本候选文档、独立合成生成器的调用边界，以及 isolation/factory/candidate/migration/suite/storage_cases/ci-run/compare 和专用工作流。没有在本地执行 Python、SQLite、构建、测试、ADB 或真实同步；本页不提供运行通过数，不代替 GitHub Actions 原始回执。

**FACT：审阅基线。** 现状依据固定生产源码 `bc3f44d1e76a988dbe269edcf1c606eebec37293` 和 [D1-01-A 盘点](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3)。候选文件中的 FACT/PROPOSAL/UNVERIFIED/OWNER DECISION/BLOCKER 分开；原盘点 UNKNOWN、NEEDS INVESTIGATION 及 Android issue #1 不因静态修订升格为运行已确认。

## 静态发现与已核对修订

| 问题 | 已回读确认的修订 | 仍需运行证据 |
| --- | --- | --- |
| accounts.json 被归为单账号本地数据；候选 FK 与原坏边保留措辞可能冲突 | accounts.json 为应用级路由；候选仅在独立有效投影建议复合 FK，不在生产原库加 FK，不清原悬空值或墓碑 | 实际账号路由、旧库身份和原写端隔离 |
| 隔离目录在范围检查前创建；祖先/marker 链接可逃过检查 | 先校验 RUNNER_TEMP、原路径祖先和 marker，再创建；独立输出拒绝已存在目标/sidecars；测试 symlink 单列身份、不跟随读字节 | GitHub 作业的真实拒绝回执及环境行为 |
| fixture 的 event/record/pending/body/path 不符合固定 v2，历史 actor/seq 重复，已入队事件未映射相应 record/data | 事件 key 字符串、values/context、record.events 无 key、batch format/epoch/device/index 与 v2 路径对齐；历史序号独立；through41/42 与 event seq4/5 分开；原 body 和 outbox TEXT 保留不同原始字节 | 三端生成器真实 SQLite 文件、CAST AS BLOB 和事件对应回读 |
| 数学整数 1.0 进入月/年计算后仍为 float；instant 拒绝 1.0；远年毫秒使用浮点总秒 | 仅在整数值已验证后规范为 int，原字面量仍在 raw；精确 timedelta 计算毫秒；type 使用 epoch-millis 并另记 sourceType | 合成时间边界、世纪闰年及远年毫秒实际断言 |
| 父墓碑被写 missing，根出处不明被当根，深度名称/临界不一致 | deletedTarget、unknown、depthExceeded 与候选一致；工具明确 64 祖先限制及 64/65 临界夹具；日程 canSchedule 同时核 current、anchor 和结果，解释能力独立 | 对应命名用例实际结果；生产深度界限仍需负责人决定 |
| 迁移登记未含候选依赖实现、幂等未验证目标漂移 | checksum 包含固定实现依赖；登记 target_hash；源 schema 签名、目标 FK/integrity 与成功登记/1001 版本同事务设计 | 真实独立事务、错误/退出注入、同路径新进程回读、失败原件保留 |
| 备份资产仅引用原件，原件删除后不自足；worker 回执路径未适配 UUID | 备份保存独立资产副本；负例改副本、正例删原件后核备份；按 PID 查唯一 UUID 回执并核数据库身份 | 自足副本原 bytes、资产缺损拒绝及新进程恢复回执 |
| 子进程超时丢 partial stdout/stderr；Python 相等混淆 JSON bool/number | 超时先封存 partial 输出及 command receipt 再传播；递归 JSON 比较区分 bool/number，并有明确负例 | 原始超时/拒绝路径，不能由静态代码推断已经触发 |
| 比较只信汇总计数、必需封存路径不全、SQL 差异只标布尔、反馈新备份未进入 comparison 输出 | 比较重算逐用例状态/数量、唯一 ID，核 source/run/attempt 与 generator/canonical 身份；实际 SQL 列差异单列文件；F02 在 output/feedback-restore 保存自足备份/manifest/原图副本并设计 seal | 完整同 run/attempt artifact、逐件 SHA-256、真实生成器和比较回执 |

## 发包前最后核查

**BLOCKER：当前读取快照。** compare.py 末尾导入 `ci_run`，实际文件名为 `ci-run.py`，需改合法共享模块或按确切路径加载后再 seal；否则比较结束会触发 ModuleNotFoundError。Android 后续实际读取的 runner receipt、feedback-source/validation SQLite 和原图也须在必需 seal 清单中，避免文件存在但漏列 hash。已报告主 Agent，修订后本节需再次回读更新；不能把未修的冻结源包描述为可运行通过。

## 覆盖及生产边界

**UNVERIFIED。** reference 工具固定 synthetic-ledger，不实现实际跨账本识别；逐位置 tags ID 关系、复杂 generatedFrom 历史环/冲突尚未由完整合成场景验证。已实现的项目唯一/重名/缺项、父链、原复制字节保护、独立恢复与附件准备按实际命名用例报告，不以部分用例宣称整份 R01–R14 或全部关系契约已验证。

**UNVERIFIED / OWNER DECISION。** 三端真实生成器提供各端独立 SQLite 类型/原值观察；迁移/业务标准计算使用独立 Python reference，不加载生产 C、Node、Android 存储 wrapper。模拟远端和会话拒绝与真实 WebDAV/LAN 分开；合成 SQLite 回滚和恢复不能证明生产全部 writer 停写、WAL 与跨文件冻结、掉电耐久、DPAPI/Keystore、SAF/通知、真实设备同库恢复或旧客户端往返。

**BLOCKER。** 任何 CI 失败、原证据缺失、旧备份倒退、pending/outbox 不匹配、身份/代次不明、原 bytes 损坏、旧 writer 未隔离或缺真实门禁，均不得据候选收口自动放行生产迁移。Android issue #1 保持开放。[A 未确认事项](https://github.com/johny751/MyTodo/blob/6a4b179f361602f47429bc9aa88e51c0b61395e3/docs/upgrade/d1-01/inventory-open-questions.md#L7-L21)；[同步状态保护](sync-state-migration-protection.md)；[归属边界](data-ownership-and-sync-boundaries.md)。
