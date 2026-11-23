# 三端云端构建实施方案

2026-11-23，Asia/Shanghai。第一版主要交付Windows/Android；正式Web保留现有本机Node/SQLite产品，继续参与共享业务、数据、旧功能和同步回归，全量Web UI重构暂不列为同等优先级首版目标。三端相关编译、测试、打包仍全部在GitHub执行。本机只保留必要审计/配置文档，不下载SDK或建立编译缓存。开发及结果证据遵守 [07 开发规范](07-development-standards.md)。

## 已提交并实际运行的工作流

工作流已提交到 `.github/workflows/phase0-baseline.yml`，证据执行器为 `scripts/ci/phase0-baseline.ps1`；CI 提交 `06a269b965c0c92c0e818effba5546986dd3242d`。配套 `install-phase0-ci.sh`、`submit-phase0-cloud.sh` 只在授权 GitHub Codespaces 提交文档/CI，不在 Codespaces 编译或测试项目。master push 已触发 [run 45101481375](https://github.com/johny751/MyTodo/actions/runs/45101481375)，四个 job 显示 Success；逐项真实结果与归档见 [12 云端基线](12-cloud-baseline-20261123.md)。

采用一个resolve-source job冻结完整源码SHA，再由三个windows-latest平台job复用实际原构建，不将Android假装成Gradle工程。执行器为`scripts/ci/phase0-baseline.ps1`，先复制到runner临时目录，再检出同一个冻结SHA。只用预装Node（必须有node:sqlite）、JDK17、SDK35.0.0/API34、MSVC/Windows SDK；缺项直接报错，不安装新工具。actions/checkout与upload-artifact的固定提交已经GitHub API核对；内容令牌只读，checkout不保留凭据，产物14天保留。

| Job | 具体执行 | 产物/边界 |
|---|---|---|
| Freeze source SHA | 一次解析请求源码ref，校验完整HEAD和干净状态 | 冻结SHA与命令退出码；三个平台均检出该SHA |
| Windows native build and self-tests | 原build-windows.mjs --public-release；原self-test/advanced-test/feedback-test；各自RUNNER_TEMP数据 | EXE、日志、每case起止/退出码、源码SHA与产物hash；不覆盖生产路径 |
| Web and shared JavaScript tests | 原MSVC credential helper；显式枚举tests/*.test.mjs并执行TAP；打包现有HTML/CSS/server/src/README/launcher | 共享测试日志、Web源码包和清单。需要Node，不是原内置Node便携发布包 |
| Android unsigned build and Java tests | 原三个Java测试；临时adapter复用原build-android至签名前，保留AAR/资源/D8/资产校验 | aligned unsigned APK、badging、hash/receipt；不读取原私钥、不生成新key、不能作为覆盖安装正式APK |

本次工作流中的三个Java测试是原有计时等Java基线，不是Android SQLite/生产存储桥协议测试。C0-03另需同一`tests/protocol-vectors`向量分别在Windows C、JS和Android Java实际存储适配运行，含持久化、重启、导出及outbox/meta/cursor比较；Android harness必须调用原ReplicaDatabase/AccountStore存储路径。适用云端Android SQLite/模拟器执行环境尚需实际确认，预装能力不足时记录blocked/未执行，按既有联网范围处理所缺能力，不转到本机测试或自动下载依赖。

## 分支与启动

- 业务代码在master；首次将工作流提交到master后，其push路径已实际触发本次基线。没有改默认分支。
- workflow_dispatch只有定义也在默认分支时才出现手动入口；当前main没有该工作流，不宣称现在有手动按钮。
- dispatch输入source_ref默认master；push固定事件SHA。resolve-source只解析一次，三个平台job检出同一完整SHA；每job再次校验git rev-parse HEAD及干净状态，并与工作流事件SHA分别保存，避免把空main当代码。
- Codespaces安装脚本先验证正确remote、master、干净工作区、刚核实HEAD与远端一致，拒绝覆盖不同已有CI文件，只提交精确workflow和执行器。不会自动切分支、快进、stash或reset。只在云端使用，不在本机执行。
- `gh run list --workflow phase0-baseline.yml` 初次查询实际返回404/退出1，因为它在空main中解析工作流；本轮随后通过run ID/Actions API查询到已成功的master push运行。后续核验优先使用已记录run ID，不把查询错误当作构建失败。
- 当前push路径仅覆盖工作流及证据执行器。进入C0小步开发前，必须为相应业务/协议/测试文件设置明确的云端触发路径或其他已验证运行入口；不能假设只改源码的push会自动运行本基线，也不能依赖空main的手动dispatch按钮。每项兼容提交仍须有对应真实run。

## 正式发布尚需处理

原Android签名PKCS12/alias gxtodo-local/密码不在仓库，必须受保护注入原材料才能做正式覆盖升级。当前仅unsigned基线，不新换签名。后续按约定递增code并将Git前五位、带时区编译时间、版本历史与复制入口打入实际APK。

现有package-release.mjs耦合三包，并验证准确官方Windows Node24二进制/许可/checksum。当前Web源包不替代该便携包；正式发布需原签名及相容Node运行材料，再小步拆分各平台打包。没有部署网站或访问真实坚果云。

Web正式产品已存在但使用本机Node+SQLite。GitHub Pages不能直接承接其API/数据库/同步；不能删Host/Origin限制或换框架来假装完成。浏览器独立离线与未来服务托管需依据实际需求增量实现。

首版发布优先保证Windows/Android功能和升级包完整；正式Web的现有运行包及必要兼容改动仍需构建/启动与共享业务、数据、同步回归。Android共用JS/资源改动不能造成Web退化，Web全量布局重构不作为首版发布门槛。

## 实际验收边界

本次已取得实际 [Actions run 45101481375](https://github.com/johny751/MyTodo/actions/runs/45101481375)、四job Success、云端日志与产物下载记录；逐项退出码、runner工具与产物SHA256按本轮收据归档于12。本次只证明原构建与现有自测基线，不证明Windows C/JS/Android Java同步协议兼容、真实设备或数据库迁移通过。静态独审和历史结果仍不能替代这些未执行项目。

GitHub显示4条第一方固定action的Node20弃用警告，运行时被平台强制使用Node24；本次job没有因此失败。后续维护需审阅并固定相容的新action版本，再在GitHub回归，不以临时升级或隐藏警告改变本次证据。

C0-01–03原基线及三种实际存储共同向量取得证据后，C0-04排序/校验、C0-05凭据、C0-06旧云迁移/恢复、C0-07 SQL错误传播各自独立commit、主Agent审查和相关云test；四项完成后才进入D1。每次云验证记录实际业务HEAD、commit、命令、runner/工具版本、fixture、退出码和日志；不得把CI草稿、成功checkout、unsigned编译或Java计时测试写成协议/迁移验收通过。具体编号和文件边界以08/09为准。

GitHub可承担编译、SQLite迁移/mock协议/原生自测及合适Android模拟器测试。托管runner不在用户家庭Wi-Fi；实际mDNS、换Wi-Fi、手机后台、首次配对和撤销仍须专用设备环境，分别记录。编译缓存始终留云端。

参考：GitHub workflow_dispatch事件要求及手动运行说明；具体公共协议、数据库和新增业务任务见08/09。
