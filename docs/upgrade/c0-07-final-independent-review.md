# C0-07 最终独立审查

审查日期：2026-11-23，Asia/Shanghai。结论：以下冻结文档与证据支持主 Agent 对 C0-07 SQL、发布和 ACK 故障恢复作出的限定技术验收。未发现阻止这组文档进入发布包的证据或语义问题。本文不声称文档已经提交或推送；实际发布结果由独立发布回执记录。D1 仍未批准。

本审查只读取本地封存文本、JSON 和证据归档，比较状态、文件长度与 SHA256，并审查证据处理脚本。没有在本地运行项目、测试、构建、SQLite、ADB 或应用二进制，没有读取或解密凭据内容，没有访问真实坚果云或用户业务数据。下文的核对数量属于证据比较，不是额外项目测试。

## 冻结文件

以下路径均相对 `docs/upgrade/`。七份报告与 provenance 已独立重读并重算长度和 SHA256，均为 UTF-8、LF、单个终端 LF，无行末空格或制表符。

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| `c0-07-report.md` | 15240 | `1843a56aff6a431b1894c34e5ad7fa70183625031dedd1709521894b86fd35b9` |
| `c0-07-readme.md` | 1680 | `9470949b9c9a9bc3601ae57f4ef04c72f58ed5b9b9230b5c14ae3b9c2559d232` |
| `c0-07-verification.json` | 82614 | `654759c37a545b5a39b3da70cad268152f998ecf644eb63a5a764c88d6b1a20f` |
| `c0-07-case-results.json` | 178856 | `ef67ebc649ee69957c51ba6fff0c1d0a9cd16fbb47d842839612342d1effd66d` |
| `c0-07-case-results.md` | 7430 | `fcafa1d7486a9d859eef0c3e2997f61ae19b0777c75922e808e3c0ceee29201d` |
| `c0-07-environment.json` | 47728 | `3a97338362cc3f869dce19671a28212ac5a5227fa573f08bdff0765f27f0181f` |
| `c0-07-environment.md` | 6492 | `6672ebfda48d24bc5166b55d9e889755e4a6c931c7b421ef1be24c377b615b33` |
| `c0-07-provenance.json` | 86916 | `740b98659799f71ba54883fa7e10f37e77fe6eb7c7b854fd283ad07662c1d141` |

verification revision 10 的顶层 `accepted=true`、`state=qualified-accepted` 是主 Agent 在现有授权范围内作出的技术决定；`D1=false`。文档冻结时仍等待文档提交，`publication.statusAtDocumentFreeze=awaiting-documentation-commit`。嵌套审查中保留的 `accepted=false` 属于此前独立审查记录，不被删除或改写；其含义由顶层限定验收说明明确区分。

## 证据身份与发布转换

最终映射 `work/c007-publication-evidence-map.json` 为 25,850 字节，SHA256 `5c4d417f6a34ba3c692e0c7ecbe24452595330f0afa771fdf594369c28e8fbb0`。52 份发布证据共 3,165,408 字节：19 份字节不变、30 份仅 CRLF 转 LF、3 份仅补齐末尾一个 LF。原件没有被覆盖。

独立读取器重新读取每份原件及发布副本，核对双方长度、SHA256、允许的精确转换、标签、LF 和行末空白，共 520 项、零失败。最终复核 `work/c007-publication-final-map-review.json` 为 40,418 字节，SHA256 `9a4ce88281989bf967fc2fe0e1b28226169779b4f388620b56269a28b7009e08`；本审查再次运行读取器得到字节相同的复核结果。该复核完整嵌入 provenance。

verification 的 50 条原件引用对应 49 个唯一路径，均保留原 SHA256，并分别记录 `publishedFile` 的路径、长度、SHA256 和转换类型。v8 至 v10 的这些证据引用及发布身份保持结构和数值不变。最终重读核对七份报告、27 个原始证据 ZIP、52 条映射、嵌入复核、生成脚本和 v10 双重引用，共 336 项、零失败。记录为本地 `work/c007-final-document-independent-identity-review.json`，41,096 字节，SHA256 `1d327cf79492690a883d570c56861df255731b59b6b2daf9013e90618b9059cb`。外层与内层 ZIP 是不同传输记录，不能累加为测试执行。

`prepare-c007-report-evidence.ps1` 与 `prepare-c007-provenance.ps1` 只处理证据文本和归档身份。准备脚本先检查所有输入与冲突，再写发布副本，随后重读副本并复核原件；它不删除 JSON 字段，不修剪中间文本。原版脚本、映射及历史复核另存，不被当前版本追溯覆盖。provenance 自身和本文的哈希由最终传输清单封存，避免循环自引用；本文不嵌入自身哈希。

## 生产范围与实际结果

生产修复冻结于 `f9ca0f1a1e086c84e7fdf83cd4ca1683db85e277`，仅涉及 `windows/database.c`、`windows/sync.c` 与 `src/sqlite-store.mjs`。provenance 的三文件 SHA256 与精确 `19ceea620d1f7c21d89e5c65f1aa9fcac437caaa` 云端源码字节收据逐项一致。后续 inspect 夹具、失败补采、指定数据库合同分别提交，不能冒充额外生产修复。

四轮 C007 报告分别保留 141/1644/47、187/2299/33、187/2299/3、187/2299/0 的尝试/检查/失败数。初轮 Android 十次只到 seed 尝试，不称为完成业务。最终直接执行源为 de7，30 个平台场景、187 次尝试、178 个普通结果、9 个预期边界退出和 187 次新进程审计分别计量；2,299 项检查全部通过。Android 宿主协议退出 86 与设备 SIGKILL 的证据明确区分。

主报告准确保留 edf 核心 82/83 的历史失败。19ce 核心 83/83 是另一轮执行；408 次操作按 suite 分为 280/104/24，非 Android 的实际后端为 298 JS 与 86 native。native suite 中的 JS 协作和被终止 JS 进程不被表述为 native 进程强杀恢复。基线、DPAPI、bootstrap、Android kill 和完整矩阵分别绑定其真实执行提交及收据，旧 run 的 source SHA 未改写为最新源码。

19ce Android 原库 A27 manifest 写前拒绝及随后同库恢复证据成立，但观察者第一次 restart PID 9801 因 GMS/FontsProvider 依赖死亡崩溃。随后 PID 10258 在同一观察者数据库、路径和 actor 上重开成功；全轮 49 次 instrumentation 为 48 成功与 1 原始失败，没有新库重试替换。原 1,365 项广义审计中的一项 `no-crash-and-export` 失败与 `auditPassed=false` 保留；补充 3,544 项语义核验无问题，同时保留一项稳定性问题。这支持限定同库恢复结论，不表示 Android 启动稳定性已修复。issue #1 在封存记录中保持开放。

## 验收边界与发布资格

执行通过和采集完整是不同结论。C007 的原 collector exit1/incomplete、114 个二进制 stdout 排除及 `recordedRunPassed=false` 保留。C006 的 24 个合成凭据排除、kill 的 16 个二进制排除、baseline 的五份缺 manifest 均按具体运行披露。对云端 APK、EXE、SQLite 的 producer/collector 哈希比较，不被写成本地二进制重哈希；另有实际云端重哈希者单独指明。

主报告保留 full-sync revision 无精确期望、部分 SQL/UI 调用方未做故障向量、同进程 HTTP listener 重开、未测试真实断电或内部 fsync 死亡、进程停止后逐文件导出不等于 crash-time 原子快照，以及未验收真实云、私人账户和正式签名 APK 升级等限制。新错库合同的正常同库路径已执行，错库拒绝分支没有被动态触发。这些限制与 v10 的限定技术验收一致。

待发布文档范围为 `docs/upgrade/c0-07*`，基准应为上述精确 19ce 提交。通用云端发布器会检查 master/base、清洁工作区、远端未变化、原/新文件哈希、暂存路径集合和 diff whitespace；其自身不限制 C007 路径，因此最终 ZIP 还须由独立传输清单检查确保只含预期 61 份新增文档、原路径不存在且历史文档与生产文件未列入。本文冻结时尚无发布提交；最终 ZIP 独审和发布成功或阻断均由另行回执记录，不更改本次技术验收事实。
