# C0-06 旧 WebDAV 迁移恢复结果报告

2026-11-23（Asia/Shanghai）。最终生产源：`1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`。主矩阵 **83/83**、Android 内部强杀 **2/2**、bootstrap/CAS **4/4**、原项目 JS **121/121**，以及完整协议矩阵 **936 个执行与 936 个比较结果** 均已在 GitHub 通过，并完成独立证据复核。主控已确认这些实测门禁满足限定验收，**C006 关闭**；`accepted=true`、`status=accepted-with-documented-evidence-qualifications`、`pending=[]`。以下首崩、替换库重试和封存资格继续有效。Android 稳定性问题仍为 open；C007 独立验收，D1 未获批准。

报告的仓库部署位置为 `docs/upgrade/c0-06/reports/`，四份独立审计随包部署至 `docs/upgrade/c0-06/audit/`。原始证据是本机 `outputs/c0-06/evidence/` 与 `outputs/android-stability/evidence/` 下的归档，不随报告上传大目录；路径映射及 GitHub 各 run 入口见同目录 `README.md`。报告中的本地证据路径是审计索引，不表示仓库存在同名原始归档。

全部项目构建、依赖执行、测试及打包均在 GitHub 完成。本地只读取和整理文本、解析 JSON、比较长度与 SHA256，没有运行项目、打开 SQLite、解密凭据或执行编译。

## 实际实现与修复

保留原有 Node/shared JS、Android WebView/native SQLite 与 Windows C/WinHTTP 架构。JS/Android 将 scope、backup 路径、SHA256 导入 marker 与 rows/outbox 放在同一现有事务提交；同一 marker 重试跳过导入，同路径备份字节改变则拒绝。迁移读取完整 retained records，尊重既有 durable tombstone；真实 revision/CAS 失败后重读当前状态并重新合并。

首次 manifest 发布前写入不可变的完整 retained-record snapshot，沿用现有 wire schema，初始 `heads:{}`、snapshot `cursors:{}`。这使 fresh observer 可以取回已选迁移状态。后续 outbox 仍走原有批次发布与 ACK。最终修订恢复首次 snapshot 的进度规则：初始全零 cursors 出现正向进度时生成首次完整 checkpoint；零进度仍节流，已有正游标仍保留 64 的节流规则。原有“新设备跳过旧日志”测试未放宽，最终 121 项回归通过。

Windows C 仍没有 v1 importer。manifest 不存在时，严格合法的 `backup:null` guard 可以空初始化；真实 v1 或合法非空 backup 的未完成迁移明确拒绝，等待受支持客户端完成。条件 PUT 冲突后重读 state/manifest，最多八次，识别已完成迁移的赢家 epoch；非法 guard/backup 不能当空状态放行。

最终 `src/delta-sync.mjs` SHA256 为 `c6c9511314ee3b03aa28a708cfef10006b58a1f74ee24eb5b6fc6feb5a80dad5`；`windows/sync.c` 为 `edf06c948cce62563b987db873e51a0c8cf0149f73afc0da9afd556b1e22e6cf`。兼容细节见同目录 `c0-06-compatibility.md`。

## 最终结果与计数

| 范围 | GitHub run / attempt | 源提交 | 真实结果 |
| --- | --- | --- | --- |
| C006 主矩阵 | 45170150079 / 1 | 1b9c41fb… | Node 59/59、native 18/18、Android 6/6；合计 83/83 |
| Android 内部迁移死亡 | 45170150057 / 1 | 同上 | A26/A30，2/2 |
| 初始 snapshot 与真实编辑 CAS | 45170150092 / 1 | 同上 | B42–B45，4/4 |
| 原项目基线 | 45170150066 / 1 | 同上 | JS 121/121；Windows build/self/advanced/feedback 成功；Android unsigned build/host Java assertions 成功 |
| 完整协议矩阵 | 45170150060 / 1 | 同上 | 936 唯一执行、936 唯一比较、702 producer lineage 均通过并独立核对 |
| C005 DPAPI | 45168648612 / 1 | 32e21eb69764dfa99227439b7727f0553205e5ca | 22/22；通过云端逐字节相同证明关联最终源码 |
| 采集 helper 定向验证 | 45169951082 / 1 | 8ce0a047ec14925e08072129e4fd13b372e2e084 | 10/10；helper 与最终源逐字节相同 |

各行的计数单位不同，分别保留。C006 的 59/18/6 是实际执行的场景结果行，不代表三个平台都运行了所有组合；Windows 基线的 32 self checks、48 advanced checks、48 detail-key checks、21 feedback checks，以及 Android 的 73/47/20 host assertions，不并入 JS 121。基线的 13/11/19 个 executor step 也不是业务测试数。

DPAPI 使用真实 Windows `CryptProtectData/CryptUnprotectData`，覆盖 C↔Node ASCII/Unicode、旧 UTF-16/PowerShell、空密码保留、畸形/截断/损坏/空输入和共享读取拒绝。其直接执行源是 32e，不能改写成 1b9。云端 `c006-baseline-qualified.json` 证明 `windows/sync.c`、`windows/credential-helper.c`、`src/sync-server.mjs` 从 32e 到 1b9 字节相同；两份 Android 采集 helper 同样相同。该文件 SHA256 为 `a994a259a2551ebc0a1481b02e86ffc4585e51043dd3e31d75cbdaadfb0373c7`。

## 真实故障边界和恢复

Node C006-24/25/26/29/30/31 分别在实际 backup PUT、fence PUT、import commit、manifest PUT、fresh takeover 和 batch PUT 边界到达 gate 后 SIGKILL；死亡 PID 为 4192、4297、4461、4600、4697、4745，均 `killed=true`、非 timeout，后续不同进程重试/接管/观察通过。native C006-30 强杀的是 JS producer PID 8108，再由 native init/sync 接管，不是 native 自身强杀恢复。

Android 主矩阵有 24 份最终操作输出，expected/actual acceptance 匹配，same-db restart comparison、实体/元数据审计与 SQLite integrity_check 通过。A06 是 fence 写后断连，A27 是 manifest 写前 500，A28 是 manifest 写后断连；A19 拒绝非法 guard，五个读取、零 PUT。普通操作间重启不扩写为任意内部边界的突然死亡。

独立 Android 强杀 A26：导入完成后 PID 4097 死亡；自然 pidof 已无进程之后采集，未在该间隙用 force-stop 制造死亡。原 dbCase/path、actor 与六条原始 rows/outbox 保持，reopen PID 4668，实际等待 103885ms 后由 PID 6613 继续，原事件进入对应 epoch/device 批次并排空 outbox，fresh observer 收敛。A30：manifest 完成后 PID 7345 死亡，原库隔离；新 observer PID 7739 使用新 actor/库、seq=0、queue=0，只 GET manifest 和 snapshot 即恢复五条旧记录，`heads:{}` 且无 batch。snapshot 为 `v2/s-d534d175-4d27-4570-80a0-9c63d5891708-0.json.gz`，解压内容 SHA256 `245bcc822ca9cd72545faab185f695bbdaebb41a71778395b3d40c2d9c317503`。

强杀证据 11 次导出、44 份文件收据包含 11 个主 SQLite、4 个存在的 WAL/SHM、29 个经有效探测确认缺失项；before/transfer/after 与 cloud readback/manifest 一致。停止进程后的逐文件拷贝不构成跨文件原子快照，也不证明断电/fsync 耐久性。仓库内完整审计见 `../audit/final-kill-evidence-review.md`。

B42/B43 的故障真实命中（各 seen=2、used=1），首个 sync 拒绝，重试及 fresh observer 通过。B44 在 snapshot PUT 返回 201 后实际 SIGKILL PID 2249，之后独立审计和恢复通过。B45 在 PID 2365 提交前由真正的第二进程编辑 PID 2377 完成更新，原始 commitTrace 出现一次 `outcome.ok=false`，随后重读恢复通过，未以伪造 CAS 返回值代替。

## 首崩与重试限定

主矩阵 A27 的 observer `output-5.json` 在 restart attempt 1 首崩，无有效 atomic result；同 dbCase `C006-A27-manifest-fail-observer` 后续比较通过，最终 PID 9526→10264。新 helper 留存 SQLite 40960B、WAL 0B、SHM 32768B 与 atomic-result.new 0B，before/transfer/after、seal 与 inventory 一致。收据的语义是诊断 force-stop 后原件，`originalDatabaseReplayed=false`；没有证明精确 crash-time 事务状态，现有记录也未确立根因。

最终协议矩阵的独立审计核对了 936 个唯一执行结果、936 个唯一比较及 702 条 producer lineage，实际集合与 78 cases ×（3 平台生成 + 3 来源 × 3 接收平台）相等；各 result 哈希和同名 exit0 命令匹配。比较排除跨平台 revision、dataRevision、settings、lease、cachedManifest；actualPublishAckFault 尚未执行，属于 C007。312 份 Android receipt 有三次首崩：

| case / stage | 后续结果 | 原现场资格 |
| --- | --- | --- |
| key-swapped--receive--android--javascript / main | 新 `-retry-2` dbCase 通过 | partial；七个探测文件 missing，未保存原 DB；不能据此断言历史上未建库 |
| actor-invalid-punctuation--receive--android--android / main | 新 `-retry-2` dbCase 通过 | 原 SQLite/WAL/SHM 逐文件有效留存，但未用原库证明恢复 |
| id-ascii-201--generate--android / restart | 同 dbCase/path 重启，状态比较通过 | 原 SQLite 40960B 有效留存；采集器未重放副本 |

三个 instrument 都记录 `Process crashed.` / code 0；exit-info 有 harness `DEPENDENCY DIED` 和 GMS FontsProvider 依赖死亡描述。该诊断线索不等于已证明所有崩溃的产品根因。三份 failureEvidence 引用、50 份 observation 日志、25 个 nonce 六字段回执全部复核匹配，四个保存文件的 before/transfer/after 长度哈希及 cloud readback 一致。各场景均在诊断 force-stop 后取证，不能把新库重试成功写成原库恢复，也不能把最终通过写成零崩溃。仓库内详见 `../audit/final-matrix-evidence-review.md`。

## 封存资格

| 运行 | 已复核本地文本 | 原收集状态与资格 |
| --- | ---: | --- |
| core 45170150079 | 2626/2626，37511539B | exit 1 / incomplete；唯一原因是 **24** 个合成凭据 fixture 排除；3136 seal rows 含环境重叠 |
| kill 45170150057 | 156/156，2133964B | exit 0 / complete；producer 773 行，collector 含环境 859 行 |
| bootstrap 45170150092 | 110/110，7888448B | exit 0 / complete；121 producer rows |
| baseline 45170150066 | 122/122，397201B | exit 1 / incomplete；五个 artifact 没有递归 producer seal |
| DPAPI 45168648612 | 19/19，67010B | exit 0 / complete；12 producer rows |
| helper 45169951082 | 147/147，467151B | exit 0 / complete；240 producer rows |
| matrix 45170150060 | 13437/13437，109522111B | exit 0 / complete；15604 producer rows=13409 本地文本+2195 云端文件 |

核心 24 个 `sync-config.enc` 仅在云端，均有 producer/inventory 相同大小与哈希，明确 excluded 且本地不存在；未读取或解密。其比旧 20 项增加了 C006-09/10/11/14 的 native observer 配置，不能沿用旧数。合成来源由 native harness 源码及 Windows CRLF build hash 证明。原 exit 1 和 incomplete 均保留。

基线采用内嵌 run/artifact receipts，四个主要构建产物的实际云端字节已再次重哈希并匹配原收据；这补强命名产物关联，不补造递归 seal。原缺失五个 seal 的收据保持不变。原始 EXE/APK/SQLite、WAL/SHM、快照压缩文件等云端二进制未在本地打开或重新执行。本地文本哈希一致不替代产品行为测试。

## 红测历史与排除范围

历史 core `45161953954@bdfa69a6…` 为 83/51/32；Android 六行受导出审计契约阻断。契约修正后的 `45164223526@1fd53ce3…` 为 83/55/28（Node 59/49/10、native 18/2/16、Android 6/4/2）。旧强杀 `45164373911@a7e309e5…` 为 2/1/1，但缺少后来新增的远端哈希与边车保证。可靠采集红测 `45168301803@25a2b080…` 仍为 2/1/1，A30 snapshot null 导致 observer 漏旧记录；32e 的 `45168648558` 才变为 2/2。

bootstrap 红测 `45166586294@40b0d84c…` 为 4/0/4：B42/B43 未请求 snapshot、故障未命中，B44 gate 未到且未杀，B45 并发墓碑被复活。32e 的 `45168648596` 四项通过，但同源基线 `45168648565` JS 120/121，保留新设备不应 GET 旧 batch 的失败断言；最终 1b9 修订后 121/121。helper 旧 `45168051257` 虽报告 10/10，缺 root seal，后续新 `45169951082` 才提供完整封存。所有旧失败、缺失现场、收集收据均保留，后续通过不追溯修复它们。

本报告不声称真实坚果云/用户私有账户验收、native C 自身强杀恢复、全部 Android 内部边界、全平台笛卡尔积、断电安全或发布 APK 的安装升级验证。基线 APK unsigned，harness APK 是测试包。既存损坏的空历史 manifest 不自动修复；C007 SQL 错误传播与 D1 不在本次关闭范围。
