# D4-03 统一功能覆盖及验收索引

**NOT CLOSED / 实际测试 0 / 产物 0。** FACT 只用于原代码和收集到的事实；候选代码一律 PROPOSAL，实际表现 UNVERIFIED。没有隐藏的功能删减。

完整九维审计见 original-task-coverage.md 和 original-personal-coverage.md：原代码位置、页面、业务逻辑、存储、D4-01 实现、缺口、恢复、回归和三端验证。新增模块见 work-integration.md。下面统一指向恢复代码及测试，避免平台采用不同定义。

| 类别/原入口 | 冻结源码及数据域索引 | D4-01 缺口/候选恢复 | 回归准备 | Android/Windows/Web 实际 |
|---|---|---|---|---|
| 任务 CRUD/详情 | task audit T 系列；src/app.mjs → task-editor/model；C/Java 原存储入口 | app.js 复用成熟 saveTaskRecord/域 API；未改原字段保留基线 | domain/interaction/regression | 0/0/0；生产入口未整合 BLOCKER |
| 子任务/备注/复盘 | task audit；task-tree/quickSubtask；父子业务域 | 独立备注、同级排序、父任务 breadcrumb；不提升为根任务 | mobile/interaction/domain | 0/0/0；原自动保存/冲突习惯 BLOCKER |
| 四象限/放大/排序/移动 | task audit Q/H；gestures/model.moveTask；原 order | 默认首页、长按/菜单/编辑移动、zoom 和三 peek | mobile/MotionEvent | 0/0/0；真机及 Win32 未验证 |
| 三点菜单全部原动作 | task audit 第3节真实菜单逐项；原任务生命周期 | 完成/编辑/移动/上下/子任务/备注/提醒/删除/复盘 | mobile/Android menu/interaction | 0/0/0；原额外习惯见 H 清单 |
| 标签/项目/地点自动完成 | task audit A；model/catalogs；项目 ID+原名称域 | chips/keyboard/创建/清除；重复名不猜；Legacy 统一关联 | mobile/regression/legacy L08 | 0/0/0；真实历史 ID 映射未批准 |
| 开始/截止/提醒/循环 | task audit R；schedule/personal-ui；原规则/派生提醒域 | 完整字段、原算法、提醒中心及规则 anchor | interaction/regression/domain | 0/0/0；AlarmManager/含秒 custom at BLOCKER |
| 左边缘导航/状态 | task audit N/H；原 workspace gestures | 边缘判轴/遮罩/返回；页面草稿/滚动恢复 | mobile各主要页/back/取消 | 0/0/0；周期边界手势仍 BLOCKER |
| 独立便签 | personal audit；notes/SQLite 独立实体 | P 独立 CRUD/搜索；不与任务备注合并 | personal/Android | 0/0/0；未接真实存储 |
| 番茄钟 | personal audit；Web clock/Java PomodoroClock/C timer | P 时间戳状态；独立原生预览 timer，不依赖页面动画 | personal/JVM/native background | 0/0/0；原后台/通知/共用timer接口 BLOCKER |
| 优化意见 | personal audit；feedback-ui/FeedbackKit 独立域/图片字节 | P 本地完整实际能力、原字节/失败保护；未虚构服务端管理 | personal故障/图片/导入导出 | 0/0/0；FeedbackKit/附件生命周期生产恢复 BLOCKER |
| 同步中心/设备 | personal audit；delta-sync/replica/原同步业务层 | 合成状态/配置/历史/冲突入口，真实连接禁用 | personal/scope/冻结C0 | 0/0/0；未启用真实远端 |
| 原统计 | personal audit；taskStats/日期口径 | 原个人任务统计与工作统计分开 | personal/domain | 0/0/0；原生统计回归未跑 |
| 工作台/工作事项/项目 | work-integration；D4合成旁路实体 | CRUD/状态/关联/进展/附件/历史 | work 16项/legacy关联 | 0/0/0；精确时间接口和生产接入 BLOCKER |
| 流程模板/实例 | work-integration；D4独立版本快照 | 版本/复制/停用/删除保护；运行实例保留创建快照 | work快照/历史 | 0/0/0；历史旧实例快照缺证据 BLOCKER |
| 往来/归档/分析 | work-integration；D4合成域 | 跟进/关联/归档/筛选/独立统计口径 | work/personal/legacy | 0/0/0；日期精度及原生接入 BLOCKER |
| 数据与系统/关于 | personal audit；原备份/账号/设置/版本域 | 合成导出/恢复/诊断/版本身份；生产操作未提供 | personal/platform scope | 0/0/0；原导入/退出/账号行为 BLOCKER |

具体未决列表以三份 readiness 与 static-repair-record 为准。每个原版存在但未接回/未验证的功能都阻止完整验收；新增路由、代码规模和静态审查不能解除这些 BLOCKER。
