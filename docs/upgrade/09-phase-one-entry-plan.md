# 第一阶段：数据契约、备份与增量迁移实施计划

日期：2026-11-23，Asia/Shanghai。审计基线：`master` / `5480c88c806cf1c366ec998b0ba627543d63233a`。本计划基于已读取源码；公共模型、schema 和接口由主 Agent 后审。D1仍只编写计划，没有新增或运行业务代码、迁移SQL或本地项目测试。原有三端GitHub构建/回归已在run 45101481375实际成功，见12；共同协议向量及C0兼容任务未完成，不能把原构建成功写成D1入口已满足或迁移通过。

首版主要建设 Windows/Android，正式 Web 保留本机 Node/SQLite 产品并持续参加共享业务、数据、旧功能和同步回归。阶段1的数据契约/迁移/恢复必须覆盖三端实际存储，全量Web UI重构推迟，不与Windows/Android同列首版界面目标。任务编号与08一致，开发及按目标ACK规范以 [07 开发规范](07-development-standards.md) 为准。

## 1. 保留的基线与进入条件

三端已有 `meta/entities/outbox`，任务、嵌套子任务、便签、项目分类、标签与地点存为 JSON 复制实体。Windows `database.c:23–24`、Node `sqlite-store.mjs:22–29`、Android `ReplicaDatabase.java:30–36` 已将实体、outbox、游标和 meta 放在原子事务中。现有字段因果合并、墓碑与 WebDAV v2 作为扩展基础，不整体替换。

没有正式 schema 迁移登记；SQL 基础表、复制格式 meta.version=2、业务备份 version=1/2、账号清单 version=1、Windows 搜索缓存 version=4 必须分别管理。Windows 保存位置迁移有一致快照和原目录保留，但不等于 SQL schema 升级系统。

进入实施前，先取得 GitHub 上该提交的现有构建/回归日志，记录失败或无法验证项；对失败基线建立具体修复切片，不用新功能掩盖旧失败。C0-03共同协议向量必须运行Windows C、JS和Android Java实际SQLite/生产存储桥，已有Java计时测试、JS mock或独立模拟算法均不能替代。

C0-04排序/校验、C0-05凭据双向兼容、C0-06旧云迁移/恢复和C0-07 SQL错误传播各自独立commit、主Agent审查并完成相关云端test；四项证据与C0-01–03基线齐备后才进入D1-01–08实施。不得将这些兼容修复与D1迁移或大规模业务/UI改动混合提交。当前条件尚未满足，下面仍是计划。编译、测试和打包全部在 GitHub 执行，不建立本地编译缓存或本地应用测试目录。

## 2. 小步任务与文件边界

下表“新增”是拟创建路径，尚不存在迁移实现。每项单独提交、独立验证，公共改动先由主 Agent 审核。表中未展开的 Android Java 文件均位于 `android/src/local/gxtodo/replica/`，不是新建 Android Studio/Gradle 工程。

| 任务 | 现有修改范围 / 拟新增路径 | 依赖、主要风险和验收 |
|---|---|---|
| D1-01 固定数据契约 | 审阅 `src/model.mjs`、`src/replica.mjs`、`windows/database.c`、`android/src/local/gxtodo/replica/ReplicaDatabase.java`；新增 `docs/data-contract.md`、`docs/migration-recovery.md` | C0-01–03基线与三种实际存储向量，C0-04/05/06/07各自独立commit及相关云test/审查完成。不改 wire format。冻结 ID、时间、删除、并发、备份与新增实体语义；新旧对象映射逐字段列出，未记录历史时间不编造；按07记录每目标投递/ACK边界 |
| D1-02 先解除加列风险 | `windows/database.c:10`、`src/sqlite-store.mjs:13` 的 INSERT 改为明确列名；检查所有 meta/outbox INSERT；Android `ReplicaDatabase.java:33` 的 ContentValues 保持相同列合同 | D1-01；单独小步，只改写入表达，不改 schema/业务 UI。云端同一 fixture 写入结果及 event/outbox/meta 不变；添加测试用额外列后现有写入仍能执行；C SQL错误传播单独属C0-07 |
| D1-03 三端一致备份合同 | 复用 `windows/storage.c:34–48`，新增 `windows/database-backup.c`、`src/database-backup.mjs`、`android/src/local/gxtodo/replica/BackupCoordinator.java`；在 `src/account-store.mjs`、Android `AccountStore.java` 和 Windows数据库入口加迁移停写门槛 | D1-01/02、C0-07。平台各自实现一致副本，输出同一 manifest，保全所有账号及复制状态。无法取得一致备份时不迁移，不能只拷贝一个活动 WAL 数据库的 .sqlite 文件 |
| D1-04 迁移登记与恢复执行器 | 新增 `migrations/manifest.json`、`migrations/0001-register-schema.sql`、`windows/database-migrations.c`、`src/database-migrations.mjs`、`android/src/local/gxtodo/replica/DatabaseMigrations.java`；接入三端 `db_open/createSQLiteStore/ReplicaDatabase` | D1-03。识别旧 schema，先备份，再事务执行及登记 checksum。重复启动不重做；故障退出能识别已提交或未提交状态；未知 schema 拒绝并保留文件 |
| D1-05 修复旧数据入口差异 | `windows/database.c:29–30` 的 v1 子任务及 Notes/Projects 冲突导入；`windows/gui.c:259` 的 accounts.json 错误处理；按 D1-01 核对 `model.mjs`、Android `AccountStore.java` | D1-04。最小 v1 子任务无需原有 subtasks 数组即可升级；冲突保留原内容或明确报错；损坏清单不能静默变成默认账号后覆盖原清单 |
| D1-06 最小生命周期/关联/事件切片 | `src/model.mjs`、`src/replica.mjs`、`windows/database.c`、三端数据库适配；拟新增 `migrations/0002-entity-lifecycle.sql`、`src/work-data-model.mjs`、`docs/entity-sync-map.md` | D1-04/05、C0-03/04。先支持项目稳定关联、生命周期/并发语义和不可变业务事件合同；不替换原任务 JSON/entities 存储结构或一次性重建全部实体。新增表/JSON字段的具体 DDL 和同步映射由主 Agent 批准 |
| D1-07 附件元数据切片 | 拟新增 `migrations/0003-attachment-metadata.sql`；在共享 model/replica 与 C/Java适配中添加元数据和关联映射 | D1-06与同步兼容门槛。ID/文件名/大小/哈希/版本/关联一致；事件和SQLite不出现附件本体、机器绝对路径或凭据；文件缺失有明确状态 |
| D1-08 包装与云端验证 | `scripts/build-windows.mjs` 纳入新增C源；`scripts/build-android.mjs` 包含已批准的迁移资源；Android `MainActivity.java` 的资源白名单/入口需核对；新增 `tests/migrations/*.test.mjs`、`tests/fixtures/migrations/`、对应原生迁移夹具；复用C0-03 Android生产存储harness；更新 `.github/workflows/phase0-baseline.yml` 或独立迁移workflow | D1-01–07分步验证、C0全部兼容门槛。每一步独立执行 GitHub Windows C、JS、Android Java实际存储/迁移路径回归，迁移 fixture 不得在生产路径生成。打包实际含迁移清单/SQL及校验；T15/T16、共同协议向量和旧能力回归各有真实 run URL、日志、退出码与产物 |

取得C0全部前置证据并完成D1-01后，先落 D1-02 的兼容写入，再备份/登记/恢复。C0-07 SQL错误传播与D1-02明确列名写入分开提交。第一份 schema 迁移只建立安全底座；完整往来和工作流引擎随后按其业务阶段增加编号迁移。现在冻结它们的稳定 ID、模板版本快照、实例与事件合同，避免阶段 2/3 各自另造数据格式，不在第一提交同时大改全部 UI 和协议。

## 3. 备份、迁移和恢复合同

### 3.1 保全范围

迁移前备份覆盖受影响账号的完整复制数据库及账号清单，保留 actor、seq、clock、queue、vector、cursors、scope、epoch、pending、outbox、墓碑与冲突记录。保留旧 state.json、提醒收据及适用的独立本地文件；附件目录只做受控关联和校验，不搬入SQL。Windows派生搜索表可重建，但不能在未经验证时把它们与业务表一起清空。

同设备恢复需保留原复制身份；“跨设备导入业务备份”另走导入语义，不能克隆 actor/游标/待发布批次造成设备身份重复。原生 Keystore/DPAPI 凭据与机器密钥有平台边界；备份manifest不得含明文密码或密钥，云端测试只用合成账号，不上传真实业务备份。

备份清单至少记录：备份ID、创建时间及明确时区、应用/SQL/业务/复制格式版本、来源提交、平台与SQLite能力、账号ID、相对文件清单/大小/SHA256、逻辑实体与outbox数量、完整性结果。清单生成成功不等于恢复已验证；必须在独立云端副本上恢复并逐项核对。

### 3.2 平台实现

- **Windows C：**优先复用现有 sqlite3_backup API、busy/locked 有限等待和 integrity_check；在迁移停写/根目录锁保护下，对各账号取得一致快照。schema 变更使用独立执行器，不改写“保存位置迁移”的含义。
- **网页 Node：**通过账号保存队列和同步门槛暂停写入，按实际 `node:sqlite` 能力选备份方式。最低 Node>=22.13 不代表拥有后来新增的 backup API；不得未经检查直接导入该 API。可采用已证明所有连接停写并完成checkpoint/关闭后的稳定副本流程；能力不满足或无法证明一致性时中止。
- **Android：**最低 Android 8/API26，现有 SQLiteDatabase 没有项目内 backup 实现。不能假设有现代 SQLite backup、`VACUUM INTO` 或JSON扩展。新增协调器必须覆盖 AccountStore 缓存连接、JS bridge、提醒/小组件和后台业务入口，停写并关闭相关连接，再按该设备支持的checkpoint/一致副本策略处理数据库及必要日志文件。不能只给主页面加锁而遗漏系统组件；无法验证时保留原数据并报告不支持。

上述平台策略只有在云端相应SQLite/Android环境验证后才定为实现合同；不能把通用文件copy或业务JSON导出标为完整复制备份。

### 3.3 编号与事务

拟新增 `schema_migrations` 保存迁移ID、checksum、应用版本、源码提交及应用时间。没有登记的旧库先通过 sqlite_master/table_info、基础字段和 meta.version 验证其可识别基线；不能假定生产库 user_version 都为0，也不能直接覆盖未知版本。SQL schema版本与复制meta.version=2独立管理。

流程：停写 → 校验原库/生成一致备份与清单 → 记录恢复检查点 → BEGIN事务执行本次DDL/回填 → 在同一事务写迁移登记 → 约束/逻辑校验 → COMMIT → 记录完成清单 → 恢复正常入口。DDL、回填或登记失败一起ROLLBACK，不能继续迁移到下一编号。

回填同步业务字段必须经过统一业务写入，并在同一事务维护 entity.data、entity.record、outbox 和迁移进度；不能直接 UPDATE data 而留下旧 record，也不能修改历史不可变批次。schema 登记和纯派生查询投影可由SQL处理，业务事件须带可追溯的迁移来源。新的软删除沿用明确墓碑语义，不用物理DELETE业务行替代。

现有 C db_local、Node call(commit) 和 Android invoke(commit) 自行管理事务；迁移执行器已经 BEGIN 时不能直接再嵌套调用这些入口。D1-06 应把复用的事件计算及行/outbox/meta落盘逻辑整理为受主 Agent审核的内部事务单元，由外层迁移控制提交；对外业务/同步调用合同保持一致，并在云端分别验证正常提交、回填失败回滚和CAS语义。

断电发生在COMMIT与文件完成清单之间时，以数据库迁移登记/checksum及完整性为判断依据；不能仅因外部检查点仍显示“running”就覆盖已经成功提交的数据。恢复/重试需独立状态机，替换数据库文件前关闭全部连接，并保全备份和失败副本。备份失败、磁盘不足、文件冲突、未知schema均明确停止，不新建空库掩盖错误。

## 4. 新数据与同步兼容门槛

1. 现有任务UUID、确定性重复实例ID、项目ID、标签/地点名称ID全部保留；逐步新增 task.projectId 与旧 project名称映射，不一次改掉所有旧关联。重名/缺失项目要保留原值和迁移诊断，不能任意绑定。Workspace/Users是新领域实体，不能把本地账号清单直接当远端身份系统。
2. 新实体具有稳定ID、createdAt/updatedAt和删除语义。旧记录只有可靠原时间时才回填；未知历史时间为未记录/null及来源标识，不能把迁移当天当成历史创建时间。updatedAt用于展示，不代替因果版本排序。
3. 保留原 revision CAS、事件vector和字段冲突；新业务实体的并发检测token与其复制记录绑定。不要新增一个与多设备vector无关的单纯递增数字并宣称解决跨端并发。
4. 重要状态事件采用稳定eventId、来源与时间，和业务修改在同一事务中记录。远端重放不重新生成业务事件或outbox；需跨端追溯的不可变事件应有明确复制映射及快照保留规则，不能把会被裁剪的 entities.record 或已确认删除的outbox当永久历史。
5. 附件元数据包含id、名称、非负大小、内容SHA256、内容版本、关联实体及删除状态。存储路径留在本机，二进制独立传输；元数据已到而文件未到必须可见为待获取/缺失，不冒充已同步完成。墓碑和文件清理等待可靠确认策略，不因一次远端不存在就删除本体。
6. 现有 `replica.mjs`/C event_valid 只接受五种kind，`model.mjs` 是字段白名单；新增实体不能只改SQL。必须一起审核 flattenState/buildState、序列化、JS/C验证、Android适配、导入导出及快照。WebDAV v2的manifest/batch/outbox核心优先保留，任何能力声明/兼容门槛变更需主 Agent审定协议测试后再实施。
7. 旧客户端遇到不支持的实体/业务格式必须明确失败，保留本地待同步变更，不推进失败批次游标、不静默丢字段。新增协议能力不能假设所有旧客户端会识别；需要实际新旧双向样本证明，并明确需要升级的设备范围。
8. 按07正式确定的每目标投递/ACK合同保全待发送义务：LAN对端接收与WebDAV云发布分别记录，一个目标ACK不能清理另一目标的进度、唯一payload或待投递义务；撤销/离线/切设置不自动视为ACK。逻辑GC须满足全部required target及保留条件；释放物理outbox前，未完成义务仍须有发送端本机持久、完整、不可变且校验有效的重发副本及可恢复引用，不能仅保留远端WebDAV路径。备份/恢复清单须覆盖本机载荷与账本对应关系；LAN补发不得依赖联网回取，副本缺失/损坏不能误判为空批次或ACK。D1先冻结共同字段和迁移保全范围，L4/S5按任务实现账本；不提前把现有全局outbox改成两个互不关联的事件来源。

## 5. GitHub 验证清单与退出条件

合成 fixture 拟放 `tests/fixtures/migrations/`，包括：空库、未登记的现有v2库、v1最小子任务、64层树、中文/换行/时间、重复任务链、Notes/Projects同ID冲突、删除墓碑和冲突、未确认outbox/pending批次、多个账号及坏accounts.json、有效WAL状态、未知schema/版本、附件缺失和错误哈希。来源不得使用生产账号数据或凭据。

| 验证 | 需要证明的结果 |
|---|---|
| T16 旧数据迁移 | 三端同一逻辑fixture的ID、父子、项目旧名称/新ID、文本、时间、重复链、删除/冲突、outbox及复制meta保全；Windows派生索引与业务数据分开校验 |
| T15 失败恢复 | 在备份、DDL、回填、登记、COMMIT前后、完成清单和恢复切换处注入故障；原库可用或从验证备份恢复；重启/重试不重做已提交迁移 |
| 并发与停写 | 所有保存/同步/提醒相关入口受迁移门槛控制，预期revision不匹配仍按原规则拒绝；不因停写丢草稿或待同步队列 |
| 备份一致性 | WAL和多账号条件下的副本实际可恢复，数量/记录哈希与元数据匹配；不能只检查文件存在或integrity_check |
| 三端协议回归 | 同组向量通过Windows C、JS、Android Java实际SQLite/生产存储桥应用/持久化/重启/导出；旧五kind样本不变，新实体互换、重复/乱序、墓碑、冲突、失败后cursor/outbox/meta状态及快照恢复真实执行；Java计时测试或JS mock不代替Android结果 |
| 附件边界 | 数据库/事件只有元数据；本体缺失、部分文件、哈希错误有明确状态；独立传输尚未完成时不写完整附件同步已通过 |
| 旧功能回归 | 四象限、嵌套子任务、重复、便签、项目分类、提醒、统计和Android番茄功能逐端验证，未覆盖项如实保留 |

每个run保存提交号、runner/工具/SQLite版本、fixture索引、命令、起止时间及时区、真实退出码、结果、日志、备份/恢复校验及产物SHA。JS mock、Windows C、Android SQLite模拟器与真实设备分开标注。全部在GitHub或经授权的专用云端设备环境执行，不在本机运行这些测试。

阶段 1 只有在C0-04/05/06/07各自独立commit及相关云test/审查完成、主 Agent审定公共合同、旧数据及失败恢复实际通过、迁移重复执行安全、Windows C/JS/Android Java实际存储共同向量可复核且原能力回归无未说明损害后才能完成。正式Web持续参与共享业务/数据/同步回归，全量UI重构不在本阶段范围。D1当前仍是计划；已运行的三端原有CI不替代T15/T16或三端迁移证据。
