# 文件级升级任务与验收门槛

日期：2026-11-23，Asia/Shanghai。依据为master ZIP提交注释 `5480c88c806cf1c366ec998b0ba627543d63233a` 的真实源码及01/02/03审计。以下是实施计划，不是已经完成的功能/测试清单。现有路径已在源码核对；标“计划新增”的文件当前不存在，最终职责和公共设计由主Agent审核。表内未带目录的Android Java类名均位于已确认的 `android/src/local/gxtodo/replica/` 包目录，不是任意路径通配。

用户最新要求：编译、测试、打包全部在GitHub执行；不再安排本地构建、测试或新探针。当前CI草稿为 `outputs/github-ci/phase0-baseline.yml`；尚无实际GitHub提交或Actions运行，本文件不将其标为通过。历史README记录和此前本地内存探针不作为云端基线。

主Agent已审定保留 `meta/entities/outbox`、既有任务结构和WebDAV v2核心。本轮只完成审计/计划，不修改业务源码。具体DDL、事务内部接口及新实体同步映射在实现前由主Agent审核；这不是未决产品需求，不再向用户重复确认已定需求。阶段1编号和新增路径以 `09-phase-one-entry-plan.md` 为唯一来源。

首版主要交付 Windows/Android。正式 Web 保留当前本机 Node/SQLite 产品，继续参与共享业务、数据、旧功能和同步回归；保证共享 JS/Android 资源改动后的必要兼容。Web 全量 UI 重构推迟，不作为首版同等优先级目标。跨任务开发、评审和云端证据统一遵守 [07 开发规范](07-development-standards.md)。

## 统一执行约束

- 保留Windows C/Win32、Node本地网页服务、Android Java+WebView和现有WebDAV v2。Android当前为手工aapt2/javac/D8链，不能在审计阶段假装已有Gradle/wrapper，也不为方便构建而换技术栈。
- 现存meta/entities/outbox及成熟任务/便签/四象限/重复/提醒/统计保留。既有事件会裁剪、ACK会清outbox，不能把它们当永久业务历史。
- 源码固定为master或已记录的提交号；空main不作为源码输入。若采用workflow_dispatch，默认分支需有工作流定义，再显式checkout master；也可在master用push触发。不为源码读取改默认分支。
- 当前阶段0只审计和建立云端原版本基线。下面兼容修复作为进入阶段1前的独立小步，不在基线未完成时同时大改UI、数据库和协议。
- C0-04/05/06/07各自独立commit、主Agent审查并完成相关云端test；四项证据齐备后才进入D1实施。失败先修复该切片并重新验证，不用迁移或新业务提交掩盖前置失败。
- 共同协议向量必须运行Windows C、JS与Android Java实际SQLite/生产存储桥；三者使用相同fixture和规范化比较合同。JS mock、另写模拟算法或Java计时测试不能替代生产存储适配结果。
- 按目标ACK账本是正式确定规范：LAN对端接收与WebDAV云发布各自保留投递义务及确认状态，一个目标ACK不能解除另一目标待投递义务或使其丢失已校验可重发payload。所有required target完成且批次/收据/快照/墓碑/历史保留条件满足后才能逻辑GC；载荷迁移后释放物理outbox仍须保有未完成义务的本机持久、完整、不可变且可校验重发副本，LAN补发不得依赖联网回取WebDAV。副本缺失/损坏明确失败并保留义务，不误判为空数据或完成ACK。撤销/离线/切设置不自动视为ACK。具体合约及清理条件以07为准，公共模型/存储实现由主Agent审查。
- 新业务界面先给可交互网页Demo并等待UI定稿；在所属阶段前置门槛满足后，业务模型、数据库和核心逻辑可独立推进。每一小步有单独提交和相关回归记录。
- 数据库实验只使用云端隔离合成/脱敏夹具；生产数据、原签名和真实坚果云凭据不用于测试。新增联网服务/依赖范围服从项目授权。

## 阶段0：云端基线与阶段1前置兼容门槛

| ID | 任务及现有/新增文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| C0-01 | 云端源码与Git基线：README、package.json、scripts/build-windows.mjs、build-android.mjs、package-release.mjs；记录Codespaces/checkout的HEAD、分支和staged/unstaged/untracked | 可读云端仓库；master | ZIP不含Git历史；工作区可能有未提交变更 | 源码SHA、Git状态、工具版本和调用入口可复核；不覆盖用户变更；逐文件与审计基线对应 |
| C0-02 | 三端Actions基线。计划新增 `.github/workflows/phase0-baseline.yml`，草稿在outputs/github-ci；用原Windows/Android脚本及tests/*.test.mjs，不先本地编译 | C0-01，工作流可提交/运行 | 默认main空；预装SDK版本不匹配；签名缺失 | 实际run URL/提交/runner/日志/退出码/产物hash；Windows核心自测、共享JS及Java计时测试分别记录。Android unsigned只证明编译，不能冒充可覆盖安装发布APK；Web源包与Node运行时便携包区分 |
| C0-03 | Windows C/JS/Android Java共同协议夹具：已有tests/delta-sync.test.mjs、sync-transport.test.mjs、windows/selftest.c；计划新增 `tests/protocol-vectors/*.json`、`tests/protocol-compat.test.mjs`、`windows/protocol-test.c`、`tests/android/protocol/ReplicaProtocolVectorTest.java`；Android harness接原ReplicaDatabase/AccountStore生产存储桥 | C0-02；云端Android SQLite执行环境 | 相同wire格式不等于相同投影；现C自测未走HTTP；Java计时测试未验证SQLite/生产桥 | 同组向量通过三种实际实现应用/持久化/重启/导出，比较规范化投影、墓碑、冲突、outbox/meta和游标；覆盖Unicode、数字、乱序、重复、快照片段、无效批次原子拒绝；C/JS/Java各有实际云run/日志，不只执行模拟算法或JS mock |
| C0-04 | 确定排序/校验兼容修复：src/replica.mjs:39–44、windows/database.c:13–20、src/delta-sync.mjs:9、windows/sync.c:16/21/22/24；同步更新docs/sync-v2.md及实现指南 | C0-03；主Agent审核公共规则；独立commit | localeCompare/strcmp不同；key/context/id长度差异；C游标int和安全整数边界 | A/a及ASCII标点排序一致；key恰好两项、context类型、ID编码长度、整数边界一致；已有合法身份可继续；无效数据不写半批或推进游标；该commit相关三种实际存储向量云test及审查记录齐备 |
| C0-05 | 凭据双向兼容：windows/sync.c:5/6、windows/credential-helper.c、src/sync-server.mjs:8/13、tests/web-launcher.test.mjs；计划新增合成C/Node互读夹具 | C0-02；独立commit，与C0-04/06/07分开 | Node gx-dpapi-v1:UTF8/hex格式C未识别；不能更换真实凭据或暴露密码 | 云端Windows验证C旧格式→Node、新Node→C、重保存/损坏文件；合成密码不进日志，原配置失败时不覆盖；Android Keystore不降级；该commit相关云test及审查记录齐备 |
| C0-06 | 旧云迁移/恢复：src/delta-sync.mjs:20–37、windows/sync.c:25、src/sync-core.mjs；计划新增guard/backup中断恢复向量 | C0-03/04；独立commit | C拒绝旧v1且未加载guard.backup；不能初始化空云覆盖旧数据 | mock v1→备份→fence→manifest每个断点可恢复；C/JS同样保全原记录并由Android实际存储桥核对共同状态；未知格式安全停止；该commit相关云test及审查记录齐备；实际坚果云仅在专用授权测试目录验证 |
| C0-07 | C SQL错误传播独立切片：windows/database.c:8/9/23/24、windows/sync.c:18/22；原生故障夹具由测试Agent设计 | C0-02/03；独立commit，与D1-02分开 | 空结果与SQL失败混淆，查询/事务错误未完整传播；不与加列兼容混在一次改动 | 故障注入后明确失败，不重建为空outbox、不提前ACK/cursor、不伪报同步成功；既有C调用和正常提交回归，数据库结构不变；该commit实际C故障云test及审查记录齐备 |

## 阶段1：数据库保全与统一模型

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| D1-01 | 固定数据契约：审阅src/model.mjs、src/replica.mjs、windows/database.c、android/src/local/gxtodo/replica/ReplicaDatabase.java；计划新增 `docs/data-contract.md`、`docs/migration-recovery.md` | C0-01–03基线与三种实际存储向量，C0-04/05/06/07各自独立commit及相关云test/审查完成；主Agent已审定保留原三表 | SQL/复制/业务/账号版本混用；本地账号不是团队Users | 稳定ID、时间、删除、并发、备份及新旧对象逐字段映射冻结；不改wire；未知历史时间不编造；按07记录每目标投递/ACK边界 |
| D1-02 | 先解除加列风险：windows/database.c:10、src/sqlite-store.mjs:13明确列名INSERT；核对meta/outbox及ReplicaDatabase.java:33 ContentValues | D1-01；单独小步 | C/Node位置INSERT在entities加列后会失败；不能借此改业务或schema | 同一云端fixture的行/event/outbox/meta不变；加入测试额外列后旧写入仍可执行；C SQL错误传播单独属C0-07 |
| D1-03 | 三端一致备份合同：复用windows/storage.c:34–48；计划新增 `windows/database-backup.c`、`src/database-backup.mjs`、`android/src/local/gxtodo/replica/BackupCoordinator.java`；接account-store.mjs/AccountStore.java及Windows入口 | D1-01/02、C0-07 | 活动WAL/缓存连接/提醒小组件仍写入，普通文件复制不一致 | 停写门槛覆盖全部业务入口，各账号一致副本、共同manifest、复制身份/队列/墓碑/冲突保全；备份失败不迁移；T15前置 |
| D1-04 | 迁移登记/恢复执行器：计划新增 `migrations/manifest.json`、`migrations/0001-register-schema.sql`、`windows/database-migrations.c`、`src/database-migrations.mjs`、`android/src/local/gxtodo/replica/DatabaseMigrations.java`；接三端数据库打开入口 | D1-03 | 未登记旧schema不可盲认版本；COMMIT与文件完成标记间崩溃；不能嵌套原事务入口 | 可识别schema先备份，事务DDL/登记checksum，重复启动不重做；未知schema保留并拒绝；依据DB登记恢复，而非只凭外部标记；T15 |
| D1-05 | 旧数据入口差异：windows/database.c:29/30、windows/gui.c:259；按合同核对src/model.mjs和android/src/local/gxtodo/replica/AccountStore.java | D1-04 | C最小v1子任务拒绝、Notes/Projects冲突跳过、坏accounts清单被默认为空 | 旧子任务缺subtasks可升级；同ID冲突保留或明确报错；坏清单不覆盖；旧记录/关联/原文本保全；T16 |
| D1-06 | 最小生命周期/关联/事件切片：src/model.mjs、replica.mjs、windows/database.c及三端存储适配；计划新增 `migrations/0002-entity-lifecycle.sql`、`src/work-data-model.mjs`、`docs/entity-sync-map.md` | D1-04/05、C0-03/04；具体DDL/接口实现前主Agent审核 | 当前kind/字段白名单，project按名称关联；record/outbox不是永久历史；回填data而不更新record会分裂版本 | 稳定projectId保留旧名映射；生命周期与并发token绑定复制版本；业务事件/回填与row/record/outbox同事务；新旧双向样本明确，失败不丢字段或推进游标；不整表重建 |
| D1-07 | 附件元数据切片：计划新增 `migrations/0003-attachment-metadata.sql`；共享model/replica及C/Java适配映射 | D1-06及同步兼容门槛 | SQLite/event存本体或绝对路径，缺文件被误报完成 | ID/名/非负size/SHA256/版本/关系一致；本体、机器路径、凭据不进DB/event；缺失/待获取状态明确；内容目录/传输后续业务阶段实现 |
| D1-08 | 包装与云端验证：scripts/build-windows.mjs、build-android.mjs、MainActivity.java资源入口；计划新增 `tests/migrations/*.test.mjs`、`tests/fixtures/migrations/`及原生夹具；复用C0-03 Android生产存储harness；接现CI或迁移workflow | D1-01–07分步验证，C0全部兼容门槛 | 模拟桥接不能代替Android SQLite，打包可能遗漏迁移资源 | Windows C、JS、Android Java实际存储/迁移路径各有真实run/日志/exit；产物含迁移清单SQL/checksum；T15/T16、WAL/多账号/重复迁移/旧能力及共同协议向量逐项记录；无本地执行 |

## 阶段2：工作台、项目、往来与档案基础

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| B2-01 | 可交互网页Demo：计划新增 `docs/upgrade/demo/index.html`、demo.css、demo.mjs；使用合成记录展示Windows/Android首版工作台/项目/等待反馈/档案设计 | D1公共模型；UI定稿在后续平台UI前 | 网页Demo是讨论载体，不表示正式Web全量UI重构；不能将演示状态当真实同步结果或移除旧入口 | 直接打开可交互，桌面/手机布局可讨论；四象限/便签/番茄钟入口保留；用户UI定稿记录 |
| B2-02 | Windows/Android综合工作台：已有src/app.mjs、personal-ui.mjs、windows/gui.c、query.c；计划新增 `src/workbench.mjs`、`windows/workbench.c`；Web只做共用资源及业务必要兼容 | D1、B2-01定稿 | 现windows/dashboard.c主要统计/提醒，不是已有综合工作台；全量载入性能风险 | Windows/Android首版今日/逾期/将到期/重要/项目/等待/流程/最近完成与快记，布局可保存；索引/分页及旧任务回归；正式Web既有入口可用、共享业务/数据/同步回归通过 |
| B2-03 | 项目领域扩展：src/model.mjs、app.mjs；windows/catalog.c、operations.c、query.c；计划新增 `src/projects.mjs`、`windows/projects.c` | D1-06/08、B2-01 | 既有项目只有name/description/archived，改名/删除需保留关联 | 目标/阶段/负责人/成员/期限/任务/进度/成果/归档；稳定ID关系，独立任务仍可用；三端同组业务向量 |
| B2-04 | 往来/等待管理：计划新增 `src/follow-ups.mjs`、`windows/follow-ups.c`；复用D1存储/业务事件桥 | D1-06/08、B2-03 | 等待别人处理不能只用普通待办done替代 | 联系人/单位/方式/提交/等待对象/预计反馈/跟进/沟通记录持久化，可关联任务项目并进入工作台 |
| B2-05 | 工作档案/独立内容目录：计划新增 `src/archives.mjs`、`windows/archives.c`、`src/attachments.mjs`、`windows/attachments.c`、`android/src/local/gxtodo/replica/AttachmentStore.java`；扩展query.c与搜索/账号桥 | D1-07/08、B2-03/04 | 便签、优化意见与档案不同；归档不能物理删未保全文件；路径越界 | 资料/成果/历史事项/归档时间/关联及分类搜索；内容按账号有界存储，临时与完成文件分离；恢复与文件存在性/hash可验证 |

新增JS模块必须同时进入 `server.mjs:17` 静态资源白名单、`scripts/build-android.mjs:21` 打包资源清单及 `MainActivity.java` assets白名单；不能靠放开任意路径访问解决资源缺失。公共文件修改由主Agent串行集成。

## 阶段3：模板工作流

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| W3-01 | 模板/版本/步骤/字段：计划新增 `src/workflow-model.mjs`、`windows/workflow-model.c`、模板迁移和测试；公共模型接D1注册 | D1、B2-01；主Agent审核表/状态枚举 | 模板不是普通任务复制，不能写死报销 | 模板CRUD/复制/排序/增删步骤/必选字段/办理人/等待对象/时限/提醒/材料要求/个人共享标记；版本不可变且可查 |
| W3-02 | 启动实例与快照：计划新增 `src/workflow-engine.mjs`、`windows/workflow.c`及runs/step-instance映射 | W3-01、D1-06/08 | 只存templateId会被后续模板编辑影响 | 启动原子保存templateVersion及完整快照、独立run ID；T11；旧实例不跟随新模板变化 |
| W3-03 | 八类步骤办理与恢复：复用W3-02引擎；计划新增 `src/workflow-ui.mjs`、`windows/workflow-ui.c`；三端资源/桥同步接入 | W3-02、B2-01定稿 | 状态转换/字段验证必须可恢复；不能把页面关闭当流程结束 | 办理/清单/填信息/交材料/等反馈/跟进/确认/归档；必填和缺材料阻止错误完成；步骤开始完成/当前步骤/事件原子保存；T12/T13 |
| W3-04 | 等待、跟进和分配：W3引擎、B2往来模块；计划新增assignments/artifacts/reminders映射 | W3-03、B2-04、D1-07/08 | 等待/预计/实际反馈时间与任务提醒混淆 | 提交对象、等待对象、预计实际反馈、跟进记录、材料版本、最终结果均持久；从历史流程建立新模板不改历史 |
| W3-05 | 流程提醒/归档/统计：src/reminders.mjs、personal-ui.mjs、windows/dashboard.c；android/src/local/gxtodo/replica/ReminderScheduler.java、ReminderReceiver.java；扩展W3与Archives | W3-04、B2-05 | 旧提醒ledger和Android后台权限行为不能被新流程打断 | 持续未完成流程提醒、完成后材料归档；流程完成率/办理时长；旧任务提醒回归；合成报销六步端到端、缺项/等待/到账/退出/跨天 |

报销仅作为可配置模板/测试夹具。SharedTemplate在第一版表达共享范围/导入导出能力，不假定已经具备团队在线审批或复杂条件分支。

## 阶段4：LAN通道与设备安全

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| L4-01 | 公共传输/空间身份合约：既有delta-sync.mjs、sync-client.mjs、sync.c；计划新增 `docs/upgrade/sync-transport-contract.md`、`src/sync-transport.mjs`、`windows/sync-transport.h` | C0兼容、D1；主Agent审核 | WebDAV epoch/批次index不能误当任意对端的全局进度；actor是每账号副本 | connect/auth/manifest/upload/download/ack/status/disconnect语义及能力协商明确；logical workspace/batch与WebDAV v2映射有双向向量；不限定Windows为唯一服务端 |
| L4-02 | 每目标投递账本基础：D1迁移/三端存储接口；计划新增 `src/sync-delivery.mjs`、`windows/sync-delivery.c`及delivery/receipt/session表；合同按07 | L4-01；在任何LAN发送前 | 当前ACK删全局outbox，LAN先成功可让WebDAV待发送丢失；仅远端副本使LAN补发依赖广域网 | 一个目标ACK仅改该目标持久状态；LAN/WebDAV均不得清理另一目标未履行义务或唯一本机payload；未确认其他目标仍可重试；载荷迁移各崩溃断点至少一份校验有效的本机副本可读；逻辑批次不可变，重复确认幂等；两通道都未发前退出可恢复 |
| L4-03 | Windows可选服务：计划新增 `windows/lan-service.c`、`windows/mdns.c`、`windows/device-pairing.c`；GUI启动/停止/状态接gui.c/dialogs.c，保留Win32 | L4-01/02，安全设计评审 | 现Node API只绑127.0.0.1；不能直接开放并删Host/Origin校验；TLS实现/接口绑定需明确 | 手动启停、IP/端口/状态、选择私网接口、随Windows启动可选；应用关闭手机仍离线可用；默认不安装常驻系统服务 |
| L4-04 | 首次配对/认证/撤销：L4-03；计划新增 `src/device-management.mjs`、设备/配对迁移、Windows配对UI | L4-03、D1 | 同Wi-Fi不可信；二维码/数字码不能靠接受所有TLS证书授权 | 用户确认，高熵一次性过期令牌、失败限次、加密及可信身份绑定、设备列表/解绑/撤销；T10；未授权访问不返回/修改业务数据 |
| L4-05 | Android发现/手动连接：计划新增 `android/src/local/gxtodo/replica/LanDiscovery.java`、`LanTransport.java`、`DevicePairingStore.java`；更新MainActivity和共享sync-client/settings入口 | L4-03/04 | mDNS被网络阻断、Wi-Fi切换、移动后台生命周期 | NsdManager/DNS-SD发现与手动IP:port回退；配对信息安全持久；重发现/断线重试；T09；TLS身份不被静默替换 |
| L4-06 | 增量交换/状态与恢复：计划新增 `src/lan-transport.mjs`，L4原生实现；复用事件合并、账本及会话锁 | L4-02/05、C0向量 | 部分接收后ACK、循环转发或未知世代造成数据丢失 | T01/T02/T03/T08：云端隔离C/JS/Java协议与断线测试；实际LAN流量可证明未访问坚果云；进度/时间/错误/more与持久状态一致 |

第一版Windows是可用的LAN中心角色，不是协议永久唯一合法节点。Android↔Android、Windows↔Windows的PeerTransport只预留合约和能力，第一版不伪称完成。

L4-02按07正式规范保留可重发payload，outbox清理必须受每目标投递账本约束，LAN ACK与WebDAV ACK均不能旁路删除另一路唯一待发送副本或解除其义务。S5整合完成前，阶段4只在隔离夹具运行LAN；不得对真实用户开放尚未验证的双通道并发，也不删除/改写原WebDAV功能。

## 阶段5：WebDAV保留及双通道整合

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| S5-01 | WebDAV接新账本：src/delta-sync.mjs、sync-client.mjs、sync-server.mjs、windows/sync.c、Android SyncStore/ReplicaDatabase；保留v2不可变文件/ETag/gzip/快照 | L4-01/02/06；07按目标ACK合同 | 不能因新通道重写原协议或把WebDAVindex当LAN cursor | T04及C/JS/Android Java实际存储共同旧向量回归；共同云发布确认与对端接收确认分别记录，任一路ACK不得清理另一目标待投递义务；已有云目录/墓碑可继续读写 |
| S5-02 | 同批跨通道去重/独立进度：L4账本、replica/db_remote、三端迁移；计划新增 `tests/dual-channel-sync.test.mjs`和原生向量 | S5-01 | 一个通道推进进度不能跳过另一个通道尚未持久的内容；不能复制独立outbox | T05：并发同批、乱序、重复、多次ACK只应用一次；各目标进度独立；WebDAV已ACK/LAN待投递且物理outbox已安全迁移后，重启并阻断广域网仍以本机副本发送同一批次；缺失/损坏副本不变为空或提前ACK；原actor/逻辑事件身份统一，无循环 |
| S5-03 | 切通道/空间和租约恢复：delta-sync bind/prepare/publish、sync.c:18/22–24/31、delivery/session层 | S5-02；07按目标ACK/GC合同 | 当前bind清pending/cursors/重建outbox；崩溃/过期会话不能清另一路队列 | 同时跑/中断/切设置/重启时待投递内容保留；撤销/离线/切设置不自动当ACK；事务故障无提前ACK；T02/T08；过期发送者不能提交新会话进度 |
| S5-04 | 冲突/删除/快照跨通道：replica.mjs、database.c、delta-sync.mjs、sync.c及冲突UI | S5-02/03、C0-04 | 隐藏并发版本、旧删除复活、快照片段重放 | T06/T07：离线多端同/异字段、显式恢复、树父删除/环、快照后重复批次均收敛；冲突与选择事件可追溯 |
| S5-05 | 附件内容通道：B2-05 AttachmentStore、LAN/WebDAV适配器；计划新增 `src/attachment-transfer.mjs`、`windows/attachment-transfer.c`、`android/src/local/gxtodo/replica/AttachmentTransfer.java` | D1-07/08、B2-05、S5-01/03 | 元数据到达而内容未完整、损坏部分文件被当完成 | T14：独立文件/版本/哈希，部分进度可恢复；中断/坏块/重复/断电后校验，完成原子发布；DB/event不含本体 |

## 阶段6：Windows/Android体验与正式Web兼容

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| U6-01 | Windows/Android首版功能入口/布局与Web保全：src/app.mjs、personal-ui.mjs、styles.css、interaction.css；windows/gui.c、detail.c、catalog.c、task-menu.c、query.c；Android MainActivity及现原生计时/通知UI；共享资源改动按需接入正式Web | B2/W3/S5与UI定稿 | 增加入口不能移除四象限/番茄钟/便签/提醒/统计；新JS资源白名单漏项；不得把Web全量UI重构并入首版门槛 | Windows桌面复杂管理、Android快记/办理/拍照及离线/同步状态可用；完整资源清单/APK内资源验证；正式Web当前本地Node形态和旧操作可用，共享业务/数据/同步回归通过；Web专门的全量布局重构推迟 |
| U6-02 | 设置与诊断：existing sync/conflicts/settings入口、windows/dialogs.c/storage.c；计划新增 `src/diagnostics.mjs`、`windows/diagnostics.c`和Android诊断桥 | S5、D1 | 日志泄露凭据/私人材料；恢复覆盖当前数据 | 设备/LAN/WebDAV/备份恢复/提醒/布局/数据/日志/关于可操作；诊断可脱敏导出；失败原因与持久状态一致 |
| U6-03 | 工作统计与专有计时保全：src/personal-ui.mjs、windows/dashboard.c；Android PomodoroTimer/PomodoroTasks/DailyTaskSummary，新增业务统计查询 | B2/W3、D1事件 | Android计时状态未进现有replica，不能宣称三端统计天然一致 | 完成数/率/逾期/项目/工作流时长/类别/番茄钟/时间投入各指标定义及fixture一致；是否同步计时结果由主Agent定义，设备状态不被误迁移 |
| U6-04 | 版本/历史/复制：scripts/build-android.mjs、build-windows.mjs、package-release.mjs；Android Manifest/MainActivity；计划新增 `android/src/local/gxtodo/replica/VersionInfo.java`、`android/assets/version-history.json`及三端关于入口 | C0-02、U6-01 | APK现只有外部build JSON时间；新签名会破坏覆盖升级 | 显示实际versionName/code、by codex·Git前五位、构建注入的编译时间/时区；离线历史和复制；沿用原签名/递增code；无证据明确未记录 |

当前正式Web依赖本地Node/SQLite，GitHub Pages不等于现有完整应用。首版U6以Windows/Android体验为主要目标，Web保全和必要兼容持续执行，全量Web UI重构推迟。浏览器独立离线/PWA、LAN发现能力和服务托管属于明确扩展评估，不能为静态部署擅自重写后端。

## 阶段7：综合验收与发布

| ID | 任务及文件范围 | 依赖 | 风险 | 验收 |
|---|---|---|---|---|
| A7-01 | T01–T16自动化与证据：现有tests/windows自测；计划新增 `tests/acceptance/`、原生/Android测试harness、`docs/upgrade/test-results/`；Actions矩阵 | D1/B2/W3/S5/U6 | 不能拿mock/历史/源码检查替代设备实测 | 每项环境/提交/夹具/方法/时间时区/exit/失败/日志和artifact链接；passed/failed/skipped/blocked分开；T映射见下表 |
| A7-02 | 异常退出/性能/旧功能全回归：windows/profile.c、selftest/advanced/storage/detail工具；Android现tests/android及QA工具；共享JS/同步测试 | A7-01 | 100000任务/多实体/大附件的全量投影及内存；提醒/计时后台行为 | 云端100/10000/支持上限夹具耗时/内存/队列增长记录；杀进程/磁盘失败恢复；旧功能分别结果，未测项不写通过 |
| A7-03 | Windows/Android首版发布与正式Web兼容包保全：scripts/package-release.mjs、build-windows.mjs、build-android.mjs，正式Actions发布入口及版本历史 | A7-01/02、U6-04；原签名可用 | unsigned APK不可发布安装；Web源包不是含Node运行时包；包内带真实数据；Web全UI重构不作为首版发布条件 | 云端实际Windows/Android发布及Web兼容产物/签名/版本/hash/许可清单，干净环境启动/覆盖升级；正式Web共享业务/数据/同步与旧功能回归齐备；无生产DB/凭据/私钥；保留恢复与回滚说明；构建缓存留云端、本机不下载编译目录 |

## T01–T16追踪及环境要求

下表是计划，不是执行记录。GitHub托管runner可做协议/迁移/故障注入、Windows测试和适用Android模拟器；它不在用户家庭Wi-Fi。真实mDNS/手机网络切换/设备授权/后台行为需由GitHub触发的专用远程设备环境或self-hosted runner，新增设备/网络范围须明确授权；不转到本机编译或测试。没有该环境的项目记blocked/未执行，不以云端mock代替真机通过。

| 测试 | 主要任务 | 必须证明 |
|---|---|---|
| T01 Windows新增→Android | C0-03、L4-06、A7-01 | 实际C生成事件，经Android Java生产存储桥持久化后重启/导出，JS同向量核对稳定ID/字段和复制状态 |
| T02 Android离线补同步 | L4-06、S5-03 | 离线保存/重启/恢复网络，待投递仍在并最终到达 |
| T03 LAN不访问坚果云 | L4-06 | LAN隔离/广域网禁用、真实交换及流量证据 |
| T04 WebDAV远程变更 | S5-01 | mock合约及经授权真实专用云目录互通分开记录 |
| T05 双通道并发 | S5-02 | 去重、独立目标进度、重复ACK不重复推进 |
| T06 多端修改 | C0-04、S5-04 | 冲突版本均保留、显式选择后收敛 |
| T07 删除不复活 | S5-04 | 迟到旧事件/快照/乱序下墓碑仍有效 |
| T08 Windows重启 | L4-06、S5-03 | pending/body/receipts/session持久恢复 |
| T09 Android换Wi-Fi | L4-05 | 真实重新发现或手动回退，旧身份正确校验 |
| T10 撤销设备 | L4-04 | 旧凭据再次访问被拒绝，数据不泄露/修改 |
| T11 模板版本 | W3-02 | 运行保存启动快照，新模板不改旧流程 |
| T12 中途退出 | W3-03 | 每类步骤持久状态退出后继续 |
| T13 跨天流程 | W3-03/05 | 可控时钟/跨日期持久化，未完成不清空 |
| T14 附件中断 | S5-05 | 部分内容/错误hash/重试可恢复且无伪完成 |
| T15 升级失败 | D1-03/04/08、C0-07 | 备份一致、故障原子、恢复后可再迁移 |
| T16 旧数据迁移 | D1-05/06/08 | 全部支持旧版本数量/ID/关系/时间/历史完整 |

## Agent文件边界与推荐顺序

主Agent维护数据/协议/业务状态合约、审查公共接口并串行合入公共文件。数据库Agent负责migrations和三端存储适配；同步Agent负责传输/账本及兼容向量；业务/工作流Agent优先各自新增领域模块；Windows与Android/Web Agent负责已定稿界面和原生接入；测试Agent负责独立夹具/harness/记录。`model.mjs`、`replica.mjs`、`database.c`、`ReplicaDatabase.java`、`MainActivity.java`不能被多个Agent同时写，分阶段交接文件所有权。

顺序：C0云端原基线 → C0-03 Windows C/JS/Android Java实际存储共同向量 → C0-04/05/06/07各自独立commit与相关云test/审查通过 → D1备份/迁移/保全通过 → B2业务 → W3流程 → L4合约/账本/安全LAN → S5保留WebDAV并验证双通道 → U6 Windows/Android完善及Web必要兼容 → A7完整验收与签名发布。每任务按07交付修改清单、真实云测试和残留风险；Web持续参加共享业务/数据/同步回归，全量UI重构推迟。有依赖缺失时明确失败/未执行，不下载或替换工具链来伪装通过。
