# D4-08-01 Windows 静态审计

审计日期：2026-11-26（Asia/Shanghai）。冻结源码：`04c525c55fc136ad1b960b5d727dab3c5e3165fd`；候选分支：`d4/d4-08-candidate-1`。本次只读取源码、既有证据和 Git 历史，没有在本地构建、运行应用、执行数据库或产品测试，没有修改产品/测试代码。本文对应机器可读结果 `windows.json`。

源码根目录：`C:/Users/adwoo/Documents/Codex/2026-11-25/x/work/d4-08/source`。需求原件：`../OWNER-REQUEST.md`。以下 `windows/`、`docs/`、`scripts/` 路径均相对该源码根目录；行号固定在上述 SHA。

## 核心结论

Windows 原生工作区已经集成进可执行程序，入口隐藏于原三点菜单和 Ctrl+Shift+W，且只复用原 tasks/projects/notes。当前没有原生番茄钟。流程、往来是有说明但不可操作的页面，独立工作事项、流程版本/实例、跟进、跨类型归档未形成原生业务能力。这同时解释了用户“没有看到新模块”和“模块不完整”的反馈，不能简单归因为用户启动了错误程序。

Windows 优化意见保留了真实本地 CRUD、搜索、备份导出、合并恢复和错误处理，但原生实现只有旧六字段，不能代表 Android FeedbackKit 全能力。任务 Ctrl+Enter 的缺失是当前明确的键盘合同：旧测试要求标题 Ctrl+Enter 换行且不保存；本轮新增快捷键要以独立候选宏及 D408 回归实现，不覆盖旧结果。项目/标签目前是可编辑原生组合框，缺少明确的动态建议、无匹配提示和跨端一致选择流程。

## 证据等级

- **M（人工）**：本轮 OWNER-REQUEST 所记用户人工验收，适用于启动、四象限/放大缩小、任务 CRUD/完成、拖动、三点菜单、备注、窗口缩放/重绘/字体；不是本次代替用户重新测试。
- **H（历史云端）**：冻结交付 `outputs/MyTodo-D4-Native-04c525c-45743320346-a1-r2/evidence/current-ui/artifacts/d404-win32-45743320346-1/d4-04-evidence/native-regression.json`，SHA 与本轮冻结基线一致，run `45743320346`、attempt `1`。原九个 native suite 全部通过；workspace-96 与 workspace-144 各 127 checks；启动隔离 guards 10/10。不同套件不相加为一个“通过率”。这不是 D4-08 新执行结果。
- **S（静态）**：下表源代码调用链与限制；存在代码不能自动升级为人工或云端验收。
- **P（方案）**：后文整改与测试计划；当前不声称已实现或已验证。

## Windows 22 项矩阵

| # | 功能 | 当前状态 | 原版状态与当前差异 | 证据 |
|---|---|---|---|---|
| 1 | 四象限 | 已实现且验证通过 | 原生核心保留；新工作区没有替代四象限 | M；`windows/gui.c:256`；`windows/workspace-test.c:142`；H legacy-drag/repaint |
| 2 | 象限放大缩小 | 已实现且验证通过 | 原四象限 zoom 处理保留 | M；`windows/gui.c:257`；H legacy-drag/repaint |
| 3 | 任务增删改查 | 已实现且验证通过 | 原任务操作保留；工作区创建/编辑路由到原编辑器 | M；`windows/workspace.c:137`；`windows/workspace-test.c:109` |
| 4 | 拖动排序及跨象限 | 已实现且验证通过 | 原任务拖动/菜单保留，不是新工作模型拖动 | M；`windows/drag-test.c`；H legacy-drag |
| 5 | 子任务 | 已实现且验证通过 | 原添加按钮与父子关系持久化存在；Ctrl+Enter 添加缺失 | `windows/detail.c:17`、`:132`、`:139`、`:145`；H legacy-detail/advanced |
| 6 | 标签和项目自动补全 | 部分实现 | 原可输入组合框及目录候选存在；没有完整动态建议/无匹配提示；用户期待与 Android 一致 | M（问题）；`windows/detail.c:20`、`:63`、`:134` |
| 7 | 任务备注 | 已实现且验证通过 | 原多行备注编辑保存保留；不是独立便签 | M；`windows/detail.c:131`、`:140`；H legacy-detail |
| 8 | 番茄钟 | 完全缺失 | 已审计原 Win32 无 timer UI/状态机/存储，不能称“恢复已有 Windows 番茄钟” | `docs/upgrade/04-existing-feature-inventory.md:36`；`docs/d4-04-model-admission-proposal.md:22` |
| 9 | 番茄钟历史与统计 | 完全缺失 | Win32 无会话历史/恢复适配器；现有任务统计不等于番茄统计 | `docs/d4-04-model-admission-proposal.md:22`；`windows/dashboard.c` |
| 10 | 优化反馈 | 部分实现 | 原生本地意见 CRUD/搜索/导入导出保留；缺分类、图片/附件、独立持久草稿和反馈生命周期能力 | `windows/feedback.c:8`、`:16`、`:25`、`:28`、`:35`、`:39`；H legacy-feedback |
| 11 | 左侧导航 | 部分实现 | 原十项导航保留；工作区另开八项导航；无清晰常驻工作/番茄入口 | `windows/gui.c:3`、`:67`、`:256`、`:263`；`windows/workspace.c:19`、`:245` |
| 12 | 工作台 | 部分实现 | 新原生 dashboard 只统计原任务/项目/便签和分页待办，缺跨业务汇总 | `windows/workspace.c:77`、`:187`；`windows/workspace-test.c:86` |
| 13 | 工作事项 | 部分实现 | 页面实际是原 tasks；没有独立事项身份、生命周期、关联模型 | `windows/workspace.c:32`、`:89`、`:137`；`docs/d4-04-native-integration.md:19` |
| 14 | 项目管理 | 部分实现 | 原项目 name/description/archived 与任务按名称关联可用；owner/members/history/稳定ID关系未补齐 | `windows/dialogs.c:28`、`:29`；`windows/workspace-test.c:119`、`:122`；`docs/d4-04-native-integration.md:38` |
| 15 | 流程模板 | 仅有界面 | 流程页说明待模型准入，没有模板 CRUD/版本发布 | `windows/workspace.c:19`、`:32`、`:89`；`windows/workspace-test.c:94` |
| 16 | 流程实例 | 仅有界面 | 同一流程页没有独立运行实例、步骤状态、暂停/历史 | `windows/workspace.c:32`、`:89`；`windows/workspace-test.c:94` |
| 17 | 往来与跟进 | 仅有界面 | 往来页面说明不可创建/保存；没有联系人/跟进实体与关系 | `windows/workspace.c:32`、`:89`；`windows/workspace-test.c:94` |
| 18 | 工作归档 | 部分实现 | 当前只有原项目 archived 标记与过滤，不是跨事项/流程/往来归档 | `windows/workspace.c:89`；`windows/workspace-test.c:92`；`docs/d4-04-native-integration.md:23` |
| 19 | 统计分析 | 部分实现 | 原任务统计及可滚动原生视口可用；没有新增业务/番茄历史统计 | `windows/workspace.c:200`、`:212`；`windows/workspace-test.c:104`；H workspace-96/144 |
| 20 | 设置 | 已实现但未验证 | 原设置、账号、同步说明入口保留；本轮人工清单未单列设置全流程验收，新模块设置尚缺 | `windows/dialogs.c:28`、`:29`、`:33`；`windows/workspace.c:246` |
| 21 | 数据备份与恢复 | 部分实现 | 原业务 JSON 导出/合并与意见备份可用；新 timer/work 模型无备份；候选禁止 CLI 外部导入/迁移，GUI 路由仍存在，不能承诺真实数据准入 | `windows/database.c:344`、`:345`；`windows/dialogs.c:40`；`windows/feedback.c:28`、`:38`；`windows/candidate-guard.h:25` |
| 22 | 同步 | 因生产准入限制暂不能实现 | 原同步代码保留；候选只保留说明入口，禁止真实配置/连接；新 work/timer/反馈不得混入原 outbox | `windows/dialogs.c:33`；`windows/candidate-guard.h:25`；`windows/workspace-test.c:152`；`docs/d4-04-native-integration.md:28` |

状态适用于这一项要求的整体范围，因此“部分实现”不否认其原有子功能已经通过。候选工作模型可以按 D4-08 最新授权实现；正式生产模型/迁移/远端同步仍是独立准入限制。

## 入口与业务调用链

`gui.c:3` 的 `navNames` 只有任务、便签、项目、地点、标签、搜索、统计、同步、设置、账号。`gui.c:67` 的 overflow 菜单 ID63 及 `:263` 的 Ctrl+Shift+W 调用 `ui_work_open()`；`workspace.c:287` 创建 owned modeless `GxNativeWorkspace`，没有浏览器依赖。`gui.c:256` 初始只创建原十项导航，未默认展示工作区。`docs/d4-04-native-integration.md:7` 明确说明采用独立窗口以保护固定页索引与原交互。

`workspace.c:19` 的八页是工作台、项目、工作事项、流程、往来、便签、归档、统计。`has_rows()` 在流程/往来/统计不提供记录列表；`row_kind()` 只返回 tasks、notes、projects（`:32`）。SELECT 每页最多50项（`:52`）；新建与编辑进入旧 task/note/category 处理（`:137`）。`workspace.c:269` 返回四象限；`:270` 打开原优化意见或同步页；`:283` 关闭工作区只是显示原主窗。原有账号/目录身份变化清空选择及保存草稿屏障已有实现和历史测试，不应在新工作区中丢失（`workspace-test.c:124`、`:128`）。

## 番茄钟补齐方案与生产边界

历史调查只能证明原 Windows 未有该能力；Android/Web 的完整实际行为由各端审计交叉确认。`docs/d4-04-model-admission-proposal.md:24` 已定义可复用合同：倒计时/正计时、进行/暂停、专注/休息、显式完成确认、任务关联、取消、持久历史、恢复、配置草稿独立。

D4-08 原生候选应在明确的隔离根目录内新增版本化本地 store，保存明确账号身份并防止跨账号误关联，不扩展原 `tasks.sqlite`、不借用 task/note 字段存大块业务 JSON、不生成新原同步 kind。原 `database.c:347` 的 meta/entities/outbox schema 及 `:344`/`:345` 备份合同保持不变。正式 sidecar、共享适配器或生产 SQLite 扩展仍按原 proposal 单独审核。

Android交叉核查：正式 `android/src/local/gxtodo/replica/PomodoroTimer.java:14`、`:30` 使用 SharedPreferences `android-tools` 的 `timer.state`；`:87`–`:92` 的任务关联包含 accountId/id/title。它是设备单例计时器，不能未经合同决定改成每账号并行计时。候选 `prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/NativeTimerStore.java:23` 使用 `d403-native-timer-synthetic.json`，`:81`–`:89` AtomicFile+sync+readback，容量失败保留原数据而不截断历史。Windows建议先保持单活跃会话和明确账号关联；账号切换的展示/继续/取消规则需三端统一。

建议候选状态字段：schemaVersion、accountId、generation/revision、configuration、activeSession（id/taskId/taskTitleSnapshot/mode/phase/targetMs/accumulatedMs/status/startedAtUtc/lastCheckpointUtc/deadlineUtc）、sessions（唯一ID、开始结束/暂停区间或等价累计、实际时长、正常完成/提前结束/取消原因、completionAcknowledged）。活跃会话与历史入账需一次原子提交，防止重启重复记账。落盘采用写临时文件→flush→原子替换；保留可验证前代，失败不清空内存/覆盖旧文件；单实例写锁及恢复校验必需。

计时规则要显式覆盖单调时钟、挂起恢复与重启后的 UTC checkpoint；墙钟回拨不能产生负值/重复完成。关闭番茄窗口继续计时；退出程序前保存；重启恢复进行/暂停/待确认状态并说明离线期间如何计入。没有常驻服务时不能承诺程序已退出仍显示系统提醒。完成需要用户确认但恢复不能重复增加历史统计。计时状态不可由 UI 每秒递减变量作为唯一真相。

## 优化反馈差异与保留要求

`feedback.c:8` 格式为 `gxtodo.feedback` version1 ideas[]；`:14` 验证 id/title/body/status/createdAt/updatedAt；`:16` normalize 只复制这六字段。它会丢弃额外分类/附件字段，因此不能把 Android 丰富备份直接交给旧 converter，并宣称无损跨端恢复。

`:20` 使用独立 ideas.json 和 feedback.lock，`:21` 失败保留旧 store，`:25` 保存，`:27`–`:28` 合并较新版本、同时间冲突保留副本并导入前备份，`:29` 删除，`:30`–`:33` 搜索历史与详情，`:35` 只是离开编辑器时的内存 dirty 草稿保存/放弃/取消提示；不是崩溃后可恢复草稿。`:39` 有新建/保存/删除/复制/导出/导入/关闭按钮及删除确认，并明确本机保存不自动上传。`:49` 的旧 store 回归覆盖重启、锁、合并冲突、非法日期、失败原子替换和删除。

普通构建路径是 `%LOCALAPPDATA%/GxTodoLocal/feedback`；D404 候选为 `<candidate-root>/feedback`（`:40`–`:46`），当前为整候选根共用意见，与 task account 隔离语义不同，新增方案必须明确而不能暗中迁移。工作区反馈按钮有真实原生窗口保存测试，并比对全局 store 未变（`workspace-test.c:145`–`:150`）。

补齐原生能力时保持独立 feedback 存储边界；实际图片字节必须复制进候选附件目录，并保存文件名/MIME/大小/SHA和独立身份，预览、导出/恢复都读取真实内容。补上分类、持久草稿、图片预览、状态历史、确认删除及恢复代次/删除批次所需合同。业务提交/失败/重试应以 Android 原版审计结论为准；现有 Win32 没有远端提交服务，不能把“本地保存失败”写成已实现网络发送重试。候选可以提供明确的本地提交与可注入失败恢复流程，但不得虚构正式服务已连接。

旧 JSON 导入/导出继续可用，旧数据转换必须显式、无损地保留已有六字段；丰富格式版本须独立识别并拒绝有损降级，保留原文件和导入前备份。反馈附件不可合并为任务/工作附件。

## 键盘与自动补全审计

`detail.c:17` 的 `quick_add()` 先调用 `detail_save_record(0)` 确保父记录存在，再持久化子项与继承字段，成功后清空子草稿。新快捷键在 quick 获焦时必须只走此分支，不再触发第二次整个 detail_save/关闭编辑。不能声称添加子任务完全不触及父记录；那与原业务先决条件冲突。

`detail.c:22`–`:34` 跟踪 IME；Ctrl+Enter 只对独立 note 执行保存，普通任务字段没有保存分支。组合框 Enter 确认所选项，日期/数字单行 Enter 不保存，多行 Enter/Shift+Enter 继续换行。`:136` **旧 Ctrl+Enter 断言针对 F_TITLE**，不是 F_NOTES；`:131` 普通 Enter 覆盖 title/notes/review/place；`:141` 独立便签 Ctrl+Enter 原来就保存。

历史文件 `docs/windows-native-20261021.md:10` 曾写“Enter 保存、Shift+Enter 换行”；`docs/windows-parity.md:10` 与当前代码采用任务自由文本 Enter 换行。可用 Git 是 shallow clone；`git log --all -- windows/detail.c windows/feedback.c` 只有9fe8824与8779f84可追踪段。9fe8824到冻结HEAD的 detail.c 完全无差异；feedback.c只改变候选保存路径。现有证据没有证明“原 Windows 任务 Ctrl+Enter 曾保存”，不得编造恢复历史。

建议 D408 独立宏的焦点合同：quick Ctrl+Enter 添加；任务多行备注/复盘/地点 Ctrl+Enter 保留换行；任务标题和其余适用编辑 Ctrl+Enter 保存；独立便签保留既有 Ctrl+Enter 保存；IME合成中不保存不添加。普通 Enter、Shift+Enter、显式保存/添加按钮、组合框 Enter 选择继续保留。帮助必须写明焦点差异，候选新合同与旧标题 Ctrl+Enter 合同冲突需在交付中列出。

`detail.c:63` 的项目/标签使用 CBS_DROPDOWN，初始化最多1000个目录名；CBN_EDITCHANGE只标 dirty；`:20`/`:134` 控制选择 Enter。建议使用独立建议列表，对当前输入片段显示候选，键盘上下移动/Enter确认、鼠标确认、Esc关闭、无匹配提示、IME提交后更新；标签只替换当前片段，保留其它标签并去重。不能用过滤原记录代替提供候选，候选选择不得提前保存整任务。

## 可复用自动化反馈回路与缺口

已有可复用闭环：`scripts/d4-04-native-regression.mjs:7` 限定Actions/Windows；`:14` 精确SHA/run/attempt；`:30`–`:40` 分九个suite；`:72`–`:97` 十个启动隔离场景；`:124` 每套全新目录；`:165` stdout/stderr/原生报告；`:173` exit/FAIL/报告联合判定；`:181` 独立execution.json；失败仍保留原始证据。`workspace-test.c:15` 的 BM_CLICK、`:54` 的真实反馈窗输入、`:83` 的HWND、`:109` 的原编辑器、`:138` 的SQLite reopen、`:41` 的几何检查和真实截图可复用。旧 `detail.c:113` 通过实际键盘消息与 WM_CHAR 分派，已覆盖 IME与焦点；不是字符串存在性测试。

不足：当前测试刻意确认“流程/往来无CRUD”（workspace-test.c:94），没有任何 Windows 番茄钟测试；自动补全只检查组合框确认，不覆盖动态建议；反馈只有一个真实UI保存流程，其余是store API；CtrlEnter旧断言与新需求相反。现有闭环能捕捉回归，不能捕捉本轮所有用户缺口。

新增独立 `tests/d4-08/windows/` suite，保留原D404/D405测试原文。D404宏仍跑原九suite；D408宏跑单独新suite，两者数量分别出具。需要云端先在冻结实现运行失败复现，再以相同场景验证整改；冻结版本缺少新入口可作为预期失败，不修改旧结果。

| 场景ID | 最小实际UI行为与状态断言 | 冻结实现预期 | 新候选通过条件 |
|---|---|---|---|
| W408-ENTRY | 启动真实Win32窗，枚举可见主导航，点击工作管理/番茄入口并返回四象限 | 入口缺失/隐藏 | 常驻可见入口可点击；原四象限/缩放/编辑仍可用；96/144 DPI真实截图 |
| W408-TIMER | 关联任务→开始→暂停→换页→继续→关闭计时窗→重新打开→提前结束/正常完成→确认 | 无入口 | 显示及持久状态一致；历史唯一一次入账；任务关联可查 |
| W408-RECOVER | 运行/暂停/待确认各保存后终止进程，启动同隔离根；注入写失败/损坏尾文件/墙钟变化 | 无store | 恢复明确；不丢已确认历史、不重复完成、错误可见；原生产文件不变 |
| W408-FEEDBACK | 从常驻入口新建分类反馈→选真实PNG→预览→输入→切页/重启恢复草稿→提交→历史详情 | 分类/附件/持久草稿缺失 | 实际附件bytes/size/SHA相同；草稿和提交生命周期准确；独立反馈路径 |
| W408-FEEDBACK-FAIL | 注入写失败→显示错误→重试；删除取消/确认；导出恢复；错误/旧代备份恢复 | 仅旧store部分具备 | UI控制真实执行；原文件不丢、删除批次/恢复代次无复活漏洞；不声称网络服务已连接 |
| W408-WORK | 新建项目→事项→模板两步骤→实例→完成步骤/暂停→联系人/跟进→跳转关系→归档恢复 | 流程/往来不能操作 | 原生可编辑表单和持久关联；模板修改不污染既有实例；归档可恢复；重启后关系一致 |
| W408-KEYS | 标题改字CtrlEnter→读回任务；quick输入CtrlEnter→恰好1子项；notes/review/place CtrlEnter换行；IME Enter | 标题不保存/quick不添加 | 焦点合同满足；无重复保存/子项；普通Enter、ShiftEnter、按钮及note快捷键不变 |
| W408-SUGGEST | 输入部分项目/第二标签片段→上下键/鼠标选中→无匹配→Esc→IME提交 | 无专用建议状态 | 候选可见且可选；仅替换当前片段；不误保存；原项目/标签数据不变 |
| W408-BOUNDARY | 每个新模块切换账号/重启；比较原schema/entities/meta/outbox与global反馈文件 | 只旧工作区覆盖 | 候选sidecar独立；无新生产kind/schema/协议写入；已存在的原任务编辑按原业务产生原事件 |

以上为计划，尚未执行；计时与持久化的故障注入须在 Actions 合成数据中运行，不能用只查字符串、模拟日志、静态截图替代实际 UI 和持久状态断言。

## 按用户顺序实施

1. D4-08-01：合并三端审计，冻结字段/状态/时间/附件/历史语义，列明原版与候选差异。保存本审计与精确源码哈希。
2. D4-08-02：先实现候选 Win32 原生番茄UI、隔离状态store、任务关联、历史与统计、原子恢复；准备生产持久化提案；Actions 最小UI/重启/异常回归。
3. D4-08-03：复用 Android 原版 FeedbackKit 已确认合同，原生扩展分类/实际附件/预览/持久草稿/历史/失败重试/删除恢复，保留旧存储和备份兼容；独立回归。
4. D4-08-04/05：Android 手势由相应负责人完成；Windows 提供清晰主入口，保留四象限，依次项目/事项→模板/实例→往来/跟进→归档/统计/设置，候选 store 与稳定ID关系完整，原生产实体不变。
5. D4-08-06：D408宏内实现焦点快捷键和建议列表；旧测试原文件/断言保持，旧D404构建继续执行完整原suite；新D408新增实际输入/IME/无匹配回归。
6. D4-08-07：分别运行旧native九suite、D408各专项、三端合同、DPI/重绘与恢复，记录实际数量/首次失败/重试/原日志。最终提供独立候选、完整源码、精确SHA/run/attempt/哈希，不关闭D4-03、issue1或生产限制。

实现归属：本审计作者后续负责 `windows/*` 候选UI/新增模块、`scripts/build-windows.mjs` 的独立D408构建宏和 `tests/d4-08/windows/`。父负责人统一GROWTH、跨端合同、workflow/CI、发布和验收。此审计交付点尚未更改产品源码。
