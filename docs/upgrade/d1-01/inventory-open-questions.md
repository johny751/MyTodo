# 未确认事项

2026-11-24（Asia/Shanghai）。源码固定到 `bc3f44d1e76a988dbe269edcf1c606eebec37293` / `ca00c2504a31198f2d49e787483f9ebd2a48a7da`。`UNKNOWN` 表示该事实无法由目前保留的输入确定。`NEEDS INVESTIGATION` 表示知道入口和待验证问题，结论有赖后续获批证据。业务数据只有原记录或内容字节仍在时，才有条件讨论无损映射。

| 项目 | 状态 | 已有证据和缺口 | 影响 |
| --- | --- | --- | --- |
| 用户现存每库 schema、引擎对象及索引计划 | `UNKNOWN` | 三端新开库和 GUI/反馈 DDL 可读，实际旧库、`sqlite_schema`、Android `android_metadata`、WebView/浏览器内部库、厂商持久化及 `EXPLAIN QUERY PLAN` 未读取 | 源码表数不能当成任何现存设备的库清单；索引定义不保证优化器命中 |
| 异常 JSON 的 SQL 投影 | `NEEDS INVESTIGATION` | C `db_put`、Node `put.run`、Java `optXxx` 的方法可定位；具体 Android API 框架实现在显式 `JSONObject.NULL`、数字文本、溢出下须用对应平台验证 | 影响当前 `parent_id/quadrant/reminder_at/start/done` 的异常读值；原来字段的缺失、null 和空不能按投影值倒推 |
| 遗留业务样本与已发布二进制行为 | `UNKNOWN` | 当前源码保留 `state.json`、`tasks.json`、`sync-base.json` 等读取分支。历史包中的实际 schema/DataVersion、失败数据库及用户样本未收集 | 无法证明所有旧数据范围、未知字段、重复 ID、时间无偏移的来源，也不能假定每个版本均可导入 |
| 父关系失配、循环与 Windows 搜索缓存 | `NEEDS INVESTIGATION` | 导出/业务读端有根级回退。Windows 搜索触发器取新行及其祖先，旧祖先在原地换父后的失效覆盖需复核，不同读端还有限深和索引筛选 | 需要保留原 `parentId` 与行/事件；派生树和派生搜索文本不能当作唯一证据 |
| 跨端循环生成异常边界 | `NEEDS INVESTIGATION` | `src/schedule.mjs` 与 `windows/tasks.c` 的活跃行/墓碑去重与子任务时间不同；历史超长 `seriesId/generatedFrom`、负时间、无效日期或合并后异常规则未测 | 保留原 ID 和已生成事件，避免无证重建、补造来源或改写创建时刻 |
| 同名分类和悬空引用 | `UNKNOWN` | 本地目录操作会维护同名引用，协议可从其他入口收到行/墓碑；无 SQL FK 验证唯一归属 | 名称缺项/重复时单列风险，无法凭名称或当前可见目录证明旧项目 ID |
| 旧留档源、导入后的去重与缺损 | `UNKNOWN` | `reminder-receipts.json` 有读端，设备上其原始生成及是否每次完整不可推定。当前便签导出与全账本的载体不同，JS 可折叠未知字段和空值 | 仅剩 token、聚合、规范化导出或没有偏移的时间戳时，无法还原原记录或来源时刻 |
| SQLite WAL 与文件同时一致 | `NEEDS INVESTIGATION` | 源码可读 WAL/pragma、事务和本地复制路径，未验证真的断电、WAL checkpoint、目录级完整性或同库恢复 | 一致备份、T15/T16 和同一数据库恢复仍是后续生产安全门 |
| Android Feedback Kit 完整依赖与历史包 | `NEEDS INVESTIGATION` | 已读固定 AAR 的 schema、存储、恢复以及资产索引。完整上游源码、历史 namespace 或厂商存储环境未获；设备实际归档与落盘现状 `UNKNOWN` | 根据现存记录及原图保留；SHA-256、标题或 URI 都无法恢复丢失的图片字节 |
| Android 原生计时、通知及反馈瞬态 | `NEEDS INVESTIGATION` | 偏好文件、计时锚点和会话控制可定位。boot 计时对齐、OS alarm 到达、通知权限、SAF URI 生命周期与首崩未在本阶段运行 | 番茄钟聚合不能逆推完整会话；不得把模拟或静态证据解释成真机验证 |
| 业务附件、LAN 以及双目标 ACK | `NEEDS INVESTIGATION` | 现行五种同步 kind 无任务附件；Android 反馈图片是另一存储。现有 outbox 没有每目标回执，任务备注中的字符串不提供文件完整性 | 保留附带元数据的设备本地反馈，未知字段内的历史附件式信息仍 `UNKNOWN`，将来需要独立传输和投递证明 |
| Windows 同步过期会话与真实服务 | `NEEDS INVESTIGATION` | `sync.c`、`delta-sync` 的租约、缓存、发布和 ACK 可静态定位。迟到结果与生产落盘交错、真实 WebDAV/LAN、Windows C 旧 v1 导入安全边界仍沿用此前证据 | D1-01-A 不产生新的运行证据。后续先确认数据与凭据边界、恢复及冲突结果 |
| Android issue #1 | `OPEN RISK` | 本次直接读取 GitHub issue 状态为 Open。原始首崩、同库、换库和 collector 证据保留在阶段 0 | 盘点与验收未关闭该问题 |

详见 [Windows 盘点](windows-storage-inventory.md) · [Node/Web 盘点](node-web-storage-inventory.md) · [Android 盘点](android-storage-inventory.md) · [同步安全审查](../phase0-final-review/sync-safety-review.md) · [Android 证据](../phase0-final-review/android-stability-risk.md) · [issue #1](https://github.com/johny751/MyTodo/issues/1)。
