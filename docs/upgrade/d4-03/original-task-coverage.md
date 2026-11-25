# D4-03-A 原版任务、四象限、菜单、编辑与导航覆盖审计

审计日期：2026-11-25，Asia/Shanghai。范围：静态源码审查；没有运行本地项目、SQLite、编译、测试或真实同步。

## 1. 基线、证据与状态约定

- 负责人指定冻结 master：d4c5af4cbbb9192c19276dd371bd142c2b835534。
- 对比 D4-01/D4-02 冻结发布：03a72afca3f538cd0903624c89cb0d8bb068e470。
- 原版本地审查副本：C:/Users/adwoo/Documents/Codex/2026-11-23/mytodo-agent-mytodo-agent-mytodo-github/work/source/MyTodo-master。以下“原版”引用均为该副本的真实文件行号；主 Agent 应在统一报告中补充冻结 GitHub 提交与本地字节一致性证据。在一致性验证完成前，提交身份绑定属于 UNVERIFIED，源码中的实际代码内容属于 FACT。
- D4 对比：本工作区 prototypes/d4-01/app.js、domain.mjs、work-pages.js 的进入本轮时副本。以下 D4 缺失结论是改动前快照，不能因 D4-03 后续文件行号变化而覆盖历史遗漏。
- FACT：源码直接支持；PROPOSAL：恢复/适配方案；UNVERIFIED：未取得本轮运行证据；OWNER DECISION：需要负责人决定；BLOCKER：未恢复或未验证则不能宣布 D4-03 完整通过。
- 本文件中的回归项目是待执行用例，全部三端运行状态均为 UNVERIFIED。源码存在历史测试也不代表本轮执行通过。Android/Web 共用 UI 不等于已有 Android 原生触屏证据。

## 2. 三端真实入口与写入调用链

| 端 | FACT：页面入口与 UI | FACT：任务保存、存储及错误边界 | D4-03 PROPOSAL |
|---|---|---|---|
| Web / Node | src/app.mjs:58 默认 page=task、mode=quadrants；87 白名单路由；146 页面渲染；src/app.mjs:94 原导航 | src/app.mjs:93 的 commitQueue → 克隆状态 → writeState → undo/reminder/sync 调度；src/storage.mjs:16–23 normalizeState → diffState → editReplica，带原 vector/context；src/sqlite-store.mjs:7–8 账号目录 tasks.sqlite、WAL、FULL；22–29 BEGIN IMMEDIATE、revision 检查、rows/outbox/meta 一次事务、错误回滚/抛出 | 新 UI 用兼容 view model 调用既有业务层。隔离体验仅调用独立 synthetic repository；不能直接调用生产 SQL 或为了展示伪造同步成功 |
| Android | MainActivity.java:34–36 白名单直接包含同一套 src/app.mjs、model/schedule/task-tree/task-editor；45–84 WebView 加载 https://gxtodo.local/#/task；48 关闭 DOM storage；62 注册 GxNative | 当前 replicaVersion=2（121）；src/storage.mjs:8 → syncCall(op=replica) → MainActivity.NativeStorage.syncCall:129–135 → AccountStore.sync:48 → ReplicaDatabase.invoke。ReplicaDatabase.java:13–16 账号 tasks.sqlite、WAL、FULL、entities/outbox；31 起事务。AccountStore.java:16、33、35、37：每账号目录；已初始化数据库禁止旧 state.json 写入口。MainActivity.java:139–140 是兼容旧读写入口，不能作为新版 UI 默认写路径 | 复用共享任务 UI 和成熟 Java 存储/提醒入口；独立 APK 需独立 applicationId、资产/数据目录和 synthetic bridge，不能误接 GxNative 生产账号或真实数据库 |
| Windows C / Win32 | windows/gui.c:259 gui_main；252 create；68 原生四象限/时间轴 ListView；76–77 任务操作和原生卡片菜单 | windows/detail.c:18–19 保存时保留原 data、base、context；windows/database.c:26 db_edit_data → db_local:23 → db_begin/db_end:3；windows/database.c:33 账号 tasks.sqlite。op_move/task_complete/task_delete 同经 db_local 生成原复制事件及 outbox；UI 失败不应标记保存成功 | 原生四象限、详情、菜单及存储入口继续保留，新工作模块旁路整合。不能把浏览器包装器结果写成原生 Windows 功能回归 |

**FACT：Android 的原任务菜单不是另一套 Java PopupMenu。** MainActivity 的资产白名单加载共享 app.mjs，其原菜单和 Web 同源。NativeStorage.writeStateFor 仅是旧格式兼容路径；当前实际存储通过 replica 调用，二者必须区分。

**FACT：原编辑保存并非“一次所有编辑字段/分类/完成的原子事务”。** Web commit 的 replica 差异一次提交；Windows detail_save_record:18 依次调用 db_edit_data、save_categories、task_complete，后两者各有既有 db_local 边界。本轮保留这些生产行为，不自行声称或改造为新的跨操作事务。

## 3. 全部原任务菜单动作

原版 Web/Android：src/app.mjs:142 taskMenuModal；click 路由181–184、deleteItem:159。Windows：windows/task-menu.c:29–37；windows/gui.c:76–77。

| 原菜单项 | Web / Android 实际调用 | Windows 实际调用 | 兼容要求 |
|---|---|---|---|
| 编辑详情 | edit-task → openTask:148 | action 1 → ui_open | 保留完整字段和层级路径 |
| 完成任务 / 重新打开任务 | toggle-task → toggleTask:157 → setTaskDone | action 2 → task_complete | 重复任务生成、completedAt、reminderAt 和撤销沿用原业务层 |
| 上移一位 | move-up，找前一同级/同象限锚点 → reorder:158 | action 4 → op_step(-1) | 首项提示/无变更；不可跨父层级 |
| 下移一位 | move-down，找下一插入锚点 → reorder:158 | action 5 → op_step(+1) | 末项提示/无变更；不可跨父层级 |
| 很重要-很紧急 | move-quadrant(0) | action 10 → op_move(q=0) | 同一任务 ID；只更新允许的位置字段 |
| 重要-不紧急 | move-quadrant(1) | action 11 → op_move(q=1) | 同上 |
| 不重要-紧急 | move-quadrant(2) | action 12 → op_move(q=2) | 同上 |
| 不重要-不紧急 | move-quadrant(3) | action 13 → op_move(q=3) | 同上 |
| 删除任务 | delete-task → 确认 → 删除该层 siblings 中任务及子树；replica diff 处理墓碑 | action 3 → 确认 → op_delete_entity → task_delete | 独立便签不受影响；保留原墓碑/撤销与复制层行为 |

FACT：菜单有 9 个实际动作按钮（完成/重新打开是同一个随状态变化按钮），另有关闭。Windows 当前象限显示勾选；选择当前象限 action=0，不执行移动（task-menu.c:33、37）。Web 仍派发 reorder，同位置由成熟移动函数判定；不强行统一两端内部实现。

FACT：添加子任务、备注、提醒不是上述原菜单直接动作，它们在完整详情页中。D4-03 最新要求将它们纳入三点菜单至少可达范围，属于 PROPOSAL 的新增快捷动作：打开同一个详情模型并定位对应区域，不引入第二套任务保存逻辑。原菜单已有的 9 项不能缩减。

FACT：D4-01 app.js:44 的外观三点按钮实际 data-action=task-open，仅打开详情；它不是原菜单。D4-01 无上移/下移/四象限快捷移动菜单，属于 BLOCKER。

FACT：原 Windows 工具栏还有日/周/月/全部日期、未完成/已完成/全部状态、四象限/时间轴、时间/手工排序、Alt+←返回、Alt+→前进详情、放大/返回总览、立即同步、JSON导出/导入，以及项目页活动/归档筛选（gui.c:67）。原工具栏“放大当前象限”代码在总览下设置q0，并非基于选中任务推断象限。保留这些操作入口；新标题放大是最新要求的适配，不能伪称旧Windows已有任意标题直接放大。

## 4. 原有功能覆盖矩阵

“三端验证”列：W=Windows 原生；A=Android WebView/触屏；B=Web 浏览器。每行所需运行验证均 U=UNVERIFIED，缺失功能在本轮恢复并取得证据前维持 BLOCKER。

| ID / 功能 | 原版代码位置 | 原页面入口及业务逻辑（FACT） | 数据存储位置 / 语义（FACT） | D4-01 现状（FACT） | 缺失 / BLOCKER | 恢复方案（PROPOSAL） | 回归测试要求 | 三端验证 |
|---|---|---|---|---|---|---|---|---|
| T01 新建任务与默认值 | app.mjs:148；windows/database.c:28；windows/gui.c:73；detail.c:18 | 象限加号/标题、工具栏新建；当前日期09:00，当前象限及分组分类默认值；空新任务返回不落库 | ID、order、createdAt 由成熟函数；项目/地点/标签随分组或父任务继承 | app.js:58–61 表单有 title/quadrant/start；domain.mjs:108–118 使用成熟纯业务函数 | 部分保留；分组快捷继承和原输入行为未完整证实 | 继续 domain adapter，UI 调用 createTask；完整继承、取消/返回保留原规则 | 分组新建、父任务继承、空标题、取消、保存失败、重复点击仅一个 ID | W U / A U / B U |
| T02 编辑与原字段保留 | app.mjs:89、140、147；task-editor.mjs:4–13；Windows detail.c:9–10、18 | 详情，base/current 三方合并；改子任务不能升级为根；deleted parent 拒绝保存 | 保留 id、order、seriesId、generatedFrom、createdAt、completedAt、原分类；差异提交 | app.js:61、72–75 表单和 repo.updateTask 有实际保存 | review 编辑缺失；完整原值回写、并发删除边界仍待证 | 只发送 editable patch，保留未触字段，不从 UI 重新构造全任务 | 只改标题后逐字段比对；多层子任务保存；父删除后不得复活；分值小数 | W U / A U / B U |
| T03 删除 / 撤销 | app.mjs:93、159；Windows operations.c:3–6、32；tasks.c:12 | 确认删除当前任务与所有后代；原 undo 队列按设置时窗 | Web 业务树 diff 到 replica；Windows _deleted 墓碑，同一事件层；独立 notes 不受影响 | app.js:79 删除及 taskLinks 清理；没有原撤销入口 | 撤销 UI/时窗缺失 BLOCKER；原墓碑回归不能以 mock 删除代替 | synthetic repo 撤销独立演示；正式 adapter 复用 undo，保留比较当前值后撤销规则 | 取消/确认/父子删除、notes仍在、离线旧编辑不复活、撤销时窗/并发不覆盖 | W U / A U / B U |
| T04 完成 / 重新打开 / 复盘 | app.mjs:157；schedule.mjs:22–27；personal-ui.mjs:4–5；Windows tasks.c:11 | 列表/详情切换完成；重开恢复提醒；完成复盘、分值 | done / completedAt / reminderAt、review、weight；重复生成原函数 | app.js:38、44、61 完成和 weight；domain.mjs:132 调成熟完成函数 | review 详情编辑缺失 BLOCKER；页面按钮后状态反馈须验证 | 恢复复盘 textarea，保留 weight 0–100/小数与独立任务统计 | 完成后时间、重开后提醒、重复只生成一次、复盘/小数分值持久化 | W U / A U / B U |
| T05 子任务多层详情 | app.mjs:135、140、148–149；task-editor.mjs:16–19；task-tree.mjs:2–14；Windows detail.c:17、63 | 快捷输入，最多100个直接子任务；可进入完整子任务详情、继续新增层级、返回父路径 | Web嵌套树；SQLite entities.parent_id+data.parentId；同级 order、继承分类 | app.js:63–64、82 展示及新增，domain 使用 quickSubtask/saveTaskRecord | 子任务手柄/键盘排序及层级返回恢复不完整 BLOCKER | 恢复完整详情/breadcrumb；子任务独立排序调用 moveSubtask，不能拖成根 | 100/101边界、两层以上、保存返回、父删除、快捷输入连续创建与焦点 | W U / A U / B U |
| Q01 手机版四象限默认首页 | app.mjs:58、83、87；MainActivity.java:84；Windows gui.c:259 | Android启动 task/quadrants，保留日期/状态筛选；Windows page0原生任务 | 页面状态非生产任务结构 | app.js:15、86 默认 dashboard | 手机版默认工作台 BLOCKER | 手机/首次空路由 tasks；工作台保留为独立入口 | 空hash启动、重开、窄屏键盘、四象限稳定颜色、数量与信息 | W U / A U / B U |
| Q02 单象限放大 / 返回 | app.mjs:82、110–118、161、173–174；Windows gui.c:40–45、67、75、253 | 原窄屏总览点内容先放大；保留其余象限 peek。原标题/加号常为新建；放大后返回。Windows工具栏“放大当前象限”实际从总览选q0，已放大时标题切换/返回 | focusQuadrant / zoom、overview/zoom/peek滚动位置，非任务数据 | app.js:79 quadrant-focus 仅 scrollIntoView；55仍全部board | 完整可操作单象限视图 BLOCKER | 按最新要求标题/放大按钮进入单象限，保留独立加号；返回恢复筛选/滚动/排序 | 放大/返回/切换象限；放大新增编辑、拖动与移动；返回状态保持 | W U / A U / B U |
| Q03 同象限拖动排序 / 自动滚动 | gestures.mjs:2、9–21；app.mjs:158、242；model.mjs:29–38；Windows gui.c:126–168、194–216 | 手柄或可配置长按；垂直滚动取消等待；目标中点插入、列表边缘自动滚动；释放保存 | Web按 compareOrder后1024重编号；Win间隙中点，仅必要时重编号 | domain.mjs:133 暴露 moveTask；app.js无gesture调用/拖柄 | 可操作拖动、长按和自动滚动缺失 BLOCKER | 复用成熟手势命令，隔离UI适配selectors；不改生产顺序算法 | 长按阈值、滑动取消、长列表自动滚动、持久化、重复同位置无副作用、Esc/cancel | W U / A U / B U |
| Q04 跨象限移动与快捷移动 | app.mjs:158、183–184；model.mjs:30–38；Windows operations.c:17–31 | 拖到目标象限，菜单或详情更改；原任务ID保留；子任务不跨父层级 | 仅 quadrant/order可变；标签/项目/地点/提醒/notes/subtasks不重建 | app.js:61详情象限可改；无可操作drag/menu move | 跨拖与菜单移动 BLOCKER | 根任务moveTask；子任务按原独立quadrant/同级order语义；禁止删建移动 | 原ID及全部其他原字段比对，两个计数更新，重开排序，非法before/异层锚点拒绝 | W U / A U / B U |
| M01 三点菜单9原动作及新快捷可达 | app.mjs:105、142、181–184；Windows task-menu.c:29–37；gui.c:76–77 | 同一完整动作表；关闭/遮罩/Esc/焦点；当前象限勾选 | 调既有编辑/完成/移动/删除层 | app.js:44 三点直接详情 | 原menu缩减 BLOCKER | 9项全保留；新增子任务/备注/提醒定位同一详情，mobile bottom sheet/desktop popup | 每项执行、当前象限、首尾排序、焦点键盘、遮罩关闭，任务手势不误触 | W U / A U / B U |
| A01 标签自动完成 / 多选 | app.mjs:137–138、154–155、227–228；Windows detail.c:63、10、13–14 | 实时过滤候选、可点、Enter确认、chip移除、多标签；原Windows编辑Combo可选目录且支持多分隔符去重 | tags数组；目录tag以名字作为分类键；保存新增去重分类 | app.js:61、73逗号字符串输入 | 候选/点击/键盘/chips缺失 BLOCKER | 复用目录及matchesQuery，多选chips，独立创建去重；不降级成字符串存储 | 搜索NFKC大小写/空白、多选去重、无匹配创建、Enter/IME、移除后原关联 | W U / A U / B U |
| A02 项目自动完成 / 安全关联 | app.mjs:127、137、147、155、159；Windows detail.c:63、13–14；operations.c分类逻辑 | 原可选非归档项目与当前已归档关联，输入新名字创建；删项目清task.project，任务保留；原任务project按名称 | 项目实体有ID；原task.project名称字符串，不能声称已存projectId | app.js:61用projectId选择框；taskLinks旁路ID；work-pages.js:269拒绝重复名 | 可搜索创建自动完成缺失；历史重名安全映射 BLOCKER | ID仅旁路view-model映射；0/多匹配/删除/重名显式待解决，不能取首项或把name当ID | 重名不同ID、缺失关联、归档当前项目、删项目任务保留、重命名不误联历史同名任务 | W U / A U / B U |
| A03 地点自动完成 / 原换行 | app.mjs:137–138、89、154–155；task-editor.mjs:39–42；Windows detail.c:60–61、63、7–10 | Web候选过滤/选择/新建/清空；地点文本编辑按Enter换行并保存draft；Windows多行EDIT+已有地点选择 | task.place字符串；places目录；trim与换行的原行为各端须保留 | app.js:61普通input、73trim | 候选与多行输入缺失 BLOCKER | 恢复搜索候选及textarea；输入时保留草稿并在保存目录去重 | 已有/新建/清空、两行地点、无提交Enter、切页保存、历史候选重开 | W U / A U / B U |
| E01 日期、全天、提醒完整表单 | app.mjs:139–140、147、156；personal-ui.mjs:4–7；schedule.mjs:4–11；Windows detail.c:63 | 时间选择/今天/明天/清除；结束不可早于开始；提醒offset/day/custom，预设及自定义 | 开始/结束按北京时间墙钟 YYYY-MM-DDTHH:mm；reminderAt为派生epoch或null；保存不改时区 | app.js:61、70、73有字段和合成提醒中心，明确不系统通知 | UI字段部分保留；日期快捷与原提醒交互未完整；原生提醒回归 BLOCKER | 恢复既有快捷选项，成熟ReminderScheduler/Windows提醒另测；mock不声称背景通知 | 清空/非法日期、跨天/闰日、提前分钟/09:00/自定义、系统权限/重开、错误不成功 | W U / A U / B U |
| E02 重复任务完整规则 | schedule.mjs:6–8、12–27；personal-ui.mjs:4–7；Windows tasks.c:7–11、detail.c:9–10 | daily/weekdays/weekly/monthly/yearly，间隔1–365，until/anchor，多星期；完成只生成下一次；月底按anchor适应 | weekdays 0=日、1=一…6=六，周起始周一；seriesId/generatedFrom去重；下一次及后代原字段偏移 | app.js:61单选星期；73有限保留旧weekly数组；domain沿用成熟函数 | 多星期编辑缩减 BLOCKER；原月末/后台重复不可只演示按钮 | 复用多选表单和原生成器；仅改标题不得重锚；保留复杂旧规则 | 周多日/空旧周数组、隔周/月31/闰年/截止、完成重开不重复生成、后代/提醒偏移 | W U / A U / B U |
| E03 文本/键盘/明确保存 | app.mjs:140、147、228；task-editor.mjs:22–36；Windows detail.c:23–34、63、130–137 | title/notes/review/place/快捷子任务 Enter换行；项目标签Enter确认；输入法不提交；独立保存与关闭/返回保存 | 不更改存储字段；文本换行按原端转换 | app.js:61普通form提交、地点input；明确保存存在 | 原快捷键、换行/关闭保存与自动草稿 BLOCKER | 恢复成熟Enter策略、明确保存反馈；UI导航保存失败不能离开 | Enter/Shift/Ctrl/IME、焦点保持、保存仍在详情、关闭保存、错误仍保留编辑 | W U / A U / B U |
| F01 日期/状态/分组/时间轴筛选 | app.mjs:81、103、108、127、130；model.mjs:7–23、45–58；Windows gui.c:67–68 | 日周月、前后周期、today、all dates、pending/done/all；项目/标签/地点图标四象限，名称时间轴 | visibleTasks原规则：未完成过去任务继续显示，完成任务日期过滤；过期repeat.until过滤；周一周起 | app.js:14、54–55有日期/状态/projectId/手工时间sort | 地点/标签目录分组与原时间轴入口缺失 BLOCKER | 原查询函数不重写；补目录入口和timeline切换，保存view-state | 上期未完/完成过滤、周月边界、until、分类/全部、时间与手工排序口径 | W U / A U / B U |
| F02 完整搜索 | app.mjs:132、227；model.mjs:26–28；Windows gui.c:68与query层 | 任务/任意层子任务/title/notes/review/分类/时间，以及独立notes/projects/tags/places；多关键词AND | 搜索业务投影，NFKC、locale lower，不写数据 | app.js:71支持任务和工作模块；notes/tags/places目录不可见 | 原实体搜索覆盖待补 BLOCKER | 继续searchAll并把独立实体加入结果；区分新工作模块 | AND关键词、中文/NFKC、后代复盘、notes实体、点击定位、空搜索不暴露错误 | W U / A U / B U |
| N01 原导航所有入口 | app.mjs:94；windows/gui.c:3、72；MainActivity.java:102–118 | Web/Android任务、便签、项目、地点、标签、统计、搜索、导出、设置、帮助、账号；Android另番茄钟、优化意见；Windows任务/便签/项目/地点/标签/搜索/统计/同步/设置/账号 | 账号分域、导出业务备份；地点/标签目录独立；feedback是独立域 | app.js:13仅11个D4路由，缺多项个人入口 | 原places/tags/search/account/export/help以及个人工具导航缺失 BLOCKER | 保留原入口并加入工作模块分组，搜索/帮助/目录不因建议菜单遗漏而删除 | 逐原菜单可达、返回、账号分域、新页面原菜单仍在、合成导出不连真实数据 | W U / A U / B U |
| N02 边缘右滑/抽屉关闭 | gestures.mjs:34–85；app.mjs:94、242；MainActivity.java:194–195；Windows gui.c:253 | 原Android workspace右滑开nav，门限72px与1.5方向比；仅无editor/modal/picker/nav时；原不是严格左边缘限定；Android返回派发gx-back | navOpen/历史，不属于task schema | app.js:79 nav-toggle仅CSS按钮，无touch边缘实现 | 最新全局边缘要求、左滑关闭和冲突处理 BLOCKER | 独立edge判定：仅最左起点、方向/距离门限，内容scroll与拖动/输入不抢；抽屉遮罩/左滑/back统一状态 | 各主要页边缘打开，内容右滑不打开，垂直/输入/拖动不冲突，遮罩/左滑/Android返回关闭 | W U / A U / B U |
| N03 编辑草稿与页面状态保持 | app.mjs:64–76、89、146、161；view-history.mjs；Windows gui.c:72–75、detail.c:18–19 | Web离开前capture/save，保存失败不离开；scrollPositions按overview/zoom/peek/详情；返回逐层；Windows保存后历史栈 | UI memory/history；任务更改仍用成熟保存，不以缓存替代持久化 | app.js:40–42、85关modal并将main.scrollTop=0 | 切页草稿/滚动/筛选恢复缺失 BLOCKER | 独立draft/view map并兼容原save-on-leave；新nav开关先capture，不随render丢输入 | 任务编辑切notes/projects再回；保存失败；zoom scroll/filters；输入法中切页；Androidback层级 | W U / A U / B U |
| S01 原个人统计口径 | personal-ui.mjs:6；schedule.mjs:30；app.mjs:146；Windows统计既有入口gui.c:3、72 | flattenTasks含子任务，完成/待办/逾期、完成分值、7天完成趋势、象限完成 | done/completedAt/weight；原逾期end优先否则start；独立于工作事项/流程 | work-pages.js:183–193新增analytics，统计仍基于合成数据 | 个人统计完整页面/分值趋势待恢复 BLOCKER | 原statsPage/算法独立展示；新workItems/projects/processes另口径，不合计冒称任务 | 子任务/复盘分值/7天时区、同task只计一次、工作统计分开、筛选范围说明 | W U / A U / B U |

备注：便签、番茄钟、优化意见、同步与设备的完整操作和独立数据域由其他 D4-03-A 审计文件补充。本矩阵不把它们缩减成任务备注或虚构生产能力。

## 5. 关系与字段兼容结论

1. **FACT：原任务的 project 是名称，项目实体同时有独立 id。** app.mjs:127 用 task.project===p.name 计算项目任务；147 使用名字判重；159 删除项目时按名字清空任务关联。Windows detail.c:13 以名称查询现存分类，给 project 新建 UUID，task.project 保持名称。D4 不得把“历史数据已经按ID关联”写成事实。
2. **PROPOSAL：新工作关系只在 isolated taskLinks/view-model 中使用 projectId/workItemId。** D4-01 app.js:21–34、75 已提供旁路示例。历史名字映射只有唯一匹配才可建议候选；零匹配、重名多匹配、已删除/已归档状态应保持 unresolved，并要求明确选择。任何生产关联改写或数据库迁移是 BLOCKER/另案权限，不能本轮自动执行。
3. **FACT：原字段还包括 review、weight、allDay、seriesId、generatedFrom、reminderAt、order、createdAt、completedAt。** 这些不能从新UI重构任务时消失。D4只显示部分字段并不意味着其他字段可删。
4. **FACT：两端原排序实现存在算法差异。** Web成熟moveTask重编号目标/旧象限；Windows op_move:26–29使用间隙中点并仅必要时重编号。D4-03的“业务语义一致”应验证最终顺序、身份和字段保留，不能要求生产原值强行统一以修改成熟协议行为。
5. **FACT：时间不是设备当前时区浮动值。** src/schedule.mjs:4–5 明确 +08:00解析与格式；model.mjs:4–23日期按Asia/Shanghai及周一周起。星期存储0–6、0周日；UI周一先排列不等于重编码。保留D1候选契约中原始值/业务投影区分，不借UI标准化真实历史原值。
6. **FACT：子任务是完整任务实体。** Web嵌套树和SQLite parent_id映射必须保留，不能用“标题+done”小对象替代；当前UI父子字段继承不能误变成父字段修改级联覆盖所有历史子任务。
7. **BLOCKER：真实历史 schema、异常原值、重名关系及生产迁移准入仍未验证。** 本轮使用 synthetic fixtures，不读取或改写真实用户数据。

## 6. 手势及操作习惯冲突登记

| 冲突 | 证据（FACT） | 统一处理（PROPOSAL） | 未满足时状态 |
|---|---|---|---|
| 原标题新建 vs 最新标题放大 | app.mjs:111–118；help:144；Win gui.c:253 | 保留醒目独立“+”，标题/放大按钮进入单象限；不能同一次点击又新建又放大 | BLOCKER |
| 原内容右滑nav vs 全局严格左边缘 | gestures.mjs:42–59；app.mjs:242 | 只从边缘起始捕获导航；task内容原左右滑菜单/完成保留；新nav允许各主要页且编辑draft不丢失 | BLOCKER，触屏 UNVERIFIED |
| 普通滚动 vs 长按排序 | gestures.mjs:11–13；Win gui.c:204–216 | 保留longPress设置、方向阈值取消、手柄明确；点击抑制防意外完成/删除；边缘nav优先只限edge起点 | BLOCKER，原生 UNVERIFIED |
| 编辑Enter换行 vs HTML隐式提交 | task-editor.mjs:22–32；Windows detail.c:23–34 | 复用成熟输入策略；项目/标签确认、明确保存；地点/备注/复盘允许换行 | BLOCKER |
| 原名称关系 vs 新ID关系 | app.mjs:127、147、159；D4 app.js:61、75 | 旁路ID且标记ambiguous；用户明确选择后只更新合成关系/兼容视图；不改真实DB | BLOCKER/OWNER DECISION：生产安全映射另批 |
| 模块nav切换 vs 编辑状态 | app.mjs:66、89、161；D4 app.js:40–42 | capture草稿、保存失败阻止离开，按页恢复view state；菜单打开不能清除表单 | BLOCKER |

## 7. 已存在的回归入口与本轮证据要求

FACT：原源码存在 tests/model.test.mjs、task-tree.test.mjs、schedule.test.mjs、task-editor-enter.test.mjs、subtask-time.test.mjs、completion-day.test.mjs、navigation-gestures.test.mjs、view-history.test.mjs、interaction.test.mjs、undo-sync.test.mjs、native-storage.test.mjs。Windows有 drag-test.c、advanced-test.c、storage-test.c、selftest.c、repaint-test.c、visual-test.c 及 detail.c:130–146 的原生详情回归。文件存在本身只证明用例/入口，不能证明本轮结果。

PROPOSAL：GitHub Actions分别执行：

- Web：原纯逻辑套件 + 移动/桌面浏览器真实DOM交互。首屏、zoom、三点菜单全部动作、自动完成、边缘导航、草稿、排序/跨移动、字段原值比对；对触摸需实际touch输入，不能只dispatch合成事件后宣布手势实测。
- Android：共享UI逻辑 + 独立合成applicationId/storage bridge + 设备或模拟器触屏、返回键、旋转/重开、提醒权限/后台等证据。Chrome移动viewport不是Android测试。
- Windows：原C存储/任务/拖动/详情/键盘测试使用显式--data-dir合成目录；原gui_main:259拒绝未给isolated data-dir的回归模式。另测新模块独立适配；浏览器桌面Demo不是Win32原功能测试。
- 保留C0-04跨端协议和D1/D2冻结验证，不替换、不删除，UI套件不能作为生产同步准入。

每次CI记录源码SHA、逐端总/通过/失败/跳过数、原始失败日志、包与截图/录屏、矩阵ID映射、未达条件。任何skipped均保持UNVERIFIED；不能以总通过率隐藏未恢复项。

## 8. 审计结论及未决 BLOCKER

**FACT：原任务能力可以复用，D4-01尚未完整承接其操作习惯。** 新原型已有合成任务CRUD、分类字段、重复/提醒规则和新工作页面，并复用了成熟纯模块；可继续扩展，无需替换生产任务/同步系统。

当前必须显式保留的BLOCKER：移动首屏、真正zoom、长按与跨象限drag、完整menu、自动完成与分类目录、复盘编辑、多星期重复编辑、原Enter/草稿/返回/滚动、独立个人统计与撤销、全部原导航、三端真实回归与触屏/后台证据。恢复后由主Agent在统一覆盖矩阵中附实际实现及CI证据，不能把本审计中的PROPOSAL改标FACT而无对应证据。

生产数据库结构/迁移/真实用户数据/真实远端/LAN-WebDAV双通道/ACK-outbox-cursor-manifest-batch既有语义调整/D2合入/Android issue #1关闭均不在本轮权限。Android issue #1保持开放。

## 9. D4-03 当前候选补充覆盖（首轮云端执行 0）

本节追加本轮实现与未达条件，保留第 1–8 节进入 D4-03 前的缺失审计。FACT：首轮源码 `288b0b97d9974e3797a5099c97d5aeb1c3e26dc9`，UI Actions [45533988173](https://github.com/johny751/MyTodo/actions/runs/45533988173)、C0 [45533988196](https://github.com/johny751/MyTodo/actions/runs/45533988196) 被账户 billing/spending limit 拒绝启动。已执行/通过/失败测试均为 0，没有本轮 HTML、Windows 或 Android 安装体验包、截图。25 项 Android 强制测试是计划数，不是通过数。

下表 FACT 只指候选源码存在相应处理；所有运行、持久化及三端交互仍为 UNVERIFIED。手势/原习惯的详细证据、快照哈希和必要回归见 [platform-readiness.md](platform-readiness.md) H01–H12。后续修正和执行结果由主 Agent 按新源码 SHA 补充，不能删除首轮拒绝证据。

| 原矩阵 ID | FACT：本轮独立候选源码覆盖 | 待执行证据 / 仍须保留差异 | 三端状态 |
|---|---|---|---|
| T01、T02 | `app.js:78–83/98–102` 完整textarea标题、象限、开始/结束、allDay、分类、review、weight、多星期/提醒表单；`domain.mjs:108–129` 复用成熟创建/保存函数。 | H05/H09/H11：原keep-open/leave保存、group快捷默认及历史原值仍未完整证明。原并发/base/父删除与实际存储API仍需原生回归。 | W U / A U / B U |
| T03、T04 | 删除保留确认/子树；`offerUndo/undo:104–106` 为独立合成快照及后续修改保护；完成沿用原模型，复制后续任务旁路links；review与小数weight可编辑。 | 撤销非生产 UndoQueue/墓碑回归；H01/H05：方向、release及编辑完成屏障。R06/R06b、M-legacy 计划未执行。 | W U / A U / B U |
| T05 | 完整子任务详情、继续新增、原同级 moveSubtask API；菜单可上/下移。 | H03/H06：手柄/键盘/触摸排序、父路径/返回、quickTitle换行及save顺序缺口。100/101及父删除 UNVERIFIED。 | W U / A U / B U |
| Q01、Q02 | `app.js:15/132` 空路由默认tasks；标题zoom、独立加号、真正single-quadrant；M01–M03与Android对应计划用例。 | H04/H10：原overview内容tap/peek跨拖与按象限滚动key未完整恢复。没有Android启动结果。 | W U / A U / B U |
| Q03、Q04 | `mobile-controls.js` 准备触摸长按、拖动、auto-scroll；`moveTask` 复用原根/子移动API；三点及表单可改象限；M04/M05/M-large准备原字段与任务数断言。 | H01/H02/H04：原方向/release、取消/pen/配置/手柄和zoom跨拖仍有静态差异。真实触屏/顺序持久化没有结果。 | W U / A U / B U |
| M01 | `taskMenu:69` 保留原9动作及子任务/备注/提醒/复盘快捷；R02准备可见首尾排序。 | 全动作实际执行、当前象限反馈、焦点与各端menu仍未验；Android只检查动作存在不能等同9项全部执行。 | W U / A U / B U |
| A01–A03 | `autocomplete/catalogList/pickCatalog` 具有chips、匹配候选、键盘选择、创建/清除，projectId为旁路ID；place为多行并保留未编辑空白原值；R03–R06b/M07–M09/L05计划。 | 原重名/删除/归档关联与IME待验证；原生产name键没有改为ID；不得用synthetic ID证明生产关系迁移。 | W U / A U / B U |
| E01、E02、E03 | 多星期、repeat anchor、原时区、review/weight、Enter/IME防隐式submit、textarea地点/备注，合成提醒中心；成熟schedule生成器保留。 | H05/H06/H07/H11：日期快捷、keep-open/leave、quick输入、原值边界和系统调度；Web计划不能证明Android通知权限/后台。 | W U / A U / B U |
| F01、F02 | 分类页/独立时间轴、日周月/前后周期、活动/归档目录、精确关联；L01–L07计划；全局搜索含任务及新增工作实体。 | H07/H08/H09：原quad周期手势、全局notes/tags/places结果、组内新建缺口。不存在本轮运行通过。 | W U / A U / B U |
| N01、N02 | 新导航保留个人工具、分类、时间轴、工作模块与系统入口；严格左22px起始判定、方向门限、遮罩/左滑/Back；M10–M17及Android11页计划。 | H01/H02/H07/H12：内容手势、边界周期、原全部菜单/账号/帮助兼容；系统手势/IME/无障碍无证据。 | W U / A U / B U |
| N03 | pageMemory保存modal与输入值、各页view与scroll，切页恢复未保存草稿；M18与R01计划。 | H03/H05/H10：原保存失败阻止离开、返回父详情、per-quadrant scroll不同；内存草稿不是进程重启持久化。 | W U / A U / B U |
| S01及独立工具 | 原个人任务统计与新增工作统计分开；独立便签、番茄、优化意见、sync/devices/data-system存在实际synthetic处理，详见personal审计。 | 原Androidservice/通知/反馈独立DB与图片字节、真实sync/设备/生产API/正式Win32仍BLOCKER；平台包均未构建。 | W U / A U / B U |

BLOCKER：现有测试计划没有覆盖全部原菜单执行、鼠标/pen、子任务手柄和父路径、save/leave故障、single-quadrant peek、原周期手势及全部实体搜索。源码增加页面或计划测试不能关闭这些缺口。账户问题不阻止独立静态修订，但未恢复云端执行资格前不能宣布 D4-03 完成。

