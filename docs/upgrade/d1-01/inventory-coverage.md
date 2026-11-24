# 盘点覆盖与未覆盖路径

2026-11-24（Asia/Shanghai）。远端审阅前 `master` 为 `ca00c2504a31198f2d49e787483f9ebd2a48a7da`，阶段 0 源码点 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。GitHub compare 返回 13 个变更文件，均属于 `docs/upgrade/d1-01/`（4）与 `docs/upgrade/phase0-final-review/`（9）。范围以当前生产源码入口和随 Android 构建固定的 AAR 为界，静态查找 SQL 声明、实际绑定、序列化、文件/偏好/远端路径，并沿调用者追踪实体和基础设施。[远端差异](https://github.com/johny751/MyTodo/compare/bc3f44d1e76a988dbe269edcf1c606eebec37293...ca00c2504a31198f2d49e787483f9ebd2a48a7da)

## 可计算覆盖口径

| 范围 | 已列 / 已识别表 | 已列 / 已识别声明列 | 已列 / 已识别显式索引 | 已列 / 已识别应用触发器 | 检索和人工核对入口 |
| --- | ---: | ---: | ---: | ---: | --- |
| Windows 账本核心 | 3/3 | 16/16 | 3/3 | 0/0 | `windows/database.c` `db_open` |
| Windows GUI 搜索补充 | 4/4 | 6/6 | 10/10 | 2/2 | `windows/query.c` `ui_query_init`；索引可同时服务 GUI 核心表 |
| Node 账本 | 3/3 | 16/16 | 3/3 | 0/0 | `src/sqlite-store.mjs` `createSQLiteStore` |
| Android 账本 | 3/3 | 16/16 | 3/3 | 0/0 | `ReplicaDatabase.java` 构造与 `invoke` |
| Android Feedback Kit 应用库 | 4/4 | 20/20 | 4/4 | 0/0 | 固定 AAR `FeedbackDatabase.createTables`、`onConfigure` 等 |
| Android Feedback Kit 还原临时库新增 | 1/1 | 3/3 | 0/0 | 0/0 | `FeedbackBackup` validation schema，另复用 4 表/20 列/4 索引的反馈 schema |

分母为每个作用域已识别的应用 DDL 对象，复用的反馈临时 schema 未重复计入新增，主键隐式索引、引擎内部表和可能生成的运行对象在平台附录中单列。`0/0` 指该范围无显式定义；它没有百分比或测试含义。安装实例实际存在多少对象、某查询用到什么索引，均未测。按用户列举的成熟功能检查了 9/9 个主题，逐项字段见 [字段映射](cross-platform-field-mapping.md)。

## 已追踪入口

| 平台 | 源码面 | 盘点路径 |
| --- | --- | --- |
| Windows 原生 | `main`、`gui`、`detail`、`task-menu`、`tasks`、`catalog`、`operations`、`dashboard`、`query`、`database`、`storage`、`profile`、`feedback`、`sync`、`util`、`native.h` | 打开/切换账户、SQLite 与搜索辅助表、任务/目录命令、提醒、反馈、业务导出和本地保存位置、复制文件与历史缓存。见 [Windows 附录](windows-storage-inventory.md) |
| Node/Web | `server.mjs`、`account-store`、`accounts`、`sqlite-store`、`storage`、`app`、`model`、`task-editor`、`task-tree`、`personal-ui`、`schedule`、`reminders`、`feedback`/`feedback-ui`、`undo`、`view-history`、各 `sync-*`、`replica`、`delta-sync` | HTTP、业务和复制存储的两层路径、浏览器 origin、旧文件/本地配置、队列、导出、远端备份与同步。见 [Node/Web 附录](node-web-storage-inventory.md) |
| Android | app manifest、`MainActivity`、`AccountStore`、`ReplicaDatabase`、`SyncStore`、`Reminder*`、`Pomodoro*`、`TodoWidget`、`AndroidCompanionService`/`ToolsActivity`、`DailyTask*`、`FeedbackApplication`、`FeedbackToolsActivity`、共享 JS 打包清单和 Feedback Kit AAR | 桥接确认共享 JS 的写入；同时逐个追踪 native-only 查询和本地状态。反馈 AAR 由构建脚本的 SHA-256 固定；以应用调用的默认 namespace 为持久库范围。见 [Android 附录](android-storage-inventory.md) |

## 未覆盖和纳入边界

| 未覆盖路径 | 依据和影响 |
| --- | --- |
| `tests/**`、`windows/*-test.c`、`selftest.c`、Android 测试/harness、CI 产物 | 这些属于验证或夹具存储，未计入生产表及文件清单。历史运行和采集缺陷仍用各自受测 SHA 与报告 |
| `windows/vendor/` SQLite/cJSON 引擎内部、Node SQLite 原生绑定、Android 框架及 WebView/浏览器内部库、厂商私有路径 | 以项目调用为边界，说明主键和 WAL/SHM 等可见约定；内部运行对象、格式和存在状态 `UNKNOWN` |
| 发布 ZIP/APK/EXE 的实际运行、安装目录和历史变体 | 已追踪当前发布入口和加密/存储调用；未以已发布包运行结果推定当前源码或历史版本 |
| Feedback Kit 完整上游项目、设备现场库/附件和非默认 namespace 实例 | 固定 AAR 的 DDL、应用启动、持久化/暂存文件及资产保存已列；上游未读部分和现场状态依旧 `UNKNOWN` |
| 真实用户数据、系统/应用凭据、数据库实例、当前设备和实际 WebDAV/LAN | 本轮是静态盘点；无样本分布、索引运行计划、数据库事务验证、跨端发布结果或备份恢复执行证据 |
| 未获批的统一契约、迁移与后续测试 | 字段映射只记录现存数据保留条件。D1-01-B 须等本批盘点审核，D1-02 仍须单独审批 |

具体缺口和后续证据条件见 [未确认事项](inventory-open-questions.md)。
