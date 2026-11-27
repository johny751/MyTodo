# D4-09 Web交互原型：操作与选择器

日期2026-11-28，Asia/Shanghai。文件：`prototypes/d4-09/web.html`、`web.css`、`web.js`，引用root管理的`tokens.css`。本阶段仅原型，没有修改共享产品UI、业务代码、原测试或数据模型。

## 执行及真实范围

原型有20条路由（含任务详情上下文页），用Vanilla JS/CSS实现离线内存操作。没有第三方依赖、CDN、fetch/XHR/WebSocket、localStorage/sessionStorage/indexedDB。图片选择经FileReader读取到内存；导出会下载明确标记为`mytodo-d409-memory-prototype`、`notAProductBackup=true`的JSON，绝不伪装产品备份。重载原型后所有编辑重置。

本地仅编辑和静态检查，没有启动原型、进行JS执行/测试或拍摄新运行截图。需由root在Actions中执行语法、浏览器交互及360/412/桌面截图。当前文件完成表示源代码原型已准备好，不能写成实际浏览器运行通过。

主要路由：工作台、四象限、独立便签、番茄钟、统计分析、优化意见、分类管理、任务时间轴、工作事项、项目管理、流程模板、流程实例、往来与跟进、工作归档、同步中心、设备管理、数据与系统、系统设置、关于与版本、任务详情。

## 交互覆盖

- 工作台：内存任务计数、当前队列、项目事项进度、最近动作；任务完成和查看详情可操作。
- 四象限：未完成/全部/已完成切换，查询，象限放大/返回，新建、完整编辑、完成、三点菜单、拖动跨象限、添加/完成子项。原型不代替成熟产品手势与排序逻辑。
- 工作事项/项目：列表筛选和主从详情，真实内存新建、编辑、归档/恢复、删除确认；被关联项目拒绝删除。项目包含成员/色标/计划，事项保留下一步/备注/记录。
- 模板/流程：模板步骤编辑与版本变化，从模板创建独立步骤快照的流程，暂停/继续/推进/完成；暂停流程不能推进；进行中流程引用的模板在原型中拒删。
- 联系人/跟进/归档：真实内存新建编辑、跟进新增编辑/完成/重新跟进、归档恢复。此原型能力不把此前人工验收未知改写为已通过。
- 番茄钟：关联任务搜索，模式、开始/暂停/继续/提前结束/重置、可调整分钟、切页继续；到零与提前结束分记录、历史筛选。计时仅页面performance.now内存演示，不是原生后台/持久化权威。
- 优化意见：草稿/记录、分类/正文编辑，实际本地图片选择/预览/移除、删除确认。图片限制4MiB，支持PNG/JPEG/GIF/WebP；没有真实远程提交。
- 便签/分类：完整多行文字编辑、搜索、删除确认；标签/地点目录新增/删除，目录删除不改已有记录文字。
- 统计：部分指标随内存数据变化；周趋势明确为合成示例，不伪造实测业务统计。
- 设置：密度切换、下一次实体保存失败演示/保留草稿/重试、加载状态；独立V2面板内存示意的打开/新增/移除/清空，不调用产品V2服务。
- 菜单：真实button/menuitem，方向键/Home/End，Esc关闭；dialog使用原生showModal，Esc和脏编辑确认，关闭恢复触发焦点；Ctrl+K全局搜索、Ctrl+Enter保存，IME组合不触发保存。

## 推荐云端操作序列

1. 1440×1000打开`web.html`，截图工作台；确认全部导航可滚动到达。
2. 工作事项选中w1，截图列表/详情；打开编辑，改备注，点击取消，确认继续编辑/放弃/保存并关闭三个路径。
3. 设置“演示一次”保存失败，回工作事项编辑保存；错误保留表单，再点“重试保存”；读回详情文字。
4. 搜索/状态/项目筛选分别操作，清除筛选；更多菜单切换紧凑、查看空状态、从空态新建。
5. 流程模板选tp1，修改步骤保存；从模板创建流程，暂停时尝试推进被阻止，继续推进到完成；原模板步骤后改不改变已创建实例。
6. 往来联系人c1添加跟进，编辑、完成、重新跟进；归档一条事项后从工作归档恢复。
7. 计时关联任务搜索，开始后切页再返回，暂停/继续；提前结束确认后查看独立历史。设置1分钟用于实际到零验证时须如实记录时长，不用内部状态篡改冒称自然完成。
8. 优化意见新建草稿，通过实际file input选择合成图片，保存后点缩略图预览；再次编辑移除图片并保存。
9. 四象限任务三点菜单、放大/返回、任务编辑与子项操作；桌面真实拖动跨象限。
10. 360/412窗口：菜单按钮打开导航；工作详情折叠后“返回列表”可达；dialog完整多行文字和底部保存可达，无页面级横向溢出；选择长备注，检查焦点、选区与错误状态。

## 稳定DOM选择器

| 操作/区域 | 选择器或参数 |
|---|---|
| 原型根/当前页 | `#web-app`, `#page[data-route]` |
| 全局导航 | `.nav-link[data-action="go"][data-id="work-items"]`（替换route） |
| 手机导航 | `[data-action="nav-toggle"]`, `[data-action="nav-close"]` |
| 全局搜索 | `[data-form="global-search"] input[name="query"]` |
| 当前列表搜索 | `[data-filter="query"]`；过滤器`[data-filter="status"]`/`[data-filter="project"]` |
| 列表记录/选中详情 | `tr[data-record="w1"]`, `[data-action="select"][data-id="items\|w1"]`, `[data-detail="w1"]` |
| 新建/编辑 | `[data-action="new"][data-id="items"]`, `[data-action="edit"][data-id="items\|w1"]` |
| 实体编辑表单 | `#entity-editor`, `[name="title"]`, `[name="notes"]`, `[data-save-editor]` |
| 保存错误 | `#editor-error[role="alert"]` |
| 关闭/脏表单确认 | `[data-action="editor-close"]`, `#confirm-dialog`, `[data-action="confirm-save"]`, `[data-action="confirm-accept"]`, `[data-action="confirm-cancel"]` |
| 列表菜单 | `[data-action="menu"]`, `[role="menu"] [role="menuitem"]` |
| 更多状态示例 | `[data-action="empty-demo"]`, `[data-action="error-demo"]`, `[data-action="loading-demo"]` |
| 模板创建实例 | `[data-action="instantiate"][data-id="tp1"]`, `[data-form="instantiate-form"]` |
| 流程状态 | `[data-action="process-toggle"]`, `[data-action="process-next"]` |
| 跟进 | `[data-action="followup-new"][data-id="c1"]`, `[data-form="followup-form"]`, `[data-action="followup-toggle"]` |
| 归档恢复 | `[data-action="archive"]`, `[data-action="restore"]` |
| 四象限/任务 | `[data-quadrant="0"]`, `[data-task-row="t1"]`, `[data-action="task-toggle"]`, `[data-action="task-menu"]` |
| 子项 | `[data-action="child-add"]`, `[data-form="child-form"]`, `[data-action="child-toggle"]` |
| 计时 | `#timer-clock`, `#timer-progress`, `[data-action="timer-toggle"]`, `[data-action="timer-end"]`, `[data-action="timer-reset"]` |
| 任务搜索选择 | `[data-action="timer-pick"]`, `[name="picker-query"]`, `[data-action="timer-select"][data-id="t1"]` |
| 反馈图片 | `#entity-editor input[name="images"]`, `#editor-images`, `[data-action="image-preview"]`, `[data-action="editor-image-remove"]` |
| 原型V2面板 | `#v2-prototype-panel`, `[data-action="service-open"]`, `[data-action="service-new"]` |
| 只读可选正文 | `[data-selectable-note]` |
| 提示 | `#web-toast[role="status"]` |

表中`\|`只用于Markdown表格转义；实际attribute值含普通`|`，CSS选择器可写`[data-id="items|w1"]`。

只读观察接口 `window.D409WebPrototype.inspect()` 返回route、选中ID、各类记录数量、当前计时及`storage:'memory-only'/network:false`；`navigate(route)`用于定位截图。没有公开数据写入/测试强制通过接口。真实操作验证仍使用DOM和实际输入，不能只调用navigate当交互验收。

## 统一合同审查注意点

1. 本原型实现了“侧栏+列表/详情+计时历史双栏”，但共享产品还存在其成熟modal/脏表单/DOM顺序合同；集成时不可直接整块替换为此内存程序。
2. Android原生timer/Kit不会因Web CSS自动改观，需Android代理独立处理；mobile-controls.js由Android代理独占。
3. `tokens.css`为root共享文件，当前Web未改它；组件需要新Token时先由root统一处理，避免三端各造颜色。
4. 当前CSS具备960/640折叠断点；低宽窗口、系统缩放和真实新截图仍须Actions实证。原型创建不宣称视觉已验收。
5. 正式共享UI集成必须另保留原D408测试字节与调用钩子，不移除V2存储/主候选存储隔离，不调用formal src/app/storage/sync入口。

下一步：root提交原型并完成云端运行检查后，代理再进入已授权的真实候选UI集成。

## 新增原型回归用例

`tests/d4-09/web/prototype-cases.mjs` 提供16个独立浏览器上下文用例，由root的Actions专用`prototype-run.mjs`加载。用例覆盖20路由导航；事项与项目新建/编辑/归档/恢复/删除；被引用项目/模板保护；脏草稿继续/放弃/保存关闭；失败保留与重试；搜索/状态/项目筛选/密度/空态；模板版本及实例步骤快照；跟进编辑/完成/重开；任务多行标题、Ctrl+Enter、子项、象限菜单移动及放大；实际经过时间的计时关联/暂停/切页/继续/提前结束历史；菜单键盘和搜索焦点；便签/反馈文字；设置加载与V2内存示意隔离；360/412布局和1440/360/412完整长备注选区。

点击与键盘通过CDP真实输入，表单填值采用DOM input/change事件。长备注选区通过DOM Range建立，截图仅证明文本保留和选区渲染，不能声称原生长按或系统选择手柄通过。图片系统选择器、图片持久化、真实拖动排序、自然计时到零、原生后台服务及真实V2存储不在这些原型用例的实测范围。原始业务测试文件未改；本地没有执行新增JS。云端状态以本次原型SHA对应的原始报告为准。

原型继续保持`style-src 'self'`，`web.js`不输出内联style属性，也不设置DOM style；动态图表使用预定义class，不需要扩大CSP。
