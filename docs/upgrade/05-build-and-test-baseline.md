# MyTodo 阶段 0：构建测试基线与早期工具核验

## 当前云端预检

2026-11-23，在授权GitHub Codespaces `/workspaces/MyTodo` 终端实际执行：

```bash
pwd && git status --porcelain=v1 --branch --untracked-files=all && git rev-parse HEAD && command -v gh
```

实际输出工作目录`/workspaces/MyTodo`、`## master...origin/master`且无staged/unstaged/untracked项、提交前HEAD `5480c88c806cf1c366ec998b0ba627543d63233a`、gh `/usr/bin/gh`。程序恢复后又在Codex内置浏览器重复了Git预检，仍为同一HEAD且工作区干净。这些只是Git预检；后续真实Actions结果另列下文及12，不由预检推断通过。

## 本轮GitHub云端原版本基线

文档提交 `4c2edfc833d2c14146c9f9cdd3bf9c9b51de1f31` 与 CI 提交 `06a269b965c0c92c0e818effba5546986dd3242d` 分开推送到 master。CI push 在2026-11-23 10:39 GMT+8触发 [run 45101481375](https://github.com/johny751/MyTodo/actions/runs/45101481375)，attempt 1，总时长89秒。一次冻结源码SHA后，Windows/Web/Android均检出 `06a269b965c0c92c0e818effba5546986dd3242d`；原业务源码未修改。

GitHub实际结果页面/API及本轮收据确认Freeze source SHA、Windows native build and self-tests、Web and shared JavaScript tests、Android unsigned build and Java tests四个job均Success，必需case已执行并通过。Actions原始日志及4份artifact已在GitHub Codespaces取得，原始Actions日志获取与artifact下载命令的实际退出码均为0；四payload重算hash与receipt匹配。逐项原生进程退出码、工具版本、测试计数、产物字节/SHA256及纯文本归档集中记录于 [12 云端基线](12-cloud-baseline-20261123.md)及 [summary.json](evidence/cloud-baseline/45101481375/summary.json)。

本轮三个平台runner均为Windows/X64、imageOS `win25-vs2026`、imageVersion `20261116.315.1`；实际项目Node `v22.23.5`、MSVC `14.52.37025`、Windows SDK `10.0.26100.0`、Temurin JDK `17.0.21+9`、Android build-tools35.0.0/API34。aapt2版本由原stderr确认 `2.19-11948202`，原receipt工具字段未报告版本，保留并按12引用补充。完整路径、probe退出码及精确起止时间见原收据，不用下面早期本机探针版本替补。

所有项目编译、现有测试和打包在GitHub Windows托管runner执行，临时数据位于RUNNER_TEMP。本机没有执行项目构建/测试或创建SDK/Gradle依赖缓存；Codespaces用于提交及纯文本证据归档。本次unsigned APK、Web源码包仍不能作为完整签名/便携发布验收。C0-03三端实际生产存储共同向量、C0-04–07、D1及T01–T16仍未通过，阶段0整体保持未完成。

## 早期本机工具元数据记录

核验日期：2026-11-23，Asia/Shanghai。以下为取得MyTodo源码之前的只读目录/元数据检查与本地工具版本命令。本节只证明当时工具可执行或组件目录存在，不证明项目可以构建、运行或通过测试，也不替代上面的本轮云端证据。

## 实际结果

| 工具 | 实际路径 | 早期工具探针结果 |
|---|---|---|
| Git | `C:/ProgramME/DevTools/Git/cmd/git.exe` | `--version` 输出 `git version 2.56.0.windows.4` |
| Node.js | `C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/bin/node.exe` | `--version` 输出 `v24.22.3` |
| Python | `C:/ProgramME/DevTools/miniconda3/python.exe` | 固定 `-c` 探针输出 `CODEX_PYTHON_PROBE`、`3.14.9` 与预期绝对路径；未调用微软商店执行别名 |
| JDK / javac | `D:/GradleHome/jdks/eclipse_adoptium-17-amd64-windows.2/bin` | `java -version` / `javac -version` 均输出 Temurin `17.0.20.1` |
| Gradle 9.4 | `D:/GradleHome/wrapper/dists/gradle-9.4.0-bin/lcvyxq3t37f6mx9miaydrrgs/gradle-9.4.0/bin/gradle.bat` | `--offline --no-daemon --version` 实际输出 `Gradle 9.4.0`，Launcher JVM `17.0.20.1` |
| Gradle 7.5 | `C:/Users/adwoo/Documents/Codex/2026-10-07/new-chat/outputs/maqiao-android/.gradle/offline-user-home/wrapper/dists/gradle-7.5-local-bin/39pyot8ra6r8so9k1eh0ugty4/gradle-7.5/bin/gradle.bat` | 同一离线版本命令实际输出 `Gradle 7.5` / JVM `17.0.20.1` |
| MinGW GCC 13.1 | `D:/Program/QT/Tools/mingw1310_64/bin/gcc.exe` | `--version` 输出 `13.1.0`、x86_64-posix-seh |
| MinGW GCC 7.3 | `D:/Qt/Qt5.12.0/Tools/mingw730_64/bin/gcc.exe` | `--version` 输出 `7.3.0`、x86_64-posix-seh |
| CMake | `D:/Program/QT/Tools/CMake_64/bin/cmake.exe` | `--version` 输出 `3.30.5` |
| MSVC | PATH 与标准 `Program Files[/ (x86)]/Microsoft Visual Studio` 位置 | 未发现；未穷尽所有磁盘位置，不宣称机器绝对未安装 |

Node 可运行，不等于 npm 或项目 Node 依赖可用。Gradle 分发可运行，不等于 MyTodo 对应 AGP/Gradle/传递依赖已缓存。MinGW 与 CMake 可运行，不等于原 Win32 工程兼容这些工具；必须读取实际构建脚本再选择版本。

## Android SDK 元数据与可执行检查

共享 SDK：`D:/Android/stockfloat-sdk`。

| 组件 | 本地证据 |
|---|---|
| API 34 | `platforms/android-34/source.properties`：revision 3，ExtensionLevel 7；`android.jar` 实际存在，26,361,808 字节 |
| API 36 | `platforms/android-36/source.properties`：revision 2，ExtensionLevel 17；`android.jar` 实际存在，27,768,026 字节 |
| Build Tools 30.0.3 | `source.properties` revision 30.0.3；`aapt2.exe version` 实际输出 `2.19-6966805` |
| Build Tools 36.0.0 | `source.properties` revision 36.0.0；`aapt2.exe version` 实际输出 `2.20-13193326` |
| Platform Tools | `platform-tools/source.properties` revision 37.0.1；本轮未启动 adb |

未检查 SDK 许可完整性、所有工具运行情况、所有 Maven 缓存完整性。未运行 sdkmanager、adb、模拟器，未安装 APK，未读取手机数据。

## 可复核命令

PowerShell 使用绝对路径逐项执行 `--version` / `-version`。Python 探针为：

```powershell
& 'C:/ProgramME/DevTools/miniconda3/python.exe' -c "import sys; print('CODEX_PYTHON_PROBE'); print(sys.version.split()[0]); print(sys.executable)"
```

Gradle 仅设置本进程环境变量 `JAVA_HOME=D:/GradleHome/jdks/eclipse_adoptium-17-amd64-windows.2`，然后对上述既有分发执行：

```text
<gradle.bat> --offline --no-daemon --gradle-user-home <本聊天绝对路径>/work/environment-gradle-home --version
```

两个分发均实际返回版本信息；该批命令最终退出码 0。Gradle 首次执行写入的局部初始化状态限定在 `work/environment-gradle-home`，不修改共享 Gradle 用户配置。没有修改系统 PATH、注册表或持久环境变量，没有联网下载或安装依赖。

## 当前项目构建/运行基线

静态审计源码为master / `5480c88c806cf1c366ec998b0ba627543d63233a`；来源和完整文件索引见00及evidence。本轮实际构建源码为CI提交 `06a269b965c0c92c0e818effba5546986dd3242d`，业务源码未改；新增文档与CI文件的差异记录于提交证据。早期工具探针不作为本轮项目构建证明。

| 检查 | 本轮状态 | 方法与边界 |
|---|---|---|
| Windows原构建及3个CLI检查 | 构建/三自测原生退出码均0 | self-test checks32/failures0，advanced checks48/failures0且另记detailKeyChecks48/detailKeyFailures0，feedback checks21/failures0；各指标不混算；独立临时数据 |
| Android原构建 | 构建及aapt badging原生退出码均0 | 手动aapt2/javac17/D8链，aligned unsigned APK，包local.gxtodo.replica、0.9.2/code15；原签名未使用，不能宣称正式APK可发布或覆盖安装 |
| Web/共享测试 | helper/共享测试原生退出码均0；TAP pass121/fail0/skipped0 | 显式执行17文件，cancelled/todo均0；Web源码包；loopback/mock是测试夹具，不能冒充真实坚果云或C互操作 |
| 三个Android Java测试 | 各原生退出码均0 | PomodoroClock73、DailyTaskPolicy47、NotificationTimerControls20 assertions passed，均为本run原stdout；不等于SQLite/生产存储桥通过 |
| C/JS互操作、Java桥、真机运行 | 未执行 | 现有测试覆盖不足；新增兼容向量及设备验收见08/09 |
| 真实坚果云、LAN、安全配对、附件 | 未执行 | 本轮不连接真实云账户或局域网设备；LAN/附件机制尚未实现 |

有一个早期子Agent无文件/无网络JS内存探针：Node v24.22.3对生产replica调用，A/a同clock事件选择A并保留冲突；还观察key/context/id校验边界。没有C互操作执行，不能当成云端测试或仓库套件通过。它发生在子Agent收到主Agent转达云端约束之前；未保留能与用户发出约束精确比较的执行时刻。后续不执行本地应用测试、编译或打包。

## 云端执行中发现的问题与剩余门槛

工作流位于 `.github/workflows/phase0-baseline.yml`，使用合法YAML的JSON语法；一个源码冻结job和三个平台job均使用GitHub Windows runner，复用原脚本并隔离数据/构建目录。第一方Actions SHA已经公开API核对，配置调用此前由Android/Web及Windows子Agent只读复审；本次实际执行已取得run、日志和产物，配置审查与动态执行证据分别记录。

早期GitHub插件404、Edge自动输入不可靠及程序异常均属访问/传输阶段问题。恢复后，Codex内置浏览器完成上传并在Codespaces执行了提交脚本。首次上传包从 `/workspaces` rename到 `/tmp` 因跨文件系统而失败，Git提交尚未开始；改为已校验任务临时文件的跨文件系统移动后继续。原失败保留，不执行用户数据清理。

文档和CI提交成功后，`gh run list --workflow phase0-baseline.yml` 初次查询默认main而返回404/退出1；改用已存在的run ID与Actions API后取得成功运行记录。该查询失败不是项目构建失败，原始日志及命令退出码保留于提交证据。本次另有4条第一方action Node20弃用/被平台强制使用Node24警告，job未因此失败。

预装工具版本、checkout/workflow SHA、命令、起止时区、真实exit及产物SHA按实际收据保存，见12。后续仍按缺项真实失败处理，不擅自安装依赖。C0共同向量及兼容修复需各自云端验证；初次Web源码包与Android unsigned必须与正式发布三包区分。

历史dist/windows-build.json、android-build.json和README里的通过记录只作历史索引，本轮不复用其通过结论。没有本地编译产物、SDK/Gradle依赖下载、APK安装或生产数据库访问。
