# MyTodo D4-03 集中交付报告 — NOT CLOSED

日期：2026-11-25，Asia/Shanghai。候选分支：`d4/mobile-integrated-candidate-1`。

**BLOCKER：D4-03 尚不能验收。** 已完成原功能源码盘点、隔离候选开发和回归框架准备；GitHub Actions 账户拒绝启动执行器，因此本轮测试执行 0、通过 0、测试用例失败 0、构建产物 0。没有本轮 APK、可体验 HTML、Windows 体验包、截图或录屏。源码压缩包只是源文件归档，不能当作已构建软件。旧 D4-01 体验包和截图保持冻结，不冒充本轮成果。

## 证据边界

- **FACT**：冻结生产基线 `d4c5af4cbbb9192c19276dd371bd142c2b835534`；沿用 D4-01 发布 `03a72afca3f538cd0903624c89cb0d8bb068e470` 的独立原型路径，未合入正式分支。
- **FACT**：首轮尝试源码 `288b0b97d9974e3797a5099c97d5aeb1c3e26dc9`。UI/Android [45533988173](https://github.com/johny751/MyTodo/actions/runs/45533988173) 和冻结 C0 回归 [45533988196](https://github.com/johny751/MyTodo/actions/runs/45533988196) 均未启动执行器。原始注释：`The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`。
- **FACT**：`--log-failed` 原输出为空，拒绝发生在执行前。账户拒绝的 job 数和测试失败数分开记录；详细 run/jobs/annotations/artifacts 原文见集中证据目录。
- **PROPOSAL**：首轮后继续修订候选源码，保存为新源码归档并以 `[skip ci]` 提交。具体最终 SHA、Compare、生产差异和归档 hash 见 publication receipt；它与尝试源码不同。
- **UNVERIFIED**：所有新增候选功能的运行、构建、触屏、后台、重启和跨端行为。静态代码存在不等于测试通过。
- **OWNER DECISION**：恢复该 GitHub 账户 Actions 可用性后继续完整云端验证。支付和额度调整由负责人处理，未操作账户付款、增加额度或新增服务。

## 原功能及候选覆盖

原功能依据真实冻结源码，不凭记忆。详见 [original-task-coverage.md](original-task-coverage.md)、[original-personal-coverage.md](original-personal-coverage.md)、[work-integration.md](work-integration.md) 与 [feature-coverage.md](feature-coverage.md)。这些矩阵记录原页面、源码位置、调用链、存储域、D4-01 缺口、恢复策略及三端证据状态。

隔离候选包含 20 个导航路由：四象限、便签、番茄钟、统计、优化意见、分类管理、任务时间轴、工作台、工作事项、项目、模板、实例、往来、归档、同步中心、设备、数据与系统、设置、关于、任务详情。手机无指定路由时默认四象限。

候选已编写：四象限独立滚动及放大/返回；长按排序、跨象限移动、三点菜单和快捷移动；单象限其他三个拖放目标；子任务拖动手柄、同级排序、键盘排序和父任务入口；标签/项目/地点自动完成；提醒、循环和原任务字段；独立便签；持久化时间戳番茄钟；优化意见本地 CRUD/导入导出/原图片字节校验；合成同步状态及禁用真实连接；完整工作模块和创建时流程版本快照。

最后静态交叉修订见 [static-repair-record.md](static-repair-record.md)。包括原版左滑菜单/右滑完成、松手执行与取消；编辑 DOM 基线保留未改原字段；主详情标签 chips 与提交值一致；项目关联各视图共用同一选择器、删除不重绑；异步附件/图片保存防重、导航保存屏障；清除筛选不复活旧草稿；测试坐标需实际可见且命中目标。

这些是**候选实现**。关闭/返回时的原版自动保存和冲突合并习惯、周期边界手势、部分导入/退出/快捷键、原生存储/后台/通知/反馈组件仍存在差距，列入 BLOCKER。没有以新页面数量替代完整性验收。

## 三端状态

| 端 | 已准备的候选 | 本轮实际结果 | 未完成的生产整合 |
|---|---|---|---|
| Android | 独立零权限包 `local.gxtodo.d403preview`，白名单资产 WebView；原生 AtomicFile/elapsedRealtime timer；真实 MotionEvent/UIAutomator 测试与版本身份注入 | 执行 0，APK 0，截图 0；UNVERIFIED | 原 MainActivity/GxNative/SQLite、AlarmManager、通知、FeedbackKit、原 timer 接口未整合；后台及真机回归 BLOCKER |
| Windows | 独立 Edge/Chrome profile 应用窗口启动器；Windows runner DOM/触屏模拟准备 | 执行 0，体验包 0；UNVERIFIED | 正式 Win32 页面/菜单/存储/原生番茄钟接入 BLOCKER |
| Web | 响应式隔离原型、成熟纯函数复用、20 路由、真实浏览器交互准备 | 执行 0，HTML 产物 0；UNVERIFIED | 原生产入口及存储接口接入未启用 |

不能把三端预览共同使用合成适配器解释为三端生产存储行为已经一致。详见 [platform-readiness.md](platform-readiness.md)、[personal-readiness.md](personal-readiness.md)、[integrated-work-readiness.md](integrated-work-readiness.md) 与 [platform-integration.md](platform-integration.md)。

## 测试与构建准备

工作流 `d4-03-candidate.yml` 准备 Linux/Windows 纯域及浏览器验证、Android 原时钟 JVM 回归、独立 APK 构建、官方模拟器真实触屏和后台测试。失败时应上传原始日志及截图；构建身份绑定 source/run/attempt/HTML hash，不伪造编译时间。

`d4-03-c0-regression.yml` 复制冻结原 C0-04 工作流，仅调整名称、候选分支和触发路径/手动入口。`permissions` 后的 jobs/env/八分片/断言保留原字节；具体 hash receipt 由 Git intake 生成。原 C0/D1/D2 harness 和旧证据未替换。旧 C0 source `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc` / run `45140238501` 的 936 执行及 936 比较是历史证据，不是本轮通过；历史 Android 崩溃和 issue #1 继续保留。

测试源码包含原任务/成熟域、手机手势、个人工具、工作模块、分类时间轴、原值/草稿及异步故障回归。个人工具准备 21 项、附加原值回归 14 项、工作模块 16 项、分类时间轴 8 项；这些是静态准备清单，不能汇总成已通过数。最终运行总数必须取实际 CI 报告；本轮实际执行总数为 0。

## 安全与 A 线

只修改隔离原型、独立平台预览、测试、D4-03 文档和候选工作流。未读取真实用户数据/数据库/账号/凭据，未执行数据库迁移，未合并 D2 候选，未修改生产 ACK/outbox/cursor/manifest/batch，未连接真实 LAN/WebDAV，未关闭 Android issue #1。

A 线真实 schema、全部写入者屏障、正式构建身份、备份/多文件持久化、远端状态认证和 Android issue #1 仍按独立生产准入 BLOCKER 管理。UI 原型未据此获得生产权限，也没有宣称这些阻断已经解决。

## 恢复后的执行与停止条件

1. 核对 publication receipt 的最新候选 SHA、productionDiff=0 和 Android issue #1 Open。
2. 在 GitHub Actions 对该 SHA 运行两套完整工作流，保留所有首轮拒绝和后续失败证据；不改用本机测试。
3. 修复实际构建/断言失败，逐项补三端原功能矩阵；截图、录屏和包均绑定运行 SHA。
4. 交付本轮可体验 Android/Windows/Web 产物；未完成原生整合或原功能差距仍标 BLOCKER。
5. 集中审核达到负责人全部标准后才能 CLOSED；不自行启用生产迁移、同步或正式分支合并。

当前交付为**被云端执行条件阻断的候选源码与审查证据包**，本次工作停在此处，等待恢复 Actions 后继续验证和统一审核。
