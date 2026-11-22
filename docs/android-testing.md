# 在独立 Android 模拟器中测试：供其他 IDE / AI 编程工具复用

适用版本：当前 Android 0.9.1。更新日期：2026-11-01（Asia/Shanghai）。本流程只依赖本地 Node.js、Android SDK 和 ADB，不依赖 Codex、Android Studio 的界面或专有插件。VS Code、Cursor、其他 IDE 的终端及能执行命令的代理均可使用。

## 模拟器验证是否等同于手机操作

这里运行的是 Android 14 系统，安装的是交付的真实 APK。通过 ADB 输入触摸、返回键和文字，WebView 前端调用真实 Java 桥接代码、应用私有 SQLite、账号存储及系统组件。它可以检验“操作 → 保存 → 强制停止 → 重开 → 界面和数据库一致”，不是只在电脑浏览器里切成手机尺寸。

最近的 0.9.1 交付已在专用 Android 14 模拟器上验证同签名覆盖升级、任务搜索与关联、通知栏暂停/继续、暂停后进程重启恢复，以及带关联标题的倒计时完成提醒；详情见 [当前使用说明](android-focus-091-20261101/使用说明.md)和[0.9.1 验证记录](android-focus-091-20261101/validation.json)。此前 0.7.0 → 0.8.0 的账号隔离、嵌套任务迁移、SQLite 完整性及 5,000 条合成任务读取记录属于历史验证。六设备同步由独立 SQLite 客户端和模拟 WebDAV 验证，不等同于六台实体手机实测。

| 可以验证 | 仍需真机验证 |
| --- | --- |
| APK 安装、签名兼容、业务流程、返回键、键盘、重启持久化 | 不同品牌手机的后台限制、真实电池耗电 |
| Java / WebView / SQLite 集成、权限界面、账号切换 | ARM 硬件性能、低内存回收、温升、不同 WebView 版本 |
| 合成网络中断、应用退出、恢复后接续 | 移动网络切换、厂商省电策略下的提醒送达 |
| 截图、可访问性结构、数据库及日志证据 | 六台实际设备的长期并用与真实云服务兼容性 |

无窗口模式只是不显示模拟器窗口，里面仍在运行完整 Android。用截图观察界面，用 UIAutomator 读取控件名称和位置，再点击并核对结果。需要手动触控时，可在启动命令中去掉 -no-window；不要同时启动同一 AVD 的第二个实例。

## 1. 环境与隔离

需要 Node.js 22.13+、JDK、Android SDK Platform 34、Build Tools 35.0.0、Platform Tools、Android Emulator，以及 Android 34 Google APIs x86_64 镜像。最近的 0.9.0 / 0.9.1 验证使用本机 emulator_342.bak 中的模拟器（实际 QEMU 34.2.15），启动时禁用 Vulkan。此前使用过的 36.1.9 在 WebView 输入场景发生宿主访问冲突；该历史配置不再作为本机推荐。其他电脑需验证自己的模拟器与镜像组合。

本轮本机路径供参考；其他电脑按实际路径替换：

| 项目 | 本机路径 / 标识 |
| --- | --- |
| 项目 | C:/Users/adwoo/Documents/ChatGPT/REA复刻项目 |
| SDK | C:/ProgramFolder/IDE/android-sdk-windows |
| 可工作的模拟器程序 | C:/ProgramFolder/IDE/android-sdk-windows/emulator_342.bak/emulator.exe |
| AVD_HOME | M:/dev/gxtodo-android-emulator |
| 专用 AVD / ADB serial | GxTodo_QA / emulator-5580 |
| 包名 | local.gxtodo.replica |

每条设备命令都必须带 -s 指定设备。先用 adb devices -l 盘点；不能因为某台设备排在第一位就直接操作。这个项目的 emulator-5554 是用户已有设备，测试工具会拒绝它。不要运行 adb kill-server、全局杀模拟器进程、卸载应用或清除数据；升级测试要保留旧数据。

专用模拟器里的 APK 数据与真机、正式网页数据分离。网页联测另外使用端口 4180 和全新 GXTODO_DATA_DIR；正式端口 4173 及正式数据目录保持独立。云联测使用 GxTodo-QA-日期-随机值 一类的新目录和合成任务，不能填正式业务目录。

## 2. 创建与启动专用 AVD

以下是 Windows PowerShell 示例，在项目根目录执行。节点、SDK 与 JDK 应能由此终端访问；node -v 应达到上述版本。

~~~powershell
$env:ANDROID_HOME = 'C:/Your/Android/Sdk'
$env:JAVA_HOME = 'C:/Your/Jdk'
$qaHome = Join-Path $env:LOCALAPPDATA 'GxTodo-QA-avd'
New-Item -ItemType Directory -Force -Path $qaHome | Out-Null
$env:ANDROID_AVD_HOME = $qaHome
& "$env:ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat" 'platform-tools' 'emulator' 'platforms;android-34' 'build-tools;35.0.0' 'system-images;android-34;google_apis;x86_64'
'no' | & "$env:ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat" create avd -n GxTodo_QA -k 'system-images;android-34;google_apis;x86_64' -p "$qaHome/GxTodo_QA.avd"
node scripts/android-qa.mjs start --avd-home "$qaHome" --vulkan off
~~~

SDK 许可需依本机安装流程接受。已创建 AVD 时跳过创建步骤，不加覆盖参数。脚本 start 不会创建或重置 AVD。

本机已有 AVD 的启动方式如下；保持此终端运行，从第二个终端继续测试：

~~~powershell
$env:ANDROID_HOME = 'C:/ProgramFolder/IDE/android-sdk-windows'
node scripts/android-qa.mjs start --avd-home 'M:/dev/gxtodo-android-emulator' --emulator 'C:/ProgramFolder/IDE/android-sdk-windows/emulator_342.bak/emulator.exe' --vulkan off
~~~

脚本默认 2 GiB 内存、2 个 CPU、无窗口、无音频、软件图形渲染，不使用启动快照。上述命令使用最近实测的 --vulkan off 配置；记录模拟器版本与启动参数以便复测，不同时启动同一 AVD。首次冷启动需要等待。第二个终端也设置 ANDROID_HOME，然后运行：

~~~powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" devices -l
node scripts/android-qa.mjs doctor
~~~

应看到 GxTodo_QA、Android 14、启动完成 1。脚本的默认设备是 emulator-5580；若改端口，start 同时传 --port 和 --serial，后续所有命令传相同 --serial 和 --avd。

start 会一直保留父进程，避免短命 IDE 工具进程退出时模拟器也被清理。若 IDE 自带的命令工具会终止子进程，应使用持久终端。等测试结束，再从另一个终端执行 stop。

## 3. 构建、升级安装

~~~powershell
node --version
npm test
npm run build:android
node scripts/android-qa.mjs install
node scripts/android-qa.mjs doctor
~~~

install 默认读取 package.json 中的版本，当前对应 dist/gxtodo-local-0.9.1.apk；需要指定其他候选包时使用 --apk <路径>。已有交付 APK 时，可跳过构建直接安装。构建脚本是 scripts/build-android.mjs；可用 ANDROID_HOME、JAVA_HOME、GXTODO_ANDROID_BUILD_DIR 指定 SDK、JDK、构建及签名目录。当前构建脚本针对 Windows 工具路径；其他系统测试现成 APK 可使用跨平台 android-qa.mjs，源码构建则需适配构建脚本。

正式升级必须保留同一签名目录中的 local-development.p12 和 signing.json。其他电脑首次生成的新签名不能覆盖当前已安装包；出现 INSTALL_FAILED_UPDATE_INCOMPATIBLE 时应检查签名，不要为了“让安装成功”就卸载丢数据。签名密码文件不能放进源码仓库。

install 实际执行 adb -s emulator-5580 install -r，然后启动真实 Activity。当前交付包预期 versionCode=14、versionName=0.9.1；后续版本按构建元数据核对。仅看到安装 Success 不能算功能通过。

## 4. 观察界面并操作

每次 capture 使用一个新证据目录，脚本拒绝覆盖已存在目录：

~~~powershell
node scripts/android-qa.mjs capture --out 'qa-evidence/01-start'
node scripts/android-qa.mjs tap --label '打开主菜单'
node scripts/android-qa.mjs capture --out 'qa-evidence/02-menu'
~~~

输出包含 screen.png、ui.xml、capture.json 和 meminfo.txt。先打开 PNG 观察，再读 XML 获取完整 text 或 content-desc。任务的标签可能是“编辑任务：QA-task”，并非单独任务标题。tap 仅接受当前结构中唯一匹配且在屏幕内有有效 bounds 的标签；不存在或重复时停止，让操作者重新观察。

底层等价命令如下，x/y 必须根据当前 XML 的 bounds 中心计算，不能照抄另一台设备的坐标：

~~~powershell
$adb = "$env:ANDROID_HOME/platform-tools/adb.exe"
& $adb -s emulator-5580 shell uiautomator dump /sdcard/gxtodo-qa-ui.xml
& $adb -s emulator-5580 exec-out cat /sdcard/gxtodo-qa-ui.xml
& $adb -s emulator-5580 shell input tap 300 400
& $adb -s emulator-5580 shell input text QA-task
& $adb -s emulator-5580 shell input keyevent 66
& $adb -s emulator-5580 shell input keyevent 4
~~~

input text 示例用于普通 ASCII 合成任务；中文输入使用模拟器键盘/输入法。不要用命令参数输入同步密码，也不要在同步设置页采集包含凭据的截图。capture 不自动采集日志或私有配置。

启动后 WebView 可能已出现但业务节点尚未就绪，不能把首份空结构判断为页面坏了。工具会有限重试，直到出现文字控件。点击结果也需重新采集并核对，ADB 命令成功只代表输入已发送。可访问性结构有时仍包含被弹窗遮住的背景任务；先看截图并关闭当前弹窗，再操作任务。返回键可能逐层回到“设置”而不是直接回首页。

截图必须按二进制保存；Windows PowerShell 旧版本用 > 重定向 PNG 可能损坏字节。capture 通过 Node Buffer 保存，避免这个问题。窄屏首页首次点击任务可能先放大象限，再点一次才进入详情，这是预期交互。

## 5. 必做业务回归

使用独立账号和容易辨认的合成任务，依序操作并保存前后证据：

1. 升级前建立任务、两条子任务和便签；用相同签名覆盖安装新版，确认全部保留。
2. 编辑父任务标题及一个子任务，关闭详情保存；执行下面的 restart，确认修改仍在。
3. A、B 两个账号各建不同任务，反复切换，确认不会串数据；切换前的草稿应已保存。
4. 删除/完成/撤销、返回逐层保存、多行子任务输入、点击添加与独立保存，分别检查界面结果。
5. 从系统文件选择器导入合成大数据，检查记录数、滑动与搜索，再重启核对。不要直接覆盖已初始化的 tasks.sqlite。
6. 同步开启后增加/修改任务，切后台，再回前台，检查接续与冲突入口。真实 WebDAV 需要单独联网验收。
7. 在 Android 工具中搜索并关联当前账号的任务或子任务，检查取消关联、重置保留关联及账号切换后的所属账号显示。
8. 检查倒计时/正计时、紧凑/展开/简洁通知的暂停与继续、暂停后重启恢复，以及完成提醒中的任务标题。另验证悬浮球授权、拖动收边、首次点小圆点只展开、自定义菜单和应用排除规则。

~~~powershell
node scripts/android-qa.mjs restart
node scripts/android-qa.mjs capture --out 'qa-evidence/03-after-restart'
~~~

restart 会 force-stop 当前专用设备上的本包并重新打开。它检验数据库持久化；“强行停止”与普通切后台不是相同场景，不可用此结果推断后台提醒的正常行为。

## 6. 只读检查 SQLite 与日志

本轮 Google APIs 调试镜像允许 adb root，普通实体手机/Google Play 生产镜像通常不允许。本应用 APK 不是 debuggable，不能假设 run-as 一定可用，也不需要对真机 root。

~~~powershell
$adb = "$env:ANDROID_HOME/platform-tools/adb.exe"
& $adb -s emulator-5580 root
node scripts/android-qa.mjs database --account default
node scripts/android-qa.mjs database --account account-b
~~~

命令使用 sqlite3 -readonly、PRAGMA query_only=ON、PRAGMA integrity_check，显示每类记录总数/未删除数及发件箱数量，不修改业务数据。账号 A 的实际 ID 是 default；新账号 ID 可从此专用模拟器的 /data/user/0/local.gxtodo.replica/files/accounts.json 读取，不是显示名称。

账号 A 数据库：/data/user/0/local.gxtodo.replica/files/tasks.sqlite。
其他账号：/data/user/0/local.gxtodo.replica/files/accounts/账号ID/tasks.sqlite。
entities 保存按记录的数据、并发版本与删除标记，outbox 是待确认上传的事件，meta 保存设备身份、进度和事务版本。离线账号存在 outbox 是正常现象；界面默认只显示未完成/日期范围内任务，也不应直接与全表数量比较。

需要查崩溃时只筛选本应用进程：

~~~powershell
$appPid = (& $adb -s emulator-5580 shell pidof local.gxtodo.replica).Trim()
& $adb -s emulator-5580 logcat -d --pid=$appPid -t 300
& $adb -s emulator-5580 shell dumpsys meminfo --local local.gxtodo.replica
~~~

若应用已崩溃且没有 PID，再人工检查 crash 缓冲区中本包的堆栈。日志可能含任务内容，分享前检查。不要打印同步加密配置、系统环境变量或密码。

应用运行时 SQLite WAL 可能包含最新事务，不要只复制 tasks.sqlite 就认为得到了完整备份。全目录备份先停止应用/网页服务，保存账号目录的数据库及其 sidecar 文件；新设备通过应用同步加入，不复制活动设备的标识和同步进度。

## 7. 六端同步与真实坚果云验收

npm test 中的 tests/delta-sync.test.mjs 创建六个独立本地 SQLite 数据库，运行六端交错提交、清单条件写竞争、断网重试、缺失批次、删除冲突、快照及重放测试。每个客户端拥有独立设备标识。这证明协议在所模拟故障下能收敛，不证明真实服务的 ETag、配额或限速行为。

真实服务使用专门的 GxTodo-QA-* 目录。通过应用设置填登录邮箱和应用密码；测试报告只写配置完成/失败，不记录密码。建议执行以下顺序：

1. 六个独立客户端各创建一条独有任务，在同一检查周期内交错同步。
2. 反复接续，直到每台没有待发送事件、已读到当前清单全部来源进度；每台应能看见六条任务。
3. 两台在未收到对方修改前分别改同字段，第三台改另一个字段；验证不同字段都在，同字段有两个可选版本；解决后所有端一致。
4. 一台离线修改、另一台删除，然后恢复联网；确认不会静默复活或吞掉冲突。
5. 上传中断后重启，验证持久发件箱接续。完成后空闲检查应仅请求清单，条件 GET 可返回 304。
6. 新设备从快照加入，再接收后续变化；保留新设备自己的未上传内容。
7. 记录实际 HTTP 状态、批次数、压缩流量、耗时及最终内容一致性；不只看“同步成功”提示。

2026-10-19 的 0.8.0 历史验收中，模拟测试和真实坚果云六客户端联调均已完成。实际服务在父目录不存在时返回 409；程序先建集合，再重读清单，已补充回归测试。原始结果见 [webdav-v080.json](webdav-v080.json)。真实 Android APK 另外完成本地新增保留、云端接收、界面修改上传、六端接收与桌面反向更新；最终 21 条业务记录逐条一致，重启后仍保留，结果见 [android-webdav-v080.json](android-webdav-v080.json)。本轮未完成六台实体设备长期实测。


### 可复用的真实 WebDAV 六客户端脚本

scripts/verify-webdav.mjs 使用与应用相同的 SQLite、增量协议和 WebDAV 适配器。它创建六个独立客户端，验证交错新增/修改、同字段冲突、删除与离线编辑、显式解决、新客户端快照及 304 空闲检查。另有一个新数据库用于快照加入验证。测试全局约每 2.3 秒发起一个请求，避免测试产生密集流量；完整过程需要数分钟，progress 输出表示阶段结果。

必须使用新的测试目录和以 GxTodo-QA- 开头的新云目录。密码从标准输入读取，命令参数中不接收密码。Windows 示例：

~~~powershell
$qaLogin = Read-Host '坚果云登录邮箱'
$qaPassword = Read-Host '第三方应用密码' -AsSecureString
$qaStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$qaOutput = Join-Path $env:LOCALAPPDATA "GxTodo-WebDAV-QA-$qaStamp"
$qaPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($qaPassword)
try {
  @{username=$qaLogin; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($qaPointer); folder="GxTodo-QA-$qaStamp"} |
    ConvertTo-Json -Compress |
    node scripts/verify-webdav.mjs --data-dir "$qaOutput"
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($qaPointer)
  Remove-Variable qaPassword, qaPointer -ErrorAction SilentlyContinue
}
~~~

终端不要启用输入回显或全量管道调试。配置使用应用自身的本机加密存储；result.json 只记录测试云目录、合成数据数量、HTTP 状态、时间、字节数和校验结果，不写密码。成功要求 status 为 passed 且 checks 通过。失败时先看 error 和保留的发件箱，不手工推进游标。脚本不会清理云端文件；测试完成后可在坚果云中删除这次专用 GxTodo-QA-* 目录，避免和正式数据混淆。

这份程序只运行桌面 Node 客户端。Android 必须另外安装真实 APK、创建空白测试账号、通过界面配置同一测试目录并执行收发，才能报告原生 Android 通道已通过。不要让 Android 在六客户端自动测试还未结束时写入该目录，否则会改变脚本的固定数量断言。

## 8. 手机耗电、资源与流量验证

自动同步仅前台运行，空闲约 5 分钟检查，编辑后约 15 秒合并上传，后台/离线暂停，失败退避。系统提醒另用 Android 闹钟；同步本身没有常驻服务或同步唤醒闹钟。0.9.0 起的待办状态条、悬浮球和番茄钟使用独立前台服务，应分别测量开启和关闭时的资源与后台行为。后台期间有其他设备更新，手机回前台联网后接续，不能期待后台实时刷新。

在至少一台实际使用的低内存手机和主力手机上，用相同数据规模比较：冷启动/搜索延迟、应用与 WebView 渲染进程合计内存、前台空闲请求次数/字节数、熄屏后同步是否停止、网络恢复后的接续。电池应在相同亮度/网络/充电状态下观察足够时长，对照系统电量统计或 Battery Historian，不能用模拟器的电池百分比估算。

2026-10-19 的历史量化数据和可复现命令见 [Android 0.8.0 性能报告](android-performance-v080.md)。报告对应其注明的 APK 与测试条件，不能直接作为当前 0.9.1 的性能结果。[android-profile.mjs](../scripts/android-profile.mjs) 用活动服务绑定归属 WebView 渲染进程，合计 PSS，读取 CPU 时间和 BPF UID 网络字节。先在专用镜像启用 adb root，再执行：

~~~powershell
node scripts/android-profile.mjs snapshot --out qa-evidence/memory.json
node scripts/android-profile.mjs sample --seconds 60 --label foreground-idle --out qa-evidence/foreground.json
~~~

输出文件必须是新文件。采样过程中不要点击、截图或采集 UI；CLI 需在持久终端运行。采样失败、进程重启或设备掉线必须重测，不能把没有读到的数据当成 0。完整命令、场景条件和 CPU 单核口径见性能报告。

dumpsys meminfo 包名通常只包含应用主进程。此前约 138 MiB 的 PSS 不包括独立 WebView 渲染进程，不等同于应用总内存或实体手机结果。采集内存使用 --local，避免调用 WebView 渲染进程的应用层诊断回调；本轮已出现一次普通 meminfo 触发的诊断崩溃，失败样本已排除。当前前端仍载入完整业务投影；5,000 条的模拟器通过不能推出所有低端机都可流畅使用 100,000 条。

编写其他应用的同步模块，另见 [通用坚果云 / WebDAV 实现指南](webdav-sync-implementation-guide.md)，其中包含事务、条件清单、补齐游标、冲突和长期保留策略。

## 9. 关闭与故障恢复

~~~powershell
node scripts/android-qa.mjs stop
~~~

stop 先核对 emulator-5580 对应 GxTodo_QA，再执行 emu kill。它不卸载 APK、不擦除测试数据、不影响其他设备。启动终端会随专用模拟器退出而结束。

- 设备 offline：先检查专用模拟器日志/启动进度，不重启全局 ADB 服务。
- AVD 锁残留：先确认没有运行该 AVD 的进程，再检查锁文件的完整路径确实在这个专用 AVD 目录；只处理已确认的锁文件，不递归删除 AVD。
- 进程刚启动就退出：检查镜像与模拟器版本、虚拟化、磁盘空间以及 IDE 是否回收了短命父进程。
- APK 启动后 UI 为空：等待业务结构就绪，检查本包崩溃日志与 WebView；不要先清数据。
- 数据库 permission denied：确认专用镜像支持 adb root；不把真机 root 当作验收前提。

## 可直接交给其他 IDE 的任务说明

> 先阅读 docs/android-testing.md。使用 scripts/android-qa.mjs 和专用 GxTodo_QA / emulator-5580；每次操作前确认设备身份，不触碰 emulator-5554。安装真实 APK，通过新鲜 UIAutomator 结构定位并操作，保存关键截图，检查重启后持久化与只读 SQLite 完整性。使用合成账号和独立云目录，凭据不得进日志/代码/命令参数。测试结束关闭专用设备；报告明确区分自动化模拟、模拟器实测、真实云服务和真机实测。不能把构建成功或 adb 输入成功作为业务验收结论。

当前安装与工具功能验收见 [Android 0.9.1 使用说明](android-focus-091-20261101/使用说明.md)。历史同步与性能数据均按原记录的版本和日期解读，不应把旧哈希当成当前安装包。
