# 2026-11-23 原版本云端基线执行记录

日期及时区：2026-11-23，Asia/Shanghai。**文档修订及CI已独立提交；原版本四个GitHub Actions job实际显示Success。本轮逐项收据、原生退出码与四payload重算哈希已完成核对并纯文本归档；阶段0整体仍未通过，C0共同向量及兼容性前置任务未完成。** 本文不将mock、历史测试、Java计时模型或unsigned编译写成跨端协议/产品验收通过。

## 1. 源码、提交与运行身份

| 项目 | 本轮实际身份 |
|---|---|
| 仓库及业务分支 | johny751/MyTodo，master；未修改默认main |
| 提交前HEAD | `5480c88c806cf1c366ec998b0ba627543d63233a` |
| 提交前Git状态 | Codespaces实际执行status；master跟踪origin/master，staged/unstaged/untracked均无项 |
| 文档/规范独立提交 | [`4c2edfc833d2c14146c9f9cdd3bf9c9b51de1f31`](https://github.com/johny751/MyTodo/commit/4c2edfc833d2c14146c9f9cdd3bf9c9b51de1f31) |
| CI独立提交及三端冻结源码SHA | [`06a269b965c0c92c0e818effba5546986dd3242d`](https://github.com/johny751/MyTodo/commit/06a269b965c0c92c0e818effba5546986dd3242d) |
| Actions run | [45101481375](https://github.com/johny751/MyTodo/actions/runs/45101481375)，attempt 1，push事件 |
| 触发/开始时间 | API：2026-11-23T02:39:45Z，即2026-11-23 10:39:45 GMT+8 |
| 最终API更新时间 | 2026-11-23T02:41:14Z，即10:41:14 GMT+8；原字段为updated_at，不冒充其他进程的完成时间 |
| 总时长及状态 | GitHub页面：89秒，Success |
| 项目构建/测试/打包位置 | GitHub Windows托管runner；本机未执行项目构建/测试或建立SDK/Gradle依赖缓存 |

本次只增量提交文档与CI定义/执行器，原Windows C、JavaScript、Android Java业务代码及数据库/同步协议没有修改。源文件差异、提交前后状态和提交命令日志由云端提交证据保存。审计ZIP身份与本轮实际构建SHA分别记录，不能把ZIP注释当作当前运行身份。

## 2. 实际执行方法与job结果

| Job | 本轮方法 | GitHub实际job状态 | Job时长 |
|---|---|---|---|
| Freeze source SHA | 一次解析源码ref、校验完整SHA及干净状态；三端再检出/校验相同SHA | Success | 15秒 |
| Windows native build and self-tests | 原 `scripts/build-windows.mjs --public-release`；原 `--self-test`、`--advanced-test`、`--feedback-test`；每项独立RUNNER_TEMP数据目录 | Success | 66秒 |
| Web and shared JavaScript tests | 原DPAPI helper构建；显式枚举现有 `tests/*.test.mjs` 并以TAP执行；生成Web源码包 | Success | 60秒 |
| Android unsigned build and Java tests | 三个原Java runner；复用原手动aapt2/javac17/D8/zipalign链至唯一签名边界前；生成unsigned APK并核对manifest | Success | 69秒 |

job状态来自本轮GitHub运行页面/API。下表测试计数来自本run下载的原stdout/TAP收据，四份payload已在GitHub Codespaces重算哈希并核对；不以绿色job图标替代明细，也不填写历史README的测试数字。逐项原生进程退出码与PowerShell内部校验结果保留各自execution类型。

## 3. 环境、逐项退出码与测试明细

以下计数由根Agent实际读取本run的原stdout/TAP收据：

| 项目 | 本轮实际计数/结果 | 证据性质 |
|---|---|---|
| Windows self-test | checks 32，failures 0 | 原C自测stdout |
| Windows advanced-test | checks 48，failures 0；另报告detailKeyChecks 48、detailKeyFailures 0 | 原C高级/详情自测stdout；两个指标保留原义，不相加为总数 |
| Windows feedback-test | checks 21，failures 0 | 原C意见自测stdout |
| Web/共享JavaScript | tests/pass 121，fail/cancelled/skipped/todo 0 | 本轮TAP汇总收据；完整计数及逐文件清单归档 |
| Android PomodoroClock | 73 assertions passed | 原Java runner stdout |
| Android DailyTaskPolicy | 47 assertions passed | 原Java runner stdout |
| Android NotificationTimerControls | 20 assertions passed | 原Java runner stdout |
| Android unsigned包身份 | local.gxtodo.replica，versionName 0.9.2、versionCode 15，unsigned | 本轮aapt badging与构建manifest收据 |

### 3.1 本轮runner和预装工具

三个平台收据均记录Windows/X64、imageOS `win25-vs2026`、imageVersion `20261116.315.1`。Windows runner为 `GitHub Actions 1000000009`，Web为 `GitHub Actions 1000000010`，Android为 `GitHub Actions 1000000008`。工具路径及实际版本完整保存在各平台run-receipt.json，不用本机探针替补。

| 工具 | 本轮实际记录 |
|---|---|
| 项目Node | `C:/Program Files/nodejs/node.exe`，`v22.23.5`，三平台相同 |
| Git | `C:/Program Files/Git/bin/git.exe`，`2.56.1.windows.1` |
| MSVC cl | Visual Studio 18 Enterprise预装路径，`VC/Tools/MSVC/14.52.37025/bin/Hostx64/x64/cl.exe`，版本 `14.52.37025` |
| Windows SDK及rc | `C:/Program Files (x86)/Windows Kits/10`，版本 `10.0.26100.0`，x64 rc同版本 |
| vswhere | `3.1.7.39155` |
| Java/javac/jar | Temurin JDK `17.0.21+9`，工具缓存路径 `C:/hostedtoolcache/windows/Java_Temurin-Hotspot_jdk/17.0.21-9/x64/bin` |
| Android SDK | `C:/Android/android-sdk`，build-tools `35.0.0`及API34 `android.jar` |
| aapt | `Android Asset Packaging Tool, v0.2-11948202` |
| aapt2 | 原stderr实际输出 `Android Asset Packaging Tool (aapt) 2.19-11948202`；收据工具表原值为 `not reported by installed file`，保留原收据并引用原stderr补充，不静默改证据 |
| D8 | `D8 8.6.2-dev`，完整build字符串见Android收据 |

aapt2的补充版本证据为 [aapt2-version.stderr.log](evidence/cloud-baseline/45101481375/platforms/android/aapt2-version.stderr.log)。第一方action被GitHub强制使用的Node24与这里实际项目Node22.23.5是不同执行层，分别记录。

### 3.2 关键原生进程退出码与时间

以下日期均为2026-11-23，时间从原收据UTC字段转换为Asia/Shanghai（+08:00），保留毫秒。所有列出的case均为 `execution=native-process`；命令exe、完整arguments、超时设定和stderr对应文件保存在各平台case-results.json。没有将PowerShell函数返回值冒充原生进程退出码。

| 平台/case | 开始（+08:00） | 结束（+08:00） | 原生退出码/状态 | 原stdout日志 |
|---|---|---|---|---|
| Windows/windows-build | 10:40:25.812 | 10:41:01.576 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/windows/windows-build.stdout.log) |
| Windows/windows-self-test | 10:41:01.625 | 10:41:01.688 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/windows/windows-self-test.stdout.log) |
| Windows/windows-advanced-test | 10:41:01.694 | 10:41:03.136 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/windows/windows-advanced-test.stdout.log) |
| Windows/windows-feedback-test | 10:41:03.171 | 10:41:03.216 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/windows/windows-feedback-test.stdout.log) |
| Web/helper-build | 10:40:27.538 | 10:40:34.126 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/web/helper-build.stdout.log) |
| Web/shared-js-tests | 10:40:34.180 | 10:40:56.061 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/web/shared-js-tests.stdout.log) |
| Android/android-pomodoro-tests | 10:40:32.873 | 10:40:37.259 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/android/android-pomodoro-tests.stdout.log) |
| Android/android-daily-tests | 10:40:37.264 | 10:40:39.271 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/android/android-daily-tests.stdout.log) |
| Android/android-notification-controls-tests | 10:40:39.278 | 10:40:40.896 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/android/android-notification-controls-tests.stdout.log) |
| Android/android-build | 10:40:40.934 | 10:41:04.150 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/android/android-build.stdout.log) |
| Android/android-badging | 10:41:04.181 | 10:41:04.239 | 0 / passed | [stdout](evidence/cloud-baseline/45101481375/platforms/android/android-badging.stdout.log) |

全量收据：[Windows cases](evidence/cloud-baseline/45101481375/platforms/windows/case-results.json)、[Web cases](evidence/cloud-baseline/45101481375/platforms/web/case-results.json)、[Android cases](evidence/cloud-baseline/45101481375/platforms/android/case-results.json)。Web实际执行17个文件，完整清单为 [test-files.json](evidence/cloud-baseline/45101481375/platforms/web/test-files.json)。本轮原TAP末尾另外明确报告pass 121、cancelled 0、todo 0。

Windows三个CLI测试各用独立的 `D:/a/_temp/mytodo-phase0-windows-{case}-{GUID}` 数据目录；准确路径列于case的dataDirectory。Java计时/每日/通知控制测试使用原JDK runner夹具，未在Android设备或模拟器上调用ReplicaDatabase/AccountStore。共享同步场景使用已有loopback/mock夹具，不能当作真实坚果云收发或C/JS/Java共同协议向量。

source-verify、source-inputs、tool-preflight，以及Web helper-test-copy/shared-test-summary/web-package、Android adapter/manifest-check在收据中均为 `execution=powershell-validation-or-packaging`、exitCode 0；这些表示本次内部校验/打包完成，单独保留，不计成原生应用测试。源码冻结的git HEAD/status原生退出码分别为0/0，source-resolution收据记录同一完整SHA和success。

Windows C/JS/Android Java共同协议向量、Android真实SQLite生产桥、真机及真实坚果云/LAN均不属于本次通过范围。

## 4. 本轮产物与SHA256

本run/attempt的以下payload在GitHub Codespaces下载后重新计算SHA256，字节数/hash均与本轮receipt匹配，producedThisRun已核对；不从历史dist替补。下列为实际payload文件的hash，不是外层GitHub artifact ZIP封装的digest。

| Payload | 字节数 | 重算SHA256（与本轮收据匹配） |
|---|---:|---|
| MyTodo-phase0.exe | 1,320,448 | `4ffe46f52f68de49d04beb059d6b36e635c863b0ec501ea9565d828beecd32b5` |
| WebCredentialHelper.exe | 148,992 | `6e7bb1df5ccf21c92ab3ec0b1973f58efb2ee9224733f9403b72d5994120818d` |
| MyTodo-web-source.zip | 98,428 | `8ea45445a7ab9bcf6b65fb295e1f88ae958524037f9991e011502b7b21ee8dc0` |
| MyTodo-unsigned.apk | 278,600 | `4f29d64f3920673cb81c8f309859691190629c378d38e50eb8ba8055e453ed69` |

四份payload的sourceSha均为 `06a269b965c0c92c0e818effba5546986dd3242d`。二进制产物保留在GitHub；本机只接收必要纯文本证据，不下载SDK或编译缓存。

GitHub产物保留期为14天；本轮日志、收据及摘要已经另作纯文本归档，见第7节。unsigned APK只证明编译/打包，未签名、未安装，也不是覆盖升级的正式APK。Web源码包不包含Node运行时/DPAPI helper，不是既有完整便携发布包或GitHub Pages完整应用。APK内Git/编译时间/版本历史UI并非本次CI实现，构建收据时间不能冒充包内已显示这些版本信息。

## 5. 真实失败与警告

1. 早期GitHub插件404、浏览器输入故障及程序异常阻碍了提交。本轮使用恢复后的Codex内置浏览器完成GitHub登录、上传和Codespaces操作；中断的长文本输入未被算作传输/提交成功。
2. 首次云端Python `rename` 从 `/workspaces` 到 `/tmp` 报跨文件系统 `EXDEV`，提交脚本尚未执行。仅更改任务临时上传包的跨文件系统移动方式，重新验证包哈希后继续；没有修改业务代码或清理用户数据。
3. 文档和CI提交/推送成功后，`gh run list --workflow phase0-baseline.yml` 在默认main查找定义而返回HTTP404、实际退出1。随后按run ID的API查询取得真实成功运行。查询失败日志保留，不改写为初次成功。
4. GitHub显示4条固定第一方action的Node20弃用警告，平台强制改用Node24。本次各job没有因此失败；后续相容action版本升级仍需独立审阅和云端回归。

根Agent已实际取得Actions原始日志及4份artifact，原始Actions日志获取与artifact下载命令的退出码均为0。云端证据collector实际成功，重新核对每份payload与原收据后生成纯文本包；本机仅下载该纯文本包并核对archive哈希。准确路径、字节数与hash见第7节；这些证据处理命令不是追加项目测试。

## 6. 未完成项目与开发门槛

- C0-03：Windows C、共享JS、Android Java实际SQLite/生产存储适配共同协议向量尚未实施/执行。
- C0云端触发入口：当前工作流push路径只覆盖CI定义/执行器；在业务/测试小步提交前需配置相关路径或验证其他运行入口，不能假设源码push或空main的dispatch已可用。
- C0-04：事件排序、输入校验及整数边界兼容修复尚未实施。
- C0-05：合成C/Node凭据双向互读及修复尚未实施。
- C0-06：旧WebDAV迁移/fence中断恢复C/JS一致性测试尚未实施。
- C0-07：C数据库错误传播与故障注入尚未实施。
- D1：明确列名写入、一致备份、编号迁移登记、事务及恢复尚未开始；必须先完成上述兼容门槛，再依09小步执行。
- T01–T16：全部产品验收未执行，见11；本次没有宣布阶段0整体通过，没有开始大规模工作台、工作流或双通道业务开发。

首版优先Windows/Android；正式Web保留并参与共享业务与同步回归，全量Web界面重构暂不作为同等优先级目标。双通道按目标独立投递/确认及本机持久可重发载荷已写入07规范，本轮尚未实现投递账本，不以现有outbox ACK充当完成。

## 7. 原始证据归档索引

已实际展开的相对目录为 `evidence/cloud-baseline/45101481375/`。证据包在授权GitHub Codespaces生成，本机只接收235个纯文本文件，不包含EXE/APK/业务数据库/签名或SDK缓存。原证据文件保留字节，收据的字段未因文档补充而被改写。

- [summary.json](evidence/cloud-baseline/45101481375/summary.json)：API运行/作业、source与workflow SHA、runner工具、全case、四payload重算结果、提交命令及未完成范围。
- [actions-full.log](evidence/cloud-baseline/45101481375/actions-full.log)：172,522字节，SHA256 `5395d11543314bacafd2f655d18f83806e391c73e82b381c1d6a12cf16d426c5`。
- [text-manifest.sha256](evidence/cloud-baseline/45101481375/text-manifest.sha256)：纯文本文件清单与原字节hash。
- [源码冻结收据](evidence/cloud-baseline/45101481375/source-resolution/source-resolution.json)：冻结SHA、HEAD/status退出码、checkout/resolve结果。
- [Windows收据](evidence/cloud-baseline/45101481375/platforms/windows/run-receipt.json)、[Web收据](evidence/cloud-baseline/45101481375/platforms/web/run-receipt.json)、[Android收据](evidence/cloud-baseline/45101481375/platforms/android/run-receipt.json)：逐项stdout/stderr、真实execution/exit、产物和时间；各目录有case-results.json。
- [提交命令与真实退出码](evidence/cloud-baseline/45101481375/submission/command-results.tsv)、[提交差异文件清单](evidence/cloud-baseline/45101481375/submission/submitted-files.stdout.log)、[提交后Git状态](evidence/cloud-baseline/45101481375/submission/final-status.stdout.log)：仅15项升级文档/源码清单证据与2项CI文件发生变化，提交后master干净。
- [原工作流名称查询失败日志](evidence/cloud-baseline/45101481375/submission/actions-runs.stderr.log)：HTTP404与实际退出1；[后续run API记录](evidence/cloud-baseline/45101481375/run-final.json)确认本run completed/success。

本地交付的 `outputs/evidence-text-45101481375.zip` 为126,640字节，SHA256 `d215fd1d814cedf34a209799aef6cb2d782266ea6fb54438e56ceaf42fbf48b2`，下载后已与云端archive收据匹配。外层archive hash、内层纯文本文件hash、四个编译payload hash分别记录，不混用。正式二进制仍在本run的四份GitHub Artifacts中；长期纯文本证据由本次补录保存，Git补录提交号由主Agent单独记录。
