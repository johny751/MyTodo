# D4-03 个人效率工具就绪与原生准入报告

记录日期：2026-11-25，Asia/Shanghai。范围：独立便签、番茄钟、优化意见及图片、提醒与循环入口、个人统计、合成同步/设备、合成备份和版本身份。主 Agent 集中发布的精确源码 SHA、Actions 运行、产物和逐条结果是运行证据；本文不会用静态源码代替运行结果。

原版冻结提交 `d4c5af4cbbb9192c19276dd371bd142c2b835534`；D4-01 发布提交 `03a72afca3f538cd0903624c89cb0d8bb068e470`。原版代码索引及快照身份限制见 `original-personal-coverage.md`。没有连接、读取或修改真实用户数据库。

## 判定与数据边界

PROPOSAL：个人效率页面已在隔离提供器 `prototypes/d4-01/personal-pages.js` 写入可操作代码。可进入集中 Actions 验证和隔离体验交付；仍不能宣称 D4-03 三端原生完整验收。

FACT：本次静态检查 `tests/d4-ui/personal-cases.mjs` 有 20 个 `a.check`，没有在本机执行这些测试、编译、SQLite 或打包。通过数、失败数、截图、原始失败日志和运行链接由云端运行决定；20 是准备的用例数。

| 数据/接口 | 当前隔离归属 | 生产边界与证据状态 |
|---|---|---|
| 独立便签 | `repo.state.notes` 的 id/body/createdAt，使用冻结纯模型及独立体验存储 | FACT：独立于任务备注和任务生命周期；UNVERIFIED：新 UI 的原生实际存储 API 接入 |
| 番茄钟、历史、统计 | `repo.demo.personal.timer`；文档级 monotonic anchor 与重开后的 wall anchor | PROPOSAL：只属于合成体验。原 Android `android-tools/timer.state`、账号/任务关联、服务、通知保持原实现 |
| 意见、草稿、图片、导入前备份 | `repo.demo.personal.feedback` | PROPOSAL：原字节、base64、size、SHA-256；不访问原 Web 反馈键、Windows 独立目录或 Android FeedbackKit SQLite/assets/links |
| 提醒通知卡片/receipt/snooze | `repo.demo.personal.reminderLedger/reminderNotices` | PROPOSAL：页内体验，不申请系统通知，不覆盖原账号提醒键或原生 AlarmManager delivery 台账 |
| 同步、冲突、设备 | `repo.demo.personal.sync/devices` | PROPOSAL：模拟状态，无 transport/凭据/远端连接。pending=0 不代表 ACK、outbox 已确认或远端进度 |
| 备份/恢复 | 当前合成工作区 state + demo 快照 | PROPOSAL：只接受独立体验 kind，拒绝生产格式。不能证明 SQLite/WAL/多文件、附件和复制进度恢复 |
| Android 隔离桥 | `GxD4Preview.isPreview/openNativeTimer/versionInfo/openVersionInfo` | PROPOSAL：隔离壳能力；不调用生产 `GxNative`。桥 Mock 断言不能建立实际 APK/原生运行结论 |

## 按功能的就绪证据

| 能力 | 静态实现/原版规则 | 20 条回归中的验证准备 | 本轮准入缺口 |
|---|---|---|---|
| 便签 | PROPOSAL：独立入口、列表/搜索、新建/编辑/删除、创建时间降序、转义、Ctrl+Enter；删除任务不删除便签 | 3 条：字段集、文本转义、编辑保留创建时间、重开、搜索、删除、任务独立性 | UNVERIFIED：Windows 原便签窗口和 Android 原任务存储 API；原版颜色/分类等未获证据，不编造 |
| 番茄钟恢复 | PROPOSAL：开始/暂停/继续/提前结束、配置、单次完成、保存 anchor、页面切换/重开；1–180 分钟、默认 25 | 4 条：monotonic/系统回退、wall恢复、午夜分摊、countup/休息偏好、实际控件与重开 | BLOCKER：实际 Android 前台服务、通知控制、后台/锁屏/重启、任务关联；网页与隔离原生预览状态仍分开 |
| 专注统计 | FACT：原 `PomodoroClock.java:180,227-276` 倒计时完成计数、北京时间 earned 区间分摊、最近32天；PROPOSAL：采用相同基础口径，休息不计专注、正计时不增倒计时完成轮次 | 纯时钟断言检查午夜前后各30秒、一次完成、正计时与休息零倒计时完成数 | UNVERIFIED：原生聚合与 HTML 的真实跨端比较；正计时“完成本轮”及逐轮历史属于新增体验 |
| 页内提醒 | FACT：原 `src/reminders.mjs:3-15` 五秒及focus/visibility检查、cap5、receipt、十分钟稍后；PROPOSAL：隔离台账保留同类行为 | 2 条：纯计算与实际 snooze/acknowledge/open-task；完成/删除清理、重放不重复、五卡片上限 | BLOCKER：系统通知、Android权限/AlarmManager/后台精确提醒；不把网页通知卡片计作原生回归 |
| 循环任务 | FACT：根 Demo 延用冻结纯 task/schedule 完成链；个人页提供原有提醒/循环入口 | 根测试负责任务 repeat、原值和子任务递归；本文件提醒测试复用仓库 reminderAt | UNVERIFIED：实际三端业务 API 回归；不能仅凭本文件声称循环实现完整 |
| 意见原有细节 | FACT：原 `src/feedback.mjs:7-27,57-64`；PROPOSAL：标题或正文必填一项、trim、正文首行默认标题、200/50,000码点与800/200,000字节限制、UTC ISO规范化、修改时间递增 | 2 条字段补充：仅标题/全空、默认标题、旧编辑器防覆盖、emoji边界、非法时间/NULL、时间回退后递增 | BLOCKER：原 Web 多窗口写锁、Windows互斥/原窗口、Android完整 FeedbackKit 菜单；当前只是同文档冲突保护 |
| 图片和意见恢复 | PROPOSAL：PNG/JPEG/WebP/GIF原字节、草稿继续、编辑保留、导出原文件、完整性校验、导入前备份；同时间保留双版本且重放不复制 | 3 条：小 PNG 文件草稿/编辑/重开字节一致、损坏hash拒绝不覆盖、同时间冲突及重放/删除独立性 | BLOCKER：Android ZIP包含草稿/截图/assets/links的真实恢复；大图/配额/断电/多文件持久化未证实 |
| 同步与设备 | PROPOSAL：明确合成状态、错误/历史/配置、全部候选保留、设备本地演示改名 | 2 条含快照：失败保留task/pending，选择保留两版，成功只改demo，无password输入 | BLOCKER：经过认证的只读真实状态提供器、原业务同步/设备接口及 C0-04 回归；本模块不启用这些能力 |
| 合成快照 | PROPOSAL：同工作区恢复全部个人域；完整验证后才替换；拒绝生产格式及非法timer/draft | 设备/备份复合条和2条拒绝用例：原值比较、全部域恢复、malformed timer/NULL draft拒绝 | UNVERIFIED：存储故障恢复、崩溃原子性；D2生产恢复仍独立审核 |
| 关于与版本 | PROPOSAL：云注入SHA/构建时间、离线历史、复制；隔离APK身份优先并保留HTML身份 | 2 条：网页注入值/历史、模拟APK桥身份/按钮调用 | UNVERIFIED：实际 APK 的 versionName/versionCode/签名/构建时间与已知历史一致性，需要 Actions产物证据 |

上述分类中存在一个复合备份用例，两张表的分类提及可以交叉，最终总数仍按源码的20个 `a.check` 计。测试不得降低断言以掩盖原行为差异；源码或运行不符合即记录失败。

## 本次聚焦修订

FACT：复读冻结 `src/feedback.mjs` 后，修正了早期“正文必填”的审计错误。标题单独存在是有效原有能力；保存 trim 并按原规则补默认标题。UTC时间、码点/字节限额、单调编辑时间、同时间冲突去重与递增副本时间均有源码对照。本轮代码与断言只在隔离文件修改。

PROPOSAL：图片处理等待期间会再次对比记录；编辑器还保留打开时的记录基线，防止同文档的较早编辑覆盖较新操作。尚未实现原反馈 store 的跨窗口锁，不能声称具备原多写入者屏障。

PROPOSAL：新增 `focusMode` 保存正计时偏好，休息完成后恢复；countup“完成本轮”只记录新增历史，不能增加原倒计时完成数。网页以 anchors 持续计算，不依赖番茄钟页面常驻；真实后台、锁屏与重启仍须原生证据。

FACT：`domain.mjs` 的存储写失败会降级内存。PROPOSAL：本模块在个人域更新、便签保存、工作区导入/恢复后的保存提示中明确提示降级及重开可能丢失，建议立即导出。小图重开用例不证明存储配额或断电下的持久性。图片单张4 MiB/单意见8 MiB、合成JSON输入20,000,000字节是体验保护值，不能代替原 Android/Windows/Web 存储合同。

PROPOSAL：合成意见导入拒绝 NULL/缺失标题或正文；原 `normalizeIdea` 会把它们默认成空字符串。此处是独立体验格式拒绝策略，保留为明确差异，禁止解释成生产兼容迁移。

## BLOCKER 与负责人决策

| 编号/分类 | 缺口 | 解除所需证据或具体决策 |
|---|---|---|
| P-B01 BLOCKER | Android真实后台番茄钟/通知/锁屏/重启、权限和任务账号关联未由新UI验证 | 复用原 PomodoroTimer/Clock/CompanionService 的兼容适配；在隔离账号/合成任务下完成实际原生回归和日志；禁止触及真实用户库 |
| P-B02 BLOCKER | 网页与原生隔离计时状态独立 | OWNER DECISION：确认统一状态适配API及设备本地域；明确新增休息/历史与原倒计时统计的关系，保持原 accountId+taskId 验证 |
| P-B03 BLOCKER | Android FeedbackKit独立SQLite/assets/links/草稿ZIP未接入新UI；issue #1仍开放 | 对实际AAR菜单和恢复运行补证据，验证原图SHA/多文件持久性/失败不替换；保留 issue #1，不能绕开 |
| P-B04 BLOCKER | Windows原生便签/意见窗口与实际存储API回归未完整 | 云端native合成数据回归和可操作产物；新UI通过适配层复用原Win32入口 |
| P-B05 BLOCKER | 原生提醒/浏览器可选系统通知未在该模块启用 | 原Android AlarmManager/通知权限/后台交付回归；Web页内回归只证明当前隔离页 |
| P-B06 BLOCKER | 真实认证同步状态/设备能力仍未接入 | OWNER DECISION：批准的认证只读提供器方案；真实连接或同步启用另行审批。不可直接读写复制数据库，不改ACK/outbox/cursor/manifest/batch |
| P-B07 BLOCKER | 原图持久化、多窗口反馈写入屏障、崩溃一致性未证实 | 隔离存储故障/配额、并发编辑、Android附件恢复等完整运行证据；保持错误日志与未解决项 |
| P-U01 UNVERIFIED | 原历史notes颜色/分类/自定义组织与真实历史库字段 | 有针对性的源码/历史证据；当前未发现字段不能推导所有旧版本没有功能；无权读取真实用户库 |
| P-U02 UNVERIFIED | 真实设备列表、远程管理、后台原生附属工具能力 | 先确认原业务接口和完整菜单覆盖，不能把synthetic设备改名视为远程管理 |

OWNER DECISION：不需要为隔离文档、代码和 Actions 验证逐项等待；主 Agent 可继续集中验证与交付。任何真实库结构/迁移、生产同步启用或协议变更仍需要单独明确授权和影响/回滚证据，不能从本报告推导授权。

## 证据发布与停止条件

集中交付需带精确源码SHA、20条个人用例的实际结果及根用例/原生用例独立统计、截图/录屏、平台差异、历史失败日志、Actions链接和SHA-256清单。浏览器触摸模拟与APK桥Mock、原生纯模型、实际Android/Windows控件、后台真实运行须分别列出，不能聚合成“三端全部完成”。

FACT：本模块没有改生产同步或生产数据库，未合入D2代码，未启用LAN/WebDAV，也未关闭Android issue #1。UNVERIFIED/BLOCKER保留至满足对应证据；完成本次允许的隔离包后等待统一审核。
