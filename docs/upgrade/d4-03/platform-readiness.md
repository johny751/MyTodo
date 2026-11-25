# D4-03 三端准备状态与操作习惯静态复核

2026-11-25，Asia/Shanghai。本报告只记录源码审查、已发起的云端运行及未达条件；没有本地编译、测试、SQLite、应用安装、真实数据或真实同步操作。

## 首轮 Actions 与证据状态

FACT：主 Agent 报告首轮候选源码为 `288b0b97d9974e3797a5099c97d5aeb1c3e26dc9`。UI [45533988173](https://github.com/johny751/MyTodo/actions/runs/45533988173) 和独立 C0 [45533988196](https://github.com/johny751/MyTodo/actions/runs/45533988196) 均因账户 billing/spending limit 拒绝启动。它们是基础设施拒绝记录，不是已执行测试的失败或通过记录。

| 范围 | 已执行测试 | 已通过 | 已失败测试 | 已构建体验产物 | 状态 |
|---|---:|---:|---:|---:|---|
| Web 浏览器 / 合成业务 | 0 | 0 | 0 | 0 | UNVERIFIED，未执行 |
| Windows 浏览器桌面体验 | 0 | 0 | 0 | 0 | UNVERIFIED，未执行；不等于 Win32 |
| Android JVM 原模型 | 0 | 0 | 0 | 0 | UNVERIFIED，未执行 |
| Android APK / 原生输入 | 0 | 0 | 0 | 0 | UNVERIFIED，未执行；25 项强制用例是计划数 |
| C0-04 三端原协议 | 0 | 0 | 0 | 0 | UNVERIFIED，未执行；历史成功证据仍另存 |

BLOCKER：云端执行资格恢复之前，不产生本轮包、截图、逐项测试结果或三端验收证据。OWNER DECISION：负责人处理账户执行额度/计费限制；此项不扩大生产数据或同步权限。重新运行必须取得新 run/attempt 的实际结果，不能将旧成功运行下载为本轮结果。

## 各平台实际准备范围

| 平台 | FACT：当前独立源码与验证入口 | 仍未取得的证据及边界 |
|---|---|---|
| Web | `prototypes/d4-01/app.js`、`mobile-controls.js`、`legacy-pages.js`、`personal-pages.js`、`work-pages.js`；`domain.mjs` 调用保留的成熟纯模块。`tests/d4-ui/run-browser.mjs` 准备独立浏览器 profile、屏蔽 HTTP/HTTPS/WebSocket 请求、CDP 输入与逐项报告。 | 没有本轮 HTML 包或截图。大部分 CRUD 用例调用 DOM `.click()`/`requestSubmit()`；mobile 用例另有真实浏览器输入，不得把全部套件描述为真实触屏。浏览器 viewport 不等于 Android。 |
| Windows | `prototypes/d4-03-platforms/windows/open-isolated-preview.cmd` 准备独立 profile，使用已安装 Edge/Chrome 打开随包 HTML；没有调用生产 Win32/SQLite。 | launcher 源码存在不等于已打包/体验通过。正式 Win32 `gui/detail/task-menu/operations` 没有新 UI 集成证据，原菜单、存储、拖动、键盘及窗口重建仍需独立原生回归。 |
| Android | 独立 `local.gxtodo.d403preview` WebView APK、独立 test APK、受限本地 HTTPS origin、无生产 `GxNative`/INTERNET/账户/外部存储接口。`PreviewInstrumentation` 准备 25 项强制检查，使用 UiAutomation SOURCE_TOUCHSCREEN、Android Back 和原生按钮。原番茄模型/JVM 断言文件保持冻结字节。 | APK、test APK、签名核验、JVM suite、25 项测试均未执行。没有实际安装、软键盘、系统边缘手势、真机、锁屏/后台通知/service/进程死亡证据。独立原生 timer 与 HTML timer 状态仍分开。 |
| 原协议 / 数据准入 | 独立 C0 工作流保留原 harness、八分片及 artifact lineage；D1/D2 的冻结证据保留。 | 首轮 C0 执行 0；UI 不替代 C0/D1/D2，也不证明真实数据库迁移或生产同步通过。 |

PROPOSAL：每份新包绑定候选 SHA、run ID、attempt、实际 HTML SHA-256、版本及 UTC 构建时间。独立 job 的 HTML 构建时间可不同，因此分别核验包身份；不以相同源码 SHA 声称不同 job 产物逐字节相同。

## 原操作习惯剩余差异

以下结论以本轮静态审查快照为证据，列出可见源码差异；没有执行复现。原证据为冻结复用的 `src/app.mjs`、`src/gestures.mjs`、`src/task-editor.mjs` 及此前 `original-task-coverage.md`。后续修正须在统一报告列出新源码 SHA 和实际回归结果，本表不能自动改为已通过。

| ID / 矩阵关联 | FACT：原行为及候选差异 | PROPOSAL：兼容修正及必要验证 | 状态 |
|---|---|---|---|
| H01 / Q03、M01、N02 | 原 `gestures.mjs:13–14` 左滑菜单、右滑完成，在 release 达阈值才执行。审查快照 `mobile-controls.js:13` 右滑菜单/左滑完成，move 过程中超过 90px 即执行；settings 和 M-legacy 断言也采用反方向。原窄屏总览明确关闭 task swipe，Android workspace 捕获另有上下文屏障。 | 保留原方向与手势设置；阈值/松手前无写入，touchcancel/多指/方向返回不得完成任务。测试由冻结原行为确定，不能只顺应新实现改变断言。验证 overview/focus/菜单开启/编辑上下文与撤销。 | BLOCKER：存在误完成与习惯颠倒风险。 |
| H02 / Q03、N02 | 原手柄立即拖动，其他输入使用配置 longPress；Pointer Events 支持 mouse/pen；Esc、blur、pointercancel 取消，点击抑制限定该 task。候选只接 mouse/touch，桌面等候固定 200ms，taskRow 未渲染 handle；Esc 只处理 nav，blur 未 clear，点击抑制为全局。 | 补显式可聚焦手柄、原配置、mouse/pen 入口及 cancel/blur 清理；只抑制对应 task 的尾随 click。验证拖动中 Esc/失焦不改 order，鼠标左右滑和 pen 事件。 | BLOCKER，实际平台输入 UNVERIFIED。 |
| H03 / T05、N03 | 原子任务有独立同级手势、上下键排序、完整父路径、关闭返回父任务。候选 `taskRow(child)` 仍只有标题和三点菜单，gesture 仅匹配 `.board .task-row`；`back()` 关闭 modal，不恢复父详情。菜单同级上/下移虽可用，不能替代全部原操作。 | 同级手柄/键盘/触摸复用 `moveSubtask`；保存前保留父路径与待编辑草稿，返回逐层。验证两层以上、100/101 边界、异层锚点拒绝、父删除。 | BLOCKER：原层级操作未完整恢复。 |
| H04 / Q01、Q02、Q04 | 原窄屏总览点任务区域先放大，zoom 仍有其余三个 peek，可拖入/点击切换；候选总览标题放大但任务标题直接详情，focused 状态只输出一个 quadrant，无法拖到其他象限。菜单/编辑移动仍存在。 | 保留最新要求的标题放大与独立加号，同时恢复原总览/peek 的快速路径，保证同一 tap 不同时新建和放大。验证单象限直接跨拖及完整字段保留。 | BLOCKER：菜单可移动不等于单象限原跨拖习惯恢复。 |
| H05 / T02、T04、E03、N03 | 原 `saveTask` 保持详情打开，`canLeaveEditor` 保存失败阻止退出；close/back/切页保存待编辑任务，complete-editor 先保存。候选 `saveTask` 保存后关闭 modal，close/back 直接清 modal，nav 仅保存草稿到页面内存；编辑中 completion 重开同 task 也未先提交表单。 | 区分保存、返回并保存、明确取消；统一 leave/complete 屏障，校验或持久化失败保留页面及输入。M18 的未保存切页恢复继续保留，不能用它宣称原自动保存回归。 | BLOCKER：关闭/完成可能丢未保存修改。 |
| H06 / T05、E03 | 原快捷子任务为 textarea，Enter 换行；“保存”可先提交非空 quickTitle。候选快捷子任务为普通 input/form 提交，父表单 save 未包含 pending quickTitle。 | 恢复原文本和保存顺序，连续创建保留焦点；IME/Enter/空输入及父 save 时 quickTitle 验证。 | BLOCKER：快捷录入习惯不等价。 |
| H07 / E01、F01、N02 | 原日期 picker 有今天/明天/清除；Android 四象限上下边界滑动切前后周期且优先列表滚动。候选普通 datetime-local 未见原日期快捷；timeline 有前/后/today 按钮，quad gesture 未提供周期动作。 | 复用日期快捷与成熟 shiftDate；边界手势保留滚动优先、输入/拖动/nav冲突屏障。不能将 timeline 按钮作为原四象限周期操作已恢复。 | BLOCKER，Android 列表边界触屏 UNVERIFIED。 |
| H08 / F02、N01 | 原 `searchAll` 包含独立 notes/projects/tags/places；候选 `globalSearch` 只使用 `repo.search(q).tasks`，另加工作实体，忽略原 notes/tags/places 返回。目录的局部搜索存在但不是原全局搜索。 | 将原实体结果恢复到可定位入口，区分独立便签与 task.notes；新增工作实体继续保留。验证多关键词、NFKC、子任务、独立便签/分类及原菜单可达。 | BLOCKER：全局实体搜索缩减。 |
| H09 / T01、F01 | 原从分组/父任务新建继承分类。候选 `newTaskForGroup` 为 timeline 路径保留 group，但四象限内 `task-new` 直接 `taskForm('',q)`，未传当前 view.group。 | 四象限组内“+”和标题快捷传同一 group 默认；保持 quadrant/分类/父继承与取消不创建。 | BLOCKER：分组快捷新建默认值不一致。 |
| H10 / Q02、N03 | 原按 overview/zoom/peek + quadrant 保存滚动。候选 `render:90/93` 用 DOM 列表索引恢复，overview→q2单象限时索引0来自q0；返回时仅一个列表可供恢复。 | 用稳定 view/quadrant key 保存滚动，不按重排后的DOM索引猜位置。验证每象限不同scrollTop、zoom q2、切页、返回并保留筛选。 | BLOCKER：特定象限滚动位置丢失。 |
| H11 / E02、T02 | 多星期、repeat anchor、换行地点及小数 weight 已有候选处理和待执行用例；`taskForm/saveTask` 仍会从完整表单重建 repeat/reminder。旧 weekly 空 weekdays 和非标准历史值是否在仅改标题时保持尚未验证。 | 合成历史边界 fixture 比较原值与语义；editable patch 不得重锚未改规则。只能依据现有规范/原模型确定断言，不为过测试标准化真实历史数据。 | UNVERIFIED；原值损失时 BLOCKER。 |
| H12 / N01 | 独立分类、时间轴、data-system 和 about 入口恢复了一部分原导航；原账号域、导入导出和帮助不能因不允许真实账户操作而被隐去。 | 以独立合成入口展示账号/导入/帮助的实际范围；无法支持原能力则公开差异，生产账号及真实导入仍需另案授权。 | BLOCKER：原全部入口及原生能力尚未统一验收。 |

## 待执行测试不能覆盖的结论

FACT：现有 mobile 用例包含启动、zoom/back、board 长按/跨拖、菜单、自动完成、边缘导航、草稿、撤销和长列表 auto-scroll；regression 用例包括可见排序、显式任务选择、输入候选、错误草稿、换行地点/小数 weight、历史空白地点与 timer dirty 配置；legacy 用例包括目录CRUD/精确关联、时间轴/日期、重名项目 unresolved。

UNVERIFIED：用例源码的存在不证明通过。现有 M-legacy 的 swipe 方向与原行为冲突，须按 H01 修订实现和用例后执行；不能据其标题宣称“retain original”。现有 Android 25 项不包含所有 H01–H12，也不覆盖原 production service、真实 Win32 或全部 C0/D1/D2。因此即便未来这些计划用例全部通过，仍必须逐项处理完整性矩阵的缺口。

PROPOSAL（已编写独立测试辅助代码，未执行）：`run-browser.mjs` 的 drag 对 viewport 和滚动祖先裁剪后的坐标进行 `elementFromPoint` 核验，开始与 release 均须命中原目标；被遮罩覆盖或离屏时失败。held auto-scroll 单独计算可见列表下边缘，长按后确认同一 task 的 dragging 状态，保持触点并确认列表 scrollTop 在持有期间增加，保存持有拖动截图，然后才释放。失败清理使用 touchCancel，不通过提前释放、直接改 scrollTop 或离屏坐标制造结果。原业务断言、任务数/字段比较均保留。

## 静态快照与保护

审查定位快照 SHA-256（文件改动后须记录新值，不能替代 Git 提交身份证据）：

| 文件 | SHA-256 |
|---|---|
| `prototypes/d4-01/app.js` | `43117724d812ed060b4253a21113518e1a46e7bc0cc5b17dd58170d2d0eeb924` |
| `prototypes/d4-01/mobile-controls.js` | `031310a4f727eeaa03ddeece50aa3fd74ab761916b69da2a40244663045df2ca` |
| `tests/d4-ui/mobile-cases.mjs` | `cb265837258824d392d6a4f6f104773dbdae94a4d4464a0d6351b6096bcc4e27` |
| `prototypes/d4-01/legacy-pages.js` | `20dec4900a5b5bd340490624d1babbd58e9013fb66ce455dd6ccb449ac81e62b` |

FACT：本次交叉审核新增本报告、追加 `original-task-coverage.md`，并按主 Agent 的独立授权强化 `tests/d4-ui/run-browser.mjs` 的 drag/held-auto-scroll 输入辅助代码；没有编辑 root UI、gesture 或生产源码，也没有降低原业务断言。GROWTH、统一 SHA 清单及下一候选由主 Agent 集中更新。

BLOCKER 持续保留：真实历史 schema/迁移准入、全部写入者屏障、正式身份、备份/多文件恢复、认证远端状态、Android issue #1、生产提醒/后台 timer/独立反馈图片数据域、正式 Win32 接入。不得改变 ACK/outbox/cursor/manifest/batch、操作真实用户数据库、合并 D2 或开启 LAN/WebDAV。Android issue #1 保持开放。
