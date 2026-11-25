# D4-03 冻结来源复核：九条旧快照误绑定

2026-11-25，Asia/Shanghai。此报告是静态源码与文件哈希复核；项目构建、测试、SQLite、应用或同步执行数为 0。原失败、原清单和原功能审计保留，由主 Agent 集中修订候选来源说明。

**FACT：Actions 45543877533（源码 c61d1ed）的范围检查通过，但来源检查失败。** 原审计清单共 99 条，九条误将旧本地快照的 hash/bytes 绑定到冻结 master `d4c5af4cbbb9192c19276dd371bd142c2b835534`。九条全部精确匹配 `original-task-coverage.md:9` 记载的旧本地 `MyTodo-master` 文件；与固定提交下载的原字节、LF 变体和 CRLF 变体均不匹配。旧文件和新文件均为 0 CRLF。这次来源失败属于内容及历史快照差异，不能解释为换行问题。

原本地快照路径为 `C:/Users/adwoo/Documents/Codex/2026-11-23/mytodo-agent-mytodo-agent-mytodo-github/work/source/MyTodo-master`。旧快照的完整 Git 提交身份仍为 **UNVERIFIED**；路径名不证明它属于当前冻结提交。

固定提交的九个原始源码已只读下载至 `canonical-baseline/<path>`。字节、SHA-256、计算出的 Git blob SHA-1、旧快照精确匹配与换行变体结果记录于 `canonical-source-static-review.json`。该 JSON 是先前本地静态观察，保留其当时的 `gitObjectVerification=UNVERIFIED`，不覆盖历史记录。

**FACT（主 Agent 提供的云端原始 stdout）**：独立 `reconcile-audit.py` 已在授权 Codespaces 对源码 `c534a03eb0bb186980ddb209811f4ea903e10c4c` 读取冻结提交的 99 个 Git blob。结果为 `filesExamined=99`、`corrections=0`、九个内容来源 `BLOCKER`、`candidateManifestWritten=false`；九项均不存在可证明的换行转换匹配。其余 90 项按原清单精确匹配，不需要修订。该工具没有运行项目、测试、构建、SQLite、应用或同步；这不是 GitHub Actions 测试通过结果。

云端证据目录为 `/workspaces/d403-canonical-audit-01`，含 `reconciliation-receipt.json`、`original-audit-manifest.zip`、`canonical-frozen-git-blobs.zip` 与 `SHASUMS`。主 Agent 正将集中归档 `d403-canonical-audit-01.zip` 发布到 `docs/upgrade/d4-03/evidence-resumed-01`。本报告冻结时归档发布提交和下载复核尚为 **UNVERIFIED**；不能提前编造提交 SHA 或把 stdout 转述等同于本子任务已重新读取全部云端逐条原始 receipt。

| 文件 | 原清单/旧快照 bytes | 固定 master bytes | 静态复核结果 |
|---|---:|---:|---|
| src/sync-server.mjs | 8195 | 8413 | 配置缓存按密文变化重新解密，并检查配置对象；旧快照只缓存解析后的配置 |
| src/sqlite-store.mjs | 4250 | 4505 | ROLLBACK 二次失败附到原异常，保留失败 COMMIT/语句的 primary exception |
| src/replica.mjs | 8586 | 10973 | 使用 isEntityId、完整协议字段验证、确定性冲突排序与相等比较、计数边界和同事务 cursor 更新 |
| src/model.mjs | 8649 | 8792 | isEntityId 检查非空字符串、无 NUL/孤立代理字符及最多 800 UTF-8 字节；旧版本限制为 100 字符 |
| src/delta-sync.mjs | 13883 | 21936 | 已有 manifest/pending/计数验证、远端迁移 guard 与 cursor/ACK 保护；不能用旧较短实现解释当前协议 |
| windows/sync.c | 22297 | 35249 | 已有 manifest/pending/counter 验证、远端 guard 和同步状态错误保护 |
| windows/native.h | 2330 | 2671 | 已有协议校验声明、2^53−1 计数上限；db_remote 的 index 参数为 double |
| windows/database.c | 18371 | 27857 | 既有 SQLite 错误传播、协议验证、冲突排序及同事务原复制状态保护 |
| windows/credential-helper.c | 2520 | 2659 | 解密结果拒绝空值、NUL 和非法 UTF-8，然后输出原字节 |

以上能力已经位于负责人指定的冻结 master 中，**没有作为本轮 D4 实现新增或修改**。scope 已通过的 productionDiff=0 与这些既有代码差异必须分开解释。

## 复核后继续成立的 FACT

- **个人任务模型**：固定 master `src/model.mjs:6–25` 仍按 Asia/Shanghai 和周一起始日处理日期；`:31–40` 仍移动同一任务并重排 quadrant/order；`:47–63` 仍用 visibleTasks 处理状态、日期、分组、搜索与手动排序。除 ID 验证和两行偏移外，这些函数相对旧快照保持相同。原菜单、四象限和导航审计可保留为原版历史；`original-task-coverage.md:64` 的旧 `model.mjs:30–38` 现应定位到上述冻结文件 `:32–40`，不能统一声称旧行号是冻结 master 的逐字节证据。
- **字段/关系语义**：固定 master `src/model.mjs:65–84` 仍保留 V2 的任务 project 名称字符串、独立项目实体 ID、place 字符串、tags 数组和原字段上限。项目名与任务 project 上限仍为 100 字符。`work-integration.md:32` 关于此上限的结论仍成立；实体 ID 使用 `model.mjs:3–4` 的非空、无 NUL/孤立代理字符、最多 800 UTF-8 字节规则，不能沿用旧 100 字符断言，也不能把这次来源纠正解释为负责人批准的新字段或数据库版本。
- **真实 Node 存储入口**：固定 master `src/sqlite-store.mjs:7–8` 仍使用账号目录 tasks.sqlite、WAL、FULL；`:22–34` 仍在 BEGIN IMMEDIATE 中检查 revision，并写业务记录、outbox、meta 后 COMMIT。`original-task-coverage.md:18` 的“错误回滚/抛出”结论应补充 `:30–34`：COMMIT/语句失败后的 ROLLBACK 二次失败附为 `rollbackError`，最终仍抛出主异常。`:39` 提供原 close 入口，实际关闭/重开效果仍需平台测试。
- **真实 Windows 存储调用链**：固定 master `windows/database.c:4–14` 为事务/错误边界，失败后检查 autocommit、尽可能回滚并保留主错误和附加回滚错误；`:337` 为 db_local、`:338` 为 db_remote、`:340` 为 db_edit_data、`:342` 为 task_default、`:347` 为 db_open。原任务和原复制事件仍经这些业务层处理。`original-task-coverage.md:20/56` 的旧 database.c 行号不能作为当前 master 的定位；不能由旧行号推断新任务工厂或原保存路径不存在。
- **独立 UI 边界**：九个受影响文件中，仅 `model.mjs` 被候选 `domain.mjs:3` 直接导入；其 model 输入与本次下载一致。`domain.mjs:78` 的 synthetic ID 检查明确复用该冻结 `isEntityId`。`build-demo.mjs:18–21` 的七模块白名单动态读取当前候选及冻结纯业务模块，包含纯 `sync-core.mjs` 的差异/合并辅助，不包含网络同步或真实存储入口；其他八个受影响生产文件不进入独立体验壳的存储/远端调用。新独立 Android 包保持 GxD4Preview，未接 GxNative/生产 SQLite。同步页面使用合成提供器，不能据展示状态推断 outbox 已 ACK 或真实远端进度。
- **原同步必须复用**：固定 master replica/delta-sync 与 Windows database/sync 已包含上述协议保护。UI 适配不得复制旧快照协议、改变 ACK/outbox/cursor/manifest/batch，或直接更新复制表。

## 仍为 UNVERIFIED / BLOCKER 的结论

- **UNVERIFIED**：归档发布 SHA、云端 receipt/ZIP 的最终下载与 SHA-256 复核、修订后的 provenance Actions 执行尚由主 Agent 补充。已确认的云端静态 Git 对象 stdout 不代表项目执行；全部 99 条最终仍需由严格 provenance 原始报告绑定精确源码与 Actions 运行身份。
- **BLOCKER**：原清单不能继续表示 99 条全属于冻结 master。只有明确记录来源错误、保存旧原字节及条目，并取得 canonical Git 对象证据后，才能修订候选清单；禁止仅替换 hash 让检查变绿。
- **BLOCKER**：原功能审计对九文件的旧行号、ID 限制、异常传播和同步实现解读须由集中补充报告覆盖。不能删除旧审计，也不能以“90/99 匹配”替九项剩余内容作事实担保。
- **UNVERIFIED**：三端任务 CRUD/排序/字段兼容、Android 真实触屏/后台/进程死亡/锁屏、Windows 原生回归，以及新工作模块交互。来源纠正不产生这些测试结果。
- **BLOCKER**：真实用户数据库结构、迁移/恢复、正式生产适配与远端状态认证仍未获得本阶段操作许可或证据。D2 不合并，生产同步不启用，LAN/WebDAV 双通道不启用；Android issue #1 保持开放。

## 集中修订方案（PROPOSAL）

1. 保存本次失败与原清单原字节至独立证据 ZIP，并保留原输出目录；旧条目说明为“旧本地快照观察，冻结身份绑定失败”。
2. **已观察的静态 FACT**：独立 reconcile-audit.py 在云端只执行 Git blob/hash 读取，逐条核对原清单、canonical bytes、LF/CRLF 变体，并记录工具自身 hash、固定 base、当前 candidate HEAD。当前结果保留九个内容 BLOCKER，零换行修订，没有输出修订清单。
3. 主 Agent 基于确认的 Git 对象和本报告集中修订候选 manifest 的来源说明与九个 canonical hash/bytes；附 before/after 证据和复核状态。其他 90 条与旧历史证据保持严格原值校验。
4. 保留 provenance.mjs 的逐字节及字节数严格断言，重新执行 GitHub Actions。来源通过以后，再分别报告真实测试执行、通过、失败、产物、截图和未验证条件。
