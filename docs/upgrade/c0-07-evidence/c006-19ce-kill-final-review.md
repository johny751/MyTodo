# C006 19ce Android 中断独立复审

审查日期：2026-11-23。GitHub run `45199685578`、source `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa`、runAttempt 1。证据根目录为 `outputs/c0-07/evidence/45199685578`。只读取本地 JSON/文本、比较状态及复算文本长度/SHA256；没有运行项目、构建、SQLite、ADB、网络或读取 APK/数据库二进制。edf 旧审计文件未改写。

结论：A26 原库导入恢复、A30 新库快照接管两个指定边界均获本轮证据支持。11 次原生操作中，9 次普通结果、2 次目标进程死亡；全部身份、原始输出、系统退出和状态语义检查一致。独立静态审查结果 issues=[]。GitHub success 不改变 collector exit1 / evidenceComplete=false。

## A26 原数据库恢复

| 阶段 | 原生 PID | 已核实状态 |
|---|---:|---|
| after-real-import-commit 死亡 | 4407 | commit ok=true、rowCount=5；revision=3，6 rows/6 outbox，含原 local-note 和完整 legacy 内容 |
| 原库新进程 audit | 4779 | 原设备路径、actor、完整 meta、SQL entities/outbox 与死亡 marker 一致；audit 前后状态不变 |
| 未到期 lease 检查 | 5230 | busy=true；原 lease 与业务内容不变 |
| lease 到期后恢复 | 6733 | 同一原库和 actor；seq=6；6 rows/retained events 保持；outbox=0、pending=null、lease=null、more=false |
| 独立新库观察者 | 7111 | 6 rows/retained events 与中断 marker 一致，验证传播结果 |

原 actor 为 `d12fd7c5-a84b-4ab4-8b9f-65640507fbe5`。lease.until=`1795446171383`，busy 后设备时间=`1795446073351`；等待 `98232 ms` 正好为差值+200，恢复 before 的设备时间已经超过 lease.until。不是人工清除租约或换库后称为恢复。

中断时还没有 manifest，guard 指向 exact immutable legacy backup，其 plain SHA256=`041edff454885f7b2df161bdbfdbe93ad405869249bcc46ef56e176805c63f36`。恢复后已发布 manifest 引用的 batch 包含全部 6 个原 outbox 事件，每个恰出现一次。原库和新观察者的中文/emoji、父子任务、标签、地点、local-note、legacy-note 均完整，无重复 domain key。

marker SHA256=`bfd63026e357ff6500bb104635ced1869ddf8a75d34cc9ba515d4055a03f5bf4`。PID 4407 的 OS 退出为 reason 2/status 9；15:00:52.850 UTC 用 pidof 退出码 1、空 stdout/stderr 确认自然消失，15:00:52.851 UTC 开始导出。该 C006 分支没有在自然确认后、导出前执行 after-stop/failure-stop。

## A30 新数据库快照接管

PID 7474 在 `after-real-manifest-success-response` 死亡，marker 观察到 PUT manifest 的 HTTP 201；marker manifest 与 interrupted cloud manifest 相等，heads={}、没有 v2/b-*，原库 revision=3、5 rows/5 outbox，并留有未到期 lease。

原库目录按记录从 `files/protocol-cases/C006-A30-manifest-kill` 移至 `files/c006-retired-C006-A30-manifest-kill`，原路径确认缺失。移动前后主库大小 40,960 B、SHA256=`1d8c72293f1ac0bad0cd3fdd788397ba3079597a0ce11e2099b7976a08b56d11` 一致。这一动作是隔离 A30 原库，不是 A26 的同库恢复。

随后 observer 使用不同 dbCase、不同数据库路径和 actor `07a894c9-a68f-4e55-9e22-2ee7294c3110`；最终 PID 7882。5 条 domain rows 和 retained events 与中断 marker 一致；seq=0、queue=0、outbox=0、pending=null、lease=null、more=false，没有新造本地事件。

服务端请求 10 是首个 manifest PUT 201；其后只有两次读取：请求 11 GET manifest 200，请求 12 GET 唯一 snapshot part 200。未读取 state.json 或 legacy backup，也未发布 batch。该 part 的 UTF-8 文本 SHA256 与 manifest 引用一致：`14991dbe8d7ceff8bc37f87b16d7ccd488ef682c6a19fecb0713f2d6635ae28d`。

marker SHA256=`eeb880a2eb7087cab25517297fd86c7126a344273f2350e447ee3bbe0f83c093`。PID 7474 的 OS 退出为 reason 2/status 9；15:03:12.578 UTC 确认自然消失，随后按命令序列开始导出，同样没有在两者之间使用强制清理代替死亡。

## 退出、原始流和导出核对

- 11 个 native PID 全唯一，与已归档 OS 主进程退出 PID 集合精确一致：9 个 reason10/subreason21 FORCE STOP 和2个预定 SIGKILL。23 个独立 OS 退出还含12个 WebView：3个 EXIT_SELF、9个 reason13，均 subreason17 ISOLATED NOT NEEDED。11组 crash-log stdout/stderr均空。本轮未发现额外主进程首崩、CRASH/ANR/DEPENDENCY DIED，不能外推为历史启动稳定性已修复。
- 293条命令对应586条原始流；570条本地文本流逐项复算长度和 SHA256，与命令及 inventory 相符；16条二进制stdout仅对照云端记录。实际instrumentation文本代码与回执逐项一致：9次-1，2次 Process crashed/CODE0。ADB0或CODE0本身不表示业务通过。
- 11份 native.before、9份 native-result、2份 native.gate 的文件hash与evidence-read原始stdout绑定；case.json操作与独立process.json相等，请求/结果/source/attempt/dbCase/path身份一致。
- 44个数据库文件观测=15preserved+29validmissing。preserved含11个主库和两次死亡各一份WAL/SHM；两份WAL均32992B，SHM均32768B。30条前后available probe和29条missing probe匹配metadata；preserved的before/transfer/after大小与hash、云端文件库存和主库header/readback标志一致。
- 4次initialize均对应DB缺失，其余操作打开已有DB；执行记录中唯一改变数据库目录的命令是A30精确isolation move。没有DB替换、push/pull、清库或导出副本回放。
- 20个cloud文本payload的UTF-8大小及plain SHA256独立复算一致；没有读取gzip二进制或独立复算wire hash。
- APK在build、execution及云端inventory中的SHA256均为 `0b3894aeae264bc92b1bee7f78e462d1033a80c3f0d8c60cb10044c7cfc7daa1`，inventory大小162915B，build/source绑定19ce。环境ready/API34/x86_64仅作为环境信息；没有本地APK复算。

数据库导出属于进程停止后的逐文件稳定副本，不能称为跨文件原子或精确死亡时刻快照。状态证明来自准确native边界与后续原库/新库读取的结合；没有运行导出数据库重放测试。

## 采集资格与历史保留

原collector为exit1、evidenceComplete=false，16个binary-in-text-evidence-path未更改：11主库stdout、2WAL、2SHM、1隔离原库stdout。本地不含这些二进制，云端inventory保留其记录。

同级完整性审查 `work/c007-19ce-android-kill-integrity-only-raw.json`（SHA256=`b929295d81e36b51231b62358afe3dab1e862e30a518e07739042ff2d1624d54`）确认727个本地文本/2492676B、820个云端inventory记录，3个producer manifests共861行=758本地字节匹配+103云端记录匹配，archiveIntegrityPassed=true、0issues。仅完整性部分适用于本C006 run，不借用通用auditor的C007 execution verdict。

本轮未出现failure-stop/failure-database，故没有动态覆盖edf的异常补采catch分支。19ce的指定dbCase合同属于core runner，不能单靠本kill成功宣称其专门分支已被触发。f9 A26原始失败、edf A27换库/lease失败和其他历史结果仍保留；本结论只覆盖本run两项明确边界，其他门禁由各自执行证据判断。

本轮静态审查脚本及结果分别为 `work/c006-19ce-kill-semantic-audit.ps1`、`work/c006-19ce-kill-semantic-audit.json`。脚本在旧版静态审查上更换run/source/output路径并补充instrumentation原始文本检查；没有执行归档项目代码。ZIP的653673B及SHA256=`324d121e4d069d003d9e37b4f9d63c8f5dc9988c80822a0b6d8f36c773d60bb8`来自主Agent复核，本审查未重复ZIP复算。
