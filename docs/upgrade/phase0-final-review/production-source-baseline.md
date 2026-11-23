# 当前生产源码基线

审查日期 2026-11-24（Asia/Shanghai）。审查基线为 GitHub `master` `bc3f44d1e76a988dbe269edcf1c606eebec37293`，tree `e7db82447dd94cfc2881e0c91191099a7b14ff44`。范围覆盖 Windows C、Node/共享 JS、Android Java/WebView、SQLite、同步与 WebDAV、交付相关源和 Actions 工作流。证据来自已登录 Codespaces 的远端引用、Git tree、对比和提交原始字节。共盘点 743 个路径，取回 414 个文本文件，其中 182 个在 `docs/upgrade/`。云端 ZIP 对所取每个文件复算 Git blob，本地传输复算 SHA-256 `02a7070226f8ca9ae67ce426b7073520574a692612f6aa56f4c3e63fffe24f25`。[完整源码身份与差异](source-identity.json)

### 历史运行如何关联当前源码

| 历史受测来源 | 与当前 master 的生产差异 | 可采信范围 |
| --- | --- | --- |
| C0-03/04 矩阵，`56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc` | 六个生产路径改变。C005 的 `src/sync-server.mjs`、`windows/credential-helper.c`，C006 的 `src/delta-sync.mjs`、`windows/sync.c`，C007 的 `src/sqlite-store.mjs`、`windows/database.c`、`windows/sync.c`（sync.c 两阶段均更改）。C004 协议模型、replica、native.h、Android Java 仍保留该身份。 | 原 `45140238501` 是 C004 修正当时的完整三端运行。当前同生产字节的回归依据另取 f9 的 `45186305196`，包含 936 执行、936 比较、702 来源及 Android 重试资格。 |
| C0-05 `648f550812a18ad203aa32ebabc06625bcb24c0d` | DPAPI 生产入口 JS server 和 Windows helper 的 blob 相同。C006/C007 修改四个其他生产路径。Android Keystore 与桌面凭据分别核对。 | `45158226148` 与 f9 的 `45186305386` 均 22/22，后者与当前生产范围相同。仅证明同 Windows 用户 DPAPI 范围。 |
| C0-06 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35` | `src/delta-sync.mjs` 未变。C007 修改 Windows `database.c`、`sync.c` 和 Node `sqlite-store.mjs`。 | 原 `45170150079` 等是 C006 当时的源码。用 19ce 核心 `45199685003`、中断 `45199685578`、bootstrap `45199685144` 和基线 `45199684912` 连到当前生产字节。 |
| C0-07 修复 `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277`、最终故障运行 `de7ce40ccac3e963108a3a9af7c875186f822cce` | 从 f9 到当前仅三个测试路径及文档有差异。从 de7 到当前仅两个 C006 Android runner 与文档有差异。C007 Windows worker 在 f9 后独立校正一次，当前与 de7 相同。 | `45190559178` 直接运行 de7。C007 保留 SQL 首错、清理事务、ACK 和发布的生产实现，当前 C007 夹具与通过运行对应。 |
| `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa` | 当前比 19ce 只多 61 个 C007 文档和证据文件，非文档路径及 mode/blob 全相同。 | 19ce 的四条补强回归直接关联当前对应生产和测试入口。当前 `bc3f44d` 自身未另跑新增运行。 |

从 f9 到当前，除文档外的三个差异为 `tests/c006/android-kill/android-kill-runner.mjs`、`tests/c006/c006-harness/android-runner.mjs`、`tests/fault-harness/c007-windows-worker.c`。审核涵盖整个 tree，包含未取回二进制的路径、mode 和 blob。当前没有发现 f9 后新增或改变的生产、构建/打包脚本或 CI 工作流。以上是身份结论。运行结论按各自源码和依赖绑定，保留历史未覆盖场景。[阶段运行与原始回执](phase0-final-report.md) · [现存 Actions 回执](actions-readback.json)

### 生产入口与持久化

- Windows 使用 Win32 C。SQLite 打开在 `db_open`，以 `meta`、`entities`、`outbox` 为主表，并有派生索引。C007 检查读取和提交错误，回滚时保留首因。当前仍有无列名 `INSERT INTO entities VALUES`，由 D1-02 单独处理。老导入和本地预迁移文件备份入口仍属现有兼容路径，D1 的编号迁移、全 writer 停写与一致备份尚无通过证据。[数据库与迁移入口](../../../windows/database.c#L347) · [Windows 存储](../../../windows/storage.c)
- Node 在 `createSQLiteStore` 按账户目录打开 `tasks.sqlite`，WAL、`synchronous=FULL`、`BEGIN IMMEDIATE`，按 revision CAS 写行、队列和 meta。旧 JSON 输入仍经现有迁移入口，C007 保留首异常并附带回滚错。实体和 outbox 当前亦用无列名 INSERT。Android Java `ReplicaDatabase` 使用 Android SQLite 和 ContentValues，字段合同相近。三端实际签名、设备 I/O 与 WAL 一致副本仍属独立验收。[Node 数据库](../../../src/sqlite-store.mjs#L6) · [Android 数据库](../../../android/src/local/gxtodo/replica/ReplicaDatabase.java#L10)
- Node HTTP 服务通过 `server.mjs` 和共享 WebDAV 服务模块接通访问。Android WebView 装载共享逻辑，通过 Java bridge 调用 `ReplicaDatabase`、`AccountStore` 和 `SyncStore`；Android 以 Keystore AES/GCM 封存本地同步配置。Windows C 另有原生同步及 DPAPI helper。Windows 和 Android 各自处理 HTTP 与文件 I/O，协议语义由矩阵对照；三端实现和部署环境有差异。[Node WebDAV](../../../src/sync-server.mjs) · [Android bridge](../../../android/src/local/gxtodo/replica/MainActivity.java) · [Android WebDAV](../../../android/src/local/gxtodo/replica/SyncStore.java) · [Windows WebDAV](../../../windows/sync.c)
- 核心同步由共享 `delta-sync`、`replica` 和 Windows C 原生路径承担。当前针对一个活动 scope 管理 WebDAV ACK、pending 与 cursor。LAN 独立投递和附件内容存储/传输无现行实现证据。旧项目有本地 HTTP 服务、账号文件和任务中的文本/路径字段，用途和完整性语义见专项审查。[共享同步](../../../src/delta-sync.mjs) · [同步安全审查](sync-safety-review.md)

### CI 及结果边界

当前 baseline workflow 实际覆盖 Windows 构建及自测、共享 JS 和 Android Java 宿主断言及 APK 构建。C0-04 在 Windows、Ubuntu Android 模拟器分片和 Windows 汇总对真实适配器运行；C0-05 为 Windows DPAPI；C0-06 核心及两组专项复用真实持久化夹具；C0-07 的 Node、Windows C 与 Android 独立作业随后聚合。旧 C0-03 workflow 的 Android 镜像阻塞记录仍保留。当前文档目录不在这些生产门禁的 push 路径范围内。本审查执行 Git 与 Actions 只读核对，未发起新工作流。构建使用的历史 runner、工具版本、产物与验收限制按原报告归属，不能从当前 YAML 推导未来环境结果。[原基线](../12-cloud-baseline-20261123.md) · [C0-07 构建环境](../c0-07-environment.md) · [工作流](../../../.github/workflows)

### 关键文件 Git blob

下表 Git blob 为 SHA-1 Git 对象标识。它与文件原始字节 SHA-256 是两种身份。完整 tree 及每个历史比较的实际路径详见 [source-identity.json](source-identity.json)。

| 文件 | 当前 Git blob |
| --- | --- |
| `windows/native.h` | `a9c23e56e329a75efefdbf1f9efdd4c2db30f691` |
| `windows/database.c` | `796d6bb4d8601b06a61cac1e8b66c8601da63a6f` |
| `windows/sync.c` | `208144931154968925d6bf41ba3bba49606c534b` |
| `windows/storage.c` | `a94c587132e8a42138aa86eea6de08a0d15b800e` |
| `windows/credential-helper.c` | `466bfa85d1bd1e8822c3bcaf236d1dc9d301f84e` |
| `windows/operations.c` | `530ddd597625fa89c7656c9e8b33428f531853e4` |
| `windows/main.c` | `9938c4c938e81c39377ccf31f8103a15fd1ef7d7` |
| `windows/vendor/sqlite3.c` | `0b227f0e604da5fa4e26186b6eb4b7ac2a88e732` |
| `windows/vendor/sqlite3.h` | `33dbec2c09b18d173d707a22049808d20df93e93` |
| `server.mjs` | `fc914ff40a44b5f22b7523b847298953429d6e54` |
| `package.json` | `aff72e9b38f3387a50f189caa8a2debdf5efbf83` |
| `src/account-store.mjs` | `c9c7df956ef233f2a8c0253ed3b055f998432e2b` |
| `src/accounts.mjs` | `bb015b7214328e643c28e21688f7d46e4da70677` |
| `src/app.mjs` | `c2d02c82c9fb890acfbfbf71a3ecc0eb56e1fb69` |
| `src/compat.mjs` | `39bf45a26825a263659190ff4538df63c1e26a0a` |
| `src/delta-sync.mjs` | `e7872ccdf830cc4a631a9ab4a6177e3580eed1f7` |
| `src/model.mjs` | `7141bde098d4bd709939de5786133a32a1598c78` |
| `src/replica.mjs` | `b910ebb83f2847a64e5d63fc986abc2c94cd0bb0` |
| `src/sqlite-store.mjs` | `a4325116f184312ddae822ca56f178eb57aaec40` |
| `src/storage.mjs` | `5bfb179f05e867ef573b52268224986ac5416761` |
| `src/sync-client.mjs` | `fe11e627d17fe3efb3452b31ce646b2ce44bf900` |
| `src/sync-core.mjs` | `fddcb587c0783e7267693e6b8d2e8db383a82f95` |
| `src/sync-server.mjs` | `682b74fa92ec3550f10e0e3d6202a3f469d88d98` |
| `android/AndroidManifest.xml` | `299bf79b96bb63868b8a3841924315c2d197df1c` |
| `android/src/local/gxtodo/replica/AccountStore.java` | `55bb03bf353bfbb37bde96e78d84b63a50dc53d4` |
| `android/src/local/gxtodo/replica/MainActivity.java` | `0e7136b0a51fa8a3e9cb7d94b3f91e75efd7df73` |
| `android/src/local/gxtodo/replica/ReplicaDatabase.java` | `d31030e0c247e97c51bd7b48bc917ecb32638052` |
| `android/src/local/gxtodo/replica/SyncStore.java` | `37cec1ba0eacf03cbec742b7a581778c17f99c23` |
| `scripts/build-android.mjs` | `a0be5c2047c68f0bdaf7e5b8234481e75f140f32` |
| `scripts/build-credential-helper.mjs` | `184997a12f0a3996273deab962906cfffdc1caf5` |
| `scripts/build-windows.mjs` | `f8d478e2b5b0be6591d39def7f2bdb1b76afd51b` |
| `scripts/package-release.mjs` | `3ba93ada1cba6acd149ed12faffe4ef8de89e8ff` |
| `scripts/verify-webdav.mjs` | `38334ad702fa5830190e4c8e4b8807c3a09e2146` |
| `.github/workflows/android-observation-evidence.yml` | `3e548f7d58be4ecfe7639a9ba15e277f9573e432` |
| `.github/workflows/c0-03-protocol.yml` | `e06766136a8f3ea05b26e31257cc0e52e71f8b67` |
| `.github/workflows/c0-04-android-preflight.yml` | `9841b17ca7e66f8ea813a423a8848cb070a4df8b` |
| `.github/workflows/c0-04-protocol.yml` | `468080a0b98717e0dd4cb036bf842727ee13b964` |
| `.github/workflows/c0-05-credentials.yml` | `f3127ef40064bf84581be7fa0c9f9c3c190c56e6` |
| `.github/workflows/c0-06-android-interruption.yml` | `e97cb34a0b85ffe6ea12c693603aad409946d5a9` |
| `.github/workflows/c0-06-bootstrap.yml` | `6b6dc8cb12ff93de40d6c099d9bf144db6b54371` |
| `.github/workflows/c0-06-migration.yml` | `166864d813410829cfb3338a8260579865a20c5f` |
| `.github/workflows/c0-07-fault-recovery.yml` | `f9947bf4b9866d4b5833b0b70954a89fe47b6ac6` |
| `.github/workflows/phase0-baseline.yml` | `2914c223dbd95f360520149f3ca9e8bbf718fa41` |
