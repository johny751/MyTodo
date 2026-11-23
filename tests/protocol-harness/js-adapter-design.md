# C0-03 JavaScript 适配入口草案（仅静态审阅）

2026-11-23，Asia/Shanghai。本文件是主 Agent 审定共同夹具合同前的入口分析，不是第二套协议标准，不是执行或通过记录。未执行本地项目构建、测试、打包或云端测试；未修改生产模块。依据为既有 `docs/sync-v2.md`、`docs/webdav-sync-implementation-guide.md` 和真实生产源码。

## 可直接复用的真实实现

| 生产入口 | 实际作用 | 测试用途 |
|---|---|---|
| `src/sqlite-store.mjs:createSQLiteStore(directory)` | 真实 `node:sqlite` DatabaseSync，打开 `tasks.sqlite`，WAL/FULL，生产 meta/entities/outbox 表 | 每个案例只用新建隔离目录；关闭后重新调用同一工厂打开同一文件 |
| `store.call({action:'inspect',keys})` | 读取真实 meta 和完整实体行 | 捕获修订、身份、vector/cursors 等事务前状态 |
| `store.call({action:'page',after,limit})` | 实体分页，包括墓碑、完整 record 与 conflicts | 导出所有保留字段版本，不用只包含可见项的 `state` 冒充快照 |
| `store.call({action:'outbox',limit})` | 持久 outbox 按队列 ID 排序，返回 meta 和 entries | 从实际生成事件得到样本；现 API 一页最多500，夹具不得静默截断 |
| `replica.mjs:initializeReplica` | 初始化实体、版本、outbox 与 meta 的同一真实事务 | 用生产空状态初始化新数据库 |
| `replica.mjs:editReplica(call,changes,settings,{context})` | 实际生成 actor/seq/clock/context、合并字段、写实体及 outbox | 生成方由共同夹具给定 `changes:[{key,values}]`，不在 harness 另写事件算法 |
| `replica.mjs:applyRemote(call,events,update)` | 校验/合并真实事件，写实体、vector/clock 与 update 修改的 cursor 的同一事务 | 接收其他平台导出的原事件；失败捕获实际异常后重开库导出 |
| `replica.mjs:updateMeta` | revision 比较并交换、meta/outbox附加事务 | 仅用于既有生产元信息操作，不新增 schema 或改 ACK 规则 |

`store.close()` 之后必须重新打开并再次读取。结果需分别保存操作前、操作后、关闭重开后的实际数据；无效输入不能用内存里的候选结果代替持久状态。

## 私有 delta 入口的测试访问建议

`delta-sync.mjs` 的 `manifestValue`、`bind`、`checkpoint`、`pull`、`prepare`、`publish` 是真实生产函数但未公开导出。建议云端测试构建临时模块：原文件内容逐字节复制，末尾仅追加选定 `export`，文件放在相同 import 基准目录，并记录原模块和临时适配模块 SHA256。原生产文件不修改，原函数体不替换。此访问方式需主 Agent 串行审定；不能把它描述为现有公共接口。

- manifest 边界直接调用真实 `manifestValue` 解析原始 fixture 字节，记录接受/拒绝与错误。
- pending batch 生成应调用真实 `prepare`，从重开库的 `meta.pending.body/path/through` 取得原批次样本，不在 harness 发明 envelope。
- 缺失中间批次必须调用真实 `pull`。`applyRemote` 本身允许稀疏事件序号；事件 seq 不等于 batch index，不能在 harness 增加另一套“事件必须连续”规则。
- 快照片段恢复必须调用真实 `checkpoint`；手工把 record.events 展平后调用 applyRemote 只能证明事件接收，不能标为 checkpoint 恢复通过。
- 传输若需要，使用明确的真实 loopback fixture 文件服务和真实 HTTP/TLS 请求，服务只提供原字节、ETag、gzip及故障文件状态，不实现合并算法。不用 Map/mock fetch 替代真实存储或真实同步核心。不接触真实坚果云或生产凭据。

## 输出与比较边界建议

输出保留完整原始 `meta`、完整 `rows`、`outbox.entries`、原始错误和实际处理结果。可另外生成比较投影，但它只能整理对象键和实体行顺序，不能重新排序 `record.events` 或冲突选择数组而掩盖生产的 A/a/actor 排序差异。

语义比较的必需字段为实体数据、完整字段版本 record、conflicts、墓碑、actor/seq/clock、vector、cursors、queue、outbox和pending。设备本地 settings、lease 的随机 token/墙钟应保留但单列；revision/dataRevision 可单独比较并说明不同调用次数，不静默删掉。具体投影由主 Agent 审定并统一给 C/Android。

现有生产表没有独立持久接收收据或按目标投递账本。必须明确报告该缺口，导出已有 pending/cursors/outbox 的持久字段；不虚构 `SyncReceipts` 表，也不为本轮测试改旧全局 ACK 或提前开始 D1。

## SQL 故障注入建议

在生产 store 打开后，用第二个真实 SQLite 连接对同一隔离 `tasks.sqlite` 安装 `BEFORE UPDATE ON meta` 的 `RAISE(ABORT,...)` trigger。实体写入后 meta 更新失败会执行生产 commit 的实际 ROLLBACK。记录前后和重开库的实体/vector/cursor/outbox；只删除本案例创建的具名 trigger。不要把 throws 的 mock call 当作 SQL 失败。

该基础触发器场景不等于 C0-07 的所有错误传播验收。读失败/prepare/COMMIT/磁盘故障等完整矩阵仍由 C0-07 独立实施。

## 边界夹具建议（待统一合同审定）

- A/a、合法短横线 actor，非法 `!`/`_` actor；ASCII 标点可放在合法实体 ID。
- ASCII ID200/201、CJK66/67（UTF-8 198/201字节）、emoji100（UTF-16 200单元/UTF-8 400字节），同时保存原始编码长度。
- key 二项/三项、kind与id交换、类型错误和非法 JSON key 字符串，保留原输入类型。
- context object/null/array/string/number、各 actor 的负数/unsafe seq。
- 安全整数、INT32边界及 heads/cursors 原始 JSON数字边界。
- 重复、乱序、字段片段、同actor/seq但被篡改值、并发冲突、墓碑/迟到旧事件、快照片段失败恢复和真实 SQL 回滚。

测试生成样本、接收样本、关闭重开、导出应由三个真实实现参加；Android 缺真实运行环境时必须 blocked，不能因为这份入口草案或 JS 单端 SQLite 结果而声明 C0-03 三端通过。
