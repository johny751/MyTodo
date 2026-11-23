# C0-05 Windows DPAPI 凭据互读

日期：2026-11-23，Asia/Shanghai。阶段状态以末尾“同源最终验收”及对应原始收据为准。

Windows C 与 Node 原先不能可靠互读新格式凭据，Node 缓存会掩盖磁文被损坏或替换的事实，C 保存入口还可能把不可读或损坏的已有文件当作首次配置覆盖。生产修复提交为 `2114f152e23b432dbf2df798464094c116bb57e1`，仅修改 `windows/sync.c`、`windows/credential-helper.c` 和 `src/sync-server.mjs`。

现在两端读取无前缀的旧 DPAPI UTF-16LE 格式和 `gx-dpapi-v1:` 新 DPAPI UTF-8 格式，C 写入新格式；严格校验十六进制、长度、UTF 编码、NUL 和完整 JSON 对象。已有配置无法读取或解密时，保存失败并保留原文件。Node 重新读取实际密文字节，只有字节相同时才使用缓存；helper 拒绝非法 UTF-8/NUL。同步协议与 Android Keystore 未在本阶段修改。

## 独立提交和真实运行

| 用途 | 提交 | GitHub run | 实际结果 |
| --- | --- | --- | --- |
| 测试入口 | `6d1449e4063f5944398c19bbda372b8369a5ce7c` | 45153269614 | C2040 构建失败，22 例未运行 |
| 测试适配头文件修正 | `fad9d823ca054612ebb0e4539cca8d92dcabaec2` | 45153999774 | 2 passed / 20 failed |
| 生产凭据修复 | `2114f152e23b432dbf2df798464094c116bb57e1` | 45154587045 | 21 passed / 1 fixture failed |
| 保留安全 stderr 诊断 | `e761c493857706fbf61dac87bed7a3709eee64b9` | 45155116261 | 21 passed / 1 fixture failed |
| PowerShell 旧格式夹具修复 | `2e211fa743dca2f0ad67005f5977d69ede7963fa` | 45157015901 | 22 passed / 0 failed，exit 0 |
| 同源工作流触发范围 | `648f550812a18ad203aa32ebabc06625bcb24c0d` | 45158226148 | 22 passed / 0 failed，exit 0 |

逐例修复前后结果见 `c0-05-case-results.md` 和 `.json`。首次编译失败是测试翻译单元 `<io.h>` 的 CRT `dup(int)` 与现有 `dup(J*)` 冲突；修正仅用于测试适配。它不是生产修复，也没有被记成执行通过。

PowerShell 失败诊断为 `CouldNotAutoloadMatchingModule`。runner 继承的 PSModulePath 先选择 PowerShell 7 Security 7，Windows PowerShell 自动载入发生重复 TypeData 错误。夹具显式载入 Windows PowerShell 自带模块，开启致命错误，在内存完成 protect→unprotect 序数相等校验，再验证偶数 ASCII hex。独占文件夹具记录真实退出、signal、超时、强杀与释放状态。这些夹具修复没有改变生产凭据算法。

## 覆盖与证据

22 例使用同一 GitHub Windows runner 用户的实际 `CryptProtectData`/`CryptUnprotectData`，调用原生 `config_save/config_read`、实际 credential helper 和 Node `createSyncStore`。覆盖双向 ASCII/Unicode、旧 C/PowerShell 格式、空密码保留、首次空文件、截断/奇数 hex/错前缀/非 hex/密文损坏/超长/NUL、解密后非法 UTF-8/JSON/标量/尾随内容，以及真实 Windows 独占文件读取失败。

合成随机凭据通过 stdin 传入，在进程内比较；HTTP 请求入口使用内存夹具核对授权头。没有真实 WebDAV 请求（报告 networkRequests=0）、真实坚果云账号或用户业务数据。最终报告 credentialPlaintextLogged=false，表示受监控输出没有检出完整合成凭据；这不是全系统零泄漏证明。C adapter 的失败拒绝必须同时满足正常进程退出、结构化断言成立和原文件字节保留，崩溃、超时不能算通过。Node 负例辅助断言接受抛出的异常，本套件未逐个负例区分内部 helper 的拒绝与基础设施异常；正向互读、55 条干净子进程收据和原文件保留断言共同支持本轮结论。

最终 Windows 镜像为 `win25-vs2026 / 20261116.315.1`，Node `v22.23.5`，PowerShell `7.6.10`。同源原生凭据测试 EXE SHA256 为 `d2af3aa17f0a38b9ec3289c64486102efea9b6eb8463c484ab20b2b4f19ab446`。Codespaces LF 版 `windows/sync.c` SHA256 为 `b06f9eb43d9366b14172cce81c6de6483878c1736ccf8752cd1fb1c9554c1cf5`；Windows checkout CRLF 字节为 `830ed87ce03490695e40c15d5e46c8cf65c3dc9065e7b1184d1e823f36567f0b`，已确认两者仅换行不同，保留各自实际哈希。

所有初次失败、stdout/stderr、构建退出、运行退出、source SHA 和产物库存保存在每个 run 的原 GitHub artifacts。完整文本证据在本次交付 `evidence/<run>/`；EXE/APK/SQLite 等二进制保留在 GitHub/Codespaces。采集器只收集已有结果，没有重跑项目测试。

## 原三端回归与历史矩阵

同源原回归 run `45158226161` 成功：三条应用/辅助器构建命令和七条原测试命令均实际进程 exit 0。Windows self 32、advanced 外层 48、feedback 21 检查均无失败；advanced 内部检查不重复累加。共享 JS 121 tests、0 fail、0 skipped。Android 原 Java 测试分别 73/47/20 assertions，unsigned APK 构建成功。它不代表可覆盖安装的签名发布。

四个产物已用云端实际下载字节复算库存，与原 `run-receipt.json`/`artifacts.json` 逐项核对，见 `c0-05-verification.json`。通用采集器期待 `sha256.json`/`payload-sha256.json`，因此原回归采集退出 1；该原始收据保留，补充验证没有改写它。

生产修复源码 `2114f152` 的完整 C003/C004 run `45154587042` 已完成 936 次执行、936 次比较。Android 有三次首次 instrumentation 崩溃，经有限重试通过。历史旧工作流 `45154587007` 的 Windows 打开数据库哈希访问失败、Windows runner Android 镜像缺失仍保留，不能将该旧工作流称为通过。

Android 稳定性独立跟踪于 `johny751/MyTodo#1`。首次 main 失败后的历史执行器会换 dbCase，因此最终成功不能证明首次失败原库恢复；无 result.json 也不能证明事务没有落盘。增加原库与 sidecar 保留的观察补丁将独立提交，不能在补丁实测前宣称已补齐历史证据。

## 阶段边界

所有项目编译、测试、打包及依赖安装均在 GitHub。C0-06 旧云迁移和 C0-07 SQL、publish、ACK 故障传播仍独立执行；本阶段不推导它们通过。D1 尚未获单独批准、未启动。

## 同源最终验收

C0-05 已通过。受测提交 `648f550812a18ad203aa32ebabc06625bcb24c0d` 的三项门槛全部完成：凭据 run `45158226148` 为 22/22、exit 0；原三端回归 `45158226161` 成功；完整 C003/C004 run `45158226276` 为 936 次实际执行、936 次比较、exit 0。执行分布为桌面 468、Android 312、最终接收 156；failed/blocked/skipped 均为 0。

最终矩阵出现两次首次 instrumentation 崩溃：分片 2 的 id-empty / generate / Android main，分片 6 的 key-array-type / receive / JavaScript main。均经有限重试通过，首次失败日志完整保留；两次 main 重试换库，因此不能据此证明失败原库恢复。独立问题 #1 继续开放。

本轮矩阵 15,530 条 producer 清单摘要已在云端复算。文本归档 19,601,658 字节，SHA256 `3b83a5f9d1018f44db97665741f463a53301e937fc9c5b4b106372fc63f571cc`；本机仅对收到的 13,367 条归档文本清单重新核验。凭据文本包 SHA256 `a7fe703f630ea15ff416f37dbe929c512a0ff1822d1c3af179f79f2409d590da`，原回归文本包 SHA256 `d5af9bab6e4b5db110bfb992ae91f7d039497f718474b1b2d4c53de8c342f161`。

生产、测试、夹具、CI 与报告分别提交；报告提交本身不冒充新的受测源码。后续允许依既定顺序进入 C0-06，然后 C0-07。阶段 0 总体验收仍未完成，D1 门槛保持。
