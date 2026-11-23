# C0-07 四轮逐场景结果

2026-11-23（Asia/Shanghai）。本文件汇总已经完成独立审阅的四次 C007 GitHub 运行；不包含 C006 新 core 运行，不发布整体验收结论。完整失败检查名、原始错误和每个 summary 的 SHA256 见同名 JSON。

| 阶段 | source / run | 场景通过/失败 | 尝试 | 检查 | 失败检查 | 原 collector |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 首轮 | `4a8dd94f7fbceeb0583c37cc7aefdb29e9937691` / `45180141745` | 19/11 | 141 | 1644 | 47 | exit 0；complete=true；排除 0 |
| 补强夹具红测 | `feb0dca3a56ca8cc83d118d1b828b8f69ec768d2` / `45183273190` | 27/3 | 187 | 2299 | 33 | exit 1；complete=false；排除 114 |
| 生产修复后 | `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277` / `45186305189` | 29/1 | 187 | 2299 | 3 | exit 1；complete=false；排除 114 |
| inspect夹具修正后 | `de7ce40ccac3e963108a3a9af7c875186f822cce` / `45190559178` | 30/0 | 187 | 2299 | 0 | exit 1；complete=false；排除 114 |

“尝试”含 seed、预期拒绝和预期退出，不等于成功业务操作；检查和重开审计不叠加进尝试数。表格单元格为 **状态；尝试 / 检查 / 失败检查**。首轮 Android 的“入口失败”表示未取得业务完成回执，不能当作目标故障已执行。

## javascript

| 场景 | first4a8 | strengthenedfeb | f9 | finalde7 |
| --- | --- | --- | --- | --- |
| `sql-atomicity` | 通过；10 / 109 / 0 | 失败；11 / 128 / 2 | 通过；11 / 128 / 0 | 通过；11 / 128 / 0 |
| `C007-batch-rejected` | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 |
| `C007-batch-response-lost` | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 |
| `C007-manifest-rejected` | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 |
| `C007-manifest-response-lost` | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 | 通过；5 / 55 / 0 |
| `C007-ack-delete-failed` | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 |
| `C007-ack-meta-failed` | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 |
| `C007-ack-commit-failed` | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 |
| `C007-after-ack-commit-exit` | 通过；5 / 51 / 0 | 通过；5 / 51 / 0 | 通过；5 / 51 / 0 | 通过；5 / 51 / 0 |
| `C007-before-ack-commit-exit` | 通过；5 / 53 / 0 | 通过；5 / 53 / 0 | 通过；5 / 53 / 0 | 通过；5 / 53 / 0 |

## windows-c

| 场景 | first4a8 | strengthenedfeb | f9 | finalde7 |
| --- | --- | --- | --- | --- |
| `sql-atomicity` | 失败；31 / 445 / 27 | 失败；31 / 447 / 29 | 失败；31 / 447 / 3 | 通过；31 / 447 / 0 |
| `C007-batch-rejected` | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 |
| `C007-batch-response-lost` | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 |
| `C007-manifest-rejected` | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 |
| `C007-manifest-response-lost` | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 | 通过；5 / 65 / 0 |
| `C007-ack-delete-failed` | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 |
| `C007-ack-meta-failed` | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 | 通过；5 / 66 / 0 |
| `C007-ack-commit-failed` | 通过；5 / 66 / 0 | 失败；5 / 68 / 2 | 通过；5 / 68 / 0 | 通过；5 / 68 / 0 |
| `C007-after-ack-commit-exit` | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-before-ack-commit-exit` | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |

## android

| 场景 | first4a8 | strengthenedfeb | f9 | finalde7 |
| --- | --- | --- | --- | --- |
| `sql-atomicity` | 入口失败；1 / 2 / 2 | 通过；10 / 117 / 0 | 通过；10 / 117 / 0 | 通过；10 / 117 / 0 |
| `C007-batch-rejected` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-batch-response-lost` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-manifest-rejected` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-manifest-response-lost` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-ack-delete-failed` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-ack-meta-failed` | 入口失败；1 / 2 / 2 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 | 通过；5 / 60 / 0 |
| `C007-ack-commit-failed` | 入口失败；1 / 2 / 2 | 通过；5 / 61 / 0 | 通过；5 / 61 / 0 | 通过；5 / 61 / 0 |
| `C007-after-ack-commit-exit` | 入口失败；1 / 2 / 2 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 | 通过；5 / 56 / 0 |
| `C007-before-ack-commit-exit` | 入口失败；1 / 2 / 2 | 通过；5 / 58 / 0 | 通过；5 / 58 / 0 | 通过；5 / 58 / 0 |

## 计数与语义边界

- 首轮 Android 构建/安装准备成功，但十个 seed 入口均无业务结果；10 次约 150 秒 ADB instrumentation 超时，只有 20 条失败检查。目标 SQL、发布、ACK、事务边界死亡与原库重开均未执行完成。入口打包导入名不匹配已有源码/打包清单证据；没有伪造直接 WebView import-error 日志。
- 首轮 JavaScript 55 次/601 检查通过只代表当时覆盖；补强后 56 次/620 检查包含真实事务回滚二次失败，旧生产代码的两条首错/secondary rollbackError 检查失败。
- 补强轮 Windows SQL 有 29 条失败、ACK COMMIT 场景另 2 条失败；Node 另 2 条，共 33。f9 修复生产错误后仍保留三条 inspect 字面 :operation 失败，:observer 本身通过；de7 仅修夹具接受值计算。
- 最终 de7：Node 53 普通结果+3 预期退出、Windows 73+3、Android 52+3，共178普通结果、9边界退出、187次原库新进程审计。Android没有通用faultHits字段，不能把通用计数0解释为没有故障。
- Android边界死亡的系统信号是SIGKILL；86是宿主worker对已证实边界的协议退出码。首次入口超时、清理force-stop和预期事务死亡各自保留原语义。
- finalde7生产执行通过，原collector仍为exit1/incomplete、114项排除。归档完整性、执行结果、采集结果与最终验收资格分别记录；本文件不改判任何红测。

## 输入锚点

JSON中的 inputs 列出 138 个输入的完整相对路径、字节数和SHA256，120个原始case summary均与各轮文本索引核对一致，并与已有审计计数一致。本次只汇总旧证据，未重跑项目。核心审计锚点：

| 输入 | SHA256 |
| --- | --- |
| `work/c007-first-red-integrity-audit.json` | `12fcbdd3e5e339d23eb5ddbc4400743b959ec6ee55deeaccbc0e71fd0d22f57e` |
| `work/c007-strengthened-red-integrity-audit.json` | `2252cc77ce8939274b21ef925c963a9f4286c99ed0d399d0427c4191d02baa00` |
| `work/c007-f9-production-integrity-audit.json` | `35bc08ced53013d9e8aef874fd4ea588e83c2f47c3e52151a03254c695bf2c8f` |
| `work/c007-de7-production-integrity-audit.json` | `61d72889e7a5473235b1a8390648f15b9ef63e366505a13d3d763a5e99a9497f` |
