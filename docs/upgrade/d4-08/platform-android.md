# D4-08-01 Android 静态审计

日期：2026-11-26（Asia/Shanghai）。审计基线：`04c525c55fc136ad1b960b5d727dab3c5e3165fd`，独立候选分支 `d4/d4-08-candidate-1`。本文路径未特别标注时均相对 `work/d4-08/source/`。本文只完成静态审计和云端验证设计，没有在本机编译、运行应用、执行测试或打开 SQLite。

## 1. 结论与证据边界

1. Android 番茄钟并非完全缺失：候选中保留了实质计时内核、原子持久化、历史、统计、原生服务与通知。缺口主要是原版完整用户流程未接到候选主入口，当前原生页面偏验证工具，任务关联依赖网页、原生历史只显示十条。用户“缺失严重”的验收结果应作为整改依据，不能用底层测试通过否认入口及能力退化。
2. FeedbackKit 1.2.0 原始 AAR 仍在 APK 内，原生按钮打开的是完整工具页 `FeedbackToolsActivity`，不是仅调用 `newIdea`。但候选主反馈页仍呈现另一套简化合成流程，两个入口/存储域并列且主次不清；当前 D405 测试只证明原生编辑器保存，未证明图片、草稿、历史、批量删除撤销、恢复全链路。
3. 左导航候选手势硬限定 `x <= 22 CSS px`，系统手势排除矩形仅 `22dp × 200dp`、高度区间约 `80–280dp`。旧自动化固定从 `(3,150)` 开始，恰在这个排除区中。它证明固定位置和页面路由能够打开抽屉，不能证明所有边缘位置、不同系统导航设置和编辑场景都易用。
4. Android 的工作管理来自内嵌 D4 网页业务模块及隔离存储，并非一套已获生产准入的 Android 原生工作数据库。模块是可操作的候选实现，不能称为纯静态页，也不能称为生产功能全面验收。
5. D408 应新增 `android/d408/`、`tests/d4-08/` 和独立构建准备流程。不得改写旧 D405 的四权限清单、无 BOOT 约束、冻结源文件和历史测试来掩盖差异。D408 使用独立包名和 `408xxx` 版本码；新 workflow 的 `run_number` 从 1 开始，不能继续套用旧 D405 的 `405000 + run_number` 导致历史版本码相撞。

## 2. 当前证据与历史失败

同源最终原始报告位于：

`outputs/MyTodo-D4-Native-04c525c-45743320346-a1-r2/audits/android/`

| 证据组 | 源码 / Run / Attempt | 实际结果 | 证明范围 |
|---|---|---|---|
| D403 Android 模拟器套件 | `04c525c` / `45743320346` / `1` | 58 条，58 通过，0 失败 | 冻结候选 WebView 实际 MotionEvent、计时及已列明页面交互；不能外推真机或所有系统手势设置 |
| D405 原生集成套件 | 同上 | 15 条，15 通过，0 失败；main 11 条、进程准备/恢复及 360/412 视觉各独立记录 | 服务、通知、提醒、原生编辑器保存、Activity 重建、真实不同 PID 进程恢复、既有视觉项 |
| D403 纯 Java 计时模型套件 | 同上 | 1 个套件通过，73 个断言通过 | 确定性时钟规则；不是 Android 生命周期或重启实机证据 |
| 正式 Java 源编译 | 同上 | 编译通过 | 源级兼容；不等于原正式应用全部入口的运行回归 |

原始核对文件：`FINAL-ANDROID-RECEIPT.json`、`original-reports/d405/native-evidence/aggregate.json`、`original-reports/d405/result-main.json`、`original-reports/d403/native-test-summary.json`、`original-reports/d403/jvm-test-summary.json`。aggregate 明确 `caseCount=15`、`failureCount=0`、`syntheticEmulatorOnly=true`，被终止的应用 PID 为 `5191`。不把 58、15、73 相加成为一个“通过率”。

历史失败继续保留：`8779f84 / 45737059912` 的 D405 为 10/15；`84de5bc / 45739951988` 为 14/15（提醒超时）；`04c525c / 45743320346` 才为 15/15。前两轮失败不是本次新执行结果。`docs/upgrade/d4-native/D405-INTEGRATION-REVIEW.md` 和 SECOND-RUN-FAILURE 文档形成于第三轮之前，需连同最终 receipt 阅读，不能用旧“待验”表述覆盖最终事实，也不能删除旧失败。

静态检查所用交付 APK：

`outputs/MyTodo-D4-Native-04c525c-45743320346-a1-r2/products/android-native/mytodo-d4-05-native-candidate.apk`

SHA256：`20c9ffa70b13e02d1ed6a507594837e788cc756652e68ad8e116571b067e1480`。

原 AAR：`android/libs/feedback-kit-1.2.0.aar`，SHA256：`4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade`。

## 3. Android 22 项功能矩阵

状态严格使用六类：已实现且验证通过、已实现但未验证、部分实现、仅有界面、完全缺失、因生产准入限制暂不能实现。“已实现且验证通过”仅针对表内明确范围；复合功能仍有缺口时列“部分实现”。原版列以历史源码及已有记录为依据，没有补做原 APK 运行验收。

| 功能 | 原版 / 历史依据 | 当前 Android 状态 | 当前差异及证据 |
|---|---|---|---|
| 四象限 | 原核心能力 | 已实现且验证通过 | 用户人工通过；D403 保留四象限、详情入口。候选 WebView 内执行，非生产数据准入 |
| 象限放大缩小 | 原核心布局能力 | 已实现且验证通过 | D403 single-quadrant 真实触摸用例；保留原交互 |
| 任务增删改查 | 原任务模型及编辑器 | 已实现且验证通过 | 用户任务编辑通过；D403 create/edit/delete/complete 及原字段保真。结果限定合成工作区 |
| 拖动排序及跨象限 | 原成熟手势 | 已实现且验证通过 | 用户通过；D403 held-drag/autoscroll/cross-move。D408 扩大导航起始区不得抢夺任务拖动 |
| 子任务 | 原层级任务及编辑流程 | 已实现且验证通过 | D403 子任务排序与立即关闭用例；需继续保留父子上下文、保存与拖动行为 |
| 标签和项目自动补全 | 原目录/项目输入 | 已实现且验证通过 | 用户通过；D403 `android-touch-and-keyboard-autocomplete`，Windows 对齐此交互而非只过滤列表 |
| 任务备注 | 原任务字段 | 已实现且验证通过 | 用户通过；既有长文本、选择行为与 D405 360/412 工作备注视觉证据须原样保留 |
| 番茄钟 | `AndroidToolsActivity` 完整页、任务选择；`PomodoroTimer` / `PomodoroClock` | 部分实现 | 内核/服务有实测；候选页偏验证、无原生任务选择、未接原版 AndroidToolsActivity。见第 4 节 |
| 番茄钟历史与统计 | 原版保存每日专注/完成统计；未找到原版完整逐会话历史列表的证据 | 部分实现 | D403 增加完整历史数据，原生仅展示前十条和今日统计；网页可看更多。不可反向声称原版已有全量逐会话历史 |
| 优化反馈 | 原 FeedbackKit 列表/编辑/草稿/图片/备份恢复 | 部分实现 | AAR 存在，完整原生工具入口可达；主反馈页简化、全链路当前未验证。见第 5 节 |
| 左侧导航 | `src/gestures.mjs` workspace 横向右滑，不限定极窄边缘 | 部分实现 | 固定坐标跨页面验证通过，用户仍难触发；起始区/系统 Back 冲突需整改。见第 6 节 |
| 工作台 | 工作管理扩展设计；不冒称原正式版已有全部模块 | 部分实现 | `prototypes/d4-01/app.js:65` 汇总/导航为可操作合成实现；Android 原生服务适配不等于工作台生产模型落地 |
| 工作事项 | 同上 | 部分实现 | `work-pages.js:241` 列表、`:246` 详情、`:410` 提交分发；有隔离 CRUD/关联/备注附件等，需 D408 Android 逐项回归 |
| 项目管理 | 原任务 project 字段/目录 + D4 扩展项目业务 | 部分实现 | `work-pages.js:226`、`:234` 项目列表/详情，任务关联；扩展关系在候选模型中，正式迁移未批准 |
| 流程模板 | D4 扩展设计 | 部分实现 | `work-pages.js:253`、`:410` 可编辑模板与步骤；不是仅静态展示，当前 Android 原生证据不覆盖全部规则 |
| 流程实例 | D4 扩展设计 | 部分实现 | `work-pages.js:257`、`:265`、`:267`、`:462`，模板快照/步骤/状态流转是隔离候选功能 |
| 往来与跟进 | D4 扩展设计 | 部分实现 | `work-pages.js:276`、`:281`、`:286`、`:466`，联系人与跟进及项目/事项引用；尚无生产模型准入 |
| 工作归档 | D4 扩展设计；与反馈图片域不同 | 部分实现 | `work-pages.js:291`、`:296`、`:320`，可归档/恢复/删除候选对象；不合并 FeedbackKit 存储 |
| 统计分析 | 原任务/个人计时统计 + D4 扩展统计 | 部分实现 | `work-pages.js:304` 业务统计、`personal-pages.js:205` 个人统计；应核对三端日期/时区/计数口径 |
| 设置 | 原 `AndroidToolsActivity` 原生设置及 Web 设置 | 部分实现 | 候选提供 Web 设置、通知入口及版本历史；原 AndroidToolsActivity 未在 D405 manifest 注册，不等于原设置完全恢复 |
| 数据备份与恢复 | 原任务备份边界；FeedbackKit 独立备份/恢复 | 部分实现 | 合成 JSON 和 FeedbackKit SAF 路径均存在；当前 D405 未重验完整图片/草稿/恢复代次，不能称已覆盖真实用户数据升级 |
| 同步 | 原正式协议存在；本轮禁止改动 | 因生产准入限制暂不能实现 | 候选同步中心/设备页仅隔离状态交互；D405 无 INTERNET，不能称生产同步已启用或真实联网已验收 |

工作模块在 Android 中出现的原因：`app.js:13` 为全部路由；`work-pages.js` 提供实际业务操作；D405 将同一候选 HTML 放入 WebView，并额外连接原生服务/FeedbackKit。这一事实不能用于推断 Win32 已拥有同等页面，Windows 差异由独立 Windows 审计确认。

## 4. 番茄钟原版、D403、D405 调用链和存储

### 4.1 原版正式实现

`android/src/local/gxtodo/replica/MainActivity.java:103` 的 `GxNative.openAndroidTools(section)` → `AndroidToolsActivity` → `PomodoroTimer` → `PomodoroClock`。Activity 为原生设置/番茄钟组合页：`:156` 起建立切换与滚动界面，`:332` 时长，`:350` 起显示时钟与开始/暂停/重置，`:391` 起今日轮次/专注统计。`:678` 解析关联任务，`:759` 使用 `PomodoroTasks.search(...,100)`，`:848` 接受任务选择，`:887` 清除关联，`:915` 暂停、`:919` 继续、`:924` 正/倒计时，`:954` 起刷新真实快照。

原版计时不在任务 SQLite 的一张 timer 表中。`PomodoroTimer.java:14` 的 key 是 `timer.state`，`:30` 使用 SharedPreferences `android-tools`。`:31–43` 恢复 clock、关联任务、sessionActive；`:222–256` 序列化内核、task/sessionActive 和每日统计并检查同步 `commit()`。`:81–117` 的关联携带 accountId、id、title，拒绝已删任务或当前账号不匹配。`PomodoroTasks` 优先当前 AccountStore/ReplicaDatabase，保留旧 v2 JSON 解析路径；查找范围最多 100 条。

`PomodoroClock` 使用同次启动的单调时钟、boot ID 和跨启动非负 wall elapsed 回退；倒计时范围 1–180 分钟，支持正计时、暂停/继续/重置；按北京时间分摊每日时间，统计保留今天及前 31 天。正常完成仅计一次，迟到 tick 截断于 deadline。源码足以证明这些规则存在，当前纯 Java 73 断言只证明其明确覆盖的模型规则，不能替代设备重启测试。

### 4.2 D403 隔离统一会话

`prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/NativeTimerSession.java:30` 起保存 revision、phase、focusMode、status、时长、sessionId、startedAt、taskId、completionPending、history、commandReceipts。`:94–109` 动作为 start/break/pause/resume/end/finish/reset/configure/claim-completion，使用 commandId + expectedRevision 防止重复/过期写。`:44–47` 拒绝未知或未转换封套，不能悄悄覆盖旧数据。`:147–158` 保存全部状态和回执；`:252` 历史记录含 id/phase/mode/taskId/startedAt/finishedAt/elapsedMillis/outcome；`:258` 起输出统计及历史。

`NativeTimerStore.java:23` 独立文件为 `files/d403-native-timer-synthetic.json`，上限 16MiB、请求队列 64。`:31–49` 用 AtomicFile 与 BOOT_COUNT 读盘；`:52–77` 单工作线程串行、写失败撤销内存权威并向调用方返回错误；`:81–89` 同步文件描述符、原子完成、读回逐字节核对。达到容量不能默默截断历史和命令回执。该文件是隔离候选状态，不能写成生产迁移。

原生和 Web 读写同一 session，网页 `native-timer-adapter.js` 为桥接；`personal-pages.js:138` 起优先原生、`:205` 起完整会话/历史/日统计，`:210` 起网页配置及任务选项。不能另初始化原版 `android-tools/timer.state` 作为第二计时权威。

### 4.3 D405 原生服务和界面差异

`android/d405/prepare.mjs` 在构建生成目录复制冻结 D403 类，并仅对生成副本接线：成功持久化唤醒正式服务；完成通知领取转给服务。冻结 D403 文件未被重写。

`D405TimerCompanion.java:20–39` 为正式前台服务 delegate/START_STICKY；`:43–63` 读快照和通知错误状态；`:80–88` 的通知命令绑定 session/revision/commandId；`:105–117` 安排 deadline 并使用 exact 或可用回退；`:127–151` 检查通知许可/通道，使用稳定 tag 发通知后持久领取 completionPending。通知被禁用时保留 pending。已有重复 wake 测试证明本场景单次通知和历史，并不证明任意崩溃瞬间物理提醒严格 exactly-once。

`android/d405/AndroidManifest.xml:3–6` 只有通知、FGS、special-use FGS、exact alarm 四权限；`:11` 注册 `NativeTimerActivity`，没有 `AndroidToolsActivity`、INTERNET 或 BOOT_COMPLETED。`tests/d4-05/scope.test.mjs:13–20` 冻结了此约束。

当前 `NativeTimerActivity.java:42–69` 标题及按钮仍含“统一隔离会话”“1 分钟验证”“返回网页番茄钟”；`:67` 明示关联任务沿用网页选择；`:153–156` 仅今日汇总，`:162–175` 原生历史只显示前十条、关联只显示 taskId，更多记录引导网页。D408 需要用户可用的原生入口、当前任务标题/搜索选择、全量历史可达与统计范围，不得只是把验证文案换掉。

### 4.4 恢复原则

保持单一 NativeTimerStore 权威和已通过服务行为，新增 D408 原生页面/适配层复用原 UI 交互能力；任务来源仍是隔离候选 repository，经明确 bridge 提供 task id/title，禁止原生页面意外打开真实账号 DB。关联删除/账号不符策略必须清楚，历史中的既有 taskId 不随页面丢失。

先定义关闭界面、后台、进程回收、强制停止、设备重启后的恢复语义。D408 可新增独立 BOOT 接收路径及合成数据重启测试，但不要把 Android 强制停止后不自动启动描述成持久化失败；所有适用条件按测试日志报告。新增权限仅在 D408 manifest，旧 D405 仍可独立构建且范围断言保持原样。

## 5. FeedbackKit 原版实际能力与候选差异

### 5.1 入口与数据边界

`android/src/local/gxtodo/replica/MainActivity.java:107–117` 保留原 feedback 工具/新增桥接。`FeedbackToolsActivity.java:50–56` 包含版本、`FeedbackKit.openList`、`newIdea`、备份、恢复；`:100–117` 使用 SAF 文档选择；`:137` 拒绝恢复自身 FileProvider 文件；`:142–144` 保存临时授权但不承诺进程死后继续后台复制；`:155–166` 明确替换确认和失败保留；`:177` 取消不变。`FeedbackApplication.java:35–56` 在反馈 Activity 打开期间阻止并发备份恢复，`:62–67` 跟踪真实实例。

`android/d405/native-integration.js:34–40` 在 feedback 路由注入按钮，调用 `native.openFeedback()`；`D405Bridge.java:24–29` 打开 `FeedbackToolsActivity`，另有独立 `newFeedbackIdea`。因此不能报告“D405 只剩新建一条反馈”或“完整 FeedbackKit 被移除”。问题是主页面和主要视觉路径仍为简化合成版本，完整原版入口未成为明确主流程。

### 5.2 对交付 APK/AAR 的静态核查

本次只对交付 APK 做静态类/方法反编译，证据保存为：

- `work/d4-08/audits/android-feedback-static-evidence.json`：归一化 REA/JADX 结果。
- `work/d4-08/audits/android-feedback-decompiled.txt`：有行号的可读摘录。

这些是反编译证据，不是原开发源代码，也不是本轮运行结果。关键摘录位置：createTables `:1`，importImage `:15`，restoreBackup `:94`，saveEditor `:100`，confirmDeleteSelection `:142`，persistDraft `:172`，removeBatch `:206`，undoDelete `:218`，requireDraft `:229`，commitRestore `:238`，SharedState 构造 `:249`，批量删除实现 `:305`，撤销实现 `:365`，saveDraft `:433`，commitRestore 实现 `:454`。

静态可确认的实际能力：

- 独立数据库 `databases/feedback-kit.db`（namespaced 版本 `feedback-kit-<namespace>.db`），schema 1；图片在 `files/feedback-kit/images` 或 `files/feedback-kit/namespaces/<namespace>/images`。表为 records/assets/links/settings；records 的 bucket 包括 notes/drafts/meta，含 payload、updated_at、state、search、deleted、number；settings 保存 restore_generation。
- 图片 importImage 在事务内读取来源流，把实际字节写入 staging 文件，有限量复制、SHA256、图片内容验证，按代次命名并写 assets row。不是只存 URI 或哈希。
- 编辑保存核对 baseRevision；遇到旧版本冲突保留草稿，保存 note 与删除对应 draft 处于同一事务。草稿由 repository.updateDraft 保存，requireDraft 可恢复。
- 批量删除在执行前核对预览 generation、逐条 note fingerprint、草稿 fingerprint、先前 undo batch fingerprint；写 deletedAt/deleteToken/revision 墓碑和 meta 批次，批次带 token/count/draft/assets。撤销校验整批 token，避免覆盖较新草稿，同时恢复被删记录及对应草稿修订。
- 恢复校验 expectedGeneration/expectedMutation，暂存并验证数据库/文件关系，搬运实际图片字节，提高 restore_generation 并轮换删除 token。旧 UI 的删除撤销 token 在恢复后不能继续生效。

### 5.3 简化合成页与原版差异

`prototypes/d4-01/personal-pages.js:318–326` 是另一隔离 feedback workspace：标题/正文、pending/resolved、草稿、图片导入导出。`:333` 附近 imagesFrom 实际保留 base64 字节；`:441` 导出原字节 Blob。不能误报此页只有哈希导致图片文件已丢失。

但当前页面主要显示图片文件名/hash，没有原版图片预览及既有图片逐项移除体验；`:436` 使用合成数组过滤物理删除，不能代替 FeedbackKit 的删除批次/撤销/代次并发保护。`:472–485` 的保存/草稿/导入校验属于合成域，不代表原 FeedbackKit 数据已迁入。D408 保持两个域独立，不悄悄合并到任务附件、工作归档或新的生产表。

原版“保存意见/处理状态/导出备份”是本地流程。本次检查未发现正式联网反馈提交服务。D405 无 INTERNET。需求中的网络异常和重试应如实标为“现有原版无远程提交，正式接口未接入”，保留实际本地 IO/权限/容量/损坏/版本冲突错误与可重试行为；不能为满足表格虚构一个服务端提交成功或伪造重试接口。

### 5.4 既有验证不足

`tests/d4-05/android/NativeIntegrationInstrumentation.java:258–268` 从 instrumentation 直接调用 `FeedbackKit.newIdea`，真实输入正文、点保存并检查持久化。它没有从主导航→原生工具页→列表完整走通，也未测试图片、草稿、详情编辑、批删撤销、完整备份恢复。

历史 `docs/android-feedback-092-20261113/接入说明.md` 对应原 0.9.2 / code15。`native-ui-backup-verification.json` 和 `native-qa/FeedbackQaInstrumentation.java` 曾记录独立 namespace 的 note/draft/meta、真实 PNG、数据库 counts、图片 SHA 往返、恢复代次增长、坏备份不改、回滚及 31 个无关受保护文件不变。这是旧宿主/旧模拟器上的历史证据，不是当前 D405/D408 完整复验结果；不能拿历史报告填充本次通过数量。

## 6. 左边缘导航原因与复现边界

原正式 `src/gestures.mjs:34–85` 在允许的 workspace 区域接受右滑，没有 `x<=22`；`:43` 排除控件/可编辑目标；`:59` 方向要求 dx 至少为 |dy| 的 1.5 倍，`:77` 终点 dx>=72。保留列表滚动归属、多点取消与尾随点击抑制。`src/app.mjs:242` 仅在前台且无 editor/modal/picker/nav/filter/confirmation/save/switch 时启用。因此原版较宽 workspace 手势值得复用，但原源码不证明它原本已支持用户本次要求的任务编辑、备注弹层等所有场景。

候选 `prototypes/d4-01/mobile-controls.js:18` 同时排除 editable，并且 edge 只接受 touch && x<=22；`:20` 方向比 1.6、移动超过 18；`:24` 终点 dx>=55，无速度判断。D405 `D405Activity.java:117–125` 固定排除片段宽 22dp、高 200dp、top 80dp。片段外真正系统边缘可先被系统 Back 获取；片段内也要求极窄起点。不能简单禁用系统返回解决。

`tests/d4-03-platforms/android/.../PreviewInstrumentation.java:107–110` 枚举多个 route，但 `:1473` 统一执行 `gesture(3,150,140,152,0,300)`。`:127` 另有左缘竖滑取消。两者没有覆盖 x24/48、屏幕上中下多个高度、不同系统 gesture/three-button 设置、不同斜率/速度、任务编辑器输入焦点/键盘打开、横向滚动控件。应冻结这些旧用例，再新增 D408 实际坐标复现。

整改建议：在安全的应用内侧提供合理起始带（例如 48–64dp，最终数值由真实 MotionEvent 矩阵选择），原最边缘继续使用有限系统手势协调；右侧/系统返回仍有效。方向、距离、速度联合判定，明确滚动/文本选择/横向控件/拖动归属；左侧抽屉打开和关闭都有完整可达路径。编辑页要求通过空白安全区触发且不吞输入或强制改焦点，不应让覆盖 input 的整条热区破坏文本操作。

## 7. D408 隔离实现和版本准备方案

1. 保持 `android/d405/`、D403 原文件、`tests/d4-05/scope.test.mjs` 和 `frozen-baseline.json` 不变；新增 `android/d408/`，manifest 包名建议 `local.gxtodo.d408candidate`，新版本码使用专属 `408xxx` 段。prepare 必须检测已存版本历史冲突/溢出，不因新 workflow 的 run_number 归一而复用 D405 版本。
2. 独立 D408 生成阶段读取同一 SHA 和同一 Run 的 HTML receipt，固定 AAR hash，保留正式源编译和旧 D405 构建产物；新增 D408 原生 UI/bridge/service 适配均输出来源/hash清单。不要把源文件直接改写为已变更的生成副本。
3. 番茄钟沿用单一会话权威，恢复用户交互与完整可达记录/统计；保持已通过前台通知、提醒、重建和进程恢复语义。若新增 BOOT 权限，只在 D408 独立 manifest 和 scope 中明确列出并增加重启证据，不修改 D405 的禁 BOOT 断言。
4. FeedbackKit 原版工具/列表成为 Android 的明确主入口，保持原 AAR/数据库/图片/批次/代次边界；合成 Web 反馈继续明确其独立数据域。三端字段映射和无法直接复用的原生能力应单独列差异。
5. 版本页与历史显示实际 versionName、versionCode、`by codex · Git前五位` 和构建流程注入的 UTC 编译时间；保留复制与离线版本历史。临时 CI 签名必须标明，禁止当作稳定签名或承诺覆盖用户安装。
6. 旧签名稳定化与旧版覆盖升级只准备方案：记录 package/cert digest/versionCode/data边界、独立测试夹具和回滚条件，等待单独授权；本轮不创建新正式签名身份、不卸载用户应用。

## 8. 新增 tests/d4-08 冻结复现与 CI 验证计划（尚未执行）

本节是计划，不是已通过结果。所有 compile/test/SQLite/app/emulator/packaging 均在 GitHub Actions；本机仅编辑源码与整理文本/哈希/图片。

### 8.1 基线与冻结策略

- 新增 `tests/d4-08/android/baseline-observations.json`：精确基线 SHA、D405 package、原 AAR hash、已验收 58/15/73 的原始报告路径及各自计数，不改旧报告。
- 新增独立 D408 scope 检查：旧冻结路径 hash 全部保持；D405 manifest 仍为四权限；D408 package/versionCode/source/build-time 同 installed APK，网络/生产数据库/同步能力没有误接。
- 同一新用例先在精确 04c525c 基线 APK 上记录可复现的失败，再在 D408 APK 上运行；保存 baseline 和 fixed 的原始日志/截图/坐标/预期/实际，分开编号。不得把“发现差异的预期失败”改写成产品已通过，也不得对旧套件放宽断言。

### 8.2 番茄钟独立用例

- 从真实主导航点击入口，到完整原生页；通过原生控件开始/暂停/继续/提前结束/正常完成/正计时完成/休息，核对每次 revision、sessionId、history 与 daily stats。
- 原生任务搜索、选择/清除、已删任务显示、网页和原生交替操作、脏配置保留；观察桥接确实读同一权威文件，legacy `android-tools/timer.state` 不被初始化。
- 制造超过十条记录，真实滚动到最旧记录，验证 task/title/时间/结果、统计跨度和北京时间跨日边界；不给 UI 一个固定数组就声称持久化通过。
- 后台/屏幕关闭与 emulator keyguard、Activity recreate、外部终止 PID 后重新启动，分别记录前后快照和实际 PID。设备重启通过 Actions 中实际 reboot、boot ID 改变与重新连接后检查；若只能证实重开恢复，应明确未验证自动通知唤醒。
- 通知权限拒绝/通道禁用、exact alarm 不可用回退、重复/过期通知命令、完成临界点故障与重复唤醒。分别报告持久化一次与物理提醒覆盖范围，保持 completionPending 不丢失。
- 在隔离路径执行存储容量/损坏/写失败/过期 revision/重复 commandId，核对原文件保留、错误可见、重试策略；不能修改真实用户 DB。

### 8.3 FeedbackKit 独立用例

- 真实触摸：导航→原生工具页→历史列表→新建→分类/正文→选择实际 PNG/JPEG→预览→保存→详情/编辑。UI 事件记录不得用直接 newIdea 调用冒充入口验收。
- 草稿保存、退出恢复、Activity/进程重建；保存冲突保持草稿；通过 SAF 读取真实附件，核对 DB asset/link 与文件实际字节、尺寸、mime、SHA256，不仅检查 URI/hash 字段。
- 选择多条、取消/确认删除、批量撤销、更新草稿后拒绝旧撤销、恢复后旧 token 失效；核对 generation/revision/批次指纹，不把简单数组删除当等价实现。
- 完整备份到 SAF、恢复确认/取消、图片+草稿+meta 往返；坏 ZIP、缺图、哈希错误、权限失败、并发变更/旧代次、容量错误可见且旧库/图片不受损。数据库查看和执行只在 Actions 合成 namespace。
- 报告“远程提交未接入”，只对实际本地保存/备份/恢复失败进行重试验证；不新增未授权联网反馈服务。

### 8.4 边缘导航与视觉专项

- 360/412 CSS 宽，至少 gesture-navigation 和 three-button 两种已记录系统设置；记录 SDK、device fingerprint、密度、systemGestureInsets、exclusionRects、WebView/屏幕原点与转换比例。
- 从 x=3/24/48（以及最终起始带边界内外）和上/中/下多个高度注入实际 MotionEvent；不同速度/方向比/距离、反向、竖向、多指取消。覆盖四象限、放大象限、任务编辑、备注/长文本选择、统计、工作事项/项目/模板/流程/跟进、设置及反馈主页面。
- 开抽屉后遮罩/左滑/Back 正常关闭；普通系统右缘 Back 保持；输入框键入/选择/键盘显示、水平控件和任务拖动不得被抢夺。系统手势模式不是单靠 JS 模拟 drag 来证明。
- 输出真实屏幕图和原始输入记录。360/412/desktop 的原验收时间备注长文、工作备注选择高亮继续回归；模型查看仅缩略图，原图保留 SHA256、尺寸和坐标换算。

### 8.5 原功能、版本与交付审计

- 冻结 D403 58 条、D405 15 条、Java 73 断言分别报告，新增 D408 分套件报告；正式源编译单列。每套记录实际执行数、通过/失败/未运行、首次失败、attempt、重试、原始日志。
- 核对原四象限/CRUD/拖动/子任务/自动补全/备注/通知/提醒，及 Android 工作模块的真实 CRUD/关系导航/重开持久化；生产模型受限部分明确标记。
- 交付 APK 实测 package/versionCode/签名/manifest 与版本 UI/历史一致；源码 ZIP、原 Actions ZIP、reports、coverage、history、impact、SHA256 清单齐全。D408 成功不关闭 D4-03、issue #1 或生产准入限制。

## 9. 未验证与禁止扩张

当前未新增 D408 运行证据，未验证真机/OEM、真实安全锁屏、设备重启、拒绝通知/exact alarm 降级专项、完整原 FeedbackKit UI/附件/恢复全流程。候选测试不能批准生产 DB 迁移、D2 合入、LAN/WebDAV、同步协议改动、稳定签名或旧版覆盖升级。本文没有修改产品、旧测试、manifest、构建脚本或 GROWTH。
