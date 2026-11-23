# C0-03 三端共同协议测试报告

日期：2026-11-23，Asia/Shanghai。**C0-03 未通过，阶段0仍未通过，D1未开始。** 本轮已经建立并在GitHub实际执行共同生产协议向量；发现的生产差异保留给C0-04，不修改协议以消除失败。Android测试APK已真实编译，但缺系统镜像，真实SQLite/WebView执行为blocked。

## 1. 提交、触发和执行身份

业务分支master，默认空main未更改。本轮初始HEAD为5461714fb316ae8ad8c01b6fa0d521f72d324fd9，工作区与origin/master一致且干净。每个提交前后均按文件白名单检查，命令及真实退出码留存。用户本机不是Git仓库；没有本机项目构建、测试、SDK/Gradle缓存或应用打包。

| 独立边界 | 提交SHA | 修改文件及原因 |
|---|---|---|
| CI触发规则 | `6de5f70df3f3f2b701723e77cd30c8885543408c` | `.github/workflows/phase0-baseline.yml`；将C0源码、测试、夹具及执行器加入master push路径，新增只读Android运行环境清单 |
| 共同向量 | `bd4184dcf61e0a1bafdb56bc1e85873324cf414a` | `tests/protocol-vectors/{suite.json,README.md}`；唯一72例套件，依据现有v2文档和实现 |
| Windows适配 | `9b1e731ff16490d020e0c6a55056fd0cabd4a4e0` | `tests/protocol-harness/{windows-protocol.c,build-windows-protocol.mjs,windows-adapter-notes.md}`；真实C数据库及私有同步入口 |
| JS适配 | `47df742a3d59e0fa4a021c39defdce2b0e9c0be6` | `tests/protocol-harness/{shared-executor.mjs,js-harness.mjs,fixture-server.mjs,js-adapter-design.md}`；真实node:sqlite及原同步函数、磁盘HTTP字节夹具 |
| Android适配 | `f1b1b1b048f7426e9eb7505df2af5e87146c9311` | `tests/protocol-harness/android/**`，10个文件；独立测试APK、生产Java存储桥、进程重启和数据库导出入口 |
| 集成执行及比较 | `1403b316eb6b3a7baf4942de537e274e7fb0d1a2` | `.github/workflows/c0-03-protocol.yml`、`scripts/ci/{c0-03.ps1,c003-smoke.ps1}`、`tests/protocol-harness/{run-matrix.mjs,compare-results.mjs}`；同SHA共同矩阵及各适配提交自己的独立测试 |

入口实际run：[45111239771](https://github.com/johny751/MyTodo/actions/runs/45111239771)。只修改tests目录的向量提交实际触发：[45112960551](https://github.com/johny751/MyTodo/actions/runs/45112960551)，success。这证明tests路径生效，不假定main有workflow_dispatch。

首次共同矩阵run：[45112980707](https://github.com/johny751/MyTodo/actions/runs/45112980707)，attempt1，完整被测源码1403b316eb6b3a7baf4942de537e274e7fb0d1a2，Actions conclusion=failure，矩阵真实退出1。独立job分别检出C/JS/Android适配提交自己的完整SHA；C及JS基础生成、接收、重启命令退出0；Android编译退出0，但真实存储环境blocked使wrapper退出78。

同集成SHA的原三端回归run：[45112980701](https://github.com/johny751/MyTodo/actions/runs/45112980701)，success。C/JS/Android中间push的原基线run45112964825、45112970652、45112975779被GitHub待执行并发队列替换，实际cancelled，不能记为通过；对应适配仍由45112980707的独立job真实测试。

## 2. 唯一共同套件和判定

72例覆盖A/a及ASCII actor排序、标点/Unicode/UTF-8与ID长度、key数量/顺序/类型、context、seq/clock/manifest/cursor整数边界、重复/乱序/缺批次、字段冲突/墓碑/迟到事件、快照及片段恢复、持久vector/clock/cursor/outbox/pending、真实SQL失败和无效输入。

`passed`=对应真实执行及其限定检查通过；`failed`=真实执行失败、状态不满足安全检查或跨端差异；`blocked`=具体环境或生产API范围无法执行；`skipped`=明确未执行；`static-reviewed`=仅源码审查。套件中的observation案例只记录真实接受/拒绝；其单端passed不能表示非法输入获协议许可。event.seq稀疏保留与batch.index缺失分开，缺中间批次调用原pull。

[72例逐项结果](protocol-case-results.md)及JSON逐格标明C生成、JS生成、C接C、JS接C、C接JS、JS接JS和Android状态。负例来自明确的合成非法字节，不能声称是合法producer生成。正例的事件/记录来自生产outbox/数据库，接收方不独立模拟合并。

## 3. 三端真实路径和测试seam

Windows：原`windows/database.c`的db_open/local/remote/meta/page/outbox/close及SQLite；原`windows/sync.c`的manifest/prepare/checkpoint/pull/request、gzip、哈希和ETag。临时翻译单元只在测试副本将一处WINHTTP_FLAG_SECURE改为0，以实际WinHTTP连严格限定的127.0.0.1字节夹具。原文件/副本SHA及替换次数单列，原生产文件不改。这不属于LAN开发，也不代表真实坚果云/TLS认证联调。

JS：原`src/sqlite-store.mjs:createSQLiteStore`、`src/replica.mjs`及`src/delta-sync.mjs`。私有函数通过原字节末尾追加export访问，函数体不改；实际fetch、磁盘gzip/强ETag文件、真实第二SQLite连接trigger注入SQL失败。生产读API完整分页，实际COUNT和integrity检查避免outbox上限隐藏数据。真实关闭重开及新Node进程report。

Android：共享生产replica/delta逻辑→测试壳存储桥→原`AccountStore.sync(op=replica)`→原`ReplicaDatabase.invoke`→Android SQLite。生产Java直接编入独立applicationId `local.gxtodo.protocolharness`，不覆盖正式签名/用户数据。反射只用于fresh空测试库actor、真实连接关闭/重开、SQL trigger及raw审计。已提供force-stop/relaunch和关闭后SQLite文件导出，但本轮因环境blocked没有实际执行这些步骤。固定HTTPS的SyncStore仅由fixture HTTP测试传输壳接入合成字节，不替换业务合并算法，不宣称生产WebDAV认证通过。

## 4. 两次实际结果（相同计数）

| 实际结果范围 | passed | failed | blocked | 说明 |
|---|---:|---:|---:|---|
| Windows C生成/接收操作及持久验证 | 208 | 2 | 6 | 72生成、144接收；6项为C direct db_remote的int参数无法表示，未截断或伪执行 |
| JS生成/接收操作及持久验证 | 216 | 0 | 0 | 单端操作通过不代表与C一致 |
| Android矩阵位置 | 0 | 0 | 216 | 全为环境占位，没有真实Android存储执行，processExitCode=null |
| C/JS同输入比较 | 178 | 32 | 6 | 72生成比较+两来源各72接收比较；32项归为16个案例 |
| 包含Android的比较位置 | 0 | 0 | 432 | 未取得Android实际producer/receiver样本 |

两项C失败为两来源的snapshot-cursor-unsafe：进程退出0、observation适配自报passed，外部实际状态检查判failed；不能用exit0或CI绿色取代安全判定。三项C API边界是cursor-int32-plus-one/max-safe/unsafe，分别两来源blocked；这与Android缺镜像的环境blocked分开。

失败输入和SQL meta UPDATE/第二快照片段INSERT的before/after/reopened、真实SQLite触发器错误及进程记录均在原始结果中。当前SQL回滚及失败pull对pending/outbox的限定保全已执行；实际publish/ACK完整故障路径未执行，不能扩大为“所有失败都无提前ACK”。

## 5. 已动态复现的16项差异

| 案例/组 | Windows C真实结果 | JS真实结果 | 影响 |
|---|---|---|---|
| reversed-events | record seq `[2,1]` | `[1,2]` | 仅保留事件顺序；两端body=second |
| independent-fields | record actor `[A,a]` | `[a,A]` | 仅事件顺序；body/color相同 |
| tombstone-late-old | seq `[2,1]` | `[1,2]` | 墓碑均true，无复活；仅事件顺序 |
| actor-A-a | body=lower | body=upper | 字段赢家/候选次序不同 |
| actor-A-a-reverse | body=lower | body=upper | 两端record顺序均[a,A]，仍选出不同赢家 |
| actor-hyphen-ascii | a-胜出，值4 | A0胜出，值2 | 比较规则、赢家及事件顺序不同 |
| tombstone-concurrent-edit | 冲突title=late edit | title=probe | 墓碑/字段值一致，仅冲突展示标题不同 |
| id-ascii-201 | 接受并保存201字ID | 拒绝 | C实际strlen上限800，JS UTF-16 length上限200；接受侧推进vector/clock/cursor |
| key-three-items | 拒绝 | 接受并保留三项key | key数量规则不一致 |
| context-number=7 | 拒绝 | 接受、context=7持久化 | context类型规则不一致 |
| manifest-unsafe | 接受2^53 head | 拒绝 | 此项仅解析测试，数据库未变，不能称已推进cursor |
| manifest-heads-array | 拒绝heads=[] | 接受 | 容器类型不一致 |
| manifest-empty-actor | 接受空actor head | 拒绝 | actor合法性不一致 |
| manifest-empty-epoch | 拒绝空epoch | 接受 | epoch合法性不一致 |
| prepare-int32-overflow | pending.index=-2147483648，负路径 | index=2147483648，正路径 | 两端outbox仍1；错误pending在重启后保留，不是JSON键顺序问题 |
| snapshot-cursor-unsafe | 两片GET200后保存2^53 cursor，随后负批次GET404、pull失败 | 保存同一非法cursor，pull返回成功 | 两端缺cursor校验；C再发生int转换，失败时非法进度已持久化 |

每案例用C和JS各一来源重复，形成32项比较失败。原record.events、字段版本、conflict候选顺序与墓碑没有在导出时重新排序掩盖。快照最后一项没有SQL故障注入，不能称为“SQL失败提前ACK”；已证实的是未校验的快照进度及C整数转换错误。

## 6. 环境、命令和证据

runner Windows/X64，ImageOS=win25-vs2026，ImageVersion=20261116.315.1；Node v22.23.5，node:sqlite 3.54.1。JDK Temurin17.0.21+9，API34及build-tools35.0.0；编译器路径/文件版本/SHA和各工具-version原输出在workflow/build收据中。原C builder不单独传播内部cl数字退出码，保存真实子Node构建器码和原编译输出，不把Node1编造为cl1。

实际入口：`scripts/ci/c0-03.ps1`→`node tests/protocol-harness/run-matrix.mjs --output RUNNER_TEMP/c003-matrix`。每例命令为`windows-protocol.exe`或`node tests/protocol-harness/js-harness.mjs`的generate/receive/report，携带共同suite、case、独立数据库、输出、真实producer样本与loopback origin。完整argv/stdout/stderr/exit/signal均记录。Android实际编译命令为`node tests/protocol-harness/android/build-android.mjs --output-dir ...`；未运行Android存储命令。

Android清单：emulatorExists=true、adbExists=true、systemImages=[]，没有booted serial/WebView。未下载镜像、不在本机补测。测试APK可编译不代表可安装产品或真实SQLite通过。后续在具备已授权镜像和WebView的GitHub runner启动测试emulator，再传明确serial执行同一72例及跨端矩阵；当前保持blocked。

首次产物：C测试EXE SHA256 `b4de0473622d491e797f8a644904e5042ebd01beb3bdd8a56de4057849195ca0`；独立测试APK `452a41f9682bb8ba7af7df3da96be161d85c1038bf0f9a6d769a4872bf749408`。所有应用/数据库二进制留GitHub；本机仅下载3,786,781字节纯文本证据ZIP，SHA256 `b3ae2f78990cefabd8aef72a7f00059779856d0e2982cf759485270149e1ca20`。

首次证据核对保留四项失败：upload-artifact默认遗漏隐藏的Android测试适配资产（主/独立两个产物），内部hash在stdout还写入时计算导致旧digest。此为证据工具问题，32项协议差异的已核验原始result不受影响。独立修复只启用隔离测试目录隐藏文件上传及把stdout交给进程退出后的外层manifest计算，不改向量/算法/期望。提交前CRLF触发git diff --check退出2，未提交；仅将两份已拥有的staged文件换为LF后恢复，原失败日志保留。

证据修复提交 `d5559d3cdd27907b9dc1805ec7e5b5056abcfabb`；第二次run [45116193790](https://github.com/johny751/MyTodo/actions/runs/45116193790)，attempt1，同SHA原回归 [45116193804](https://github.com/johny751/MyTodo/actions/runs/45116193804) success。第二次矩阵仍为failed/exit1：424 passed、2 failed、222 blocked位置；比较178 passed、32 failed、438 blocked。32项失败集合与首次完全相同，没有削弱测试。8813条payload digest全部核对匹配；C测试EXE SHA256 `b84a1a97ca28e66a1b7f123111a3138d7529319bea338acc16214186ae08dd3d`，测试APK `5422d80770f70a9897a0cd05b859ef0417da025b316a37bae6816c1420087934`。第二次纯文本ZIP 3,810,194字节，SHA256 `44ba312e3656dc0413fa4fc46f08fafc8ab8214130d83a7fd392055388d270f8`。两次原日志、真实退出、产物metadata/digest、source SHA、raw/reopened和submission失败/恢复记录均保留。Actions artifact保留14天，本地纯文本留档长期保存；不能声称GitHub artifact永久可用。

## 7. 收据缺口和下一步独立计划

原schema没有独立接收收据表或按目标投递账本。当前meta.cursors/pending/outbox可审计，但不能冒充未来双通道receipt。真实publish/ACK的SQL/COMMIT故障、ACK丢失及崩溃边界为skipped，本轮未实现；不改旧全局ACK，不开发LAN/配对。

| 顺序 | 文件范围 | 独立实现与验收 |
|---|---|---|
| 补齐Android运行环境 | C0-03测试runner/脚本，原Java不擅改 | 已授权的GitHub镜像/API/ABI/WebView/SQLite版本记录，真实生成、跨端接收、重开、进程重启、数据库导出；缺环境保持blocked |
| C0-04 | `windows/database.c`、`windows/sync.c`、`src/replica.mjs`、`src/delta-sync.mjs`及共同向量 | 先确定一致actor比较、事件排序、完成实体投影后的冲突title、UTF-8/UTF-16/ID及key/context规则，再安全整数heads/cursor/pending校验；同72例三端重跑，失败不丢outbox/进度 |
| C0-05 | `windows/sync.c`、`windows/credential-helper.c`、`src/sync-server.mjs`及合成凭据夹具 | 同一Windows runner identity真实C写→Node读/Node写→C读，旧DPAPI/新前缀、Unicode、损坏/截断格式；不使用真实账号、不得记录密码/token |
| C0-06 | `windows/sync.c`、`src/delta-sync.mjs`及磁盘fence夹具 | 实际旧state备份、条件fence写入、guard.backup恢复与manifest发布中断；C/JS真实路径一致，不把快照测试冒充旧云迁移 |
| C0-07 | `windows/database.c`、`windows/sync.c`及共同SQL fault入口 | prepare/step/read/meta/COMMIT错误传播；真实publish/ACK各边界失败与重启恢复。读失败不能当空数据，未成功COMMIT不得ACK/推进cursor，失败发送确认保留原批次 |

各任务单独提交、相关GitHub实测，主Agent串行审查共享接口。完成C0-03三端门槛及C0-04–07后，才按09-phase-one-entry-plan进入D1：明确列名→一致备份/恢复→编号迁移/checksum→事务/失败恢复→保全actor/seq/clock/queue/vector/cursors/outbox/pending/墓碑/冲突→三端旧数据迁移及T15/T16。业务/UI、LAN、D1及T01–T16完整验收均未开始。