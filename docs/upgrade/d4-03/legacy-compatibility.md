# D4-03 时间轴与分类管理兼容接入

## FACT：原版语义证据

- `src/app.mjs:106、128、130–131`：分类名称打开所有日期的任务时间轴，分类图标进入四象限；时间轴含子任务和状态选择。
- `src/app.mjs:238`：标签和地点使用精确名称键；新增名称去首尾空白、拒绝已有名称；重命名更新全部嵌套任务关联。
- `src/app.mjs:159`：删除标签/地点保留任务，仅清除匹配名称关联；项目删除有独立现有业务流程。
- `src/model.mjs:47–60`：时间轴继续使用 `visibleTasks`。日期筛选保留过去未完成任务，排除范围外已完成任务及已到期循环；查询、状态、时间/手工排序规则不改。
- `src/task-editor.mjs:39–42`：未编辑的历史地点原值保持；编辑后 `trim()`，不是一律清洗所有历史值。
- `prototypes/d4-01/work-pages.js:83`：项目关联优先明确旁路 ID，无 ID 时仅允许唯一精确名称匹配。重名历史关联不得选择首个项目。

## PROPOSAL：独立 UI 适配

新增 `legacy-pages.js` 的 `catalogs`、`timeline` 页面，不修改任何生产源码、数据库、迁移或同步入口。标签/地点变更仅通过主 Agent 已有 `ctx.transaction` 写入合成仓库；项目创建与编辑继续交给现有 `work-pages`，不复制项目存储实现。

时间轴显示原开始日期/时间及结束、地点、子任务状态，复用成熟任务详情和三点菜单。分类快速新增经 root `newTaskForGroup`；四象限经 root `openTaskGroup`。分类、时间轴查询不会修改数据。实例数据包含历史字段；不将名称转换成 ID 并写回原任务。

项目时间轴与工作模块共用“明确 ID / 唯一名称”规则。重名且无 ID 的历史任务原值保留、从目标项目统计中排除，页面显示 `BLOCKER`。项目删除后不重新匹配同名项目。

## 接入契约

`window.DemoLegacyPages` 导出 `render(route, ctx)`、`act(action, id, ctx)`、`submit(name, FormData, ctx)`、`groupTasks(state, group)`、`reset()`。所有操作/表单使用 `legacy-` 前缀。root 在重置合成体验时可调用 `reset()` 重置模块视图状态。

`ctx` 字段：`getState()`、`transaction(fn)`、`esc`、`toast`、`navigate`、`modal`、`closeModal`、`openTask`、`today`、`openTaskGroup(group)`、`newTaskForGroup(group)`。`group` 为 `{type: 'tag'|'place'|'project', name, projectId}`；标签/地点 `projectId` 空串，项目为明确 ID。无分组新增传入 `null`。项目四象限回调须使用同一明确 ID / 唯一名称规则，不能仅比较同名字符串。

root 负责添加页面导航、编入离线包、调用测试；本模块不修改 `app.js`、runner、构建或生产程序集成代码。

## UNVERIFIED：执行证据

`legacy-cases.mjs` 准备 5 个隔离浏览器回归检查：递归分类 CRUD 与便签独立性、重复名称/并发缺失拒绝、四象限和快捷新建继承、时间轴历史日期边界/周期、重名项目 ID 隔离。fixture 的仓库写入是合成样本准备，不能当作真实用户输入证据。

所有执行仅 GitHub Actions。本文发布时未在本机执行测试，也不声明 Android 硬件触屏、通知、锁屏/后台或原生 Windows 回归已经通过。原 Android issue #1 保持开放；生产同步、ACK/outbox/cursor/manifest/batch 和 LAN/WebDAV 权限不扩大。
