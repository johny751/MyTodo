# D2 Android 真实存储 API 接入与隔离验证

2026-11-24（Asia/Shanghai）。仅 `d2/implementation-candidate-1` 生产分支候选；本机仅文本/静态处理，没有编译、SQLite、测试、ADB 或联网。本稿不填写尚未取得的 CI 结果。D1 候选 `d1-01-candidate.1` 不改变，公共编码与DDL见 [shared-runtime-contract.md](shared-runtime-contract.md)。

## 生产接入边界

**FACT（静态实现）。** ReplicaDatabase 保持真实 Android SQLiteDatabase/ContentValues 路径。meta/outbox INSERT 改为显式列名；entities 的命名 ContentValues、CONFLICT_REPLACE、原投影、CAS、clearOutbox/ACK 和 revision/dataRevision 逻辑保留。invoke 保留首错误，endTransaction 错误作为 suppressed，原先无首错时继续抛真实结束错误。

**FACT。** 构造器只执行原有业务库初始化，不创建 storage_migration_*，不调用迁移。公开 D2 手动入口为 captureD2Snapshot、migrateD2、confirmD2Commit、close/reopen。真实 close 抛错不会清掉原句柄；reopen 只打开同一存在文件，不重建缺失恢复库。每次真实新句柄有新 handleId，unknownCommit 同句柄确认拒绝；新句柄还必须匹配原 database path。

**FACT。** 原 PomodoroTasks.taskRecord 的纯投影原样移到生产 ReplicaTaskRecord；PomodoroTasks 委托该函数，存储读端使用同一函数。独立APK编译真正 ReplicaDatabase/MigrationRegistry/ReplicaTaskRecord/DailyTaskPolicy，没有 mock 存储或 AccountStore/MainActivity 入口。

## 手动契约

请求字段为 migrationId、contractId、algorithmId、implementationChecksum、sourceSnapshot。sourceSnapshot 来自真实数据库捕获，字段为 schemaFingerprint/rawFingerprint/userVersion/snapshotId/schemaPayload/rawPayload。implementationChecksum 必须与 caller 已检查的 build-bound checksum 相同；空/未记录身份拒绝。测试构建按真实生产闭包源码字节及固定计划/算法身份计算，并生成编译常量及APK metadata，不硬编码伪造源SHA。

迁移仅 `mytodo-storage-infrastructure-0001` / user_version 0→1：exclusive transaction 下重新核源快照，建固定3表/3自动索引，写11列registry、6列snapshot和5列成功audit，核原raw不变及独立源+6对象目标schema，再设version提交。所有新INSERT显式列名；不parse/rewrite业务JSON，不修改Actor/seq/clock/cursor/pending/outbox/manifest/ACK。

Schema 是实际sqlite_master原SQL，包括SQL NULL与自动索引，按BINARY(type,name,tbl_name)排序。source known-layout只接受固定baseline与精确列举reordered三表DDL；核心列/索引属性及meta CHECK(id=1)严格检查，未知CHECK/FK/trigger/view/对象拒绝。Android特例仅 `CREATE TABLE android_metadata (locale TEXT)`、唯一TEXT locale列和单条非NULL非空TEXT值，全表保留。

raw 使用统一候选 `mytodo-storage-fingerprint-v2`，按固定表/PRAGMA列序和排序行编码：算法/role、tableCount，每表name/columnCount/columnNames/rowCount。REAL三字段为(real,NULL,精确IEEE754 big-endian16lowerhex)，中间NULL是格式sentinel，不是把业务REAL改SQL NULL；SQL NULL为(null,NULL,NULL)；INTEGER/TEXT/BLOB保留(type,原HEX(CAST AS BLOB),NULL)。schema有recordCount，所有计数用S decimal字段。NULL为N;，字符串为S字节数:精确UTF8，不通过JSONObject数值序列化int64或REAL，也不把引擎相关REAL十进制CAST纳入跨端身份。

**FACT（CI3历史）/PROPOSAL（D2格式修订）。** CI3 Android自身11个API案例成功，但v1 source raw身份包含引擎相关REAL CAST，独立Registry比较未通过；未把它写成cross通过。D2-CONFLICT-REAL-001由root统一决定v2，D1业务/空值/时间/关系/删除/同步合同不变。Java算法常量、build-bound source checksum身份与动态request一起使用v2；旧v1请求在现有A08拒绝且原快照/版本不变，仍保持11个具名案例。旧v1日志/Registry/快照原件保留，不解释为v2、不回写旧库。v2实际结果由下一轮CI实证，不在本机执行。[统一冲突方案](fingerprint-portability-resolution.md)

固定窗口重入验证登记、不可变snapshot、版本、checksum、目标schema和原raw。新业务进展返回blockedDataAdvanced并保留，不自动no-op或回滚；正常启动后编辑的no-op策略仍OWNER DECISION。重入/确认以只读效果的exclusive transaction取得一致视图。

未知COMMIT不重试：migrate返回unknownCommit及真实primary/suppressed、旧handleId/path；caller必须真实close/reopen后confirm。完全新状态确认committed，完全旧状态确认notCommitted；进展/半状态拒绝。所有结果 automaticActivation/actorResumption=false，不授予生产激活或同步续发。

Observer 是生产无test依赖的诊断接口。外部caller保存attemptStarted/阶段/失败/unknownCommit原错误，rollback后仍在文件；成功audit仅同事务committed记录。测试在before-commit阶段抛诊断错误验证真实rollback，在实际COMMIT返回后抛caller诊断错误验证未知结果/新句柄确认；后者不是假称已注入SQLite内部COMMIT故障。

## Actions入口与必须保存文件

仅GitHub-hosted Linux：`node tests/d2/android/runner.mjs "$RUNNER_TEMP/d2-$GITHUB_RUN_ID-android"`。marker `.d2-synthetic-only.json` 精确四字段 syntheticOnly=true/contractId=d1-01-candidate.1/runId/framework=d2-real-storage-api-v1。使用预装JDK17、SDK34/build-tools35；复用D1官方emulator及成熟stdin sidecar-probe契约，独立包local.mytodo.d2storage无INTERNET、无launcher/production app entry，只安装该GHA emulator。

主回执 android-storage-receipt.json 必有status/sourceSha/runId/runAttempt/implementationChecksum/actualProductionStorageApi/actualFramework/productionAppEntryLoaded/cases/passed/failed/files。runner还核编译checksum/fixtureSHA/source/run/attempt。positive capture双读字节/hash、SQLite头、producer关闭seal及nonce sidecar探测均必须通过；失败/超时/超限/缺帧不冒充已验证文件。

必须交付：android-build-receipt.json、android-storage-receipt.json、android-runner-receipt.json、cross-source.sqlite、cross-target.sqlite、cross-source-snapshot.json、三个外部attempt JSONL、全部command stdout/stderr与递归payload-sha256.json。cross库在真实.invoke写入证明后，仅以公共shared-fixture.json固定SQL构造非法历史scalar/BLOB/int64/1ULP REAL，迁移不解析这些JSON/不改原值。Framework metadata 单独报告/验证，不混入跨端3core数据相等。

目前源码定义11个具名真实API案例，实际计数由CI回执决定：构造无自动迁移、真实invoke/CAS、原raw+基础设施/重入、真实TX回滚、未知结果同/新句柄、raw进展保留、DDL漂移拒绝、缺build身份拒绝、公共cross raw、reordered布局和真实SQL primary错误保留。不预填passed。

**UNVERIFIED / BLOCKER（生产）。** 真机/用户库、全部writers屏障、进程kill/掉电、COMMIT内部故障、生产同库恢复/活动指针、真实认证、LAN/WebDAV/双目标、旧版数据和Android issue #1仍待证据/授权。本APK是隔离真实存储调用，不是生产APP上线，不merge master/main、不接startup、不启用同步。

**FACT（CI4）。** 验证源码 d86aecd56a1c0dfa4d66a982703b3c93bdc5e9d7、Actions 45425446577 attempt1，Android真实存储11/11、最终跨端比较7/7。A08的旧v1拒绝与快照/版本不变属于源码定义，现由这次权威运行验证；CI3的原失败仍保留。结果限隔离数据库和独立APK，不是生产迁移认证。
