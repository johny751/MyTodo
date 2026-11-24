# D1-01 候选及独立工具综合静态审阅

2026-11-24（Asia/Shanghai）。候选 `d1-01-candidate.1`。**限定验证完成：CI5 source 8239d39220d940bf9c047a1dcaffd2a831cca2fc / run45367557986 / attempt1，三端各97/97、comparison14/14、unit16/16。生产未准入，publication receipt随交付另提供。**本页记录并行静态交叉审阅中发现的真实问题、已核对的修订及工具覆盖限制。审阅对象为本候选文档、独立合成生成器的调用边界，以及 isolation/factory/candidate/migration/suite/storage_cases/ci-run/compare 和专用工作流。没有在本地执行 Python、SQLite、构建、测试、ADB 或真实同步；本地没有运行项目；以下CI5结果来自主 Agent实收核验的原回执，具体原件由交付索引提供。

**FACT：审阅基线。** 现状依据固定生产源码 `bc3f44d1e76a988dbe269edcf1c606eebec37293` 和 [D1-01-A 盘点](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3)。候选文件中的 FACT/PROPOSAL/UNVERIFIED/OWNER DECISION/BLOCKER 分开；原盘点 UNKNOWN、NEEDS INVESTIGATION 及 Android issue #1 不因静态修订升格为运行已确认。

## 静态发现与已核对修订

| 静态发现 | 已核对修订 | 验证范围与仍保留边界 |
| --- | --- | --- |
| accounts.json 被归为单账号本地数据；候选 FK 与原坏边保留措辞可能冲突 | accounts.json 为应用级路由；候选仅在独立有效投影建议复合 FK，不在生产原库加 FK，不清原悬空值或墓碑 | 实际账号路由、旧库身份和原写端隔离 |
| 隔离目录在范围检查前创建；祖先/marker 链接可逃过检查 | 先校验 RUNNER_TEMP、原路径祖先和 marker，再创建；独立输出拒绝已存在目标/sidecars；测试 symlink 单列身份、不跟随读字节 | GitHub 作业的真实拒绝回执及环境行为 |
| fixture 的 event/record/pending/body/path 不符合固定 v2，历史 actor/seq 重复，已入队事件未映射相应 record/data | 事件 key 字符串、values/context、record.events 无 key、batch format/epoch/device/index 与 v2 路径对齐；历史序号独立；through41/42 与 event seq4/5 分开；原 body 和 outbox TEXT 保留不同原始字节 | 三端生成器真实 SQLite 文件、CAST AS BLOB 和事件对应回读 |
| 数学整数 1.0 进入月/年计算后仍为 float；instant 拒绝 1.0；远年毫秒使用浮点总秒 | 仅在整数值已验证后规范为 int，原字面量仍在 raw；精确 timedelta 计算毫秒；type 使用 epoch-millis 并另记 sourceType | 合成时间边界、世纪闰年及远年毫秒实际断言 |
| 父墓碑被写 missing，根出处不明被当根，深度名称/临界不一致 | deletedTarget、unknown、depthExceeded 与候选一致；工具明确 64 祖先限制及 64/65 临界夹具；日程 canSchedule 同时核 current、anchor 和结果，解释能力独立 | 对应命名用例实际结果；生产深度界限仍需负责人决定 |
| 迁移登记未含候选依赖实现、幂等未验证目标数据漂移 | checksum包含当前五文件固定实现依赖；登记target_hash数据指纹；全部已知sqlite_master源/候选对照、目标FK/integrity与成功登记/1001版本同事务；不等于独立target schema FP登记 | CI5有独立事务/故障/同路径回读及已知sqlite_master源/候选对照；target_hash仍非独立目标schema fingerprint，不能推广生产全部schema漂移 |
| 备份资产仅引用原件，原件删除后不自足；worker 回执路径未适配 UUID | 备份保存独立资产副本；负例改副本、正例删原件后核备份；按 PID 查唯一 UUID 回执并核数据库身份 | 自足副本原 bytes、资产缺损拒绝及新进程恢复回执 |
| 子进程超时丢 partial stdout/stderr；Python 相等混淆 JSON bool/number | 超时先封存 partial 输出及 command receipt 再传播；递归 JSON 比较区分 bool/number，并有明确负例 | 原始超时/拒绝路径，不能由静态代码推断已经触发 |
| 比较只信汇总计数、必需封存路径不全、SQL 差异只标布尔、反馈新备份未进入 comparison 输出 | 比较重算逐用例状态/数量、唯一 ID，核 source/run/attempt 与 generator/canonical 身份；实际 SQL 列差异单列文件；F02 在 output/feedback-restore 保存自足备份/manifest/原图副本并设计 seal | 完整同 run/attempt artifact、逐件 SHA-256、真实生成器和比较回执 |
## 限定实证已完成

**FACT。** 验证源码 `8239d39220d940bf9c047a1dcaffd2a831cca2fc`，[CI5 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986)，attempt1：三个jobs success；C97/97、Node97/97、Android97/97；comparison14/14（3profile seal+9directed comparison+F01/F02）；Android主build/generator/host runner/capture passed、actualFramework=true、productionEntry=false；独立unit16/16。SQLite C3.38.2/Node3.54.1/Android3.39.2，Android宿主Nodev22.23.5，fixtureSHA `e29b960dd9c51304a540790af1eaaf1c5509f52666debfcf163b3f2e914338bf`。

表中工具验证要求已在该固定源码/fixture的具名案例中取得限定证据；实际账号路由、旧写端、所有历史/生产设备行为等要求仍未由合成样例证明。原ZIP长度/哈希及运行完整范围见 [最终审查](final-review.md) 和 [覆盖审查](coverage-review.md)，发布身份由独立publication receipt随交付提供。

## CI1–CI5 原始历史分别保留

| 尝试 | 原事实与失败 | 状态解释 |
| --- | --- | --- |
| CI1 / 45348588067 / cd0f324 | Node87/88 S35fail；C vendor字节门禁拒绝、C案例未执行；Androidexpected source缺失、Framework案例未执行。 | 原错误不追认通过；缺首轮原vendor字节时CRLF原因未确认。 |
| CI2 / 45353907376 / a3a6bd4 | C/Node88/88；Android producer passed但sidecar stdout79/exit0误判非空；comparison0/12，loader两处PosixPath+str。 | producer/host capture分开，原日志和失败ZIP保留。 |
| CI3 / 45359601767 / 39287608f87cae99e69ea352eaec032c4e3e174a / attempt1 | C/Node各88项回执、unit16passed；script整体被当命令名inaccessible/not found，framed gate缺帧拒绝；Android SQLite suite未执行。 | 原stream/命令/缺帧/未执行保持各自归属。 |
| CI4 / 45362018398 / a6d266a2fb0f6c396f1cfec6c3e4bb18ac37ad69 / attempt1 | C/Node88/88；Androidbuild/gen/capture、unit16passed；suite71/88，17fail主要unknown source schema；comparison6/12，Androidexport未加载，F01/F02未执行。 | 原schema拒绝不删除；后续精确Framework/已知对象检查为CI5限定新证据。 |
| CI5 / 45367557986 / 8239d39220d940bf9c047a1dcaffd2a831cca2fc / attempt1 | 同一source/run/fixture下三端97/97、comparison14/14、unit16/16。 | 限定验证完成，不拼接旧局部结果，也不覆盖所有原失败。 |

## 捕获、producer 和失败证据边界

**FACT（静态及限定运行）。** timeout/size limit/缺帧必须拒绝，即使host exit0也不能接纳部分流。失败非DB输出仅raw stdout/stderr；SQLite头候选明确fileBytesVerified=false、sealed=false。头与本地SHA不证明远端完整文件/已关闭writer/WAL一致性，失败候选不升格为主producer或验证过的恢复原件。

**FACT。** S51的nested fake passed JSON仅负例输入，不能从递归目录的passed/actualFramework字符串统计producer；只用主路径、source/run/attempt/fixture/seal已核验的真实generator/runner/case/comparison回执。本轮14个比较中的3profile seal没有将S51假记录算作Framework来源。

## reference 实现与设计分别限定

**FACT。** 当前checksum按 migration.py/candidate.py/isolation.py/factory.py/framework_metadata.py 五文件顺序，以name UTF-8+NUL+实际代码bytes计算；历史四文件checksum仍按历史源码归属。registry实际六列migration_id/checksum/source_hash/target_hash/candidate/status，没有plan.json/planChecksum/sourceSnapshot/targetSchemaId正式登记。

**FACT（静态和S44/S49/S50）。** framework_metadata.py精确认证android_metadata原DDL/typed locale并保留全表；其余全部sqlite_master对象按已知源/源+候选reference对照。固定模型的schema正反例已验证，不再称目标对象完全未检查。target_hash仍只针对d1_raw_sources/d1_projection/d1_relations的数据，不是独立注册的目标schema fingerprint；该对照不能推广为全部生产历史/厂商schema。

**FACT / UNVERIFIED。** migration仍位置型INSERT，S09仅独立outbox命名列；restore_gate只eligibleForOfflineCandidate/automaticActivation=false，没有B/S/A活动指针切换、生产启动恢复或真实认证。F02固定1px PNG和各1条反馈草稿/meta，自足性通过不代表共同writer屏障、SAF/AAR历史软删或真实用户反馈恢复。

## 保留的未知和生产门槛

**UNVERIFIED。** reference固定synthetic-ledger；全面tags/generatedHistory/crossledger、所有历史field/path/旧导出往返、生产循环/搜索/统计与计时/通知/反馈本地状态不由97个固定样例覆盖。三端真实生成器与Python reference不等于production C/Node/Android wrapper。

**OWNER DECISION / BLOCKER（生产）。** 实际用户库/旧包、T15/T16/真实同库/WAL/掉电/切换、全部旧writers/过期会话、真实认证/DPAPI/Keystore、真机/SAF/alarm、Windows旧v1非空WebDAV和双目标ACK等仍无准入。已知schema检查不替代正式目标schema身份/登记与生产激活；[Android issue #1](https://github.com/johny751/MyTodo/issues/1)继续开放，阶段0首崩/换库/collector原值不变。

**FACT / PROPOSAL。** 本批限定验证完成，可交付完整候选、独立源码与原证据；publication receipt另证明实际提交/parent/tree、逐件哈希/远端回读与基线差异。完成限定发布交付后停止在负责人审核点，生产方案和D1-02提前设计不自动实施。
