# 现有三端架构审计

日期：2026-11-23，Asia/Shanghai。基线为 master ZIP 提交注释 `5480c88c806cf1c366ec998b0ba627543d63233a`，来源/逐文件校验见本任务 `evidence/source-snapshot-manifest.json`。ZIP 无 `.git`，不能据此确认 Codespaces 未提交变更或完整 Git 历史。本报告是实际源码静态审计；本子任务未编译、测试、安装 APK 或联网，历史 README 验证记录不当作本轮结果。

## 当前结构与调用

项目已具有三种实际运行形态，应沿用并渐进扩展。用户最新明确第一版以 Windows 和 Android 为主要交付平台；正式 Web 保留现有运行形态，继续参与共享业务、数据契约、旧功能和同步兼容回归。Web 全量界面重构暂不与 Windows/Android 列为同等优先级，不作为首版新界面完整性的共同门槛。

| 端 | 真实实现 | 调用及证据 |
|---|---|---|
| Windows | C/Win32、SQLite、cJSON、zlib；独立原生 EXE，无需 Node | `windows/main.c:3` 的 wWinMain 分派 CLI/gui_main；`windows/database.c`、`windows/sync.c` 是独立 C 数据/同步实现 |
| Web | 根 HTML/CSS、Vanilla ES modules，加本地 Node HTTP/SQLite 服务 | `app.mjs`→`storage.mjs`/`sync-client.mjs`→`/api/sync`→`server.mjs`→`account-store.mjs`→`sqlite-store.mjs`；Node 内置 `node:sqlite`/DatabaseSync（sqlite-store:1,6–8），package.json 无第三方运行依赖，Node>=22.13 |
| Android | Java 原生壳/计时/通知/SQLite，加随 APK 打包的共享 Web UI | `MainActivity.java:62,129–135` 的 GxNative 请求ID、单线程 executor、异步结果事件；`AccountStore.java:48` 路由 replica 到 ReplicaDatabase、网络到 SyncStore |

Android 目前不是 Gradle 工程：`scripts/build-android.mjs:26,45–69` 明确采用手工 AAR 合并及 aapt2→javac17→D8→jar→zipalign→apksigner；master 快照未发现 Gradle 文件/wrapper。源 Manifest:1,10 声明包名 `local.gxtodo.replica`、0.9.2/code15、min26/target34。

## 本地存储和离线的准确含义

- Web 正式运行版已存在，不只是 Demo，但任务存储在本机 Node 管理的 SQLite，不在浏览器 IndexedDB。`storage.mjs:8–23` 通过 replica API读写；`app.mjs:242` 在本机服务停止时显示读取失败。互联网离线可使用，不能推断关闭本机服务后浏览器仍可独立使用。
- Android UI 资源在 APK：`MainActivity.java:68–87` 只拦截专用 HTTPS host 的允许 assets；46–52 禁止 DOM storage、普通文件/内容访问及混合内容。任务持久化由 Java SQLite 承担，能够独立离线加载页面。
- `server.mjs:21,26,63` 的 Origin/Host检查及127.0.0.1绑定明确限制本机访问。它不是 LAN 同步中心，也未适配 Codespaces 外部转发域名；不能通过删除限制代替配对、TLS和设备授权。
- 本地账号是隔离档案而不是团队身份：Web account-store:18–27,50–61、Android AccountStore:18–33,38–48 支持账号目录、创建/重命名/切换；无团队登录/角色权限。
- Web“优化意见”使用浏览器 localStorage/Web Locks（feedback-ui:14,27；feedback:57–75）；Android使用独立Feedback AAR沙箱。这一模块不是工作往来、工作档案或任务同步实体。

## 共享业务与扩展边界

`model.mjs:63–82`、`replica.mjs:8–29` 的现有实体是 tasks、notes、projects、tags、places。任务已有嵌套子任务、四象限、时间、重复、提醒、分值、备注、复盘、分类；已有项目包含稳定ID、名称、描述、归档，但任务按项目名称关联，尚无目标/阶段/成员/截止日期/工作附件。

模型只保留明确字段，replica 校验只允许既有kind。因此模板/流程、Contacts/FollowUps、工作附件/档案不能只加UI或直接塞任意JSON：必须共同处理归一化、schema、同步兼容、C/Java投影及旧客户端门槛。应保留成熟任务结构并逐个增加最小业务切片。

Web/Android共享JS增量核心（sync-client:5–9），Windows另有C实现。相同格式不代表互换已经验证，协议兼容由03审计和云测试建立。共同协议测试向量必须通过 Windows C、JS 和 Android Java 实际存储适配的应用/导出路径，不能以共享 JS 成功推断 Java SQLite 已通过，也不能用普通 Java 计时测试替代存储协议测试。Android前台自动同步与CompanionService的计时/通知职责应分开，后者不是常驻同步服务。

首版 Android 界面会复用共享 JS，相关模型、资源与存储桥改动必须同步保全正式 Web；只进行保证其可运行和契约兼容所需的界面接入，不借此安排 Web 全量布局重构。公共文件归属、独立提交和真实云端验证遵守 [07 开发规范](07-development-standards.md)，具体前置任务见08/09。

## 必須保留及需要新增

| 目标 | 可复用基础 | 需要增加 |
|---|---|---|
| 工作台/项目 | 既有四象限、统计、项目卡片和归档 | 综合工作台布局、项目目标/阶段/成员/截止时间、稳定关系迁移 |
| 模板工作流 | 编辑、子任务、提醒及SQLite事务 | 模板不可变版本、运行快照、字段/步骤/事件、等待跟进与归档；不可写死报销 |
| 往来/档案 | 备注、便签、JSON导入导出、分类搜索 | 联系人与等待对象、FollowUp、工作文件元数据和独立内容传输 |
| LAN | 已有replica/设备事件和WebDAV v2 | 专门传输与安全层、Windows可选服务、Android发现配对；不直接暴露本机API |
| 正式 Web 保全与必要兼容 | 已有本地服务运行版和共享JS | 持续验证共享业务/数据/同步及既有入口；Android共用资源变更保证可运行。全量Web UI重构推迟；GitHub Pages不能直接提供现有后端 |
| GitHub构建 | Node内置依赖、随库C库及反馈AAR、独立脚本 | runner工具定位、SDK精确组件、原签名注入与按平台打包；master无工作流 |

Android专有能力有实际原生实现：PomodoroTimer:12–44,219–256持久化计时/完成统计/投递标记；PomodoroTasks关联真实账号和嵌套任务；AndroidCompanionService:64–77,201–231提供常驻待办、暂停/继续通知；FloatingBallController、TodoWidget、ReminderScheduler/Receiver应独立回归。它们的设备本地状态没有进入现有replica，不能从共享JS推断三端计时能力和统计已一致。

当前发布脚本 `package-release.mjs:21–48` 把Web打成包含Windows Node24及凭据helper的运行包；Web可Linux云测试与现有Web-Windows分发包需Windows工具，应区别处理。Android版本信息也需补充APK内构建时间/Git标识/版本历史/复制入口；目前builtAt仅在外部build JSON。详细条件见主Agent构建报告及本任务 `work/android-build-audit.md`。

用户最新要求编译、测试、打包全部在GitHub执行。本子任务只做静态审计及已有AAR哈希核验；本轮实际运行结果统一在05中记录，不以环境可用代替项目成功。阶段0云端基线尚未完成，CI草稿未提交、未触发；C0-04/05/06/07兼容修复须各自独立commit、完成相关云端test并留存证据后，才进入D1实施，不能与数据库或大规模业务/UI改动一起落地。
