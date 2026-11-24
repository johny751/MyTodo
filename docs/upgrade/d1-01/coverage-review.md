# D1-01 候选契约验证覆盖审查

2026-11-24（Asia/Shanghai）。**限定候选验证已完成**：候选 `d1-01-candidate.1`，验证源码 `8239d39220d940bf9c047a1dcaffd2a831cca2fc`，[CI5 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986)，attempt 1。三个 jobs success；C/Node/Android 各 97/97，comparison 14/14，Android 独立 unit 16/16。结论仅适用于该冻结源码和合成 fixture，不是生产迁移、真实设备或真实同步准入。发布身份和逐件交付哈希由独立 publication receipt 随交付提供。

FACT 表示固定源码或主 Agent实收核验的具体运行回执；PROPOSAL 表示候选设计；UNVERIFIED 表示缺少对应范围的证据；OWNER DECISION 表示负责人选择；BLOCKER 表示生产或交付不能放行的条件。历史失败按各自 source/run/attempt 保留，不由 CI5 通过追认。

## 最终验证身份与结果

| 项目 | FACT：已取得的 CI5 证据 |
| --- | --- |
| 源码 / 运行 | `8239d39220d940bf9c047a1dcaffd2a831cca2fc` / [45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986) / attempt 1 |
| fixture | SHA-256 `e29b960dd9c51304a540790af1eaaf1c5509f52666debfcf163b3f2e914338bf` |
| C / Node / Android reference suite | 各 97/97；三个真实来源 SQLite 上的独立 Python reference，不能说成三端 production wrapper 已测试 |
| comparison | 14/14：3 profile seal + 9 directed comparison + F01/F02 |
| Android 主路径 | build / Java Framework generator / host runner/capture passed；actualFramework=true、productionEntry=false |
| 独立 capture contract unit | 16/16；与 97 个 SQLite 案例、14 个比较案例分开统计 |
| SQLite 版本 | C 3.38.2；Node 3.54.1；Android 3.39.2 |
| Android 宿主 Node | v22.23.5；本字段不推定 Windows 宿主 Node 版本 |

**FACT。** S51 内嵌 fake passed JSON 是负例输入，不是 producer。不得从目录递归搜索到的 status/actualFramework 字符串计数；实际 producer、runner、suite 和 comparison 只以主路径且通过 source/run/attempt/fixture/seal 核验的回执为准。S51 的通过表示假记录被识别或拒绝，不能新增一个 Framework 成功来源。

## 历史尝试：全部保留

| 尝试 / 源码 | 原始结果与失败 | 后续解释 |
| --- | --- | --- |
| CI1 [45348588067](https://github.com/johny751/MyTodo/actions/runs/45348588067) · `cd0f324` | Node 87/88，S35 失败；C 在 vendor 字节门禁拒绝，C 案例未执行；Android EXPECTED_SOURCE_SHA 缺失，Framework 案例未执行。 | S35/checkout/expected-source 工具修订不追认该轮通过。没有首轮原 vendor 字节时，CRLF 原因保持未确认。 |
| CI2 [45353907376](https://github.com/johny751/MyTodo/actions/runs/45353907376) · `a3a6bd4` | C 88/88、Node 88/88；Android Java generator passed/actualFramework=true，但 host sidecar stdout79/host exit0 的 No such file 被误判非空；comparison 0/12，loader 两处 PosixPath+str 优先级错误。 | producer 与 host capture 分开。loader/sidecar 修正保留原错误，不改原轮计数。 |
| CI3 [45359601767](https://github.com/johny751/MyTodo/actions/runs/45359601767) · `39287608f87cae99e69ea352eaec032c4e3e174a` · attempt 1 | C/Node 各 88 项回执，unit16 passed；完整 script 被当命令名，stdout inaccessible/not found，framed gate 因缺帧拒绝；Android SQLite suite 未执行。 | 原命令、stdout/stderr、拒绝与未执行保留；缺帧不能作为原文件或成功 capture。 |
| CI4 [45362018398](https://github.com/johny751/MyTodo/actions/runs/45362018398) · `a6d266a2fb0f6c396f1cfec6c3e4bb18ac37ad69` · attempt 1 | C88/88、Node88/88；Android build/Framework generator/host capture passed，unit16 passed；suite71/88、17fail主要 unknown source schema；comparison6pass/6fail共12，Android export未加载，F01/F02未执行。 | 保留 source-schema 原拒绝和所有 ZIP；CI5 的限定 Framework/已知 schema 修正不把 CI4 改成通过，也不将历史猜因泛化成生产事实。 |
| CI5 [45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986) · `8239d39220d940bf9c047a1dcaffd2a831cca2fc` · attempt 1 | 三 jobs success，C/Node/Android各97/97，comparison14/14，unit16/16；Android 主路径 build/generator/capture passed。 | 同一 source/run/attempt/fixture 下的限定验证结论；不拼接前四轮局部结果。 |

**FACT。** 主 Agent已保全历史原日志/失败 ZIP；CI5 不覆盖首错、采集不完整或未执行项。Windows 新 checkout raw hash 匹配冻结值只证明新运行的当前一致性，缺少首轮字节时不追认首轮 CRLF 原因。失败 capture 的非 DB 输出仅 raw log；SQLite 头候选仍 fileBytesVerified=false、sealed=false，不能因有本地 SHA 就充当已封存原文件。

## 实际覆盖与实现限制

| 范围 | FACT：限定证据 | PROPOSAL / UNVERIFIED / BLOCKER：边界 |
| --- | --- | --- |
| 字段/原文 | presence、JSON/SQL空值、0/false、数学整数、非法类型/范围、UTF-8身份、未知嵌套大整数、原 TEXT/meta/record/墓碑/outbox/pending 均有具名案例及字节核对。 | 不是所有历史 field/path/版本的完整覆盖；旧 UI/导出默认化不能倒推原值。 |
| 关系 | 唯一/重名/缺项/归档/冲突项目、精确 Unicode、地点和父链/环/墓碑/深度等固定样例。 | 完整 tags 逐位置关系、复杂 generatedFrom 历史、跨账本识别/隔离、并发分类与旧导出往返仍 UNVERIFIED；reference 固定 synthetic-ledger。 |
| 时间/循环/提醒 | 严格公历、fixed+08、epoch0/负值、year1/9999、精确毫秒、ISO星期、Monday周、anchor月底/闰日、until包含、非1weekdays阻断与未知done不可调度。 | IANA历史/DST、无偏移旧来源、实际alarm/通知/延后、跨端发生器副作用/容量/子树时刻及真实统计/搜索仍未全面验证。 |
| 生成器 | C真实SQLite/CJSON、Node真实node:sqlite、Android模拟器真实Framework SQLite。C unsafe数投影限制和Node绑定首错/隔离存储分别留证。 | 不是 production database.c/sqlite-store/ReplicaDatabase；安全 NULL 隔离不冒充旧端写入修复或无损标准化。 |
| schema 身份 | 新 framework_metadata.py 精确认证 android_metadata DDL/typed locale并保留完整表；其余全部 sqlite_master 对象按已知源/候选 reference 对照，S44/S49/S50有实际正反例。 | 这是固定合成域的已知对象对照；registry 没有独立 target schema fingerprint/targetSchemaId，target_hash 仍只对指定候选表数据作指纹，不能宣称生产完整 schema 演进/漂移已验证。 |
| 登记与写入 | registry六列 migration_id/checksum/source_hash/target_hash/candidate/status；当前checksum按 migration.py、candidate.py、isolation.py、factory.py、framework_metadata.py 的 name UTF-8+NUL+实际字节顺序计算。 | 历史四文件checksum按历史source保留；无plan.json/planChecksum/sourceSnapshot/targetSchemaId登记。migration仍位置型INSERT，S09仅独立outbox命名列示例。 |
| 迁移/故障/恢复 | Python SQLite reference在冻结来源的独立副本上执行，保留worker首错、指定同路径、新probe、版本/登记、原文与候选数据核对。 | restore_gate仅offline eligibility/automaticActivation=false；没有B/S/A活动指针切换、生产启动恢复、真实认证、共同writer屏障或真实WAL/掉电。 |
| 反馈/附件 | F01/F02已执行通过：独立Feedback持久/临时域、原图与自包含备份/manifest/资产核对，Framework元数据另认证并保留。 | F02固定1px PNG和各1条草稿/meta；没有SAF/AAR历史软删、真实反馈包、厂商环境或跨组件共同writer屏障覆盖。 |
| 比较 | 3主profile身份/seal + 9方向的原字段/meta/outbox/候选投影比较，源SQL typed-cell差异独立保存，F01/F02另计。 | 不将源SQL差异改写为统一原值，不将negative fake JSON当主producer；不由合成比较推定真实LAN/WebDAV/生产同步。 |

## 已封存 CI5 原始包

主 Agent已核验以下原 ZIP 的长度与 SHA-256；实际路径/下载入口及 publication receipt 由交付证据索引提供，不由本页杜撰文件名或发布 commit。

| 角色 | 字节 | SHA-256 |
| --- | ---: | --- |
| desktop | 2673800 | `4c897dbff1d577b26b9ee3842475c73a0e86a7c476bf6dcf2caa9b3d27c2560f` |
| android | 957525 | `ec305592741de33971432b1e3df017df7960a4e2b9edd2d67b1dea7b53dfb57e` |
| comparison | 21609 | `e8536811c8e81652a2f410fb97f73401ab0c26b8d5f4238b8dc215ee4b9dd411` |
| emulator | 23185 | `d0b758057eb0caecca55c8f808fd8d106dc1979db5592e4dc8ddd13a331d090b` |

## 审核与生产停止门槛

**FACT / PROPOSAL。** 本批限定合成验证已完成，可交付候选文档、独立源码及完整原证据。发布身份/逐件哈希/实际差异以另交 publication receipt 为准；不在本页预造发布 SHA。固定生产依据仍为 [D1A](https://github.com/johny751/MyTodo/commit/6a4b179f361602f47429bc9aa88e51c0b61395e3) / `bc3f44d1e76a988dbe269edcf1c606eebec37293`，真实用户库 UNKNOWN/NEEDS INVESTIGATION 不由模拟器样例升级。

**OWNER DECISION。** 审核候选合同、时间/星期/关系、旧端支持、完整本地/附件备份和版本策略。提前准备的 D1-02 方案仍是设计，不自动进入生产 kind/表/UI/wire。

**UNVERIFIED / BLOCKER（生产）。** 真实库/历史包、生产T15/T16与同库恢复、WAL/断电/切换、旧writer/过期会话隔离、真实认证/DPAPI/Keystore、真机/SAF/alarm、Windows C旧v1非空导入、真实LAN/WebDAV及双目标ACK仍未准入；Android issue #1继续开放。独立数据fingerprint与已知schema对照不替代生产schema登记和激活证明。完成限定发布与证据交付后停止在负责人审核点，不自行生产迁移、启用双通道或关闭历史风险。
