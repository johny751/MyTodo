# C006 edfde91 Android 中断独立复审

2026-11-23，run `45194185184`，source `edfde91eba174f9f8c20657ded4657c8841d0f83`，runAttempt 1。证据目录：`outputs/c0-07/evidence/45194185184`。本审查仅静态读取 JSON/文本、比较状态及计算本地文本 hash；没有运行项目代码、构建、SQLite、ADB、联网或读取 APK/数据库二进制。

结论：归档支持 A26、A30 本轮 2/2 的两种指定恢复行为：A26 在真实导入提交后死亡并从原设备同库恢复；A30 在首个 manifest 成功响应后死亡，随后隔离原库，由不同身份的新设备库读取快照接管。两例共 11 次操作，9 个普通原生成功结果和 2 个准确边界死亡。独立静态对账 issues=[]。GitHub success 与这些业务结果一致，但采集器 exit 1 / evidenceComplete=false 仍然保留。

## A26：导入提交死亡后的原库恢复

1. attempt-001 在 `C006-A26-import-kill` 原库初始化一个 `local-note`，PID 3589。
2. attempt-002 的 PID 4371 在 `after-real-import-commit` 死亡。marker 记录 action=commit、ok=true、rowCount=5、revision=3；数据库已有 5 条 legacy 记录和原本 local-note，共 6 rows / 6 outbox 事件。中文、emoji、父子任务关系、标签和地点都与预期一致。
3. OS ApplicationExitInfo 对 PID 4371 记录 reason=2/status=9；原始 pidof stdout/stderr 为空、exit=1，自然死亡在 14:30:34.739 UTC 被确认，随后开始导出。此 C006 死亡分支在死亡确认和导出之间没有执行 after-stop/failure-stop；不能套用 C007 分支中“自然确认后的额外清理”描述。
4. attempt-003 的新 PID 5026 打开同一原设备数据库路径。其业务 SQL rows/outbox 和完整 meta 均与 marker 相等；audit 前后不变。该路径不是导出副本，也没有 DB 替换命令。
5. attempt-004 的 PID 5368 返回 busy=true，原 lease 和业务状态保持。lease.until=`1795444352795`，设备观测时间=`1795444252139`，记录等待 `100856 ms`，恰等于 lease.until−设备时间+200；后续原生 before 的设备时间已超过 lease 到期值。
6. attempt-005 的 PID 6824 在同一原库恢复；actor 保持 `05fac39d-eb93-4353-b3db-3b204c05efd5`，seq 仍为 6，6 条 domain rows 和各自 retained events 没有重导入或改变。outbox=0、pending=null、lease=null、more=false；发布 manifest 当前可达的 batch 中，每个原始 outbox 事件恰出现一次，共 6 个。
7. attempt-006/007 使用独立 observer 新库；最终 PID 7222 的 6 条 domain rows 与 retained events 与中断 marker 完全一致，包含 local-note 和全部 legacy 内容。这是额外传播验证，不能把它替代步骤 4–6 的原库恢复。

中断时没有 manifest；state.json guard 指向的 immutable legacy backup 仍可在文本 inventory 中核验，plain SHA256=`041edff454885f7b2df161bdbfdbe93ad405869249bcc46ef56e176805c63f36`，并与 marker 的 legacyMigration.sha256 一致。

A26 marker SHA256：`fc6e2f7cf70ee6e809926d073d541880801554b6607e13638187ed5f351cc543`。

## A30：首个 manifest 成功后由新库接管

- attempt-008 在原库初始化；attempt-009 的 PID 7584 在 `after-real-manifest-success-response` 死亡。marker 观察到 PUT `v2/manifest.json` 的 HTTP 201；marker manifest 与 interrupted cloud manifest 完全一致，heads={}，没有任何 v2/b-* batch。
- marker 中 revision=3、5 rows / 5 outbox，并保留真实未到期 lease。OS exit 对 PID 7584 为 reason=2/status=9；自然消失在 14:32:51.095 UTC 确认，14:32:51.096 UTC 开始导出。
- 原库目录从 `files/protocol-cases/C006-A30-manifest-kill` 精确移动到 `files/c006-retired-C006-A30-manifest-kill`。原路径缺失的检查通过；保留主库大小 40,960 B，移动前后的记录 SHA256 均为 `b60a9a40855858587913d16a92e758f69bb75d9c2c10c84e4f2aa162946a5be0`。这是刻意隔离原库的测试动作，并非 A26 原库恢复路径。
- attempt-010 初始化不同 dbCase 的空 observer；attempt-011 的 PID 7969 使用 actor `bc46ec20-d7a9-48ea-a853-feec0737863b`。最终 5 条 domain rows/retained events 与 marker 一致，seq=0、queue=0、outbox=0、pending=null、lease=null、more=false，没有合成新的本地事件。
- 服务端请求 10 是首个 manifest PUT 201；此后只有请求 11 GET manifest 200 和请求 12 GET 唯一 snapshot part 200。没有读取 state.json/legacy backup，没有发布 batch。snapshot part plain SHA256 与 manifest 引用一致，为 `d21392d67a52d336ddacc6fc0ec68d3b58d43dea038f808835d9455f2f8b0d26`。

A30 marker SHA256：`0c350130a434aa48d230d6c61959532af9eee7559984f0b904675ca8e97447af`。

## 原始证据绑定与文件导出

- 293 条 execution 命令对应 586 个 stdout/stderr；570 个本地文本流逐项复算长度/SHA256并匹配命令和采集 inventory，16 个二进制 stdout 仅对照云端记录。11 个 native.before、9 个 native-result、2 个 native.gate 的本地 hash 进一步与 evidence-read 原始流绑定；case.json 的 operation 与独立 process.json 也相同。
- 11 个 native PID 全唯一，OS 主进程退出 PID 集合与其精确一致：9 个 reason 10/subreason 21 FORCE STOP，2 个预定 reason 2/status 9 SIGKILL。24 个独立 OS 退出还包括 13 个 WebView（5 EXIT_SELF、8 reason 13，均 subreason 17 ISOLATED NOT NEEDED）。11 组 crash-log stdout/stderr 均空，未见本轮额外主进程启动崩溃；不据此关闭历史稳定性问题。
- 11 次操作各记录四个数据库文件，共 44 个观测：15 preserved、29 valid missing。preserved 为 11 个主库和两次死亡各一个 WAL/SHM；两份 WAL 均 32,992 B，两份 SHM 均 32,768 B。30 条前后 available probe、29 条 missing probe 与 metadata 一致；主库均记录 SQLite header valid。
- preserved 的 before、transfer、after、local-readback 记录及云端文件 inventory 大小/hash 一致。这里只验证已归档的文本记录，没有本地重新打开或执行数据库。
- 全部执行命令中，唯一改变数据库目录的动作是 A30 明确记录的 isolation move；没有 DB copy/push/pull/reset。四次 initialize 均在对应 DB 缺失时执行，其余打开已存在 DB。
- 20 个 cloud snapshot/backup/manifest/batch 文本 payload 的 UTF-8 大小和 plain SHA256 均独立复算匹配；未读取 gzip 二进制或宣称独立复算 wire hash。
- build receipt、execution 和云端 inventory 绑定同一 APK SHA256=`c350c2fb113c00193fa7462cefd20c1a3f352913189cb75c651a126919105c5e`，inventory 大小 162,915 B，build sourceSha 匹配 edfde91。没有本地 APK 二进制复算。

## 保留限定

本次修复仅将失败再采集目录改为独立 `failure-database`，以免原失败证据被 EEXIST 遮蔽。此次 11 个操作没有 failed 状态、failure-stop 或 failure-database；成功路径能够验证正常功能没有回归，**没有动态触发并验证异常 catch 分支**，也不能宣称该采集修复解决了 Google Play 服务依赖死亡。

原 f9/run45186305462 的 A26 初始化失败和第一轮 missing DB、二次采集 EEXIST 仍保持原始失败记录。新 2/2 不重写旧失败，也不代表所有 Android 启动问题消失；新 source 的其他工作流需单独判断。

采集器：GitHub conclusion=success，collectionExitCode=1，evidenceComplete=false，16 个 binary-in-text-evidence-path。它们是 11 个主库 stdout、2 个 WAL stdout、2 个 SHM stdout和 A30 isolation 主库 stdout，均保留云端索引；本地文本归档不含这些二进制。

同级完整性审查 `work/c007-edf-android-kill-integrity-only-raw.json`：725 个本地文本 / 2,489,200 B，818 个云端 inventory 记录；3 个 producer manifests 共 857 行，其中 754 行本地字节匹配、103 行云端记录匹配，0 unclosed / 0 issues。此完整性 JSON 的 C007 execution 栏位不适用于本 C006 运行。其 SHA256=`42018d28567f06f0b0a0c74b514d04736de0908aa075278e2d290c0df3a03cc3`。

独立语义静态脚本 `work/c006-edf-kill-semantic-audit.ps1` 的结果为 `work/c006-edf-kill-semantic-audit.json`，6,829 B，SHA256=`0be23149ff4b145ffa2c4b23ed2904bea017ccaa3e8ef3c274f76202224fe0b3`，issues=[]。ZIP 复算由主 Agent 完成，本审查未独立重新计算 ZIP hash。
