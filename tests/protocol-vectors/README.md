# C0-03 共同协议向量

截至2026-11-23（Asia/Shanghai）建立72个共同案例，唯一套件为 `suite.json`。协议依据是既有 `docs/sync-v2.md`、`docs/webdav-sync-implementation-guide.md` 和三端生产实现；夹具不设另一套合并算法或新WebDAV协议。

本文件记录测试合同及执行入口，尚不是云端执行记录。是否 passed/failed/blocked/skipped/static-reviewed 以同一源码 SHA 的实际三端结果和日志为准。历史阶段0 run、unsigned APK、CI绿色或单端运行不能证明三端一致。

## 套件范围

| 范围 | 具体案例 |
|---|---|
| 真实生成/接收 | basic-note、unicode-body、causal-field-trimming、multiple-entities |
| 重复、乱序及冲突 | duplicate-events、reversed-events、A/a与短横线actor排序、独立字段、同字段冲突、篡改重复事件 |
| 墓碑与迟到事件 | tombstone-late-old、tombstone-concurrent-edit、explicit-causal-restore、sparse-retained-seq |
| 编码与输入 | Unicode正文、ASCII标点ID、actor80/81、ID ASCII200/201、CJK66/67、emoji100、key数量/顺序/类型、context类型/负数/安全整数 |
| 整数 | seq/clock安全整数、manifest heads INT32与安全边界、prepare INT32溢出、四个remote cursor调用边界 |
| 批次与快照 | missing中间批次、重复拉取并重开、501事件拒绝、快照片段缺失/哈希错误/epoch错误、快照cursor边界、真实第二片段SQL失败后恢复 |
| SQL与持久化 | 实际SQLite meta UPDATE触发器、local/remote回滚、pending/outbox保留、所有模式关闭重开再导出 |

event.seq 与 batch.index 是不同概念，稀疏保留字段版本不要求event序号连续。缺失中间批次使用真实 pull 和物理缺失文件验证，不能以事件序号缺口替代。

`expectationMode:"contract"` 用已有协议的确定行为判定。`"observation"` 保留各实现的真实接受/拒绝和状态，供 C0-04–07 定位差异；执行器完成观察并不表示该输入获得新规范批准。

## 真实入口与状态导出

JavaScript 使用 `src/sqlite-store.mjs:createSQLiteStore` 打开真实 `tasks.sqlite`，生产 replica.mjs 生成、合并和提交；meta/rows/outbox从真实存储读出。Windows使用实际 database.c、sync.c函数和vendor SQLite。Android使用生产Java AccountStore/ReplicaDatabase及实际WebView共享模块；缺少真实SQLite运行环境须blocked。

共同执行器只调度案例和整理输出。delta私有入口采用原源文件逐字节复制、末尾追加export的云端临时测试模块，分别记录原文件和适配文件SHA256；不修改函数体或原生产文件。Node关闭重开数据库；Android适配还可以由其云端驱动force-stop后新进程report验证。

输出保留完整raw/reopened、field record、conflicts、墓碑、actor/seq/clock/vector/cursors/queue/pending/outbox。规范化只处理对象键及实体行顺序，保留event和冲突选择数组顺序。pending.body的对象键可作语义比较，原batch/events/pending字节另行比较并报告差异。

当前生产schema没有独立接收收据或按目标投递账本。报告明确写absent；没有为本轮发明表、修改旧全局ACK或开始D1。

## 云端命令与夹具

```text
node tests/protocol-harness/js-harness.mjs generate|receive|report
  --suite tests/protocol-vectors/suite.json --case CASE
  --db-dir RUNNER_TEMP/isolated-case --output result.json
  [--input producer-result.json --fixture-url http://127.0.0.1:PORT]
```

fixture-server.mjs导出 `materializeFixture({suite,caseId,sample,directory})` 及 `startFixtureServer({directory,port:0})`。有fixturePlan的案例先用真实producer.wire.events/records生成具体one-case suite和磁盘文件，接收端使用resolved-suite.json；原suite中不存在需要三端另行解释的快照占位协议。

HTTP夹具只监听loopback；原路径 `/dav/C003/v2/...`；gzip文件实际保存和传输gzip字节，无Content-Encoding自动解码；强ETag按wire bytes计算，快照SHA按解压UTF-8正文计算。条件PUT和GET均为真实HTTP/磁盘I/O，日志保存状态、字节数和哈希。它不表示真实坚果云或LAN功能验收。

Node故障注入使用隔离数据库的真实持久trigger，因第二连接的TEMP trigger不会影响生产连接；C/Android在生产handle安装真实TEMP trigger。触发失败后的原始错误、前后状态及重开状态均留档。完整读/提交/磁盘故障矩阵仍属于C0-07。

这些入口拒绝本机项目执行，数据库和物理夹具限定在GitHub runner临时目录。没有增加本机SDK、Gradle缓存，未更改业务源码、同步协议或数据迁移。
