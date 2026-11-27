# D4-09 Windows 浏览器设计原型：交互与选择器

日期：2026-11-28 Asia/Shanghai。入口：`prototypes/d4-09/windows.html`，样式与行为分别为 `windows.css`、`windows.js`，引用 root 维护的 `tokens.css`。参考业务基线：`7c217d8779ccf21e13733b28868e015e9cfd693a`。

本原型使用 C/Win32 当前产品的信息架构与已知交互作为设计输入，**不是 Win32 可执行程序，也不是原生运行证明**。所有记录、编辑、计时、反馈仅存在当前文档内存；没有框架/CDN、网络请求、产品模块导入、localStorage、IndexedDB 或 SQLite。刷新恢复合成数据。图片选择只创建浏览器临时 Blob 预览，不上传、不删除原文件。导出文件标明 `mytodo.d409.windows.design-demo`，不称作产品备份或跨平台交换格式。

## 1. 设计组成

固定212px侧栏（窄桌面190/180px）按个人效率、工作管理、观察与设置分组；页面标题、一个主要动作、筛选条、工作列表与详情依次组织。事项与流程详情将项目色标、当前状态和下一步连续展示。番茄页左侧突出当前任务与计时，右侧展示历史。字体、颜色、间距与焦点沿用统一Token。

≤1190px的四象限详情切为独立阅读面板；≤1000px工作详情通过“← 列表”返回；≤760px侧栏折为图标，列表仍保留名称/状态；≤420px隐藏辅助到期列但详情保留完整原文。没有以移动端大卡片替代桌面工作表。原型默认首屏为四象限。

## 2. 页面清单（指定12项＋本地反馈）

| 页面 | hash / 导航选择器 | 主要交互 |
|---|---|---|
| 四象限首页 | `#quadrants` / `[data-page="quadrants"]` | 新建、编辑、完成、子项展开/完成、搜索子项、拖动换象限、菜单移动、放大/还原、列表视图、详情。 |
| 工作台 | `#dashboard` / `[data-page="dashboard"]` | 工作队列、项目与流程入口；查看进入相应记录详情；新建工作事项。 |
| 工作事项 | `#items` / `[data-page="items"]` | 搜索/状态/项目筛选，列表/详情，新建/编辑，完成、归档、删除确认、操作历史。 |
| 项目管理 | `#projects` / `[data-page="projects"]` | 项目详情、新建/编辑、颜色输入即时色块、负责人/成员、归档/删除确认。 |
| 流程模板 | `#templates` / `[data-page="templates"]` | 模板步骤、新建/编辑、启停、复制、由模板建立实例。 |
| 流程实例 | `#instances` / `[data-page="instances"]` | “新建流程实例”先选择可用模板；步骤推进、暂停、继续、完成，实例拥有步骤副本。 |
| 往来管理 | `#contacts` / `[data-page="contacts"]` | 联系信息、新建/编辑、关联内容阅读；删除说明包含跟进处理。人工状态仍未知。 |
| 跟进管理 | `#followups` / `[data-page="followups"]` | 关联往来对象/工作事项、跟进/到期时间、状态与备注。人工状态仍未知。 |
| 工作归档 | `#archive` / `[data-page="archive"]` | 查阅归档内容、操作历史、恢复到原模块。人工状态仍未知。 |
| 番茄及历史 | `#timer` / `[data-page="timer"]` | 倒计时/正计时、专注/休息、选择任务、开始/暂停/继续/结束、正计时完成、倒计时完成确认、历史筛选。 |
| 统计分析 | `#statistics` / `[data-page="statistics"]` | 搜索/状态/项目/日期筛选、数量/完成率、到期分布、项目统计、口径说明、演示快照导出。 |
| 系统设置 | `#settings` / `[data-page="settings"]` | 紧凑密度、减少动态效果、导出演示快照、确认重置、来源复制、版本说明。 |
| 想法与反馈 | `#feedback` / `[data-page="feedback"]` | 新想法、650ms会话内自动保存、草稿、本机列表记录、临时图片、删除/撤销、快照导出。 |

## 3. 稳定DOM选择器

### 壳层与通用操作

| 目标 | 选择器 | 预期 |
|---|---|---|
| 当前导航 | `.nav-button[aria-current="page"]` | 唯一当前页，具有文字与选中背景。 |
| 页面标题 | `#page-title` | 路由切换后更新；程序切页聚焦标题。 |
| 主工作滚动区 | `#workspace` | 页面切换记录并恢复原查询、选中和滚动位置。 |
| 页面主操作 | `#page-actions [data-action="new"]` | 当前模块新建；流程实例先选模板。 |
| 搜索 | `#page-search` | 输入即筛选；子任务名称参加搜索。 |
| 状态/项目筛选 | `#status-filter` / `#project-filter` | 按当前页过滤；切页保存。 |
| 清除筛选 | `[data-action="clear-filters"]` | 清空关键词/状态/项目/日期。 |
| 演示状态菜单 | `#demo-state-trigger` | 正常、空、加载、模拟错误、恢复初始数据。 |
| 菜单 | `#context-menu[role="menu"]` | 真实按钮；Esc关闭并回到触发点；上下/Home/End移动焦点。 |
| 通知 | `#toast[role="status"]` | 操作结果反馈，约4秒隐藏。 |
| 来源说明 | `[data-action="version"]` | 显示原型身份，不伪造APK/EXE编译时间。 |

### 列表、详情与编辑

| 目标 | 选择器 | 预期 |
|---|---|---|
| 示例工作行 | `[data-row-id="i1"]` | 点击/Enter/Space显示对应详情；双击编辑。 |
| 当前选中行 | `.work-table tr.is-selected` | 背景和左边线持续区分当前项。 |
| 当前详情 | `[data-detail-id="i1"]` | 完整说明、备注、时间与项目色标。 |
| 编辑当前项 | `[data-detail-id="i1"] [data-action="edit"]` | 打开表单。 |
| 行菜单 | `[data-row-id="i1"] [data-action="record-menu"]` | 编辑、历史、归档、删除；任务/模板追加上下文动作。 |
| 编辑弹窗 | `#editor-dialog` | 原生dialog；labels持续可见；焦点陷入弹窗。 |
| 名称/备注 | `#edit-name` / `#edit-notes` | 名称必填；备注可换行/选择，不截短原文。 |
| 项目候选 | `#edit-projectLabel[list="project-options"]` | 输入名称显示原生datalist候选；必须选已有项目或清空。 |
| 项目关联值 | `#edit-projectId` | 隐藏字段保存候选对应的合成稳定ID；不以显示名称改写关联。 |
| 项目色值/预览 | `#edit-color` / `#edit-color-preview` | 输入合法#RRGGBB更新色块；保存校验格式。 |
| 标签候选 | `#edit-tags[list="tag-options"]` | 任务表单使用原生datalist，提供已有合成标签。 |
| 模板步骤 | `#edit-steps` | 每行一步，保存要求1–20步。 |
| 保存 | `#save-record` / `Ctrl+Enter` | 内存保存；关闭弹窗并更新列表/详情。 |
| 保存错误 | `#editor-error` | 必填/颜色/时间格式/模拟失败就地呈现；原输入保留。 |
| 模拟错误重试 | `#editor-error [data-action="retry-editor"]` | 不离开编辑器，恢复正常演示状态并保存当前草稿。 |
| 关闭编辑 | `[data-action="close-editor"]` / Esc | 改动后显示保存/放弃/取消，不能静默丢弃。 |
| 确认窗 | `#confirm-dialog` | 删除/重置/结束/离开编辑等明确确认，初始焦点在取消。 |
| 确认/取消 | `[data-action="confirm-accept"]` / `[data-action="confirm-cancel"]` | 执行或取消当前操作。 |
| 放弃编辑 | `[data-action="confirm-alternate"]` | 仅未保存编辑确认中出现。 |
| 窄窗返回列表 | `[data-action="close-detail"]` | 保留原选中与筛选，回到列表。 |

### 四象限与流程

| 目标 | 选择器 | 预期 |
|---|---|---|
| 四象限容器 | `[data-drop-quadrant="0"]` 至 `3` | 对应重要紧急、重要不紧急、紧急不重要、均不。 |
| 示例任务卡 | `[data-task-id="t1"]` | 可从卡片留白拖动到另一象限；按钮区域保留点击。 |
| 任务选择 | `[data-action="select"][data-id="t1"]` | 打开任务详情。 |
| 完成任务 | `[data-action="toggle-complete"][data-id="t1"]` | 文字与完成状态改变，可恢复。 |
| 子项展开 | `[data-action="expand-task"][data-id="t1"]` | 默认折叠；aria-expanded同步；显示未完成数。 |
| 子项完成 | `[data-child-id="tc2"]` | 更新完成状态与父项未完成数。 |
| 菜单移动 | `#context-menu [data-action="move-task"][data-value="1"]` | 与拖动相同地改变合成象限值。 |
| 放大/还原 | `[data-action="zoom"][data-quadrant="0"]` | 单象限铺开/恢复四象限，按钮aria-pressed同步。 |
| 视图切换 | `[data-action="board-mode"][data-mode="list"]` | 四象限数据以表格查看。 |
| 实例推进 | `[data-action="instance-advance"][data-id="in1"]` | 当前步骤完成，下一步或最终完成。 |
| 实例暂停/继续 | `[data-action="instance-pause"]` / `[data-action="instance-resume"]` | 状态门控，不允许暂停时直接推进。 |
| 模板建立实例 | `[data-action="create-instance"][data-id="tm1"]` | 创建新的合成实例，进入实例详情。 |

### 计时与反馈

| 目标 | 选择器 | 预期 |
|---|---|---|
| 当前时间/状态 | `#timer-clock` / `#timer-state` | 250ms显示更新；时间使用页面performance.now，不以动画为权威。 |
| 计时模式/分钟 | `#timer-mode` / `#timer-minutes` | 正/倒计时；1–180整数；活动或待确认时禁用。 |
| 开始/暂停/继续 | `[data-action="timer-start"]` / `timer-pause` / `timer-resume` | 只显示当前状态可执行动作。 |
| 结束 | `[data-action="timer-end"]` | 二次确认，加入提前结束历史。 |
| 正计时完成 | `[data-action="timer-finish"]` | 正计时活动期间出现，记录完成并等待确认。 |
| 完成确认 | `[data-action="timer-ack"]` | 倒计时到零或正计时完成后出现；不自动开下一轮。 |
| 切换休息/专注 | `[data-action="timer-phase"]` | 空闲/已结束时可切换，默认5/25分钟。 |
| 选择任务 | `[data-action="timer-task"]` | 打开搜索弹窗。 |
| 任务搜索 | `#task-picker-search` | 父任务与子任务参与搜索，命中子项时展示父链。 |
| 选择当前任务 | `[data-action="choose-timer-task"][data-id="t3"]` | 任务ID/显示标题更新。 |
| 历史过滤 | `[data-action="timer-filter"][data-filter-value="focus"]` | 全部/专注/休息。 |
| 反馈标题/正文 | `#feedback-title` / `#feedback-body` | 650ms会话内自动保存；切页/换记录前flush。 |
| 草稿/本机记录 | `[data-action="feedback-save"]` / `[data-action="feedback-submit"]` | 后者要求标题与正文；不称作远程发送。 |
| 图片选择 | `#feedback-images` | 最多20张、每张10MiB的浏览器临时预览。 |
| 移除图片 | `[data-action="feedback-remove-image"]` | 确认后释放临时Blob URL，不删除原图。 |
| 删除/撤销 | `[data-action="feedback-delete"]` / `feedback-undo` | 保留本次删除批次并恢复；刷新后清空。 |

## 4. 供云端执行的建议走查

本节是待执行手册，不是已通过的测试结果。所有浏览器/产品执行仍由 GitHub Actions 完成。

1. 桌面1440×960打开入口，确认13个导航、默认四象限、当前页选中态、状态栏原型说明。1280×900重复核对主从布局；1000以下检查详情返回列表；360/412检查窄窗可达性。
2. 四象限：选择t1→展开子项→完成tc2→搜索“补齐空态”→确认父项和子项可见；清空搜索；菜单移到象限1；从卡片留白拖回象限0；放大/还原；切列表。
3. 工作事项：按项目p1筛选→选择i1→详情长备注/完整历史秒时区→编辑备注→Ctrl+Enter保存→再次打开确认本会话值；关闭未保存编辑，分别走取消、保存、放弃分支。
4. 项目：新建与编辑，颜色#27aB83即时预览；非法色值阻止保存并保留草稿；归档→工作归档→恢复。
5. 流程：新建实例先选tm1；暂停→继续→依次推进至完成；模板复制与停用后不能直接建立实例。原型只模拟状态，正式步骤ID/业务校验由原模块承担。
6. 计时：1分钟倒计时→开始→暂停→切页→返回→继续→结束确认与历史；正计时开始→完成→确认；另运行倒计时到零并确认只加入一次历史。筛选专注/休息；搜索子项并关联父任务。
7. 反馈：新建标题/正文，等待650ms；切另一条再返回；保存草稿/本机列表；选择小合成图片、移除确认；删除并撤销；明确不测试远程提交。
8. 演示状态：空态可新建；加载状态1.4秒返回；错误状态显示重试；在错误状态下编辑保存出现同一草稿与重试保存按钮，重试后成功。
9. 菜单：Tab到菜单按钮，Enter打开；上下/Home/End导航；Esc关闭回焦点；弹窗Esc关闭/未保存确认。设置切紧凑与减少动态效果，复制来源信息或读取复制失败时可手动选择文本。

## 5. 本地静态核对记录与限制

2026-11-28只进行了源码/文本静态检查：HTML/CSS/JS引用为相对本地路径；13个页面定义；66个事件处理项；65个静态动作字面量都有处理项（另一个处理项服务动态的实例推进动作）；初始HTML的27个ID无重复，3个相对资源都存在；未检出fetch/XMLHttpRequest/WebSocket/sendBeacon调用、浏览器持久化API调用或外部http(s)地址。此统计是文本连线检查，**不等同JavaScript语法检查、浏览器测试或视觉验收**。

未本地运行HTML、浏览器、Node、产品、测试、SQLite或构建。没有生成截图或宣称布局目视通过。当前页面日期、数据和部分项目进度均为明确标注的合成示例。静态时间校验是原型输入提示，不代替正式业务校验；实际Win32计时/历史/保存/账号/备份和原回归仍沿用正式实现。

当前实现静态事实另见 `audits/windows-current.md`，它按本轮人工清单保留已通过路径，往来/跟进/归档仍未知。D4-08原源码、旧测试和封存交付未修改。

## 6. 首轮云端回归准备

`tests/d4-09/windows/prototype-cases.mjs` 已新增W01–W16共16项独立DOM回归，使用root给定Harness。菜单/弹窗通过真实CDP点击，键盘通过真实CDP事件，填值使用Harness规定的DOM input/change。`a.eval`只读DOM/几何/时间；不直接改应用状态。菜单方向键/Esc使用`a.key(null, key)`保留已打开菜单的当前焦点，避免Harness先点击菜单项。

新增冻结只读就绪标记 `window.D409WindowsPrototype`，仅含ready/kind/pageCount/storage/baseline，不暴露业务记录或写入口。≤420px柱状图列宽和等宽计时字号做了静态约束，以容纳系统字体回退。详情和步骤等业务状态未改变。

16项覆盖范围及明确未覆盖项见同目录测试README。首次状态为 **PREPARED / NOT EXECUTED**；本地只检查接口名、16个唯一ID、选择器/处理路径与文件字节，不把源文件出现、就绪标记或测试代码编写等同于运行通过。
