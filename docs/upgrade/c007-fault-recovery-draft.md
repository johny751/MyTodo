# C0-07 独立测试草稿

2026-11-23（Asia/Shanghai）。只做本地文本编辑和人工静态阅读，**未运行、未编译、未语法测试、未提交、未联网，不是 C0-07 通过证据**。生产源码修复、C0-05 与 C0-06 分开。

## 文件与覆盖意图

- `tests/fault-harness/c007-js-worker.mjs` 调用真实 Node SQLite 生产 store、真实 replica 和原 delta 私有符号导出。测试副本暴露 SQLite handle，并在原 COMMIT 语句前增加同步观察回调。真实 trigger/prepare/step/deferred FK 故障、COMMIT 前退出和 ACK 返回后退出。
- `c007-windows-worker.c` include 当前 C003/C004 harness 和生产 sync，实现真实 db_local/db_remote/prepare/publish/ack 调用。authorizer、trigger、overflow、commit hook 拒绝和 COMMIT 前强退。SQL 日志回调保留生产 rollback/finalize 前产生的真实 SQLite 错误；不是模拟错误码。
- `build-c007-windows.mjs` 复用原云端 builder；三个 harness 路径改向 C007，并在临时 sync 副本中把 publish 的两次 ACK 调用转至观察 wrapper。进入真实 ACK 前才启用 COMMIT 故障，避免误命中 HTTP 租约事务；返回成功后才写提交后标记/退出。原 ACK 函数体完全保留，副本哈希保留。
- `android/prepare-c007-android.mjs` 复制/适配测试壳到 RUNNER_TEMP，加入真实 SQLite fault 控制、native exception class/message/stack、ACK 返回后同步写 marker + kill。另生成 ReplicaDatabase 测试源码副本：原 SQL 不变，在 setTransactionSuccessful 返回后、原 endTransaction 调用前增加 C007CommitObserver；记录真实未提交数据后 kill。仓库生产文件保持原样，副本修改和构建映射记录独立哈希。
- `android/c007-android-worker.mjs` 只在 GitHub 云模拟器使用。要求同 run/attempt/serial/APK hash/source SHA 的成功安装收据；固定 dbCase、每步唯一 request/result 名；没有随机崩溃重试或换库。先观察 exit-info，再确认进程退出，复制原 SQLite/WAL/SHM/journal，最后允许另一进程审计。原库导出调用独立 observation patch 的 `tests/protocol-harness/android/remote-file-evidence.mjs`，逐文件核验 nonce 收据、设备端前后大小/哈希、本地字节/哈希/回读和 SQLite 主库文件头；主库缺失或校验失败即失败，保留完整 inventory。
- `c007-same-db-controller.mjs` 三端统一断言控制器；Android 使用上述真实 APK/ADB worker，不替换为 Node store。保存 pre/post-reopen bytes、原日志/退出码、HTTP trace、云文件原始 gzip bytes/ETag、目录 SHA256 inventory。所有 revision/lease/meta/rows/outbox 都参与原子性比较；审计 readErrors 非空直接失败。ACK 强退校验精确预期事务结果，确保只删除 through 以内条目。

Windows SQL 场景现有 31 个实际子步骤；Node 和 Android 各 10 个。Windows 新增 row/page/meta 的 prepare/step/非法 JSON 读取、local/remote 合并时读失败、已有 pending/空 outbox 的 COMMIT 拒绝、真实 request→renew COMMIT 拒绝，以及完整 sync_run 的 cachedManifest/lease-release COMMIT 拒绝。最后两项仅按明确白名单排除正常 revision/lease/cache 变化后比较业务状态，完整原始 meta 始终保存，并另断言 cache/lease/token 的实际结果。30 个顶层场景共规划 186 次 operation attempt：Windows 76，Node/Android 各 55；每次另有固定原库重开观察，仍未执行。
- `make-c007-scenario.mjs` 生成 SQL/meta/第二条写入/COMMIT/prepare/step 故障和三端本地事务 COMMIT 前强退。
- `make-c007-network-scenarios.mjs` 生成 9 个场景：batch 拒绝、batch 响应丢失、manifest 拒绝、manifest 响应丢失、ACK delete/meta/commit 失败、ACK COMMIT 前退出、ACK 成功后退出。每个先保存 pending，再加入 later-event；失败后重启客户端、重开同目录 HTTP 服务并继续发布，检查 pending 原文、不重复批次、later-event 保留。
- `run-c007-suite.mjs` 顺序运行 1 个 SQL 场景与 9 个网络场景；单 case 失败继续后续，保留全部结果。
- `c007-evidence.mjs` 核验冻结源码及同 checkout 的 C006 fixture、封存文件与源未改动证据、汇总三端30场景和原始失败断言。
- `c0-07-fault-recovery.yml` 是独立工作流草稿，集成到 `.github/workflows/c0-07-fault-recovery.yml`。三端真实执行 controller，Android 复用 C004 emulator 脚本及既定官方依赖范围，always 上传完整证据。

网络服务复用 C006 的 `tests/c006/c006-harness/fixture-server.mjs`。必须先以独立 C006 提交落入仓库，不修改该服务，也不把 C006 结果计入 C007。具体集成命令和仍待云端验证的边界见 `integration-gaps.md`。

Android 远程取证 helper 及 `run-android.mjs` 修订须先以独立 observation patch 落入仓库，再集成本 C007 草稿；当前来源为 `work/android-observation-fix/`，不归入 C007 生产修复。工作流 push 路径已包含这两个依赖；证据源清单递归收录 `tests/protocol-harness/android`。最终依赖哈希由各自冻结清单核对，本草稿不把 helper 的静态修订视为任何云端通过结论。

当前仍可能有编译/执行错误；静态读码发现的生产 C 静默读错误将按测试要求变红，禁止修改 expected 伪装通过。后续以独立 C007 cloud test commit 运行、保留首轮失败，再窄修生产问题、重新测试完整矩阵。
