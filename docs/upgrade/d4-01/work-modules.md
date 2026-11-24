# D4-01 工作管理页面模块

更新：2026-11-25（Asia/Shanghai）。本文件记录 B 线独立网页 Demo 的项目、工作事项、流程模板、流程实例、往来、归档、统计七个页面。它们用于可操作的界面评审，尚未代表 Windows 或 Android 生产功能交付。UI 确认后才能进入原生平台转换与集成。

## 范围与复用依据

**FACT（源码静态检查）**：新增实现仅为 `prototypes/d4-01/work-pages.js`，采用 classic JavaScript 闭包，输出 `window.DemoWorkPages`。模块不 import 生产源码；不调用网络、localStorage、IndexedDB、SQLite、Android bridge 或外部服务。状态读写全部经过根 Demo 提供的上下文。生产 `src`、Windows C 和 Android Java 未由此模块修改。

**FACT（现有网页源码）**：`src/app.mjs:127-129` 已有项目卡片、关联任务数量 / 完成率、活动与归档切换；`:238` 项目重命名会同步任务的项目名称。`src/model.mjs:29-30` 已有多关键词搜索，`:75/81` 明确任务的 `done/start/end/project/subtasks` 和项目标准字段。`src/personal-ui.mjs:6` 已有总任务、完成、逾期、七天完成记录与四象限统计。本 Demo 沿用这些用户概念，并通过根仓库适配复用成熟任务数据，未向生产 normalize/replica 合同添加字段。

**FACT（已读取的冻结 master 原生源码）**：冻结根为 `C:/Users/adwoo/Documents/Codex/2026-11-23/x20/work/phase0-master`。其中 `windows/gui.c:3/27/68` 已有项目 / 统计导航、活动 / 已归档项目切换和 archive filter；`windows/catalog.c:16/38` 绘制项目任务数与完成进度并使用归档 filter；`windows/dialogs.c:28-29/34` 已有项目名称、描述、归档编辑；`windows/dashboard.c:3` 已有任务、逾期、完成率、七天记录和四象限统计。`android/src/local/gxtodo/replica/MainActivity.java:21/45-84` 是仅允许 bundled assets 接入 bridge 的 WebView 壳，既有网页页面由该壳承载；同根 `src/app.mjs:127-129` 已复核项目与归档页面。这里不宣称 Android 已有独立原生的流程 / 往来页面。D4 基线 SHA 与冻结 phase0 原件哈希由根交付清单统一记录。

## 根模块接口

```js
window.DemoWorkPages = {
  render(route, ctx),                // HTML；不负责根事件监听
  act(action, id, ctx),              // true 表示已处理
  submit(formName, values, ctx),     // true 表示已处理，values 支持 FormData / plain object
  seed(today)                       // 独立 synthetic Demo 种子
};
```

根路由中的 `projects / work-items / templates / processes / contacts / archive / analytics` 调用此模块。按钮使用 `data-action="work-…"` 与 `data-id`；根通过事件委托调用 `act`。表单使用 `data-form`，值原样传给 `submit`：

| 表单名 | 用途 |
|---|---|
| `work-project` | 新建 / 编辑项目 |
| `work-work-item` | 新建 / 编辑工作事项 |
| `work-template` | 模板名称、说明和逐行步骤编辑 |
| `work-process` | 从模板创建 / 编辑实例名称与项目 |
| `work-contact` | 联系人编辑 |
| `work-followup` | 联系人的跟进事项编辑 |
| `work-link-project` / `work-link-work` | 关联已有任务 |
| `work-filter` | 当前页面的搜索、状态、项目 / 归档类型筛选 |

`submit` 也接受 `project/workitem/template/process/contact/followup` 别名。只有 UI 字段，不构成生产存储合同。

`ctx` 的必要成员：`state`（可编辑 composite projection）或 `getState()`（优先，实时取得新 projection）、`transaction(mutator)`、`esc(value)`、`toast(message)`、`navigate(route)`、`openTask(id)`、`modal(html)`、`closeModal()`。可选 `today`（上海日期字符串）与 `view.query`（根全局搜索）。`transaction` 应原子提交 synthetic projection 并触发根重渲染；异常不提交，返回 `false` 不视为成功，也可返回 Promise。关联 / 跟进提交后再次打开详情，故上下文应提供实时 getter，或保持 `state` 视图及时更新。

页面内筛选为闭包中各 route 的临时视图；不写入生产数据。搜索按 NFKC、多关键词同时匹配，根全局搜索与页面内搜索同时生效。清除页面筛选不会改变根全局搜索。

## Demo 数据结构

根仓库继续保留标准 V2：任务使用 `done/start/end/project(string)/subtasks`；项目使用 `id/name/description/archived`。根将 Demo 专有关系映射为 taskLinks、archives、projectMeta，向此模块提供 composite，提交时分拆回 core 与 demo。任务在 composite 中可含 `projectId/workItemId/archived`，仅为 Demo 映射；统计仍优先使用 `done` 与 `start`，嵌套 / flat 子任务按 ID 去重。

| Demo projection | 当前字段与职责 |
|---|---|
| projects + projectMeta | status：active/paused/completed，color：q0–q3，dueDate；标准项目字段仍由 core 管理 |
| workItems | id/title/projectId/status(planned/doing/waiting/done)/owner/description/dueDate/archived |
| templates | id/name/description/steps[{id,title,description}]/archived |
| processes | id/name/templateId/projectId/status(running/paused/completed)/currentStep/steps[{id,title,description,completed,completedAt}]/archived |
| contacts | id/name/organization/role/email/phone/notes/followups[{id,title,dueDate,status(pending/done),notes,completedAt}]/archived |

种子仅返回 projectMeta 与四组 demo 数组。三个 core 项目由根提供，ID 固定为 `project-delivery / project-product / project-operations`。所有示例联系人、工作与流程均为合成数据，不填写真实联系方式，不访问原应用账户和存储空间。

## 页面行为

| 页面 | 可操作行为 |
|---|---|
| 项目 | 新建、编辑、删除、归档；搜索 / 状态筛选；查看任务并打开详情；关联 / 解除已有任务；项目改名更新 task.project；任务进度按当前实际状态计算 |
| 工作事项 | 新建、编辑、删除、归档；项目 / 状态 / 搜索筛选；关联任务；更换事项项目同步其已关联任务的项目；事项状态单独管理，不自动替代任务完成状态 |
| 流程模板 | 新建、编辑、删除、归档；每行一步可增加、删除、调整顺序，1–20 步；由模板创建实例，复制步骤内容，后续模板编辑不改已有实例 |
| 流程实例 | 从模板创建；编辑名称 / 项目；完成当前步，最后一步完成后流程结束；暂停 / 继续；暂停时推进按钮 disabled，事件层也拒绝推进；归档、删除 |
| 往来 | 联系人新建、编辑、删除、归档；跟进事项新建、编辑、完成 / 重新跟进、删除；显示下一次待跟进与逾期日期；没有邮件发送或系统通知操作 |
| 归档 | 汇总任务 / 项目 / 事项 / 模板 / 实例 / 联系人；关键词与类型筛选；恢复原 ID 与内容，仅解除 archived，不回滚任务完成或流程进度 |
| 统计 | 当前活动任务总数、完成、待完成、按计划日期逾期、四象限完成比、最近七天完成记录、项目任务进度、流程状态与全部往来待跟进 / 逾期；无固定虚构指标 |

删除前由 Demo 弹窗展示影响。删除项目保留任务、事项、实例并解除项目关联；删除事项保留任务并解除事项关联；删除模板保留已创建的实例；删除联系人同时删除其自身跟进记录。归档与恢复保留关系和状态，不作为数据库备份恢复操作。

统计按上海时区解释已记录 `completedAt`，未记录完成时间的任务不补造七天历史。项目筛选限定任务 / 流程，往来指标明确标记为全部往来。归档任务不计入活动任务统计；嵌套子任务只计一次。

## 验证边界

**FACT（本地静态）**：编写与检查仅进行文本读取、文件写入和源哈希；未在本机运行 JavaScript、浏览器测试、项目编译或打包。网络 / 原生 / 生产存储 API 检索无匹配。未修改根 app.js/styles 或任何生产源码。

**UNVERIFIED（运行，等待根 Actions 回执）**：classic JS 语法检查、七页 render、CRUD、任务关联 / 项目重命名、流程创建 / 暂停 / 推进 / 完成、跟进保存 / 完成 / 删除、归档恢复、筛选与统计联动、全套页面的键盘 / 响应式视觉检查。源码存在不等同于测试通过；最终计数、SHA/run/attempt、截图与 Windows 可操作交付物由根清单提供。

**OWNER DECISION**：当前交付为 UI 讨论 Demo。生产新字段、同步合同、原生流程 / 往来入口、真实数据迁移与通知权限不由此原型定义或授权。D1/D2 阻断项、A 线准入和 Android issue #1 维持各自边界。
