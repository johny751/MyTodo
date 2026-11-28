# D4-09 Android 浏览器原型交互手册

日期：2026-11-28 Asia/Shanghai。业务基线 `7c217d8779ccf21e13733b28868e015e9cfd693a`。原型入口 `prototypes/d4-09/android.html`，样式 `android.css`，交互 `android.js`，引用共享 `tokens.css`；无 CDN、外部字体或远程图片。

本原型用于候选 UI 设计，全部合成数据只在本次页面内存中。没有 localStorage/IndexedDB、产品桥、数据库、后台服务或联网请求；刷新会重置。图片由本地 SVG 字符串生成，预览不上传。网页计时动画和边缘手势都是设计模拟，不能写成 Android 原生运行、系统返回、后台计时或真实保存验证。

本次没有在本地打开应用、执行浏览器测试、编译或运行模拟器。首轮提交 `57a0438` 的 Actions `46084728532/a1` 已采集 Linux/Windows 浏览器结果，两者 Android 原型均15/16；P10原样例222字符与超过250字符断言矛盾，现修为548字符并增加全文/滚动选区检查，修复版待重跑。本文的步骤不是通过报告；360/412/desktop 截图、真实点击和断言由 GitHub Actions 采集并单独记录。

## 页面及稳定选择器

| route | 页面 | 入口 |
|---|---|---|
| `home` | 默认四象限首页 | `[data-route="home"]` |
| `dashboard` | 工作台 | `[data-route="dashboard"]` |
| `tasks` | 任务 | `[data-route="tasks"]` |
| `work` | 工作事项 | `[data-route="work"]` |
| `instances` | 流程实例 | `[data-route="instances"]` |
| `notes` | 备注 | `[data-route="notes"]` |
| `projects` | 项目 | `[data-route="projects"]` |
| `timer` | 番茄钟（当前专注/记录） | `[data-route="timer"]` |
| `stats` | 统计 | `[data-route="stats"]` |
| `contacts` | 联系人，显式待人工审阅 | `[data-route="contacts"]` |
| `feedback` | 优化意见 | `[data-route="feedback"]` |
| `settings` | 设置与版本 | `[data-route="settings"]` |

全部页共用 `#nav-trigger`、`#nav-drawer`、`#drawer-links`、`#page-menu-trigger`、`#page-menu`、`#page-title`、`#page-content`。抽屉应通过 `#drawer-links [data-route="..."]` 精确定位，避免底部快捷导航同 route 重复。底部保留四象限、工作台、番茄钟、工作事项四个快捷入口。

标题栏与底部导航不覆盖正文；正文在 `#page-content` 独立滚动。移动交互目标最小48 CSS px（设计映射为48dp；网页CSS不证明真实dp）。浏览器宽屏展示手机工作区和说明，不伪称原生应用。

## 主要交互路径

### A. 跨页抽屉、菜单与返回

1. 默认 `#page-title` 为“四象限”。点击 `#nav-trigger`，断言 `#nav-drawer[open]`，选择 `work`、`notes`、`stats`，每一页再次打开抽屉并切换，保证所有页面可达。
2. `#page-menu-trigger` 打开 `#page-menu`；包含新建任务、演示页面状态、原型说明。Esc与点击遮罩关闭，焦点回触发按钮；弹层内可用Tab顺序访问。
3. 新建任务弹层 `#detail-sheet` 中输入 `#new-title`、`#new-description`，点击创建后增加本次内存任务。关闭有输入的新建表单，出现保留/放弃/创建确认，防止静默丢稿。
4. `window.D409AndroidPrototype.back()` 为仅供原型说明/云端验收的统一“关闭顶部弹层，否则回上一页”入口；没有拦截浏览器历史或绑定 Android 桥，不能写作系统Back验证。
5. 浏览器内容左侧0–48 CSS px非控件、非编辑、非水平滚动、非文本选区处，可用向右长滑≥55px，或≥32px且≥0.45px/ms并横纵比>1.6演示开抽屉。只有已认定的边缘向右横滑在可取消touchmove中阻止浏览器默认横向手势；竖向意图退出，不调用系统手势排除，也不阻断竖向滚动。**不证明 Android 的48dp×200dp排除区或系统手势仲裁**。

### B. 原生计时能力的设计映射

`#timer-primary` 的 `data-command` 随idle/running/paused为start/pause/resume；其他原操作保留为按钮或设置分组：`[data-action="end-timer"]`、`[data-command="finish"]`、`[data-command="break"]`、`[data-action="reset-timer"]`。提前结束和重置均打开 `#confirm-dialog`，取消不改内存状态；倒计时不能手工“完成正计时”。

1. 进入timer，点击开始→暂停→继续，观察 `#timer-value`、`#timer-state` 和主按钮变化。切换其他页面再回来，当前内存会话继续；这里只是浏览器单页状态演示。
2. 提前结束确认后进入“计时记录”tab：`[data-action="timer-tab"][data-value="history"]`；查看新记录outcome、耗时和关联任务。重置不能删除既有记录。
3. 打开 `#timer-settings`，用 `[data-action="set-mode"][data-value="countup"]` 切到正计时；在活动状态下模式切换禁用。正计时活动状态有完成操作；休息用独立倒计时状态。
4. `#focus-minutes` / `#break-minutes` 要求1–180整数，`[data-action="save-timer-config"]` 保存。无效输入显示就地错误且保留草稿；活动阶段可按原契约修改时长，但不能改模式。
5. “演示状态”details中 `[data-action="timer-demo"]` 可以快速切换running/paused/countup/break/completed，明示其为合成状态。`[data-action="fail-next"]` 使下一动作进入未确认：`#timer-error` 和 `[data-action="retry-command"]`；重试复用同一演示请求。`[data-action="refresh-timer"]` 放弃重试意图，显示现有内存状态，不承诺撤销。
6. 选择任务或修改配置后是 `#timer-draft-notice` 待保存状态；离开timer出现继续编辑/放弃/保存并离开三选确认。Ctrl+Enter可保存当前配置。

原生实现时仍必须保持NativeTimerStore唯一权威、原revision/commandId/AtomicFile/elapsedRealtime/服务/通知；浏览器内存演示不是这些契约的替代实现。

### C. 任务关键词搜索与父子折叠

1. timer中 `[data-action="choose-task"]` 打开 `#task-picker`。`#task-tree` 初始只显示根任务，父项有48px展开按钮 `[data-action="toggle-tree"][data-id="release"]`。展开仅影响展示，不选择关联、不改任务关系。
2. 展开 `release`，再展开 `timer-review`，可见第三层“统一暂停、继续与提前结束提示”。长标题自动换行，父项显示未完成子项数。
3. 在 `#task-search` 输入“会议纪要”，应显示两个同名命中及各自“客户工作坊准备”“团队周复盘”父链；搜索中自动显示父链且禁用折叠，不改清除搜索前的展开集合。
4. 无匹配词展示空态；清除搜索恢复折叠状态。孤儿fixture `orphan`作为根显示“父级未返回”，不编造祖先；展示遍历防重复/限制深度，不修改底层关系。
5. 点击 `[data-action="select-task"][data-id="agenda"]` 后关闭弹层并显示“待保存关联”；保存配置后生效。`[data-action="clear-task"]` / `clear-task-inline` 同样需要保存。取消不改draft。
6. 原型仅有完整小型合成树。正式查询上限100及hasMore不能由原型树推断“所有任务已加载”；未来原生实现需继续显示超限提示并保留未返回父链的事实。

### D. 记录、统计、长文本、工作事项与实例

- 历史筛选 `[data-action="history-filter"]` 的值all/focus/break；记录点击 `[data-action="history-detail"]` 打开可选择的完整开始/结束、模式、phase、taskId、sessionId；记录有新到旧顺序和加载更多入口，不提供伪造历史删除。
- stats页明确统计口径：提前结束保留投入，休息不计入专注，正计时完成不增加倒计时完成轮次；前六天图表为固定合成样例，今天取本次内存记录。
- notes页 `.note-paper` 保留可选择正文和长时区/秒/毫秒样例。`edit-note`→`#note-editor`→`save-note`；取消或跨页导航需先处理dirty，Ctrl+Enter保存。可选择/复制；自动复制被浏览器拒绝时展示手动选择文本，不假报成功。
- 长备注合成样例为548字符、8段，正文需跨内容视口滚动阅读。P10保留原长度断言，额外检查DOM选区与全文逐字符相等、滚动后正文/选区不变、末段可视及无横溢出；该证据仍不等于Android真实长按选择。
- work页 `work-detail` 展示项目/下一步/完整长备注，关联备注与实例均可打开。`instances`独立展示实例和固定模板快照说明；`instance-detail`→`step-detail`可查看步骤身份，完成按钮明示只是流程确认演示，不修改产品模板或原实例。
- 新建任务、事项、项目、联系人只增加本次内存数据。联系人/跟进/归档仍待人工审阅，没有通过标记。

### E. 反馈图片与备份状态

1. feedback页输入 `#feedback-text`，选择分类 `#feedback-category` / 状态 `#feedback-status`。空内容保存显示错误并保留输入/图片。
2. `add-feedback-image` 添加合成图片；`preview-feedback-image` 打开 `#image-preview`，关闭按钮/Esc关闭。`remove-feedback-image` 必须确认，取消保持；删除仅移除当前草稿图片。
3. `save-feedback` 将文字/分类/状态/图片保存为当前内存快照。`feedback-list`展示已保存内容。跨页dirty确认支持保存或丢弃恢复上次快照。
4. `feedback-backup` 打开说明和导出/恢复/损坏演示：demo-export显示明确标记“演示”的成功样式；demo-restore保留取消/确认；demo-corrupt显示当前意见未替换。**没有创建ZIP、调用SAF/PhotoPicker、操作真实库或替换数据**。
5. 正式Android继续固定FeedbackKit AAR、原FeedbackApplication备份worker及真实picker/SAF；本原型不修改这些文件。

### F. 加载/空/错误与版本

页面菜单→demo-states→`[data-action="set-route-state"][data-value="loading|empty|error"]`，可逐页查看状态；`restore-route`恢复合成内容，不清空dirty草稿。

设置页 `version-info` / `version-history` / `copy-version`。版本说明明确“浏览器设计原型、非APK、versionCode/编译时间不适用”；历史另列实际D4-08基线 `0.8.10009/418009`、Git7c217、真实构建UTC时间。没有把当前时间伪装成APK编译时间。

## 云端验收建议与边界

应在Actions分别采集360×900、412×900与desktop完整页面/关键局部：四象限、工作台、work长详情、instances、notes文本选择、timer idle/running/paused/countup/history/dirty/error、任务树展开/同名搜索、stats、feedback图片/删除确认/错误、settings/version。每项记录实际尺寸、SHA与原图到缩略图换算。

独立D4-09交互检查不能修改冻结D4-08测试字节。浏览器截图只证明原型绘制；原生APK与系统手势/三键、IME、Activity重建/后台恢复、真实图片/文件选择及持久化必须另用Actions原生矩阵证明。此原型未触及Android产品源码、共享mobile-controls.js或任何storage/services/kernel/backup/model文件。

## 2026-11-28 云端用例准备

已新增 `tests/d4-09/android/prototype-cases.mjs`，16个独立context的DOM用例与截图计划；具体矩阵见同目录README。尚未本地/云端执行，等待root发布Actions。编写用例时修正浏览器原型back的历史循环：返回旧页不会把离开的页面再次压栈，未保存确认取消也不提前丢失历史。原型touchmove仅在明确边缘横向意图时取消默认横滑，避免浏览器先接管导致touchcancel；实际效果仍待Actions证据。正式Android系统Back与手势区域未改。
