# D1-01 限定候选验证最终审查

2026-11-24（Asia/Shanghai）。**限定候选验证完成，生产未准入。** 候选 `d1-01-candidate.1`，验证源码 `8239d39220d940bf9c047a1dcaffd2a831cca2fc`，[CI5 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986)，attempt 1。C/Node/Android 各97/97、comparison14/14、Android独立unit16/16，三个 jobs success。发布 commit/parent/tree、逐件文档哈希和远端内容回读由独立 publication receipt 随交付提供，本稿不预造发布 SHA。

FACT 表示固定源码或主 Agent实收核验的具体回执；PROPOSAL 表示候选方案；UNVERIFIED 表示缺少该范围的证据；OWNER DECISION 表示负责人选择；BLOCKER 表示生产准入缺口。运行通过限定到该源码/fixture，设计建议并未自动成为生产实现。

## 最终实证

| 项目 | FACT：CI5已封存核验 |
| --- | --- |
| source/run/attempt | `8239d39220d940bf9c047a1dcaffd2a831cca2fc` / 45367557986 / 1 |
| fixture SHA-256 | `e29b960dd9c51304a540790af1eaaf1c5509f52666debfcf163b3f2e914338bf` |
| 来源生成器 | C真实SQLite C API、Node真实node:sqlite、Android模拟器真实Framework SQLite；不加载 production storage wrapper |
| reference suites | C97/97、Node97/97、Android97/97；由独立Python SQLite reference在真实生成来源库的副本上验证 |
| Android主路径 | build/Java generator/host runner/capture passed；actualFramework=true、productionEntry=false |
| capture contract unit | 16/16，单独列出，不混入97项SQLite suite或14项comparison |
| comparison | 14/14：3profile seal、9directed comparison、F01/F02 |
| SQLite versions | C3.38.2、Node3.54.1、Android3.39.2 |
| Android宿主Node | v22.23.5，不推定其他宿主版本 |

**FACT。** S51内嵌 fake passed JSON 仅为负例输入，不能作为producer。上述计数及actualFramework只取主路径、source/run/attempt/fixture/seal均核验的真实回执，不能通过递归搜到passed字符串填表。

## 全部历史尝试保持原值

| 尝试 / 源码 | 原始证据与限定解释 |
| --- | --- |
| CI1 [45348588067](https://github.com/johny751/MyTodo/actions/runs/45348588067) / `cd0f324` | Node87/88，S35fail；C vendor字节门禁拒绝、C案例未执行；Android EXPECTED_SOURCE_SHA缺失、Framework案例未执行。无首轮vendor原字节时CRLF原因仍未确认。 |
| CI2 [45353907376](https://github.com/johny751/MyTodo/actions/runs/45353907376) / `a3a6bd4` | C88/88、Node88/88；Java generator passed但host sidecar stdout79/exit0误判；comparison0/12，loader两处PosixPath+str优先级错误。producer/capture失败分开保留。 |
| CI3 [45359601767](https://github.com/johny751/MyTodo/actions/runs/45359601767) / `39287608f87cae99e69ea352eaec032c4e3e174a` / attempt1 | C/Node各88项回执、unit16passed；script整体被作命令名，inaccessible/not found、framed gate缺帧拒绝；Android SQLite suite未执行。 |
| CI4 [45362018398](https://github.com/johny751/MyTodo/actions/runs/45362018398) / `a6d266a2fb0f6c396f1cfec6c3e4bb18ac37ad69` / attempt1 | C88/88、Node88/88；Android build/generator/capture passed、unit16passed；suite71/88、17fail主要unknown source schema；comparison6/12，Android export未加载，F01/F02未执行。 |
| CI5 [45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986) / `8239d39220d940bf9c047a1dcaffd2a831cca2fc` / attempt1 | 同一冻结身份的三端97/97、comparison14/14、unit16/16。形成限定结论，未拼接或追改CI1–CI4结果。 |

主 Agent保留全部原日志/失败 ZIP；缺采集、未执行、首次错误及历史UNKNOWN继续归各自尝试。更多覆盖和原包摘要见 [coverage-review.md](coverage-review.md)。

## CI5 原 ZIP 封存摘要

| 角色 | bytes | SHA-256 |
| --- | ---: | --- |
| desktop | 2673800 | `4c897dbff1d577b26b9ee3842475c73a0e86a7c476bf6dcf2caa9b3d27c2560f` |
| android | 957525 | `ec305592741de33971432b1e3df017df7960a4e2b9edd2d67b1dea7b53dfb57e` |
| comparison | 21609 | `e8536811c8e81652a2f410fb97f73401ab0c26b8d5f4238b8dc215ee4b9dd411` |
| emulator | 23185 | `d0b758057eb0caecca55c8f808fd8d106dc1979db5592e4dc8ddd13a331d090b` |

原包路径/下载入口、历史索引、逐件证据和发布回执由交付清单提供。本页只报告已核验长度/摘要，不杜撰artifact ID或发布commit。

## 实际实现与候选设计分别审查

**FACT。** 当前checksum按 migration.py、candidate.py、isolation.py、factory.py、framework_metadata.py 的固定顺序，以name UTF-8+NUL+各代码文件实际字节计算。历史四文件checksum仍按历史source归属。registry仍仅migration_id/checksum/source_hash/target_hash/candidate/status六列，没有plan.json/planChecksum/sourceSnapshot/targetSchemaId正式登记。

**FACT（静态及S44/S49/S50限定实证）。** framework_metadata精确认可android_metadata原DDL/typed locale，保留全表；其余全部sqlite_master对象按已知源或源+候选reference对照。目标已知对象漂移有固定正反例验证，不能继续写成“完全未检查”。target_hash仍是指定候选表数据指纹，没有独立target schema fingerprint登记；该已知模型检查不能推广为生产全部历史schema演进、厂商对象和迁移准入。

**FACT / UNVERIFIED。** migration仍有位置型INSERT，S09只证明独立outbox命名列示例；restore_gate仅eligibleForOfflineCandidate/automaticActivation=false，未实现B/S/A活动指针切换、生产启动恢复或真实认证。F02固定1px PNG和各1条反馈草稿/meta，验证固定包自足性，不代表共同writer屏障、SAF/AAR历史软删或真实用户反馈恢复。

**FACT。** capture contract拒绝超时/超限/缺帧；失败非DB输出仅raw log，SQLite头候选仍fileBytesVerified=false、sealed=false。失败候选不进入主producer统计或已验证恢复材料。[综合静态审阅](consolidated-static-review.md)保留此前真实工具发现与修订。

**PROPOSAL。** 逻辑key `(ledgerId,kind,id)`、raw/projection/derived/tombstone/local/infrastructure、严格字段/时间/星期、关系唯一匹配和版本/备份策略继续是供负责人审核的候选合同。reference固定synthetic-ledger，完整tags/generatedHistory/crossledger、旧导出往返、搜索/统计与本地会话等仍有未覆盖范围，见 [未决与门槛](unresolved-and-blockers.md)。

## 审查决定与停止条件

**FACT / PROPOSAL。** 本批限定候选验证已完成，可交付候选文档、独立工具和完整原证据；独立publication receipt负责实际发布SHA/parent/tree、逐件哈希、远端回读及基线差异核对。统计已按实际CI5回执填入，不再留待补最终案例数。生产依据仍为 [D1A](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3) / `bc3f44d1e76a988dbe269edcf1c606eebec37293`，本地审阅未运行项目或操作用户数据库。

**OWNER DECISION。** 审核候选字段/时间/星期/关系、旧端能力、完整本地/附件备份、schema与迁移登记策略及提前准备的D1-02设计。候选通过不会自动把新kind/表/UI/wire或活动指针上线。

**UNVERIFIED / BLOCKER（生产）。** 真实数据/旧包、生产T15/T16与同库恢复、WAL/断电/切换、旧writer/过期会话、真实认证/DPAPI/Keystore、真机/SAF/alarm、Windows C旧v1非空导入、真实LAN/WebDAV和每目标ACK仍未准入。Android issue #1继续开放，阶段0和CI1–CI4原失败保留。完成限定发布和证据交付后停止在负责人审核点，不自行生产迁移、启用双通道或关闭历史风险。
