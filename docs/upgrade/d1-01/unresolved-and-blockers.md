# D1-01 未覆盖事项与生产准入门槛

2026-11-24（Asia/Shanghai）。**本批限定候选验证完成**：`d1-01-candidate.1`，source `8239d39220d940bf9c047a1dcaffd2a831cca2fc`，[CI5 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986)，attempt1；C/Node/Android各97/97、comparison14/14、Android独立unit16/16，三jobs success。以下BLOCKER是生产/额外范围准入条件，不是把CI5已完成的限定验证写成尚未运行。publication receipt随交付另含实际发布身份与逐件证据。

FACT限固定源码或主 Agent核验的具体回执；PROPOSAL是候选设计；UNVERIFIED是该范围证据尚缺；OWNER DECISION是负责人选择；BLOCKER是不能据限定结果自动放行的生产条件。详见 [最终审查](final-review.md) 和 [覆盖审查](coverage-review.md)。

## 历史失败必须保留

| 编号 / 运行 | FACT：原结果 | 当前解释 |
| --- | --- | --- |
| H01 / CI1 [45348588067](https://github.com/johny751/MyTodo/actions/runs/45348588067) / cd0f324 | Node87/88，S35fail；C vendor门禁阻断、C案例未执行；Android expected source缺失、Framework案例未执行。 | 原误判/拒绝不追改。没有首轮vendor字节时CRLF原因仍未确认。 |
| H02 / CI2 [45353907376](https://github.com/johny751/MyTodo/actions/runs/45353907376) / a3a6bd4 | C/Node88/88；Android producer passed但sidecar stdout79/exit0误判；comparison0/12，loader两处PosixPath+str错误。 | producer/capture分开，原失败保留。 |
| H03 / CI3 [45359601767](https://github.com/johny751/MyTodo/actions/runs/45359601767) / 39287608f87cae99e69ea352eaec032c4e3e174a / attempt1 | C/Node各88项回执、unit16passed；整script作命令名inaccessible/not found，缺帧拒绝；Android SQLite suite未执行。 | 缺帧与失败stdout不能升格为已封存原文件。 |
| H04 / CI4 [45362018398](https://github.com/johny751/MyTodo/actions/runs/45362018398) / a6d266a2fb0f6c396f1cfec6c3e4bb18ac37ad69 / attempt1 | C/Node88/88；Android build/gen/capture、unit16passed；suite71/88，17fail主要unknown source schema；comparison6/12，未加载Android export，F01/F02未执行。 | 修正后的已知schema/Framework认证有CI5限定实证，原拒绝和未执行不改值。 |
| H05 / CI5 [45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986) / 8239d39220d940bf9c047a1dcaffd2a831cca2fc / attempt1 | 同一source/run/fixture下三端97/97、comparison14/14、unit16/16。 | 形成限定结论，不合并旧运行拼成通过。全部旧日志/失败ZIP继续保全。 |

**FACT。** S51的nested fake passed JSON是负例输入，不是主producer。只按主路径source/run/attempt/fixture/seal回执识别真实Framework、generator、runner及统计，不用递归passed字符串计数。

## 已知模型验证完成与实际实现限制

| 编号 / 分类 | 已取得的限定证据 | 保持的边界 |
| --- | --- | --- |
| V01 · FACT | 三端真实生成来源SQLite、Python reference97例、3seal/9方向/F01/F02比较、原TEXT/meta/record/墓碑/outbox/pending及原图核对。 | 不是三端production migration/storage wrapper，不是实际用户库/真实多端同步。 |
| V02 · FACT | framework_metadata.py精确认证android_metadata原DDL/typed locale并保留全表；其余全部sqlite_master已知源/候选对象对照，S44/S49/S50有固定正反例。 | 不能宣称目标对象“完全未检查”；但没有独立target schema fingerprint登记，不代表所有生产历史DDL/引擎/厂商对象。 |
| V03 · FACT | checksum五文件有序name UTF-8+NUL+代码字节：migration.py/candidate.py/isolation.py/factory.py/framework_metadata.py。registry仍6列migration_id/checksum/source_hash/target_hash/candidate/status。 | 历史4文件按历史source；无plan.json/planChecksum/sourceSnapshot/targetSchemaId登记，target_hash仍仅目标数据指纹。 |
| V04 · FACT / UNVERIFIED | migration仍位置型INSERT，S09仅独立outbox命名列；restore_gate只eligibleForOfflineCandidate/automaticActivation=false。 | 没有B/S/A活动指针切换、生产启动恢复、真实认证或完整命名列迁移实现。 |
| V05 · FACT / UNVERIFIED | F02固定1px PNG和各1条反馈草稿/meta，固定包自足性通过。 | 不证明共同writer屏障、SAF/AAR历史软删、真实反馈包/厂商存储恢复。 |
| V06 · FACT | timeout/size limit/缺帧拒绝；失败非DB仅raw log，SQLite头候选fileBytesVerified=false/sealed=false。 | 候选stdout字节不冒充远端原文件或成功封存；不会进入主producer/恢复验证统计。 |

## 候选未全面覆盖与负责人决定

| 编号 / 分类 | 范围与当前处理 |
| --- | --- |
| U01 · UNVERIFIED | 全部历史field/path、载体/旧版本往返、异常/超长/跨字段约束未全面覆盖。原UNKNOWN/NEEDS INVESTIGATION保持，规范化UI/SQL/业务导出不能倒推原值。 |
| U02 · UNVERIFIED / OWNER DECISION | 完整tags逐位置关系、改名/删除/重复目录、复杂generatedFrom/seriesId历史链/环/冲突/并发判重。保留原值/ID/墓碑，不猜关系；人工确认与展示需审核。 |
| U03 · UNVERIFIED / OWNER DECISION | 实际ledgerId/跨账本身份隔离、账号路由、旧导出全局ID约束。reference固定synthetic-ledger，不以显示名/目录/actor猜统一账本。 |
| U04 · PROPOSAL / OWNER DECISION | 数学整数范围、time域/精度、fixed+08来源、ISO weekday映射、空weekly/non1weekdays与历史提醒策略。通过的固定算法样例不扩张旧端能力，不补发/补造历史。 |
| U05 · UNVERIFIED | IANA/DST/无偏移旧来源、所有循环副作用/容量/子树时刻、统计/搜索旧祖先缓存与各生产入口。 |
| U06 · UNVERIFIED / OWNER DECISION | Android完整计时/boot会话、通知/alarm/延后、反馈图片/草稿/恢复代次和本地配置。聚合不逆推会话，URI/hash不补造缺失文件。 |
| U07 · PROPOSAL / UNVERIFIED | 提前准备的D1-02新实体、工作流/归档关系和平台入口仅为设计，不自动进入生产kind/表/UI/wire。 |

## 生产进入门槛

| 编号 / 分类 | 必要条件与当前约束 |
| --- | --- |
| P01 · UNVERIFIED / BLOCKER | 真实用户库结构/历史样本、完整原备份、附件/本地组件同代一致性未准入。本轮只用隔离fixture，不试写/重建真实库，不以业务JSON导出代替完整备份。 |
| P02 · UNVERIFIED / BLOCKER | 生产T15/T16、真实WAL/checkpoint/掉电、同一真实库恢复、版本/指针切换与失败回退。reference事务/新probe不替代production wrapper或设备耐久证据。 |
| P03 · UNVERIFIED / BLOCKER | 全部真实writers、后台/旧包/旧标签页、过期会话隔离和恢复激活。offline eligibility不是活动指针切换，不通过取数值max掩盖进度分歧。 |
| P04 · UNVERIFIED / BLOCKER | 真实WebDAV/LAN/坚果云、Windows旧v1非空导入、每目标ACK/迟到响应/双通道。不得据本轮修改生产ACK/outbox/cursor/manifest/batch或启用通道。 |
| P05 · UNVERIFIED / BLOCKER | 真机/厂商系统、旧APK、通知/alarm/SAF、安全存储/认证和稳定性。Framework模拟器生成器不替代上述范围，[Android issue #1](https://github.com/johny751/MyTodo/issues/1)继续开放，阶段0首崩/换库/collector原值保持。 |
| P06 · OWNER DECISION / BLOCKER | 生产schema/读写/迁移/协议实施授权、旧端能力、维护窗口、证据保留及人工确认策略。限定候选通过不自动授予生产准入。 |
| P07 · UNVERIFIED / BLOCKER | 实际生产目标schema身份/登记/全版本漂移。已知sqlite_master对照和S44/S49/S50不能替代独立target schema fingerprint/targetSchemaId、真实历史结构与激活证明。 |
| P08 · UNVERIFIED / BLOCKER | 正式plan/源snapshot登记、全命名列迁移、B/S/A活动指针切换/回退、真实认证/共同writer屏障。六列registry、S09、offline eligibility或F02小夹具不能替代。 |

**FACT / PROPOSAL。** 当前限定验证已完成，运行统计不再待补。原ZIP和历史索引、实际publication commit/parent/tree、逐件文件哈希和远端回读由独立交付回执提供。完成限定发布/证据交付后停止在负责人审核点，保留全部未知和生产BLOCKER，不自动实施生产迁移或下一阶段平台功能。
