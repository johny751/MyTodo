# D4-09 Web 现状、视觉结构与保全审计

日期：2026-11-28，Asia/Shanghai。审查者：repair_review。审查源码为 `work/d4-08/source` 的 `7c217d8779ccf21e13733b28868e015e9cfd693a`；审查时 Git 工作区干净。D4-09 工作源由root另行准备，本审计没有改产品代码。

本次仅阅读源代码、既有交付报告和两张云端截图小图；没有启动网页、服务、构建、测试、SQLite、安装或本地打包。参考本机 `frontend-design/SKILL.md`，但所有新设计建议须服从root的统一三端设计合同。owner最新授权允许设计后直接进入候选UI改造；不要求再次等待UI审批，生产数据/同步/签名限制继续有效。

## 核心结论

当前应改造的实际交付Web是 **Vanilla JavaScript/CSS候选界面 + 显式隔离V2服务面板**，不是React/Vue工程，也不是根目录正式网页直接换皮。Android D408主WebView复用该候选HTML；原生计时和FeedbackKit另有UI。共享UI改动将同时影响Web和Android任务/工作界面，而仅改CSS无法同时覆盖原生窗口。

现有功能/输入/数据保全已具备较完整实现。D4-09宜先建立有作用域的色彩、字体、间距和组件层级，再改善页面密度、导航层级、表单与反馈状态，不把UI重构扩成状态模型或存储改写。保持成熟事件钩子和原测试，新增视觉/可达性验收证据。

## 三条真实入口及技术边界

| 路径 | 真实结构 | 数据/网络边界 | D4-09影响 |
|---|---|---|---|
| 正式旧Web入口 | 根 `index.html` → `src/app.mjs`，根 `styles.css` + `interaction.css`；Node `server.mjs`静态白名单 | account/replica/storage/sync等正式路径；storage不是候选localStorage适配器；服务监听127.0.0.1 | 只读比较。不能把这个入口直接运行在真实数据目录，也不能因美化顺便挂上其同步/存储。 |
| D4共享候选入口 | `prototypes/d4-01/index.html`、`app.js`、`work-pages.js`、`personal-pages.js`、`legacy-pages.js`、`mobile-controls.js`、`native-timer-adapter.js`、`domain.mjs` | `mytodo-d4-03-demo-v1` / `mytodo-d4-03-synthetic-demo`。纯业务模块复用src/model/task-tree/schedule/task-editor/personal-ui等，候选repo独立 | 主要Web/Android共享UI改造点。数据保全和成熟输入行为要保持。 |
| D408组合Web交付 | Actions `tests/d4-08/web-build.mjs`先调用原builder，再注入`prototypes/d4-06/v2-service.mjs`和`prototypes/d4-08/v2-candidate-app.js` | 独立 `mytodo-d408-v2-isolated-v1`，scope为isolated-synthetic；无HTTP端口。面板不与主候选repo合并 | 必须一同纳入设计与回归，不能只演示共享主页面。V2面板目前挂在settings路由。 |

`package.json`为 `gxtodo-local 0.9.2`，无第三方前端依赖，Node要求≥22.13。原builder在Actions中将已知纯ESM依赖图和各经典脚本编成单个离线HTML，不能从本地直接打开源码HTML就当交付验收。原模板CSP为`default-src 'none'`、`connect-src 'none'`、data图片/字体，原builder拒绝外链CSS/import/url依赖。任何新主题资源必须进入云端构建与来源清单。

已有本地Noto Sans SC可变字体17,773,244字节，原builder验证固定摘要并内嵌data URL及完整OFL许可；不需要为这轮UI增加外部字体/CDN。源码CSS本身没有@font-face，是builder注入，不能误报为字体未打包。

## 当前共享界面结构

`app.js:13`有20条route，默认四象限。分组为个人效率7、工作管理7、系统6；其中task-detail也出现在route列表。主壳为 `.app-shell` → `.side-nav` + `.workspace`；header包含面包屑、全局搜索、环境徽标、提醒，主体是唯一 `main.page[data-route]`，弹层独立放在`#modal-root`。

桌面导航宽206px，1150px以下180px；650px及以下变为206px抽屉。原页头68px，手机叠加覆盖后58px。工作记录有桌面表格和700px以下带data-label的双列卡片呈现，不是所有表格都需要强制横向滚动。

组件与行为主要通过字符串模板及document事件委托协作，`data-action` / `data-form` / `data-id` / input name均承担业务和测试契约；各页存在重复heading/button/field生成器。`app.js`全量重绘壳时会保存与还原滚动、脏表单、弹窗内容、选中任务和象限滚动。任何改变元素顺序/重绘时机的工作都可能影响草稿与焦点，不能将其视作纯CSS修改。

V2面板由 `v2-candidate-app.js:40–68` 的MutationObserver挂入 `main[data-route="settings"]`，单独使用 `data-v2-action` / `data-v2-form`。UI先等待持久化成功才更新列表，busy时禁用其控件。改settings主体结构必须确保面板不会丢失、重复挂载或因观察循环重复执行。

原生桥边界：Android D408加载候选assets/index.html；`D408Activity`处理实际视口/insets、系统文件选择、返回/导航与文本选择工具栏。`D4NativeTimer`/`GxD4Preview`是既有受限候选接点，不得换成正式GxNative存储/同步桥。

## 当前视觉事实及债务

基础色值为ink/nav `#263b4c`、背景`#f3f6fa`、主蓝`#337ac8`、分隔`#e5eaf0`、次文字`#7d8b97`、危险`#c65652`；四象限为`#e77655/#d8b451/#63b3ca/#9eba68`。基础圆角10px、按钮6px、弹层11px。字体系Segoe UI Variable/微软雅黑UI/微软雅黑/Noto Sans SC，正文14px，标题25px；许多桌面任务、表格、按钮12px，field标签11px，个别次要信息10px。手机后来补丁将部分文本增至13px。

1. **样式覆盖密集。** 35,941字节CSS的核心规则高度压缩，后部按D403/D408继续追加；650/700/900/1150/1600阈值交叉。`.topbar/.page/.button/.modal`有多次覆盖。设计统一应制定明确层级与命名范围，不能继续无记录堆同选择器补丁。
2. **导航密集且当前页识别弱于信息量。** 20路由集中在左栏，个人/工作/系统有分组但次级与主要页面同重量；手机必须保留边缘抽屉和菜单按钮双入口。路由不能因重排被删除，task-detail可从主导航降为上下文入口须先确认测试/返回合同。
3. **正文和标签偏小。** 工作管理使用表格、关系与原值等大量细节，11/12px层级不利于长时间使用。建议以14/15px正文、12/13px次信息、明确的标题等级形成可读密度；不要靠截断隐藏真实历史值。
4. **弹层语义过泛。** 通用弹层头默认“MyTodo”，具体实体标题在滚动正文，已滚动时不易辨识上下文；可改为当前操作/对象标题，需保留稳定关闭按钮、dialog role、aria-modal、焦点圈和原返回行为。
5. **多个按钮同权重。** 列表行编辑/流程/归档/删除常并列，主动作与危险动作可通过视觉层次明确区分；不能隐藏唯一业务入口或改变确认/撤销语义。
6. **错误/保存状态分散。** 主候选repo持久化失败、反馈保存、计时重试、V2面板错误各有独立状态。设计可以统一外观和语言结构，但不得把“内存暂存”画成“已保存”，也不能用toast代替持久错误及重试动作。
7. **基础可达性不是空白。** 已有3px focus-visible、prefers-reduced-motion、原生表单标签、dialog/focus trap、aria-live通知和可选备注。不要在新风格里重置outline/user-select。当前仅light，未见完整暗色主题，不能承诺已有双主题。
8. **候选身份文字陈旧。** 壳中仍有D4-03/DEMO/独立合成体验文字，虽然实际构建和来源明确。新候选应使用由构建注入的真实版本/候选身份，保留一次清晰隔离说明；不能把原有生产限制藏掉，也不必在每个操作旁重复工程术语。

以上为静态实现判断，不是D4-09实际渲染通过结论。

## 已实际查看的既有截图

本次仅查看D408最终交付内两张小图：`visual-evidence/web-1440-wrapped-preview.jpg`和`web-360-wrapped-preview.jpg`，均为既有Actions `46018074859/a1`的组合Web工作事项详情。未重新下载或运行应用。

- 桌面画面：左深色导航、顶部浅栏、白色居中详情，正文较窄，长毫秒/offset原值与备注能换行；关系选择与动作位于滚动内容。通用“MyTodo”标题和大量同等灰色小信息难以快速区分实体与辅助信息。
- 360画面：白色全宽底部弹层、固定头和关闭按钮，长原值/连续备注仍可换行，内容可滚动；当前截图已滚动，顶部实体名称和底部全部动作不在同帧。不能据此称整页所有控件无遮挡。
- 这些图只覆盖该详情状态，不能替代首页、四象限、联系人、归档、错误态、计时/反馈等其他页面的视觉观察。D40824图已有逐图报告继续保留；D4-09必须建立新的同源截图，不拼用旧图当新设计验收。

## 独立设计建议（待统一合同收敛）

产品定位是个人任务与综合工作管理桌面，不是宣传页。建议“稳定的工作桌面”：保留四象限的四色语义作为唯一鲜明特征，其余界面用单一冷蓝动作色、浅中性背景和清楚的分隔，减少大阴影、装饰渐变和重复卡片。dashboard不要把大数字卡片当主要界面，应首先帮助用户找到当前任务、关联事项和待跟进内容。

建议颜色角色先定义为background/surface/border/text/muted/action/danger及四象限，不直接散落颜色字面量；先用已有系统/内嵌字体，标题与正文靠字号/字重区分，时间、ID和计数可用tabular-nums。密度控制统一到4/8/12/16/24间距；桌面主壳保持宽侧栏+内容，手机保持抽屉+单栏，主操作在视口中可达。具体hex、栏宽、圆角和字号以root合同为准。

页面结构建议：每页统一“标题+一句必要说明+主操作”→过滤器/视图控制→主体→持续状态。详情和编辑分清；长内容原样换行，附件图保持真实字节及宽高约束，空状态给明确动作。桌面密度可以较高，手机先呈现名称/状态/主要关系，再展开次要元数据；数据字段不能因为视觉精简而丢失或被默认值覆盖。

## 不可破坏的UI与数据合同

| 合同 | 原实现/证据位置 | UI改造要求 |
|---|---|---|
| 原四象限、缩放、滚动、拖动、子任务 | app.js、mobile-controls.js；原164套件 | 保留dataset及拖放/页内滚动区域；不能用统一overflow规则取消命中区域。 |
| 导航手势与系统返回 | mobile-controls.js 48CSSpx；Android48dp协调 | 不改距离/速度/方向判定来适配视觉；保留textarea/横滚不触发导航，抽屉关闭后原页草稿不变。 |
| Ctrl+Enter与建议列表 | app.js键盘委托、role=combobox | 子项优先添加、父草稿保留，IME不提交，Enter用于选择建议；按钮改名/结构不能重路由事件。 |
| 草稿/焦点/重绘 | remember/captureForm/restoreForm/captureMain/restoreMain | 表单input name、顺序和脏状态必须有回归依据；避免切换主题/导航时重建未保存输入。 |
| 模板/实例/未知字段 | work-pages preserveUnchanged/fieldChanged，W01/W02 | UI控件默认值不得规范化旧null、缺失、未知枚举、原关系ID或模板完整定义。 |
| 时间/备注保全 | work-raw-text、work-note-content、work-time-field | 保留秒/ms/offset和未知值显示及无关保存不变；历史原文可复制/选择，不靠ellipsis隐藏唯一原值。 |
| 计时持久化与恢复 | personal-pages/native-timer-adapter | 布局/格式只呈现既有计时权威，不能加第二套倒计时状态；暂停、完成、提前结束区分。 |
| 反馈图片/删除/恢复 | personal-pages、原生Kit/桥、U01–U07 | 原图字节、草稿、batch/generation、确认/撤销/坏包保全继续；图片卡不能只存URI或缩略图。 |
| 两个Web存储域 | domain + v2-candidate-app | 保留两个key、envelope和scope；视觉统一不得变成隐式迁移、合并repo或启用HTTP。 |
| 通知/错误与可达性 | reminder/undo/toast、modal focus trap | 固定区不能挡主操作，错误原文和重试保持可达；键盘焦点、读屏状态、reduce motion继续。 |

## 验收状态与建议验证矩阵

owner新反馈已接受Windows工作台/事项项目CRUD、模板实例CRUD和暂停继续完成、番茄计时暂停结束历史、项目/标签建议、Ctrl+Enter及重开持久化；Android计时/切应用、反馈图片选择预览删除、备份恢复和坏包、边缘导航基本可用。这是本次人工状态，应作为不得回退的基准。**联系人、跟进、归档人工状态未知**，不能扩写为已验收，也不能因此删除其入口/数据。

D4-09云端建议按同一源码跑原Web164与D40821/work2，普通/组合HTML及Windows/Ubuntu分别保留，组合service3继续。另增有意义的设计验收：360/412/768/1440；四象限、工作列表/详情/编辑、项目、模板/实例、联系人跟进/归档、计时、反馈、设置/V2；至少含空/满/长文本/错误/禁用/选区/焦点状态，确保操作可达、无水平溢出、长原值未裁切、错误可恢复。Android共享页面另须真实模拟器输入与system insets，不用Web截图代替。

验证只在Actions执行；本地继续仅源代码、文本、哈希、档案和小图检查。旧失败、旧交付和原测试不改写；root统一安排正式运行、制品、审计封存与GROWTH更新。

## 精确静态索引

- `prototypes/d4-01/styles.css`：35,941字节；SHA256 `2468747e7e4c326ec0921d110e916984e4431bf2fc892fe9f0c18ae9048ba64b`。
- `prototypes/d4-01/app.js`：66,356字节；SHA256 `2b6749981917a8e43e751a9147a2bd563e8d4fc6aa0bf332c18b060d961fd10a`。
- `prototypes/d4-08/v2-candidate-app.js`：8,062字节；SHA256 `19b8613343b5e2a0974a51d88c61f2dfe0e4da328ffdf3a9d2e1832486e99c1b`。
- 构建链：`tests/d4-ui/build-demo.mjs:53–81`；`tests/d4-08/web-build.mjs`；`tests/d4-08/web-package.mjs`。
- 主候选边界：`prototypes/d4-01/domain.mjs:1–13`、`app.js:13,25,61,103–108,183–213`；V2挂载`prototypes/d4-08/v2-candidate-app.js:40–68`。
- 正式旧路径对照：根`index.html`、`src/app.mjs`、`src/storage.mjs`、`server.mjs`；仅静态读取。

本报告是D4-09设计和保全输入，不是新UI已实现或已测试的声明。
