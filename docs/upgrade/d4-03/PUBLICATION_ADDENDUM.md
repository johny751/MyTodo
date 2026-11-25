# D4-03 最终发布补充说明 — NOT CLOSED

2026-11-25，Asia/Shanghai。本说明追加在冻结 source06 之后，仅修正集中交付的身份、静态准备计数及历史快照解释；不覆盖 source06、旧审查发现、原始失败或源码。证据发布 SHA：`af9abcb0b1978f3d0e4868a46606f5f1832c30de`。主 Agent 已核对远端 publication receipt：候选对冻结 master Compare ahead 20 / behind 0，生产代码差异 0，live master 仍为 `d4c5af4cbbb9192c19276dd371bd142c2b835534`，Android issue #1 Open。

**BLOCKER：D4-03 仍不能关闭。** 本轮实际执行 / 通过 / 测试用例失败 / 已构建体验产物为 **0 / 0 / 0 / 0**。GitHub Actions 在 runner 启动前因账户计费 / spending limit 拒绝运行。job 拒绝不等于测试断言失败，失败数 0 不等于通过。没有本轮 Android APK、Windows 体验包、已构建 HTML、UI 截图或交互录屏；旧 D4-01 产物保持冻结。

## 身份与历史修正

主 Agent 提供的候选源码发布身份为 `899ae75643875e923c480a421b1f0413e622cbc9`，分支为 `d4/mobile-integrated-candidate-1`。首轮尝试源码为 `288b0b97d9974e3797a5099c97d5aeb1c3e26dc9`。两者必须分开，后者只对应未启动的 [UI / Android 45533988173](https://github.com/johny751/MyTodo/actions/runs/45533988173) 和 [C0 45533988196](https://github.com/johny751/MyTodo/actions/runs/45533988196)。最新候选未经 Actions 运行。

source06 文件归档为 `d403-source-06.zip`，241263 字节，SHA-256 为 `5d514f81aa7f2fa57361b1e4d851989cc7bd5ebfe0e26a4cbcaaa2d5e43443c0`。归档仅包含源文件，不能作为已构建体验包。提交、Compare、live master、productionDiff 和 issue #1 状态以最终 publication receipt 的云端证据为准；计数更正来自本地静态审查；发布身份和边界来自主 Agent 的 GitHub / Codespaces 只读证据，不含项目执行。

| 原报告及行号 | 冻结原说法 | 本次解释 / 修正 |
|---|---|---|
| `integrated-work-readiness.md:7` | “source05 已发布，短提交标识 288b0b9” | source05 与 288b0b9 的身份绑定错误。288b0b9 是首轮尝试；最新候选源码是 899ae756…，归档是 source06。保留错误原文作为历史，不沿用该绑定。 |
| `integrated-work-readiness.md:9`；`personal-readiness.md:9`；`original-personal-coverage.md:78` | 后续修订属于下一候选 / 待重新发布 | 属于报告写作时的快照。集中交付对应 source06 / 899ae756…；仍待云端执行，不再解释为尚未上传的最新源码。 |
| `integrated-work-readiness.md:66` | 16 / 10 / 8 个工作 / regression / legacy 检查 | 最新静态准备为 16 / 14 / 8；实际执行均为 0。 |
| `work-integration.md:75` | 共十四项工作检查 | 属于早期 6 + 8 清单。最新工作源码为 16 个检查；新增失败字节读取释放屏障和明确清除未提交筛选检查。 |
| `c0-preservation.md:51` | 拟新增 `d403-c0-protocol-regression.yml` | 属于早期命名方案。实际候选工作流名称为 `d4-03-c0-regression.yml`；生成字节保留结果须看 `c0-workflow-preservation.json`。未运行仍是 BLOCKER。 |
| `integrated-work-readiness.md:33`、`:37`、`:39`、`:58`；`platform-readiness.md:36`–`:46`、`:53` | 驱动命中 / 分类规则 / 搜索 / 手势 / 草稿等尚待修补 | 这些是保留的早期审查快照。`static-repair-record.md` 记录后来候选应对，不删除发现，也不把修补当作已运行证明。未完整恢复的操作习惯与原生接入仍保留 BLOCKER。 |

表中行号指交付时冻结原报告的行号。本补充优先用于解释当前发布身份和计数，不修改原审查结论的证据边界。

## 最新静态准备计数

下表来自本轮文本审查，未运行测试。prepared 是代码准备数，不是执行数、覆盖率或通过数，不能替代最终 CI 的实际总数。

| 套件 | 静态 prepared | 计数依据 | 本轮 executed / passed / failed |
|---|---|---|---|
| `personal-cases.mjs` | 21 | 21 个 `await a.check` 声明 | 0 / 0 / 0 |
| `work-cases.mjs` | 16 | 16 个 `await a.check` 声明 | 0 / 0 / 0 |
| `regression-cases.mjs` | 14 | 12 个独立检查；另一个检查按两个 Web 返回桥展开为 2 项 | 0 / 0 / 0 |
| `legacy-cases.mjs` | 8 | L01–L08；外层 check helper 不重复计为用例 | 0 / 0 / 0 |
| Android `PreviewInstrumentation` | 25（原报告计划数） | 本次未重新盘点原生源码；不宣称实测 | 0 / 0 / 0 |

未发现上述四个浏览器套件以外新的准备计数矛盾。20 个候选路由、25 个 Android 计划检查与旧 C0 936 个历史执行位置属于不同维度，均不能合计为本轮通过数。

## 继续保留的验收阻断

- **UNVERIFIED / BLOCKER**：最新源码的构建、浏览器、真实触屏、后台、重启及三端回归均没有本轮执行证据。Windows 启动器不是 Win32 集成，Android 隔离 WebView 不是原生产存储 / service / 通知 / FeedbackKit 接入，Web 合成 provider 不是生产数据一致性证明。
- **BLOCKER**：关闭 / 返回自动保存、冲突合并、周期边界手势及其他原操作习惯尚未完整恢复；含秒 custom reminder.at 的冻结 normalizer 行为仍未解决。项目历史关系、旧实例历史快照、工作事项精确时分等不得假定已兼容。
- **BLOCKER**：正式原生存储、原后台番茄钟 / 提醒、Android 独立反馈图片恢复和多文件持久化、真实 schema / writer barrier / 认证远端状态仍需对应隔离证据。Android issue #1 继续开放。
- **OWNER DECISION**：负责人处理 Actions 账户执行资格后，按最终确认源码在 GitHub Actions 重新运行完整 UI / Android 与 C0 工作流；不得改为本机或 Codespaces 构建绕过。真实数据、数据库迁移、生产同步、D2 合并和 LAN / WebDAV 双通道仍没有授权。

本说明没有编辑候选或生产源码、没有运行构建 / 测试 / SQLite、未触及真实用户数据；联网仅使用既有授权的 GitHub / Codespaces 发布与证据操作。全部历史失败、UNVERIFIED、OWNER DECISION 和 BLOCKER 保留。
