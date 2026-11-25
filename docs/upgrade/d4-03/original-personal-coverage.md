# D4-03-A 原版个人工具、提醒与同步功能覆盖审计

审计日期：2026-11-25，Asia/Shanghai。此文件是集中完整性矩阵的个人工具部分。

冻结原版基线：`d4c5af4cbbb9192c19276dd371bd142c2b835534`。D4-01 交付基线：`03a72afca3f538cd0903624c89cb0d8bb068e470`。本次静态读取的是保存的 `MyTodo-master` 源码快照；主 Agent 负责逐文件核对其冻结提交身份。身份未核对之前，源码结论限定为该快照的事实。未打开或查询任何真实数据库。

标记约定：FACT 是有源码/既有测试代码支持的结论；PROPOSAL 是本轮设计或隔离实现；UNVERIFIED 是缺少本轮运行证据；OWNER DECISION 是负责人决策项；BLOCKER 是未解决便不能声称 D4-03 全面验收的差距。旧测试代码是证据索引，不是本轮重新通过的测试结果。

## 原版入口与调用关系

| 功能 | 原版页面入口与代码位置 | 业务调用 | 存储位置/生命周期 |
|---|---|---|---|
| 独立便签 | FACT：`src/app.mjs:94,125-126,208,237-238`；Windows `windows/gui.c:3,73,82`；Android 加载同一网页页面 `MainActivity.java:36` | Web `note-form → commit → writeState`；编辑只改 `body`；按 `createdAt` 降序展示；Windows `ui_open(key,...,note=1)` 保留便签专用入口 | FACT：`src/model.mjs:78` 的字段仅为 `id/body/createdAt`；`src/sqlite-store.mjs:8,25` 和 `ReplicaDatabase.java:13-16,73-74` 的实体行；便签不是任务的子对象 |
| 番茄钟 | FACT：Web 导航只在原生桥存在时展示 `app.mjs:94,215`；`MainActivity.java:102` 打开 `AndroidToolsActivity` timer 页 | `AndroidToolsActivity → PomodoroTimer → PomodoroClock`；`AndroidCompanionService.java:55-120` 独立前台服务 tick 并通知；通知控件 `NotificationTimerControls.java` | FACT：`PomodoroTimer.java:13-39` 使用设备本地 `android-tools` SharedPreferences 的 `timer.state`，不进入任务同步数据 |
| 优化意见 Web | FACT：`app.mjs:94,162` 打开 `FeedbackUI`；`feedback-ui.mjs:17-43` 列表/编辑/搜索/状态/导入导出 | `FeedbackUI → withFeedbackWriteLock → FeedbackStore`；编辑器脏状态检查；`pending/resolved`；JSON 合并时同编号较新覆盖，同时间不同内容保留副本 | FACT：`feedback.mjs:3-4,57-81` 独立意见键和导入前备份键；16 MiB 限制。未发现 Web 图片字段，不把 Android 图片能力伪称 Web 原有能力 |
| 优化意见 Windows | FACT：`windows/feedback.c:34-40` 独立窗口、搜索/编辑/复制/状态/删除/导入导出 | `ui_feedback → FeedbackStore`；进程互斥；离开脏编辑器时可保存/放弃/取消；独立持久化和导入前保护 | FACT：`feedback.c:40` 指向 `%LOCALAPPDATA%/GxTodoLocal/feedback`；与任务/同步域分离（文件顶部注释及实现） |
| 优化意见 Android | FACT：`FeedbackToolsActivity.java:47-58` 查看意见/记个想法/导出/恢复；Feedback Kit 1.2.0 AAR | `FeedbackKit.openList/newIdea`；`FeedbackApplication.java:37-58` 应用级 worker；恢复时反馈页面写入屏障；系统文件选择器 `FeedbackToolsActivity.java:109-165` | FACT：host 明确备份包含意见、草稿、截图，恢复替换该独立域；`docs/android-feedback-092-20261113/native-qa/FeedbackQaInstrumentation.java:48-57` 指向独立 SQLite 记录、assets、links、图像/草稿/损坏备份保护的历史测试源码；AAR 内部实现与本轮运行仍 UNVERIFIED |
| 提醒 Web | FACT：`src/reminders.mjs:3-15`，由原 app 初始化 | 5 秒复检、focus/visibility 复检；页内卡片“查看/10分钟后/知道了”；可申请系统通知；`taskId + reminderTime` 稳定 receipt；已送达不重复 | FACT：按数据账号独立的提醒本地台账；此模块直接读原提醒命名空间，因此本轮不导入该副作用模块，只复用纯计算并隔离台账 |
| 提醒 Android | FACT：`MainActivity.java:125-126,191` 与 `ReminderScheduler.java:15-24` | 原生通知权限/精确闹钟权限；`AlarmManager` 安排；接收器火时更新 delivery 台账 | FACT：当前账号任务库 + `AccountStore.reminderPrefs` 的设备/账号本地 receipt；不得用浏览器台账替换 |
| 同步入口与配置 | FACT：`app.mjs:30-56`；`windows/dialogs.c:29-32`；`MainActivity.java:129-135` | 原 Web `runSync → exchange`；提交刷新已落地状态；Windows 使用既有配置/同步层；Android executor 经既有账号同步入口返回 JS 结果 | FACT：设备本地配置包含 enabled/autoSync/username/folder/configured；应用密码仅设备保存、不进入任务备份；同期数据含任务/子任务/便签/项目/标签/地点，交互设置独立 |
| 同步冲突 | FACT：`app.mjs:295-302` | 展示同字段所有值，并经原 `resolve-sync` 业务入口选择；字段包括删除、父子、顺序、重复、提醒等 | FACT：复制元数据与业务投影必须同时保护；本轮 UI 不写底层复制数据库 |
| 自动同步 | FACT：`app.mjs:37-43,56` | 原 Web 仅前台/在线调度，约 5 分钟检查；后台/离线暂停；编辑合并/重试退避 | FACT：不是一直后台上传。当前合成配置仅保存偏好，不能启动真实自动同步 |
| 设备 | FACT：`app.mjs:56` 明确各设备独立进度；Android `MainActivity.java:129-135` 使用原同步层 | UNVERIFIED：未找到已核实的远端设备列表、远程移除、设备重命名管理 UI/接口证据 | 合成设备演示名单必须标记 synthetic；不把它等同真实已连接设备 |
| 交互设置/帮助 | FACT：`app.mjs:141,221-222`，`src/model.mjs:24-25`；Windows `dialogs.c:33` | 原 swipeMenu/swipeComplete、longPressMs/undoMs 与恢复默认；帮助独立入口；Android tools 还含通知/悬浮/使用统计权限 | 任务交互设置与设备工具偏好不是同步业务实体；Android tools 的原生权限/浮窗功能不能由 Web 页面宣称完成 |

## 本轮恢复与回归矩阵

`personal-pages.js` 是新增隔离提供器，使用 `DemoDomain` 的成熟纯任务模型和 `repo.demo.personal`。此表“已实现”只指源码已写入，运行结果统一以 Actions 报告为准。

| 功能/原有规则 | D4-01 实现/是否缺失 | D4-03 恢复方案与源码实现 | 自动化回归准备 | 三端验证状况 |
|---|---|---|---|---|
| 便签独立 CRUD/时间排序 | 缺少独立入口与 CRUD | PROPOSAL：notes 路由、编辑/删除确认、独立 id/body/createdAt、创建时间降序、Ctrl+Enter；删除任务不触及便签 | `personal-cases.mjs`：转义、编辑保留创建时间、重新打开、搜索、独立性、删除 | Web/mobile browser：待 Actions；Windows/Android 原版 API 回归及新 UI 接入：UNVERIFIED |
| 便签颜色/分类/拖动排序 | 未核实原版有此功能 | FACT：已审计的 core schema 不保留这些字段；不添加伪称原有的生产字段；其他历史版本待调查 | 记录字段集，仅允许成熟 schema | UNVERIFIED：未证明所有历史版本都没有附加功能 |
| 倒计时/正计时/暂停继续/结束 | D4-01 缺少番茄钟 | PROPOSAL：独立 timer anchors、history、计时配置及 taskId；1–180 分钟和 25 分钟默认；同页面 monotonic，reload wall 恢复 | 注入纯合成时钟：系统时间回退、暂停不增长、reload 恢复、完成只一次、正计时完成/重置历史 | Web：待 Actions；Android 后台/锁屏/重启：BLOCKER，仍需原生证据 |
| 番茄钟北京时间日统计 | 缺失 | FACT：原 `PomodoroClock` 将 earned 区间跨北京时间午夜分摊，保留最近 32 天；PROPOSAL：合成时钟采用同口径，不把休息计入专注 | 午夜前后各 30 秒准确分摊，完成轮次一次记录 | 纯模型待 Actions；原生兼容运行待验证 |
| 休息计时/显示历史列表 | 原生时钟未证实休息配置；有日聚合统计 | PROPOSAL：明确作为新体验扩展；保留原 countdown/countup。不能把新增历史列表伪称原原生已有 | 开始休息/结束；独立 phase，历史不覆盖 | OWNER DECISION：原生扩展后续如何接入现有统计与任务关联 |
| Android 番茄钟任务关联 | D4-01 缺失 | FACT：原关联是 accountId + id，账号切换/任务删除期间原子验证；合成当前单工作区只用 taskId，不把它作为生产桥契约 | 合成任务删除仍保留计时历史，picker 缺失关联拒绝 | BLOCKER：原生账号/任务关联桥回归未完成 |
| 意见列表/CRUD/搜索/本地处理状态 | 缺失 | PROPOSAL：feedback 路由、本地 pending/resolved、复制、标题可空、正文必填 | 草稿/编辑/图片保留、删除不影响 tasks、列表截图 | Web：待 Actions；Windows 原窗口、Android FeedbackKit 接入：UNVERIFIED |
| 意见导入导出/同编号冲突 | 缺失 | PROPOSAL：只接受 `mytodo.d4.synthetic.feedback`；完整验证后合并；导入前备份；同 timestamp 不同内容副本保留 | 同时间冲突双版本、损坏图片拒绝且状态与备份均不变 | 不宣称支持原 Web/Windows 生产格式或 Android ZIP 恢复 |
| Android 意见草稿/原图 | 缺失 | PROPOSAL：合成反馈草稿、原字节 base64 + size + SHA-256，导出原始图片；无压缩/缩放覆盖；备份完整性验证 | 加入真实小 PNG 的浏览器 File，存储/编辑/重开字节相等、坏 hash 拒绝 | BLOCKER：Android AAR 原始 assets/links/草稿 ZIP恢复与新 UI 集成证据仍需独立验收 |
| 提醒计划/循环 | D4-01 已用冻结纯 schedule/成熟 task 完成链；提醒中心只列计划 | PROPOSAL：继续原计划入口；新增隔离页内调度，5秒、focus/visibility复检、receipt、10分钟稍后、知道了/查看 | 准备 cap5、稳定 receipt、防重复、snooze、已完成/删除清理；原 task repeat/ref reminder 用父级既有回归 | Web UI：待 Actions；Android AlarmManager/原生通知：BLOCKER |
| 同步状态/手动同步/自动配置 | D4-01 缺失 | PROPOSAL：sync 页面仅模拟成功/错误/冲突；显示明确合成 pending、错误、历史；配置不收凭据；不请求外部网络 | 失败不改变任务/待发送状态；成功只改 demo；无 password/真实运输入口；已有全页面外网阻断 | Web：待 Actions；真实连接未授权，保持 BLOCKER/UNVERIFIED |
| 冲突所有值保留 | 缺失 | PROPOSAL：合成候选全部保留、选择只记录 demo.chosen，业务任务不变 | 选择后两个 values 相等，原 task 数据逐值比较 | 不替代 C0-04 ACK/outbox/cursor/manifest/batch 原协议回归 |
| 设备状态 | 缺失 | PROPOSAL：devices 路由明示 synthetic，当前体验设备名字本地可改 | 设备 rename/模拟 lastSync；操作不触生产数据库 | UNVERIFIED：真实设备 API 能力；OWNER DECISION：认证只读适配后接入方式 |
| 备份/数据管理 | D4-01 合成导出已有，无恢复入口 | PROPOSAL：只接受当前合成工作区 kind；快照同时保留 core + demo（含timer、反馈、snooze、sync）；同工作区恢复；拒绝原版生产格式 | 同工作区逐值比较，恢复全部 demo 域；生产格式拒绝 | 不等同 SQLite/WAL/附件/复制进度的 D2 生产恢复能力 |
| 关于/版本历史 | 只有构建身份提示 | PROPOSAL：读取 D4_BUILD 云注入 identity，不用运行时间编造构建时间；离线版本历史/复制按钮 | 版本 Git前5位与注入SHA匹配，历史可打开 | Android 实际 versionName/versionCode/签名/编译时间需要 APK 证据；未知值显示未记录 |

## 明确未决项与 BLOCKER

1. BLOCKER：新 Android UI 的真实触屏、通知、前台服务、锁屏/重启、浮窗与小组件功能，不能凭本合成页或 Chromium 通过宣称保留。原 source 仍复用，不重写原时钟/AlarmManager/后台服务。Android issue #1 必须保持开放。
2. BLOCKER：Windows 原生便签/意见窗口和生产库桥尚未被新合成页面替代或认证；原 Win32 功能需实际 native 回归。缺少新页面原生证据即不能标“三端完成”。
3. BLOCKER：原 Web 系统通知权限/Android 精确闹钟与后台机制未在本模块启用。此实现只提供隔离页内提醒与纯调度验证。
4. BLOCKER：真实同步配置、自动同步、冲突写回及复制元数据的 UI 适配必须经过既有业务接口；本工作包只有合成演示，不能以 pending=0 宣称 outbox 已 ACK 或远端已前进。
5. UNVERIFIED：原 Web 与 Windows 没有已证实的独立番茄钟模块。Android 原生有成熟计时；跨端新增番茄钟需要兼容业务设计，不能掩盖平台差异。
6. UNVERIFIED：Android FeedbackKit AAR 中所有菜单/颜色/草稿/asset 细节，本轮只审计 host 与历史隔离测试源码。新 Android 菜单仍须按库实际运行盘点；此模块不编造后台管理功能。
7. OWNER DECISION：休息计时和新增历史列表的未来原生接口、数据域与统计口径。当前明确隔离，不新增生产字段。
8. UNVERIFIED：真实用户数据库历史结构及数据格式；禁止尝试用本轮 import 去调查真实用户文件。

## 集成契约与证据边界

新增模块 `window.DemoPersonalPages` 提供 `render/handle/act/submit/tick/key`，操作和表单均 `personal-*`。主 app 给出 `getState/transaction/repo/today/esc/toast/navigate/modal/closeModal/openTask`。`submit` 是 async，应统一捕获错误。每秒调用 `tick(ctx)`；内部提醒每 5 秒复检，时钟显示不保存每秒动画。

主 app 放置全局 `#reminder-notice`；focus 和可见性恢复调用 `DemoPersonalPages.reminders.check(ctx)`；根渲染后可调用 `reminders.render(ctx)` 恢复卡片。本模块不申请浏览器通知，不导入有原命名空间副作用的 `src/reminders.mjs`。

测试文件为 `tests/d4-ui/personal-cases.mjs`，导出 `runPersonalCases(api)`。时钟和提醒的 injected time 只属于纯隔离测试模型，不能绑定原生 timer 或生产同步。所有测试、编译和 runnable 包装只能在 Actions；本地仅静态读取与写文件，本文没有声明本轮测试已通过。测试总数/通过/失败/源码SHA/截图/运行链接由主 Agent 合并进集中证据。

Android 隔离预览壳兼容：PROPOSAL，about 页面仅在 `GxD4Preview.isPreview()` 成立时读取同步只读 `versionInfo()` JSON。APK 的 versionName/versionCode/源码 SHA/云端 buildTimeUtc 优先显示，并保留独立的网页 `D4_BUILD` 身份折叠区域；“APK版本信息”调用隔离壳的 `openVersionInfo()`，不触及 `GxNative` 或生产存储。历史显示只用 APK 携带 `historyText`。新增合成桥适配断言检验两套身份及按钮调用，不能把桥 Mock 通过称为实际 APK 版本验证。
