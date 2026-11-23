# C0-04 协议修复与云端验收

C0-04 统一事件的排序、冲突展示、结构与安全计数校验。规则依据既有 v2 实施指南、原生产代码和 78 例共同向量。已有合法 ID、actor、批次编号和历史数据库继续使用原格式。新增校验阻止非法批次或快照写入进度，保留历史 pending 原字节。

## 独立提交与真实执行

| 提交 | 文件及目的 | GitHub 执行 |
| --- | --- | --- |
| [473ba126](https://github.com/johny751/MyTodo/commit/473ba126524a41ec1be0ffee8bbe1121cb44c12a) | 预检 workflow、emulator 检查与 Linux Node 入口 | [预检 45132468377](https://github.com/johny751/MyTodo/actions/runs/45132468377) 退出 78，缺 emulator、镜像与 runner KVM 权限。[原回归 45132468201](https://github.com/johny751/MyTodo/actions/runs/45132468201) success。 |
| [ed0ce330](https://github.com/johny751/MyTodo/commit/ed0ce330f0ac6ab2ef282119df2e6daa5c7b0802) | 配置 sdkmanager、KVM ACL 和安装收据 | [预检 45133421860](https://github.com/johny751/MyTodo/actions/runs/45133421860) 安装 SDK 组件成功，emulator 子进程退出 127，父步骤退出 78。[原回归 45133421910](https://github.com/johny751/MyTodo/actions/runs/45133421910) success。 |
| [9b38dcb0](https://github.com/johny751/MyTodo/commit/9b38dcb0cf40e725340c59b6a0cda702e3663e72) | 接通 Windows、Node 和 Android 样本交换、真实重启、SQLite 导出和对比报告 | [矩阵 45133837839](https://github.com/johny751/MyTodo/actions/runs/45133837839) 保留旧 C/JS 差异和 Android 环境阻塞，完整阶段退出 1。 |
| [0b42f729](https://github.com/johny751/MyTodo/commit/0b42f7295b2450c9ff20174f6c1da4822efa9529) | `windows/database.c`、`native.h`、`sync.c`，`src/model.mjs`、`replica.mjs`、`delta-sync.mjs`，共同向量断言及协议规则 | [矩阵 45134179988](https://github.com/johny751/MyTodo/actions/runs/45134179988) 桌面执行 468 格、比较 234 格通过，桌面退出 0。Android 和完整阶段因动态库缺失退出 78。[原回归 45134179863](https://github.com/johny751/MyTodo/actions/runs/45134179863) success。 |
| [bb5b44ae](https://github.com/johny751/MyTodo/commit/bb5b44aeeb8a82bc9010c094ce245aac71558cf5) | workflow 与 runner 脚本补齐 `libpulse0` | [Android 环境 45134913196](https://github.com/johny751/MyTodo/actions/runs/45134913196) 退出 0。[矩阵 45134913319](https://github.com/johny751/MyTodo/actions/runs/45134913319) 首次实际安装测试 APK，首例执行退出 1。[原回归 45134913297](https://github.com/johny751/MyTodo/actions/runs/45134913297) success。 |
| [c79c137f](https://github.com/johny751/MyTodo/commit/c79c137ff7e049cb155a6509ef21e1b991554af8) | 将测试 APK 的隐藏辅助模块改为普通资源名，签名后核验实际文件清单 | [矩阵 45135963743](https://github.com/johny751/MyTodo/actions/runs/45135963743) 首例四个 Android 位置实际退出 0。[原回归 45135963695](https://github.com/johny751/MyTodo/actions/runs/45135963695) success。 |
| [0dcf37d6](https://github.com/johny751/MyTodo/commit/0dcf37d6692f7fc7b0b3b3f0138a2be733a9bff5) | Android 八个并行 runner 各自执行真实进程重启与 SQLite 导出。Windows 统一完成剩余接收和比较 | [矩阵 45137698063](https://github.com/johny751/MyTodo/actions/runs/45137698063) 已触发。[原回归 45137698141](https://github.com/johny751/MyTodo/actions/runs/45137698141) success。 |

## 已核验的桌面结果

| C/JS 比较范围 | passed | failed | blocked |
| --- | ---: | ---: | ---: |
| C0-03 历史 45117818661 | 190 | 38 | 6 |
| C0-04 45134179988 | 234 | 0 | 0 |

原始 78 例均保留。54 例旧观察向量改为合同断言。以前失败的 38 个比较位置、2 个实际执行位置已修复，原 C API 阻塞的 6 个比较位置已实际通过。以 45134179988 同一源码计算，C 和 JS 各 234 格实际通过，涵盖生成及两来源接收和各自独立进程复查。SQLite 状态和候选顺序全部纳入比较。独立生成的等价 JSON 字节序列可不同，原 pending 字节仍在同一发送方重启前后严格比较。

桌面命令为 `node tests/protocol-harness/run-c004-matrix.mjs --phase desktop --output <runner-temp>/c004-desktop`。Windows runner 为 win25-vs2026，镜像 `20261116.315.1`。该 run 使用 Node `22.23.5`、Node 内置 SQLite `3.54.1`。原生测试 EXE 真实编译退出 0，SHA256 `0e6965e4fa80327a006250146c43212787ff096d9ac2d0484c802b579e25669b`。完整各工具、进程收据与 SHA256 在 GitHub 产物中。[桌面产物](https://github.com/johny751/MyTodo/actions/runs/45134179988/artifacts/14799640478)

45134179988 的四份产物共 5204 条文件清单已在 Codespaces 逐项复算，纯文本证据 ZIP SHA256 为 `255cc3b21b2e700f8a9f66e5fe4bbcbadac84f308fb138a564b9e792308950e8`。

## 验收边界

C0-03 按实际三端收据判定。阶段 0 还要完成 C0-05 凭据、C0-06 旧云恢复、C0-07 SQL 错误传播与 publish/ACK/COMMIT 故障验证。独立目标投递账本、仍缺少的持久收据以及真实坚果云往返依照各后续阶段验证。D1 仍等待兼容门槛。本机执行范围为源文件编辑与文本证据核对。

## 首次真实 Android 矩阵

[运行 45137698063](https://github.com/johny751/MyTodo/actions/runs/45137698063) 在同一源码上实际执行 C、Node 和 Android。整轮 936 格中 931 passed、2 failed、3 skipped。跨实现比较为 929 passed、4 failed、3 skipped。完整阶段退出 1。Android instrumentation 日志在两个位置记录 `Process crashed.`，其中一处为 actor-invalid-punctuation 生成后的重新启动，另一处为 tombstone-concurrent-edit 接收 Android 样本。ADB 返回 0，instrumentation 返回 0，诊断日志未提供崩溃根因。其他已完成位置的应用进程报告 SQLite 3.39.2，并完成 PID 变化与 SQLite 文件审计。原报告及日志保留。

提交 [56a2cf19](https://github.com/johny751/MyTodo/commit/56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc) 仅调整 Android 测试执行器。等待 force-stop 后旧进程退出。instrumentation 明确崩溃且没有有效结果时，最多三次尝试并记录每次退出和 crash buffer。生成或接收阶段重试使用新的隔离数据库，重启读取阶段继续核对原数据库。断言失败依然直接失败。[恢复验证 45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501)

首次三端运行的 18 份产物共 14838 个文件已在 Codespaces 复算 SHA256。文本包 SHA256 为 `4fba4aeac238b4fc5b4e1af0e4146c08484b889327fd58968950e8a4e7d90dde`。

## 最终三端验收

[45140238501](https://github.com/johny751/MyTodo/actions/runs/45140238501) 在 master 的 `56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc` 执行。桌面、Android 八个分片和最终比较共十个 job 完成，完整矩阵退出 0。

| 判定范围 | passed | failed | blocked | skipped |
| --- | ---: | ---: | ---: | ---: |
| 78 例生产路径执行位置 | 936 | 0 | 0 | 0 |
| 逐项跨实现比较 | 936 | 0 | 0 | 0 |
| Windows C ↔ JS 原范围比较 | 234 | 0 | 0 | 0 |
| Android 独立进程重启 | 312 | 0 | 0 | 0 |
| Android 导出 SQLite 并核对持久数据 | 312 | 0 | 0 | 0 |
| 实际生产样本来源 SHA256 | 702 | 0 | 0 | 0 |

每个平台各生成 78 例并接收三个来源各 78 例。通过的检查包含字段版本、实体、冲突、墓碑、vector、clock、cursor、outbox、pending、before/after/raw/reopened 和独立进程重开。合成非法输入按合同拒绝。历史 38 个比较失败、2 个执行失败和 6 个 API 阻塞均在本轮通过。完整逐项对照位于 [c0-04-case-results.md](c0-04-case-results.md)。

Android 最终运行有四次 instrumentation 初次尝试崩溃，原始退出均为 adb 0 / instrumentation 0，分别涉及 actor-length-80 自产自收后的重启、id-empty 接收 C 样本、id-ascii-200 接收 JS 样本及 key-array-type 接收 C 样本。重试后四格通过实际持久化及重启断言，首次崩溃记录仍在各分片产物内。模拟器间歇进程退出的根因尚未确认。

最终 Android runner 均为 ubuntu24 x64，镜像 `20261116.133.1` 或 `20261116.376.1`。八个分片的 WebView 均为 `113.0.5672.136`，应用内 SQLite `3.39.2`。每个分片使用 `emulator-5554`、API 34、x86_64。Build Tools `35.0.0`，AAPT2 `2.19-11948202`，D8 `8.6.2-dev`，JDK `17.0.21`，Node `22.23.5`。构建命令为 `node tests/protocol-harness/android/build-android.mjs --output-dir <runner-temp>/c004-android/build-android`。各分片测试通过 `node tests/protocol-harness/run-c004-matrix.mjs --phase android --android-shard <0-7>` 调用构建、ADB 和 instrumentation。汇总用 `--phase complete` 加载同一 run/attempt 的桌面和八个 Android 产物。参数与源代码见 [实际工作流](https://github.com/johny751/MyTodo/blob/56a2cf19ddb4758044e1cdb76bc53ab78aa46cbc/.github/workflows/c0-04-protocol.yml)。

最终桌面原生测试 EXE SHA256 为 `aea9f96258582fd94484e7f3671d9e3219f7af6dbad4116f6e90dcd2eeaa95c2`，Android→Windows 比较阶段原生测试 EXE SHA256 为 `6093578169834f17c801742ee612cec85d8214f0523dda7ef2f5e66fea08eb15`。18 份产物共 15547 条 payload 已在 Codespaces 复算 SHA256。纯文本证据包 SHA256 为 `a72720fa84ee1464d2b31a74278e46b7c63ae340ad568caf2b84727eccf6688d`。[汇总原始产物](https://github.com/johny751/MyTodo/actions/runs/45140238501/artifacts/14801938866)

同一源码的 [原三端构建与回归 45140238535](https://github.com/johny751/MyTodo/actions/runs/45140238535) success。保留的旧 [Windows runner 诊断 45140238582](https://github.com/johny751/MyTodo/actions/runs/45140238582) 仍因预装 Android 镜像缺失返回失败。正式三端协议结果取 Linux 模拟器和 Windows 原生矩阵共同执行的 45140238501。

C0-03 的 78 例三端共同协议矩阵及 C0-04 修复已通过。阶段 0 其余兼容门槛见 [C0-05 至 C0-07](c0-05-to-07-plan.md)。全局 ACK、WebDAV v1 迁移、实际 publish/ACK 故障及真实坚果云往返分别跟踪。本轮保留 SQLite 数据结构，D1 尚未开始。
