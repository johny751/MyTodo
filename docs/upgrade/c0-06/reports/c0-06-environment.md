# C006 云端环境与构建产物

全部版本来自已归档 GitHub 收据，未在本机启动这些运行时。机器可读逐运行记录及源文件哈希见 `c0-06-environment.json`。C006 已由主控完成限定验收并关闭：`accepted=true`、`status=accepted-with-documented-evidence-qualifications`、`pending=[]`；Android 稳定性问题仍 open，C007 独立验收。以下原始环境与封存限定不因关闭改变。

最终核心、强杀、bootstrap、基线、完整矩阵的生产源均为 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`。DPAPI 独立执行源为 32e21eb，helper 定向验证源为 8ce0a047；相关文件通过单独云端逐字节相同证据关联最终源，不能改写其直接运行身份。

| 用途 | 已记录环境 |
| --- | --- |
| Windows 基线 | GitHub hosted X64，image win25-vs2026 / 20261116.315.1；Node v22.23.5；MSVC 14.52.37025；Windows SDK 10.0.26100.0 |
| Android host 构建 | 同上；Temurin JDK 17.0.21+9；Android API34；build-tools 35.0.0；D8 8.6.2-dev |
| Android 模拟器框架测试环境 | GitHub hosted Linux X64，ubuntu24 / 20261116.376.1；API34 google_apis x86_64 emulator；system image revision14 |
| Android 运行时 | fingerprint google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.050/12077443:userdebug/dev-keys；WebView com.google.android.webview 113.0.5672.136；实际 framework SQLite 3.39.2 |
| 系统镜像 | system.img 4306501632B；SHA256 156534aa2c707edfb57026f7b573a561e513433d7643d9ce3230ae6d65804c7a |

上述 Android 运行时是 emulator，不是真机设备；“真实 SQLite”指真正执行 Android framework SQLite 与生产存储类。host 基线没有 system image，`realAndroidSQLiteTestsExecuted=false`；不能将 host assertions 写成 emulator 测试。真正运行时来自 C006/矩阵独立 workflow。

基线 run `45170150066` 的命名产物已经云端再次读取字节并匹配原 run receipts（`c006-baseline-qualified.json`）：

| 产物 | 字节 | SHA256 |
| --- | ---: | --- |
| MyTodo-phase0.exe | 1326080 | 6c9f29d8ceeabdb2230a1e5a022901d09087954302b1c3707ed943ab540f9e8f |
| MyTodo-unsigned.apk | 281749 | 9770106797d1539b84969ee4cccab963a19886e2b54213ce940730145d58978a |
| WebCredentialHelper.exe | 149504 | 4826e8e7370a69692548eabb538a4153f2fcd038fc78b5abd80915fd8f48d178 |
| MyTodo-web-source.zip | 101740 | c8d9f2ecd9914c6579bafba6547a20f37f3215dbd34ffb74749a43537d18d73d |

基线原收集器的五项 recursive seal 缺失仍为 exit1/incomplete。命名产物重哈希不生成或替代缺失 seal。APK unsigned，harness 为测试 applicationId，不是发布、安装升级、签名连续性或用户版本界面的验收。本次报告不虚构 APK 版本显示或编译时间 UI；构建时间仅依原 receipt 的 UTC 时间保留。
