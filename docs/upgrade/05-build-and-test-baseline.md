# MyTodo 阶段 0：构建测试基线与早期工具核验

## 当前云端预检

2026-11-23，在授权GitHub Codespaces `/workspaces/MyTodo` 终端实际执行：

```bash
pwd && git status --porcelain=v1 --branch --untracked-files=all && git rev-parse HEAD && command -v gh
```

实际输出工作目录`/workspaces/MyTodo`、`## master...origin/master`且无staged/unstaged/untracked项、HEAD `5480c88c806cf1c366ec998b0ba627543d63233a`、gh `/usr/bin/gh`。这只是Git预检；Actions尚未触发，不证明编译或测试通过。三端均使用随后CI冻结的同一源码SHA；实际run、逐项退出码和产物SHA256取得后单独补录。

## 早期本机工具元数据记录

核验日期：2026-11-23，Asia/Shanghai。核验方式：只读目录/元数据检查与本地工具版本命令；当时尚未获得 MyTodo 源码。本文件仅证明工具可执行或组件目录存在，不证明项目可以构建、运行或通过测试。

## 实际结果

| 工具 | 实际路径 | 本轮结果 |
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

源码已实际取得：master / 5480c88c806cf1c366ec998b0ba627543d63233a；来源和完整文件索引见00及evidence。前文是取得源码之前的工具探针，不是MyTodo构建证明。

| 检查 | 本轮状态 | 方法与边界 |
|---|---|---|
| Windows原构建 | 未执行 | 原MSVC/vswhere/Windows SDK脚本已审阅；本机MinGW不替代原基线。CI调用原build-windows和3个CLI检查，尚无run |
| Android原构建 | 未执行 | 确认为手动aapt2/javac17/D8链，SDK35.0.0/API34。CI只准备unsigned构建；原签名缺失，不能宣称正式APK可发布 |
| Web/共享测试 | 未执行 | 现有node --test及loopback/mock夹具已审阅；CI准备原helper和测试、Web源码包，尚无run |
| 三个Android Java测试 | 未执行 | PomodoroClock、DailyTaskPolicy、NotificationTimerControls的现有runner已审阅，计划仅GitHub执行 |
| C/JS互操作、Java桥、真机运行 | 未执行 | 现有测试覆盖不足；新增兼容向量及设备验收见08/09 |
| 真实坚果云、LAN、安全配对、附件 | 未执行 | 本轮不连接真实云账户或局域网设备；LAN/附件机制尚未实现 |

有一个早期子Agent无文件/无网络JS内存探针：Node v24.22.3对生产replica调用，A/a同clock事件选择A并保留冲突；还观察key/context/id校验边界。没有C互操作执行，不能当成云端测试或仓库套件通过。它发生在子Agent收到主Agent转达云端约束之前；未保留能与用户发出约束精确比较的执行时刻。后续不执行本地应用测试、编译或打包。

## 云端工作流及当前阻碍

具体草稿位于outputs/github-ci/phase0-baseline.yml，合法YAML的JSON语法；三job均Windows runner，复用原脚本，隔离数据和构建目录在runner。第一方Actions SHA已从GitHub公开API核对，配置调用经Android/Web和Windows子Agent只读复审。当前未提交、未触发、未获取run URL、日志或产物；这些配置检查不是构建通过。

Github插件仍返回404；用户Edge可读取私有master，但自动输入不可靠。没有最终提交文件，也没有启动Actions。已请求刷新当前GitHub连接；另提供只在Codespaces运行的安装脚本作为具体接续入口，未在本地或云端执行该脚本。

首次实际run后保存checkout SHA、workflow SHA、runner工具版本、命令、起止时区、真实exit、失败日志、原生case记录和产物SHA。预装工具缺失保持真实失败，不擅自安装依赖。初次Web源码包与Android unsigned必须与正式发布三包明确区分。

历史dist/windows-build.json、android-build.json和README里的通过记录只作历史索引，本轮不复用其通过结论。没有本地编译产物、SDK/Gradle依赖下载、APK安装或生产数据库访问。
