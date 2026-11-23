# C0-07 执行环境与依赖

2026-11-23（Asia/Shanghai）。仅对应 GitHub run `45190559178` / attempt 1 / source `de7ce40ccac3e963108a3a9af7c875186f822cce`。构建、依赖安装和测试均发生在 GitHub 临时 runner；本地仅解析已有文本与哈希。本文件不把测试APK/EXE称为产品发布包，也不发布整体验收。

| 平台 | GitHub runner image | Node / 宿主Node SQLite | 实际被测SQLite |
| --- | --- | --- | --- |
| javascript | ubuntu24 / 20261116.376.1 | v22.23.5 / 3.54.1 | 3.54.1 |
| windows-c | win25-vs2026 / 20261116.315.1 | v22.23.5 / 3.54.1 | 3.38.2 |
| android | ubuntu24 / 20261116.376.1 | v22.23.5 / 3.54.1 | 3.39.2 |

三端均通过仓库脚本选择 runner 已有 Node 22.23.5；Windows原日志明确路径 `C:\Program Files\nodejs\node.exe`。未记录Node下载、setup-node或npm install步骤。C006 HTTP夹具来自同提交的 `tests/c006/c006-harness/fixture-server.mjs`。Node宿主验证器SQLite、Windows生产SQLite和Android framework SQLite分别记录，不能互相替代。

## Android 环境

- Ubuntu24 X64 / image 20261116.376.1；初始SDK/ADB存在，emulator和目标镜像缺失，libpulse0缺失。KVM存在，runner UID ACL使访问从false变为true；KVM version12可用。
- 实际设备为API34、x86_64、serial emulator-5554；WebView com.google.android.webview 113.0.5672.136；真实instrumentation报告framework SQLite3.39.2。可选shell sqlite CLI也为3.39.2，但单独记录其证据角色。
- JDK Temurin17.0.21+9、javac17.0.21；ADB1.0.41 / platform-tools37.0.1-15733141；sdkmanager12.0。Gradle9.9.1只记录版本，usedForBuild=false。
- 构建使用已有路径build-tools35.0.0和android-34/android.jar；aapt2为2.19-11948202，D8为8.6.2-dev。没有本轮安装JDK/build-tools35/platform34的命令记录。独立apksigner/zipalign版本banner、platform包revision未记录。

## 本轮真实安装

sdkmanager通过既有许可从官方Google Android SDK仓库安装 `emulator` 37.3.10（执行版本37.3.10.0、build16970787）及 `system-images;android-34;google_apis;x86_64` revision14。安装日志没有完整下载URL，不能补写推测域名。实际命令、exit0和log SHA均在JSON中：

```text
/usr/local/lib/android/sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/usr/local/lib/android/sdk --channel=0 --install emulator system-images;android-34;google_apis;x86_64
sudo -n apt-get -o Dir::Etc::sourcelist=/etc/apt/sources.list.d/ubuntu.sources -o Dir::Etc::sourceparts=- update
sudo -n apt-get -o Dir::Etc::sourcelist=/etc/apt/sources.list.d/ubuntu.sources -o Dir::Etc::sourceparts=- install -y --no-install-recommends libpulse0
```

APT原日志记录实际来源 `http://azure.archive.ubuntu.com/ubuntu`，共8个新包（0升级）：

| 包（amd64） | 版本 | suite/component |
| --- | --- | --- |
| libasyncns0 | 0.8-6build4 | noble/main |
| libflac12t64 | 1.4.3+ds-2.1ubuntu2 | noble/main |
| libmp3lame0 | 3.100-6build1 | noble/main |
| libmpg123-0t64 | 1.32.5-1ubuntu1.1 | noble-updates/main |
| libopus0 | 1.4-1build1 | noble/main |
| libvorbisenc2 | 1.3.7-1build3 | noble/main |
| libsndfile1 | 1.2.2-1ubuntu5.24.04.1 | noble-updates/main |
| libpulse0 | 1:16.1+dfsg1-2ubuntu10.1 | noble-updates/main |

云端记录的安装文件：emulator 10,144,992B / SHA `5c48296df39c35bad694a361312e3c9915e47d4061eed475b061c98625599173`；system.img 4,306,501,632B / SHA `156534aa2c707edfb57026f7b573a561e513433d7643d9ce3230ae6d65804c7a`；libpulse.so.0 326,856B / SHA `3d78bd6bfcebccb7d4e65bac298c3aef5b0906fc4c6a4bebcd761c845f4c3c4a`。本地未下载/执行这些依赖，也未宣称本地重算它们的二进制hash。

## 构建命令与测试产物

Windows日志实际执行 `node tests/fault-harness/build-c007-windows.mjs "$evidence/bin/c007-worker.exe"`，随后执行同源故障suite。源码构建器SHA与receipt精确匹配，使用vswhere定位既有MSVC cl.exe和Windows SDK；实际选中版本和完整展开编译argv未记录，不推测。原build.log保留C4244 int64_t→double警告；构建exit0。测试复制的transport/ACK观察适配及原生产/临时源码hash在JSON中列明。

Android build receipt保存17条实际命令与各自exit0/log SHA：aapt2 compile/link → javac --release17 → jar → D8 --min-api26 → APK写入dex → zipalign → synthetic测试keytool/apksigner → 签名/资产检查。完整argv在JSON中。签名为一天有效的隔离CI测试证书，未使用产品发布签名。Node worker为解释执行，没有独立编译安装包。

| 产物 | 字节 | SHA256 |
| --- | ---: | --- |
| `c007-android-45190559178-1/build/mytodo-c003-test.apk` | 167011 | `c80cf3070c7f8d1a684e316b1cbcec4a6f4b5b91ec3a5ef28a76e9cd88829f1f` |
| `c007-android-45190559178-1/build/unsigned.apk` | 154232 | `57bf8c9bef5fe32d15f1e7aa1941e8135b30691176aea40f3ff2c3effb4c96f0` |
| `c007-windows-c-45190559178-1/bin/c007-worker.exe` | 1079808 | `a75585e933ded028065a802954fb2f8ffe375ecea0531ad02c08a6a7d56e6596` |

上述产物hash由build receipt与云端inventory交叉匹配；二进制仍为cloud-only，未声称本地读取或重算。测试结果见独立case-results；环境ready、构建exit0与依赖安装成功不等于业务验收。

## 输入证据

同名JSON列出 44 份输入的路径、字节数及SHA256；已归档文本均按text-archive索引核对。另一个源构建器文本以本轮receipt中的sourceBuilderSha256精确绑定。关键锚点：

| 输入 | SHA256 |
| --- | --- |
| `outputs/c0-07/evidence/45190559178/artifacts/c007-android-environment-45190559178-1/environment.json` | `6bb6ae6df6c8dca3f4043aa147e077f5f1bf78c4c88f47c9ee918dc58158dd57` |
| `outputs/c0-07/evidence/45190559178/artifacts/c007-android-45190559178-1/build/build-receipt.json` | `4cd831cf8ee2949a4712d5cf7225d1e7638b0ecf38d82c4dbf7806348f6d33b7` |
| `outputs/c0-07/evidence/45190559178/artifacts/c007-windows-c-45190559178-1/bin/windows-protocol-build.json` | `9842d324d3b45d0dd0577ca781bdf3ba031faee727937fbf5d0c0e795ec9f623` |
| `outputs/c0-07/evidence/45190559178/github-job.log` | `0eddf2a50c1b726c8162c2231f6b833ffc33f2ca2ace062f4a9524b8c465d184` |
| `outputs/c0-07/evidence/45190559178/all-files-sha256.json` | `b34d8d4b254280b09acfdb83be77cc45ffdd4ac410a0a0918e2d345710b8d0b7` |
| `C:/Users/adwoo/Documents/Codex/2026-11-23/mytodo-agent-mytodo-agent-mytodo-github/work/source/MyTodo-master/scripts/build-windows.mjs` | `a9199dc51822c2a12d6823f23417286c82525c36243d94d00130a94044d93693` |
