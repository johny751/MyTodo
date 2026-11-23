# C0-04 Android 云端运行环境

GitHub 使用 Ubuntu 24.04 x64 runner。应用构建通过仓库现有的 JDK、AAPT2、D8 和 test-only 签名链，Gradle 仅采集版本。模拟器仅运行在 GitHub runner。测试 APK 的独立包名为 `local.gxtodo.protocolharness`。

| 预检 | 被测 SHA | 真实结果 |
| --- | --- | --- |
| [45132468377](https://github.com/johny751/MyTodo/actions/runs/45132468377) | `473ba126524a41ec1be0ffee8bbe1121cb44c12a` | 系统镜像列表为空，ADB 可用，emulator 缺失，KVM 节点存在但 runner 用户无权访问。预检退出 78。 |
| [45133421860](https://github.com/johny751/MyTodo/actions/runs/45133421860) | `ed0ce330f0ac6ab2ef282119df2e6daa5c7b0802` | sdkmanager 已安装 emulator 和官方镜像。emulator 启动退出 127，动态链接器找不到 `libpulse.so.0`。GitHub 预检步骤退出 78。 |
| [45134913196](https://github.com/johny751/MyTodo/actions/runs/45134913196) | `bb5b44aeeb8a82bc9010c094ce245aac71558cf5` | `libpulse0` 安装后，`emulator-5554` 引导成功，预检退出 0。通过 runner 用户的 KVM ACL 启用硬件加速。 |

| 环境项 | 实际版本或证据 |
| --- | --- |
| GitHub image | ubuntu24 `20261116.376.1` |
| Emulator | `37.3.10.0`，build ID `16970787`，二进制 SHA256 `5c48296df39c35bad694a361312e3c9915e47d4061eed475b061c98625599173` |
| Android image | `system-images;android-34;google_apis;x86_64`，修订 14，`system.img` SHA256 `156534aa2c707edfb57026f7b573a561e513433d7643d9ce3230ae6d65804c7a` |
| Android 指纹 | `google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.050/12077443:userdebug/dev-keys` |
| WebView | `com.google.android.webview`，`113.0.5672.136` |
| Android shell SQLite | `3.39.2`。应用进程 SQLite 版本以 instrumentation 收据为准。 |
| JDK | Temurin `17.0.21`，javac `17.0.21` |
| ADB | `1.0.41`，platform-tools `37.0.1-15733141` |
| Gradle | `9.9.1`，仅运行 `gradle --offline --version` |

## runner 实际安装清单

Google 官方 Android SDK 源通过预装 sdkmanager 安装了 `emulator 37.3.10` 和 `system-images;android-34;google_apis;x86_64` 修订 14。该镜像包含 WebView。

Ubuntu Noble 官方镜像 `azure.archive.ubuntu.com` 实际安装以下 amd64 包：

| 包 | 版本 |
| --- | --- |
| libpulse0 | `1:16.1+dfsg1-2ubuntu10.1` |
| libasyncns0 | `0.8-6build4` |
| libflac12t64 | `1.4.3+ds-2.1ubuntu2` |
| libmp3lame0 | `3.100-6build1` |
| libmpg123-0t64 | `1.32.5-1ubuntu1.1` |
| libopus0 | `1.4-1build1` |
| libvorbisenc2 | `1.3.7-1build3` |
| libsndfile1 | `1.2.2-1ubuntu5.24.04.1` |

安装版本见环境产物中的 `install-official-android-packages.log`、`install-host-libpulse0.log`、`emulator-source.properties` 和 `system-image-source.properties`。每项命令退出码和日志 SHA256 位于 `environment.json`。实际启动和关闭的收据分别为 `environment.json` 与 `shutdown.json`。

## 测试 APK 资源修复

对 C0-03 测试 APK 执行 `unzip -Z1`，发现 WebView 入口存在，辅助模块 `assets/src/.c003-delta-adapter.mjs` 未入包。旧 APK 已安装的矩阵 [45134913319](https://github.com/johny751/MyTodo/actions/runs/45134913319/job/137559730289) 中 `android-adapter-build` 和 `android-install` 退出 0，首个 `basic-note` 生成进程退出 1。

提交 `c79c137ff7e049cb155a6509ef21e1b991554af8` 将辅助模块改为普通文件名。构建在签名后用 `jar tf` 核对所有声明的 WebView 资源，缺失时直接报告构建失败。新运行见 [45135963743](https://github.com/johny751/MyTodo/actions/runs/45135963743)。

GitHub 产物压缩包 SHA256：

| 运行 | 产物 | SHA256 |
| --- | --- | --- |
| 45132468377 | [预装清单、日志与退出码](https://github.com/johny751/MyTodo/actions/runs/45132468377/artifacts/14797784721) | `9783737b552fa550a0ed03e5515ef0a38426ca4df0b69027151038ed4fba38ca` |
| 45133421860 | [SDK 安装、动态库错误与退出码](https://github.com/johny751/MyTodo/actions/runs/45133421860/artifacts/14798139796) | `12d37dccfc6a1b9c8547b6a46358fa0647d358605b4b4e89b4024e6750ccdbe3` |
| 45134913196 | [成功引导的环境、安装日志与收据](https://github.com/johny751/MyTodo/actions/runs/45134913196/artifacts/14799557172) | `4c6f2bbdf7567291858f2c585ca50f7572710c37bed2400ef2e3eab2e3226294` |

本机归档仅含文本，三次环境预检共 60 项 payload SHA256 与长度已复核。归档 SHA256 为 `443690cb74dfcc34f687f4dd7f021a7f522415f5b70aaeec0850ce37d4d8d00a`。

## 最终实际 Android 存储执行

[45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501) 八个分片各自安装独立测试 APK，通过生产 `AccountStore` 和 `ReplicaDatabase` 写入数据、关闭并重开数据库，再力停并启动新进程比较实际状态和导出的 SQLite。共 312 格通过，应用进程报告 SQLite `3.39.2`。所有分片安装包为 test-only 临时签名。SDK 与 APT 安装日志的清单一致。

| 分片 | 通过数 | 测试 APK SHA256 |
| --- | ---: | --- |
| 0 | 40 | `76321faef2654d8a01f61389abfd113ce43c32ec93b7f7122213d869189f384b` |
| 1 | 40 | `fc42f7c209a5d1cbebcbe12002d0c2e1cd9e7d302585664281f9bb6340289157` |
| 2 | 40 | `e7db942f728b2ec92c3dfbf11434344ef1271ad2f08f24db49d665f7d1a4d5cc` |
| 3 | 40 | `66119970bf0af174d6554c2556c797a4dcd771fac3ae89fb35a085fccda30969` |
| 4 | 40 | `ba309acceed429ab08856e769865342b91511acb7c23d109f40aeee3d7f2f66d` |
| 5 | 40 | `62a926955ee9eeb2e7da83850828432036c2a1daa9151e114e05e5982173ebbc` |
| 6 | 36 | `589ddd3850e9712e92de90727a93f7f1a62263b55198cfd8dbc7ae53c30d15f6` |
| 7 | 36 | `ce56549e19fee14d6dd6bffbfe582131518669134216d9270968928d824adb07` |
