# D4-03 候选文档换行和原始 patch 保护审查

2026-11-25 Asia/Shanghai。仅本地文本、字节和哈希审查；未执行项目、构建、测试、SQLite 或网络操作。

FACT：Actions 45541201938 的 Ubuntu domain 在 `git diff --check origin/master...HEAD` 报出 `docs/upgrade/d4-03/audited-source-manifest.json` 的 CRLF 为 trailing whitespace。此失败记录由主 Agent 保存。本地候选文件有 500 处 CRLF，没有空格或 Tab 尾随，没有孤立 CR。该目录根部另外 18 个文本文件均无 CRLF、孤立 CR 或尾随空白。

FACT：该 JSON 是候选审计索引。`tests/d4-ui/provenance.mjs` 读取其 baseline 和 files 的 path/bytes/sha256，比较冻结源码的真实字节；它没有绑定这个 JSON 文件自身的整文件哈希。`tests/d4-ui/scope.mjs` 另行固定的是 `docs/upgrade/d4-01/evidence/sha256-manifest.json` 的哈希并逐个保护历史 evidence payload，后者不在本次修改范围。

本次只将工作副本 `work/d4-03/docs/upgrade/d4-03/audited-source-manifest.json` 的 CRLF 替换为 LF。所有正文字符、baseline、路径、字节数、源码哈希和状态保持原值，也未添加末尾换行。没有调整 `git diff --check`、测试断言或 Git whitespace 配置。

| 项目 | 原始文件 | LF 候选文件 |
|---|---|---|
| 字节数 | 16839 | 16339 |
| SHA-256 | c0509384eb2a88b80abdca1cca466806541adb9121e747097ec37c5566a4bbb3 | adf2419b3d52e2270d05ec6fa70fda1ed06a04d513f4cb9e91fc4431178bbf0a |
| CRLF 数 | 500 | 0 |

原始字节独立保存在 `outputs/d4-03/resume-ci/line-ending-originals/audited-source-manifest.json`。修改清单为 `line-ending-change.json`，目录完整盘点为 `line-ending-inventory-before.json`。

FACT：主 Agent 云端完整 Git 静态 diff 另发现 `original-task-coverage.md:145` 的 blank EOF 和 `evidence-billing-01/source04-preserved-dirty.patch`。本地 report 原本是 LF，但有两个末尾 LF。本次只去掉其中一个，正文与全部 BLOCKER 原值不变。其原字节也单独保存到 `line-ending-originals/original-task-coverage.md`，记录在 `report-eof-change.json`。

| 项目 | 原始 report | EOF 修复候选 report |
|---|---|---|
| 字节数 | 34015 | 34014 |
| SHA-256 | 8650dd078c3aa9b2784edf6fff61d556f17992ecaffd76ca099d09e57a2405eb | 90852dc5928ca982c5921f02027acf5918c869930317ccd035f67b73e65d9f2d |

FACT：原始 `source04-preserved-dirty.patch` 是 205759 bytes，SHA-256 `366b1be84eac5fb9855eee46c5a558518e2d8df6bbcb884cc452403aeb3757c7`，有 2 处 CRLF。其第 151、158、624、639、642 行仅有一个空格，均是 unified diff 对原空白上下文行必须保存的前缀。去掉该空格会改变原 patch 字节和含义。这份证据未修改。

PROPOSAL：scope 应在 whitespace 检查前，对 `docs/upgrade/d4-03/evidence-billing-01/source04-preserved-dirty.patch` 唯一路径强制核对上述字节数和 SHA-256，再只为该完整原始证据采用 literal exclude pathspec。全部真正候选代码和文档继续原 `git diff --check`。`core.whitespace` 的 CRLF 支持本身无法解决合法 unified diff 空白上下文；不能用清洗证据或删除全局 whitespace 检查处理它。精确整文件哈希核对更严格地保护原始证据，不降低业务断言。

旧 `outputs/d4-03/reports`、旧源码 ZIP、旧 evidence ZIP、D1/D2/D4-01 冻结文件均未改动；没有改原始失败日志、生产代码、测试断言或工作流。本子任务未修改 scope；主 Agent 统一实现精确原始证据 guard。

UNVERIFIED：这次静态文字修复尚未上传、尚未经过 GitHub Actions。主 Agent 需重新检查完整云端树。不能标记 domain、UI、Android 或 C0 通过。
