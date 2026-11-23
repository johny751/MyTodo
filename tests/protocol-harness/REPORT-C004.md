# C0-04 逐项报告生成器

在 GitHub Codespaces 或 GitHub Actions 中，从证据目录读取每个阶段的 `summary.json`。历史输入为 run 45117818661 的原始 78 例 `summary.json`。当前输入须为同一 GitHub run 和 attempt 的 `complete` 阶段。提供 `desktop` 和 `android` 阶段原始收据可补充失败检查、运行环境和真实退出码。

```bash
node tests/protocol-harness/report-c004-matrix.mjs \
  --baseline "$baseline_summary" --desktop "$desktop_summary" \
  --android "$android_summary" --current "$complete_summary" \
  --format markdown > "$report_directory/c0-04-case-results.md"
node tests/protocol-harness/report-c004-matrix.mjs \
  --baseline "$baseline_summary" --desktop "$desktop_summary" \
  --android "$android_summary" --current "$complete_summary" \
  --format json > "$report_directory/c0-04-case-results.json"
```

生成器读取收据并向 stdout 输出。原始向量、日志、数据库和结果文件不受影响。JSON 报告保留每例 12 个执行位置、12 个比较位置、进程退出码、已记录的结果 SHA256 和历史失败分类。批次内容存在等价的 JSON 序列化时，报告会单独标示，数组顺序和字段语义仍参与比较。

报告应与完整矩阵的 `payload-sha256.json` 及三个阶段的运行证据一起归档。生成器对输入收据计算 SHA256，阶段之间的样本和产物校验由矩阵执行器负责。
