# D4-03 来源清单定向交叉审核

2026-11-25，Asia/Shanghai。审核范围仅为本地文件、静态调用关系与 SHA-256；未联网，未运行项目测试、构建、SQLite、应用或同步。本文不修改候选源码和清单。

**FACT：允许集中纠正九条来源误绑定，但必须保留原失败、原清单原字节、冻结身份和全部严格比较。** 九项是旧快照与指定 Git 提交的内容差异，不能作为换行修订。`canonical-source-review.md` 对旧 ID 上限、存储错误传播、行号与既有同步保护的补充足以作为本次定向纠错说明；云端归档下载和最终 Actions 报告仍由主 Agent绑定。

## 独立确认的静态事实

- `docs/upgrade/d4-03/audited-source-manifest.json` 当前含 99 个条目，路径没有重复，`baseline` 为 `d4c5af4cbbb9192c19276dd371bd142c2b835534`。
- `work/d4-03` 是本地部分文件镜像。99 条中仅 22 个对应生产文件存在：17 个原 hash/bytes 精确匹配，5 个 src 文件与原条目不同，77 个 Windows/Android 等文件未在本地镜像出现。**这不是 82 个源码内容错误，也不推翻云端完整 checkout 的 90 匹配/9差异记录。** 不得以本地缺失为由删减清单。
- 本地候选 `src/model.mjs` 与 `canonical-baseline/src/model.mjs` 均为 8792 bytes，SHA-256 均为 `837f10b5b1486e3be7f276cc8c00758afd420c9d49537b28d3d96341f1bf8c97`；原清单为 8649 bytes、`45ba81971b389d6c14a6e0beda3818539194a6a8374490d4a51fd65820a82169`。这直接支持 model 旧条目失效及当前候选输入为新冻结内容。
- `prototypes/d4-01/domain.mjs:3` 导入当前 `../../src/model.mjs`，`:78` 调用其 `isEntityId`。`tests/d4-ui/build-demo.mjs:18` 的白名单为六个冻结纯模块加 domain，共七模块；`:23` 记录输入 bytes/hash，`:31` 拒绝白名单外 import，`:51` 拒绝未跟踪或未使用模块。九个来源差异中只有 model 进入该独立 UI 纯模块图；网络和 SQLite 入口没有进入。
- `tests/d4-ui/provenance.mjs:7` 用 `git show <manifest.baseline>:<file.path>` 原字节做长度和 SHA-256 比较，`:10` 对任意 mismatch 抛错。它没有把换行归一化、文件缺失或 mismatch 视为通过。

## model 字节约束的准确表述

**FACT（实现机制）**：来源检查单独核对冻结 Git blob，未直接读取候选工作树或已构建 HTML。其与以下保护组合，才能说明候选输入来源：

1. `scope.mjs:6` 绑定分支、checkout HEAD 和 Actions SHA；`:8` 固定 origin/master；`:18` 要求 src/windows/android/package.json 的提交差异为零。
2. 域和浏览器构建使用上述 production 文件；`build-demo.mjs:13` 再检查当前 HEAD；构建回执 `inputs` 保留 model 等实际读取字节的 hash/bytes，最终 HTML 自身也有 hash/bytes。
3. UI workflow 先运行 scope/provenance，再运行域测试；浏览器与 Android jobs 依赖 domain。必须把成功来源报告、构建回执和测试报告绑定到同一个 source SHA、run ID、attempt；两个域平台的来源报告也须分别保留。

**UNVERIFIED（当前结果）**：上述组合尚不能被表述为本轮已成功执行或三端验收通过。第二轮来源检查失败后，下游业务测试未执行。未来最终回执中的 model hash 应精确为上述 837f10…、8792，不能用来源报告的 passed 推断某个未下载构建包的实际输入。

## 集中修正必须保持的约束

| 对象 | 必须保持/记录 |
|---|---|
| 冻结身份 | manifest baseline 和 scope 的固定 master 不变；不得改为旧快照未知提交或其他可匹配提交 |
| 清单结构 | 99 条完整、唯一路径集合和顺序保持；只改明确九项 hash/bytes，其他 90 项保持原值 |
| 纠错来源 | 保存原 manifest、旧失败原报告、九项 before/after、canonical Git blob SHA/bytes/hash 和云端 receipt；明确旧快照完整 Git 身份 UNVERIFIED |
| 原字节断言 | provenance 的 git show、长度比较、SHA-256 比较、任意 mismatch 抛错保持；不归一化、不忽略、不降低总数 |
| 生产及历史保护 | scope productionDiff=0、限定文件路径、原证据字节/hash检查保持；raw unified patch 单独精确 hash guard 保持 |
| 业务与平台验收 | 域、浏览器、Android 真实触屏及既有 required 断言保留；来源修正不替代这些测试，不替代 C0/D1/D2 回归 |

**PROPOSAL（可选保护强化）**：provenance 当前从可编辑 manifest 读取 baseline/files，没有自身硬编码固定 baseline、99数量或路径集合检查。因此集中修正的 before/after 审核必须证明这些值不变；如主 Agent增加显式固定身份/唯一数量保护，只能增强断言，不能替换现有逐文件比较。此观察不表示本子任务已实施该强化。

## 审核结论

**PROPOSAL：** 在下载复核云端原始 receipt、保存原来源字节并纳入集中纠错报告后，采用九条 canonical Git 对象 hash/bytes。随后原严格 Actions 重新执行，是解除本次来源 BLOCKER 的必要证据。

**BLOCKER / UNVERIFIED：** 修订后的来源执行、业务交互、真实 Android 触屏/后台、Windows 原生成熟操作和三端完整性仍需各自证据。本审计不会产生生产数据库迁移、真实同步启用、LAN/WebDAV 或 Android issue #1 关闭权限。
