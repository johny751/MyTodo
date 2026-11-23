# C0-05 至 C0-07 执行计划

每项独立提交 GitHub，并在对应 run 中保留源码 SHA、工具版本、命令退出码、日志和产物 SHA256。

| 项目 | 文件范围 | 验收 |
| --- | --- | --- |
| C0-05 凭据互读 | `windows/sync.c`、`windows/credential-helper.c`、`src/sync-server.mjs`、Windows 合成凭据夹具 | 在同一 Windows runner 用户上下文调用真实 DPAPI。C 写 → Node 读、Node 写 → C 读，覆盖旧格式、Unicode、截断、错误前缀与损坏文件。确认失败后保护现有凭据，不在日志写明文，保持 Android Keystore 路径。 |
| C0-06 旧 WebDAV 云数据恢复 | `windows/sync.c`、`src/delta-sync.mjs`、`src/sync-core.mjs`、既有协议夹具 | 用合成磁盘服务分别中断 v1 备份、条件 fence 写入、读取 guard.backup、发布 manifest，重启继续并导出原始 SQLite。比较实体和墓碑、备份字节、ETag 条件操作及最终游标。真实坚果云验收与夹具分开记录。 |
| C0-07 SQL 错误传播 | `windows/database.c`、`windows/sync.c`、现有 SQLite 故障夹具与云端测试入口 | 对 prepare、step、读取、meta 更新、publish、ACK、COMMIT 分别注入真实失败。检查错误传递和重启后的 pending/outbox、cursor、批次字节、幂等回放。以事务成功作为可靠确认依据。 |

三项结案后再复核 [D1 进入条件](https://github.com/johny751/MyTodo/blob/master/docs/upgrade/09-phase-one-entry-plan.md)。
