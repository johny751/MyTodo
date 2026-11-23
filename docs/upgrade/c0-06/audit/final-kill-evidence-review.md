# C0-06 最终提交 A26/A30 证据独立复核

复核日期：2026-11-23，Asia/Shanghai。最终运行 `45170150057`，精确源提交 `1b9c41fbc543f4e31c1e1a22c3b0fe0419eb4e35`。本次只读取已解压证据、解析 JSON、核对文本大小与 SHA256，未本地执行项目、测试、编译器、模拟器或联网；旧红绿报告未修改。

结论：本运行实际执行 A26、A30 两项，`executed=2 / passed=2 / failed=0`，GitHub conclusion 为 success。独立复核未发现来源、文件采集或边界断言不一致。该结论限于这两项指定终止场景，不代表 Android 间歇性崩溃根因或整个项目验收。

## 来源及完整性

| 核验项目 | 结果 |
| --- | --- |
| 本地文本归档清单 | 156/156 条大小、SHA256 全匹配；合计 2133964 字节 |
| 主 artifact producer manifest | 773/773 条与 collector inventory 相同 |
| collector 总 manifest 行 | 859，包含 environment 的 86 行；无收集失败 |
| collectionExitCode / evidenceComplete | 0 / true |
| 293 次命令的 stdout/stderr 摘要 | 586/586 条与 producer manifest 相同 |
| 11 次操作 source / identity / remote path | 全部匹配该提交、case、attempt、dbCase |
| build / execution / emulator environment / native provenance | 同一精确提交及运行 |
| APK | build、execution、collector 三方 SHA256 相同；只安装一次 |

156 条本地清单包含 146 个 artifact 文本和收集元数据。测试 APK SHA256 为 `9f74f62130a73f0e4e0f146dc4aa81b6dfcc80719e6583e3d4cdd28dea9c2c58`。实际 Android provenance 中 `src/delta-sync.mjs` 为 `c6c9511314ee3b03aa28a708cfef10006b58a1f74ee24eb5b6fc6feb5a80dad5`；采集 helper 为 `41613ce991718a0c1cf03f2f7747d43598e5b0ab3cf081f811e0d3af08a0c350`。运行使用 API 34、SQLite 3.39.2、Android WebView 113.0.5672.136。

主控传递的文本 ZIP SHA256 为 `58e8cd091b19e332cf0da04a11829cd62d916714ca91cc4001b087488660d9f4`；本审查未定位 ZIP 本体，不将此值描述为本地独立重算结果。上述 156 个解压文件已逐一独立重算并与 archive manifest 相符。

## 主数据库与所有 sidecar

11 次导出共 44 项回执，全部核对通过：11 个主数据库均为 40960 字节；A26/A30 终止现场各有 WAL 32992 字节、SHM 32768 字节，共 4 个已存在 sidecar；其余 29 项均为明确 `unavailable/missing`，没有复制输出或伪保全路径。

全部 15 个已保全文件的远端 before/after 均为可读普通文件。按命令中的 32 位十六进制 nonce、解析后的状态/大小/哈希重构精确单行回执，其大小和 SHA256 与命令回执相符。远端前后大小/哈希、二进制传输大小/哈希、云端本地写回大小/哈希、producer manifest、collector inventory 全部相同。所有相关命令均无超时、signal、spawn/stdin 错误或 stderr；主数据库均记录 `sqliteHeaderValid=true`、`localReadbackVerified=true`。29 项 missing 回执也完成 nonce 与精确 stdout hash 核对，均没有将存在但采集失败的侧文件当作 missing。

| 终止现场 | 文件 | 大小 | SHA256 |
| --- | --- | --- | --- |
| A26 attempt-002 | tasks.sqlite | 40960 | `16818efa3585a9bc5a0768a75f4ffcf749ec031fef8bc14a35732ec7469413dc` |
| A26 attempt-002 | tasks.sqlite-wal | 32992 | `3dfbddf28f3b81c3f7d312d6cd9bc40186792441603cffb4832192b1409cb49a` |
| A26 attempt-002 | tasks.sqlite-shm | 32768 | `48743ddd532e8c9b3b612c72cb327baac6b00c635ea00f8ed10f2f98b5a2e3e2` |
| A30 attempt-009 | tasks.sqlite | 40960 | `b3edb0d21d1c8411a470352773e1ed56584dd95c766448eec472cf07f15ae2ab` |
| A30 attempt-009 | tasks.sqlite-wal | 32992 | `7e0bdc06390a0c131584a2f152f1422d682a18ed6c91e1aa308d2d27f3aa0618` |
| A30 attempt-009 | tasks.sqlite-shm | 32768 | `365afad31a35b293f09cf66494b4f5cf463479dab0f7d665b40446d9abd6fcb4` |

两个终止现场的 journal 均有有效 missing 回执。字节文件仍在 GitHub；本地没有重新打开 SQLite。SQLite header 与写回验证是云端采集器已经封装的事实字段，本审查交叉核对其摘要链，不冒称本地再次执行数据库完整性检查。

## 实际终止及 A26 同库恢复

A26 的 gate 为 `after-real-import-commit`，实际 commit 成功、rowCount=5；PID 4097 与 before/audit 身份一致，gate 后没有正常 native-result。instrumentation 返回后先执行 `natural-exit-pid-0`，退出 1、stdout 空，然后才复制数据库；期间没有 force-stop。该 gate 对应实际 commit 后、初始 manifest 发布前，保留未过期的生产 lease。

PID 4668 重开完全相同 databaseFile，完整 meta、SQL entities/outbox 均等于 gate；原 actor `04342471-1f29-440d-8819-c9463514644f` 和 seq=6 保持。下一次 sync 因实际未过期 lease 返回 busy。使用设备时钟等待 103885 ms 后，PID 6613 在原 lease 到期后恢复同一数据库；未重置或重新初始化原 dbCase。

恢复后原 6 行的 domain 和 retained events 完全相同，outbox/pending/lease 清空；gate 中每个 outbox 事件都在同 epoch、正确 batch 路径且被 manifest heads 广告的云端事件中完整找到。新观察数据库最终也与 gate 的 domain、retained events 相同。A26 通过有原库重开和恢复证据支持。

## A30 独立快照接管

A30 在真实初始 manifest PUT 201 返回之后终止 PID 7345，gate 为 `after-real-manifest-success-response`。同样先观察进程消失再复制，没有以 force-stop 制造死亡。gate manifest 与云端相同，heads={}，无已发布 batch。

原合成数据库目录被移入隔离路径，旧生产路径确认不存在；隔离后的主数据库仍为 40960 字节，SHA256 与可靠采集结果 `b3edb0...ae2ab` 相同。观察设备使用新的 databaseFile 与 actor，PID 7739，由空库恢复到 5 行，seq=0、queue=0、outbox 为空；domain 和 retained events 与原 gate 完全相同，没有合成新的导入事件。

manifest 引用 `v2/s-d534d175-4d27-4570-80a0-9c63d5891708-0.json.gz`，正文 SHA256 为 `245bcc822ca9cd72545faab185f695bbdaebb41a71778395b3d40c2d9c317503`，与 cloud inventory 匹配。观察阶段实际只有请求 11 GET manifest、请求 12 GET 该 snapshot，均返回 200；没有 GET state.json/legacy backup，也没有 PUT batch。A30 通过来自实际已引用快照的恢复。

## 限制与交付索引

这是进程停止后逐文件稳定复制的证据。单文件前后哈希一致不构成 SQLite/WAL/SHM 的跨文件原子快照，也不得称为“crash 一致快照”。gate SQL 审计、重开后的数据库审计和导出字节证明的是各自层次；本报告不扩大到其他 kill 边界、原间歇崩溃根因或旧 14 份 cat 错误文本的恢复。

本次独立结果位于 `outputs/c0-06/evidence/45170150057/`：

- `local-text-archive-verification.json`，SHA256 `e4f209cad4faf96e24e1b6527bd6151ae4b886fd3574f0519fc0293e5e60e6ea`。
- `local-kill-evidence-verification.json`，SHA256 `db0b395b3f1a2fe6f9917be3bf8d05dc522bf47dbe81a0497b9f09c3e7be0611`，包含全部 44 项文件核对、两项边界、A26/A30 关系及 source/identity 附加检查。

原始索引为同目录下 `collection-summary.json`、`text-archive-files-sha256.json`、`all-files-sha256.json` 和 `verified-payloads.json`；主要运行证据在 `artifacts/c006-android-kill-45170150057-1/cases/` 的 `summary.json`、`execution.json`、各 case 的 `case.json`、`database/files.json`、gate、lease、isolation 与 cloud HTTP 日志。原始记录保持不变。
