# D1-01 源码、执行与生产边界

2026-11-24（Asia/Shanghai），候选 `d1-01-candidate.1`。

**FACT（授权与执行范围）。** 本批只修订 `docs/upgrade/d1-01/`，新增和修正 `tests/d1-01/` 及专用工作流 `.github/workflows/d1-01-contract-validation.yml`。本机仅文本、归档与哈希处理；项目编译、测试和 SQLite 执行均在 GitHub Actions 的合成环境。Codespaces 只执行 Git 发布、GitHub 回执读取、ZIP/JSON 与文件哈希处理。起始 master 为 `1a55ea6da9f2012d7ba82d5756ae8f61d87bae47`；最终路径差异、提交身份和源字节核验以集中交付的 publication receipt 为准。

**FACT（静态入口）。** C 工具使用仓库封存的 SQLite/cJSON 与独立生成器；Node 工具使用 `node:sqlite`；Android 使用独立包 `local.mytodo.d1fixture` 的 Instrumentation/SQLiteDatabase/JSONObject，未引用生产入口，manifest 未申请 INTERNET。Python 参考工具在三端生成的合成库副本上计算投影、迁移登记、故障、备份/恢复与比较。原始列的三端 SQL 类型差异单列报告，不能写成生产三端原值完全相同。

**FACT（参考实现范围）。** `target_hash` 只覆盖 `d1_raw_sources/d1_projection/d1_relations` 行值。现行参考 registry 的六列是 `migration_id/checksum/source_hash/target_hash/candidate/status`；checksum 覆盖五份代码的有序原字节（含 framework_metadata.py）。参考预检现对照已知核心及候选的全部 sqlite_master 对象；仍未登记独立目标 schema 指纹、planChecksum/sourceSnapshot/targetSchemaId，生产版本矩阵和历史布局未验证。参考迁移仍含位置型 INSERT，S09 只验证独立 outbox 命名列示例。上述设计要求仍属 PROPOSAL，不应报告为全量生产 runner 能力。

**FACT（参考恢复范围）。** restore gate 比较原核心 typed/raw state 和合成 remote evidence，差异或证据缺失拒绝覆盖，只返回离线候选资格；automaticActivation=false。未实现生产 B/S/A 活动指针、远端认证/批次对账、Actor 排他、跨文件共同 writer 屏障或激活后副作用回退。不能从参考工具的通过推出“恢复旧数据库可安全继续生产同步”。

**FACT（反馈夹具范围）。** Android 反馈是独立 records/assets/links/settings 四表，validation 另有恢复临时 archive_entries，使用固定 1px 合成 PNG 原字节和少量草稿/meta。图片原始字节与自包含备份可由 F01/F02 核验，生产 Feedback AAR、SAF/URI 生命周期、软删除与撤销历史、真实跨文件一致屏障仍 UNVERIFIED。

**UNVERIFIED / BLOCKER。** 真实用户旧库、历史发布读写、全部标签/循环来源图、跨账本身份、生产 writer 隔离、实际同库恢复、T15/T16、掉电、凭据、真机反馈/闹钟以及真实 LAN/WebDAV/双目标同步均未获本批证明。Android issue #1 继续 Open。

**PROPOSAL / OWNER DECISION。** 候选只用于集中审核及后续独立工具规划。完成本工作包后停止；D1-02 生产实施、真实迁移或双通道启用必须另行获得授权并满足对应门槛。

## CI5 限定补充：Android Framework 元数据

**FACT（独立合成环境）。** [CI5 45367557986](https://github.com/johny751/MyTodo/actions/runs/45367557986) 的独立 Android Framework SQLite 库含 `android_metadata(locale TEXT)`。Java 在关闭连接前记录原 DDL、列定义及 locale 的 SQL 类型和原字节；封存后由只读比较器与原库核对。该对象与核心三表、反馈四张业务表分开报告，备份与候选副本完整保留。S44–S52 验证精确来源资格、类型/行/结构异常和原库保全，未通过名称猜测、删除表或标准化 locale 来通过测试。

**PROPOSAL / UNVERIFIED。** 将平台/Framework 元数据归入设备本地和来源证据域，不作为新的业务 kind，也不加入旧同步白名单。上述 FACT 限定到本轮独立 API34 夹具；真实旧数据库、其他 Android/厂商版本及生产存储入口是否具有相同对象仍未验证。跨端交接和恢复须保留来源并另行识别目标能力，不能据此将未知系统表普遍放行。
