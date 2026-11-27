# D4-09 Android 当前实现与 UI 改造保留契约

审计日期：2026-11-28（Asia/Shanghai）。审计基线：`work/d4-08/source`，Git HEAD `7c217d8779ccf21e13733b28868e015e9cfd693a`，本次只读检查时工作树干净。D4-09 工作树由 root 同时核对为相同干净 HEAD。本文件的源码路径和行号均指向这个固定基线，不指向后续可能移动的候选文件。

本次只读取源码、已有报告及已审阅图片，不运行应用、构建、测试、SQLite 或模拟器；未改 Android 源码。后续所有运行验证和可运行打包仍限 GitHub Actions。root 转达的最新用户指令为：『我要睡觉了,还是不用等我审核了，之后如果你有需要可以直接进入 UI 改造。』因此可以在完成设计/网页原型后继续候选 UI 改造，不需要等待新的人工审核；生产限制没有解除。

## 1. 人工接受、自动证据与未知项分别记录

root 在本轮提供的最新人工接受范围：完整番茄钟、切换应用后计时正确、反馈选图/预览/删除、导出恢复及坏包处理、左缘导航基本可用。左缘“基本可用”不扩大成所有设备、所有纵向起点和所有系统导航模式均已人工接受。

联系人、跟进、归档仍为人工未知项；既有自动用例不能替代负责人对这些界面的验收，也不能以本次样式调整把它们标记为通过。

D4-08 自动证据是同一源码的 Actions `46018074859 / attempt 1`、Android job `140570838816`；18 份原始报告共 58 例通过，其中 navigation 20/20、feedbackUi 7/7、features 7/7、workPreservation 4/4。各组不与其他阶段数字拼接。APK `0.8.10009 / 418009`，构建注入时间 `2026-11-27T14:42:14.529Z UTC`。这些是隔离候选、官方模拟器和临时 CI 签名证据，不构成生产准入或稳定签名覆盖升级授权。

证据索引：

- `work/d4-08/reports/05-ANDROID-EDGE-NAVIGATION.md`：58 例、通知/恢复/输入边界和全部历史限制。
- `outputs/MyTodo-D4-08-7c217d8-46018074859-a1/visual-evidence/ANDROID-REVIEW.md` 及同名 JSON：七图实际观察。
- 同目录 `PREVIEW-MAP.json`、`ORIGINAL-SCREENSHOTS.json`：原图/缩略图 SHA、尺寸、坐标映射和官方 ZIP member。
- 原 ZIP `outputs/MyTodo-D4-08-CI/7c217d8779ccf21e13733b28868e015e9cfd693a/46018074859-a1/archives/15206894156-d408-android-46018074859-1.zip`；53,017,991 bytes，SHA256 `8a2f19f7220431bc8d17df8df1d2964825befa1be80daad1f1943e6bb71569d1`。

## 2. 实际技术结构

| 层 | 当前实现 | UI 改造需要保留的边界 |
|---|---|---|
| 工作空间 | `D408Activity` 中的 WebView，HTML/JS/CSS 资产与候选专用 localStorage；入口本地 HTTPS origin `d408-native.local` | 继续使用隔离数据和现有工作事项交互；不能变成可调用生产账号、数据库或同步的通用桥 |
| 原生番茄钟 | `D408TimerActivity extends android.app.Activity`；Java 平台 `ScrollView`、`LinearLayout`、`TextView`、`Button`、`EditText`、`AlertDialog` | 原生 UI 只是现有 durable session 的展示/命令端；不能另起 JS 倒计时成为权威，也不能打开旧生产 `PomodoroTimer` |
| 意见反馈 | 原 `FeedbackToolsActivity` 进入固定 FeedbackKit AAR；原 `FeedbackApplication` 的独立备份 worker/storage | 原分类、状态、正文、真实图片、草稿、删除/撤销、备份/恢复语义保留；网页合成意见仍是独立领域 |
| 原生服务 | `AndroidCompanionService`、`ReminderScheduler`、闹钟/启动 receiver；小范围 `GxD408Native`/`GxD4Preview` 桥 | 生命周期、通知、完成领取和提醒仍走现有原生路径；外观变化不触及生产 sync/ACK/outbox/cursor/manifest/batch |

源码锚点：`android/d408/src/local/gxtodo/replica/D408Activity.java:30`、`:43`、`:62`、`:191`；`android/d408/src/local/gxtodo/replica/D408Bridge.java:18`；`android/d408/src/local/gxtodo/replica/D408TimerActivity.java:36`；`android/d408/native-integration.js:3`。

当前不是 Compose，也不是 Android Material Components 组件库。主题为 `android:style/Theme.Material.Light.NoActionBar`，sans 字体、accent `#329CC2`、状态栏/导航栏 `#343D40`（`android/res/values/styles.xml:1`）。Manifest 独立包 `local.gxtodo.d408candidate`、min 26/target 35、禁止备份、debuggable、禁止 cleartext；当前 manifest 未声明 INTERNET。原生外观不能仅凭主题名被称为已完成现代 Material 界面。

`android/d408/prepare.mjs:6` 要求精确 Actions HEAD 和同次 HTML receipt；`:14` 钉住 FeedbackKit AAR SHA256 `4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade`。`:67` 从 D403 源生成 candidate timer 文件，并仅在生成件将可见历史上限扩大到 Integer.MAX_VALUE；`:93` 生成 candidate FeedbackApplication 的 insets hook。固定 AAR 和原 FeedbackApplication 字节必须继续保留，后者基线 SHA256 `3e8f3226e3fde6f885c2c3b686f228bf105f8d86a18c398e55219395370b40f6`。

## 3. 当前布局问题：源码与已看到的画面

### 原生番茄钟

整个页面是单个纵向 ScrollView，外层 20dp 横向/24dp 纵向 padding。白卡是平直白色背景，16dp 内边距和16dp顶间距。顶部品牌、标题、解释、52sp 时钟及关联任务后，连续放置开始、暂停/继续、提前结束、完成正计时、开始休息、重置；刷新后再放模式、两组分钟输入、选/清任务、保存，接着历史、统计、后台解释、权限、返回、版本。源码：`D408TimerActivity.java:52`、`:60`、`:72`、`:83`、`:88`。

按钮 helper 只设置文字、ID、allCaps=false 和点击回调，基本使用默认 Button 外观（`:176`）。输入也是默认数字 EditText（`:177`）。所以主要行动、辅助行动、危险行动、状态无关行动混在同一视觉层级。禁用逻辑存在，但按钮仍占纵向空间。大量解释与控件使用户处理设置时失去顶部计时上下文。卡片仅靠白底和间隔分组，计时模式/主行动/数据概况之间缺少稳定层级。

已实际观察的 `android-d408-native-timer-full-controls` 预览显示滚动后的灰色按钮堆叠和设置区；首部时钟、历史和统计未入镜。不能把文件 label“full-controls”解读为整页同时可见。原生 timer Activity 目前没有像 D408 WebView 那样的显式 insets helper（`:93` 直接 setContentView）；这是后续 target35/键盘/系统栏验图应覆盖的风险，当前七图不能证明顶部时钟已经被系统栏遮挡。

### 任务选择

`D408TimerActivity.java:140` 创建默认 AlertDialog，单行搜索框和固定340dp高的 ScrollView。每个结果又是默认 Button，文字只有“已完成”前缀与标题。当前不显示父级、层级、同名任务上下文，也不折叠子任务；已有返回的 `parentId` 未参与展示。

选择只是写入 draft 并关闭对话框，随后点击“保存计时设置”才真正生效。这个两阶段状态应明确显示，不可为了减少按钮误改为立即写入。已关联任务标题异步解析；删除任务显示历史仍保留。源码：`:114`、`:115`、`:128`、`:146`。

### 反馈与工作区

FeedbackToolsActivity 本身也以原生默认控件垂直呈现四个主要入口，FeedbackKit 又有独立视觉体系。D4-09 可以统一候选入口、状态反馈和安全边距，但固定库的完整记录/图片/备份行为不能被一个看起来相似的网页表单替代。

360/412 工作备注图中，青色文本选择高亮确实可见，备注换行可读；但截图位置的合成长标题上部被固定 MyTodo 栏遮住，底部保存 toast 覆盖了部分说明。它们只能证明该帧备注选择状态，不能证明整页所有内容均无遮挡。后续应单列正常滚动、长标题、长备注、保存提示与安全区的云端可视证据。

七图中 image-preview 关闭按钮完整处于系统安全区；export-success 明确显示“意见备份已保存。”；visible-restore-error 明确显示失败及当前意见未替换。名为 restore-success 的原帧实际上显示“正在检查并恢复优化意见…”和禁用按钮，必须仍按进行中图使用。U05 完整数据/generation/图片断言证明恢复成功，与此帧的差异原因未确定，不能将它重标成可视终态成功。

## 4. 番茄钟原操作逐项保留表

| 原操作/状态 | 当前语义和控制条件 | 设计约束 |
|---|---|---|
| 开始专注 | `start`；仅非 running/paused 时可用 | 主行动可以突出，但不能重复启动现有会话 |
| 暂停 / 继续 | `pause` 仅 running；`resume` 仅 paused | 可按当前状态显示一个主按钮，动作语义和命令不变 |
| 提前结束 | `end`；确认后保留投入耗时及任务，history outcome=ended | 需保持确认、明确保留记录的说明 |
| 完成正计时 | `finish`；仅活动 countup；倒计时不能用它伪造正常完成 | 正/倒计时状态明确区分 |
| 开始休息 | `break`；仅非活动；休息始终倒计时 | 保留独立休息历史且不纳入专注分钟/完成轮次 |
| 重置计时 | `reset`；活动会话先记提前结束，既有历史不删除 | 不能变成清空历史；保留确认 |
| 模式 | configure.mode=countdown/countup；活动阶段禁止切换 | 模式控件视觉可改，锁定与解释保留 |
| 专注/休息分钟 | 均为1–180整数；活动时允许保存时长；现有内核按原规则更新 | 原校验、错误信息和时长更新能力保留，不能强行改成活动时一概不可编辑 |
| 选择 / 清除关联任务 | 修改 draft；保存前可撤回；提交前再次 resolve 并核对校验期间 draft 没变 | 展示待保存状态；不静默立即持久化 |
| 保存计时设置 | configure 携带 mode/durationMinutes/breakMinutes/taskId；活动会话关联可更新，结束历史保持原 taskId | 不改历史、不新增业务字段或数据库结构 |
| 刷新状态 | 放弃本界面的 pending retry 意图并读持久化实际状态 | 不等于撤销已落盘动作；文案不可承诺回滚 |
| 重试未确认操作 | 保留同一 pendingRequest，复用 commandId/expectedRevision/values | 不生成新 ID 后重复动作；未确认时不能展示为成功 |
| 全部记录 | 新到旧；按50条加载；保留 phase/outcome/mode/起止/elapsed/taskId/sessionId；详情可选择 | 分页可重新布局，不能裁掉原记录或伪造任务标题历史快照 |
| 专注统计 | 北京日；今天及前31天；提前结束投入计入，休息不计，正常完成专注倒计时才加完成轮次 | 别把正计时完成或休息自动当“完成一轮”；完整逐次历史仍可进入 |
| 后台与恢复/权限 | 页面离开不暂停；通知/精确提醒设置回工作区 settings | 不能用页面动画/浏览器计时器替代服务，不能承诺强停后自动运行 |
| 返回工作空间 | finish 当前 Activity，当前计时继续 | 返回不能触发 pause/end/reset |
| 版本/历史/复制 | versionName/code、by codex Git前5位、APK构建时间UTC、离线历史、复制 | 所有入口保留；版本事实由构建注入，禁止运行时生成编译时间 |

源码范围：`D408TimerActivity.java:60`、`:97`、`:104`、`:119`、`:128`、`:138`、`:151`、`:159`、`:166`；`NativeTimerSession.java:161`、`:180`、`:195`、`:202`、`:249`。

Activity 一秒刷新只是显示读取：onPause 停止 UI poll，不暂停会话（`:97`–`:99`）。实例重建保存 dirty、模式、task、taskTitle、两组输入和 pending request；新 snapshot 不覆盖 dirty draft（`:94`、`:99`、`:110`）。UI 改造必须保留这些未保存状态，不可每次重绘从 snapshot 覆盖输入。

## 5. 原生计时与任务数据契约

### 唯一计时权威

`prototypes/d4-03-platforms/android/src/local/gxtodo/d403preview/NativeTimerStore.java:23` 保存候选私有文件 `d403-native-timer-synthetic.json`，AtomicFile、16MiB容量、单worker、64队列。保存将内核锚点、元数据、history、completion claim、command receipts 放在同次写入，fsync+读回；异常丢弃未确认 RAM，并保留原文件。不能为满足容量裁掉历史/幂等回执；既有文件/.bak/.new存在时，读失败不能解释为空数据。参见`:39`、`:52`、`:67`、`:83`。

`NativeTimerSession.java:21` 的 protocol 为 **1**；包裹 schemaVersion=1、kind=`mytodo-preview-unified-timer`。命令严格限定 `op/action/values/commandId/expectedRevision`（`:94`）。同commandId同payload+expectedRevision回原已接受结果；不同payload同ID拒绝；旧revision拒绝。UI接收低于当前revision的状态也拒绝（`D408TimerActivity.java:105`）。

持久化字段：revision、phase、focusMode、status、durationMinutes、breakMinutes、sessionId、startedAt、taskId、completionPending、history、focusClockState、breakClockState、commandReceipts（`NativeTimerSession.java:153`）。返回另含 provider=android-native、protocol、mode、elapsedMillis、remainingMillis、focusedMillisByDay、completedSessionsByDay、今日统计、running/completed、completionId/completionDelivered 和 clock=Android elapsedRealtime（`:256`）。

每个 history row 的原字段为 id=sessionId、phase、mode、taskId、startedAt、finishedAt、elapsedMillis、outcome（`:249`）。既有记录不可变。当前 taskId 没有伴随持久化 accountId或历史标题；设计不能借任务树需求静默扩模型。`claim-completion` 是服务使用的内部命令，不应新增为面向用户的按钮。跨重启时钟恢复由原内核处理，prototype 的动画不能作为证明。

### 任务查询

`android/src/local/gxtodo/replica/PomodoroTasks.java:14` 在账号锁内取活动 accountId/name/database；已初始化时用现有 ReplicaDatabase.searchPomodoroTasks，否则读取原 JSON 树。query trim后最长256，limit限制1–100。返回 `{tasks:[{id,title,done,parentId}],hasMore,accountId,accountName}`；空标题展示“未命名任务”，deleted/idless排除。旧JSON搜索是迭代深度遍历、未完成先于完成、标题不区分大小写包含查询。`:38` 的 resolve支持指定账号，但当前 D408TimerActivity 调用时传活动账号，并未在 timer envelope 新存账号字段。

当前原生搜索每次输入异步查询；generation防止旧响应覆盖新查询，关闭弹窗也使旧结果失效；超过100结果提示缩小范围（`D408TimerActivity.java:145`）。UI 树不能从截断的平铺结果推断完整父子关系，不能把未返回的父级编成真实数据。

## 6. 任务搜索与父子折叠：网页原型可独立做的范围

先用明确标注的只读合成 fixtures 演示根任务、父子、多层、重复标题、已完成、未关联、没有匹配、超限、缺父级；ID/parentId固定，展开状态仅是 presentation state。搜索匹配子项时保留祖先上下文；清除查询可恢复之前的折叠状态。展开箭头与关联选择分开，避免用户只想展开时关联任务。长标题自动换行，结果旁显示祖先路径以区分同名任务。

原型可以展示“选择→待保存→保存”的完整交互，也可以演示输入校验、读取失败、未确认、同请求重试、刷新后的提示，但只能明确表述为原型状态。它不能调用真实桥/数据库，不能把浏览器本地 mock 成功写成真实原生持久化证明。

原型不提供 reparent、删除、完成任务等新业务动作，不为树形显示改数据模型。孤儿/循环/过深的合成关系须能安全降级到可选择的平铺项并说明上下文缺失；这属于展示健壮性，不代表同意修复或迁移生产数据。未来接真实查询时，如只有 capped100结果，则保留“更多结果，缩小搜索范围”，不声称完整展开全量树。

## 7. 左缘48与系统导航的精确边界

工作区 `prototypes/d4-01/mobile-controls.js:5` 用 **48 CSS px** 作为左缘识别范围；这与原生 API 的48dp不是同一种单位。开始点要求0≤x≤48；排除输入/可编辑内容和拥有真实横向滚动的祖先；x>22时还避开多数按钮、链接、summary、slider。任务标题保留特定例外。竖向意图优先退出，手势要求横向位移超过纵向1.6倍。接受阈值：距离≥55px，或距离≥32px且速度≥0.45px/ms（`:20`、`:22`、`:28`）。速度优先使用真实touch事件timestamp；touchcancel清理，长按/拖动原逻辑保留（`:32`–`:34`）。

Android API29+ 只设置一段原生系统手势排除矩形：左侧48dp、从80dp纵向位置开始、高度最多200dp且不越WebView边界；其他区域系统Back继续可用（`D408Activity.java:116`）。因此不能承诺“整个屏幕左缘48px总能抢先打开抽屉”。原型里看起来能滑开，也不能证明系统级手势仲裁。

API35实际WebView viewport由FrameLayout处理systemBars/cutout和max(system,IME)bottom insets，消费一次，不能再用重复CSS补偿（`:90`）。抽屉打开时结束浮动ActionMode，保留DOM selection/focus/dirty fields（`:205`）。onBackPressed只调用一次统一D4PreviewBack；无处理才退到后台，避免重复返回（`:245`）。恢复时的旧选择工具栏处理也不应通过清空实际文本选择实现。

D4-08 20个导航case覆盖360/412×手势/三键、13页入口、距离/速度/方向、真实输入/IME、明确标为合成的横向夹具、工作备注选择与系统返回。没有覆盖所有纵向起点、所有安卓版本、所有实体机。父子折叠、菜单或底部面板新增后，应把原48阈值、可编辑排除、横向滚动、DOM选择、长按拖拽及Back优先级列为后续Actions回归重点；不要顺便改阈值。

## 8. FeedbackKit 完整性边界

`android/src/local/gxtodo/replica/FeedbackToolsActivity.java:51` 的“查看优化意见”进入原库列表，`:52` 的“记个想法”进入原库编辑。`:102` 使用真实ACTION_CREATE_DOCUMENT/ACTION_OPEN_DOCUMENT；`:127`读取真实返回URI，恢复确认标题为“替换当前优化意见？”，取消不写数据。`FeedbackApplication.java:35` 独立worker负责DefaultFeedbackStorage备份，意见页打开/忙碌时阻止并发，明确进行中、成功和失败状态（`:42`、`:50`、`:55`）。错误恢复保持当前意见。

候选 `D408FeedbackInsets.java:20` 只适配API35+精确FeedbackActivity的图片dialog；校验feedback_close_image marker、Activity owner和实际content归属，再添加原padding+systemBars/cutout安全区。外部系统选择器不改。既有安全位置不能在美化时回退。

原库分类/状态/正文/图片真实字节、草稿跨重建、详情、取消删除、删除撤销、导出/取消选择/恢复确认/损坏失败/重试及generation语义全部保留。不增远程提交服务；目前反馈是本地意见管理。原生主入口和网页合成意见不能混用数据、伪装互相迁移。

## 9. D4-09 建议优先级与完成证据

| 优先级 | 候选设计工作 | 需要的证据 |
|---|---|---|
| P0 保留 | 先建立上述动作/状态/字段映射；声明原生计时唯一权威、固定FeedbackKit、48导航不变量 | 静态差异检查；现有测试/失败历史完整；Actions跑既有契约与交互 |
| P1 计时 | 明确计时首屏、状态相关主按钮、关联任务摘要、历史/统计入口；设置和低频/危险动作分组 | 360/412、正常/暂停/正计时/休息/失败/dirty状态的云端截图，键盘与系统栏无裁切 |
| P1 任务 | 搜索、父子折叠、祖先路径、同名区分、待保存关联和取消 | 先网页合成原型；后原生候选针对搜索generation、长树、超限/孤儿、保存校验的Actions交互 |
| P1 工作区 | 保留长备注选择高亮，同时解决固定栏/长标题/保存提示遮挡 | 360/412/desktop长标题与长备注云端截图；真实选择/输入/返回仍执行 |
| P2 反馈 | 统一原生入口/状态层级，维持原库功能与安全区 | 继续真实picker/SAF；补终态恢复成功图，不能复用当前进行中帧冒充 |
| P2 导航 | 视觉统一后的抽屉/菜单/弹层/Back优先级和触摸冲突审查 | 既有20项加实际新增交互，真实手势时序；不以prototype模拟证明Android系统行为 |

UI方向是对现有能力进行重排和样式统一，不能靠删除操作让页面变短。浏览器原型完成后按root统一契约进入所分配Android文件；本审计未生成/修改正式平台代码。

继续如实保留已知证据限制：F07没有历史/复制按钮真实点击和剪贴板验证；现有58例没有真实磁盘写失败后的同请求重试；timer持久化不等于面向用户的备份导入导出；重启证据是重开后恢复，通知PendingIntent为程序调用，不能写成重开前自主通知或手工通知栏点击。实体机、稳定签名、覆盖旧版、卸载、生产数据/模型/同步、D2、LAN/WebDAV、主分支合并及issue1关闭均不在本次授权内。root独占GROWTH更新。
