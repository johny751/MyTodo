# D4-03 隔离平台体验与证据边界

本文件说明候选代码接入方式。生成本文件时没有本地编译、测试、SQLite 或 APK 打包；运行结论以同一候选 SHA 的 GitHub Actions 原始证据为准。静态源码存在不等于运行通过，Android emulator 通过也不等于生产 Android、真实手机或 Win32 全回归通过。

## 统一入口与隔离

| 结论 | 实施与证据 | 限制 |
|---|---|---|
| FACT | 原版 Android `MainActivity` 使用共享 Web UI；任务菜单与业务逻辑不是另一套 Java 任务实现。来源见 `original-task-coverage.md`。 | 不据此声称新壳替换生产 Activity 已通过。 |
| PROPOSAL | `prototypes/d4-03-platforms/android` 是独立 `local.gxtodo.d403preview` APK，以受限 `https://d403-preview.local/index.html` 本地资源拦截提供核验后的 HTML。平台构建输入逐字节复制到该包的 `assets/index.html` 和随包桌面 HTML。 | 各 Actions job 独立生成 HTML 时构建时间和哈希可不同；跨 job 统一候选 SHA、业务模块与语义，分别核验包身份，不声称三份 HTML 逐字节一致。没有 INTERNET、外部存储、账户权限；没有生产 `GxNative`、SQLite、service、LAN 或 WebDAV 接口。 |
| FACT | `prepare.mjs` 必须核对 Actions、checkout SHA、同 run/attempt 的 `build-receipt.json`、HTML SHA-256 和冻结复用字节；仅接受新建 RUNNER_TEMP/d4-platform-* 目录。 | 身份或哈希不一致立即失败。 |
| PROPOSAL | `GxD4Preview` 只提供隔离标记、原生计时体验、`versionInfo()` 只读 APK 构建常量、版本对话框与异步计时请求，异步请求含 request ID，磁盘/model 操作在有界单 worker 执行。 | UI不得把此桥当成生产存储或生产同步桥。 |
| PROPOSAL | Android Back 只调用一次 `D4PreviewBack()`，旧接口仅作为 fallback；主 UI 顺序为抽屉→弹窗→单象限→四象限。 | 禁止再额外派发 `gx-back` 导致两次返回。输入法与物理设备差异仍需实际证据。 |
| PROPOSAL | Windows `open-isolated-preview.cmd` 使用已安装 Edge/Chrome，以独立 `%LOCALAPPDATA%/MyTodo-D4-03-Preview/browser-profile` 打开随包 HTML。 | 这是可操作桌面浏览器体验，不是新 Win32 原生集成；无浏览器时明确失败，不自动下载。 |

原生产 Windows C、Android Java/Web、Node 存储和同步源码未由此壳改变。该候选不引用 D2 migration runner，不接触真实数据库、原 localStorage 命名空间、凭据或远端。测试 APK 位于 `tests/d4-03-platforms/android`，单独编译和签名；其代码不进入体验 APK。

## 原生番茄钟复用

FACT：以下冻结文件按原始字节复制，生成与云端 scope 检查都强制校验；没有为通过测试修改模型或旧断言。

| 文件 | SHA-256 |
|---|---|
| `android/src/local/gxtodo/replica/PomodoroClock.java` | `1ad9c070920ae62f2abf707e843ecd315434db1d11018f693747d59f7b42af39` |
| `tests/d4-03-platforms/jvm/PomodoroClockTest.java` | `4f253e97d96ecba12045fa1c836abbdcbec34b5b854363e7e8948585a5e58b9a` |

FACT：原模型同一 boot 使用单调时钟，boot 变化使用墙钟恢复；北京时间分日统计；snapshot 不消费完成事件，tick 一次消费；原 JVM 套件覆盖倒计时、正计时、暂停/恢复、进程重启模型、墙钟变化、重启模型、日统计、防御复制和时长修改。

PROPOSAL：`NativeTimerStore` 以 `SystemClock.elapsedRealtime()` 驱动原模型，独立 `AtomicFile` 为 `files/d403-native-timer-synthetic.json`，完整保留模型状态、分日统计和 pending completion。写入失败明确返回错误并丢弃未接受的内存实例，下次重新读取已持久化状态；不存在静默重置。计时不依赖 Activity 持续轮询；页面重新进入时由原模型结算已过时间。

PROPOSAL：`NativeTimerActivity` 提供真正 Android 按钮：25 分钟开始、1 分钟隔离验证、暂停、继续、提前结束/重置，以及原生状态/统计和前台完成 Toast。计时磁盘操作不在 UI 线程，页面仅在 resumed 时每秒请求状态。

BLOCKER：原生隔离计时与 HTML 番茄钟为两个明确标识的独立体验状态，尚未完成生产统一状态接入。当前壳没有接入原 Android 前台 service、后台通知、锁屏或进程被杀后的完整生命周期机制；不得用原模型 JVM 或 emulator 页面离开结果替代其回归证据。BOOT_COUNT 若在厂商系统不可读会记录空 boot ID，相关真实重启识别仍 UNVERIFIED。原生产通知/service 必须保留，不能被此独立壳替换。

## 云端构建与可体验包

所有命令仅在 GitHub Actions、EXPECTED_SOURCE_SHA=GITHUB_SHA 且 checkout 同 SHA 下执行。Ubuntu UI artifact 保持 `mytodo-d4-01-demo.html` 文件名；平台包复制为 assets/index.html 和桌面 `mytodo-d4-03-demo.html`。

```bash
node --test tests/d4-03-platforms/scope.test.mjs
bash tests/d4-03-platforms/run-jvm.sh "$RUNNER_TEMP/d4-jvm-evidence-$GITHUB_RUN_ID"
bash prototypes/d4-03-platforms/build-android.sh \
  "$RUNNER_TEMP/d4-ui-$GITHUB_RUN_ID/mytodo-d4-01-demo.html" \
  "$RUNNER_TEMP/d4-platform-$GITHUB_RUN_ID"
# 仅 workflow 创建的隔离 emulator；不得换为真实用户设备。
export ANDROID_SERIAL=emulator-5554
bash tests/d4-03-platforms/run-instrumentation.sh \
  "$RUNNER_TEMP/d4-platform-$GITHUB_RUN_ID" \
  "$RUNNER_TEMP/d4-native-evidence-$GITHUB_RUN_ID"
```

PROPOSAL：构建使用 runner 已安装官方 SDK：aapt2→javac→d8→zipalign→apksigner。缺失 SDK/build-tools 时失败并保留日志，没有脚本内下载 fallback。API 默认 35、minSdk 26、targetSdk 35；测试 APK 有相同独立签名但独立包名。版本名 `0.3.<Actions run number>`、versionCode `403000+run number`、full SHA、Git 前五位和 UTC 构建时间由构建流程注入，版本对话框可复制并显示离线版本历史。

FACT：新独立 package 的已知初始版本历史由本次构建身份产生；不冒充原正式应用版本。后续对这个独立 package 进行已发布更新时必须保留真实已知版本，不能编造旧 APK 时间。

UNVERIFIED：本脚本使用每次 run 的临时隔离测试签名。它不使用原应用签名，不提供不同 run 间原地升级保障；在隔离 emulator 中安装/清空操作仅作用于 preview package。体验者不得为了换包卸载原 MyTodo。临时 keystore、classes 和 unsigned 中间产物不属于用户交付包。

用户包应包含 `mytodo-d4-03-isolated-preview.apk`、`mytodo-d4-03-demo.html`、`open-isolated-preview.cmd`、构建身份和 SHA-256。测试 APK、源构建日志与运行证据另放证据包。无可安装条件的平台首先提供隔离浏览器体验，并如实保留原生缺口。

## 真实触屏与计时测试

PROPOSAL：独立 `PreviewInstrumentation` 有 25 项强制测试。触屏由 `UiAutomation.injectInputEvent(MotionEvent)` 注入，SOURCE_TOUCHSCREEN，依据 WebView 原始屏幕位置和 CSS 比例换算；没有用 JS dispatchEvent 代替触屏手势。JS 仅用于合成 fixture、读坐标/状态和设置输入候选。自动完成候选选择使用实际 tap，标签选择额外使用 Android DPAD/Enter 键事件。

| 测试范围 | 实际操作与断言 |
|---|---|
| 包隔离/首页 | 无生产桥、无 INTERNET/存储/账户权限；实际 mobile CSS viewport，启动 tasks 和四象限。 |
| APK 版本 | 关于页面实际版本/code；真实点击 APK版本信息，Android 原生对话框 accessibility text 核对构建注入 name 和 UTC 时间，并截图。 |
| 象限/菜单 | 实际点击放大；Android Back 返回四象限；真实三点点击，核对原 9 项和新增子任务/备注/提醒/复盘快捷项。 |
| 全局边缘导航 | 四象限、便签、番茄钟、项目、工作事项、模板、实例、分析、设置、同步和优化意见 11 页真实左边缘右滑；Back 仅关闭抽屉。 |
| 导航冲突 | 实际菜单点击切页、遮罩点击、左滑关闭；垂直滑动不打开抽屉或触发拖动。 |
| 长按/移动 | 明确选择手动顺序，确认原默认 3000ms，再按设置值+200ms 注入长按；同象限排序和跨象限移动；全部嵌套原字段比较，仅允许目标象限/order 改动。 |
| 自动完成/草稿 | 标签/项目/地点候选实际选择、项目 ID 断言、标签键盘选择；实际导航切页恢复未保存任务草稿。 |
| Activity 重建 | 重建实际 MainActivity，对比任务原值、象限、order 和可见 DOM 顺序。 |
| 原生计时 | 真实点击番茄钟页面的独立原生体验按钮，经 preview bridge 打开 Activity；原生按钮 start/pause/resume；暂停时间不增长；离开计时页仍增长，AtomicFile 重新打开保留状态；真实 61 秒后台经过后，pending completion 重新打开仍只消费一次、计数只增一次。 |

报告保存 total/passed/failed 和每项名称/耗时/原始异常栈，不只输出比例。失败逐项保存 `.failure.log` 和截图；`verify-native-report.mjs` 核对全部必测项、唯一名称、源码身份与计数，并将实际 APK 内的 run ID、attempt、HTML SHA-256、版本和 UTC 构建时间逐项对照当前 Actions 环境及 `platform-build-identity.json`，不能由当前环境给旧 APK 报告补身份。安装前核验交付包 SHA-256。`am instrument` 退出码不是成功依据。runner 同时保存安装日志、emulator 属性/尺寸、原始 instrumentation/logcat 与独立 app files 证据，未生成报告立即失败。

静态审核修订：测试重新启动 `MainActivity` 使用独立 preview task 的 NEW_TASK/CLEAR_TASK，避免后台返回时复用已有 Activity 导致 `startActivitySync` 等待不到新实例；此操作只重建合成 UI 的任务栈，不清除 app data。实际原生番茄入口测试使用 `ActivityMonitor` 并核验页面按钮调用链，不通过直接 Intent 绕过页面入口。两项运行结果仍等待云端证据。

截图包含原 PNG 和最长边 960px JPEG 缩略图，原件不覆盖。JVM report 单独报告一个原始模型 suite 及原输出断言总数；编译失败时记录 unrun，不能写成通过。Web/Windows 浏览器交互、JVM 模型和 Android 原生输入证据分别计数。

## 仍须保留的 BLOCKER

- BLOCKER：Android 真机单手操作、软键盘/IME、边缘系统手势、长列表自动滚动、无障碍、后台 service/通知/锁屏/进程终止尚需原平台证据，emulator 操作不替代这些条件。
- BLOCKER：此 Windows launcher 不是正式 Win32 UI 集成；原 Win32 菜单、象限、midpoint 排序、存储调用/事务和窗口重建必须保留并单独做原生回归。
- BLOCKER：优化意见图片原始字节/独立 Android 反馈数据库、生产提醒调度及同步中心真实业务接入，不由 synthetic UI 完成。不得直接读写底层同步数据库来展示效果。
- UNVERIFIED：原 C0-04 跨端协议工作流与 D1/D2 回归须继续作为独立基线运行；新 UI tests 不替换或删除它们。当前经验包构建不修改 ACK/outbox/cursor/manifest/batch 或启用远端连接。
- OWNER DECISION：生产统一 timer/view adapter、正式 Win32 UI 接入和原生测试设备范围，需负责人在兼容方案及原生证据齐全后统一审核。
- BLOCKER：Android issue #1 持续保持开放；此候选没有关闭、绕过或宣称它已解决。

只有云端输出足够时，阶段报告才能把对应隔离条目标为 FACT（tested）。以上生产、真实设备及正式三端接入缺口保留；不得把本候选称为 D4-03 全部生产能力完成。
