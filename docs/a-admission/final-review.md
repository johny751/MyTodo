# A 线生产准入 — 独立候选审核报告

2026-11-25，Asia/Shanghai。

FACT（隔离测试）：Actions [45510885521](https://github.com/johny751/MyTodo/actions/runs/45510885521) attempt 1 成功。验证源码 `8fb3260b6207169a7a0bdd43bde1585aa4a3ab53`，已验收 D2 基线 `b94f522993f44b83727926ec9db4caa374ffdc71`。Node v24.22.3 / SQLite 3.54.1，32/32 具名用例通过，失败 0；报告明确 `productionAdmission:false`。

FACT（原件）：官方 artifact ZIP 通过 GitHub digest 核验，原日志、元数据、合成源库/WAL/shadow、附件、审计与失败注入证据完整保留。下载证据 ZIP 295424 字节，SHA-256 `6caa31da01128573b9ecd3fd75f46b82af71de822dad144fcbbaae97e0f9d3e6`。本机只解包、文件/哈希核验，不运行 SQLite 或项目测试。

## 本次已验证的独立能力

| 范围 | FACT：合成环境中的实际验证 | 生产状态 |
|---|---|---|
| 只读预检 | 原文件只做 OS 读/复制；SQLite 只开 shadow；原 DB/WAL/SHM/journal 前后摘要不变 | BLOCKER：真实布局和启动前接入未核实 |
| WAL 一致性 | 真实子进程退出遗留已提交 WAL，包含已提交事件、排除未提交事务 | UNVERIFIED：真实三端完整 GUI 生命周期 |
| 类型和原值 | REAL64 位、超 JS 安全整数、BLOB 与 NULL 保留 | UNVERIFIED：真实历史数据 |
| 完整性 | shadow integrity/FK；损坏未使用索引页也拒绝准入 | UNVERIFIED：生产调用集成 |
| writer 屏障 | 已登记 fixture writer drain/close；缺失、未知、晚到、在途失败、未知关闭、撤销及复制中失效均拒绝 | BLOCKER：完整跨进程生产 writer 清单与屏障 |
| 身份 | 实际候选源码/runtime/Actions/run/attempt/tool checksum 绑定；缺失身份拒绝 | OWNER DECISION/BLOCKER：正式发布签名与信任根 |
| 同步状态边界 | 合成 Actor/outbox/snapshot 约束，未知布局、版本、Actor、outbox、推进状态拒绝 | BLOCKER：真实远端认证和进度新鲜度 |
| 审计 | primary/rollback/close 异常完整序列化；run/attempt、hash chain、闭合 finalTip/count；篡改和干净尾部截断拒绝 | OWNER DECISION：可信外部终端锚和正式调用链 |

FACT：直接以 SQLite readOnly 打开原文件的 sidecar 观察只是一项反例，不是“零写入”证明；正式独立工具采用原文件 OS 读 + shadow SQLite。普通文件访问时间元数据不包含在组件字节不变声明内。

## 保留的生产 BLOCKER

BLOCKER：真实用户数据库结构兼容、全部实际写入者（业务/同步/反馈/图片/后台/跨进程）登记、启动前只读预检、正式完整构建身份、数据库/附件/独立反馈库共同快照、多文件持久激活/掉电恢复、同库恢复的真实复制进度认证、真实远端 A 的权威性及新鲜度、Android issue #1。

FACT（只读 GitHub 状态核验）：[Android issue #1](https://github.com/johny751/MyTodo/issues/1) 为 OPEN，标题为 “Android instrumentation intermittent crashes: preserve failed original databases”。本次未关闭、绕过或宣称真机故障解决。

UNVERIFIED：本次独立 Node 工具成功不代表 Windows C、Android Java 生产预检接入完成，也不代表任何真实迁移、恢复或同步通过。已验收 D2 历史失败和 UNVERIFIED/OWNER DECISION/BLOCKER 全部保留。

## 负责人后续决策

| OWNER DECISION | 具体操作/影响范围 | 回退与批准前证据 |
|---|---|---|
| 真实结构核验范围 | 指定版本、平台、只读元数据内容及允许的数据去向；当前仍不读取用户库 | 原库不改动；先批准明确范围并检查影子预检32用例与 writer 假设 |
| 正式身份信任根 | 发布源码/程序/依赖/签名绑定和验证位置 | 独立工具保持禁用；提供签名策略与正式构建证据后审核 |
| writer 接入范围 | 明确全部生产写入入口及关闭/重开生命周期 | 默认拒绝准入；先补三端 API 与真实生命周期的隔离测试 |
| 恢复持久化协议 | DB、附件、反馈库和复制进度共同激活/中断判定 | 禁止简单恢复旧库；先提交多文件掉电/远端进度证明与回退协议 |
| 远端认证及 issue #1 验证 | 明确权威服务、认证、新鲜度、失效策略和 Android 专项用例 | 未授权服务与同步保持关闭，失败原件保存 |

FACT：A 分支不合入 master/main 或 B/D4，未启用生产入口，未读取真实用户数据，未执行迁移或 LAN/WebDAV，不改变生产 ACK/outbox/cursor/manifest/batch。代码与生产接入分别审核。本包在独立工具与证据交付处停止。
