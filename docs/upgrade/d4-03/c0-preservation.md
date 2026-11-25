# D4-03 对 C0-04 原协议回归的保留与复用

本文件为静态定位结论，没有本地执行旧 fixture、SQLite、编译或测试。D4 UI 浏览器、原生体验壳与合成同步中心均不能替代 C0-04 协议回归。

## 已定位的历史事实

FACT：原工作区 `outputs/c0-04/reports/c0-04-status.md` 保存了成功源码 `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc`，GitHub Actions [45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501)。报告记录三端 78 例、936 个执行位置和 936 个逐项比较通过；Android 独立进程重开及 SQLite 导出各 312 个位置通过。源码/运行证据是历史事实，不能写成本轮 D4 候选已重新通过。

FACT：历史成功仍保留四次初始 instrumentation 崩溃，重试之后通过，原始首次失败没有删除。Android issue #1 的根因未核实；D4 不关闭或绕过它。同源码的原三端构建回归历史运行 [45140238535](https://github.com/johny751/MyTodo/actions/runs/45140238535) 另行保存，不与 UI 体验结果混合。

FACT：真实旧工作流为 [c0-04-protocol.yml](https://github.com/johny751/MyTodo/blob/56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc/.github/workflows/c0-04-protocol.yml)。原本地保留副本位于：

`C:/Users/adwoo/Documents/Codex/2026-11-23/mytodo-agent-mytodo-agent-mytodo-github/outputs/c0-04/android-shards/.github/workflows/c0-04-protocol.yml`

配套 `android-shards/tests/protocol-harness/run-c004-matrix.mjs` 包含 `--android-shard`，更早 `matrix-integrated` 副本尚无该参数。这证明本地有不同历史版本，不能盲拷旧工作区覆盖当前 Git 原件。主 Agent 后续只从当前候选完整 Git 树读取并核对旧工作流及 harness；当前稀疏 UI 本地工作树没有这些旧测试文件，不等于远端仓库删除了它们。

## 原入口与合成范围

FACT：原套件为 `tests/protocol-vectors/suite.json`，调度器为 `tests/protocol-harness/run-c004-matrix.mjs`。生产实现分别为 Node `src/sqlite-store.mjs`/`replica.mjs`，Windows `database.c`/`sync.c` 与 vendor SQLite，Android `AccountStore`/`ReplicaDatabase` 与真实 WebView 共享模块。适配器使用隔离真实存储 API，fixture 只在 runner 临时目录与 loopback，不能连接真实 WebDAV、LAN、账户或用户数据。

FACT：原调度器要求 `GITHUB_ACTIONS=true`/RUNNER_TEMP；desktop 和 complete 阶段还要求 Windows。每份证据记录 sourceSha、runId、runAttempt、suite 字节/语义哈希、原命令日志和输出哈希；最终加载同 run/attempt 的桌面与八个 Android 分片。compare 保留 field records/conflicts/tombstones/vector/clock/cursors/outbox/pending/raw/reopened，不能用 UI 状态 JSON 替代。

原工作流命令链：

```text
Windows desktop:
  scripts/ci/c004-node-path.ps1
  node tests/protocol-harness/run-c004-matrix.mjs --phase desktop
    --output RUNNER_TEMP/c004-desktop

Ubuntu Android shards 0..7:
  scripts/ci/c004-node-path.sh
  node scripts/ci/c004-android-emulator.mjs start
  node tests/protocol-harness/run-c004-matrix.mjs --phase android --android-shard N
    --desktop RUNNER_TEMP/c004-desktop-input
    --android-environment RUNNER_TEMP/c004-android-emulator/environment.json
    --output RUNNER_TEMP/c004-android
  node scripts/ci/c004-android-emulator.mjs finish

Windows complete:
  node tests/protocol-harness/run-c004-matrix.mjs --phase complete
    --desktop RUNNER_TEMP/c004-desktop-input
    --android RUNNER_TEMP/c004-android-input
    --output RUNNER_TEMP/c004-complete
```

历史 Android 为 API34/x86_64、Build Tools35/JDK17/Node22，runner 官方镜像安装与 libpulse 配置沿用已有官方云端联网授权。本轮 D4 preview 的 API35 配置不能自动替换旧矩阵已验证的环境；缺镜像/依赖时保留 BLOCKER 和原日志。

## 本轮复用方案

PROPOSAL：主 Agent 在云端 Git 只读取得当前候选完整树后，可新增独立 `d403-c0-protocol-regression.yml`，只放行 `d4/mobile-integrated-candidate-1`，复制当前原工作流的 desktop→8 Android shards→complete 链和原断言，不更改旧 C0 文件或协议实现。每个 job checkout 本轮精确 SHA；保留同 run+attempt 的 artifact lineage。只修改测试触发范围和报告名称，不改 ACK/outbox/cursor/manifest/batch 语义。

FACT：已定位旧 workflow 的 push 只接受 master/c0-04/**；直接推 D4 分支不会自动触发。需要独立 D4 工作流或明确云端可用入口；不得通过合入 master 获取 CI。

UNVERIFIED：当前候选完整 Git 树中这些入口的实际最新字节、是否又有后续修订，以及本轮执行结果，尚需主 Agent 云端核对。上述历史运行不是本轮源码结果；在新的 C0 run 完成前报告明确标为未重跑。

BLOCKER：三端协议完整回归若未在本轮通过，D4 最终三端验收不得宣称它已完成。UI 合成状态测试、Android preview touch 和原 JVM timer 都不补足该缺口。D1/D2 历史候选验证与失败证据同样保留，不能由新 UI tests 替换。
