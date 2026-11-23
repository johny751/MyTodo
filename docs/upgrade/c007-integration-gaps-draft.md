# C007 集成条件和剩余边界

2026-11-23，仅本地文本草稿，无执行结论。

## 源码基线

此草稿由旧 C004 快照形状编写，集成时必须读取 C005/C006 最终 SHA。所有适配采用精确一次/明确次数匹配；不匹配就停止审查，不能模糊替换。C include 的 windows-protocol.c 必须是带 C004 安全整数修复的当前版本。构建收据记录源/副本哈希。

## GitHub 集成命令（未执行）

先关闭 C006 并提交 `tests/c006/c006-harness/fixture-server.mjs`；Android 独立 observation patch 的 `tests/protocol-harness/android/remote-file-evidence.mjs` 和 `run-android.mjs` 也须先独立落入仓库。其本地来源为 `work/android-observation-fix/`，不是 C007 生产修复。随后在独立 C007 测试提交复制 `tests/fault-harness/`，将本目录 `c0-07-fault-recovery.yml` 放到 `.github/workflows/c0-07-fault-recovery.yml`。工作流已接实际三端 suite/controller，checkout 固定 `EXPECTED_SOURCE_SHA`，使用已有 Node SQLite 版本和预装编译器；push 触发和冻结源码扫描均覆盖 Android helper/runner 依赖。

```text
node tests/fault-harness/build-c007-windows.mjs <RUNNER_TEMP>/c007-worker.exe
node tests/fault-harness/run-c007-suite.mjs --platform windows-c --windows-exe <RUNNER_TEMP>/c007-worker.exe --output <RUNNER_TEMP>/c007-windows
node tests/fault-harness/run-c007-suite.mjs --platform javascript --output <RUNNER_TEMP>/c007-js

node tests/fault-harness/android/prepare-c007-android.mjs <RUNNER_TEMP>/c007-android-shell
node <RUNNER_TEMP>/c007-android-shell/build-android.mjs --root <CHECKOUT> --output-dir <RUNNER_TEMP>/c007-android-build
node tests/protocol-harness/android/run-android.mjs --apk <RUNNER_TEMP>/c007-android-build/mytodo-c003-test.apk --serial emulator-5554 --output <RUNNER_TEMP>/c007-prepared.json --prepare
node tests/fault-harness/run-c007-suite.mjs --platform android --apk <RUNNER_TEMP>/c007-android-build/mytodo-c003-test.apk --prepared <RUNNER_TEMP>/c007-prepared.json.receipt.json --serial emulator-5554 --output <RUNNER_TEMP>/c007-android
```

Windows C/Node/Android 各自独立新 fixture 目录。Android 只复用原 runner 的 `--prepare` 安装路径；实际场景完全由 C007 独立 worker 执行，不调用旧 main/restart crash-retry。不要在 C007 case 中卸载或重新安装 APK。

独立 workflow 已提供，always 上传三平台完整 suite 目录、构建/准备收据、原始失败和源清单；report 校验同 run/attempt/source SHA、文件 hash、三端各10场景及逐条断言。Android 模拟器直接复用当前 C004 脚本，官方 Google image 与 Ubuntu libpulse0 的授权范围未扩大。后续整套 C003/C004 三端回归不由此30场景取代。

## 真实机制与诚实边界

- C 写事务 COMMIT 故障来自 SQLite commit_hook 拒绝；只读事务及指定同步边界使用 SQLITE_TRANSACTION COMMIT authorizer 一次拒绝，后文说明命中条件。Node/Android 来自真正 deferred FOREIGN KEY 约束在 COMMIT/endTransaction 失败；不是磁盘 I/O 故障。三端均已补本地事务和 ACK COMMIT 前强退草稿。
- Node 的观察点是测试 store 副本中原 `db.exec('COMMIT')` 前的同步 callback；Android 的观察点是测试 ReplicaDatabase 副本里 `setTransactionSuccessful` 返回后、`finally` 中原 `endTransaction` 前的 callback。它们保留生产 SQL、事务顺序及正常返回，仅在指定 case 读取该连接未提交状态、写 marker 并终止。原文件不被写；构建记录原/副本 SHA。此边界证明数据库 API 调用前中止，不声称在 SQLite 内部 fsync 的某条机器指令处中止，也不模拟断电。
- 生产 C prepare/step 读错误可能仍返回 null/空/部分数组。原 adapter 行为保留，expected 是 rejected，出现 accepted=true 必须红测并单独修生产。C SQL_CONFIG_LOG 只观察真实 SQLite callback，须云端确认当前编译配置启用；日志不存在也不编造错误。
- Android 源码仅在 `insertWithOnConflict` 返回 -1 时抛普通“保存任务行失败”；不能据此推断该 API 吞掉 SQLiteException。先保留真实 native exception class/message/stack，以云端故障结果核实实际传播。当前 requireSqlError 仍要求 SQLite 原生异常；若实际出现普通异常，保留失败并诊断，不能删断言。此前“API 可能吞异常”的猜测不作为生产修改依据。
- Android deferred FK 场景要求 native exception 为 SQLite 子类且 stack 含 `SQLiteSession.endTransaction` 或 `SQLiteDatabase.endTransaction`。触发器安装成功本身不计入故障命中。
- Android helper 使用 persistent view/trigger，确保 WAL 连接池均可见；仍需云端实测。view 恢复用进程内 viewTable，目前读 schema 故障不与中途 kill 混合。若意外崩溃恰逢 view 未恢复，先保全原库/schema，不能让生产构造器自动创建替代空表后伪称恢复。
- 云服务实际落磁盘再 rename，after-write disconnect 证明此次文件可读而响应丢失。没有 fsync/目录同步，不声称断电持久化。HTTP close/reopen 是同测试进程中新 listener 实例打开同目录，不冒充服务进程崩溃；客户端每次为真正新进程。
- 父 controller timeout 后 TERM/KILL 并等待 worker close。Android worker 单个 ADB 超时会停止并确认 app 死亡再取证；若 wrapper 被外层硬杀而尚未确认，缺失证据使 case 失败，不继续重开这个 case、不换库。Windows没有额外子进程，Node worker 无长期子进程。
- 原始复制文件不参与恢复算法；客户端始终重开原生产数据库。Android 原库在 app-private 固定 dbCase，宿主 dbDir 只是证据分组；控制器另检设备实际路径与新 PID。
- Android 原库导出通过独立 `remote-file-evidence.mjs`，核验每次唯一 nonce、设备前后大小/哈希、本地字节/哈希/回读和主库 SQLite 文件头；主库缺失、任何收据或哈希不一致均失败并保留 inventory。缺失的可选 WAL/SHM/journal 与有效复制明确区分，不能把零字节成功输出当作有效原库。helper 的云端验证属于独立 observation patch，C007 仍须验证其在本故障场景中的实际调用。
- 路径限制采用 RUNNER_TEMP 相对路径/唯一新目录；仍应使用无用户数据、无 junction 的 CI workspace。没有对任意宿主文件或物理设备开放权限。

## 已关闭的旧缺口

已补独立三端 workflow、真实网络编排、Android 薄入口/独立控制器、Node/Android COMMIT 前观察点、完整 meta revision/lease 比较、readErrors 检查、pre/post-reopen bytes、整目录 inventory、提交前/后精确事务状态校验、source/run/attempt/PID/设备路径身份核验。全部仍需云端编译执行，不将“文件已写”表述为“测试已通过”。

2026-11-23 静态审查修订：C worker 的 page/outbox accepted 由真实返回值决定（NULL 为失败，空数组为成功）；控制器对 C 每次正常返回及重开审计明确断言 `autocommitAfterOperation === true`。Android kill worker 必须在 force-stop 清理前确认被观察的原生进程自然消失，记录原 PID 和完整 ADB 轮询收据；清理导致的死亡不能替代预期边界 kill。以上均为测试草稿修订，未执行。

第二次静态修订将 Windows SQL 子步骤扩为 31，Node/Android 保持 10，各平台另有 9×5 个网络步骤。读故障由真实 SQLite authorizer/TEMP view 产生；只读事务的 COMMIT 使用 SQLITE_TRANSACTION authorizer 一次拒绝，因为 commit_hook 不保证在无写事务上调用。已有 pending 和空 outbox 的 COMMIT 失败因此不依赖假定 hook 命中。

cache/release 完整同步场景在 baseline 前用合成配置准备固定原库，清空 fixture lease/cache，并记录完整 before。生产 sync_run 测试副本只通过唯一锚点把 WinHTTP 主机/端口映射为预先验证的 loopback origin；原生产 SQL 和调用顺序保留。TEMP metadata trigger 接收 OLD/NEW JSON，仅观察本次 lease acquire token 和 cache-null→object/本次 lease→null 转换，再令随后真正 COMMIT 的 authorizer 拒绝一次。控制器检查 native SQL 错误和首错文字、阶段/token、autocommit、真实 GET、无 PUT、原库重开及明确的 cache/lease 状态。网络或准备失败保持失败，不能以 trigger 安装成功代替命中。
