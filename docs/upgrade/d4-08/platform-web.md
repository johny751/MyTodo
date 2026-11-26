# D4-08-01 Web 与跨平台静态审计

更新：2026-11-26 Asia/Shanghai。审计基线：`04c525c55fc136ad1b960b5d727dab3c5e3165fd`；候选分支 `d4/d4-08-candidate-1`。本文为主审计输入，不替代 Windows/Android 专项报告。所有源码位置相对 `work/d4-08/source/`。本次只读取源码、文档和既有 Actions 报告，没有本地运行项目、测试、浏览器、数据库或编译。

## 证据分层与状态

- **V 已实现且验证通过**：仅指列出的云端隔离测试范围，或 OWNER-REQUEST 明确的人工验收项目。
- **I 已实现但未验证**：源码可定位，但没有足够的对应执行证据。
- **P 部分实现**：入口、业务、持久化或回归覆盖有明确缺口。
- **U 仅有界面**、**N 完全缺失**分别使用，不能将有真实候选 CRUD 的模块说成静态页面。
- **R 受生产准入限制**可以与 V/I/P 同时成立；当前允许隔离候选实现，不等于批准正式模型、数据库迁移或生产同步。

当前共有三条不同调用链：正式 Web `src/app.mjs → src/storage.mjs → databaseCall/sync-client → sqlite-store`；共享隔离 HTML `prototypes/d4-01/app.js → domain.mjs → 独立 localStorage`；D4-06 `v2-service.mjs → 显式绑定的既有 V2 storage`。后者尚未挂载到任何正式 UI。Android D405 注入同一共享 HTML 并增加原生服务桥。实际 Win32 EXE 使用 `windows/workspace.c` 原生窗口，不执行该共享 HTML；因此 Android/Web 已有的工作模块不会自动出现于 Win32。

既有可引用基线：UI Actions `45743320346` attempt 1；C0 Actions `45743320319` attempt 1。保留交付 `outputs/MyTodo-D4-Native-04c525c-45743320346-a1-r2/audits/web/WEB-COVERAGE-AND-PRODUCTION-GAPS.md` 确认 Windows 和 Ubuntu 各 164/164 browser、40/40 domain（原35 + D406新增5）。这些数字不是 Win32 或 Android 原生通过数，也不证明全部原生体验完整。原 Android 58 与 D405 15 由 Android 专项报告解释；C0 936执行、936比较另列，不能合并。

## 至少22项功能矩阵

Web 列明确指共享隔离候选；涉及正式 Web 的差异在原版列记录。Android/Windows 的最终证据归属各专项审计，本表不把浏览器测试转记成原生结果。

| 功能 | Windows 原生候选 | Android D405候选 | Web 共享隔离候选 | 原版状态 / 源码依据 | 当前差异与整改方向 |
|---|---|---|---|---|---|
| 四象限 | V，负责人手验通过 | V，负责人手验通过 | V，保留原 browser用例 | 正式 `src/app.mjs` 任务板；候选 `app.js` | 保留现有结构和操作 |
| 象限放大缩小 | V，手验通过 | I/V，源码及原D403覆盖，专项核实 | V，既有browser覆盖 | 候选 `app.js` quadrant焦点切换 | 不以工作台替换四象限 |
| 任务增删改查 | V，手验通过 | V，手验及原套件 | V，已有核心业务和browser覆盖 | `domain.mjs` 复用冻结纯业务模块 | 新工作关系不得写入正式任务结构 |
| 拖动排序及跨象限 | V，手验通过 | V，手验通过 | V，原browser保留 | 候选任务手势与正式 `src/gestures.mjs` | 保留排序规则及真实触摸回归 |
| 子任务 | P，已有子任务；Ctrl+Enter缺失 | P，已有子任务；共享快捷键缺失 | P，已有子任务；Ctrl+Enter缺失 | 正式 `src/task-editor.mjs:23` 拦截任务表单Enter；共享 `app.js:187` 无该快捷键 | 新增焦点感知Ctrl+Enter，不能误保存父任务 |
| 标签和项目自动补全 | P，手验只有过滤匹配 | V，手验通过 | V，combobox候选、上下键/Enter/Escape | `app.js:84` 输入候选；`:168` 键盘选择 | Windows补齐候选列表、鼠标/键盘确认与无匹配提示 |
| 任务备注 | V，手验通过 | V，手验通过 | V，原browser与新增长文本视觉覆盖 | 候选任务备注；独立便签在 `personal-pages.js` | 保留换行空格和原始历史时间，不混淆独立便签 |
| 番茄钟 | N，当前无可用原生入口/持久化 | P，原生状态与服务已验；完整入口/界面被手验指出缺失 | V/P，开始/暂停/继续/结束/完成及原始状态有测试，长历史和可发现性仍须提升 | 正式 Web `src/app.mjs:94,141` 只在 `GxNative.openAndroidTools` 存在时给原生入口；普通浏览器原版没有独立番茄页 | Windows补真实原生；Android保留唯一状态权威并完整呈现；不虚构原Web删除了某计时器 |
| 番茄钟历史与统计 | N，当前无原生持久化 | P，原生数据存在；NativeTimerActivity仅最近10，任务选择依赖Web | V/P，history最多10000、专注日统计和轮次；欠更好的历史查询与恢复说明 | `personal-pages.js:68-136,199-244`；`native-timer-adapter.js:19-40` | 统一字段/时区/完成一次规则；设备重启须新增真实云端验证 |
| 优化反馈 | P，旧本地文本意见、备份恢复存在，不能等价AndroidKit | P，完整FeedbackToolsActivity入口仍在，同时默认共享模块更简；不能说按钮只开新意见 | P，真实本地CRUD/草稿/图片原字节/备份；无图片预览、单图移除、分类、完整删除批次/恢复代次UI | 正式Web `src/feedback-ui.mjs:21-22` 本就文本pending/resolved；原AndroidKit是更丰富基准 | 保留独立存储，恢复富流程；本地保存不能写成远端提交成功 |
| 左侧导航 | V，现有原生入口；跨模块入口待补 | P，手验与系统返回冲突 | P，x≤22边缘阈值虽已测试但窄，未协调Android系统手势 | `mobile-controls.js:18-24`；正式 `src/gestures.mjs` workspace右滑不只限22px | 与原生排除区联动扩大合理区域；可关闭、滚动保护、速度判定 |
| 工作台 | P，旧实体汇总真实可用，缺新工作域 | I/V候选，包含共享实际汇总；非每项原生手验 | V+R，实际工作域汇总和导航 | `app.js` dashboard；`domain.mjs` composite | Win32补候选工作域汇总和可操作关系 |
| 工作事项 | U/N新域，现有限制页不是工作事项实现 | I/V+R，共享CRUD已实现，Android专项验证范围另列 | V+R，实际CRUD/状态/时间/任务关联/原始附件 | `work-pages.js:217,274,410,440-449` | 新增Win32隔离候选持久化；正式模型继续R |
| 项目管理 | P，旧项目可用，成员/负责人等扩展不全 | I/V+R，共享扩展存在 | V+R，项目+projectMeta、负责人/成员/历史/任务关系 | 正式 `src/app.mjs:127-129` 基础项目；`work-pages.js:220,433-439` 扩展 | 不把扩展压入旧description；稳定ID关系不静默重绑同名项目 |
| 流程模板 | U/N，新域未落实原生可操作页面 | I/V+R，共享实际模板CRUD/复制/启停 | V+R，实际版本/步骤/复制/启停 | `work-pages.js:451-457` | Win32补隔离模板与历史版本，不反改既有实例 |
| 流程实例 | U/N，新域未落实原生可操作页面 | I/V+R，共享实例/步骤/暂停继续 | V+R，创建时保存模板快照与版本，步骤推进 | `work-pages.js:459-464`、process actions | Win32补实例和事项/项目导航；保持模板快照语义 |
| 往来与跟进 | U/N，新域未落实原生可操作页面 | I/V+R，共享CRUD与跟进关系 | V+R，往来、跟进时间/内容/状态、项目事项关联 | `work-pages.js` contact/followup forms/actions | Win32不能只提供占位菜单 |
| 工作归档 | P，旧任务/便签/项目归档；无完整新域 | I/V+R，共享各类归档/恢复 | V+R，恢复保留ID及关系 | `work-pages.js:403-406,416` | 新域隔离实现；不得混为反馈删除批次或图片存储 |
| 统计分析 | P，旧实体统计可用，新工作域不全 | I/V+R，共享统计存在；完整原生体验待核 | V+R，工作统计+日期范围；计时统计独立 | 正式 `src/personal-ui.mjs:6` 旧任务统计；`work-pages.js` analytics | 明确Asia/Shanghai日界；不把任务完成数当计时轮数 |
| 设置 | P，原生设置与旧管理入口；新域入口不完整 | I/V候选，原生工具与共享设置并存 | V/P，实际交互/外观设置与部分只读边界说明并存 | `app.js` settings、`legacy-pages.js` | 所有禁止项保持关闭，不将只读说明标为已启用 |
| 数据备份与恢复 | P，旧模型备份及独立feedback数据；新域缺失 | P，共享合成数据与独立Kit各有边界；全流程原生回归不足 | V/P+R，共享合成备份/校验/恢复与独立反馈备份；正式存储未挂载 | `domain.mjs` load/save；`personal-pages.js:342+` 图片校验/导入；原FeedbackStore | 不能跨域静默合并；原始图片必须随备份保留 |
| 同步 | R，现有协议冻结，候选无正式连接 | R，候选无INTERNET/真实远端 | P/R，同步中心为隔离演示；V2 storage仅服务测试，未挂UI | `prototypes/d4-06/v2-service.mjs`；`docs/upgrade/d4-03/d4-06-web-integration.md` | 不启LAN/WebDAV，不改变ACK/outbox/cursor/manifest/batch；不能将测试替身称为真实HTTP同步 |

Android表中的 I/V 意为已实现共享业务，已知浏览器回归通过；Android平台对应操作是否已独立覆盖必须看专项逐项映射，不自动升格为Android全面验证。

## 番茄钟：真实调用链、字段、差距

1. 共享Web：`app.js` 路由 `pomodoro` → `personal-pages.js:199-244` → `repo.demo.personal.timer` → `domain.mjs` 独立 localStorage key `mytodo-d4-03-demo-v1`。不是正式tasks.sqlite结构。
2. Android：同页发现 `D4NativeTimer` 后 → `native-timer-adapter.js:44-97` request/command → `GxD4Preview.timerCall` → 原生 NativeTimerStore/Session。桥失败不启动第二个Web时钟；expectedRevision + commandId避免并发旧状态覆盖；resume/focus/visibility触发重读。
3. 数据字段（`personal-pages.js:68-69`）：version、mode/focusMode、phase、status、durationMinutes、breakMinutes、elapsedMillis、anchor{wall,elapsed,boot}、sessionId、startedAt、taskId、completionPending、history、focusedMillisByDay、completedSessionsByDay。history记录sessionId/id、phase/mode、outcome、任务、起止UTC和elapsedMillis，最多10000条。
4. `personal-pages.js:79-104` 同页用单调时钟；重载后用非负墙钟差恢复。专注倒计时正常完成才计轮；提前结束和休息仍留记录；正计时不能伪称完成一轮。时钟倒退/前跳及浏览器退出后行为应明确呈现，不能承诺Web后台进程一直活着。
5. 页面已有开始/暂停/继续/结束/完成、任务选择、历史和日统计。当前Android原生页与共享页能力不一致，原生页最近10条限制和入口分裂会让用户感到功能缺失。`personal-pages.js:221`“生产通知与锁屏提醒尚未接入”应按候选能力准确说明，不能否定D405已接入的候选服务，也不能宣称生产发布已批准。
6. 已有Web用例：`tests/d4-ui/personal-cases.mjs:48,68,80,97`覆盖合成时钟、跨午夜、休息、切页/重载；Android进程/服务状态证据不是恢复后Web首屏绘制证据。设备重启不在本次已证范围。

| OWNER要求 | Web基线 | 需要新增的明确证据 |
|---|---|---|
| 开始、暂停、继续、提前结束、正常完成 | 已有状态机及browser覆盖 | 新界面保持命令语义与一次记录，分别回归 |
| 当前状态、剩余、任务关联 | 已有；历史任务名依赖当前任务查找 | 任务改名/删除后显示ID后备；历史可访问 |
| 历史、统计 | 有真实历史和每日统计，不只是倒计时 | 长记录分页/筛选/详单、break/countup分离 |
| 切页/刷新 | Web独立状态、Android桥重读 | 导航/弹层/后台回来无双时钟、无配置覆盖 |
| 后台/进程重建/设备重启 | Web恢复规则可追溯；原生服务专项已有部分证据 | Android新增设备重启和首屏等待；Win32退出/重启持久化独立测试 |
| 异常一致性 | id去重、桥拒绝、存储失败提示已有 | 失败后保留草稿、重读不重启计时、损坏状态不假成功 |

## 优化反馈：纠正与边界

**纠正早期猜测：** `android/d405/native-integration.js:36-40` 的反馈按钮调用 `native.openFeedback()`；`android/d405/src/local/gxtodo/replica/D405Bridge.java:24-29` 打开 **FeedbackToolsActivity**，不是 `newFeedbackIdea`。后者是另一个独立接口。原Kit完整工具入口没有被此按钮替换为新建意见；真正问题是完整工具与较简共享模块并存、默认体验与回归不完整。主报告不能写“Kit入口已删”。

正式Web原实现 `src/feedback-ui.mjs:14,21-22` + `src/feedback.mjs` 是独立localStorage文本反馈（key `gxtodo.feedback.v1`），含搜索、编辑、删除、复制、导出、导入、导入前备份及pending/resolved；没有证据证明它原先有AndroidKit的图片/分类/删除代次。旧Windows feedback.c 同样是独立本地意见，不能伪称远端提交。AndroidKit的数据库、图片文件、删除批次、恢复代次由Android专项审计给出准确实现。

共享候选 `personal-pages.js:317-340` 已有真正的本地反馈列表、编辑草稿、恢复、pending/resolved、备份恢复与文件读取。图片读取 `arrayBuffer` → 原始base64 + SHA256，不是仅URI或哈希；单4MiB，总8MiB。现页仅显示文件名/大小/哈希，无内联图片预览或单图删除；没有分类及完整Kit流程。因此应保留当前内容并补齐交互，不应该重新替换为静态表单。

| OWNER要求 | Web共享基线 | 差距/实施约束 |
|---|---|---|
| 入口/历史/详情 | 有独立列表与编辑/查看 | 增强明确区分本地候选反馈和Android原生完整工具 |
| 分类 | 无显式分类字段 | 隔离候选新增保守默认分类，旧备份兼容；不写正式DB |
| 内容/图片选择 | 有标题正文、真实图片字节 | 保留原始bytes/hash；不得折成任务附件 |
| 图片预览/逐图移除 | 缺失 | 可访问缩略图与原图查看；移除只在保存后生效，取消保留 |
| 草稿保存恢复 | 已实现并有browser用例 | 图片选择、编辑、取消、恢复、重复提交均回归 |
| 提交/状态 | 本地保存，pending/resolved | 文案说明本地；没有远端服务时不伪造提交/网络成功 |
| 删除/确认 | 现本地删除及备份动作 | 补可见确认/恢复路径，Android保留Kit批次和代次，不跨库合并 |
| 网络异常/失败/重试 | 没有正式远端提交；有本地保存/校验错误 | 区分本地拒绝、容量、hash错误与网络；允许保留内容重试本地保存 |
| 原始附件恢复 | 图片原字节已有验证/备份逻辑 | 加预览后继续校验长度/hash，损坏导入不部分覆盖 |

既有反馈用例 `tests/d4-ui/personal-cases.mjs:177,202,214,237,264,450` 覆盖草稿/PNG原字节及hash、损坏导入、同时间冲突、备份/删除域、空白校验、Unicode/UTC/大小及异步重复提交；它们不证明分类/图片预览/完整Kit批次恢复已经通过。

## 键盘、导航和工作域

**Ctrl+Enter不能称为恢复已知旧任务快捷键。** 正式 `src/task-editor.mjs:23-29` 在任务表单中消费Enter（项目/标签picker另行处理），`src/app.mjs:236` 先调用该函数，再处理通用Ctrl+Enter；普通任务保存没有此明确语义。共享 `app.js:187` 只有P.key、Ctrl+K、Escape、Tab；`personal-pages.js:492` 只给独立便签Ctrl+Enter。应作为新候选增强：子任务输入焦点先添加子任务；任务表单其余允许字段保存父任务；普通Enter和textarea换行保持，IME组合期不提交。

**边缘手势差异：** 正式 `src/gestures.mjs:35+` 在eligible workspace内右滑72px且方向比1.5，避开编辑/控件；不是只认极窄边缘。共享 `mobile-controls.js:18-24` 起点x≤22、方向1.6、距离55，没有速度条件；会与Android系统返回竞争。新的候选应在全部主路由使用合理边缘宽度，JS与Android排除区同尺度协调，避开横向滚动/编辑控件/多指，右边缘系统返回保持。不能只在JS放宽而不验证系统分发。

**工作域为真实隔离业务，不是静态占位：** `work-pages.js` 项目/事项/模板/实例/往来/归档/统计经 `ctx.transaction` 修改composite，再由domain分离到旧V2和demo扩展。项目扩展在projectMeta；任务稳定关联在taskLinks，旧task.project名称不作生产模型改造。事项有日期、优先级、负责人、状态、历史、完成时间、任务/流程关系。模板有version/enabled/copiedFrom/history；实例保存templateSnapshot/templateVersion，既有实例不随模板编辑漂移。事项附件保留原始base64/size/hash，3files×1MiB，总3MiB；与反馈4/8MiB边界独立。工作时区为Asia/Shanghai，历史无时间则明确未记录。

## 可执行实施计划（待主审计统一启动）

1. **D4-08-02 timer**：共享页完善入口提示、历史查看/筛选、任务缺失后备、恢复规则和状态错误；Android保留唯一原生Session/Store权威并恢复完整原生工具；Windows建立真实原生计时器、隔离候选文件和明确退出/重新启动策略。不得改正式src或生产DB。各平台独立云端状态机/生命周期/历史/持久化证据。
2. **D4-08-03 feedback**：先保留AndroidKit完整工具、独立DB和附件；共享页补图片预览、单图移除、分类、草稿与确认/恢复交互及可见错误；Windows实际本地存储/图片/备份实现，不作静态表单。远端接口未授权启用则明确“仅保存在此候选中”。
3. **D4-08-04 nav**：共享 `mobile-controls.js` + Android native host协调系统返回排除区域；全部主路由、360/412、手势导航、编辑/备注/统计/工作页面真实模拟器触摸回归；保留原D403用例与系统Back路径。
4. **D4-08-05 work**：Windows按共享工作域语义构建实际原生隔离CRUD/关系/归档/统计；共享Web只补缺失入口及必要数据校验，避免业务语义分叉。独立candidate模型可以落实，正式迁移仍仅方案。
5. **D4-08-06 keyboard**：共享 `app.js`/子任务表单补焦点感知Ctrl+Enter和提示；Windows实现同语义候选列表与键盘选择；保留输入法、普通Enter、textarea、Escape和现有搜索。新测试放 `tests/d4-08/web*`，不改原测试断言来制造通过。
6. **D4-08-07 Web service与回归**：如要演示既有V2 service真实挂载，仅允许新的候选composition，显式注入isolated-synthetic storage；正式 `src/`冻结，无默认remote。必须有UI操作→服务→拒绝/成功写入→重开一致性完整证据，不能用D406五服务测试替代挂载证据。生产数据/模型/sync准入单列。

Web新增测试需覆盖：timer长历史、任务删除、失败重读、刷新不重复；feedback分类兼容/图片预览原字节/移除取消保存/草稿恢复/确认删除/恢复/容量或写入失败；主路由边缘手势与横滚保护；task与subtask Ctrl+Enter焦点优先、IME与普通Enter；既有work关系与备份恢复保留。只在GitHub Actions执行。交付分别报告实际执行/通过/失败/首次失败/重试与原始日志，保留所有历史ZIP。

## 审计边界

本文不批准正式数据库/模型/迁移、生产同步、D2、LAN/WebDAV、稳定签名、覆盖安装、main/master合并或issue #1关闭；不将候选通过视为D4-03关闭。本地审计未运行任何项目或应用。后续实现和验证由主任务统一编排。
