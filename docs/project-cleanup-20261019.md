# 项目清理记录

日期：2026-10-19（Asia/Shanghai）。

这是历史清理记录。2026-11-01 已继续清理其中保留的旧安装包与过时构建副本，当前范围见 [最新清理记录](project-cleanup-20261101.md)。

删除 1,565 个文件，文件总大小 2,233,152,934 字节（约 2.08 GiB）。清理前后立即测量可用空间，C 盘增加 782,336 字节，M 盘增加 2,235,666,432 字节；磁盘增量包含文件系统分配差异和同期其他程序活动，不能与文件大小完全等同。源码目录原来仅约 6.75 MiB，主要空间来自项目专用的外部测试快照。

## 已移除

| 类别 | 文件数 | 文件字节数 |
| --- | ---: | ---: |
| 项目内 0.2.0–0.7.0 旧 APK（7 个） | 7 | 531324 |
| 3 张重复缩略参考图，原图保留 | 3 | 225229 |
| 33 个 build-时间戳 构建目录及 tmp | 1283 | 17070871 |
| 7 个已结束的隔离 QA 目录 | 188 | 64685464 |
| 0.8.1 临时截图、UI 转储和日志副本 | 76 | 2883821 |
| M:/dev 下 0.4.0 APK 副本 | 1 | 79476 |
| 专用模拟器的旧启动快照 | 1 | 2147549184 |
| 专用模拟器旧日志、PID 和网络模拟器日志 | 6 | 127565 |

范围限定为项目目录及已确认由本项目生成的 M:/dev/gxtodo-* 缓存。递归删除前逐项验证绝对路径、目录边界、符号链接和文件清单，并确认没有相关构建或 QA 进程占用。没有使用全盘通配清理。

具体隔离 QA 目录：

- `M:/dev/gxtodo-v03-qa`
- `M:/dev/gxtodo-v04-qa`
- `M:/dev/gxtodo-v05-qa`
- `M:/dev/gxtodo-v051-qa`
- `M:/dev/gxtodo-v060-qa`
- `M:/dev/gxtodo-v070-qa`
- `M:/dev/gxtodo-v080-qa-1792340482545`

`M:/dev/gxtodo-gesture-qa-1792379537391` 中保留 `before/` 源码备份，其余临时产物已清理；选定的最终截图、XML、手势结果 JSON 和最终测试日志仍在项目 docs/ 中。

删除的快照为 `M:/dev/gxtodo-android-emulator/GxTodo_QA.avd/snapshots/`，只有旧 ram.img。专用模拟器已停止，现有 android-qa.mjs 以 `-no-snapshot` 启动，不依赖该快照。保留 AVD 配置和虚拟磁盘，后续按测试指南启动即可。

## 长期保留

- `src/`、`android/`、`tests/`、`scripts/` 及启动入口和配置文件。
- 当时保留的 0.8.1 安装包、0.8.0 性能测试对照包（现已清理） 和 [构建记录](../dist/android-build.json)。
- 原版界面参考原图、各版本发布说明、最终验收截图与测试日志。
- [通用 WebDAV 同步实现指南](webdav-sync-implementation-guide.md)、[Android 测试指南](android-testing.md)及[量化性能报告](android-performance-v080.md)。
- 正式数据和备份目录 `M:/dev/gxtodo-local/`。SQLite 数据库、WAL/SHM、旧 JSON 迁移备份均保留；运行中的 4173 服务未停止。
- Android 签名文件 `M:/dev/gxtodo-android-build/local-development.p12` 和 `signing.json`。
- `M:/dev/gxtodo-android-emulator/` 中的 AVD 配置、用户数据和虚拟磁盘；Android SDK/JDK 及其他模拟器未改动。
- 各版本 `backup`、`before`、`resume` 源码及数据备份。当前源码尚未纳入 Git 提交，不将这些备份视为可丢弃缓存。

## 后续维护

完成构建后，确认 dist/ 内最终 APK 的哈希与签名并保留签名文件，再清理对应 build-时间戳 中间目录。清理时先确认没有构建进程；不要删除整个 gxtodo-android-build。构建记录的 output 已改为保留的最终 APK 路径；原构建路径留在 originalBuildOutput 和 originalBuildDirectory 中供追溯，buildDirectory 为 null。

QA 完成后将需要保留的脚本、报告和最终截图放入项目，关闭隔离服务和专用模拟器，再按明确目录清理临时数据。正式数据库及其 WAL/SHM 文件不能当作缓存删除。历史报告中的测试路径表示当时的执行位置，本次没有改写原始测试数值。

## 清理后核验

- 71 个保留文件的 SHA-256 与清理前一致，包含所有源码、测试、构建/测试脚本、签名材料和两个保留 APK。
- 0.8.1 APK SHA-256：`467910d4451e7da0fb83274f4d98db77d06085fd506065e86badcc83f101e5d9`。
- 正式服务仍可访问，清理前后完整业务数据相同：3,524 条任务/子任务、20 条便签、32 个项目。
- 26 个保留的模拟器文件大小和修改时间一致；8 个历史源码/数据备份目录文件数和总大小一致。
- 79 个删除目标均已不存在；检查了 86 个本地 Markdown 链接，没有失效链接。
- 本次只删除缓存与历史产物、更新文档和构建记录，没有修改功能代码，因此未重新运行功能测试。
