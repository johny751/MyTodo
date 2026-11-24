# D1-01 基线核查

审查日期 2026-11-24（Asia/Shanghai）。仓库 `johny751/MyTodo`，分支 `master`。本报告记录第一批文档提交前的基线。

项目负责人已批准 D1-01 数据契约设计和 GitHub Actions 隔离合成数据验证。第一批涵盖当前基线核查、实施顺序和预计测试矩阵。生产数据库、迁移入口、同步行为及真实账号均在授权范围外，D1-02 须另行批准。[实施计划](implementation-plan.md) · [预计测试矩阵](validation-plan.md)

## 当前分支与阶段 0 材料

| 核查项 | 实际结果 |
| --- | --- |
| 远端 master | `d9e58b04484ce14a1bfc3021757b2167df2b0407`。 |
| Codespaces 工作区 | `/workspaces/MyTodo`，分支 `master`，HEAD 与远端相等，`git status --porcelain=v1 --untracked-files=all` 输出为空。 |
| Git tree | `dd2d667263e0836aac0e89c2294eabf9cb32ce22`，跟踪路径 752 个。 |
| 阶段 0 审查发布提交 | 与本次读取的 master 相同，祖先检查通过。发布目录九份文件按 Git commit 读取，路径、字节数、SHA-256 与上次发布清单逐一一致。 |
| 阶段 0 实际受审源码 | 当前 `phase0-final-review/verification.json` 指向 `bc3f44d1e76a988dbe269edcf1c606eebec37293`。从 bc3f44d 到当前仅新增阶段 0 审查目录下的九份文件。 |
| 阶段 0 审批与本次授权 | 原审查记录当时为 `CONDITIONAL-GO`、未获批准。本任务另行明确批准仅 D1-01，原审查文档作为历史记录保留。 |
| 当前 master 的直接 Actions | 按该完整 SHA 查询返回空数组。以下运行归属各自历史源码。 |
| Android #1 | 本轮通过 GitHub 查询为 `OPEN`。 |

方法为 Codespaces 中的 Git 远端引用、祖先关系、树与路径差异、提交对象字节、现存 GitHub Actions 和 issue 只读查询。当前九份阶段 0 材料的 blob 和 SHA-256、关键生产和工作流 blob、全路径差异以及 16 条现存运行回执见 [基线原始回执](baseline-readback.json)。阶段 0 风险、实际测试与源对应见 [阶段 0 索引](../phase0-final-review/README.md) · [总报告](../phase0-final-review/phase0-final-report.md) · [机器核验](../phase0-final-review/verification.json)。

## 已审查生产源码的延续

| 对照 | 路径级实查 | 如何使用历史结果 |
| --- | --- | --- |
| 审查发布 d9e58b0 → 当前 | 0 个差异。阶段 0 发布之后没有新增生产代码、SQL schema、协议、测试或 CI 修改。 | 沿用原限定证据及原限制。 |
| 审查基线 bc3f44d → 当前 | 9 个新增路径均在 `docs/upgrade/phase0-final-review/`。 | 阶段 0 受审生产、测试、CI 与当前一致。 |
| C0-05 受测 648f5508 → 当前 | 凭据入口 `src/sync-server.mjs`、`windows/credential-helper.c` blob 各自不变。后续生产差异仅 `src/delta-sync.mjs`、`src/sqlite-store.mjs`、`windows/database.c`、`windows/sync.c`，属阶段 0 已审查的 C0-06/07 变动。 | 以原凭据用例和 f9 同生产基线的凭据回归作证，仅限合成夹具和既有 Windows DPAPI 用户上下文。 |
| C0-06 受测 1b9c41fb → 当前 | `src/delta-sync.mjs` 不变。C0-07 改了 `src/sqlite-store.mjs`、`windows/database.c`、`windows/sync.c`；C0-06 Android 夹具随后加严指定数据库身份。 | 结合原 C0-06 四项门禁及 19ce 补强回归，保留 Android 首崩和换库语义。 |
| C0-07 生产修复 f9ca0f1a → 当前 | 70 个文档路径和 3 个测试路径变化。生产文件、SQL schema、Android Java、共享 JS、CI 和构建入口均无路径或 blob 差异。三个测试路径见下。 | f9 后生产完全一致。C007 正式通过的实验源为 de7ce40c，对应当前 C007 场景夹具。 |
| C0-07 通过源 de7ce40c → 当前 | 70 个文档路径和两个 C006 Android runner 变化。 | C007 测试源码与有效故障运行的相应入口一致。 |
| 19ceea62 → 当前 | 70 个文档路径，无非文档差异。 | 原 C006 核心、Android 中断、bootstrap/CAS 与基线分别以 19ce 运行解释。 |

f9 后三个测试路径分别是 `tests/fault-harness/c007-windows-worker.c`、`tests/c006/android-kill/android-kill-runner.mjs`、`tests/c006/c006-harness/android-runner.mjs`。前者在 de7 校正 inspect 的返回值取证，后两者是失败补采和指定数据库断言。原始失败回执仍可查询。[C0-07 报告](../c0-07-report.md) · [生产过程及 blob 关联](../phase0-final-review/production-source-baseline.md)

### 关键文件当前 Git blob

Git blob 标识用于比较同一路径的精确内容，以下由本次 Codespaces Git tree 读回。其余关键路径与所有对照见 [基线原始回执](baseline-readback.json)。

| 路径 | 当前 Git blob |
| --- | --- |
| `src/sync-server.mjs` | `682b74fa92ec3550f10e0e3d6202a3f469d88d98` |
| `windows/credential-helper.c` | `466bfa85d1bd1e8822c3bcaf236d1dc9d301f84e` |
| `src/delta-sync.mjs` | `e7872ccdf830cc4a631a9ab4a6177e3580eed1f7` |
| `src/sqlite-store.mjs` | `a4325116f184312ddae822ca56f178eb57aaec40` |
| `src/model.mjs` | `7141bde098d4bd709939de5786133a32a1598c78` |
| `src/replica.mjs` | `b910ebb83f2847a64e5d63fc986abc2c94cd0bb0` |
| `src/sync-core.mjs` | `fddcb587c0783e7267693e6b8d2e8db383a82f95` |
| `src/sync-client.mjs` | `fe11e627d17fe3efb3452b31ce646b2ce44bf900` |
| `windows/database.c` | `796d6bb4d8601b06a61cac1e8b66c8601da63a6f` |
| `windows/sync.c` | `208144931154968925d6bf41ba3bba49606c534b` |
| `windows/native.h` | `a9c23e56e329a75efefdbf1f9efdd4c2db30f691` |
| `android/src/local/gxtodo/replica/ReplicaDatabase.java` | `d31030e0c247e97c51bd7b48bc917ecb32638052` |
| `android/src/local/gxtodo/replica/SyncStore.java` | `37cec1ba0eacf03cbec742b7a581778c17f99c23` |
| `android/src/local/gxtodo/replica/MainActivity.java` | `0e7136b0a51fa8a3e9cb7d94b3f91e75efd7df73` |
| `.github/workflows/c0-04-protocol.yml` | `468080a0b98717e0dd4cb036bf842727ee13b964` |
| `.github/workflows/c0-05-credentials.yml` | `f3127ef40064bf84581be7fa0c9f9c3c190c56e6` |
| `.github/workflows/c0-06-migration.yml` | `166864d813410829cfb3338a8260579865a20c5f` |
| `.github/workflows/c0-07-fault-recovery.yml` | `f9947bf4b9866d4b5833b0b70954a89fe47b6ac6` |
| `.github/workflows/phase0-baseline.yml` | `2914c223dbd95f360520149f3ca9e8bbf718fa41` |

## GitHub Actions 读回

本节的结论来自此次 GitHub API 只读查询。运行数量与产物限制来自原报告，无本次新增用例或执行结果。一次历史 run 的成功不覆盖另一轮失败或 collector 缺口。

| 关联 | 受测 SHA | 实际历史回执 |
| --- | --- | --- |
| C0-03 原协议 | `d02e416f` | [45117818661 · failure](https://github.com/johny751/MyTodo/actions/runs/45117818661)，保留原失败与 Android 阻塞。 |
| C0-04 协议与三端回归 | `56a2cf19` | [45140238501 · success](https://github.com/johny751/MyTodo/actions/runs/45140238501) 936 执行与 936 比较，[45140238535 · success](https://github.com/johny751/MyTodo/actions/runs/45140238535) 原三端回归。 |
| C0-05 凭据 | `648f5508`；`f9ca0f1a` | [45158226148 · success](https://github.com/johny751/MyTodo/actions/runs/45158226148) 及 [45186305386 · success](https://github.com/johny751/MyTodo/actions/runs/45186305386) 各 22/22。 |
| C0-06 正式执行 | `1b9c41fb` | [45170150079 · 83/83](https://github.com/johny751/MyTodo/actions/runs/45170150079)、[45170150057 · 2/2](https://github.com/johny751/MyTodo/actions/runs/45170150057)、[45170150092 · 4/4](https://github.com/johny751/MyTodo/actions/runs/45170150092)、[45170150066 · 共享 121/121](https://github.com/johny751/MyTodo/actions/runs/45170150066)，均 success，采集资格分开记录。 |
| C0-07 生产范围的完整矩阵 | `f9ca0f1a` | [45186305196 · success](https://github.com/johny751/MyTodo/actions/runs/45186305196)，936 执行、936 比较、702 来源；原 Android 首崩与换库明细仍在。 |
| C0-07 三端故障 | `de7ce40c` | [45190559178 · success](https://github.com/johny751/MyTodo/actions/runs/45190559178)，187 次尝试，2,299 检查通过，collector 原值 exit 1 / incomplete。 |
| C0-06 后续核心失败 | `edfde91e` | [45194185453 · failure](https://github.com/johny751/MyTodo/actions/runs/45194185453)，82/83，A27 首崩与换库后原库 lease 阻塞仍保留。 |
| C0-06 后续补强 | `19ceea62` | [45199685003 · 83/83](https://github.com/johny751/MyTodo/actions/runs/45199685003)、[45199685578 · 2/2](https://github.com/johny751/MyTodo/actions/runs/45199685578)、[45199685144 · 4/4](https://github.com/johny751/MyTodo/actions/runs/45199685144)、[45199684912 · 共享 121/121](https://github.com/johny751/MyTodo/actions/runs/45199684912)，均 success。核心的 observer 首次重开崩溃后同库恢复，保留原首崩。 |

## 风险与下一步

本次比对未发现阶段 0 之后由代码变化引入的新增风险。源身份核查不替代运行检验。此前列出的边界继续进入 D1-01 设计和隔离验证。

- Windows C 当前可读取支持的 WebDAV v2 状态。它缺少 WebDAV v1 导入，面对不支持的旧状态或非空旧备份保持安全拒绝。合成 WebDAV 的测试结果只描述相应夹具。[C0-06 兼容边界](../c0-06/reports/c0-06-compatibility.md)
- C 与 Node 的位置型 INSERT、三端一致备份与 T15/T16 以及迁移后的同库复核仍是后续生产写入门槛。此阶段可提出契约和在临时合成库验证，业务库写入须另审。[生产源码基线](../phase0-final-review/production-source-baseline.md)
- 单 WebDAV 目标的 ACK 当前会清理共享 outbox。LAN 与 WebDAV 必须拥有独立投递证明。Windows 租约过期后延迟响应与新会话落盘的交错仍需验证。D1-01 只设计规则并做离线模型验证。[同步安全审查](../phase0-final-review/sync-safety-review.md)
- Android issue #1 仍开放。原崩溃、同库重开与换库运行分别保留；此次没有新增 Android 执行。[issue #1](https://github.com/johny751/MyTodo/issues/1) · [Android 风险审查](../phase0-final-review/android-stability-risk.md)

**基线内可继续按原范围执行 D1-01。** 下一步从 Windows、共享 JS/Node 与 Android 的真实调用链追踪实体及辅助数据，核实字段类型、缺失/NULL/空值、索引与删除语义，把现存行为与候选设计分开记录。盘点评审后再冻结契约草案与合成测试预期。第一批未执行项目构建、测试、数据库操作或打包。[实施计划](implementation-plan.md) · [预计测试矩阵](validation-plan.md)
