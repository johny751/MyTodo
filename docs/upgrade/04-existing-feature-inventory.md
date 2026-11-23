# 现有功能清单与三端差异

日期：2026-11-23，Asia/Shanghai。基线：master ZIP 提交注释 `5480c88c806cf1c366ec998b0ba627543d63233a`。本清单来自实际实现，未从 README 的功能列表推断完成。

状态含义：**已实现**是找到完整的当前功能代码路径；**部分**是已有基础但缺少正式需求；**未发现**是已审计模型/入口中没有相应功能；**未单项验收**是没有该功能的完整产品验收结论。本轮已有三端GitHub构建和原有自动化回归，具体覆盖、真实计数及限制见12；下表不从整体job成功推断所有功能和界面已经验收。本机不编译/测试/打包。静态“已实现”不能改写成“验收通过”。下文 Java 类均位于 `android/src/local/gxtodo/replica/`，JS 位于 `src/`，C 位于 `windows/`。

首版主要建设和交付 Windows/Android 界面。正式 Web 保留现有本机 Node/SQLite 运行版，继续参与共享业务、数据、旧功能和同步回归；共享 JS 或 Android 资源接入引出的必要兼容修改必须覆盖 Web。下表记录三端差异，不表示首版要同等优先级重构三个界面；Web 全量 UI 重构推迟，执行与证据要求见 [07 开发规范](07-development-standards.md) 及08/09。

## 八个目标模块

| 模块 | 当前静态状态 | 真实证据与差距 | 本轮运行 |
|---|---|---|---|
| 1 工作台 | 部分基础；综合工作台未发现 | `app.mjs:87 getRoute` 现有任务/便签/项目/地点/标签/搜索/统计路由；`gui.c:68 ui_refresh` 与 `dashboard.c:3 ui_stats_paint` 是任务显示和统计。没有等待反馈/流程/进行项目合并卡片、即将到期汇总或可调整工作台布局 | 未单项验收 |
| 2 工作事项 | 已实现成熟任务核心；正式需求仍部分 | `model.mjs:68–74 normalizeState.task`、`app.mjs:147 saveTask`、`detail.c:10 collect,18 detail_save_record` 有时间/备注/复盘/四象限/子任务/重复/提醒/分类；附件、独立多状态办理、完整不可变完成审计未发现，见下表 | 未单项验收 |
| 3 项目管理 | 部分；轻量分类管理 | `model.mjs:79` 项目仅id/name/description/archived；`app.mjs:127 projectCard,129 projectPage,238 entity-form`、`catalog.c:16 paint`、`operations.c:33 op_category` 有名称/简介/归档和任务进度。任务以项目名称关联；无目标、阶段、负责人/成员、截止时间、项目附件或成果实体 | 未单项验收 |
| 4 模板工作流 | 未发现 | `replica.mjs:8 kinds` 只允许tasks/notes/projects/tags/places，`model.mjs:63–82 normalizeState` 不保留工作流字段；当前路由与Java实体调用中无模板版本、实例快照、8类步骤、字段、办理事件、跟进提醒、流程归档或报销E2E。子任务不是流程引擎 | 未单项验收 |
| 5 往来跟踪 | 未发现 | 同上模型和路由没有Contacts/FollowUps/等待对象/沟通记录。`feedback.mjs:57 FeedbackStore` 和原生Feedback Kit是软件优化意见，不是工作事项提交/待回复跟踪 | 未单项验收 |
| 6 工作档案 | 部分可复用记录；正式档案未发现 | 已有便签、完成任务、项目archived和JSON业务备份；`model.mjs:73,78–81` 无通用文件ID/大小/哈希/版本/关联模型，无独立内容传输或工作成果档案。不能把反馈备份或项目归档布尔值当完整工作档案 | 未单项验收 |
| 7 统计分析 | 部分 | `schedule.mjs:30 taskStats`、`personal-ui.mjs:6 statsPage`、`dashboard.c:3 ui_stats_paint` 有总数/完成率/逾期/分值/最近7天/四象限；项目卡片有任务完成比例。Android番茄每日统计是设备本地；流程完成率/平均办理时间、统一时间投入/工作类别量尚未发现 | 未单项验收 |
| 8 系统设置 | 部分 | `app.mjs:141 settingsModal,56 syncModal,274 accountsModal`、`dialogs.c:32 ui_sync_config,33 ui_settings/ui_account_dialog,36 ui_file`、AndroidToolsActivity有当前设置/账号/同步/通知/导入导出。无LAN授权设备管理、配对撤销、统一日志诊断、完整关于/版本历史；备份及存储迁移不等于schema升级回滚，详见02 | 未单项验收 |

## 成熟功能与必须保留的边界

| 能力 | 静态状态与三端差异 | 函数/行号证据 | 本轮运行 |
|---|---|---|---|
| 快速新建和编辑 | Windows/Web/Android已有，不能因工作台升级删原入口 | `app.mjs:110–118` 四象限新建、`147 saveTask`；`detail.c:17 quick_add,18 detail_save_record` | 未单项验收 |
| 四象限/时间轴/日周月/筛选 | 三端已有。Web/Android650px宽窄行为与Windows原生列表不是同一UI实现 | `model.mjs:3 QUADRANTS,7 dateRange,45 visibleTasks`；`app.mjs:60–61 compact,83 mobileBar`；`gui.c:67 toolbar_menu,68 ui_refresh`、`query.c:10 range` | 未单项验收 |
| 嵌套子任务 | 三端已有多层结构，须保留排序、父关系、完成/删除语义 | `model.mjs:68–74` 64层/100直接子任务限制；`task-tree.mjs`；`detail.c:17 quick_add,42 detail_reload_children`；`tasks.c:10 copy_children,12 task_delete` | 未单项验收 |
| 时间/全天/重复 | 三端已有，开始和结束字段及北京时间语义应保留 | `model.mjs:73`；`schedule.mjs:12 nextOccurrence,22 setTaskDone`；`tasks.c:7 next_time,9 shift_task,11 task_complete`；`detail.c:9 populate,10 collect` | 未单项验收 |
| 优先级/任务状态 | 部分：优先级用四象限quadrant表达，完成状态为done布尔；独立优先级等级和办理/等待/取消状态未发现 | `model.mjs:73`；`detail.c:9 populate,10 collect`；`tasks.c:11 task_complete` | 未单项验收 |
| 标签/项目/地点分类 | 三端已有；标签/地点为名称集合，项目名称关联需要渐进迁移 | `model.mjs:73,79–81`；`app.mjs:130 entityCard,131 entityPage,238 entity-form`；`operations.c:33 op_category`、`detail.c:13 add_category,14 save_categories` | 未单项验收 |
| 备注/复盘/分值/完成历史 | 三端已有文本与完成时间，重复保留旧记录；全流程不可变历史审计仍需设计 | `model.mjs:73 completedAt/review/weight/notes`；`app.mjs:147 saveTask`；`tasks.c:11 task_complete` | 未单项验收 |
| 拖拽/排序/撤销 | 三端已有；当前撤销入口为进程内短时状态，不承诺重启仍可撤销 | `gestures.mjs`、`undo.mjs`；`gui.c:107 ui_drag_cancel,154 drag_begin,159 finish_drag`；`operations.c:3–6 undo_begin/capture/finish/apply,17 op_move` | 未单项验收 |
| 便签 | 三端已有独立编辑/保存/删除，应保留 | `app.mjs:125 noteRow,126 notePage,159 deleteItem`；`model.mjs:78`；`catalog.c:9 save_note,39 ui_catalog_commit` | 未单项验收 |
| 提醒和稍后提醒 | 已实现但平台生命周期不同：Web需页面/本机服务运行；Windows需程序运行；Android有系统闹钟/重启Receiver | `reminders.mjs:3 startReminders`；`dashboard.c:7 ui_reminders_schedule,10 reminder_proc,12 ui_reminders_show`；`ReminderScheduler.java:22 status,23 refresh,24 fire`、`ReminderReceiver.java:4 onReceive` | 未单项验收 |
| 番茄钟/正计时/暂停继续 | Android已实现；完整Windows非vendor C/h和Web业务实现未发现对应计时入口。Web菜单只在GxNative存在时显示番茄钟，不能宣称三端已有 | `app.mjs:94 navigation,215 android-timer`；`PomodoroTimer.java:12–44 restore,47–78控制,219–256 persist`；`AndroidCompanionService.java:64–77 onStartCommand` | 未单项验收 |
| Android计时任务关联/每日统计 | 已实现，当前设备本地，不属于replica同步kind | `PomodoroTasks.java:39–60 resolve`；`PomodoroTimer.java:132 snapshot,206–212 restore,234–256 persist`；`AndroidToolsActivity.java:267 buildTimer,843–897任务选择` | 未单项验收 |
| Android常驻状态条/悬浮球/小组件 | 已实现原生能力，应保留权限和后台行为的独立回归 | `AndroidCompanionService.java:201–231通知视图`、`FloatingBallController.java`；`TodoWidget.java:8 onUpdate,9 refresh`；Manifest:20–35服务和Receiver | 未单项验收 |
| 搜索与基础任务统计 | 三端已有NFKC/AND搜索及统计。逾期规则存在静态跨端差异，见下文 | `model.mjs:26 matchesQuery,28 searchAll`；`app.mjs:132 searchResults`；`query.c:5 normal_sql,8 match_sql,9 ui_query_init`；`schedule.mjs:30`、`dashboard.c:3` | 未单项验收 |
| JSON导入导出/备份 | 三端已有。是业务备份及合并，不含设备凭据和通用文件内容，不等于完整schema恢复方案 | `app.mjs:144 modal,249 previewImport`；`MainActivity.java:127 importState,141 exportStateFor,156–167 onActivityResult`；`dialogs.c:36 ui_file` | 未单项验收 |
| Windows保存位置迁移 | 已实现独立存储位置功能；原目录保留与一致SQLite备份是可复用安全基础 | `storage.c:34 backup_database,52 storage_migrate`；`dialogs.c:9 ui_storage_change`。不是新增业务表的schema迁移系统 | 未单项验收 |
| 多本地账号/离线持久化 | 三端已有最多30隔离档案，不能当团队身份；Web离线依赖本机Node | `account-store.mjs:18–27,50–61`；`AccountStore.java:18–33,38–48`；`operations.c:35 op_account`、`dialogs.c:26 activate_account`；`storage.mjs:8–23`、`server.mjs:26,63` | 未单项验收 |
| 坚果云增量同步和状态 | 已有C与共享JS/Java调用路径；本轮互换和真云测试未执行，不能从历史报告宣称通过 | `sync-client.mjs:5 syncCall,9 exchange`、`delta-sync.mjs`；`SyncStore.java:33 invoke,62 request`；`gui.c:78 sync_thread,79 ui_start_sync`、`sync.c`；机制完整性见03 | 未单项验收 |
| LAN发现/配对/撤销/双通道附件 | 未发现；当前仅127.0.0.1本机Web服务和坚果云请求，不能视为LAN实现 | `server.mjs:26,63`、`SyncStore.java:41–42`；`replica.mjs:8 kinds`；Manifest:20–35没有LAN/Nsd服务组件 | 未单项验收 |
| 优化意见 | 三端有独立实现，不纳入工作任务/往来/档案同步 | `feedback.mjs:57 FeedbackStore`、`feedback-ui.mjs:14,27`；`FeedbackToolsActivity.java:50–52`；`windows/feedback.c` | 未单项验收 |
| 关于/版本信息/历史/复制 | 部分：源码版本与外部构建收据存在；Android未发现包内Git/时区编译时间、版本历史及复制版本UI | `AndroidManifest.xml:1` 0.9.2/code15；`build-android.mjs:75` 仅外部builtAt；`app.mjs:141 settingsModal` 无关于历史入口。后续遵守用户统一约定 | 未单项验收 |

## 已核对的差异与升级门槛

1. **项目目前是轻量分类。** 新负责人/成员/阶段/成果不能覆盖已有名称关联；先迁移稳定关系，再增加管理能力。
2. **番茄钟属于Android原生能力。** Android计时和每日统计应保留；Windows对应能力按首版业务切片增量实现，正式Web保全现有能力，专用计时界面不自动成为首版重构目标。计时结果需另设计同步语义，不能随任务事件直接复制设备运行中的倒计时。
3. **Web是正式本机运行版。** `storage.mjs`通过本机API，`server.mjs:63`绑定127.0.0.1；互联网断网仍能用，但关闭本机Node后不是浏览器独立离线应用。首版保全现有入口并完成共享业务/数据/同步的必要兼容，全量Web界面重构推迟。纯静态GitHub Pages不能替代当前存储/同步后端。
4. **逾期规则不同。** `dashboard.c:3 ui_stats_paint` 对未完成任务比较start与当前时间；`schedule.mjs:30 taskStats` 比较end或start。带开始和截止时间的任务可能被不同端算出不同逾期数。这是静态规则差异，尚未执行对应场景测试，需统一并加入回归。
5. **工作流/往来/附件须增量新增。** 当前五类实体的白名单及normalizer会丢弃未声明的新模型；应先完成数据库、归一化、同步版本兼容，再接入UI，不能只做表面按钮。
6. **保留原功能和三端存储协议回归。** 当前云基线将分别验证原C/共享JS/Java测试；共同协议向量另须运行Windows C、JS和Android Java实际存储适配，比较持久化后投影、墓碑、冲突与复制状态。已有Java计时测试或JS mock不能替代Android SQLite协议结果。T01–T16及真机后台、mDNS/Wi-Fi等仍需要相应环境的实际记录。此清单不宣称任何本轮测试已通过。
7. **兼容修复先于数据实施。** 原有三端云端基线已实际成功，共同协议向量仍待验证。C0-04排序/校验、C0-05凭据、C0-06旧云恢复和C0-07 SQL错误传播各自独立commit、相关云test和审查证据完成后，才可进入D1；不与迁移或大规模业务/UI改动混合提交。
